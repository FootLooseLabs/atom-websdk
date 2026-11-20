# @muffin/atom-websdk

The network layer of the [Muffin framework](https://github.com/FootLooseLabs/muffin-framework): a WebSocket client
for the web interface (requests to services, subscriptions to their events), the `Service` base class, and the DOM
extensions components use. The browser bundle includes [`@muffin/element`](https://github.com/FootLooseLabs/element);
after loading it, everything is under `window.Muffin`.

**Docs:** [footlooselabs.github.io/muffin-framework](https://footlooselabs.github.io/muffin-framework/) — the
[WebRequestSdk API](https://footlooselabs.github.io/muffin-framework/api/web-request-sdk),
[Service](https://footlooselabs.github.io/muffin-framework/api/service) and the
[changelog](https://footlooselabs.github.io/muffin-framework/changelog). This README covers installing and the
essentials only; the docs site is the reference.

## Install

**Browser (CDN)** — one script, pinned to a release:

```html
<script src="https://cdn.jsdelivr.net/gh/FootLooseLabs/atom-websdk@3.5.0/dist/sdk.min.js"></script>
```

**Node** (MCP servers, CLIs) — the request protocol alone, `@muffin/atom-websdk/core`, with no DOM and no Muffin:

```sh
npm i github:FootLooseLabs/atom-websdk#v3.5.0
```

```js
const { RequestChannel } = require("@muffin/atom-websdk/core"); // or import, ESM; types included
```

## Requests

```js
const sdk = new Muffin.WebRequestSdk({ name: "app", client_id, token, config: { api_protocol: "wss://", hostName, path: "wsapi" } });
await sdk.connect();

// a service: "host:::Service"
const reply = await sdk.webrequest("@vritti/ideator:::AgentDevelopmentService",
    { subject: "getDetails", object: { slug } }, { MAX_RESPONSE_TIME: 10000 });
reply.result;

// its events: "host|||Name" — each delivered once per (socket, label) route, until webunsubscribe
await sdk.websubscribe("@vritti/ideator|||AgentBroadcast", "global", "agent-broadcast");
Muffin.PostOffice.sockets.global.on("agent-broadcast", (msg) => { /* … */ });
await sdk.webunsubscribe("@vritti/ideator|||AgentBroadcast");
```

Any number of requests can be in flight at once, to any interface: each carries a `ref` and its reply is matched by it
([Requests and replies](https://footlooselabs.github.io/muffin-framework/api/web-request-sdk#requests-and-replies)).
A request resolves with its reply, and rejects with the reply when it carries an error, or with `{ message }` when no
reply came in time or the connection closed.

## Kept open

```js
const sdk = new Muffin.WebRequestSdk({ name: "app", client_id, token: () => signIn(), config, reconnect: true });
await sdk.connect();                                         // kept open from now until disconnect()
sdk.eventInterface.on("state", (state) => { /* idle · connecting · connected · reconnecting · offline */ });
sdk.eventInterface.on("resumed", () => { /* open again, subscriptions made again: read what was missed */ });
await sdk.webunsubscribe("@vritti/ideator|||AgentBroadcast", { socketName: "global", label: "agent-broadcast" }); // one route
```

With `reconnect` a closed connection is opened again — after a growing wait, at once when the page is shown or the
device is back online — its subscriptions made again; `token` may be a function, asked on every connect
([The connection](https://footlooselabs.github.io/muffin-framework/api/web-request-sdk#the-connection)).

## Services, as a module

```js
import { Service } from "@muffin/atom-websdk/service";   // the same class as Muffin.Service; types included
export default class AgentService extends Service { /* static methods, getCached/setCached */ }
```

## Node: RequestChannel

`RequestChannel` is the protocol the browser SDK is built on. A Node client gives it a way to send a frame and feeds
it every message that arrives; it matches requests to replies:

```js
const channel = new RequestChannel({
    send: (text) => socket.send(text),                                        // throws when not open
    digest: (text) => createHash("sha256").update(text).digest("hex"),        // the request's token
});
socket.on("message", (data) => { try { channel.receive(JSON.parse(data)); } catch (e) {} });
socket.on("close", () => channel.close());

const reply = await channel.request("@vritti/ideator:::AgentDevelopmentService", { subject: "getDetails" }, { timeout: 10000 });
```

## Develop

In the [muffin-framework](https://github.com/FootLooseLabs/muffin-framework) workspace (pnpm):

```sh
pnpm --filter @muffin/atom-websdk run build   # dist/sdk.min.js (CDN), dist/sdk.esm.js, dist/core.cjs + core.d.cts
pnpm --filter @muffin/atom-websdk test        # the request protocol and Service, in Node
pnpm test                                     # the browser specs (Playwright), from the workspace root
```

`dist/` is committed: the CDN serves it from the release tag.

## License

Copyright © Footloose Labs INC.
