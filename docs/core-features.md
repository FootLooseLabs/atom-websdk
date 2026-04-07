# Core Features

## 1. Request-Response Pattern

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

## 2. Interface-based Communication

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

## 3. Event Subscriptions

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

## 4. Connection State Management

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

## Connection States

- `0`: Not connected
- `1`: Connected
- `2`: Connecting

## Event Types

The SDK emits various events through `eventInterface`:

- `connect`: Successfully connected to WebSocket
- `error`: Connection or communication error
- `close`: Connection closed
- `incoming-msg`: Any incoming message
- `incoming-response`: Response to a request
- `incoming-event`: Server-side event
- `agent-error`: Server-side error response
