/** @muffin/atom-websdk/core — the web interface's request protocol, runtime-neutral (see src/request_channel.js). */

/** A reply from the gateway: its interface (`op`), the request's `ref` and `token`, and a result or an error. */
export interface Reply {
  op: string;
  ref?: string;
  token?: string;
  result?: unknown;
  error?: unknown;
  message?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export interface RequestChannelOptions {
  /** Sends one text frame; throws when the connection is not open. */
  send(text: string): void;
  /** sha-256 hex of a text: the request's token. */
  digest(text: string): string | Promise<string>;
  /** How long a timed-out request keeps its turn on a gateway that does not echo `ref` (ms, default 10000). */
  lateReplyGrace?: number;
}

export class RequestChannel {
  constructor(options: RequestChannelOptions);
  /** True once a reply on this connection carried `ref`: requests then run side by side. */
  readonly echoesRef: boolean;
  /** How many requests wait for a reply. */
  readonly pending: number;
  /**
   * "host:::Service" with a request message, or "host|||Name" to subscribe. Resolves with the reply; rejects with
   * the reply when its `error` is truthy, or with `{ message }` (no reply in time, connection closed or not open).
   */
  request(address: string, payload: unknown, options?: { timeout?: number; key?: string }): Promise<Reply>;
  /** Ends a subscription ("host|||Name") on the gateway. */
  unsubscribe(address: string, options?: { timeout?: number }): Promise<Reply>;
  /** Every message that arrives, parsed: returns whether it was a reply to a request on this channel. */
  receive(message: unknown): boolean;
  /** The connection closed: everything waiting is rejected, and what was learnt about the gateway forgotten. */
  close(message?: string): void;
}
