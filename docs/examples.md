# Examples

## Complete Real-world Example: Realtime Chat Component

This comprehensive example shows a real-time chat component using Atom WebSDK with a service layer, following production-ready patterns.

### Service Layer

**chat-management-service.js**

```javascript
export default class ChatManagementService extends Muffin.Service {
    static name = "chat-management-service";

    static Interfaces = {
        "ServiceInterface": "@chat/manager:::ChatManagerService",
    };

    static getChatMessages(chatRoomId, limit) {
        return new Promise(async (resolve, reject) => {
            if (!chatRoomId) {
                return reject("Invalid Chat Room ID Provided");
            }

            let payload = {
                chatRoomId: chatRoomId,
                limit: limit || 50
            };

            try {
                let res = await Muffin.WebInterface.request(
                    this.Interfaces.ServiceInterface,
                    {
                        subject: "getChatMessages",
                        object: payload
                    },
                    { MAX_RESPONSE_TIME: 10000 }
                );
                return resolve(res.result);
            } catch (e) {
                return reject(e);
            }
        });
    }

    static sendChatMessage(chatRoomId, messageContent, messageType = "text") {
        return new Promise(async (resolve, reject) => {
            if (!chatRoomId) {
                return reject("Invalid Chat Room ID Provided");
            }
            if (!messageContent || messageContent.trim().length < 1) {
                return reject("Message content cannot be empty");
            }

            let payloadToSend = {
                chatRoomId: chatRoomId,
                content: messageContent.trim(),
                messageType: messageType,
                requestOrigin: window.location.href
            };

            try {
                let res = await Muffin.WebInterface.request(
                    this.Interfaces.ServiceInterface,
                    {
                        subject: "sendChatMessage",
                        object: payloadToSend
                    },
                    { MAX_RESPONSE_TIME: 10000 }
                );
                return resolve(res.result);
            } catch (e) {
                return reject(e);
            }
        });
    }

    static deleteMessage(messageId) {
        return new Promise(async (resolve, reject) => {
            if (!messageId) {
                return reject("Invalid Message ID");
            }

            let payloadToSend = {
                messageId: messageId,
                requestOrigin: window.location.href
            };

            try {
                let res = await Muffin.WebInterface.request(
                    this.Interfaces.ServiceInterface,
                    {
                        subject: "deleteMessage",
                        object: payloadToSend
                    },
                    { MAX_RESPONSE_TIME: 10000 }
                );
                return resolve(res.result);
            } catch (e) {
                return reject(e);
            }
        });
    }
}
```

### Component Implementation

**realtime-chat-panel.js**

```javascript
import ChatManagementService from "./chat-management-service.js";

class RealtimeChatPanel extends Muffin.DOMComponent {
    static domElName = "realtime-chat-panel";

    static styleMarkup(rootEl) {
        return `<style type="text/css">
            ${rootEl} .chat-container {
                display: flex;
                flex-direction: column;
                height: 500px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: white;
            }

            ${rootEl} .messages-area {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
                background: #f8f9fa;
            }

            ${rootEl} .message-item {
                margin-bottom: 1rem;
                padding: 0.75rem;
                border-radius: 8px;
                background: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }

            ${rootEl} .message-item.own-message {
                background: #007bff;
                color: white;
                margin-left: 2rem;
            }

            ${rootEl} .message-item.other-message {
                margin-right: 2rem;
            }

            ${rootEl} .input-area {
                padding: 1rem;
                border-top: 1px solid #eee;
                background: white;
            }

            ${rootEl} .status-indicator {
                padding: 0.5rem;
                text-align: center;
                font-size: 0.85rem;
                background: #f1f3f4;
            }

            ${rootEl} .status-indicator.connected {
                background: #d4edda;
                color: #155724;
            }

            ${rootEl} .status-indicator.connecting {
                background: #fff3cd;
                color: #856404;
            }

            ${rootEl} .status-indicator.disconnected {
                background: #f8d7da;
                color: #721c24;
            }
        </style>`;
    }

    static messageItemMarkup(_message, _idx, uiVars) {
        const isOwnMessage = _message.sender_id === uiVars.currentUserId;
        const messageClass = isOwnMessage ? "own-message" : "other-message";
        const timeAgo = new Date(_message.created_at).toLocaleTimeString();

        return `<div class="message-item ${messageClass}" data-message-id="${_message.id}">
            <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                    <h6 class="mb-1 font-weight-bold">${isOwnMessage ? "You" : _message.sender_name}</h6>
                    <p class="mb-1">${_message.content}</p>
                    <small class="text-muted">${timeAgo}</small>
                </div>
                ${isOwnMessage ?
                    `<button class="btn btn-sm btn-outline-danger" data-message-id="${_message.id}"
                     on-click="deleteMessage">
                        <i class="fas fa-trash"></i>
                    </button>` :
                    ''
                }
            </div>
        </div>`;
    }

    static messagesListMarkup(uiVars) {
        if (uiVars.messagesList.length < 1) {
            return `<div class="text-center text-muted p-4">
                <p>No messages yet. Start the conversation!</p>
            </div>`;
        }

        const messagesMarkup = uiVars.messagesList
            .map((_message, _idx) => {
                return this.messageItemMarkup(_message, _idx, uiVars);
            })
            .join("");

        return `<div class="messages-container">
            ${messagesMarkup}
        </div>`;
    }

    static _sendMessageBtnMarkup(uiVars) {
        return `<button ${uiVars.sendBtnState} class="btn btn-primary px-3 py-2">
            Send <i class="fas fa-paper-plane"></i>
        </button>`;
    }

    static markupFunc(_data, uid, uiVars, routeVars, _constructor) {
        return `<div class="realtime-chat-panel">
            <div class="chat-container">
                <div class="status-indicator ${uiVars.connectionStatus}">
                    ${uiVars.connectionStatus === 'connected' ? '🟢 Connected' :
                      uiVars.connectionStatus === 'connecting' ? '🟡 Connecting...' :
                      '🔴 Disconnected'}
                </div>

                <div class="messages-area">
                    ${_constructor.messagesListMarkup(uiVars)}
                </div>

                <div class="input-area">
                    <div class="d-flex">
                        <textarea class="form-control mr-2"
                                  placeholder="Type your message..."
                                  on-input="onMessageInput"
                                  on-keyup="onMessageKeyUp"
                                  data-key="messageInput"
                                  value="${uiVars.messageInput || ""}"
                                  rows="2"></textarea>
                        <div render-func="_sendMessageBtnMarkup"
                             data-relation="innerHTML"
                             on-click="sendMessage"
                             data-uiVar="*">
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    constructor() {
        super();
        this.uiVars.messagesList = [];
        this.uiVars.chatRoomId = this.getAttribute("chat-room-id");
        this.uiVars.currentUserId = this.getAttribute("user-id");
        this.uiVars.connectionStatus = "disconnected";
        this.uiVars.messageInput = "";
        this.uiVars.sendBtnState = "disabled";
        this.uiVars.autoInit = this.hasAttribute("auto-init");

        // Initialize WebSocket SDK
        this.webSDK = new Muffin.WebRequestSdk({
            name: "chat-websocket",
            client_id: this.uiVars.currentUserId,
            token: this.getAttribute("auth-token"),
            label: this.getAttribute("env-label") || "sandbox_local"
        });

        this.setupWebSocketListeners();
    }

    async onConnect() {
        try {
            await Muffin.WebInterface.awaitConnection();
        } catch (e) {
            throw e;
        }

        if (this.uiVars.autoInit) {
            this.init();
        }
    }

    setupWebSocketListeners() {
        const eventInterface = this.webSDK.eventInterface;

        eventInterface.on("connect", () => {
            this.uiVars.connectionStatus = "connected";
            this.render();
        });

        eventInterface.on("error", (error) => {
            console.error("Chat WebSocket error:", error);
            this.uiVars.connectionStatus = "disconnected";
            this.render();
        });

        eventInterface.on("close", () => {
            this.uiVars.connectionStatus = "disconnected";
            this.render();
        });
    }

    init() {
        return new Promise(async (resolve, reject) => {
            this.uiVars.connectionStatus = "connecting";
            this.render();

            try {
                // Connect to WebSocket
                await this.webSDK.connect();

                // Load initial messages
                const messages = await ChatManagementService.getChatMessages(
                    this.uiVars.chatRoomId
                );
                this.uiVars.messagesList = Array.isArray(messages) ? [...messages] : [];

                // Subscribe to real-time chat updates
                await this.webSDK.websubscribe(
                    `ChatService|||roomMessages:${this.uiVars.chatRoomId}`,
                    "chat-socket",
                    "new-chat-message"
                );

                // Listen for new messages
                const chatSocket = Muffin.PostOffice.sockets["chat-socket"];
                chatSocket.addListener("new-chat-message", (eventData) => {
                    this.onNewMessage(eventData.result);
                });

                this.render();
                return resolve(this.uiVars.messagesList);

            } catch (error) {
                console.error("Failed to initialize chat:", error);
                this.uiVars.connectionStatus = "disconnected";
                this.render();
                return reject(error);
            }
        });
    }

    onMessageInput(srcEl) {
        this.uiVars.messageInput = srcEl.value;

        // Update button state
        if (this.uiVars.messageInput && this.uiVars.messageInput.trim().length >= 1) {
            this.uiVars.sendBtnState = "active";
        } else {
            this.uiVars.sendBtnState = "disabled";
        }

        this.renderSelectively();
    }

    onMessageKeyUp(srcEl, ev) {
        if (ev.keyCode === 13 && !ev.shiftKey) {
            ev.preventDefault();
            this.sendMessage();
        }
    }

    sendMessage(srcEl) {
        if (!this.uiVars.messageInput || this.uiVars.messageInput.trim().length < 1) {
            this.notifyUser("📣 Please type a message", 1500);
            return;
        }

        if (this.uiVars.sendBtnState === "busy") {
            return;
        }

        this.uiVars.sendBtnState = "busy";
        if (srcEl) this.toggleBtnBusyState(srcEl, "busy");

        ChatManagementService.sendChatMessage(
            this.uiVars.chatRoomId,
            this.uiVars.messageInput
        )
            .then((res) => {
                this.onNewMessage(res);
                this.uiVars.messageInput = "";
                this.uiVars.sendBtnState = "disabled";

                // Clear textarea
                const textareaEl = this._getDomNode().querySelector('textarea[data-key="messageInput"]');
                if (textareaEl) {
                    textareaEl.value = "";
                }

                this.render();
            })
            .catch((e) => {
                console.error("Failed to send message:", e);
                this.notifyUser("⚠️ Failed to send message", 1500);
            })
            .finally(() => {
                this.uiVars.sendBtnState = "disabled";
                if (srcEl) this.toggleBtnBusyState(srcEl, "show");
            });
    }

    onNewMessage(_message) {
        const existingIdx = this.uiVars.messagesList.findIndex((msg) => {
            return msg.id === _message.id;
        });

        if (existingIdx === -1) {
            this.uiVars.messagesList = [...this.uiVars.messagesList, _message];
            this.render();

            // Auto-scroll to bottom
            setTimeout(() => {
                const messagesArea = this._getDomNode().querySelector('.messages-area');
                if (messagesArea) {
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                }
            }, 100);
        }
    }

    async deleteMessage(srcEl) {
        try {
            const confirmed = await Muffin.ConfirmDialog("Delete this message?");
        } catch (e) {
            return;
        }

        ChatManagementService.deleteMessage(srcEl.dataset.messageId)
            .then((res) => {
                this.uiVars.messagesList = this.uiVars.messagesList.filter(
                    (msg) => msg.id !== srcEl.dataset.messageId
                );
                this.render();
                this.notifyUser("✅ Message deleted", 1500);
            })
            .catch((e) => {
                console.error("Failed to delete message:", e);
                this.notifyUser("⚠️ Failed to delete message", 1500);
            });
    }

    postRender() {
        this.renderSelectively();
    }
}

customElements.define(RealtimeChatPanel.domElName, RealtimeChatPanel);
export default RealtimeChatPanel;
```

### Usage in HTML

```html
<realtime-chat-panel
    chat-room-id="room123"
    user-id="user456"
    auth-token="${USER_TOKEN}"
    env-label="sandbox"
    auto-init>
</realtime-chat-panel>
```

## Key Features Demonstrated

- **Service Layer**: Promise-based static methods following Muffin.Service pattern
- **Component Structure**: Using `uiVars` for state, static markup functions, and proper event handling
- **WebSocket Integration**: Real-time subscriptions using Atom WebSDK with PostOffice sockets
- **Error Handling**: Promise-based error handling with user notifications
- **UI Patterns**: Button states, selective rendering, and auto-scrolling
- **Connection Management**: Status indicators and automatic reconnection handling
