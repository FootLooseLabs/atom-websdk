/**
 * @muffin/atom-websdk — the browser SDK (src/main.js; on the CDN, dist/sdk.min.js, which also puts these on
 * window.Muffin): the web interface's client (WebRequestSdk) and the base class of an app's services (Service).
 */
import type { Reply } from "./core.js";
export type { Reply } from "./core.js";

/** Where a gateway is. */
export interface GatewayConfig {
  hostName: string;
  path: string;
  api_protocol: "ws://" | "wss://" | string;
  channelInstanceSig?: number;
}

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export interface ReconnectOptions {
  /** Waits between attempts, in ms; the last repeats (default 1s, 2s, 4s, 8s, 16s, 30s). */
  backoff?: number[];
}

export interface WebRequestSdkOptions {
  /** The PostOffice socket's name (default "sandbox_ws"). */
  name?: string;
  client_id?: string;
  /** The credential after `?auth=`: a value, or a function asked on every connect (a reconnect too). */
  token?: string | (() => string | Promise<string>);
  /** Sends `ping` this often while open (ms, default 60000). */
  keepAliveTimeout?: number;
  /** A built-in gateway ("sandbox", "sandbox_local") … */
  label?: string;
  /** … or this one. */
  config?: GatewayConfig;
  /** Kept open: opened again whenever it closes, its subscriptions made again (keep_open.js). */
  reconnect?: boolean | ReconnectOptions;
}

export interface RequestOptions {
  /** How long the reply is waited for, and the gateway's ttl (ms, default 5000). */
  MAX_RESPONSE_TIME?: number;
}

/** A PostOffice interface: what the SDK dispatches its events on. */
export interface EventInterface {
  on(event: string, fn: (payload: any) => void): void;
  dispatchMessage(event: string, payload?: unknown): void;
}

export class WebRequestSdk {
  constructor(options: WebRequestSdkOptions, lazyload?: boolean);
  /**
   * Its events: connect, close, error, state (a ConnectionState), resumed (open again, its subscriptions made again;
   * with reconnect), incoming-msg, incoming-response, incoming-event, agent-error.
   */
  readonly eventInterface: EventInterface;
  readonly state: ConnectionState;
  readonly connected: boolean;
  token: string;
  /** Opens it (calls meanwhile share the attempt); with reconnect, kept open from now until disconnect(). */
  connect(): Promise<{ state: number; msg: string }>;
  /** Closes it; what waits is rejected, and it is not opened again. */
  disconnect(): void;
  webrequest(address: string, message: unknown, options?: RequestOptions): Promise<Reply>;
  request(address: string, message: unknown, options?: RequestOptions): Promise<Reply>;
  /** Its events on the PostOffice socket `socketName` as `label` — once per socket and label. */
  websubscribe(address: string, socketName?: string, label?: string, options?: RequestOptions): Promise<true>;
  /** One route (socketName, label), the gateway told when it was the last; or, without them, every route. */
  webunsubscribe(address: string, options?: RequestOptions & { socketName?: string; label?: string }): Promise<Reply | { statusCode: 200; kept: true }>;
  communicate(lexemeLabel: string, frame: unknown): void;
}

/** The base of an app's services: static classes, each with its own TTL cache, and named locks taken in turn. */
export class Service {
  static name: string | null;
  static getCached<T = unknown>(key: string): T | null;
  static setCached(key: string, value: unknown, ttl?: number): void;
  static clearCache(key?: string): void;
  /** For what must not run twice at once — never needed for a request. */
  static lockInterface(name: string): Promise<void>;
  static unlockInterface(name: string): void;
  static lockSubscription(name: string): Promise<void>;
  static unlockSubscription(name: string): void;
}

export function applyAtomWebSDK(Muffin: object): void;
export default WebRequestSdk;
