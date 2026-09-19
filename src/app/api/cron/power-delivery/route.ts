import { timingSafeEqual } from "node:crypto";

import { runPowerIngestion, scheduledPowerWindow } from "@/lib/power-delivery/run";
import { readEiaApiKey } from "@/lib/power-delivery/source/eia930";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function equalSecret(presented: string, expected: string): boolean {
  const a = Buffer.from(presented); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function powerCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  return Boolean(expected && authorization?.startsWith("Bearer ") && equalSecret(authorization.slice(7), expected));
}

export async function GET(request: Request): Promise<Response> {
  if (!powerCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  if (!readEiaApiKey()) return Response.json({ ok: false, reason: "no_eia_api_key" }, { status: 503 });
  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const window = scheduledPowerWindow();
    const result = await runPowerIngestion(sql, { ...window, trigger: "scheduled" });
    console.log(`power delivery cron: ${JSON.stringify(result)}`);
    return Response.json(result, { status: result.outcome === "succeeded" ? 200 : result.outcome === "partial" ? 207 : 502 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`power delivery cron: failed (${detail})`);
    return Response.json({ ok: false, reason: "run_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
