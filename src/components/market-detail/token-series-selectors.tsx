"use client";

import { SelectMenu } from "@/components/market-detail/select-menu";
import { selectTokenInstrument } from "@/lib/tokens/read/instruments";
import type { MarketInstrumentDetail } from "@/types/market";

type TokenSeriesSelectorsProps = {
  instruments: readonly MarketInstrumentDetail[];
  instrument: MarketInstrumentDetail;
  onInstrumentChange: (instrumentId: string) => void;
  className?: string;
};

function uniqueBy<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = key(row);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Provider → Model → pricing-dimension menus. Reuses the existing SelectMenu;
 * does not add cards or extra sections.
 */
export function TokenSeriesSelectors({ instruments, instrument, onInstrumentChange, className }: TokenSeriesSelectorsProps) {
  const identity = instrument.tokenIdentity;
  if (!identity) return null;

  const providers = uniqueBy(
    instruments.filter((row) => row.tokenIdentity),
    (row) => row.tokenIdentity!.providerSlug,
  ).sort((a, b) => a.tokenIdentity!.providerName.localeCompare(b.tokenIdentity!.providerName, "en"));

  const models = uniqueBy(
    instruments.filter((row) => row.tokenIdentity?.providerSlug === identity.providerSlug),
    (row) => row.tokenIdentity!.providerModelId,
  ).sort((a, b) => a.tokenIdentity!.displayName.localeCompare(b.tokenIdentity!.displayName, "en"));

  const dimensions = instruments
    .filter(
      (row) =>
        row.tokenIdentity?.providerSlug === identity.providerSlug &&
        row.tokenIdentity.providerModelId === identity.providerModelId,
    )
    .sort((a, b) => a.tokenIdentity!.facetLabel.localeCompare(b.tokenIdentity!.facetLabel, "en"));

  function handleProvider(providerSlug: string) {
    const next = selectTokenInstrument(instruments, instrument, { providerSlug });
    onInstrumentChange(next.id);
  }

  function handleModel(providerModelId: string) {
    const next = selectTokenInstrument(instruments, instrument, { providerModelId });
    onInstrumentChange(next.id);
  }

  return (
    <div className={["flex flex-col gap-2 sm:flex-row sm:items-center", className].filter(Boolean).join(" ")}>
      <SelectMenu
        label="Provider"
        options={providers.map((row) => ({ id: row.tokenIdentity!.providerSlug, label: row.tokenIdentity!.providerName }))}
        value={identity.providerSlug}
        onChange={handleProvider}
        className="sm:min-w-40"
      >
        {identity.providerName}
      </SelectMenu>
      <SelectMenu
        label="Model"
        options={models.map((row) => ({ id: row.tokenIdentity!.providerModelId, label: row.tokenIdentity!.displayName }))}
        value={identity.providerModelId}
        onChange={handleModel}
        className="sm:min-w-40"
      >
        {identity.displayName}
      </SelectMenu>
      <SelectMenu
        label="Pricing dimension"
        options={dimensions.map((row) => ({ id: row.id, label: row.tokenIdentity!.facetLabel }))}
        value={instrument.id}
        onChange={onInstrumentChange}
        className="sm:min-w-44"
      >
        {identity.facetLabel}
      </SelectMenu>
    </div>
  );
}
