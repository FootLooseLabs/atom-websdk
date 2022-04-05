import WEB_MESSAGE_LEXICON from "./lexicon";

const API_LEXICON = {...{}, ...WEB_MESSAGE_LEXICON};

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
}


Muffin.WebRequestSdk = class {

    constructor(options, lazyload = true) {
        this.eventInterface = PostOffice.getOrCreateInterface("WebRequestSdk")
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
        }
        this._connection = null;
        this.state = null;
    }

    async connect() {
        this.uiVars.eventSubscriptions = new Set([]);
        this.uiVars.eventCounters = {};
        return new Promise((resolve, reject) => {
            var finalUrl = this.uiVars.config.api_protocol + this.uiVars.config.hostName + "/" + this.uiVars.config.path + "/" + this.clientId + "?auth=" + this.token
            this._connection = Muffin.PostOffice.addSocket(WebSocket, this.label, finalUrl);
            this._connection.autoRetryOnClose = false;

            this._connection.socket.onerror = (e) => {
                let msg = `connection failed: ${e.message}`;
                this.state = e;
                this.eventInterface.dispatchMessage("error", e);
                return reject({state: this.state, msg: msg});
            }
            this._connection.socket.onopen = (e) => {
                let msg = `connection established`;
                this.state = e;
                this.eventInterface.dispatchMessage("connect");
                return resolve({state: this.state, msg: msg});
            }

            this._connection.socket.onclose = (e) => {
                let msg = `connection closed`;
                this.state = e;
                this.eventInterface.dispatchMessage("close", e);
                return reject({state: this.state, msg: msg});
            }

            this._connection.socket.onmessage = (e) => {
                var _msgStr = e.data;
                try {
                    var _msg = JSON.parse(_msgStr)
                    if (_msg.error) {
                        this.eventInterface.dispatchMessage("error", _msg)
                    } else {
                        // this.eventInterface.dispatchMessage("incoming-msg", [_msg]);
                        this.eventInterface.dispatchMessage("incoming-msg", _msg)
                        if (_msg.op.includes("EVENT:::")) {
                            this.eventInterface.dispatchMessage("incoming-event", _msg);
                        } else {
                            this.eventInterface.dispatchMessage("incoming-response", _msg);
                        }
                    }
                } catch (e) {
                    this.eventInterface.dispatchMessage("error", e)
                }
            }
        })
    }


    getSerializableIntro() {
        return Object.keys(this.LEXICON).map((_lexeme) => {
            let _schema = this.LEXICON[_lexeme].schema.request || {};
            return {
                label: _lexeme,
                fullName: this.LEXICON[_lexeme].name,
                schema: _schema
            }
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

    async request(_lexemeLabel, _msg, _opLabel, options = {MAX_RESPONSE_TIME: 5000}) {
        return new Promise((resolve, reject) => {
            this.communicate(_lexemeLabel, _msg);
            if(!_opLabel){
                return resolve({message: "Message sent. No resp_op provided."});
            }

            this.eventInterface.on("incoming-msg", (msg) => {
                if (msg.op === _opLabel && msg.result != null) {
                    return resolve(msg);
                }
            });

            this.eventInterface.on("error", (msg) => {
                if (msg.op === _opLabel && msg.error != null) {
                    return reject(msg)
                }
            });
            setTimeout(() => {
                return reject({message:`No response received in ${options.MAX_RESPONSE_TIME / 1000}s`})
            }, options.MAX_RESPONSE_TIME);
        });
    }

    async webrequest(_interface, _requestMsg, options = {MAX_RESPONSE_TIME: 5000}) {
        return new Promise((resolve, reject) => {
            if(!_interface){
                return reject({error: "No Interface provided."});
            }

            if(!_interface.includes(":::") && !_interface.includes("|||")){
                return reject({error: "Invalid Interface provided"});
            }

            var _opLabel = options.opLabel || _interface;

            if(_interface.includes(":::")){
                var _webMsg = {
                    "interface" : _interface,
                    "request" : _requestMsg,
                    "token": this._generateToken(_interface)
                }
            } else {
                var _webMsg = {
                    "subscribe" : _interface,
                    "token": this._generateToken(_interface)
                }
            }

            this.communicate("WebMessage", _webMsg);

            this.eventInterface.on("incoming-msg", (msg) => {
                if (msg.op === _opLabel && msg.result != null) {
                    return resolve(msg);
                }
            });

            this.eventInterface.on("error", (msg) => {
                if (msg.op === _opLabel && msg.error != null) {
                    return reject(msg)
                }
            });
            setTimeout(() => {
                return reject({message:`No response received in ${options.MAX_RESPONSE_TIME / 1000}s`})
            }, options.MAX_RESPONSE_TIME);
        });
    }

    async websubscribe(_interface, _localSocketName="global", _targetMsgLabel, options = {MAX_RESPONSE_TIME: 5000}) {
        return new Promise(async (resolve, reject) => {
            try{
                await this.webrequest(_interface)
            }catch(e){
                return reject(e);
            }

            var _localSocket = Muffin.PostOffice.sockets[_localSocketName] || Muffin.PostOffice.sockets.global;

            this.eventInterface.on("incoming-event", (msg) => {
                if (msg.op === `EVENT:::${_interface}`) {
                    let _msgLabel = _targetMsgLabel || msg.op;
                    _localSocket.dispatchMessage(_msgLabel, msg);
                }
            });

            return resolve(true);
        });
    }

    async _generateToken(message, options = {algo: "SHA-256"}) {
        const msgBuffer = new TextEncoder().encode(message);                    
        const hashBuffer = await crypto.subtle.digest(options.algo, msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    subscribeToEvent(){
        let callbackList = [];
        var _this = this;
        const notifier = {
            notify: function(callbackFunction, _lexemeLabel, _msg, _opLabel) {
                _this.communicate(_lexemeLabel, _msg);
                callbackList.push({callbackFunction, _opLabel});
                console.debug("***************** Callback Event Table ************************")
                console.table(callbackList);
            }
        };
        this.eventInterface.on("incoming-event", (msg)=>{
            for (let cb of callbackList) {
                if(msg.op === cb._opLabel)
                    cb.callbackFunction(msg);
            }
        })
        return notifier;
    }

    _createEventSubscription(_msg) {
        this.uiVars.eventSubscriptions.add(_name);
        this.uiVars.eventCounters[`EVENT:::${_name}`] = 0;
        Muffin.PostOffice.sockets.global.broadcastMsg("subscription-created", _msg);
    }

    _connectHost() {
        let msg = `connecting with api host`;

        this._connection.onerror = (e) => {
            let msg = `connection failed: ${e.message}`;
            console.log("imp:", msg);
        }
        this._connection.onopen = (e) => {
            let msg = `connection established`;
        }

        this._connection.onclose = (e) => {
            let msg = `connection closed`;
        }


        this._connection.onmessage = (_connectionMsgEv) => { //custom onmessage functions can be provided by the developer.
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
            } catch (e) { //not valid msg
                var _msg = {error: e, label: `${this.name}-message-error`}
                ev = new CustomEvent(_msg.label, {
                    detail: _msg
                });
            }
            return ev;
        }

        this._connection.on("incoming-hostagent-response-msg", (msg) => {
            // this.uiVars.hostagentResponseMsgLogEl.appendChild(tableHtml);
            if (msg.op.includes("|||") && msg.statusCode == 2) {
                this._createEventSubscription(msg.op);
            } else {
                // this.on()
            }
        });


        this._connection.on("incoming-hostagent-event-msg", (msg) => {
            this.uiVars.eventCounters[msg.op] += 1;
            // this.uiVars.hostagentResponseMsgLogEl.appendChild(tableHtml);
        });
    }

    onConnect() {

    }
}

export default Muffin;
