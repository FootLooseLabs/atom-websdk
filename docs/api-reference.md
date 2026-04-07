# API Reference

## WebRequestSdk Constructor Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `name` | string | WebSocket connection name | `"sandbox_ws"` |
| `client_id` | string | Client identifier for authentication | `""` |
| `token` | string | Authentication token | `""` |
| `label` | string | Pre-configured environment label | - |
| `config` | object | Custom configuration object | - |
| `keepAliveTimeout` | number | Keep-alive interval in milliseconds | `60000` |

## Core Methods

### `connect(): Promise<{state: number, msg: string}>`

Establishes WebSocket connection with automatic error handling.

**Returns:**
- `state`: Connection state (0 = not connected, 1 = connected, 2 = connecting)
- `msg`: Status message

**Example:**
```javascript
try {
    const result = await webSDK.connect();
    console.log("Connected:", result.msg);
} catch (error) {
    console.error("Connection failed:", error.msg);
}
```

### `communicate(lexemeLabel: string, message: object): void`

Send a message using the specified lexeme without waiting for response.

**Parameters:**
- `lexemeLabel`: Name of the lexeme to use
- `message`: Message payload object

**Example:**
```javascript
webSDK.communicate("UpdateStatus", { status: "active" });
```

### `request(lexemeLabel: string, message: object, responseLabel: string, options?: object): Promise<object>`

Send request and wait for specific response with timeout.

**Parameters:**
- `lexemeLabel`: Name of the lexeme to use
- `message`: Request payload object
- `responseLabel`: Expected response operation label
- `options`: Optional configuration
  - `MAX_RESPONSE_TIME`: Timeout in milliseconds (default: 5000)

**Returns:** Promise resolving to response object

**Example:**
```javascript
const response = await webSDK.request(
    "GetUserData",
    { userId: 123 },
    "USER_DATA_RESPONSE",
    { MAX_RESPONSE_TIME: 10000 }
);
```

### `webrequest(interface: string, requestMsg: object, options?: object): Promise<object>`

Send request using interface-based communication.

**Parameters:**
- `interface`: Interface address (e.g., `"Service:::method"` or `"Service|||event"`)
- `requestMsg`: Request payload object
- `options`: Optional configuration
  - `MAX_RESPONSE_TIME`: Timeout in milliseconds (default: 5000)
  - `opLabel`: Custom operation label for response matching

**Returns:** Promise resolving to response object

**Message Structure:**
The request is sent with the following structure:
```javascript
{
    "interface": "Service:::method",
    "request": requestMsg,
    "token": "generated_sha256_hash",
    "ttl": 5000  // MAX_RESPONSE_TIME value
}
```

**Example:**
```javascript
const response = await webSDK.webrequest(
    "UserService:::getProfile",
    { userId: 123 },
    { MAX_RESPONSE_TIME: 5000 }
);
```

### `websubscribe(interface: string, localSocketName?: string, targetMsgLabel?: string, options?: object): Promise<boolean>`

Subscribe to server-side events and route them to local message handlers.

**Parameters:**
- `interface`: Interface address for subscription
- `localSocketName`: Name of local PostOffice socket (default: `"global"`)
- `targetMsgLabel`: Local message label for event routing
- `options`: Optional configuration (reserved for future use)

**Returns:** Promise resolving to `true` on successful subscription

**Example:**
```javascript
await webSDK.websubscribe(
    "ChatService|||roomMessages",
    "chat-socket",
    "new-message"
);

const socket = Muffin.PostOffice.sockets["chat-socket"];
socket.addListener("new-message", (event) => {
    console.log("New message:", event.result);
});
```

### `subscribeToEvent(): EventNotifier`

Create an event notifier for callback-based event handling.

**Returns:** EventNotifier object with `notify` method

**Example:**
```javascript
const notifier = webSDK.subscribeToEvent();
notifier.notify(
    (data) => console.log(data),
    "SubscribeLexeme",
    { param: "value" },
    "EVENT:::Service|||eventName"
);
```

## Event Interface

The `eventInterface` property provides access to connection events:

```javascript
const eventInterface = webSDK.eventInterface;

eventInterface.on("connect", callback);
eventInterface.on("error", callback);
eventInterface.on("close", callback);
eventInterface.on("incoming-msg", callback);
eventInterface.on("incoming-response", callback);
eventInterface.on("incoming-event", callback);
eventInterface.on("agent-error", callback);
```

## Connection States

- `0`: Not connected
- `1`: Connected
- `2`: Connecting

## Event Types

| Event | Description | Callback Parameter |
|-------|-------------|-------------------|
| `connect` | Successfully connected to WebSocket | None |
| `error` | Connection or communication error | Error object |
| `close` | Connection closed | Error object |
| `incoming-msg` | Any incoming message | Message object |
| `incoming-response` | Response to a request | Response object |
| `incoming-event` | Server-side event | Event object |
| `agent-error` | Server-side error response | Error message object |
