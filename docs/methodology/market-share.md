# Urdais Market Share Methodology

**Governed by [UTVI methodology](/docs/methodology/utvi) version 1.1.0, approved 16 September 2026. Status: approved for production, effective from 1 January 2025.** Market Share is the derived breakdown UTVI §14 describes. It has no methodology object of its own, no ingestion of its own and no source of its own: it is an aggregation of observations UTVI has already collected, normalised and attributed, and it is versioned with UTVI because a change to either would change both.

## 1. The claim, in one sentence

> **Market Share measures share of observed OpenRouter token volume represented in UTVI.**

That sentence is the whole of what Urdais asserts here, and every surface carrying a share renders it. Market Share is **not**, and must never be described as:

- global AI market share
- global model usage
- total industry usage
- total lab market share

The denominator is the traffic exposed by the OpenRouter `rankings-daily` dataset and represented by UTVI. UTVI's own methodology measures that universe at roughly **5 %** of world token throughput against the disclosure floor in the Phase 1 source study. A share of 5 % of a market is a legitimate market-data product; a share of 5 % of a market described as a share of the market is not.

**A lab's traffic on one marketplace is not its traffic.** A lab that sells mostly through its own API can appear small here while being enormous in the market. This is the single most likely misreading of the table and the reason the universe is rendered beside it rather than behind a link.

## 2. Observation universe

The universe is UTVI's, unchanged and not restated:

> **Token volume exposed by OpenRouter's `rankings-daily` dataset for the traffic included by that dataset. Urdais makes no claim about inclusion of BYOK or hidden/private application traffic unless OpenRouter explicitly documents it.**

It is read from the frozen UTVI publication for the date rather than from configuration, so a historical share renders with the universe that was published with its denominator. See UTVI §3 for what is included, excluded and undetermined, and why the second sentence is a refusal rather than a description.

## 3. Model share

For each UTC observation date:

$$
Share_{model} = \frac{Tokens_{model}}{Tokens_{total\ observed}}
$$

where `Tokens_model` is the token total for one named model as the source returned it, and `Tokens_total observed` is the total observed token volume UTVI published for that same date.

Values are expressed as percentages. A model with 1.25 T tokens on a date whose observed total is 10 T has a share of 12.5 %.

**There is no second denominator.** Every named model on a date divides by the same figure.

## 4. Lab share

For each UTC observation date:

1. each named model is mapped to a canonical lab under §6;
2. named-model token volume is summed by canonical lab;
3. each lab total divides by **the same total observed token volume**.

$$
Share_{lab} = \frac{Tokens_{lab\ attributed}}{Tokens_{total\ observed}}
$$

**The lab denominator is total observed volume, not attributed volume.** This is the substantive change 1.1.0 makes to UTVI §13–§14, and it is deliberate. Dividing lab share by attributed-only volume would produce a lab table that sums to 100 % while the source's residual sat outside it — which quietly promotes a share of *some* observed traffic into a share of *the* observed traffic, and gives the reader no way to see the difference. Under one denominator both residuals remain as rows and the decomposition closes at 100 % with nothing hidden.

## 5. Residual semantics

Two residuals exist. They are different holes in different places and are never merged, in the database, in the read model or on the page.

### 5.1 Source model residual

OpenRouter's dataset names its top fifty models per day and reports the remainder as one aggregate `other` row. That row is:

- **observed token volume outside the named model rows the dataset exposes**;
- a **model-volume** residual: it has no model and therefore no lab;
- **never assigned to any lab**, and least of all to OpenRouter, which would put the observer inside its own observation.

**Measured** (UTVI §13): the residual ran 4.59 %–7.98 % of the daily total over 90 days, mean 6.13 %.

It is **legitimately absent** on a date whose tail was empty. An absent residual is not a zero row and not an error.

### 5.2 Lab attribution residual

A model may be named by the source and still carry no lab Urdais is willing to claim. That volume is a **lab-attribution** residual, and it is reported as `unattributed`, never folded into a named lab. Three distinct causes are kept apart in the data even where a surface groups them, and the distinction is not cosmetic: one of them is work Urdais could do, and the other two are not.

- **`undisclosed`** — the author is deliberately undisclosed by the source, as in the `stealth` namespace. **Not resolvable by research**: not saying is the point of it.
- **`platform`** — the serving platform appears as a model's author, as in `openrouter/*`. **Not resolvable**: there is no lab to map it to, and crediting the platform would put the observer inside its own observation.
- **`unmapped`** — a namespace Urdais has not established a lab for, or a lab whose canonical reference row is missing. **Resolvable**: this is work not yet done, and it is the only one of the three that a future version can shrink.

**Measured**: one anonymous namespace carried ~3 % of attributed volume over 90 days.

### 5.3 Display remainder

A Models table of fifty-one rows does not read, so ranked models below the displayed top *N* are folded into one visual row. That row is named `display_remainder` and never `other`.

The distinction is not pedantry. `other` is the source's word for volume it never itemised; the display remainder is volume Urdais holds model by model and has chosen not to draw. Using one word for both would claim the source aggregated something Urdais actually has. **The source residual remains separately queryable at all times**, and the fold is applied in the read model, never in storage.

## 6. Model and lab identity

### 6.1 Models

**A model's identity is the source's `model_permaslug`, verbatim.** Urdais holds no canonical registry covering the four hundred-odd permaslugs this dataset names, and inventing display names for them would be an Urdais assertion about models Urdais has not researched. The permaslug is exact, already recorded, and checkable against the source.

Variant folding follows UTVI §6: `model` and `model:free` are the same model on two commercial terms. Two dated versions of a family are **different models**, and merging them would destroy the version history that makes the series worth reading.

### 6.2 Labs

**Namespace does not determine lab.** Lab identity comes from Urdais reference data — an explicit mapping table, every entry of which is a claim made on evidence. UTVI §6 and the Phase 1A characterization record why the obvious shortcut is wrong, and each reason is a real row carrying real volume:

- `meta` and `meta-llama` are two namespaces and one lab;
- `qwen` is a model family; the lab is Alibaba;
- `openrouter/*` is the serving platform appearing as an author, not a lab;
- `stealth/*` is an author the source will not disclose.

**A namespace absent from the mapping is `unmapped`, never guessed.** The asymmetry is deliberate: a wrong lab is worse than no lab, because a wrong lab silently moves a market-share number that someone will quote. A lab whose canonical mapping resolves to no reference row is likewise unattributed rather than rendered as a bare slug.

## 7. Coverage and historical scope

Market Share covers the production UTVI history: **1 January 2025 through the latest published UTVI date.**

A date with no UTVI publication has **no Market Share point**. Nothing is interpolated, forward-filled, zero-filled or synthesised across a coverage gap. The source serves no rows for **2025-06-15** and **2025-07-15**; both are simply absent, and a chart that draws a line between the two real points either side of a gap is making a drawing decision about two points, not reporting a third.

## 8. Settlement and revision

Market Share inherits UTVI's revision semantics rather than defining its own.

- Shares are **derived at read time** from the **active** UTVI publication, calculation and snapshot for each date. No derived value is persisted.
- A revised UTVI date therefore changes Market Share on the next read, with nothing to invalidate and nothing that can go stale.
- **A superseded snapshot cannot be the basis of a share**, structurally: the queries join through `superseded_by_id is null` on both the publication and the snapshot, so superseded evidence cannot be reached at all.
- A share carries the lineage needed to trace it: source UTVI date, and the active publication, calculation and snapshot identifiers with the publication's revision number.
- The most recent completed UTC day is **provisional** while it is still accruing at the source, and is labelled as such. Settled history carries no badge.

**Two versions govern one screen.** The share is computed under the breakdown rules in force now (1.1.0). The UTVI level it divides by was published under whichever version was in force on that date — 1.0.0 for every date backfilled before the breakdown rules existed. Both are reported, because collapsing them would either backdate a rule to points that predate it or claim 1.0.0 authorised a breakdown it explicitly declined to publish.

## 9. Arithmetic

Token counts are held as exact integers end to end; none is narrowed through a double. Percentages are computed by integer division at a fixed scale of six decimal places and narrowed once, at the end, so a share depends on nothing but its two inputs — not on accumulation order and not on platform floating-point behaviour.

The division **truncates**. A decomposition of fifty-one rows can therefore fall short of 100 % by up to fifty-one units in the last place, which is 5.1 × 10⁻⁵ percentage points. The reconciliation tolerance is **0.001 percentage points** — an order of magnitude above that bound and far below anything a reader could see.

## 10. Data quality

Every date is checked, and a failure is **reported, never normalised**. Scaling shares to sum to 100, or dropping the row that does not fit, would destroy the only signal that something is wrong while leaving a plausible-looking table on the page.

For each date:

1. named model shares **+** source residual reconcile to 100 % within tolerance;
2. lab shares **+** unattributed named-model share **+** source residual reconcile to 100 % within tolerance;
3. the same two statements hold **exactly** on the integer token counts, where no tolerance is needed;
4. the unattributed breakdown partitions the unattributed volume exactly;
5. no negative share, no share above 100 %, no negative token count;
6. no denominator less than or equal to zero;
7. no share row on a date with no source coverage;
8. no entity appearing twice within one view;
9. no lab reference resolving to no canonical name.

Both reconciliations are checked separately rather than as one sum. The second closing while the first does not would mean a lab total drifted from its models; the first closing while the second does not would mean attributed and unattributed volume do not partition the named rows. Their sum would catch neither.

A date that fails reconciliation does not serve. The section states that no shares are published rather than rendering a table that does not add up.

## 11. Attribution

Market Share republishes the same licensed observations at a finer grain than UTVI and owes the same credit, held to the same test rather than a laxer one.

- **Source**: OpenRouter, `openrouter.ai/rankings`
- **Dataset**: `rankings-daily`
- **Licence**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Required citation**: `Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.`

The citation interpolates the `as_of` of the retrieval the date's observations came from, and is never paraphrased. A required citation that has been improved is no longer the required citation, and a view whose citation fails that test does not serve.

## 12. Public wording

Permitted:

- "Share of observed OpenRouter token volume represented in UTVI"
- "share of observed token volume"
- "observational share"

Prohibited:

- "market share of AI", "global model usage", "industry usage", "total lab market share"
- any phrasing in which "market share" appears without the observed universe in the same view
- describing OpenRouter as a lab, a participant or a model author
- describing the display remainder as the source's `other`, or the reverse

Shares are displayed as **percentages**. Where a change is ever shown it must be unambiguously labelled as a percentage-point change or a percent change; an unlabelled "change" column is not permitted.

## 13. Versioning

Market Share versions with UTVI. A change to the denominator, to the residual semantics, to the identity rules or to the coverage rules is a UTVI methodology change with an effective date and an explicit approval, and it is recorded in UTVI's version history.

## Version history

**Under UTVI 1.1.0, 16 September 2026.** Status: approved for production, effective from 1 January 2025. First version under which Market Share publishes. Establishes total observed token volume as the single denominator for both views, amending UTVI §13–§14, which had specified attributed tokens and published no breakdown. Establishes the source residual and the lab-attribution residual as separately reported rows, the display remainder as distinct from both, and the source permaslug as model identity.
