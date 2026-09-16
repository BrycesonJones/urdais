# Model Frontier operational freshness

**Status: internal operations artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** How Model Frontier stays current, what "current" means for each of its two inputs, and why those two answers are different.

Model Frontier joins two things acquired under two different lawful models. A single freshness number would misdescribe both, so there are two clocks and they are reported separately.

## Capability — machine-collected

Epoch AI's published bundle carries its own CC BY 4.0 grant, stated in the `README.md` inside the artifact Urdais downloads. A scheduled job may therefore fetch it, and one does.

| | |
| --- | --- |
| route | `/api/cron/frontier` |
| schedule | **03:40 UTC daily** |
| authentication | `CRON_SECRET` bearer token, the same shared secret every Urdais cron route uses; an absent secret fails closed |
| failure | non-2xx on a real ingestion or check failure, so the cron history shows a failed job rather than a green one with bad news in the payload |

**Why 03:40.** Off the hour, because every scheduler in the world fires at `:00` and there is no reason to join them. Clear of every existing Urdais window — news 00:00, UCPI 01:00, UTVI 02:00, UBWI 06:00, token-verification 07:00 — with an hour of headroom either side.

**Why daily is enough, and why it is cheap.** Epoch publishes when models are evaluated, not on a calendar, so most days the bundle has not moved. An unchanged bundle writes **no** retrieval, observation, link or price selection: the run hashes roughly two megabytes, compares, and stops. Polling harder would not make Epoch publish sooner, and a slower cadence would only add detection latency to a check that costs almost nothing.

### Three states, never collapsed

| state | meaning |
| --- | --- |
| **scheduler freshness** | the job ran. A fact about Urdais's operations. |
| **source freshness** | the fetched bundle is what Epoch is serving at that moment. |
| **capability rollover** | the bundle's bytes differ from the last ingested ones, so observations moved. |

An unchanged bundle is a **successful scheduled check with no source rollover**. It is never reported as new capability data. Conflating the two would make every quiet day look like a collection, which is the failure mode this product has now learned twice.

### The heartbeat, and why it is the one exception

Idempotence says an unchanged run writes nothing. Operations says a run that writes nothing is indistinguishable from a run that never happened — and a scheduler that silently stopped would leave the Frontier rendering its last good chart indefinitely, with every point on it still correct.

So every run records one row in `pipeline.capability_check_runs`, whatever it found. That row carries **no capability data**: no score, no identity, no price. It says a job ran, what it found, and whether the source moved. `trigger` separates `scheduled` from `operator`, because someone running the script by hand proves nothing about whether the cron fired.

**Scheduler stale threshold: 2 days.** The job runs daily, so two days absorbs one missed run — a deploy window, a transient upstream failure — without crying wolf, while still catching a scheduler that has genuinely stopped. An operations interval; changing it changes no published value.

## Price — human-verified, and this is a rights constraint

**Token Price has no scheduled ingestion, and this is not a backlog item.**

Every Wave-1 token-pricing source is `research_usable` / `under_review` in the registry, none is machine-readable, and `docs/methodology/token-price.md` is explicit:

> "no token-pricing source is cleared for automated production retrieval, and every one of them remains under terms review"

> "Whether Urdais may retrieve that page automatically, on a schedule, is a separate question answered by the source's collection rights, and for every token-pricing source that question is still open. **Publishing a verified fact grants no collection right**, and no amount of publication moves a source towards automated retrieval."

The approved acquisition contract is therefore:

> authorized person → `scripts/tokens/verify-production.ts` → evidence + verifier identity → production observations

Automating the reading would require a collection right Urdais does not hold. **If those rights are later obtained, Token Price may move to automated collection under a separately reviewed phase** — not by anyone deciding the constraint has become inconvenient.

### What freshness means when acquisition is human

Not ingestion recency, which does not exist here. **Verification recency**: how long since a person last checked. That is a fact about Urdais's own operating discipline and is answered entirely from Urdais's own database — nothing contacts a provider.

`/api/cron/token-verification` runs at **07:00 UTC daily** and is a watchdog: it reads the frozen benchmarks and reports how long since each provider was verified. It collects nothing, requests nothing, and writes nothing. It exists because Token Price records an observation only when a price *changes*, so "unchanged, correctly" and "nobody has looked in weeks" produce identical data.

**Verification stale threshold: 7 days**, adopted by reference from `VERIFICATION_REVIEW_INTERVAL_DAYS` in the watchdog. Model Frontier does not define its own: two products disagreeing about when a price is stale would be worse than either answer. It is an **operations interval, not a methodology rule** — the methodology defines when an observation is *recorded*, and says nothing about how often someone should look.

## Combined operational states

| state | condition |
| --- | --- |
| `capability-source-unchanged` | scheduler healthy, bundle unchanged, price verification inside its window. **Operationally healthy.** |
| `price-verification-due` | capability healthy; price verification within two days of its threshold. A request for a person. |
| `stale` | the scheduler exceeded its interval, **or** price verification exceeded its threshold, **or** a provider was never verified. |

`npm run frontier:production:check` reports both clocks and **exits non-zero on either being stale, even while the Frontier renders perfectly**. Renderability is not freshness: the chart can draw a correct picture from data nobody has touched in a month, and every point on it would still be right.

Nothing here manufactures a value to clear a stale state. The public product prefers old but honestly dated data over fabricated freshness, which is why both dates are rendered on the chart and neither is replaced by a single "last updated".
