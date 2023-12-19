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
        this.label = options.name || "sandbox_ws";
        this.clientId = options.client_id || "";
        this.token = options.token || "";
        this.keepAliveTimeout = options.keepAliveTimeout || 60000;
        this.uiVars = {
          clock: {}
        };

        if (options.label) {
          this.uiVars.config = config[options.label];
        } else if (options.config) {
          this.uiVars.config = options.config;
        } else {
          throw Error("Neither Config-Label Nor Custom-Config Provided");
        }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLmxhYmVsID0gb3B0aW9ucy5uYW1lIHx8IFwic2FuZGJveF93c1wiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5rZWVwQWxpdmVUaW1lb3V0ID0gb3B0aW9ucy5rZWVwQWxpdmVUaW1lb3V0IHx8IDYwMDAwO1xuICAgICAgICB0aGlzLnVpVmFycyA9IHtcbiAgICAgICAgICAgIGNsb2NrOiB7fVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmKG9wdGlvbnMubGFiZWwpIHtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmNvbmZpZyA9IGNvbmZpZ1tvcHRpb25zLmxhYmVsXTtcbiAgICAgICAgfSBlbHNlIGlmKG9wdGlvbnMuY29uZmlnKXtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmNvbmZpZyA9IG9wdGlvbnMuY29uZmlnO1xuICAgICAgICB9IGVsc2UgeyBcbiAgICAgICAgICAgIHRocm93IEVycm9yKFwiTmVpdGhlciBDb25maWctTGFiZWwgTm9yIEN1c3RvbS1Db25maWcgUHJvdmlkZWRcIik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX3NvY2tldFN0YXRlID0gMDsgLy8gMC0gbm90IGNvbm5lY3RlZCwgMS0gY29ubmVjdGVkLCAyLSBjb25uZWN0aW5nXG4gICAgfVxuXG4gICAgYXN5bmMgY29ubmVjdCgpIHtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRTdWJzY3JpcHRpb25zID0gbmV3IFNldChbXSk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnMgPSB7fTtcbiAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAyO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbmFsVXJsID0gdGhpcy51aVZhcnMuY29uZmlnLmFwaV9wcm90b2NvbCArIHRoaXMudWlWYXJzLmNvbmZpZy5ob3N0TmFtZSArIFwiL1wiICsgdGhpcy51aVZhcnMuY29uZmlnLnBhdGggKyBcIi9cIiArIHRoaXMuY2xpZW50SWQgKyBcIj9hdXRoPVwiICsgdGhpcy50b2tlblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IGV2ZW50LnRhcmdldDtcbiAgICAgICAgICAgICAgICB2YXIgbWVzc2FnZTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5yZWFkeVN0YXRlID09PSAzKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkNvbm5lY3Rpb24gaXMgQ2xvc2VkIG9yIENvdWxkIG5vdCBiZSBlc3RhYmxpc2hlZFwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkNvbm5lY3Rpb24gRmFpbGVkXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFUlJPUjogV1MtU2RrIG9uRXJyb3I6XCIsIGV2ZW50LCBtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBuZXcgRXJyb3IobWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FuY2VsS2VlcEFsaXZlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAwO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe3N0YXRlOiB0aGlzLl9zb2NrZXRTdGF0ZSwgbXNnOiBtZXNzYWdlfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjb25uZWN0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2tlZXBBbGl2ZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3NvY2tldFN0YXRlID0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7c3RhdGU6IHRoaXMuX3NvY2tldFN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmNsb3NlID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBDb25uZWN0aW9uIENsb3NlZCBCeSBzZXJ2ZXIgb3IgTmV0d29yayBsb3N0YDtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRVJST1I6IFdTLVNkayBvbkNsb3NlOlwiLCBldmVudCwgbXNnKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjbG9zZVwiLCBuZXcgRXJyb3IobXNnKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxLZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zb2NrZXRTdGF0ZSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9ubWVzc2FnZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIF9tc2dTdHIgPSBlLmRhdGE7XG4gICAgICAgICAgICAgICAgaWYgKGUuZGF0YSA9PT0gJ3BvbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpXG4gICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImFnZW50LWVycm9yXCIsIF9tc2cpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBbX21zZ10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJpbmNvbWluZy1tc2dcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLWV2ZW50XCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiaW5jb21pbmctbXNnXCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBfa2VlcEFsaXZlKCkge1xuICAgICAgICB0aGlzLmNhbmNlbEtlZXBBbGl2ZSgpO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uQWxpdmUgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoXCJwaW5nXCIpO1xuICAgICAgICB9LCB0aGlzLmtlZXBBbGl2ZVRpbWVvdXQpO1xuICAgIH1cblxuICAgIGNhbmNlbEtlZXBBbGl2ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9jb25uZWN0aW9uQWxpdmUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0U2VyaWFsaXphYmxlSW50cm8oKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLkxFWElDT04pLm1hcCgoX2xleGVtZSkgPT4ge1xuICAgICAgICAgICAgbGV0IF9zY2hlbWEgPSB0aGlzLkxFWElDT05bX2xleGVtZV0uc2NoZW1hLnJlcXVlc3QgfHwge307XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGxhYmVsOiBfbGV4ZW1lLFxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lOiB0aGlzLkxFWElDT05bX2xleGVtZV0ubmFtZSxcbiAgICAgICAgICAgICAgICBzY2hlbWE6IF9zY2hlbWFcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0SW50cm8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLkxFWElDT047XG4gICAgfVxuXG4gICAgX2dldExleGVtZShfbGV4ZW1lTGFiZWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTltfbGV4ZW1lTGFiZWxdO1xuICAgIH1cblxuICAgIF9maW5kQW5kSW5mbGVjdExleGVtZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgaWYgKCFfbGV4ZW1lTGFiZWwgfHwgIV9tc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgXCJJbnZhbGlkIFJlcXVlc3QuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZSA9IHRoaXMuX2dldExleGVtZShfbGV4ZW1lTGFiZWwpO1xuICAgICAgICBpZiAoIV9zZWxlY3RlZExleGVtZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIlVua25vd24gUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmIChfbXNnID09PSBcInJhbmRvbVwiKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uID0gX3NlbGVjdGVkTGV4ZW1lLmluZmxlY3Qoe30pO1xuICAgICAgICAgICAgICAgIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uZ2VuRml4dHVyZXMoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdChfbXNnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uLnN0cmluZ2lmeSgpO1xuICAgIH1cblxuICAgIGNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBsZXQgaW5mbGVjdGlvbiA9IHRoaXMuX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgIGlmICghaW5mbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudWlWYXJzLmNsb2NrLnRlc3RTdGFydCA9IERhdGUubm93KCkgLyAxMDAwO1xuICAgICAgICBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDEpIHtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChpbmZsZWN0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFUlJPUjogV1MtU2RrIGNvbW11bmljYXRlOlwiLCBcIlNvY2tldCBpcyBub3QgY29ubmVjdGVkXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgcmVxdWVzdChfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy53YWl0Rm9yU29ja2V0Q29ubmVjdGlvbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX3NvY2tldFN0YXRlICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IFwiU29ja2V0IGlzIG5vdCBjb25uZWN0ZWRcIn0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgaWYgKCFfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7bWVzc2FnZTogXCJNZXNzYWdlIHNlbnQuIE5vIHJlc3Bfb3AgcHJvdmlkZWQuXCJ9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiYWdlbnQtZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChtc2cpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTogYE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgd2VicmVxdWVzdChfaW50ZXJmYWNlLCBfcmVxdWVzdE1zZywgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGlmICghX2ludGVyZmFjZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe2Vycm9yOiBcIk5vIEludGVyZmFjZSBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikgJiYgIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCJ8fHxcIikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJJbnZhbGlkIEludGVyZmFjZSBwcm92aWRlZFwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfb3BMYWJlbCA9IG9wdGlvbnMub3BMYWJlbCB8fCBfaW50ZXJmYWNlO1xuXG4gICAgICAgICAgICB2YXIgX2ludGVyZmFjZVR5cGU7XG5cbiAgICAgICAgICAgIGlmIChfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcInJlY2VwdGl2ZVwiO1xuICAgICAgICAgICAgICAgIHZhciBfd2ViTXNnID0ge1xuICAgICAgICAgICAgICAgICAgICBcImludGVyZmFjZVwiOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInJlcXVlc3RcIjogX3JlcXVlc3RNc2csXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcImV4cHJlc3NpdmVcIjtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJzdWJzY3JpYmVcIjogX2ludGVyZmFjZSxcbiAgICAgICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0aGlzLl9nZW5lcmF0ZVRva2VuKF9pbnRlcmZhY2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKFwiV2ViTWVzc2FnZVwiLCBfd2ViTXNnKTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKF9pbnRlcmZhY2VUeXBlID09IFwicmVjZXB0aXZlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChfaW50ZXJmYWNlVHlwZSA9PSBcImV4cHJlc3NpdmVcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09IF9vcExhYmVsICYmIG1zZy5zdGF0dXNDb2RlID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImFnZW50LWVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IGBObyByZXNwb25zZSByZWNlaXZlZCBpbiAke29wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUgLyAxMDAwfXNgfSlcbiAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB3ZWJzdWJzY3JpYmUoX2ludGVyZmFjZSwgX2xvY2FsU29ja2V0TmFtZSA9IFwiZ2xvYmFsXCIsIF90YXJnZXRNc2dMYWJlbCwgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy53ZWJyZXF1ZXN0KF9pbnRlcmZhY2UpXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIF9sb2NhbFNvY2tldCA9IE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHNbX2xvY2FsU29ja2V0TmFtZV0gfHwgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWw7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1ldmVudFwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gYEVWRU5UOjo6JHtfaW50ZXJmYWNlfWApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IF9tc2dMYWJlbCA9IF90YXJnZXRNc2dMYWJlbCB8fCBtc2cub3A7XG4gICAgICAgICAgICAgICAgICAgIF9sb2NhbFNvY2tldC5kaXNwYXRjaE1lc3NhZ2UoX21zZ0xhYmVsLCBtc2cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgd2FpdEZvclNvY2tldENvbm5lY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgY29uc29sZS5kZWJ1ZyhcIldTLVNkayB3YWl0Rm9yU29ja2V0Q29ubmVjdGlvbjpcIiwgXCJXYWl0aW5nIGZvciBzb2NrZXQgY29ubmVjdGlvblwiKTtcbiAgICAgICAgc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2sgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDApIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJXUy1TZGsgd2FpdEZvclNvY2tldENvbm5lY3Rpb246XCIsIGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLndhaXRGb3JTb2NrZXRDb25uZWN0aW9uKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy53YWl0Rm9yU29ja2V0Q29ubmVjdGlvbihjYWxsYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDEwMDApXG4gICAgfVxuXG4gICAgYXN5bmMgX2dlbmVyYXRlVG9rZW4obWVzc2FnZSwgb3B0aW9ucyA9IHthbGdvOiBcIlNIQS0yNTZcIn0pIHtcbiAgICAgICAgY29uc3QgbXNnQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpO1xuICAgICAgICBjb25zdCBoYXNoQnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3Qob3B0aW9ucy5hbGdvLCBtc2dCdWZmZXIpO1xuICAgICAgICBjb25zdCBoYXNoQXJyYXkgPSBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGhhc2hCdWZmZXIpKTtcbiAgICAgICAgcmV0dXJuIGhhc2hBcnJheS5tYXAoYiA9PiBiLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpKS5qb2luKCcnKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVUb0V2ZW50KCkge1xuICAgICAgICBsZXQgY2FsbGJhY2tMaXN0ID0gW107XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIGNvbnN0IG5vdGlmaWVyID0ge1xuICAgICAgICAgICAgbm90aWZ5OiBmdW5jdGlvbiAoY2FsbGJhY2tGdW5jdGlvbiwgX2xleGVtZUxhYmVsLCBfbXNnLCBfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgIF90aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tMaXN0LnB1c2goe2NhbGxiYWNrRnVuY3Rpb24sIF9vcExhYmVsfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIioqKioqKioqKioqKioqKioqIENhbGxiYWNrIEV2ZW50IFRhYmxlICoqKioqKioqKioqKioqKioqKioqKioqKlwiKVxuICAgICAgICAgICAgICAgIGNvbnNvbGUudGFibGUoY2FsbGJhY2tMaXN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIGZvciAobGV0IGNiIG9mIGNhbGxiYWNrTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IGNiLl9vcExhYmVsKVxuICAgICAgICAgICAgICAgICAgICBjYi5jYWxsYmFja0Z1bmN0aW9uKG1zZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIHJldHVybiBub3RpZmllcjtcbiAgICB9XG5cbiAgICBfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24oX21zZykge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMuYWRkKF9uYW1lKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1tgRVZFTlQ6Ojoke19uYW1lfWBdID0gMDtcbiAgICAgICAgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWwuYnJvYWRjYXN0TXNnKFwic3Vic2NyaXB0aW9uLWNyZWF0ZWRcIiwgX21zZyk7XG4gICAgfVxuXG4gICAgX2Nvbm5lY3RIb3N0KCkge1xuICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpbmcgd2l0aCBhcGkgaG9zdGA7XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltcDpcIiwgbXNnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICB9XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ubWVzc2FnZSA9IChfY29ubmVjdGlvbk1zZ0V2KSA9PiB7IC8vY3VzdG9tIG9ubWVzc2FnZSBmdW5jdGlvbnMgY2FuIGJlIHByb3ZpZGVkIGJ5IHRoZSBkZXZlbG9wZXIuXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcImltcDpcIiwgXCItLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXCIsX2Nvbm5lY3Rpb25Nc2dFdik7XG4gICAgICAgICAgICB2YXIgX21zZ1N0ciA9IF9jb25uZWN0aW9uTXNnRXYuZGF0YTtcbiAgICAgICAgICAgIGlmIChfbXNnU3RyID09IFwicmVzcG9uc2U6XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IC8vcGluZy1wb25nIG1lc3NhZ2VzIGV4Y2hhbmdlZCBpbiBrZWVwQWxpdmVcbiAgICAgICAgICAgIHZhciBldiA9IG51bGw7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0gSlNPTi5wYXJzZShfbXNnU3RyKTtcbiAgICAgICAgICAgICAgICBpZiAoX21zZy5vcC5pbmNsdWRlcyhcIkVWRU5UOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8vbm90IHZhbGlkIG1zZ1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0ge2Vycm9yOiBlLCBsYWJlbDogYCR7dGhpcy5uYW1lfS1tZXNzYWdlLWVycm9yYH1cbiAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChfbXNnLmxhYmVsLCB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICAgICAgaWYgKG1zZy5vcC5pbmNsdWRlcyhcInx8fFwiKSAmJiBtc2cuc3RhdHVzQ29kZSA9PSAyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24obXNnLm9wKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vbigpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1ttc2cub3BdICs9IDE7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uQ29ubmVjdCgpIHtcblxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTXVmZmluO1xuIl0sIm5hbWVzIjpbIkxFWElDT04iLCJXZWJNZXNzYWdlIiwiTXVmZmluIiwiTGV4ZW1lIiwidWlkIiwic2VuZGVyIiwicGFyYW1zIiwic3ViamVjdCIsIm9iamVjdGl2ZSIsImludGVyZmFjZSIsInRva2VuIiwicmVxdWVzdCIsInN1YnNjcmliZSIsIkFQSV9MRVhJQ09OIiwiV0VCX01FU1NBR0VfTEVYSUNPTiIsImNvbmZpZyIsInNhbmRib3hfbG9jYWwiLCJob3N0TmFtZSIsInBhdGgiLCJjaGFubmVsSW5zdGFuY2VTaWciLCJhcGlfcHJvdG9jb2wiLCJzYW5kYm94IiwiV2ViUmVxdWVzdFNkayIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsImxhenlsb2FkIiwiZXZlbnRJbnRlcmZhY2UiLCJQb3N0T2ZmaWNlIiwiZ2V0T3JDcmVhdGVJbnRlcmZhY2UiLCJsYWJlbCIsIm5hbWUiLCJjbGllbnRJZCIsImNsaWVudF9pZCIsImtlZXBBbGl2ZVRpbWVvdXQiLCJ1aVZhcnMiLCJjbG9jayIsIkVycm9yIiwiX2Nvbm5lY3Rpb24iLCJzdGF0ZSIsIl9jb25uZWN0aW9uQWxpdmUiLCJfc29ja2V0U3RhdGUiLCJjb25uZWN0IiwiZXZlbnRTdWJzY3JpcHRpb25zIiwiU2V0IiwiZXZlbnRDb3VudGVycyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZmluYWxVcmwiLCJhZGRTb2NrZXQiLCJXZWJTb2NrZXQiLCJhdXRvUmV0cnlPbkNsb3NlIiwic29ja2V0Iiwib25lcnJvciIsImV2ZW50IiwidGFyZ2V0IiwibWVzc2FnZSIsInJlYWR5U3RhdGUiLCJjb25zb2xlIiwiZXJyb3IiLCJkaXNwYXRjaE1lc3NhZ2UiLCJjYW5jZWxLZWVwQWxpdmUiLCJtc2ciLCJvbm9wZW4iLCJlIiwiX2tlZXBBbGl2ZSIsIm9uY2xvc2UiLCJvbm1lc3NhZ2UiLCJfbXNnU3RyIiwiZGF0YSIsIl9tc2ciLCJKU09OIiwicGFyc2UiLCJvcCIsImluY2x1ZGVzIiwiZGVidWciLCJzZXRJbnRlcnZhbCIsInNlbmQiLCJjbGVhckludGVydmFsIiwiZ2V0U2VyaWFsaXphYmxlSW50cm8iLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiX2xleGVtZSIsIl9zY2hlbWEiLCJzY2hlbWEiLCJmdWxsTmFtZSIsImdldEludHJvIiwiX2dldExleGVtZSIsIl9sZXhlbWVMYWJlbCIsIl9maW5kQW5kSW5mbGVjdExleGVtZSIsIl9zZWxlY3RlZExleGVtZSIsIl9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24iLCJpbmZsZWN0IiwiZ2VuRml4dHVyZXMiLCJzdHJpbmdpZnkiLCJjb21tdW5pY2F0ZSIsImluZmxlY3Rpb24iLCJ0ZXN0U3RhcnQiLCJEYXRlIiwibm93IiwiX29wTGFiZWwiLCJNQVhfUkVTUE9OU0VfVElNRSIsIndhaXRGb3JTb2NrZXRDb25uZWN0aW9uIiwib24iLCJyZXN1bHQiLCJzZXRUaW1lb3V0Iiwid2VicmVxdWVzdCIsIl9pbnRlcmZhY2UiLCJfcmVxdWVzdE1zZyIsIm9wTGFiZWwiLCJfaW50ZXJmYWNlVHlwZSIsIl93ZWJNc2ciLCJfZ2VuZXJhdGVUb2tlbiIsInN0YXR1c0NvZGUiLCJ3ZWJzdWJzY3JpYmUiLCJfbG9jYWxTb2NrZXROYW1lIiwiX3RhcmdldE1zZ0xhYmVsIiwiX2xvY2FsU29ja2V0Iiwic29ja2V0cyIsImdsb2JhbCIsIl9tc2dMYWJlbCIsImNhbGxiYWNrIiwiYWxnbyIsIm1zZ0J1ZmZlciIsIlRleHRFbmNvZGVyIiwiZW5jb2RlIiwiaGFzaEJ1ZmZlciIsImNyeXB0byIsInN1YnRsZSIsImRpZ2VzdCIsImhhc2hBcnJheSIsIkFycmF5IiwiZnJvbSIsIlVpbnQ4QXJyYXkiLCJiIiwidG9TdHJpbmciLCJwYWRTdGFydCIsImpvaW4iLCJzdWJzY3JpYmVUb0V2ZW50IiwiY2FsbGJhY2tMaXN0IiwiX3RoaXMiLCJub3RpZmllciIsIm5vdGlmeSIsImNhbGxiYWNrRnVuY3Rpb24iLCJwdXNoIiwidGFibGUiLCJjYiIsIl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbiIsImFkZCIsIl9uYW1lIiwiYnJvYWRjYXN0TXNnIiwiX2Nvbm5lY3RIb3N0IiwibG9nIiwiX2Nvbm5lY3Rpb25Nc2dFdiIsImV2IiwiQ3VzdG9tRXZlbnQiLCJkZXRhaWwiLCJvbkNvbm5lY3QiXSwibWFwcGluZ3MiOiI7Ozs7O0lBQUEsTUFBTUEsT0FBTyxHQUFHLEVBQWhCO0lBRUFBLE9BQU8sQ0FBQ0MsVUFBUixxQkFBcUIsY0FBY0MsTUFBTSxDQUFDQyxNQUFyQixDQUE0QixFQUFqRDtJQUFBO0lBQUE7SUFBQSxTQUNrQjtJQURsQjtJQUFBO0lBQUE7SUFBQSxTQUc0QjtJQUNwQkMsSUFBQUEsR0FBRyxFQUFFLElBRGU7SUFFcEJDLElBQUFBLE1BQU0sRUFBRSxJQUZZO0lBR3BCQyxJQUFBQSxNQUFNLEVBQUUsRUFIWTtJQUlwQkMsSUFBQUEsT0FBTyxFQUFFLElBSlc7SUFLcEJDLElBQUFBLFNBQVMsRUFBRTtJQUxTO0lBSDVCO0lBQUE7SUFBQTtJQUFBLFNBV29CO0lBQ1pDLElBQUFBLFNBQVMsRUFBRSxJQURD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
