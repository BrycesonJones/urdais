/**
 * Reading the durable entitlement state out of Postgres.
 *
 * One query, one row, one account. The table it reads —
 * `identity.premium_entitlements` — has the account as its primary key, so
 * "does this person subscribe" cannot become a multi-row question with an
 * ordering bug in it.
 *
 * Nothing here writes. Provisioning is the billing phase's job and will land as
 * its own module; a read path that could also grant is a read path that will
 * eventually grant by accident.
 *
 * RLS is enabled on both identity tables with no policies, exactly like every
 * other Urdais table, so this query only succeeds on the server's privileged
 * connection. A browser holding a Supabase anon key reads nothing from here,
 * which is what makes the server the only authority rather than merely the
 * intended one.
 */

import type { EntitlementSource, EntitlementStatus, PremiumEntitlement } from "@/lib/access/entitlement";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

/**
 * The query. Written out rather than assembled so that what runs against
 * production is greppable from the repository.
 */
export const PREMIUM_ENTITLEMENT_QUERY = `
  select status, source, external_reference, granted_at, revoked_at
    from identity.premium_entitlements
   where account_id = $1
`;

const STATUSES: readonly EntitlementStatus[] = ["active", "inactive"];
const SOURCES: readonly EntitlementSource[] = ["manual", "stripe"];

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}

/**
 * The account's entitlement, or `null` when it has none.
 *
 * A row whose `status` or `source` is not a value this build knows is treated
 * as **no entitlement**, not as an error and not as active. That is the fail-safe
 * direction across a deploy skew: if a future migration adds a status this
 * running build has never heard of, the worst outcome is a subscriber briefly
 * seeing a gate, rather than an unentitled reader being handed premium data
 * because an unrecognised string fell through a default.
 */
export async function loadPremiumEntitlement(sql: TokenSqlExecutor, accountId: string): Promise<PremiumEntitlement | null> {
  const trimmed = accountId.trim();
  if (trimmed === "") return null;

  const { rows } = await sql.query(PREMIUM_ENTITLEMENT_QUERY, [trimmed]);
  const row = rows[0];
  if (!row) return null;

  const status = row.status;
  const source = row.source;
  if (typeof status !== "string" || !STATUSES.includes(status as EntitlementStatus)) return null;
  if (typeof source !== "string" || !SOURCES.includes(source as EntitlementSource)) return null;

  return {
    status: status as EntitlementStatus,
    source: source as EntitlementSource,
    externalReference: typeof row.external_reference === "string" && row.external_reference.trim() !== "" ? row.external_reference : null,
    grantedAt: isoOrNull(row.granted_at),
    revokedAt: isoOrNull(row.revoked_at),
  };
}
