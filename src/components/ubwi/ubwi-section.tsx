import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { formatCompact, formatNumber, formatUpdatedAt } from "@/lib/format";
import {
  UBWI_EXPLANATION,
  UBWI_GATE_SUMMARY,
  UBWI_METHODOLOGY_HREF,
  type UbwiSurface,
} from "@/lib/ubwi/read/surface";

/**
 * The public UBWI surface.
 *
 * It shows the value where one is published and says so plainly where none is, and in
 * both cases it shows the same disclosure: how much of the denominator is observed, how
 * much is modelled, the sensitivity range, and which large economies are not observed.
 * The modelled share is a first-class product property here, not a footnote -- roughly two
 * fifths of the denominator is a model, and a surface that hid that would be misreporting
 * what the number is.
 *
 * There is no demo level and no back series: history begins at the first verified
 * production observation.
 */
export function UbwiSection({ surface }: { surface: UbwiSurface }) {
  const usd = (value: number) => `$${formatCompact(value)}`;

  return (
    <section id="ubwi" aria-labelledby="ubwi-heading" className="scroll-mt-24">
      <SectionHeading
        id="ubwi-heading"
        title="Bitcoin's share of total global wealth"
        subtitle="UBWI"
      />

      <div className="mt-5 max-w-3xl">
        {surface.status === "published" ? (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium tabular-nums text-neutral-100">
                {formatNumber(surface.valuePercent, 4)}
              </span>
              <span className="text-lg text-neutral-400">{surface.unit}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Updated {formatUpdatedAt(Math.floor(Date.parse(surface.publishedAt) / 1000))}
            </p>
            {surface.changeWithheldReason ? (
              <p className="mt-1 text-xs text-neutral-500">{surface.changeWithheldReason}</p>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="text-sm text-neutral-300">{surface.reason}</p>
            <p className="mt-2 text-xs text-neutral-500">
              The gate requires a modelled share of at most{" "}
              {formatNumber(UBWI_GATE_SUMMARY.maxModeledSharePercent, 0)} % and rights-cleared
              observed coverage of at least{" "}
              {formatNumber(UBWI_GATE_SUMMARY.minRightsClearedCoveragePercent, 0)} % of world GDP.
              {surface.gateFailures.length > 0
                ? ` Refused on: ${surface.gateFailures.join(", ")}.`
                : null}
            </p>
          </div>
        )}

        <p className="mt-5 text-sm text-neutral-400">{UBWI_EXPLANATION}</p>

        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Figure
            label="Total Global Wealth"
            value={usd(surface.totalGlobalWealthUsd)}
            note="Observed national balance sheets, plus the modelled residual, plus Bitcoin."
          />
          <Figure
            label="Bitcoin market capitalization"
            value={usd(surface.bitcoinMarketCapUsd)}
            note={
              surface.priceProvenance
                ? `Issued supply at block ${formatNumber(surface.blockHeight, 0)}, priced at the ` +
                  `${surface.priceProvenance.feed} reference price on ${surface.priceProvenance.network}.`
                : `Issued supply at block ${formatNumber(surface.blockHeight, 0)}.`
            }
          />
          <Figure
            label="Directly observed"
            value={`${formatNumber(surface.observedSharePercent, 1)} %`}
            note={`${surface.observedEconomyCount} rights-cleared national balance sheets, ${formatNumber(
              surface.rightsClearedGdpCoverage * 100,
              1,
            )} % of world GDP.`}
          />
          <Figure
            label="Modelled"
            value={`${formatNumber(surface.modeledSharePercent, 1)} %`}
            note="A versioned residual model for economies that publish no comparable balance sheet. Modelled wealth, not observed wealth."
          />
          <Figure
            label="Sensitivity range"
            value={`${formatNumber(surface.sensitivity.lowPercent, 4)} – ${formatNumber(
              surface.sensitivity.highPercent,
              4,
            )} %`}
            note="The span of four named assumptions about the wealth-to-GDP ratio of the unobserved world. Not a confidence interval."
          />
          <Figure
            label="Versions"
            value={`Methodology ${surface.methodologyVersion} · Model ${surface.residualModelVersion}`}
            note={`Numerator observed ${surface.observedAt}.`}
          />
        </dl>

        {surface.unobservedMajorEconomies.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500">
              Large economies not directly observed
            </h3>
            <ul className="mt-2 space-y-2">
              {surface.unobservedMajorEconomies.map((economy) => (
                <li key={economy.economy} className="text-sm text-neutral-400">
                  <span className="text-neutral-300">{economy.name}</span>{" "}
                  <span className="tabular-nums text-neutral-500">
                    {formatNumber(economy.gdpShareOfWorld * 100, 2)} % of world GDP
                  </span>
                  <span className="block text-xs text-neutral-500">{economy.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {surface.priceProvenance ? (
          <div className="mt-6">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500">Price provenance</h3>
            <p className="mt-2 text-sm text-neutral-400">
              <span className="text-neutral-300">{surface.priceProvenance.feed}</span> on{" "}
              {surface.priceProvenance.network}, round {surface.priceProvenance.roundId}, feed
              updated{" "}
              {formatUpdatedAt(
                Math.floor(Date.parse(surface.priceProvenance.feedUpdatedAt) / 1000),
              )}
              .
            </p>
            {/* The rights qualification travels with the provenance. An inferred permission
                shown as if it were a licence would be the one dishonest thing on this page. */}
            <p className="mt-1 text-xs text-neutral-500">{surface.priceProvenance.rightsNote}</p>
          </div>
        ) : null}

        <p className="mt-6 text-xs text-neutral-500">
          <Link href={UBWI_METHODOLOGY_HREF} className="underline underline-offset-2 hover:text-neutral-300">
            Methodology, sources and publication gate
          </Link>
        </p>
      </div>
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-lg tabular-nums text-neutral-200">{value}</dd>
      <p className="mt-1 text-xs text-neutral-500">{note}</p>
    </div>
  );
}
