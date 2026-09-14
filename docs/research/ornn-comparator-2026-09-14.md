# Ornn Compute Price Index as a Comparator for UCPI-H100-SXM-LISTED

**Status: internal research note. Not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026 from pages retrieved that day: `https://data.ornn.com/preview`, `https://data.ornn.com/markets`, `https://data.ornn.com/methodology`, `https://data.ornn.com/docs/quickstart`, and `https://www.ornn.com/`. Ornn's API requires a key and was not called; no account was created. Nothing here is a Urdais source: Ornn is a comparator, used to ask whether the first LISTED candidate is plausible.

## The two numbers

| | Urdais UCPI-H100-SXM-LISTED (candidate, 0.1.1-draft) | Ornn Compute Price Index, H100 SXM |
|---|---|---|
| Value | 3.74 USD per accelerator-hour | 2.78 USD per GPU-hour |
| As of | calculation date 2026-09-14, retrieval 01:10Z | "September 13, 2026 at 20:00 UTC"; markets page "Latest Settlement: September 13, 2026" |
| Object | listed on-demand price per independent legal seller | "realized rental prices, meaning prices actually being paid under active rentals ... Indicative or offered prices are excluded" |
| Statistic | unweighted median across sellers (even-N midpoint of 3.49 and 3.99) | "volume-weighted winsorized mean of executed transaction prices" |
| Window | one UTC calculation day, last complete retrieval | "a rolling one-hour window" per the methodology; the preview page says it "settles once per trading day" at 4:00 PM ET |
| Universe | 4 sellers named and disclosed (Voltage Park, Runpod, Hyperstack, Lambda), 1 technical source | "Provider identities are not disclosed publicly" |
| Geography | listed, provider-wide (no country asserted) | markets page labels the H100 SXM index "Global"; the methodology names regional indices ("the Ornn US H100 Index"; "North America, South America, Europe, Asia, Africa, and Oceania") |
| Procurement | on-demand only, spot and community excluded | "OCPI measures on-demand rentals only. Reserved-capacity, long-term, and forward contracts are outside the scope." The homepage says "live traded spot prices"; the methodology does not separate spot or interruptible from on-demand |
| Variant | H100 SXM 80 GB, Grade C identity from the vendor SKU | labelled "NVIDIA H100 SXM" on the markets and preview pages; the methodology text does not state the variant |
| Outlier handling | none; median | winsorized at percentile α and 1−α; "The percentile level α is set by Ornn and is not published." |

Spread of the Urdais candidate over Ornn: (3.74 − 2.78) / 2.78 = **34.5%**.

## What can and cannot be concluded

**The two are different economic objects, and the comparison does not show either is wrong.** Urdais measures what independent sellers ask; Ornn measures what its undisclosed contributors' customers pay. A clearing price below a list median is the expected direction: negotiated rates, committed-use discounts, broker inventory and marketplace competition all sit under posted prices. Ornn's own homepage draws the same line: "Our index is built on real trades. Not scraped offers, not surveys, not estimates."

**Per-seller dispersion says the spread is not uniform.** Against Ornn's 2.78: Voltage Park lists at 1.99 (28% below), Runpod at 3.49 (26% above), Hyperstack at 3.99 (44% above), Lambda at 4.19 (51% above). One of Urdais's four participants lists below the clearing benchmark. Price of Compute's own on-demand median across ten providers (3.93) sits 41% above Ornn. So a list median in the high threes against a clearing price in the high twos is consistent across two independent listing views, not an artefact of Urdais's seller selection.

**Three specific checks the user asked for, and what the retrieved pages support:**

1. *Is it H100 SXM specifically?* The index is labelled "NVIDIA H100 SXM" on both the markets and preview pages. The methodology document does not state the variant. Verified by label, not by method.
2. *Global or regional?* The markets page labels it "Global" and shows no regional breakdown. The methodology describes regional indices and a "US H100 Index". Which one the public 2.78 is cannot be settled from the retrieved pages; the label says global.
3. *Does it include spot, interruptible or contracted rentals?* Contracted and reserved are excluded by the methodology. Spot versus on-demand is not separated in the methodology text, and the homepage calls the series "spot prices" in the trading sense. Whether reclaimable-capacity rentals enter the 2.78 is unresolved.

**Overlap with Urdais's sellers is unknowable from public material.** Ornn does not disclose contributors, by design. Urdais therefore cannot say whether Runpod, Lambda, Voltage Park or Hyperstack transactions are in the 2.78.

**Weighting and window differ in kind.** A volume-weighted mean over one hour is dominated by whoever transacts the most GPU-hours; an unweighted seller median over a day gives each legal seller one vote. Even on identical inputs these would differ.

## Admissibility as a Urdais source

Ornn is not admissible to UCPI-H100-SXM-LISTED or to UCPI-H100-SXM: contributors undisclosed, winsorization level unpublished, so the family's "methodology disclosed, assessed and recorded" test for a licensed dataset fails on two counts; the API is keyed and its licence terms were not found on the retrieved pages; and its object (transacted prices) is a third statistic in the family's list, neither listed nor accessible-offer. It stays a comparator.

## A future metric

The user's suggestion holds: a **list-to-clearing spread** (Urdais listed median over a transaction benchmark) would be a real measure of pricing power and negotiation in compute. It needs a transaction source Urdais can lawfully use and whose methodology is disclosed. Until then the spread against Ornn is a research observation, published nowhere, and recorded here with its date.

## Verdict for PR #46

The 34.5% gap is informative, not disqualifying. It is the expected sign, it is corroborated by a second listing view, and the participant-level dispersion shows the sibling is measuring asking prices honestly rather than tracking a clearing level. No change to the candidate follows from this comparison.
