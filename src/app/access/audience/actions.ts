"use server";

import { redirect } from "next/navigation";

import { isAudienceRole } from "@/lib/onboarding/audience";
import {
  AudienceStateUnavailableError,
  forgetPendingAudience,
  rememberPendingAudience,
} from "@/lib/onboarding/pending-audience";
import { onboardingHref } from "@/lib/onboarding/routes";
import { safeReturnTo } from "@/lib/auth/return-to";
import type { AudienceFormState } from "@/app/access/audience/form-state";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function accountCreationHref(formData: FormData): string {
  return onboardingHref("create_account", safeReturnTo(field(formData, "returnTo")));
}

export async function continueWithAudienceAction(
  _previous: AudienceFormState,
  formData: FormData,
): Promise<AudienceFormState> {
  const role = field(formData, "primaryRole");

  // A blank select is the same privacy-preserving choice as Skip. Unknown values
  // are rejected rather than stored or silently coerced to "other".
  if (role === "") {
    await forgetPendingAudience();
    redirect(accountCreationHref(formData));
  }
  if (!isAudienceRole(role)) {
    return { status: "error", message: "Choose one of the available roles, or skip this step." };
  }

  try {
    await rememberPendingAudience(role);
  } catch (error) {
    if (error instanceof AudienceStateUnavailableError) {
      return { status: "error", message: "We couldn’t save that selection right now. You can skip and continue." };
    }
    throw error;
  }
  redirect(accountCreationHref(formData));
}

export async function skipAudienceAction(formData: FormData): Promise<void> {
  await forgetPendingAudience();
  redirect(accountCreationHref(formData));
}

