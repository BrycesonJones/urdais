/**
 * The Ethereum JSON-RPC access the UBWI price leg needs, and nothing more.
 *
 * Four methods are used -- `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber` and
 * `eth_call` -- against keyless public endpoints. There is no signing, no transaction, no
 * account and no key anywhere in this path, which is what lets the endpoint URL be frozen
 * on a published observation as provenance: `rpcSource` is an identity, never a secret.
 *
 * ## Why a transport interface rather than `fetch` inline
 *
 * The retrieval logic is the part that has to be tested against a malformed response, a
 * disagreeing second endpoint, a negative price and a lagging node -- none of which a real
 * endpoint will produce on demand. The transport is therefore injected, and the default
 * one is the only thing in this module that touches the network.
 *
 * ## Configuration
 *
 * `UBWI_ETH_RPC_URLS`, a comma-separated list, overrides the defaults. It is optional by
 * design: both defaults are public, keyless endpoints, so a deployment needs no new secret
 * to publish UBWI, and an operator who wants different endpoints can set them without a
 * code change. The first entry is the primary read; the second is the independent
 * cross-check. A single-endpoint configuration is refused by the retrieval layer, because
 * the observation shape promises a cross-check and one endpoint cannot provide it.
 */

export class RpcError extends Error {
  readonly endpoint: string;
  readonly rpcMethod: string;
  constructor(endpoint: string, rpcMethod: string, detail: string) {
    super(`${rpcMethod} against ${endpoint} failed: ${detail}`);
    this.name = "RpcError";
    this.endpoint = endpoint;
    this.rpcMethod = rpcMethod;
  }
}

/** One JSON-RPC round trip. Injected so every failure mode above is reachable in a test. */
export type RpcTransport = (
  endpoint: string,
  method: string,
  params: readonly unknown[],
) => Promise<unknown>;

/**
 * The default endpoints.
 *
 * Both were read from live in the session that captured the first production observation,
 * and both answer without a key. Endpoints that were tried and rejected are recorded here
 * so the next operator does not rediscover them: `cloudflare-eth.com` answers an internal
 * error, `rpc.ankr.com/eth` now requires an API key, and `eth.llamarpc.com` returns
 * intermittent 525s.
 */
export const DEFAULT_UBWI_RPC_ENDPOINTS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
] as const;

export const UBWI_RPC_ENDPOINTS_ENV = "UBWI_ETH_RPC_URLS" as const;

/**
 * Resolve the endpoint list. Absent or blank configuration means the defaults, which is
 * the ordinary case: this variable exists to let an operator move off a public endpoint,
 * not to make one mandatory.
 */
export function resolveUbwiRpcEndpoints(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const configured = (env[UBWI_RPC_ENDPOINTS_ENV] ?? "").trim();
  if (configured === "") return [...DEFAULT_UBWI_RPC_ENDPOINTS];
  const endpoints = configured
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url !== "");
  return endpoints.length > 0 ? endpoints : [...DEFAULT_UBWI_RPC_ENDPOINTS];
}

/** The per-request timeout. A scheduled run has 60 seconds in total for a dozen calls. */
export const RPC_TIMEOUT_MS = 12_000;

/** The default transport: platform `fetch`, one request, an abort-based timeout, no retry. */
export function fetchRpcTransport(timeoutMs: number = RPC_TIMEOUT_MS): RpcTransport {
  return async (endpoint, method, params) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let body: string;
    let status: number;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });
      status = response.status;
      body = await response.text();
    } catch (error) {
      const detail =
        error instanceof Error && error.name === "AbortError"
          ? `no response within ${timeoutMs} ms`
          : error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
      throw new RpcError(endpoint, method, detail);
    } finally {
      clearTimeout(timer);
    }

    if (status < 200 || status >= 300) {
      throw new RpcError(endpoint, method, `HTTP ${status}`);
    }
    return parseJsonRpcResponse(endpoint, method, body);
  };
}

/**
 * Parse one JSON-RPC response envelope into its `result`.
 *
 * A JSON-RPC error is an ordinary 200 with an `error` member, so a transport that only
 * checked the HTTP status would hand a decoder the string `undefined` and let it fail
 * somewhere much less informative. Exported because it is the shape the tests assert on.
 */
export function parseJsonRpcResponse(endpoint: string, method: string, body: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new RpcError(endpoint, method, "the response body is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new RpcError(endpoint, method, "the response is not a JSON-RPC object");
  }
  const envelope = parsed as { result?: unknown; error?: unknown };
  if (envelope.error !== undefined && envelope.error !== null) {
    const error = envelope.error as { code?: unknown; message?: unknown };
    const message = typeof error.message === "string" ? error.message : JSON.stringify(error);
    throw new RpcError(endpoint, method, `JSON-RPC error ${String(error.code ?? "?")}: ${message}`);
  }
  if (!("result" in envelope)) {
    throw new RpcError(endpoint, method, "the response carries neither a result nor an error");
  }
  return envelope.result;
}

function expectHexString(endpoint: string, method: string, value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new RpcError(endpoint, method, `expected a hex string, got ${typeof value}`);
  }
  return value;
}

function expectQuantity(endpoint: string, method: string, value: unknown): bigint {
  const hex = expectHexString(endpoint, method, value);
  if (hex === "0x") throw new RpcError(endpoint, method, "expected a quantity, got 0x");
  return BigInt(hex);
}

/** One endpoint, bound to a transport. The unit the retrieval layer reasons about. */
export class EthereumEndpoint {
  readonly url: string;
  private readonly transport: RpcTransport;

  constructor(url: string, transport: RpcTransport) {
    this.url = url;
    this.transport = transport;
  }

  async chainId(): Promise<number> {
    const value = expectQuantity(this.url, "eth_chainId", await this.transport(this.url, "eth_chainId", []));
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RpcError(this.url, "eth_chainId", `${value} is not a plausible chain id`);
    }
    return Number(value);
  }

  async blockNumber(): Promise<number> {
    const value = expectQuantity(
      this.url,
      "eth_blockNumber",
      await this.transport(this.url, "eth_blockNumber", []),
    );
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RpcError(this.url, "eth_blockNumber", `${value} is not a plausible block number`);
    }
    return Number(value);
  }

  /** The block hash at a height, which is what makes a pinned read re-runnable later. */
  async blockHash(blockNumber: number): Promise<string> {
    const method = "eth_getBlockByNumber";
    const result = await this.transport(this.url, method, [toBlockTag(blockNumber), false]);
    if (typeof result !== "object" || result === null) {
      throw new RpcError(this.url, method, `block ${blockNumber} was not returned`);
    }
    const hash = (result as { hash?: unknown }).hash;
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new RpcError(this.url, method, `block ${blockNumber} carries no usable hash`);
    }
    return hash;
  }

  /**
   * A read-only contract call, always pinned to an explicit block.
   *
   * There is no `latest` convenience here on purpose. A read whose block is "whatever the
   * node had" cannot be re-run, and a set of reads at unpinned blocks can straddle a round
   * boundary and produce an observation that never existed at any single instant.
   */
  async call(to: string, selector: string, blockNumber: number): Promise<string> {
    const method = "eth_call";
    const result = await this.transport(this.url, method, [
      { to, data: selector },
      toBlockTag(blockNumber),
    ]);
    return expectHexString(this.url, method, result);
  }
}

export function toBlockTag(blockNumber: number): string {
  return `0x${blockNumber.toString(16)}`;
}
