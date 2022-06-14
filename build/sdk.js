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
        if (this._connectionAlive) {
          clearInterval(this._connectionKeepAlive);
        }

        this._connectionKeepAlive = setInterval(() => {
          this._connection.send("ping");
        }, 1000);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLnVpZCA9IFwiXCI7XG4gICAgICAgIHRoaXMubGFiZWwgPSBvcHRpb25zLmxhYmVsIHx8IFwiZHJvbmFfc3RvcmVfc2RrX2NsaWVudFwiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5wYXNzID0gXCJcIjtcbiAgICAgICAgdGhpcy5jb25uZWN0ZWRTdG9yZXMgPSBbXTtcbiAgICAgICAgdGhpcy51aVZhcnMgPSB7XG4gICAgICAgICAgICBjbG9jazoge30sXG4gICAgICAgICAgICBjb25maWc6IGNvbmZpZ1tvcHRpb25zLmxhYmVsXVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLnN0YXRlID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbkFsaXZlID0gbnVsbDtcbiAgICB9XG5cbiAgICBhc3luYyBjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0KFtdKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVycyA9IHt9O1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbmFsVXJsID0gdGhpcy51aVZhcnMuY29uZmlnLmFwaV9wcm90b2NvbCArIHRoaXMudWlWYXJzLmNvbmZpZy5ob3N0TmFtZSArIFwiL1wiICsgdGhpcy51aVZhcnMuY29uZmlnLnBhdGggKyBcIi9cIiArIHRoaXMuY2xpZW50SWQgKyBcIj9hdXRoPVwiICsgdGhpcy50b2tlblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjb25uZWN0XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2tlZXBBbGl2ZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGNsb3NlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjbG9zZVwiLCBlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25tZXNzYWdlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZ1N0ciA9IGUuZGF0YTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cilcbiAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctbXNnXCIsIFtfbXNnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBfbXNnKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctZXZlbnRcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBfa2VlcEFsaXZlKCkge1xuICAgICAgICBpZiAodGhpcy5fY29ubmVjdGlvbkFsaXZlKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuX2Nvbm5lY3Rpb25LZWVwQWxpdmUpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb25LZWVwQWxpdmUgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNlbmQoXCJwaW5nXCIpO1xuICAgICAgICB9LCAxMDAwKTtcbiAgICB9XG5cbiAgICBnZXRTZXJpYWxpemFibGVJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuTEVYSUNPTikubWFwKChfbGV4ZW1lKSA9PiB7XG4gICAgICAgICAgICBsZXQgX3NjaGVtYSA9IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5zY2hlbWEucmVxdWVzdCB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGFiZWw6IF9sZXhlbWUsXG4gICAgICAgICAgICAgICAgZnVsbE5hbWU6IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5uYW1lLFxuICAgICAgICAgICAgICAgIHNjaGVtYTogX3NjaGVtYVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXRJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTjtcbiAgICB9XG5cbiAgICBfZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MRVhJQ09OW19sZXhlbWVMYWJlbF07XG4gICAgfVxuXG4gICAgX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBpZiAoIV9sZXhlbWVMYWJlbCB8fCAhX21zZykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIkludmFsaWQgUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lID0gdGhpcy5fZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCk7XG4gICAgICAgIGlmICghX3NlbGVjdGVkTGV4ZW1lKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIFwiVW5rbm93biBSZXF1ZXN0LlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKF9tc2cgPT09IFwicmFuZG9tXCIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdCh7fSk7XG4gICAgICAgICAgICAgICAgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbi5nZW5GaXh0dXJlcygpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiA9IF9zZWxlY3RlZExleGVtZS5pbmZsZWN0KF9tc2cpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uc3RyaW5naWZ5KCk7XG4gICAgfVxuXG4gICAgY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKSB7XG4gICAgICAgIC8vIHRyeXtcbiAgICAgICAgLy8gXHRKU09OLnBhcnNlKF9tc2cpO1xuICAgICAgICAvLyB9Y2F0Y2goZSl7XG4gICAgICAgIC8vIFx0bGV0IG1zZyA9IFwiaW52YWxpZCBqc29uIHBheWxvYWRcIjtcbiAgICAgICAgLy8gXHRjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIG1zZyk7XG4gICAgICAgIC8vIFx0cmV0dXJuO1xuICAgICAgICAvLyB9XG4gICAgICAgIGxldCBpbmZsZWN0aW9uID0gdGhpcy5fZmluZEFuZEluZmxlY3RMZXhlbWUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgaWYgKCFpbmZsZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51aVZhcnMuY2xvY2sudGVzdFN0YXJ0ID0gRGF0ZS5ub3coKSAvIDEwMDA7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChpbmZsZWN0aW9uKTtcbiAgICB9XG5cbiAgICBhc3luYyByZXF1ZXN0KF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwsIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICBpZiAoIV9vcExhYmVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoe21lc3NhZ2U6IFwiTWVzc2FnZSBzZW50LiBObyByZXNwX29wIHByb3ZpZGVkLlwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5yZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShtc2cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiZXJyb3JcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IF9vcExhYmVsICYmIG1zZy5lcnJvciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QobXNnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7bWVzc2FnZTogYE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnJlcXVlc3QoX2ludGVyZmFjZSwgX3JlcXVlc3RNc2csIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBpZiAoIV9pbnRlcmZhY2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJObyBJbnRlcmZhY2UgcHJvdmlkZWQuXCJ9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpICYmICFfaW50ZXJmYWNlLmluY2x1ZGVzKFwifHx8XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7ZXJyb3I6IFwiSW52YWxpZCBJbnRlcmZhY2UgcHJvdmlkZWRcIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgX29wTGFiZWwgPSBvcHRpb25zLm9wTGFiZWwgfHwgX2ludGVyZmFjZTtcblxuICAgICAgICAgICAgdmFyIF9pbnRlcmZhY2VUeXBlO1xuXG4gICAgICAgICAgICBpZiAoX2ludGVyZmFjZS5pbmNsdWRlcyhcIjo6OlwiKSkge1xuICAgICAgICAgICAgICAgIF9pbnRlcmZhY2VUeXBlID0gXCJyZWNlcHRpdmVcIjtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJpbnRlcmZhY2VcIjogX2ludGVyZmFjZSxcbiAgICAgICAgICAgICAgICAgICAgXCJyZXF1ZXN0XCI6IF9yZXF1ZXN0TXNnLFxuICAgICAgICAgICAgICAgICAgICBcInRva2VuXCI6IHRoaXMuX2dlbmVyYXRlVG9rZW4oX2ludGVyZmFjZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIF9pbnRlcmZhY2VUeXBlID0gXCJleHByZXNzaXZlXCI7XG4gICAgICAgICAgICAgICAgdmFyIF93ZWJNc2cgPSB7XG4gICAgICAgICAgICAgICAgICAgIFwic3Vic2NyaWJlXCI6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jb21tdW5pY2F0ZShcIldlYk1lc3NhZ2VcIiwgX3dlYk1zZyk7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmKF9pbnRlcmZhY2VUeXBlID09IFwicmVjZXB0aXZlXCIpe1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9ZWxzZSBpZihfaW50ZXJmYWNlVHlwZSA9PSBcImV4cHJlc3NpdmVcIil7XG4gICAgICAgICAgICAgICAgICAgIGlmKG1zZy5vcCA9PSBfb3BMYWJlbCAmJiBtc2cuc3RhdHVzQ29kZSA9PSAyKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6IGBObyByZXNwb25zZSByZWNlaXZlZCBpbiAke29wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUgLyAxMDAwfXNgfSlcbiAgICAgICAgICAgIH0sIG9wdGlvbnMuTUFYX1JFU1BPTlNFX1RJTUUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB3ZWJzdWJzY3JpYmUoX2ludGVyZmFjZSwgX2xvY2FsU29ja2V0TmFtZT1cImdsb2JhbFwiLCBfdGFyZ2V0TXNnTGFiZWwsIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy53ZWJyZXF1ZXN0KF9pbnRlcmZhY2UpXG4gICAgICAgICAgICB9Y2F0Y2goZSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIF9sb2NhbFNvY2tldCA9IE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHNbX2xvY2FsU29ja2V0TmFtZV0gfHwgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWw7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1ldmVudFwiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5vcCA9PT0gYEVWRU5UOjo6JHtfaW50ZXJmYWNlfWApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IF9tc2dMYWJlbCA9IF90YXJnZXRNc2dMYWJlbCB8fCBtc2cub3A7XG4gICAgICAgICAgICAgICAgICAgIF9sb2NhbFNvY2tldC5kaXNwYXRjaE1lc3NhZ2UoX21zZ0xhYmVsLCBtc2cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgX2dlbmVyYXRlVG9rZW4obWVzc2FnZSwgb3B0aW9ucyA9IHthbGdvOiBcIlNIQS0yNTZcIn0pIHtcbiAgICAgICAgY29uc3QgbXNnQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpO1xuICAgICAgICBjb25zdCBoYXNoQnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3Qob3B0aW9ucy5hbGdvLCBtc2dCdWZmZXIpO1xuICAgICAgICBjb25zdCBoYXNoQXJyYXkgPSBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGhhc2hCdWZmZXIpKTtcbiAgICAgICAgcmV0dXJuIGhhc2hBcnJheS5tYXAoYiA9PiBiLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpKS5qb2luKCcnKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVUb0V2ZW50KCkge1xuICAgICAgICBsZXQgY2FsbGJhY2tMaXN0ID0gW107XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIGNvbnN0IG5vdGlmaWVyID0ge1xuICAgICAgICAgICAgbm90aWZ5OiBmdW5jdGlvbiAoY2FsbGJhY2tGdW5jdGlvbiwgX2xleGVtZUxhYmVsLCBfbXNnLCBfb3BMYWJlbCkge1xuICAgICAgICAgICAgICAgIF90aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tMaXN0LnB1c2goe2NhbGxiYWNrRnVuY3Rpb24sIF9vcExhYmVsfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIioqKioqKioqKioqKioqKioqIENhbGxiYWNrIEV2ZW50IFRhYmxlICoqKioqKioqKioqKioqKioqKioqKioqKlwiKVxuICAgICAgICAgICAgICAgIGNvbnNvbGUudGFibGUoY2FsbGJhY2tMaXN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIGZvciAobGV0IGNiIG9mIGNhbGxiYWNrTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmIChtc2cub3AgPT09IGNiLl9vcExhYmVsKVxuICAgICAgICAgICAgICAgICAgICBjYi5jYWxsYmFja0Z1bmN0aW9uKG1zZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIHJldHVybiBub3RpZmllcjtcbiAgICB9XG5cbiAgICBfY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24oX21zZykge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMuYWRkKF9uYW1lKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1tgRVZFTlQ6Ojoke19uYW1lfWBdID0gMDtcbiAgICAgICAgTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0cy5nbG9iYWwuYnJvYWRjYXN0TXNnKFwic3Vic2NyaXB0aW9uLWNyZWF0ZWRcIiwgX21zZyk7XG4gICAgfVxuXG4gICAgX2Nvbm5lY3RIb3N0KCkge1xuICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpbmcgd2l0aCBhcGkgaG9zdGA7XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltcDpcIiwgbXNnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZXN0YWJsaXNoZWRgO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBjbG9zZWRgO1xuICAgICAgICB9XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9ubWVzc2FnZSA9IChfY29ubmVjdGlvbk1zZ0V2KSA9PiB7IC8vY3VzdG9tIG9ubWVzc2FnZSBmdW5jdGlvbnMgY2FuIGJlIHByb3ZpZGVkIGJ5IHRoZSBkZXZlbG9wZXIuXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcImltcDpcIiwgXCItLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXCIsX2Nvbm5lY3Rpb25Nc2dFdik7XG4gICAgICAgICAgICB2YXIgX21zZ1N0ciA9IF9jb25uZWN0aW9uTXNnRXYuZGF0YTtcbiAgICAgICAgICAgIGlmIChfbXNnU3RyID09IFwicmVzcG9uc2U6XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IC8vcGluZy1wb25nIG1lc3NhZ2VzIGV4Y2hhbmdlZCBpbiBrZWVwQWxpdmVcbiAgICAgICAgICAgIHZhciBldiA9IG51bGw7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0gSlNPTi5wYXJzZShfbXNnU3RyKTtcbiAgICAgICAgICAgICAgICBpZiAoX21zZy5vcC5pbmNsdWRlcyhcIkVWRU5UOjo6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8vbm90IHZhbGlkIG1zZ1xuICAgICAgICAgICAgICAgIHZhciBfbXNnID0ge2Vycm9yOiBlLCBsYWJlbDogYCR7dGhpcy5uYW1lfS1tZXNzYWdlLWVycm9yYH1cbiAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChfbXNnLmxhYmVsLCB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGV2O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICAgICAgaWYgKG1zZy5vcC5pbmNsdWRlcyhcInx8fFwiKSAmJiBtc2cuc3RhdHVzQ29kZSA9PSAyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3JlYXRlRXZlbnRTdWJzY3JpcHRpb24obXNnLm9wKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vbigpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbihcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVyc1ttc2cub3BdICs9IDE7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uQ29ubmVjdCgpIHtcblxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTXVmZmluO1xuIl0sIm5hbWVzIjpbIkxFWElDT04iLCJXZWJNZXNzYWdlIiwiTXVmZmluIiwiTGV4ZW1lIiwidWlkIiwic2VuZGVyIiwicGFyYW1zIiwic3ViamVjdCIsIm9iamVjdGl2ZSIsImludGVyZmFjZSIsInRva2VuIiwicmVxdWVzdCIsInN1YnNjcmliZSIsIkFQSV9MRVhJQ09OIiwiV0VCX01FU1NBR0VfTEVYSUNPTiIsImNvbmZpZyIsInNhbmRib3hfbG9jYWwiLCJob3N0TmFtZSIsInBhdGgiLCJjaGFubmVsSW5zdGFuY2VTaWciLCJhcGlfcHJvdG9jb2wiLCJzYW5kYm94IiwiV2ViUmVxdWVzdFNkayIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsImxhenlsb2FkIiwiZXZlbnRJbnRlcmZhY2UiLCJQb3N0T2ZmaWNlIiwiZ2V0T3JDcmVhdGVJbnRlcmZhY2UiLCJsYWJlbCIsImNsaWVudElkIiwiY2xpZW50X2lkIiwicGFzcyIsImNvbm5lY3RlZFN0b3JlcyIsInVpVmFycyIsImNsb2NrIiwiX2Nvbm5lY3Rpb24iLCJzdGF0ZSIsIl9jb25uZWN0aW9uQWxpdmUiLCJjb25uZWN0IiwiZXZlbnRTdWJzY3JpcHRpb25zIiwiU2V0IiwiZXZlbnRDb3VudGVycyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZmluYWxVcmwiLCJhZGRTb2NrZXQiLCJXZWJTb2NrZXQiLCJhdXRvUmV0cnlPbkNsb3NlIiwic29ja2V0Iiwib25lcnJvciIsImUiLCJtc2ciLCJtZXNzYWdlIiwiZGlzcGF0Y2hNZXNzYWdlIiwib25vcGVuIiwiX2tlZXBBbGl2ZSIsIm9uY2xvc2UiLCJvbm1lc3NhZ2UiLCJfbXNnU3RyIiwiZGF0YSIsIl9tc2ciLCJKU09OIiwicGFyc2UiLCJlcnJvciIsIm9wIiwiaW5jbHVkZXMiLCJjbGVhckludGVydmFsIiwiX2Nvbm5lY3Rpb25LZWVwQWxpdmUiLCJzZXRJbnRlcnZhbCIsInNlbmQiLCJnZXRTZXJpYWxpemFibGVJbnRybyIsIk9iamVjdCIsImtleXMiLCJtYXAiLCJfbGV4ZW1lIiwiX3NjaGVtYSIsInNjaGVtYSIsImZ1bGxOYW1lIiwibmFtZSIsImdldEludHJvIiwiX2dldExleGVtZSIsIl9sZXhlbWVMYWJlbCIsIl9maW5kQW5kSW5mbGVjdExleGVtZSIsImNvbnNvbGUiLCJfc2VsZWN0ZWRMZXhlbWUiLCJfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uIiwiaW5mbGVjdCIsImdlbkZpeHR1cmVzIiwic3RyaW5naWZ5IiwiY29tbXVuaWNhdGUiLCJpbmZsZWN0aW9uIiwidGVzdFN0YXJ0IiwiRGF0ZSIsIm5vdyIsIl9vcExhYmVsIiwiTUFYX1JFU1BPTlNFX1RJTUUiLCJvbiIsInJlc3VsdCIsInNldFRpbWVvdXQiLCJ3ZWJyZXF1ZXN0IiwiX2ludGVyZmFjZSIsIl9yZXF1ZXN0TXNnIiwib3BMYWJlbCIsIl9pbnRlcmZhY2VUeXBlIiwiX3dlYk1zZyIsIl9nZW5lcmF0ZVRva2VuIiwic3RhdHVzQ29kZSIsIndlYnN1YnNjcmliZSIsIl9sb2NhbFNvY2tldE5hbWUiLCJfdGFyZ2V0TXNnTGFiZWwiLCJfbG9jYWxTb2NrZXQiLCJzb2NrZXRzIiwiZ2xvYmFsIiwiX21zZ0xhYmVsIiwiYWxnbyIsIm1zZ0J1ZmZlciIsIlRleHRFbmNvZGVyIiwiZW5jb2RlIiwiaGFzaEJ1ZmZlciIsImNyeXB0byIsInN1YnRsZSIsImRpZ2VzdCIsImhhc2hBcnJheSIsIkFycmF5IiwiZnJvbSIsIlVpbnQ4QXJyYXkiLCJiIiwidG9TdHJpbmciLCJwYWRTdGFydCIsImpvaW4iLCJzdWJzY3JpYmVUb0V2ZW50IiwiY2FsbGJhY2tMaXN0IiwiX3RoaXMiLCJub3RpZmllciIsIm5vdGlmeSIsImNhbGxiYWNrRnVuY3Rpb24iLCJwdXNoIiwiZGVidWciLCJ0YWJsZSIsImNiIiwiX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uIiwiYWRkIiwiX25hbWUiLCJicm9hZGNhc3RNc2ciLCJfY29ubmVjdEhvc3QiLCJsb2ciLCJfY29ubmVjdGlvbk1zZ0V2IiwiZXYiLCJDdXN0b21FdmVudCIsImRldGFpbCIsIm9uQ29ubmVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7SUFBQSxNQUFNQSxPQUFPLEdBQUcsRUFBaEI7SUFFQUEsT0FBTyxDQUFDQyxVQUFSLHFCQUFxQixjQUFjQyxNQUFNLENBQUNDLE1BQXJCLENBQTRCLEVBQWpEO0lBQUE7SUFBQTtJQUFBLFNBQ2tCO0lBRGxCO0lBQUE7SUFBQTtJQUFBLFNBRzRCO0lBQ3BCQyxJQUFBQSxHQUFHLEVBQUUsSUFEZTtJQUVwQkMsSUFBQUEsTUFBTSxFQUFFLElBRlk7SUFHcEJDLElBQUFBLE1BQU0sRUFBRSxFQUhZO0lBSXBCQyxJQUFBQSxPQUFPLEVBQUUsSUFKVztJQUtwQkMsSUFBQUEsU0FBUyxFQUFFO0lBTFM7SUFINUI7SUFBQTtJQUFBO0lBQUEsU0FXb0I7SUFDWkMsSUFBQUEsU0FBUyxFQUFFLElBREM7SUFFWkMsSUFBQUEsS0FBSyxFQUFFLElBRks7SUFHWkMsSUFBQUEsT0FBTyxFQUFFLElBSEc7SUFJWkMsSUFBQUEsU0FBUyxFQUFFO0lBSkM7SUFYcEI7O0lDQUEsTUFBTUMsV0FBVyxHQUFHLEVBQUMsR0FBRyxFQUFKO0lBQVEsS0FBR0M7SUFBWCxDQUFwQjtJQUVBLE1BQU1DLE1BQU0sR0FBRztJQUNYQyxFQUFBQSxhQUFhLEVBQUU7SUFDWEMsSUFBQUEsUUFBUSxFQUFFLGdCQURDO0lBRVhDLElBQUFBLElBQUksRUFBRSxPQUZLO0lBR1hDLElBQUFBLGtCQUFrQixFQUFFLEVBSFQ7SUFJWEMsSUFBQUEsWUFBWSxFQUFFO0lBSkgsR0FESjtJQU9YQyxFQUFBQSxPQUFPLEVBQUU7SUFDTEosSUFBQUEsUUFBUSxFQUFFLHFCQURMO0lBRUxDLElBQUFBLElBQUksRUFBRSxPQUZEO0lBR0xDLElBQUFBLGtCQUFrQixFQUFFLEVBSGY7SUFJTEMsSUFBQUEsWUFBWSxFQUFFO0lBSlQ7SUFQRSxDQUFmO0lBZ0JBbEIsTUFBTSxDQUFD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
