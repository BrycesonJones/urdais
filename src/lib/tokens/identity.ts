/**
 * Canonical model identity. Survives display-name and marketing renames because
 * the stable key is (provider slug, provider-native model id), not the label.
 *
 * Aliases such as `latest` are pointers, not historical identities, unless a
 * provider has published that a specific id is a pinned snapshot.
 */

export const MODEL_LIFECYCLE_STATUSES = ["current", "deprecated", "legacy", "retired"] as const;
export type ModelLifecycleStatus = (typeof MODEL_LIFECYCLE_STATUSES)[number];

export const MODEL_IDENTITY_KINDS = ["stable", "alias", "latest_pointer"] as const;
export type ModelIdentityKind = (typeof MODEL_IDENTITY_KINDS)[number];

export type ModelIdentity = {
  providerSlug: string;
  /** Exact provider-native identifier. Never rewritten to a display name. */
  providerModelId: string;
  displayName: string;
  modelFamily: string;
  version: string | null;
  lifecycleStatus: ModelLifecycleStatus;
  identityKind: ModelIdentityKind;
};

const PROVIDER_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UNSTABLE_ID = /(^|[._-])latest$/i;

export function modelIdentityKey(providerSlug: string, providerModelId: string): string {
  return `${providerSlug}::${providerModelId}`;
}

export function isStableHistoricalIdentity(kind: ModelIdentityKind): boolean {
  return kind === "stable";
}

export function looksLikeLatestPointer(providerModelId: string): boolean {
  const id = providerModelId.trim();
  return id.toLowerCase() === "latest" || UNSTABLE_ID.test(id);
}

export function classifyIdentityKind(providerModelId: string): ModelIdentityKind {
  if (looksLikeLatestPointer(providerModelId)) return "latest_pointer";
  return "stable";
}

/**
 * Stable rows are the only identities that may back a historical price series.
 * Alias and latest-pointer strings are recorded separately so a rename of the
 * pointer does not rewrite history.
 */
export function assertStableModelIdentity(identity: Pick<ModelIdentity, "providerSlug" | "providerModelId" | "identityKind">): void {
  if (!PROVIDER_SLUG.test(identity.providerSlug)) {
    throw new Error(`provider slug '${identity.providerSlug}' is not a kebab-case slug`);
  }
  if (!identity.providerModelId.trim()) {
    throw new Error("provider-native model id is required");
  }
  if (identity.identityKind !== "stable") {
    throw new Error(
      `model id '${identity.providerModelId}' is ${identity.identityKind}, not a stable historical identity`,
    );
  }
  if (looksLikeLatestPointer(identity.providerModelId)) {
    throw new Error(
      `model id '${identity.providerModelId}' looks like a latest pointer and cannot be a stable identity`,
    );
  }
}

export function assertIdentitySurvivesRename(before: ModelIdentity, after: ModelIdentity): void {
  if (modelIdentityKey(before.providerSlug, before.providerModelId) !== modelIdentityKey(after.providerSlug, after.providerModelId)) {
    throw new Error("renaming display metadata must not change (provider, provider-native id)");
  }
}
