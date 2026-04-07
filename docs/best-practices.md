# Best Practices

## 1. Connection Management

- Always handle connection states appropriately
- Implement reconnection logic for production applications
- Use keep-alive settings suitable for your use case

```javascript
const eventInterface = webSDK.eventInterface;

eventInterface.on("close", async () => {
    console.log("Connection closed, attempting reconnect...");

    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        await webSDK.connect();
        console.log("Reconnected successfully");
    } catch (error) {
        console.error("Reconnection failed:", error);
    }
});
```

## 2. Error Handling

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
    if (error.message && error.message.includes("No response received")) {
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

## 3. Performance

- Use appropriate timeout values for different operation types
- Batch multiple requests when possible
- Unsubscribe from events when components are destroyed

```javascript
class MyComponent extends Muffin.DOMComponent {
    constructor() {
        super();
        // Setup WebSocket
    }

    onDisconnect() {
        // Clean up subscriptions
        this.webSDK.eventInterface.removeAllListeners();
    }
}
```

## 4. Security

- Never hardcode authentication tokens
- Use environment variables for sensitive configuration
- Validate all incoming data from WebSocket events

```javascript
// Good: Use environment variables
const webSDK = new Muffin.WebRequestSdk({
    name: "secure-connection",
    client_id: process.env.CLIENT_ID,
    token: process.env.AUTH_TOKEN,
    label: process.env.ENV_LABEL || "sandbox_local"
});

// Validate incoming data
webSDK.eventInterface.on("incoming-event", (event) => {
    if (!event.result || typeof event.result !== 'object') {
        console.error("Invalid event data received");
        return;
    }

    // Process validated data
    handleEvent(event.result);
});
```

## 5. Graceful Degradation

Implement offline functionality when WebSocket is unavailable:

```javascript
class OfflineAwareComponent extends Muffin.DOMComponent {
    async loadData() {
        try {
            // Try WebSocket first
            const data = await webSDK.webrequest(
                "DataService:::getData",
                { id: this.dataId }
            );
            return data.result;
        } catch (error) {
            console.warn("WebSocket failed, falling back to REST API");

            // Fallback to REST API
            const response = await fetch(`/api/data/${this.dataId}`);
            return await response.json();
        }
    }
}
```

## 6. Timeout Configuration

Use appropriate timeouts based on operation type:

```javascript
// Quick operations: 5-10 seconds
const userProfile = await webSDK.webrequest(
    "UserService:::getProfile",
    { userId },
    { MAX_RESPONSE_TIME: 5000 }
);

// Heavy operations: 30-60 seconds
const report = await webSDK.webrequest(
    "ReportService:::generateReport",
    { reportId },
    { MAX_RESPONSE_TIME: 60000 }
);

// File uploads/processing: 2-5 minutes
const processedFile = await webSDK.webrequest(
    "FileService:::processFile",
    { fileId },
    { MAX_RESPONSE_TIME: 120000 }
);
```
