/**
 * The narrowest possible ABI decoder: exactly the return shapes the Chainlink read path
 * asks for, and nothing else.
 *
 * This is not a general ABI library and must not grow into one. It decodes five word-typed
 * returns and one dynamic `string`, because that is the whole of `AggregatorV3Interface`
 * plus `typeAndVersion()`. A generalised codec here would be infrastructure the slice does
 * not need and a much larger surface to get subtly wrong.
 *
 * Two decoding rules carry real weight and are therefore explicit rather than inherited:
 *
 *   - `answer` is **`int256`, not `uint256`**. Chainlink's interface returns a signed
 *     integer, and a negative answer decoded as unsigned becomes an astronomically large
 *     positive price that passes every "is it positive" check ever written. Two's
 *     complement is applied here so that a negative answer arrives at
 *     `validateChainlinkObservation` as a negative number and is refused by name.
 *   - Round ids are `uint80` and are carried as **decimal strings**. A uint80 does not
 *     survive a double, and a silently rounded round id makes the lineage unauditable in
 *     exactly the case the lineage exists for.
 *
 * Every failure here throws `AbiDecodeError`. The retrieval layer converts that into a
 * fail-closed problem code; nothing returns a partially decoded value.
 */

import { hexToBytes } from "./keccak";

export class AbiDecodeError extends Error {
  readonly what: string;
  constructor(what: string, detail: string) {
    super(`cannot decode ${what}: ${detail}`);
    this.name = "AbiDecodeError";
    this.what = what;
  }
}

const WORD = 32;

function words(data: string, what: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(data);
  } catch (error) {
    throw new AbiDecodeError(what, error instanceof Error ? error.message : String(error));
  }
  if (bytes.length === 0) {
    // The signature of a call that reached a contract without that function: the node
    // answers `0x` rather than reverting. Treated as a decode failure by name, because
    // "empty return data" is the exact symptom of a wrong selector.
    throw new AbiDecodeError(what, "the call returned no data (0x)");
  }
  if (bytes.length % WORD !== 0) {
    throw new AbiDecodeError(what, `${bytes.length} bytes is not a whole number of 32-byte words`);
  }
  return bytes;
}

function wordAt(bytes: Uint8Array, index: number, what: string): bigint {
  const start = index * WORD;
  if (start + WORD > bytes.length) {
    throw new AbiDecodeError(what, `word ${index} is past the end of ${bytes.length} bytes`);
  }
  let value = 0n;
  for (let i = start; i < start + WORD; i++) value = (value << 8n) | BigInt(bytes[i]!);
  return value;
}

const TWO_256 = 1n << 256n;
const INT256_MAX = (1n << 255n) - 1n;

/** Reinterpret a 256-bit word as a signed two's-complement integer. */
function asInt256(raw: bigint): bigint {
  return raw > INT256_MAX ? raw - TWO_256 : raw;
}

export type LatestRoundData = {
  /** uint80, decimal string. */
  roundId: string;
  /** int256, decimal string; negative where the feed reported a negative answer. */
  answer: string;
  startedAt: number;
  updatedAt: number;
  /** uint80, decimal string. Deprecated by Chainlink; frozen, never a validity condition. */
  answeredInRound: string;
};

/**
 * `latestRoundData()` -> (uint80, int256, uint256, uint256, uint80).
 *
 * The two timestamps are narrowed to `number` because they are unix seconds and every
 * consumer of them is; a value that would not survive that narrowing is refused here
 * rather than silently rounded.
 */
export function decodeLatestRoundData(data: string): LatestRoundData {
  const what = "latestRoundData()";
  const bytes = words(data, what);
  if (bytes.length < 5 * WORD) {
    throw new AbiDecodeError(what, `expected 5 words, got ${bytes.length / WORD}`);
  }
  const startedAt = wordAt(bytes, 2, what);
  const updatedAt = wordAt(bytes, 3, what);
  if (startedAt > BigInt(Number.MAX_SAFE_INTEGER) || updatedAt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AbiDecodeError(what, "a timestamp is too large to be unix seconds");
  }
  return {
    roundId: wordAt(bytes, 0, what).toString(),
    answer: asInt256(wordAt(bytes, 1, what)).toString(),
    startedAt: Number(startedAt),
    updatedAt: Number(updatedAt),
    answeredInRound: wordAt(bytes, 4, what).toString(),
  };
}

/** A word-typed unsigned return narrowed to `number`, for `decimals()`, `phaseId()`, `version()`. */
export function decodeUint(data: string, what: string): number {
  const value = wordAt(words(data, what), 0, what);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AbiDecodeError(what, `${value} exceeds the safe integer range`);
  }
  return Number(value);
}

/** An `address` return: the low 20 bytes of one word, lower-cased. */
export function decodeAddress(data: string, what: string): string {
  const value = wordAt(words(data, what), 0, what);
  if (value >> 160n !== 0n) {
    throw new AbiDecodeError(what, "the high 12 bytes of an address word are not zero");
  }
  return `0x${value.toString(16).padStart(40, "0")}`;
}

/**
 * A dynamic `string` return: an offset word, a length word, then the UTF-8 bytes padded to
 * a word boundary.
 *
 * The offset is honoured rather than assumed to be 32. It always is for a single dynamic
 * return, but reading past a wrong offset is how a decoder returns a plausible-looking
 * string that the contract never said.
 */
export function decodeString(data: string, what: string): string {
  const bytes = words(data, what);
  const offset = wordAt(bytes, 0, what);
  if (offset % 32n !== 0n || offset > BigInt(bytes.length)) {
    throw new AbiDecodeError(what, `the string offset ${offset} is not a valid word boundary`);
  }
  const offsetWord = Number(offset) / WORD;
  const length = wordAt(bytes, offsetWord, what);
  const start = Number(offset) + WORD;
  if (start + Number(length) > bytes.length) {
    throw new AbiDecodeError(what, `a ${length}-byte string does not fit in ${bytes.length} bytes`);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(start, start + Number(length)),
  );
}
