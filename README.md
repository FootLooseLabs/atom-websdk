# Atom WebSDK

A real-time WebSocket SDK built on top of the [Element/Muffin framework](https://github.com/footLooseLabs/element), providing seamless WebSocket communication, event subscriptions, and interface-based messaging for modern web applications.

## Overview

Atom WebSDK extends the [Element/Muffin framework](https://github.com/footLooseLabs/element) with enterprise-grade WebSocket capabilities:

- **Real-time Communication** - Bidirectional WebSocket messaging with automatic reconnection
- **Interface-based Architecture** - Structured communication using lexicons and interfaces
- **Event Subscription System** - Subscribe to server-side events with automatic handling
- **Connection Management** - Built-in keep-alive, error handling, and state management
- **Multi-environment Support** - Pre-configured endpoints for development and production
- **Authentication Integration** - Token-based authentication with secure message signing

## Installation

### Installation

```bash
npm install --save github:footLooseLabs/atom-websdk
```

This will automatically include the Element/Muffin framework as a dependency.

### Project Setup

Include the SDK in your `index.src.html`:

```html
<!-- Include Atom WebSDK (includes Muffin framework) -->
<script src="./node_modules/atom-web-sdk/dist/sdk.min.js"></script>
```

## Quick Start

### Basic Connection

```javascript
// Initialize the WebSocket SDK
const webSDK = new Muffin.WebRequestSdk({
    name: "my-app-websocket",
    client_id: "your-client-id",
    token: "your-auth-token",
    label: "sandbox_local", // or "sandbox" for production
    keepAliveTimeout: 60000
});

// Connect to the WebSocket server
try {
    const result = await webSDK.connect();
    console.log("Connected:", result.msg);
} catch (error) {
    console.error("Connection failed:", error.msg);
}
```

### Custom Configuration

```javascript
const webSDK = new Muffin.WebRequestSdk({
    name: "custom-websocket",
    client_id: "client-123",
    token: "auth-token-456",
    config: {
        hostName: "your-api.example.com",
        path: "websocket",
        channelInstanceSig: 12,
        api_protocol: "wss://"
    }
});
```

## Core Features

### 1. Request-Response Pattern

Send requests and wait for responses with automatic timeout handling:

```javascript
// Simple request-response
try {
    const response = await webSDK.request(
        "GetUserData",           // Lexeme name
        { userId: 123 },         // Request data
        "USER_DATA_RESPONSE",    // Expected response operation
        { MAX_RESPONSE_TIME: 10000 }
    );
    
    console.log("User data:", response.result);
} catch (error) {
    console.error("Request failed:", error);
}
```

### 2. Interface-based Communication

Use structured interfaces for type-safe communication:

```javascript
// Receptive interface (request-response)
try {
    const response = await webSDK.webrequest(
        "UserService:::getProfile",
        { userId: 123, includePreferences: true },
        { MAX_RESPONSE_TIME: 5000 }
    );
    
    console.log("Profile:", response.result);
} catch (error) {
    console.error("Interface request failed:", error);
}

// Expressive interface (subscription)
try {
    await webSDK.webrequest("NotificationService|||userNotifications");
    console.log("Subscribed to user notifications");
} catch (error) {
    console.error("Subscription failed:", error);
}
```

### 3. Event Subscriptions

Subscribe to real-time server events:

```javascript
// Subscribe to events and handle them locally
await webSDK.websubscribe(
    "ChatService|||roomMessages",
    "chat-socket",           // Local socket name
    "new-chat-message"       // Local message label
);

// Listen for events in your components
const chatSocket = Muffin.PostOffice.sockets["chat-socket"];
chatSocket.addListener("new-chat-message", (eventData) => {
    console.log("New chat message:", eventData.result);
    // Update UI with new message
});
```

### 4. Connection State Management

Monitor and handle connection states:

```javascript
const webSDK = new Muffin.WebRequestSdk({
    name: "monitored-connection",
    client_id: "client-123",
    token: "token-456",
    label: "sandbox"
});

// Get event interface for connection monitoring
const eventInterface = webSDK.eventInterface;

// Listen for connection events
eventInterface.on("connect", () => {
    console.log("WebSocket connected successfully");
    // Update UI to show online status
});

eventInterface.on("error", (error) => {
    console.error("WebSocket error:", error);
    // Show error message to user
});

eventInterface.on("close", (error) => {
    console.warn("WebSocket connection closed:", error);
    // Update UI to show offline status
});

eventInterface.on("incoming-msg", (message) => {
    console.log("Received message:", message);
});
```

## Advanced Usage

### 1. Custom Lexicon Definition

Extend the SDK with custom message types:

```javascript
// Define custom lexeme
class CustomUserLexeme extends Muffin.Lexeme {
    static name = "CustomUserOperation";
    
    static schema = {
        userId: null,
        action: null,
        data: {}
    };
    
    static request_schema = {
        uid: null,
        sender: null,
        params: {},
        subject: null,
        objective: {}
    };
}

// Use custom lexeme
webSDK.communicate("CustomUserOperation", {
    userId: 123,
    action: "updateProfile",
    data: { name: "John Doe", email: "john@example.com" }
});
```

### 2. Event Subscription with Callbacks

Handle events with custom callback functions:

```javascript
// Create event notifier
const eventNotifier = webSDK.subscribeToEvent();

// Subscribe to events with callbacks
eventNotifier.notify(
    (eventData) => {
        console.log("Order updated:", eventData.result);
        // Update order status in UI
        updateOrderDisplay(eventData.result);
    },
    "SubscribeToOrderUpdates",
    { orderId: 12345 },
    "EVENT:::OrderService|||orderUpdates"
);

function updateOrderDisplay(orderData) {
    const orderElement = document.querySelector(`[data-order-id="${orderData.id}"]`);
    if (orderElement) {
        orderElement.querySelector('.status').textContent = orderData.status;
    }
}
```

### 3. Integration with Muffin Components

Use the WebSDK within Muffin components:

```javascript
class RealtimeDataComponent extends Muffin.DOMComponent {
    static domElName = "realtime-data";
    
    static schema = {
        data: null,
        status: "disconnected"
    };
    
    static markupFunc = (data) => {
        return `
            <div class="realtime-container">
                <div class="status ${data.status}">${data.status}</div>
                <div class="data-display">
                    ${data.data ? JSON.stringify(data.data, null, 2) : 'No data'}
                </div>
                <button on-click="reconnect" ?disabled="${data.status === 'connecting'}">
                    Reconnect
                </button>
            </div>
        `;
    };
    
    constructor() {
        super();
        this.webSDK = new Muffin.WebRequestSdk({
            name: "component-websocket",
            client_id: "component-client",
            token: this.getAttribute("auth-token"),
            label: "sandbox"
        });
        this.initializeWebSocket();
    }
    
    async initializeWebSocket() {
        try {
            this.data.status = "connecting";
            this.render();
            
            await this.webSDK.connect();
            this.data.status = "connected";
            
            // Subscribe to data updates
            await this.webSDK.websubscribe(
                "DataService|||realtimeUpdates",
                "component-socket",
                "data-update"
            );
            
            // Listen for data updates
            const socket = Muffin.PostOffice.sockets["component-socket"];
            socket.addListener("data-update", (update) => {
                this.data.data = update.result;
                this.render();
            });
            
        } catch (error) {
            this.data.status = "error";
            console.error("WebSocket initialization failed:", error);
        }
        
        this.render();
    }
    
    reconnect() {
        this.initializeWebSocket();
    }
}

customElements.define(RealtimeDataComponent.domElName, RealtimeDataComponent);
```

### 4. Environment Configuration

Configure different environments:

```javascript
const environments = {
    development: {
        hostName: "localhost:8877",
        path: "wsapi",
        channelInstanceSig: 12,
        api_protocol: "ws://"
    },
    staging: {
        hostName: "staging-api.example.com",
        path: "websocket",
        channelInstanceSig: 15,
        api_protocol: "wss://"
    },
    production: {
        hostName: "api.example.com",
        path: "websocket",
        channelInstanceSig: 20,
        api_protocol: "wss://"
    }
};

// Use environment-specific configuration
const webSDK = new Muffin.WebRequestSdk({
    name: "env-aware-websocket",
    client_id: "client-123",
    token: "auth-token",
    config: environments[process.env.NODE_ENV || 'development']
});
```

## API Reference

### WebRequestSdk Constructor Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `name` | string | WebSocket connection name | `"sandbox_ws"` |
| `client_id` | string | Client identifier for authentication | `""` |
| `token` | string | Authentication token | `""` |
| `label` | string | Pre-configured environment label | - |
| `config` | object | Custom configuration object | - |
| `keepAliveTimeout` | number | Keep-alive interval in milliseconds | `60000` |

### Pre-configured Environments

- **`sandbox_local`**: Local development (`ws://localhost:8877/wsapi`)
- **`sandbox`**: Sandbox environment (`wss://wsapi.footloose.io/wsapi`)

### Core Methods

#### `connect(): Promise<{state: number, msg: string}>`
Establishes WebSocket connection with automatic error handling.

#### `communicate(lexemeLabel: string, message: object): void`
Send a message using the specified lexeme without waiting for response.

#### `request(lexemeLabel: string, message: object, responseLabel: string, options?: object): Promise<object>`
Send request and wait for specific response with timeout.

#### `webrequest(interface: string, requestMsg: object, options?: object): Promise<object>`
Send request using interface-based communication.

#### `websubscribe(interface: string, localSocketName?: string, targetMsgLabel?: string, options?: object): Promise<boolean>`
Subscribe to server-side events and route them to local message handlers.

#### `subscribeToEvent(): EventNotifier`
Create an event notifier for callback-based event handling.

### Connection States

- `0`: Not connected
- `1`: Connected
- `2`: Connecting

### Event Types

The SDK emits various events through `eventInterface`:

- `connect`: Successfully connected to WebSocket
- `error`: Connection or communication error
- `close`: Connection closed
- `incoming-msg`: Any incoming message
- `incoming-response`: Response to a request
- `incoming-event`: Server-side event
- `agent-error`: Server-side error response

## Error Handling

### Connection Errors

```javascript
try {
    await webSDK.connect();
} catch (error) {
    switch (error.state) {
        case 0:
            console.log("Connection failed to establish");
            // Retry or show offline mode
            break;
        default:
            console.error("Unexpected connection error:", error);
    }
}
```

### Request Timeouts

```javascript
try {
    const response = await webSDK.request(
        "SlowOperation",
        { data: "test" },
        "SLOW_RESPONSE",
        { MAX_RESPONSE_TIME: 30000 } // 30 second timeout
    );
} catch (error) {
    if (error.message.includes("No response received")) {
        console.log("Request timed out");
        // Handle timeout scenario
    }
}
```

### Server Errors

```javascript
webSDK.eventInterface.on("agent-error", (errorMsg) => {
    console.error("Server error:", errorMsg.error);
    // Handle server-side errors
    showErrorNotification(errorMsg.error);
});
```

## Best Practices

### 1. Connection Management
- Always handle connection states appropriately
- Implement reconnection logic for production applications
- Use keep-alive settings suitable for your use case

### 2. Error Handling
- Listen for all error event types
- Implement graceful degradation for offline scenarios
- Provide user feedback for connection issues

### 3. Performance
- Use appropriate timeout values for different operation types
- Batch multiple requests when possible
- Unsubscribe from events when components are destroyed

### 4. Security
- Never hardcode authentication tokens
- Use environment variables for sensitive configuration
- Validate all incoming data from WebSocket events

## Integration with Element/Muffin Components

Atom WebSDK seamlessly integrates with the Element/Muffin framework:

```html
<!-- Component with WebSocket data binding -->
<realtime-dashboard auth-token="${USER_TOKEN}">
    <component-data socket="dashboard-socket" label="dashboard-data">
        {
            "widgets": [],
            "notifications": [],
            "status": "loading"
        }
    </component-data>
</realtime-dashboard>
```

### Complete Real-world Example

Here's a comprehensive example showing a real-time chat component using Atom WebSDK with a service layer, following the exact patterns from your codebase:

```javascript
// chat-management-service.js
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

// realtime-chat-panel.js
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

This example demonstrates:
- **Service Layer**: Following your exact `Muffin.Service` pattern with Promise-based static methods
- **Component Structure**: Using `uiVars` for state, static markup functions, and proper event handling
- **WebSocket Integration**: Real-time subscriptions using Atom WebSDK with PostOffice sockets  
- **Error Handling**: Promise-based error handling matching your patterns
- **UI Patterns**: Button states, selective rendering, and user notifications like your example

## Browser Support

- Modern browsers with WebSocket support
- ES6+ features required (async/await, classes, modules)
- Web Crypto API for token generation
- Requires [Element/Muffin framework](https://github.com/footLooseLabs/element)

## Architecture Benefits

- **Real-time Capability**: Built-in WebSocket management with reconnection
- **Type Safety**: Interface-based communication with structured lexicons  
- **Framework Integration**: Seamless integration with [Element/Muffin](https://github.com/footLooseLabs/element) components
- **Scalable**: Supports multiple connections and event subscriptions
- **Production Ready**: Error handling, authentication, and multi-environment support
- **Lightweight**: Minimal overhead on top of Element/Muffin framework

---

Atom WebSDK extends the [Element/Muffin framework's](https://github.com/footLooseLabs/element) philosophy of lightweight, flexible architecture while adding enterprise-grade real-time communication capabilities. It maintains the same vanilla JavaScript approach while providing powerful WebSocket abstractions for modern web applications.