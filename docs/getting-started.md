# Getting Started

## Installation

### CDN

```html
<script src="https://cdn.jsdelivr.net/gh/FootLooseLabs/atom-websdk@2.0.6/dist/sdk.min.js"></script>
```

### NPM

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

## Pre-configured Environments

- **`sandbox_local`**: Local development (`ws://localhost:8877/wsapi`)
- **`sandbox`**: Sandbox environment (`wss://wsapi.footloose.io/wsapi`)

## Next Steps

- [Core Features](core-features.md) - Learn about request-response patterns, interfaces, and events
- [API Reference](api-reference.md) - Complete API documentation
- [Examples](examples.md) - Real-world implementation examples
