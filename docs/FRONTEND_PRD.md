# Urdais V1 — Frontend Product Requirements Document

## 1. Document Purpose

This document describes the intended **Urdais V1 frontend product** at a high level.

It exists to give development agents persistent context about:

* what Urdais is
* the intended user experience
* the major frontend capabilities
* the relationship between the frontend and backend/data platform
* authentication and Premium behavior
* performance and quality expectations
* the planned frontend technology stack

### Important

**Do not implement this PRD in its entirety.**

Urdais will be built **iteratively** through explicitly scoped implementation prompts and feature branches.

This PRD is a source of project context and architectural direction. It should not be interpreted as authorization to build features that have not been explicitly requested.

---

# 2. Product Overview

**Urdais is an information and market-data platform for the Information Age.**

The product provides standardized data, historical time series, market intelligence, and proprietary indices covering areas such as:

* AI compute
* GPU pricing
* AI model/token economics
* memory
* photonics
* energy/power
* AI reasoning/outcome economics
* Bitcoin/crypto
* related Information Age news

The frontend should feel closer to a **financial market-data terminal / TradingView-style application** than a traditional marketing website.

The primary frontend responsibility is to make complex Urdais datasets:

* discoverable
* understandable
* comparable
* visually inspectable
* fast to access

The frontend **does not calculate Urdais indices** or normalize market data.

It consumes canonical, validated, precomputed data from the Urdais backend/API.

---

# 3. Product Principles

## Public First

Core Urdais market data should be accessible without requiring account creation.

The product should provide useful information before asking a user to sign up.

---

## Data First

Charts, instruments, indices, methodologies, prices, regions, and historical observations are the center of the product.

Visual design should prioritize information density and readability over decorative UI.

---

## Fast Exploration

Users should be able to move quickly between:

* instruments
* indices
* categories
* regions
* time ranges
* comparisons

The experience should make exploring data feel immediate.

---

## Transparent Data

Where applicable, users should be able to understand:

* where data came from
* when it was last updated
* what unit is being displayed
* what methodology produced an index
* whether data is stale
* what region/service tier/pricing model an observation represents

---

## Progressive Access

Public data remains useful without authentication.

Accounts and Premium unlock additional functionality and datasets rather than making the basic product unusable.

---

# 4. Intended Users

Urdais may serve users including:

* AI infrastructure buyers
* AI infrastructure providers
* investors
* researchers
* analysts
* AI companies
* data center operators
* developers
* technology executives
* people tracking the economics of AI and compute

V1 does not require different frontend experiences for each persona.

The primary experience should be a shared market-data interface.

---

# 5. Frontend Technology Stack

## Core

* **Next.js**
* **React**
* **TypeScript**
* **Tailwind CSS**
* **TradingView Lightweight Charts**
* **MapLibre GL JS** for the dedicated `/map` workspace, on OpenFreeMap (OpenMapTiles / OpenStreetMap) tiles with their required attribution

## Supporting Services

* **Supabase Auth**
* **Stripe**
* **PostHog**
* **Upstash Redis** indirectly through the API/read path
* **Vercel** for production web hosting/CDN/API deployment

Development tools may include:

* Cursor
* Claude
* GitHub
* GitHub Actions

The frontend should not directly depend on Python data-processing components.

Python belongs to the backend/data pipeline.

---

# 6. High-Level Frontend Architecture

The intended request path is:

```text
User
  ↓
Urdais Web App
  ↓
Urdais API
  ↓
Cache
  ↓ cache miss
PostgreSQL
  ↓
Published / Precomputed Data
```

The frontend should consume **already published data**.

It should not trigger:

* ingestion
* source scraping
* normalization
* index calculation
* historical backfills

as part of a normal user request.

Conceptually:

```text
BACKEND DATA PIPELINE

External Sources
      ↓
Ingestion
      ↓
Raw Observations
      ↓
Validation
      ↓
Normalization
      ↓
Index / Metrics Engine
      ↓
Published Time Series
      ↓
API


FRONTEND

API
 ↓
Web App
 ↓
Charts / Tables / Market Views
 ↓
User
```

---

# 7. Information Architecture

The exact navigation structure may evolve during implementation, but Urdais V1 should conceptually support these product areas:

```text
Urdais
├── Markets / Instruments
├── Indices
├── Map
├── Compute
├── AI Models / Tokens
├── Outcome Economics
├── News
├── Marketplace [Premium]
├── Account
└── Subscription / Billing
```

The `/map` route is a dedicated map workspace so the heavier map renderer stays isolated from the rest of the product. Its basemap (OpenFreeMap Positron with Urdais label overrides) provides city-level geographic context that densifies with zoom, plus a metric distance scale; mapped and unmapped points, category colours, legends, popups, filtering, clustering, and item detail routing are intentionally deferred to later phases.

Infrastructure categories include:

```text
Infrastructure
├── Compute
├── Memory
├── Photonics
└── Energy / Power
```

---

# 8. Public Market Data Experience

Users should be able to use the core market-data product without an account.

The frontend should allow users to:

* browse available instruments
* search instruments
* browse Urdais indices
* open an individual instrument
* view the current value
* view historical time-series data
* inspect exact historical values
* change chart time ranges
* view price/value change
* view percentage change
* view the last-updated timestamp
* see units
* see relevant source information
* access index methodology where applicable

Possible chart ranges may include:

```text
1D
1W
1M
3M
1Y
ALL
```

Exact intervals may vary depending on data availability.

---

# 9. Instrument Experience

An **Instrument** is the primary frontend abstraction for something that can be inspected as Urdais market data.

Examples may include:

```text
UCPI-H100
UGAI
UAVI
UBWI
H100 SXM
H200
B200
HBM3E
AI model input token pricing
AI model output token pricing
```

An instrument view should be capable of displaying:

* symbol
* name
* category
* current value
* unit
* change
* percentage change
* last updated
* historical chart
* applicable region
* applicable pricing model
* applicable service tier/SLA
* source information
* methodology where relevant

Not every instrument must contain every field.

The UI should gracefully handle optional metadata.

---

# 10. Charting

Charts are a core part of the Urdais frontend.

Urdais should use **TradingView Lightweight Charts** or an equivalent approved charting implementation.

Charts should support:

* historical time series
* responsive resizing
* crosshair/hover inspection
* timestamps
* exact values
* timeframe selection
* comparison of compatible datasets
* readable axis labels
* appropriate units
* loading states
* empty states
* stale-data indication where applicable

The frontend should remain responsive even when displaying long historical series.

The UI should not assume that every dataset updates at the same frequency.

Some datasets may update:

* every few minutes
* hourly
* daily
* less frequently

---

# 11. Dataset Comparison

Users should be able to compare compatible instruments.

Examples:

```text
H100 vs H200 vs B200
```

```text
US East H100 vs Europe H100
```

```text
AI model token pricing across providers
```

Comparison may eventually support:

* multiple series on one chart
* relative percentage performance
* shared time ranges
* normalization where appropriate

The frontend should not fabricate comparability.

The backend/methodology determines which datasets are valid to compare.

---

# 12. Urdais Indices

Public Urdais indices include:

* **UCPI — Urdais Compute Price Index**
* **UGAI — Urdais Global AI Index**
* **UAVI — Urdais AI Volatility Index**
* **UBWI — Bitcoin Wealth Index**

Premium indices may include:

* **UMPI — Urdais Memory Price Index**

  * HBM
  * DRAM
* **UPPI — Urdais Photonics Price Index**

The frontend should support:

* index discovery
* latest index value
* historical chart
* changes over time
* last calculation/update time
* methodology access
* source/constituent information where applicable
* methodology version where relevant

The frontend must display published index values.

**It must not independently calculate indices.**

---

# 13. Compute Market Experience

Compute is a major Urdais data domain.

Example GPU types include:

* H100 SXM
* H200
* A100 SXM4
* B200
* RTX 5090

The interface should eventually allow compute data to be explored by dimensions including:

* GPU type
* geographic region
* provider
* service tier
* SLA characteristics
* pricing model
* timestamp

Pricing models may include:

* spot
* on-demand
* reserved
* long-term
* forward

Different contract/pricing models should not visually appear to represent identical products when they are not comparable.

---

# 14. Regional Compute Pricing

Region is an important part of compute market value.

Users should eventually be able to:

* filter compute data by region
* compare regions for the same GPU
* view regional price differences
* inspect benchmark premiums/discounts
* understand which region an observation represents

Example:

```text
UCPI-H100 Benchmark

US East       $2.42/hr
US West       $2.49/hr
Europe        $2.68/hr
Asia          $2.31/hr
```

The frontend should preserve meaningful regional distinctions supplied by the backend.

It must not flatten regional observations into a generic price unless the associated Urdais methodology specifically defines such a benchmark.

---

# 15. SLA / Service Tier Representation

Compute offers may vary in quality even when GPU and region are identical.

Relevant characteristics may include:

* availability target
* service tier
* networking characteristics
* latency characteristics
* provider quality
* other methodology-defined parameters

The frontend should be capable of exposing relevant SLA/service information when provided by the API.

The exact SLA taxonomy will be defined by Urdais methodology/backend systems.

The frontend should not invent or infer SLA classification.

---

# 16. AI Model / Token Economics

Users should eventually be able to explore historical AI model economics across providers such as:

* OpenAI
* Anthropic
* Google
* DeepSeek
* Moonshot
* additional providers

The product should model **individual AI models**, not only companies.

A model may expose separate pricing instruments such as:

```text
Input tokens
Output tokens
Cached tokens
```

Users should be able to:

* browse models
* identify provider
* inspect current token pricing
* inspect historical pricing
* compare models/providers
* understand units

Example units may include:

```text
$/1M input tokens
$/1M output tokens
$/1M cached tokens
```

---

# 17. AI Reasoning / Outcome Economics

Urdais may represent AI economics across three conceptual levels:

```text
COMPUTE
GPU-hours / FLOPs

        ↓

TOKENS
Model/API consumption

        ↓

OUTCOMES
Completed economic tasks
```

The frontend should eventually support displaying:

* compute cost
* token cost
* task/outcome cost
* historical outcome pricing
* equivalent tasks across AI systems

Examples of defined outcomes might include:

* resolve a customer-support case
* process an invoice
* generate an accepted code change
* produce a qualified sales lead

Outcome pricing must only be shown where reliable underlying data and a defined methodology exist.

The UI should expose the methodology/source defining the outcome.

---

# 18. News

Urdais should include an Information Age news experience.

Users should be able to:

* browse recent news
* filter by category
* open the original publisher source

Categories include:

* AI
* compute
* memory
* photonics
* energy/power
* crypto

A news item should be capable of showing:

* headline
* publisher
* publication timestamp
* category
* source link

The frontend should not present Urdais as the original publisher when linking aggregated external news.

---

# 19. Authentication

Public market data should not require authentication.

Accounts may be created using:

* Google
* Apple
* email

Email ownership must be verified.

The frontend should support:

* sign up
* email verification flow
* sign in
* sign out
* persistent authenticated session
* account state
* authentication errors

Authentication is expected to use Supabase Auth.

Sensitive auth logic should not be implemented solely client-side.

---

# 20. Free vs Premium

Urdais supports:

```text
Free
Premium
```

Public users should be able to encounter Premium functionality without being unexpectedly blocked from the core Urdais product.

When an unauthenticated user chooses Premium content:

```text
Premium Content
      ↓
Account Creation / Sign In
      ↓
Plan Selection
      ↓
Stripe Checkout
```

Authenticated Free users should be able to upgrade.

Premium entitlement must come from the backend.

The frontend must not grant Premium access based only on local/client state.

---

# 21. Stripe / Billing UX

Stripe handles payment-card data.

The frontend may initiate:

```text
POST /v1/subscription/checkout
```

for Premium checkout.

Users should also be able to access subscription management through:

```text
POST /v1/subscription/portal
```

Stripe events update subscription/entitlement state through the backend.

The intended flow is:

```text
User
 ↓
Urdais Account
 ↓
Stripe Checkout
 ↓
Stripe
 ↓
Stripe Webhook
 ↓
Urdais Subscription / Entitlement
 ↓
Premium API Authorization
 ↓
Premium Frontend Access
```

The frontend should treat the server as the source of truth for Premium status.

---

# 22. Marketplace

The AI infrastructure marketplace is a **Premium feature**.

The frontend should eventually allow Premium users to:

* search infrastructure offers
* filter offers
* inspect current observed pricing
* view provider/source
* view region
* view hardware type
* view pricing model
* view SLA/service characteristics where available
* view last-updated time
* follow the source/provider where appropriate

Potential filters include:

```text
Hardware Type
Region
Provider
Pricing Model
Service Tier / SLA
```

Urdais may aggregate offers from many external providers.

The V1 frontend should treat marketplace offers as information supplied by the Urdais API.

The frontend should not assume Urdais itself executes infrastructure transactions.

---

# 23. Expected API Interfaces

The frontend should be designed around interfaces conceptually including:

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

```http
POST /v1/subscription/checkout
POST /v1/subscription/portal
```

The exact request/response schemas may evolve during backend implementation.

Frontend code should avoid unnecessary coupling to unstable backend internals.

---

# 24. Loading States

Any frontend surface that fetches remote data must handle loading intentionally.

Examples:

* skeleton chart
* instrument metadata placeholder
* market list placeholder
* news placeholder
* marketplace placeholder

The UI should not appear broken while data is being retrieved.

---

# 25. Empty States

The UI must gracefully handle cases where:

* no historical observations exist
* a region has no data
* a filter returns no marketplace offers
* an instrument is newly created
* outcome pricing is unavailable
* news category has no results

The frontend must not fabricate fallback market values.

---

# 26. Error States

The frontend should distinguish between reasonable failure types where useful:

* request failure
* no data
* unauthorized
* Premium required
* stale data
* instrument not found
* upstream data temporarily unavailable

Previously published data may remain available even when upstream providers are unavailable.

The UI should not imply that an upstream outage means historical Urdais data has disappeared.

---

# 27. Freshness / Stale Data UX

Datasets update on different schedules.

The frontend should display:

* last updated
* observation timestamp where relevant
* stale status where provided by the API

Example:

```text
Last updated: 12 minutes ago
```

or:

```text
Data delayed
```

The backend determines whether a dataset is stale.

The frontend displays that status.

---

# 28. Data Integrity Rules for the Frontend

The frontend must not:

* calculate proprietary Urdais indices itself
* silently substitute missing values
* combine incompatible pricing models
* combine incompatible SLA tiers
* combine regions without methodology support
* fabricate historical data
* interpolate values unless explicitly supported
* treat cached data as newly observed data
* grant Premium access from client state alone

The backend and published Urdais datasets are authoritative.

---

# 29. Performance Requirements

Urdais is heavily read-oriented.

Frontend expectations include:

* precomputed API reads generally **<500 ms**
* responsive chart interactions
* efficient historical-series rendering
* reasonable initial page load
* caching/CDN usage where appropriate
* avoid unnecessary repeat requests
* avoid fetching entire datasets when only a relevant window is required

Expected system scale:

```text
~100K monthly users
~1K peak concurrent users
~100–300 peak API requests/sec
~1K–5K instruments
```

Frontend architecture should support this without premature complexity.

---

# 30. Responsive Design

Urdais is primarily envisioned as a **web market-data product**.

Desktop should receive special attention because complex charts and market comparisons benefit from screen space.

The frontend should still function appropriately on:

* desktop
* laptop
* tablet
* mobile browsers

V1 does not require a native mobile application.

---

# 31. Accessibility

Frontend implementation should follow reasonable web accessibility practices, including:

* semantic HTML
* keyboard-accessible controls
* accessible forms
* sufficient contrast
* clear focus states
* meaningful labels
* screen-reader-friendly navigation where practical

Charts should not be the sole place critical numeric information is communicated.

Current values and important statistics should also exist as readable text.

---

# 32. Security Boundaries

The frontend is an untrusted client.

Therefore:

* secrets must never be embedded in browser code
* Stripe secret keys must remain server-side
* provider API credentials must remain server-side
* Supabase privileged credentials must remain server-side
* Premium authorization must be enforced server-side
* administrative/data-ingestion functionality must not be exposed through public client interfaces

HTTPS is required in production.

---

# 33. Analytics

PostHog is planned for product analytics.

Potential future events include:

```text
instrument_viewed
instrument_searched
chart_range_changed
comparison_created
methodology_viewed
premium_gate_viewed
signup_started
signup_completed
checkout_started
subscription_started
marketplace_search
news_article_opened
```

Analytics instrumentation should be added intentionally as features are implemented.

Do not implement all analytics merely because they are listed here.

---

# 34. Maintainability

Frontend code should support adding new:

* instruments
* index types
* infrastructure categories
* regions
* AI models
* pricing units
* methodologies

without requiring bespoke pages for every individual dataset.

Where appropriate, frontend experiences should be driven by generalized concepts such as:

```text
Instrument
Time Series
Category
Region
Methodology
Access Level
```

rather than hardcoded around H100 or one initial index.

At the same time, **do not prematurely abstract hypothetical features**. Generalize when actual implementation requirements justify it.

---

# 35. Explicit Frontend Non-Goals

The frontend is **not responsible for**:

* source ingestion
* web scraping
* raw data persistence
* canonical normalization
* index calculations
* methodology calculation logic
* backfills
* data-provider credential management
* Stripe webhook processing
* Premium entitlement determination
* data freshness determination
* backend validation of observations

Those responsibilities belong to the Urdais backend/data platform.

---

# 36. V1 Product Boundary

This PRD describes the intended complete Urdais V1 frontend, but **does not imply that every capability launches simultaneously**.

Implementation should proceed vertically and iteratively.

A likely early product slice is:

```text
Instrument Discovery
      ↓
Single Compute Instrument
      ↓
Historical Time Series
      ↓
TradingView Chart
      ↓
Current Value / Change / Updated Time
      ↓
Source / Methodology
```

For example:

```text
UCPI-H100
      ↓
GET instrument
      ↓
GET historical series
      ↓
Render chart
```

Only explicitly requested slices should be implemented.

---

# 37. Frontend Success Criteria

The finished Urdais V1 frontend should ultimately allow a user to arrive without an account and quickly answer questions such as:

> What does H100 compute cost right now?

> How has that price changed over time?

> Is compute cheaper in Europe or US East?

> What methodology does UCPI use?

> How do H100 and B200 prices compare?

> How has the price of tokens from different AI models changed?

> What does completing a defined AI task cost?

> What is happening in compute, memory, photonics, and energy markets?

A Premium user should additionally be able to answer:

> What does Urdais measure for memory and photonics?

> What AI infrastructure is currently available across providers, regions, pricing models, and service tiers?

The frontend succeeds when Urdais' underlying data can be explored **quickly, transparently, and without requiring the user to understand the backend data pipeline.**

---

## Agent Instruction

> **This PRD is project context, not an implementation request. Do not implement features solely because they appear in this document. Urdais is being developed iteratively. Only modify code for functionality explicitly requested in the current implementation prompt. When implementing a feature, use this PRD to preserve compatibility with the intended overall Urdais V1 architecture and product direction.**
