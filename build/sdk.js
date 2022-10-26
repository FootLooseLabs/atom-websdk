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
        this.label = options.label || "drona_store_sdk_client";
        this.clientId = options.client_id || "";
        this.token = options.token || "";
        this.keepAliveTimeout = options.keepAliveTimeout || 60000;
        this.uiVars = {
          clock: {},
          config: config[options.label]
        };
        this._connection = null;
        this.state = null;
        this._connectionAlive = null;
        this._socketState = 0; // 0- not connected, 1- connected, 2- connecting
      }

      async connect() {
        this.uiVars.eventSubscriptions = new Set([]);
        this.uiVars.eventCounters = {};
        this._socketState = 2;
        return new Promise((resolve, reject) => {
          var finalUrl = this.uiVars.config.api_protocol + this.uiVars.config.hostName + "/" + this.uiVars.config.path + "/" + this.clientId + "?auth=" + this.token;
          this._connection = Muffin.PostOffice.addSocket(WebSocket, this.label, finalUrl);
          this._connection.autoRetryOnClose = false;

          this._connection.socket.onerror = event => {
            var target = event.target;
            var message;

            if (target && target.readyState === 3) {
              message = "Connection is Closed or Could not be established";
            } else {
              message = "Connection Failed";
            }

            console.error("ERROR: WS-Sdk onError:", event, message);
            this.state = event;
            this.eventInterface.dispatchMessage("error", new Error(message));
            this.cancelKeepAlive();
            this._socketState = 0;
            return reject({
              state: this._socketState,
              msg: message
            });
          };

          this._connection.socket.onopen = e => {
            let msg = `connection established`;
            this.state = e;
            this.eventInterface.dispatchMessage("connect");

            this._keepAlive();

            this._socketState = 1;
            return resolve({
              state: this._socketState,
              msg: msg
            });
          };

          this._connection.socket.onclose = event => {
            let msg = `Connection Closed By server or Network lost`;
            console.error("ERROR: WS-Sdk onClose:", event, msg);
            this.state = event;
            this.eventInterface.dispatchMessage("close", new Error(msg));
            this.cancelKeepAlive();
            this._socketState = 0;
          };

          this._connection.socket.onmessage = e => {
            var _msgStr = e.data;

            if (e.data === 'pong') {
              return;
            }

            try {
              var _msg = JSON.parse(_msgStr);

              if (_msg.error) {
                this.eventInterface.dispatchMessage("agent-error", _msg);
              } else {
                // this.eventInterface.dispatchMessage("incoming-msg", [_msg]);
                this.eventInterface.dispatchMessage("incoming-msg", _msg);

                if (_msg.op.includes("EVENT:::")) {
                  this.eventInterface.dispatchMessage("incoming-event", _msg);
                } else {
                  console.debug("incoming-msg", _msg);
                  this.eventInterface.dispatchMessage("incoming-response", _msg);
                }
              }
            } catch (e) {
              this.eventInterface.dispatchMessage("error", e);
            }
          };
        });
      }

      _keepAlive() {
        this.cancelKeepAlive();
        this._connectionAlive = setInterval(() => {
          this._connection.send("ping");
        }, this.keepAliveTimeout);
      }

      cancelKeepAlive() {
        if (this._connectionAlive) {
          clearInterval(this._connectionAlive);
        }
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
        let inflection = this._findAndInflectLexeme(_lexemeLabel, _msg);

        if (!inflection) {
          return;
        }

        this.uiVars.clock.testStart = Date.now() / 1000;

        if (this._socketState === 1) {
          this._connection.send(inflection);
        } else {
          console.error("ERROR: WS-Sdk communicate:", "Socket is not connected");
        }
      }

      async request(_lexemeLabel, _msg, _opLabel, options = {
        MAX_RESPONSE_TIME: 5000
      }) {
        return new Promise((resolve, reject) => {
          this.waitForSocketConnection(async () => {
            if (this._socketState !== 1) {
              return reject({
                message: "Socket is not connected"
              });
            }

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
            this.eventInterface.on("agent-error", msg => {
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

          var _interfaceType;

          if (_interface.includes(":::")) {
            _interfaceType = "receptive";
            var _webMsg = {
              "interface": _interface,
              "request": _requestMsg,
              "token": this._generateToken(_interface)
            };
          } else {
            _interfaceType = "expressive";
            var _webMsg = {
              "subscribe": _interface,
              "token": this._generateToken(_interface)
            };
          }

          this.communicate("WebMessage", _webMsg);
          this.eventInterface.on("incoming-msg", msg => {
            if (_interfaceType == "receptive") {
              if (msg.op === _opLabel && msg.result != null) {
                return resolve(msg);
              }
            } else if (_interfaceType == "expressive") {
              if (msg.op == _opLabel && msg.statusCode == 2) {
                return resolve(msg);
              }
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

      async websubscribe(_interface, _localSocketName = "global", _targetMsgLabel, options = {
        MAX_RESPONSE_TIME: 5000
      }) {
        return new Promise(async (resolve, reject) => {
          try {
            await this.webrequest(_interface);
          } catch (e) {
            return reject(e);
          }

          var _localSocket = Muffin.PostOffice.sockets[_localSocketName] || Muffin.PostOffice.sockets.global;

          this.eventInterface.on("incoming-event", msg => {
            if (msg.op === `EVENT:::${_interface}`) {
              let _msgLabel = _targetMsgLabel || msg.op;

              _localSocket.dispatchMessage(_msgLabel, msg);
            }
          });
          return resolve(true);
        });
      }

      waitForSocketConnection(callback) {
        console.debug("WS-Sdk waitForSocketConnection:", "Waiting for socket connection");
        setTimeout(async () => {
          if (this._socketState === 1) {
            if (callback != null) {
              callback();
            }
          } else if (this._socketState === 0) {
            try {
              await this.connect();
            } catch (e) {
              console.error("WS-Sdk waitForSocketConnection:", e);
            }

            this.waitForSocketConnection(callback);
          } else {
            this.waitForSocketConnection(callback);
          }
        }, 1000);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLmxhYmVsID0gb3B0aW9ucy5sYWJlbCB8fCBcImRyb25hX3N0b3JlX3Nka19jbGllbnRcIjtcbiAgICAgICAgdGhpcy5jbGllbnRJZCA9IG9wdGlvbnMuY2xpZW50X2lkIHx8IFwiXCI7XG4gICAgICAgIHRoaXMudG9rZW4gPSBvcHRpb25zLnRva2VuIHx8IFwiXCI7XG4gICAgICAgIHRoaXMua2VlcEFsaXZlVGltZW91dCA9IG9wdGlvbnMua2VlcEFsaXZlVGltZW91dCB8fCA2MDAwMDtcbiAgICAgICAgdGhpcy51aVZhcnMgPSB7XG4gICAgICAgICAgICBjbG9jazoge30sXG4gICAgICAgICAgICBjb25maWc6IGNvbmZpZ1tvcHRpb25zLmxhYmVsXVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLnN0YXRlID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbkFsaXZlID0gbnVsbDtcbiAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAwOyAvLyAwLSBub3QgY29ubmVjdGVkLCAxLSBjb25uZWN0ZWQsIDItIGNvbm5lY3RpbmdcbiAgICB9XG5cbiAgICBhc3luYyBjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0KFtdKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVycyA9IHt9O1xuICAgICAgICB0aGlzLl9zb2NrZXRTdGF0ZSA9IDI7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB2YXIgZmluYWxVcmwgPSB0aGlzLnVpVmFycy5jb25maWcuYXBpX3Byb3RvY29sICsgdGhpcy51aVZhcnMuY29uZmlnLmhvc3ROYW1lICsgXCIvXCIgKyB0aGlzLnVpVmFycy5jb25maWcucGF0aCArIFwiL1wiICsgdGhpcy5jbGllbnRJZCArIFwiP2F1dGg9XCIgKyB0aGlzLnRva2VuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gTXVmZmluLlBvc3RPZmZpY2UuYWRkU29ja2V0KFdlYlNvY2tldCwgdGhpcy5sYWJlbCwgZmluYWxVcmwpO1xuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5hdXRvUmV0cnlPbkNsb3NlID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9uZXJyb3IgPSAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0O1xuICAgICAgICAgICAgICAgIHZhciBtZXNzYWdlO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0LnJlYWR5U3RhdGUgPT09IDMpIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiQ29ubmVjdGlvbiBpcyBDbG9zZWQgb3IgQ291bGQgbm90IGJlIGVzdGFibGlzaGVkXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiQ29ubmVjdGlvbiBGYWlsZWRcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVSUk9SOiBXUy1TZGsgb25FcnJvcjpcIiwgZXZlbnQsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBldmVudDtcbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImVycm9yXCIsIG5ldyBFcnJvcihtZXNzYWdlKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxLZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zb2NrZXRTdGF0ZSA9IDA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7c3RhdGU6IHRoaXMuX3NvY2tldFN0YXRlLCBtc2c6IG1lc3NhZ2V9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGVzdGFibGlzaGVkYDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZTtcbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImNvbm5lY3RcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5fa2VlcEFsaXZlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHtzdGF0ZTogdGhpcy5fc29ja2V0U3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9uY2xvc2UgPSAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYENvbm5lY3Rpb24gQ2xvc2VkIEJ5IHNlcnZlciBvciBOZXR3b3JrIGxvc3RgO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFUlJPUjogV1MtU2RrIG9uQ2xvc2U6XCIsIGV2ZW50LCBtc2cpO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBldmVudDtcbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImNsb3NlXCIsIG5ldyBFcnJvcihtc2cpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbmNlbEtlZXBBbGl2ZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3NvY2tldFN0YXRlID0gMDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25tZXNzYWdlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZ1N0ciA9IGUuZGF0YTtcbiAgICAgICAgICAgICAgICBpZiAoZS5kYXRhID09PSAncG9uZycpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cilcbiAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiYWdlbnQtZXJyb3JcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctbXNnXCIsIFtfbXNnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBfbXNnKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctZXZlbnRcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJpbmNvbWluZy1tc2dcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJpbmNvbWluZy1yZXNwb25zZVwiLCBfbXNnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9XG5cblxuICAgIF9rZWVwQWxpdmUoKSB7XG4gICAgICAgIHRoaXMuY2FuY2VsS2VlcEFsaXZlKCk7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChcInBpbmdcIik7XG4gICAgICAgIH0sIHRoaXMua2VlcEFsaXZlVGltZW91dCk7XG4gICAgfVxuXG4gICAgY2FuY2VsS2VlcEFsaXZlKCkge1xuICAgICAgICBpZiAodGhpcy5fY29ubmVjdGlvbkFsaXZlKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRTZXJpYWxpemFibGVJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuTEVYSUNPTikubWFwKChfbGV4ZW1lKSA9PiB7XG4gICAgICAgICAgICBsZXQgX3NjaGVtYSA9IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5zY2hlbWEucmVxdWVzdCB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGFiZWw6IF9sZXhlbWUsXG4gICAgICAgICAgICAgICAgZnVsbE5hbWU6IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5uYW1lLFxuICAgICAgICAgICAgICAgIHNjaGVtYTogX3NjaGVtYVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXRJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTjtcbiAgICB9XG5cbiAgICBfZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MRVhJQ09OW19sZXhlbWVMYWJlbF07XG4gICAgfVxuXG4gICAgX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBpZiAoIV9sZXhlbWVMYWJlbCB8fCAhX21zZykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIkludmFsaWQgUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lID0gdGhpcy5fZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCk7XG4gICAgICAgIGlmICghX3NlbGVjdGVkTGV4ZW1lKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIFwiVW5rbm93biBSZXF1ZXN0LlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKF9tc2cgPT09IFwicmFuZG9tXCIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdCh7fSk7XG4gICAgICAgICAgICAgICAgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbi5nZW5GaXh0dXJlcygpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiA9IF9zZWxlY3RlZExleGVtZS5pbmZsZWN0KF9tc2cpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uc3RyaW5naWZ5KCk7XG4gICAgfVxuXG4gICAgY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKSB7XG4gICAgICAgIGxldCBpbmZsZWN0aW9uID0gdGhpcy5fZmluZEFuZEluZmxlY3RMZXhlbWUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgaWYgKCFpbmZsZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51aVZhcnMuY2xvY2sudGVzdFN0YXJ0ID0gRGF0ZS5ub3coKSAvIDEwMDA7XG4gICAgICAgIGlmICh0aGlzLl9zb2NrZXRTdGF0ZSA9PT0gMSkge1xuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zZW5kKGluZmxlY3Rpb24pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVSUk9SOiBXUy1TZGsgY29tbXVuaWNhdGU6XCIsIFwiU29ja2V0IGlzIG5vdCBjb25uZWN0ZWRcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyByZXF1ZXN0KF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwsIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLndhaXRGb3JTb2NrZXRDb25uZWN0aW9uKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fc29ja2V0U3RhdGUgIT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTogXCJTb2NrZXQgaXMgbm90IGNvbm5lY3RlZFwifSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgICAgICAgICBpZiAoIV9vcExhYmVsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHttZXNzYWdlOiBcIk1lc3NhZ2Ugc2VudC4gTm8gcmVzcF9vcCBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJhZ2VudC1lcnJvclwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5lcnJvciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHttZXNzYWdlOiBgTm8gcmVzcG9uc2UgcmVjZWl2ZWQgaW4gJHtvcHRpb25zLk1BWF9SRVNQT05TRV9USU1FIC8gMTAwMH1zYH0pXG4gICAgICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB3ZWJyZXF1ZXN0KF9pbnRlcmZhY2UsIF9yZXF1ZXN0TXNnLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfaW50ZXJmYWNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7ZXJyb3I6IFwiTm8gSW50ZXJmYWNlIHByb3ZpZGVkLlwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghX2ludGVyZmFjZS5pbmNsdWRlcyhcIjo6OlwiKSAmJiAhX2ludGVyZmFjZS5pbmNsdWRlcyhcInx8fFwiKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe2Vycm9yOiBcIkludmFsaWQgSW50ZXJmYWNlIHByb3ZpZGVkXCJ9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIF9vcExhYmVsID0gb3B0aW9ucy5vcExhYmVsIHx8IF9pbnRlcmZhY2U7XG5cbiAgICAgICAgICAgIHZhciBfaW50ZXJmYWNlVHlwZTtcblxuICAgICAgICAgICAgaWYgKF9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikpIHtcbiAgICAgICAgICAgICAgICBfaW50ZXJmYWNlVHlwZSA9IFwicmVjZXB0aXZlXCI7XG4gICAgICAgICAgICAgICAgdmFyIF93ZWJNc2cgPSB7XG4gICAgICAgICAgICAgICAgICAgIFwiaW50ZXJmYWNlXCI6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWVzdFwiOiBfcmVxdWVzdE1zZyxcbiAgICAgICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0aGlzLl9nZW5lcmF0ZVRva2VuKF9pbnRlcmZhY2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBfaW50ZXJmYWNlVHlwZSA9IFwiZXhwcmVzc2l2ZVwiO1xuICAgICAgICAgICAgICAgIHZhciBfd2ViTXNnID0ge1xuICAgICAgICAgICAgICAgICAgICBcInN1YnNjcmliZVwiOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInRva2VuXCI6IHRoaXMuX2dlbmVyYXRlVG9rZW4oX2ludGVyZmFjZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY29tbXVuaWNhdGUoXCJXZWJNZXNzYWdlXCIsIF93ZWJNc2cpO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoX2ludGVyZmFjZVR5cGUgPT0gXCJyZWNlcHRpdmVcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKF9pbnRlcmZhY2VUeXBlID09IFwiZXhwcmVzc2l2ZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT0gX29wTGFiZWwgJiYgbXNnLnN0YXR1c0NvZGUgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5lcnJvciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QobXNnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTogYE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnN1YnNjcmliZShfaW50ZXJmYWNlLCBfbG9jYWxTb2NrZXROYW1lID0gXCJnbG9iYWxcIiwgX3RhcmdldE1zZ0xhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLndlYnJlcXVlc3QoX2ludGVyZmFjZSlcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgX2xvY2FsU29ja2V0ID0gTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0c1tfbG9jYWxTb2NrZXROYW1lXSB8fCBNdWZmaW4uUG9zdE9mZmljZS5zb2NrZXRzLmdsb2JhbDtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBgRVZFTlQ6Ojoke19pbnRlcmZhY2V9YCkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgX21zZ0xhYmVsID0gX3RhcmdldE1zZ0xhYmVsIHx8IG1zZy5vcDtcbiAgICAgICAgICAgICAgICAgICAgX2xvY2FsU29ja2V0LmRpc3BhdGNoTWVzc2FnZShfbXNnTGFiZWwsIG1zZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHRydWUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICB3YWl0Rm9yU29ja2V0Q29ubmVjdGlvbihjYWxsYmFjaykge1xuICAgICAgICBjb25zb2xlLmRlYnVnKFwiV1MtU2RrIHdhaXRGb3JTb2NrZXRDb25uZWN0aW9uOlwiLCBcIldhaXRpbmcgZm9yIHNvY2tldCBjb25uZWN0aW9uXCIpO1xuICAgICAgICBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zb2NrZXRTdGF0ZSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjayAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9zb2NrZXRTdGF0ZSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIldTLVNkayB3YWl0Rm9yU29ja2V0Q29ubmVjdGlvbjpcIiwgZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMud2FpdEZvclNvY2tldENvbm5lY3Rpb24oY2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLndhaXRGb3JTb2NrZXRDb25uZWN0aW9uKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgMTAwMClcbiAgICB9XG5cbiAgICBhc3luYyBfZ2VuZXJhdGVUb2tlbihtZXNzYWdlLCBvcHRpb25zID0ge2FsZ286IFwiU0hBLTI1NlwifSkge1xuICAgICAgICBjb25zdCBtc2dCdWZmZXIgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUobWVzc2FnZSk7XG4gICAgICAgIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChvcHRpb25zLmFsZ28sIG1zZ0J1ZmZlcik7XG4gICAgICAgIGNvbnN0IGhhc2hBcnJheSA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcikpO1xuICAgICAgICByZXR1cm4gaGFzaEFycmF5Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJycpO1xuICAgIH1cblxuICAgIHN1YnNjcmliZVRvRXZlbnQoKSB7XG4gICAgICAgIGxldCBjYWxsYmFja0xpc3QgPSBbXTtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcbiAgICAgICAgY29uc3Qgbm90aWZpZXIgPSB7XG4gICAgICAgICAgICBub3RpZnk6IGZ1bmN0aW9uIChjYWxsYmFja0Z1bmN0aW9uLCBfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsKSB7XG4gICAgICAgICAgICAgICAgX3RoaXMuY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFja0xpc3QucHVzaCh7Y2FsbGJhY2tGdW5jdGlvbiwgX29wTGFiZWx9KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiKioqKioqKioqKioqKioqKiogQ2FsbGJhY2sgRXZlbnQgVGFibGUgKioqKioqKioqKioqKioqKioqKioqKioqXCIpXG4gICAgICAgICAgICAgICAgY29uc29sZS50YWJsZShjYWxsYmFja0xpc3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctZXZlbnRcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgZm9yIChsZXQgY2Igb2YgY2FsbGJhY2tMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gY2IuX29wTGFiZWwpXG4gICAgICAgICAgICAgICAgICAgIGNiLmNhbGxiYWNrRnVuY3Rpb24obXNnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuIG5vdGlmaWVyO1xuICAgIH1cblxuICAgIF9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbihfbXNnKSB7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50U3Vic2NyaXB0aW9ucy5hZGQoX25hbWUpO1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzW2BFVkVOVDo6OiR7X25hbWV9YF0gPSAwO1xuICAgICAgICBNdWZmaW4uUG9zdE9mZmljZS5zb2NrZXRzLmdsb2JhbC5icm9hZGNhc3RNc2coXCJzdWJzY3JpcHRpb24tY3JlYXRlZFwiLCBfbXNnKTtcbiAgICB9XG5cbiAgICBfY29ubmVjdEhvc3QoKSB7XG4gICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGluZyB3aXRoIGFwaSBob3N0YDtcblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGZhaWxlZDogJHtlLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1wOlwiLCBtc2cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25vcGVuID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uY2xvc2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGNsb3NlZGA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25tZXNzYWdlID0gKF9jb25uZWN0aW9uTXNnRXYpID0+IHsgLy9jdXN0b20gb25tZXNzYWdlIGZ1bmN0aW9ucyBjYW4gYmUgcHJvdmlkZWQgYnkgdGhlIGRldmVsb3Blci5cbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwiaW1wOlwiLCBcIi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cIixfY29ubmVjdGlvbk1zZ0V2KTtcbiAgICAgICAgICAgIHZhciBfbXNnU3RyID0gX2Nvbm5lY3Rpb25Nc2dFdi5kYXRhO1xuICAgICAgICAgICAgaWYgKF9tc2dTdHIgPT0gXCJyZXNwb25zZTpcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH0gLy9waW5nLXBvbmcgbWVzc2FnZXMgZXhjaGFuZ2VkIGluIGtlZXBBbGl2ZVxuICAgICAgICAgICAgdmFyIGV2ID0gbnVsbDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpO1xuICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtZXZlbnQtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgLy9ub3QgdmFsaWQgbXNnXG4gICAgICAgICAgICAgICAgdmFyIF9tc2cgPSB7ZXJyb3I6IGUsIGxhYmVsOiBgJHt0aGlzLm5hbWV9LW1lc3NhZ2UtZXJyb3JgfVxuICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KF9tc2cubGFiZWwsIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZXY7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uKFwiaW5jb21pbmctaG9zdGFnZW50LXJlc3BvbnNlLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgICAgICBpZiAobXNnLm9wLmluY2x1ZGVzKFwifHx8XCIpICYmIG1zZy5zdGF0dXNDb2RlID09IDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbihtc2cub3ApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aGlzLm9uKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uKFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzW21zZy5vcF0gKz0gMTtcbiAgICAgICAgICAgIC8vIHRoaXMudWlWYXJzLmhvc3RhZ2VudFJlc3BvbnNlTXNnTG9nRWwuYXBwZW5kQ2hpbGQodGFibGVIdG1sKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgb25Db25uZWN0KCkge1xuXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNdWZmaW47XG4iXSwibmFtZXMiOlsiTEVYSUNPTiIsIldlYk1lc3NhZ2UiLCJNdWZmaW4iLCJMZXhlbWUiLCJ1aWQiLCJzZW5kZXIiLCJwYXJhbXMiLCJzdWJqZWN0Iiwib2JqZWN0aXZlIiwiaW50ZXJmYWNlIiwidG9rZW4iLCJyZXF1ZXN0Iiwic3Vic2NyaWJlIiwiQVBJX0xFWElDT04iLCJXRUJfTUVTU0FHRV9MRVhJQ09OIiwiY29uZmlnIiwic2FuZGJveF9sb2NhbCIsImhvc3ROYW1lIiwicGF0aCIsImNoYW5uZWxJbnN0YW5jZVNpZyIsImFwaV9wcm90b2NvbCIsInNhbmRib3giLCJXZWJSZXF1ZXN0U2RrIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibGF6eWxvYWQiLCJldmVudEludGVyZmFjZSIsIlBvc3RPZmZpY2UiLCJnZXRPckNyZWF0ZUludGVyZmFjZSIsImxhYmVsIiwiY2xpZW50SWQiLCJjbGllbnRfaWQiLCJrZWVwQWxpdmVUaW1lb3V0IiwidWlWYXJzIiwiY2xvY2siLCJfY29ubmVjdGlvbiIsInN0YXRlIiwiX2Nvbm5lY3Rpb25BbGl2ZSIsIl9zb2NrZXRTdGF0ZSIsImNvbm5lY3QiLCJldmVudFN1YnNjcmlwdGlvbnMiLCJTZXQiLCJldmVudENvdW50ZXJzIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJmaW5hbFVybCIsImFkZFNvY2tldCIsIldlYlNvY2tldCIsImF1dG9SZXRyeU9uQ2xvc2UiLCJzb2NrZXQiLCJvbmVycm9yIiwiZXZlbnQiLCJ0YXJnZXQiLCJtZXNzYWdlIiwicmVhZHlTdGF0ZSIsImNvbnNvbGUiLCJlcnJvciIsImRpc3BhdGNoTWVzc2FnZSIsIkVycm9yIiwiY2FuY2VsS2VlcEFsaXZlIiwibXNnIiwib25vcGVuIiwiZSIsIl9rZWVwQWxpdmUiLCJvbmNsb3NlIiwib25tZXNzYWdlIiwiX21zZ1N0ciIsImRhdGEiLCJfbXNnIiwiSlNPTiIsInBhcnNlIiwib3AiLCJpbmNsdWRlcyIsImRlYnVnIiwic2V0SW50ZXJ2YWwiLCJzZW5kIiwiY2xlYXJJbnRlcnZhbCIsImdldFNlcmlhbGl6YWJsZUludHJvIiwiT2JqZWN0Iiwia2V5cyIsIm1hcCIsIl9sZXhlbWUiLCJfc2NoZW1hIiwic2NoZW1hIiwiZnVsbE5hbWUiLCJuYW1lIiwiZ2V0SW50cm8iLCJfZ2V0TGV4ZW1lIiwiX2xleGVtZUxhYmVsIiwiX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lIiwiX3NlbGVjdGVkTGV4ZW1lIiwiX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiIsImluZmxlY3QiLCJnZW5GaXh0dXJlcyIsInN0cmluZ2lmeSIsImNvbW11bmljYXRlIiwiaW5mbGVjdGlvbiIsInRlc3RTdGFydCIsIkRhdGUiLCJub3ciLCJfb3BMYWJlbCIsIk1BWF9SRVNQT05TRV9USU1FIiwid2FpdEZvclNvY2tldENvbm5lY3Rpb24iLCJvbiIsInJlc3VsdCIsInNldFRpbWVvdXQiLCJ3ZWJyZXF1ZXN0IiwiX2ludGVyZmFjZSIsIl9yZXF1ZXN0TXNnIiwib3BMYWJlbCIsIl9pbnRlcmZhY2VUeXBlIiwiX3dlYk1zZyIsIl9nZW5lcmF0ZVRva2VuIiwic3RhdHVzQ29kZSIsIndlYnN1YnNjcmliZSIsIl9sb2NhbFNvY2tldE5hbWUiLCJfdGFyZ2V0TXNnTGFiZWwiLCJfbG9jYWxTb2NrZXQiLCJzb2NrZXRzIiwiZ2xvYmFsIiwiX21zZ0xhYmVsIiwiY2FsbGJhY2siLCJhbGdvIiwibXNnQnVmZmVyIiwiVGV4dEVuY29kZXIiLCJlbmNvZGUiLCJoYXNoQnVmZmVyIiwiY3J5cHRvIiwic3VidGxlIiwiZGlnZXN0IiwiaGFzaEFycmF5IiwiQXJyYXkiLCJmcm9tIiwiVWludDhBcnJheSIsImIiLCJ0b1N0cmluZyIsInBhZFN0YXJ0Iiwiam9pbiIsInN1YnNjcmliZVRvRXZlbnQiLCJjYWxsYmFja0xpc3QiLCJfdGhpcyIsIm5vdGlmaWVyIiwibm90aWZ5IiwiY2FsbGJhY2tGdW5jdGlvbiIsInB1c2giLCJ0YWJsZSIsImNiIiwiX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uIiwiYWRkIiwiX25hbWUiLCJicm9hZGNhc3RNc2ciLCJfY29ubmVjdEhvc3QiLCJsb2ciLCJfY29ubmVjdGlvbk1zZ0V2IiwiZXYiLCJDdXN0b21FdmVudCIsImRldGFpbCIsIm9uQ29ubmVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7SUFBQSxNQUFNQSxPQUFPLEdBQUcsRUFBaEI7SUFFQUEsT0FBTyxDQUFDQyxVQUFSLHFCQUFxQixjQUFjQyxNQUFNLENBQUNDLE1BQXJCLENBQTRCLEVBQWpEO0lBQUE7SUFBQTtJQUFBLFNBQ2tCO0lBRGxCO0lBQUE7SUFBQTtJQUFBLFNBRzRCO0lBQ3BCQyxJQUFBQSxHQUFHLEVBQUUsSUFEZTtJQUVwQkMsSUFBQUEsTUFBTSxFQUFFLElBRlk7SUFHcEJDLElBQUFBLE1BQU0sRUFBRSxFQUhZO0lBSXBCQyxJQUFBQSxPQUFPLEVBQUUsSUFKVztJQUtwQkMsSUFBQUEsU0FBUyxFQUFFO0lBTFM7SUFINUI7SUFBQTtJQUFBO0lBQUEsU0FXb0I7SUFDWkMsSUFBQUEsU0FBUyxFQUFFLElBREM7SUFFWkMsSUFBQUEsS0FBSyxFQUFFLElBRks7SUFHWkMsSUFBQUEsT0FBTyxFQUFFLElBSEc7SUFJWkMsSUFBQUEsU0FBUyxFQUFFO0lBSkM7SUFYcEI7O0lDQUEsTUFBTUMsV0FBVyxHQUFHLEVBQUMsR0FBRyxFQUFKO0lBQVEsS0FBR0M7SUFBWCxDQUFwQjtJQUVBLE1BQU1DLE1BQU0sR0FBRztJQUNYQyxFQUFBQSxhQUFhLEVBQUU7SUFDWEMsSUFBQUEsUUFBUSxFQUFFLGdCQURDO0lBRVhDLElBQUFBLElBQUks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
