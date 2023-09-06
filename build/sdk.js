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
          this.uiVars.config = config[options.config];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLmxhYmVsID0gb3B0aW9ucy5uYW1lIHx8IFwic2FuZGJveF93c1wiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5rZWVwQWxpdmVUaW1lb3V0ID0gb3B0aW9ucy5rZWVwQWxpdmVUaW1lb3V0IHx8IDYwMDAwO1xuICAgICAgICB0aGlzLnVpVmFycyA9IHtcbiAgICAgICAgICAgIGNsb2NrOiB7fVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmKG9wdGlvbnMubGFiZWwpIHtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmNvbmZpZyA9IGNvbmZpZ1tvcHRpb25zLmxhYmVsXVxuICAgICAgICB9IGVsc2UgaWYob3B0aW9ucy5jb25maWcpe1xuICAgICAgICAgICAgdGhpcy51aVZhcnMuY29uZmlnID0gY29uZmlnW29wdGlvbnMuY29uZmlnXVxuICAgICAgICB9IGVsc2UgeyBcbiAgICAgICAgICAgIHRocm93IEVycm9yKFwiTmVpdGhlciBDb25maWctTGFiZWwgTm9yIEN1c3RvbS1Db25maWcgUHJvdmlkZWRcIik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX3NvY2tldFN0YXRlID0gMDsgLy8gMC0gbm90IGNvbm5lY3RlZCwgMS0gY29ubmVjdGVkLCAyLSBjb25uZWN0aW5nXG4gICAgfVxuXG4gICAgYXN5bmMgY29ubmVjdCgpIHtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRTdWJzY3JpcHRpb25zID0gbmV3IFNldChbXSk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnMgPSB7fTtcbiAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAyO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbmFsVXJsID0gdGhpcy51aVZhcnMuY29uZmlnLmFwaV9wcm90b2NvbCArIHRoaXMudWlWYXJzLmNvbmZpZy5ob3N0TmFtZSArIFwiL1wiICsgdGhpcy51aVZhcnMuY29uZmlnLnBhdGggKyBcIi9cIiArIHRoaXMuY2xpZW50SWQgKyBcIj9hdXRoPVwiICsgdGhpcy50b2tlblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IGV2ZW50LnRhcmdldDtcbiAgICAgICAgICAgICAgICB2YXIgbWVzc2FnZTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5yZWFkeVN0YXRlID09PSAzKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkNvbm5lY3Rpb24gaXMgQ2xvc2VkIG9yIENvdWxkIG5vdCBiZSBlc3RhYmxpc2hlZFwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkNvbm5lY3Rpb24gRmFpbGVkXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFUlJPUjogV1MtU2RrIG9uRXJyb3I6XCIsIGV2ZW50LCBtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBuZXcgRXJyb3IobWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FuY2VsS2VlcEFsaXZlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAwO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe3N0YXRlOiB0aGlzLl9zb2NrZXRTdGF0ZSwgbXNnOiBtZXNzYWdlfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjb25uZWN0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2tlZXBBbGl2ZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3NvY2tldFN0YXRlID0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7c3RhdGU6IHRoaXMuX3NvY2tldFN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmNsb3NlID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBDb25uZWN0aW9uIENsb3NlZCBCeSBzZXJ2ZXIgb3IgTmV0d29yayBsb3N0YDtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRVJST1I6IFdTLVNkayBvbkNsb3NlOlwiLCBldmVudCwgbXNnKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjbG9zZVwiLCBuZXcgRXJyb3IobXNnKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxLZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zb2NrZXRTdGF0ZSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9ubWVzc2FnZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIF9tc2dTdHIgPSBlLmRhdGE7XG4gICAgICAgICAgICAgICAgaWYgKGUuZGF0YSA9PT0gJ3BvbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpXG4gICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImFnZW50LWVycm9yXCIsIF9tc2cpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBbX21zZ10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJpbmNvbWluZy1tc2dcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLWV2ZW50XCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiaW5jb21pbmctbXNnXCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBfa2VlcEFsaXZlKCkge1xuICAgICAgICB0aGlzLmNhbmNlbEtlZXBBbGl2ZSgpO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uQWxpdmUgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoXCJwaW5nXCIpO1xuICAgICAgICB9LCB0aGlzLmtlZXBBbGl2ZVRpbWVvdXQpO1xuICAgIH1cblxuICAgIGNhbmNlbEtlZXBBbGl2ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9jb25uZWN0aW9uQWxpdmUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0U2VyaWFsaXphYmxlSW50cm8oKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLkxFWElDT04pLm1hcCgoX2xleGVtZSkgPT4ge1xuICAgICAgICAgICAgbGV0IF9zY2hlbWEgPSB0aGlzLkxFWElDT05bX2xleGVtZV0uc2NoZW1hLnJlcXVlc3QgfHwge307XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGxhYmVsOiBfbGV4ZW1lLFxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lOiB0aGlzLkxFWElDT05bX2xleGVtZV0ubmFtZSxcbiAgICAgICAgICAgICAgICBzY2hlbWE6IF9zY2hlbWFcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0SW50cm8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLkxFWElDT047XG4gICAgfVxuXG4gICAgX2dldExleGVtZShfbGV4ZW1lTGFiZWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTltfbGV4ZW1lTGFiZWxdO1xuICAgIH1cblxuICAgIF9maW5kQW5kSW5mbGVjdExleGVtZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgaWYgKCFfbGV4ZW1lTGFiZWwgfHwgIV9tc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgXCJJbnZhbGlkIFJlcXVlc3QuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZSA9IHRoaXMuX2dldExleGVtZShfbGV4ZW1lTGFiZWwpO1xuICAgICAgICBpZiAoIV9zZWxlY3RlZExleGVtZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIlVua25vd24gUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmIChfbXNnID09PSBcInJhbmRvbVwiKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uID0gX3NlbGVjdGVkTGV4ZW1lLmluZmxlY3Qoe30pO1xuICAgICAgICAgICAgICAgIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uZ2VuRml4dHVyZXMoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdChfbXNnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uLnN0cmluZ2lmeSgpO1xuICAgIH1cblxuICAgIGNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBsZXQgaW5mbGVjdGlvbiA9IHRoaXMuX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgIGlmICghaW5mbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudWlWYXJzLmNsb2NrLnRlc3RTdGFydCA9IERhdGUubm93KCkgLyAxMDAwO1xuICAgICAgICBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDEpIHtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChpbmZsZWN0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFUlJPUjogV1MtU2RrIGNvbW11bmljYXRlOlwiLCBcIlNvY2tldCBpcyBub3QgY29ubmVjdGVkXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgcmVxdWVzdChfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy53YWl0Rm9yU29ja2V0Q29ubmVjdGlvbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX3NvY2tldFN0YXRlICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IFwiU29ja2V0IGlzIG5vdCBjb25uZWN0ZWRcIn0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgaWYgKCFfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7bWVzc2FnZTogXCJNZXNzYWdlIHNlbnQuIE5vIHJlc3Bfb3AgcHJvdmlkZWQuXCJ9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiYWdlbnQtZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChtc2cpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTogYE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgd2VicmVxdWVzdChfaW50ZXJmYWNlLCBfcmVxdWVzdE1zZywgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGlmICghX2ludGVyZmFjZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe2Vycm9yOiBcIk5vIEludGVyZmFjZSBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikgJiYgIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCJ8fHxcIikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJJbnZhbGlkIEludGVyZmFjZSBwcm92aWRlZFwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfb3BMYWJlbCA9IG9wdGlvbnMub3BMYWJlbCB8fCBfaW50ZXJmYWNlO1xuXG4gICAgICAgICAgICB2YXIgX2ludGVyZmFjZVR5cGU7XG5cbiAgICAgICAgICAgIGlmIChfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcInJlY2VwdGl2ZVwiO1xuICAgICAgICAgICAgICAgIHZhciBfd2ViTXNnID0ge1xuICAgICAgICAgICAgICAgICAgICBcImludGVyZmFjZVwiOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInJlcXVlc3RcIjogX3JlcXVlc3RNc2csXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcImV4cHJlc3NpdmVcIjtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJzdWJzY3JpYmVcIjogX2ludGVyZmFjZSxcbiAgICAgICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0aGlzLl9nZW5lcmF0ZVRva2VuKF9pbnRlcmZhY2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKFwiV2ViTWVzc2FnZVwiLCBfd2ViTXNnKTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKF9pbnRlcmZhY2VUeXBlID09IFwicmVjZXB0aXZlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChfaW50ZXJmYWNlVHlwZSA9PSBcImV4cHJlc3NpdmVcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09IF9vcExhYmVsICYmIG1zZy5zdGF0dXNDb2RlID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IGBObyByZXNwb25zZSByZWNlaXZlZCBpbiAke29wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUgLyAxMDAwfXNgfSlcbiAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB3ZWJzdWJzY3JpYmUoX2ludGVyZmFjZSwgX2xvY2FsU29ja2V0TmFtZSA9IFwiZ2xvYmFsXCIsIF90YXJnZXRNc2dMYWJlbCwgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy53ZWJyZXF1ZXN0KF9pbnRlcmZhY2UpXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIF9sb2NhbFNvY2tldCA9IE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHNbX2xvY2FsU29ja2V0TmFtZV0gfHwgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWw7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1ldmVudFwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gYEVWRU5UOjo6JHtfaW50ZXJmYWNlfWApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IF9tc2dMYWJlbCA9IF90YXJnZXRNc2dMYWJlbCB8fCBtc2cub3A7XG4gICAgICAgICAgICAgICAgICAgIF9sb2NhbFNvY2tldC5kaXNwYXRjaE1lc3NhZ2UoX21zZ0xhYmVsLCBtc2cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgd2FpdEZvclNvY2tldENvbm5lY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgY29uc29sZS5kZWJ1ZyhcIldTLVNkayB3YWl0Rm9yU29ja2V0Q29ubmVjdGlvbjpcIiwgXCJXYWl0aW5nIGZvciBzb2NrZXQgY29ubmVjdGlvblwiKTtcbiAgICAgICAgc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2sgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDApIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJXUy1TZGsgd2FpdEZvclNvY2tldENvbm5lY3Rpb246XCIsIGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLndhaXRGb3JTb2NrZXRDb25uZWN0aW9uKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy53YWl0Rm9yU29ja2V0Q29ubmVjdGlvbihjYWxsYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDEwMDApXG4gICAgfVxuXG4gICAgYXN5bmMgX2dlbmVyYXRlVG9rZW4obWVzc2FnZSwgb3B0aW9ucyA9IHthbGdvOiBcIlNIQS0yNTZcIn0pIHtcbiAgICAgICAgY29uc3QgbXNnQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpO1xuICAgICAgICBjb25zdCBoYXNoQnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3Qob3B0aW9ucy5hbGdvLCBtc2dCdWZmZXIpO1xuICAgICAgICBjb25zdCBoYXNoQXJyYXkgPSBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGhhc2hCdWZmZXIpKTtcbiAgICAgICAgcmV0dXJuIGhhc2hBcnJheS5tYXAoYiA9PiBiLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpKS5qb2luKCcnKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVUb0V2ZW50KCkge1xuICAgICAgICBsZXQgY2FsbGJhY2tMaXN0ID0gW107XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIGNvbnN0IG5vdGlmaWVyID0ge1xuICAgICAgICAgICAgbm90aWZ5OiBmdW5jdGlvbiAoY2FsbGJhY2tGdW5jdGlvbiwgX2xleGVtZUxhYmVsLCBfbXNnLCBfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgIF90aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tMaXN0LnB1c2goe2NhbGxiYWNrRnVuY3Rpb24sIF9vcExhYmVsfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIioqKioqKioqKioqKioqKioqIENhbGxiYWNrIEV2ZW50IFRhYmxlICoqKioqKioqKioqKioqKioqKioqKioqKlwiKVxuICAgICAgICAgICAgICAgIGNvbnNvbGUudGFibGUoY2FsbGJhY2tMaXN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIGZvciAobGV0IGNiIG9mIGNhbGxiYWNrTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IGNiLl9vcExhYmVsKVxuICAgICAgICAgICAgICAgICAgICBjYi5jYWxsYmFja0Z1bmN0aW9uKG1zZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIHJldHVybiBub3RpZmllcjtcbiAgICB9XG5cbiAgICBfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24oX21zZykge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMuYWRkKF9uYW1lKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1tgRVZFTlQ6Ojoke19uYW1lfWBdID0gMDtcbiAgICAgICAgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWwuYnJvYWRjYXN0TXNnKFwic3Vic2NyaXB0aW9uLWNyZWF0ZWRcIiwgX21zZyk7XG4gICAgfVxuXG4gICAgX2Nvbm5lY3RIb3N0KCkge1xuICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpbmcgd2l0aCBhcGkgaG9zdGA7XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltcDpcIiwgbXNnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICB9XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ubWVzc2FnZSA9IChfY29ubmVjdGlvbk1zZ0V2KSA9PiB7IC8vY3VzdG9tIG9ubWVzc2FnZSBmdW5jdGlvbnMgY2FuIGJlIHByb3ZpZGVkIGJ5IHRoZSBkZXZlbG9wZXIuXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcImltcDpcIiwgXCItLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXCIsX2Nvbm5lY3Rpb25Nc2dFdik7XG4gICAgICAgICAgICB2YXIgX21zZ1N0ciA9IF9jb25uZWN0aW9uTXNnRXYuZGF0YTtcbiAgICAgICAgICAgIGlmIChfbXNnU3RyID09IFwicmVzcG9uc2U6XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IC8vcGluZy1wb25nIG1lc3NhZ2VzIGV4Y2hhbmdlZCBpbiBrZWVwQWxpdmVcbiAgICAgICAgICAgIHZhciBldiA9IG51bGw7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0gSlNPTi5wYXJzZShfbXNnU3RyKTtcbiAgICAgICAgICAgICAgICBpZiAoX21zZy5vcC5pbmNsdWRlcyhcIkVWRU5UOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8vbm90IHZhbGlkIG1zZ1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0ge2Vycm9yOiBlLCBsYWJlbDogYCR7dGhpcy5uYW1lfS1tZXNzYWdlLWVycm9yYH1cbiAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChfbXNnLmxhYmVsLCB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICAgICAgaWYgKG1zZy5vcC5pbmNsdWRlcyhcInx8fFwiKSAmJiBtc2cuc3RhdHVzQ29kZSA9PSAyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24obXNnLm9wKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vbigpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1ttc2cub3BdICs9IDE7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uQ29ubmVjdCgpIHtcblxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTXVmZmluO1xuIl0sIm5hbWVzIjpbIkxFWElDT04iLCJXZWJNZXNzYWdlIiwiTXVmZmluIiwiTGV4ZW1lIiwidWlkIiwic2VuZGVyIiwicGFyYW1zIiwic3ViamVjdCIsIm9iamVjdGl2ZSIsImludGVyZmFjZSIsInRva2VuIiwicmVxdWVzdCIsInN1YnNjcmliZSIsIkFQSV9MRVhJQ09OIiwiV0VCX01FU1NBR0VfTEVYSUNPTiIsImNvbmZpZyIsInNhbmRib3hfbG9jYWwiLCJob3N0TmFtZSIsInBhdGgiLCJjaGFubmVsSW5zdGFuY2VTaWciLCJhcGlfcHJvdG9jb2wiLCJzYW5kYm94IiwiV2ViUmVxdWVzdFNkayIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsImxhenlsb2FkIiwiZXZlbnRJbnRlcmZhY2UiLCJQb3N0T2ZmaWNlIiwiZ2V0T3JDcmVhdGVJbnRlcmZhY2UiLCJsYWJlbCIsIm5hbWUiLCJjbGllbnRJZCIsImNsaWVudF9pZCIsImtlZXBBbGl2ZVRpbWVvdXQiLCJ1aVZhcnMiLCJjbG9jayIsIkVycm9yIiwiX2Nvbm5lY3Rpb24iLCJzdGF0ZSIsIl9jb25uZWN0aW9uQWxpdmUiLCJfc29ja2V0U3RhdGUiLCJjb25uZWN0IiwiZXZlbnRTdWJzY3JpcHRpb25zIiwiU2V0IiwiZXZlbnRDb3VudGVycyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZmluYWxVcmwiLCJhZGRTb2NrZXQiLCJXZWJTb2NrZXQiLCJhdXRvUmV0cnlPbkNsb3NlIiwic29ja2V0Iiwib25lcnJvciIsImV2ZW50IiwidGFyZ2V0IiwibWVzc2FnZSIsInJlYWR5U3RhdGUiLCJjb25zb2xlIiwiZXJyb3IiLCJkaXNwYXRjaE1lc3NhZ2UiLCJjYW5jZWxLZWVwQWxpdmUiLCJtc2ciLCJvbm9wZW4iLCJlIiwiX2tlZXBBbGl2ZSIsIm9uY2xvc2UiLCJvbm1lc3NhZ2UiLCJfbXNnU3RyIiwiZGF0YSIsIl9tc2ciLCJKU09OIiwicGFyc2UiLCJvcCIsImluY2x1ZGVzIiwiZGVidWciLCJzZXRJbnRlcnZhbCIsInNlbmQiLCJjbGVhckludGVydmFsIiwiZ2V0U2VyaWFsaXphYmxlSW50cm8iLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiX2xleGVtZSIsIl9zY2hlbWEiLCJzY2hlbWEiLCJmdWxsTmFtZSIsImdldEludHJvIiwiX2dldExleGVtZSIsIl9sZXhlbWVMYWJlbCIsIl9maW5kQW5kSW5mbGVjdExleGVtZSIsIl9zZWxlY3RlZExleGVtZSIsIl9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24iLCJpbmZsZWN0IiwiZ2VuRml4dHVyZXMiLCJzdHJpbmdpZnkiLCJjb21tdW5pY2F0ZSIsImluZmxlY3Rpb24iLCJ0ZXN0U3RhcnQiLCJEYXRlIiwibm93IiwiX29wTGFiZWwiLCJNQVhfUkVTUE9OU0VfVElNRSIsIndhaXRGb3JTb2NrZXRDb25uZWN0aW9uIiwib24iLCJyZXN1bHQiLCJzZXRUaW1lb3V0Iiwid2VicmVxdWVzdCIsIl9pbnRlcmZhY2UiLCJfcmVxdWVzdE1zZyIsIm9wTGFiZWwiLCJfaW50ZXJmYWNlVHlwZSIsIl93ZWJNc2ciLCJfZ2VuZXJhdGVUb2tlbiIsInN0YXR1c0NvZGUiLCJ3ZWJzdWJzY3JpYmUiLCJfbG9jYWxTb2NrZXROYW1lIiwiX3RhcmdldE1zZ0xhYmVsIiwiX2xvY2FsU29ja2V0Iiwic29ja2V0cyIsImdsb2JhbCIsIl9tc2dMYWJlbCIsImNhbGxiYWNrIiwiYWxnbyIsIm1zZ0J1ZmZlciIsIlRleHRFbmNvZGVyIiwiZW5jb2RlIiwiaGFzaEJ1ZmZlciIsImNyeXB0byIsInN1YnRsZSIsImRpZ2VzdCIsImhhc2hBcnJheSIsIkFycmF5IiwiZnJvbSIsIlVpbnQ4QXJyYXkiLCJiIiwidG9TdHJpbmciLCJwYWRTdGFydCIsImpvaW4iLCJzdWJzY3JpYmVUb0V2ZW50IiwiY2FsbGJhY2tMaXN0IiwiX3RoaXMiLCJub3RpZmllciIsIm5vdGlmeSIsImNhbGxiYWNrRnVuY3Rpb24iLCJwdXNoIiwidGFibGUiLCJjYiIsIl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbiIsImFkZCIsIl9uYW1lIiwiYnJvYWRjYXN0TXNnIiwiX2Nvbm5lY3RIb3N0IiwibG9nIiwiX2Nvbm5lY3Rpb25Nc2dFdiIsImV2IiwiQ3VzdG9tRXZlbnQiLCJkZXRhaWwiLCJvbkNvbm5lY3QiXSwibWFwcGluZ3MiOiI7Ozs7O0lBQUEsTUFBTUEsT0FBTyxHQUFHLEVBQWhCO0lBRUFBLE9BQU8sQ0FBQ0MsVUFBUixxQkFBcUIsY0FBY0MsTUFBTSxDQUFDQyxNQUFyQixDQUE0QixFQUFqRDtJQUFBO0lBQUE7SUFBQSxTQUNrQjtJQURsQjtJQUFBO0lBQUE7SUFBQSxTQUc0QjtJQUNwQkMsSUFBQUEsR0FBRyxFQUFFLElBRGU7SUFFcEJDLElBQUFBLE1BQU0sRUFBRSxJQUZZO0lBR3BCQyxJQUFBQSxNQUFNLEVBQUUsRUFIWTtJQUlwQkMsSUFBQUEsT0FBTyxFQUFFLElBSlc7SUFLcEJDLElBQUFBLFNBQVMsRUFBRTtJQUxTO0lBSDVCO0lBQUE7SUFBQTtJQUFBLFNBV29CO0lBQ1pDLElBQUFBLFNBQVMsRUFBRSxJQURD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
