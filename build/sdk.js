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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLnVpZCA9IFwiXCI7XG4gICAgICAgIHRoaXMubGFiZWwgPSBvcHRpb25zLmxhYmVsIHx8IFwiZHJvbmFfc3RvcmVfc2RrX2NsaWVudFwiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5wYXNzID0gXCJcIjtcbiAgICAgICAgdGhpcy5jb25uZWN0ZWRTdG9yZXMgPSBbXTtcbiAgICAgICAgdGhpcy51aVZhcnMgPSB7XG4gICAgICAgICAgICBjbG9jazoge30sXG4gICAgICAgICAgICBjb25maWc6IGNvbmZpZ1tvcHRpb25zLmxhYmVsXVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLnN0YXRlID0gbnVsbDtcbiAgICB9XG5cbiAgICBhc3luYyBjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0KFtdKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVycyA9IHt9O1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbmFsVXJsID0gdGhpcy51aVZhcnMuY29uZmlnLmFwaV9wcm90b2NvbCArIHRoaXMudWlWYXJzLmNvbmZpZy5ob3N0TmFtZSArIFwiL1wiICsgdGhpcy51aVZhcnMuY29uZmlnLnBhdGggKyBcIi9cIiArIHRoaXMuY2xpZW50SWQgKyBcIj9hdXRoPVwiICsgdGhpcy50b2tlblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjb25uZWN0XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGNsb3NlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjbG9zZVwiLCBlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25tZXNzYWdlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZ1N0ciA9IGUuZGF0YTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cilcbiAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctbXNnXCIsIFtfbXNnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBfbXNnKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctZXZlbnRcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBnZXRTZXJpYWxpemFibGVJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuTEVYSUNPTikubWFwKChfbGV4ZW1lKSA9PiB7XG4gICAgICAgICAgICBsZXQgX3NjaGVtYSA9IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5zY2hlbWEucmVxdWVzdCB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGFiZWw6IF9sZXhlbWUsXG4gICAgICAgICAgICAgICAgZnVsbE5hbWU6IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5uYW1lLFxuICAgICAgICAgICAgICAgIHNjaGVtYTogX3NjaGVtYVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXRJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTjtcbiAgICB9XG5cbiAgICBfZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MRVhJQ09OW19sZXhlbWVMYWJlbF07XG4gICAgfVxuXG4gICAgX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBpZiAoIV9sZXhlbWVMYWJlbCB8fCAhX21zZykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIkludmFsaWQgUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lID0gdGhpcy5fZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCk7XG4gICAgICAgIGlmICghX3NlbGVjdGVkTGV4ZW1lKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIFwiVW5rbm93biBSZXF1ZXN0LlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKF9tc2cgPT09IFwicmFuZG9tXCIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdCh7fSk7XG4gICAgICAgICAgICAgICAgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbi5nZW5GaXh0dXJlcygpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiA9IF9zZWxlY3RlZExleGVtZS5pbmZsZWN0KF9tc2cpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uc3RyaW5naWZ5KCk7XG4gICAgfVxuXG4gICAgY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKSB7XG4gICAgICAgIC8vIHRyeXtcbiAgICAgICAgLy8gXHRKU09OLnBhcnNlKF9tc2cpO1xuICAgICAgICAvLyB9Y2F0Y2goZSl7XG4gICAgICAgIC8vIFx0bGV0IG1zZyA9IFwiaW52YWxpZCBqc29uIHBheWxvYWRcIjtcbiAgICAgICAgLy8gXHRjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIG1zZyk7XG4gICAgICAgIC8vIFx0cmV0dXJuO1xuICAgICAgICAvLyB9XG4gICAgICAgIGxldCBpbmZsZWN0aW9uID0gdGhpcy5fZmluZEFuZEluZmxlY3RMZXhlbWUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgaWYgKCFpbmZsZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51aVZhcnMuY2xvY2sudGVzdFN0YXJ0ID0gRGF0ZS5ub3coKSAvIDEwMDA7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChpbmZsZWN0aW9uKTtcbiAgICB9XG5cbiAgICBhc3luYyByZXF1ZXN0KF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwsIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICBpZighX29wTGFiZWwpe1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHttZXNzYWdlOiBcIk1lc3NhZ2Ugc2VudC4gTm8gcmVzcF9vcCBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6YE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnJlcXVlc3QoX2ludGVyZmFjZSwgX3JlcXVlc3RNc2csIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBpZighX2ludGVyZmFjZSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7ZXJyb3I6IFwiTm8gSW50ZXJmYWNlIHByb3ZpZGVkLlwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKCFfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpICYmICFfaW50ZXJmYWNlLmluY2x1ZGVzKFwifHx8XCIpKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJJbnZhbGlkIEludGVyZmFjZSBwcm92aWRlZFwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfb3BMYWJlbCA9IG9wdGlvbnMub3BMYWJlbCB8fCBfaW50ZXJmYWNlO1xuXG4gICAgICAgICAgICB2YXIgX2ludGVyZmFjZVR5cGU7XG5cbiAgICAgICAgICAgIGlmKF9pbnRlcmZhY2UuaW5jbHVkZXMoXCI6OjpcIikpe1xuICAgICAgICAgICAgICAgIF9pbnRlcmZhY2VUeXBlID0gXCJyZWNlcHRpdmVcIjtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJpbnRlcmZhY2VcIiA6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWVzdFwiIDogX3JlcXVlc3RNc2csXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgX2ludGVyZmFjZVR5cGUgPSBcImV4cHJlc3NpdmVcIjtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJzdWJzY3JpYmVcIiA6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jb21tdW5pY2F0ZShcIldlYk1lc3NhZ2VcIiwgX3dlYk1zZyk7XG5cbiAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1tc2dcIiwgKG1zZykgPT4ge1xuICAgICAgICAgICAgICAgIGlmKF9pbnRlcmZhY2VUeXBlID09IFwicmVjZXB0aXZlXCIpe1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9ZWxzZSBpZihfaW50ZXJmYWNlVHlwZSA9PSBcImV4cHJlc3NpdmVcIil7XG4gICAgICAgICAgICAgICAgICAgIGlmKG1zZy5vcCA9PSBfb3BMYWJlbCAmJiBtc2cuc3RhdHVzQ29kZSA9PSAyKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG1zZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6YE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnN1YnNjcmliZShfaW50ZXJmYWNlLCBfbG9jYWxTb2NrZXROYW1lPVwiZ2xvYmFsXCIsIF90YXJnZXRNc2dMYWJlbCwgb3B0aW9ucyA9IHtNQVhfUkVTUE9OU0VfVElNRTogNTAwMH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLndlYnJlcXVlc3QoX2ludGVyZmFjZSlcbiAgICAgICAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgX2xvY2FsU29ja2V0ID0gTXVmZmluLlBvc3RPZmZpY2Uuc29ja2V0c1tfbG9jYWxTb2NrZXROYW1lXSB8fCBNdWZmaW4uUG9zdE9mZmljZS5zb2NrZXRzLmdsb2JhbDtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImluY29taW5nLWV2ZW50XCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBgRVZFTlQ6Ojoke19pbnRlcmZhY2V9YCkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgX21zZ0xhYmVsID0gX3RhcmdldE1zZ0xhYmVsIHx8IG1zZy5vcDtcbiAgICAgICAgICAgICAgICAgICAgX2xvY2FsU29ja2V0LmRpc3BhdGNoTWVzc2FnZShfbXNnTGFiZWwsIG1zZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHRydWUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyBfZ2VuZXJhdGVUb2tlbihtZXNzYWdlLCBvcHRpb25zID0ge2FsZ286IFwiU0hBLTI1NlwifSkge1xuICAgICAgICBjb25zdCBtc2dCdWZmZXIgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUobWVzc2FnZSk7ICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgY29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KG9wdGlvbnMuYWxnbywgbXNnQnVmZmVyKTtcbiAgICAgICAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gICAgICAgIHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKSkuam9pbignJyk7XG4gICAgfVxuXG4gICAgc3Vic2NyaWJlVG9FdmVudCgpe1xuICAgICAgICBsZXQgY2FsbGJhY2tMaXN0ID0gW107XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIGNvbnN0IG5vdGlmaWVyID0ge1xuICAgICAgICAgICAgbm90aWZ5OiBmdW5jdGlvbihjYWxsYmFja0Z1bmN0aW9uLCBfbGV4ZW1lTGFiZWwsIF9tc2csIF9vcExhYmVsKSB7XG4gICAgICAgICAgICAgICAgX3RoaXMuY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFja0xpc3QucHVzaCh7Y2FsbGJhY2tGdW5jdGlvbiwgX29wTGFiZWx9KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiKioqKioqKioqKioqKioqKiogQ2FsbGJhY2sgRXZlbnQgVGFibGUgKioqKioqKioqKioqKioqKioqKioqKioqXCIpXG4gICAgICAgICAgICAgICAgY29uc29sZS50YWJsZShjYWxsYmFja0xpc3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctZXZlbnRcIiwgKG1zZyk9PntcbiAgICAgICAgICAgIGZvciAobGV0IGNiIG9mIGNhbGxiYWNrTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmKG1zZy5vcCA9PT0gY2IuX29wTGFiZWwpXG4gICAgICAgICAgICAgICAgICAgIGNiLmNhbGxiYWNrRnVuY3Rpb24obXNnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuIG5vdGlmaWVyO1xuICAgIH1cblxuICAgIF9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbihfbXNnKSB7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50U3Vic2NyaXB0aW9ucy5hZGQoX25hbWUpO1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzW2BFVkVOVDo6OiR7X25hbWV9YF0gPSAwO1xuICAgICAgICBNdWZmaW4uUG9zdE9mZmljZS5zb2NrZXRzLmdsb2JhbC5icm9hZGNhc3RNc2coXCJzdWJzY3JpcHRpb24tY3JlYXRlZFwiLCBfbXNnKTtcbiAgICB9XG5cbiAgICBfY29ubmVjdEhvc3QoKSB7XG4gICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGluZyB3aXRoIGFwaSBob3N0YDtcblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGZhaWxlZDogJHtlLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1wOlwiLCBtc2cpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25vcGVuID0gKGUpID0+IHtcbiAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uY2xvc2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGNsb3NlZGA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25tZXNzYWdlID0gKF9jb25uZWN0aW9uTXNnRXYpID0+IHsgLy9jdXN0b20gb25tZXNzYWdlIGZ1bmN0aW9ucyBjYW4gYmUgcHJvdmlkZWQgYnkgdGhlIGRldmVsb3Blci5cbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwiaW1wOlwiLCBcIi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cIixfY29ubmVjdGlvbk1zZ0V2KTtcbiAgICAgICAgICAgIHZhciBfbXNnU3RyID0gX2Nvbm5lY3Rpb25Nc2dFdi5kYXRhO1xuICAgICAgICAgICAgaWYgKF9tc2dTdHIgPT0gXCJyZXNwb25zZTpcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH0gLy9waW5nLXBvbmcgbWVzc2FnZXMgZXhjaGFuZ2VkIGluIGtlZXBBbGl2ZVxuICAgICAgICAgICAgdmFyIGV2ID0gbnVsbDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9tc2cgPSBKU09OLnBhcnNlKF9tc2dTdHIpO1xuICAgICAgICAgICAgICAgIGlmIChfbXNnLm9wLmluY2x1ZGVzKFwiRVZFTlQ6OjpcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoXCJpbmNvbWluZy1ob3N0YWdlbnQtZXZlbnQtbXNnXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogX21zZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChcImluY29taW5nLWhvc3RhZ2VudC1yZXNwb25zZS1tc2dcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgLy9ub3QgdmFsaWQgbXNnXG4gICAgICAgICAgICAgICAgdmFyIF9tc2cgPSB7ZXJyb3I6IGUsIGxhYmVsOiBgJHt0aGlzLm5hbWV9LW1lc3NhZ2UtZXJyb3JgfVxuICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KF9tc2cubGFiZWwsIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZXY7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uKFwiaW5jb21pbmctaG9zdGFnZW50LXJlc3BvbnNlLW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICAvLyB0aGlzLnVpVmFycy5ob3N0YWdlbnRSZXNwb25zZU1zZ0xvZ0VsLmFwcGVuZENoaWxkKHRhYmxlSHRtbCk7XG4gICAgICAgICAgICBpZiAobXNnLm9wLmluY2x1ZGVzKFwifHx8XCIpICYmIG1zZy5zdGF0dXNDb2RlID09IDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbihtc2cub3ApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aGlzLm9uKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cblxuICAgICAgICB0aGlzLl9jb25uZWN0aW9uLm9uKFwiaW5jb21pbmctaG9zdGFnZW50LWV2ZW50LW1zZ1wiLCAobXNnKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnVpVmFycy5ldmVudENvdW50ZXJzW21zZy5vcF0gKz0gMTtcbiAgICAgICAgICAgIC8vIHRoaXMudWlWYXJzLmhvc3RhZ2VudFJlc3BvbnNlTXNnTG9nRWwuYXBwZW5kQ2hpbGQodGFibGVIdG1sKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgb25Db25uZWN0KCkge1xuXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNdWZmaW47XG4iXSwibmFtZXMiOlsiTEVYSUNPTiIsIldlYk1lc3NhZ2UiLCJNdWZmaW4iLCJMZXhlbWUiLCJ1aWQiLCJzZW5kZXIiLCJwYXJhbXMiLCJzdWJqZWN0Iiwib2JqZWN0aXZlIiwiaW50ZXJmYWNlIiwidG9rZW4iLCJyZXF1ZXN0Iiwic3Vic2NyaWJlIiwiQVBJX0xFWElDT04iLCJXRUJfTUVTU0FHRV9MRVhJQ09OIiwiY29uZmlnIiwic2FuZGJveF9sb2NhbCIsImhvc3ROYW1lIiwicGF0aCIsImNoYW5uZWxJbnN0YW5jZVNpZyIsImFwaV9wcm90b2NvbCIsInNhbmRib3giLCJXZWJSZXF1ZXN0U2RrIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibGF6eWxvYWQiLCJldmVudEludGVyZmFjZSIsIlBvc3RPZmZpY2UiLCJnZXRPckNyZWF0ZUludGVyZmFjZSIsImxhYmVsIiwiY2xpZW50SWQiLCJjbGllbnRfaWQiLCJwYXNzIiwiY29ubmVjdGVkU3RvcmVzIiwidWlWYXJzIiwiY2xvY2siLCJfY29ubmVjdGlvbiIsInN0YXRlIiwiY29ubmVjdCIsImV2ZW50U3Vic2NyaXB0aW9ucyIsIlNldCIsImV2ZW50Q291bnRlcnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImZpbmFsVXJsIiwiYWRkU29ja2V0IiwiV2ViU29ja2V0IiwiYXV0b1JldHJ5T25DbG9zZSIsInNvY2tldCIsIm9uZXJyb3IiLCJlIiwibXNnIiwibWVzc2FnZSIsImRpc3BhdGNoTWVzc2FnZSIsIm9ub3BlbiIsIm9uY2xvc2UiLCJvbm1lc3NhZ2UiLCJfbXNnU3RyIiwiZGF0YSIsIl9tc2ciLCJKU09OIiwicGFyc2UiLCJlcnJvciIsIm9wIiwiaW5jbHVkZXMiLCJnZXRTZXJpYWxpemFibGVJbnRybyIsIk9iamVjdCIsImtleXMiLCJtYXAiLCJfbGV4ZW1lIiwiX3NjaGVtYSIsInNjaGVtYSIsImZ1bGxOYW1lIiwibmFtZSIsImdldEludHJvIiwiX2dldExleGVtZSIsIl9sZXhlbWVMYWJlbCIsIl9maW5kQW5kSW5mbGVjdExleGVtZSIsImNvbnNvbGUiLCJfc2VsZWN0ZWRMZXhlbWUiLCJfc2VsZWN0ZWRMZXhlbWVJbmZsZWN0aW9uIiwiaW5mbGVjdCIsImdlbkZpeHR1cmVzIiwic3RyaW5naWZ5IiwiY29tbXVuaWNhdGUiLCJpbmZsZWN0aW9uIiwidGVzdFN0YXJ0IiwiRGF0ZSIsIm5vdyIsInNlbmQiLCJfb3BMYWJlbCIsIk1BWF9SRVNQT05TRV9USU1FIiwib24iLCJyZXN1bHQiLCJzZXRUaW1lb3V0Iiwid2VicmVxdWVzdCIsIl9pbnRlcmZhY2UiLCJfcmVxdWVzdE1zZyIsIm9wTGFiZWwiLCJfaW50ZXJmYWNlVHlwZSIsIl93ZWJNc2ciLCJfZ2VuZXJhdGVUb2tlbiIsInN0YXR1c0NvZGUiLCJ3ZWJzdWJzY3JpYmUiLCJfbG9jYWxTb2NrZXROYW1lIiwiX3RhcmdldE1zZ0xhYmVsIiwiX2xvY2FsU29ja2V0Iiwic29ja2V0cyIsImdsb2JhbCIsIl9tc2dMYWJlbCIsImFsZ28iLCJtc2dCdWZmZXIiLCJUZXh0RW5jb2RlciIsImVuY29kZSIsImhhc2hCdWZmZXIiLCJjcnlwdG8iLCJzdWJ0bGUiLCJkaWdlc3QiLCJoYXNoQXJyYXkiLCJBcnJheSIsImZyb20iLCJVaW50OEFycmF5IiwiYiIsInRvU3RyaW5nIiwicGFkU3RhcnQiLCJqb2luIiwic3Vic2NyaWJlVG9FdmVudCIsImNhbGxiYWNrTGlzdCIsIl90aGlzIiwibm90aWZpZXIiLCJub3RpZnkiLCJjYWxsYmFja0Z1bmN0aW9uIiwicHVzaCIsImRlYnVnIiwidGFibGUiLCJjYiIsIl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbiIsImFkZCIsIl9uYW1lIiwiYnJvYWRjYXN0TXNnIiwiX2Nvbm5lY3RIb3N0IiwibG9nIiwiX2Nvbm5lY3Rpb25Nc2dFdiIsImV2IiwiQ3VzdG9tRXZlbnQiLCJkZXRhaWwiLCJvbkNvbm5lY3QiXSwibWFwcGluZ3MiOiI7Ozs7O0lBQUEsTUFBTUEsT0FBTyxHQUFHLEVBQWhCO0lBRUFBLE9BQU8sQ0FBQ0MsVUFBUixxQkFBcUIsY0FBY0MsTUFBTSxDQUFDQyxNQUFyQixDQUE0QixFQUFqRDtJQUFBO0lBQUE7SUFBQSxTQUNrQjtJQURsQjtJQUFBO0lBQUE7SUFBQSxTQUc0QjtJQUNwQkMsSUFBQUEsR0FBRyxFQUFFLElBRGU7SUFFcEJDLElBQUFBLE1BQU0sRUFBRSxJQUZZO0lBR3BCQyxJQUFBQSxNQUFNLEVBQUUsRUFIWTtJQUlwQkMsSUFBQUEsT0FBTyxFQUFFLElBSlc7SUFLcEJDLElBQUFBLFNBQVMsRUFBRTtJQUxTO0lBSDVCO0lBQUE7SUFBQTtJQUFBLFNBV29C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
