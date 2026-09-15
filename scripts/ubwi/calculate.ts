/**
 * Compute UBWI from the production observed set and print the full lineage.
 *
 * Read-only by default. It prints every intermediate the published record needs -- each
 * observed economy with its source, reference date, FX conversion and rights state, the
 * observed subtotal, the residual model parameters, the imputed subtotal, Total Global
 * Wealth, the numerator, the value, the sensitivity panel and the gate result -- so that
 * the number can be checked by hand against the compilers' own publications.
 *
 * Usage:
 *   npm run ubwi:calculate                 compute and print
 *   npm run ubwi:calculate -- --json       machine-readable output
 */
import {
  calculateUbwi,
  METHODOLOGY_VERSION,
  RESIDUAL_MODEL_VERSION,
} from "@/lib/ubwi/calculate";
import { evaluateGate, PRODUCTION_V1_THRESHOLDS, FEASIBLE_FRONTIER } from "@/lib/ubwi/gate";
import { venueDispersionBasisPoints } from "@/lib/ubwi/numerator";
import { validateChainlinkObservation } from "@/lib/ubwi/chainlink";
import { sourceInterface } from "@/lib/ubwi/rights";

const tn = (usd: number) => `${(usd / 1e12).toFixed(4)} tn`;
const pct = (share: number) => `${(share * 100).toFixed(4)} %`;

function main(): void {
  const calculatedAt = new Date().toISOString();
  const calculation = calculateUbwi({ calculatedAt });
  const gate = evaluateGate(calculation);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ calculation, gate }, null, 2));
    process.exit(gate.passed ? 0 : 1);
  }

  console.log(`UBWI calculation  methodology ${METHODOLOGY_VERSION}  residual model ${RESIDUAL_MODEL_VERSION}`);
  console.log(`calculated at ${calculatedAt}\n`);

  console.log("OBSERVED ECONOMIES");
  console.log(
    `  ${"iso".padEnd(4)}${"reference".padEnd(12)}${"value $tn".padStart(11)}  ` +
      `${"fx".padEnd(9)}${"fixing".padEnd(12)}${"land".padEnd(20)}${"rights".padEnd(9)}source`,
  );
  const sorted = [...calculation.observed].sort((a, b) => b.valueUsd - a.valueUsd);
  for (const e of sorted) {
    console.log(
      `  ${e.economy.padEnd(4)}${e.referenceDate.padEnd(12)}${(e.valueUsd / 1e12).toFixed(4).padStart(11)}  ` +
        `${e.currency.padEnd(9)}${(e.fx.fixingDate ?? "n/a").padEnd(12)}` +
        `${e.landTreatment.padEnd(20)}${e.rightsStatus.padEnd(9)}${e.sourceSeries.slice(0, 64)}`,
    );
  }
  console.log(`  ${"".padEnd(16)}${(calculation.observedWealthUsd / 1e12).toFixed(4).padStart(11)}  observed subtotal, n=${calculation.observed.length}\n`);

  console.log("EXCLUDED BY THE VINTAGE RULE");
  for (const e of calculation.excluded) {
    console.log(`  ${e.economy}  ${e.referenceDate}  GDP weight ${(e.gdpUsd2024 / 1e9).toFixed(0)} bn  ${e.reason}`);
  }

  console.log("\nRESIDUAL MODEL");
  const r = calculation.residual;
  console.log(`  observed-set wealth-to-GDP ratio R : ${r.observedRatio.toFixed(6)}`);
  console.log(`  CWON 2020 tail calibration k       : ${r.tailCalibration.toFixed(6)}  (${r.tailCalibrationSource})`);
  console.log(`  central tail ratio  k x R          : ${r.centralTailRatio.toFixed(6)}`);
  console.log(`  unobserved world GDP               : ${tn(r.unobservedGdpUsd)}  (${r.worldGdpSource})`);
  console.log(`  modeled residual wealth            : ${tn(r.imputedWealthUsd)}`);

  console.log("\nCOVERAGE");
  const c = calculation.coverage;
  console.log(`  economies observed                 : ${c.observedEconomyCount}`);
  console.log(`  rights-cleared                     : ${c.rightsClearedEconomyCount} of ${c.observedEconomyCount}`);
  console.log(`  observed share of world GDP        : ${pct(c.observedGdpCoverage)}`);
  console.log(`  rights-cleared share of world GDP  : ${pct(c.rightsClearedGdpCoverage)}`);
  console.log(`  observed share of CWON wealth      : ${pct(c.observedWealthCoverage)}`);
  console.log(`  measured feasible frontier         : ${pct(FEASIBLE_FRONTIER.nearTermCoverage)} (near term), ${pct(FEASIBLE_FRONTIER.counterfactualCoverage)} (counterfactual)`);

  console.log("\nNUMERATOR");
  const n = calculation.numerator;
  console.log(`  observed at    : ${n.observedAt}`);
  console.log(`  block height   : ${n.blockHeight}  confirmed by ${n.heightSources.join(", ")}`);
  console.log(`  issued supply  : ${n.supplyBtc.toFixed(8)} BTC  (${n.supplyConstruction})`);
  console.log(`  price rule     : ${n.priceRule}`);
  for (const v of n.venues ?? []) {
    console.log(`  venue ${v.venue.padEnd(10)}: ${v.priceUsd.toFixed(2)}${v.selected ? "   <- median" : ""}`);
  }
  if (n.venues !== undefined) {
    console.log(`  dispersion     : ${venueDispersionBasisPoints(n).toFixed(2)} bp across venues`);
  }
  const feed = n.chainlink;
  if (feed !== undefined) {
    const check = validateChainlinkObservation(feed);
    console.log(`  feed           : ${feed.description} on chain ${feed.chainId} via proxy ${feed.proxyAddress}`);
    console.log(`  aggregator     : ${feed.aggregatorAddress ?? "not determined"}  ${feed.aggregatorTypeAndVersion ?? ""}`);
    console.log(`  round          : ${feed.roundId}  (phase ${feed.phaseId}, aggregator round ${feed.aggregatorRoundId})`);
    console.log(`  answer         : ${feed.answer} / 1e${feed.decimals}`);
    console.log(`  updated at     : ${new Date(feed.updatedAt * 1000).toISOString()}`);
    console.log(`  age at read    : ${check.ageSeconds} s against a ${check.heartbeatSeconds} s heartbeat  ${check.valid ? "valid" : `INVALID: ${check.problems.join(", ")}`}`);
    console.log(`  block          : ${feed.blockNumber}  ${feed.blockHash}`);
    console.log(`  rpc            : ${feed.rpcSource}${feed.rpcCrossCheckSource ? ` (cross-checked against ${feed.rpcCrossCheckSource})` : ""}`);
  }
  console.log(`  price          : ${n.priceUsd.toFixed(2)} USD`);
  console.log(`  market cap     : ${tn(n.marketCapUsd)}`);

  console.log("\nTOTAL GLOBAL WEALTH");
  console.log(`  observed rights-cleared wealth : ${tn(calculation.observedWealthUsd).padStart(12)}  ${calculation.observedShareOfTotal.toFixed(4)} %`);
  console.log(`  modeled residual wealth        : ${tn(calculation.modeledWealthUsd).padStart(12)}  ${calculation.modeledShareOfTotal.toFixed(4)} %`);
  console.log(`  bitcoin market capitalization  : ${tn(n.marketCapUsd).padStart(12)}  ${calculation.ubwiPercent.toFixed(4)} %`);
  console.log(`  TOTAL GLOBAL WEALTH            : ${tn(calculation.totalGlobalWealthUsd).padStart(12)}`);

  console.log("\nSENSITIVITY");
  for (const s of calculation.scenarios) {
    const mark = s.key === "central" ? " <- published" : "";
    console.log(
      `  ${s.label.padEnd(58)} r=${s.tailRatio.toFixed(4)}  TGW ${tn(s.totalGlobalWealthUsd)}  UBWI ${s.ubwiPercent.toFixed(4)} %${mark}`,
    );
  }
  console.log(`  range: ${calculation.sensitivity.lowPercent.toFixed(4)} % - ${calculation.sensitivity.highPercent.toFixed(4)} %`);

  console.log("\nUNOBSERVED ECONOMIES ABOVE THE DISCLOSURE THRESHOLD");
  for (const e of calculation.unobservedMajorEconomies) {
    console.log(`  ${e.economy}  ${(e.gdpShareOfWorld * 100).toFixed(2)} % of world GDP  ${e.reason}`);
  }

  console.log(`\nUBWI = ${calculation.ubwiPercent.toFixed(4)} %`);

  console.log("\nAUTOMATION");
  for (const iface of calculation.observed.map((e) => sourceInterface(e.sourceInterface))) {
    if (iface && !iface.automatedRetrievalAvailable) {
      console.log(`  ${iface.slug}: automated retrieval unavailable -- ${iface.note ?? ""}`);
    }
  }

  console.log("\nPUBLICATION GATE");
  console.log(`  imputed share of wealth      : ${pct(gate.measures.imputedShareOfWealth)}  (ceiling ${pct(PRODUCTION_V1_THRESHOLDS.maxImputedShareOfWealth)})`);
  console.log(`  rights-cleared GDP coverage  : ${pct(gate.measures.rightsClearedGdpCoverage)}  (floor ${pct(PRODUCTION_V1_THRESHOLDS.minRightsClearedGdpCoverage)})`);
  console.log(`  vintage span                 : ${gate.measures.oldestReferenceYear}-${gate.measures.newestReferenceYear} (${gate.measures.vintageDispersionYears}y)`);
  if (gate.passed) {
    console.log("  PASSED: this calculation may be published.");
  } else {
    console.log("  REFUSED:");
    for (const f of gate.findings) {
      console.log(`    [${f.code}] ${f.detail}`);
      console.log(`        remedy: ${f.remedy}`);
    }
    console.log("\n  No value is published. The gate is not relaxed to produce a number.");
  }

  process.exit(gate.passed ? 0 : 1);
}

main();
