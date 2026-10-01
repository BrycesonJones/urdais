/**
 * Auth administration: one operation, one secret, nothing else.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteUser = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn(() => ({ auth: { admin: { deleteUser } } })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { authAdminAvailability, deleteAuthUser } from "@/lib/auth/admin";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_never_log_me",
};

beforeEach(() => {
  deleteUser.mockReset();
  createClient.mockClear();
});

describe("availability", () => {
  it("needs a modern secret key and a project URL", () => {
    expect(authAdminAvailability(ENV)).toEqual({ kind: "available" });
    expect(authAdminAvailability({ ...ENV, SUPABASE_SECRET_KEY: "" })).toEqual({ kind: "unavailable", reason: "missing_key" });
    expect(authAdminAvailability({ ...ENV, SUPABASE_SECRET_KEY: "sb_publishable_x" })).toEqual({ kind: "unavailable", reason: "not_a_secret_key" });
    expect(authAdminAvailability({ ...ENV, SUPABASE_SECRET_KEY: "eyJhbGciOi.legacy.jwt" })).toEqual({ kind: "unavailable", reason: "not_a_secret_key" });
    expect(authAdminAvailability({ SUPABASE_SECRET_KEY: "sb_secret_x" })).toEqual({ kind: "unavailable", reason: "no_project_url" });
  });
});

describe("deleteAuthUser", () => {
  it("hard-deletes through the Admin API with a non-persisting client", async () => {
    deleteUser.mockResolvedValue({ data: {}, error: null });
    expect(await deleteAuthUser("user-1", ENV)).toEqual({ kind: "deleted" });
    expect(deleteUser).toHaveBeenCalledWith("user-1", false);
    expect(createClient).toHaveBeenCalledWith(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it("treats a user that is already gone as done", async () => {
    deleteUser.mockResolvedValue({ data: null, error: { status: 404, code: "user_not_found", message: "User not found" } });
    expect(await deleteAuthUser("user-1", ENV)).toEqual({ kind: "already_absent" });
  });

  it("reduces any other failure to a short code, never the provider's message", async () => {
    deleteUser.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure", message: "reader@example.invalid broke" } });
    expect(await deleteAuthUser("user-1", ENV)).toEqual({ kind: "failed", code: "unexpected_failure" });
    deleteUser.mockResolvedValue({ data: null, error: { status: 500, message: "Something with sb_secret_never_log_me" } });
    expect(await deleteAuthUser("user-1", ENV)).toEqual({ kind: "failed", code: "auth_admin_error" });
    deleteUser.mockRejectedValue(new Error("fetch failed"));
    expect(await deleteAuthUser("user-1", ENV)).toEqual({ kind: "failed", code: "auth_admin_unreachable" });
  });

  it("does nothing without the key", async () => {
    expect(await deleteAuthUser("user-1", { ...ENV, SUPABASE_SECRET_KEY: "" })).toEqual({ kind: "unavailable" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("containment", () => {
  const SRC = path.resolve(__dirname, "..", "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
    }
  };
  walk(SRC);

  it("only the deletion workflow imports the admin module", () => {
    const importers = files.filter((f) => /from "@\/lib\/auth\/admin"/.test(readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f));
    expect(importers.sort()).toEqual(["lib/account/deletion.ts"]);
  });

  it("no client component reaches it, and the key is never public or logged", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/NEXT_PUBLIC_SUPABASE_SECRET/);
      if (/^["']use client["']/.test(source.trim())) expect(source, file).not.toMatch(/lib\/auth\/admin|SUPABASE_SECRET_KEY/);
      expect(source, file).not.toMatch(/console\.\w+\([^)]*SUPABASE_SECRET_KEY/);
    }
  });

  it("never deletes from auth.users with SQL", () => {
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/delete\s+from\s+auth\.users/i);
  });
});
