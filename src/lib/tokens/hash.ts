import { createHash } from "node:crypto";

/** SHA-256 hex of a retrieval body. The same function the UCPI collector uses. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
