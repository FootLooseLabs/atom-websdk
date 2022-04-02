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
        hostName: "wsapi.footloose.io/",
        path: "wsapi",
        channelInstanceSig: 12,
        api_protocol: "wss://"
      }
    };
    Muffin.WebRequestSdk = class {
      constructor(options, lazyload = true) {
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
        this.uiVars.eventSubscriptions = new Set([]);
        this.uiVars.eventCounters = {};
        return new Promise((resolve, reject) => {
          var finalUrl = this.uiVars.config.api_protocol + this.uiVars.config.hostName + "/" + this.uiVars.config.path + "/" + this.clientId + "?auth=" + this.token;
          this._connection = Muffin.PostOffice.addSocket(WebSocket, this.label, finalUrl);
          this._connection.autoRetryOnClose = false;

          this._connection.socket.onerror = e => {
            let msg = `connection failed: ${e.message}`;
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
        return this.LEXICON[_lexemeLabel];
      }

      _findAndInflectLexeme(_lexemeLabel, _msg) {
        if (!_lexemeLabel || !_msg) {
          console.error("Error:", "Invalid Request.");
          return;
        }

        var _selectedLexeme = this._getLexeme(_lexemeLabel);

        if (!_selectedLexeme) {
          console.error("Error:", "Unknown Request.");
          return;
        }

        if (_msg === "random") {
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
        let inflection = this._findAndInflectLexeme(_lexemeLabel, _msg);

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
            if (msg.op === _opLabel && msg.error != null) {
              return reject(msg);
            }
          });
          setTimeout(() => {
            return reject({
              message: `No response received in ${options.MAX_RESPONSE_TIME / 1000}s`
            });
          }, options.MAX_RESPONSE_TIME);
        });
      }

      async webrequest(_interface, _requestMsg, options = {
        MAX_RESPONSE_TIME: 5000
      }) {
        return new Promise((resolve, reject) => {
          if (!_interface) {
            return reject({
              error: "No Interface provided."
            });
          }

          if (!_interface.includes(":::") && !_interface.includes("|||")) {
            return reject({
              error: "Interface provided is not valid."
            });
          }

          var _opLabel = options.opLabel || _interface;

          if (_interface.includes(":::")) {
            var _webMsg = {
              "interface": _interface,
              "request": _requestMsg,
              "token": this._generateToken(_interface)
            };
          } else {
            var _webMsg = {
              "subscribe": _interface,
              "token": this._generateToken(_interface)
            };
          }

          this.communicate("WebMessage", _webMsg);
          this.eventInterface.on("incoming-msg", msg => {
            if (msg.op === _opLabel && msg.result != null) {
              return resolve(msg);
            }
          });
          this.eventInterface.on("error", msg => {
            if (msg.op === _opLabel && msg.error != null) {
              return reject(msg);
            }
          });
          setTimeout(() => {
            return reject({
              message: `No response received in ${options.MAX_RESPONSE_TIME / 1000}s`
            });
          }, options.MAX_RESPONSE_TIME);
        });
      }

      async _generateToken(message, options = {
        algo: "SHA-256"
      }) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest(options.algo, msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
      }

      subscribeToEvent() {
        let callbackList = [];

        var _this = this;

        const notifier = {
          notify: function (callbackFunction, _lexemeLabel, _msg, _opLabel) {
            _this.communicate(_lexemeLabel, _msg);

            callbackList.push({
              callbackFunction,
              _opLabel
            });
            console.debug("***************** Callback Event Table ************************");
            console.table(callbackList);
          }
        };
        this.eventInterface.on("incoming-event", msg => {
          for (let cb of callbackList) {
            if (msg.op === cb._opLabel) cb.callbackFunction(msg);
          }
        });
        return notifier;
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
          // this.uiVars.hostagentResponseMsgLogEl.appendChild(tableHtml);
          if (msg.op.includes("|||") && msg.statusCode == 2) {
            this._createEventSubscription(msg.op);
          }
        });

        this._connection.on("incoming-hostagent-event-msg", msg => {
          this.uiVars.eventCounters[msg.op] += 1; // this.uiVars.hostagentResponseMsgLogEl.appendChild(tableHtml);
        });
      }

      onConnect() {}

    };

    return Muffin;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcbmNvbnN0IEFQSV9MRVhJQ09OID0gey4uLnt9LCAuLi5XRUJfTUVTU0FHRV9MRVhJQ09OfTtcblxuY29uc3QgY29uZmlnID0ge1xuICAgIHNhbmRib3hfbG9jYWw6IHtcbiAgICAgICAgaG9zdE5hbWU6IFwibG9jYWxob3N0Ojg4NzdcIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3M6Ly9cIlxuICAgIH0sXG4gICAgc2FuZGJveDoge1xuICAgICAgICBob3N0TmFtZTogXCJ3c2FwaS5mb290bG9vc2UuaW8vXCIsXG4gICAgICAgIHBhdGg6IFwid3NhcGlcIixcbiAgICAgICAgY2hhbm5lbEluc3RhbmNlU2lnOiAxMixcbiAgICAgICAgYXBpX3Byb3RvY29sOiBcIndzczovL1wiXG4gICAgfVxufVxuXG5cbk11ZmZpbi5XZWJSZXF1ZXN0U2RrID0gY2xhc3Mge1xuXG4gICAgY29uc3RydWN0b3Iob3B0aW9ucywgbGF6eWxvYWQgPSB0cnVlKSB7XG4gICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UgPSBQb3N0T2ZmaWNlLmdldE9yQ3JlYXRlSW50ZXJmYWNlKFwiV2ViUmVxdWVzdFNka1wiKVxuICAgICAgICB0aGlzLkxFWElDT04gPSBBUElfTEVYSUNPTjtcbiAgICAgICAgdGhpcy51aWQgPSBcIlwiO1xuICAgICAgICB0aGlzLmxhYmVsID0gb3B0aW9ucy5sYWJlbCB8fCBcImRyb25hX3N0b3JlX3Nka19jbGllbnRcIjtcbiAgICAgICAgdGhpcy5jbGllbnRJZCA9IG9wdGlvbnMuY2xpZW50X2lkIHx8IFwiXCI7XG4gICAgICAgIHRoaXMudG9rZW4gPSBvcHRpb25zLnRva2VuIHx8IFwiXCI7XG4gICAgICAgIHRoaXMucGFzcyA9IFwiXCI7XG4gICAgICAgIHRoaXMuY29ubmVjdGVkU3RvcmVzID0gW107XG4gICAgICAgIHRoaXMudWlWYXJzID0ge1xuICAgICAgICAgICAgY2xvY2s6IHt9LFxuICAgICAgICAgICAgY29uZmlnOiBjb25maWdbb3B0aW9ucy5sYWJlbF1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IG51bGw7XG4gICAgfVxuXG4gICAgYXN5bmMgY29ubmVjdCgpIHtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRTdWJzY3JpcHRpb25zID0gbmV3IFNldChbXSk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnMgPSB7fTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHZhciBmaW5hbFVybCA9IHRoaXMudWlWYXJzLmNvbmZpZy5hcGlfcHJvdG9jb2wgKyB0aGlzLnVpVmFycy5jb25maWcuaG9zdE5hbWUgKyBcIi9cIiArIHRoaXMudWlWYXJzLmNvbmZpZy5wYXRoICsgXCIvXCIgKyB0aGlzLmNsaWVudElkICsgXCI/YXV0aD1cIiArIHRoaXMudG9rZW5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24gPSBNdWZmaW4uUG9zdE9mZmljZS5hZGRTb2NrZXQoV2ViU29ja2V0LCB0aGlzLmxhYmVsLCBmaW5hbFVybCk7XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLmF1dG9SZXRyeU9uQ2xvc2UgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25lcnJvciA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGZhaWxlZDogJHtlLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZTtcbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImVycm9yXCIsIGUpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe3N0YXRlOiB0aGlzLnN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25vcGVuID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiY29ubmVjdFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9uY2xvc2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiY2xvc2VcIiwgZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9ubWVzc2FnZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIF9tc2dTdHIgPSBlLmRhdGE7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpXG4gICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImVycm9yXCIsIF9tc2cpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBbX21zZ10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJpbmNvbWluZy1tc2dcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLWV2ZW50XCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLXJlc3BvbnNlXCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImVycm9yXCIsIGUpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH1cblxuXG4gICAgZ2V0U2VyaWFsaXphYmxlSW50cm8oKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLkxFWElDT04pLm1hcCgoX2xleGVtZSkgPT4ge1xuICAgICAgICAgICAgbGV0IF9zY2hlbWEgPSB0aGlzLkxFWElDT05bX2xleGVtZV0uc2NoZW1hLnJlcXVlc3QgfHwge307XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGxhYmVsOiBfbGV4ZW1lLFxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lOiB0aGlzLkxFWElDT05bX2xleGVtZV0ubmFtZSxcbiAgICAgICAgICAgICAgICBzY2hlbWE6IF9zY2hlbWFcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0SW50cm8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLkxFWElDT047XG4gICAgfVxuXG4gICAgX2dldExleGVtZShfbGV4ZW1lTGFiZWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTltfbGV4ZW1lTGFiZWxdO1xuICAgIH1cblxuICAgIF9maW5kQW5kSW5mbGVjdExleGVtZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgaWYgKCFfbGV4ZW1lTGFiZWwgfHwgIV9tc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgXCJJbnZhbGlkIFJlcXVlc3QuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZSA9IHRoaXMuX2dldExleGVtZShfbGV4ZW1lTGFiZWwpO1xuICAgICAgICBpZiAoIV9zZWxlY3RlZExleGVtZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIlVua25vd24gUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmIChfbXNnID09PSBcInJhbmRvbVwiKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uID0gX3NlbGVjdGVkTGV4ZW1lLmluZmxlY3Qoe30pO1xuICAgICAgICAgICAgICAgIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uZ2VuRml4dHVyZXMoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdChfbXNnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uLnN0cmluZ2lmeSgpO1xuICAgIH1cblxuICAgIGNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICAvLyB0cnl7XG4gICAgICAgIC8vIFx0SlNPTi5wYXJzZShfbXNnKTtcbiAgICAgICAgLy8gfWNhdGNoKGUpe1xuICAgICAgICAvLyBcdGxldCBtc2cgPSBcImludmFsaWQganNvbiBwYXlsb2FkXCI7XG4gICAgICAgIC8vIFx0Y29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBtc2cpO1xuICAgICAgICAvLyBcdHJldHVybjtcbiAgICAgICAgLy8gfVxuICAgICAgICBsZXQgaW5mbGVjdGlvbiA9IHRoaXMuX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgIGlmICghaW5mbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudWlWYXJzLmNsb2NrLnRlc3RTdGFydCA9IERhdGUubm93KCkgLyAxMDAwO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoaW5mbGVjdGlvbik7XG4gICAgfVxuXG4gICAgYXN5bmMgcmVxdWVzdChfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpO1xuICAgICAgICAgICAgaWYoIV9vcExhYmVsKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7bWVzc2FnZTogXCJNZXNzYWdlIHNlbnQuIE5vIHJlc3Bfb3AgcHJvdmlkZWQuXCJ9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJlcnJvclwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLmVycm9yICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChtc2cpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHttZXNzYWdlOmBObyByZXNwb25zZSByZWNlaXZlZCBpbiAke29wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUgLyAxMDAwfXNgfSlcbiAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB3ZWJyZXF1ZXN0KF9pbnRlcmZhY2UsIF9yZXF1ZXN0TXNnLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYoIV9pbnRlcmZhY2Upe1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe2Vycm9yOiBcIk5vIEludGVyZmFjZSBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZighX2ludGVyZmFjZS5pbmNsdWRlcyhcIjo6OlwiKSAmJiAhX2ludGVyZmFjZS5pbmNsdWRlcyhcInx8fFwiKSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7ZXJyb3I6IFwiSW50ZXJmYWNlIHByb3ZpZGVkIGlzIG5vdCB2YWxpZC5cIn0pOyBcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIF9vcExhYmVsID0gb3B0aW9ucy5vcExhYmVsIHx8IF9pbnRlcmZhY2U7XG5cbiAgICAgICAgICAgIGlmKF9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikpe1xuICAgICAgICAgICAgICAgIHZhciBfd2ViTXNnID0ge1xuICAgICAgICAgICAgICAgICAgICBcImludGVyZmFjZVwiIDogX2ludGVyZmFjZSxcbiAgICAgICAgICAgICAgICAgICAgXCJyZXF1ZXN0XCIgOiBfcmVxdWVzdE1zZyxcbiAgICAgICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0aGlzLl9nZW5lcmF0ZVRva2VuKF9pbnRlcmZhY2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJzdWJzY3JpYmVcIiA6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jb21tdW5pY2F0ZShcIldlYk1lc3NhZ2VcIiwgX3dlYk1zZyk7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5yZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5lcnJvciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QobXNnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTpgTm8gcmVzcG9uc2UgcmVjZWl2ZWQgaW4gJHtvcHRpb25zLk1BWF9SRVNQT05TRV9USU1FIC8gMTAwMH1zYH0pXG4gICAgICAgICAgICB9LCBvcHRpb25zLk1BWF9SRVNQT05TRV9USU1FKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgX2dlbmVyYXRlVG9rZW4obWVzc2FnZSwgb3B0aW9ucyA9IHthbGdvOiBcIlNIQS0yNTZcIn0pIHtcbiAgICAgICAgY29uc3QgbXNnQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpOyAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChvcHRpb25zLmFsZ28sIG1zZ0J1ZmZlcik7XG4gICAgICAgIGNvbnN0IGhhc2hBcnJheSA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcikpO1xuICAgICAgICBjb25zdCBoYXNoSGV4ID0gaGFzaEFycmF5Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJycpO1xuICAgICAgICByZXR1cm4gaGFzaEhleDtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVUb0V2ZW50KCl7XG4gICAgICAgIGxldCBjYWxsYmFja0xpc3QgPSBbXTtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcbiAgICAgICAgY29uc3Qgbm90aWZpZXIgPSB7XG4gICAgICAgICAgICBub3RpZnk6IGZ1bmN0aW9uKGNhbGxiYWNrRnVuY3Rpb24sIF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwpIHtcbiAgICAgICAgICAgICAgICBfdGhpcy5jb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrTGlzdC5wdXNoKHtjYWxsYmFja0Z1bmN0aW9uLCBfb3BMYWJlbH0pO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCIqKioqKioqKioqKioqKioqKiBDYWxsYmFjayBFdmVudCBUYWJsZSAqKioqKioqKioqKioqKioqKioqKioqKipcIilcbiAgICAgICAgICAgICAgICBjb25zb2xlLnRhYmxlKGNhbGxiYWNrTGlzdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1ldmVudFwiLCAobXNnKT0+e1xuICAgICAgICAgICAgZm9yIChsZXQgY2Igb2YgY2FsbGJhY2tMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYobXNnLm9wID09PSBjYi5fb3BMYWJlbClcbiAgICAgICAgICAgICAgICAgICAgY2IuY2FsbGJhY2tGdW5jdGlvbihtc2cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICByZXR1cm4gbm90aWZpZXI7XG4gICAgfVxuXG4gICAgX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uKF9tc2cpIHtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRTdWJzY3JpcHRpb25zLmFkZChfbmFtZSk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnNbYEVWRU5UOjo6JHtfbmFtZX1gXSA9IDA7XG4gICAgICAgIE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHMuZ2xvYmFsLmJyb2FkY2FzdE1zZyhcInN1YnNjcmlwdGlvbi1jcmVhdGVkXCIsIF9tc2cpO1xuICAgIH1cblxuICAgIF9jb25uZWN0SG9zdCgpIHtcbiAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW5nIHdpdGggYXBpIGhvc3RgO1xuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25lcnJvciA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJpbXA6XCIsIG1zZyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGVzdGFibGlzaGVkYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gY2xvc2VkYDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbm1lc3NhZ2UgPSAoX2Nvbm5lY3Rpb25Nc2dFdikgPT4geyAvL2N1c3RvbSBvbm1lc3NhZ2UgZnVuY3Rpb25zIGNhbiBiZSBwcm92aWRlZCBieSB0aGUgZGV2ZWxvcGVyLlxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJpbXA6XCIsIFwiLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVwiLF9jb25uZWN0aW9uTXNnRXYpO1xuICAgICAgICAgICAgdmFyIF9tc2dTdHIgPSBfY29ubmVjdGlvbk1zZ0V2LmRhdGE7XG4gICAgICAgICAgICBpZiAoX21zZ1N0ciA9PSBcInJlc3BvbnNlOlwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSAvL3BpbmctcG9uZyBtZXNzYWdlcyBleGNoYW5nZWQgaW4ga2VlcEFsaXZlXG4gICAgICAgICAgICB2YXIgZXYgPSBudWxsO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cik7XG4gICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LXJlc3BvbnNlLW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyAvL25vdCB2YWxpZCBtc2dcbiAgICAgICAgICAgICAgICB2YXIgX21zZyA9IHtlcnJvcjogZSwgbGFiZWw6IGAke3RoaXMubmFtZX0tbWVzc2FnZS1lcnJvcmB9XG4gICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoX21zZy5sYWJlbCwge1xuICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBldjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub24oXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIC8vIHRoaXMudWlWYXJzLmhvc3RhZ2VudFJlc3BvbnNlTXNnTG9nRWwuYXBwZW5kQ2hpbGQodGFibGVIdG1sKTtcbiAgICAgICAgICAgIGlmIChtc2cub3AuaW5jbHVkZXMoXCJ8fHxcIikgJiYgbXNnLnN0YXR1c0NvZGUgPT0gMikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uKG1zZy5vcCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHRoaXMub24oKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub24oXCJpbmNvbWluZy1ob3N0YWdlbnQtZXZlbnQtbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnNbbXNnLm9wXSArPSAxO1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbkNvbm5lY3QoKSB7XG5cbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE11ZmZpbjtcbiJdLCJuYW1lcyI6WyJMRVhJQ09OIiwiV2ViTWVzc2FnZSIsIk11ZmZpbiIsIkxleGVtZSIsInVpZCIsInNlbmRlciIsInBhcmFtcyIsInN1YmplY3QiLCJvYmplY3RpdmUiLCJpbnRlcmZhY2UiLCJ0b2tlbiIsInJlcXVlc3QiLCJzdWJzY3JpYmUiLCJBUElfTEVYSUNPTiIsIldFQl9NRVNTQUdFX0xFWElDT04iLCJjb25maWciLCJzYW5kYm94X2xvY2FsIiwiaG9zdE5hbWUiLCJwYXRoIiwiY2hhbm5lbEluc3RhbmNlU2lnIiwiYXBpX3Byb3RvY29sIiwic2FuZGJveCIsIldlYlJlcXVlc3RTZGsiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJsYXp5bG9hZCIsImV2ZW50SW50ZXJmYWNlIiwiUG9zdE9mZmljZSIsImdldE9yQ3JlYXRlSW50ZXJmYWNlIiwibGFiZWwiLCJjbGllbnRJZCIsImNsaWVudF9pZCIsInBhc3MiLCJjb25uZWN0ZWRTdG9yZXMiLCJ1aVZhcnMiLCJjbG9jayIsIl9jb25uZWN0aW9uIiwic3RhdGUiLCJjb25uZWN0IiwiZXZlbnRTdWJzY3JpcHRpb25zIiwiU2V0IiwiZXZlbnRDb3VudGVycyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZmluYWxVcmwiLCJhZGRTb2NrZXQiLCJXZWJTb2NrZXQiLCJhdXRvUmV0cnlPbkNsb3NlIiwic29ja2V0Iiwib25lcnJvciIsImUiLCJtc2ciLCJtZXNzYWdlIiwiZGlzcGF0Y2hNZXNzYWdlIiwib25vcGVuIiwib25jbG9zZSIsIm9ubWVzc2FnZSIsIl9tc2dTdHIiLCJkYXRhIiwiX21zZyIsIkpTT04iLCJwYXJzZSIsImVycm9yIiwib3AiLCJpbmNsdWRlcyIsImdldFNlcmlhbGl6YWJsZUludHJvIiwiT2JqZWN0Iiwia2V5cyIsIm1hcCIsIl9sZXhlbWUiLCJfc2NoZW1hIiwic2NoZW1hIiwiZnVsbE5hbWUiLCJuYW1lIiwiZ2V0SW50cm8iLCJfZ2V0TGV4ZW1lIiwiX2xleGVtZUxhYmVsIiwiX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lIiwiY29uc29sZSIsIl9zZWxlY3RlZExleGVtZSIsIl9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24iLCJpbmZsZWN0IiwiZ2VuRml4dHVyZXMiLCJzdHJpbmdpZnkiLCJjb21tdW5pY2F0ZSIsImluZmxlY3Rpb24iLCJ0ZXN0U3RhcnQiLCJEYXRlIiwibm93Iiwic2VuZCIsIl9vcExhYmVsIiwiTUFYX1JFU1BPTlNFX1RJTUUiLCJvbiIsInJlc3VsdCIsInNldFRpbWVvdXQiLCJ3ZWJyZXF1ZXN0IiwiX2ludGVyZmFjZSIsIl9yZXF1ZXN0TXNnIiwib3BMYWJlbCIsIl93ZWJNc2ciLCJfZ2VuZXJhdGVUb2tlbiIsImFsZ28iLCJtc2dCdWZmZXIiLCJUZXh0RW5jb2RlciIsImVuY29kZSIsImhhc2hCdWZmZXIiLCJjcnlwdG8iLCJzdWJ0bGUiLCJkaWdlc3QiLCJoYXNoQXJyYXkiLCJBcnJheSIsImZyb20iLCJVaW50OEFycmF5IiwiaGFzaEhleCIsImIiLCJ0b1N0cmluZyIsInBhZFN0YXJ0Iiwiam9pbiIsInN1YnNjcmliZVRvRXZlbnQiLCJjYWxsYmFja0xpc3QiLCJfdGhpcyIsIm5vdGlmaWVyIiwibm90aWZ5IiwiY2FsbGJhY2tGdW5jdGlvbiIsInB1c2giLCJkZWJ1ZyIsInRhYmxlIiwiY2IiLCJfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24iLCJhZGQiLCJfbmFtZSIsInNvY2tldHMiLCJnbG9iYWwiLCJicm9hZGNhc3RNc2ciLCJfY29ubmVjdEhvc3QiLCJsb2ciLCJfY29ubmVjdGlvbk1zZ0V2IiwiZXYiLCJDdXN0b21FdmVudCIsImRldGFpbCIsInN0YXR1c0NvZGUiLCJvbkNvbm5lY3QiXSwibWFwcGluZ3MiOiI7Ozs7O0lBQUEsTUFBTUEsT0FBTyxHQUFHLEVBQWhCO0lBRUFBLE9BQU8sQ0FBQ0MsVUFBUixxQkFBcUIsY0FBY0MsTUFBTSxDQUFDQyxNQUFyQixDQUE0QixFQUFqRDtJQUFBO0lBQUE7SUFBQSxTQUNrQjtJQURsQjtJQUFBO0lBQUE7SUFBQSxTQUc0QjtJQUNwQkMsSUFBQUEsR0FBRyxFQUFFLElBRGU7SUFFcEJDLElBQUFBLE1BQU0sRUFBRSxJQUZZO0lBR3BCQyxJQUFBQSxNQUFNLEVBQUUsRUFIWTtJQUlwQkMsSUFBQUEsT0FBTyxFQUFFLElBSlc7SUFLcEJDLElBQUFBLFNBQVMsRUFBRTtJQUxTO0lBSDVCO0lBQUE7SUFBQTtJQUFBLFNBV29CO0lBQ1pDLElBQUFBLFNBQVMsRUFBRSxJQURDO0lBRVpDLElBQUFBLEtBQUssRUFBRSxJQUZLO0lBR1pDLElBQUFBLE9BQU8sRUFBRSxJQUhHO0lBSVpDLElBQUFBLFNBQVMsRUFBRTtJQUpDO0lBWHBCOztJQ0RBLE1BQU1DLFdBQVcsR0FBRyxFQUFDLEdBQUcsRUFBSjtJQUFRLEtBQUdDO0lBQVgsQ0FBcEI7SUFFQSxNQUFNQyxNQUFNLEdBQUc7SUFDWEMsRUFBQUEsYUFBYSxFQUFFO0lBQ1hDLElBQUFBLFFBQVEsRUFBRSxnQkFEQztJQUVYQyxJQUFBQSxJQUFJLEVBQUUsT0FGSztJQUdYQyxJQUFBQSxrQkFBa0IsRUFBRSxFQUhUO0lBSVhDLElBQUFBLFlBQVksRUFBRTtJQUpILEdBREo7SUFPWEMsRUFBQUEsT0FBTyxFQUFF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
