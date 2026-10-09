"use client";

import { useActionState } from "react";

import { continueWithAudienceAction, skipAudienceAction } from "@/app/access/audience/actions";
import { IDLE_AUDIENCE_STATE } from "@/app/access/audience/form-state";
import { AUDIENCE_ROLES } from "@/lib/onboarding/audience";

export function AudienceForm({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, pending] = useActionState(continueWithAudienceAction, IDLE_AUDIENCE_STATE);
  const failed = state.status === "error";

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-5" aria-describedby={failed ? "audience-error" : undefined}>
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <div className="flex flex-col gap-2">
          <label htmlFor="primary-role" className="text-sm font-medium text-neutral-300 sm:text-base">
            Primary role or organization
          </label>
          <select
            id="primary-role"
            name="primaryRole"
            defaultValue=""
            aria-invalid={failed || undefined}
            className="min-h-12 w-full rounded-lg border border-white/20 bg-[#0a0a0a] px-4 py-3 text-base text-neutral-100 outline-none transition-colors focus-visible:border-[#526fe0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]"
          >
            <option value="">Select your primary role</option>
            {AUDIENCE_ROLES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-lg bg-[#526fe0] px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[#6480e8] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff] sm:text-base"
        >
          {pending ? "Continuing…" : "Continue to account creation"}
        </button>

        {failed ? <p id="audience-error" role="alert" className="text-sm text-red-300">{state.message}</p> : null}
      </form>

      <form action={skipAudienceAction} className="text-center">
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <button
          type="submit"
          className="rounded-sm text-sm text-neutral-300 underline-offset-4 transition-colors hover:text-neutral-50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff] sm:text-base"
        >
          Skip for now
        </button>
      </form>
    </div>
  );
}

