/**
 * The shape the audience form renders.
 *
 * Separate from `./actions` because that file is `"use server"`, and a
 * `"use server"` module may only export async functions. Exporting the constant
 * below from there passes the build and fails every submission at runtime with
 * "A "use server" file can only export async functions, found object." The same
 * split as @/app/auth/form-state.
 */

export type AudienceFormState = { readonly status: "idle" | "error"; readonly message?: string };

export const IDLE_AUDIENCE_STATE: AudienceFormState = { status: "idle" };
