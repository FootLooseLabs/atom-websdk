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
              error: "Invalid Interface provided"
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

      async websubscribe(_interface, _po = "global", options = {
        MAX_RESPONSE_TIME: 5000
      }) {
        return new Promise(async (resolve, reject) => {
          try {
            await this.webrequest(_interface);
          } catch (e) {
            return reject(e);
          }

          var _localSocket = Muffin.PostOffice.sockets[_po] || Muffin.PostOffice.sockets.global;

          this.eventInterface.on("incoming-event", msg => {
            if (msg.op === `EVENT:::${_interface}`) {
              _localSocket.dispatchMessage(msg);
            }
          });
          return resolve(true);
        });
      }

      async _generateToken(message, options = {
        algo: "SHA-256"
      }) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest(options.algo, msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLnVpZCA9IFwiXCI7XG4gICAgICAgIHRoaXMubGFiZWwgPSBvcHRpb25zLmxhYmVsIHx8IFwiZHJvbmFfc3RvcmVfc2RrX2NsaWVudFwiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5wYXNzID0gXCJcIjtcbiAgICAgICAgdGhpcy5jb25uZWN0ZWRTdG9yZXMgPSBbXTtcbiAgICAgICAgdGhpcy51aVZhcnMgPSB7XG4gICAgICAgICAgICBjbG9jazoge30sXG4gICAgICAgICAgICBjb25maWc6IGNvbmZpZ1tvcHRpb25zLmxhYmVsXVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLnN0YXRlID0gbnVsbDtcbiAgICB9XG5cbiAgICBhc3luYyBjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0KFtdKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVycyA9IHt9O1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbmFsVXJsID0gdGhpcy51aVZhcnMuY29uZmlnLmFwaV9wcm90b2NvbCArIHRoaXMudWlWYXJzLmNvbmZpZy5ob3N0TmFtZSArIFwiL1wiICsgdGhpcy51aVZhcnMuY29uZmlnLnBhdGggKyBcIi9cIiArIHRoaXMuY2xpZW50SWQgKyBcIj9hdXRoPVwiICsgdGhpcy50b2tlblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjb25uZWN0XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGNsb3NlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjbG9zZVwiLCBlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25tZXNzYWdlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZ1N0ciA9IGUuZGF0YTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cilcbiAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctbXNnXCIsIFtfbXNnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBfbXNnKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctZXZlbnRcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBnZXRTZXJpYWxpemFibGVJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuTEVYSUNPTikubWFwKChfbGV4ZW1lKSA9PiB7XG4gICAgICAgICAgICBsZXQgX3NjaGVtYSA9IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5zY2hlbWEucmVxdWVzdCB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGFiZWw6IF9sZXhlbWUsXG4gICAgICAgICAgICAgICAgZnVsbE5hbWU6IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5uYW1lLFxuICAgICAgICAgICAgICAgIHNjaGVtYTogX3NjaGVtYVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXRJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTjtcbiAgICB9XG5cbiAgICBfZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MRVhJQ09OW19sZXhlbWVMYWJlbF07XG4gICAgfVxuXG4gICAgX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBpZiAoIV9sZXhlbWVMYWJlbCB8fCAhX21zZykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIkludmFsaWQgUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lID0gdGhpcy5fZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCk7XG4gICAgICAgIGlmICghX3NlbGVjdGVkTGV4ZW1lKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIFwiVW5rbm93biBSZXF1ZXN0LlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKF9tc2cgPT09IFwicmFuZG9tXCIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdCh7fSk7XG4gICAgICAgICAgICAgICAgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbi5nZW5GaXh0dXJlcygpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiA9IF9zZWxlY3RlZExleGVtZS5pbmZsZWN0KF9tc2cpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uc3RyaW5naWZ5KCk7XG4gICAgfVxuXG4gICAgY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKSB7XG4gICAgICAgIC8vIHRyeXtcbiAgICAgICAgLy8gXHRKU09OLnBhcnNlKF9tc2cpO1xuICAgICAgICAvLyB9Y2F0Y2goZSl7XG4gICAgICAgIC8vIFx0bGV0IG1zZyA9IFwiaW52YWxpZCBqc29uIHBheWxvYWRcIjtcbiAgICAgICAgLy8gXHRjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIG1zZyk7XG4gICAgICAgIC8vIFx0cmV0dXJuO1xuICAgICAgICAvLyB9XG4gICAgICAgIGxldCBpbmZsZWN0aW9uID0gdGhpcy5fZmluZEFuZEluZmxlY3RMZXhlbWUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgaWYgKCFpbmZsZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51aVZhcnMuY2xvY2sudGVzdFN0YXJ0ID0gRGF0ZS5ub3coKSAvIDEwMDA7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChpbmZsZWN0aW9uKTtcbiAgICB9XG5cbiAgICBhc3luYyByZXF1ZXN0KF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwsIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICBpZighX29wTGFiZWwpe1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHttZXNzYWdlOiBcIk1lc3NhZ2Ugc2VudC4gTm8gcmVzcF9vcCBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6YE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnJlcXVlc3QoX2ludGVyZmFjZSwgX3JlcXVlc3RNc2csIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBpZighX2ludGVyZmFjZSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7ZXJyb3I6IFwiTm8gSW50ZXJmYWNlIHByb3ZpZGVkLlwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKCFfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpICYmICFfaW50ZXJmYWNlLmluY2x1ZGVzKFwifHx8XCIpKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJJbnZhbGlkIEludGVyZmFjZSBwcm92aWRlZFwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfb3BMYWJlbCA9IG9wdGlvbnMub3BMYWJlbCB8fCBfaW50ZXJmYWNlO1xuXG4gICAgICAgICAgICBpZihfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpKXtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJpbnRlcmZhY2VcIiA6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWVzdFwiIDogX3JlcXVlc3RNc2csXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIF93ZWJNc2cgPSB7XG4gICAgICAgICAgICAgICAgICAgIFwic3Vic2NyaWJlXCIgOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInRva2VuXCI6IHRoaXMuX2dlbmVyYXRlVG9rZW4oX2ludGVyZmFjZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY29tbXVuaWNhdGUoXCJXZWJNZXNzYWdlXCIsIF93ZWJNc2cpO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6YE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnN1YnNjcmliZShfaW50ZXJmYWNlLCBfcG89XCJnbG9iYWxcIiwgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLndlYnJlcXVlc3QoX2ludGVyZmFjZSlcbiAgICAgICAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgX2xvY2FsU29ja2V0ID0gTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0c1tfcG9dIHx8IE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHMuZ2xvYmFsO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctZXZlbnRcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IGBFVkVOVDo6OiR7X2ludGVyZmFjZX1gKSB7XG4gICAgICAgICAgICAgICAgICAgIF9sb2NhbFNvY2tldC5kaXNwYXRjaE1lc3NhZ2UobXNnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgX2dlbmVyYXRlVG9rZW4obWVzc2FnZSwgb3B0aW9ucyA9IHthbGdvOiBcIlNIQS0yNTZcIn0pIHtcbiAgICAgICAgY29uc3QgbXNnQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpOyAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChvcHRpb25zLmFsZ28sIG1zZ0J1ZmZlcik7XG4gICAgICAgIGNvbnN0IGhhc2hBcnJheSA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcikpO1xuICAgICAgICByZXR1cm4gaGFzaEFycmF5Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJycpO1xuICAgIH1cblxuICAgIHN1YnNjcmliZVRvRXZlbnQoKXtcbiAgICAgICAgbGV0IGNhbGxiYWNrTGlzdCA9IFtdO1xuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuICAgICAgICBjb25zdCBub3RpZmllciA9IHtcbiAgICAgICAgICAgIG5vdGlmeTogZnVuY3Rpb24oY2FsbGJhY2tGdW5jdGlvbiwgX2xleGVtZUxhYmVsLCBfbXNnLCBfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgIF90aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tMaXN0LnB1c2goe2NhbGxiYWNrRnVuY3Rpb24sIF9vcExhYmVsfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIioqKioqKioqKioqKioqKioqIENhbGxiYWNrIEV2ZW50IFRhYmxlICoqKioqKioqKioqKioqKioqKioqKioqKlwiKVxuICAgICAgICAgICAgICAgIGNvbnNvbGUudGFibGUoY2FsbGJhY2tMaXN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpPT57XG4gICAgICAgICAgICBmb3IgKGxldCBjYiBvZiBjYWxsYmFja0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZihtc2cub3AgPT09IGNiLl9vcExhYmVsKVxuICAgICAgICAgICAgICAgICAgICBjYi5jYWxsYmFja0Z1bmN0aW9uKG1zZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIHJldHVybiBub3RpZmllcjtcbiAgICB9XG5cbiAgICBfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24oX21zZykge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMuYWRkKF9uYW1lKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1tgRVZFTlQ6Ojoke19uYW1lfWBdID0gMDtcbiAgICAgICAgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWwuYnJvYWRjYXN0TXNnKFwic3Vic2NyaXB0aW9uLWNyZWF0ZWRcIiwgX21zZyk7XG4gICAgfVxuXG4gICAgX2Nvbm5lY3RIb3N0KCkge1xuICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpbmcgd2l0aCBhcGkgaG9zdGA7XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltcDpcIiwgbXNnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICB9XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ubWVzc2FnZSA9IChfY29ubmVjdGlvbk1zZ0V2KSA9PiB7IC8vY3VzdG9tIG9ubWVzc2FnZSBmdW5jdGlvbnMgY2FuIGJlIHByb3ZpZGVkIGJ5IHRoZSBkZXZlbG9wZXIuXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcImltcDpcIiwgXCItLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXCIsX2Nvbm5lY3Rpb25Nc2dFdik7XG4gICAgICAgICAgICB2YXIgX21zZ1N0ciA9IF9jb25uZWN0aW9uTXNnRXYuZGF0YTtcbiAgICAgICAgICAgIGlmIChfbXNnU3RyID09IFwicmVzcG9uc2U6XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IC8vcGluZy1wb25nIG1lc3NhZ2VzIGV4Y2hhbmdlZCBpbiBrZWVwQWxpdmVcbiAgICAgICAgICAgIHZhciBldiA9IG51bGw7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0gSlNPTi5wYXJzZShfbXNnU3RyKTtcbiAgICAgICAgICAgICAgICBpZiAoX21zZy5vcC5pbmNsdWRlcyhcIkVWRU5UOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8vbm90IHZhbGlkIG1zZ1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0ge2Vycm9yOiBlLCBsYWJlbDogYCR7dGhpcy5uYW1lfS1tZXNzYWdlLWVycm9yYH1cbiAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChfbXNnLmxhYmVsLCB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICAgICAgaWYgKG1zZy5vcC5pbmNsdWRlcyhcInx8fFwiKSAmJiBtc2cuc3RhdHVzQ29kZSA9PSAyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24obXNnLm9wKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vbigpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1ttc2cub3BdICs9IDE7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uQ29ubmVjdCgpIHtcblxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTXVmZmluO1xuIl0sIm5hbWVzIjpbIkxFWElDT04iLCJXZWJNZXNzYWdlIiwiTXVmZmluIiwiTGV4ZW1lIiwidWlkIiwic2VuZGVyIiwicGFyYW1zIiwic3ViamVjdCIsIm9iamVjdGl2ZSIsImludGVyZmFjZSIsInRva2VuIiwicmVxdWVzdCIsInN1YnNjcmliZSIsIkFQSV9MRVhJQ09OIiwiV0VCX01FU1NBR0VfTEVYSUNPTiIsImNvbmZpZyIsInNhbmRib3hfbG9jYWwiLCJob3N0TmFtZSIsInBhdGgiLCJjaGFubmVsSW5zdGFuY2VTaWciLCJhcGlfcHJvdG9jb2wiLCJzYW5kYm94IiwiV2ViUmVxdWVzdFNkayIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsImxhenlsb2FkIiwiZXZlbnRJbnRlcmZhY2UiLCJQb3N0T2ZmaWNlIiwiZ2V0T3JDcmVhdGVJbnRlcmZhY2UiLCJsYWJlbCIsImNsaWVudElkIiwiY2xpZW50X2lkIiwicGFzcyIsImNvbm5lY3RlZFN0b3JlcyIsInVpVmFycyIsImNsb2NrIiwiX2Nvbm5lY3Rpb24iLCJzdGF0ZSIsImNvbm5lY3QiLCJldmVudFN1YnNjcmlwdGlvbnMiLCJTZXQiLCJldmVudENvdW50ZXJzIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJmaW5hbFVybCIsImFkZFNvY2tldCIsIldlYlNvY2tldCIsImF1dG9SZXRyeU9uQ2xvc2UiLCJzb2NrZXQiLCJvbmVycm9yIiwiZSIsIm1zZyIsIm1lc3NhZ2UiLCJkaXNwYXRjaE1lc3NhZ2UiLCJvbm9wZW4iLCJvbmNsb3NlIiwib25tZXNzYWdlIiwiX21zZ1N0ciIsImRhdGEiLCJfbXNnIiwiSlNPTiIsInBhcnNlIiwiZXJyb3IiLCJvcCIsImluY2x1ZGVzIiwiZ2V0U2VyaWFsaXphYmxlSW50cm8iLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiX2xleGVtZSIsIl9zY2hlbWEiLCJzY2hlbWEiLCJmdWxsTmFtZSIsIm5hbWUiLCJnZXRJbnRybyIsIl9nZXRMZXhlbWUiLCJfbGV4ZW1lTGFiZWwiLCJfZmluZEFuZEluZmxlY3RMZXhlbWUiLCJjb25zb2xlIiwiX3NlbGVjdGVkTGV4ZW1lIiwiX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiIsImluZmxlY3QiLCJnZW5GaXh0dXJlcyIsInN0cmluZ2lmeSIsImNvbW11bmljYXRlIiwiaW5mbGVjdGlvbiIsInRlc3RTdGFydCIsIkRhdGUiLCJub3ciLCJzZW5kIiwiX29wTGFiZWwiLCJNQVhfUkVTUE9OU0VfVElNRSIsIm9uIiwicmVzdWx0Iiwic2V0VGltZW91dCIsIndlYnJlcXVlc3QiLCJfaW50ZXJmYWNlIiwiX3JlcXVlc3RNc2ciLCJvcExhYmVsIiwiX3dlYk1zZyIsIl9nZW5lcmF0ZVRva2VuIiwid2Vic3Vic2NyaWJlIiwiX3BvIiwiX2xvY2FsU29ja2V0Iiwic29ja2V0cyIsImdsb2JhbCIsImFsZ28iLCJtc2dCdWZmZXIiLCJUZXh0RW5jb2RlciIsImVuY29kZSIsImhhc2hCdWZmZXIiLCJjcnlwdG8iLCJzdWJ0bGUiLCJkaWdlc3QiLCJoYXNoQXJyYXkiLCJBcnJheSIsImZyb20iLCJVaW50OEFycmF5IiwiYiIsInRvU3RyaW5nIiwicGFkU3RhcnQiLCJqb2luIiwic3Vic2NyaWJlVG9FdmVudCIsImNhbGxiYWNrTGlzdCIsIl90aGlzIiwibm90aWZpZXIiLCJub3RpZnkiLCJjYWxsYmFja0Z1bmN0aW9uIiwicHVzaCIsImRlYnVnIiwidGFibGUiLCJjYiIsIl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbiIsImFkZCIsIl9uYW1lIiwiYnJvYWRjYXN0TXNnIiwiX2Nvbm5lY3RIb3N0IiwibG9nIiwiX2Nvbm5lY3Rpb25Nc2dFdiIsImV2IiwiQ3VzdG9tRXZlbnQiLCJkZXRhaWwiLCJzdGF0dXNDb2RlIiwib25Db25uZWN0Il0sIm1hcHBpbmdzIjoiOzs7OztJ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
