# Advanced Usage

## 1. Custom Lexicon Definition

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

## 2. Event Subscription with Callbacks

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

## 3. Integration with Muffin Components

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

## 4. Environment Configuration

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
