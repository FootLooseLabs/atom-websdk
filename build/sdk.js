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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLnVpZCA9IFwiXCI7XG4gICAgICAgIHRoaXMubGFiZWwgPSBvcHRpb25zLmxhYmVsIHx8IFwiZHJvbmFfc3RvcmVfc2RrX2NsaWVudFwiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5rZWVwQWxpdmVUaW1lb3V0ID0gb3B0aW9ucy5rZWVwQWxpdmVUaW1lb3V0IHx8IDYwMDAwO1xuICAgICAgICB0aGlzLnBhc3MgPSBcIlwiO1xuICAgICAgICB0aGlzLmNvbm5lY3RlZFN0b3JlcyA9IFtdO1xuICAgICAgICB0aGlzLnVpVmFycyA9IHtcbiAgICAgICAgICAgIGNsb2NrOiB7fSxcbiAgICAgICAgICAgIGNvbmZpZzogY29uZmlnW29wdGlvbnMubGFiZWxdXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IG51bGw7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBudWxsO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uQWxpdmUgPSBudWxsO1xuICAgIH1cblxuICAgIGFzeW5jIGNvbm5lY3QoKSB7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50U3Vic2NyaXB0aW9ucyA9IG5ldyBTZXQoW10pO1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzID0ge307XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB2YXIgZmluYWxVcmwgPSB0aGlzLnVpVmFycy5jb25maWcuYXBpX3Byb3RvY29sICsgdGhpcy51aVZhcnMuY29uZmlnLmhvc3ROYW1lICsgXCIvXCIgKyB0aGlzLnVpVmFycy5jb25maWcucGF0aCArIFwiL1wiICsgdGhpcy5jbGllbnRJZCArIFwiP2F1dGg9XCIgKyB0aGlzLnRva2VuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uID0gTXVmZmluLlBvc3RPZmZpY2UuYWRkU29ja2V0KFdlYlNvY2tldCwgdGhpcy5sYWJlbCwgZmluYWxVcmwpO1xuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5hdXRvUmV0cnlPbkNsb3NlID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJlcnJvclwiLCBlKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbmNlbEtlZXBBbGl2ZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe3N0YXRlOiB0aGlzLnN0YXRlLCBtc2c6IG1zZ30pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25vcGVuID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiY29ubmVjdFwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9rZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc29ja2V0Lm9uY2xvc2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiY2xvc2VcIiwgZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxLZWVwQWxpdmUoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25tZXNzYWdlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZ1N0ciA9IGUuZGF0YTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cilcbiAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctbXNnXCIsIFtfbXNnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBfbXNnKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctZXZlbnRcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBfa2VlcEFsaXZlKCkge1xuICAgICAgICB0aGlzLmNhbmNlbEtlZXBBbGl2ZSgpO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uQWxpdmUgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoXCJwaW5nXCIpO1xuICAgICAgICB9LCB0aGlzLmtlZXBBbGl2ZVRpbWVvdXQpO1xuICAgIH1cblxuICAgIGNhbmNlbEtlZXBBbGl2ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nvbm5lY3Rpb25BbGl2ZSkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9jb25uZWN0aW9uQWxpdmUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0U2VyaWFsaXphYmxlSW50cm8oKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLkxFWElDT04pLm1hcCgoX2xleGVtZSkgPT4ge1xuICAgICAgICAgICAgbGV0IF9zY2hlbWEgPSB0aGlzLkxFWElDT05bX2xleGVtZV0uc2NoZW1hLnJlcXVlc3QgfHwge307XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGxhYmVsOiBfbGV4ZW1lLFxuICAgICAgICAgICAgICAgIGZ1bGxOYW1lOiB0aGlzLkxFWElDT05bX2xleGVtZV0ubmFtZSxcbiAgICAgICAgICAgICAgICBzY2hlbWE6IF9zY2hlbWFcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0SW50cm8oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLkxFWElDT047XG4gICAgfVxuXG4gICAgX2dldExleGVtZShfbGV4ZW1lTGFiZWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTltfbGV4ZW1lTGFiZWxdO1xuICAgIH1cblxuICAgIF9maW5kQW5kSW5mbGVjdExleGVtZShfbGV4ZW1lTGFiZWwsIF9tc2cpIHtcbiAgICAgICAgaWYgKCFfbGV4ZW1lTGFiZWwgfHwgIV9tc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvcjpcIiwgXCJJbnZhbGlkIFJlcXVlc3QuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZSA9IHRoaXMuX2dldExleGVtZShfbGV4ZW1lTGFiZWwpO1xuICAgICAgICBpZiAoIV9zZWxlY3RlZExleGVtZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIlVua25vd24gUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmIChfbXNnID09PSBcInJhbmRvbVwiKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uID0gX3NlbGVjdGVkTGV4ZW1lLmluZmxlY3Qoe30pO1xuICAgICAgICAgICAgICAgIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uZ2VuRml4dHVyZXMoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdChfbXNnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uLnN0cmluZ2lmeSgpO1xuICAgIH1cblxuICAgIGNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICAvLyB0cnl7XG4gICAgICAgIC8vIFx0SlNPTi5wYXJzZShfbXNnKTtcbiAgICAgICAgLy8gfWNhdGNoKGUpe1xuICAgICAgICAvLyBcdGxldCBtc2cgPSBcImludmFsaWQganNvbiBwYXlsb2FkXCI7XG4gICAgICAgIC8vIFx0Y29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBtc2cpO1xuICAgICAgICAvLyBcdHJldHVybjtcbiAgICAgICAgLy8gfVxuICAgICAgICBsZXQgaW5mbGVjdGlvbiA9IHRoaXMuX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgIGlmICghaW5mbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudWlWYXJzLmNsb2NrLnRlc3RTdGFydCA9IERhdGUubm93KCkgLyAxMDAwO1xuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoaW5mbGVjdGlvbik7XG4gICAgfVxuXG4gICAgYXN5bmMgcmVxdWVzdChfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpO1xuICAgICAgICAgICAgaWYgKCFfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHttZXNzYWdlOiBcIk1lc3NhZ2Ugc2VudC4gTm8gcmVzcF9vcCBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IGBObyByZXNwb25zZSByZWNlaXZlZCBpbiAke29wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUgLyAxMDAwfXNgfSlcbiAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB3ZWJyZXF1ZXN0KF9pbnRlcmZhY2UsIF9yZXF1ZXN0TXNnLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfaW50ZXJmYWNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7ZXJyb3I6IFwiTm8gSW50ZXJmYWNlIHByb3ZpZGVkLlwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghX2ludGVyZmFjZS5pbmNsdWRlcyhcIjo6OlwiKSAmJiAhX2ludGVyZmFjZS5pbmNsdWRlcyhcInx8fFwiKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe2Vycm9yOiBcIkludmFsaWQgSW50ZXJmYWNlIHByb3ZpZGVkXCJ9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIF9vcExhYmVsID0gb3B0aW9ucy5vcExhYmVsIHx8IF9pbnRlcmZhY2U7XG5cbiAgICAgICAgICAgIHZhciBfaW50ZXJmYWNlVHlwZTtcblxuICAgICAgICAgICAgaWYgKF9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikpIHtcbiAgICAgICAgICAgICAgICBfaW50ZXJmYWNlVHlwZSA9IFwicmVjZXB0aXZlXCI7XG4gICAgICAgICAgICAgICAgdmFyIF93ZWJNc2cgPSB7XG4gICAgICAgICAgICAgICAgICAgIFwiaW50ZXJmYWNlXCI6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWVzdFwiOiBfcmVxdWVzdE1zZyxcbiAgICAgICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0aGlzLl9nZW5lcmF0ZVRva2VuKF9pbnRlcmZhY2UpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBfaW50ZXJmYWNlVHlwZSA9IFwiZXhwcmVzc2l2ZVwiO1xuICAgICAgICAgICAgICAgIHZhciBfd2ViTXNnID0ge1xuICAgICAgICAgICAgICAgICAgICBcInN1YnNjcmliZVwiOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInRva2VuXCI6IHRoaXMuX2dlbmVyYXRlVG9rZW4oX2ludGVyZmFjZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY29tbXVuaWNhdGUoXCJXZWJNZXNzYWdlXCIsIF93ZWJNc2cpO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZihfaW50ZXJmYWNlVHlwZSA9PSBcInJlY2VwdGl2ZVwiKXtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLnJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfWVsc2UgaWYoX2ludGVyZmFjZVR5cGUgPT0gXCJleHByZXNzaXZlXCIpe1xuICAgICAgICAgICAgICAgICAgICBpZihtc2cub3AgPT0gX29wTGFiZWwgJiYgbXNnLnN0YXR1c0NvZGUgPT0gMil7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJlcnJvclwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gX29wTGFiZWwgJiYgbXNnLmVycm9yICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChtc2cpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHttZXNzYWdlOiBgTm8gcmVzcG9uc2UgcmVjZWl2ZWQgaW4gJHtvcHRpb25zLk1BWF9SRVNQT05TRV9USU1FIC8gMTAwMH1zYH0pXG4gICAgICAgICAgICB9LCBvcHRpb25zLk1BWF9SRVNQT05TRV9USU1FKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgd2Vic3Vic2NyaWJlKF9pbnRlcmZhY2UsIF9sb2NhbFNvY2tldE5hbWU9XCJnbG9iYWxcIiwgX3RhcmdldE1zZ0xhYmVsLCBvcHRpb25zID0ge01BWF9SRVNQT05TRV9USU1FOiA1MDAwfSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMud2VicmVxdWVzdChfaW50ZXJmYWNlKVxuICAgICAgICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfbG9jYWxTb2NrZXQgPSBNdWZmaW4uUG9zdE9mZmljZS5zb2NrZXRzW19sb2NhbFNvY2tldE5hbWVdIHx8IE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHMuZ2xvYmFsO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctZXZlbnRcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IGBFVkVOVDo6OiR7X2ludGVyZmFjZX1gKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBfbXNnTGFiZWwgPSBfdGFyZ2V0TXNnTGFiZWwgfHwgbXNnLm9wO1xuICAgICAgICAgICAgICAgICAgICBfbG9jYWxTb2NrZXQuZGlzcGF0Y2hNZXNzYWdlKF9tc2dMYWJlbCwgbXNnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIF9nZW5lcmF0ZVRva2VuKG1lc3NhZ2UsIG9wdGlvbnMgPSB7YWxnbzogXCJTSEEtMjU2XCJ9KSB7XG4gICAgICAgIGNvbnN0IG1zZ0J1ZmZlciA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShtZXNzYWdlKTtcbiAgICAgICAgY29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KG9wdGlvbnMuYWxnbywgbXNnQnVmZmVyKTtcbiAgICAgICAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gICAgICAgIHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKSkuam9pbignJyk7XG4gICAgfVxuXG4gICAgc3Vic2NyaWJlVG9FdmVudCgpIHtcbiAgICAgICAgbGV0IGNhbGxiYWNrTGlzdCA9IFtdO1xuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuICAgICAgICBjb25zdCBub3RpZmllciA9IHtcbiAgICAgICAgICAgIG5vdGlmeTogZnVuY3Rpb24gKGNhbGxiYWNrRnVuY3Rpb24sIF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwpIHtcbiAgICAgICAgICAgICAgICBfdGhpcy5jb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrTGlzdC5wdXNoKHtjYWxsYmFja0Z1bmN0aW9uLCBfb3BMYWJlbH0pO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCIqKioqKioqKioqKioqKioqKiBDYWxsYmFjayBFdmVudCBUYWJsZSAqKioqKioqKioqKioqKioqKioqKioqKipcIilcbiAgICAgICAgICAgICAgICBjb25zb2xlLnRhYmxlKGNhbGxiYWNrTGlzdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1ldmVudFwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICBmb3IgKGxldCBjYiBvZiBjYWxsYmFja0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBjYi5fb3BMYWJlbClcbiAgICAgICAgICAgICAgICAgICAgY2IuY2FsbGJhY2tGdW5jdGlvbihtc2cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICByZXR1cm4gbm90aWZpZXI7XG4gICAgfVxuXG4gICAgX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uKF9tc2cpIHtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRTdWJzY3JpcHRpb25zLmFkZChfbmFtZSk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnNbYEVWRU5UOjo6JHtfbmFtZX1gXSA9IDA7XG4gICAgICAgIE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHMuZ2xvYmFsLmJyb2FkY2FzdE1zZyhcInN1YnNjcmlwdGlvbi1jcmVhdGVkXCIsIF9tc2cpO1xuICAgIH1cblxuICAgIF9jb25uZWN0SG9zdCgpIHtcbiAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW5nIHdpdGggYXBpIGhvc3RgO1xuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25lcnJvciA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJpbXA6XCIsIG1zZyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGVzdGFibGlzaGVkYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gY2xvc2VkYDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbm1lc3NhZ2UgPSAoX2Nvbm5lY3Rpb25Nc2dFdikgPT4geyAvL2N1c3RvbSBvbm1lc3NhZ2UgZnVuY3Rpb25zIGNhbiBiZSBwcm92aWRlZCBieSB0aGUgZGV2ZWxvcGVyLlxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJpbXA6XCIsIFwiLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVwiLF9jb25uZWN0aW9uTXNnRXYpO1xuICAgICAgICAgICAgdmFyIF9tc2dTdHIgPSBfY29ubmVjdGlvbk1zZ0V2LmRhdGE7XG4gICAgICAgICAgICBpZiAoX21zZ1N0ciA9PSBcInJlc3BvbnNlOlwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSAvL3BpbmctcG9uZyBtZXNzYWdlcyBleGNoYW5nZWQgaW4ga2VlcEFsaXZlXG4gICAgICAgICAgICB2YXIgZXYgPSBudWxsO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cik7XG4gICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LXJlc3BvbnNlLW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyAvL25vdCB2YWxpZCBtc2dcbiAgICAgICAgICAgICAgICB2YXIgX21zZyA9IHtlcnJvcjogZSwgbGFiZWw6IGAke3RoaXMubmFtZX0tbWVzc2FnZS1lcnJvcmB9XG4gICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoX21zZy5sYWJlbCwge1xuICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBldjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub24oXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIC8vIHRoaXMudWlWYXJzLmhvc3RhZ2VudFJlc3BvbnNlTXNnTG9nRWwuYXBwZW5kQ2hpbGQodGFibGVIdG1sKTtcbiAgICAgICAgICAgIGlmIChtc2cub3AuaW5jbHVkZXMoXCJ8fHxcIikgJiYgbXNnLnN0YXR1c0NvZGUgPT0gMikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uKG1zZy5vcCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHRoaXMub24oKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub24oXCJpbmNvbWluZy1ob3N0YWdlbnQtZXZlbnQtbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnNbbXNnLm9wXSArPSAxO1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbkNvbm5lY3QoKSB7XG5cbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE11ZmZpbjtcbiJdLCJuYW1lcyI6WyJMRVhJQ09OIiwiV2ViTWVzc2FnZSIsIk11ZmZpbiIsIkxleGVtZSIsInVpZCIsInNlbmRlciIsInBhcmFtcyIsInN1YmplY3QiLCJvYmplY3RpdmUiLCJpbnRlcmZhY2UiLCJ0b2tlbiIsInJlcXVlc3QiLCJzdWJzY3JpYmUiLCJBUElfTEVYSUNPTiIsIldFQl9NRVNTQUdFX0xFWElDT04iLCJjb25maWciLCJzYW5kYm94X2xvY2FsIiwiaG9zdE5hbWUiLCJwYXRoIiwiY2hhbm5lbEluc3RhbmNlU2lnIiwiYXBpX3Byb3RvY29sIiwic2FuZGJveCIsIldlYlJlcXVlc3RTZGsiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJsYXp5bG9hZCIsImV2ZW50SW50ZXJmYWNlIiwiUG9zdE9mZmljZSIsImdldE9yQ3JlYXRlSW50ZXJmYWNlIiwibGFiZWwiLCJjbGllbnRJZCIsImNsaWVudF9pZCIsImtlZXBBbGl2ZVRpbWVvdXQiLCJwYXNzIiwiY29ubmVjdGVkU3RvcmVzIiwidWlWYXJzIiwiY2xvY2siLCJfY29ubmVjdGlvbiIsInN0YXRlIiwiX2Nvbm5lY3Rpb25BbGl2ZSIsImNvbm5lY3QiLCJldmVudFN1YnNjcmlwdGlvbnMiLCJTZXQiLCJldmVudENvdW50ZXJzIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJmaW5hbFVybCIsImFkZFNvY2tldCIsIldlYlNvY2tldCIsImF1dG9SZXRyeU9uQ2xvc2UiLCJzb2NrZXQiLCJvbmVycm9yIiwiZSIsIm1zZyIsIm1lc3NhZ2UiLCJkaXNwYXRjaE1lc3NhZ2UiLCJjYW5jZWxLZWVwQWxpdmUiLCJvbm9wZW4iLCJfa2VlcEFsaXZlIiwib25jbG9zZSIsIm9ubWVzc2FnZSIsIl9tc2dTdHIiLCJkYXRhIiwiX21zZyIsIkpTT04iLCJwYXJzZSIsImVycm9yIiwib3AiLCJpbmNsdWRlcyIsInNldEludGVydmFsIiwic2VuZCIsImNsZWFySW50ZXJ2YWwiLCJnZXRTZXJpYWxpemFibGVJbnRybyIsIk9iamVjdCIsImtleXMiLCJtYXAiLCJfbGV4ZW1lIiwiX3NjaGVtYSIsInNjaGVtYSIsImZ1bGxOYW1lIiwibmFtZSIsImdldEludHJvIiwiX2dldExleGVtZSIsIl9sZXhlbWVMYWJlbCIsIl9maW5kQW5kSW5mbGVjdExleGVtZSIsImNvbnNvbGUiLCJfc2VsZWN0ZWRMZXhlbWUiLCJfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uIiwiaW5mbGVjdCIsImdlbkZpeHR1cmVzIiwic3RyaW5naWZ5IiwiY29tbXVuaWNhdGUiLCJpbmZsZWN0aW9uIiwidGVzdFN0YXJ0IiwiRGF0ZSIsIm5vdyIsIl9vcExhYmVsIiwiTUFYX1JFU1BPTlNFX1RJTUUiLCJvbiIsInJlc3VsdCIsInNldFRpbWVvdXQiLCJ3ZWJyZXF1ZXN0IiwiX2ludGVyZmFjZSIsIl9yZXF1ZXN0TXNnIiwib3BMYWJlbCIsIl9pbnRlcmZhY2VUeXBlIiwiX3dlYk1zZyIsIl9nZW5lcmF0ZVRva2VuIiwic3RhdHVzQ29kZSIsIndlYnN1YnNjcmliZSIsIl9sb2NhbFNvY2tldE5hbWUiLCJfdGFyZ2V0TXNnTGFiZWwiLCJfbG9jYWxTb2NrZXQiLCJzb2NrZXRzIiwiZ2xvYmFsIiwiX21zZ0xhYmVsIiwiYWxnbyIsIm1zZ0J1ZmZlciIsIlRleHRFbmNvZGVyIiwiZW5jb2RlIiwiaGFzaEJ1ZmZlciIsImNyeXB0byIsInN1YnRsZSIsImRpZ2VzdCIsImhhc2hBcnJheSIsIkFycmF5IiwiZnJvbSIsIlVpbnQ4QXJyYXkiLCJiIiwidG9TdHJpbmciLCJwYWRTdGFydCIsImpvaW4iLCJzdWJzY3JpYmVUb0V2ZW50IiwiY2FsbGJhY2tMaXN0IiwiX3RoaXMiLCJub3RpZmllciIsIm5vdGlmeSIsImNhbGxiYWNrRnVuY3Rpb24iLCJwdXNoIiwiZGVidWciLCJ0YWJsZSIsImNiIiwiX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uIiwiYWRkIiwiX25hbWUiLCJicm9hZGNhc3RNc2ciLCJfY29ubmVjdEhvc3QiLCJsb2ciLCJfY29ubmVjdGlvbk1zZ0V2IiwiZXYiLCJDdXN0b21FdmVudCIsImRldGFpbCIsIm9uQ29ubmVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7SUFBQSxNQUFNQSxPQUFPLEdBQUcsRUFBaEI7SUFFQUEsT0FBTyxDQUFDQyxVQUFSLHFCQUFxQixjQUFjQyxNQUFNLENBQUNDLE1BQXJCLENBQTRCLEVBQWpEO0lBQUE7SUFBQTtJQUFBLFNBQ2tCO0lBRGxCO0lBQUE7SUFBQTtJQUFBLFNBRzRCO0lBQ3BCQyxJQUFBQSxHQUFHLEVBQUUsSUFEZTtJQUVwQkMsSUFBQUEsTUFBTSxFQUFFLElBRlk7SUFHcEJDLElBQUFBLE1BQU0sRUFBRSxFQUhZO0lBSXBCQyxJQUFBQSxPQUFPLEVBQUUsSUFKVztJQUtwQkMsSUFBQUEsU0FBUyxFQUFFO0lBTFM7SUFINUI7SUFBQTtJQUFBO0lBQUEsU0FXb0I7SUFDWkMsSUFBQUEsU0FBUyxFQUFFLElBREM7SUFFWkMsSUFBQUEsS0FBSyxFQUFFLElBRks7SUFHWkMsSUFBQUEsT0FBTyxFQUFFLElBSEc7SUFJWkMsSUFBQUEsU0FBUyxFQUFFO0lBSkM7SUFYcEI7O0lDQUEsTUFBTUMsV0FBVyxHQUFHLEVBQUMsR0FBRyxFQUFKO0lBQVEsS0FBR0M7SUFBWCxDQUFwQjtJQUVBLE1BQU1DLE1BQU0sR0FBRztJQUNYQyxFQUFBQSxhQUFhLEVBQUU7SUFDWEMsSUFBQUEsUUFBUSxFQUFFLGdCQURDO0lBRVhDLElB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
