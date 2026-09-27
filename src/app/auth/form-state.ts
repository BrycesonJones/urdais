/**
 * The shape the minimal auth forms render.
 *
 * Separate from `./actions` because that file is `"use server"`, and a
 * `"use server"` module may only export async functions — exporting the constant
 * below from there fails the build with "Failed to collect page data", which is
 * not an obvious message for the cause. Types are erased and could have stayed,
 * but keeping the type beside the value it describes is clearer than splitting
 * them.
 */

export type AuthFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "check_email"; message: string };

export const IDLE_AUTH_STATE: AuthFormState = { status: "idle" };
