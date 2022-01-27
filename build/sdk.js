var abstraction_sdk = (function () {
    'use strict';

    var _class, _temp;

    const LEXICON = {};
    LEXICON.WebMessage = (_temp = _class = class extends Muffin.Lexeme {}, Object.defineProperty(_class, "name", {
      enumerable: true,
      writable: true,
      value: ""
    }), Object.defineProperty(_class, "request_schema", {
      enumerable: true,
      writable: true,
      value: {
        uid: null,
        sender: null,
        params: {},
        subject: null,
        objective: {}
      }
    }), Object.defineProperty(_class, "schema", {
      enumerable: true,
      writable: true,
      value: {
        interface: null,
        token: null,
        request: null,
        subscribe: null
      }
    }), _temp);

    const API_LEXICON = { ...{},
      ...LEXICON
    };
    const config = {
      sandbox_local: {
        hostName: "localhost:8877",
        path: "wsapi",
        channelInstanceSig: 12,
        api_protocol: "ws://"
      },
      sandbox: {
        hostName: "sandbox.autostore-sdk.drona.footloose.io",
        path: "wsapi",
        channelInstanceSig: 12,
        api_protocol: "wss://"
      }
    };
    Muffin.WebRequestSdk = class {
      constructor(options, lazyload = true) {
        console.debug("##ConnectMethod constructor", options);
        this.eventInterface = PostOffice.getOrCreateInterface("WebRequestSdk");
        this.LEXICON = API_LEXICON;
        this.uid = "";
        this.label = options.label || "drona_store_sdk_client";
        this.clientId = options.client_id || "";
        this.token = options.token || "";
        this.pass = "";
        this.connectedStores = [];
        this.uiVars = {
          clock: {},
          config: config[options.label]
        };
        this._connection = null;
        this.state = null;
      }

      async connect() {
        console.debug("##ConnectMethod connect", this.options);
        this.uiVars.eventSubscriptions = new Set([]);
        this.uiVars.eventCounters = {};
        return new Promise((resolve, reject) => {
          var finalUrl = this.uiVars.config.api_protocol + this.uiVars.config.hostName + "/" + this.uiVars.config.path + "/" + this.clientId + "?auth=" + this.token;
          console.debug("imp:", finalUrl);
          console.debug("imp:", this.uiVars.config);
          this._connection = Muffin.PostOffice.addSocket(WebSocket, this.label, finalUrl);
          this._connection.autoRetryOnClose = false;

          this._connection.socket.onerror = e => {
            let msg = `connection failed: ${e.message}`;
            console.debug("imp:", msg);
            this.state = e;
            this.eventInterface.dispatchMessage("error", e);
            return reject({
              state: this.state,
              msg: msg
            });
          };

          this._connection.socket.onopen = e => {
            let msg = `connection established`;
            this.state = e;
            this.eventInterface.dispatchMessage("connect");
            return resolve({
              state: this.state,
              msg: msg
            });
          };

          this._connection.socket.onclose = e => {
            let msg = `connection closed`;
            this.state = e;
            this.eventInterface.dispatchMessage("close", e);
            return reject({
              state: this.state,
              msg: msg
            });
          };

          this._connection.socket.onmessage = e => {
            var _msgStr = e.data;

            try {
              var _msg = JSON.parse(_msgStr);

              console.debug("##on message ", _msg);

              if (_msg.error) {
                this.eventInterface.dispatchMessage("error", _msg);
              } else {
                // this.eventInterface.dispatchMessage("incoming-msg", [_msg]);
                this.eventInterface.dispatchMessage("incoming-msg", _msg);

                if (_msg.op.includes("EVENT:::")) {
                  this.eventInterface.dispatchMessage("incoming-event", _msg);
                } else {
                  this.eventInterface.dispatchMessage("incoming-response", _msg);
                }
              }
            } catch (e) {
              console.debug("## error", e);
              this.eventInterface.dispatchMessage("error", e);
            }
          };
        });
      }

      getSerializableIntro() {
        return Object.keys(this.LEXICON).map(_lexeme => {
          let _schema = this.LEXICON[_lexeme].schema.request || {};

          return {
            label: _lexeme,
            fullName: this.LEXICON[_lexeme].name,
            schema: _schema
          };
        });
      }

      getIntro() {
        return this.LEXICON;
      }

      _getLexeme(_lexemeLabel) {
        console.debug("###lexicon", this.LEXICON);
        return this.LEXICON[_lexemeLabel];
      }

      _inflectLexeme(_lexemeLabel, _msg) {
        if (!_lexemeLabel || !_msg) {
          console.error("Error:", "Invalid Request.");
          return;
        }

        var _selectedLexeme = this._getLexeme(_lexemeLabel);

        if (!_selectedLexeme) {
          console.error("Error:", "Unknown Request.");
          return;
        }

        console.debug("Generating fixtures for lexeme - ", _selectedLexeme);

        if (_msg == "random") {
          try {
            var _selectedLexemeInflection = _selectedLexeme.inflect({});

            _selectedLexemeInflection.genFixtures();
          } catch (e) {
            console.error(e);
            return;
          }
        } else {
          try {
            var _selectedLexemeInflection = _selectedLexeme.inflect(_msg);
          } catch (e) {
            console.error(e);
            return;
          }
        }

        return _selectedLexemeInflection.stringify();
      }

      communicate(_lexemeLabel, _msg) {
        // try{
        // 	JSON.parse(_msg);
        // }catch(e){
        // 	let msg = "invalid json payload";
        // 	console.error("Error:", msg);
        // 	return;
        // }
        let inflection = this._inflectLexeme(_lexemeLabel, _msg);

        if (!inflection) {
          return;
        }

        this.uiVars.clock.testStart = Date.now() / 1000;

        this._connection.send(inflection);
      }

      async request(_lexemeLabel, _msg, _opLabel, options = {
        MAX_RESPONSE_TIME: 5000
      }) {
        return new Promise((resolve, reject) => {
          this.communicate(_lexemeLabel, _msg);

          if (!_opLabel) {
            return resolve({
              message: "Message sent. No resp_op provided."
            });
          }

          this.eventInterface.on("incoming-msg", msg => {
            if (msg.op === _opLabel && msg.result != null) {
              return resolve(msg);
            }
          });
          this.eventInterface.on("error", msg => {
            return reject(msg);
          });
          setTimeout(() => {
            return reject({
              message: `No response received in ${options.MAX_RESPONSE_TIME / 1000}s`
            });
          }, options.MAX_RESPONSE_TIME);
        });
      }

      _createEventSubscription(_msg) {
        this.uiVars.eventSubscriptions.add(_name);
        this.uiVars.eventCounters[`EVENT:::${_name}`] = 0;
        Muffin.PostOffice.sockets.global.broadcastMsg("subscription-created", _msg);
      }

      _connectHost() {

        this._connection.onerror = e => {
          let msg = `connection failed: ${e.message}`;
          console.log("imp:", msg);
        };

        this._connection.onopen = e => {
        };

        this._connection.onclose = e => {
        };

        this._connection.onmessage = _connectionMsgEv => {
          //custom onmessage functions can be provided by the developer.
          // console.log("imp:", "-------------------------------",_connectionMsgEv);
          var _msgStr = _connectionMsgEv.data;

          if (_msgStr == "response:") {
            return;
          } //ping-pong messages exchanged in keepAlive


          var ev = null;

          try {
            var _msg = JSON.parse(_msgStr);

            if (_msg.op.includes("EVENT:::")) {
              ev = new CustomEvent("incoming-hostagent-event-msg", {
                detail: _msg
              });
            } else {
              ev = new CustomEvent("incoming-hostagent-response-msg", {
                detail: _msg
              });
            }
          } catch (e) {
            //not valid msg
            var _msg = {
              error: e,
              label: `${this.name}-message-error`
            };
            ev = new CustomEvent(_msg.label, {
              detail: _msg
            });
          }

          return ev;
        };

        this._connection.on("incoming-hostagent-response-msg", msg => {
          console.debug("Event:", " incoming-hostagent-response-msg = ", msg); // this.uiVars.hostagentResponseMsgLogEl.appendChild(tableHtml);

          if (msg.op.includes("|||") && msg.statusCode == 2) {
            this._createEventSubscription(msg.op);
          }
        });

        this._connection.on("incoming-hostagent-event-msg", msg => {
          console.debug("Event:", " incoming-hostagent-event-msg = ", msg);
          this.uiVars.eventCounters[msg.op] += 1; // this.uiVars.hostagentResponseMsgLogEl.appendChild(tableHtml);
        });
      }

      onConnect() {}

    };

    return Muffin;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcbmNvbnN0IEFQSV9MRVhJQ09OID0gey4uLnt9LCAuLi5XRUJfTUVTU0FHRV9MRVhJQ09OfTtcblxuY29uc3QgY29uZmlnID0ge1xuICAgIHNhbmRib3hfbG9jYWw6IHtcbiAgICAgICAgaG9zdE5hbWU6IFwibG9jYWxob3N0Ojg4NzdcIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3M6Ly9cIlxuICAgIH0sXG4gICAgc2FuZGJveDoge1xuICAgICAgICBob3N0TmFtZTogXCJzYW5kYm94LmF1dG9zdG9yZS1zZGsuZHJvbmEuZm9vdGxvb3NlLmlvXCIsXG4gICAgICAgIHBhdGg6IFwid3NhcGlcIixcbiAgICAgICAgY2hhbm5lbEluc3RhbmNlU2lnOiAxMixcbiAgICAgICAgYXBpX3Byb3RvY29sOiBcIndzczovL1wiXG4gICAgfVxufVxuXG5cbk11ZmZpbi5XZWJSZXF1ZXN0U2RrID0gY2xhc3Mge1xuXG4gICAgY29uc3RydWN0b3Iob3B0aW9ucywgbGF6eWxvYWQgPSB0cnVlKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoXCIjI0Nvbm5lY3RNZXRob2QgY29uc3RydWN0b3JcIiwgb3B0aW9ucyk7XG4gICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UgPSBQb3N0T2ZmaWNlLmdldE9yQ3JlYXRlSW50ZXJmYWNlKFwiV2ViUmVxdWVzdFNka1wiKVxuICAgICAgICB0aGlzLkxFWElDT04gPSBBUElfTEVYSUNPTjtcbiAgICAgICAgdGhpcy51aWQgPSBcIlwiO1xuICAgICAgICB0aGlzLmxhYmVsID0gb3B0aW9ucy5sYWJlbCB8fCBcImRyb25hX3N0b3JlX3Nka19jbGllbnRcIjtcbiAgICAgICAgdGhpcy5jbGllbnRJZCA9IG9wdGlvbnMuY2xpZW50X2lkIHx8IFwiXCI7XG4gICAgICAgIHRoaXMudG9rZW4gPSBvcHRpb25zLnRva2VuIHx8IFwiXCI7XG4gICAgICAgIHRoaXMucGFzcyA9IFwiXCI7XG4gICAgICAgIHRoaXMuY29ubmVjdGVkU3RvcmVzID0gW107XG4gICAgICAgIHRoaXMudWlWYXJzID0ge1xuICAgICAgICAgICAgY2xvY2s6IHt9LFxuICAgICAgICAgICAgY29uZmlnOiBjb25maWdbb3B0aW9ucy5sYWJlbF1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IG51bGw7XG4gICAgfVxuXG4gICAgYXN5bmMgY29ubmVjdCgpIHtcbiAgICAgICAgY29uc29sZS5kZWJ1ZyhcIiMjQ29ubmVjdE1ldGhvZCBjb25uZWN0XCIsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50U3Vic2NyaXB0aW9ucyA9IG5ldyBTZXQoW10pO1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzID0ge307XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB2YXIgZmluYWxVcmwgPSB0aGlzLnVpVmFycy5jb25maWcuYXBpX3Byb3RvY29sICsgdGhpcy51aVZhcnMuY29uZmlnLmhvc3ROYW1lICsgXCIvXCIgKyB0aGlzLnVpVmFycy5jb25maWcucGF0aCArIFwiL1wiICsgdGhpcy5jbGllbnRJZCArIFwiP2F1dGg9XCIgKyB0aGlzLnRva2VuXG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiaW1wOlwiLCBmaW5hbFVybCk7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiaW1wOlwiLCB0aGlzLnVpVmFycy5jb25maWcpO1xuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJpbXA6XCIsIG1zZyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGVzdGFibGlzaGVkYDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZTtcbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImNvbm5lY3RcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoe3N0YXRlOiB0aGlzLnN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gY2xvc2VkYDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZTtcbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImNsb3NlXCIsIGUpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe3N0YXRlOiB0aGlzLnN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm1lc3NhZ2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBfbXNnU3RyID0gZS5kYXRhO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBfbXNnID0gSlNPTi5wYXJzZShfbXNnU3RyKVxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiIyNvbiBtZXNzYWdlIFwiLCBfbXNnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctbXNnXCIsIFtfbXNnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBfbXNnKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctZXZlbnRcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCIjIyBlcnJvclwiLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9XG5cblxuICAgIGdldFNlcmlhbGl6YWJsZUludHJvKCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5MRVhJQ09OKS5tYXAoKF9sZXhlbWUpID0+IHtcbiAgICAgICAgICAgIGxldCBfc2NoZW1hID0gdGhpcy5MRVhJQ09OW19sZXhlbWVdLnNjaGVtYS5yZXF1ZXN0IHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBsYWJlbDogX2xleGVtZSxcbiAgICAgICAgICAgICAgICBmdWxsTmFtZTogdGhpcy5MRVhJQ09OW19sZXhlbWVdLm5hbWUsXG4gICAgICAgICAgICAgICAgc2NoZW1hOiBfc2NoZW1hXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdldEludHJvKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MRVhJQ09OO1xuICAgIH1cblxuICAgIF9nZXRMZXhlbWUoX2xleGVtZUxhYmVsKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoXCIjIyNsZXhpY29uXCIsIHRoaXMuTEVYSUNPTik7XG4gICAgICAgIHJldHVybiB0aGlzLkxFWElDT05bX2xleGVtZUxhYmVsXTtcbiAgICB9XG5cbiAgICBfaW5mbGVjdExleGVtZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgaWYgKCFfbGV4ZW1lTGFiZWwgfHwgIV9tc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgXCJJbnZhbGlkIFJlcXVlc3QuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZSA9IHRoaXMuX2dldExleGVtZShfbGV4ZW1lTGFiZWwpO1xuICAgICAgICBpZiAoIV9zZWxlY3RlZExleGVtZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIlVua25vd24gUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmRlYnVnKFwiR2VuZXJhdGluZyBmaXh0dXJlcyBmb3IgbGV4ZW1lIC0gXCIsIF9zZWxlY3RlZExleGVtZSk7XG5cbiAgICAgICAgaWYgKF9tc2cgPT0gXCJyYW5kb21cIikge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiA9IF9zZWxlY3RlZExleGVtZS5pbmZsZWN0KHt9KTtcbiAgICAgICAgICAgICAgICBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uLmdlbkZpeHR1cmVzKCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uID0gX3NlbGVjdGVkTGV4ZW1lLmluZmxlY3QoX21zZyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbi5zdHJpbmdpZnkoKTtcbiAgICB9XG5cbiAgICBjb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgLy8gdHJ5e1xuICAgICAgICAvLyBcdEpTT04ucGFyc2UoX21zZyk7XG4gICAgICAgIC8vIH1jYXRjaChlKXtcbiAgICAgICAgLy8gXHRsZXQgbXNnID0gXCJpbnZhbGlkIGpzb24gcGF5bG9hZFwiO1xuICAgICAgICAvLyBcdGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgbXNnKTtcbiAgICAgICAgLy8gXHRyZXR1cm47XG4gICAgICAgIC8vIH1cbiAgICAgICAgbGV0IGluZmxlY3Rpb24gPSB0aGlzLl9pbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgIGlmICghaW5mbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudWlWYXJzLmNsb2NrLnRlc3RTdGFydCA9IERhdGUubm93KCkgLyAxMDAwO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoaW5mbGVjdGlvbik7XG4gICAgfVxuXG4gICAgYXN5bmMgcmVxdWVzdChfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpO1xuICAgICAgICAgICAgaWYoIV9vcExhYmVsKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7bWVzc2FnZTogXCJNZXNzYWdlIHNlbnQuIE5vIHJlc3Bfb3AgcHJvdmlkZWQuXCJ9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QobXNnKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHttZXNzYWdlOmBObyByZXNwb25zZSByZWNlaXZlZCBpbiAke29wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUgLyAxMDAwfXNgfSlcbiAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24oX21zZykge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMuYWRkKF9uYW1lKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1tgRVZFTlQ6Ojoke19uYW1lfWBdID0gMDtcbiAgICAgICAgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWwuYnJvYWRjYXN0TXNnKFwic3Vic2NyaXB0aW9uLWNyZWF0ZWRcIiwgX21zZyk7XG4gICAgfVxuXG4gICAgX2Nvbm5lY3RIb3N0KCkge1xuICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpbmcgd2l0aCBhcGkgaG9zdGA7XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltcDpcIiwgbXNnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICB9XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ubWVzc2FnZSA9IChfY29ubmVjdGlvbk1zZ0V2KSA9PiB7IC8vY3VzdG9tIG9ubWVzc2FnZSBmdW5jdGlvbnMgY2FuIGJlIHByb3ZpZGVkIGJ5IHRoZSBkZXZlbG9wZXIuXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcImltcDpcIiwgXCItLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXCIsX2Nvbm5lY3Rpb25Nc2dFdik7XG4gICAgICAgICAgICB2YXIgX21zZ1N0ciA9IF9jb25uZWN0aW9uTXNnRXYuZGF0YTtcbiAgICAgICAgICAgIGlmIChfbXNnU3RyID09IFwicmVzcG9uc2U6XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IC8vcGluZy1wb25nIG1lc3NhZ2VzIGV4Y2hhbmdlZCBpbiBrZWVwQWxpdmVcbiAgICAgICAgICAgIHZhciBldiA9IG51bGw7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0gSlNPTi5wYXJzZShfbXNnU3RyKTtcbiAgICAgICAgICAgICAgICBpZiAoX21zZy5vcC5pbmNsdWRlcyhcIkVWRU5UOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8vbm90IHZhbGlkIG1zZ1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0ge2Vycm9yOiBlLCBsYWJlbDogYCR7dGhpcy5uYW1lfS1tZXNzYWdlLWVycm9yYH1cbiAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChfbXNnLmxhYmVsLCB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIkV2ZW50OlwiLCBcIiBpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnID0gXCIsIG1zZyk7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgICAgICBpZiAobXNnLm9wLmluY2x1ZGVzKFwifHx8XCIpICYmIG1zZy5zdGF0dXNDb2RlID09IDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbihtc2cub3ApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aGlzLm9uKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uKFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiRXZlbnQ6XCIsIFwiIGluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2cgPSBcIiwgbXNnKTtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnNbbXNnLm9wXSArPSAxO1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbkNvbm5lY3QoKSB7XG5cbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE11ZmZpbjtcbiJdLCJuYW1lcyI6WyJMRVhJQ09OIiwiV2ViTWVzc2FnZSIsIk11ZmZpbiIsIkxleGVtZSIsInVpZCIsInNlbmRlciIsInBhcmFtcyIsInN1YmplY3QiLCJvYmplY3RpdmUiLCJpbnRlcmZhY2UiLCJ0b2tlbiIsInJlcXVlc3QiLCJzdWJzY3JpYmUiLCJBUElfTEVYSUNPTiIsIldFQl9NRVNTQUdFX0xFWElDT04iLCJjb25maWciLCJzYW5kYm94X2xvY2FsIiwiaG9zdE5hbWUiLCJwYXRoIiwiY2hhbm5lbEluc3RhbmNlU2lnIiwiYXBpX3Byb3RvY29sIiwic2FuZGJveCIsIldlYlJlcXVlc3RTZGsiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJsYXp5bG9hZCIsImNvbnNvbGUiLCJkZWJ1ZyIsImV2ZW50SW50ZXJmYWNlIiwiUG9zdE9mZmljZSIsImdldE9yQ3JlYXRlSW50ZXJmYWNlIiwibGFiZWwiLCJjbGllbnRJZCIsImNsaWVudF9pZCIsInBhc3MiLCJjb25uZWN0ZWRTdG9yZXMiLCJ1aVZhcnMiLCJjbG9jayIsIl9jb25uZWN0aW9uIiwic3RhdGUiLCJjb25uZWN0IiwiZXZlbnRTdWJzY3JpcHRpb25zIiwiU2V0IiwiZXZlbnRDb3VudGVycyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZmluYWxVcmwiLCJhZGRTb2NrZXQiLCJXZWJTb2NrZXQiLCJhdXRvUmV0cnlPbkNsb3NlIiwic29ja2V0Iiwib25lcnJvciIsImUiLCJtc2ciLCJtZXNzYWdlIiwiZGlzcGF0Y2hNZXNzYWdlIiwib25vcGVuIiwib25jbG9zZSIsIm9ubWVzc2FnZSIsIl9tc2dTdHIiLCJkYXRhIiwiX21zZyIsIkpTT04iLCJwYXJzZSIsImVycm9yIiwib3AiLCJpbmNsdWRlcyIsImdldFNlcmlhbGl6YWJsZUludHJvIiwiT2JqZWN0Iiwia2V5cyIsIm1hcCIsIl9sZXhlbWUiLCJfc2NoZW1hIiwic2NoZW1hIiwiZnVsbE5hbWUiLCJuYW1lIiwiZ2V0SW50cm8iLCJfZ2V0TGV4ZW1lIiwiX2xleGVtZUxhYmVsIiwiX2luZmxlY3RMZXhlbWUiLCJfc2VsZWN0ZWRMZXhlbWUiLCJfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uIiwiaW5mbGVjdCIsImdlbkZpeHR1cmVzIiwic3RyaW5naWZ5IiwiY29tbXVuaWNhdGUiLCJpbmZsZWN0aW9uIiwidGVzdFN0YXJ0IiwiRGF0ZSIsIm5vdyIsInNlbmQiLCJfb3BMYWJlbCIsIk1BWF9SRVNQT05TRV9USU1FIiwib24iLCJyZXN1bHQiLCJzZXRUaW1lb3V0IiwiX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uIiwiYWRkIiwiX25hbWUiLCJzb2NrZXRzIiwiZ2xvYmFsIiwiYnJvYWRjYXN0TXNnIiwiX2Nvbm5lY3RIb3N0IiwibG9nIiwiX2Nvbm5lY3Rpb25Nc2dFdiIsImV2IiwiQ3VzdG9tRXZlbnQiLCJkZXRhaWwiLCJzdGF0dXNDb2RlIiwib25Db25uZWN0Il0sIm1hcHBpbmdzIjoiOzs7OztJQUFBLE1BQU1BLE9BQU8sR0FBRyxFQUFoQjtJQUVBQSxPQUFPLENBQUNDLFVBQVIscUJBQXFCLGNBQWNDLE1BQU0sQ0FBQ0MsTUFBckIsQ0FBNEIsRUFBakQ7SUFBQTtJQUFBO0lBQUEsU0FDa0I7SUFEbEI7SUFBQTtJQUFBO0lBQUEsU0FHNEI7SUFDcEJDLElBQUFBLEdBQUcsRUFBRSxJQURlO0lBRXBCQyxJQUFBQSxNQUFNLEVBQUUsSUFGWTtJQUdwQkMsSUFBQUEsTUFBTSxFQUFFLEVBSFk7SUFJcEJDLElBQUFBLE9BQU8sRUFBRSxJQUpXO0lBS3BCQyxJQUFBQSxTQUFTLEVBQUU7SUFMUztJQUg1QjtJQUFBO0lBQUE7SUFBQSxTQVdvQjtJQUNaQyxJQUFBQSxTQUFTLEVBQUUsSUFEQztJQUVaQyxJQUFBQSxLQUFLLEVBQUUsSUFGSztJQUdaQyxJQUFBQSxPQUFPLEVBQUUsSUFIRztJQUlaQyxJQUFBQSxTQUFTLEVBQUU7SUFKQztJQVhwQjs7SUNEQSxNQUFNQyxXQUFXLEdBQUcsRUFBQyxHQUFHLEVBQUo7SUFBUSxLQUFHQztJQUFYLENBQXBCO0lB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
