var abstraction_sdk = (function () {
    'use strict';

    var _class;
    const LEXICON = {};
    LEXICON.WebMessage = (_class = class extends Muffin.Lexeme {}, Object.defineProperty(_class, "name", {
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
    }), _class);

    const API_LEXICON = {
      ...{},
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
          this.uiVars.eventCounters[msg.op] += 1;
          // this.uiVars.hostagentResponseMsgLogEl.appendChild(tableHtml);
        });
      }
      onConnect() {}
    };

    return Muffin;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLmxhYmVsID0gb3B0aW9ucy5uYW1lIHx8IFwic2FuZGJveF93c1wiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5rZWVwQWxpdmVUaW1lb3V0ID0gb3B0aW9ucy5rZWVwQWxpdmVUaW1lb3V0IHx8IDYwMDAwO1xuICAgICAgICB0aGlzLnVpVmFycyA9IHtcbiAgICAgICAgICAgIGNsb2NrOiB7fVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmKG9wdGlvbnMubGFiZWwpIHtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmNvbmZpZyA9IGNvbmZpZ1tvcHRpb25zLmxhYmVsXTtcbiAgICAgICAgfSBlbHNlIGlmKG9wdGlvbnMuY29uZmlnKXtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmNvbmZpZyA9IG9wdGlvbnMuY29uZmlnO1xuICAgICAgICB9IGVsc2UgeyBcbiAgICAgICAgICAgIHRocm93IEVycm9yKFwiTmVpdGhlciBDb25maWctTGFiZWwgTm9yIEN1c3RvbS1Db25maWcgUHJvdmlkZWRcIik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSA9IG51bGw7XG4gICAgICAgIHRoaXMuX3NvY2tldFN0YXRlID0gMDsgLy8gMC0gbm90IGNvbm5lY3RlZCwgMS0gY29ubmVjdGVkLCAyLSBjb25uZWN0aW5nXG4gICAgfVxuXG4gICAgYXN5bmMgY29ubmVjdCgpIHtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRTdWJzY3JpcHRpb25zID0gbmV3IFNldChbXSk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnMgPSB7fTtcbiAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAyO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbmFsVXJsID0gdGhpcy51aVZhcnMuY29uZmlnLmFwaV9wcm90b2NvbCArIHRoaXMudWlWYXJzLmNvbmZpZy5ob3N0TmFtZSArIFwiL1wiICsgdGhpcy51aVZhcnMuY29uZmlnLnBhdGggKyBcIi9cIiArIHRoaXMuY2xpZW50SWQgKyBcIj9hdXRoPVwiICsgdGhpcy50b2tlblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IGV2ZW50LnRhcmdldDtcbiAgICAgICAgICAgICAgICB2YXIgbWVzc2FnZTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5yZWFkeVN0YXRlID09PSAzKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkNvbm5lY3Rpb24gaXMgQ2xvc2VkIG9yIENvdWxkIG5vdCBiZSBlc3RhYmxpc2hlZFwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkNvbm5lY3Rpb24gRmFpbGVkXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFUlJPUjogV1MtU2RrIG9uRXJyb3I6XCIsIGV2ZW50LCBtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBuZXcgRXJyb3IobWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FuY2VsS2VlcEFsaXZlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc29ja2V0U3RhdGUgPSAwO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe3N0YXRlOiB0aGlzLl9zb2NrZXRTdGF0ZSwgbXNnOiBtZXNzYWdlfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjb25uZWN0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2tlZXBBbGl2ZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3NvY2tldFN0YXRlID0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7c3RhdGU6IHRoaXMuX3NvY2tldFN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmNsb3NlID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBDb25uZWN0aW9uIENsb3NlZCBCeSBzZXJ2ZXIgb3IgTmV0d29yayBsb3N0YDtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRVJST1I6IFdTLVNkayBvbkNsb3NlOlwiLCBldmVudCwgbXNnKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjbG9zZVwiLCBuZXcgRXJyb3IobXNnKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxLZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zb2NrZXRTdGF0ZSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9ubWVzc2FnZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIF9tc2dTdHIgPSBlLmRhdGE7XG4gICAgICAgICAgICAgICAgaWYgKGUuZGF0YSA9PT0gJ3BvbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpXG4gICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImFnZW50LWVycm9yXCIsIF9tc2cpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBbX21zZ10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJpbmNvbWluZy1tc2dcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLWV2ZW50XCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiaW5jb21pbmctbXNnXCIsIF9tc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBfa2VlcEFsaXZlKCkge1xuICAgICAgICB0aGlzLmNhbmNlbEtlZXBBbGl2ZSgpO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uQWxpdmUgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoXCJwaW5nXCIpO1xuICAgICAgICB9LCB0aGlzLmtlZXBBbGl2ZVRpbWVvdXQpO1xuICAgIH1cblxuICAgIGNhbmNlbEtlZXBBbGl2ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9jb25uZWN0aW9uQWxpdmUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0U2VyaWFsaXphYmxlSW50cm8oKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLkxFWElDT04pLm1hcCgoX2xleGVtZSkgPT4ge1xuICAgICAgICAgICAgbGV0IF9zY2hlbWEgPSB0aGlzLkxFWElDT05bX2xleGVtZV0uc2NoZW1hLnJlcXVlc3QgfHwge307XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGxhYmVsOiBfbGV4ZW1lLFxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lOiB0aGlzLkxFWElDT05bX2xleGVtZV0ubmFtZSxcbiAgICAgICAgICAgICAgICBzY2hlbWE6IF9zY2hlbWFcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0SW50cm8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLkxFWElDT047XG4gICAgfVxuXG4gICAgX2dldExleGVtZShfbGV4ZW1lTGFiZWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTltfbGV4ZW1lTGFiZWxdO1xuICAgIH1cblxuICAgIF9maW5kQW5kSW5mbGVjdExleGVtZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgaWYgKCFfbGV4ZW1lTGFiZWwgfHwgIV9tc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgXCJJbnZhbGlkIFJlcXVlc3QuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZSA9IHRoaXMuX2dldExleGVtZShfbGV4ZW1lTGFiZWwpO1xuICAgICAgICBpZiAoIV9zZWxlY3RlZExleGVtZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIlVua25vd24gUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmIChfbXNnID09PSBcInJhbmRvbVwiKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uID0gX3NlbGVjdGVkTGV4ZW1lLmluZmxlY3Qoe30pO1xuICAgICAgICAgICAgICAgIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uZ2VuRml4dHVyZXMoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdChfbXNnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uLnN0cmluZ2lmeSgpO1xuICAgIH1cblxuICAgIGNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBsZXQgaW5mbGVjdGlvbiA9IHRoaXMuX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgIGlmICghaW5mbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudWlWYXJzLmNsb2NrLnRlc3RTdGFydCA9IERhdGUubm93KCkgLyAxMDAwO1xuICAgICAgICBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDEpIHtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChpbmZsZWN0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFUlJPUjogV1MtU2RrIGNvbW11bmljYXRlOlwiLCBcIlNvY2tldCBpcyBub3QgY29ubmVjdGVkXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgcmVxdWVzdChfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy53YWl0Rm9yU29ja2V0Q29ubmVjdGlvbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX3NvY2tldFN0YXRlICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IFwiU29ja2V0IGlzIG5vdCBjb25uZWN0ZWRcIn0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgaWYgKCFfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7bWVzc2FnZTogXCJNZXNzYWdlIHNlbnQuIE5vIHJlc3Bfb3AgcHJvdmlkZWQuXCJ9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiYWdlbnQtZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChtc2cpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTogYE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgd2VicmVxdWVzdChfaW50ZXJmYWNlLCBfcmVxdWVzdE1zZywgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGlmICghX2ludGVyZmFjZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe2Vycm9yOiBcIk5vIEludGVyZmFjZSBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikgJiYgIV9pbnRlcmZhY2UuaW5jbHVkZXMoXCJ8fHxcIikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJJbnZhbGlkIEludGVyZmFjZSBwcm92aWRlZFwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfb3BMYWJlbCA9IG9wdGlvbnMub3BMYWJlbCB8fCBfaW50ZXJmYWNlO1xuXG4gICAgICAgICAgICB2YXIgX2ludGVyZmFjZVR5cGU7XG5cbiAgICAgICAgICAgIGlmIChfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcInJlY2VwdGl2ZVwiO1xuICAgICAgICAgICAgICAgIHZhciBfd2ViTXNnID0ge1xuICAgICAgICAgICAgICAgICAgICBcImludGVyZmFjZVwiOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInJlcXVlc3RcIjogX3JlcXVlc3RNc2csXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcImV4cHJlc3NpdmVcIjtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJzdWJzY3JpYmVcIjogX2ludGVyZmFjZSxcbiAgICAgICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0aGlzLl9nZW5lcmF0ZVRva2VuKF9pbnRlcmZhY2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKFwiV2ViTWVzc2FnZVwiLCBfd2ViTXNnKTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKF9pbnRlcmZhY2VUeXBlID09IFwicmVjZXB0aXZlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChfaW50ZXJmYWNlVHlwZSA9PSBcImV4cHJlc3NpdmVcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09IF9vcExhYmVsICYmIG1zZy5zdGF0dXNDb2RlID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImFnZW50LWVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IGBObyByZXNwb25zZSByZWNlaXZlZCBpbiAke29wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUgLyAxMDAwfXNgfSlcbiAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB3ZWJzdWJzY3JpYmUoX2ludGVyZmFjZSwgX2xvY2FsU29ja2V0TmFtZSA9IFwiZ2xvYmFsXCIsIF90YXJnZXRNc2dMYWJlbCwgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy53ZWJyZXF1ZXN0KF9pbnRlcmZhY2UpXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIF9sb2NhbFNvY2tldCA9IE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHNbX2xvY2FsU29ja2V0TmFtZV0gfHwgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWw7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1ldmVudFwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gYEVWRU5UOjo6JHtfaW50ZXJmYWNlfWApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IF9tc2dMYWJlbCA9IF90YXJnZXRNc2dMYWJlbCB8fCBtc2cub3A7XG4gICAgICAgICAgICAgICAgICAgIF9sb2NhbFNvY2tldC5kaXNwYXRjaE1lc3NhZ2UoX21zZ0xhYmVsLCBtc2cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgd2FpdEZvclNvY2tldENvbm5lY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgY29uc29sZS5kZWJ1ZyhcIldTLVNkayB3YWl0Rm9yU29ja2V0Q29ubmVjdGlvbjpcIiwgXCJXYWl0aW5nIGZvciBzb2NrZXQgY29ubmVjdGlvblwiKTtcbiAgICAgICAgc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2sgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5fc29ja2V0U3RhdGUgPT09IDApIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJXUy1TZGsgd2FpdEZvclNvY2tldENvbm5lY3Rpb246XCIsIGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLndhaXRGb3JTb2NrZXRDb25uZWN0aW9uKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy53YWl0Rm9yU29ja2V0Q29ubmVjdGlvbihjYWxsYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDEwMDApXG4gICAgfVxuXG4gICAgYXN5bmMgX2dlbmVyYXRlVG9rZW4obWVzc2FnZSwgb3B0aW9ucyA9IHthbGdvOiBcIlNIQS0yNTZcIn0pIHtcbiAgICAgICAgY29uc3QgbXNnQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpO1xuICAgICAgICBjb25zdCBoYXNoQnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3Qob3B0aW9ucy5hbGdvLCBtc2dCdWZmZXIpO1xuICAgICAgICBjb25zdCBoYXNoQXJyYXkgPSBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGhhc2hCdWZmZXIpKTtcbiAgICAgICAgcmV0dXJuIGhhc2hBcnJheS5tYXAoYiA9PiBiLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpKS5qb2luKCcnKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVUb0V2ZW50KCkge1xuICAgICAgICBsZXQgY2FsbGJhY2tMaXN0ID0gW107XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIGNvbnN0IG5vdGlmaWVyID0ge1xuICAgICAgICAgICAgbm90aWZ5OiBmdW5jdGlvbiAoY2FsbGJhY2tGdW5jdGlvbiwgX2xleGVtZUxhYmVsLCBfbXNnLCBfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgIF90aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tMaXN0LnB1c2goe2NhbGxiYWNrRnVuY3Rpb24sIF9vcExhYmVsfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIioqKioqKioqKioqKioqKioqIENhbGxiYWNrIEV2ZW50IFRhYmxlICoqKioqKioqKioqKioqKioqKioqKioqKlwiKVxuICAgICAgICAgICAgICAgIGNvbnNvbGUudGFibGUoY2FsbGJhY2tMaXN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIGZvciAobGV0IGNiIG9mIGNhbGxiYWNrTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IGNiLl9vcExhYmVsKVxuICAgICAgICAgICAgICAgICAgICBjYi5jYWxsYmFja0Z1bmN0aW9uKG1zZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIHJldHVybiBub3RpZmllcjtcbiAgICB9XG5cbiAgICBfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24oX21zZykge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMuYWRkKF9uYW1lKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1tgRVZFTlQ6Ojoke19uYW1lfWBdID0gMDtcbiAgICAgICAgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWwuYnJvYWRjYXN0TXNnKFwic3Vic2NyaXB0aW9uLWNyZWF0ZWRcIiwgX21zZyk7XG4gICAgfVxuXG4gICAgX2Nvbm5lY3RIb3N0KCkge1xuICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpbmcgd2l0aCBhcGkgaG9zdGA7XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltcDpcIiwgbXNnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICB9XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ubWVzc2FnZSA9IChfY29ubmVjdGlvbk1zZ0V2KSA9PiB7IC8vY3VzdG9tIG9ubWVzc2FnZSBmdW5jdGlvbnMgY2FuIGJlIHByb3ZpZGVkIGJ5IHRoZSBkZXZlbG9wZXIuXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcImltcDpcIiwgXCItLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXCIsX2Nvbm5lY3Rpb25Nc2dFdik7XG4gICAgICAgICAgICB2YXIgX21zZ1N0ciA9IF9jb25uZWN0aW9uTXNnRXYuZGF0YTtcbiAgICAgICAgICAgIGlmIChfbXNnU3RyID09IFwicmVzcG9uc2U6XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IC8vcGluZy1wb25nIG1lc3NhZ2VzIGV4Y2hhbmdlZCBpbiBrZWVwQWxpdmVcbiAgICAgICAgICAgIHZhciBldiA9IG51bGw7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0gSlNPTi5wYXJzZShfbXNnU3RyKTtcbiAgICAgICAgICAgICAgICBpZiAoX21zZy5vcC5pbmNsdWRlcyhcIkVWRU5UOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8vbm90IHZhbGlkIG1zZ1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0ge2Vycm9yOiBlLCBsYWJlbDogYCR7dGhpcy5uYW1lfS1tZXNzYWdlLWVycm9yYH1cbiAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChfbXNnLmxhYmVsLCB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICAgICAgaWYgKG1zZy5vcC5pbmNsdWRlcyhcInx8fFwiKSAmJiBtc2cuc3RhdHVzQ29kZSA9PSAyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24obXNnLm9wKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vbigpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1ttc2cub3BdICs9IDE7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uQ29ubmVjdCgpIHtcblxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTXVmZmluO1xuIl0sIm5hbWVzIjpbIkxFWElDT04iLCJXZWJNZXNzYWdlIiwiX2NsYXNzIiwiTXVmZmluIiwiTGV4ZW1lIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJlbnVtZXJhYmxlIiwid3JpdGFibGUiLCJ2YWx1ZSIsInVpZCIsInNlbmRlciIsInBhcmFtcyIsInN1YmplY3QiLCJvYmplY3RpdmUiLCJpbnRlcmZhY2UiLCJ0b2tlbiIsInJlcXVlc3QiLCJzdWJzY3JpYmUiLCJBUElfTEVYSUNPTiIsIldFQl9NRVNTQUdFX0xFWElDT04iLCJjb25maWciLCJzYW5kYm94X2xvY2FsIiwiaG9zdE5hbWUiLCJwYXRoIiwiY2hhbm5lbEluc3RhbmNlU2lnIiwiYXBpX3Byb3RvY29sIiwic2FuZGJveCIsIldlYlJlcXVlc3RTZGsiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJsYXp5bG9hZCIsImV2ZW50SW50ZXJmYWNlIiwiUG9zdE9mZmljZSIsImdldE9yQ3JlYXRlSW50ZXJmYWNlIiwibGFiZWwiLCJuYW1lIiwiY2xpZW50SWQiLCJjbGllbnRfaWQiLCJrZWVwQWxpdmVUaW1lb3V0IiwidWlWYXJzIiwiY2xvY2siLCJFcnJvciIsIl9jb25uZWN0aW9uIiwic3RhdGUiLCJfY29ubmVjdGlvbkFsaXZlIiwiX3NvY2tldFN0YXRlIiwiY29ubmVjdCIsImV2ZW50U3Vic2NyaXB0aW9ucyIsIlNldCIsImV2ZW50Q291bnRlcnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImZpbmFsVXJsIiwiYWRkU29ja2V0IiwiV2ViU29ja2V0IiwiYXV0b1JldHJ5T25DbG9zZSIsInNvY2tldCIsIm9uZXJyb3IiLCJldmVudCIsInRhcmdldCIsIm1lc3NhZ2UiLCJyZWFkeVN0YXRlIiwiY29uc29sZSIsImVycm9yIiwiZGlzcGF0Y2hNZXNzYWdlIiwiY2FuY2VsS2VlcEFsaXZlIiwibXNnIiwib25vcGVuIiwiZSIsIl9rZWVwQWxpdmUiLCJvbmNsb3NlIiwib25tZXNzYWdlIiwiX21zZ1N0ciIsImRhdGEiLCJfbXNnIiwiSlNPTiIsInBhcnNlIiwib3AiLCJpbmNsdWRlcyIsImRlYnVnIiwic2V0SW50ZXJ2YWwiLCJzZW5kIiwiY2xlYXJJbnRlcnZhbCIsImdldFNlcmlhbGl6YWJsZUludHJvIiwia2V5cyIsIm1hcCIsIl9sZXhlbWUiLCJfc2NoZW1hIiwic2NoZW1hIiwiZnVsbE5hbWUiLCJnZXRJbnRybyIsIl9nZXRMZXhlbWUiLCJfbGV4ZW1lTGFiZWwiLCJfZmluZEFuZEluZmxlY3RMZXhlbWUiLCJfc2VsZWN0ZWRMZXhlbWUiLCJfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uIiwiaW5mbGVjdCIsImdlbkZpeHR1cmVzIiwic3RyaW5naWZ5IiwiY29tbXVuaWNhdGUiLCJpbmZsZWN0aW9uIiwidGVzdFN0YXJ0IiwiRGF0ZSIsIm5vdyIsIl9vcExhYmVsIiwiTUFYX1JFU1BPTlNFX1RJTUUiLCJ3YWl0Rm9yU29ja2V0Q29ubmVjdGlvbiIsIm9uIiwicmVzdWx0Iiwic2V0VGltZW91dCIsIndlYnJlcXVlc3QiLCJfaW50ZXJmYWNlIiwiX3JlcXVlc3RNc2ciLCJvcExhYmVsIiwiX2ludGVyZmFjZVR5cGUiLCJfd2ViTXNnIiwiX2dlbmVyYXRlVG9rZW4iLCJzdGF0dXNDb2RlIiwid2Vic3Vic2NyaWJlIiwiX2xvY2FsU29ja2V0TmFtZSIsIl90YXJnZXRNc2dMYWJlbCIsIl9sb2NhbFNvY2tldCIsInNvY2tldHMiLCJnbG9iYWwiLCJfbXNnTGFiZWwiLCJjYWxsYmFjayIsImFsZ28iLCJtc2dCdWZmZXIiLCJUZXh0RW5jb2RlciIsImVuY29kZSIsImhhc2hCdWZmZXIiLCJjcnlwdG8iLCJzdWJ0bGUiLCJkaWdlc3QiLCJoYXNoQXJyYXkiLCJBcnJheSIsImZyb20iLCJVaW50OEFycmF5IiwiYiIsInRvU3RyaW5nIiwicGFkU3RhcnQiLCJqb2luIiwic3Vic2NyaWJlVG9FdmVudCIsImNhbGxiYWNrTGlzdCIsIl90aGlzIiwibm90aWZpZXIiLCJub3RpZnkiLCJjYWxsYmFja0Z1bmN0aW9uIiwicHVzaCIsInRhYmxlIiwiY2IiLCJfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24iLCJhZGQiLCJfbmFtZSIsImJyb2FkY2FzdE1zZyIsIl9jb25uZWN0SG9zdCIsImxvZyIsIl9jb25uZWN0aW9uTXNnRXYiLCJldiIsIkN1c3RvbUV2ZW50IiwiZGV0YWlsIiwib25Db25uZWN0Il0sIm1hcHBpbmdzIjoiOzs7O0lBQUEsTUFBTUEsT0FBTyxHQUFHLEVBQUU7SUFFbEJBLE9BQU8sQ0FBQ0MsVUFBVSxJQUFBQyxNQUFBLEdBQUcsY0FBY0MsTUFBTSxDQUFDQyxNQUFNLENBQUMsRUFpQmhELEVBQUFDLE1BQUEsQ0FBQUMsY0FBQSxDQUFBSixNQUFBO01BQUFLLFVBQUE7TUFBQUMsUUFBQTtNQUFBQyxLQUFBLEVBaEJpQjtJQUFFLElBQUFKLE1BQUEsQ0FBQUMsY0FBQSxDQUFBSixNQUFBO01BQUFLLFVBQUE7TUFBQUMsUUFBQTtNQUFBQyxLQUFBLEVBRVE7UUFDcEJDLEdBQUcsRUFBRSxJQUFJO1FBQ1RD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
