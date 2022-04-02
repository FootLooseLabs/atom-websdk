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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2RrLmpzIiwic291cmNlcyI6WyIuLi9zcmMvbGV4aWNvbi5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IExFWElDT04gPSB7fTtcblxuTEVYSUNPTi5XZWJNZXNzYWdlID0gY2xhc3MgZXh0ZW5kcyBNdWZmaW4uTGV4ZW1lIHtcbiAgICBzdGF0aWMgbmFtZSA9IFwiXCI7XG5cbiAgICBzdGF0aWMgcmVxdWVzdF9zY2hlbWEgPSB7XG4gICAgICAgIHVpZDogbnVsbCxcbiAgICAgICAgc2VuZGVyOiBudWxsLFxuICAgICAgICBwYXJhbXM6IHt9LFxuICAgICAgICBzdWJqZWN0OiBudWxsLFxuICAgICAgICBvYmplY3RpdmU6IHt9XG4gICAgfVxuXG4gICAgc3RhdGljIHNjaGVtYSA9IHtcbiAgICAgICAgaW50ZXJmYWNlOiBudWxsLFxuICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgcmVxdWVzdDogbnVsbCxcbiAgICAgICAgc3Vic2NyaWJlOiBudWxsLFxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTEVYSUNPTjtcbiIsImltcG9ydCBXRUJfTUVTU0FHRV9MRVhJQ09OIGZyb20gXCIuL2xleGljb25cIjtcblxuY29uc3QgQVBJX0xFWElDT04gPSB7Li4ue30sIC4uLldFQl9NRVNTQUdFX0xFWElDT059O1xuXG5jb25zdCBjb25maWcgPSB7XG4gICAgc2FuZGJveF9sb2NhbDoge1xuICAgICAgICBob3N0TmFtZTogXCJsb2NhbGhvc3Q6ODg3N1wiLFxuICAgICAgICBwYXRoOiBcIndzYXBpXCIsXG4gICAgICAgIGNoYW5uZWxJbnN0YW5jZVNpZzogMTIsXG4gICAgICAgIGFwaV9wcm90b2NvbDogXCJ3czovL1wiXG4gICAgfSxcbiAgICBzYW5kYm94OiB7XG4gICAgICAgIGhvc3ROYW1lOiBcIndzYXBpLmZvb3Rsb29zZS5pby9cIixcbiAgICAgICAgcGF0aDogXCJ3c2FwaVwiLFxuICAgICAgICBjaGFubmVsSW5zdGFuY2VTaWc6IDEyLFxuICAgICAgICBhcGlfcHJvdG9jb2w6IFwid3NzOi8vXCJcbiAgICB9XG59XG5cblxuTXVmZmluLldlYlJlcXVlc3RTZGsgPSBjbGFzcyB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBsYXp5bG9hZCA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZSA9IFBvc3RPZmZpY2UuZ2V0T3JDcmVhdGVJbnRlcmZhY2UoXCJXZWJSZXF1ZXN0U2RrXCIpXG4gICAgICAgIHRoaXMuTEVYSUNPTiA9IEFQSV9MRVhJQ09OO1xuICAgICAgICB0aGlzLnVpZCA9IFwiXCI7XG4gICAgICAgIHRoaXMubGFiZWwgPSBvcHRpb25zLmxhYmVsIHx8IFwiZHJvbmFfc3RvcmVfc2RrX2NsaWVudFwiO1xuICAgICAgICB0aGlzLmNsaWVudElkID0gb3B0aW9ucy5jbGllbnRfaWQgfHwgXCJcIjtcbiAgICAgICAgdGhpcy50b2tlbiA9IG9wdGlvbnMudG9rZW4gfHwgXCJcIjtcbiAgICAgICAgdGhpcy5wYXNzID0gXCJcIjtcbiAgICAgICAgdGhpcy5jb25uZWN0ZWRTdG9yZXMgPSBbXTtcbiAgICAgICAgdGhpcy51aVZhcnMgPSB7XG4gICAgICAgICAgICBjbG9jazoge30sXG4gICAgICAgICAgICBjb25maWc6IGNvbmZpZ1tvcHRpb25zLmxhYmVsXVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLnN0YXRlID0gbnVsbDtcbiAgICB9XG5cbiAgICBhc3luYyBjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnVpVmFycy5ldmVudFN1YnNjcmlwdGlvbnMgPSBuZXcgU2V0KFtdKTtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRDb3VudGVycyA9IHt9O1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbmFsVXJsID0gdGhpcy51aVZhcnMuY29uZmlnLmFwaV9wcm90b2NvbCArIHRoaXMudWlWYXJzLmNvbmZpZy5ob3N0TmFtZSArIFwiL1wiICsgdGhpcy51aVZhcnMuY29uZmlnLnBhdGggKyBcIi9cIiArIHRoaXMuY2xpZW50SWQgKyBcIj9hdXRoPVwiICsgdGhpcy50b2tlblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbiA9IE11ZmZpbi5Qb3N0T2ZmaWNlLmFkZFNvY2tldChXZWJTb2NrZXQsIHRoaXMubGFiZWwsIGZpbmFsVXJsKTtcbiAgICAgICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uYXV0b1JldHJ5T25DbG9zZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBlO1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7c3RhdGU6IHRoaXMuc3RhdGUsIG1zZzogbXNnfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25uZWN0aW9uLnNvY2tldC5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBtc2cgPSBgY29ubmVjdGlvbiBlc3RhYmxpc2hlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjb25uZWN0XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGNsb3NlZGA7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGU7XG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5kaXNwYXRjaE1lc3NhZ2UoXCJjbG9zZVwiLCBlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtzdGF0ZTogdGhpcy5zdGF0ZSwgbXNnOiBtc2d9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5zb2NrZXQub25tZXNzYWdlID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZ1N0ciA9IGUuZGF0YTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cilcbiAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgX21zZylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctbXNnXCIsIFtfbXNnXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLmRpc3BhdGNoTWVzc2FnZShcImluY29taW5nLW1zZ1wiLCBfbXNnKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctZXZlbnRcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiaW5jb21pbmctcmVzcG9uc2VcIiwgX21zZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2UuZGlzcGF0Y2hNZXNzYWdlKFwiZXJyb3JcIiwgZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICBnZXRTZXJpYWxpemFibGVJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuTEVYSUNPTikubWFwKChfbGV4ZW1lKSA9PiB7XG4gICAgICAgICAgICBsZXQgX3NjaGVtYSA9IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5zY2hlbWEucmVxdWVzdCB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGFiZWw6IF9sZXhlbWUsXG4gICAgICAgICAgICAgICAgZnVsbE5hbWU6IHRoaXMuTEVYSUNPTltfbGV4ZW1lXS5uYW1lLFxuICAgICAgICAgICAgICAgIHNjaGVtYTogX3NjaGVtYVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXRJbnRybygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuTEVYSUNPTjtcbiAgICB9XG5cbiAgICBfZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCkge1xuICAgICAgICByZXR1cm4gdGhpcy5MRVhJQ09OW19sZXhlbWVMYWJlbF07XG4gICAgfVxuXG4gICAgX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lKF9sZXhlbWVMYWJlbCwgX21zZykge1xuICAgICAgICBpZiAoIV9sZXhlbWVMYWJlbCB8fCAhX21zZykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBcIkludmFsaWQgUmVxdWVzdC5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lID0gdGhpcy5fZ2V0TGV4ZW1lKF9sZXhlbWVMYWJlbCk7XG4gICAgICAgIGlmICghX3NlbGVjdGVkTGV4ZW1lKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIFwiVW5rbm93biBSZXF1ZXN0LlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKF9tc2cgPT09IFwicmFuZG9tXCIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24gPSBfc2VsZWN0ZWRMZXhlbWUuaW5mbGVjdCh7fSk7XG4gICAgICAgICAgICAgICAgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbi5nZW5GaXh0dXJlcygpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX3NlbGVjdGVkTGV4ZW1lSW5mbGVjdGlvbiA9IF9zZWxlY3RlZExleGVtZS5pbmZsZWN0KF9tc2cpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIF9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24uc3RyaW5naWZ5KCk7XG4gICAgfVxuXG4gICAgY29tbXVuaWNhdGUoX2xleGVtZUxhYmVsLCBfbXNnKSB7XG4gICAgICAgIC8vIHRyeXtcbiAgICAgICAgLy8gXHRKU09OLnBhcnNlKF9tc2cpO1xuICAgICAgICAvLyB9Y2F0Y2goZSl7XG4gICAgICAgIC8vIFx0bGV0IG1zZyA9IFwiaW52YWxpZCBqc29uIHBheWxvYWRcIjtcbiAgICAgICAgLy8gXHRjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIG1zZyk7XG4gICAgICAgIC8vIFx0cmV0dXJuO1xuICAgICAgICAvLyB9XG4gICAgICAgIGxldCBpbmZsZWN0aW9uID0gdGhpcy5fZmluZEFuZEluZmxlY3RMZXhlbWUoX2xleGVtZUxhYmVsLCBfbXNnKTtcbiAgICAgICAgaWYgKCFpbmZsZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51aVZhcnMuY2xvY2sudGVzdFN0YXJ0ID0gRGF0ZS5ub3coKSAvIDEwMDA7XG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChpbmZsZWN0aW9uKTtcbiAgICB9XG5cbiAgICBhc3luYyByZXF1ZXN0KF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwsIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNvbW11bmljYXRlKF9sZXhlbWVMYWJlbCwgX21zZyk7XG4gICAgICAgICAgICBpZighX29wTGFiZWwpe1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKHttZXNzYWdlOiBcIk1lc3NhZ2Ugc2VudC4gTm8gcmVzcF9vcCBwcm92aWRlZC5cIn0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6YE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIHdlYnJlcXVlc3QoX2ludGVyZmFjZSwgX3JlcXVlc3RNc2csIG9wdGlvbnMgPSB7TUFYX1JFU1BPTlNFX1RJTUU6IDUwMDB9KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBpZighX2ludGVyZmFjZSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCh7ZXJyb3I6IFwiTm8gSW50ZXJmYWNlIHByb3ZpZGVkLlwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKCFfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpICYmICFfaW50ZXJmYWNlLmluY2x1ZGVzKFwifHx8XCIpKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KHtlcnJvcjogXCJJbnZhbGlkIEludGVyZmFjZSBwcm92aWRlZFwifSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfb3BMYWJlbCA9IG9wdGlvbnMub3BMYWJlbCB8fCBfaW50ZXJmYWNlO1xuXG4gICAgICAgICAgICBpZihfaW50ZXJmYWNlLmluY2x1ZGVzKFwiOjo6XCIpKXtcbiAgICAgICAgICAgICAgICB2YXIgX3dlYk1zZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJpbnRlcmZhY2VcIiA6IF9pbnRlcmZhY2UsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWVzdFwiIDogX3JlcXVlc3RNc2csXG4gICAgICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdGhpcy5fZ2VuZXJhdGVUb2tlbihfaW50ZXJmYWNlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIF93ZWJNc2cgPSB7XG4gICAgICAgICAgICAgICAgICAgIFwic3Vic2NyaWJlXCIgOiBfaW50ZXJmYWNlLFxuICAgICAgICAgICAgICAgICAgICBcInRva2VuXCI6IHRoaXMuX2dlbmVyYXRlVG9rZW4oX2ludGVyZmFjZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY29tbXVuaWNhdGUoXCJXZWJNZXNzYWdlXCIsIF93ZWJNc2cpO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50SW50ZXJmYWNlLm9uKFwiaW5jb21pbmctbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cucmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUobXNnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5ldmVudEludGVyZmFjZS5vbihcImVycm9yXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobXNnLm9wID09PSBfb3BMYWJlbCAmJiBtc2cuZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG1zZylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3Qoe21lc3NhZ2U6YE5vIHJlc3BvbnNlIHJlY2VpdmVkIGluICR7b3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSAvIDEwMDB9c2B9KVxuICAgICAgICAgICAgfSwgb3B0aW9ucy5NQVhfUkVTUE9OU0VfVElNRSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIF9nZW5lcmF0ZVRva2VuKG1lc3NhZ2UsIG9wdGlvbnMgPSB7YWxnbzogXCJTSEEtMjU2XCJ9KSB7XG4gICAgICAgIGNvbnN0IG1zZ0J1ZmZlciA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShtZXNzYWdlKTsgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICBjb25zdCBoYXNoQnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3Qob3B0aW9ucy5hbGdvLCBtc2dCdWZmZXIpO1xuICAgICAgICBjb25zdCBoYXNoQXJyYXkgPSBBcnJheS5mcm9tKG5ldyBVaW50OEFycmF5KGhhc2hCdWZmZXIpKTtcbiAgICAgICAgcmV0dXJuIGhhc2hBcnJheS5tYXAoYiA9PiBiLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpKS5qb2luKCcnKTtcbiAgICB9XG5cbiAgICBzdWJzY3JpYmVUb0V2ZW50KCl7XG4gICAgICAgIGxldCBjYWxsYmFja0xpc3QgPSBbXTtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcbiAgICAgICAgY29uc3Qgbm90aWZpZXIgPSB7XG4gICAgICAgICAgICBub3RpZnk6IGZ1bmN0aW9uKGNhbGxiYWNrRnVuY3Rpb24sIF9sZXhlbWVMYWJlbCwgX21zZywgX29wTGFiZWwpIHtcbiAgICAgICAgICAgICAgICBfdGhpcy5jb21tdW5pY2F0ZShfbGV4ZW1lTGFiZWwsIF9tc2cpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrTGlzdC5wdXNoKHtjYWxsYmFja0Z1bmN0aW9uLCBfb3BMYWJlbH0pO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCIqKioqKioqKioqKioqKioqKiBDYWxsYmFjayBFdmVudCBUYWJsZSAqKioqKioqKioqKioqKioqKioqKioqKipcIilcbiAgICAgICAgICAgICAgICBjb25zb2xlLnRhYmxlKGNhbGxiYWNrTGlzdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZXZlbnRJbnRlcmZhY2Uub24oXCJpbmNvbWluZy1ldmVudFwiLCAobXNnKT0+e1xuICAgICAgICAgICAgZm9yIChsZXQgY2Igb2YgY2FsbGJhY2tMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYobXNnLm9wID09PSBjYi5fb3BMYWJlbClcbiAgICAgICAgICAgICAgICAgICAgY2IuY2FsbGJhY2tGdW5jdGlvbihtc2cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICByZXR1cm4gbm90aWZpZXI7XG4gICAgfVxuXG4gICAgX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uKF9tc2cpIHtcbiAgICAgICAgdGhpcy51aVZhcnMuZXZlbnRTdWJzY3JpcHRpb25zLmFkZChfbmFtZSk7XG4gICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnNbYEVWRU5UOjo6JHtfbmFtZX1gXSA9IDA7XG4gICAgICAgIE11ZmZpbi5Qb3N0T2ZmaWNlLnNvY2tldHMuZ2xvYmFsLmJyb2FkY2FzdE1zZyhcInN1YnNjcmlwdGlvbi1jcmVhdGVkXCIsIF9tc2cpO1xuICAgIH1cblxuICAgIF9jb25uZWN0SG9zdCgpIHtcbiAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW5nIHdpdGggYXBpIGhvc3RgO1xuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25lcnJvciA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gZmFpbGVkOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJpbXA6XCIsIG1zZyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbm9wZW4gPSAoZSkgPT4ge1xuICAgICAgICAgICAgbGV0IG1zZyA9IGBjb25uZWN0aW9uIGVzdGFibGlzaGVkYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICAgICAgICBsZXQgbXNnID0gYGNvbm5lY3Rpb24gY2xvc2VkYDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdGhpcy5fY29ubmVjdGlvbi5vbm1lc3NhZ2UgPSAoX2Nvbm5lY3Rpb25Nc2dFdikgPT4geyAvL2N1c3RvbSBvbm1lc3NhZ2UgZnVuY3Rpb25zIGNhbiBiZSBwcm92aWRlZCBieSB0aGUgZGV2ZWxvcGVyLlxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJpbXA6XCIsIFwiLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVwiLF9jb25uZWN0aW9uTXNnRXYpO1xuICAgICAgICAgICAgdmFyIF9tc2dTdHIgPSBfY29ubmVjdGlvbk1zZ0V2LmRhdGE7XG4gICAgICAgICAgICBpZiAoX21zZ1N0ciA9PSBcInJlc3BvbnNlOlwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSAvL3BpbmctcG9uZyBtZXNzYWdlcyBleGNoYW5nZWQgaW4ga2VlcEFsaXZlXG4gICAgICAgICAgICB2YXIgZXYgPSBudWxsO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgX21zZyA9IEpTT04ucGFyc2UoX21zZ1N0cik7XG4gICAgICAgICAgICAgICAgaWYgKF9tc2cub3AuaW5jbHVkZXMoXCJFVkVOVDo6OlwiKSkge1xuICAgICAgICAgICAgICAgICAgICBldiA9IG5ldyBDdXN0b21FdmVudChcImluY29taW5nLWhvc3RhZ2VudC1ldmVudC1tc2dcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiBfbXNnXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ID0gbmV3IEN1c3RvbUV2ZW50KFwiaW5jb21pbmctaG9zdGFnZW50LXJlc3BvbnNlLW1zZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyAvL25vdCB2YWxpZCBtc2dcbiAgICAgICAgICAgICAgICB2YXIgX21zZyA9IHtlcnJvcjogZSwgbGFiZWw6IGAke3RoaXMubmFtZX0tbWVzc2FnZS1lcnJvcmB9XG4gICAgICAgICAgICAgICAgZXYgPSBuZXcgQ3VzdG9tRXZlbnQoX21zZy5sYWJlbCwge1xuICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IF9tc2dcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBldjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub24oXCJpbmNvbWluZy1ob3N0YWdlbnQtcmVzcG9uc2UtbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIC8vIHRoaXMudWlWYXJzLmhvc3RhZ2VudFJlc3BvbnNlTXNnTG9nRWwuYXBwZW5kQ2hpbGQodGFibGVIdG1sKTtcbiAgICAgICAgICAgIGlmIChtc2cub3AuaW5jbHVkZXMoXCJ8fHxcIikgJiYgbXNnLnN0YXR1c0NvZGUgPT0gMikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NyZWF0ZUV2ZW50U3Vic2NyaXB0aW9uKG1zZy5vcCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHRoaXMub24oKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIHRoaXMuX2Nvbm5lY3Rpb24ub24oXCJpbmNvbWluZy1ob3N0YWdlbnQtZXZlbnQtbXNnXCIsIChtc2cpID0+IHtcbiAgICAgICAgICAgIHRoaXMudWlWYXJzLmV2ZW50Q291bnRlcnNbbXNnLm9wXSArPSAxO1xuICAgICAgICAgICAgLy8gdGhpcy51aVZhcnMuaG9zdGFnZW50UmVzcG9uc2VNc2dMb2dFbC5hcHBlbmRDaGlsZCh0YWJsZUh0bWwpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbkNvbm5lY3QoKSB7XG5cbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE11ZmZpbjtcbiJdLCJuYW1lcyI6WyJMRVhJQ09OIiwiV2ViTWVzc2FnZSIsIk11ZmZpbiIsIkxleGVtZSIsInVpZCIsInNlbmRlciIsInBhcmFtcyIsInN1YmplY3QiLCJvYmplY3RpdmUiLCJpbnRlcmZhY2UiLCJ0b2tlbiIsInJlcXVlc3QiLCJzdWJzY3JpYmUiLCJBUElfTEVYSUNPTiIsIldFQl9NRVNTQUdFX0xFWElDT04iLCJjb25maWciLCJzYW5kYm94X2xvY2FsIiwiaG9zdE5hbWUiLCJwYXRoIiwiY2hhbm5lbEluc3RhbmNlU2lnIiwiYXBpX3Byb3RvY29sIiwic2FuZGJveCIsIldlYlJlcXVlc3RTZGsiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJsYXp5bG9hZCIsImV2ZW50SW50ZXJmYWNlIiwiUG9zdE9mZmljZSIsImdldE9yQ3JlYXRlSW50ZXJmYWNlIiwibGFiZWwiLCJjbGllbnRJZCIsImNsaWVudF9pZCIsInBhc3MiLCJjb25uZWN0ZWRTdG9yZXMiLCJ1aVZhcnMiLCJjbG9jayIsIl9jb25uZWN0aW9uIiwic3RhdGUiLCJjb25uZWN0IiwiZXZlbnRTdWJzY3JpcHRpb25zIiwiU2V0IiwiZXZlbnRDb3VudGVycyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZmluYWxVcmwiLCJhZGRTb2NrZXQiLCJXZWJTb2NrZXQiLCJhdXRvUmV0cnlPbkNsb3NlIiwic29ja2V0Iiwib25lcnJvciIsImUiLCJtc2ciLCJtZXNzYWdlIiwiZGlzcGF0Y2hNZXNzYWdlIiwib25vcGVuIiwib25jbG9zZSIsIm9ubWVzc2FnZSIsIl9tc2dTdHIiLCJkYXRhIiwiX21zZyIsIkpTT04iLCJwYXJzZSIsImVycm9yIiwib3AiLCJpbmNsdWRlcyIsImdldFNlcmlhbGl6YWJsZUludHJvIiwiT2JqZWN0Iiwia2V5cyIsIm1hcCIsIl9sZXhlbWUiLCJfc2NoZW1hIiwic2NoZW1hIiwiZnVsbE5hbWUiLCJuYW1lIiwiZ2V0SW50cm8iLCJfZ2V0TGV4ZW1lIiwiX2xleGVtZUxhYmVsIiwiX2ZpbmRBbmRJbmZsZWN0TGV4ZW1lIiwiY29uc29sZSIsIl9zZWxlY3RlZExleGVtZSIsIl9zZWxlY3RlZExleGVtZUluZmxlY3Rpb24iLCJpbmZsZWN0IiwiZ2VuRml4dHVyZXMiLCJzdHJpbmdpZnkiLCJjb21tdW5pY2F0ZSIsImluZmxlY3Rpb24iLCJ0ZXN0U3RhcnQiLCJEYXRlIiwibm93Iiwic2VuZCIsIl9vcExhYmVsIiwiTUFYX1JFU1BPTlNFX1RJTUUiLCJvbiIsInJlc3VsdCIsInNldFRpbWVvdXQiLCJ3ZWJyZXF1ZXN0IiwiX2ludGVyZmFjZSIsIl9yZXF1ZXN0TXNnIiwib3BMYWJlbCIsIl93ZWJNc2ciLCJfZ2VuZXJhdGVUb2tlbiIsImFsZ28iLCJtc2dCdWZmZXIiLCJUZXh0RW5jb2RlciIsImVuY29kZSIsImhhc2hCdWZmZXIiLCJjcnlwdG8iLCJzdWJ0bGUiLCJkaWdlc3QiLCJoYXNoQXJyYXkiLCJBcnJheSIsImZyb20iLCJVaW50OEFycmF5IiwiYiIsInRvU3RyaW5nIiwicGFkU3RhcnQiLCJqb2luIiwic3Vic2NyaWJlVG9FdmVudCIsImNhbGxiYWNrTGlzdCIsIl90aGlzIiwibm90aWZpZXIiLCJub3RpZnkiLCJjYWxsYmFja0Z1bmN0aW9uIiwicHVzaCIsImRlYnVnIiwidGFibGUiLCJjYiIsIl9jcmVhdGVFdmVudFN1YnNjcmlwdGlvbiIsImFkZCIsIl9uYW1lIiwic29ja2V0cyIsImdsb2JhbCIsImJyb2FkY2FzdE1zZyIsIl9jb25uZWN0SG9zdCIsImxvZyIsIl9jb25uZWN0aW9uTXNnRXYiLCJldiIsIkN1c3RvbUV2ZW50IiwiZGV0YWlsIiwic3RhdHVzQ29kZSIsIm9uQ29ubmVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7SUFBQSxNQUFNQSxPQUFPLEdBQUcsRUFBaEI7SUFFQUEsT0FBTyxDQUFDQyxVQUFSLHFCQUFxQixjQUFjQyxNQUFNLENBQUNDLE1BQXJCLENBQTRCLEVBQWpEO0lBQUE7SUFBQTtJQUFBLFNBQ2tCO0lBRGxCO0lBQUE7SUFBQTtJQUFBLFNBRzRCO0lBQ3BCQyxJQUFBQSxHQUFHLEVBQUUsSUFEZTtJQUVwQkMsSUFBQUEsTUFBTSxFQUFFLElBRlk7SUFHcEJDLElBQUFBLE1BQU0sRUFBRSxFQUhZO0lBSXBCQyxJQUFBQSxPQUFPLEVBQUUsSUFKVztJQUtwQkMsSUFBQUEsU0FBUyxFQUFFO0lBTFM7SUFINUI7SUFBQTtJQUFBO0lBQUEsU0FXb0I7SUFDWkMsSUFBQUEsU0FBUyxFQUFFLElBREM7SUFFWkMsSUFBQUEsS0FBSyxFQUFFLElBRks7SUFHWkMsSUFBQUEsT0FBTyxFQUFFLElBSEc7SUFJWkMsSUFBQUEsU0FBUyxFQUFFO0lBSkM7SUFYcEI7O0lDQUEsTUFBTUMsV0FBVyxHQUFHLEVBQUMsR0FBRyxFQUFKO0lBQVEsS0FBR0M7SUFBWCxDQUFwQjtJQUVBLE1BQU1DLE1BQU0sR0FBRztJQUNYQyxFQUFBQSxhQUFhLEVBQUU7SUFDWEMsSUFBQUEsUUFBUSxFQUFFLGdCQURDO0lBRVhDLElBQUFBLElBQUksRUFBRSxPQUZLO0lBR1hDLElBQUFBLGtCQUFrQixFQUFFLEVBSFQ7SUFJWEMsSUFBQUEsWUFBWSxFQUFFO0lBSkgsR0FESjtJQU9YQyxFQUFBQSxPQUFPLEVBQUU7SUFDTEosSUFBQUEsUUFBUSxFQUFFLHFCQURMO0lBRUxDLElBQUFBLElBQUksRUFB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
