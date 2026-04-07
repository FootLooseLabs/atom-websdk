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

## Quick Start

### Installation

```html
<script src="https://cdn.jsdelivr.net/gh/FootLooseLabs/atom-websdk@2.0.6/dist/sdk.min.js"></script>
```

### Basic Usage

```javascript
// Initialize the WebSocket SDK
const webSDK = new Muffin.WebRequestSdk({
    name: "my-app-websocket",
    client_id: "your-client-id",
    token: "your-auth-token",
    label: "sandbox_local"
});

// Connect and make requests
await webSDK.connect();

const response = await webSDK.webrequest(
    "UserService:::getProfile",
    { userId: 123 },
    { MAX_RESPONSE_TIME: 5000 }
);
```

## Documentation

- **[Getting Started](docs/getting-started.md)** - Installation and quick start guide
- **[Core Features](docs/core-features.md)** - Request-response, interfaces, events, and connection management
- **[Advanced Usage](docs/advanced-usage.md)** - Custom lexicons, callbacks, integration, and environment configuration
- **[API Reference](docs/api-reference.md)** - Complete API documentation
- **[Examples](docs/examples.md)** - Real-world implementation examples
- **[Best Practices](docs/best-practices.md)** - Error handling, connection management, performance, and security

## Features

### Request-Response Pattern

```javascript
const response = await webSDK.request(
    "GetUserData",
    { userId: 123 },
    "USER_DATA_RESPONSE",
    { MAX_RESPONSE_TIME: 10000 }
);
```

### Interface-based Communication

```javascript
// Receptive interface (request-response)
const response = await webSDK.webrequest(
    "UserService:::getProfile",
    { userId: 123 },
    { MAX_RESPONSE_TIME: 5000 }
);

// Expressive interface (subscription)
await webSDK.webrequest("NotificationService|||userNotifications");
```

### Event Subscriptions

```javascript
await webSDK.websubscribe(
    "ChatService|||roomMessages",
    "chat-socket",
    "new-chat-message"
);

const chatSocket = Muffin.PostOffice.sockets["chat-socket"];
chatSocket.addListener("new-chat-message", (eventData) => {
    console.log("New message:", eventData.result);
});
```

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

## License

Copyright © @Footloose Labs INC.

---

Atom WebSDK extends the [Element/Muffin framework's](https://github.com/footLooseLabs/element) philosophy of lightweight, flexible architecture while adding enterprise-grade real-time communication capabilities.
