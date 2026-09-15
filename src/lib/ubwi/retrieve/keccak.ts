/**
 * Keccak-256, and the Ethereum function selectors derived from it.
 *
 * ## Why this file exists at all
 *
 * A contract call is a four-byte selector: the first four bytes of the Keccak-256 hash of
 * the function's canonical signature. Those four bytes are the entire instruction. Get one
 * wrong and the node does not report an error that says so -- it returns empty data, or the
 * fallback function's answer, and the caller is left holding a number that came from
 * somewhere other than the function it believes it called.
 *
 * An earlier phase wrote a selector from memory. `description()` was recorded as
 * `0x7284e260`; the correct selector is `0x7284e416`. The two differ in their last two
 * bytes, which is exactly the kind of error that survives a code review and dies only
 * against a live node. Nothing in this codebase writes a selector by hand again: every
 * selector is computed, and ./keccak.test.ts holds the hash to published known answers and
 * each selector to its independently published value.
 *
 * ## Why it is implemented here rather than installed
 *
 * Node's `crypto` offers `sha3-256`, which is **not** this function. SHA-3 and Keccak-256
 * differ in one byte of padding -- SHA-3 appends `0x06`, original Keccak `0x01` -- and that
 * single byte changes every output. Reaching for `createHash("sha3-256")` is the other
 * classic way to get a silently wrong selector.
 *
 * The alternative is a hashing or ABI library, which for the sake of eight constant
 * selectors would add a dependency to the production surface of a published index.
 * Keccak-f[1600] is a hundred lines of fixed, standardised permutation with published test
 * vectors, so it is implemented and pinned to those vectors instead.
 *
 * Lanes are `bigint`. That is the slow choice and deliberately so: a few dozen hashes run
 * per publication, and 64-bit arithmetic split across two 32-bit halves is where a
 * hand-written Keccak usually goes wrong.
 */

const LANE_MASK = (1n << 64n) - 1n;

/** The rate, in bytes, for Keccak-256: 200 - 2 * 32. */
const RATE_BYTES = 136;

const ROUND_CONSTANTS: readonly bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** The rho rotation offsets, in the order the combined rho-pi step walks the lanes. */
const RHO_OFFSETS: readonly number[] = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
];

/** The pi lane permutation, in the same order. */
const PI_LANES: readonly number[] = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
];

function rotl64(value: bigint, bits: number): bigint {
  const n = BigInt(bits);
  return ((value << n) | (value >> (64n - n))) & LANE_MASK;
}

/** The Keccak-f[1600] permutation, in place on 25 lanes. */
function keccakF1600(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // theta
    const c: bigint[] = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) {
      c[x] = state[x]! ^ state[x + 5]! ^ state[x + 10]! ^ state[x + 15]! ^ state[x + 20]!;
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5]! ^ rotl64(c[(x + 1) % 5]!, 1);
      for (let y = 0; y < 25; y += 5) state[x + y] = state[x + y]! ^ d;
    }

    // rho and pi, as one walk of the 24 non-centre lanes
    let carried = state[1]!;
    for (let i = 0; i < 24; i++) {
      const target = PI_LANES[i]!;
      const held = state[target]!;
      state[target] = rotl64(carried, RHO_OFFSETS[i]!);
      carried = held;
    }

    // chi
    for (let y = 0; y < 25; y += 5) {
      const row = [state[y]!, state[y + 1]!, state[y + 2]!, state[y + 3]!, state[y + 4]!];
      for (let x = 0; x < 5; x++) {
        state[y + x] = row[x]! ^ (~row[(x + 1) % 5]! & LANE_MASK & row[(x + 2) % 5]!);
      }
    }

    // iota
    state[0] = state[0]! ^ ROUND_CONSTANTS[round]!;
  }
}

/** Keccak-256 of a byte string. Original Keccak padding (`0x01 ... 0x80`), not SHA-3's. */
export function keccak256(message: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil((message.length + 1) / RATE_BYTES) * RATE_BYTES);
  padded.set(message);
  padded[message.length] = 0x01;
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) | 0x80;

  const state: bigint[] = new Array<bigint>(25).fill(0n);

  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let lane = 0; lane < RATE_BYTES / 8; lane++) {
      let word = 0n;
      // Little-endian: byte 0 of a lane is its least significant byte.
      for (let byte = 7; byte >= 0; byte--) {
        word = (word << 8n) | BigInt(padded[offset + lane * 8 + byte]!);
      }
      state[lane] = state[lane]! ^ word;
    }
    keccakF1600(state);
  }

  const digest = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane++) {
    let word = state[lane]!;
    for (let byte = 0; byte < 8; byte++) {
      digest[lane * 8 + byte] = Number(word & 0xffn);
      word >>= 8n;
    }
  }
  return digest;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const body = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (body.length % 2 !== 0) throw new Error(`hex string has an odd length: ${body.length}`);
  if (body.length > 0 && !/^[0-9a-fA-F]+$/.test(body)) {
    throw new Error("hex string carries a non-hex character");
  }
  const bytes = new Uint8Array(body.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Keccak-256 of a UTF-8 string, as `0x`-prefixed hex. */
export function keccak256Hex(text: string): string {
  return bytesToHex(keccak256(new TextEncoder().encode(text)));
}

/**
 * The four-byte selector for a canonical function signature.
 *
 * "Canonical" is load-bearing: no spaces, no parameter names, no return types, and
 * elementary type names spelled in full (`uint256`, never `uint`). Every signature this
 * module calls is nullary, which removes the only part of that rule anyone gets wrong.
 */
export function functionSelector(signature: string): string {
  return keccak256Hex(signature).slice(0, 10);
}
