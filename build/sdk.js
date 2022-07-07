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
        this.keepAliveTimeout = options.keepAliveTimeout || 60000;
        this.pass = "";
        this.connectedStores = [];
        this.uiVars = {
          clock: {},
          config: config[options.label]
        };
        this._connection = null;
        this.state = null;
        this._connectionAlive = null;
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
            this.cancelKeepAlive();
            return reject({
              state: this.state,
              msg: msg
            });
          };

          this._connection.socket.onopen = e => {
            let msg = `connection established`;
            this.state = e;
            this.eventInterface.dispatchMessage("connect");

            this._keepAlive();

            return resolve({
              state: this.state,
              msg: msg
            });
          };

          this._connection.socket.onclose = e => {
            let msg = `connection closed`;
            this.state = e;
            this.eventInterface.dispatchMessage("close", e);
            this.cancelKeepAlive();
            return reject({
              state: this.state,
              msg: msg
            });
          };

          this._connection.socket.onmessage = e => {
            var _msgStr = e.data;

            if (e.data === 'pong') {
              return;
            }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLnVpZCA9IFwiXCI7XG4gICAgICAgIHRoaXMubGFiZWwgPSBvcHRpb25zLmxhYmVsIHx8IFwiZHJvbmFfc3RvcmVfc2RrX2NsaWVudFwiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5rZWVwQWxpdmVUaW1lb3V0ID0gb3B0aW9ucy5rZWVwQWxpdmVUaW1lb3V0IHx8IDYwMDAwO1xuICAgICAgICB0aGlzLnBhc3MgPSBcIlwiO1xuICAgICAgICB0aGlzLmNvbm5lY3RlZFN0b3JlcyA9IFtdO1xuICAgICAgICB0aGlzLnVpVmFycyA9IHtcbiAgICAgICAgICAgIGNsb2NrOiB7fSxcbiAgICAgICAgICAgIGNvbmZpZzogY29uZmlnW29wdGlvbnMubGFiZWxdXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IG51bGw7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBudWxsO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uQWxpdmUgPSBudWxsO1xuICAgIH1cblxuICAgIGFzeW5jIGNvbm5lY3QoKSB7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50U3Vic2NyaXB0aW9ucyA9IG5ldyBTZXQoW10pO1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzID0ge307XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB2YXIgZmluYWxVcmwgPSB0aGlzLnVpVmFycy5jb25maWcuYXBpX3Byb3RvY29sICsgdGhpcy51aVZhcnMuY29uZmlnLmhvc3ROYW1lICsgXCIvXCIgKyB0aGlzLnVpVmFycy5jb25maWcucGF0aCArIFwiL1wiICsgdGhpcy5jbGllbnRJZCArIFwiP2F1dGg9XCIgKyB0aGlzLnRva2VuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gTXVmZmluLlBvc3RPZmZpY2UuYWRkU29ja2V0KFdlYlNvY2tldCwgdGhpcy5sYWJlbCwgZmluYWxVcmwpO1xuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5hdXRvUmV0cnlPbkNsb3NlID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBlKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbmNlbEtlZXBBbGl2ZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe3N0YXRlOiB0aGlzLnN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25vcGVuID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiY29ubmVjdFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9rZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9uY2xvc2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiY2xvc2VcIiwgZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxLZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25tZXNzYWdlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZ1N0ciA9IGUuZGF0YTtcbiAgICAgICAgICAgICAgICBpZihlLmRhdGEgPT09ICdwb25nJyl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpXG4gICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImVycm9yXCIsIF9tc2cpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBbX21zZ10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJpbmNvbWluZy1tc2dcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLWV2ZW50XCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLXJlc3BvbnNlXCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImVycm9yXCIsIGUpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH1cblxuXG4gICAgX2tlZXBBbGl2ZSgpIHtcbiAgICAgICAgdGhpcy5jYW5jZWxLZWVwQWxpdmUoKTtcbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbkFsaXZlID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zZW5kKFwicGluZ1wiKTtcbiAgICAgICAgfSwgdGhpcy5rZWVwQWxpdmVUaW1lb3V0KTtcbiAgICB9XG5cbiAgICBjYW5jZWxLZWVwQWxpdmUoKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb25uZWN0aW9uQWxpdmUpIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5fY29ubmVjdGlvbkFsaXZlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldFNlcmlhbGl6YWJsZUludHJvKCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5MRVhJQ09OKS5tYXAoKF9sZXhlbWUpID0+IHtcbiAgICAgICAgICAgIGxldCBfc2NoZW1hID0gdGhpcy5MRVhJQ09OW19sZXhlbWVdLnNjaGVtYS5yZXF1ZXN0IHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBsYWJlbDogX2xleGVtZSxcbiAgICAgICAgICAgICAgICBmdWxsTmFtZTogdGhpcy5MRVhJQ09OW19sZXhlbWVdLm5hbWUsXG4gICAgICAgICAgICAgICAgc2NoZW1hOiBfc2NoZW1hXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdldEludHJvKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MRVhJQ09OO1xuICAgIH1cblxuICAgIF9nZXRMZXhlbWUoX2xleGVtZUxhYmVsKSB7XG4gICAgICAgIHJldHVybiB0aGlzLkxFWElDT05bX2xleGVtZUxhYmVsXTtcbiAgICB9XG5cbiAgICBfZmluZEFuZEluZmxlY3RMZXhlbWUoX2xleGVtZUxhYmVsLCBfbXNnKSB7XG4gICAgICAgIGlmICghX2xleGVtZUxhYmVsIHx8ICFfbXNnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIFwiSW52YWxpZCBSZXF1ZXN0LlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWUgPSB0aGlzLl9nZXRMZXhlbWUoX2xleGVtZUxhYmVsKTtcbiAgICAgICAgaWYgKCFfc2VsZWN0ZWRMZXhlbWUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgXCJVbmtub3duIFJlcXVlc3QuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cblxuICAgICAgICBpZiAoX21zZyA9PT0gXCJyYW5kb21cIikge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiA9IF9zZWxlY3RlZExleGVtZS5pbmZsZWN0KHt9KTtcbiAgICAgICAgICAgICAgICBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uLmdlbkZpeHR1cmVzKCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uID0gX3NlbGVjdGVkTGV4ZW1lLmluZmxlY3QoX21zZyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbi5zdHJpbmdpZnkoKTtcbiAgICB9XG5cbiAgICBjb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgLy8gdHJ5e1xuICAgICAgICAvLyBcdEpTT04ucGFyc2UoX21zZyk7XG4gICAgICAgIC8vIH1jYXRjaChlKXtcbiAgICAgICAgLy8gXHRsZXQgbXNnID0gXCJpbnZhbGlkIGpzb24gcGF5bG9hZFwiO1xuICAgICAgICAvLyBcdGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgbXNnKTtcbiAgICAgICAgLy8gXHRyZXR1cm47XG4gICAgICAgIC8vIH1cbiAgICAgICAgbGV0IGluZmxlY3Rpb24gPSB0aGlzLl9maW5kQW5kSW5mbGVjdExleGVtZShfbGV4ZW1lTGFiZWwsIF9tc2cpO1xuICAgICAgICBpZiAoIWluZmxlY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVpVmFycy5jbG9jay50ZXN0U3RhcnQgPSBEYXRlLm5vdygpIC8gMTAwMDtcbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zZW5kKGluZmxlY3Rpb24pO1xuICAgIH1cblxuICAgIGFzeW5jIHJlcXVlc3QoX2xleGVtZUxhYmVsLCBfbXNnLCBfb3BMYWJlbCwgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgICAgIGlmICghX29wTGFiZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7bWVzc2FnZTogXCJNZXNzYWdlIHNlbnQuIE5vIHJlc3Bfb3AgcHJvdmlkZWQuXCJ9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJlcnJvclwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLmVycm9yICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChtc2cpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHttZXNzYWdlOiBgTm8gcmVzcG9uc2UgcmVjZWl2ZWQgaW4gJHtvcHRpb25zLk1BWF9SRVNQT05TRV9USU1FIC8gMTAwMH1zYH0pXG4gICAgICAgICAgICB9LCBvcHRpb25zLk1BWF9SRVNQT05TRV9USU1FKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgd2VicmVxdWVzdChfaW50ZXJmYWNlLCBfcmVxdWVzdE1zZywgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGlmICghX2ludGVyZmFjZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe2Vycm9yOiBcIk5vIEludGVyZmFjZSBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikgJiYgIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCJ8fHxcIikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJJbnZhbGlkIEludGVyZmFjZSBwcm92aWRlZFwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfb3BMYWJlbCA9IG9wdGlvbnMub3BMYWJlbCB8fCBfaW50ZXJmYWNlO1xuXG4gICAgICAgICAgICB2YXIgX2ludGVyZmFjZVR5cGU7XG5cbiAgICAgICAgICAgIGlmIChfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcInJlY2VwdGl2ZVwiO1xuICAgICAgICAgICAgICAgIHZhciBfd2ViTXNnID0ge1xuICAgICAgICAgICAgICAgICAgICBcImludGVyZmFjZVwiOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInJlcXVlc3RcIjogX3JlcXVlc3RNc2csXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcImV4cHJlc3NpdmVcIjtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJzdWJzY3JpYmVcIjogX2ludGVyZmFjZSxcbiAgICAgICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0aGlzLl9nZW5lcmF0ZVRva2VuKF9pbnRlcmZhY2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKFwiV2ViTWVzc2FnZVwiLCBfd2ViTXNnKTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYoX2ludGVyZmFjZVR5cGUgPT0gXCJyZWNlcHRpdmVcIil7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5yZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1lbHNlIGlmKF9pbnRlcmZhY2VUeXBlID09IFwiZXhwcmVzc2l2ZVwiKXtcbiAgICAgICAgICAgICAgICAgICAgaWYobXNnLm9wID09IF9vcExhYmVsICYmIG1zZy5zdGF0dXNDb2RlID09IDIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5lcnJvciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QobXNnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTogYE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnN1YnNjcmliZShfaW50ZXJmYWNlLCBfbG9jYWxTb2NrZXROYW1lPVwiZ2xvYmFsXCIsIF90YXJnZXRNc2dMYWJlbCwgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLndlYnJlcXVlc3QoX2ludGVyZmFjZSlcbiAgICAgICAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgX2xvY2FsU29ja2V0ID0gTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0c1tfbG9jYWxTb2NrZXROYW1lXSB8fCBNdWZmaW4uUG9zdE9mZmljZS5zb2NrZXRzLmdsb2JhbDtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBgRVZFTlQ6Ojoke19pbnRlcmZhY2V9YCkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgX21zZ0xhYmVsID0gX3RhcmdldE1zZ0xhYmVsIHx8IG1zZy5vcDtcbiAgICAgICAgICAgICAgICAgICAgX2xvY2FsU29ja2V0LmRpc3BhdGNoTWVzc2FnZShfbXNnTGFiZWwsIG1zZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHRydWUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyBfZ2VuZXJhdGVUb2tlbihtZXNzYWdlLCBvcHRpb25zID0ge2FsZ286IFwiU0hBLTI1NlwifSkge1xuICAgICAgICBjb25zdCBtc2dCdWZmZXIgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUobWVzc2FnZSk7XG4gICAgICAgIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChvcHRpb25zLmFsZ28sIG1zZ0J1ZmZlcik7XG4gICAgICAgIGNvbnN0IGhhc2hBcnJheSA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcikpO1xuICAgICAgICByZXR1cm4gaGFzaEFycmF5Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJycpO1xuICAgIH1cblxuICAgIHN1YnNjcmliZVRvRXZlbnQoKSB7XG4gICAgICAgIGxldCBjYWxsYmFja0xpc3QgPSBbXTtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcbiAgICAgICAgY29uc3Qgbm90aWZpZXIgPSB7XG4gICAgICAgICAgICBub3RpZnk6IGZ1bmN0aW9uIChjYWxsYmFja0Z1bmN0aW9uLCBfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsKSB7XG4gICAgICAgICAgICAgICAgX3RoaXMuY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFja0xpc3QucHVzaCh7Y2FsbGJhY2tGdW5jdGlvbiwgX29wTGFiZWx9KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiKioqKioqKioqKioqKioqKiogQ2FsbGJhY2sgRXZlbnQgVGFibGUgKioqKioqKioqKioqKioqKioqKioqKioqXCIpXG4gICAgICAgICAgICAgICAgY29uc29sZS50YWJsZShjYWxsYmFja0xpc3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctZXZlbnRcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgZm9yIChsZXQgY2Igb2YgY2FsbGJhY2tMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gY2IuX29wTGFiZWwpXG4gICAgICAgICAgICAgICAgICAgIGNiLmNhbGxiYWNrRnVuY3Rpb24obXNnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuIG5vdGlmaWVyO1xuICAgIH1cblxuICAgIF9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbihfbXNnKSB7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50U3Vic2NyaXB0aW9ucy5hZGQoX25hbWUpO1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzW2BFVkVOVDo6OiR7X25hbWV9YF0gPSAwO1xuICAgICAgICBNdWZmaW4uUG9zdE9mZmljZS5zb2NrZXRzLmdsb2JhbC5icm9hZGNhc3RNc2coXCJzdWJzY3JpcHRpb24tY3JlYXRlZFwiLCBfbXNnKTtcbiAgICB9XG5cbiAgICBfY29ubmVjdEhvc3QoKSB7XG4gICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGluZyB3aXRoIGFwaSBob3N0YDtcblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGZhaWxlZDogJHtlLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1wOlwiLCBtc2cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25vcGVuID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uY2xvc2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGNsb3NlZGA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25tZXNzYWdlID0gKF9jb25uZWN0aW9uTXNnRXYpID0+IHsgLy9jdXN0b20gb25tZXNzYWdlIGZ1bmN0aW9ucyBjYW4gYmUgcHJvdmlkZWQgYnkgdGhlIGRldmVsb3Blci5cbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwiaW1wOlwiLCBcIi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cIixfY29ubmVjdGlvbk1zZ0V2KTtcbiAgICAgICAgICAgIHZhciBfbXNnU3RyID0gX2Nvbm5lY3Rpb25Nc2dFdi5kYXRhO1xuICAgICAgICAgICAgaWYgKF9tc2dTdHIgPT0gXCJyZXNwb25zZTpcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH0gLy9waW5nLXBvbmcgbWVzc2FnZXMgZXhjaGFuZ2VkIGluIGtlZXBBbGl2ZVxuICAgICAgICAgICAgdmFyIGV2ID0gbnVsbDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpO1xuICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtZXZlbnQtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgLy9ub3QgdmFsaWQgbXNnXG4gICAgICAgICAgICAgICAgdmFyIF9tc2cgPSB7ZXJyb3I6IGUsIGxhYmVsOiBgJHt0aGlzLm5hbWV9LW1lc3NhZ2UtZXJyb3JgfVxuICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KF9tc2cubGFiZWwsIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZXY7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uKFwiaW5jb21pbmctaG9zdGFnZW50LXJlc3BvbnNlLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgICAgICBpZiAobXNnLm9wLmluY2x1ZGVzKFwifHx8XCIpICYmIG1zZy5zdGF0dXNDb2RlID09IDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbihtc2cub3ApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aGlzLm9uKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uKFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzW21zZy5vcF0gKz0gMTtcbiAgICAgICAgICAgIC8vIHRoaXMudWlWYXJzLmhvc3RhZ2VudFJlc3BvbnNlTXNnTG9nRWwuYXBwZW5kQ2hpbGQodGFibGVIdG1sKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgb25Db25uZWN0KCkge1xuXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNdWZmaW47XG4iXSwibmFtZXMiOlsiTEVYSUNPTiIsIldlYk1lc3NhZ2UiLCJNdWZmaW4iLCJMZXhlbWUiLCJ1aWQiLCJzZW5kZXIiLCJwYXJhbXMiLCJzdWJqZWN0Iiwib2JqZWN0aXZlIiwiaW50ZXJmYWNlIiwidG9rZW4iLCJyZXF1ZXN0Iiwic3Vic2NyaWJlIiwiQVBJX0xFWElDT04iLCJXRUJfTUVTU0FHRV9MRVhJQ09OIiwiY29uZmlnIiwic2FuZGJveF9sb2NhbCIsImhvc3ROYW1lIiwicGF0aCIsImNoYW5uZWxJbnN0YW5jZVNpZyIsImFwaV9wcm90b2NvbCIsInNhbmRib3giLCJXZWJSZXF1ZXN0U2RrIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibGF6eWxvYWQiLCJldmVudEludGVyZmFjZSIsIlBvc3RPZmZpY2UiLCJnZXRPckNyZWF0ZUludGVyZmFjZSIsImxhYmVsIiwiY2xpZW50SWQiLCJjbGllbnRfaWQiLCJrZWVwQWxpdmVUaW1lb3V0IiwicGFzcyIsImNvbm5lY3RlZFN0b3JlcyIsInVpVmFycyIsImNsb2NrIiwiX2Nvbm5lY3Rpb24iLCJzdGF0ZSIsIl9jb25uZWN0aW9uQWxpdmUiLCJjb25uZWN0IiwiZXZlbnRTdWJzY3JpcHRpb25zIiwiU2V0IiwiZXZlbnRDb3VudGVycyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZmluYWxVcmwiLCJhZGRTb2NrZXQiLCJXZWJTb2NrZXQiLCJhdXRvUmV0cnlPbkNsb3NlIiwic29ja2V0Iiwib25lcnJvciIsImUiLCJtc2ciLCJtZXNzYWdlIiwiZGlzcGF0Y2hNZXNzYWdlIiwiY2FuY2VsS2VlcEFsaXZlIiwib25vcGVuIiwiX2tlZXBBbGl2ZSIsIm9uY2xvc2UiLCJvbm1lc3NhZ2UiLCJfbXNnU3RyIiwiZGF0YSIsIl9tc2ciLCJKU09OIiwicGFyc2UiLCJlcnJvciIsIm9wIiwiaW5jbHVkZXMiLCJzZXRJbnRlcnZhbCIsInNlbmQiLCJjbGVhckludGVydmFsIiwiZ2V0U2VyaWFsaXphYmxlSW50cm8iLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiX2xleGVtZSIsIl9zY2hlbWEiLCJzY2hlbWEiLCJmdWxsTmFtZSIsIm5hbWUiLCJnZXRJbnRybyIsIl9nZXRMZXhlbWUiLCJfbGV4ZW1lTGFiZWwiLCJfZmluZEFuZEluZmxlY3RMZXhlbWUiLCJjb25zb2xlIiwiX3NlbGVjdGVkTGV4ZW1lIiwiX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiIsImluZmxlY3QiLCJnZW5GaXh0dXJlcyIsInN0cmluZ2lmeSIsImNvbW11bmljYXRlIiwiaW5mbGVjdGlvbiIsInRlc3RTdGFydCIsIkRhdGUiLCJub3ciLCJfb3BMYWJlbCIsIk1BWF9SRVNQT05TRV9USU1FIiwib24iLCJyZXN1bHQiLCJzZXRUaW1lb3V0Iiwid2VicmVxdWVzdCIsIl9pbnRlcmZhY2UiLCJfcmVxdWVzdE1zZyIsIm9wTGFiZWwiLCJfaW50ZXJmYWNlVHlwZSIsIl93ZWJNc2ciLCJfZ2VuZXJhdGVUb2tlbiIsInN0YXR1c0NvZGUiLCJ3ZWJzdWJzY3JpYmUiLCJfbG9jYWxTb2NrZXROYW1lIiwiX3RhcmdldE1zZ0xhYmVsIiwiX2xvY2FsU29ja2V0Iiwic29ja2V0cyIsImdsb2JhbCIsIl9tc2dMYWJlbCIsImFsZ28iLCJtc2dCdWZmZXIiLCJUZXh0RW5jb2RlciIsImVuY29kZSIsImhhc2hCdWZmZXIiLCJjcnlwdG8iLCJzdWJ0bGUiLCJkaWdlc3QiLCJoYXNoQXJyYXkiLCJBcnJheSIsImZyb20iLCJVaW50OEFycmF5IiwiYiIsInRvU3RyaW5nIiwicGFkU3RhcnQiLCJqb2luIiwic3Vic2NyaWJlVG9FdmVudCIsImNhbGxiYWNrTGlzdCIsIl90aGlzIiwibm90aWZpZXIiLCJub3RpZnkiLCJjYWxsYmFja0Z1bmN0aW9uIiwicHVzaCIsImRlYnVnIiwidGFibGUiLCJjYiIsIl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbiIsImFkZCIsIl9uYW1lIiwiYnJvYWRjYXN0TXNnIiwiX2Nvbm5lY3RIb3N0IiwibG9nIiwiX2Nvbm5lY3Rpb25Nc2dFdiIsImV2IiwiQ3VzdG9tRXZlbnQiLCJkZXRhaWwiLCJvbkNvbm5lY3QiXSwibWFwcGluZ3MiOiI7Ozs7O0lBQUEsTUFBTUEsT0FBTyxHQUFHLEVBQWhCO0lBRUFBLE9BQU8sQ0FBQ0MsVUFBUixxQkFBcUIsY0FBY0MsTUFBTSxDQUFDQyxNQUFyQixDQUE0QixFQUFqRDtJQUFBO0lBQUE7SUFBQSxTQUNrQjtJQURsQjtJQUFBO0lBQUE7SUFBQSxTQUc0QjtJQUNwQkMsSUFBQUEsR0FBRyxFQUFFLElBRGU7SUFFcEJDLElBQUFBLE1BQU0sRUFBRSxJQUZZO0lBR3BCQyxJQUFBQSxNQUFNLEVBQUUsRUFIWTtJQUlwQkMsSUFBQUEsT0FBTyxFQUFFLElBSlc7SUFLcEJDLElBQUFBLFNBQVMsRUFBRTtJQUxTO0lBSDVCO0lBQUE7SUFBQTtJQUFBLFNBV29CO0lBQ1pDLElBQUFBLFNBQVMsRUFBRSxJQURDO0lBRVpDLElBQUFBLEtBQUssRUFBRSxJQUZLO0lBR1pDLElBQUFBLE9BQU8sRUFBRSxJQUhHO0lBSVpDLElBQUFBLFNBQVMsRUFBRTtJQUpDO0lBWHBCOztJQ0FBLE1BQU1DLFdBQVcsR0FBRyxFQUFDLEdBQUcsRUFBSjtJQUFRLEtBQUdDO0lB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
