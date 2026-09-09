# Urdais V1 — Backend Product Requirements Document

## 1. Document Purpose

This document describes the intended **Urdais V1 backend and data platform** at a high level.

It exists to give development agents persistent context about:

* what the Urdais backend is responsible for
* the intended data architecture
* how external market data becomes canonical Urdais data
* how indices and derived metrics are produced
* how the public API serves the frontend
* authentication, subscriptions, and Premium authorization
* data integrity, freshness, provenance, and observability requirements
* the planned backend technology stack

### Important

**Do not implement this PRD in its entirety.**

Urdais will be developed **iteratively** through explicitly scoped implementation prompts and feature branches.

This PRD is project context and architectural direction. It is not authorization to build features that have not been explicitly requested.

---

# 2. Backend Product Overview

**Urdais is an information and market-data platform for the Information Age.**

The backend exists to turn heterogeneous external information into:

1. raw source observations
2. validated observations
3. normalized/canonical datasets
4. derived metrics
5. proprietary Urdais indices
6. historical time series
7. fast public and Premium API responses

The backend is the authoritative source for Urdais data.

The frontend should generally consume **precomputed, published data** rather than triggering live ingestion or index calculation during a user request.

The fundamental backend flow is:

```text
External Data Sources
        ↓
Source Connectors
        ↓
Raw Observations
        ↓
Validation
        ↓
Normalization
        ↓
Canonical Data
        ↓
Index / Metrics Engine
        ↓
Published Time Series
        ↓
PostgreSQL / Cache
        ↓
Urdais API
        ↓
Frontend
```

---

# 3. Backend Product Principles

## Data Integrity First

Urdais is only useful if users can trust its data.

The backend must prioritize:

* correctness
* provenance
* reproducibility
* historical integrity
* explicit methodology
* preservation of meaningful market distinctions

A wrong Urdais index value is a serious product failure.

---

## Raw Data Must Be Preserved

The backend should retain source observations before transformation.

Urdais should be able to answer questions such as:

> Where did this value come from?

> What source observations produced this index value?

> Which methodology version was active?

> When was the source observed?

> When did Urdais ingest it?

---

## Published Data Is Separate From Incoming Data

External source data should not flow directly into public charts.

Conceptually:

```text
External Data
     ↓
Raw
     ↓
Validate
     ↓
Normalize
     ↓
Calculate
     ↓
Publish
```

Only validated/published data should power normal frontend reads.

---

## Market Structure Must Be Preserved

The backend must not flatten economically different products into a misleading generic price.

Relevant dimensions may include:

* GPU type
* region
* service tier
* SLA characteristics
* provider
* pricing model
* contract duration/type
* observation timestamp

For compute:

```text
H100 SXM
US East
Spot
Qualified SLA
```

may represent a different economic instrument from:

```text
H100 SXM
Europe
Reserved
Different SLA
```

even though both use H100 GPUs.

---

## Read Path and Data Pipeline Are Separate

Normal user reads should not depend on external providers being available.

```text
DATA PIPELINE

Sources → ingest → normalize → calculate → publish


READ PATH

User → API → cache/database → published data
```

An external provider outage should not prevent users from accessing previously published historical data.

---

# 4. Backend Technology Stack

## Application / API

* **TypeScript**
* **Next.js API / server-side application layer**
* **Supabase PostgreSQL**
* **Supabase Auth**
* **Supabase Storage**
* **Upstash Redis**

## Data Pipeline

* **Python**

  * source ingestion
  * validation
  * normalization
  * index calculations
  * derived metrics
  * backfills/reprocessing

## External Services

* **Stripe**

  * checkout
  * billing
  * subscription lifecycle
* **PostHog**

  * product analytics
* **GitHub Actions**

  * CI/testing

## Production

* **Vercel**

  * web/API/CDN
* **Supabase**

  * PostgreSQL/Auth/Storage
* **Upstash**

  * Redis
* **Python worker runtime**

  * deployment platform intentionally not fixed yet

The worker runtime should be chosen based on actual ingestion/job requirements rather than prematurely committing to infrastructure.

---

# 5. Backend Architecture

The intended V1 architecture is logically divided into:

```text
URDAIS BACKEND

1. Data Acquisition
2. Raw Data Storage
3. Validation
4. Normalization
5. Canonical Market Data
6. Index / Metrics Calculation
7. Published Time Series
8. Public API
9. Auth / Accounts
10. Subscription / Entitlements
11. Cache
12. Operational Monitoring
```

These do not need to be separate microservices.

V1 should remain simple where possible.

A modular monolith plus independent Python workers is acceptable.

---

# 6. Core Entities

The backend should conceptually support the following core entities.

## User

Represents an Urdais account.

Typical information:

```text
User
- id
- email
- name
- created_at
```

Authentication identity may primarily be managed by Supabase Auth.

---

## Subscription

Represents Premium access state.

```text
Subscription
- id
- user_id
- plan
- status
- stripe_customer_id
- stripe_subscription_id
- current_period_end
```

The backend is authoritative for entitlement decisions.

---

## Instrument

An **Instrument** is a canonical Urdais object that can have a price/value/history.

Examples:

```text
UCPI-H100
UGAI
UAVI
UBWI
H100 SXM
H200
B200
HBM3E
AI model input-token pricing
AI model output-token pricing
```

Conceptual fields:

```text
Instrument
- id
- symbol
- name
- category
- unit
- access_level
- methodology_id?
```

Categories may include:

```text
index
compute
memory
photonics
energy
token
outcome
```

---

## Observation

Represents an observed market datapoint.

Example:

```text
H100 SXM
US East
$2.42 / GPU-hour
2026-09-09 10:00
```

Conceptually:

```text
Observation
- id
- instrument_id
- source_id
- value
- observed_at
- ingested_at
- region_id?
- service_tier_id?
- pricing_model?
```

Observations may exist in raw, normalized, or published forms depending on implementation.

---

## DataSource

Represents an external data provider/source.

Examples:

* cloud provider
* compute marketplace
* AI API provider
* exchange
* energy source
* news source

```text
DataSource
- id
- name
- source_type
- source_url
- status
```

---

## Region

Represents geographic market segmentation.

```text
Region
- id
- name
- code
- parent_region?
```

Examples:

* US East
* US West
* North America
* Europe
* Asia

The region model should support both granular and aggregate regions when needed.

---

## ServiceTier

Represents service/SLA quality characteristics.

```text
ServiceTier
- id
- name
- methodology characteristics
```

Do not over-model SLA fields before real data requires them.

The important requirement is preserving meaningful service differences.

---

## Methodology

Represents how Urdais defines an index or standardized dataset.

```text
Methodology
- id
- name
- description
```

---

## MethodologyVersion

Represents a specific effective methodology.

```text
MethodologyVersion
- id
- methodology_id
- version
- effective_from
- effective_to?
- rules/config
```

Historical calculations should remain attributable to the version that produced them.

---

## MarketplaceOffer

Represents a current external infrastructure offer.

```text
MarketplaceOffer
- id
- provider/source
- instrument_id
- region_id
- price
- pricing_model
- service_tier_id?
- source_url
- observed_at
- expires_at?
```

Important distinction:

```text
Observation
= historical market datapoint

MarketplaceOffer
= currently available external offer/listing
```

A marketplace offer may also produce observations.

---

## AIModel

Represents an individual AI model.

```text
AIModel
- id
- provider
- name
- model_family
- status
```

Models may have multiple associated pricing instruments:

```text
AI Model
├── input token price
├── output token price
└── cached token price
```

---

## OutcomeTask

Represents a defined measurable economic outcome.

```text
OutcomeTask
- id
- name
- category
- definition
- unit
```

Examples:

* resolved customer-support case
* processed invoice
* accepted code change
* qualified sales lead

The backend must preserve the outcome definition/methodology because two task prices are not comparable unless the outcome definitions are compatible.

---

## NewsArticle

Represents an aggregated external news item.

```text
NewsArticle
- id
- title
- publisher
- url
- published_at
- category
```

---

# 7. Source Connectors

Urdais should ingest data through modular source connectors.

A connector represents logic specific to one source/provider.

Conceptually:

```text
Provider API
      ↓
Provider Connector
      ↓
Raw Observation
```

A source connector may:

* call APIs
* retrieve structured feeds
* parse allowed public data sources
* retrieve marketplace offers
* retrieve provider pricing
* retrieve news metadata
* transform provider-specific response structure into Urdais raw format

Connectors should remain independent where practical.

A failure in one connector should not break unrelated connectors.

---

# 8. Raw Data Layer

Raw source data should be preserved before canonical transformation.

Raw records should capture enough context to support:

* debugging
* provenance
* reprocessing
* methodology changes
* historical backfills
* source audits

Important metadata includes:

```text
source
source identifier
raw value/payload
observed_at
ingested_at
source URL/reference
```

Large raw artifacts may use object storage where appropriate.

Not every API response must necessarily be stored indefinitely as a giant JSON blob; implementation should remain practical while preserving sufficient provenance.

---

# 9. Validation Layer

Incoming observations must be validated before publication.

Validation may eventually include:

* required fields
* numeric validity
* expected units
* valid timestamps
* supported currency
* known instrument/GPU/model
* known region
* supported pricing model
* SLA eligibility
* duplicate detection
* unreasonable/anomalous values
* source-specific constraints

Validation failure must not silently become published Urdais data.

Failed observations should be inspectable operationally.

---

# 10. Normalization Layer

External providers frequently describe equivalent products differently.

Normalization maps source-specific observations into canonical Urdais concepts.

Examples:

```text
"H100"
"NVIDIA H100 SXM"
"H100 SXM5 80GB"
```

may require mapping into one canonical GPU instrument when methodology supports equivalence.

Normalization may cover:

* instrument identity
* GPU type
* model/provider names
* region
* currency
* pricing unit
* GPU-hour normalization
* token pricing units
* timestamps
* service tier
* pricing model

Normalization must not erase meaningful distinctions merely to simplify the data.

---

# 11. Canonical Market Data

Canonical data is the standardized Urdais representation used for:

* comparisons
* historical series
* methodology filtering
* index calculation
* API publication

The canonical layer is the bridge between heterogeneous external sources and Urdais indices.

Conceptually:

```text
Provider-specific observation
        ↓
Normalization
        ↓
Canonical Instrument
Canonical Region
Canonical Unit
Canonical Pricing Model
Canonical Service Tier
```

---

# 12. Compute Market Data

Compute is a major initial Urdais domain.

The backend should support observations differentiated by:

* GPU type
* region
* provider
* price
* currency
* unit
* pricing model
* service/SLA characteristics
* observation timestamp

Example GPUs include:

* H100 SXM
* H200
* A100 SXM4
* B200
* RTX 5090

The backend should support future GPU additions without schema redesign.

---

# 13. Geographic / Regional Pricing

Region must be preserved as a first-class dimension of compute pricing.

The system should support:

* filtering observations by region
* regional time series
* regional benchmark calculations
* regional premiums/discounts
* basis against broader benchmarks

Example:

```text
H100 SXM

US East       $2.42/hr
US West       $2.49/hr
Europe        $2.68/hr
Asia          $2.31/hr
```

The backend should never flatten these into one arbitrary value unless a methodology explicitly defines how to calculate such a composite.

---

# 14. SLA / Service Quality

Compute service quality may affect economic value.

The backend should be capable of preserving attributes such as:

* availability/SLA target
* service tier
* latency expectations
* networking characteristics
* provider quality parameters
* methodology-defined eligibility

Exact SLA fields should evolve based on actual provider data.

Do not invent overly detailed schema before real inputs require it.

---

# 15. Pricing Models

The system should distinguish:

```text
spot
on-demand
reserved
long-term
forward
```

These should not be mixed into one historical series unless the applicable methodology explicitly permits it.

A spot compute index should not accidentally include reserved-contract pricing merely because the GPU type matches.

---

# 16. Index / Metrics Engine

Urdais publishes derived indices including:

* **UCPI — Urdais Compute Price Index**
* **UGAI — Urdais Global AI Index**
* **UAVI — Urdais AI Volatility Index**
* **UBWI — Bitcoin Wealth Index**
* **UMPI — Urdais Memory Price Index**
* **UPPI — Urdais Photonics Price Index**

The Index Engine should operate on normalized/canonical data.

Conceptually:

```text
Canonical Observations
        ↓
Methodology Version
        ↓
Eligibility Filtering
        ↓
Calculation
        ↓
Index Value
        ↓
Published Time Series
```

Index calculations must not depend on frontend code.

---

# 17. Methodology Versioning

Methodologies must be versionable.

For example:

```text
UCPI H100 Methodology

v1.0
effective 2026-09-01

v1.1
effective 2027-01-01
```

The backend should preserve:

* methodology identity
* version
* effective dates
* rules/configuration
* relationship between calculated values and methodology version

Historical data should not silently appear as though it was calculated under a methodology that did not exist at the time.

---

# 18. Reproducible Calculations

Where practical, an index value should be reproducible from:

```text
Methodology Version
        +
Eligible Source Observations
        =
Published Index Value
```

The system should preserve enough provenance to investigate historical calculations.

The exact level of reproducibility may evolve with the index methodology, but V1 architecture should not prevent it.

---

# 19. Published Time Series

Published values are the primary data consumed by the frontend.

A published point may conceptually include:

```text
instrument_id
timestamp
value
unit
methodology_version_id?
calculated_at
freshness/status
```

Published values should be separate from raw observations.

Only approved/validated results should be exposed through normal public APIs.

---

# 20. AI Model / Token Pricing

The backend should support historical AI model pricing.

Models should be represented individually rather than treating an entire provider as one price.

For example:

```text
Provider
   ↓
AIModel
   ↓
Pricing Instruments
     ├── Input Tokens
     ├── Output Tokens
     └── Cached Tokens
```

The system should support standardized units such as:

```text
USD / 1M input tokens
USD / 1M output tokens
USD / 1M cached tokens
```

Provider-specific pricing structures should be normalized without erasing relevant distinctions.

---

# 21. AI Reasoning / Outcome Economics

Urdais may model AI economics across:

```text
Compute
   ↓
Tokens
   ↓
Outcomes
```

The backend should eventually support:

* historical compute pricing
* historical token pricing
* historical task/outcome pricing
* AI system/provider associated with outcome
* methodology defining successful completion
* source/provenance

Outcome data must not be published merely because a dollar amount exists.

A meaningful task definition and reliable source must exist.

---

# 22. News Data

The backend may aggregate Information Age news across categories:

* AI
* compute
* memory
* photonics
* energy/power
* crypto

The system should preserve:

* headline
* original publisher
* original URL
* publication time
* category
* ingestion time where useful

Urdais should preserve attribution to the originating publisher.

---

# 23. Marketplace Data

The backend should aggregate external AI infrastructure offers for Premium users.

Offers may include:

* hardware type
* provider
* region
* current price
* pricing model
* service/SLA characteristics
* source URL
* observation/update time

The marketplace is initially an **information aggregation layer**, not necessarily a transaction/execution platform.

The backend should not assume Urdais directly owns or sells the infrastructure.

---

# 24. Public API

The public API should expose precomputed Urdais data.

Planned interfaces include:

```http
GET /v1/instruments
GET /v1/instruments/{id}
GET /v1/instruments/{id}/history
GET /v1/compare
```

```http
GET /v1/indices/{symbol}/methodology
```

```http
GET /v1/models
GET /v1/models/{id}/pricing
```

```http
GET /v1/outcomes
GET /v1/outcomes/{id}/pricing
```

```http
GET /v1/news
```

```http
GET /v1/marketplace/offers
```

Subscription interfaces include:

```http
POST /v1/subscription/checkout
POST /v1/subscription/portal
```

Internal integration:

```http
POST /v1/webhooks/stripe
```

Exact schemas will be defined iteratively.

Do not implement all endpoints simply because they are documented here.

---

# 25. Instrument API

The backend should support retrieving instrument metadata.

Conceptually:

```http
GET /v1/instruments/{id}
```

Example response shape:

```json
{
  "id": "instrument-id",
  "symbol": "UCPI-H100",
  "name": "Urdais Compute Price Index - H100",
  "category": "compute",
  "unit": "USD/GPU-hour",
  "latest_value": 2.42,
  "change": -0.08,
  "change_percent": -3.2,
  "last_updated": "timestamp"
}
```

This is illustrative rather than a frozen schema.

---

# 26. Historical Time-Series API

The primary chart endpoint is conceptually:

```http
GET /v1/instruments/{id}/history
```

Possible query parameters:

```text
from
to
interval
region
pricing_model
service_tier
```

Response should return published/precomputed time-series points.

The endpoint should not:

* scrape sources
* recalculate the index
* normalize raw data synchronously

as part of a normal request.

---

# 27. Compare API

The backend may support:

```http
GET /v1/compare
```

for retrieving multiple compatible time series.

The backend should determine whether requested datasets are compatible where necessary.

The frontend should not independently infer that unrelated metrics can be meaningfully compared.

---

# 28. Cache

Upstash Redis is intended for frequently requested published data.

Likely candidates include:

* instrument metadata
* latest values
* popular historical ranges
* index summaries
* common comparisons

The intended path is:

```text
API Request
   ↓
Redis
   ↓ hit
Response

or

Redis miss
   ↓
PostgreSQL
   ↓
Cache
   ↓
Response
```

The cache is an optimization.

PostgreSQL remains the durable source of truth for published data.

---

# 29. PostgreSQL

PostgreSQL is expected to be sufficient for Urdais V1.

Expected scale:

```text
~1K–5K instruments
~20–100 external sources
~100K–1M observations/day
historical retention indefinitely
```

Likely logical data domains include:

```text
users
subscriptions
instruments
data_sources
regions
service_tiers
raw_observations
normalized_observations
published_time_series
methodologies
methodology_versions
AI models
outcome tasks
marketplace offers
news
```

Exact schema design should be implemented iteratively.

Do not prematurely introduce specialized databases solely because Urdais is a data product.

---

# 30. Time-Series Storage

Initial time-series storage may use normal PostgreSQL tables with appropriate indexes.

Typical query dimensions may include:

```text
instrument_id
observed_at / timestamp
region_id
pricing_model
```

The architecture may later evolve toward a specialized analytics/time-series system if actual scale requires it.

V1 should not prematurely require:

* ClickHouse
* Cassandra
* Kafka
* Elasticsearch
* a dedicated data warehouse

unless measured requirements justify them.

---

# 31. Ingestion Scheduling

Different datasets have different freshness expectations.

Examples may range from:

```text
minutes
hourly
daily
```

The backend should support dataset-specific schedules rather than one global ingestion frequency.

Each dataset should know its expected freshness threshold.

---

# 32. Freshness

The backend should distinguish:

```text
observed_at
```

from:

```text
ingested_at
```

These represent different things.

Example:

```text
Provider observed price: 09:00
Urdais retrieved it:     09:06
```

The system should be capable of determining when a dataset is stale.

The frontend should display that state but should not determine it independently.

---

# 33. Stale Data

When ingestion fails:

```text
Last Valid Published Value
```

should generally remain available.

The system should not delete or replace valid data merely because a fresh observation cannot be obtained.

A stale flag/status should identify that freshness expectations have been exceeded.

---

# 34. Backfills / Reprocessing

The backend must support historical recalculation when needed.

Reasons may include:

* new source data
* corrected observations
* methodology updates
* normalization fixes
* missing historical periods

Backfills should be safe and ideally idempotent.

Running the same intended backfill more than once should not create uncontrolled duplicate data.

---

# 35. Idempotency / Duplicate Prevention

Ingestion and calculation jobs should avoid duplicate observations where practical.

Potential uniqueness may involve combinations such as:

```text
source
instrument
source observation ID
observed_at
region
pricing model
```

Exact deduplication rules may vary by source.

The architecture should support source-specific idempotency.

---

# 36. Authentication

Authentication is expected to use Supabase Auth.

Supported account methods include:

* Google
* Apple
* email

Email ownership must be verified.

Backend responsibilities include:

* recognizing authenticated sessions
* retrieving user identity
* protecting authenticated endpoints
* associating user accounts with subscription state

The public market-data API should not require authentication unless the endpoint/data is Premium.

---

# 37. Premium Authorization

Premium access must be enforced server-side.

The intended authorization path is:

```text
Request
   ↓
Authenticated User?
   ↓
Subscription / Entitlement
   ↓
Authorized?
   ↓
Premium Data
```

The backend must not rely on:

```text
frontend says user is premium
```

as sufficient authorization.

---

# 38. Stripe

Stripe handles payment collection.

The backend should support:

```http
POST /v1/subscription/checkout
```

to create/initiate checkout.

```http
POST /v1/subscription/portal
```

to manage subscriptions.

Stripe subscription events arrive through:

```http
POST /v1/webhooks/stripe
```

The webhook flow is:

```text
Stripe
  ↓
Verified Webhook
  ↓
Subscription State
  ↓
Urdais Entitlement
```

Stripe should determine billing/payment state.

Urdais should determine application authorization based on synchronized subscription state.

---

# 39. Stripe Webhook Security

Stripe webhook processing should:

* verify Stripe signatures
* reject invalid webhook events
* tolerate duplicate events
* process relevant subscription lifecycle events idempotently
* update Urdais subscription/entitlement state safely

Payment card information must not be stored by Urdais.

---

# 40. Security

Backend security expectations include:

* HTTPS in production
* server-side authorization
* no secrets exposed to browser clients
* source/provider API keys stored server-side
* Stripe secrets stored server-side
* Supabase privileged credentials stored server-side
* ingestion/admin interfaces isolated from public interfaces
* validation of external inputs
* appropriate database authorization
* safe webhook verification

Security controls should evolve with implementation scope.

---

# 41. Supabase Security

Supabase is intended to provide:

* PostgreSQL
* Auth
* Storage

Where client-accessible Supabase data exists, Row Level Security should be used appropriately.

However, the architecture should not require the browser to directly access sensitive canonical data tables.

Server-side API boundaries may be preferable for:

* Premium datasets
* administrative operations
* source data
* ingestion data
* internal methodology/calculation state

---

# 42. Data Integrity

The backend must maintain separation among:

```text
Raw Data
Normalized Data
Published Data
```

Bad source data must not silently overwrite good published values.

Invalid observations should not become public market data without validation.

---

# 43. Provenance

Published data should retain enough provenance to identify:

* source
* source observation
* original observation time
* ingestion time
* instrument
* region where relevant
* methodology version where relevant
* calculation run where relevant

This allows Urdais to explain and reproduce its data.

---

# 44. Market Accuracy

Urdais should preserve market distinctions including:

* GPU type
* geographic region
* SLA/service tier
* pricing model
* provider
* observation timestamp

For compute benchmarks, methodology eligibility may depend on:

```text
GPU
+
Region
+
Service Quality
+
Pricing Model
```

Do not average observations solely because they share one dimension such as GPU model.

---

# 45. Basis / Premiums / Discounts

The backend should eventually support computing regional or product basis relative to an Urdais benchmark.

Conceptually:

```text
Regional Price - Benchmark Price = Basis
```

or percentage equivalent.

Example:

```text
UCPI H100 Benchmark     $2.42
Europe H100             $2.68
Basis                   +$0.26 / +10.7%
```

Exact methodology should be defined separately.

---

# 46. Availability / Fault Isolation

External source failures must not take down the public application.

Examples:

```text
Provider A API fails
     ↓
Provider A ingestion fails
     ↓
Alert / retry

BUT

Published historical Urdais data remains accessible
```

One connector failure should not prevent unrelated datasets from updating.

---

# 47. Retry Behavior

Failed ingestion or calculation jobs should be retryable.

Retries should not:

* create duplicate observations
* publish partially invalid results
* corrupt existing valid history

Retry strategy can be implementation-specific.

---

# 48. Observability

The backend should provide visibility into:

* ingestion success/failure
* validation failures
* normalization failures
* calculation failures
* stale datasets
* API errors
* cache behavior where useful
* Stripe webhook errors

Operational logs should make it possible to identify:

```text
Source
Instrument
Region
Job
Timestamp
Failure
```

---

# 49. Alerts

Critical pipeline failures should eventually generate actionable alerts.

Examples:

* UCPI has not updated within expected freshness window
* primary provider ingestion repeatedly fails
* index calculation fails
* Stripe webhook processing fails
* publication pipeline fails

Do not implement a complex alerting platform before required.

---

# 50. Calculation Run Traceability

An index calculation should eventually be traceable as a run.

Conceptually:

```text
CalculationRun
- id
- index
- methodology_version
- started_at
- completed_at
- status
```

It may also reference input observations.

This entity does not need to exist immediately if the first implementation slice does not require it, but architecture should preserve the ability to add traceability.

---

# 51. Performance Requirements

The backend is heavily read-oriented.

Target:

```text
<500 ms
```

for typical precomputed market-data reads.

This does not mean ingestion jobs or backfills must finish in 500 ms.

Read-path performance and data-pipeline performance are different requirements.

---

# 52. Capacity Assumptions

V1 assumptions:

```text
Users
~100K monthly
~1K peak concurrent

Reads
~100–300 API req/sec peak

Data
~1K–5K instruments
~20–100 sources
~100K–1M observations/day

Retention
Historical data retained indefinitely
```

These estimates do not justify a highly distributed architecture yet.

---

# 53. Scalability

The architecture should allow independent growth of:

* API/read traffic
* ingestion workers
* index calculation workloads
* storage

This does not imply that each must start as a separate deployed microservice.

Logical separation and modular code are enough for V1.

---

# 54. Maintainability

New source providers should be addable through new connectors.

New market categories should fit existing abstractions where reasonable.

Examples:

```text
Compute
Memory
Photonics
Energy
Token Economics
Outcome Economics
```

Methodology code should be isolated enough that changing UCPI logic does not require rewriting unrelated API logic.

---

# 55. Testing

Backend implementation should eventually include appropriate tests for:

* normalization
* validation
* index calculations
* methodology eligibility
* API behavior
* authorization
* Stripe webhook handling
* idempotency
* source connector parsing

Index calculation logic deserves especially strong deterministic tests.

Exact tests should be added as corresponding features are implemented.

---

# 56. CI

GitHub Actions is intended for CI.

CI may eventually validate:

* TypeScript checks
* Python checks
* linting
* unit tests
* integration tests
* schema/migration safety where appropriate

Do not build an unnecessarily complex CI pipeline before the repository has corresponding components.

---

# 57. Deployment

The expected high-level production architecture is:

```text
Vercel
- Web App
- Public API
- CDN

Supabase
- PostgreSQL
- Auth
- Storage

Upstash
- Redis

Python Worker Runtime
- Connectors
- Validation
- Normalization
- Index Engine
- Scheduled Jobs
```

The Python deployment provider remains intentionally undecided.

---

# 58. Backend Non-Goals

Urdais V1 backend is not intended to begin as:

* a high-frequency trading exchange
* a streaming tick-data platform processing millions of events/sec
* a blockchain
* a GPU transaction settlement network
* a hyperscaler
* a compute scheduler
* a data warehouse ecosystem requiring many specialized databases
* an infrastructure marketplace that necessarily handles purchase execution
* a real-time recalculation engine triggered by every frontend request

These capabilities may be reconsidered if Urdais evolves toward an actual compute exchange.

---

# 59. No Premature Infrastructure Complexity

Do not introduce infrastructure such as:

```text
Kafka
ClickHouse
Cassandra
Elasticsearch
multi-region active-active databases
complex service meshes
large microservice fleets
```

without an observed requirement.

PostgreSQL + Redis + modular Python workers is the intended V1 baseline.

---

# 60. First Vertical Slice

Although this PRD covers the intended V1 backend, implementation should begin with one narrow end-to-end slice.

A likely first slice is:

```text
One real compute data source
        ↓
H100 SXM observations
        ↓
Raw storage
        ↓
Validation
        ↓
Normalization
        ↓
Canonical H100 instrument
        ↓
Initial UCPI-H100 series
        ↓
PostgreSQL
        ↓
GET /v1/instruments/{id}
        ↓
GET /v1/instruments/{id}/history
        ↓
Frontend chart
```

This should prove the central Urdais architecture before expanding into:

* additional GPUs
* multiple regions
* SLA tiers
* AI models
* outcomes
* marketplace
* news
* Premium

---

# 61. Backend Success Criteria

The finished Urdais V1 backend should ultimately be able to answer questions such as:

> What is the canonical current price of this infrastructure instrument?

> What were its historical prices?

> Where did those observations come from?

> What region and service tier do they represent?

> Which observations qualify for UCPI?

> Which methodology version generated this index value?

> When was the data observed and when did Urdais ingest it?

> Is the dataset stale?

> How does one regional price differ from the benchmark?

> What did an AI model cost per token historically?

> What does a defined AI task cost to complete?

> Is this user authorized to access Premium market data?

The backend succeeds when Urdais can reliably transform heterogeneous external information into **canonical, reproducible, queryable, historically durable market data** while keeping the user-facing read path fast and independent from upstream provider availability.

---

## Agent Instruction

> **This PRD is project context, not an implementation request. Do not implement features solely because they appear in this document. Urdais is being developed iteratively. Only modify code for functionality explicitly requested in the current implementation prompt. Use this PRD to preserve compatibility with the intended Urdais V1 backend architecture, data model, security boundaries, and long-term product direction. Do not prematurely introduce infrastructure, abstractions, endpoints, tables, integrations, or services that are not required by the current implementation slice.**
