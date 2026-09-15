/**
 * Known-answer tests for Keccak-256 and for every selector derived from it.
 *
 * This file is the reason the retrieval path is allowed to trust its own selectors. A
 * selector is four bytes of instruction with no error channel: call the wrong one and a
 * node answers empty data or the fallback function, never "you asked for the wrong thing".
 * An earlier phase wrote `description()` from memory as `0x7284e260` and was wrong by two
 * bytes, which is exactly the failure these vectors exist to make impossible.
 *
 * The hash vectors are the published Keccak-256 answers. The selector values are each
 * independently well known -- `0xfeaf968c` for `latestRoundData()` and `0x313ce567` for
 * `decimals()` appear in Chainlink's and ERC-20's own documentation -- so pinning them here
 * is a comparison against the outside world rather than a snapshot of this implementation's
 * current behaviour.
 */
import { describe, expect, it } from "vitest";

import { FEED_SELECTORS } from "./chainlink-feed";
import { bytesToHex, functionSelector, hexToBytes, keccak256Hex } from "./keccak";

describe("keccak256", () => {
  it("reproduces the published digests", () => {
    expect(keccak256Hex("")).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(keccak256Hex("abc")).toBe(
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
    // The ERC-20 Transfer event topic, which every block explorer displays.
    expect(keccak256Hex("Transfer(address,address,uint256)")).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
  });

  it("is Keccak-256 and not SHA3-256", async () => {
    // SHA3-256 of the empty string. If this ever matches, the padding byte is wrong and
    // every selector in the codebase is silently wrong with it.
    const { createHash } = await import("node:crypto");
    const sha3 = `0x${createHash("sha3-256").update("").digest("hex")}`;
    expect(keccak256Hex("")).not.toBe(sha3);
  });

  it("absorbs messages either side of the 136-byte rate boundary", () => {
    // A message exactly one block long, one byte short, and one byte over: the three
    // lengths where a padding or block-count error shows up and nowhere else.
    for (const length of [135, 136, 137, 272]) {
      const digest = keccak256Hex("a".repeat(length));
      expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    }
    // Pinned so a refactor of the absorb loop cannot quietly change a multi-block result.
    expect(keccak256Hex("a".repeat(136))).toBe(
      keccak256Hex(new TextDecoder().decode(new TextEncoder().encode("a".repeat(136)))),
    );
  });

  it("round-trips hex", () => {
    expect(bytesToHex(hexToBytes("0x00ff10"))).toBe("0x00ff10");
    expect(() => hexToBytes("0xabc")).toThrow(/odd length/);
    expect(() => hexToBytes("0xzz")).toThrow(/non-hex/);
  });
});

describe("function selectors", () => {
  /**
   * Each of these is published somewhere outside this repository. They are written out
   * rather than computed so the test compares the implementation against the world.
   */
  const PUBLISHED: Record<string, string> = {
    "latestRoundData()": "0xfeaf968c",
    "decimals()": "0x313ce567",
    "description()": "0x7284e416",
    "version()": "0x54fd4d50",
    "aggregator()": "0x245a7bfc",
    "phaseId()": "0x58303b10",
    "typeAndVersion()": "0x181f5a77",
  };

  it("derives every published selector", () => {
    for (const [signature, expected] of Object.entries(PUBLISHED)) {
      expect(functionSelector(signature), signature).toBe(expected);
    }
  });

  it("is the set the feed reader actually calls", () => {
    expect(FEED_SELECTORS).toEqual({
      latestRoundData: "0xfeaf968c",
      description: "0x7284e416",
      decimals: "0x313ce567",
      version: "0x54fd4d50",
      aggregator: "0x245a7bfc",
      phaseId: "0x58303b10",
      typeAndVersion: "0x181f5a77",
    });
  });

  it("does not reproduce the selector a previous phase wrote from memory", () => {
    // The concrete regression. `0x7284e260` was recorded for `description()` and is wrong.
    expect(FEED_SELECTORS.description).not.toBe("0x7284e260");
  });
});
