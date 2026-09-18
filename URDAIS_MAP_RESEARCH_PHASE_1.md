# Urdais Map Research Phase 1

_Research package compiled 17 September 2026. This file is the Phase 1 system of record. It is **not** ingested data, application code, or a map redesign._

## 1. Executive Summary

Urdais already has a MapLibre map, clustering, filters, legend, and profiles. The gap is **sourced geography**: the live client still renders demo points. This package is a sparse, high-signal global dataset of physical AI infrastructure in four public V1 categories — Data Center, GPU Compute Cluster, Semiconductor Fab, and Power Infrastructure — with primary-source provenance.

**Inventory:** 78 facility research records (35 Data Center, 18 GPU Compute Cluster, 20 Semiconductor Fab, 5 Power Infrastructure) across **12** countries. **124** source URLs are registered. **33** records currently satisfy derived `map_ingest_ready` (coordinates + non-city precision + researcher ingest flag). **60** distinct facility IDs require human review before mapped ingestion. **38** rejected candidates are listed so they are not silently re-added.

**Design choices:** unknown remains `null`. GPU SKUs, MW, and streets are never inferred. Power assets are included only with a documented compute link. Canada and China are explicit coverage gaps. The next step is a database/schema audit, then an ingestion JSON contract — not loading this file into the map.

## 2. Production Inclusion Methodology

This Phase 1 package is a **research dataset**, not an ingested production table. Accuracy outranks completeness. Unknown values stay `null`. No field is inferred from proximity, brand association, or cloud-region names.

Research date: **17 September 2026**.

### 2.1 Data Center

**Include** when a **named physical campus or building** is documented by a Tier 1 or strong Tier 2 source as a data-center facility that matters to the AI compute supply chain (hyperscaler AI campus, GPU-cloud landlord campus, sovereign AI campus, or a clearly identified flagship colo supporting high-density AI — not a portfolio dump).

**Exclude**

- Corporate HQ, sales offices, labs, and software offices
- Cloud **regions** or Availability Zones without a named campus
- Directory-only sites (datacenters.com, Baxtel, Wikipedia, listicles) unless independently confirmed
- Every building in Northern Virginia / Dallas / Frankfurt simply because the market is dense
- Heat-recovery or sustainability projects that are not the data center itself

A GPU cluster hosted in a data center is a **separate entity** when sources describe different infrastructure (landlord campus vs tenant cluster, or supercomputer vs host building). Shared coordinates are expected and are **not** automatic duplicates.

### 2.2 GPU Compute Cluster

**Include** when sources document a **physical training/inference/HPC system** with a locatable host site: named AI supercomputers (Colossus, Fairwater-as-supercomputer only if Microsoft treats the datacenter itself as the machine — in that case the data-center record carries the compute facts and a second cluster row is **not** invented), national/EuroHPC systems that are economically relevant, or GPU-cloud clusters tied to a named hall/campus.

**Exclude**

- Software products, “AI-ready” marketing, or GPU cloud SKUs without a site
- Double-counting the same building as both categories without a distinct entity
- Filling `gpu_models` from TOP500 or Wikipedia when the host institution’s page does not state them

**Taxonomy note for later schema mapping:** the live Urdais map enum is still `compute_cluster` (`src/types/map.ts`). Research IDs use `gpu_compute_cluster`. Fugaku is hosted at a documented site but is **not** evidenced here as a GPU machine; it is flagged for review rather than relabeled.

### 2.3 Semiconductor Fab

**Include** physical wafer fabs and **advanced packaging** sites with direct relevance to leading-edge AI accelerators, advanced logic, HBM/DRAM for HPC, or advanced packaging (CoWoS-class / HBM backend). Multi-fab **campuses** are one entity unless sources publish distinct sites/addresses (e.g. TSMC Fab 18 Tainan vs Fab 20 Hsinchu vs Arizona).

**Exclude**

- Design centers, sales HQ, and offices
- Trailing-edge commodity lines (e.g. Samsung Austin 65–14 nm, Giheung matured nodes) unless they make HBM/HPC memory
- ESMC Dresden is **included with an explicit caveat**: announced 28/22 and 16/12 nm automotive/industrial, not leading-edge AI GPU nodes

### 2.4 Power Infrastructure

**Do not catalog general power infrastructure.**

**Include only** when a **physical asset** has documented material connection to:

- a major data center or campus
- an AI compute campus
- a GPU compute cluster
- a semiconductor fab
- a dedicated compute-energy development

Qualifying examples used here: Crane Clean Energy Center (Microsoft PPA to restart TMI Unit 1 for PJM data-center load); Susquehanna SES (Talen/AWS adjacent co-located campus); Fermi Project Matador on-site gas plant (TCEQ: power solely for on-site AI data center); Kairos Hermes 2 (TVA PPA for Google data centers in TN/AL); xAI Memphis on-site turbines (press on permit — **not ingest-ready**).

**A PPA alone is not enough** unless the plant/site is identified. Helion, Oklo/Equinix, and Amazon/X-energy/Energy Northwest are rejected in this pass for that reason. Generic nearby generators (including other PJM nuclear plants) are excluded. Hamina district-heat recovery is excluded (thermal reuse, not generation for compute).

Every power row must state `compute_relationship` in plain language.

### 2.5 Explicit inclusion / exclusion rules (summary)

| Rule | Action |
| --- | --- |
| No evidence of existence **and** location | Do not include |
| HQ / office / research lab | Exclude |
| Cloud region without campus identity | Exclude |
| Directory/SEO/listicle as sole evidence | Exclude (discovery only) |
| Campus vs building | One campus row unless sources separate buildings |
| Landlord DC + tenant GPU cluster | Two rows + relationship |
| Shared coordinates | Not a duplicate by itself |
| City centroid only | May keep as research row; **not** map-ingest-ready |
| Cancelled project without primary confirmation | Reject or review — do not place as operational |
| Unknown field | `null` — never guessed |

### 2.6 Source hierarchy

**Tier 1 (authoritative for facts they actually state):** company facility pages and press releases; SEC / regulatory disclosures; government records; utility filings; permits, planning, zoning, environmental reviews; official economic-development notices.

**Tier 2 (corroboration / discovery of leads):** reputable national/financial press and established trade press. A Tier 2 claim is **not** copied onto a field already sourced at Tier 1 if they conflict — the conflict is recorded.

**Tier 3 (discovery only):** aggregators, crowdsourced maps, Wikipedia, datacenters.com, Baxtel, listicles. Not used as evidence in this file.

Each source lists **`claims_supported`**. If a source does not mention GPUs, MW, or coordinates, those fields are not attributed to it.

### 2.7 Geographic methodology

Phase 1 is **high-signal global**, not a census. Minimum coverage intent: United States, Canada, Europe, United Kingdom, China, Taiwan, South Korea, Japan, Singapore / Southeast Asia, Middle East, Australia.

Gaps are explicit in §7. Canada and China have **no ingestable campus rows** in this pass because named physical sites with primary sourcing were not established (AWS Canada is region-level only; China hyperscale campuses were not verified from company/government primaries here).

Admin1 is state/province/county as published. Country names are normalized in tables; ISO codes are kept on records when present.

### 2.8 Coordinate methodology

Preferred order:

1. Exact coordinates from official/public records
2. Documented street address geocoded (Nominatim, 17 September 2026, User-Agent `UrdaisMapResearch/1.0`)
3. Clearly identified campus/facility position (including an OSM **named** industrial feature that matches the official campus name)
4. City centroid **last resort** — `coordinate_precision: city`, `ingest_ready` false for map placement

Precision flags: `building` | `campus` | `street` | `city`.

The current Urdais map point type **requires numeric `longitude` and `latitude`** (`src/types/map.ts`, `src/lib/map-geojson.ts`). Rows without coordinates cannot become `mappingStatus: "mapped"` points. They may later become `unmapped` quality-state records — **Unmapped is not a public infrastructure category**.

Nominatim/OSM is a geocoder, not a fact source for ownership or MW.

### 2.9 Operational-status definitions

| Status | Meaning in this file |
| --- | --- |
| `announced` | Publicly announced; little evidence of site work |
| `planned` | Site/project defined; not yet operating; restart/new-build still pending (e.g. Crane) |
| `under_construction` | Sources describe active construction |
| `operational` | Sources state the facility/system is in service |
| `expansion` | Operating (or first building operating) **and** further buildings/phases underway |
| `suspended` | Work paused |
| `cancelled` | Project called off (none ingested as live in this pass) |
| `retired` | Permanently offline |
| `null` | Status not supported by the sources cited |

Dates (`announced_date`, `construction_start`, `operational_date`) are ISO dates only when the cited source supports that date.

### 2.10 Verification / confidence methodology

| Confidence | Test |
| --- | --- |
| `high` | Identity + location supported by Tier 1 (or two independent strong sources); remaining gaps are missing optional fields |
| `medium` | Real facility but material ambiguity (address vs pin, status, GPU counts, or Tier-2-only power equipment) |
| `low` | Not used for inclusion in this pass |

`ingest_ready` on source records means “the **research** row is internally consistent enough to consider.” **`map_ingest_ready`** (derived in §8) additionally requires coordinates, non-city precision, non-cancelled status, and confidence ≠ low.

`last_verified_date` is 2026-09-17 unless noted.

### 2.11 Duplicate / entity-resolution methodology

Watch for: campus vs building; rebrands; former names; landlord vs tenant; expansions mistaken for new sites; GPU clusters inside mapped DCs; fab vs packaging on one campus.

**Rules applied**

- One row per distinct infrastructure entity, not per building, unless sources isolate a building
- TSMC Arizona packaging planned on the same Phoenix campus is **not** a second pin
- TSMC Fab 18A/18B share one Tainan address → one row
- Fairwater Atlanta (Microsoft name) vs QTS Fayetteville (physical campus) stays linked, not two campuses
- Meta Prometheus is a cluster **inside** New Albany, not a second campus
- IREN Horizon 1 is a cluster **inside** Childress
- LUMI / JUPITER share coordinates with host data-center rows on purpose
- Intel Ohio One and Meta New Albany are different owners in the same metro
- Shared lat/lon never auto-merges entities



## 3. Facility Dataset

One section per category. Tables are the working set; expanded notes follow where provenance or ambiguity needs more than a cell.

### 3.1 Data Center

Named physical data-center campuses. GPU systems inside them are separate rows in §3.2 when justified.

_35 records._

| ID | Facility | Owner/Operator | City | Region | Country | Status | Capacity | Coordinates | Coordinate Precision | Sources | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nextdc-s3-sydney` | NEXTDC S3 Sydney | NEXTDC | Artarmon | NSW | Australia | operational | 80 MW IT; More than 20,000 m² technical space; interconnected with S1/S2 Macquarie Park. | -33.8191935, 151.1845025 | campus | [NEXTDC](https://www.nextdc.com/data-centres/sydney-data-centres/s3-sydney) | S1/S2/S4 are separate NEXTDC Sydney sites and are not ingested as a portfolio dump. Review: No street on the official page.; AI-specific tenancy not named. |
| `csc-kajaani-lumi-host` | CSC Kajaani Data Center (LUMI host) | CSC – IT Center for Science / CSC | Kajaani | Kainuu | Finland | operational | Renforsin Ranta business area. | 64.2319866, 27.691477 | building | [CSC](https://research.csc.fi/topic/lumi-supercomputer/); [LUMI / EuroHPC consortium](https://lumi-supercomputer.eu/how-did-lumi-end-up-in-finland/) | Host data center for the LUMI GPU supercomputer. Shared coordinates are expected; not a duplicate entity. |
| `google-hamina` | Google Hamina Data Center | Google | Hamina | null | Finland | expansion | €3.5B invested in the region to date per Google. | null | null | [Google](https://datacenters.google/locations/hamina-finland) | Offsite heat-recovery partnership with Haminan Energia is thermal reuse, not a mapped power-generation asset. Review: No geocodable street on the Google page.; AI-goal investment is not a documented GPU SKU at this campu |
| `fzj-jupiter-host` | Forschungszentrum Jülich (JUPITER host campus) | Forschungszentrum Jülich GmbH / Jülich Supercomputing Centre | Jülich | North Rhine-Westphalia | Germany | operational | JUPITER page describes a Modular Data Centre (MDC) on campus. | 50.9000601, 6.3931009 | street | [Forschungszentrum Jülich](https://www.fz-juelich.de/en/jsc/jupiter) | Host campus for JUPITER. Shared campus coordinates with the cluster record are expected. Review: Street vs MDC building. |
| `google-inzai` | Google Inzai Data Center | Google | Inzai | Chiba | Japan | operational | null | null | null | [Google](https://www.google.com/about/datacenters/locations/inzai-japan/) | Review: No street/coordinates.; Page does not document AI training hardware. |
| `naver-gak-sejong` | NAVER GAK Sejong | NAVER | Sejong | null | South Korea | operational | null | null | null | [NAVER](https://navercorp.com/en/service/datacenterGak) | GAK Chuncheon is a separate NAVER campus and is not mapped in this pass. Review: No street/coordinates on the fetched page.; AI mention is not a documented training cluster. |
| `microsoft-sweden-gavle` | Microsoft Gävle Datacenter | Microsoft | Gävle | null | Sweden | operational | Microsoft 2021-11-16: Sweden region with presence in Gävle, Sandviken and Staffanstorp. Only Gävle is given its own row | null | null | [Microsoft](https://news.microsoft.com/europe/2021/11/16/microsoft-opens-its-sustainable-datacenter-region-in-sweden-creating-new-opportunities-for-a-cloud-first-sweden/) | Same Azure region; distinct named cities. Review: City named, no street.; 2021 region launch is not an AI-campus label. |
| `microsoft-sweden-staffanstorp` | Microsoft Staffanstorp Datacenter | Microsoft | Staffanstorp | Skåne | Sweden | operational | Microsoft Sweden 2022-08-26: continues to operate Staffanstorp but withdrew a 70 MW backup-generation permit and will no | null | null | [Microsoft Sverige](https://news.microsoft.com/sv-se/2022/08/26/uppdatering-rorande-microsofts-datacenter-i-staffanstorp/) | Same Sweden region as Gävle; distinct city. Review: No street/coordinates.; Not documented as an AI training campus. |
| `uae-us-ai-campus-abu-dhabi` | UAE–US AI Campus (Abu Dhabi) | G42 / Khazna Data Centers (developer of Stargate UAE per G42 PR) / Khazna Data Centers | Abu Dhabi | Abu Dhabi | United Arab Emirates | under_construction | 5000 MW campus/facility; WAM search extract (full page not retrieved): spanning 10 square miles / 5 GW. That area claim is not in the G42 PR News | null | null | [G42](https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html) | Host campus for the Stargate UAE 1GW cluster. One campus, two entities. Review: No coordinates.; 5 GW is a campus plan, not live IT load. |
| `aws-cumulus-susquehanna` | AWS Cumulus Data Center Campus (Susquehanna) | Amazon Data Services / AWS / AWS | Salem Township | PA | United States | expansion | 960 MW campus/facility; Talen 2024 sale statement described a 960 MW campus. Talen later said the relationship expanded in June 2025 to include | null | null | [Talen Energy](https://ir.talenenergy.com/news-releases/news-release-details/talen-energy-announces-sale-zero-carbon-data-center-campus/); [Talen Energy](https://www.talenenergy.com/powering-data/) | Data-center campus sold by Talen to AWS; physically adjacent to and contractually powered by Susquehanna. Distinct from the nuclear plant record. Review: No public street address for the AWS campus footprint.; Operationa |
| `aws-morrow-county` | AWS Morrow County / Eastern Oregon Campus Cluster | Amazon Web Services | Boardman | OR | United States | operational | US West (Oregon) Region launched November 2011 with clusters in Morrow and Umatilla counties (Amazon EIS fact sheet). | null | city | [Amazon](https://assets.aboutamazon.com/fc/65/e3944125451698e1de8d734e2ac7/easternoregon-eis-factsheet-2022.pdf); [Amazon](https://sustainability.aboutamazon.com/aws-sustainability-fact-sheets/aws-fact-sheet-oregon.pdf) | Do not explode into individual Boardman buildings without Amazon-named campuses. Review: Which Boardman/Morrow buildings are AI vs general cloud is not disclosed.; Umatilla County cluster not separately listed to avoid d |
| `aws-new-carlisle` | AWS New Carlisle / St. Joseph County Campus | Amazon Web Services | New Carlisle | IN | United States | under_construction | Planned $11 billion investment; at least 1,000 jobs; built over the next decade in the Indiana Enterprise Center. | null | null | [Amazon](https://www.aboutamazon.com/news/aws/aws-indiana-investment-11-billion); [State of Indiana / IEDC](https://events.in.gov/event/gov-holcomb-announces-amazon-web-services-plans-to-invest-11b-to-create-a-new-data-center-campus-in-northern-indiana); [Indiana Economic Development Corporation](https://www.globenewswire.com/news-release/2024/04/25/2869483/0/en/Gov-Holcomb-announces-Amazon-Web-Services-plans-to-invest-11B-to-create-a-new-data-center-campus-in-Northern-Indiana.html) | Amazon and Indiana officials locate the campus in the Indiana Enterprise Center, New Carlisle, St. Joseph County. No AWS-published building address. Directory addresses (e.g. Edison Road) were not used. Review: No buildi |
| `aligned-dfw-04-plano` | Aligned DFW-04 Plano | Aligned Data Centers | Plano | TX | United States | under_construction | Dallas Morning News: 425,000 sq ft. | 33.0054184, -96.6535522 | street | [Aligned Data Centers](https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/); [Dallas Morning News](https://www.dallasnews.com/business/real-estate/2025/05/07/nvidia-backed-ai-computing-firm-has-plans-for-700-m-plano-data-center/) | Landlord campus; Lambda is the named occupant. Review: Street is from Dallas Morning News, not Aligned's PR body.; Geocode is street-level, not building. |
| `applied-digital-polaris-forge-1` | Applied Digital Polaris Forge 1 | Applied Digital | Ellendale | ND | United States | expansion | 400 MW IT; Three contracted buildings; 400 MW critical IT load at full build-out. 175 MW live as of 2026-07-01 (100 MW Building 1 + | 46.0214191, -98.5685326 | campus | [Applied Digital](https://ir.applieddigital.com/news-events/press-releases/detail/157/applied-digital-delivers-second-building-at-polaris-forge-1); [Applied Digital](https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at); [Applied Digital](https://ir.applieddigital.com/news-events/press-releases/detail/137/applied-digital-completes-phase-ii-ready-for-service-at); [North Dakota DEQ](https://deq.nd.gov/aq/Notices/AppliedDigital/DRAFT_ACP18338v1_0.pdf) | Landlord campus; CoreWeave is long-term tenant of the 400 MW deployment. Review: 9663 vs 9685 87th Ave SE (adjacent campus addressing).; Square footage not in Applied Digital IR PRs reviewed. |
| `coreweave-lancaster-pa` | CoreWeave Lancaster Pennsylvania Data Center | CoreWeave | Lancaster | PA | United States | announced | 100 MW campus/facility; 100 MW IT; Potential expansion to 300 MW. CoreWeave: ~600 construction jobs; ~70 FT roles at launch scaling to ~175. | null | null | [CoreWeave](https://coreweave.com/news/coreweave-announces-multi-billion-dollar-commitment-to-ai-infrastructure-in-pennsylvania) | CoreWeave tenant; Chirisa Technology Parks and Machine Investment Group co-developers. Review: Conflicting unofficial streets; omitted.; Whether construction had started by 2026-09-17 not stated in the July 2025 PR. |
| `coreweave-plano-coit` | CoreWeave Plano (1000 Coit Road) | CoreWeave | Plano | TX | United States | operational | City agreement: occupy at least 454,421 sq ft; ≥$1B business personal property. | 33.0117077, -96.7665775 | building | [CoreWeave](https://www.prnewswire.com/news-releases/coreweave-opens-new-texas-data-center-to-expand-access-to-high-performance-gpus-301884897.html); [City of Plano](https://plano.novusagenda.com/Agendapublic/AttachmentViewer.ashx?AttachmentID=20088&ItemID=10008) | Distinct from Aligned DFW-04 / Lambda in Plano. Review: Building owner vs CoreWeave as tenant not stated.; Current GPU generation at this site not disclosed. |
| `crusoe-abilene-stargate-campus` | Crusoe / Lancium Abilene Stargate Campus | Lancium / Crusoe | Abilene | TX | United States | expansion | Crusoe: multi-building campus; planned eight buildings. Local executives described ~4 million sq ft. Do not use 1.2 GW f | 32.508056, -99.777222 | campus | [Crusoe](https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live); [TCEQ](https://www.tceq.texas.gov/assets/public/permitting/air/publicnotice/37589sop.pdf); [KTXS](https://ktxs.com/news/local/lancium-crusoe-executives-brief-abilene-leaders-on-major-northside-investment) | Land/energy developer: Lancium. DC design/build/operator: Crusoe. Cloud operator for OpenAI: Oracle OCI. Bloomberg (2026-03-06) reported Oracle/OpenAI scrapped a planned expansion near this flagship — not verified on com |
| `cyrusone-dfw10-bosque` | CyrusOne DFW10 (Bosque County) | CyrusOne | null | TX | United States | under_construction | 190 MW campus/facility; 190 MW IT; First phase more than 190,000 sq ft; multiphase; $1.2B. Calpine: capable of delivering up to 400 MW to data centers in B | null | null | [CyrusOne / Calpine](https://www.cyrusone.com/resources/press-releases/cyrusone-and-calpine-announce-newhyperscale-data-center-development-in-texas) | CyrusOne flagship AI-relevant Texas campus with primary-source announcement. DFW7 Fort Worth not also listed. Review: No city/street in the company PR.; 190 MW vs Calpine 'up to 400 MW to data centers in Bosque' is a gen |
| `dataone-vineland` | DataOne Vineland AI Data Center | DataOne | Vineland | NJ | United States | under_construction | 300 MW campus/facility; City agendas (2026-08-17): Phase 1 ~129,622 sq ft AI DC building under construction; Phase 2 includes 587,980 sq ft two- | null | street | [Nebius](https://nebius.com/vinelandnj); [Nebius Group N.V.](https://assets.nebius.com/assets/176ae650-d0b0-45bf-a5ca-240e3769a745/Nebius%20accelerates%20US%20expansion%2C%20adding%20up%20to%20300%20MW%20capacity%20at%20new%20data%20center%20in%20New%20Jersey.pdf); [City of Vineland Planning Board](https://www.vinelandcity.org/Archive/Planning%20Board/Minutes/2025/Minutes%206-26-25%20%28Special%20Meeting%29.pdf) | DataOne owns/operates the building; Nebius is tenant for GPU clusters. Review: Nebius 2025 PR targeted summer 2025 first MW and 100 MW by YE2025; community page and 2026 planning agendas still show construction. Go-live  |
| `fermi-project-matador-campus` | Fermi America Project Matador Compute Campus | Fermi America / Fermi Inc. | null | TX | United States | under_construction | TCEQ: on-site hyperscale data center campus for next-generation data and AI infrastructure; generation used solely onsit | null | null | [Texas Commission on Environmental Quality](https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398); [KVII / ABC7 Amarillo](https://abc7amarillo.com/news/local/fermi-america-signs-six-point-five-billion-dollar-lease-for-worlds-largest-data-center-after-months-of-turmoil-tensorwave-amarillo-texas-carson-county-water-city-council-greg-abbott-audir) | TCEQ states the gas plant exists to supply the on-site hyperscale data-center campus. Shared Carson County site; not a duplicate. Review: Street address unknown.; TensorWave/AMD claims are local-TV only. |
| `google-cedar-rapids` | Google Cedar Rapids Data Center | Google | Cedar Rapids | IA | United States | planned | null | null | null | [Google](https://blog.google/feed/new-7-billion-investment-iowa/) | New Iowa campus alongside Council Bluffs expansion. Review: No address, MW, or construction status beyond 'in development' on Google's directory. |
| `google-council-bluffs` | Google Council Bluffs Data Center | Google | Council Bluffs | IA | United States | expansion | Google: >$20B invested in Iowa since 2007 Council Bluffs site. | null | null | [Google](https://datacenters.google/locations/iowa/); [Google](https://blog.google/feed/new-7-billion-investment-iowa/) | Same 2025 Iowa AI/cloud investment package as the new Cedar Rapids campus. Review: No campus street on Google pages.; GPU inventory not disclosed. |
| `google-pryor-mayes-county` | Google Pryor / Mayes County Data Center | Google | Pryor | OK | United States | expansion | null | null | null | [Google](https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-oklahoma/) | Same 2025 Oklahoma AI/cloud package as new Stillwater campus. Review: No street or MW on Google announcement. |
| `google-stillwater` | Google Stillwater Data Center Campus | Google | Stillwater | OK | United States | planned | null | null | null | [Google](https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-oklahoma/) | City-level official disclosure; Google directory lists Stillwater as in development. Review: No address or capacity. |
| `iren-childress` | IREN Childress Campus | IREN | Childress | TX | United States | expansion | 750 MW campus/facility; 576-acre freehold; dual fiber; on-site substations owned by IREN; ERCOT interconnection. | 34.3807907, -100.0588831 | street | [IREN](https://www.iren.com/data-centers/childress); [Texas Department of Licensing and Regulation](https://www.tdlr.texas.gov/TABS/Search/Print/TABS2024024946); [IREN](https://iren.com/resources/blog/iren-signs97-billion-agreement-with-microsoft-to-deploy-ai-cloud-infrastructure) | Campus contains Horizon 1–4 Microsoft GB300 halls plus other IREN Cloud capacity. Review: Highway geocode is coarse for a 576-acre site.; How much of 750 MW is AI vs other loads is not fully broken out on the location pa |
| `meta-eagle-mountain` | Meta Eagle Mountain Data Center | Meta | Eagle Mountain | UT | United States | expansion | Utah investment >$3 billion with 2026 expansion. Utility: Rocky Mountain Power. 100% clean/renewable match per Meta. | null | null | [Meta](https://datacenters.atmeta.com/2021/07/utah-county-we-are-online/); [Meta](https://datacenters.atmeta.com/2026/09/deepening-our-investment-in-eagle-mountain-utah/) | Not the same as NSA Camp Williams / Promontory Point. Review: AI-specific GPU deployment at this campus is not documented on the 2026 Meta post.; No street address on Meta pages reviewed. |
| `meta-new-albany` | Meta New Albany Data Center | Meta | New Albany | OH | United States | expansion | Meta US locations page: $1.5 billion+ investment; broke ground 2017; 300+ operational jobs when completed. | 40.065362, -82.754612 | campus | [Meta](https://datacenters.atmeta.com/ohio-new-albany/); [Meta](https://datacenters.atmeta.com/us-locations/); [The Columbus Dispatch](https://www.dispatch.com/story/business/information-technology/2025/09/26/meta-facebook-data-center-new-albany-ohio/86314973007/) | Physical campus for the Prometheus GPU supercluster. Review: Street is from reputable local press citing Meta, not Meta's HTML facility page.; Campus MW not on Meta official pages reviewed. |
| `meta-richland-parish` | Meta Richland Parish Data Center | Meta | null | LA | United States | under_construction | 5000 MW campus/facility; Meta contractor site: 4 million-square-foot campus. Meta: $50B+ Louisiana investment (July 2026). | null | null | [Meta](https://datacenters.atmeta.com/richland-parish-data-center/); [Meta](https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/); [Mortenson](https://www.mortenson.com/projects/richland-parish-data-center); [Richland Parish Data Center project site](https://www.richlandparishdatacenter.com/) | Physical campus for the Hyperion cluster. Review: 2 GW vs 5 GW: later Meta post is an expansion of the same campus.; No official street; Holly Ridge is contractor-level. |
| `microsoft-fairwater-atlanta` | Microsoft Fairwater Atlanta | QTS / Microsoft | Fayetteville | GA | United States | operational | City of Fayetteville approved a development agreement for a ~612-acre QTS campus on Hwy 54 West (2023). | 33.4452227, -84.5248259 | campus | [Microsoft](https://news.microsoft.com/source/features/ai/from-wisconsin-to-atlanta-microsoft-connects-datacenters-to-build-its-first-ai-superfactory/); [City of Fayetteville / The Citizen](https://thecitizen.com/2023/06/19/fayetteville-approves-development-agreement-for-612-acre-qts-data-center-on-hwy-54-west/); [QTS](https://q.com/data-centers/fayetteville/); [WBRC](https://www.wbrc.com/2026/07/17/questions-raise-about-massive-data-center-georgia-qts-pursues-plans-build-campus-bessemer/) | Microsoft states Fairwater Atlanta began operation in October 2025 and is networked with Fairwater Wisconsin as an AI superfactory. Campus land/owner is QTS. Review: Microsoft names the site Atlanta; physical campus is i |
| `microsoft-fairwater-mount-pleasant` | Microsoft Fairwater Mount Pleasant | Microsoft | Mount Pleasant | WI | United States | expansion | 315 acres; three buildings totaling 1.2 million sq ft under roof (Sep 2025 Microsoft blog). Village later approved addit | 42.6748702, -87.894888 | building | [Microsoft](https://news.microsoft.com/source/2026/06/23/microsoft-completes-construction-on-first-datacenter-facility-in-mount-pleasant-wisconsin/); [Microsoft](https://blogs.microsoft.com/blog/2025/09/18/inside-the-worlds-most-powerful-ai-datacenter/); [Microsoft](https://www.prnewswire.com/news-releases/microsoft-announces-3-3-billion-investment-in-wisconsin-to-spur-artificial-intelligence-innovation-and-economic-growth-302139892.html); [Wisconsin DNR](https://apps.dnr.wi.gov/warp_ext/am_permittracking2.aspx?id=35961); +1 more | Second Fairwater-family site in Atlanta is linked by Microsoft's dedicated AI WAN as an 'AI superfactory.' Microsoft also said identical Fairwater datacenters were under construction at other unspecified US locations as  |
| `oracle-shackelford` | Oracle Shackelford County AI Data Center Campus | Oracle | null | TX | United States | planned | Oracle: 10 buildings on 1,200 acres, 3.7 million square feet. | null | null | [Oracle](https://www.oracle.com/data-centers/shackelford-county/); [Vantage Data Centers](https://vantage-dc.com/news/openai-oracle-and-vantage-data-centers-announce-stargate-data-center-site-in-wisconsin/) | OpenAI/Oracle Stargate expansion site. Vantage's 2025-10-22 Wisconsin PR also refers to 'Frontier, a Texas campus in Shackelford County' as a Vantage investment — may be the same campus or an adjacent development; not me |
| `project-jupiter-dona-ana` | Project Jupiter (Doña Ana County) | BorderPlex Digital Assets / STACK Infrastructure | Santa Teresa | NM | United States | planned | Doña Ana County IRB coverage: ~1,400-acre campus. Oracle: developed as four DC buildings. | null | null | [STACK Infrastructure](https://www.stackinfra.com/about/news-press/press-releases/stack-infrastructure-reinforces-responsible-development-principles-through-project-jupiter-in-new-mexico/); [Oracle](https://www.oracle.com/news/announcement/blog/oracle-advances-american-ai-innovation-in-new-mexico-2026-01-23/); [El Paso Matters](https://elpasomatters.org/2025/09/19/project-jupiter-data-center-santa-teresa-approved-dona-ana-commissioners/) | Developer: BorderPlex + STACK. Tenant: Oracle for OpenAI. County approved industrial revenue bonds 2025-09-19 (El Paso Matters). Review: Owner vs operator split (BorderPlex land/development vs STACK vs county IRB leaseba |
| `switch-citadel-tahoe-reno` | Switch Citadel Campus (Tahoe Reno) | Switch | null | NV | United States | operational | 650 MW campus/facility; Switch 2017 opening PR: up to 7.2 million sq ft and up to 650 MW; 2,000 acres; TAHOE RENO 1 up to 1.3 million sq ft / 13 | null | null | [Switch](https://www.switch.com/switch-tahoe-reno-data-center-now-open/); [Switch](https://www.switch.com/tahoe-reno/); [Switch](https://www.switch.com/ai-factories/) | Flagship Switch AI-relevant campus. Las Vegas CORE/SUPERNAP AI factory buildings not separately listed. Review: Opening PR is undated on the fetched page (historical; campus has long been operational).; 650 MW vs later ' |
| `related-the-barn-saline` | The Barn (Saline Township Stargate Campus) | Related Digital / Oracle | Saline Township | MI | United States | under_construction | Oracle: developed on 250 of 575 acres. Related: three 550,000 sq ft DC buildings. Township: ~575 acres total. | null | null | [Oracle](https://www.oracle.com/news/announcement/blog/oracle-is-set-to-power-on-new-data-center-in-michigan-2025-1018/); [Related Digital](https://www.related.com/press-releases/2026-06-01/related-digital-blackstone-oracle-openai-walbridge-and-governor-whitmer); [Saline Township](https://salinetownship.org/go.php?id=731&table=page_uploads) | Developer Related Digital / Blackstone financing. Tenant Oracle for OpenAI Stargate. Contractor Walbridge. Review: No street number.; Campus MW not disclosed. |
| `vantage-lighthouse-port-washington` | Vantage Lighthouse Campus (Port Washington) | Vantage Data Centers | Port Washington | WI | United States | under_construction | 902 MW IT; Vantage location page: 672-acre campus, 4 data centers, 902 MW critical IT load, 2.5 million sq ft, completion 2028. | null | null | [Vantage Data Centers](https://vantage-dc.com/data-center-locations/north-america/port-washington-wisconsin); [Vantage Data Centers](https://vantage-dc.com/news/openai-oracle-and-vantage-data-centers-announce-stargate-data-center-site-in-wisconsin/) | Midwest Stargate site. Vantage develops/owns campus; Oracle occupies for OpenAI. Review: Exact street not on Vantage page.; Construction-start date not in the Oct 2025 PR ('will begin soon'). Rotary implied tours of an u |

**Expanded facility notes**

- **`nextdc-s3-sydney` — NEXTDC S3 Sydney** Entity notes: S1/S2/S4 are separate NEXTDC Sydney sites and are not ingested as a portfolio dump. Coordinates: Official page names Artarmon but no street. Pin is OSM named feature 'NextDC' in Artarmon. Ambiguities: No street on the official page.; AI-specific tenancy not named.
- **`csc-kajaani-lumi-host` — CSC Kajaani Data Center (LUMI host)** Entity notes: Host data center for the LUMI GPU supercomputer. Shared coordinates are expected; not a duplicate entity. Coordinates: Nominatim returned the named CSC industrial feature at Tehdaskatu 15.
- **`google-hamina` — Google Hamina Data Center** Entity notes: Offsite heat-recovery partnership with Haminan Energia is thermal reuse, not a mapped power-generation asset. Coordinates: Google page: purchased Summa paper mill in 2009. A 'Summa paper mill' Nominatim query did not return a usable industrial pin (snapped to an unrelated business). Ambiguities: No geocodable street on the Google page.; AI-goal investment is not a documented GPU SKU at this campus.
- **`fzj-jupiter-host` — Forschungszentrum Jülich (JUPITER host campus)** Entity notes: Host campus for JUPITER. Shared campus coordinates with the cluster record are expected. Coordinates: Official FZJ address on the JUPITER page. Nominatim geocoded the street in Jülich, not the Modular Data Centre building. Ambiguities: Street vs MDC building.
- **`google-inzai` — Google Inzai Data Center** Ambiguities: No street/coordinates.; Page does not document AI training hardware.
- **`naver-gak-sejong` — NAVER GAK Sejong** Entity notes: GAK Chuncheon is a separate NAVER campus and is not mapped in this pass. Coordinates: A third-party search snippet listed 824 Haengbok-daero; that street was not present in the fetched NAVER page body, so it is not stored. Ambiguities: No street/coordinates on the fetched page.; AI mention is not a documented training cluster.
- **`microsoft-sweden-gavle` — Microsoft Gävle Datacenter** Entity notes: Same Azure region; distinct named cities. Ambiguities: City named, no street.; 2021 region launch is not an AI-campus label.
- **`microsoft-sweden-staffanstorp` — Microsoft Staffanstorp Datacenter** Entity notes: Same Sweden region as Gävle; distinct city. Ambiguities: No street/coordinates.; Not documented as an AI training campus.
- **`uae-us-ai-campus-abu-dhabi` — UAE–US AI Campus (Abu Dhabi)** Entity notes: Host campus for the Stargate UAE 1GW cluster. One campus, two entities. Coordinates: G42 PR locates the campus in Abu Dhabi and describes a 5GW UAE–U.S. AI Campus. No street. WAM government story fetch returned a JavaScript shell. Ambiguities: No coordinates.; 5 GW is a campus plan, not live IT load.; WAM launch article not independently parsed.
- **`aws-cumulus-susquehanna` — AWS Cumulus Data Center Campus (Susquehanna)** Entity notes: Data-center campus sold by Talen to AWS; physically adjacent to and contractually powered by Susquehanna. Distinct from the nuclear plant record. Coordinates: Talen states the AWS campus is adjacent to Susquehanna. Plant coordinates are recorded on the distinct power record and are not reused as the data-center pin. Ambiguities: No public street address for the AWS campus footprint.; Operational occupancy vs shell/powered-land status as of 2026-09-17 is not stated on the Talen pages fetched.
- **`aws-morrow-county` — AWS Morrow County / Eastern Oregon Campus Cluster** Entity notes: Do not explode into individual Boardman buildings without Amazon-named campuses. Coordinates: Amazon official fact sheets locate US West (Oregon) data centers in Morrow and Umatilla counties. No single named building/campus address from Amazon was used. City Boardman is the Morrow County community commonly associated with the cluster, not a geocoded campus centroid. ingest_ready false because this is a multi-building county cluster without a primary-source street. Ambiguities: Which Boardman/Morrow buildings are AI vs general cloud is not disclosed.; Umatilla County cluster not separately listed to avoid double-counting the same region.
- **`aws-new-carlisle` — AWS New Carlisle / St. Joseph County Campus** Coordinates: Amazon and Indiana officials locate the campus in the Indiana Enterprise Center, New Carlisle, St. Joseph County. No AWS-published building address. Directory addresses (e.g. Edison Road) were not used. Ambiguities: No building-level address from AWS.; Construction underway reported by local business press; AWS page does not state a construction-start date.
- **`aligned-dfw-04-plano` — Aligned DFW-04 Plano** Entity notes: Landlord campus; Lambda is the named occupant. Coordinates: Aligned PR: DFW-04 under construction in Plano. Dallas Morning News (2025-05-07): 601 N. Star Road, ~425,000 sq ft, construction began 2024, finish expected 2026, ~$700M. Nominatim snapped to North Star Road (highway), not a building. Ambiguities: Street is from Dallas Morning News, not Aligned's PR body.; Geocode is street-level, not building.; 2026 finish is a newspaper expected date.
- **`applied-digital-polaris-forge-1` — Applied Digital Polaris Forge 1** Entity notes: Landlord campus; CoreWeave is long-term tenant of the 400 MW deployment. Coordinates: North Dakota DEQ air permit names ELN Generation at 9663 87th Ave. SE, Ellendale, ND 58436. Nominatim house match is stronger at 9685 87th Ave SE (adjacent; local TV also used 9685). Coords taken from the 9685 house geocode as campus-level on the same road; do not treat as a surveyed building footprint. Ambiguities: 9663 vs 9685 87th Ave SE (adjacent campus addressing).; Square footage not in Applied Digital IR PRs reviewed.
- **`coreweave-lancaster-pa` — CoreWeave Lancaster Pennsylvania Data Center** Entity notes: CoreWeave tenant; Chirisa Technology Parks and Machine Investment Group co-developers. Coordinates: CoreWeave official PR: Lancaster, Pennsylvania; CoreWeave is tenant; co-developed by Chirisa Technology Parks and Machine Investment Group. Industry press cited 216 Greenfield Road and 1375 Harrisburg Pike — those are ~3 miles apart in Nominatim, so neither street is used. Ambiguities: Conflicting unofficial streets; omitted.; Whether construction had started by 2026-09-17 not stated in the July 2025 PR.; Owner of the real estate SPV not named as CoreWeave.
- **`coreweave-plano-coit` — CoreWeave Plano (1000 Coit Road)** Entity notes: Distinct from Aligned DFW-04 / Lambda in Plano. Coordinates: City of Plano economic-development incentive agreement: CoreWeave to occupy at least 454,421 sq ft at 1000 Coit Road, Plano, TX 75075 as a data center. Nominatim house match. Building owner not stated in the agreement excerpt reviewed. Ambiguities: Building owner vs CoreWeave as tenant not stated.; Current GPU generation at this site not disclosed.; 2023 operational-by date is a target in the opening PR; later confirmation of exact go-live not re-fetched.
- **`crusoe-abilene-stargate-campus` — Crusoe / Lancium Abilene Stargate Campus** Entity notes: Land/energy developer: Lancium. DC design/build/operator: Crusoe. Cloud operator for OpenAI: Oracle OCI. Bloomberg (2026-03-06) reported Oracle/OpenAI scrapped a planned expansion near this flagship — not verified on company pages reviewed. Coordinates: TCEQ federal operating permit for 'Abilene Data Center Campus Master Association', Taylor County, latitude 32°30′29″N longitude 99°46′38″W. Directory streets (5502 Spinks Rd / 251 Lancium Way) were not used. Identity match to Crusoe/OpenAI Stargate is by Taylor County/Abilene campus coincidence plus Crusoe's Abilene flagship announcement — flagged as an ambiguity. Ambiguities: TCEQ 'Abilene Data Center Campus' coords assumed to be this Stargate campus (same county/city; not named Crusoe on the permit excerpt).; No primary-source street.; Campus MW (often cited as 1.2 GW in secondary databases) not in Crusoe's live PR.
- **`cyrusone-dfw10-bosque` — CyrusOne DFW10 (Bosque County)** Entity notes: CyrusOne flagship AI-relevant Texas campus with primary-source announcement. DFW7 Fort Worth not also listed. Coordinates: CyrusOne/Calpine: adjacent to Thad Hill Energy Center, Bosque County, Texas. Directory address 557 County Rd 3610 was not used. Ambiguities: No city/street in the company PR.; 190 MW vs Calpine 'up to 400 MW to data centers in Bosque' is a generation-platform figure, not this campus's IT load.; Named hyperscale tenant not disclosed.
- **`dataone-vineland` — DataOne Vineland AI Data Center** Entity notes: DataOne owns/operates the building; Nebius is tenant for GPU clusters. Coordinates: Vineland Planning Board minutes: southeasterly corner of Lincoln Avenue and Sheridan Avenue, Block 7503, Lots 1.01 & 35.01. Nominatim intersection search returned no point. Address recorded; coords null. Ambiguities: Nebius 2025 PR targeted summer 2025 first MW and 100 MW by YE2025; community page and 2026 planning agendas still show construction. Go-live not confirmed.; Phase square-footage figures changed across hearings.; Intersection not geocoded.
- **`fermi-project-matador-campus` — Fermi America Project Matador Compute Campus** Entity notes: TCEQ states the gas plant exists to supply the on-site hyperscale data-center campus. Shared Carson County site; not a duplicate. Coordinates: TCEQ places the project in Carson County, Texas. No street address was in the TCEQ extract fetched. Ambiguities: Street address unknown.; TensorWave/AMD claims are local-TV only.; Campus vs power-plant polygons not separated in public maps used here.
- **`google-cedar-rapids` — Google Cedar Rapids Data Center** Entity notes: New Iowa campus alongside Council Bluffs expansion. Coordinates: City-level official disclosure only (Google locations directory lists Cedar Rapids as in development). Ambiguities: No address, MW, or construction status beyond 'in development' on Google's directory.
- **`google-council-bluffs` — Google Council Bluffs Data Center** Entity notes: Same 2025 Iowa AI/cloud investment package as the new Cedar Rapids campus. Coordinates: Google official Iowa page does not publish a street. Directory addresses were not used. Ambiguities: No campus street on Google pages.; GPU inventory not disclosed.
- **`google-pryor-mayes-county` — Google Pryor / Mayes County Data Center** Entity notes: Same 2025 Oklahoma AI/cloud package as new Stillwater campus. Coordinates: Google names Pryor / Mayes County. No official street used. Ambiguities: No street or MW on Google announcement.
- **`google-stillwater` — Google Stillwater Data Center Campus** Coordinates: City-level official disclosure; Google directory lists Stillwater as in development. Ambiguities: No address or capacity.
- **`iren-childress` — IREN Childress Campus** Entity notes: Campus contains Horizon 1–4 Microsoft GB300 halls plus other IREN Cloud capacity. Coordinates: TDLR TABS project Iris-Childress Data Center, owner IE US Development Holdings 3 Inc., location 620 FM 1033, Childress TX 79201. Nominatim snapped to the US 287/FM 1033 highway, not a building footprint. 576-acre campus per IREN. Ambiguities: Highway geocode is coarse for a 576-acre site.; How much of 750 MW is AI vs other loads is not fully broken out on the location page.
- **`meta-eagle-mountain` — Meta Eagle Mountain Data Center** Entity notes: Not the same as NSA Camp Williams / Promontory Point. Coordinates: City-level official disclosure only. Not 'Promontory.' Ambiguities: AI-specific GPU deployment at this campus is not documented on the 2026 Meta post.; No street address on Meta pages reviewed.
- **`meta-new-albany` — Meta New Albany Data Center** Entity notes: Physical campus for the Prometheus GPU supercluster. Coordinates: The Columbus Dispatch (2025-09-26) states Meta's campus is at 1500 Beech Road in the Licking County portion of New Albany, citing Meta's 2017/2022 announcements and a Meta spokesperson. Meta's official New Albany page does not print the street. Ambiguities: Street is from reputable local press citing Meta, not Meta's HTML facility page.; Campus MW not on Meta official pages reviewed.
- **`meta-richland-parish` — Meta Richland Parish Data Center** Entity notes: Physical campus for the Hyperion cluster. Coordinates: Meta names Richland Parish only. Contractor Mortenson lists Holly Ridge, LA. No Meta-published street. Coordinates omitted (no geocodable official address). Ambiguities: 2 GW vs 5 GW: later Meta post is an expansion of the same campus.; No official street; Holly Ridge is contractor-level.; Whether any halls are operational as of 2026-09-17 is not stated.
- **`microsoft-fairwater-atlanta` — Microsoft Fairwater Atlanta** Entity notes: Microsoft states Fairwater Atlanta began operation in October 2025 and is networked with Fairwater Wisconsin as an AI superfactory. Campus land/owner is QTS. Coordinates: City of Fayetteville development agreement locates the QTS campus at 1435 Highway 54 West. Microsoft's own pages say 'Atlanta' and show an aerial of the Fairwater Atlanta site without a street address. Local TV (WBRC, 2026-07-17) reported a Microsoft AI superfactory occupying the QTS Fayetteville campus. QTS is recorded as owner; Microsoft as Fairwater operator/tenant. QTS Fayetteville is not also listed as a separate facility. Ambiguities: Microsoft names the site Atlanta; physical campus is in Fayetteville, Fayette County.; Which QTS buildings are Fairwater vs other tenants is not in Microsoft/QTS primary pages reviewed.; Exact MW and GPU count not in Microsoft primary sources.
- **`microsoft-fairwater-mount-pleasant` — Microsoft Fairwater Mount Pleasant** Entity notes: Second Fairwater-family site in Atlanta is linked by Microsoft's dedicated AI WAN as an 'AI superfactory.' Microsoft also said identical Fairwater datacenters were under construction at other unspecified US locations as of Sep 2025. Coordinates: Wisconsin DNR facility record lists 4800 90th ST, Mount Pleasant WI 53403. Village of Mount Pleasant also approved a related campus site plan at 12023 Durand Avenue (expansion parcel; geocode 42.6983640, -87.9303767). First operational Fairwater building vs later expansion parcels are not fully disambiguated in Microsoft's own pages. Ambiguities: Which parcel is the first operational Fairwater building (4800 90th vs Durand/International Drive expansion sites).; Exact GPU count not disclosed (only 'hundreds of thousands').
- **`oracle-shackelford` — Oracle Shackelford County AI Data Center Campus** Entity notes: OpenAI/Oracle Stargate expansion site. Vantage's 2025-10-22 Wisconsin PR also refers to 'Frontier, a Texas campus in Shackelford County' as a Vantage investment — may be the same campus or an adjacent development; not merged. Coordinates: Oracle names Shackelford County only. No city or street on Oracle's campus page. Coordinates omitted. Ambiguities: Oracle vs Vantage roles on the Shackelford campus are not reconciled in a single primary document.; No city/street.; Construction start not on Oracle page.
- **`project-jupiter-dona-ana` — Project Jupiter (Doña Ana County)** Entity notes: Developer: BorderPlex + STACK. Tenant: Oracle for OpenAI. County approved industrial revenue bonds 2025-09-19 (El Paso Matters). Coordinates: STACK: Doña Ana County. BorderPlex: flagship campus in Santa Teresa. El Paso Matters: just north of the Santa Teresa Port of Entry. No street. City set to Santa Teresa from BorderPlex/county coverage, not a geocoded point. Ambiguities: Owner vs operator split (BorderPlex land/development vs STACK vs county IRB leaseback) is legally complex.; Construction start not confirmed on STACK/Oracle pages reviewed.; MW not disclosed.
- **`switch-citadel-tahoe-reno` — Switch Citadel Campus (Tahoe Reno)** Entity notes: Flagship Switch AI-relevant campus. Las Vegas CORE/SUPERNAP AI factory buildings not separately listed. Coordinates: Switch: Tahoe Reno Industrial Center next to the Tesla Gigafactory; 2,000-acre campus. Press dateline Reno; site is in Storey County TRIC. No street. Coords omitted (do not geocode Tesla Gigafactory as Switch). Ambiguities: Opening PR is undated on the fetched page (historical; campus has long been operational).; 650 MW vs later 'gigawatts upon completion'.; Which Citadel halls actually host AI factories vs general colo is not broken out.; No street/city in Switch pages (TRIC / Storey County).
- **`related-the-barn-saline` — The Barn (Saline Township Stargate Campus)** Entity notes: Developer Related Digital / Blackstone financing. Tenant Oracle for OpenAI Stargate. Contractor Walbridge. Coordinates: Saline Township FAQ: 8 properties on the north side of Michigan Avenue, adjacent to Bridgewater Township, ~575 acres. No street number. Coords omitted. Ambiguities: No street number.; Campus MW not disclosed.; Oracle Dec 2025 post URL slug says 2025-1018 but byline is Dec 18, 2025.
- **`vantage-lighthouse-port-washington` — Vantage Lighthouse Campus (Port Washington)** Entity notes: Midwest Stargate site. Vantage develops/owns campus; Oracle occupies for OpenAI. Coordinates: Vantage official page: Port Washington, 30 minutes from Milwaukee. Rotary listed 1374 Lake Drive for a campus tour; not used as authoritative street (not on Vantage's page). Coords omitted. Ambiguities: Exact street not on Vantage page.; Construction-start date not in the Oct 2025 PR ('will begin soon'). Rotary implied tours of an under-construction site by Aug 2026.

### 3.2 GPU Compute Cluster

Named GPU (or otherwise flagged) compute systems with a physical host site. Shared coordinates with a data center mean **hosted_by**, not a duplicate building.

_18 records._

| ID | Facility | Owner/Operator | City | Region | Country | Status | Capacity | Coordinates | Coordinate Precision | Sources | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lumi-supercomputer` | LUMI Supercomputer | EuroHPC Joint Undertaking / CSC – IT Center for Science / LUMI consortium | Kajaani | Kainuu | Finland | operational | EuroHPC: pre-exascale HPE Cray EX hosted by CSC in Kajaani. GPU SKU is not copied from TOP500 into this record. | 64.2319866, 27.691477 | building | [EuroHPC Joint Undertaking](https://www.eurohpc-ju.europa.eu/supercomputers/our-supercomputers_en); [CSC](https://research.csc.fi/topic/lumi-supercomputer/) | GPU supercomputer hosted inside the CSC Kajaani data center. Review: GPU model not taken from TOP500. |
| `jupiter-supercomputer` | JUPITER Supercomputer | EuroHPC Joint Undertaking / Jülich Supercomputing Centre | Jülich | North Rhine-Westphalia | Germany | operational | NVIDIA GH200; 24000 accelerators; EuroHPC 2026-06-23: Europe's first exascale supercomputer; BullSequana XH3000; approximately 24,000 NVIDIA GH200 Grace Hopper Superchips. FZ | 50.9000601, 6.3931009 | street | [EuroHPC Joint Undertaking](https://www.eurohpc-ju.europa.eu/two-new-eurohpc-systems-join-top500-jupiter-remains-among-worlds-fastest-supercomputers-2026-06-23_en); [Forschungszentrum Jülich](https://www.fz-juelich.de/en/jsc/jupiter) | GPU supercomputer hosted on the FZJ campus. Review: Accelerator count is 'approximately 24,000'. |
| `riken-fugaku` | Fugaku (RIKEN Center for Computational Science) | RIKEN / RIKEN Center for Computational Science | Kobe | Hyogo | Japan | operational | Included as Japan's flagship supercomputer at a documented physical site. Architecture details are not copied from secondary ranking sites i | 34.6528736, 135.2207474 | campus | [RIKEN](https://www.riken.jp/en/access/); [RIKEN](https://www.riken.jp/en/about/map/) | Taxonomy tension: public V1 category is GPU Compute Cluster, but Fugaku is not documented here as a GPU machine. Flagged for human review before ingestion. Review: Category GPU Compute Cluster vs A64FX CPU architecture.; |
| `nscc-aspire-2a` | NSCC ASPIRE 2A / ASPIRE 2A+ | National Supercomputing Centre Singapore / NSCC | Singapore | null | Singapore | operational | NVIDIA; Singapore PMO speech: NVIDIA collaborated with NSCC to develop the all-GPU ASPIRE 2A+. Host building/address is not in that speech. | null | null | [Prime Minister's Office Singapore](https://www.pmo.gov.sg/newsroom/dpm-heng-swee-keat-at-the-launch-of-the-national-supercomputing-centre-singapore/) | Review: No facility address.; 2A vs 2A+ as one or two machines. |
| `stargate-uae-cluster` | Stargate UAE | G42 / Khazna Data Centers (developer); operator split with OpenAI/Oracle is not taken from the G42 PR fetched | Abu Dhabi | Abu Dhabi | United Arab Emirates | under_construction | G42 PR: 1 GW AI infrastructure cluster; first 200 MW targeted for 2026 delivery. GPU SKU is not in that PR text. | null | null | [G42](https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html) | Cluster being built inside the UAE–US AI Campus by Khazna. Review: No coordinates.; GB300 / OpenAI-operator claims appear in WAM coverage that was not fully retrieved. |
| `bristol-isambard-ai` | Isambard-AI | University of Bristol / UK government investment as described by the university / Bristol Centre for Supercomputing (BriCS) | Bristol | England | United Kingdom | operational | University of Bristol: dedicated AI research supercomputer; £225 million UK government investment; 2025: most powerful university-based supe | null | null | [University of Bristol](https://www.bristol.ac.uk/research/centres/bristol-supercomputing/) | University page: Isambard 3 shares a high-security compound, Isambard Park #1, with Isambard-AI. That park was not geocoded to a stable OSM feature in this pass. National Composites Centre was not used. Review: No geocod |
| `anl-aurora` | ALCF Aurora | U.S. Department of Energy / Argonne Leadership Computing Facility | Lemont | IL | United States | operational | Intel Data Center GPU Max Series; 63744 accelerators; ALCF/Intel: 10,624 nodes; 6 Intel Data Center GPU Max Series per node = 63,744 GPUs. ALCF: launched January 2025; supports lar | 41.7138065, -87.9818928 | campus | [Argonne Leadership Computing Facility](https://www.alcf.anl.gov/aurora); [Intel](https://www.intc.com/news-events/press-releases/detail/1631/aurora-supercomputer-blade-installation-complete) | DOE/Argonne research supercomputer. Review: Exact computer-room coordinates unknown.; Not rentable commercial capacity. |
| `coreweave-polaris-forge-1` | CoreWeave Polaris Forge 1 GPU Deployment | CoreWeave | Ellendale | ND | United States | expansion | Applied Digital names CoreWeave as the hyperscale tenant of the 400 MW Ellendale deployment. GPU model/count not in those PRs. | 46.0214191, -98.5685326 | campus | [Applied Digital](https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at) | Tenant GPU cloud on Applied Digital's Polaris Forge 1 campus. Not a second building inventory. Review: No CoreWeave-issued GPU SKU/count for Ellendale in sources reviewed. |
| `iren-horizon-1` | IREN Horizon 1 | IREN | Childress | TX | United States | operational | NVIDIA GB300 NVL72; First of four 50 MW IT-load liquid-cooled AI Cloud deployments for Microsoft. NVIDIA tested GB300 NVL72 at Horizon 1 (Exemplar Cloud). Horiz | 34.3807907, -100.0588831 | street | [IREN](https://www.sec.gov/Archives/edgar/data/1878848/000114036126032638/ef20080141_ex99-1.htm); [IREN](https://www.sec.gov/Archives/edgar/data/1878848/000114036125040072/ef20058139_ex99-1.htm) | Microsoft is the contracted user of dedicated GPU infrastructure; IREN owns/operates the Childress halls (SEC 8-K: IE US Hardware 3 Inc.). Review: GPU count not disclosed.; Horizons 2–4 not yet accepted as of the 2026-08 |
| `llnl-el-capitan` | LLNL El Capitan | U.S. Department of Energy / NNSA / Lawrence Livermore National Laboratory | Livermore | CA | United States | operational | AMD MI300 APU; LLNL ASC: HPE/AMD system; AMD MI300 APU (CPU+GPU in one package); peak >2.79 exaflops (page also states 2.82 peak); deployed 2024; ranked wo | 37.6820273, -121.7062914 | campus | [LLNL / NNSA ASC](https://asc.llnl.gov/exascale/el-capitan) | NNSA exascale system at LLNL HPC facility. Review: 30 MW vs ~35 MW peak on the same LLNL page.; GPU/APU count not published on the page fetched. |
| `lambda-dfw-04` | Lambda AI Cloud at Aligned DFW-04 | Lambda | Plano | TX | United States | under_construction | NVIDIA Blackwell, Blackwell Ultra; Lambda VP quoted in Aligned PR: deploying public and private AI cloud in Aligned DFW-04. Count not disclosed. Do not use datacenters.com Lam | 33.0054184, -96.6535522 | street | [Aligned Data Centers](https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/) | Tenant GPU cloud in Aligned DFW-04. Not double-counted as a second data center. Review: Lambda did not publish its own facility page with address in sources reviewed.; GPU count unknown. |
| `meta-hyperion` | Meta Hyperion | Meta | null | LA | United States | under_construction | Meta: largest multi-gigawatt AI training cluster; campus expanding to 5 GW compute capacity. Engineering (2025-09-29) said Hyperion expected | null | null | [Meta](https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/); [Meta Engineering](https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/) | Hyperion is the named training cluster housed in the Richland Parish campus. Review: Engineering 2028 start vs campus already under construction since Dec 2024 — likely phased energization.; GPU model/count not disclosed |
| `meta-prometheus` | Meta Prometheus | Meta | New Albany | OH | United States | under_construction | Meta Engineering (2025-09-29): 1-gigawatt cluster spanning several traditional data-center buildings, weatherproof tents, and adjacent coloc | 40.065362, -82.754612 | campus | [Meta Engineering](https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/); [The Columbus Dispatch](https://www.dispatch.com/story/business/information-technology/2025/09/26/meta-facebook-data-center-new-albany-ohio/86314973007/) | Named AI supercluster on the New Albany campus, not a second street address. Review: Whether Prometheus was fully online by 2026-09-17 is not confirmed on Meta's own pages.; GPU vendor/model for Prometheus not stated in  |
| `nebius-vineland-cluster` | Nebius Vineland GPU Factory | Nebius | Vineland | NJ | United States | under_construction | Nebius: tenant installing and managing server and GPU infrastructure. SKU/count not disclosed on the Vineland page. | null | street | [Nebius](https://nebius.com/vinelandnj); [Nebius](https://nebius.com/blog/posts/300-mw-new-jersey-and-iceland-regions) | Nebius GPU operations inside the DataOne-owned Vineland campus. Not a second building inventory. Review: Whether any GPU MW was live by 2026-09-17.; GPU model not disclosed. |
| `ornl-frontier` | OLCF Frontier | U.S. Department of Energy / Oak Ridge Leadership Computing Facility | Oak Ridge | TN | United States | operational | AMD Instinct MI250X; 39424 accelerators; OLCF: 9,856 nodes; each node 4 AMD Instinct MI250X GPUs (8 GCDs/node). Accelerator count = 9856 × 4 from official node table, not a separat | 35.987336, -84.2152 | campus | [Oak Ridge Leadership Computing Facility](https://www.olcf.ornl.gov/olcf-resources/compute-systems/frontier/) | DOE/ORNL research supercomputer, not a commercial GPU cloud region. Review: Geocode is the lab road, not the Frontier computer room.; Commercial/economic relevance is scientific HPC/AI research, not rentable cloud. |
| `openai-stargate-abilene` | OpenAI Stargate Abilene (OCI on Crusoe campus) | OpenAI / Oracle | Abilene | TX | United States | expansion | NVIDIA GB200; Crusoe/Oracle: GB200 racks delivered starting June 2025; early training and inference for next-generation research. OpenAI's five-new-sites | 32.508056, -99.777222 | campus | [Crusoe](https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live) | Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites. Review: OpenAI.com five-new-sites page returned 403 during this research; claims taken from C |
| `xai-colossus-1` | xAI Colossus 1 | xAI | Memphis | TN | United States | operational | NVIDIA H100; 200000 accelerators; x.ai/colossus: 200,000 H100 GPUs in a single cluster; built in 122 days then doubled in 92 days to 200k GPUs; timeline May 2024–Feb 2025. Sa | 35.0600392, -90.1520249 | building | [xAI](https://x.ai/colossus); [NVIDIA](https://nvidianews.nvidia.com/news/spectrum-x-ethernet-networking-xai-colossus); [USA Today / Commercial Appeal](https://www.usatoday.com/story/money/business/development/2026/01/15/xai-elon-musk-campuses-memphis-southaven/88066070007/) | Colossus 2 is a second Memphis campus on Tulane Road, not an extra count of this building. Review: 200,000 H100 (xAI headline) vs 180K widget on same page vs NVIDIA Hopper mix vs Musk H200 add-on.; Owner vs lessee (Phoen |
| `xai-colossus-2` | xAI Colossus 2 | xAI | Memphis | TN | United States | under_construction | No xAI-published GPU count for Colossus 2. Local press: Musk (CNBC, May 2025) targeted 6–9 months; xAI's Brent Mayo (2025-07-15) said he was | 34.9979829, -90.0348674 | building | [USA Today / Commercial Appeal](https://www.usatoday.com/story/money/business/development/2026/01/15/xai-elon-musk-campuses-memphis-southaven/88066070007/); [Commercial Appeal](https://www.commercialappeal.com/story/money/business/development/2025/07/15/elon-musk-xai-in-memphis-colossus-2/85215548007/) | Second Memphis campus, distinct from 3231 Paul R. Lowry Road Colossus 1. Review: Operational status as of 2026-09-17 not confirmed by xAI.; GPU vendor/count undisclosed. |

**Expanded facility notes**

- **`lumi-supercomputer` — LUMI Supercomputer** Entity notes: GPU supercomputer hosted inside the CSC Kajaani data center. Coordinates: Same host building as CSC Kajaani. Shared coordinates do not make this a duplicate of the data-center record. Ambiguities: GPU model not taken from TOP500.
- **`jupiter-supercomputer` — JUPITER Supercomputer** Entity notes: GPU supercomputer hosted on the FZJ campus. Coordinates: Same FZJ campus pin as the host record. Ambiguities: Accelerator count is 'approximately 24,000'.
- **`riken-fugaku` — Fugaku (RIKEN Center for Computational Science)** Entity notes: Taxonomy tension: public V1 category is GPU Compute Cluster, but Fugaku is not documented here as a GPU machine. Flagged for human review before ingestion. Coordinates: Official R-CCS address from riken.jp. Nominatim named feature is 理化学研究所 計算科学研究センター. Fugaku is a CPU-based A64FX manycore system; it is in-scope as nationally relevant HPC/AI infrastructure. It is not an NVIDIA GPU cluster; gpu_vendor is left null rather than forcing a GPU label. Ambiguities: Category GPU Compute Cluster vs A64FX CPU architecture.; System name Fugaku is not on the access-page extract (only the hosting center).
- **`nscc-aspire-2a` — NSCC ASPIRE 2A / ASPIRE 2A+** Ambiguities: No facility address.; 2A vs 2A+ as one or two machines.
- **`stargate-uae-cluster` — Stargate UAE** Entity notes: Cluster being built inside the UAE–US AI Campus by Khazna. Ambiguities: No coordinates.; GB300 / OpenAI-operator claims appear in WAM coverage that was not fully retrieved.; it_load_mw 200 is the first-phase target, not a measured live load.
- **`bristol-isambard-ai` — Isambard-AI** Coordinates: University page: Isambard 3 shares a high-security compound, Isambard Park #1, with Isambard-AI. That park was not geocoded to a stable OSM feature in this pass. National Composites Centre was not used. Ambiguities: No geocoded pin for Isambard Park #1.; GPU model not on the university page.
- **`anl-aurora` — ALCF Aurora** Entity notes: DOE/Argonne research supercomputer. Coordinates: Argonne National Laboratory street address. Nominatim returned a campus amenity at 9700 S Cass Ave, not the Aurora hall. Aurora is inside ANL. Ambiguities: Exact computer-room coordinates unknown.; Not rentable commercial capacity.
- **`coreweave-polaris-forge-1` — CoreWeave Polaris Forge 1 GPU Deployment** Entity notes: Tenant GPU cloud on Applied Digital's Polaris Forge 1 campus. Not a second building inventory. Coordinates: Same campus as applied-digital-polaris-forge-1. Ambiguities: No CoreWeave-issued GPU SKU/count for Ellendale in sources reviewed.
- **`iren-horizon-1` — IREN Horizon 1** Entity notes: Microsoft is the contracted user of dedicated GPU infrastructure; IREN owns/operates the Childress halls (SEC 8-K: IE US Hardware 3 Inc.). Coordinates: On IREN Childress campus; Horizon 1 is not given a separate street. Ambiguities: GPU count not disclosed.; Horizons 2–4 not yet accepted as of the 2026-08-13 8-K.
- **`llnl-el-capitan` — LLNL El Capitan** Entity notes: NNSA exascale system at LLNL HPC facility. Coordinates: LLNL campus address. Nominatim returned Fire Station 20 at 7000 East Avenue on the lab campus, not the HPC facility. El Capitan is inside LLNL. Ambiguities: 30 MW vs ~35 MW peak on the same LLNL page.; GPU/APU count not published on the page fetched.; Geocode is campus fire station, not the HPC floor.; National-security system; limited commercial relevance.
- **`lambda-dfw-04` — Lambda AI Cloud at Aligned DFW-04** Entity notes: Tenant GPU cloud in Aligned DFW-04. Not double-counted as a second data center. Coordinates: Same building as aligned-dfw-04-plano. Ambiguities: Lambda did not publish its own facility page with address in sources reviewed.; GPU count unknown.; Hut 8 Beacon Point / Anthropic Texas deal (BetaNews anonymous) is a different site and was rejected.
- **`meta-hyperion` — Meta Hyperion** Entity notes: Hyperion is the named training cluster housed in the Richland Parish campus. Coordinates: Named cluster at the Richland Parish Data Center; no separate address. Ambiguities: Engineering 2028 start vs campus already under construction since Dec 2024 — likely phased energization.; GPU model/count not disclosed.
- **`meta-prometheus` — Meta Prometheus** Entity notes: Named AI supercluster on the New Albany campus, not a second street address. Coordinates: Same New Albany campus as meta-new-albany. Prometheus spans multiple buildings plus weatherproof tents and adjacent colocation per Meta Engineering; not a separately addressed building. Ambiguities: Whether Prometheus was fully online by 2026-09-17 is not confirmed on Meta's own pages.; GPU vendor/model for Prometheus not stated in the Engineering post.; Zuckerberg July 2025 social post not independently archived here; Dispatch attributes 2026 online target to Zuckerberg.
- **`nebius-vineland-cluster` — Nebius Vineland GPU Factory** Entity notes: Nebius GPU operations inside the DataOne-owned Vineland campus. Not a second building inventory. Coordinates: Same site as dataone-vineland. Ambiguities: Whether any GPU MW was live by 2026-09-17.; GPU model not disclosed.; Kansas City colocation mentioned by Nebius is a different US site and was not given a street — not added.
- **`ornl-frontier` — OLCF Frontier** Entity notes: DOE/ORNL research supercomputer, not a commercial GPU cloud region. Coordinates: OLCF mailing address One Bethel Valley Rd, Oak Ridge, TN 37831. Nominatim snapped to Bethel Valley Road (campus/street), not the Frontier hall. Frontier is inside ORNL. Ambiguities: Geocode is the lab road, not the Frontier computer room.; Commercial/economic relevance is scientific HPC/AI research, not rentable cloud.
- **`openai-stargate-abilene` — OpenAI Stargate Abilene (OCI on Crusoe campus)** Entity notes: Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites. Coordinates: Same campus coordinates as crusoe-abilene-stargate-campus. Ambiguities: OpenAI.com five-new-sites page returned 403 during this research; claims taken from Crusoe's quoting of the OCI/OpenAI live campus.; Planned 600 MW Abilene expansion reportedly dropped (Bloomberg 2026-03-06) — not on Crusoe/OpenAI pages reviewed.
- **`xai-colossus-1` — xAI Colossus 1** Entity notes: Colossus 2 is a second Memphis campus on Tulane Road, not an extra count of this building. Coordinates: USA Today / Commercial Appeal cite Shelby County deeds/lease of the former Electrolux plant at 3231 Paul R. Lowry Road (also mapped as Riverport Road). Nominatim house match. Building is leased (Phoenix Investors owner per local press), not necessarily owned by xAI. Ambiguities: 200,000 H100 (xAI headline) vs 180K widget on same page vs NVIDIA Hopper mix vs Musk H200 add-on.; Owner vs lessee (Phoenix Investors per local press).; Memphis Light, Gas and Water vs on-site turbines not resolved from xAI primary page.
- **`xai-colossus-2` — xAI Colossus 2** Entity notes: Second Memphis campus, distinct from 3231 Paul R. Lowry Road Colossus 1. Coordinates: USA Today / Commercial Appeal cite Shelby County deeds for 5408/5414/5420 Tulane Road (CTC Property LLC → MZX Tech LLC). Nominatim returns a building labeled xAI Colossus 2 at 5420 Tulane Road. Ambiguities: Operational status as of 2026-09-17 not confirmed by xAI.; GPU vendor/count undisclosed.; Deed owner is an xAI affiliate name in press, not an xAI.org filing reviewed here.

### 3.3 Semiconductor Fab

Leading-edge logic, HBM/DRAM for AI, and advanced packaging campuses. Trailing-edge commodity fabs are excluded.

_20 records._

| ID | Facility | Owner/Operator | City | Region | Country | Status | Capacity | Coordinates | Coordinate Precision | Sources | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tsmc-esmc-dresden` | European Semiconductor Manufacturing Company (ESMC) Dresden | ESMC GmbH (TSMC 70%; Bosch, Infineon, NXP 10% each as announced) / TSMC | Dresden | Saxony | Germany | under_construction | nodes: 28nm, 22nm, 16nm, 12nm; 300mm; 300mm foundry for automotive/industrial/IoT as announced — not claimed here as leading-edge AI-accelerator production. | 51.1280341, 13.7418934 | street | [TSMC / Bosch / Infineon / NXP](https://pr.tsmc.com/english/news/3049); [Landeshauptstadt Dresden](https://www.dresden.de/de/wirtschaft/tomorrowshome/news/2026/esmc-richtfest.php) | TSMC-operated JV in Europe; not the same campus as TSMC Arizona or Fab 18. Review: Welcome Center address vs fab polygon.; AI-accelerator relevance is weak (auto/industrial nodes). |
| `intel-leixlip-fab34` | Intel Leixlip Campus (Fab 34) | Intel | Leixlip | Kildare | Ireland | expansion | nodes: Intel 4, Intel 3; High-volume fab for Intel 4 and Intel 3 including Xeon 6 / Core Ultra as stated in Intel's April 2026 JV repurchase PR. July 2026 PR: €5B ex | null | null | [Intel](https://www.intel.com/content/www/us/en/newsroom/news/artificial-intelligence/intel-invests-5-billion-euro-to-expand-manufacturing-in-europe.html); [Intel](https://www.intel.com/content/www/us/en/newsroom/news/corporate/intel-repurchase-49-equity-interest-ireland-fab-joint-venture.html) | Intel PRs name the Leixlip campus but do not publish a street in the pages fetched. Collinstown Industrial Park was not used. Review: No official street/coordinates in the PRs fetched. |
| `tsmc-jasm-kumamoto` | Japan Advanced Semiconductor Manufacturing (JASM) | Japan Advanced Semiconductor Manufacturing, Inc. / JASM / TSMC | Kikuyo | Kumamoto | Japan | null | TSMC Japan manufacturing subsidiary listed on the official fabs directory. Nodes/status not on that directory page. | 32.874477, 130.8210348 | campus | [TSMC](https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs) | Nominatim returned the Haramizu quarter node, not building 4106-1. Treat as campus-area, not a building pin. Review: Operational status and nodes not on the directory page.; Geocode is quarter-level, not the street numbe |
| `micron-hiroshima` | Micron Hiroshima (Higashihiroshima) | Micron | Higashihiroshima | Hiroshima | Japan | expansion | Existing Micron Japan memory fab (OSM/company presence). HBM/advanced DRAM expansion is reported by Bloomberg citing Micron; a Micron IR URL | 34.3869773, 132.6833423 | campus | [Bloomberg](https://www.bloomberg.com/news/articles/2026-07-04/micron-breaks-ground-on-9-billion-western-japan-plant-expansion) | OSM named feature 'Micron F 15' in Higashihiroshima. Bloomberg 2026-07-04 reports groundbreaking on a ¥1.5T expansion for advanced memory including HBM; that article is secondary. Review: Primary Micron Japan PR not fetc |
| `micron-singapore-hbm-packaging` | Micron Singapore HBM Advanced Packaging Facility | Micron Technology, Inc. / Micron | Singapore | null | Singapore | under_construction | HBM advanced packaging (back-end), not a leading-edge logic wafer fab. | null | null | [Micron Technology](https://investors.micron.com/news/press-release/2025/Micron-Breaks-Ground-on-New-HBM-Advanced-Packaging-Facility-in-Singapore-01-08-2025/default.aspx) | Packaging site complementary to DRAM wafer fabs. Review: No street/coordinates.; Whether operations had begun by 2026-09-17 is not confirmed on a later Micron page in this pass. |
| `sk-hynix-cheongju` | SK hynix Cheongju Campus | SK hynix | Cheongju | Chungcheongbuk-do | South Korea | expansion | Existing NAND campus (M11, M12, M15). M17 planned as new NAND fab. One campus record. | null | null | [SK hynix](https://news.skhynix.com/en/fab-facility-investment-2026/) | Same company, different city from Icheon/Yongin. Review: No street/coordinates.; M17 is future NAND, not HBM wafer. |
| `sk-hynix-icheon` | SK hynix Icheon Campus | SK hynix | Icheon | Gyeonggi | South Korea | operational | Existing DRAM/HBM manufacturing base (company describes Icheon among current bases). Exact HBM line IDs are not in the 2026 Y2/M17 PR. | 37.2501447, 127.4820653 | campus | [SK hynix](https://news.skhynix.com/en/fab-facility-investment-2026/) | Korea wafer source for Indiana advanced packaging per SK hynix Indiana PR. Not a duplicate of Yongin/Cheongju. Review: PR does not give a street or name a specific Icheon fab building.; HBM vs DRAM split on this campus i |
| `sk-hynix-yongin` | SK hynix Yongin Semiconductor Cluster | SK hynix | Yongin | Gyeonggi | South Korea | under_construction | Greenfield DRAM/HBM cluster. Y1 under construction (first cleanroom target February next year relative to 7 Aug 2026). Y2 second of four fab | null | null | [SK hynix](https://news.skhynix.com/en/fab-facility-investment-2026/) | Future Korea DRAM/HBM wafer campus; Indiana is packaging, not this site. Review: Y1 vs Y2 footprints not separated.; No coordinates. |
| `samsung-hwaseong` | Samsung Foundry Hwaseong | Samsung Electronics / Samsung Foundry | Hwaseong | Gyeonggi | South Korea | operational | nodes: 10nm, 3nm; 300mm; Samsung Foundry page: Hwaseong (2000) employs EUV; 'Hwaseong now produces the 10nm to 3nm processes'. 12-inch S3 is Matured & Advanced. | null | null | [Samsung Semiconductor](https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/) | Korea foundry triad with Pyeongtaek and Giheung. Giheung is not mapped in this pass (page describes it as matured 350nm–8nm). Review: No street/coordinates. |
| `samsung-pyeongtaek` | Samsung Foundry Pyeongtaek | Samsung Electronics / Samsung Foundry | Pyeongtaek | Gyeonggi | South Korea | operational | 300mm; Samsung Foundry page: Pyeongtaek (S5) is the advanced-node 12-inch line in the Korea triad; page text says it mass-produces further advanced | null | null | [Samsung Semiconductor](https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/) | Same foundry network as Hwaseong; different city. Not a duplicate. Review: No street or coordinates on the foundry sites page.; S6 line in the table has a blank city. |
| `tsmc-ap6-zhunan` | TSMC Advanced Backend Fab 6 (Zhunan) | TSMC | Zhunan | Miaoli | Taiwan | operational | Advanced backend / packaging fab listed on TSMC's official fabs directory. Included because advanced packaging is in-scope for AI accelerato | null | null | [TSMC](https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs) | Distinct published address from Fab 15 Taichung and Fab 18 Tainan. Review: Coordinates unknown.; Directory does not name the packaging technology. |
| `tsmc-fab-18-tainan` | TSMC Fab 18 (Tainan / Southern Taiwan Science Park) | TSMC | Tainan | Tainan | Taiwan | operational | Leading-edge logic wafer fab campus in STSP Tainan. NIST EA identifies Fab 18 as the Model Fab copied for TSMC Arizona. Process nodes are no | 23.116067, 120.2614511 | campus | [TSMC](https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs); [NIST / CHIPS Program Office](https://www.nist.gov/system/files/documents/2024/06/04/TSMC%20Draft%20EA%20June%203%202024%20.pdf) | Model Fab for Arizona copy-exact (NIST EA). Not a duplicate of Arizona. Review: Nodes/capacity not on the directory page.; 18A vs 18B building footprints not separated. |
| `tsmc-fab-20-hsinchu` | TSMC Fab 20 (Hsinchu Science Park) | TSMC | Hsinchu | Hsinchu | Taiwan | operational | Hsinchu leading-edge/logic fab listed separately from Fab 12A/12B. Nodes not stated on the directory page. | 24.7644311, 121.0054336 | campus | [TSMC](https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs) | Same science park as older Hsinchu fabs; different published address from Fab 12A/12B. Not merged. Review: Process nodes not on the directory page. |
| `intel-gordon-moore-park-oregon` | Intel Gordon Moore Park at Ronler Acres (D1X) | Intel | Hillsboro | OR | United States | operational | Intel 2022 press kit: leading-edge D1X development factory on the ~500-acre Ronler Acres campus, renamed Gordon Moore Park; headquarters of | null | null | [Intel](https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-expands-oregon.html) | Review: No street/coordinates in the 2022 kit.; Current production node not stated there. |
| `intel-ocotillo-arizona` | Intel Ocotillo Campus (Chandler) | Intel | Chandler | AZ | United States | expansion | nodes: Intel 18A; Intel Tech Tour 2025 press kit: Fab 52 is the fifth high-volume fab at Ocotillo and produces Intel 18A; Panther Lake manufactured at Fab 52. | 33.2413543, -111.8849114 | campus | [Intel](https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-builds-arizona.html); [Intel](https://newsroom.intel.com/press-kit/press-kit-intel-technology-tour-2025) | One campus record for Fab 52/62 rather than two buildings. Review: Fab 62 construction/node status not independently pinned.; No official street. |
| `intel-ohio-one` | Intel Ohio One | Intel | New Albany | OH | United States | under_construction | Two leading-edge chip factories under construction. Intel 2025-02-28: Mod 1 construction complete 2030, operations 2030–2031; Mod 2 construc | null | null | [Intel](https://newsroom.intel.com/corporate/ohio-one-construction-timeline-update) | Same metro as Meta New Albany but a different owner/campus. Not a duplicate. Review: No street/coordinates.; Process node not named in the timeline update. |
| `micron-boise` | Micron Boise Leading-Edge DRAM Campus | Micron Idaho Semiconductor Manufacturing (TRITON), LLC / Micron | Boise | ID | United States | planned | NIST: two HVM DRAM fabs in Boise, each ~600,000 sq ft cleanroom, leading-edge DRAM. HBM packaging in the US is described as following the se | null | null | [NIST CHIPS Program Office](https://www.nist.gov/chips/micron-idaho-boise); [Micron Technology](https://www.sec.gov/Archives/edgar/data/723125/000110465925058741/tm2517778d1_ex99-1.htm) | Same company as Hiroshima DRAM/HBM expansion and Singapore HBM packaging; different sites. Review: No street/coordinates.; Whether first Idaho fab is already in construction vs planned is not settled by the NIST summary  |
| `sk-hynix-indiana-west-lafayette` | SK hynix Indiana Advanced Packaging (West Lafayette) | SK hynix | West Lafayette | IN | United States | under_construction | HBM advanced packaging and R&D testbed. Wafers produced in Korea, packaged/tested in Indiana. Not a front-end wafer fab. | 40.4647693, -86.9297836 | campus | [SK hynix](https://news.skhynix.com/en/groundbreaking-ceremony-in-indiana/); [NIST CHIPS Program Office](https://www.nist.gov/chips/sk-hynix-indiana-west-lafayette) | Packaging campus for Korean-made HBM wafers. Same company, not a duplicate of Icheon/Yongin. Review: Park centroid vs future building.; NIST mass-production 2H 2028 vs company H2 2029. |
| `samsung-taylor-tx` | Samsung Austin Semiconductor Taylor | Samsung Austin Semiconductor, LLC / Samsung | Taylor | TX | United States | under_construction | nodes: 2nm; NIST: two leading-edge logic foundry fabs focused on 2nm plus an R&D fab in Taylor; HPC/AI among end markets. Samsung Taylor page cites the | null | null | [Samsung Austin Semiconductor](https://semiconductor.samsung.com/sas/company/taylor/); [NIST CHIPS Program Office](https://www.nist.gov/chips/samsung-electronics-texas-taylor); [Samsung Semiconductor](https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/) | Austin S2 (65–14nm) is not included (trailing relative to AI accelerators). Review: No street address on the pages fetched.; Production-start date not on those pages. |
| `tsmc-arizona-phoenix` | TSMC Arizona Phoenix Campus | TSMC Arizona Corporation / TSMC | Phoenix | AZ | United States | expansion | nodes: N4, N5, N3, N2, A16; Leading-edge logic foundry campus for HPC/AI customer silicon; advanced packaging facilities are planned on the same campus and are not spli | 33.7778581, -112.1621572 | campus | [TSMC](https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs); [NIST CHIPS Program Office](https://www.nist.gov/chips/tsmc-arizona-phoenix); [TSMC](https://www.tsmc.com/static/abouttsmcaz/index.htm) | NIST EA materials describe Arizona as a copy-exact of TSMC Fab 18 (Tainan Model Fab). Same company, different countries; not duplicates. Review: NIST three-fab CHIPS description vs later TSMC Arizona multi-fab/packaging  |

**Expanded facility notes**

- **`tsmc-esmc-dresden` — European Semiconductor Manufacturing Company (ESMC) Dresden** Entity notes: TSMC-operated JV in Europe; not the same campus as TSMC Arizona or Fab 18. Coordinates: ESMC public consultation text places a Welcome Center close to the construction site at Robert-Bosch Ring 4, Gate 5. Nominatim geocoded the street in Dresden-Klotzsche/Wilschdorf, not a fab footprint. Full esmc.eu fetch was blocked by a bot challenge. Ambiguities: Welcome Center address vs fab polygon.; AI-accelerator relevance is weak (auto/industrial nodes).
- **`intel-leixlip-fab34` — Intel Leixlip Campus (Fab 34)** Coordinates: Intel PRs name the Leixlip campus but do not publish a street in the pages fetched. Collinstown Industrial Park was not used. Ambiguities: No official street/coordinates in the PRs fetched.
- **`tsmc-jasm-kumamoto` — Japan Advanced Semiconductor Manufacturing (JASM)** Coordinates: Nominatim returned the Haramizu quarter node, not building 4106-1. Treat as campus-area, not a building pin. Ambiguities: Operational status and nodes not on the directory page.; Geocode is quarter-level, not the street number.
- **`micron-hiroshima` — Micron Hiroshima (Higashihiroshima)** Coordinates: OSM named feature 'Micron F 15' in Higashihiroshima. Bloomberg 2026-07-04 reports groundbreaking on a ¥1.5T expansion for advanced memory including HBM; that article is secondary. Ambiguities: Primary Micron Japan PR not fetched.; OSM 'F 15' label not confirmed on a Micron page in this pass.
- **`micron-singapore-hbm-packaging` — Micron Singapore HBM Advanced Packaging Facility** Entity notes: Packaging site complementary to DRAM wafer fabs. Coordinates: PR: adjacent to Micron's current Singapore facilities. No street. Ambiguities: No street/coordinates.; Whether operations had begun by 2026-09-17 is not confirmed on a later Micron page in this pass.
- **`sk-hynix-cheongju` — SK hynix Cheongju Campus** Entity notes: Same company, different city from Icheon/Yongin. Ambiguities: No street/coordinates.; M17 is future NAND, not HBM wafer.
- **`sk-hynix-icheon` — SK hynix Icheon Campus** Entity notes: Korea wafer source for Indiana advanced packaging per SK hynix Indiana PR. Not a duplicate of Yongin/Cheongju. Coordinates: OSM named industrial feature 하이닉스반도체 in Bubal-eup, Icheon. SK hynix 2026 investment PR treats Icheon as an existing manufacturing base distinct from Yongin and Cheongju. No official street was in the PR fetched. Ambiguities: PR does not give a street or name a specific Icheon fab building.; HBM vs DRAM split on this campus is not stated.
- **`sk-hynix-yongin` — SK hynix Yongin Semiconductor Cluster** Entity notes: Future Korea DRAM/HBM wafer campus; Indiana is packaging, not this site. Coordinates: PR locates the cluster in Wonsam-myeon, Cheoin-gu, Yongin-si. That is a township, not a geocoded pin in this pass. Ambiguities: Y1 vs Y2 footprints not separated.; No coordinates.
- **`samsung-hwaseong` — Samsung Foundry Hwaseong** Entity notes: Korea foundry triad with Pyeongtaek and Giheung. Giheung is not mapped in this pass (page describes it as matured 350nm–8nm). Ambiguities: No street/coordinates.
- **`samsung-pyeongtaek` — Samsung Foundry Pyeongtaek** Entity notes: Same foundry network as Hwaseong; different city. Not a duplicate. Ambiguities: No street or coordinates on the foundry sites page.; S6 line in the table has a blank city.
- **`tsmc-ap6-zhunan` — TSMC Advanced Backend Fab 6 (Zhunan)** Entity notes: Distinct published address from Fab 15 Taichung and Fab 18 Tainan. Coordinates: Official address did not geocode in Nominatim. Ambiguities: Coordinates unknown.; Directory does not name the packaging technology.
- **`tsmc-fab-18-tainan` — TSMC Fab 18 (Tainan / Southern Taiwan Science Park)** Entity notes: Model Fab for Arizona copy-exact (NIST EA). Not a duplicate of Arizona. Coordinates: 18A and 18B share the same published street. Pin is OSM named feature 台積電南科18廠, not a surveyed building footprint. Ambiguities: Nodes/capacity not on the directory page.; 18A vs 18B building footprints not separated.
- **`tsmc-fab-20-hsinchu` — TSMC Fab 20 (Hsinchu Science Park)** Entity notes: Same science park as older Hsinchu fabs; different published address from Fab 12A/12B. Not merged. Coordinates: Official address from TSMC Fabs directory. Pin is OSM named feature 'TSMC Fab 20'. Distinct from Fab 12 addresses in the same park. Ambiguities: Process nodes not on the directory page.
- **`intel-gordon-moore-park-oregon` — Intel Gordon Moore Park at Ronler Acres (D1X)** Ambiguities: No street/coordinates in the 2022 kit.; Current production node not stated there.
- **`intel-ocotillo-arizona` — Intel Ocotillo Campus (Chandler)** Entity notes: One campus record for Fab 52/62 rather than two buildings. Coordinates: Intel press kits name the Ocotillo campus in Chandler and Fab 52/62. Pin is OSM named feature 'Intel Corporation (Ocotillo campus)'. No official street was in the press-kit pages fetched. Ambiguities: Fab 62 construction/node status not independently pinned.; No official street.
- **`intel-ohio-one` — Intel Ohio One** Entity notes: Same metro as Meta New Albany but a different owner/campus. Not a duplicate. Ambiguities: No street/coordinates.; Process node not named in the timeline update.
- **`micron-boise` — Micron Boise Leading-Edge DRAM Campus** Entity notes: Same company as Hiroshima DRAM/HBM expansion and Singapore HBM packaging; different sites. Ambiguities: No street/coordinates.; Whether first Idaho fab is already in construction vs planned is not settled by the NIST summary page.
- **`sk-hynix-indiana-west-lafayette` — SK hynix Indiana Advanced Packaging (West Lafayette)** Entity notes: Packaging campus for Korean-made HBM wafers. Same company, not a duplicate of Icheon/Yongin. Coordinates: NIST/SK hynix locate the project at Purdue Research Park / West Lafayette. Nominatim pin is the research-park neighbourhood, not a building. Ambiguities: Park centroid vs future building.; NIST mass-production 2H 2028 vs company H2 2029.
- **`samsung-taylor-tx` — Samsung Austin Semiconductor Taylor** Entity notes: Austin S2 (65–14nm) is not included (trailing relative to AI accelerators). Ambiguities: No street address on the pages fetched.; Production-start date not on those pages.
- **`tsmc-arizona-phoenix` — TSMC Arizona Phoenix Campus** Entity notes: NIST EA materials describe Arizona as a copy-exact of TSMC Fab 18 (Tainan Model Fab). Same company, different countries; not duplicates. Coordinates: Official street did not geocode in Nominatim. Pin is the OSM named feature 'TSMC Arizona Fab 21' in Phoenix. TSMC's own fabs directory does not use the Fab 21 number. Ambiguities: NIST three-fab CHIPS description vs later TSMC Arizona multi-fab/packaging description.; OSM 'Fab 21' name vs TSMC directory name.; Full TSMC Arizona HTML fetch timed out.

### 3.4 Power Infrastructure

Only assets with a documented material link to compute, data-center, GPU-cluster, or semiconductor infrastructure. The link is stated in the notes column and again in evidence records.

_5 records._

| ID | Facility | Owner/Operator | City | Region | Country | Status | Capacity | Coordinates | Coordinate Precision | Sources | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crane-clean-energy-center` | Crane Clean Energy Center (Three Mile Island Unit 1 restart) | Constellation Energy Generation, LLC / Constellation | Londonderry Township | PA | United States | planned | 835 MW; nuclear | 40.1439488, -76.7235993 | campus | [Constellation](https://www.constellationenergy.com/news/2024/Constellation-to-Launch-Crane-Clean-Energy-Center-Restoring-Jobs-and-Carbon-Free-Power-to-The-Grid.html); [U.S. NRC / Federal Register republication](https://thefederalregister.org/documents/2026-11377/constellation-energy-generation-llc-christopher-m-crane-clean-energy-center-draft-environmental-assessment-and-draft-fin) | Nominatim returned the Three Mile Island generating-station complex (helipad/Unit 2 airport feature) in Londonderry Township. Not a Unit 1 building footprint. Review: 2024 PR online date 2028 vs later press about possibl |
| `fermi-matador-gas-generation` | Fermi America Project Matador Gas Power Plant | Fermi Equipment Holdco, LLC (Fermi America) per TCEQ narrative | null | TX | United States | planned | 6000 MW; natural gas combined cycle | null | null | [Texas Commission on Environmental Quality](https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398) | Carson County greenfield; no lat/lon in the TCEQ extract. Review: No coordinates.; Whether any turbines are already on site is not in the extract. |
| `kairos-hermes-2-oak-ridge` | Kairos Power Hermes 2 Demonstration Plant | Kairos Power | Oak Ridge | TN | United States | under_construction | 50 MW; advanced nuclear (KP-FHR / fluoride salt-cooled high-temperature reactor) | 35.9352633, -84.3923554 | campus | [Kairos Power](https://www.kairospower.com/locations/tennessee); [Kairos Power](https://www.kairospower.com/updates/kairos-power-breaks-ground-on-hermes-2-demonstration-plant); [Kairos Power](https://www.kairospower.com/updates/google-kairos-power-tva-collaborate-to-meet-americas-growing-energy-needs) | Kairos: Heritage Center / former K-33 at East Tennessee Technology Park. Nominatim pin is the ETTP brownfield relation, not the Hermes 2 building. Review: ETTP centroid vs reactor building.; Hermes 1 vs Hermes 2 footprin |
| `susquehanna-steam-electric-station` | Susquehanna Steam Electric Station | Talen Energy (90% interest per Talen page) / Talen Energy | Salem Township | PA | United States | operational | 2500 MW; nuclear | 41.0922705, -76.1479523 | campus | [Talen Energy](https://www.talenenergy.com/powering-data/); [Talen Energy](https://ir.talenenergy.com/news-releases/news-release-details/talen-energy-announces-sale-zero-carbon-data-center-campus/) | Nominatim named industrial feature 'Susquehanna Steam Electric Station', Salem Township, Luzerne County. Matches Talen CNO bio location text. Review: Behind-the-meter MW currently delivered to AWS vs 960 MW envelope is n |
| `xai-colossus-onsite-gas-turbines` | xAI Colossus On-site Gas Turbines (Memphis) | null | Memphis | TN | United States | null | natural gas turbines (on-site) | null | null | [Commercial Appeal](https://www.commercialappeal.com/story/money/business/2025/02/13/xai-gas-turbines-at-memphis-supercomputer/78540969007/) | US Colossus 1 research geocoded 3231 Paul R. Lowry Road for the data center. These turbines are described as on that site; a separate turbine coordinate was not published in the press cited. Do not invent a second pin. R |

**Expanded facility notes**

- **`crane-clean-energy-center` — Crane Clean Energy Center (Three Mile Island Unit 1 restart)** Compute link: Constellation's 20-year PPA with Microsoft is explicitly to purchase energy from the restarted plant to help match Microsoft data-center load in PJM. NRC draft EA (Federal Register summary) also cites that PPA as CEG's stated need. This is a plant-specific restart tied to data-center demand, not a generic nearby generator. It is not behind-the-meter to a single mapped Microsoft campus in this dataset. Coordinates: Nominatim returned the Three Mile Island generating-station complex (helipad/Unit 2 airport feature) in Londonderry Township. Not a Unit 1 building footprint. Ambiguities: 2024 PR online date 2028 vs later press about possible 2027 restart — not reconciled from Constellation's 2024 PR alone.; Not tied to one mapped Microsoft campus.
- **`fermi-matador-gas-generation` — Fermi America Project Matador Gas Power Plant** Compute link: TCEQ narrative: the plant will provide electricity solely to an on-site hyperscale data-center campus designed for next-generation data and AI infrastructure and will not sell power to the local utility grid. Coordinates: Carson County greenfield; no lat/lon in the TCEQ extract. Ambiguities: No coordinates.; Whether any turbines are already on site is not in the extract.
- **`kairos-hermes-2-oak-ridge` — Kairos Power Hermes 2 Demonstration Plant** Compute link: Kairos and Google: Hermes 2 is the first deployment under the Google multi-plant advanced-reactor agreement. A Kairos–TVA PPA will deliver up to 50 MW to the TVA grid that powers Google data centers in Tennessee and Alabama. Grid-mediated, not a behind-the-meter pin on a specific Google campus in this dataset. Coordinates: Kairos: Heritage Center / former K-33 at East Tennessee Technology Park. Nominatim pin is the ETTP brownfield relation, not the Hermes 2 building. Ambiguities: ETTP centroid vs reactor building.; Hermes 1 vs Hermes 2 footprints.; Groundbreaking PR date not parsed as ISO in the fetch.
- **`susquehanna-steam-electric-station` — Susquehanna Steam Electric Station** Compute link: Talen states it developed a co-located data-center campus powered by Susquehanna and in March 2024 sold that campus to AWS, with behind-the-meter and later grid supply for AWS AI/cloud operations. The plant is mapped as power infrastructure distinct from the AWS data-center campus. Coordinates: Nominatim named industrial feature 'Susquehanna Steam Electric Station', Salem Township, Luzerne County. Matches Talen CNO bio location text. Ambiguities: Behind-the-meter MW currently delivered to AWS vs 960 MW envelope is not broken out on the pages fetched.
- **`xai-colossus-onsite-gas-turbines` — xAI Colossus On-site Gas Turbines (Memphis)** Compute link: Commercial Appeal (15 Feb 2025) reports an air-permit application to operate 15 natural-gas turbines at the Memphis supercomputer / Colossus site, described as powering the facility. This is on-site generation for a mapped GPU cluster, not a generic nearby plant. Primary permit PDF was not fetched in this pass. Coordinates: US Colossus 1 research geocoded 3231 Paul R. Lowry Road for the data center. These turbines are described as on that site; a separate turbine coordinate was not published in the press cited. Do not invent a second pin. Ambiguities: No primary permit PDF in this pass.; Turbine MW not in the article extract used.; Whether to pin turbines separately from Colossus 1 or treat as campus equipment.

## 4. Facility Evidence Records

One evidence block per facility. Sources are listed with the **only** claims they support. Fields not mentioned by a source remain `null` and are not implied.

### 4.1 Data Center

#### nextdc-s3-sydney

- **Stable research ID:** `nextdc-s3-sydney`
- **Canonical name:** NEXTDC S3 Sydney
- **Aliases:** S3 Artarmon
- **Category:** data_center
- **Owner/operator:** owner=NEXTDC; operator=NEXTDC
- **Location:** Artarmon, NSW, Australia
- **Coordinates:** -33.8191935, 151.1845025
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Official page names Artarmon but no street. Pin is OSM named feature 'NextDC' in Artarmon.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Marketed for high-density compute; no named GPU cluster on the page.
- **Facility facts:** facility_MW=null; IT_MW=80; buildings=null; sqft=null; campus=More than 20,000 m² technical space; interconnected with S1/S2 Macquarie Park.
- **Power facts:** MW=80 MW IT capacity per NEXTDC S3 page.; source=null; utility=null
- **Related facility IDs:** null
- **Relationship notes:** S1/S2/S4 are separate NEXTDC Sydney sites and are not ingested as a portfolio dump.
- **Unresolved questions:** No street on the official page., AI-specific tenancy not named.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.nextdc.com/data-centres/sydney-data-centres/s3-sydney
- **Facility webpage:** https://www.nextdc.com/data-centres/sydney-data-centres/s3-sydney
- **Public contact email:** null
- **Missing important fields:** street_address

**Sources (do not impute unlisted claims):**

- **NEXTDC** — S3 Sydney Data Centre
  - URL: https://www.nextdc.com/data-centres/sydney-data-centres/s3-sydney
  - Organization: NEXTDC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Artarmon; 80 MW IT capacity; 20,000 m² technical space; high-density compute; Tier IV; connectivity to Azure/AWS/Google Cloud

#### csc-kajaani-lumi-host

- **Stable research ID:** `csc-kajaani-lumi-host`
- **Canonical name:** CSC Kajaani Data Center (LUMI host)
- **Aliases:** CSC Datacenter Kajaani, Renforsin Ranta
- **Category:** data_center
- **Owner/operator:** owner=CSC – IT Center for Science; operator=CSC
- **Location:** Tehdaskatu 15, Kajaani, Kainuu, Finland
- **Coordinates:** 64.2319866, 27.691477
- **Coordinate precision:** building (documented_address_geocode)
- **Coordinate notes:** Nominatim returned the named CSC industrial feature at Tehdaskatu 15.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Renforsin Ranta business area.
- **Related facility IDs:** lumi-supercomputer
- **Relationship notes:** Host data center for the LUMI GPU supercomputer. Shared coordinates are expected; not a duplicate entity.
- **Unresolved questions:** null
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://research.csc.fi/topic/lumi-supercomputer/
- **Facility webpage:** https://research.csc.fi/topic/lumi-supercomputer/
- **Public contact email:** servicedesk@csc.fi
- **Missing important fields:** null

**Sources (do not impute unlisted claims):**

- **CSC** — LUMI Supercomputer contact / datacenter listing
  - URL: https://research.csc.fi/topic/lumi-supercomputer/
  - Organization: CSC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Datacenter Kajaani; Renforsin Ranta business area; Tehdaskatu 15, 87100 Kajaani
- **LUMI / EuroHPC consortium** — How did LUMI end up in Finland?
  - URL: https://lumi-supercomputer.eu/how-did-lumi-end-up-in-finland/
  - Organization: LUMI / EuroHPC consortium
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: LUMI at CSC data center in Kajaani

#### google-hamina

- **Stable research ID:** `google-hamina`
- **Canonical name:** Google Hamina Data Center
- **Aliases:** Hamina data centre, Summa mill campus
- **Category:** data_center
- **Owner/operator:** owner=Google; operator=Google
- **Location:** Hamina, Finland
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Google page: purchased Summa paper mill in 2009. A 'Summa paper mill' Nominatim query did not return a usable industrial pin (snapped to an unrelated business).
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=2024 Google announcement of a seventh data centre in Hamina and €1B Finland investment toward sustainability and AI goals. The page does not name a GPU cluster.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=€3.5B invested in the region to date per Google.
- **Related facility IDs:** null
- **Relationship notes:** Offsite heat-recovery partnership with Haminan Energia is thermal reuse, not a mapped power-generation asset.
- **Unresolved questions:** No geocodable street on the Google page., AI-goal investment is not a documented GPU SKU at this campus.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.google/locations/hamina-finland
- **Facility webpage:** https://datacenters.google/locations/hamina-finland
- **Public contact email:** googlehaminadc@google.com
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **Google** — Hamina, Finland data center location
  - URL: https://datacenters.google/locations/hamina-finland
  - Organization: Google
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Hamina Finland data centre; Summa paper mill purchased 2009; first data centre opened 2011; seventh data centre construction announced 2024; €1B Finland investment toward sustainability and AI goals 2024; €3.5B invested to date; contact googlehaminadc@google.com

#### fzj-jupiter-host

- **Stable research ID:** `fzj-jupiter-host`
- **Canonical name:** Forschungszentrum Jülich (JUPITER host campus)
- **Aliases:** FZJ, Jülich Supercomputing Centre campus
- **Category:** data_center
- **Owner/operator:** owner=Forschungszentrum Jülich GmbH; operator=Jülich Supercomputing Centre
- **Location:** Wilhelm-Johnen-Straße, Jülich, North Rhine-Westphalia, Germany
- **Coordinates:** 50.9000601, 6.3931009
- **Coordinate precision:** street (documented_address_geocode)
- **Coordinate notes:** Official FZJ address on the JUPITER page. Nominatim geocoded the street in Jülich, not the Modular Data Centre building.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=JUPITER page describes a Modular Data Centre (MDC) on campus.
- **Related facility IDs:** jupiter-supercomputer
- **Relationship notes:** Host campus for JUPITER. Shared campus coordinates with the cluster record are expected.
- **Unresolved questions:** Street vs MDC building.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.fz-juelich.de/en/jsc/jupiter
- **Facility webpage:** https://www.fz-juelich.de/en/jsc/jupiter
- **Public contact email:** jupiter@fz-juelich.de
- **Missing important fields:** null

**Sources (do not impute unlisted claims):**

- **Forschungszentrum Jülich** — JUPITER — Exascale for Europe
  - URL: https://www.fz-juelich.de/en/jsc/jupiter
  - Organization: Forschungszentrum Jülich
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: JUPITER at Forschungszentrum Jülich; Wilhelm-Johnen-Straße 52428 Jülich; contact jupiter@fz-juelich.de; Modular Data Centre mentioned

#### google-inzai

- **Stable research ID:** `google-inzai`
- **Canonical name:** Google Inzai Data Center
- **Aliases:** Google Chiba data center
- **Category:** data_center
- **Owner/operator:** owner=Google; operator=Google
- **Location:** Inzai, Chiba, Japan
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=2023-03-01
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** No street/coordinates., Page does not document AI training hardware.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.google.com/about/datacenters/locations/inzai-japan/
- **Facility webpage:** https://www.google.com/about/datacenters/locations/inzai-japan/
- **Public contact email:** inzai@google.com
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **Google** — Inzai, Japan data center location
  - URL: https://www.google.com/about/datacenters/locations/inzai-japan/
  - Organization: Google
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Inzai Chiba Prefecture data center; opened March 2023; contact inzai@google.com

#### naver-gak-sejong

- **Stable research ID:** `naver-gak-sejong`
- **Canonical name:** NAVER GAK Sejong
- **Aliases:** Data Center GAK Sejong
- **Category:** data_center
- **Owner/operator:** owner=NAVER; operator=NAVER
- **Location:** Sejong, South Korea
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** A third-party search snippet listed 824 Haengbok-daero; that street was not present in the fetched NAVER page body, so it is not stored.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=NAVER page: GAK Sejong integrates 5G, Cloud, and AI. No GPU SKU or MW.
- **Related facility IDs:** null
- **Relationship notes:** GAK Chuncheon is a separate NAVER campus and is not mapped in this pass.
- **Unresolved questions:** No street/coordinates on the fetched page., AI mention is not a documented training cluster.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://navercorp.com/en/service/datacenterGak
- **Facility webpage:** https://navercorp.com/en/service/datacenterGak
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **NAVER** — Data Center GAK
  - URL: https://navercorp.com/en/service/datacenterGak
  - Organization: NAVER
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: GAK Sejong is NAVER's second data center; integrates 5G, Cloud, and AI; GAK Chuncheon is a distinct first campus

#### microsoft-sweden-gavle

- **Stable research ID:** `microsoft-sweden-gavle`
- **Canonical name:** Microsoft Gävle Datacenter
- **Aliases:** Sweden Central Gävle
- **Category:** data_center
- **Owner/operator:** owner=Microsoft; operator=Microsoft
- **Location:** Gävle, Sweden
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=2021-11-16
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Microsoft 2021-11-16: Sweden region with presence in Gävle, Sandviken and Staffanstorp. Only Gävle is given its own row here; the other two cities are related, not duplicates of this pin.
- **Related facility IDs:** microsoft-sweden-staffanstorp
- **Relationship notes:** Same Azure region; distinct named cities.
- **Unresolved questions:** City named, no street., 2021 region launch is not an AI-campus label.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://news.microsoft.com/europe/2021/11/16/microsoft-opens-its-sustainable-datacenter-region-in-sweden-creating-new-opportunities-for-a-cloud-first-sweden/
- **Facility webpage:** https://news.microsoft.com/europe/2021/11/16/microsoft-opens-its-sustainable-datacenter-region-in-sweden-creating-new-opportunities-for-a-cloud-first-sweden/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **Microsoft** — Microsoft opens its sustainable datacenter region in Sweden
  - URL: https://news.microsoft.com/europe/2021/11/16/microsoft-opens-its-sustainable-datacenter-region-in-sweden-creating-new-opportunities-for-a-cloud-first-sweden/
  - Organization: Microsoft
  - Source type: company_press_release
  - Publication/document date: 2021-11-16
  - Claims supported by **this** source only: datacenter region in Sweden open; presence in Gävle, Sandviken and Staffanstorp; Azure and Microsoft 365 available

#### microsoft-sweden-staffanstorp

- **Stable research ID:** `microsoft-sweden-staffanstorp`
- **Canonical name:** Microsoft Staffanstorp Datacenter
- **Aliases:** Sweden Central Staffanstorp
- **Category:** data_center
- **Owner/operator:** owner=Microsoft; operator=Microsoft
- **Location:** Staffanstorp, Skåne, Sweden
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Microsoft Sweden 2022-08-26: continues to operate Staffanstorp but withdrew a 70 MW backup-generation permit and will not expand that site to the previously planned capacity.
- **Power facts:** MW=Withdrawn permit was for 70 MW supplied backup generation — that number is the permit, not demonstrated IT load.; source=null; utility=null
- **Related facility IDs:** microsoft-sweden-gavle
- **Relationship notes:** Same Sweden region as Gävle; distinct city.
- **Unresolved questions:** No street/coordinates., Not documented as an AI training campus.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://news.microsoft.com/sv-se/2022/08/26/uppdatering-rorande-microsofts-datacenter-i-staffanstorp/
- **Facility webpage:** https://news.microsoft.com/sv-se/2022/08/26/uppdatering-rorande-microsofts-datacenter-i-staffanstorp/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **Microsoft Sverige** — Uppdatering rörande Microsofts datacenter i Staffanstorp
  - URL: https://news.microsoft.com/sv-se/2022/08/26/uppdatering-rorande-microsofts-datacenter-i-staffanstorp/
  - Organization: Microsoft Sverige
  - Source type: company_press_release
  - Publication/document date: 2022-08-26
  - Claims supported by **this** source only: Staffanstorp datacenter continues to operate; backup-generation permit withdrawn; planned 70 MW supplied capacity not sufficient for future expansion; search for a new site in southern Sweden

#### uae-us-ai-campus-abu-dhabi

- **Stable research ID:** `uae-us-ai-campus-abu-dhabi`
- **Canonical name:** UAE–US AI Campus (Abu Dhabi)
- **Aliases:** 5GW UAE-US AI Campus, Khazna Stargate host campus
- **Category:** data_center
- **Owner/operator:** owner=G42 / Khazna Data Centers (developer of Stargate UAE per G42 PR); operator=Khazna Data Centers
- **Location:** Abu Dhabi, Abu Dhabi, United Arab Emirates
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** G42 PR locates the campus in Abu Dhabi and describes a 5GW UAE–U.S. AI Campus. No street. WAM government story fetch returned a JavaScript shell.
- **Lifecycle status:** under_construction; announced=2025-05-22; construction_start=null; operational_date=null
- **Facility facts:** facility_MW=5000; IT_MW=null; buildings=null; sqft=null; campus=WAM search extract (full page not retrieved): spanning 10 square miles / 5 GW. That area claim is not in the G42 PR Newswire text fetched.
- **Power facts:** MW=Campus-scale 5 GW figure is from the G42 PR framing ('5GW UAE–U.S. AI Campus').; source=null; utility=null
- **Related facility IDs:** stargate-uae-cluster
- **Relationship notes:** Host campus for the Stargate UAE 1GW cluster. One campus, two entities.
- **Unresolved questions:** No coordinates., 5 GW is a campus plan, not live IT load., WAM launch article not independently parsed.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html
- **Facility webpage:** https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html
- **Public contact email:** null
- **Missing important fields:** latitude, longitude, street_address

**Sources (do not impute unlisted claims):**

- **G42** — G42 Provides Update on Construction of Stargate UAE AI Infrastructure Cluster
  - URL: https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html
  - Organization: G42
  - Source type: company_press_release
  - Publication/document date: 2025-10-16
  - Claims supported by **this** source only: Stargate UAE developed by Khazna Data Centers, a G42 company; within the 5GW UAE–U.S. AI Campus in Abu Dhabi; construction underway toward planned 2026 delivery of first 200 MW of a 1 GW cluster

#### aws-cumulus-susquehanna

- **Stable research ID:** `aws-cumulus-susquehanna`
- **Canonical name:** AWS Cumulus Data Center Campus (Susquehanna)
- **Aliases:** Cumulus Data campus, AWS campus adjacent to Susquehanna
- **Category:** data_center
- **Owner/operator:** owner=Amazon Data Services / AWS; operator=AWS
- **Location:** Salem Township, PA, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Talen states the AWS campus is adjacent to Susquehanna. Plant coordinates are recorded on the distinct power record and are not reused as the data-center pin.
- **Lifecycle status:** expansion; announced=2024-03-04; construction_start=null; operational_date=null
- **Facility facts:** facility_MW=960; IT_MW=null; buildings=null; sqft=null; campus=Talen 2024 sale statement described a 960 MW campus. Talen later said the relationship expanded in June 2025 to include grid delivery in Pennsylvania.
- **Power facts:** MW=960 MW development envelope per Talen sale disclosure.; source=Susquehanna nuclear (behind-the-meter and later also grid); utility=Talen / PJM
- **Related facility IDs:** susquehanna-steam-electric-station
- **Relationship notes:** Data-center campus sold by Talen to AWS; physically adjacent to and contractually powered by Susquehanna. Distinct from the nuclear plant record.
- **Unresolved questions:** No public street address for the AWS campus footprint., Operational occupancy vs shell/powered-land status as of 2026-09-17 is not stated on the Talen pages fetched.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.talenenergy.com/powering-data/
- **Facility webpage:** https://ir.talenenergy.com/news-releases/news-release-details/talen-energy-announces-sale-zero-carbon-data-center-campus/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, operational_date

**Sources (do not impute unlisted claims):**

- **Talen Energy** — Talen Energy Announces Sale of Zero-Carbon Data Center Campus
  - URL: https://ir.talenenergy.com/news-releases/news-release-details/talen-energy-announces-sale-zero-carbon-data-center-campus/
  - Organization: Talen Energy
  - Source type: company_press_release
  - Publication/document date: 2024-03-04
  - Claims supported by **this** source only: sale of 960 MW Cumulus data center campus in northeast Pennsylvania; value through sale of power from Susquehanna nuclear plant
- **Talen Energy** — Powering Data
  - URL: https://www.talenenergy.com/powering-data/
  - Organization: Talen Energy
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: AWS data center campus adjacent to Susquehanna; March 2024 transaction; June 2025 expansion to grid supply in Pennsylvania for AI/cloud operations; behind-the-meter and front-of-the-meter arrangements

#### aws-morrow-county

- **Stable research ID:** `aws-morrow-county`
- **Canonical name:** AWS Morrow County / Eastern Oregon Campus Cluster
- **Aliases:** AWS US West (Oregon) Morrow County cluster
- **Category:** data_center
- **Owner/operator:** owner=Amazon Web Services; operator=Amazon Web Services
- **Location:** Boardman, OR, United States
- **Coordinates:** null
- **Coordinate precision:** city (null)
- **Coordinate notes:** Amazon official fact sheets locate US West (Oregon) data centers in Morrow and Umatilla counties. No single named building/campus address from Amazon was used. City Boardman is the Morrow County community commonly associated with the cluster, not a geocoded campus centroid. ingest_ready false because this is a multi-building county cluster without a primary-source street.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=2011-11
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Amazon documents large Eastern Oregon data-center investment; AI-specific GPU inventory is not disclosed. Included because the user named Morrow County as an identifiable AWS physical footprint — recorded as a county cluster, not every PDX building.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=US West (Oregon) Region launched November 2011 with clusters in Morrow and Umatilla counties (Amazon EIS fact sheet).
- **Power facts:** MW=null; source=null; utility=Umatilla Electric Cooperative
- **Related facility IDs:** null
- **Relationship notes:** Do not explode into individual Boardman buildings without Amazon-named campuses.
- **Unresolved questions:** Which Boardman/Morrow buildings are AI vs general cloud is not disclosed., Umatilla County cluster not separately listed to avoid double-counting the same region.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://sustainability.aboutamazon.com/aws-sustainability-fact-sheets/aws-fact-sheet-oregon.pdf
- **Facility webpage:** https://assets.aboutamazon.com/fc/65/e3944125451698e1de8d734e2ac7/easternoregon-eis-factsheet-2022.pdf
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, named campus identity, facility_capacity_mw

**Sources (do not impute unlisted claims):**

- **Amazon** — AWS Eastern Oregon EIS factsheet
  - URL: https://assets.aboutamazon.com/fc/65/e3944125451698e1de8d734e2ac7/easternoregon-eis-factsheet-2022.pdf
  - Organization: Amazon
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: US West Oregon Region Nov 2011; Morrow and Umatilla counties
- **Amazon** — Oregon sustainability fact sheet
  - URL: https://sustainability.aboutamazon.com/aws-sustainability-fact-sheets/aws-fact-sheet-oregon.pdf
  - Organization: Amazon
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: UEC serves AWS in Umatilla and Morrow counties

#### aws-new-carlisle

- **Stable research ID:** `aws-new-carlisle`
- **Canonical name:** AWS New Carlisle / St. Joseph County Campus
- **Aliases:** AWS Indiana Enterprise Center campus, AWS St. Joseph County
- **Category:** data_center
- **Owner/operator:** owner=Amazon Web Services; operator=Amazon Web Services
- **Location:** New Carlisle, IN, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Amazon and Indiana officials locate the campus in the Indiana Enterprise Center, New Carlisle, St. Joseph County. No AWS-published building address. Directory addresses (e.g. Edison Road) were not used.
- **Lifecycle status:** under_construction; announced=2024-04-25; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Indiana/IEDC: servers and infrastructure 'used to power cloud computing capabilities and generative artificial intelligence technologies.' No GPU SKU or count.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Planned $11 billion investment; at least 1,000 jobs; built over the next decade in the Indiana Enterprise Center.
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** No building-level address from AWS., Construction underway reported by local business press; AWS page does not state a construction-start date.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.aboutamazon.com/news/aws/aws-indiana-investment-11-billion
- **Facility webpage:** https://www.aboutamazon.com/news/aws/aws-indiana-investment-11-billion
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw, operational_date

**Sources (do not impute unlisted claims):**

- **Amazon** — AWS plans $11 billion Indiana investment
  - URL: https://www.aboutamazon.com/news/aws/aws-indiana-investment-11-billion
  - Organization: Amazon
  - Source type: company_press_release
  - Publication/document date: null
  - Claims supported by **this** source only: $11B; St. Joseph County; New Carlisle named by Governor quote; IEC campus
- **State of Indiana / IEDC** — Gov. Holcomb announces Amazon Web Services plans to invest $11B
  - URL: https://events.in.gov/event/gov-holcomb-announces-amazon-web-services-plans-to-invest-11b-to-create-a-new-data-center-campus-in-northern-indiana
  - Organization: State of Indiana / IEDC
  - Source type: economic_development
  - Publication/document date: 2024-04-25
  - Claims supported by **this** source only: announced_date; New Carlisle; 1,000 jobs
- **Indiana Economic Development Corporation** — GlobeNewswire reprint of IEDC announcement
  - URL: https://www.globenewswire.com/news-release/2024/04/25/2869483/0/en/Gov-Holcomb-announces-Amazon-Web-Services-plans-to-invest-11B-to-create-a-new-data-center-campus-in-Northern-Indiana.html
  - Organization: Indiana Economic Development Corporation
  - Source type: economic_development
  - Publication/document date: 2024-04-25
  - Claims supported by **this** source only: announced_date

#### aligned-dfw-04-plano

- **Stable research ID:** `aligned-dfw-04-plano`
- **Canonical name:** Aligned DFW-04 Plano
- **Aliases:** Aligned Dallas-Fort Worth DFW-04
- **Category:** data_center
- **Owner/operator:** owner=Aligned Data Centers; operator=Aligned Data Centers
- **Location:** 601 N. Star Road, Plano, TX, United States
- **Coordinates:** 33.0054184, -96.6535522
- **Coordinate precision:** street (documented_address_geocode)
- **Coordinate notes:** Aligned PR: DFW-04 under construction in Plano. Dallas Morning News (2025-05-07): 601 N. Star Road, ~425,000 sq ft, construction began 2024, finish expected 2026, ~$700M. Nominatim snapped to North Star Road (highway), not a building.
- **Lifecycle status:** under_construction; announced=2025-05-07; construction_start=2024; operational_date=null
- **Compute facts:** vendor=NVIDIA; models=Blackwell, Blackwell Ultra; accelerator_count=null; note=Aligned: liquid-cooled for highest-density GPUs; designed to support NVIDIA Blackwell and Blackwell Ultra for Lambda's AI cloud. Hardware not claimed as installed in the May 2025 PR.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=1; sqft=425000; campus=Dallas Morning News: 425,000 sq ft.
- **Related facility IDs:** lambda-dfw-04
- **Relationship notes:** Landlord campus; Lambda is the named occupant.
- **Unresolved questions:** Street is from Dallas Morning News, not Aligned's PR body., Geocode is street-level, not building., 2026 finish is a newspaper expected date.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/
- **Facility webpage:** https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/
- **Public contact email:** null
- **Missing important fields:** facility_capacity_mw, operational_date

**Sources (do not impute unlisted claims):**

- **Aligned Data Centers** — Aligned and Lambda Partner to Power Next-Generation AI Infrastructure
  - URL: https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/
  - Organization: Aligned Data Centers
  - Source type: company_press_release
  - Publication/document date: 2025-05-07
  - Claims supported by **this** source only: DFW-04 Plano; Lambda occupant; liquid cooling; Blackwell / Blackwell Ultra; under construction
- **Dallas Morning News** — Nvidia-backed AI computing firm has plans for $700M Plano data center
  - URL: https://www.dallasnews.com/business/real-estate/2025/05/07/nvidia-backed-ai-computing-firm-has-plans-for-700-m-plano-data-center/
  - Organization: Dallas Morning News
  - Source type: financial_press
  - Publication/document date: 2025-05-07
  - Claims supported by **this** source only: 601 N. Star Road; 425,000 sq ft; construction 2024; finish 2026

#### applied-digital-polaris-forge-1

- **Stable research ID:** `applied-digital-polaris-forge-1`
- **Canonical name:** Applied Digital Polaris Forge 1
- **Aliases:** Ellendale AI Factory, Polaris Forge 1
- **Category:** data_center
- **Owner/operator:** owner=Applied Digital; operator=Applied Digital
- **Location:** 9663 87th Ave SE, Ellendale, ND, United States
- **Coordinates:** 46.0214191, -98.5685326
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** North Dakota DEQ air permit names ELN Generation at 9663 87th Ave. SE, Ellendale, ND 58436. Nominatim house match is stronger at 9685 87th Ave SE (adjacent; local TV also used 9685). Coords taken from the 9685 house geocode as campus-level on the same road; do not treat as a surveyed building footprint.
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=2025-10-27
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Fully leased AI Factory campus; CoreWeave is the named hyperscale tenant in Applied Digital's Oct/Nov 2025 PRs. GPU SKUs are CoreWeave's, not Applied Digital's.
- **Facility facts:** facility_MW=null; IT_MW=400; buildings=3; sqft=null; campus=Three contracted buildings; 400 MW critical IT load at full build-out. 175 MW live as of 2026-07-01 (100 MW Building 1 + 75 MW Building 2 Phase 1).
- **Power facts:** MW=400 MW critical IT contracted; 175 MW operational as of 2026-07-01.; source=null; utility=null
- **Related facility IDs:** coreweave-polaris-forge-1
- **Relationship notes:** Landlord campus; CoreWeave is long-term tenant of the 400 MW deployment.
- **Unresolved questions:** 9663 vs 9685 87th Ave SE (adjacent campus addressing)., Square footage not in Applied Digital IR PRs reviewed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://ir.applieddigital.com/news-events/press-releases/detail/157/applied-digital-delivers-second-building-at-polaris-forge-1
- **Facility webpage:** https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at
- **Public contact email:** null
- **Missing important fields:** square_footage, utility, gpu_vendor at landlord layer

**Sources (do not impute unlisted claims):**

- **Applied Digital** — Applied Digital Delivers Second Building at Polaris Forge 1
  - URL: https://ir.applieddigital.com/news-events/press-releases/detail/157/applied-digital-delivers-second-building-at-polaris-forge-1
  - Organization: Applied Digital
  - Source type: company_press_release
  - Publication/document date: 2026-07-01
  - Claims supported by **this** source only: Ellendale; 175 MW live; 400 MW critical IT; Building 2 Phase 1 75 MW
- **Applied Digital** — Ready for Service Phase 1 Building 1 for CoreWeave
  - URL: https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at
  - Organization: Applied Digital
  - Source type: company_press_release
  - Publication/document date: 2025-10-27
  - Claims supported by **this** source only: CoreWeave tenant; 50 MW phase 1; 400 MW / ~15-year leases
- **Applied Digital** — Completes Phase II RFS, first 100 MW building
  - URL: https://ir.applieddigital.com/news-events/press-releases/detail/137/applied-digital-completes-phase-ii-ready-for-service-at
  - Organization: Applied Digital
  - Source type: company_press_release
  - Publication/document date: 2025-11-24
  - Claims supported by **this** source only: Building 1 100 MW; CoreWeave 400 MW
- **North Dakota DEQ** — Air Pollution Control Permit to Construct — ELN Generation Plant
  - URL: https://deq.nd.gov/aq/Notices/AppliedDigital/DRAFT_ACP18338v1_0.pdf
  - Organization: North Dakota DEQ
  - Source type: permit
  - Publication/document date: null
  - Claims supported by **this** source only: 9663 87th Ave SE Ellendale

#### coreweave-lancaster-pa

- **Stable research ID:** `coreweave-lancaster-pa`
- **Canonical name:** CoreWeave Lancaster Pennsylvania Data Center
- **Aliases:** null
- **Category:** data_center
- **Owner/operator:** owner=null; operator=CoreWeave
- **Location:** Lancaster, PA, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** CoreWeave official PR: Lancaster, Pennsylvania; CoreWeave is tenant; co-developed by Chirisa Technology Parks and Machine Investment Group. Industry press cited 216 Greenfield Road and 1375 Harrisburg Pike — those are ~3 miles apart in Nominatim, so neither street is used.
- **Lifecycle status:** announced; announced=2025-07-15; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Purpose-built for AI. Initial 100 MW with potential to expand to 300 MW. GPU SKU not stated.
- **Facility facts:** facility_MW=100; IT_MW=100; buildings=null; sqft=null; campus=Potential expansion to 300 MW. CoreWeave: ~600 construction jobs; ~70 FT roles at launch scaling to ~175.
- **Power facts:** MW=Initial 100 MW; potential 300 MW (CoreWeave).; source=null; utility=null
- **Related facility IDs:** null
- **Relationship notes:** CoreWeave tenant; Chirisa Technology Parks and Machine Investment Group co-developers.
- **Unresolved questions:** Conflicting unofficial streets; omitted., Whether construction had started by 2026-09-17 not stated in the July 2025 PR., Owner of the real estate SPV not named as CoreWeave.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://coreweave.com/news/coreweave-announces-multi-billion-dollar-commitment-to-ai-infrastructure-in-pennsylvania
- **Facility webpage:** https://investors.coreweave.com/news/news-details/2025/CoreWeave-Announces-Multi-Billion-Dollar-Commitment-to-AI-Infrastructure-in-Pennsylvania/default.aspx
- **Public contact email:** press@coreweave.com
- **Missing important fields:** street_address, latitude, longitude, owner, gpu_vendor

**Sources (do not impute unlisted claims):**

- **CoreWeave** — CoreWeave Announces Multi-Billion Dollar Commitment to AI Infrastructure in Pennsylvania
  - URL: https://coreweave.com/news/coreweave-announces-multi-billion-dollar-commitment-to-ai-infrastructure-in-pennsylvania
  - Organization: CoreWeave
  - Source type: company_press_release
  - Publication/document date: 2025-07-15
  - Claims supported by **this** source only: Lancaster PA; >$6B to equip; 100 MW initial; 300 MW potential; tenant; Chirisa/MIG

#### coreweave-plano-coit

- **Stable research ID:** `coreweave-plano-coit`
- **Canonical name:** CoreWeave Plano (1000 Coit Road)
- **Aliases:** CoreWeave Texas data center
- **Category:** data_center
- **Owner/operator:** owner=null; operator=CoreWeave
- **Location:** 1000 Coit Road, Plano, TX, United States
- **Coordinates:** 33.0117077, -96.7665775
- **Coordinate precision:** building (documented_address_geocode)
- **Coordinate notes:** City of Plano economic-development incentive agreement: CoreWeave to occupy at least 454,421 sq ft at 1000 Coit Road, Plano, TX 75075 as a data center. Nominatim house match. Building owner not stated in the agreement excerpt reviewed.
- **Lifecycle status:** operational; announced=2023-07-25; construction_start=null; operational_date=2023-12-31
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=CoreWeave 2023 PR: first Texas facility, ~450,000 sq ft, fully operational by 2023-12-31, for AI/ML and related GPU workloads. GPU SKU/count not in that PR.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=1; sqft=454421; campus=City agreement: occupy at least 454,421 sq ft; ≥$1B business personal property.
- **Related facility IDs:** null
- **Relationship notes:** Distinct from Aligned DFW-04 / Lambda in Plano.
- **Unresolved questions:** Building owner vs CoreWeave as tenant not stated., Current GPU generation at this site not disclosed., 2023 operational-by date is a target in the opening PR; later confirmation of exact go-live not re-fetched.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.prnewswire.com/news-releases/coreweave-opens-new-texas-data-center-to-expand-access-to-high-performance-gpus-301884897.html
- **Facility webpage:** https://plano.novusagenda.com/Agendapublic/AttachmentViewer.ashx?AttachmentID=20088&ItemID=10008
- **Public contact email:** press@coreweave.com
- **Missing important fields:** owner, facility_capacity_mw, gpu_models, accelerator_count

**Sources (do not impute unlisted claims):**

- **CoreWeave** — CoreWeave Opens New Texas Data Center
  - URL: https://www.prnewswire.com/news-releases/coreweave-opens-new-texas-data-center-to-expand-access-to-high-performance-gpus-301884897.html
  - Organization: CoreWeave
  - Source type: company_press_release
  - Publication/document date: 2023-07-25
  - Claims supported by **this** source only: Plano; ~450,000 sq ft; operational by 2023-12-31; GPU-accelerated workloads
- **City of Plano** — Second Revised and Restated Economic Development Incentive Agreement
  - URL: https://plano.novusagenda.com/Agendapublic/AttachmentViewer.ashx?AttachmentID=20088&ItemID=10008
  - Organization: City of Plano
  - Source type: economic_development
  - Publication/document date: null
  - Claims supported by **this** source only: 1000 Coit Road; 454,421 sq ft; use as data center

#### crusoe-abilene-stargate-campus

- **Stable research ID:** `crusoe-abilene-stargate-campus`
- **Canonical name:** Crusoe / Lancium Abilene Stargate Campus
- **Aliases:** Stargate Abilene, Lancium Clean Campus, Stargate One, Abilene Data Center Campus
- **Category:** data_center
- **Owner/operator:** owner=Lancium; operator=Crusoe
- **Location:** Abilene, TX, United States
- **Coordinates:** 32.508056, -99.777222
- **Coordinate precision:** campus (official_record)
- **Coordinate notes:** TCEQ federal operating permit for 'Abilene Data Center Campus Master Association', Taylor County, latitude 32°30′29″N longitude 99°46′38″W. Directory streets (5502 Spinks Rd / 251 Lancium Way) were not used. Identity match to Crusoe/OpenAI Stargate is by Taylor County/Abilene campus coincidence plus Crusoe's Abilene flagship announcement — flagged as an ambiguity.
- **Lifecycle status:** expansion; announced=null; construction_start=2024-06; operational_date=2025-09-30
- **Compute facts:** vendor=NVIDIA; models=GB200; accelerator_count=null; note=Crusoe: first two buildings energized within a year; Oracle began delivering NVIDIA GB200 racks in June 2025; early training/inference workloads. Planned eight-building campus able to support hundreds of thousands of GPUs on one fabric. KTXS (2026 local briefing): Lancium owns land/electrical development; Crusoe built the data center; Crusoe's customer is Oracle; ~4 million sq ft; construction through Q1 2027.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=8; sqft=null; campus=Crusoe: multi-building campus; planned eight buildings. Local executives described ~4 million sq ft. Do not use 1.2 GW from directories.
- **Power facts:** MW=Crusoe official live PR does not state campus MW. Local briefing said power through Lancium land development.; source=Lancium electrical infrastructure (per KTXS briefing with Lancium CEO).; utility=null
- **Related facility IDs:** openai-stargate-abilene
- **Relationship notes:** Land/energy developer: Lancium. DC design/build/operator: Crusoe. Cloud operator for OpenAI: Oracle OCI. Bloomberg (2026-03-06) reported Oracle/OpenAI scrapped a planned expansion near this flagship — not verified on company pages reviewed.
- **Unresolved questions:** TCEQ 'Abilene Data Center Campus' coords assumed to be this Stargate campus (same county/city; not named Crusoe on the permit excerpt)., No primary-source street., Campus MW (often cited as 1.2 GW in secondary databases) not in Crusoe's live PR.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live
- **Facility webpage:** https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live
- **Public contact email:** null
- **Missing important fields:** street_address, facility_capacity_mw, it_load_mw, square_footage

**Sources (do not impute unlisted claims):**

- **Crusoe** — Crusoe Announces Flagship Abilene Data Center is Live
  - URL: https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live
  - Organization: Crusoe
  - Source type: company_press_release
  - Publication/document date: 2025-09-30
  - Claims supported by **this** source only: Abilene live on OCI; construction start June 2024; first two buildings energized; GB200 racks June 2025; eight building plan
- **TCEQ** — Federal Operating Permit — Abilene Data Center Campus
  - URL: https://www.tceq.texas.gov/assets/public/permitting/air/publicnotice/37589sop.pdf
  - Organization: TCEQ
  - Source type: permit
  - Publication/document date: null
  - Claims supported by **this** source only: Taylor County coordinates
- **KTXS** — Construction on Stargate One data center campus set to run through early 2027
  - URL: https://ktxs.com/news/local/lancium-crusoe-executives-brief-abilene-leaders-on-major-northside-investment
  - Organization: KTXS
  - Source type: industry_press
  - Publication/document date: null
  - Claims supported by **this** source only: Lancium owns land; Crusoe built DC; Oracle customer; eight buildings through Q1 2027; ~4 million sq ft

#### cyrusone-dfw10-bosque

- **Stable research ID:** `cyrusone-dfw10-bosque`
- **Canonical name:** CyrusOne DFW10 (Bosque County)
- **Aliases:** CyrusOne Thad Hill / Calpine campus
- **Category:** data_center
- **Owner/operator:** owner=CyrusOne; operator=CyrusOne
- **Location:** TX, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** CyrusOne/Calpine: adjacent to Thad Hill Energy Center, Bosque County, Texas. Directory address 557 County Rd 3610 was not used.
- **Lifecycle status:** under_construction; announced=2025-07-30; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=CyrusOne COO: campus supports AI-driven demand for Intelliscale customers. Not a named GPU cluster. Hyperscale campus co-located with Calpine generation.
- **Facility facts:** facility_MW=190; IT_MW=190; buildings=null; sqft=190000; campus=First phase more than 190,000 sq ft; multiphase; $1.2B. Calpine: capable of delivering up to 400 MW to data centers in Bosque County (fleet capability, not necessarily this campus's IT load).
- **Power facts:** MW=190 MW agreement for this campus; operational expected Q4 2026 (CyrusOne/Calpine PR). Later trade coverage of a 210 MW second phase was not used (not the company PR fetched).; source=Calpine Thad Hill Energy Center / Powered Land Capabilities behind-the-meter style interconnection (company PR).; utility=Calpine / ERCOT
- **Related facility IDs:** null
- **Relationship notes:** CyrusOne flagship AI-relevant Texas campus with primary-source announcement. DFW7 Fort Worth not also listed.
- **Unresolved questions:** No city/street in the company PR., 190 MW vs Calpine 'up to 400 MW to data centers in Bosque' is a generation-platform figure, not this campus's IT load., Named hyperscale tenant not disclosed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.cyrusone.com/resources/press-releases/cyrusone-and-calpine-announce-newhyperscale-data-center-development-in-texas
- **Facility webpage:** https://www.cyrusone.com/resources/press-releases/cyrusone-and-calpine-announce-newhyperscale-data-center-development-in-texas
- **Public contact email:** null
- **Missing important fields:** city, street_address, latitude, longitude, gpu_vendor

**Sources (do not impute unlisted claims):**

- **CyrusOne / Calpine** — CyrusOne and Calpine Announce New Hyperscale Data Center Development in Texas
  - URL: https://www.cyrusone.com/resources/press-releases/cyrusone-and-calpine-announce-newhyperscale-data-center-development-in-texas
  - Organization: CyrusOne / Calpine
  - Source type: company_press_release
  - Publication/document date: 2025-07-30
  - Claims supported by **this** source only: DFW10; Bosque County; Thad Hill Energy Center; 190 MW; under construction; operational Q4 2026; 190,000+ sq ft phase 1; AI-driven demand quote

#### dataone-vineland

- **Stable research ID:** `dataone-vineland`
- **Canonical name:** DataOne Vineland AI Data Center
- **Aliases:** Nebius Vineland campus (landlord)
- **Category:** data_center
- **Owner/operator:** owner=DataOne; operator=DataOne
- **Location:** Lincoln Avenue and Sheridan Avenue, Vineland, NJ, United States
- **Coordinates:** null
- **Coordinate precision:** street (null)
- **Coordinate notes:** Vineland Planning Board minutes: southeasterly corner of Lincoln Avenue and Sheridan Avenue, Block 7503, Lots 1.01 & 35.01. Nominatim intersection search returned no point. Address recorded; coords null.
- **Lifecycle status:** under_construction; announced=2025-03-05; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Build-to-suit for Nebius. Nebius installs/manages GPU infrastructure as tenant. Campus expandable up to 300 MW (Nebius 2025-03-05).
- **Facility facts:** facility_MW=300; IT_MW=null; buildings=2; sqft=null; campus=City agendas (2026-08-17): Phase 1 ~129,622 sq ft AI DC building under construction; Phase 2 includes 587,980 sq ft two-story expansion and Bloom Energy areas. Earlier 2025 minutes described a reconfigured two-building plan. Square footage figures in sequential hearings are not identical — treat as in-flux site plan.
- **Power facts:** MW=Up to 300 MW design capacity (Nebius). On-site Bloom Energy fuel cells; Nebius says off-grid / no ratepayer impact.; source=On-site Bloom Energy fuel cells (Nebius community page).; utility=null
- **Related facility IDs:** nebius-vineland-cluster
- **Relationship notes:** DataOne owns/operates the building; Nebius is tenant for GPU clusters.
- **Unresolved questions:** Nebius 2025 PR targeted summer 2025 first MW and 100 MW by YE2025; community page and 2026 planning agendas still show construction. Go-live not confirmed., Phase square-footage figures changed across hearings., Intersection not geocoded.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://nebius.com/vinelandnj
- **Facility webpage:** https://nebius.com/vinelandnj
- **Public contact email:** media@nebius.com
- **Missing important fields:** latitude, longitude, operational_date, square_footage

**Sources (do not impute unlisted claims):**

- **Nebius** — Nebius × Vineland, New Jersey
  - URL: https://nebius.com/vinelandnj
  - Organization: Nebius
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: DataOne owner/operator; Nebius tenant; Bloom Energy; under construction; Vineland
- **Nebius Group N.V.** — Nebius accelerates US expansion, adding up to 300 MW in New Jersey
  - URL: https://assets.nebius.com/assets/176ae650-d0b0-45bf-a5ca-240e3769a745/Nebius%20accelerates%20US%20expansion%2C%20adding%20up%20to%20300%20MW%20capacity%20at%20new%20data%20center%20in%20New%20Jersey.pdf
  - Organization: Nebius Group N.V.
  - Source type: company_press_release
  - Publication/document date: 2025-03-05
  - Claims supported by **this** source only: up to 300 MW; first major US DC; first capacity as early as summer 2025
- **City of Vineland Planning Board** — Special meeting minutes 2025-06-26
  - URL: https://www.vinelandcity.org/Archive/Planning%20Board/Minutes/2025/Minutes%206-26-25%20%28Special%20Meeting%29.pdf
  - Organization: City of Vineland Planning Board
  - Source type: planning
  - Publication/document date: 2025-06-26
  - Claims supported by **this** source only: Lincoln and Sheridan Avenues; Block 7503; Data One end user; under construction

#### fermi-project-matador-campus

- **Stable research ID:** `fermi-project-matador-campus`
- **Canonical name:** Fermi America Project Matador Compute Campus
- **Aliases:** Project Matador, President Donald J. Trump Advanced Energy and Intelligence Campus
- **Category:** data_center
- **Owner/operator:** owner=Fermi America / Fermi Inc.; operator=null
- **Location:** TX, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** TCEQ places the project in Carson County, Texas. No street address was in the TCEQ extract fetched.
- **Lifecycle status:** under_construction; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Local ABC7 reporting (2026) cites a 15-year TensorWave lease for a data center supplied by 222 MW. That tenant/GPU claim is not in the TCEQ extract.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=TCEQ: on-site hyperscale data center campus for next-generation data and AI infrastructure; generation used solely onsite.
- **Power facts:** MW=null; source=On-site gas (Project Matador power plant); nuclear/solar/battery/grid also described in secondary press, not in the TCEQ extract.; utility=null
- **Related facility IDs:** fermi-matador-gas-generation
- **Relationship notes:** TCEQ states the gas plant exists to supply the on-site hyperscale data-center campus. Shared Carson County site; not a duplicate.
- **Unresolved questions:** Street address unknown., TensorWave/AMD claims are local-TV only., Campus vs power-plant polygons not separated in public maps used here.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** null
- **Facility webpage:** https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398
- **Public contact email:** null
- **Missing important fields:** street_address, city, latitude, longitude, owner legal entity

**Sources (do not impute unlisted claims):**

- **Texas Commission on Environmental Quality** — Fermi America Project Matador air-permit narrative
  - URL: https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398
  - Organization: Texas Commission on Environmental Quality
  - Source type: permit
  - Publication/document date: null
  - Claims supported by **this** source only: greenfield Carson County TX site; power plant named Fermi America Project Matador; electricity solely for on-site hyperscale data center / AI infrastructure; not sold to the local utility grid
- **KVII / ABC7 Amarillo** — Fermi signs $6.5 billion lease for data center
  - URL: https://abc7amarillo.com/news/local/fermi-america-signs-six-point-five-billion-dollar-lease-for-worlds-largest-data-center-after-months-of-turmoil-tensorwave-amarillo-texas-carson-county-water-city-council-greg-abbott-audir
  - Organization: KVII / ABC7 Amarillo
  - Source type: industry_press
  - Publication/document date: null
  - Claims supported by **this** source only: Carson County northeast of Amarillo; TensorWave 15-year lease; 222 MW supplied data center; NRC applications for four AP1000 reactors not licensed

#### google-cedar-rapids

- **Stable research ID:** `google-cedar-rapids`
- **Canonical name:** Google Cedar Rapids Data Center
- **Aliases:** null
- **Category:** data_center
- **Owner/operator:** owner=Google; operator=Google
- **Location:** Cedar Rapids, IA, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** City-level official disclosure only (Google locations directory lists Cedar Rapids as in development).
- **Lifecycle status:** planned; announced=2025-05-30; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Part of Google's $7B Iowa cloud and AI infrastructure package.
- **Related facility IDs:** google-council-bluffs
- **Relationship notes:** New Iowa campus alongside Council Bluffs expansion.
- **Unresolved questions:** No address, MW, or construction status beyond 'in development' on Google's directory.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.google/locations/
- **Facility webpage:** https://blog.google/feed/new-7-billion-investment-iowa/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw, operational_date

**Sources (do not impute unlisted claims):**

- **Google** — How Google is driving a new era of American innovation in Iowa
  - URL: https://blog.google/feed/new-7-billion-investment-iowa/
  - Organization: Google
  - Source type: company_press_release
  - Publication/document date: 2025-05-30
  - Claims supported by **this** source only: new data center in Cedar Rapids; cloud and AI infrastructure

#### google-council-bluffs

- **Stable research ID:** `google-council-bluffs`
- **Canonical name:** Google Council Bluffs Data Center
- **Aliases:** Google Iowa — Council Bluffs
- **Category:** data_center
- **Owner/operator:** owner=Google; operator=Google
- **Location:** Council Bluffs, IA, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Google official Iowa page does not publish a street. Directory addresses were not used.
- **Lifecycle status:** expansion; announced=2007; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Google 2025-05-30: additional $7 billion in Iowa in the next two years in cloud and AI infrastructure, including expansion of the existing Council Bluffs facility.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Google: >$20B invested in Iowa since 2007 Council Bluffs site.
- **Related facility IDs:** google-cedar-rapids
- **Relationship notes:** Same 2025 Iowa AI/cloud investment package as the new Cedar Rapids campus.
- **Unresolved questions:** No campus street on Google pages., GPU inventory not disclosed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.google/locations/iowa/
- **Facility webpage:** https://blog.google/feed/new-7-billion-investment-iowa/
- **Public contact email:** councilbluffs@google.com
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw

**Sources (do not impute unlisted claims):**

- **Google** — Iowa – Google Data Center Location
  - URL: https://datacenters.google/locations/iowa/
  - Organization: Google
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Council Bluffs since 2007; 2025 expansion; councilbluffs@google.com
- **Google** — How Google is driving a new era of American innovation in Iowa
  - URL: https://blog.google/feed/new-7-billion-investment-iowa/
  - Organization: Google
  - Source type: company_press_release
  - Publication/document date: 2025-05-30
  - Claims supported by **this** source only: $7B cloud and AI infrastructure; Council Bluffs expansion

#### google-pryor-mayes-county

- **Stable research ID:** `google-pryor-mayes-county`
- **Canonical name:** Google Pryor / Mayes County Data Center
- **Aliases:** Google Mayes County, Google Pryor
- **Category:** data_center
- **Owner/operator:** owner=Google; operator=Google
- **Location:** Pryor, OK, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Google names Pryor / Mayes County. No official street used.
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Google 2025-08-13: additional $9 billion in Oklahoma in the next two years in cloud and AI infrastructure, including expansion of the existing Pryor facility.
- **Related facility IDs:** google-stillwater
- **Relationship notes:** Same 2025 Oklahoma AI/cloud package as new Stillwater campus.
- **Unresolved questions:** No street or MW on Google announcement.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.google/locations/
- **Facility webpage:** https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-oklahoma/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw

**Sources (do not impute unlisted claims):**

- **Google** — Google is investing in infrastructure and an AI-ready workforce in Oklahoma
  - URL: https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-oklahoma/
  - Organization: Google
  - Source type: company_press_release
  - Publication/document date: 2025-08-13
  - Claims supported by **this** source only: $9B cloud and AI infrastructure; Pryor expansion

#### google-stillwater

- **Stable research ID:** `google-stillwater`
- **Canonical name:** Google Stillwater Data Center Campus
- **Aliases:** null
- **Category:** data_center
- **Owner/operator:** owner=Google; operator=Google
- **Location:** Stillwater, OK, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** City-level official disclosure; Google directory lists Stillwater as in development.
- **Lifecycle status:** planned; announced=2025-08-13; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=New campus under Google's $9B Oklahoma cloud and AI infrastructure investment.
- **Related facility IDs:** google-pryor-mayes-county
- **Relationship notes:** null
- **Unresolved questions:** No address or capacity.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.google/locations/
- **Facility webpage:** https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-oklahoma/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw

**Sources (do not impute unlisted claims):**

- **Google** — Google is investing in infrastructure and an AI-ready workforce in Oklahoma
  - URL: https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-oklahoma/
  - Organization: Google
  - Source type: company_press_release
  - Publication/document date: 2025-08-13
  - Claims supported by **this** source only: new data center campus in Stillwater

#### iren-childress

- **Stable research ID:** `iren-childress`
- **Canonical name:** IREN Childress Campus
- **Aliases:** Iris Energy Childress, IE US Development Holdings 3 — Childress
- **Category:** data_center
- **Owner/operator:** owner=IREN; operator=IREN
- **Location:** 620 FM 1033, Childress, TX, United States
- **Coordinates:** 34.3807907, -100.0588831
- **Coordinate precision:** street (documented_address_geocode)
- **Coordinate notes:** TDLR TABS project Iris-Childress Data Center, owner IE US Development Holdings 3 Inc., location 620 FM 1033, Childress TX 79201. Nominatim snapped to the US 287/FM 1033 highway, not a building footprint. 576-acre campus per IREN.
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=NVIDIA; models=null; accelerator_count=null; note=IREN: 750 MW total campus capacity; liquid-cooled Horizon halls for Microsoft GB300 plus other AI Cloud deployments. See iren-horizon-1 for the accepted Microsoft tranche.
- **Facility facts:** facility_MW=750; IT_MW=null; buildings=null; sqft=null; campus=576-acre freehold; dual fiber; on-site substations owned by IREN; ERCOT interconnection.
- **Power facts:** MW=750 MW total campus capacity per IREN location page. Microsoft Horizons 1–4 = 200 MW critical IT.; source=ERCOT via IREN-owned on-site substations; IREN cites renewable-rich West Texas.; utility=null
- **Related facility IDs:** iren-horizon-1
- **Relationship notes:** Campus contains Horizon 1–4 Microsoft GB300 halls plus other IREN Cloud capacity.
- **Unresolved questions:** Highway geocode is coarse for a 576-acre site., How much of 750 MW is AI vs other loads is not fully broken out on the location page.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.iren.com/data-centers/childress
- **Facility webpage:** https://www.iren.com/data-centers/childress
- **Public contact email:** null
- **Missing important fields:** building_count, utility name, precise campus centroid

**Sources (do not impute unlisted claims):**

- **IREN** — Childress Data Center
  - URL: https://www.iren.com/data-centers/childress
  - Organization: IREN
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: 750 MW; 576 acres; Childress TX; ERCOT; IREN-owned substations
- **Texas Department of Licensing and Regulation** — TABS2024024946 Iris - Childress Data Center
  - URL: https://www.tdlr.texas.gov/TABS/Search/Print/TABS2024024946
  - Organization: Texas Department of Licensing and Regulation
  - Source type: permit
  - Publication/document date: 2024-08-07
  - Claims supported by **this** source only: 620 FM 1033; IE US Development Holdings 3 Inc.
- **IREN** — IREN Signs $9.7 Billion Agreement with Microsoft
  - URL: https://iren.com/resources/blog/iren-signs97-billion-agreement-with-microsoft-to-deploy-ai-cloud-infrastructure
  - Organization: IREN
  - Source type: company_press_release
  - Publication/document date: 2025-11-03
  - Claims supported by **this** source only: 750 MW campus; Horizon 1-4; 200 MW IT; GB300

#### meta-eagle-mountain

- **Stable research ID:** `meta-eagle-mountain`
- **Canonical name:** Meta Eagle Mountain Data Center
- **Aliases:** Utah County data center, Eagle Mountain Data Center
- **Category:** data_center
- **Owner/operator:** owner=Meta; operator=Meta
- **Location:** Eagle Mountain, UT, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** City-level official disclosure only. Not 'Promontory.'
- **Lifecycle status:** expansion; announced=null; construction_start=2018; operational_date=2021-07-14
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Meta's 2026 expansion post does not explicitly label this campus as an AI supercluster. Included as Meta's documented Utah physical campus (the name users often confuse with Promontory).
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Utah investment >$3 billion with 2026 expansion. Utility: Rocky Mountain Power. 100% clean/renewable match per Meta.
- **Power facts:** MW=null; source=Matched 100% clean and renewable energy (Meta); Rocky Mountain Power grid.; utility=Rocky Mountain Power
- **Related facility IDs:** null
- **Relationship notes:** Not the same as NSA Camp Williams / Promontory Point.
- **Unresolved questions:** AI-specific GPU deployment at this campus is not documented on the 2026 Meta post., No street address on Meta pages reviewed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.atmeta.com/2021/07/utah-county-we-are-online/
- **Facility webpage:** https://datacenters.atmeta.com/2026/09/deepening-our-investment-in-eagle-mountain-utah/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw, gpu_vendor

**Sources (do not impute unlisted claims):**

- **Meta** — Utah County, We Are Online!
  - URL: https://datacenters.atmeta.com/2021/07/utah-county-we-are-online/
  - Organization: Meta
  - Source type: company_press_release
  - Publication/document date: 2021-07-14
  - Claims supported by **this** source only: operational serving traffic 2021-07-14
- **Meta** — Deepening Our Investment in Eagle Mountain, Utah
  - URL: https://datacenters.atmeta.com/2026/09/deepening-our-investment-in-eagle-mountain-utah/
  - Organization: Meta
  - Source type: company_press_release
  - Publication/document date: 2026-09-14
  - Claims supported by **this** source only: expansion; >$3B Utah; broke ground 2018; Rocky Mountain Power; closed-loop liquid cooling on new buildings

#### meta-new-albany

- **Stable research ID:** `meta-new-albany`
- **Canonical name:** Meta New Albany Data Center
- **Aliases:** New Albany Data Center
- **Category:** data_center
- **Owner/operator:** owner=Meta; operator=Meta
- **Location:** 1500 Beech Road, New Albany, OH, United States
- **Coordinates:** 40.065362, -82.754612
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** The Columbus Dispatch (2025-09-26) states Meta's campus is at 1500 Beech Road in the Licking County portion of New Albany, citing Meta's 2017/2022 announcements and a Meta spokesperson. Meta's official New Albany page does not print the street.
- **Lifecycle status:** expansion; announced=2017; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Campus hosts Meta's Prometheus 1 GW AI supercluster (separate record). Meta spokesperson told The Dispatch Prometheus adds at least 900,000 sq ft at Beech Road.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Meta US locations page: $1.5 billion+ investment; broke ground 2017; 300+ operational jobs when completed.
- **Power facts:** MW=Local officials and The Dispatch reported a Will-Power OH / Williams ~200 MW on-site gas plant to support expansion; not confirmed as the full Prometheus power solution on Meta's own pages.; source=null; utility=null
- **Related facility IDs:** meta-prometheus
- **Relationship notes:** Physical campus for the Prometheus GPU supercluster.
- **Unresolved questions:** Street is from reputable local press citing Meta, not Meta's HTML facility page., Campus MW not on Meta official pages reviewed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.atmeta.com/us-locations/
- **Facility webpage:** https://datacenters.atmeta.com/ohio-new-albany/
- **Public contact email:** null
- **Missing important fields:** facility_capacity_mw, operational_date, building_count

**Sources (do not impute unlisted claims):**

- **Meta** — Here is how the New Albany Data Center is supporting the long-term vitality of Ohio
  - URL: https://datacenters.atmeta.com/ohio-new-albany/
  - Organization: Meta
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: New Albany campus; broke ground 2017
- **Meta** — United States locations
  - URL: https://datacenters.atmeta.com/us-locations/
  - Organization: Meta
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: $1.5B+ investment; 2017 groundbreak
- **The Columbus Dispatch** — Meta grows Ohio data center site, aiming for record-breaking capacity
  - URL: https://www.dispatch.com/story/business/information-technology/2025/09/26/meta-facebook-data-center-new-albany-ohio/86314973007/
  - Organization: The Columbus Dispatch
  - Source type: industry_press
  - Publication/document date: 2025-09-26
  - Claims supported by **this** source only: 1500 Beech Road; Prometheus confirmed in New Albany by Meta spokesperson; ≥900,000 sq ft addition

#### meta-richland-parish

- **Stable research ID:** `meta-richland-parish`
- **Canonical name:** Meta Richland Parish Data Center
- **Aliases:** Richland Parish Data Center
- **Category:** data_center
- **Owner/operator:** owner=Meta; operator=Meta
- **Location:** LA, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Meta names Richland Parish only. Contractor Mortenson lists Holly Ridge, LA. No Meta-published street. Coordinates omitted (no geocodable official address).
- **Lifecycle status:** under_construction; announced=2024-12; construction_start=2024-12; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Campus will house Hyperion. Meta official pages state both 'over two gigawatts of compute capacity to train future open-source LLMs' and a July 2026 expansion to 5 GW compute capacity.
- **Facility facts:** facility_MW=5000; IT_MW=null; buildings=null; sqft=4000000; campus=Meta contractor site: 4 million-square-foot campus. Meta: $50B+ Louisiana investment (July 2026).
- **Power facts:** MW=5 GW compute capacity at expansion (Meta 2026-07-13). Earlier Meta language: over 2 GW to train open-source LLMs. Utility partner Entergy Louisiana; Meta says it will match 100% of energy use with clean and renewable energy and fund new gas plants/batteries/nuclear uprates via Entergy agreement.; source=Entergy agreement includes new natural-gas generation, batteries, nuclear uprates, and purchased power; Meta states 100% clean/renewable match.; utility=Entergy Louisiana
- **Related facility IDs:** meta-hyperion
- **Relationship notes:** Physical campus for the Hyperion cluster.
- **Unresolved questions:** 2 GW vs 5 GW: later Meta post is an expansion of the same campus., No official street; Holly Ridge is contractor-level., Whether any halls are operational as of 2026-09-17 is not stated.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.atmeta.com/richland-parish-data-center/
- **Facility webpage:** https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/
- **Public contact email:** null
- **Missing important fields:** street_address, city, latitude, longitude, operational_date

**Sources (do not impute unlisted claims):**

- **Meta** — The largest Meta data center yet brings big impact to Louisiana
  - URL: https://datacenters.atmeta.com/richland-parish-data-center/
  - Organization: Meta
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: announced December 2024; Hyperion hosted here; over 2 GW compute; Entergy partnership
- **Meta** — Deepening our investment in Richland Parish, Louisiana
  - URL: https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/
  - Organization: Meta
  - Source type: company_press_release
  - Publication/document date: 2026-07-13
  - Claims supported by **this** source only: 5 GW compute capacity; $50B+; broke ground December 2024; Entergy
- **Mortenson** — Richland Parish Data Center Construction
  - URL: https://www.mortenson.com/projects/richland-parish-data-center
  - Organization: Mortenson
  - Source type: industry_press
  - Publication/document date: null
  - Claims supported by **this** source only: Holly Ridge, LA location (contractor)
- **Richland Parish Data Center project site** — Home
  - URL: https://www.richlandparishdatacenter.com/
  - Organization: Richland Parish Data Center project site
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: 4 million sq ft campus; Mortenson/Turner/DPR

#### microsoft-fairwater-atlanta

- **Stable research ID:** `microsoft-fairwater-atlanta`
- **Canonical name:** Microsoft Fairwater Atlanta
- **Aliases:** Fairwater Atlanta, QTS Fayetteville campus (Microsoft Fairwater tenant)
- **Category:** data_center
- **Owner/operator:** owner=QTS; operator=Microsoft
- **Location:** 1435 Highway 54 West, Fayetteville, GA, United States
- **Coordinates:** 33.4452227, -84.5248259
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** City of Fayetteville development agreement locates the QTS campus at 1435 Highway 54 West. Microsoft's own pages say 'Atlanta' and show an aerial of the Fairwater Atlanta site without a street address. Local TV (WBRC, 2026-07-17) reported a Microsoft AI superfactory occupying the QTS Fayetteville campus. QTS is recorded as owner; Microsoft as Fairwater operator/tenant. QTS Fayetteville is not also listed as a separate facility.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=2025-10
- **Compute facts:** vendor=NVIDIA; models=GB200 NVL72; accelerator_count=null; note=Microsoft: second Fairwater-family AI datacenter; NVIDIA GB200 NVL72; designed to scale to hundreds of thousands of NVIDIA Blackwell GPUs; dedicated AI WAN to Wisconsin Fairwater.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=City of Fayetteville approved a development agreement for a ~612-acre QTS campus on Hwy 54 West (2023).
- **Related facility IDs:** microsoft-fairwater-mount-pleasant
- **Relationship notes:** Microsoft states Fairwater Atlanta began operation in October 2025 and is networked with Fairwater Wisconsin as an AI superfactory. Campus land/owner is QTS.
- **Unresolved questions:** Microsoft names the site Atlanta; physical campus is in Fayetteville, Fayette County., Which QTS buildings are Fairwater vs other tenants is not in Microsoft/QTS primary pages reviewed., Exact MW and GPU count not in Microsoft primary sources.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://news.microsoft.com/source/features/ai/from-wisconsin-to-atlanta-microsoft-connects-datacenters-to-build-its-first-ai-superfactory/
- **Facility webpage:** https://q.com/data-centers/fayetteville/
- **Public contact email:** null
- **Missing important fields:** facility_capacity_mw, it_load_mw, accelerator_count, building_count, announced_date

**Sources (do not impute unlisted claims):**

- **Microsoft** — From Wisconsin to Atlanta: Microsoft connects datacenters to build its first AI superfactory
  - URL: https://news.microsoft.com/source/features/ai/from-wisconsin-to-atlanta-microsoft-connects-datacenters-to-build-its-first-ai-superfactory/
  - Organization: Microsoft
  - Source type: company_press_release
  - Publication/document date: 2025-11-12
  - Claims supported by **this** source only: Atlanta Fairwater operational October 2025; GB200 NVL72; AI WAN to Wisconsin
- **City of Fayetteville / The Citizen** — Fayetteville approves development agreement for 612-acre QTS Data Center on Hwy. 54 West
  - URL: https://thecitizen.com/2023/06/19/fayetteville-approves-development-agreement-for-612-acre-qts-data-center-on-hwy-54-west/
  - Organization: City of Fayetteville / The Citizen
  - Source type: government_record
  - Publication/document date: 2023-06-19
  - Claims supported by **this** source only: 1435 Highway 54 West; QTS campus
- **QTS** — Fayetteville, Georgia
  - URL: https://q.com/data-centers/fayetteville/
  - Organization: QTS
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: QTS Fayetteville campus exists; closed-loop cooling
- **WBRC** — Questions raise about massive data center in Georgia as QTS pursues plans to build campus in Bessemer
  - URL: https://www.wbrc.com/2026/07/17/questions-raise-about-massive-data-center-georgia-qts-pursues-plans-build-campus-bessemer/
  - Organization: WBRC
  - Source type: industry_press
  - Publication/document date: 2026-07-17
  - Claims supported by **this** source only: Microsoft AI superfactory at QTS Fayetteville

#### microsoft-fairwater-mount-pleasant

- **Stable research ID:** `microsoft-fairwater-mount-pleasant`
- **Canonical name:** Microsoft Fairwater Mount Pleasant
- **Aliases:** Fairwater Wisconsin, Microsoft Mount Pleasant datacenter campus
- **Category:** data_center
- **Owner/operator:** owner=Microsoft; operator=Microsoft
- **Location:** 4800 90th Street, Mount Pleasant, WI, United States
- **Coordinates:** 42.6748702, -87.894888
- **Coordinate precision:** building (documented_address_geocode)
- **Coordinate notes:** Wisconsin DNR facility record lists 4800 90th ST, Mount Pleasant WI 53403. Village of Mount Pleasant also approved a related campus site plan at 12023 Durand Avenue (expansion parcel; geocode 42.6983640, -87.9303767). First operational Fairwater building vs later expansion parcels are not fully disambiguated in Microsoft's own pages.
- **Lifecycle status:** expansion; announced=2024-05-08; construction_start=null; operational_date=2026-06-23
- **Compute facts:** vendor=NVIDIA; models=GB200; accelerator_count=null; note=Microsoft describes Fairwater as a single flat-networked AI supercomputer of hundreds of thousands of NVIDIA GPUs; GB200 NVL72 racks (72 Blackwell GPUs per rack). Brad Smith called the operational Fairwater datacenter home to 'the world’s most powerful supercomputer.' A second adjacent facility is under construction, scheduled for 2028. Not separately recorded as a gpu_compute_cluster because Microsoft treats the datacenter itself as the supercomputer.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=3; sqft=1200000; campus=315 acres; three buildings totaling 1.2 million sq ft under roof (Sep 2025 Microsoft blog). Village later approved additional buildings on Durand Avenue / International Drive parcels.
- **Related facility IDs:** microsoft-fairwater-atlanta
- **Relationship notes:** Second Fairwater-family site in Atlanta is linked by Microsoft's dedicated AI WAN as an 'AI superfactory.' Microsoft also said identical Fairwater datacenters were under construction at other unspecified US locations as of Sep 2025.
- **Unresolved questions:** Which parcel is the first operational Fairwater building (4800 90th vs Durand/International Drive expansion sites)., Exact GPU count not disclosed (only 'hundreds of thousands').
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.microsoft.com
- **Facility webpage:** https://news.microsoft.com/source/2026/06/23/microsoft-completes-construction-on-first-datacenter-facility-in-mount-pleasant-wisconsin/
- **Public contact email:** null
- **Missing important fields:** facility_capacity_mw, it_load_mw, accelerator_count, utility, construction_start

**Sources (do not impute unlisted claims):**

- **Microsoft** — Microsoft completes construction on first datacenter facility in Mount Pleasant, Wisconsin
  - URL: https://news.microsoft.com/source/2026/06/23/microsoft-completes-construction-on-first-datacenter-facility-in-mount-pleasant-wisconsin/
  - Organization: Microsoft
  - Source type: company_press_release
  - Publication/document date: 2026-06-23
  - Claims supported by **this** source only: operational_date; operational_status; second facility 2028; announced May 2024; Fairwater supercomputer claim
- **Microsoft** — Inside the world’s most powerful AI datacenter
  - URL: https://blogs.microsoft.com/blog/2025/09/18/inside-the-worlds-most-powerful-ai-datacenter/
  - Organization: Microsoft
  - Source type: company_facility_page
  - Publication/document date: 2025-09-18
  - Claims supported by **this** source only: 315 acres; 1.2 million sq ft; three buildings; NVIDIA GB200; hundreds of thousands of GPUs
- **Microsoft** — Microsoft announces $3.3 billion investment in Wisconsin
  - URL: https://www.prnewswire.com/news-releases/microsoft-announces-3-3-billion-investment-in-wisconsin-to-spur-artificial-intelligence-innovation-and-economic-growth-302139892.html
  - Organization: Microsoft
  - Source type: company_press_release
  - Publication/document date: 2024-05-08
  - Claims supported by **this** source only: announced_date; Mount Pleasant campus
- **Wisconsin DNR** — Microsoft Mount Pleasant Data Centers facility record
  - URL: https://apps.dnr.wi.gov/warp_ext/am_permittracking2.aspx?id=35961
  - Organization: Wisconsin DNR
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: street_address 4800 90th ST
- **Village of Mount Pleasant** — Plan Commission minutes — 12023 Durand Avenue site plan SP-24-23
  - URL: https://www.mtpleasantwi.gov/Archive/ViewFile/Item/4381
  - Organization: Village of Mount Pleasant
  - Source type: planning
  - Publication/document date: null
  - Claims supported by **this** source only: Durand Avenue campus expansion parcel

#### oracle-shackelford

- **Stable research ID:** `oracle-shackelford`
- **Canonical name:** Oracle Shackelford County AI Data Center Campus
- **Aliases:** Stargate Shackelford, Vantage Frontier Texas (possible same campus)
- **Category:** data_center
- **Owner/operator:** owner=Oracle; operator=Oracle
- **Location:** TX, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Oracle names Shackelford County only. No city or street on Oracle's campus page. Coordinates omitted.
- **Lifecycle status:** planned; announced=2025-09; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=OpenAI listed Shackelford County as a new Oracle Stargate site. Oracle page (current as of January 2026) describes an AI data center with onsite microgrid (ultra-low-emission reciprocating engines) and closed-loop non-evaporative liquid cooling.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=10; sqft=3700000; campus=Oracle: 10 buildings on 1,200 acres, 3.7 million square feet.
- **Power facts:** MW=Onsite power system / microgrid; MW not stated on Oracle page.; source=Onsite microgrid using reciprocating engines (Oracle).; utility=null
- **Related facility IDs:** openai-stargate-abilene, vantage-lighthouse-port-washington
- **Relationship notes:** OpenAI/Oracle Stargate expansion site. Vantage's 2025-10-22 Wisconsin PR also refers to 'Frontier, a Texas campus in Shackelford County' as a Vantage investment — may be the same campus or an adjacent development; not merged.
- **Unresolved questions:** Oracle vs Vantage roles on the Shackelford campus are not reconciled in a single primary document., No city/street., Construction start not on Oracle page.
- **Verification confidence:** medium
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.oracle.com/data-centers/shackelford-county/
- **Facility webpage:** https://www.oracle.com/data-centers/shackelford-county/
- **Public contact email:** null
- **Missing important fields:** city, street_address, latitude, longitude, facility_capacity_mw, gpu_vendor

**Sources (do not impute unlisted claims):**

- **Oracle** — Shackelford County Data Centers
  - URL: https://www.oracle.com/data-centers/shackelford-county/
  - Organization: Oracle
  - Source type: company_facility_page
  - Publication/document date: 2026-01
  - Claims supported by **this** source only: 10 buildings; 1200 acres; 3.7M sq ft; onsite microgrid; closed-loop cooling
- **Vantage Data Centers** — OpenAI, Oracle and Vantage Data Centers Announce Stargate Data Center Site in Wisconsin
  - URL: https://vantage-dc.com/news/openai-oracle-and-vantage-data-centers-announce-stargate-data-center-site-in-wisconsin/
  - Organization: Vantage Data Centers
  - Source type: company_press_release
  - Publication/document date: 2025-10-22
  - Claims supported by **this** source only: Vantage also names a Shackelford County Texas campus called Frontier

#### project-jupiter-dona-ana

- **Stable research ID:** `project-jupiter-dona-ana`
- **Canonical name:** Project Jupiter (Doña Ana County)
- **Aliases:** STACK / BorderPlex Santa Teresa campus, Oracle New Mexico AI campus
- **Category:** data_center
- **Owner/operator:** owner=BorderPlex Digital Assets; operator=STACK Infrastructure
- **Location:** Santa Teresa, NM, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** STACK: Doña Ana County. BorderPlex: flagship campus in Santa Teresa. El Paso Matters: just north of the Santa Teresa Port of Entry. No street. City set to Santa Teresa from BorderPlex/county coverage, not a geocoded point.
- **Lifecycle status:** planned; announced=2025-08-28; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Oracle (2026-01-23): tenant of Project Jupiter; will deploy AI infrastructure for OpenAI. Oracle: four data center buildings; closed-loop non-evaporative cooling; dedicated onsite microgrid (gas turbines with emission controls).
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=4; sqft=null; campus=Doña Ana County IRB coverage: ~1,400-acre campus. Oracle: developed as four DC buildings.
- **Power facts:** MW=Onsite microgrid independent of public grid (STACK/Oracle). MW not stated on pages reviewed.; source=Dedicated onsite microgrid (STACK/Oracle).; utility=null
- **Related facility IDs:** openai-stargate-abilene
- **Relationship notes:** Developer: BorderPlex + STACK. Tenant: Oracle for OpenAI. County approved industrial revenue bonds 2025-09-19 (El Paso Matters).
- **Unresolved questions:** Owner vs operator split (BorderPlex land/development vs STACK vs county IRB leaseback) is legally complex., Construction start not confirmed on STACK/Oracle pages reviewed., MW not disclosed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.stackinfra.com/about/news-press/press-releases/stack-infrastructure-reinforces-responsible-development-principles-through-project-jupiter-in-new-mexico/
- **Facility webpage:** https://www.oracle.com/news/announcement/blog/oracle-advances-american-ai-innovation-in-new-mexico-2026-01-23/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw, gpu_vendor

**Sources (do not impute unlisted claims):**

- **STACK Infrastructure** — STACK Infrastructure Reinforces Responsible Development Principles through Project Jupiter
  - URL: https://www.stackinfra.com/about/news-press/press-releases/stack-infrastructure-reinforces-responsible-development-principles-through-project-jupiter-in-new-mexico/
  - Organization: STACK Infrastructure
  - Source type: company_press_release
  - Publication/document date: 2025-08-28
  - Claims supported by **this** source only: Doña Ana County; STACK + BorderPlex; onsite microgrid; one-time-fill cooling
- **Oracle** — Oracle Advances American AI Innovation in New Mexico
  - URL: https://www.oracle.com/news/announcement/blog/oracle-advances-american-ai-innovation-in-new-mexico-2026-01-23/
  - Organization: Oracle
  - Source type: company_press_release
  - Publication/document date: 2026-01-23
  - Claims supported by **this** source only: Oracle tenant; OpenAI customer; four DC buildings; closed-loop cooling; microgrid
- **El Paso Matters** — $165 billion Project Jupiter data center near El Paso to move forward
  - URL: https://elpasomatters.org/2025/09/19/project-jupiter-data-center-santa-teresa-approved-dona-ana-commissioners/
  - Organization: El Paso Matters
  - Source type: industry_press
  - Publication/document date: 2025-09-19
  - Claims supported by **this** source only: Santa Teresa; county IRB approval; ~1400 acres

#### switch-citadel-tahoe-reno

- **Stable research ID:** `switch-citadel-tahoe-reno`
- **Canonical name:** Switch Citadel Campus (Tahoe Reno)
- **Aliases:** Switch TAHOE RENO, The Citadel Campus
- **Category:** data_center
- **Owner/operator:** owner=Switch; operator=Switch
- **Location:** NV, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Switch: Tahoe Reno Industrial Center next to the Tesla Gigafactory; 2,000-acre campus. Press dateline Reno; site is in Storey County TRIC. No street. Coords omitted (do not geocode Tesla Gigafactory as Switch).
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Switch opening PR: designed for high-density / HPC workloads; later Switch AI Factories pages describe EVO AI factories up to 2 MW/cabinet across Switch campuses, including construction of AI factories. This record is the Citadel campus, not a named GPU cluster SKU.
- **Facility facts:** facility_MW=650; IT_MW=null; buildings=null; sqft=7200000; campus=Switch 2017 opening PR: up to 7.2 million sq ft and up to 650 MW; 2,000 acres; TAHOE RENO 1 up to 1.3 million sq ft / 130 MW. Later Switch Tahoe Reno page says gigawatts of power capacity upon completion.
- **Power facts:** MW=Up to 650 MW in 2017 opening PR; later marketing says gigawatts upon completion. Record keeps the dated 650 MW figure and notes the later claim.; source=100% renewable energy (Switch).; utility=null
- **Related facility IDs:** null
- **Relationship notes:** Flagship Switch AI-relevant campus. Las Vegas CORE/SUPERNAP AI factory buildings not separately listed.
- **Unresolved questions:** Opening PR is undated on the fetched page (historical; campus has long been operational)., 650 MW vs later 'gigawatts upon completion'., Which Citadel halls actually host AI factories vs general colo is not broken out., No street/city in Switch pages (TRIC / Storey County).
- **Verification confidence:** medium
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.switch.com/tahoe-reno/
- **Facility webpage:** https://www.switch.com/switch-tahoe-reno-data-center-now-open/
- **Public contact email:** null
- **Missing important fields:** street_address, city, latitude, longitude, operational_date, gpu_vendor

**Sources (do not impute unlisted claims):**

- **Switch** — Switch TAHOE RENO Now Open
  - URL: https://www.switch.com/switch-tahoe-reno-data-center-now-open/
  - Organization: Switch
  - Source type: company_press_release
  - Publication/document date: null
  - Claims supported by **this** source only: Citadel Campus; TRIC next to Tesla Gigafactory; 2000 acres; 7.2M sq ft; 650 MW; TAHOE RENO 1 1.3M sq ft / 130 MW; 100% renewable
- **Switch** — Tahoe Reno colocation
  - URL: https://www.switch.com/tahoe-reno/
  - Organization: Switch
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Citadel Campus; gigawatts upon completion; up to 2 MW per cabinet
- **Switch** — More Than a Data Center. It's An AI Factory.
  - URL: https://www.switch.com/ai-factories/
  - Organization: Switch
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: EVO AI Factories; liquid/air cooling; NVIDIA roadmap

#### related-the-barn-saline

- **Stable research ID:** `related-the-barn-saline`
- **Canonical name:** The Barn (Saline Township Stargate Campus)
- **Aliases:** Oracle Saline Township, OpenAI Stargate Michigan
- **Category:** data_center
- **Owner/operator:** owner=Related Digital; operator=Oracle
- **Location:** Saline Township, MI, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Saline Township FAQ: 8 properties on the north side of Michigan Avenue, adjacent to Bridgewater Township, ~575 acres. No street number. Coords omitted.
- **Lifecycle status:** under_construction; announced=2025-12-18; construction_start=2026-Q1; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Oracle: future tenant; will outfit the campus with AI infrastructure for OpenAI. Related Digital (2026-06-01): all campus buildings under construction; first of three 550,000 sq ft single-story LEED DC buildings nearing completion.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=3; sqft=1650000; campus=Oracle: developed on 250 of 575 acres. Related: three 550,000 sq ft DC buildings. Township: ~575 acres total.
- **Power facts:** MW=DTE Energy under MPSC-approved rate; Oracle pays energy, transmission, onsite substation, battery storage. MW not stated on Oracle/Related pages reviewed.; source=DTE Energy plus project-financed battery storage (Oracle/Related).; utility=DTE Energy
- **Related facility IDs:** openai-stargate-abilene
- **Relationship notes:** Developer Related Digital / Blackstone financing. Tenant Oracle for OpenAI Stargate. Contractor Walbridge.
- **Unresolved questions:** No street number., Campus MW not disclosed., Oracle Dec 2025 post URL slug says 2025-1018 but byline is Dec 18, 2025.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.oracle.com/news/announcement/blog/oracle-is-set-to-power-on-new-data-center-in-michigan-2025-1018/
- **Facility webpage:** https://www.related.com/press-releases/2026-06-01/related-digital-blackstone-oracle-openai-walbridge-and-governor-whitmer
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, facility_capacity_mw, gpu_vendor

**Sources (do not impute unlisted claims):**

- **Oracle** — Oracle is Set to Power on New Data Center in Michigan
  - URL: https://www.oracle.com/news/announcement/blog/oracle-is-set-to-power-on-new-data-center-in-michigan-2025-1018/
  - Organization: Oracle
  - Source type: company_press_release
  - Publication/document date: 2025-12-18
  - Claims supported by **this** source only: Saline Township; Oracle tenant; OpenAI customer; Related Digital; DTE; 575 acres / 250 developed; construction Q1 2026
- **Related Digital** — Celebrate construction of Stargate campus in Saline Township
  - URL: https://www.related.com/press-releases/2026-06-01/related-digital-blackstone-oracle-openai-walbridge-and-governor-whitmer
  - Organization: Related Digital
  - Source type: company_press_release
  - Publication/document date: 2026-06-01
  - Claims supported by **this** source only: The Barn name; under construction; three 550k sq ft buildings; first building nearing completion
- **Saline Township** — Saline Township Data Center FAQ
  - URL: https://salinetownship.org/go.php?id=731&table=page_uploads
  - Organization: Saline Township
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: north side of Michigan Avenue; 575 acres; Related Digital; Stargate

#### vantage-lighthouse-port-washington

- **Stable research ID:** `vantage-lighthouse-port-washington`
- **Canonical name:** Vantage Lighthouse Campus (Port Washington)
- **Aliases:** Stargate Wisconsin, Port Washington Lighthouse
- **Category:** data_center
- **Owner/operator:** owner=Vantage Data Centers; operator=Vantage Data Centers
- **Location:** Port Washington, WI, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Vantage official page: Port Washington, 30 minutes from Milwaukee. Rotary listed 1374 Lake Drive for a campus tour; not used as authoritative street (not on Vantage's page). Coords omitted.
- **Lifecycle status:** under_construction; announced=2025-10-22; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=OpenAI/Oracle/Vantage: four data centers providing close to a gigawatt of AI capacity; Oracle is the cloud partner for OpenAI Stargate. Completion scheduled 2028.
- **Facility facts:** facility_MW=null; IT_MW=902; buildings=4; sqft=2500000; campus=Vantage location page: 672-acre campus, 4 data centers, 902 MW critical IT load, 2.5 million sq ft, completion 2028.
- **Power facts:** MW=902 MW critical IT. Power from We Energies; 70% from zero-emission resources with remainder matched by renewable purchases (Vantage).; source=We Energies; 70% zero-emission allocation plus renewable matching to 100% (Vantage).; utility=We Energies
- **Related facility IDs:** openai-stargate-abilene, oracle-shackelford
- **Relationship notes:** Midwest Stargate site. Vantage develops/owns campus; Oracle occupies for OpenAI.
- **Unresolved questions:** Exact street not on Vantage page., Construction-start date not in the Oct 2025 PR ('will begin soon'). Rotary implied tours of an under-construction site by Aug 2026.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://vantage-dc.com/data-center-locations/north-america/port-washington-wisconsin
- **Facility webpage:** https://vantage-dc.com/news/openai-oracle-and-vantage-data-centers-announce-stargate-data-center-site-in-wisconsin/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, gpu_vendor

**Sources (do not impute unlisted claims):**

- **Vantage Data Centers** — Port Washington (Lighthouse) Data Center Campus Overview
  - URL: https://vantage-dc.com/data-center-locations/north-america/port-washington-wisconsin
  - Organization: Vantage Data Centers
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: 672 acres; 4 data centers; 902 MW IT; 2.5M sq ft; 2028; We Energies
- **Vantage Data Centers** — OpenAI, Oracle and Vantage announce Stargate site in Wisconsin
  - URL: https://vantage-dc.com/news/openai-oracle-and-vantage-data-centers-announce-stargate-data-center-site-in-wisconsin/
  - Organization: Vantage Data Centers
  - Source type: company_press_release
  - Publication/document date: 2025-10-22
  - Claims supported by **this** source only: announced_date; Port Washington; close to 1 GW AI capacity; completion 2028; OpenAI/Oracle

### 4.2 GPU Compute Cluster

#### lumi-supercomputer

- **Stable research ID:** `lumi-supercomputer`
- **Canonical name:** LUMI Supercomputer
- **Aliases:** LUMI, EuroHPC LUMI
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=EuroHPC Joint Undertaking; operator=CSC – IT Center for Science / LUMI consortium
- **Location:** Tehdaskatu 15, Kajaani, Kainuu, Finland
- **Coordinates:** 64.2319866, 27.691477
- **Coordinate precision:** building (documented_address_geocode)
- **Coordinate notes:** Same host building as CSC Kajaani. Shared coordinates do not make this a duplicate of the data-center record.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=EuroHPC: pre-exascale HPE Cray EX hosted by CSC in Kajaani. GPU SKU is not copied from TOP500 into this record.
- **Related facility IDs:** csc-kajaani-lumi-host
- **Relationship notes:** GPU supercomputer hosted inside the CSC Kajaani data center.
- **Unresolved questions:** GPU model not taken from TOP500.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.eurohpc-ju.europa.eu/supercomputers/our-supercomputers_en
- **Facility webpage:** https://www.eurohpc-ju.europa.eu/supercomputers/our-supercomputers_en
- **Public contact email:** null
- **Missing important fields:** gpu_models, accelerator_count

**Sources (do not impute unlisted claims):**

- **EuroHPC Joint Undertaking** — Our Supercomputers — LUMI
  - URL: https://www.eurohpc-ju.europa.eu/supercomputers/our-supercomputers_en
  - Organization: EuroHPC Joint Undertaking
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: LUMI located in Kajaani Finland; hosted by CSC; HPE Cray EX; pre-exascale
- **CSC** — Datacenter Kajaani address
  - URL: https://research.csc.fi/topic/lumi-supercomputer/
  - Organization: CSC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Tehdaskatu 15, 87100 Kajaani

#### jupiter-supercomputer

- **Stable research ID:** `jupiter-supercomputer`
- **Canonical name:** JUPITER Supercomputer
- **Aliases:** JUPITER Booster, EuroHPC JUPITER
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=EuroHPC Joint Undertaking; operator=Jülich Supercomputing Centre
- **Location:** Wilhelm-Johnen-Straße, Jülich, North Rhine-Westphalia, Germany
- **Coordinates:** 50.9000601, 6.3931009
- **Coordinate precision:** street (documented_address_geocode)
- **Coordinate notes:** Same FZJ campus pin as the host record.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=NVIDIA; models=GH200; accelerator_count=24000; note=EuroHPC 2026-06-23: Europe's first exascale supercomputer; BullSequana XH3000; approximately 24,000 NVIDIA GH200 Grace Hopper Superchips. FZJ page: first European machine above one quintillion operations/second.
- **Related facility IDs:** fzj-jupiter-host
- **Relationship notes:** GPU supercomputer hosted on the FZJ campus.
- **Unresolved questions:** Accelerator count is 'approximately 24,000'.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.eurohpc-ju.europa.eu/two-new-eurohpc-systems-join-top500-jupiter-remains-among-worlds-fastest-supercomputers-2026-06-23_en
- **Facility webpage:** https://www.fz-juelich.de/en/jsc/jupiter
- **Public contact email:** jupiter@fz-juelich.de
- **Missing important fields:** null

**Sources (do not impute unlisted claims):**

- **EuroHPC Joint Undertaking** — Two New EuroHPC Systems Join the TOP500 as JUPITER Remains Among the World's Fastest Supercomputers
  - URL: https://www.eurohpc-ju.europa.eu/two-new-eurohpc-systems-join-top500-jupiter-remains-among-worlds-fastest-supercomputers-2026-06-23_en
  - Organization: EuroHPC Joint Undertaking
  - Source type: government_record
  - Publication/document date: 2026-06-23
  - Claims supported by **this** source only: hosted by Jülich Supercomputing Centre; Europe's first exascale supercomputer; BullSequana XH3000; approximately 24,000 NVIDIA GH200
- **Forschungszentrum Jülich** — JUPITER — Exascale for Europe
  - URL: https://www.fz-juelich.de/en/jsc/jupiter
  - Organization: Forschungszentrum Jülich
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: located at Forschungszentrum Jülich; exascale threshold; Wilhelm-Johnen-Straße address

#### riken-fugaku

- **Stable research ID:** `riken-fugaku`
- **Canonical name:** Fugaku (RIKEN Center for Computational Science)
- **Aliases:** Fugaku, R-CCS Kobe
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=RIKEN; operator=RIKEN Center for Computational Science
- **Location:** 7-1-26 Minatojima-minamimachi, Chuo-ku, Kobe, Hyogo, Japan
- **Coordinates:** 34.6528736, 135.2207474
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Official R-CCS address from riken.jp. Nominatim named feature is 理化学研究所 計算科学研究センター. Fugaku is a CPU-based A64FX manycore system; it is in-scope as nationally relevant HPC/AI infrastructure. It is not an NVIDIA GPU cluster; gpu_vendor is left null rather than forcing a GPU label.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Included as Japan's flagship supercomputer at a documented physical site. Architecture details are not copied from secondary ranking sites in this record.
- **Related facility IDs:** null
- **Relationship notes:** Taxonomy tension: public V1 category is GPU Compute Cluster, but Fugaku is not documented here as a GPU machine. Flagged for human review before ingestion.
- **Unresolved questions:** Category GPU Compute Cluster vs A64FX CPU architecture., System name Fugaku is not on the access-page extract (only the hosting center).
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.riken.jp/en/access/
- **Facility webpage:** https://www.riken.jp/en/about/map/
- **Public contact email:** null
- **Missing important fields:** primary Fugaku system page, architecture confirmation on the same URL as the address

**Sources (do not impute unlisted claims):**

- **RIKEN** — Access
  - URL: https://www.riken.jp/en/access/
  - Organization: RIKEN
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: RIKEN Center for Computational Science; 7-1-26 Minatojima-minamimachi, Chuo-ku, Kobe, Hyogo 650-0047
- **RIKEN** — Map — Kobe Campus
  - URL: https://www.riken.jp/en/about/map/
  - Organization: RIKEN
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: R-CCS at 7-1-26 Minatojima-minamimachi

#### nscc-aspire-2a

- **Stable research ID:** `nscc-aspire-2a`
- **Canonical name:** NSCC ASPIRE 2A / ASPIRE 2A+
- **Aliases:** Aspire 2A, Aspire 2A+, National Supercomputing Centre Singapore
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=National Supercomputing Centre Singapore; operator=NSCC
- **Location:** Singapore, Singapore
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=NVIDIA; models=null; accelerator_count=null; note=Singapore PMO speech: NVIDIA collaborated with NSCC to develop the all-GPU ASPIRE 2A+. Host building/address is not in that speech.
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** No facility address., 2A vs 2A+ as one or two machines.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.pmo.gov.sg/newsroom/dpm-heng-swee-keat-at-the-launch-of-the-national-supercomputing-centre-singapore/
- **Facility webpage:** https://www.pmo.gov.sg/newsroom/dpm-heng-swee-keat-at-the-launch-of-the-national-supercomputing-centre-singapore/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, gpu_models

**Sources (do not impute unlisted claims):**

- **Prime Minister's Office Singapore** — DPM Heng Swee Keat at the Launch of NSCC Aspire 2A and Aspire 2A+
  - URL: https://www.pmo.gov.sg/newsroom/dpm-heng-swee-keat-at-the-launch-of-the-national-supercomputing-centre-singapore/
  - Organization: Prime Minister's Office Singapore
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: launch of Aspire 2A and Aspire 2A+; NVIDIA collaborated with NSCC to develop all-GPU ASPIRE 2A+

#### stargate-uae-cluster

- **Stable research ID:** `stargate-uae-cluster`
- **Canonical name:** Stargate UAE
- **Aliases:** Stargate UAE 1GW cluster
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=G42; operator=Khazna Data Centers (developer); operator split with OpenAI/Oracle is not taken from the G42 PR fetched
- **Location:** Abu Dhabi, Abu Dhabi, United Arab Emirates
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** under_construction; announced=2025-05-01; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=G42 PR: 1 GW AI infrastructure cluster; first 200 MW targeted for 2026 delivery. GPU SKU is not in that PR text.
- **Facility facts:** facility_MW=1000; IT_MW=200; buildings=null; sqft=null; campus=null
- **Power facts:** MW=First 200 MW of 1 GW.; source=null; utility=null
- **Related facility IDs:** uae-us-ai-campus-abu-dhabi
- **Relationship notes:** Cluster being built inside the UAE–US AI Campus by Khazna.
- **Unresolved questions:** No coordinates., GB300 / OpenAI-operator claims appear in WAM coverage that was not fully retrieved., it_load_mw 200 is the first-phase target, not a measured live load.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html
- **Facility webpage:** https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html
- **Public contact email:** null
- **Missing important fields:** latitude, longitude, gpu_models

**Sources (do not impute unlisted claims):**

- **G42** — G42 Provides Update on Construction of Stargate UAE AI Infrastructure Cluster
  - URL: https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html
  - Organization: G42
  - Source type: company_press_release
  - Publication/document date: 2025-10-16
  - Claims supported by **this** source only: 1 GW cluster; developed by Khazna; inside 5GW UAE–U.S. AI Campus Abu Dhabi; first 200 MW; planned 2026 delivery; announced in May with OpenAI, Oracle, NVIDIA, Cisco, and SoftBank (partners listed; roles not itemized in this PR)

#### bristol-isambard-ai

- **Stable research ID:** `bristol-isambard-ai`
- **Canonical name:** Isambard-AI
- **Aliases:** Isambard-AI phase 2, BriCS
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=University of Bristol / UK government investment as described by the university; operator=Bristol Centre for Supercomputing (BriCS)
- **Location:** Bristol, England, United Kingdom
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** University page: Isambard 3 shares a high-security compound, Isambard Park #1, with Isambard-AI. That park was not geocoded to a stable OSM feature in this pass. National Composites Centre was not used.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=University of Bristol: dedicated AI research supercomputer; £225 million UK government investment; 2025: most powerful university-based supercomputer. GPU SKU not stated on that page.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Isambard Park #1 compound.
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** No geocoded pin for Isambard Park #1., GPU model not on the university page.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.bristol.ac.uk/research/centres/bristol-supercomputing/
- **Facility webpage:** https://www.bristol.ac.uk/research/centres/bristol-supercomputing/
- **Public contact email:** null
- **Missing important fields:** latitude, longitude, gpu_models

**Sources (do not impute unlisted claims):**

- **University of Bristol** — Bristol Centre for Supercomputing (BriCS)
  - URL: https://www.bristol.ac.uk/research/centres/bristol-supercomputing/
  - Organization: University of Bristol
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: Isambard-AI dedicated AI research supercomputer; £225 million UK government investment; 2025 most powerful university-based supercomputer; Isambard Park #1 shared compound with Isambard 3; based at University of Bristol

#### anl-aurora

- **Stable research ID:** `anl-aurora`
- **Canonical name:** ALCF Aurora
- **Aliases:** Aurora supercomputer
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=U.S. Department of Energy; operator=Argonne Leadership Computing Facility
- **Location:** 9700 South Cass Avenue, Lemont, IL, United States
- **Coordinates:** 41.7138065, -87.9818928
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** Argonne National Laboratory street address. Nominatim returned a campus amenity at 9700 S Cass Ave, not the Aurora hall. Aurora is inside ANL.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=2025-01
- **Compute facts:** vendor=Intel; models=Data Center GPU Max Series; accelerator_count=63744; note=ALCF/Intel: 10,624 nodes; 6 Intel Data Center GPU Max Series per node = 63,744 GPUs. ALCF: launched January 2025; supports large-scale AI training and inference as well as simulation. Intel 2023: blade installation complete with 63,744 Max Series GPUs. Not commercial cloud.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=166 compute racks (ALCF/Intel materials).
- **Related facility IDs:** null
- **Relationship notes:** DOE/Argonne research supercomputer.
- **Unresolved questions:** Exact computer-room coordinates unknown., Not rentable commercial capacity.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.alcf.anl.gov/aurora
- **Facility webpage:** https://www.alcf.anl.gov/aurora
- **Public contact email:** null
- **Missing important fields:** facility_capacity_mw

**Sources (do not impute unlisted claims):**

- **Argonne Leadership Computing Facility** — Aurora
  - URL: https://www.alcf.anl.gov/aurora
  - Organization: Argonne Leadership Computing Facility
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: January 2025 launch; 10624 nodes; 63744 Intel Max GPUs; AI training and inference
- **Intel** — Aurora Supercomputer Blade Installation Complete
  - URL: https://www.intc.com/news-events/press-releases/detail/1631/aurora-supercomputer-blade-installation-complete
  - Organization: Intel
  - Source type: company_press_release
  - Publication/document date: 2023-06-22
  - Claims supported by **this** source only: 63744 Intel Data Center GPU Max Series; 10624 blades

#### coreweave-polaris-forge-1

- **Stable research ID:** `coreweave-polaris-forge-1`
- **Canonical name:** CoreWeave Polaris Forge 1 GPU Deployment
- **Aliases:** CoreWeave Ellendale
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=CoreWeave; operator=CoreWeave
- **Location:** 9663 87th Ave SE, Ellendale, ND, United States
- **Coordinates:** 46.0214191, -98.5685326
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** Same campus as applied-digital-polaris-forge-1.
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=2025-10-27
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Applied Digital names CoreWeave as the hyperscale tenant of the 400 MW Ellendale deployment. GPU model/count not in those PRs.
- **Facility facts:** facility_MW=null; IT_MW=400; buildings=null; sqft=null; campus=null
- **Power facts:** MW=400 MW critical IT contracted to CoreWeave; 175 MW campus live as of 2026-07-01 (not all necessarily GPU-populated).; source=null; utility=null
- **Related facility IDs:** applied-digital-polaris-forge-1
- **Relationship notes:** Tenant GPU cloud on Applied Digital's Polaris Forge 1 campus. Not a second building inventory.
- **Unresolved questions:** No CoreWeave-issued GPU SKU/count for Ellendale in sources reviewed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at
- **Facility webpage:** https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at
- **Public contact email:** null
- **Missing important fields:** gpu_vendor, gpu_models, accelerator_count

**Sources (do not impute unlisted claims):**

- **Applied Digital** — Ready for Service Phase 1 Building 1 for CoreWeave
  - URL: https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at
  - Organization: Applied Digital
  - Source type: company_press_release
  - Publication/document date: 2025-10-27
  - Claims supported by **this** source only: CoreWeave tenant; 400 MW

#### iren-horizon-1

- **Stable research ID:** `iren-horizon-1`
- **Canonical name:** IREN Horizon 1
- **Aliases:** Horizon 1 Childress, Microsoft Childress GB300 deployment
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=IREN; operator=IREN
- **Location:** 620 FM 1033, Childress, TX, United States
- **Coordinates:** 34.3807907, -100.0588831
- **Coordinate precision:** street (documented_address_geocode)
- **Coordinate notes:** On IREN Childress campus; Horizon 1 is not given a separate street.
- **Lifecycle status:** operational; announced=2025-11-03; construction_start=null; operational_date=2026-08-13
- **Compute facts:** vendor=NVIDIA; models=GB300 NVL72; accelerator_count=null; note=First of four 50 MW IT-load liquid-cooled AI Cloud deployments for Microsoft. NVIDIA tested GB300 NVL72 at Horizon 1 (Exemplar Cloud). Horizons 2–4 still scheduled for 2026; not recorded as separate facilities.
- **Facility facts:** facility_MW=null; IT_MW=50; buildings=1; sqft=null; campus=null
- **Power facts:** MW=50 MW critical IT (Horizon 1); four Horizons = 200 MW combined.; source=null; utility=null
- **Related facility IDs:** iren-childress
- **Relationship notes:** Microsoft is the contracted user of dedicated GPU infrastructure; IREN owns/operates the Childress halls (SEC 8-K: IE US Hardware 3 Inc.).
- **Unresolved questions:** GPU count not disclosed., Horizons 2–4 not yet accepted as of the 2026-08-13 8-K.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://iren.com/investors/news
- **Facility webpage:** https://www.sec.gov/Archives/edgar/data/1878848/000114036126032638/ef20080141_ex99-1.htm
- **Public contact email:** ir@iren.com
- **Missing important fields:** accelerator_count, construction_start

**Sources (do not impute unlisted claims):**

- **IREN** — IREN Delivers Horizon 1 to Microsoft (Exhibit 99.1 / 8-K)
  - URL: https://www.sec.gov/Archives/edgar/data/1878848/000114036126032638/ef20080141_ex99-1.htm
  - Organization: IREN
  - Source type: sec_filing
  - Publication/document date: 2026-08-13
  - Claims supported by **this** source only: Horizon 1 delivered and accepted; GB300 NVL72; 50 MW IT; Childress
- **IREN** — 8-K announcing Microsoft Partner SOW
  - URL: https://www.sec.gov/Archives/edgar/data/1878848/000114036125040072/ef20058139_ex99-1.htm
  - Organization: IREN
  - Source type: sec_filing
  - Publication/document date: 2025-11-03
  - Claims supported by **this** source only: $9.7B; GB300; Horizon 1-4; 200 MW IT; Childress

#### llnl-el-capitan

- **Stable research ID:** `llnl-el-capitan`
- **Canonical name:** LLNL El Capitan
- **Aliases:** El Capitan supercomputer
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=U.S. Department of Energy / NNSA; operator=Lawrence Livermore National Laboratory
- **Location:** 7000 East Avenue, Livermore, CA, United States
- **Coordinates:** 37.6820273, -121.7062914
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** LLNL campus address. Nominatim returned Fire Station 20 at 7000 East Avenue on the lab campus, not the HPC facility. El Capitan is inside LLNL.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=2024
- **Compute facts:** vendor=AMD; models=MI300 APU; accelerator_count=null; note=LLNL ASC: HPE/AMD system; AMD MI300 APU (CPU+GPU in one package); peak >2.79 exaflops (page also states 2.82 peak); deployed 2024; ranked world's most powerful until June 2026. LLNL is investing in AI/ML cognitive simulation on the system. Primary mission is NNSA stockpile stewardship — not commercial cloud.
- **Facility facts:** facility_MW=30; IT_MW=null; buildings=null; sqft=null; campus=null
- **Power facts:** MW=LLNL: about 30 MW to run at peak; also lists peak power ~35 MW on the same page.; source=null; utility=null
- **Related facility IDs:** null
- **Relationship notes:** NNSA exascale system at LLNL HPC facility.
- **Unresolved questions:** 30 MW vs ~35 MW peak on the same LLNL page., GPU/APU count not published on the page fetched., Geocode is campus fire station, not the HPC floor., National-security system; limited commercial relevance.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://asc.llnl.gov/exascale/el-capitan
- **Facility webpage:** https://asc.llnl.gov/exascale/el-capitan
- **Public contact email:** null
- **Missing important fields:** accelerator_count, building-level coordinates

**Sources (do not impute unlisted claims):**

- **LLNL / NNSA ASC** — El Capitan: NNSA’s first exascale machine
  - URL: https://asc.llnl.gov/exascale/el-capitan
  - Organization: LLNL / NNSA ASC
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: deployed 2024; AMD MI300 APU; >2.79 exaflops; ~30 MW / ~35 MW peak; AI/ML cognitive simulation; Livermore siting

#### lambda-dfw-04

- **Stable research ID:** `lambda-dfw-04`
- **Canonical name:** Lambda AI Cloud at Aligned DFW-04
- **Aliases:** Lambda Plano
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=Lambda; operator=Lambda
- **Location:** 601 N. Star Road, Plano, TX, United States
- **Coordinates:** 33.0054184, -96.6535522
- **Coordinate precision:** street (documented_address_geocode)
- **Coordinate notes:** Same building as aligned-dfw-04-plano.
- **Lifecycle status:** under_construction; announced=2025-05-07; construction_start=2024; operational_date=null
- **Compute facts:** vendor=NVIDIA; models=Blackwell, Blackwell Ultra; accelerator_count=null; note=Lambda VP quoted in Aligned PR: deploying public and private AI cloud in Aligned DFW-04. Count not disclosed. Do not use datacenters.com Lambda location lists.
- **Related facility IDs:** aligned-dfw-04-plano
- **Relationship notes:** Tenant GPU cloud in Aligned DFW-04. Not double-counted as a second data center.
- **Unresolved questions:** Lambda did not publish its own facility page with address in sources reviewed., GPU count unknown., Hut 8 Beacon Point / Anthropic Texas deal (BetaNews anonymous) is a different site and was rejected.
- **Verification confidence:** medium
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/
- **Facility webpage:** https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/
- **Public contact email:** null
- **Missing important fields:** accelerator_count, it_load_mw, operational_date

**Sources (do not impute unlisted claims):**

- **Aligned Data Centers** — Aligned and Lambda Partner to Power Next-Generation AI Infrastructure
  - URL: https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/
  - Organization: Aligned Data Centers
  - Source type: company_press_release
  - Publication/document date: 2025-05-07
  - Claims supported by **this** source only: Lambda occupant; NVIDIA Blackwell / Blackwell Ultra

#### meta-hyperion

- **Stable research ID:** `meta-hyperion`
- **Canonical name:** Meta Hyperion
- **Aliases:** Hyperion AI cluster
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=Meta; operator=Meta
- **Location:** LA, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Named cluster at the Richland Parish Data Center; no separate address.
- **Lifecycle status:** under_construction; announced=2024-12; construction_start=2024-12; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Meta: largest multi-gigawatt AI training cluster; campus expanding to 5 GW compute capacity. Engineering (2025-09-29) said Hyperion expected to come online beginning in 2028 and scale up to 5 GW.
- **Facility facts:** facility_MW=5000; IT_MW=null; buildings=null; sqft=null; campus=null
- **Power facts:** MW=Up to 5 GW compute capacity.; source=null; utility=Entergy Louisiana
- **Related facility IDs:** meta-richland-parish
- **Relationship notes:** Hyperion is the named training cluster housed in the Richland Parish campus.
- **Unresolved questions:** Engineering 2028 start vs campus already under construction since Dec 2024 — likely phased energization., GPU model/count not disclosed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://datacenters.atmeta.com/richland-parish-data-center/
- **Facility webpage:** https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/
- **Public contact email:** null
- **Missing important fields:** street_address, gpu_vendor, accelerator_count, operational_date

**Sources (do not impute unlisted claims):**

- **Meta** — Deepening our investment in Richland Parish, Louisiana
  - URL: https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/
  - Organization: Meta
  - Source type: company_press_release
  - Publication/document date: 2026-07-13
  - Claims supported by **this** source only: Hyperion at Richland Parish; 5 GW
- **Meta Engineering** — Meta’s Infrastructure Evolution and the Advent of AI
  - URL: https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/
  - Organization: Meta Engineering
  - Source type: company_facility_page
  - Publication/document date: 2025-09-29
  - Claims supported by **this** source only: Hyperion online beginning 2028; scale to 5 GW

#### meta-prometheus

- **Stable research ID:** `meta-prometheus`
- **Canonical name:** Meta Prometheus
- **Aliases:** Prometheus supercluster
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=Meta; operator=Meta
- **Location:** 1500 Beech Road, New Albany, OH, United States
- **Coordinates:** 40.065362, -82.754612
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** Same New Albany campus as meta-new-albany. Prometheus spans multiple buildings plus weatherproof tents and adjacent colocation per Meta Engineering; not a separately addressed building.
- **Lifecycle status:** under_construction; announced=2025-07; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Meta Engineering (2025-09-29): 1-gigawatt cluster spanning several traditional data-center buildings, weatherproof tents, and adjacent colocation; interconnects tens of thousands of GPUs. Dispatch: Meta spokesperson confirmed Prometheus is in New Albany and expected online in 2026 (Zuckerberg). Do not attach Meta's earlier unnamed 129k H100 cluster to this site; Engineering describes that as a prior retrofit of five unspecified production halls.
- **Facility facts:** facility_MW=1000; IT_MW=null; buildings=null; sqft=null; campus=null
- **Power facts:** MW=1 GW cluster capacity per Meta Engineering.; source=null; utility=null
- **Related facility IDs:** meta-new-albany
- **Relationship notes:** Named AI supercluster on the New Albany campus, not a second street address.
- **Unresolved questions:** Whether Prometheus was fully online by 2026-09-17 is not confirmed on Meta's own pages., GPU vendor/model for Prometheus not stated in the Engineering post., Zuckerberg July 2025 social post not independently archived here; Dispatch attributes 2026 online target to Zuckerberg.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/
- **Facility webpage:** https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/
- **Public contact email:** null
- **Missing important fields:** gpu_vendor, gpu_models, accelerator_count, operational_date

**Sources (do not impute unlisted claims):**

- **Meta Engineering** — Meta’s Infrastructure Evolution and the Advent of AI
  - URL: https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/
  - Organization: Meta Engineering
  - Source type: company_facility_page
  - Publication/document date: 2025-09-29
  - Claims supported by **this** source only: 1 GW Prometheus; multi-building plus tents; tens of thousands of GPUs
- **The Columbus Dispatch** — Meta grows Ohio data center site, aiming for record-breaking capacity
  - URL: https://www.dispatch.com/story/business/information-technology/2025/09/26/meta-facebook-data-center-new-albany-ohio/86314973007/
  - Organization: The Columbus Dispatch
  - Source type: industry_press
  - Publication/document date: 2025-09-26
  - Claims supported by **this** source only: Prometheus in New Albany; expected 2026

#### nebius-vineland-cluster

- **Stable research ID:** `nebius-vineland-cluster`
- **Canonical name:** Nebius Vineland GPU Factory
- **Aliases:** Nebius New Jersey region
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=Nebius; operator=Nebius
- **Location:** Lincoln Avenue and Sheridan Avenue, Vineland, NJ, United States
- **Coordinates:** null
- **Coordinate precision:** street (null)
- **Coordinate notes:** Same site as dataone-vineland.
- **Lifecycle status:** under_construction; announced=2025-03-05; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=Nebius: tenant installing and managing server and GPU infrastructure. SKU/count not disclosed on the Vineland page.
- **Facility facts:** facility_MW=300; IT_MW=null; buildings=null; sqft=null; campus=null
- **Power facts:** MW=Expandable up to 300 MW (Nebius).; source=Bloom Energy fuel cells on site (Nebius).; utility=null
- **Related facility IDs:** dataone-vineland
- **Relationship notes:** Nebius GPU operations inside the DataOne-owned Vineland campus. Not a second building inventory.
- **Unresolved questions:** Whether any GPU MW was live by 2026-09-17., GPU model not disclosed., Kansas City colocation mentioned by Nebius is a different US site and was not given a street — not added.
- **Verification confidence:** medium
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://nebius.com/vinelandnj
- **Facility webpage:** https://nebius.com/blog/posts/300-mw-new-jersey-and-iceland-regions
- **Public contact email:** media@nebius.com
- **Missing important fields:** gpu_vendor, gpu_models, accelerator_count, operational_date, latitude

**Sources (do not impute unlisted claims):**

- **Nebius** — Nebius × Vineland, New Jersey
  - URL: https://nebius.com/vinelandnj
  - Organization: Nebius
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Nebius tenant GPU infrastructure
- **Nebius** — 300 MW New Jersey region
  - URL: https://nebius.com/blog/posts/300-mw-new-jersey-and-iceland-regions
  - Organization: Nebius
  - Source type: company_press_release
  - Publication/document date: null
  - Claims supported by **this** source only: up to 300 MW; DataOne partnership

#### ornl-frontier

- **Stable research ID:** `ornl-frontier`
- **Canonical name:** OLCF Frontier
- **Aliases:** Frontier supercomputer
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=U.S. Department of Energy; operator=Oak Ridge Leadership Computing Facility
- **Location:** One Bethel Valley Road, Oak Ridge, TN, United States
- **Coordinates:** 35.987336, -84.2152
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** OLCF mailing address One Bethel Valley Rd, Oak Ridge, TN 37831. Nominatim snapped to Bethel Valley Road (campus/street), not the Frontier hall. Frontier is inside ORNL.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=2022-05
- **Compute facts:** vendor=AMD; models=Instinct MI250X; accelerator_count=39424; note=OLCF: 9,856 nodes; each node 4 AMD Instinct MI250X GPUs (8 GCDs/node). Accelerator count = 9856 × 4 from official node table, not a separately published GPU total. HPE Cray EX; ~2 exaflops theoretical peak. OLCF states the system further integrates AI with simulation. Not commercial cloud; included as documented national-lab GPU system with economic/scientific relevance.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=77 Olympus rack HPE cabinets (OLCF user guide).
- **Related facility IDs:** null
- **Relationship notes:** DOE/ORNL research supercomputer, not a commercial GPU cloud region.
- **Unresolved questions:** Geocode is the lab road, not the Frontier computer room., Commercial/economic relevance is scientific HPC/AI research, not rentable cloud.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.olcf.ornl.gov/olcf-resources/compute-systems/frontier/
- **Facility webpage:** https://www.olcf.ornl.gov/olcf-resources/compute-systems/frontier/
- **Public contact email:** help@olcf.ornl.gov
- **Missing important fields:** facility_capacity_mw, building-level coordinates

**Sources (do not impute unlisted claims):**

- **Oak Ridge Leadership Computing Facility** — Frontier
  - URL: https://www.olcf.ornl.gov/olcf-resources/compute-systems/frontier/
  - Organization: Oak Ridge Leadership Computing Facility
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: ORNL location; May 2022 online; 9856 nodes; 4 MI250X per node; AI integration; mailing address

#### openai-stargate-abilene

- **Stable research ID:** `openai-stargate-abilene`
- **Canonical name:** OpenAI Stargate Abilene (OCI on Crusoe campus)
- **Aliases:** Stargate flagship Abilene, Oracle OCI Abilene
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=OpenAI; operator=Oracle
- **Location:** Abilene, TX, United States
- **Coordinates:** 32.508056, -99.777222
- **Coordinate precision:** campus (official_record)
- **Coordinate notes:** Same campus coordinates as crusoe-abilene-stargate-campus.
- **Lifecycle status:** expansion; announced=2025-01; construction_start=2024-06; operational_date=2025-09-30
- **Compute facts:** vendor=NVIDIA; models=GB200; accelerator_count=null; note=Crusoe/Oracle: GB200 racks delivered starting June 2025; early training and inference for next-generation research. OpenAI's five-new-sites post (403 on fetch) is widely quoted as calling Abilene the flagship Stargate site already running on OCI. GPU count not in Crusoe PR.
- **Related facility IDs:** crusoe-abilene-stargate-campus, vantage-lighthouse-port-washington, oracle-shackelford, project-jupiter-dona-ana, related-the-barn-saline
- **Relationship notes:** Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites.
- **Unresolved questions:** OpenAI.com five-new-sites page returned 403 during this research; claims taken from Crusoe's quoting of the OCI/OpenAI live campus., Planned 600 MW Abilene expansion reportedly dropped (Bloomberg 2026-03-06) — not on Crusoe/OpenAI pages reviewed.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live
- **Facility webpage:** https://openai.com/index/five-new-stargate-sites/
- **Public contact email:** null
- **Missing important fields:** accelerator_count, it_load_mw, street_address

**Sources (do not impute unlisted claims):**

- **Crusoe** — Crusoe Announces Flagship Abilene Data Center is Live
  - URL: https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live
  - Organization: Crusoe
  - Source type: company_press_release
  - Publication/document date: 2025-09-30
  - Claims supported by **this** source only: Stargate flagship live on OCI; GB200; OpenAI research workloads; Oracle partnership

#### xai-colossus-1

- **Stable research ID:** `xai-colossus-1`
- **Canonical name:** xAI Colossus 1
- **Aliases:** Colossus, Colossus Memphis, former Electrolux building
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=xAI; operator=xAI
- **Location:** 3231 Paul R. Lowry Road, Memphis, TN, United States
- **Coordinates:** 35.0600392, -90.1520249
- **Coordinate precision:** building (documented_address_geocode)
- **Coordinate notes:** USA Today / Commercial Appeal cite Shelby County deeds/lease of the former Electrolux plant at 3231 Paul R. Lowry Road (also mapped as Riverport Road). Nominatim house match. Building is leased (Phoenix Investors owner per local press), not necessarily owned by xAI.
- **Lifecycle status:** operational; announced=2024-06; construction_start=2024-05; operational_date=2024-09-02
- **Compute facts:** vendor=NVIDIA; models=H100; accelerator_count=200000; note=x.ai/colossus: 200,000 H100 GPUs in a single cluster; built in 122 days then doubled in 92 days to 200k GPUs; timeline May 2024–Feb 2025. Same page also displays an '180K GPUs' widget. NVIDIA 2024-10-28: 100,000 Hopper GPUs in Memphis, doubling to 200,000 Hopper. Musk 2024-09-02 (quoted by Fortune): 100k H100 then +50k H200 toward 200k. Record uses xAI page headline 200,000 H100 with those conflicts listed as ambiguities. Not also recorded as a separate data_center (the factory building is the cluster site).
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=1; sqft=null; campus=Local press: ~217 acres including surrounding parcels at the former Electrolux site / Frank C. Pidgeon Industrial Park.
- **Power facts:** MW=Power source (gas turbines vs MLGW/TVA) is politically contested in local coverage; xAI official Colossus page does not state MW.; source=null; utility=null
- **Related facility IDs:** xai-colossus-2
- **Relationship notes:** Colossus 2 is a second Memphis campus on Tulane Road, not an extra count of this building.
- **Unresolved questions:** 200,000 H100 (xAI headline) vs 180K widget on same page vs NVIDIA Hopper mix vs Musk H200 add-on., Owner vs lessee (Phoenix Investors per local press)., Memphis Light, Gas and Water vs on-site turbines not resolved from xAI primary page.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://x.ai/colossus
- **Facility webpage:** https://x.ai/colossus
- **Public contact email:** null
- **Missing important fields:** facility_capacity_mw, square_footage, utility

**Sources (do not impute unlisted claims):**

- **xAI** — Colossus: The World's Largest AI Supercomputer
  - URL: https://x.ai/colossus
  - Organization: xAI
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: 200,000 H100; 122 days; May 2024 groundbreak; Feb 2025 doubling
- **NVIDIA** — NVIDIA Ethernet Networking Accelerates World’s Largest AI Supercomputer, Built by xAI
  - URL: https://nvidianews.nvidia.com/news/spectrum-x-ethernet-networking-xai-colossus
  - Organization: NVIDIA
  - Source type: company_press_release
  - Publication/document date: 2024-10-28
  - Claims supported by **this** source only: 100,000 Hopper GPUs Memphis; doubling to 200,000 Hopper; xAI spokesperson quote
- **USA Today / Commercial Appeal** — Where are xAI campuses located in Memphis and Southaven?
  - URL: https://www.usatoday.com/story/money/business/development/2026/01/15/xai-elon-musk-campuses-memphis-southaven/88066070007/
  - Organization: USA Today / Commercial Appeal
  - Source type: industry_press
  - Publication/document date: 2026-01-15
  - Claims supported by **this** source only: 3231 Paul R. Lowry Road; former Electrolux; deed/lease narrative

#### xai-colossus-2

- **Stable research ID:** `xai-colossus-2`
- **Canonical name:** xAI Colossus 2
- **Aliases:** Colossus 2 Tulane Road
- **Category:** gpu_compute_cluster
- **Owner/operator:** owner=xAI; operator=xAI
- **Location:** 5420 Tulane Road, Memphis, TN, United States
- **Coordinates:** 34.9979829, -90.0348674
- **Coordinate precision:** building (documented_address_geocode)
- **Coordinate notes:** USA Today / Commercial Appeal cite Shelby County deeds for 5408/5414/5420 Tulane Road (CTC Property LLC → MZX Tech LLC). Nominatim returns a building labeled xAI Colossus 2 at 5420 Tulane Road.
- **Lifecycle status:** under_construction; announced=2025-02; construction_start=null; operational_date=null
- **Compute facts:** vendor=null; models=null; accelerator_count=null; note=No xAI-published GPU count for Colossus 2. Local press: Musk (CNBC, May 2025) targeted 6–9 months; xAI's Brent Mayo (2025-07-15) said he was hopeful. Not confirmed operational on xAI's Colossus page as of 2026-09-17.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Local press: ~186 acres across three Tulane Road parcels.
- **Power facts:** MW=Mayo said xAI was working with TVA and MLGW; no published MW.; source=null; utility=null
- **Related facility IDs:** xai-colossus-1
- **Relationship notes:** Second Memphis campus, distinct from 3231 Paul R. Lowry Road Colossus 1.
- **Unresolved questions:** Operational status as of 2026-09-17 not confirmed by xAI., GPU vendor/count undisclosed., Deed owner is an xAI affiliate name in press, not an xAI.org filing reviewed here.
- **Verification confidence:** medium
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** null
- **Facility webpage:** https://www.usatoday.com/story/money/business/development/2026/01/15/xai-elon-musk-campuses-memphis-southaven/88066070007/
- **Public contact email:** null
- **Missing important fields:** gpu_vendor, accelerator_count, operational_date, facility_capacity_mw

**Sources (do not impute unlisted claims):**

- **USA Today / Commercial Appeal** — Where are xAI campuses located in Memphis and Southaven?
  - URL: https://www.usatoday.com/story/money/business/development/2026/01/15/xai-elon-musk-campuses-memphis-southaven/88066070007/
  - Organization: USA Today / Commercial Appeal
  - Source type: industry_press
  - Publication/document date: 2026-01-15
  - Claims supported by **this** source only: 5420 Tulane Road; deed parcels; Colossus 2 name
- **Commercial Appeal** — xAI official talks Colossus 2 in Memphis
  - URL: https://www.commercialappeal.com/story/money/business/development/2025/07/15/elon-musk-xai-in-memphis-colossus-2/85215548007/
  - Organization: Commercial Appeal
  - Source type: industry_press
  - Publication/document date: 2025-07-15
  - Claims supported by **this** source only: 5420 Tulane Road; TVA/MLGW; timeline not confirmed

### 4.3 Semiconductor Fab

#### tsmc-esmc-dresden

- **Stable research ID:** `tsmc-esmc-dresden`
- **Canonical name:** European Semiconductor Manufacturing Company (ESMC) Dresden
- **Aliases:** ESMC GmbH, TSMC Dresden
- **Category:** semiconductor_fab
- **Owner/operator:** owner=ESMC GmbH (TSMC 70%; Bosch, Infineon, NXP 10% each as announced); operator=TSMC
- **Location:** Robert-Bosch-Ring 4 (Welcome Center / Gate 5; construction-site vicinity), Dresden, Saxony, Germany
- **Coordinates:** 51.1280341, 13.7418934
- **Coordinate precision:** street (documented_address_geocode)
- **Coordinate notes:** ESMC public consultation text places a Welcome Center close to the construction site at Robert-Bosch Ring 4, Gate 5. Nominatim geocoded the street in Dresden-Klotzsche/Wilschdorf, not a fab footprint. Full esmc.eu fetch was blocked by a bot challenge.
- **Lifecycle status:** under_construction; announced=2023-08-08; construction_start=null; operational_date=null
- **Fab production role:** 300mm foundry for automotive/industrial/IoT as announced — not claimed here as leading-edge AI-accelerator production.
- **Process nodes (as sourced):** 28nm, 22nm, 16nm, 12nm
- **Wafer size:** 300mm
- **Capacity note:** Announced 40,000 300mm wafers/month; production targeted by end of 2027 in the 2023 JV PR. City of Dresden (2026-09-15) reported topping-out and machine install targeted 2027.
- **Related facility IDs:** null
- **Relationship notes:** TSMC-operated JV in Europe; not the same campus as TSMC Arizona or Fab 18.
- **Unresolved questions:** Welcome Center address vs fab polygon., AI-accelerator relevance is weak (auto/industrial nodes).
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://esmc.eu/en/index.html
- **Facility webpage:** https://pr.tsmc.com/english/news/3049
- **Public contact email:** press@tsmc.com
- **Missing important fields:** exact fab gate address

**Sources (do not impute unlisted claims):**

- **TSMC / Bosch / Infineon / NXP** — Joint venture to bring advanced semiconductor manufacturing to Europe
  - URL: https://pr.tsmc.com/english/news/3049
  - Organization: TSMC / Bosch / Infineon / NXP
  - Source type: company_press_release
  - Publication/document date: 2023-08-08
  - Claims supported by **this** source only: ESMC GmbH Dresden; TSMC 70% / Bosch Infineon NXP 10% each; operated by TSMC; 40,000 wpm 300mm; 28/22nm planar CMOS and 16/12nm FinFET; construction 2H 2024 target; production by end 2027 target; automotive and industrial demand
- **Landeshauptstadt Dresden** — Richtfest bei ESMC
  - URL: https://www.dresden.de/de/wirtschaft/tomorrowshome/news/2026/esmc-richtfest.php
  - Organization: Landeshauptstadt Dresden
  - Source type: government_record
  - Publication/document date: 2026-09-15
  - Claims supported by **this** source only: topping-out / Richtfest; first TSMC factory in Europe; machines to be brought in 2027

#### intel-leixlip-fab34

- **Stable research ID:** `intel-leixlip-fab34`
- **Canonical name:** Intel Leixlip Campus (Fab 34)
- **Aliases:** Intel Ireland, Fab 34 Leixlip
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Intel; operator=Intel
- **Location:** Leixlip, Kildare, Ireland
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Intel PRs name the Leixlip campus but do not publish a street in the pages fetched. Collinstown Industrial Park was not used.
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=null
- **Fab production role:** High-volume fab for Intel 4 and Intel 3 including Xeon 6 / Core Ultra as stated in Intel's April 2026 JV repurchase PR. July 2026 PR: €5B expansion for Xeon 6 and next-gen Xeon on Intel 3 for AI factories.
- **Process nodes (as sourced):** Intel 4, Intel 3
- **Capacity note:** €5 billion capex programme at Leixlip announced 2026-07-13; execution began earlier in 2026 per that PR. 4,900 people on site.
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** No official street/coordinates in the PRs fetched.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.intel.com/content/www/us/en/newsroom/news/artificial-intelligence/intel-invests-5-billion-euro-to-expand-manufacturing-in-europe.html
- **Facility webpage:** https://www.intel.com/content/www/us/en/newsroom/news/corporate/intel-repurchase-49-equity-interest-ireland-fab-joint-venture.html
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **Intel** — Intel Invests €5 Billion to Expand Manufacturing in Europe
  - URL: https://www.intel.com/content/www/us/en/newsroom/news/artificial-intelligence/intel-invests-5-billion-euro-to-expand-manufacturing-in-europe.html
  - Organization: Intel
  - Source type: company_press_release
  - Publication/document date: 2026-07-13
  - Claims supported by **this** source only: Leixlip campus Ireland; €5B / $5.7B capital investment; Intel Xeon 6 and next-gen Xeon on Intel 3; AI Factories demand cited; 4,900 employees; execution began earlier in 2026
- **Intel** — Intel to Repurchase 49% Equity Interest in Ireland Fab Joint Venture
  - URL: https://www.intel.com/content/www/us/en/newsroom/news/corporate/intel-repurchase-49-equity-interest-ireland-fab-joint-venture.html
  - Organization: Intel
  - Source type: company_press_release
  - Publication/document date: 2026-04-01
  - Claims supported by **this** source only: Fab 34 Ireland; Intel 4 and Intel 3; Intel Core Ultra and Intel Xeon 6

#### tsmc-jasm-kumamoto

- **Stable research ID:** `tsmc-jasm-kumamoto`
- **Canonical name:** Japan Advanced Semiconductor Manufacturing (JASM)
- **Aliases:** TSMC JASM, JASM Kumamoto
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Japan Advanced Semiconductor Manufacturing, Inc.; operator=JASM / TSMC
- **Location:** 4106-1, Haramizu, Kikuyo-machi, Kikuchi-gun, Kikuyo, Kumamoto, Japan
- **Coordinates:** 32.874477, 130.8210348
- **Coordinate precision:** campus (documented_address_geocode)
- **Coordinate notes:** Nominatim returned the Haramizu quarter node, not building 4106-1. Treat as campus-area, not a building pin.
- **Lifecycle status:** null; announced=null; construction_start=null; operational_date=null
- **Fab production role:** TSMC Japan manufacturing subsidiary listed on the official fabs directory. Nodes/status not on that directory page.
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** Operational status and nodes not on the directory page., Geocode is quarter-level, not the street number.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Facility webpage:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Public contact email:** null
- **Missing important fields:** operational_status, process_nodes

**Sources (do not impute unlisted claims):**

- **TSMC** — TSMC Fabs directory
  - URL: https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
  - Organization: TSMC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Japan Advanced Semiconductor Manufacturing, Inc.; 4106-1, Haramizu, Kikuyo-machi, Kikuchi-gun, Kumamoto, 869-1102

#### micron-hiroshima

- **Stable research ID:** `micron-hiroshima`
- **Canonical name:** Micron Hiroshima (Higashihiroshima)
- **Aliases:** Micron F 15, Micron western Japan fab
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Micron; operator=Micron
- **Location:** Higashihiroshima, Hiroshima, Japan
- **Coordinates:** 34.3869773, 132.6833423
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** OSM named feature 'Micron F 15' in Higashihiroshima. Bloomberg 2026-07-04 reports groundbreaking on a ¥1.5T expansion for advanced memory including HBM; that article is secondary.
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Existing Micron Japan memory fab (OSM/company presence). HBM/advanced DRAM expansion is reported by Bloomberg citing Micron; a Micron IR URL for the Japan groundbreaking was not successfully fetched in this pass.
- **Capacity note:** Bloomberg: ¥1.5 trillion (~$9.3B) expansion; equipment install 2H 2028; METI support up to ¥500B. Secondary source — do not treat as primary.
- **Related facility IDs:** micron-boise, micron-singapore-hbm-packaging
- **Relationship notes:** null
- **Unresolved questions:** Primary Micron Japan PR not fetched., OSM 'F 15' label not confirmed on a Micron page in this pass.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** null
- **Facility webpage:** null
- **Public contact email:** null
- **Missing important fields:** primary company URL, street_address

**Sources (do not impute unlisted claims):**

- **Bloomberg** — Micron Breaks Ground on $9 Billion Japan Fab Expansion
  - URL: https://www.bloomberg.com/news/articles/2026-07-04/micron-breaks-ground-on-9-billion-western-japan-plant-expansion
  - Organization: Bloomberg
  - Source type: financial_press
  - Publication/document date: 2026-07-04
  - Claims supported by **this** source only: Higashihiroshima Hiroshima Prefecture factory; ¥1.5 trillion expansion; HBM among chips to be made; equipment 2H 2028; METI up to ¥500B

#### micron-singapore-hbm-packaging

- **Stable research ID:** `micron-singapore-hbm-packaging`
- **Canonical name:** Micron Singapore HBM Advanced Packaging Facility
- **Aliases:** Micron Singapore HBM AP
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Micron Technology, Inc.; operator=Micron
- **Location:** Singapore, Singapore
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** PR: adjacent to Micron's current Singapore facilities. No street.
- **Lifecycle status:** under_construction; announced=2025-01-08; construction_start=2025-01-08; operational_date=null
- **Fab production role:** HBM advanced packaging (back-end), not a leading-edge logic wafer fab.
- **Capacity note:** Operations scheduled to begin in 2026; meaningful capacity expansion calendar 2027; ~US$7B through the end of the decade.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Adjacent to existing Singapore facilities.
- **Related facility IDs:** micron-boise, micron-hiroshima
- **Relationship notes:** Packaging site complementary to DRAM wafer fabs.
- **Unresolved questions:** No street/coordinates., Whether operations had begun by 2026-09-17 is not confirmed on a later Micron page in this pass.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://investors.micron.com/news/press-release/2025/Micron-Breaks-Ground-on-New-HBM-Advanced-Packaging-Facility-in-Singapore-01-08-2025/default.aspx
- **Facility webpage:** https://investors.micron.com/news/press-release/2025/Micron-Breaks-Ground-on-New-HBM-Advanced-Packaging-Facility-in-Singapore-01-08-2025/default.aspx
- **Public contact email:** investorrelations@micron.com
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **Micron Technology** — Micron Breaks Ground on New HBM Advanced Packaging Facility in Singapore
  - URL: https://investors.micron.com/news/press-release/2025/Micron-Breaks-Ground-on-New-HBM-Advanced-Packaging-Facility-in-Singapore-01-08-2025/default.aspx
  - Organization: Micron Technology
  - Source type: company_press_release
  - Publication/document date: 2025-01-08
  - Claims supported by **this** source only: groundbreaking Singapore; adjacent to current Singapore facilities; first HBM AP facility in Singapore; operations scheduled 2026; meaningful expansion calendar 2027; approximately US$7B

#### sk-hynix-cheongju

- **Stable research ID:** `sk-hynix-cheongju`
- **Canonical name:** SK hynix Cheongju Campus
- **Aliases:** M11, M12, M15, M17
- **Category:** semiconductor_fab
- **Owner/operator:** owner=SK hynix; operator=SK hynix
- **Location:** Cheongju, Chungcheongbuk-do, South Korea
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** expansion; announced=2026-08-07; construction_start=null; operational_date=null
- **Fab production role:** Existing NAND campus (M11, M12, M15). M17 planned as new NAND fab. One campus record.
- **Capacity note:** M17: 19.1 trillion won; ~680,000 m²; break ground February next year relative to the 7 Aug 2026 PR; first cleanroom December 2028.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=M17 206,000 pyeong (~680,000 m²).
- **Related facility IDs:** sk-hynix-icheon, sk-hynix-yongin
- **Relationship notes:** Same company, different city from Icheon/Yongin.
- **Unresolved questions:** No street/coordinates., M17 is future NAND, not HBM wafer.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://news.skhynix.com/en/fab-facility-investment-2026/
- **Facility webpage:** https://news.skhynix.com/en/fab-facility-investment-2026/
- **Public contact email:** global_pr@skhynix.com
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **SK hynix** — SK hynix Invests 54 Trillion Won in Yongin Y2 and Cheongju M17
  - URL: https://news.skhynix.com/en/fab-facility-investment-2026/
  - Organization: SK hynix
  - Source type: company_press_release
  - Publication/document date: 2026-08-07
  - Claims supported by **this** source only: Cheongju campus houses M11, M12, M15; M17 new NAND fab; 19.1 trillion won; first cleanroom December 2028; break ground February next year

#### sk-hynix-icheon

- **Stable research ID:** `sk-hynix-icheon`
- **Canonical name:** SK hynix Icheon Campus
- **Aliases:** Hynix Icheon, Bubal-eup campus
- **Category:** semiconductor_fab
- **Owner/operator:** owner=SK hynix; operator=SK hynix
- **Location:** Icheon, Gyeonggi, South Korea
- **Coordinates:** 37.2501447, 127.4820653
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** OSM named industrial feature 하이닉스반도체 in Bubal-eup, Icheon. SK hynix 2026 investment PR treats Icheon as an existing manufacturing base distinct from Yongin and Cheongju. No official street was in the PR fetched.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Existing DRAM/HBM manufacturing base (company describes Icheon among current bases). Exact HBM line IDs are not in the 2026 Y2/M17 PR.
- **Related facility IDs:** sk-hynix-yongin, sk-hynix-cheongju, sk-hynix-indiana-west-lafayette
- **Relationship notes:** Korea wafer source for Indiana advanced packaging per SK hynix Indiana PR. Not a duplicate of Yongin/Cheongju.
- **Unresolved questions:** PR does not give a street or name a specific Icheon fab building., HBM vs DRAM split on this campus is not stated.
- **Verification confidence:** medium
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://news.skhynix.com/en/fab-facility-investment-2026/
- **Facility webpage:** https://news.skhynix.com/en/fab-facility-investment-2026/
- **Public contact email:** global_pr@skhynix.com
- **Missing important fields:** street_address, process_nodes

**Sources (do not impute unlisted claims):**

- **SK hynix** — SK hynix Invests 54 Trillion Won in Yongin Y2 and Cheongju M17
  - URL: https://news.skhynix.com/en/fab-facility-investment-2026/
  - Organization: SK hynix
  - Source type: company_press_release
  - Publication/document date: 2026-08-07
  - Claims supported by **this** source only: Icheon listed among existing manufacturing bases together with Cheongju and Yongin; HBM and next-generation DRAM context for the broader investment

#### sk-hynix-yongin

- **Stable research ID:** `sk-hynix-yongin`
- **Canonical name:** SK hynix Yongin Semiconductor Cluster
- **Aliases:** Yongin Y1, Yongin Y2, Wonsam cluster
- **Category:** semiconductor_fab
- **Owner/operator:** owner=SK hynix; operator=SK hynix
- **Location:** Yongin, Gyeonggi, South Korea
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** PR locates the cluster in Wonsam-myeon, Cheoin-gu, Yongin-si. That is a township, not a geocoded pin in this pass.
- **Lifecycle status:** under_construction; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Greenfield DRAM/HBM cluster. Y1 under construction (first cleanroom target February next year relative to 7 Aug 2026). Y2 second of four fabs; HBM and next-generation DRAM; first cleanroom June 2029.
- **Capacity note:** Master plan 600 trillion won; Y2 35.2 trillion won; cluster ~4,160,000 m².
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Approximately 1.26 million pyeong (~4,160,000 m²) in Wonsam-myeon, Cheoin-gu, Yongin-si.
- **Related facility IDs:** sk-hynix-icheon, sk-hynix-indiana-west-lafayette
- **Relationship notes:** Future Korea DRAM/HBM wafer campus; Indiana is packaging, not this site.
- **Unresolved questions:** Y1 vs Y2 footprints not separated., No coordinates.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://news.skhynix.com/en/fab-facility-investment-2026/
- **Facility webpage:** https://news.skhynix.com/en/fab-facility-investment-2026/
- **Public contact email:** global_pr@skhynix.com
- **Missing important fields:** latitude, longitude, street_address

**Sources (do not impute unlisted claims):**

- **SK hynix** — SK hynix Invests 54 Trillion Won in Yongin Y2 and Cheongju M17
  - URL: https://news.skhynix.com/en/fab-facility-investment-2026/
  - Organization: SK hynix
  - Source type: company_press_release
  - Publication/document date: 2026-08-07
  - Claims supported by **this** source only: Yongin Semiconductor Cluster Wonsam-myeon Cheoin-gu Yongin-si; Y1 construction toward February next year cleanroom; Y2 DRAM/HBM; Y2 cleanroom June 2029; four fabs planned; cluster area figure

#### samsung-hwaseong

- **Stable research ID:** `samsung-hwaseong`
- **Canonical name:** Samsung Foundry Hwaseong
- **Aliases:** S3 Hwaseong
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Samsung Electronics; operator=Samsung Foundry
- **Location:** Hwaseong, Gyeonggi, South Korea
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Samsung Foundry page: Hwaseong (2000) employs EUV; 'Hwaseong now produces the 10nm to 3nm processes'. 12-inch S3 is Matured & Advanced.
- **Process nodes (as sourced):** 10nm, 3nm
- **Wafer size:** 300mm
- **Related facility IDs:** samsung-pyeongtaek
- **Relationship notes:** Korea foundry triad with Pyeongtaek and Giheung. Giheung is not mapped in this pass (page describes it as matured 350nm–8nm).
- **Unresolved questions:** No street/coordinates.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/
- **Facility webpage:** https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude

**Sources (do not impute unlisted claims):**

- **Samsung Semiconductor** — Manufacturing sites
  - URL: https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/
  - Organization: Samsung Semiconductor
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Hwaseong, Korea; EUV; 10nm to 3nm processes; 12-inch S3 Matured & Advanced

#### samsung-pyeongtaek

- **Stable research ID:** `samsung-pyeongtaek`
- **Canonical name:** Samsung Foundry Pyeongtaek
- **Aliases:** Pyongtaek fab, S5
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Samsung Electronics; operator=Samsung Foundry
- **Location:** Pyeongtaek, Gyeonggi, South Korea
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Samsung Foundry page: Pyeongtaek (S5) is the advanced-node 12-inch line in the Korea triad; page text says it mass-produces further advanced nodes. Exact nanometer labels are not in the table beyond 'Advanced'.
- **Wafer size:** 300mm
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Korea triad (Giheung, Hwaseong, Pyeongtaek) described as within about an 18-mile radius.
- **Related facility IDs:** samsung-hwaseong
- **Relationship notes:** Same foundry network as Hwaseong; different city. Not a duplicate.
- **Unresolved questions:** No street or coordinates on the foundry sites page., S6 line in the table has a blank city.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/
- **Facility webpage:** https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, named process nodes

**Sources (do not impute unlisted claims):**

- **Samsung Semiconductor** — Manufacturing sites
  - URL: https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/
  - Organization: Samsung Semiconductor
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Pyeongtaek, Korea listed as a manufacturing site; 12-inch S5 Pyeongtaek Advanced; HPC/Datacenter among product applications at the foundry network; Pyeongtaek described as mass-producing further advanced nodes

#### tsmc-ap6-zhunan

- **Stable research ID:** `tsmc-ap6-zhunan`
- **Canonical name:** TSMC Advanced Backend Fab 6 (Zhunan)
- **Aliases:** AP6, Advanced Backend Fab 6
- **Category:** semiconductor_fab
- **Owner/operator:** owner=TSMC; operator=TSMC
- **Location:** 1, Kezhuan 1st Rd., Zhunan Township, Zhunan, Miaoli, Taiwan
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Official address did not geocode in Nominatim.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Advanced backend / packaging fab listed on TSMC's official fabs directory. Included because advanced packaging is in-scope for AI accelerators. The directory page does not state CoWoS/InFO product names.
- **Related facility IDs:** null
- **Relationship notes:** Distinct published address from Fab 15 Taichung and Fab 18 Tainan.
- **Unresolved questions:** Coordinates unknown., Directory does not name the packaging technology.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Facility webpage:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Public contact email:** null
- **Missing important fields:** latitude, longitude, packaging technology

**Sources (do not impute unlisted claims):**

- **TSMC** — TSMC Fabs directory
  - URL: https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
  - Organization: TSMC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Advanced Backend Fab 6; 1, Kezhuan 1st Rd., Zhunan Township, Miaoli 350-012

#### tsmc-fab-18-tainan

- **Stable research ID:** `tsmc-fab-18-tainan`
- **Canonical name:** TSMC Fab 18 (Tainan / Southern Taiwan Science Park)
- **Aliases:** Fab 18A, Fab 18B, TSMC Model Fab
- **Category:** semiconductor_fab
- **Owner/operator:** owner=TSMC; operator=TSMC
- **Location:** 8, Beiyuan Rd. 2, Southern Taiwan Science Park, Tainan, Tainan, Taiwan
- **Coordinates:** 23.116067, 120.2614511
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** 18A and 18B share the same published street. Pin is OSM named feature 台積電南科18廠, not a surveyed building footprint.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Leading-edge logic wafer fab campus in STSP Tainan. NIST EA identifies Fab 18 as the Model Fab copied for TSMC Arizona. Process nodes are not listed on the TSMC Fabs directory page fetched.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Fab 18A and Fab 18B listed at the same address.
- **Related facility IDs:** tsmc-arizona-phoenix
- **Relationship notes:** Model Fab for Arizona copy-exact (NIST EA). Not a duplicate of Arizona.
- **Unresolved questions:** Nodes/capacity not on the directory page., 18A vs 18B building footprints not separated.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Facility webpage:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Public contact email:** null
- **Missing important fields:** process_nodes, wafer_size

**Sources (do not impute unlisted claims):**

- **TSMC** — TSMC Fabs directory
  - URL: https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
  - Organization: TSMC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Fab 18A and Fab 18B; 8, Beiyuan Rd. 2, Southern Taiwan Science Park, Tainan 745-093
- **NIST / CHIPS Program Office** — Draft Environmental Assessment for TSMC Arizona
  - URL: https://www.nist.gov/system/files/documents/2024/06/04/TSMC%20Draft%20EA%20June%203%202024%20.pdf
  - Organization: NIST / CHIPS Program Office
  - Source type: government_record
  - Publication/document date: 2024-06-03
  - Claims supported by **this** source only: Fab 18 in Tainan is the Model Fab copied for TSMC Arizona

#### tsmc-fab-20-hsinchu

- **Stable research ID:** `tsmc-fab-20-hsinchu`
- **Canonical name:** TSMC Fab 20 (Hsinchu Science Park)
- **Aliases:** Fab 20
- **Category:** semiconductor_fab
- **Owner/operator:** owner=TSMC; operator=TSMC
- **Location:** 1, Kehuan Rd., Hsinchu Science Park, Hsinchu, Hsinchu, Taiwan
- **Coordinates:** 24.7644311, 121.0054336
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Official address from TSMC Fabs directory. Pin is OSM named feature 'TSMC Fab 20'. Distinct from Fab 12 addresses in the same park.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Hsinchu leading-edge/logic fab listed separately from Fab 12A/12B. Nodes not stated on the directory page.
- **Related facility IDs:** null
- **Relationship notes:** Same science park as older Hsinchu fabs; different published address from Fab 12A/12B. Not merged.
- **Unresolved questions:** Process nodes not on the directory page.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Facility webpage:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Public contact email:** null
- **Missing important fields:** process_nodes

**Sources (do not impute unlisted claims):**

- **TSMC** — TSMC Fabs directory
  - URL: https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
  - Organization: TSMC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Fab 20; 1, Kehuan Rd., Hsinchu Science Park, Hsinchu 308-001

#### intel-gordon-moore-park-oregon

- **Stable research ID:** `intel-gordon-moore-park-oregon`
- **Canonical name:** Intel Gordon Moore Park at Ronler Acres (D1X)
- **Aliases:** Ronler Acres, D1X, Hillsboro development factory
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Intel; operator=Intel
- **Location:** Hillsboro, OR, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Intel 2022 press kit: leading-edge D1X development factory on the ~500-acre Ronler Acres campus, renamed Gordon Moore Park; headquarters of Technology Development (~10,000 employees). Nodes currently running are not stated on that kit.
- **Capacity note:** Mod3 D1X expansion described as more than $3B (2022 kit).
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Nearly 500-acre campus.
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** No street/coordinates in the 2022 kit., Current production node not stated there.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-expands-oregon.html
- **Facility webpage:** https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-expands-oregon.html
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, process_nodes

**Sources (do not impute unlisted claims):**

- **Intel** — Intel Opens Factory Expansion in Oregon, Renames Site for Gordon Moore
  - URL: https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-expands-oregon.html
  - Organization: Intel
  - Source type: company_press_release
  - Publication/document date: 2022-04-11
  - Claims supported by **this** source only: D1X leading-edge factory Hillsboro Oregon; campus renamed Gordon Moore Park at Ronler Acres; nearly 500 acres; Mod3 more than $3B expansion

#### intel-ocotillo-arizona

- **Stable research ID:** `intel-ocotillo-arizona`
- **Canonical name:** Intel Ocotillo Campus (Chandler)
- **Aliases:** Fab 52, Fab 62, Intel Arizona
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Intel; operator=Intel
- **Location:** Chandler, AZ, United States
- **Coordinates:** 33.2413543, -111.8849114
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Intel press kits name the Ocotillo campus in Chandler and Fab 52/62. Pin is OSM named feature 'Intel Corporation (Ocotillo campus)'. No official street was in the press-kit pages fetched.
- **Lifecycle status:** expansion; announced=2021-03-01; construction_start=null; operational_date=null
- **Fab production role:** Intel Tech Tour 2025 press kit: Fab 52 is the fifth high-volume fab at Ocotillo and produces Intel 18A; Panther Lake manufactured at Fab 52. Fab 62 is part of the same 2021 two-fab groundbreaking and is not given a separate pin.
- **Process nodes (as sourced):** Intel 18A
- **Capacity note:** 2021 groundbreaking press kit: $20B for Fab 52 and Fab 62 at Ocotillo.
- **Related facility IDs:** null
- **Relationship notes:** One campus record for Fab 52/62 rather than two buildings.
- **Unresolved questions:** Fab 62 construction/node status not independently pinned., No official street.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-builds-arizona.html
- **Facility webpage:** https://newsroom.intel.com/press-kit/press-kit-intel-technology-tour-2025
- **Public contact email:** null
- **Missing important fields:** street_address

**Sources (do not impute unlisted claims):**

- **Intel** — Press Kit: Intel Breaks Ground in Arizona
  - URL: https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-builds-arizona.html
  - Organization: Intel
  - Source type: company_press_release
  - Publication/document date: null
  - Claims supported by **this** source only: Ocotillo campus Chandler Arizona; Fab 52 and Fab 62; $20B project; groundbreaking 24 Sep 2021
- **Intel** — Press Kit: Intel Technology Tour 2025
  - URL: https://newsroom.intel.com/press-kit/press-kit-intel-technology-tour-2025
  - Organization: Intel
  - Source type: company_press_release
  - Publication/document date: null
  - Claims supported by **this** source only: Fab 52 Chandler September 2025 photo; Fab 52 fifth high-volume fab at Ocotillo; Intel 18A; Panther Lake manufactured at Fab 52

#### intel-ohio-one

- **Stable research ID:** `intel-ohio-one`
- **Canonical name:** Intel Ohio One
- **Aliases:** Intel New Albany, Ohio One Mod 1 / Mod 2
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Intel; operator=Intel
- **Location:** New Albany, OH, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** under_construction; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Two leading-edge chip factories under construction. Intel 2025-02-28: Mod 1 construction complete 2030, operations 2030–2031; Mod 2 construction 2031, operations 2032.
- **Capacity note:** More than $28B investment as stated in the Feb 2025 construction update.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=2; sqft=null; campus=Licking County, Ohio.
- **Related facility IDs:** null
- **Relationship notes:** Same metro as Meta New Albany but a different owner/campus. Not a duplicate.
- **Unresolved questions:** No street/coordinates., Process node not named in the timeline update.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://newsroom.intel.com/corporate/ohio-one-construction-timeline-update
- **Facility webpage:** https://newsroom.intel.com/corporate/ohio-one-construction-timeline-update
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, process_nodes

**Sources (do not impute unlisted claims):**

- **Intel** — Ohio One Construction Timeline Update
  - URL: https://newsroom.intel.com/corporate/ohio-one-construction-timeline-update
  - Organization: Intel
  - Source type: company_press_release
  - Publication/document date: 2025-02-28
  - Claims supported by **this** source only: Ohio One campus New Albany Licking County Ohio; two new leading-edge chip factories; more than $28B; under construction since 2022; Mod 1 complete 2030 operations 2030-2031; Mod 2 complete 2031 operations 2032

#### micron-boise

- **Stable research ID:** `micron-boise`
- **Canonical name:** Micron Boise Leading-Edge DRAM Campus
- **Aliases:** Micron Idaho, Fab ID1
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Micron Idaho Semiconductor Manufacturing (TRITON), LLC; operator=Micron
- **Location:** Boise, ID, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** planned; announced=null; construction_start=null; operational_date=null
- **Fab production role:** NIST: two HVM DRAM fabs in Boise, each ~600,000 sq ft cleanroom, leading-edge DRAM. HBM packaging in the US is described as following the second Idaho fab (SEC exhibit), not as an operating Boise HBM line today.
- **Capacity note:** Part of up to $6.44B CHIPS award covering Idaho, New York, and Virginia.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=2; sqft=null; campus=null
- **Related facility IDs:** micron-singapore-hbm-packaging, micron-hiroshima
- **Relationship notes:** Same company as Hiroshima DRAM/HBM expansion and Singapore HBM packaging; different sites.
- **Unresolved questions:** No street/coordinates., Whether first Idaho fab is already in construction vs planned is not settled by the NIST summary page.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://www.nist.gov/chips/micron-idaho-boise
- **Facility webpage:** https://www.nist.gov/chips/micron-idaho-boise
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, operational_status granularity

**Sources (do not impute unlisted claims):**

- **NIST CHIPS Program Office** — Micron (Idaho)
  - URL: https://www.nist.gov/chips/micron-idaho-boise
  - Organization: NIST CHIPS Program Office
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: Boise Idaho two HVM DRAM fabs; ~600,000 sq ft cleanroom each; leading-edge DRAM; CHIPS award covering Idaho/NY/VA
- **Micron Technology** — SEC exhibit 99.1 (12 June 2025 announcement excerpt)
  - URL: https://www.sec.gov/Archives/edgar/data/723125/000110465925058741/tm2517778d1_ex99-1.htm
  - Organization: Micron Technology
  - Source type: sec_filing
  - Publication/document date: 2025-06-12
  - Claims supported by **this** source only: second leading-edge memory fab in Boise; HBM advanced packaging to the US after the second Idaho fab; Manassas modernization is 1-alpha DRAM not HBM

#### sk-hynix-indiana-west-lafayette

- **Stable research ID:** `sk-hynix-indiana-west-lafayette`
- **Canonical name:** SK hynix Indiana Advanced Packaging (West Lafayette)
- **Aliases:** SK hynix Purdue Research Park, Indiana HBM packaging fab
- **Category:** semiconductor_fab
- **Owner/operator:** owner=SK hynix; operator=SK hynix
- **Location:** West Lafayette, IN, United States
- **Coordinates:** 40.4647693, -86.9297836
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** NIST/SK hynix locate the project at Purdue Research Park / West Lafayette. Nominatim pin is the research-park neighbourhood, not a building.
- **Lifecycle status:** under_construction; announced=null; construction_start=2026-08-27; operational_date=null
- **Fab production role:** HBM advanced packaging and R&D testbed. Wafers produced in Korea, packaged/tested in Indiana. Not a front-end wafer fab.
- **Capacity note:** NIST: ~$3.87B, up to $458M CHIPS. Company 2026-08-28: over $4B; cleanroom by October 2028; mass production H2 2029.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Purdue Research Park, West Lafayette.
- **Related facility IDs:** sk-hynix-icheon, sk-hynix-yongin
- **Relationship notes:** Packaging campus for Korean-made HBM wafers. Same company, not a duplicate of Icheon/Yongin.
- **Unresolved questions:** Park centroid vs future building., NIST mass-production 2H 2028 vs company H2 2029.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://news.skhynix.com/en/groundbreaking-ceremony-in-indiana/
- **Facility webpage:** https://www.nist.gov/chips/sk-hynix-indiana-west-lafayette
- **Public contact email:** global_pr@skhynix.com
- **Missing important fields:** street_address

**Sources (do not impute unlisted claims):**

- **SK hynix** — Groundbreaking Ceremony for HBM Production Base in Indiana
  - URL: https://news.skhynix.com/en/groundbreaking-ceremony-in-indiana/
  - Organization: SK hynix
  - Source type: company_press_release
  - Publication/document date: 2026-08-28
  - Claims supported by **this** source only: West Lafayette Indiana; groundbreaking 27 Aug 2026 local time; advanced packaging for AI memory; Korean wafers packaged in Indiana; cleanroom by October 2028; mass production H2 2029; over $4B; Purdue MOU
- **NIST CHIPS Program Office** — SK hynix (Indiana)
  - URL: https://www.nist.gov/chips/sk-hynix-indiana-west-lafayette
  - Organization: NIST CHIPS Program Office
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: West Lafayette IN 47906; HBM advanced packaging fab and R&D; up to $458M direct funding; $3.87B capex; Purdue University Research Park

#### samsung-taylor-tx

- **Stable research ID:** `samsung-taylor-tx`
- **Canonical name:** Samsung Austin Semiconductor Taylor
- **Aliases:** Samsung Taylor fab, SAS Taylor
- **Category:** semiconductor_fab
- **Owner/operator:** owner=Samsung Austin Semiconductor, LLC; operator=Samsung
- **Location:** Taylor, TX, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** null
- **Lifecycle status:** under_construction; announced=null; construction_start=null; operational_date=null
- **Fab production role:** NIST: two leading-edge logic foundry fabs focused on 2nm plus an R&D fab in Taylor; HPC/AI among end markets. Samsung Taylor page cites the 2024-12-20 CHIPS award.
- **Process nodes (as sourced):** 2nm
- **Capacity note:** NIST: up to $4.745B CHIPS direct funding; Samsung expected to invest more than $37B in the region (NIST/Samsung pages).
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=Samsung foundry sites page: new 5 million ㎡ fab in Taylor.
- **Related facility IDs:** null
- **Relationship notes:** Austin S2 (65–14nm) is not included (trailing relative to AI accelerators).
- **Unresolved questions:** No street address on the pages fetched., Production-start date not on those pages.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** https://semiconductor.samsung.com/sas/company/taylor/
- **Facility webpage:** https://www.nist.gov/chips/samsung-electronics-texas-taylor
- **Public contact email:** null
- **Missing important fields:** street_address, latitude, longitude, operational_date

**Sources (do not impute unlisted claims):**

- **Samsung Austin Semiconductor** — Taylor \| US Fab
  - URL: https://semiconductor.samsung.com/sas/company/taylor/
  - Organization: Samsung Austin Semiconductor
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: new site in Taylor, Texas; CHIPS award 20 Dec 2024 cited; two new leading-edge logic fabs and R&D in Taylor plus Austin expansion
- **NIST CHIPS Program Office** — Samsung Electronics (Texas)
  - URL: https://www.nist.gov/chips/samsung-electronics-texas-taylor
  - Organization: NIST CHIPS Program Office
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: Taylor and Austin, Texas; up to $4.745B direct funding; two leading-edge logic fabs focused on 2nm and an R&D fab in Taylor; HPC and AI among end markets
- **Samsung Semiconductor** — Manufacturing sites
  - URL: https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/
  - Organization: Samsung Semiconductor
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Taylor, Texas listed; Advanced node; 5 million ㎡ fab in Taylor

#### tsmc-arizona-phoenix

- **Stable research ID:** `tsmc-arizona-phoenix`
- **Canonical name:** TSMC Arizona Phoenix Campus
- **Aliases:** TSMC Arizona Corporation, TSMC Fab 21 (OSM/common name)
- **Category:** semiconductor_fab
- **Owner/operator:** owner=TSMC Arizona Corporation; operator=TSMC
- **Location:** 5088 W. Innovation Circle, Phoenix, AZ, United States
- **Coordinates:** 33.7778581, -112.1621572
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Official street did not geocode in Nominatim. Pin is the OSM named feature 'TSMC Arizona Fab 21' in Phoenix. TSMC's own fabs directory does not use the Fab 21 number.
- **Lifecycle status:** expansion; announced=null; construction_start=null; operational_date=null
- **Fab production role:** Leading-edge logic foundry campus for HPC/AI customer silicon; advanced packaging facilities are planned on the same campus and are not split into a separate map entity in this pass.
- **Process nodes (as sourced):** N4, N5, N3, N2, A16
- **Capacity note:** NIST CHIPS page: three greenfield leading-edge fabs in the award description. TSMC Arizona public page (search extract; full fetch timed out) describes a larger multi-fab plus packaging build-out. Those two descriptions are not reconciled here.
- **Facility facts:** facility_MW=null; IT_MW=null; buildings=null; sqft=null; campus=TSMC Arizona page extract: campus spanning over 1,100 acres.
- **Related facility IDs:** tsmc-fab-18-tainan
- **Relationship notes:** NIST EA materials describe Arizona as a copy-exact of TSMC Fab 18 (Tainan Model Fab). Same company, different countries; not duplicates.
- **Unresolved questions:** NIST three-fab CHIPS description vs later TSMC Arizona multi-fab/packaging description., OSM 'Fab 21' name vs TSMC directory name., Full TSMC Arizona HTML fetch timed out.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.tsmc.com/static/abouttsmcaz/index.htm
- **Facility webpage:** https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
- **Public contact email:** tsmc_azinfo@tsmc.com
- **Missing important fields:** wafer_size, building-level coordinates for 5088 W Innovation Circle

**Sources (do not impute unlisted claims):**

- **TSMC** — TSMC Fabs directory
  - URL: https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs
  - Organization: TSMC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: TSMC Arizona Corporation; 5088 W. Innovation Circle, Phoenix, AZ 85083
- **NIST CHIPS Program Office** — TSMC Arizona (Phoenix)
  - URL: https://www.nist.gov/chips/tsmc-arizona-phoenix
  - Organization: NIST CHIPS Program Office
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: Phoenix AZ 85083; up to $6.6B CHIPS direct funding; more than $65B capex in the award write-up; Fab 1 4nm/5nm; Fab 2 3nm; Fab 3 A16/2nm; HVP timelines as stated on that page; chips for HPC and AI GPUs/CPUs
- **TSMC** — TSMC Arizona site (search-indexed extract; full fetch timed out 2026-09-17)
  - URL: https://www.tsmc.com/static/abouttsmcaz/index.htm
  - Organization: TSMC
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Phoenix employees; N4 high-volume production started Q4 2024 (extract); subsequent fab/packaging phases as stated on that page extract; contact tsmc_azinfo@tsmc.com

### 4.4 Power Infrastructure

#### crane-clean-energy-center

- **Stable research ID:** `crane-clean-energy-center`
- **Canonical name:** Crane Clean Energy Center (Three Mile Island Unit 1 restart)
- **Aliases:** CCEC, TMI Unit 1, Christopher M. Crane Clean Energy Center
- **Category:** power_infrastructure
- **Owner/operator:** owner=Constellation Energy Generation, LLC; operator=Constellation
- **Location:** Londonderry Township, PA, United States
- **Coordinates:** 40.1439488, -76.7235993
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Nominatim returned the Three Mile Island generating-station complex (helipad/Unit 2 airport feature) in Londonderry Township. Not a Unit 1 building footprint.
- **Lifecycle status:** planned; announced=2024-09-20; construction_start=null; operational_date=null
- **Documented compute relationship:** Constellation's 20-year PPA with Microsoft is explicitly to purchase energy from the restarted plant to help match Microsoft data-center load in PJM. NRC draft EA (Federal Register summary) also cites that PPA as CEG's stated need. This is a plant-specific restart tied to data-center demand, not a generic nearby generator. It is not behind-the-meter to a single mapped Microsoft campus in this dataset.
- **Power facts:** MW=835; source=nuclear; utility=PJM
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** 2024 PR online date 2028 vs later press about possible 2027 restart — not reconciled from Constellation's 2024 PR alone., Not tied to one mapped Microsoft campus.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.constellationenergy.com/news/2024/Constellation-to-Launch-Crane-Clean-Energy-Center-Restoring-Jobs-and-Carbon-Free-Power-to-The-Grid.html
- **Facility webpage:** https://www.constellationenergy.com/news/2024/Constellation-to-Launch-Crane-Clean-Energy-Center-Restoring-Jobs-and-Carbon-Free-Power-to-The-Grid.html
- **Public contact email:** null
- **Missing important fields:** street_address

**Sources (do not impute unlisted claims):**

- **Constellation** — Constellation to Launch Crane Clean Energy Center
  - URL: https://www.constellationenergy.com/news/2024/Constellation-to-Launch-Crane-Clean-Energy-Center-Restoring-Jobs-and-Carbon-Free-Power-to-The-Grid.html
  - Organization: Constellation
  - Source type: company_press_release
  - Publication/document date: 2024-09-20
  - Claims supported by **this** source only: 20-year PPA with Microsoft; restart TMI Unit 1 as Crane Clean Energy Center; Microsoft to purchase energy to help match PJM data-center power; about 835 MW; online expected 2028 in this PR; Londonderry PA dateline
- **U.S. NRC / Federal Register republication** — Draft EA/FONSI for CCEC restart (91 FR 34658 summary)
  - URL: https://thefederalregister.org/documents/2026-11377/constellation-energy-generation-llc-christopher-m-crane-clean-energy-center-draft-environmental-assessment-and-draft-fin
  - Organization: U.S. NRC / Federal Register republication
  - Source type: government_record
  - Publication/document date: null
  - Claims supported by **this** source only: Christopher M. Crane Clean Energy Center; 835 MWe; CEG cites 20-year PPA with Microsoft for data centers in PJM

#### fermi-matador-gas-generation

- **Stable research ID:** `fermi-matador-gas-generation`
- **Canonical name:** Fermi America Project Matador Gas Power Plant
- **Aliases:** Project Matador power plant
- **Category:** power_infrastructure
- **Owner/operator:** owner=Fermi Equipment Holdco, LLC (Fermi America) per TCEQ narrative; operator=null
- **Location:** TX, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** Carson County greenfield; no lat/lon in the TCEQ extract.
- **Lifecycle status:** planned; announced=null; construction_start=null; operational_date=null
- **Documented compute relationship:** TCEQ narrative: the plant will provide electricity solely to an on-site hyperscale data-center campus designed for next-generation data and AI infrastructure and will not sell power to the local utility grid.
- **Power facts:** MW=6000; source=natural gas combined cycle; utility=null
- **Related facility IDs:** fermi-project-matador-campus
- **Relationship notes:** null
- **Unresolved questions:** No coordinates., Whether any turbines are already on site is not in the extract.
- **Verification confidence:** high
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** null
- **Facility webpage:** https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398
- **Public contact email:** null
- **Missing important fields:** latitude, longitude, city

**Sources (do not impute unlisted claims):**

- **Texas Commission on Environmental Quality** — Fermi America Project Matador air-permit narrative
  - URL: https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398
  - Organization: Texas Commission on Environmental Quality
  - Source type: permit
  - Publication/document date: null
  - Claims supported by **this** source only: Carson County Texas greenfield; 90 Siemens SGT-800 plus 3 GE 6B turbines; nominal ~6,000 MW; pipeline-quality natural gas; power solely onsite for hyperscale AI data center; not sold to local utility

#### kairos-hermes-2-oak-ridge

- **Stable research ID:** `kairos-hermes-2-oak-ridge`
- **Canonical name:** Kairos Power Hermes 2 Demonstration Plant
- **Aliases:** Hermes 2, KP-FHR Oak Ridge
- **Category:** power_infrastructure
- **Owner/operator:** owner=Kairos Power; operator=Kairos Power
- **Location:** Oak Ridge, TN, United States
- **Coordinates:** 35.9352633, -84.3923554
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Kairos: Heritage Center / former K-33 at East Tennessee Technology Park. Nominatim pin is the ETTP brownfield relation, not the Hermes 2 building.
- **Lifecycle status:** under_construction; announced=null; construction_start=null; operational_date=null
- **Documented compute relationship:** Kairos and Google: Hermes 2 is the first deployment under the Google multi-plant advanced-reactor agreement. A Kairos–TVA PPA will deliver up to 50 MW to the TVA grid that powers Google data centers in Tennessee and Alabama. Grid-mediated, not a behind-the-meter pin on a specific Google campus in this dataset.
- **Power facts:** MW=50; source=advanced nuclear (KP-FHR / fluoride salt-cooled high-temperature reactor); utility=Tennessee Valley Authority
- **Related facility IDs:** null
- **Relationship notes:** null
- **Unresolved questions:** ETTP centroid vs reactor building., Hermes 1 vs Hermes 2 footprints., Groundbreaking PR date not parsed as ISO in the fetch.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.kairospower.com/locations/tennessee
- **Facility webpage:** https://www.kairospower.com/updates/kairos-power-breaks-ground-on-hermes-2-demonstration-plant
- **Public contact email:** null
- **Missing important fields:** street_address, announced_date ISO

**Sources (do not impute unlisted claims):**

- **Kairos Power** — Tennessee Location
  - URL: https://www.kairospower.com/locations/tennessee
  - Organization: Kairos Power
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: Hermes series at former ETTP / Heritage Center / K-33 Oak Ridge; Kairos owner/operator; Hermes 2 co-located with Hermes; nuclear construction of Hermes started May 2025; both expected operational before end of decade
- **Kairos Power** — Kairos Power Breaks Ground on Hermes 2 Demonstration Plant
  - URL: https://www.kairospower.com/updates/kairos-power-breaks-ground-on-hermes-2-demonstration-plant
  - Organization: Kairos Power
  - Source type: company_press_release
  - Publication/document date: null
  - Claims supported by **this** source only: groundbreaking Hermes 2 Oak Ridge; up to 50 MW to TVA grid; helping decarbonize Google data centers in Tennessee and Alabama; K-33 site
- **Kairos Power** — Google, Kairos Power, TVA Collaborate
  - URL: https://www.kairospower.com/updates/google-kairos-power-tva-collaborate-to-meet-americas-growing-energy-needs
  - Organization: Kairos Power
  - Source type: company_press_release
  - Publication/document date: null
  - Claims supported by **this** source only: PPA Kairos–TVA up to 50 MW; TVA grid that powers Google data centers in TN and AL; Hermes 2 first deployment under Google 500 MW by 2035 agreement; operations scheduled 2030 in this PR

#### susquehanna-steam-electric-station

- **Stable research ID:** `susquehanna-steam-electric-station`
- **Canonical name:** Susquehanna Steam Electric Station
- **Aliases:** Susquehanna nuclear plant, SSES
- **Category:** power_infrastructure
- **Owner/operator:** owner=Talen Energy (90% interest per Talen page); operator=Talen Energy
- **Location:** Salem Township, PA, United States
- **Coordinates:** 41.0922705, -76.1479523
- **Coordinate precision:** campus (campus_centroid)
- **Coordinate notes:** Nominatim named industrial feature 'Susquehanna Steam Electric Station', Salem Township, Luzerne County. Matches Talen CNO bio location text.
- **Lifecycle status:** operational; announced=null; construction_start=null; operational_date=null
- **Documented compute relationship:** Talen states it developed a co-located data-center campus powered by Susquehanna and in March 2024 sold that campus to AWS, with behind-the-meter and later grid supply for AWS AI/cloud operations. The plant is mapped as power infrastructure distinct from the AWS data-center campus.
- **Power facts:** MW=2500; source=nuclear; utility=PJM / Talen
- **Related facility IDs:** aws-cumulus-susquehanna
- **Relationship notes:** null
- **Unresolved questions:** Behind-the-meter MW currently delivered to AWS vs 960 MW envelope is not broken out on the pages fetched.
- **Verification confidence:** high
- **Research ingest_ready flag:** True
- **Derived map_ingest_ready:** true
- **Last verified date:** 2026-09-17
- **Official website:** https://www.talenenergy.com/powering-data/
- **Facility webpage:** https://www.talenenergy.com/powering-data/
- **Public contact email:** null
- **Missing important fields:** street_address

**Sources (do not impute unlisted claims):**

- **Talen Energy** — Powering Data
  - URL: https://www.talenenergy.com/powering-data/
  - Organization: Talen Energy
  - Source type: company_facility_page
  - Publication/document date: null
  - Claims supported by **this** source only: co-located data center campus powered by Susquehanna; March 2024 AWS transaction; June 2025 grid expansion in Pennsylvania for AI/cloud; two-unit ~2,500 MW station in Salem Township Luzerne County; 2.5 GW gross / 2.2 net GW at 90% interest
- **Talen Energy** — Talen Energy Announces Sale of Zero-Carbon Data Center Campus
  - URL: https://ir.talenenergy.com/news-releases/news-release-details/talen-energy-announces-sale-zero-carbon-data-center-campus/
  - Organization: Talen Energy
  - Source type: company_press_release
  - Publication/document date: 2024-03-04
  - Claims supported by **this** source only: sale of Cumulus campus; power from Susquehanna nuclear plant

#### xai-colossus-onsite-gas-turbines

- **Stable research ID:** `xai-colossus-onsite-gas-turbines`
- **Canonical name:** xAI Colossus On-site Gas Turbines (Memphis)
- **Aliases:** CTC Property turbines, Colossus Memphis turbines
- **Category:** power_infrastructure
- **Owner/operator:** owner=null; operator=null
- **Location:** 3231 Paul R. Lowry Road, Memphis, TN, United States
- **Coordinates:** null
- **Coordinate precision:** null (null)
- **Coordinate notes:** US Colossus 1 research geocoded 3231 Paul R. Lowry Road for the data center. These turbines are described as on that site; a separate turbine coordinate was not published in the press cited. Do not invent a second pin.
- **Lifecycle status:** null; announced=null; construction_start=null; operational_date=null
- **Documented compute relationship:** Commercial Appeal (15 Feb 2025) reports an air-permit application to operate 15 natural-gas turbines at the Memphis supercomputer / Colossus site, described as powering the facility. This is on-site generation for a mapped GPU cluster, not a generic nearby plant. Primary permit PDF was not fetched in this pass.
- **Power facts:** MW=null; source=natural gas turbines (on-site); utility=MLGW / TVA (grid) plus on-site turbines
- **Related facility IDs:** xai-colossus-1
- **Relationship notes:** null
- **Unresolved questions:** No primary permit PDF in this pass., Turbine MW not in the article extract used., Whether to pin turbines separately from Colossus 1 or treat as campus equipment.
- **Verification confidence:** medium
- **Research ingest_ready flag:** False
- **Derived map_ingest_ready:** false
- **Last verified date:** 2026-09-17
- **Official website:** null
- **Facility webpage:** null
- **Public contact email:** null
- **Missing important fields:** primary permit, power_capacity_mw, latitude

**Sources (do not impute unlisted claims):**

- **Commercial Appeal** — xAI wants to keep using gas turbines in Memphis: Documents
  - URL: https://www.commercialappeal.com/story/money/business/2025/02/13/xai-gas-turbines-at-memphis-supercomputer/78540969007/
  - Organization: Commercial Appeal
  - Source type: industry_press
  - Publication/document date: 2025-02-13
  - Claims supported by **this** source only: 15 natural gas turbines at Memphis supercomputer; air permit application; CTC Property affiliate named in reporting; turbines described as powering Colossus / Phase II pending TVA/MLGW infrastructure

## 5. Facility Relationships

Shared coordinates are **not** automatic duplicates. Relationships below are explicit.

| From | To | Type | Notes |
| --- | --- | --- | --- |
| `openai-stargate-abilene` | `crusoe-abilene-stargate-campus` | `hosted_by` | OpenAI Stargate Abilene hosted on the Crusoe/Lancium campus. |
| `lambda-dfw-04` | `aligned-dfw-04-plano` | `hosted_by` | Lambda cluster at Aligned DFW-04 Plano. |
| `jupiter-supercomputer` | `fzj-jupiter-host` | `hosted_by` | JUPITER hosted on the Forschungszentrum Jülich campus. |
| `stargate-uae-cluster` | `uae-us-ai-campus-abu-dhabi` | `hosted_by` | Stargate UAE 1GW cluster being built inside the UAE–US AI Campus. |
| `nebius-vineland-cluster` | `dataone-vineland` | `hosted_by` | Nebius cluster at DataOne Vineland campus. |
| `meta-prometheus` | `meta-new-albany` | `hosted_by` | Meta Prometheus cluster on the New Albany campus. |
| `iren-horizon-1` | `iren-childress` | `hosted_by` | IREN Horizon 1 Microsoft tranche hosted on the Childress campus. |
| `coreweave-polaris-forge-1` | `applied-digital-polaris-forge-1` | `hosted_by` | CoreWeave cluster hosted at Applied Digital Polaris Forge 1 (landlord/tenant). |
| `lumi-supercomputer` | `csc-kajaani-lumi-host` | `hosted_by` | LUMI hosted in CSC Kajaani data center. |
| `sk-hynix-yongin` | `sk-hynix-indiana-west-lafayette` | `packaging_for` | Future Korea DRAM/HBM wafers vs Indiana backend. |
| `intel-ocotillo-arizona` | `intel-ohio-one` | `same_program` | Same company, different US campuses. |
| `meta-richland-parish` | `meta-hyperion` | `same_campus` | US research treated these as the same Louisiana campus under two names — do not ingest both without reconciliation. |
| `microsoft-sweden-gavle` | `microsoft-sweden-staffanstorp` | `same_program` | Same Sweden datacenter region; different named cities. |
| `samsung-hwaseong` | `samsung-pyeongtaek` | `same_program` | Samsung Foundry Korea triad; different cities. |
| `microsoft-fairwater-atlanta` | `microsoft-fairwater-mount-pleasant` | `same_program` | Microsoft Fairwater family / AI WAN superfactory, different states. |
| `sk-hynix-icheon` | `sk-hynix-indiana-west-lafayette` | `packaging_for` | Company: Korean wafers packaged/tested in Indiana. |
| `tsmc-fab-18-tainan` | `tsmc-arizona-phoenix` | `same_program` | NIST EA: Arizona copy-exact of Tainan Fab 18 Model Fab. |
| `xai-colossus-onsite-gas-turbines` | `xai-colossus-1` | `supplies_power_to` | Press: on-site turbines at the Memphis Colossus site (permit PDF not fetched). |
| `kairos-hermes-2-oak-ridge` | `google-tn-al-unspecified` | `supplies_power_to` | Kairos–TVA PPA up to 50 MW for Google data centers in Tennessee and Alabama; those Google campuses are not separately mapped here. |
| `fermi-matador-gas-generation` | `fermi-project-matador-campus` | `supplies_power_to` | TCEQ: generation solely for on-site AI data center. |
| `crane-clean-energy-center` | `microsoft-pjmunspecified` | `supplies_power_to` | Constellation–Microsoft 20-year PPA for PJM data-center matching; not pinned to one mapped Microsoft campus. |
| `susquehanna-steam-electric-station` | `aws-cumulus-susquehanna` | `supplies_power_to` | Talen: AWS campus adjacent to Susquehanna; behind-the-meter and later grid supply. |
| `microsoft-fairwater-mount-pleasant` | `microsoft-fairwater-atlanta` | `related` | Second Fairwater-family site in Atlanta is linked by Microsoft's dedicated AI WAN as an 'AI superfactory.' Microsoft also said identical Fairwater datacenters were under construction at other unspecified US locations as of Sep 2025. |
| `microsoft-fairwater-atlanta` | `microsoft-fairwater-mount-pleasant` | `related` | Microsoft states Fairwater Atlanta began operation in October 2025 and is networked with Fairwater Wisconsin as an AI superfactory. Campus land/owner is QTS. |
| `meta-new-albany` | `meta-prometheus` | `related` | Physical campus for the Prometheus GPU supercluster. |
| `meta-prometheus` | `meta-new-albany` | `related` | Named AI supercluster on the New Albany campus, not a second street address. |
| `meta-richland-parish` | `meta-hyperion` | `related` | Physical campus for the Hyperion cluster. |
| `meta-hyperion` | `meta-richland-parish` | `related` | Hyperion is the named training cluster housed in the Richland Parish campus. |
| `google-council-bluffs` | `google-cedar-rapids` | `related` | Same 2025 Iowa AI/cloud investment package as the new Cedar Rapids campus. |
| `google-cedar-rapids` | `google-council-bluffs` | `related` | New Iowa campus alongside Council Bluffs expansion. |
| `google-pryor-mayes-county` | `google-stillwater` | `related` | Same 2025 Oklahoma AI/cloud package as new Stillwater campus. |
| `google-stillwater` | `google-pryor-mayes-county` | `related` | Cited related_facility_ids |
| `applied-digital-polaris-forge-1` | `coreweave-polaris-forge-1` | `related` | Landlord campus; CoreWeave is long-term tenant of the 400 MW deployment. |
| `coreweave-polaris-forge-1` | `applied-digital-polaris-forge-1` | `related` | Tenant GPU cloud on Applied Digital's Polaris Forge 1 campus. Not a second building inventory. |
| `iren-childress` | `iren-horizon-1` | `related` | Campus contains Horizon 1–4 Microsoft GB300 halls plus other IREN Cloud capacity. |
| `iren-horizon-1` | `iren-childress` | `related` | Microsoft is the contracted user of dedicated GPU infrastructure; IREN owns/operates the Childress halls (SEC 8-K: IE US Hardware 3 Inc.). |
| `crusoe-abilene-stargate-campus` | `openai-stargate-abilene` | `related` | Land/energy developer: Lancium. DC design/build/operator: Crusoe. Cloud operator for OpenAI: Oracle OCI. Bloomberg (2026-03-06) reported Oracle/OpenAI scrapped a planned expansion near this flagship — not verified on company pages reviewed. |
| `openai-stargate-abilene` | `crusoe-abilene-stargate-campus` | `related` | Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites. |
| `openai-stargate-abilene` | `vantage-lighthouse-port-washington` | `related` | Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites. |
| `openai-stargate-abilene` | `oracle-shackelford` | `related` | Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites. |
| `openai-stargate-abilene` | `project-jupiter-dona-ana` | `related` | Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites. |
| `openai-stargate-abilene` | `related-the-barn-saline` | `related` | Customer: OpenAI. Cloud operator: Oracle OCI. Physical DC: Crusoe on Lancium land. Other Stargate campuses are separate sites. |
| `xai-colossus-1` | `xai-colossus-2` | `related` | Colossus 2 is a second Memphis campus on Tulane Road, not an extra count of this building. |
| `xai-colossus-2` | `xai-colossus-1` | `related` | Second Memphis campus, distinct from 3231 Paul R. Lowry Road Colossus 1. |
| `oracle-shackelford` | `openai-stargate-abilene` | `related` | OpenAI/Oracle Stargate expansion site. Vantage's 2025-10-22 Wisconsin PR also refers to 'Frontier, a Texas campus in Shackelford County' as a Vantage investment — may be the same campus or an adjacent development; not merged. |
| `oracle-shackelford` | `vantage-lighthouse-port-washington` | `related` | OpenAI/Oracle Stargate expansion site. Vantage's 2025-10-22 Wisconsin PR also refers to 'Frontier, a Texas campus in Shackelford County' as a Vantage investment — may be the same campus or an adjacent development; not merged. |
| `vantage-lighthouse-port-washington` | `openai-stargate-abilene` | `related` | Midwest Stargate site. Vantage develops/owns campus; Oracle occupies for OpenAI. |
| `vantage-lighthouse-port-washington` | `oracle-shackelford` | `related` | Midwest Stargate site. Vantage develops/owns campus; Oracle occupies for OpenAI. |
| `project-jupiter-dona-ana` | `openai-stargate-abilene` | `related` | Developer: BorderPlex + STACK. Tenant: Oracle for OpenAI. County approved industrial revenue bonds 2025-09-19 (El Paso Matters). |
| `related-the-barn-saline` | `openai-stargate-abilene` | `related` | Developer Related Digital / Blackstone financing. Tenant Oracle for OpenAI Stargate. Contractor Walbridge. |
| `dataone-vineland` | `nebius-vineland-cluster` | `related` | DataOne owns/operates the building; Nebius is tenant for GPU clusters. |
| `nebius-vineland-cluster` | `dataone-vineland` | `related` | Nebius GPU operations inside the DataOne-owned Vineland campus. Not a second building inventory. |
| `aligned-dfw-04-plano` | `lambda-dfw-04` | `related` | Landlord campus; Lambda is the named occupant. |
| `lambda-dfw-04` | `aligned-dfw-04-plano` | `related` | Tenant GPU cloud in Aligned DFW-04. Not double-counted as a second data center. |
| `aws-cumulus-susquehanna` | `susquehanna-steam-electric-station` | `related` | Data-center campus sold by Talen to AWS; physically adjacent to and contractually powered by Susquehanna. Distinct from the nuclear plant record. |
| `fermi-project-matador-campus` | `fermi-matador-gas-generation` | `related` | TCEQ states the gas plant exists to supply the on-site hyperscale data-center campus. Shared Carson County site; not a duplicate. |
| `tsmc-arizona-phoenix` | `tsmc-fab-18-tainan` | `related` | NIST EA materials describe Arizona as a copy-exact of TSMC Fab 18 (Tainan Model Fab). Same company, different countries; not duplicates. |
| `tsmc-fab-18-tainan` | `tsmc-arizona-phoenix` | `related` | Model Fab for Arizona copy-exact (NIST EA). Not a duplicate of Arizona. |
| `samsung-pyeongtaek` | `samsung-hwaseong` | `related` | Same foundry network as Hwaseong; different city. Not a duplicate. |
| `samsung-hwaseong` | `samsung-pyeongtaek` | `related` | Korea foundry triad with Pyeongtaek and Giheung. Giheung is not mapped in this pass (page describes it as matured 350nm–8nm). |
| `sk-hynix-icheon` | `sk-hynix-yongin` | `related` | Korea wafer source for Indiana advanced packaging per SK hynix Indiana PR. Not a duplicate of Yongin/Cheongju. |
| `sk-hynix-icheon` | `sk-hynix-cheongju` | `related` | Korea wafer source for Indiana advanced packaging per SK hynix Indiana PR. Not a duplicate of Yongin/Cheongju. |
| `sk-hynix-icheon` | `sk-hynix-indiana-west-lafayette` | `related` | Korea wafer source for Indiana advanced packaging per SK hynix Indiana PR. Not a duplicate of Yongin/Cheongju. |
| `sk-hynix-cheongju` | `sk-hynix-icheon` | `related` | Same company, different city from Icheon/Yongin. |
| `sk-hynix-cheongju` | `sk-hynix-yongin` | `related` | Same company, different city from Icheon/Yongin. |
| `sk-hynix-yongin` | `sk-hynix-icheon` | `related` | Future Korea DRAM/HBM wafer campus; Indiana is packaging, not this site. |
| `sk-hynix-yongin` | `sk-hynix-indiana-west-lafayette` | `related` | Future Korea DRAM/HBM wafer campus; Indiana is packaging, not this site. |
| `sk-hynix-indiana-west-lafayette` | `sk-hynix-icheon` | `related` | Packaging campus for Korean-made HBM wafers. Same company, not a duplicate of Icheon/Yongin. |
| `sk-hynix-indiana-west-lafayette` | `sk-hynix-yongin` | `related` | Packaging campus for Korean-made HBM wafers. Same company, not a duplicate of Icheon/Yongin. |
| `micron-boise` | `micron-singapore-hbm-packaging` | `related` | Same company as Hiroshima DRAM/HBM expansion and Singapore HBM packaging; different sites. |
| `micron-boise` | `micron-hiroshima` | `related` | Same company as Hiroshima DRAM/HBM expansion and Singapore HBM packaging; different sites. |
| `micron-hiroshima` | `micron-boise` | `related` | Cited related_facility_ids |
| `micron-hiroshima` | `micron-singapore-hbm-packaging` | `related` | Cited related_facility_ids |
| `micron-singapore-hbm-packaging` | `micron-boise` | `related` | Packaging site complementary to DRAM wafer fabs. |
| `micron-singapore-hbm-packaging` | `micron-hiroshima` | `related` | Packaging site complementary to DRAM wafer fabs. |
| `susquehanna-steam-electric-station` | `aws-cumulus-susquehanna` | `related` | Cited related_facility_ids |
| `fermi-matador-gas-generation` | `fermi-project-matador-campus` | `related` | Cited related_facility_ids |
| `xai-colossus-onsite-gas-turbines` | `xai-colossus-1` | `related` | Cited related_facility_ids |
| `microsoft-sweden-gavle` | `microsoft-sweden-staffanstorp` | `related` | Same Azure region; distinct named cities. |
| `microsoft-sweden-staffanstorp` | `microsoft-sweden-gavle` | `related` | Same Sweden region as Gävle; distinct city. |
| `csc-kajaani-lumi-host` | `lumi-supercomputer` | `related` | Host data center for the LUMI GPU supercomputer. Shared coordinates are expected; not a duplicate entity. |
| `lumi-supercomputer` | `csc-kajaani-lumi-host` | `related` | GPU supercomputer hosted inside the CSC Kajaani data center. |
| `fzj-jupiter-host` | `jupiter-supercomputer` | `related` | Host campus for JUPITER. Shared campus coordinates with the cluster record are expected. |
| `jupiter-supercomputer` | `fzj-jupiter-host` | `related` | GPU supercomputer hosted on the FZJ campus. |
| `uae-us-ai-campus-abu-dhabi` | `stargate-uae-cluster` | `related` | Host campus for the Stargate UAE 1GW cluster. One campus, two entities. |
| `stargate-uae-cluster` | `uae-us-ai-campus-abu-dhabi` | `related` | Cluster being built inside the UAE–US AI Campus by Khazna. |

**Relationship types used:** `hosted_by` (GPU/tenant inside a campus), `same_campus` / `same_program` (one company or program, distinct or possibly colliding names), `supplies_power_to` / `powered_by` (documented energy link), `packaging_for` (backend vs wafer campus), `related` (residual `related_facility_ids`).

Power rows whose offtakers are **not** mapped as specific campuses (Crane → Microsoft PJM load; Hermes 2 → Google TN/AL load) keep the offtaker as a narrative entity, not a fake facility id.

## 6. Source Register

| Source Organization | Source | URL | Source Type | Geographic Scope | Category Coverage | Reliability Notes | Ongoing Monitoring Value |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TSMC | TSMC Fabs directory | https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs | company_facility_page | TW/US/JP/CN | semiconductor_fab | Official address directory. Does not state nodes/status. | yes |
| NIST CHIPS Program Office | CHIPS project pages (TSMC AZ, Samsung TX, SK hynix IN, Micron ID) | https://www.nist.gov/chips | government_record | US | semiconductor_fab | Primary for awards; may lag company expansions. | yes |
| Intel Newsroom | Intel manufacturing press kits and PRs | https://newsroom.intel.com/ | company_press_release | US/IE/DE | semiconductor_fab | Primary for status; streets often omitted. | yes |
| Samsung Semiconductor | Foundry manufacturing sites | https://semiconductor.samsung.com/foundry/manufacturing/manufacturing-sites/ | company_facility_page | KR/US | semiconductor_fab | Primary site list; no streets. | yes |
| SK hynix Newsroom | Fab investment and Indiana groundbreaking PRs | https://news.skhynix.com/en/ | company_press_release | KR/US | semiconductor_fab | Primary for HBM packaging and Korea cluster plans. | yes |
| Micron IR | Singapore HBM packaging groundbreaking | https://investors.micron.com/ | company_press_release | SG/US | semiconductor_fab | Primary IR. | yes |
| Constellation | Crane Clean Energy Center / Microsoft PPA | https://www.constellationenergy.com/news/2024/Constellation-to-Launch-Crane-Clean-Energy-Center-Restoring-Jobs-and-Carbon-Free-Power-to-The-Grid.html | company_press_release | US-PA | power_infrastructure | Primary for the Microsoft–TMI restart link. | yes |
| Talen Energy | Powering Data / Cumulus sale | https://www.talenenergy.com/powering-data/ | company_facility_page | US-PA | power_infrastructure\|data_center | Primary for Susquehanna–AWS co-location. | yes |
| TCEQ | Fermi Project Matador permit narrative | https://records.tceq.texas.gov/ | permit | US-TX | power_infrastructure\|data_center | Primary permit text for on-site AI campus power. | yes |
| Kairos Power | Oak Ridge Hermes / Google / TVA | https://www.kairospower.com/locations/tennessee | company_facility_page | US-TN | power_infrastructure | Primary for physical site and Google DC relationship via TVA. | yes |
| Google Data Centers | Location pages (Hamina, Inzai, and US pages used in the US slice) | https://datacenters.google/locations/ | company_facility_page | global | data_center | Primary for named campuses; rarely publishes streets or GPU SKUs. | yes |
| EuroHPC JU | Our Supercomputers / JUPITER release | https://www.eurohpc-ju.europa.eu/ | government_record | EU | gpu_compute_cluster | Primary EU public owner. | yes |
| Forschungszentrum Jülich | JUPITER page | https://www.fz-juelich.de/en/jsc/jupiter | government_record | DE | gpu_compute_cluster | Host-site primary. | yes |
| CSC | Kajaani datacenter / LUMI | https://research.csc.fi/topic/lumi-supercomputer/ | company_facility_page | FI | data_center\|gpu_compute_cluster | Primary street for LUMI host. | yes |
| G42 / PR Newswire | Stargate UAE construction update | https://www.prnewswire.com/news-releases/g42-provides-update-on-construction-of-stargate-uae-ai-infrastructure-cluster-302586430.html | company_press_release | AE | data_center\|gpu_compute_cluster | Primary for construction status; no coordinates. | yes |
| NEXTDC | S3 Sydney | https://www.nextdc.com/data-centres/sydney-data-centres/s3-sydney | company_facility_page | AU | data_center | Primary colo flagship page; no street. | yes |
| NAVER | Data Center GAK | https://navercorp.com/en/service/datacenterGak | company_facility_page | KR | data_center | Primary; no street in fetched HTML. | yes |
| University of Bristol | BriCS / Isambard-AI | https://www.bristol.ac.uk/research/centres/bristol-supercomputing/ | government_record | GB | gpu_compute_cluster | Primary host university page. | yes |
| Prime Minister's Office Singapore | NSCC Aspire 2A launch speech | https://www.pmo.gov.sg/newsroom/dpm-heng-swee-keat-at-the-launch-of-the-national-supercomputing-centre-singapore/ | government_record | SG | gpu_compute_cluster | Primary government speech; no address. | no |
| RIKEN | Access / campus map | https://www.riken.jp/en/access/ | government_record | JP | gpu_compute_cluster | Primary address for R-CCS. | yes |
| Microsoft | ['microsoft-fairwater-mount-pleasant'] | https://news.microsoft.com/source/2026/06/23/microsoft-completes-construction-on-first-datacenter-facility-in-mount-pleasant-wisconsin/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-mount-pleasant'] | yes |
| Microsoft | ['microsoft-fairwater-mount-pleasant'] | https://blogs.microsoft.com/blog/2025/09/18/inside-the-worlds-most-powerful-ai-datacenter/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-mount-pleasant'] | yes |
| Microsoft | ['microsoft-fairwater-atlanta'] | https://news.microsoft.com/source/features/ai/from-wisconsin-to-atlanta-microsoft-connects-datacenters-to-build-its-first-ai-superfactory/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-atlanta'] | yes |
| Microsoft | ['microsoft-fairwater-mount-pleasant'] | https://www.prnewswire.com/news-releases/microsoft-announces-3-3-billion-investment-in-wisconsin-to-spur-artificial-intelligence-innovation-and-economic-growth-302139892.html | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-mount-pleasant'] | yes |
| Wisconsin DNR | ['microsoft-fairwater-mount-pleasant'] | https://apps.dnr.wi.gov/warp_ext/am_permittracking2.aspx?id=35961 | government_record | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-mount-pleasant'] | yes |
| Village of Mount Pleasant | ['microsoft-fairwater-mount-pleasant'] | https://www.mtpleasantwi.gov/Archive/ViewFile/Item/4381 | planning | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-mount-pleasant'] | yes |
| QTS | ['microsoft-fairwater-atlanta'] | https://q.com/data-centers/fayetteville/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-atlanta'] | yes |
| City of Fayetteville via The Citizen | ['microsoft-fairwater-atlanta'] | https://thecitizen.com/2023/06/19/fayetteville-approves-development-agreement-for-612-acre-qts-data-center-on-hwy-54-west/ | government_record | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-atlanta'] | yes |
| Meta | ['meta-new-albany'] | https://datacenters.atmeta.com/ohio-new-albany/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['meta-new-albany'] | yes |
| Meta | ['meta-richland-parish', 'meta-hyperion'] | https://datacenters.atmeta.com/richland-parish-data-center/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['meta-richland-parish', 'meta-hyperion'] | yes |
| Meta | ['meta-richland-parish', 'meta-hyperion'] | https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['meta-richland-parish', 'meta-hyperion'] | yes |
| Meta | ['meta-prometheus', 'meta-hyperion'] | https://engineering.fb.com/2025/09/29/data-infrastructure/metas-infrastructure-evolution-and-the-advent-of-ai/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['meta-prometheus', 'meta-hyperion'] | yes |
| Meta | ['meta-eagle-mountain'] | https://datacenters.atmeta.com/2021/07/utah-county-we-are-online/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['meta-eagle-mountain'] | yes |
| Meta | ['meta-eagle-mountain'] | https://datacenters.atmeta.com/2026/09/deepening-our-investment-in-eagle-mountain-utah/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['meta-eagle-mountain'] | yes |
| Amazon | ['aws-new-carlisle'] | https://www.aboutamazon.com/news/aws/aws-indiana-investment-11-billion | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['aws-new-carlisle'] | yes |
| State of Indiana / IEDC | ['aws-new-carlisle'] | https://events.in.gov/event/gov-holcomb-announces-amazon-web-services-plans-to-invest-11b-to-create-a-new-data-center-campus-in-northern-indiana | economic_development | US | data_center\|gpu_compute_cluster | Used for ['aws-new-carlisle'] | yes |
| Amazon | ['aws-morrow-county'] | https://assets.aboutamazon.com/fc/65/e3944125451698e1de8d734e2ac7/easternoregon-eis-factsheet-2022.pdf | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['aws-morrow-county'] | yes |
| Google | ['google-council-bluffs', 'google-cedar-rapids'] | https://blog.google/feed/new-7-billion-investment-iowa/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['google-council-bluffs', 'google-cedar-rapids'] | yes |
| Google | ['google-council-bluffs'] | https://datacenters.google/locations/iowa/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['google-council-bluffs'] | yes |
| Google | ['google-pryor-mayes-county', 'google-stillwater'] | https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-oklahoma/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['google-pryor-mayes-county', 'google-stillwater'] | yes |
| Applied Digital | ['applied-digital-polaris-forge-1', 'coreweave-polaris-forge-1'] | https://ir.applieddigital.com/news-events/press-releases/detail/133/applied-digital-achieves-ready-for-service-for-phase-1-at | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['applied-digital-polaris-forge-1', 'coreweave-polaris-forge-1'] | yes |
| Applied Digital | ['applied-digital-polaris-forge-1'] | https://ir.applieddigital.com/news-events/press-releases/detail/157/applied-digital-delivers-second-building-at-polaris-forge-1 | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['applied-digital-polaris-forge-1'] | yes |
| North Dakota DEQ | ['applied-digital-polaris-forge-1'] | https://deq.nd.gov/aq/Notices/AppliedDigital/DRAFT_ACP18338v1_0.pdf | permit | US | data_center\|gpu_compute_cluster | Used for ['applied-digital-polaris-forge-1'] | yes |
| IREN | ['iren-childress'] | https://www.iren.com/data-centers/childress | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['iren-childress'] | yes |
| IREN / SEC | ['iren-childress', 'iren-horizon-1'] | https://www.sec.gov/Archives/edgar/data/1878848/000114036125040072/ef20058139_ex99-1.htm | sec_filing | US | data_center\|gpu_compute_cluster | Used for ['iren-childress', 'iren-horizon-1'] | yes |
| IREN / SEC | ['iren-horizon-1'] | https://www.sec.gov/Archives/edgar/data/1878848/000114036126032638/ef20080141_ex99-1.htm | sec_filing | US | data_center\|gpu_compute_cluster | Used for ['iren-horizon-1'] | yes |
| TDLR | ['iren-childress'] | https://www.tdlr.texas.gov/TABS/Search/Print/TABS2024024946 | permit | US | data_center\|gpu_compute_cluster | Used for ['iren-childress'] | yes |
| Crusoe | ['crusoe-abilene-stargate-campus', 'openai-stargate-abilene'] | https://www.crusoe.ai/resources/newsroom/crusoe-announces-flagship-abilene-data-center-is-live | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['crusoe-abilene-stargate-campus', 'openai-stargate-abilene'] | yes |
| TCEQ | ['crusoe-abilene-stargate-campus'] | https://www.tceq.texas.gov/assets/public/permitting/air/publicnotice/37589sop.pdf | permit | US | data_center\|gpu_compute_cluster | Used for ['crusoe-abilene-stargate-campus'] | yes |
| xAI | ['xai-colossus-1'] | https://x.ai/colossus | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['xai-colossus-1'] | yes |
| NVIDIA | ['xai-colossus-1'] | https://nvidianews.nvidia.com/news/spectrum-x-ethernet-networking-xai-colossus | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['xai-colossus-1'] | yes |
| Oracle | ['oracle-shackelford'] | https://www.oracle.com/data-centers/shackelford-county/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['oracle-shackelford'] | yes |
| Oracle | ['project-jupiter-dona-ana'] | https://www.oracle.com/news/announcement/blog/oracle-advances-american-ai-innovation-in-new-mexico-2026-01-23/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['project-jupiter-dona-ana'] | yes |
| Oracle | ['related-the-barn-saline'] | https://www.oracle.com/news/announcement/blog/oracle-is-set-to-power-on-new-data-center-in-michigan-2025-1018/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['related-the-barn-saline'] | yes |
| Vantage Data Centers | ['vantage-lighthouse-port-washington'] | https://vantage-dc.com/data-center-locations/north-america/port-washington-wisconsin | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['vantage-lighthouse-port-washington'] | yes |
| Vantage Data Centers | ['vantage-lighthouse-port-washington'] | https://vantage-dc.com/news/openai-oracle-and-vantage-data-centers-announce-stargate-data-center-site-in-wisconsin/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['vantage-lighthouse-port-washington'] | yes |
| STACK Infrastructure | ['project-jupiter-dona-ana'] | https://www.stackinfra.com/about/news-press/press-releases/stack-infrastructure-reinforces-responsible-development-principles-through-project-jupiter-in-new-mexico/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['project-jupiter-dona-ana'] | yes |
| Related Digital | ['related-the-barn-saline'] | https://www.related.com/press-releases/2026-06-01/related-digital-blackstone-oracle-openai-walbridge-and-governor-whitmer | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['related-the-barn-saline'] | yes |
| Saline Township | ['related-the-barn-saline'] | https://salinetownship.org/go.php?id=731&table=page_uploads | government_record | US | data_center\|gpu_compute_cluster | Used for ['related-the-barn-saline'] | yes |
| CoreWeave | ['coreweave-plano-coit'] | https://www.prnewswire.com/news-releases/coreweave-opens-new-texas-data-center-to-expand-access-to-high-performance-gpus-301884897.html | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['coreweave-plano-coit'] | yes |
| City of Plano | ['coreweave-plano-coit'] | https://plano.novusagenda.com/Agendapublic/AttachmentViewer.ashx?AttachmentID=20088&ItemID=10008 | economic_development | US | data_center\|gpu_compute_cluster | Used for ['coreweave-plano-coit'] | yes |
| CoreWeave | ['coreweave-lancaster-pa'] | https://coreweave.com/news/coreweave-announces-multi-billion-dollar-commitment-to-ai-infrastructure-in-pennsylvania | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['coreweave-lancaster-pa'] | yes |
| Nebius | ['dataone-vineland', 'nebius-vineland-cluster'] | https://nebius.com/vinelandnj | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['dataone-vineland', 'nebius-vineland-cluster'] | yes |
| Aligned Data Centers | ['aligned-dfw-04-plano', 'lambda-dfw-04'] | https://aligneddc.com/press-release/aligned-and-lambda-partner-to-power-next-generation-ai-infrastructure-6/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['aligned-dfw-04-plano', 'lambda-dfw-04'] | yes |
| Switch | ['switch-citadel-tahoe-reno'] | https://www.switch.com/switch-tahoe-reno-data-center-now-open/ | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['switch-citadel-tahoe-reno'] | yes |
| CyrusOne / Calpine | ['cyrusone-dfw10-bosque'] | https://www.cyrusone.com/resources/press-releases/cyrusone-and-calpine-announce-newhyperscale-data-center-development-in-texas | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['cyrusone-dfw10-bosque'] | yes |
| OLCF / ORNL | ['ornl-frontier'] | https://www.olcf.ornl.gov/olcf-resources/compute-systems/frontier/ | government_record | US | data_center\|gpu_compute_cluster | Used for ['ornl-frontier'] | yes |
| ALCF / Argonne | ['anl-aurora'] | https://www.alcf.anl.gov/aurora | government_record | US | data_center\|gpu_compute_cluster | Used for ['anl-aurora'] | yes |
| Intel | ['anl-aurora'] | https://www.intc.com/news-events/press-releases/detail/1631/aurora-supercomputer-blade-installation-complete | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['anl-aurora'] | yes |
| LLNL / NNSA ASC | ['llnl-el-capitan'] | https://asc.llnl.gov/exascale/el-capitan | government_record | US | data_center\|gpu_compute_cluster | Used for ['llnl-el-capitan'] | yes |
| The Columbus Dispatch | ['meta-new-albany', 'meta-prometheus'] | https://www.dispatch.com/story/business/information-technology/2025/09/26/meta-facebook-data-center-new-albany-ohio/86314973007/ | industry_press | US | data_center\|gpu_compute_cluster | Used for ['meta-new-albany', 'meta-prometheus'] | yes |
| Mortenson | ['meta-richland-parish'] | https://www.mortenson.com/projects/richland-parish-data-center | industry_press | US | data_center\|gpu_compute_cluster | Used for ['meta-richland-parish'] | yes |
| WBRC | ['microsoft-fairwater-atlanta'] | https://www.wbrc.com/2026/07/17/questions-raise-about-massive-data-center-georgia-qts-pursues-plans-build-campus-bessemer/ | industry_press | US | data_center\|gpu_compute_cluster | Used for ['microsoft-fairwater-atlanta'] | yes |
| USA Today / Commercial Appeal | ['xai-colossus-1', 'xai-colossus-2'] | https://www.usatoday.com/story/money/business/development/2026/01/15/xai-elon-musk-campuses-memphis-southaven/88066070007/ | industry_press | US | data_center\|gpu_compute_cluster | Used for ['xai-colossus-1', 'xai-colossus-2'] | yes |
| Commercial Appeal | ['xai-colossus-2'] | https://www.commercialappeal.com/story/money/business/development/2025/07/15/elon-musk-xai-in-memphis-colossus-2/85215548007/ | industry_press | US | data_center\|gpu_compute_cluster | Used for ['xai-colossus-2'] | yes |
| KTXS | ['crusoe-abilene-stargate-campus'] | https://ktxs.com/news/local/lancium-crusoe-executives-brief-abilene-leaders-on-major-northside-investment | industry_press | US | data_center\|gpu_compute_cluster | Used for ['crusoe-abilene-stargate-campus'] | yes |
| El Paso Matters | ['project-jupiter-dona-ana'] | https://elpasomatters.org/2025/09/19/project-jupiter-data-center-santa-teresa-approved-dona-ana-commissioners/ | industry_press | US | data_center\|gpu_compute_cluster | Used for ['project-jupiter-dona-ana'] | yes |
| Dallas Morning News | ['aligned-dfw-04-plano'] | https://www.dallasnews.com/business/real-estate/2025/05/07/nvidia-backed-ai-computing-firm-has-plans-for-700-m-plano-data-center/ | financial_press | US | data_center\|gpu_compute_cluster | Used for ['aligned-dfw-04-plano'] | yes |
| City of Vineland Planning Board | ['dataone-vineland'] | https://www.vinelandcity.org/Archive/Planning%20Board/Minutes/2025/Minutes%206-26-25%20%28Special%20Meeting%29.pdf | planning | US | data_center\|gpu_compute_cluster | Used for ['dataone-vineland'] | yes |
| Nebius Group N.V. | ['dataone-vineland', 'nebius-vineland-cluster'] | https://assets.nebius.com/assets/176ae650-d0b0-45bf-a5ca-240e3769a745/Nebius%20accelerates%20US%20expansion%2C%20adding%20up%20to%20300%20MW%20capacity%20at%20new%20data%20center%20in%20New%20Jersey.pdf | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['dataone-vineland', 'nebius-vineland-cluster'] | yes |
| Switch | ['switch-citadel-tahoe-reno'] | https://www.switch.com/tahoe-reno/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['switch-citadel-tahoe-reno'] | yes |
| Switch | ['switch-citadel-tahoe-reno'] | https://www.switch.com/ai-factories/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['switch-citadel-tahoe-reno'] | yes |
| Amazon | ['aws-morrow-county'] | https://sustainability.aboutamazon.com/aws-sustainability-fact-sheets/aws-fact-sheet-oregon.pdf | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['aws-morrow-county'] | yes |
| Meta | ['meta-new-albany'] | https://datacenters.atmeta.com/us-locations/ | company_facility_page | US | data_center\|gpu_compute_cluster | Used for ['meta-new-albany'] | yes |
| Applied Digital | ['applied-digital-polaris-forge-1'] | https://ir.applieddigital.com/news-events/press-releases/detail/137/applied-digital-completes-phase-ii-ready-for-service-at | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['applied-digital-polaris-forge-1'] | yes |
| IREN | ['iren-childress', 'iren-horizon-1'] | https://iren.com/resources/blog/iren-signs97-billion-agreement-with-microsoft-to-deploy-ai-cloud-infrastructure | company_press_release | US | data_center\|gpu_compute_cluster | Used for ['iren-childress', 'iren-horizon-1'] | yes |
| Richland Parish Data Center project site | Home | https://www.richlandparishdatacenter.com/ | company_facility_page | United States | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Indiana Economic Development Corporation | GlobeNewswire reprint of IEDC announcement | https://www.globenewswire.com/news-release/2024/04/25/2869483/0/en/Gov-Holcomb-announces-Amazon-Web-Services-plans-to-invest-11B-to-create-a-new-data-center-campus-in-Northern-Indiana.html | economic_development | United States | data_center | Harvested from facility evidence; not independently graded beyond the record. | no |
| Nebius | 300 MW New Jersey region | https://nebius.com/blog/posts/300-mw-new-jersey-and-iceland-regions | company_press_release | United States | gpu_compute_cluster | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Talen Energy | Talen Energy Announces Sale of Zero-Carbon Data Center Campus | https://ir.talenenergy.com/news-releases/news-release-details/talen-energy-announces-sale-zero-carbon-data-center-campus/ | company_press_release | United States | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Texas Commission on Environmental Quality | Fermi America Project Matador air-permit narrative | https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398 | permit | United States | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| KVII / ABC7 Amarillo | Fermi signs $6.5 billion lease for data center | https://abc7amarillo.com/news/local/fermi-america-signs-six-point-five-billion-dollar-lease-for-worlds-largest-data-center-after-months-of-turmoil-tensorwave-amarillo-texas-carson-county-water-city-council-greg-abbott-audir | industry_press | United States | data_center | Harvested from facility evidence; not independently graded beyond the record. | no |
| NIST CHIPS Program Office | TSMC Arizona (Phoenix) | https://www.nist.gov/chips/tsmc-arizona-phoenix | government_record | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| TSMC | TSMC Arizona site (search-indexed extract; full fetch timed out 2026-09-17) | https://www.tsmc.com/static/abouttsmcaz/index.htm | company_facility_page | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| NIST / CHIPS Program Office | Draft Environmental Assessment for TSMC Arizona | https://www.nist.gov/system/files/documents/2024/06/04/TSMC%20Draft%20EA%20June%203%202024%20.pdf | government_record | Taiwan | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| TSMC / Bosch / Infineon / NXP | Joint venture to bring advanced semiconductor manufacturing to Europe | https://pr.tsmc.com/english/news/3049 | company_press_release | Germany | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Landeshauptstadt Dresden | Richtfest bei ESMC | https://www.dresden.de/de/wirtschaft/tomorrowshome/news/2026/esmc-richtfest.php | government_record | Germany | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Samsung Austin Semiconductor | Taylor \| US Fab | https://semiconductor.samsung.com/sas/company/taylor/ | company_facility_page | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| NIST CHIPS Program Office | Samsung Electronics (Texas) | https://www.nist.gov/chips/samsung-electronics-texas-taylor | government_record | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Intel | Intel Invests €5 Billion to Expand Manufacturing in Europe | https://www.intel.com/content/www/us/en/newsroom/news/artificial-intelligence/intel-invests-5-billion-euro-to-expand-manufacturing-in-europe.html | company_press_release | Ireland | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Intel | Intel to Repurchase 49% Equity Interest in Ireland Fab Joint Venture | https://www.intel.com/content/www/us/en/newsroom/news/corporate/intel-repurchase-49-equity-interest-ireland-fab-joint-venture.html | company_press_release | Ireland | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Intel | Press Kit: Intel Breaks Ground in Arizona | https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-builds-arizona.html | company_press_release | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Intel | Press Kit: Intel Technology Tour 2025 | https://newsroom.intel.com/press-kit/press-kit-intel-technology-tour-2025 | company_press_release | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Intel | Intel Opens Factory Expansion in Oregon, Renames Site for Gordon Moore | https://www.intel.com/content/www/us/en/newsroom/resources/press-kit-intel-expands-oregon.html | company_press_release | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Intel | Ohio One Construction Timeline Update | https://newsroom.intel.com/corporate/ohio-one-construction-timeline-update | company_press_release | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| SK hynix | SK hynix Invests 54 Trillion Won in Yongin Y2 and Cheongju M17 | https://news.skhynix.com/en/fab-facility-investment-2026/ | company_press_release | South Korea | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| SK hynix | Groundbreaking Ceremony for HBM Production Base in Indiana | https://news.skhynix.com/en/groundbreaking-ceremony-in-indiana/ | company_press_release | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| NIST CHIPS Program Office | SK hynix (Indiana) | https://www.nist.gov/chips/sk-hynix-indiana-west-lafayette | government_record | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| NIST CHIPS Program Office | Micron (Idaho) | https://www.nist.gov/chips/micron-idaho-boise | government_record | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Micron Technology | SEC exhibit 99.1 (12 June 2025 announcement excerpt) | https://www.sec.gov/Archives/edgar/data/723125/000110465925058741/tm2517778d1_ex99-1.htm | sec_filing | United States | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Bloomberg | Micron Breaks Ground on $9 Billion Japan Fab Expansion | https://www.bloomberg.com/news/articles/2026-07-04/micron-breaks-ground-on-9-billion-western-japan-plant-expansion | financial_press | Japan | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | no |
| Micron Technology | Micron Breaks Ground on New HBM Advanced Packaging Facility in Singapore | https://investors.micron.com/news/press-release/2025/Micron-Breaks-Ground-on-New-HBM-Advanced-Packaging-Facility-in-Singapore-01-08-2025/default.aspx | company_press_release | Singapore | semiconductor_fab | Harvested from facility evidence; not independently graded beyond the record. | yes |
| U.S. NRC / Federal Register republication | Draft EA/FONSI for CCEC restart (91 FR 34658 summary) | https://thefederalregister.org/documents/2026-11377/constellation-energy-generation-llc-christopher-m-crane-clean-energy-center-draft-environmental-assessment-and-draft-fin | government_record | United States | power_infrastructure | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Kairos Power | Kairos Power Breaks Ground on Hermes 2 Demonstration Plant | https://www.kairospower.com/updates/kairos-power-breaks-ground-on-hermes-2-demonstration-plant | company_press_release | United States | power_infrastructure | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Kairos Power | Google, Kairos Power, TVA Collaborate | https://www.kairospower.com/updates/google-kairos-power-tva-collaborate-to-meet-americas-growing-energy-needs | company_press_release | United States | power_infrastructure | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Commercial Appeal | xAI wants to keep using gas turbines in Memphis: Documents | https://www.commercialappeal.com/story/money/business/2025/02/13/xai-gas-turbines-at-memphis-supercomputer/78540969007/ | industry_press | United States | power_infrastructure | Harvested from facility evidence; not independently graded beyond the record. | no |
| Google | Hamina, Finland data center location | https://datacenters.google/locations/hamina-finland | company_facility_page | Finland | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Google | Inzai, Japan data center location | https://www.google.com/about/datacenters/locations/inzai-japan/ | company_facility_page | Japan | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Microsoft | Microsoft opens its sustainable datacenter region in Sweden | https://news.microsoft.com/europe/2021/11/16/microsoft-opens-its-sustainable-datacenter-region-in-sweden-creating-new-opportunities-for-a-cloud-first-sweden/ | company_press_release | Sweden | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| Microsoft Sverige | Uppdatering rörande Microsofts datacenter i Staffanstorp | https://news.microsoft.com/sv-se/2022/08/26/uppdatering-rorande-microsofts-datacenter-i-staffanstorp/ | company_press_release | Sweden | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| LUMI / EuroHPC consortium | How did LUMI end up in Finland? | https://lumi-supercomputer.eu/how-did-lumi-end-up-in-finland/ | company_facility_page | Finland | data_center | Harvested from facility evidence; not independently graded beyond the record. | yes |
| EuroHPC Joint Undertaking | Our Supercomputers — LUMI | https://www.eurohpc-ju.europa.eu/supercomputers/our-supercomputers_en | government_record | Finland | gpu_compute_cluster | Harvested from facility evidence; not independently graded beyond the record. | yes |
| EuroHPC Joint Undertaking | Two New EuroHPC Systems Join the TOP500 as JUPITER Remains Among the World's Fastest Supercomputers | https://www.eurohpc-ju.europa.eu/two-new-eurohpc-systems-join-top500-jupiter-remains-among-worlds-fastest-supercomputers-2026-06-23_en | government_record | Germany | gpu_compute_cluster | Harvested from facility evidence; not independently graded beyond the record. | yes |
| RIKEN | Map — Kobe Campus | https://www.riken.jp/en/about/map/ | government_record | Japan | gpu_compute_cluster | Harvested from facility evidence; not independently graded beyond the record. | yes |

## 7. Geographic Coverage

- **Facility records:** 78
- **Countries represented in the facility table:** 12 (Australia, Finland, Germany, Ireland, Japan, Singapore, South Korea, Sweden, Taiwan, United Arab Emirates, United Kingdom, United States)
- **Map-ingest-ready (derived):** 33

### 7.1 By category

| Category | Count | With coordinates | Map-ingest-ready |
| --- | ---: | ---: | ---: |
| Data Center | 35 | 11 | 11 |
| GPU Compute Cluster | 18 | 13 | 12 |
| Semiconductor Fab | 20 | 9 | 7 |
| Power Infrastructure | 5 | 3 | 3 |

### 7.2 By country

| Country | Region | Data Center | GPU Compute Cluster | Semiconductor Fab | Power Infrastructure | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Australia | Oceania | 1 | 0 | 0 | 0 | 1 |
| Finland | Europe | 2 | 1 | 0 | 0 | 3 |
| Germany | Europe | 1 | 1 | 1 | 0 | 3 |
| Ireland | Europe | 0 | 0 | 1 | 0 | 1 |
| Japan | East Asia | 1 | 1 | 2 | 0 | 4 |
| Singapore | Southeast Asia | 0 | 1 | 1 | 0 | 2 |
| South Korea | East Asia | 1 | 0 | 5 | 0 | 6 |
| Sweden | Europe | 2 | 0 | 0 | 0 | 2 |
| Taiwan | East Asia | 0 | 0 | 3 | 0 | 3 |
| United Arab Emirates | Middle East | 1 | 1 | 0 | 0 | 2 |
| United Kingdom | Europe | 0 | 1 | 0 | 0 | 1 |
| United States | North America | 26 | 12 | 7 | 5 | 50 |

### 7.3 By region

| Region | Facility count |
| --- | ---: |
| North America | 50 |
| East Asia | 13 |
| Europe | 10 |
| Middle East | 2 |
| Southeast Asia | 2 |
| Oceania | 1 |

### 7.4 Major gaps

- **Canada:** AWS publishes Canada (Central) and Canada West as regions (Montréal area, Calgary) without a named campus address in the materials used. No Canadian hyperscaler campus row is ingestable.
- **China:** No Alibaba / Tencent / ByteDance / Huawei campus was taken from a company or government primary with a usable site identity. Intentionally empty rather than guessed.
- **United Kingdom hyperscalers:** Isambard-AI is included; Microsoft/Google/AWS UK campuses were not pinned to a street/campus primary in this pass.
- **Middle East beyond UAE:** Stargate UAE / Khazna host campus is included without coordinates. Saudi HUMAIN/SDAIA sites were not verified.
- **Southeast Asia beyond Singapore:** NSCC is city-only; Malaysia/Indonesia/Thailand AI campuses were not researched to inclusion standard.
- **US hyperscale remainder:** Google city-named US campuses often lack streets (Council Bluffs, Cedar Rapids, Pryor, Stillwater). AWS New Carlisle / Morrow County similarly thin. Northern Virginia was **not** dumped building-by-building.
- **Colocation portfolios:** Equinix, Digital Realty, AirTrunk, STACK, Switch (beyond Citadel), CyrusOne (beyond DFW10) were not fully inventoried.
- **GPU clouds outside the US:** CoreWeave Europe, Northern Data, Fluidstack, Nebius non-US sites were not verified to a campus primary here.
- **Fields with poor availability:** street addresses for hyperscalers; GPU counts except where operators publish them; IT MW; process nodes on TSMC’s public directory; power substation permits for named AI campuses.

## 8. Data Quality / Review Queue

**60 distinct facility IDs** appear in at least one review bucket below. A record can appear in several buckets.

### 8.1 Ambiguous facilities

- `microsoft-fairwater-mount-pleasant` — First operational building vs Durand Avenue / International Drive expansion parcels (DNR 4800 90th vs village 12023 Durand).
- `microsoft-fairwater-atlanta` — Microsoft says Atlanta; physical campus is QTS Fayetteville at 1435 Highway 54 West. Building-level Fairwater vs other QTS tenants unknown.
- `oracle-shackelford` — Oracle campus page vs Vantage 'Frontier' Shackelford County — same site or two?
- `crusoe-abilene-stargate-campus` — TCEQ 'Abilene Data Center Campus' lat/lon assumed to be Stargate; permit name does not say Crusoe/Lancium. No primary street.
- `xai-colossus-1` — 200,000 H100 (xAI headline) vs 180K widget vs NVIDIA Hopper mix vs Musk H200 add-on.
- `xai-colossus-2` — Address strong; operational status and GPU fill as of 2026-09-17 unconfirmed by xAI.
- `meta-prometheus` — 1 GW / 2026 target vs actual energization by verification date.
- `meta-hyperion` — 2 GW vs 5 GW language on Meta pages; Engineering said online beginning 2028.
- `dataone-vineland / nebius-vineland-cluster` — 2025 summer go-live guidance vs 2026 still-under-construction site plans.
- `coreweave-lancaster-pa` — Two unofficial streets ~3 miles apart; CoreWeave PR is city-only.
- `aligned-dfw-04-plano` — Street from Dallas Morning News, not Aligned PR; geocode is the road.
- `switch-citadel-tahoe-reno` — 650 MW (2017 PR) vs later 'gigawatts upon completion'; AI factory occupancy not hall-level.
- `aws-morrow-county` — County cluster, not a named campus; ingest_ready false by design.
- `llnl-el-capitan` — 30 vs ~35 MW; APU count unpublished; national-security vs commercial inclusion policy.
- `tsmc-arizona-phoenix` — NIST three-fab CHIPS write-up vs later TSMC Arizona multi-fab/packaging public description; OSM 'Fab 21' vs TSMC directory name.
- `tsmc-esmc-dresden` — Welcome Center street vs fab polygon; auto/industrial nodes vs AI-accelerator inclusion rule.
- `sk-hynix-indiana-west-lafayette` — NIST 2H 2028 mass production vs company H2 2029.
- `riken-fugaku` — GPU Compute Cluster public category vs CPU (A64FX) architecture.
- `xai-colossus-onsite-gas-turbines` — On-site equipment vs separately pinned power asset; primary permit not fetched.
- `stargate-uae-cluster` — No coordinates; GPU SKU/operator split not in G42 PR.
- `aws-cumulus-susquehanna` — Adjacent-campus relationship is documented; campus polygon is not.
- `crane-clean-energy-center` — PPA is for Microsoft PJM data-center load generally, not one mapped building.
- `micron-hiroshima` — Secondary Bloomberg plus OSM name; Micron Japan IR not fetched.
- `fermi-project-matador-campus` — TCEQ AI campus is primary; TensorWave lease is local TV.

### 8.2 Uncertain coordinates

- **Null latitude/longitude (42):** `meta-richland-parish`, `meta-hyperion`, `meta-eagle-mountain`, `aws-new-carlisle`, `aws-morrow-county`, `google-council-bluffs`, `google-cedar-rapids`, `google-pryor-mayes-county`, `google-stillwater`, `oracle-shackelford`, `vantage-lighthouse-port-washington`, `project-jupiter-dona-ana`, `related-the-barn-saline`, `coreweave-lancaster-pa`, `dataone-vineland`, `nebius-vineland-cluster`, `switch-citadel-tahoe-reno`, `cyrusone-dfw10-bosque`, `aws-cumulus-susquehanna`, `fermi-project-matador-campus`, `tsmc-ap6-zhunan`, `samsung-pyeongtaek`, `samsung-hwaseong`, `samsung-taylor-tx`, `intel-leixlip-fab34`, `intel-gordon-moore-park-oregon`, `intel-ohio-one`, `sk-hynix-cheongju`, `sk-hynix-yongin`, `micron-boise`, `micron-singapore-hbm-packaging`, `fermi-matador-gas-generation`, `xai-colossus-onsite-gas-turbines`, `google-hamina`, `google-inzai`, `microsoft-sweden-gavle`, `microsoft-sweden-staffanstorp`, `bristol-isambard-ai`, `uae-us-ai-campus-abu-dhabi`, `stargate-uae-cluster`, `naver-gak-sejong`, `nscc-aspire-2a`
- **City-level precision (1):** `aws-morrow-county`
- Nominatim campus pins that are **named OSM features** rather than surveyed footprints should be spot-checked before go-live (TSMC Arizona Fab 21, TSMC Fab 18/20, Intel Ocotillo, SK hynix Icheon, Micron Hiroshima OSM name, NEXTDC Artarmon, Crane TMI complex, Susquehanna SES, ETTP, Purdue Research Park, JASM Haramizu quarter).

### 8.3 Conflicting sources

- **xAI Colossus 1:** x.ai page states both 200,000 H100s and an 180K widget; do not pick a single count without operator clarification.
- **TSMC Arizona:** NIST CHIPS three-fab award vs TSMC Arizona public expansion (multi-fab + packaging) extract; full TSMC Arizona HTML fetch timed out.
- **SK hynix Indiana:** NIST mass-production 2H 2028 vs company PR H2 2029.
- **Crane / TMI:** 2024 Constellation PR targets 2028 online; later secondary coverage discusses earlier restart possibilities. Status kept `planned`.
- **Meta Louisiana:** `meta-richland-parish` and `meta-hyperion` may be one campus.
- **Fairwater Atlanta:** Microsoft ‘Atlanta’ vs QTS Fayetteville physical campus.

### 8.4 Possible duplicates

- `meta-richland-parish` / `meta-hyperion` — resolve to one Louisiana campus before ingest.
- `microsoft-fairwater-atlanta` is not a second Microsoft building in Atlanta proper; it is the QTS Fayetteville campus under a Microsoft program name.
- `xai-colossus-onsite-gas-turbines` may be campus equipment of `xai-colossus-1` rather than a second map point.
- LUMI/JUPITER host+cluster pairs are **intentional** dual entities, not duplicates.
- Intel Ohio One vs Meta New Albany: same metro, different owners — not duplicates.

### 8.5 Records lacking sufficient primary-source evidence

- `micron-hiroshima` — Bloomberg + OSM name; Micron Japan IR not fetched.
- `xai-colossus-onsite-gas-turbines` — Commercial Appeal on a permit; PDF not fetched.
- `fermi-project-matador-campus` tenant/GPU claims — TCEQ supports the AI campus + on-site power story; TensorWave/AMD is local TV.
- `riken-fugaku` — R-CCS address is primary; the **system name/architecture** is not on the access-page extract used.
- `stargate-uae-cluster` GPU SKU / OpenAI-operator split — not in the G42 PR body fetched; WAM page did not parse.
- Several Google/AWS US campuses remain city-only from company location pages.

### 8.6 Records that should NOT be ingested yet (mapped points)

Do not project onto the map as `mapped` until coordinates (or an explicit unmapped quality workflow) exist and ambiguities above are accepted.

| ID | Why not mapped-ingest |
| --- | --- |
| `meta-richland-parish` | no coordinates |
| `meta-hyperion` | no coordinates |
| `meta-eagle-mountain` | no coordinates |
| `aws-new-carlisle` | no coordinates |
| `aws-morrow-county` | no coordinates; city precision; researcher ingest_ready=false; confidence=medium |
| `google-council-bluffs` | no coordinates |
| `google-cedar-rapids` | no coordinates |
| `google-pryor-mayes-county` | no coordinates |
| `google-stillwater` | no coordinates |
| `oracle-shackelford` | no coordinates; confidence=medium |
| `vantage-lighthouse-port-washington` | no coordinates |
| `project-jupiter-dona-ana` | no coordinates |
| `related-the-barn-saline` | no coordinates |
| `coreweave-lancaster-pa` | no coordinates |
| `dataone-vineland` | no coordinates |
| `nebius-vineland-cluster` | no coordinates; confidence=medium |
| `switch-citadel-tahoe-reno` | no coordinates; confidence=medium |
| `cyrusone-dfw10-bosque` | no coordinates |
| `aws-cumulus-susquehanna` | no coordinates; researcher ingest_ready=false |
| `fermi-project-matador-campus` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `tsmc-jasm-kumamoto` | researcher ingest_ready=false; confidence=medium |
| `tsmc-ap6-zhunan` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `samsung-pyeongtaek` | no coordinates; researcher ingest_ready=false |
| `samsung-hwaseong` | no coordinates; researcher ingest_ready=false |
| `samsung-taylor-tx` | no coordinates; researcher ingest_ready=false |
| `intel-leixlip-fab34` | no coordinates; researcher ingest_ready=false |
| `intel-gordon-moore-park-oregon` | no coordinates; researcher ingest_ready=false |
| `intel-ohio-one` | no coordinates; researcher ingest_ready=false |
| `sk-hynix-cheongju` | no coordinates; researcher ingest_ready=false |
| `sk-hynix-yongin` | no coordinates; researcher ingest_ready=false |
| `micron-boise` | no coordinates; researcher ingest_ready=false |
| `micron-hiroshima` | researcher ingest_ready=false; confidence=medium |
| `micron-singapore-hbm-packaging` | no coordinates; researcher ingest_ready=false |
| `fermi-matador-gas-generation` | no coordinates; researcher ingest_ready=false |
| `xai-colossus-onsite-gas-turbines` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `google-hamina` | no coordinates; researcher ingest_ready=false |
| `google-inzai` | no coordinates; researcher ingest_ready=false |
| `microsoft-sweden-gavle` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `microsoft-sweden-staffanstorp` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `bristol-isambard-ai` | no coordinates; researcher ingest_ready=false |
| `uae-us-ai-campus-abu-dhabi` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `stargate-uae-cluster` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `riken-fugaku` | researcher ingest_ready=false; confidence=medium; taxonomy/architecture |
| `naver-gak-sejong` | no coordinates; researcher ingest_ready=false; confidence=medium |
| `nscc-aspire-2a` | no coordinates; researcher ingest_ready=false; confidence=medium |

### 8.7 Rejected candidates (do not add silently)

**From the US slice:**

- Meta Promontory — No Meta campus by that name. Documented Utah campus is Eagle Mountain. NSA Camp Williams / Promontory Point is not Meta.
- CoreWeave Livingston HQ (290 W Mt Pleasant Ave) — Corporate office, not a GPU/data-center campus.
- Lambda San Jose / Santa Clara / Mountain View directory sites — HQ/offices or directory-only; no primary-source physical AI campus except Aligned DFW-04.
- Equinix Distributed AI / Equinix US portfolio — Product/platform announcement, not a named flagship physical AI campus. Would dump a colocation portfolio.
- Digital Realty IAD44 / Digital Dulles / Ashburn alley buildings — Named NOVA campus exists, but primary pages reviewed do not document it as an AI training campus. User forbade dumping NOVA buildings.
- AWS Northern Virginia buildings — Cloud region without a single named AI campus address in primary sources reviewed.
- Microsoft El Mirage / Goodyear (West US 3) — Documented cloud datacenters; Microsoft primary sources reviewed do not label them Fairwater/AI campuses.
- Google The Dalles — Historic Google DC with a documented address, but 2025–26 Google AI-infrastructure announcements reviewed do not name this campus.
- QTS Fayetteville as a second facility — Same campus as microsoft-fairwater-atlanta (QTS owner, Microsoft Fairwater tenant).
- Core Scientific Denton (8171 Jim Christal Rd) — TDLR permit confirms a Core Scientific conversion; no primary source in this pass tying it to a named CoreWeave/AI cluster.
- Hut 8 Beacon Point / Lambda–Anthropic Nueces County — BetaNews anonymous sourcing; companies did not confirm in sources reviewed.
- CyrusOne DFW7 Fort Worth — Company PR exists (AI-driven compute, 200 MW) but not treated as the CyrusOne flagship for this slice; DFW10 already included.
- Switch Las Vegas CORE AI factories — Review-Journal/county records describe Jones Blvd–215 buildings; Citadel taken as the single Switch flagship to avoid portfolio dump.
- IREN Sweetwater (2,000 MW / 2,200 acres) — Official IREN location page lists it, but this slice targeted Childress; Sweetwater not researched to address/status standard.
- xAI Southaven MS / 2400 Stateline Road — Later expansion in local press, not Colossus 1 or 2.
- xAI Colossus Water Recycling Plant (Plant Road / Paul R. Lowry) — Water infrastructure, not compute.
- Nebius Kansas City colocation — Named in Nebius capacity PR without a documented physical campus identity/address in this pass.
- OpenAI Stargate Abilene 600 MW expansion — OpenAI listed it as potential; Bloomberg later reported the expansion scrapped. Not a separate live campus.
- Wikipedia / datacenters.com / baxtel facility pages — Used only as discovery leads, never as evidence.

**From the fab / power / international pass:**

- AWS Canada (Central) / Canada West — AWS publishes regions (greater Montréal, Calgary) without a named campus street. Region ≠ mappable facility.
- China Alibaba / Tencent / ByteDance / Huawei data centers — No company or PRC government primary page with a specific campus address was successfully verified in this pass. Not guessed.
- Helion–Microsoft fusion plant — No operating or construction-complete generating plant supplying compute was identified. Too early.
- Oklo / Equinix SMR — No mappable physical plant identified in this pass.
- Amazon / X-energy / Energy Northwest SMR (central Washington) — Reported development; Amazon/Energy Northwest primary project page with a specific plant site was not fetched. PPA/development news is not enough.
- Intel Magdeburg — Widely reported cancelled (2025) in secondary press; Intel primary cancellation URL was not fetched. Not ingested.
- Intel Kiryat Gat Fab 38 expansion — Reported paused; no restart primary in this pass.
- Samsung Austin S2 — Samsung foundry page: 65nm–14nm. Out of leading-edge AI accelerator / HBM scope.
- Samsung Giheung — Foundry page: matured 350nm–8nm. Excluded.
- Micron Manassas — SEC exhibit: 1-alpha DRAM modernization for industrial/auto/defense — not documented as HBM/HPC memory in that filing.
- TSMC Fab 10 Shanghai / Fab 16 Nanjing / Fab 11 Camas — Directory-listed but not leading-edge AI logic/HBM packaging in the sources used.
- Hamina heat-recovery plant as Power Infrastructure — District-heat reuse, not generation built to supply compute.
- Generic PJM plants near Microsoft data centers — Crane is the plant Microsoft contracted to restart. Nearby generators without that documented link are excluded.
- Equinix / Digital Realty / AirTrunk full portfolios — No single flagship AI campus primary was pulled beyond NEXTDC S3 in this international pass.
- Saudi HUMAIN / SDAIA campuses — No physical site primary fetched in this pass.
- CoreWeave Europe campuses — No European physical campus primary fetched in this pass.
- Northern Data / Fluidstack named campuses — Not verified to a street/campus primary in this pass.
- NAVER GAK Chuncheon — Documented but deprioritized vs Sejong AI-positioned campus; can be added in a later pass.
- Microsoft Sandviken datacenter — Named in the 2021 Sweden region PR; omitted to avoid three city-only pins for one region. Gävle and Staffanstorp retained as named cities with extra documentation.

### 8.8 Review ID index

`aligned-dfw-04-plano`, `aws-cumulus-susquehanna`, `aws-morrow-county`, `aws-new-carlisle`, `bristol-isambard-ai`, `coreweave-lancaster-pa`, `crane-clean-energy-center`, `crusoe-abilene-stargate-campus`, `cyrusone-dfw10-bosque`, `dataone-vineland`, `dataone-vineland / nebius-vineland-cluster`, `fermi-matador-gas-generation`, `fermi-project-matador-campus`, `google-cedar-rapids`, `google-council-bluffs`, `google-hamina`, `google-inzai`, `google-pryor-mayes-county`, `google-stillwater`, `intel-gordon-moore-park-oregon`, `intel-leixlip-fab34`, `intel-ohio-one`, `lambda-dfw-04`, `llnl-el-capitan`, `meta-eagle-mountain`, `meta-hyperion`, `meta-prometheus`, `meta-richland-parish`, `micron-boise`, `micron-hiroshima`, `micron-singapore-hbm-packaging`, `microsoft-fairwater-atlanta`, `microsoft-fairwater-mount-pleasant`, `microsoft-sweden-gavle`, `microsoft-sweden-staffanstorp`, `naver-gak-sejong`, `nebius-vineland-cluster`, `nscc-aspire-2a`, `oracle-shackelford`, `project-jupiter-dona-ana`, `related-the-barn-saline`, `riken-fugaku`, `samsung-hwaseong`, `samsung-pyeongtaek`, `samsung-taylor-tx`, `sk-hynix-cheongju`, `sk-hynix-icheon`, `sk-hynix-indiana-west-lafayette`, `sk-hynix-yongin`, `stargate-uae-cluster`, `switch-citadel-tahoe-reno`, `tsmc-ap6-zhunan`, `tsmc-arizona-phoenix`, `tsmc-esmc-dresden`, `tsmc-jasm-kumamoto`, `uae-us-ai-campus-abu-dhabi`, `vantage-lighthouse-port-washington`, `xai-colossus-1`, `xai-colossus-2`, `xai-colossus-onsite-gas-turbines`

## 9. Structured-Ingestion Notes

Do **not** ingest this Markdown as JSON. The next step is a schema/database audit, then an ingestion contract.

### 9.1 What the live map can accept today

`UrdaisMapPoint` (`src/types/map.ts`) is deliberately minimal:

| Research field | Map field | Notes |
| --- | --- | --- |
| `id` | `id` | Stable kebab-slug; unique |
| `canonical_name` | `name` | |
| `longitude` / `latitude` | `longitude` / `latitude` | **Required numbers.** Null-coordinate rows cannot be mapped points. |
| derived | `mappingStatus` | `"mapped"` only with valid coords + category; otherwise later `"unmapped"` quality state — not a fifth public category |
| `category` | `category` | Research `gpu_compute_cluster` must map to current enum `compute_cluster` until the app rename ships |
| assembled address | `address` | Optional string, not parsed parts |
| `contact_email` | `contactEmail` | Optional; must pass `isPlausibleEmail` |

`buildMapFeatureCollection` rejects empty ids, duplicate ids, non-finite coords, mapped points without category, and invalid emails. Demo points in `src/data/mock/map-points.ts` are placeholders and must not be mixed with this research.

### 9.2 What the map cannot store yet (needs a later research/profile schema)

Owner, operator, aliases, admin1, coordinate provenance, operational status and dates, GPU vendor/models/counts, MW, campus size, process nodes, wafer size, power source/utility, `compute_relationship`, related facility IDs, source array with `claims_supported`, confidence, ingest flags, unresolved ambiguities.

Recommend a **research facility document** (one JSON object per id) plus a **relationship** list, then a **projection** into `UrdaisMapPoint` for dots.

### 9.3 Suggested later JSON shape (contract only — not generated here)

```json
{
  "id": "kebab-slug",
  "canonical_name": "",
  "aliases": [],
  "category": "data_center | gpu_compute_cluster | semiconductor_fab | power_infrastructure",
  "map_category": "data_center | compute_cluster | semiconductor_fab | power_infrastructure",
  "owner": null,
  "operator": null,
  "location": {
    "street_address": null,
    "city": null,
    "admin1": null,
    "country": null,
    "country_iso": null,
    "latitude": null,
    "longitude": null,
    "coordinate_source": null,
    "coordinate_precision": null,
    "coordinate_notes": null
  },
  "operational_status": null,
  "facts": {},
  "relationships": [{"related_id": "", "type": "", "notes": ""}],
  "sources": [{"org": "", "url": "", "source_type": "", "date": null, "claims_supported": []}],
  "quality": {
    "confidence": "high|medium|low",
    "map_ingest_ready": false,
    "unresolved_ambiguities": [],
    "last_verified_date": "2026-09-17"
  }
}
```

Relationship `type` values to reserve: `hosted_by`, `hosts`, `same_campus`, `supplies_power_to`, `powered_by`, `packaging_for`, `expansion_of`, `same_program`.

### 9.4 Projection rules for a future loader

1. Emit a mapped point only if `map_ingest_ready` is true.
2. Rows with identity but no coordinates may be stored as unmapped **quality** records, never as fake city-centroid dots.
3. Do not attach GPU or MW facts to a source that does not support them.
4. Do not collapse landlord/tenant pairs.
5. Reconcile `gpu_compute_cluster` → `compute_cluster` in the loader until the public legend rename is implemented.
6. Never load demo-* ids alongside production ids.

### 9.5 Database audit (next, not this file)

Before locking the ingestion contract, compare this research model to whatever facility/map tables exist (or still only the client demo list). This file is the research system of record for Phase 1.


---

_End of Phase 1 research package. Facilities: 78. Countries: 12. Sources: 124. Human-review IDs: 60. As of 2026-09-17._
