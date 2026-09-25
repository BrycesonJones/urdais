/**
 * ISO-NE's authentication, which is HTTP Basic over TLS and nothing more.
 *
 * Simple enough that the only thing worth writing down is the part that goes wrong: the header is
 * a base64 of `user:password`, which is *encoding* and not encryption, so an `Authorization` header
 * in a log is a plaintext password in a log. It is built here, handed straight to the request, and
 * never stored on a retrieval record.
 */

import { readIsoneCredentials, type EnvLike } from "@/lib/uepi/source/auth/credentials";

export const ISONE_API_BASE = "https://webservices.iso-ne.com/api/v1.1";

/** The headers an authenticated ISO-NE request needs. */
export function isoneAuthorizationHeaders(env: EnvLike = process.env): Record<string, string> {
  const { username, password } = readIsoneCredentials(env);
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return { authorization: `Basic ${encoded}`, accept: "application/json" };
}
