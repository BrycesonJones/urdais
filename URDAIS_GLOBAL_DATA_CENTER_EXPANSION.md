# Urdais Global Data Center Expansion

_Research artifact compiled 18 September 2026. **Research only.** Not ingested data, not application code, not a map redesign, not a production-database change._

This pass inventories **physical Data Centers**. AI relevance is enrichment, not an inclusion gate. GPU Compute Cluster, Semiconductor Fab, and Power Infrastructure are not expanded here (relationships noted only).

## 1. Executive Summary

| Metric | Count |
| --- | ---: |
| Total researched Data Centers | **464** |
| Country count | **49** |
| Publishable / map-ready (coords + non-city precision) | **22** |
| Research-only | **429** |
| Human-review | **13** |
| Newly discovered (not in Phase 1 DC set) | **429** |
| Existing Phase 1 Data Centers carried forward | **35** |
| Existing Urdais DC location remediations (improved evidence) | **22** |
| Source register entries | **29** |

Outcomes are mutually exclusive and sum to the total:

`22` map-ready + `429` research-only + `13` human-review = **464**.

Phase 3 Class B mixed-category remediation (42 records including fabs/clusters/power) remains in `docs/operations/map-class-b-42-location-remediation.md`. This file counts **Data Center** rows only.

**Weak / incomplete markets this pass:** mainland China (Equinix Shanghai city-only; no Alibaba/Tencent/Huawei campus primary), Saudi Arabia / Qatar / Bahrain / Israel (operator pages not successfully retrieved to a named building), Egypt / Nigeria building-level (Equinix/DLR city only), Czech Republic (no named facility retrieved), Vietnam (no named facility retrieved), Argentina (no named facility retrieved). Khazna claims 30 live UAE DCs but did not name buildings on the homepage retrieved — portfolio not exploded.

## 2. Methodology Applied

### Inclusion / exclusion

- **Include:** named physical hyperscale, cloud-provider, colo, wholesale, carrier-neutral, major enterprise, sovereign, HPC host, AI, campus, and material carrier-hotel facilities; operational, under construction, planned with a site.
- **Exclude:** offices, HQs, server rooms, POPs, cloud regions/AZs without facility identity, CDN edges, cages inside another DC (flagged as human review when suspected), speculative concepts, directory-only duplicates, unverified rows.
- A Data Center does **not** need documented AI/GPU tenancy.

### Source hierarchy

Tier 1 operator/government/permit pages preferred. Tier 2 press used for corroboration. Tier 3 directories used for discovery and, in the Class B remediation, for identity+location when facility match is clear and non-conflicting. Directory MW/certs/customers are **not** copied unless the operator page states them.

### Coordinate rules

- Precision: `building` | `campus` | `street` | `city`.
- Documented street without geocode → keep address, `coordinates = null`, precision street/campus — **not** a city centroid.
- Google locations JSON lat/lon values that match city centroids were **not** stored.
- Teraco operator-published GPS accepted as building/street pins.
- Map-ready requires coordinates **and** non-city precision.

### AI enrichment

`documented_ai` requires explicit facility-level AI/GPU/tenant/cluster evidence. `ai_capable_or_high_density` requires explicit high-density / GPU-ready / liquid-cooling / HPC-ready language for that facility. Equinix/Digital Realty generic “AI-ready” metro marketing is **not** sufficient. Hyperscaler brand ≠ AI.

### Deduplication

Existing Phase 1 IDs preserved. QTS Fayetteville is not a second row for Fairwater Atlanta. Shared city ≠ duplicate (New Albany hosts Meta, Google, QTS, Vantage, Intel). Shared coordinates ≠ automatic duplicate. Campus groups (CyrusOne PHX1–PHX8) kept as one campus unless streets separate them.

## 3. Global Data Center Dataset

Review column is abbreviated. Source keys resolve in §8.

### North America

#### Canada

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-toronto` | Digital Realty Toronto | Digital Realty | Toronto | ON | Canada | operational | null | null | city | unknown | null | dlr_am | Named market. |
| `equinix-calgary` | Equinix Calgary | Equinix | Calgary | AB | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-kamloops` | Equinix Kamloops | Equinix | Kamloops | BC | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-montreal` | Equinix Montreal | Equinix | Montreal | QC | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-ottawa` | Equinix Ottawa | Equinix | Ottawa | ON | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-saint-john` | Equinix Saint John | Equinix | Saint John | NB | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-toronto` | Equinix Toronto | Equinix | Toronto | ON | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-vancouver` | Equinix Vancouver | Equinix | Vancouver | BC | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-winnipeg` | Equinix Winnipeg | Equinix | Winnipeg | MB | Canada | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `vantage-montreal-i` | Vantage Montreal I | Vantage Data Centers | Montreal | null | Canada | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |
| `vantage-montreal-ii` | Vantage Montreal II | Vantage Data Centers | Montreal | null | Canada | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |
| `vantage-montreal-iii` | Vantage Montreal III | Vantage Data Centers | Montreal | null | Canada | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |
| `vantage-quebec-city` | Vantage Quebec City | Vantage Data Centers | Quebec City | null | Canada | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |

#### Mexico

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-queretaro` | Digital Realty Querétaro | Digital Realty | Querétaro | null | Mexico | operational | null | null | city | unknown | null | dlr_am | Named market. Distinct from Equinix Querétaro. |
| `equinix-monterrey` | Equinix Monterrey | Equinix | Monterrey | null | Mexico | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-queretaro` | Equinix Querétaro | Equinix | Querétaro | null | Mexico | operational | null | null | city | no_documented_ai | null | eqx | HUMAN REVIEW: Equinix lists this under Mexico City copy but says strategically located in Querétaro. City identity vs branding. |

#### United States

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aligned-dfw-04-plano` | Aligned DFW-04 Plano | Aligned Data Centers | Plano | TX | United States | under_construction | 601 N. Star Road, Plano, TX | 33.0054184, -96.6535522 | street | documented_ai | ~425,000 sq ft (Dallas Morning News) | p1 | Lambda is named occupant (separate GPU entity). Street from DMN, not Aligned PR body. |
| `applied-digital-polaris-forge-1` | Applied Digital Polaris Forge 1 | Applied Digital | Ellendale | ND | United States | expansion | 9663 / 9685 87th Ave SE, Ellendale, ND 58436 | 46.0214191, -98.5685326 | campus | documented_ai | 400 MW IT at full build-out | p1 | CoreWeave is tenant GPU cloud (separate entity). 9663 vs 9685 adjacent addressing. |
| `aws-cumulus-susquehanna` | AWS Cumulus Data Center Campus (Susquehanna) | Amazon Data Services / AWS | Salem Township | PA | United States | expansion | 1125 Electron Avenue, Salem Township (postal Berwick), PA 18603-6655 | 41.0838485, -76.1435333 | building | documented_ai | 960 MW campus (Talen sale statement) | p1,b42 | Class B remediated to map-ready. Distinct from Susquehanna nuclear plant. |
| `aws-morrow-county` | AWS Morrow County / Eastern Oregon Campus Cluster | Amazon Web Services | Boardman | OR | United States | operational | null | null | city | unknown | null | p1,b42 | HUMAN REVIEW: multi-campus Boardman cluster (Rippee / Lewis and Clark / Airport Rd). Do not pick one pin. |
| `aws-new-carlisle` | AWS New Carlisle / St. Joseph County Campus | Amazon Web Services | New Carlisle | IN | United States | under_construction | Indiana Enterprise Center; northern Edison Road / 33100 Edison Rd listed in directories; south IN-2 & Larrison also reported | null | campus | unknown | null | p1,b42 | HUMAN REVIEW: one ID covers north and south IEC sites. |
| `coreweave-lancaster-pa` | CoreWeave Lancaster Pennsylvania Data Center | CoreWeave | Lancaster | PA | United States | under_construction | 216 Greenfield Road, Lancaster, PA | null | street | documented_ai | 100 MW IT; potential 300 MW | p1,b42 | 216 Greenfield is CoreWeave; 1375 Harrisburg Pike is separate Chirisa proposal. |
| `coreweave-plano-coit` | CoreWeave Plano (1000 Coit Road) | CoreWeave | Plano | TX | United States | operational | 1000 Coit Road, Plano, TX 75075 | 33.0117077, -96.7665775 | building | documented_ai | ≥454,421 sq ft (city agreement) | p1 | Distinct from Aligned DFW-04 / Lambda in Plano. |
| `crusoe-abilene-stargate-campus` | Crusoe / Lancium Abilene Stargate Campus | Lancium / Crusoe | Abilene | TX | United States | expansion | null | 32.508056, -99.777222 | campus | documented_ai | Multi-building; eight buildings planned | p1 | TCEQ campus coords. Directory streets unused. Oracle/OpenAI tenant cluster is separate entity. |
| `cyrusone-allen-dfw3` | CyrusOne Allen (DFW3–DFW5) | CyrusOne | Allen | TX | United States | operational | null | null | city | unknown | null | cyr | DFW3–DFW5. |
| `cyrusone-aurora-chi` | CyrusOne Aurora (CHI1–CHI3) | CyrusOne | Aurora | IL | United States | operational | null | null | city | unknown | null | cyr | CHI1–CHI3. |
| `cyrusone-austin-aus` | CyrusOne Austin (AUS2–AUS3) | CyrusOne | Austin | TX | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-carrollton-dfw1` | CyrusOne Carrollton DFW1 | CyrusOne | Carrollton | TX | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-chandler-phx` | CyrusOne Chandler (PHX1–PHX8) | CyrusOne | Chandler | AZ | United States | operational | null | null | city | unknown | null | cyr | PHX1–PHX8 listed at Chandler. Campus grain; do not explode to 8 pins without addresses. |
| `cyrusone-cincinnati-cin2` | CyrusOne Cincinnati CIN2 | CyrusOne | Cincinnati | OH | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-council-bluffs-ocb1` | CyrusOne Council Bluffs OCB1 | CyrusOne | Council Bluffs | IA | United States | operational | null | null | city | unknown | null | cyr | Distinct from Google Council Bluffs. |
| `cyrusone-dfw10-bosque` | CyrusOne DFW10 (Bosque County) | CyrusOne | Whitney | TX | United States | under_construction | 557 CR 3610, Whitney, TX 76692 | null | street | ai_capable_or_high_density | 190 MW first phase (company PR) | p1,b42,cyr | TDLR address. Operator confirms Bosque / Thad Hill. |
| `cyrusone-durham` | CyrusOne Durham (DUR1–DUR2) | CyrusOne | Durham | NC | United States | operational | null | null | city | unknown | null | cyr | DUR1–DUR2 campus group. |
| `cyrusone-florence-cin6` | CyrusOne Florence CIN6 | CyrusOne | Florence | KY | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-freestone-county` | CyrusOne Freestone County | CyrusOne | null | TX | United States | planned | null | null | city | unknown | null | cyr | In development. |
| `cyrusone-houston-hou` | CyrusOne Houston (HOU3–HOU4) | CyrusOne | Houston | TX | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-jack-county` | CyrusOne Jack County | CyrusOne | null | TX | United States | planned | null | null | city | unknown | null | cyr | In development. |
| `cyrusone-lebanon-oh-cin5` | CyrusOne Lebanon CIN5 | CyrusOne | Lebanon | OH | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-lee-county-nc` | CyrusOne Lee County | CyrusOne | null | NC | United States | planned | null | null | city | unknown | null | cyr | In development. |
| `cyrusone-lewisville-dfw2` | CyrusOne Lewisville DFW2 | CyrusOne | Lewisville | TX | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-medina-county` | CyrusOne Medina County | CyrusOne | null | TX | United States | planned | null | null | city | unknown | null | cyr | In development. |
| `cyrusone-norwalk-nym5` | CyrusOne Norwalk NYM5 | CyrusOne | Norwalk | CT | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-quincy-pnw1` | CyrusOne Quincy PNW1 | CyrusOne | Quincy | WA | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-san-antonio-sat1` | CyrusOne San Antonio SAT1 | CyrusOne | San Antonio | TX | United States | operational | null | null | city | unknown | null | cyr | Operator lists SAT1 separately from SAT2–4 and SAT5–6. |
| `cyrusone-san-antonio-sat2` | CyrusOne San Antonio SAT2–SAT4 | CyrusOne | San Antonio | TX | United States | operational | null | null | city | unknown | null | cyr | Campus group. |
| `cyrusone-san-antonio-sat5` | CyrusOne San Antonio SAT5–SAT6 | CyrusOne | San Antonio | TX | United States | operational | null | null | city | unknown | null | cyr | Campus group. |
| `cyrusone-sangamon-county` | CyrusOne Sangamon County | CyrusOne | null | IL | United States | planned | null | null | city | unknown | null | cyr | In development on operator list. |
| `cyrusone-somerset-nym1` | CyrusOne Somerset NYM1 | CyrusOne | Somerset | NJ | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-sterling-nva` | CyrusOne Sterling (NVA1–NVA9) | CyrusOne | Sterling | VA | United States | operational | null | null | city | unknown | null | cyr | Operator lists several NVA groups at Sterling. Kept as one Sterling campus pending building streets. HUMAN REVIEW grain. |
| `cyrusone-sulphur-springs` | CyrusOne Sulphur Springs | CyrusOne | Sulphur Springs | TX | United States | planned | null | null | city | unknown | null | cyr | In development. |
| `cyrusone-totowa-nym2` | CyrusOne Totowa NYM2 | CyrusOne | Totowa | NJ | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-wappingers-nym7` | CyrusOne Wappingers Falls NYM7 | CyrusOne | Wappingers Falls | NY | United States | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `cyrusone-yorkville` | CyrusOne Yorkville Technology Campus | CyrusOne | Yorkville | IL | United States | planned | null | null | city | unknown | null | cyr | In development. |
| `dataone-vineland` | DataOne Vineland AI Data Center | DataOne | Vineland | NJ | United States | under_construction | Lincoln Avenue and Sheridan Avenue, Vineland, NJ (Block 7503 Lots 1.01 & 35.01) | null | street | documented_ai | 300 MW campus plan | p1,b42 | Nebius is tenant GPU factory (separate entity). Intersection ungeocoded. |
| `digital-realty-dallas-campus` | Digital Dallas Campus | Digital Realty | Dallas | TX | United States | operational | null | null | campus | unknown | 69-acre connected campus (operator) | dlr_am | Named campus. 12 facilities in Dallas market — not exploded. |
| `digital-realty-hillsboro` | Digital Realty Hillsboro / Portland | Digital Realty | Hillsboro | OR | United States | operational | null | null | city | unknown | null | dlr_am | Operator: Hillsboro facility ~15 miles from Portland. |
| `digital-realty-phoenix-van-buren` | Digital Realty Phoenix (120 East Van Buren) | Digital Realty | Phoenix | AZ | United States | operational | 120 East Van Buren, Phoenix, AZ | null | street | unknown | 783,000 sq ft market figure includes more than this hall | dlr_am | Operator names this as #1 interconnection facility in Phoenix. Market sq ft not copied as this building's footprint. |
| `equinix-atlanta` | Equinix Atlanta | Equinix | Atlanta | GA | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-boston` | Equinix Boston | Equinix | Boston | MA | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-chicago` | Equinix Chicago | Equinix | Chicago | IL | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-culpeper` | Equinix Culpeper | Equinix | Culpeper | VA | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-dallas` | Equinix Dallas | Equinix | Dallas | TX | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-dc1` | Equinix DC1 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc10` | Equinix DC10 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc11` | Equinix DC11 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc12` | Equinix DC12 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc13` | Equinix DC13 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc14` | Equinix DC14 | Equinix | Manassas | VA | United States | operational | null | null | city | no_documented_ai | null | eqx_dc | Equinix: located in Manassas. |
| `equinix-dc15` | Equinix DC15 | Equinix | Ashburn | VA | United States | operational | null | null | city | no_documented_ai | null | eqx_dc | IBX listed on Washington DC metro page. |
| `equinix-dc16` | Equinix DC16 | Equinix | Ashburn | VA | United States | operational | null | null | city | no_documented_ai | null | eqx_dc | IBX listed on Washington DC metro page. |
| `equinix-dc2` | Equinix DC2 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc21` | Equinix DC21 | Equinix | Ashburn | VA | United States | operational | 22175 Beaumeade Circle, Ashburn, VA | null | street | no_documented_ai | null | eqx_dc | Street on Equinix DC21 blurb. Coords null pending geocode. |
| `equinix-dc22` | Equinix DC22 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | New IBX on interconnected Ashburn campus. |
| `equinix-dc3` | Equinix DC3 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc4` | Equinix DC4 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc5` | Equinix DC5 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-dc6` | Equinix DC6 | Equinix | Ashburn | VA | United States | operational | null | null | campus | no_documented_ai | null | eqx_dc | Ashburn Campus IBX. Equinix treats each IBX as a separate facility; campus vs building grain OK as separate IDs. |
| `equinix-denver` | Equinix Denver | Equinix | Denver | CO | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-houston` | Equinix Houston | Equinix | Houston | TX | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-los-angeles` | Equinix Los Angeles | Equinix | Los Angeles | CA | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-miami` | Equinix Miami | Equinix | Miami | FL | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-ny1` | Equinix NY1 | Equinix | New York | NY | United States | operational | null | null | street | no_documented_ai | null | eqx_ny | Halsey St (street lead; full number not in metro extract) |
| `equinix-ny11` | Equinix NY11 | Equinix | New York | NY | United States | operational | null | null | street | no_documented_ai | null | eqx_ny | NYC metro IBX; street not in metro extract |
| `equinix-ny13` | Equinix NY13 | Equinix | Elmsford | NY | United States | operational | null | null | city | no_documented_ai | null | eqx_ny | Elmsford |
| `equinix-ny2` | Equinix NY2 | Equinix | Secaucus | NJ | United States | operational | null | null | city | no_documented_ai | null | eqx_ny | Secaucus campus |
| `equinix-ny3` | Equinix NY3 | Equinix | Secaucus | NJ | United States | operational | null | null | city | no_documented_ai | null | eqx_ny | Secaucus Campus; Equinix largest NYC-metro site |
| `equinix-ny4` | Equinix NY4 | Equinix | Secaucus | NJ | United States | operational | 755 Secaucus Road, Secaucus, NJ 07094 | null | street | no_documented_ai | null | eqx_ny4 | Operator street. Coords null pending geocode. |
| `equinix-ny5` | Equinix NY5 | Equinix | Secaucus | NJ | United States | operational | null | null | city | no_documented_ai | null | eqx_ny | Secaucus campus |
| `equinix-ny6` | Equinix NY6 | Equinix | Secaucus | NJ | United States | operational | null | null | city | no_documented_ai | null | eqx_ny | Secaucus campus |
| `equinix-ny7` | Equinix NY7 | Equinix | New York | NY | United States | operational | null | null | street | no_documented_ai | null | eqx_ny | West Side Ave (street lead) |
| `equinix-ny9` | Equinix NY9 | Equinix | New York | NY | United States | operational | 111 8th Avenue, New York, NY 10011 | null | street | no_documented_ai | null | eqx_ny9 | Carrier hotel / IBX at 111 8th Ave. Operator street. Coords null pending geocode. |
| `equinix-philadelphia` | Equinix Philadelphia | Equinix | Philadelphia | PA | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-seattle` | Equinix Seattle | Equinix | Seattle | WA | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-silicon-valley` | Equinix Silicon Valley | Equinix | Silicon Valley | CA | United States | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `fermi-project-matador-campus` | Fermi America Project Matador Compute Campus | Fermi America | null | TX | United States | under_construction | N side of US 60 near US 60 & FM 2373, Carson County, TX | null | campus | documented_ai | null | p1,b42 | TCEQ/NRC site description. Distinct from on-site gas plant record. |
| `google-armstrong-county-tx` | Google Armstrong County Data Center | Google | null | TX | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-berkeley-county-sc` | Google Berkeley County Data Center | Google | null | SC | United States | operational | null | null | city | unknown | null | ggl | HUMAN REVIEW vs the other SC Lowcountry/Berkeley listing — may be one campus or two. Google lists both. |
| `google-cedar-rapids` | Google Cedar Rapids Data Center | Google | Cedar Rapids | IA | United States | planned | Big Cedar Industrial Center, Edgewood Road SW and 76th Avenue SW, Cedar Rapids, IA 52404 | null | campus | unknown | null | p1,b42,ggl | City FAQ named park. Do not use Google JSON city-centroid coords. |
| `google-chesterfield-va` | Google Chesterfield County Data Center | Google | null | VA | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-columbia-county-ga` | Google Columbia County Data Center | Google | null | GA | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-columbus-oh` | Google Columbus Data Center | Google | Columbus | OH | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-council-bluffs` | Google Council Bluffs Data Center | Google | Council Bluffs | IA | United States | expansion | competing: 10410 Bunge Ave vs 1430 Veterans Memorial Hwy | null | null | unknown | null | p1,b42,ggl | HUMAN REVIEW: two attested streets. |
| `google-dorchester-county-sc` | Google Dorchester County Data Center | Google | null | SC | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-douglas-county-ga` | Google Douglas County Data Center | Google | null | GA | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-fort-wayne` | Google Fort Wayne Data Center | Google | Fort Wayne | IN | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-haskell-county-tx` | Google Haskell County Data Center | Google | null | TX | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-henderson-nv` | Google Henderson Data Center | Google | Henderson | NV | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-hermantown` | Google Hermantown Data Center | Google | Hermantown | MN | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-jackson-county-al` | Google Jackson County Data Center | Google | null | AL | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-kansas-city-mo` | Google Kansas City Data Center | Google | Kansas City | MO | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-lagrange-ga` | Google LaGrange Data Center | Google | LaGrange | GA | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-lancaster-oh` | Google Lancaster Data Center | Google | Lancaster | OH | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-lenoir` | Google Lenoir Data Center | Google | Lenoir | NC | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-lincoln-ne` | Google Lincoln Data Center | Google | Lincoln | NE | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-loudoun-county-va` | Google Loudoun County Data Center | Google | null | VA | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-lowcountry-sc` | Google The Lowcountry Data Center | Google | null | SC | United States | operational | null | null | city | unknown | null | ggl | HUMAN REVIEW vs the other SC Lowcountry/Berkeley listing — may be one campus or two. Google lists both. |
| `google-mesa-az` | Google Mesa Data Center | Google | Mesa | AZ | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-michigan-city-in` | Google Michigan City Data Center | Google | Michigan City | IN | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-midlothian-tx` | Google Midlothian Data Center | Google | Midlothian | TX | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-montgomery-county-tn` | Google Montgomery County Data Center | Google | null | TN | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-morgan-county-in` | Google Morgan County Data Center | Google | null | IN | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-muskogee-county-ok` | Google Muskogee County Data Center | Google | null | OK | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-new-albany-oh` | Google New Albany Data Center | Google | New Albany | OH | United States | operational | null | null | city | unknown | null | ggl | Distinct from Meta New Albany, Intel Ohio One, QTS/Vantage New Albany. City-level Google disclosure only. |
| `google-new-florence-mo` | Google New Florence Data Center | Google | New Florence | MO | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-omaha` | Google Omaha Data Center | Google | Omaha | NE | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-pampa-tx` | Google Pampa Data Center | Google | Pampa | TX | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-papillion` | Google Papillion Data Center | Google | Papillion | NE | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-pine-island-mn` | Google Pine Island Data Center | Google | Pine Island | MN | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-prince-william-va` | Google Prince William County Data Center | Google | null | VA | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-pryor-mayes-county` | Google Pryor / Mayes County Data Center | Google | Pryor | OK | United States | expansion | 4581 Webb Street, Pryor, OK 74361 (MidAmerica Industrial Park) | null | street | unknown | null | p1,b42,ggl | Chamber/mapping street; operator city. |
| `google-red-oak-tx` | Google Red Oak Data Center | Google | Red Oak | TX | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-stillwater` | Google Stillwater Data Center Campus | Google | Stillwater | OK | United States | planned | 1500 E. Richmond Road; SW corner Richmond & Jardot / Perkins (US-177) & Richmond | null | campus | unknown | null | p1,b42,ggl | OK Commerce / city planning. Do not use Google JSON city centroid. |
| `google-storey-county-nv` | Google Storey County Data Center | Google | null | NV | United States | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-the-dalles` | Google The Dalles Data Center | Google | The Dalles | OR | United States | operational | null | null | city | unknown | null | ggl | Re-admitted: Phase 1 excluded for lack of AI label. Existence is now the inclusion gate. Street not re-fetched this pass. |
| `google-tulsa` | Google Tulsa Data Center | Google | Tulsa | OK | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-van-buren-mi` | Google Van Buren Township Data Center | Google | Van Buren Township | MI | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-west-memphis-ar` | Google West Memphis Data Center | Google | West Memphis | AR | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-wilbarger-county-tx` | Google Wilbarger County Data Center | Google | null | TX | United States | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `hetzner-ashburn` | Hetzner Ashburn | Hetzner Online | Ashburn | VA | United States | operational | null | null | city | no_documented_ai | null | hetz | HUMAN REVIEW: may be colo cages inside another operator (Equinix/etc.), not a Hetzner-owned building. |
| `hetzner-hillsboro` | Hetzner Hillsboro | Hetzner Online | Hillsboro | OR | United States | operational | null | null | city | no_documented_ai | null | hetz | HUMAN REVIEW: may be colo cages, not a Hetzner-owned building. |
| `iren-childress` | IREN Childress Campus | IREN | Childress | TX | United States | expansion | 620 FM 1033, Childress, TX 79201 | 34.3807907, -100.0588831 | street | documented_ai | 750 MW campus; 576 acres | p1 | Contains Horizon 1–4 Microsoft GB300 halls (GPU entities). Highway geocode is coarse. |
| `iren-sweetwater` | IREN Sweetwater Campus | IREN | Sweetwater | TX | United States | planned | null | null | city | unknown | null | p1 | Phase 1: official IREN location page lists Sweetwater; not researched to street/status standard. Still city-only. |
| `meta-aiken` | Meta Aiken Data Center | Meta | Aiken | SC | United States | under_construction | null | null | city | unknown | $800M+; broke ground 2024 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-altoona` | Meta Altoona Data Center | Meta | Altoona | IA | United States | expansion | null | null | city | unknown | $2.5B+; broke ground 2013 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-beaver-dam` | Meta Beaver Dam Data Center | Meta | Beaver Dam | WI | United States | planned | null | null | city | unknown | $1B+; break ground 2025 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-bowling-green` | Meta Bowling Green Data Center | Meta | Bowling Green | OH | United States | planned | null | null | city | unknown | $800M+; break ground 2025 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-cheyenne` | Meta Cheyenne Data Center | Meta | Cheyenne | WY | United States | under_construction | null | null | city | unknown | $1.2B; broke ground 2024 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-dekalb` | Meta DeKalb Data Center | Meta | DeKalb | IL | United States | expansion | null | null | city | unknown | $1B+; broke ground 2020 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-eagle-mountain` | Meta Eagle Mountain Data Center | Meta | Eagle Mountain | UT | United States | expansion | 1275 N Community Circle, Eagle Mountain, UT 84005 | null | campus | no_documented_ai | null | p1,b42,meta | Not NSA Promontory. 1499 N Pony Express treated as campus frontage. |
| `meta-el-paso` | Meta El Paso Data Center | Meta | El Paso | TX | United States | under_construction | null | null | city | unknown | $10B+; broke ground 2025 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-forest-city` | Meta Forest City Data Center | Meta | Forest City | NC | United States | operational | null | null | city | unknown | $750M+; broke ground 2010 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-fort-worth` | Meta Fort Worth Data Center | Meta | Fort Worth | TX | United States | expansion | null | null | city | unknown | $1.5B+; broke ground 2015 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-gallatin` | Meta Gallatin Data Center | Meta | Gallatin | TN | United States | expansion | null | null | city | unknown | $1.5B+; broke ground 2020 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-henrico` | Meta Henrico Data Center | Meta | Henrico | VA | United States | expansion | null | null | city | unknown | $1B+; broke ground 2017 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-huntsville` | Meta Huntsville Data Center | Meta | Huntsville | AL | United States | operational | null | null | city | unknown | $1.5B+; broke ground 2018 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-jeffersonville` | Meta Jeffersonville Data Center | Meta | Jeffersonville | IN | United States | under_construction | null | null | city | unknown | $800M+; broke ground 2024 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-kansas-city` | Meta Kansas City Data Center | Meta | Kansas City | MO | United States | under_construction | null | null | city | unknown | $1.2B+; broke ground 2022 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-kuna` | Meta Kuna Data Center | Meta | Kuna | ID | United States | under_construction | null | null | city | unknown | $1.2B+; broke ground 2022 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-lebanon` | Meta Lebanon Data Center | Meta | Lebanon | IN | United States | planned | null | null | city | unknown | $10B+; break ground 2026 (Meta US fleet page) | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-los-lunas` | Meta Los Lunas Data Center | Meta | Los Lunas | NM | United States | expansion | null | null | city | unknown | $2.5B+; broke ground 2016 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-mesa` | Meta Mesa Data Center | Meta | Mesa | AZ | United States | expansion | null | null | city | unknown | $1B+; broke ground 2021 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-montgomery` | Meta Montgomery Data Center | Meta | Montgomery | AL | United States | under_construction | null | null | city | unknown | $1.5B+; broke ground 2024 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-new-albany` | Meta New Albany Data Center | Meta | New Albany | OH | United States | expansion | 1500 Beech Road, New Albany, OH (Licking County; Dispatch citing Meta) | 40.065362, -82.754612 | campus | documented_ai | null | p1,meta | Physical campus for Prometheus GPU cluster (separate entity). Distinct from Intel Ohio One and QTS/Vantage New Albany. |
| `meta-prineville` | Meta Prineville Data Center | Meta | Prineville | OR | United States | expansion | null | null | city | unknown | $2B+; broke ground 2010 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-richland-parish` | Meta Richland Parish Data Center | Meta | Holly Ridge | LA | United States | under_construction | Holly Ridge, LA, along LA-183; Hwy 80 & Jaggers Lane | null | campus | documented_ai | Meta: 4 million sq ft campus; $50B+ LA investment | p1,b42,meta | Host for Hyperion cluster (separate GPU entity). |
| `meta-rosemount` | Meta Rosemount Data Center | Meta | Rosemount | MN | United States | under_construction | null | null | city | unknown | $800M+; broke ground 2024 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-sarpy` | Meta Sarpy Data Center | Meta | Sarpy County | NE | United States | expansion | null | null | city | unknown | $2.5B+; broke ground 2017 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-stanton-springs` | Meta Stanton Springs Data Center | Meta | Stanton Springs | GA | United States | expansion | null | null | city | unknown | $1.5B+; broke ground 2018 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-temple` | Meta Temple Data Center | Meta | Temple | TX | United States | under_construction | null | null | city | unknown | $1.2B; broke ground 2022 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `meta-tulsa` | Meta Tulsa Data Center | Meta | Tulsa | OK | United States | planned | null | null | city | unknown | $1B+; break ground 2026 | meta | Named on Meta US fleet page. City only. Do not infer GPU/AI from Meta brand. |
| `microsoft-cheyenne-bison-business-park` | Microsoft Cheyenne Bison Business Park Datacenter | Microsoft | Cheyenne | WY | United States | operational | Bison Business Park, Cheyenne, WY | null | campus | unknown | null | ms_home | Second named Cheyenne campus on Microsoft Datacenters home. Distinct from Business Parkway. |
| `microsoft-cheyenne-business-parkway` | Microsoft Cheyenne Business Parkway Datacenter | Microsoft | Cheyenne | WY | United States | operational | Cheyenne Business Parkway, Cheyenne, WY | null | campus | unknown | null | ms_home | Named park on Microsoft Datacenters home. Not an Azure region label. |
| `microsoft-fairwater-atlanta` | Microsoft Fairwater Atlanta | QTS / Microsoft | Fayetteville | GA | United States | operational | 1435 Highway 54 West, Fayetteville, GA | 33.4452227, -84.5248259 | campus | documented_ai | ~612-acre QTS campus | p1,qts_us | Microsoft names Atlanta; physical campus is QTS Fayetteville. Do not also ingest qts-fayetteville as a second DC. |
| `microsoft-fairwater-mount-pleasant` | Microsoft Fairwater Mount Pleasant | Microsoft | Mount Pleasant | WI | United States | expansion | 4800 90th St, Mount Pleasant, WI 53403 (DNR); expansion 12023 Durand Avenue | 42.6748702, -87.894888 | building | documented_ai | 315 acres; 1.2 million sq ft under roof (Sep 2025 Microsoft) | p1 | First building vs Durand expansion parcels not fully disambiguated. |
| `oracle-shackelford` | Oracle Shackelford County AI Data Center Campus | Oracle | null | TX | United States | planned | null | null | null | documented_ai | 10 buildings / 1,200 acres / 3.7 million sq ft (Oracle) | p1,b42,vant | Still research-only. Vantage also lists Shackelford County undisclosed — possible same Frontier campus. HUMAN REVIEW identity. |
| `project-jupiter-dona-ana` | Project Jupiter (Doña Ana County) | BorderPlex Digital Assets / STACK Infrastructure | Santa Teresa | NM | United States | planned | SE of NM-136 and NM-9, ~1,400 acres, near Santa Teresa Port of Entry | null | campus | documented_ai | ~1,400-acre campus | p1,b42 | Oracle/OpenAI tenant. NM-136 is Pete Domenici Hwy. |
| `qts-ashburn-1` | QTS Ashburn 1 | QTS | Sterling | VA | United States | operational | null | null | city | unknown | 28 acres; 55 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-ashburn-2` | QTS Ashburn 2 | QTS | Sterling | VA | United States | operational | null | null | city | unknown | 24 acres; 75 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-ashburn-3` | QTS Ashburn 3 | QTS | Ashburn | VA | United States | operational | null | null | city | unknown | 25 acres; 80 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-ashburn-moran` | QTS Ashburn Moran | QTS | Sterling | VA | United States | operational | null | null | city | unknown | 3 acres; 4 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-atlanta-1` | QTS Atlanta 1 | QTS | Atlanta | GA | United States | operational | null | null | city | unknown | 99 acres; 278 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-augusta` | QTS Augusta | QTS | Augusta | GA | United States | planned | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-bessemer` | QTS Bessemer | QTS | Bessemer | AL | United States | planned | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-blakely` | QTS Blakely | QTS | Blakely | GA | United States | planned | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-cedar-rapids` | QTS Cedar Rapids | QTS | Cedar Rapids | IA | United States | planned | null | null | city | unknown | null | qts_us | Distinct from Google Cedar Rapids. |
| `qts-chicago` | QTS Chicago | QTS | Chicago | IL | United States | operational | null | null | city | unknown | 30 acres; 95 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-colorado-springs` | QTS Colorado Springs | QTS | Colorado Springs | CO | United States | operational | null | null | city | unknown | 21 acres; 14 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-denver-aurora` | QTS Denver (Aurora) | QTS | Aurora | CO | United States | operational | null | null | city | unknown | 65 acres; 160 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-eagle-mountain` | QTS Eagle Mountain | QTS | Eagle Mountain | UT | United States | planned | null | null | city | unknown | null | qts_us | Distinct from Meta Eagle Mountain. |
| `qts-east-windsor` | QTS East Windsor | QTS | East Windsor | NJ | United States | operational | null | null | city | unknown | 52 acres; 70 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-fort-worth` | QTS Fort Worth | QTS | Fort Worth | TX | United States | operational | null | null | city | unknown | 52 acres; 70 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-hillsboro-1` | QTS Hillsboro 1 | QTS | Hillsboro | OR | United States | operational | null | null | city | unknown | 25 acres | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-hillsboro-2` | QTS Hillsboro 2 | QTS | Hillsboro | OR | United States | operational | null | null | city | unknown | 51 acres; 180 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-hillsboro-3` | QTS Hillsboro 3 | QTS | Hillsboro | OR | United States | planned | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-irving` | QTS Irving | QTS | Irving | TX | United States | operational | null | null | city | unknown | 56 acres; 165 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-manassas-1` | QTS Manassas 1 | QTS | Manassas | VA | United States | operational | null | null | city | unknown | 105 acres; 190 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-miami` | QTS Miami | QTS | Miami | FL | United States | operational | null | null | city | unknown | 2 MW | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-new-albany-1` | QTS New Albany 1 | QTS | New Albany | OH | United States | operational | null | null | city | unknown | null | qts_us | Distinct from Meta / Google / Vantage / Intel New Albany. |
| `qts-new-albany-2` | QTS New Albany 2 | QTS | New Albany | OH | United States | operational | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-phoenix-2` | QTS Phoenix 2 | QTS | Phoenix | AZ | United States | operational | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-phoenix-3` | QTS Phoenix 3 | QTS | Glendale | AZ | United States | operational | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-phoenix-4` | QTS Phoenix 4 | QTS | Avondale | AZ | United States | operational | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-piscataway` | QTS Piscataway | QTS | Piscataway Township | NJ | United States | operational | null | null | city | unknown | 38 acres; 65 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-richmond-1` | QTS Richmond 1 | QTS | Sandston | VA | United States | operational | null | null | city | unknown | 100 acres; 240 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-richmond-2` | QTS Richmond 2 | QTS | Sandston | VA | United States | planned | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-richmond-3` | QTS Richmond 3 | QTS | Sandston | VA | United States | planned | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-richmond-5` | QTS Richmond 5 | QTS | Sandston | VA | United States | planned | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-sacramento` | QTS Sacramento | QTS | Sacramento | CA | United States | operational | null | null | city | unknown | 7 acres; 4 MW | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-salem-township` | QTS Salem Township | QTS | Salem Township | PA | United States | operational | null | null | city | unknown | null | qts_us | Distinct from AWS Cumulus / Susquehanna in Salem Township PA if this is a different Salem — verify county before ingest. HUMAN REVIEW. |
| `qts-san-antonio` | QTS San Antonio | QTS | San Antonio | TX | United States | operational | null | null | city | unknown | 32 acres; 90 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-santa-clara` | QTS Santa Clara | QTS | Santa Clara | CA | United States | operational | null | null | city | unknown | 4 acres; 7.5 MW | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-south-dallas` | QTS South Dallas (Wilmer) | QTS | Wilmer | TX | United States | operational | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-suwanee-1` | QTS Suwanee 1 | QTS | Suwanee | GA | United States | operational | null | null | city | unknown | 53 acres; 50 MW+ | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-van-wert` | QTS Van Wert | QTS | Van Wert | OH | United States | operational | null | null | city | unknown | null | qts_us | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `qts-york-county` | QTS York County | QTS | null | SC | United States | planned | null | null | city | unknown | null | qts_us | QTS announced first South Carolina operations in York County (operator news on US locations page). |
| `related-the-barn-saline` | The Barn (Saline Township Stargate Campus) | Related Digital / Oracle | Saline Township | MI | United States | under_construction | 11600 W Michigan Avenue, Saline Township, MI 48176 | null | campus | documented_ai | ~575 acres; three 550,000 sq ft buildings (Related) | p1,b42 | Township-identified parcel in multi-parcel campus. |
| `switch-citadel-tahoe-reno` | Switch Citadel Campus (Tahoe Reno) | Switch | McCarran | NV | United States | operational | 1 Superloop Circle, McCarran, NV 89434 (postal Sparks 89437 also appears); TRIC | null | campus | ai_capable_or_high_density | up to 650 MW (2017 PR) | p1,b42 | Do not geocode Tesla Gigafactory. Directory street; Nominatim rate-limited. |
| `vantage-ashburn-i` | Vantage Ashburn I | Vantage Data Centers | Sterling | VA | United States | operational | 45200 Vantage Data Plaza, Sterling, VA 20166 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-ashburn-ii` | Vantage Ashburn II | Vantage Data Centers | Sterling | VA | United States | operational | 22435 Glenn Drive, Sterling, VA 20164 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-ashburn-iii` | Vantage Ashburn III | Vantage Data Centers | Ashburn | VA | United States | operational | 19509 Belmont Ridge Road, Ashburn, VA 20147 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-fredericksburg` | Vantage Fredericksburg | Vantage Data Centers | Fredericksburg | VA | United States | operational | 225 Centreport Parkway, Fredericksburg, VA 22406 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-lighthouse-port-washington` | Vantage Lighthouse Campus (Port Washington) | Vantage Data Centers | Port Washington | WI | United States | under_construction | 531, 533, 701, and 723 E. Lake Drive, Port Washington, WI | null | campus | documented_ai | 902 MW IT; 672 acres; 4 DCs (Vantage) | p1,b42,vant | WI DOR certified four Lake Drive buildings. Vantage page still says undisclosed. Rotary 1374 unused. |
| `vantage-new-albany` | Vantage New Albany | Vantage Data Centers | New Albany | OH | United States | operational | 3325 Horizon Court, New Albany, OH 43031 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-phoenix-goodyear` | Vantage Phoenix (Goodyear) | Vantage Data Centers | Goodyear | AZ | United States | operational | 45 S. Bullard Avenue, Goodyear, AZ 85338 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-quincy` | Vantage Quincy | Vantage Data Centers | Quincy | WA | United States | operational | 2101 M Street NE, Quincy, WA 98848 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-reno` | Vantage Reno | Vantage Data Centers | Sparks | NV | United States | operational | 1121 USA Parkway, Sparks, NV 89437 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-santa-clara-i` | Vantage Santa Clara I | Vantage Data Centers | Santa Clara | CA | United States | operational | 2820 Northwestern Pkwy, Santa Clara, CA 95051 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-santa-clara-ii` | Vantage Santa Clara II | Vantage Data Centers | Santa Clara | CA | United States | operational | 737 Mathew Street, Santa Clara, CA 95051 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-santa-clara-iii` | Vantage Santa Clara III | Vantage Data Centers | Santa Clara | CA | United States | operational | 2590 Walsh Avenue, Santa Clara, CA 95051 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-shackelford` | Vantage Shackelford County (Frontier) | Vantage Data Centers | null | TX | United States | planned | null | null | null | documented_ai | null | vant,p1 | HUMAN REVIEW vs oracle-shackelford. Vantage page: undisclosed. Phase 1 noted possible same campus. |

### Europe

#### Austria

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-vienna` | Digital Realty Vienna | Digital Realty | Vienna | null | Austria | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `google-kronstorf` | Google Kronstorf Data Center | Google | Kronstorf | null | Austria | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

#### Belgium

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-brussels` | Digital Realty Brussels | Digital Realty | Brussels | null | Belgium | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `google-farciennes` | Google Farciennes Data Center | Google | Farciennes | null | Belgium | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-st-ghislain` | Google St. Ghislain Data Center | Google | St. Ghislain | null | Belgium | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

#### Bulgaria

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-sofia` | Equinix Sofia | Equinix | Sofia | null | Bulgaria | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Croatia

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-zagreb` | Digital Realty Zagreb | Digital Realty | Zagreb | null | Croatia | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |

#### Denmark

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-copenhagen` | Digital Realty Copenhagen | Digital Realty | Copenhagen | null | Denmark | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `google-fredericia` | Google Fredericia Data Center | Google | Fredericia | null | Denmark | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

#### Finland

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `csc-kajaani-lumi-host` | CSC Kajaani Data Center (LUMI host) | CSC | Kajaani | Kainuu | Finland | operational | Tehdaskatu 15, Renforsin Ranta | 64.2319866, 27.691477 | building | documented_ai | null | p1 | Host for LUMI GPU supercomputer; cluster is a separate entity. |
| `equinix-helsinki` | Equinix Helsinki | Equinix | Helsinki | null | Finland | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `google-hamina` | Google Hamina Data Center | Google | Hamina | null | Finland | expansion | Ensontie 1, 49420 Hamina | 60.5381382, 27.1234892 | campus | no_documented_ai | null | p1,b42,ggl | Class B remediated to map-ready. Heat recovery is not a power asset. |
| `google-muhos` | Google Muhos Data Center | Google | Muhos | null | Finland | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-vaala` | Google Vaala Data Center | Google | Vaala | null | Finland | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `hetzner-helsinki` | Hetzner Datacenter Helsinki | Hetzner Online | Helsinki | null | Finland | operational | null | null | city | no_documented_ai | null | hetz | Operator-named DC. Street not on page extract. |

#### France

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-paris-par1` | CyrusOne Paris PAR1 | CyrusOne | Paris | null | France | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `digital-realty-marseille` | Digital Realty Marseille | Digital Realty | Marseille | null | France | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-paris` | Digital Realty Paris | Digital Realty | Paris | null | France | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-bordeaux` | Equinix Bordeaux | Equinix | Bordeaux | null | France | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-paris` | Equinix Paris | Equinix | Paris | null | France | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Germany

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-frankfurt-fra` | CyrusOne Frankfurt (FRA1–FRA4 operational; FRA5–FRA7 in development) | CyrusOne | Frankfurt | null | Germany | expansion | null | null | city | unknown | null | cyr | Do not explode FRA codes without addresses. |
| `digital-realty-dusseldorf` | Digital Realty Düsseldorf | Digital Realty | Düsseldorf | null | Germany | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-frankfurt` | Digital Realty Frankfurt | Digital Realty | Frankfurt | null | Germany | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-dusseldorf` | Equinix Düsseldorf | Equinix | Düsseldorf | null | Germany | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-fr11x` | Equinix FR11x | Equinix | Frankfurt | null | Germany | operational | null | null | campus | no_documented_ai | null | eqx_fr | xScale hyperscale; Northeast campus. |
| `equinix-fr13` | Equinix FR13 | Equinix | Frankfurt | null | Germany | operational | null | null | campus | no_documented_ai | null | eqx_fr | Frankfurt North-East campus. |
| `equinix-fr2` | Equinix FR2 | Equinix | Frankfurt | null | Germany | operational | null | null | street | no_documented_ai | null | eqx_fr | Friesstrasse (street name; number not in extract). |
| `equinix-fr4` | Equinix FR4 | Equinix | Frankfurt | null | Germany | operational | null | null | street | no_documented_ai | null | eqx_fr | Lärchenstrasse (street name). |
| `equinix-fr5` | Equinix FR5 | Equinix | Frankfurt | null | Germany | operational | null | null | street | no_documented_ai | null | eqx_fr | Kleyerstrasse (street name). |
| `equinix-fr6` | Equinix FR6 | Equinix | Frankfurt | null | Germany | operational | null | null | campus | no_documented_ai | null | eqx_fr | Lärchenstrasse campus; one of three IBXs. |
| `equinix-fr7` | Equinix FR7 | Equinix | Frankfurt | null | Germany | operational | null | null | city | no_documented_ai | null | eqx_fr | Central Frankfurt IBX. |
| `equinix-fr8` | Equinix FR8 | Equinix | Frankfurt | null | Germany | operational | null | null | campus | no_documented_ai | null | eqx_fr | Lärchenstrasse campus; 100% renewable energy coverage claimed. |
| `equinix-fr9x` | Equinix FR9x | Equinix | Frankfurt | null | Germany | operational | null | null | campus | no_documented_ai | null | eqx_fr | xScale hyperscale; Northeast campus. |
| `equinix-hamburg` | Equinix Hamburg | Equinix | Hamburg | null | Germany | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-munich` | Equinix Munich | Equinix | Munich | null | Germany | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `fzj-jupiter-host` | Forschungszentrum Jülich (JUPITER host campus) | Forschungszentrum Jülich | Jülich | North Rhine-Westphalia | Germany | operational | null | 50.9000601, 6.3931009 | street | documented_ai | Modular Data Centre on campus | p1 | Host campus for JUPITER; street vs MDC building. |
| `google-dietzenbach` | Google Dietzenbach Data Center | Google | Dietzenbach | null | Germany | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-hanau` | Google Hanau Data Center | Google | Hanau | null | Germany | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `hetzner-falkenstein` | Hetzner Datacenter-Park Falkenstein | Hetzner Online | Falkenstein | Saxony | Germany | operational | null | null | city | no_documented_ai | null | hetz | Operator-named park. |
| `hetzner-nuremberg` | Hetzner Datacenter-Park Nuremberg | Hetzner Online | Nuremberg | Bavaria | Germany | operational | null | null | city | no_documented_ai | null | hetz | Operator-named park. Street not on page extract. |
| `vantage-berlin-i` | Vantage Berlin I | Vantage Data Centers | Ludwigsfelde | null | Germany | operational | Brandenburg Park, Uferring 5, Ludwigsfelde 14974 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-berlin-ii` | Vantage Berlin II | Vantage Data Centers | Mittenwalde | null | Germany | operational | Dahmestrasse 1 and 2, Mittenwalde 15749 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-frankfurt-i` | Vantage Frankfurt I | Vantage Data Centers | Offenbach am Main | null | Germany | operational | Goethering 27, Offenbach am Main 63067 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-frankfurt-ii` | Vantage Frankfurt II | Vantage Data Centers | Raunheim | null | Germany | operational | Alexander-von-Humboldt-Straße 4, Raunheim 65479 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |

#### Greece

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-athens` | Digital Realty Athens | Digital Realty | Athens | null | Greece | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-heraklion` | Digital Realty Heraklion | Digital Realty | Heraklion | null | Greece | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |

#### Ireland

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-dublin-dub1` | CyrusOne Dublin DUB1 | CyrusOne | Dublin | null | Ireland | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `digital-realty-dublin` | Digital Realty Dublin | Digital Realty | Dublin | null | Ireland | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-dublin` | Equinix Dublin | Equinix | Dublin | null | Ireland | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `google-dublin` | Google Dublin Data Center | Google | Dublin | null | Ireland | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `vantage-dublin` | Vantage Dublin | Vantage Data Centers | Dublin | null | Ireland | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |

#### Italy

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-milan-mil` | CyrusOne Milan (MIL1–MIL2) | CyrusOne | Milan | null | Italy | planned | null | null | city | unknown | null | cyr | In development. |
| `digital-realty-rome` | Digital Realty Rome | Digital Realty | Rome | null | Italy | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-genoa` | Equinix Genoa | Equinix | Genoa | null | Italy | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-milan` | Equinix Milan | Equinix | Milan | null | Italy | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `qts-vimercate` | QTS Vimercate | QTS | Vimercate | null | Italy | operational | null | null | city | unknown | null | qts_us,qts_eu | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `vantage-milan-i` | Vantage Milan I | Vantage Data Centers | Melegnano | null | Italy | operational | 32 Via per Carpiano, Melegnano, Milan 20077 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-milan-ii` | Vantage Milan II | Vantage Data Centers | Castelletto | null | Italy | operational | Via Aganippo Brocchi, Castelletto, Milan 20019 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |

#### Netherlands

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-amsterdam-ams1` | CyrusOne Amsterdam AMS1 | CyrusOne | Amsterdam | null | Netherlands | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `digital-realty-amsterdam` | Digital Realty Amsterdam | Digital Realty | Amsterdam | null | Netherlands | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-am1` | Equinix AM1 | Equinix | Amsterdam | null | Netherlands | operational | null | null | street | no_documented_ai | null | eqx_am | Laarderhoogtweg (shared with AM2 in Equinix copy). |
| `equinix-am11` | Equinix AM11 | Equinix | Amsterdam | null | Netherlands | operational | null | null | city | no_documented_ai | null | eqx_am | Named Amsterdam IBX; street not in extract. |
| `equinix-am2` | Equinix AM2 | Equinix | Amsterdam | null | Netherlands | operational | null | null | street | no_documented_ai | null | eqx_am | Laarderhoogtweg (shared with AM1). Building split not published in extract. |
| `equinix-am3` | Equinix AM3 | Equinix | Amsterdam | null | Netherlands | operational | null | null | campus | no_documented_ai | null | eqx_am | Science Park. |
| `equinix-am4` | Equinix AM4 | Equinix | Amsterdam | null | Netherlands | operational | null | null | campus | no_documented_ai | null | eqx_am | Science Park. |
| `equinix-am5` | Equinix AM5 | Equinix | Amsterdam | null | Netherlands | operational | null | null | city | no_documented_ai | null | eqx_am | Prime city-center IBX; street not in extract. |
| `equinix-am6` | Equinix AM6 | Equinix | Amsterdam | null | Netherlands | operational | null | null | city | no_documented_ai | null | eqx_am | Prime city-center IBX; street not in extract. |
| `equinix-am7` | Equinix AM7 | Equinix | Amsterdam | null | Netherlands | operational | null | null | city | no_documented_ai | null | eqx_am | Prime city-center IBX; street not in extract. |
| `equinix-am8` | Equinix AM8 | Equinix | Amsterdam | null | Netherlands | operational | null | null | city | no_documented_ai | null | eqx_am | Prime city-center IBX; street not in extract. |
| `google-eemshaven` | Google Eemshaven Data Center | Google | Eemshaven | null | Netherlands | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-groningen` | Google Groningen Data Center | Google | Groningen | null | Netherlands | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-middenmeer` | Google Middenmeer Data Center | Google | Middenmeer | null | Netherlands | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `google-winschoten` | Google Winschoten Data Center | Google | Winschoten | null | Netherlands | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `qts-eemshaven` | QTS Netherlands Eemshaven | QTS | Eemshaven | null | Netherlands | operational | null | null | city | unknown | 20 MW | qts_us,qts_eu | Distinct from Google Eemshaven. |
| `qts-groningen` | QTS Netherlands Groningen | QTS | Groningen | null | Netherlands | operational | null | null | city | unknown | 4 MW | qts_us,qts_eu | Distinct from Google Groningen (planned). |

#### Norway

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `google-skien` | Google Skien Data Center | Google | Skien | null | Norway | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

#### Poland

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-warsaw` | Equinix Warsaw | Equinix | Warsaw | null | Poland | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `vantage-warsaw` | Vantage Warsaw | Vantage Data Centers | Warsaw | null | Poland | operational | Zgrupowania AK Kampinos 42D, Warsaw 01-949 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |

#### Portugal

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-lisbon` | Digital Realty Lisbon | Digital Realty | Lisbon | null | Portugal | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-lisbon` | Equinix Lisbon | Equinix | Lisbon | null | Portugal | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Spain

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-madrid-mad1` | CyrusOne Madrid MAD1 | CyrusOne | Madrid | null | Spain | operational | null | null | city | unknown | null | cyr | Named on CyrusOne locations list. City/campus code only. |
| `digital-realty-barcelona` | Digital Realty Barcelona | Digital Realty | Barcelona | null | Spain | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-madrid` | Digital Realty Madrid | Digital Realty | Madrid | null | Spain | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-barcelona` | Equinix Barcelona | Equinix | Barcelona | null | Spain | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-madrid` | Equinix Madrid | Equinix | Madrid | null | Spain | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Sweden

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-stockholm` | Digital Realty Stockholm | Digital Realty | Stockholm | null | Sweden | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-stockholm` | Equinix Stockholm | Equinix | Stockholm | null | Sweden | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `google-horndal` | Google Horndal Data Center | Google | Horndal | null | Sweden | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `microsoft-sweden-gavle` | Microsoft Gävle Datacenter | Microsoft | Gävle | null | Sweden | operational | Fastighet Stackbo 1:35 (Bakvretsgatan, 805 91 Gävle) | 60.59862, 17.01082 | campus | no_documented_ai | null | p1,b42,ms_home | Class B remediated to map-ready via Swedish environmental permit SWEREF99. |
| `microsoft-sweden-sandviken` | Microsoft Sandviken Datacenter | Microsoft | Sandviken | null | Sweden | operational | null | null | city | no_documented_ai | null | p1,ms_home | Re-admitted: Phase 1 omitted to avoid three city pins for one region. Named in 2021 Sweden region PR. City only. |
| `microsoft-sweden-staffanstorp` | Microsoft Staffanstorp Datacenter | Microsoft | Staffanstorp | Skåne | Sweden | operational | Västanvägen 86, 245 42 Staffanstorp | null | street | no_documented_ai | null | p1,b42,ms_home | Address-only. Hambovägen 17 not used. |

#### Switzerland

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-zurich` | Digital Realty Zürich | Digital Realty | Zürich | null | Switzerland | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-geneva` | Equinix Geneva | Equinix | Geneva | null | Switzerland | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-zurich` | Equinix Zurich | Equinix | Zurich | null | Switzerland | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `vantage-zurich-i` | Vantage Zurich I | Vantage Data Centers | Winterthur | null | Switzerland | operational | 12 Fabrikstrasse, Winterthur 8404 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-zurich-ii` | Vantage Zurich II | Vantage Data Centers | Glattfelden | null | Switzerland | operational | Spinnerei Lettenstrasse, Glattfelden 8192 | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |

#### Türkiye

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-istanbul` | Equinix Istanbul | Equinix | Istanbul | null | Türkiye | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### United Kingdom

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-london-lon` | CyrusOne London (LON1–LON5 operational; LON6 in development) | CyrusOne | London | England | United Kingdom | expansion | null | null | city | unknown | null | cyr | Campus group pending building streets. |
| `digital-realty-london` | Digital Realty London | Digital Realty | London | null | United Kingdom | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-ld10` | Equinix LD10 | Equinix | London | England | United Kingdom | operational | null | null | city | no_documented_ai | null | eqx_ld | Named London IBX; street not in metro extract. xScale flagged in code. |
| `equinix-ld11x` | Equinix LD11x | Equinix | London | England | United Kingdom | operational | null | null | city | no_documented_ai | null | eqx_ld | Named London IBX; street not in metro extract. xScale flagged in code. |
| `equinix-ld13x` | Equinix LD13x | Equinix | London | England | United Kingdom | operational | null | null | city | no_documented_ai | null | eqx_ld | Named London IBX; street not in metro extract. xScale flagged in code. |
| `equinix-ld3` | Equinix LD3 | Equinix | London | England | United Kingdom | operational | null | null | street | no_documented_ai | null | eqx_ld | Coronation Road (street name; number not in metro extract). |
| `equinix-ld4` | Equinix LD4 | Equinix | Slough | England | United Kingdom | operational | Slough Trading Estate | null | campus | no_documented_ai | null | eqx_ld | Slough Trading Estate |
| `equinix-ld5` | Equinix LD5 | Equinix | Slough | England | United Kingdom | operational | Slough Trading Estate | null | campus | no_documented_ai | null | eqx_ld | Slough Trading Estate |
| `equinix-ld6` | Equinix LD6 | Equinix | Slough | England | United Kingdom | operational | Slough Trading Estate | null | campus | no_documented_ai | null | eqx_ld | Slough Trading Estate |
| `equinix-ld7` | Equinix LD7 | Equinix | Slough | England | United Kingdom | operational | null | null | street | no_documented_ai | null | eqx_ld | Banbury Avenue, Slough (street name; number not in metro extract). |
| `equinix-ld8` | Equinix LD8 | Equinix | London | England | United Kingdom | operational | null | null | city | no_documented_ai | null | eqx_ld | Named London IBX; street not in metro extract. xScale flagged in code. |
| `equinix-ld9` | Equinix LD9 | Equinix | London | England | United Kingdom | operational | null | null | city | no_documented_ai | null | eqx_ld | Named London IBX; street not in metro extract. xScale flagged in code. |
| `equinix-manchester` | Equinix Manchester | Equinix | Manchester | England | United Kingdom | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `google-waltham-cross` | Google Waltham Cross Data Centre | Google | Waltham Cross | England | United Kingdom | operational | null | null | city | unknown | null | ggl | Google describes air cooling / off-site heat recovery. No street on locations index. |
| `qts-cambois` | QTS Cambois | QTS | Cambois | England | United Kingdom | planned | null | null | city | unknown | null | qts_us,qts_eu | Named QTS campus. City/suburb only on operator list. MW/acres as published by QTS — not independently verified. |
| `vantage-cardiff` | Vantage Cardiff | Vantage Data Centers | Newport | Wales | United Kingdom | operational | Celtic Way, Coedkernew, Duffryn, Newport NP10 8BE | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-london-i` | Vantage London I | Vantage Data Centers | London | null | United Kingdom | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |
| `vantage-london-ii` | Vantage London II | Vantage Data Centers | London | null | United Kingdom | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |

### Asia

#### China

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-shanghai` | Equinix Shanghai | Equinix | Shanghai | null | China | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Hong Kong

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-hong-kong` | Digital Realty Hong Kong | Digital Realty | Hong Kong | null | Hong Kong | operational | null | null | city | unknown | null | dlr_apac | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-hong-kong` | Equinix Hong Kong | Equinix | Hong Kong | null | Hong Kong | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### India

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `airtrunk-bom2` | AirTrunk BOM2 Mumbai | AirTrunk | Mumbai | null | India | operational | null | null | city | unknown | null | air | Named on AirTrunk locations page. Street not in extract. Other AirTrunk APAC/ME campuses existed on the page but did not parse in this fetch — not invented. |
| `airtrunk-bom3` | AirTrunk BOM3 Mumbai | AirTrunk | Mumbai | null | India | operational | null | null | city | unknown | null | air | Named on AirTrunk locations page. Street not in extract. Other AirTrunk APAC/ME campuses existed on the page but did not parse in this fetch — not invented. |
| `airtrunk-hyd1` | AirTrunk HYD1 Hyderabad | AirTrunk | Hyderabad | null | India | operational | null | null | city | unknown | null | air | Named on AirTrunk locations page. Street not in extract. Other AirTrunk APAC/ME campuses existed on the page but did not parse in this fetch — not invented. |
| `airtrunk-maa1` | AirTrunk MAA1 Chennai | AirTrunk | Chennai | null | India | operational | null | null | city | unknown | null | air | Named on AirTrunk locations page. Street not in extract. Other AirTrunk APAC/ME campuses existed on the page but did not parse in this fetch — not invented. |
| `equinix-chennai` | Equinix Chennai | Equinix | Chennai | null | India | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-mumbai` | Equinix Mumbai | Equinix | Mumbai | null | India | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `google-andhra-pradesh` | Google Andhra Pradesh Data Center | Google | Andhra Pradesh | null | India | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

#### Indonesia

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-jakarta` | Digital Realty Jakarta | Digital Realty | Jakarta | null | Indonesia | operational | null | null | city | unknown | null | dlr_apac | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-jakarta` | Equinix Jakarta | Equinix | Jakarta | null | Indonesia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Japan

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cyrusone-osaka-osk1` | CyrusOne Osaka OSK1 | CyrusOne | Osaka | null | Japan | planned | null | null | city | unknown | null | cyr | In development. |
| `digital-realty-osaka` | Digital Realty Osaka | Digital Realty | Osaka | null | Japan | operational | null | null | city | unknown | null | dlr_apac | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-tokyo` | Digital Realty Tokyo | Digital Realty | Tokyo | null | Japan | operational | null | null | city | unknown | null | dlr_apac | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-osaka` | Equinix Osaka | Equinix | Osaka | null | Japan | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-ty1` | Equinix TY1 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty10` | Equinix TY10 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty11` | Equinix TY11 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Koto-ku area. |
| `equinix-ty12x` | Equinix TY12x | Equinix | Chiba | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | First Asia xScale; Equinix: up to 54 MW IT. Chiba outskirts of Tokyo. |
| `equinix-ty13x` | Equinix TY13x | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | xScale; street not in extract. |
| `equinix-ty15` | Equinix TY15 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | ~1 km from TY6/TY7/TY8; fiber to TY2. |
| `equinix-ty2` | Equinix TY2 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty3` | Equinix TY3 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty4` | Equinix TY4 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty5` | Equinix TY5 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty6` | Equinix TY6 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty7` | Equinix TY7 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty8` | Equinix TY8 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `equinix-ty9` | Equinix TY9 | Equinix | Tokyo | null | Japan | operational | null | null | city | no_documented_ai | null | eqx_ty | Named Tokyo IBX; street not in metro extract. |
| `google-inzai` | Google Inzai Data Center | Google | Inzai | Chiba | Japan | operational | 千葉県印西市鹿黒南2丁目2-4 | 35.81831, 140.13274 | building | no_documented_ai | null | p1,b42,ggl | Class B remediated to map-ready. |
| `nextdc-tk1-tokyo` | NEXTDC TK1 Tokyo | NEXTDC | Tokyo | null | Japan | planned | null | null | city | unknown | 30 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-tk2-tokyo` | NEXTDC TK2 Tokyo | NEXTDC | Tokyo | null | Japan | planned | null | null | city | unknown | null | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |

#### Malaysia

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-cyberjaya` | Digital Realty Kuala Lumpur (Cyberjaya) | Digital Realty | Cyberjaya | null | Malaysia | operational | null | null | campus | unknown | null | dlr_apac | Operator: Cyberjaya. |
| `google-selangor` | Google Selangor Data Center | Google | Selangor | null | Malaysia | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `nextdc-kl1-kuala-lumpur` | NEXTDC KL1 Kuala Lumpur | NEXTDC | Kuala Lumpur | null | Malaysia | planned | null | null | city | unknown | 18,250 m²; 65+ MW | nx,nx_s1 | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `vantage-cyberjaya-ii` | Vantage Cyberjaya II | Vantage Data Centers | Cyberjaya | null | Malaysia | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |

#### Philippines

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-manila` | Equinix Manila | Equinix | Manila | null | Philippines | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Singapore

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-singapore` | Digital Realty Singapore | Digital Realty | Singapore | null | Singapore | operational | null | null | city | unknown | null | dlr_apac | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-singapore` | Equinix Singapore | Equinix | Singapore | null | Singapore | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `google-singapore` | Google Singapore Data Center | Google | Singapore | null | Singapore | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |
| `hetzner-singapore` | Hetzner Singapore | Hetzner Online | Singapore | null | Singapore | operational | null | null | city | no_documented_ai | null | hetz | HUMAN REVIEW: page also peers at Equinix Singapore — possible colo, not a Hetzner building. |

#### South Korea

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-seoul-sangam` | Digital Realty Seoul (Sangam Digital Media City) | Digital Realty | Seoul | null | South Korea | operational | null | null | campus | unknown | null | dlr_apac | Operator: located within Sangam Digital Media City. |
| `equinix-seoul` | Equinix Seoul | Equinix | Seoul | null | South Korea | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `naver-gak-chuncheon` | NAVER GAK Chuncheon | NAVER | Chuncheon | null | South Korea | operational | null | null | city | unknown | null | p1 | Phase 1 noted as a separate NAVER campus deprioritized vs Sejong. Included now as a named DC; street not re-fetched. |
| `naver-gak-sejong` | NAVER GAK Sejong | NAVER | Sejong | null | South Korea | operational | 세종특별자치시 행복대로 824 | null | street | no_documented_ai | null | p1,b42 | Operator now publishes street. Address-only; Nominatim road snap unused. |

#### Taiwan

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `google-changhua` | Google Changhua County Data Center | Google | Changhua County | null | Taiwan | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

#### Thailand

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `google-chonburi` | Google Chonburi Data Center | Google | Chonburi | null | Thailand | planned | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

### Middle East

#### Oman

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-muscat` | Equinix Muscat | Equinix | Muscat | null | Oman | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-salalah` | Equinix Salalah | Equinix | Salalah | null | Oman | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### United Arab Emirates

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-abu-dhabi` | Equinix Abu Dhabi | Equinix | Abu Dhabi | null | United Arab Emirates | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-dubai` | Equinix Dubai | Equinix | Dubai | null | United Arab Emirates | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `uae-us-ai-campus-abu-dhabi` | UAE–US AI Campus (Abu Dhabi) | G42 / Khazna | Abu Dhabi | Abu Dhabi | United Arab Emirates | under_construction | null | null | city | documented_ai | 5 GW campus plan (not live IT load) | p1,b42,khz | Still research-only. Masdar/coords uncorroborated. Host for Stargate UAE cluster (separate category). |

### Oceania

#### Australia

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-melbourne` | Digital Realty Melbourne | Digital Realty | Melbourne | null | Australia | operational | null | null | city | unknown | null | dlr_apac | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-sydney-campus` | Digital Realty Sydney Data Center Campus | Digital Realty | Sydney | NSW | Australia | operational | null | null | campus | unknown | 2 discrete plots (operator) | dlr_apac | Named campus; plots not addressed. |
| `equinix-adelaide` | Equinix Adelaide | Equinix | Adelaide | SA | Australia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-brisbane` | Equinix Brisbane | Equinix | Brisbane | QLD | Australia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-canberra` | Equinix Canberra | Equinix | Canberra | ACT | Australia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-melbourne` | Equinix Melbourne | Equinix | Melbourne | VIC | Australia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-perth` | Equinix Perth | Equinix | Perth | WA | Australia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-sydney` | Equinix Sydney | Equinix | Sydney | NSW | Australia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `nextdc-a1-adelaide` | NEXTDC A1 Adelaide | NEXTDC | Adelaide | SA | Australia | operational | null | null | city | unknown | 2,922 m²; 5 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-b1-brisbane` | NEXTDC B1 Brisbane | NEXTDC | Brisbane | QLD | Australia | operational | null | null | city | unknown | 1,650 m²; 2.25 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-b2-brisbane` | NEXTDC B2 Brisbane | NEXTDC | Fortitude Valley | QLD | Australia | operational | null | null | city | unknown | 6,000 m²; 12 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-c1-canberra` | NEXTDC C1 Canberra | NEXTDC | Bruce | ACT | Australia | operational | null | null | city | unknown | 2,260 m²; 4.4 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-d1-darwin` | NEXTDC D1 Darwin | NEXTDC | Darwin | NT | Australia | operational | null | null | city | unknown | 3,000 m²; 1 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-gc1-gold-coast` | NEXTDC GC1 Gold Coast | NEXTDC | Gold Coast | QLD | Australia | planned | null | null | city | unknown | 4,600 m²; 6 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-ge1-geelong` | NEXTDC GE1 Geelong | NEXTDC | Geelong | VIC | Australia | planned | null | null | city | unknown | 2,100 m²; 4 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-m1-melbourne` | NEXTDC M1 Melbourne | NEXTDC | Port Melbourne | VIC | Australia | operational | null | null | city | unknown | 6,000 m²; 16 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-m2-melbourne` | NEXTDC M2 Melbourne | NEXTDC | Tullamarine | VIC | Australia | operational | null | null | city | unknown | 15,000 m²; 120+ MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-m3-melbourne` | NEXTDC M3 Melbourne | NEXTDC | West Footscray | VIC | Australia | operational | null | null | city | unknown | 41,000 m²; 225 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-m4-melbourne` | NEXTDC M4 Melbourne | NEXTDC | Port Melbourne | VIC | Australia | planned | null | null | city | unknown | 26,400 m²; 150 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-ne1-newman` | NEXTDC NE1 Newman | NEXTDC | Newman | WA | Australia | operational | null | null | city | unknown | 560 m²; 1 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-p1-perth` | NEXTDC P1 Perth | NEXTDC | Malaga | WA | Australia | operational | null | null | city | unknown | 3,000 m²; 10+ MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-p2-perth` | NEXTDC P2 Perth | NEXTDC | Perth | WA | Australia | operational | null | null | city | unknown | 12,000 m²; 20+ MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-ph1-port-hedland` | NEXTDC PH1 Port Hedland | NEXTDC | Port Hedland | WA | Australia | operational | null | null | city | unknown | 727 m²; 1 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-s1-sydney` | NEXTDC S1 Sydney | NEXTDC | Macquarie Park | NSW | Australia | operational | null | null | city | unknown | 5,800 m²; 16 MW IT | nx,nx_s1 | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-s2-sydney` | NEXTDC S2 Sydney | NEXTDC | Macquarie Park | NSW | Australia | operational | null | null | city | unknown | 8,700 m²; 30 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-s3-sydney` | NEXTDC S3 Sydney | NEXTDC | Artarmon | NSW | Australia | operational | null | -33.8191935, 151.1845025 | campus | no_documented_ai | 80 MW IT; 20,000 m² | p1,nx | S1/S2/S4/S6 are separate NEXTDC Sydney sites. |
| `nextdc-s4-sydney` | NEXTDC S4 Sydney | NEXTDC | Horsley Park | NSW | Australia | planned | null | null | city | unknown | 124,000 m²; 365 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-s5-sydney` | NEXTDC S5 Sydney | NEXTDC | Macquarie Park | NSW | Australia | planned | null | null | city | unknown | 16,000 m²; 80+ MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-s6-sydney` | NEXTDC S6 Sydney | NEXTDC | Artarmon | NSW | Australia | operational | null | null | city | ai_capable_or_high_density | 4,000 m²; 13.5 MW | nx | NEXTDC: S6 designed for high-density AI/GPU; NVIDIA DGX-certified partner / 600 kW-per-rack capability is a company capability claim, applied here because S6 is the named AI-ready  |
| `nextdc-s7-sydney` | NEXTDC S7 Sydney | NEXTDC | Eastern Creek | NSW | Australia | planned | null | null | city | unknown | 550+ MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |
| `nextdc-sc1-sunshine-coast` | NEXTDC SC1 Sunshine Coast | NEXTDC | Maroochydore | QLD | Australia | operational | null | null | city | unknown | 290 m²; 1 MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |

#### New Zealand

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nextdc-ak1-auckland` | NEXTDC AK1 Auckland | NEXTDC | Auckland | null | New Zealand | planned | null | null | city | unknown | 3,000 m²; 15+ MW | nx | Suburb/campus named on NEXTDC directory. No street on pages retrieved. |

### Latin America

#### Brazil

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-fortaleza` | Digital Realty Fortaleza | Digital Realty | Fortaleza | null | Brazil | operational | null | null | city | unknown | null | dlr_am | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-rio` | Digital Realty Rio de Janeiro | Digital Realty | Rio de Janeiro | null | Brazil | operational | null | null | city | unknown | null | dlr_am | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-sao-paulo` | Digital Realty São Paulo | Digital Realty | São Paulo | null | Brazil | operational | null | null | city | unknown | null | dlr_am | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-rio-de-janeiro` | Equinix Rio de Janeiro | Equinix | Rio de Janeiro | null | Brazil | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `equinix-sao-paulo` | Equinix São Paulo | Equinix | São Paulo | null | Brazil | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Chile

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-santiago` | Digital Realty Santiago | Digital Realty | Santiago | null | Chile | operational | null | null | city | unknown | null | dlr_am | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-santiago` | Equinix Santiago | Equinix | Santiago | null | Chile | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `google-quilicura` | Google Quilicura Data Center | Google | Quilicura | null | Chile | operational | null | null | city | unknown | null | ggl | Named on Google locations directory. City/county only; Google JSON coordinates treated as centroids and not stored. |

#### Colombia

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-bogota` | Digital Realty Bogotá | Digital Realty | Bogotá | null | Colombia | operational | null | null | city | unknown | null | dlr_am | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-bogota` | Equinix Bogotá | Equinix | Bogotá | null | Colombia | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Peru

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-lima` | Equinix Lima | Equinix | Lima | null | Peru | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Uruguay

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `google-canelones` | Google Canelones Data Center | Google | Canelones | null | Uruguay | operational | Parque de las Ciencias, Municipality of Nicolich, Canelones | null | campus | unknown | null | ggl | Google: Municipality of Nicolich, Parque de las Ciencias, north of Montevideo. Named park, not a street number. |

### Africa

#### Côte d’Ivoire

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equinix-abidjan` | Equinix Abidjan | Equinix | Abidjan | null | Côte d’Ivoire | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Ghana

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-accra` | Digital Realty Accra | Digital Realty | Accra | null | Ghana | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-accra` | Equinix Accra | Equinix | Accra | null | Ghana | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### Kenya

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-mombasa` | Digital Realty Mombasa | Digital Realty | Mombasa | null | Kenya | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-nairobi` | Digital Realty Nairobi | Digital Realty | Nairobi | null | Kenya | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |

#### Mozambique

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-maputo` | Digital Realty Maputo | Digital Realty | Maputo | null | Mozambique | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |

#### Nigeria

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-lagos` | Digital Realty Lagos | Digital Realty | Lagos | null | Nigeria | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-lagos` | Equinix Lagos | Equinix | Lagos | null | Nigeria | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |

#### South Africa

| ID | Facility | Operator | City | Region | Country | Status | Address | Coordinates | Precision | AI Relevance | Capacity | Sources | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `digital-realty-cape-town` | Digital Realty Cape Town | Digital Realty | Cape Town | null | South Africa | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-durban` | Digital Realty Durban | Digital Realty | Durban | null | South Africa | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `digital-realty-johannesburg` | Digital Realty Johannesburg | Digital Realty | Johannesburg | null | South Africa | operational | null | null | city | unknown | null | dlr_emea | Operator market page confirms DC presence. Building identity not resolved (Digital Realty publishes 125+ EMEA / 110+ Americas facilities). Research-only city. |
| `equinix-johannesburg` | Equinix Johannesburg | Equinix | Johannesburg | null | South Africa | operational | null | null | city | no_documented_ai | null | eqx | Equinix metro/market page confirms data-center presence. IBX codes/streets not retrieved this pass. City precision; not map-ready. |
| `teraco-ct1-rondebosch` | Teraco CT1 (Rondebosch) | Teraco | Rondebosch | Western Cape | South Africa | operational | Great Westerford Building, Rondebosch, Cape Town | -33.9712, 18.4649 | building | no_documented_ai | 2,500 m² white space (operator) | ter_ct | Operator GPS. Named building. |
| `teraco-ct2-brackenfell` | Teraco CT2 (Brackenfell) | Teraco | Brackenfell | Western Cape | South Africa | operational | 57 Tiber Road, Brackengate 2, Brackenfell | -33.907417, 18.67936 | building | no_documented_ai | 18,000 m² white space (operator) | ter_ct | Operator GPS. |
| `teraco-durban` | Teraco Durban | Teraco | Durban | KwaZulu-Natal | South Africa | operational | null | null | city | no_documented_ai | null | ter_jb | Teraco states Johannesburg, Cape Town and Durban. Durban building/street not on the JB/CT pages retrieved. |
| `teraco-jb1-isando` | Teraco JB1 East & West (Isando) | Teraco | Isando / Ekurhuleni | Gauteng | South Africa | operational | 5 Brewery Street, Isando, Johannesburg | -26.138, 28.19802 | building | no_documented_ai | null | ter_jb | Operator GPS. Teleport listed at the same address/coords — treated as on-campus equipment/related, not a second pin. |
| `teraco-jb2-bredell` | Teraco JB2 (Bredell) | Teraco | Kempton Park | Gauteng | South Africa | operational | 0A, 1st Road, Glen Marais, Kempton Park | -26.0751953, 28.2783355 | building | no_documented_ai | >6,000 m²; 24 MVA (operator) | ter_jb | Operator GPS. Completed Nov 2017 per Teraco. |
| `teraco-jb3-isando` | Teraco JB3 (Isando) | Teraco | Isando / Ekurhuleni | Gauteng | South Africa | operational | 14 Kiln Road, Isando, Johannesburg | -26.136132, 28.199605 | building | no_documented_ai | null | ter_jb | Operator GPS. Isando campus; Equinix/operator-separate IBX analogue — Teraco publishes distinct buildings. |
| `teraco-jb4-bredell` | Teraco JB4 (Bredell) | Teraco | Kempton Park | Gauteng | South Africa | operational | Birkenhead Street, Glen Marais, Kempton Park | -26.0250175, 28.2697322 | street | no_documented_ai | >20,000 m²; 80 MVA (operator) | ter_jb | Operator GPS. Street without number. Completed Oct 2022. |
| `teraco-jb5-isando` | Teraco JB5 (Isando) | Teraco | Isando / Ekurhuleni | Gauteng | South Africa | operational | 29 Kiln Road, Isando, Johannesburg | -26.135302, 28.201401 | building | no_documented_ai | null | ter_jb | Operator GPS. |
| `vantage-johannesburg-i` | Vantage Johannesburg I | Vantage Data Centers | Midrand | null | South Africa | operational | 1 Howick Lane, Waterfall Logistics Precinct, Midrand, Johannesburg | null | street | unknown | null | vant | Operator-published street. Coordinates null pending geocode. Distinct from existing vantage-lighthouse-port-washington. |
| `vantage-johannesburg-ii` | Vantage Johannesburg II | Vantage Data Centers | Johannesburg | null | South Africa | operational | null | null | city | unknown | null | vant | Operator lists campus; location undisclosed on the locations page retrieved. |

## 4. Existing Urdais Record Remediation

Phase 1 Data Centers that received stronger location evidence in the Class B pass or were re-admitted under the new inclusion gate:

| Existing ID | Previous Location State | New Evidence | New Precision | Map-Ready? | Sources |
| --- | --- | --- | --- | --- | --- |
| `aws-cumulus-susquehanna` | no street/coords | SRBC 1125 Electron Ave + OSM Amazon AWS PHL | building | yes | SRBC 2024-056 |
| `google-hamina` | no street/coords | Ensontie 1 + OSM Google Haminan palvelinkeskus | campus | yes | Google + DataCenters.com + OSM |
| `google-inzai` | no street/coords | 鹿黒南2-2-4 + OSM named DC | building | yes | Sankei + OSM |
| `microsoft-sweden-gavle` | city only | Stackbo 1:35 permit SWEREF99 → WGS84 | campus | yes | Länsstyrelsen Dalarna MPD |
| `naver-gak-sejong` | street omitted as unofficial | Operator page 824 Haengbok-daero | street | no ( ungeocoded ) | NAVER GAK Sejong |
| `microsoft-sweden-staffanstorp` | city only | Västanvägen 86 | street | no | DataCenters.com + property |
| `coreweave-lancaster-pa` | conflicting unofficial streets | 216 Greenfield Rd (city page) | street | no | City of Lancaster |
| `cyrusone-dfw10-bosque` | no city/street in PR | 557 CR 3610 TDLR | street | no | TDLR TABS |
| `dataone-vineland` | intersection; coords null | kept Lincoln & Sheridan | street | no | Vineland Planning Board |
| `google-cedar-rapids` | city only | Big Cedar Industrial Center / Edgewood & 76th | campus | no | City of Cedar Rapids FAQ |
| `google-pryor-mayes-county` | no street | 4581 Webb Street | street | no | Tulsa Chamber + mapping |
| `google-stillwater` | city only | 1500 E Richmond / Richmond & Jardot | campus | no | OK Commerce |
| `meta-eagle-mountain` | city only | 1275 N Community Circle | campus | no | directories + Meta city |
| `meta-richland-parish` | parish only | Holly Ridge / LA-183 / Hwy 80 & Jaggers | campus | no | Gulf States Newsroom |
| `project-jupiter-dona-ana` | county only | SE NM-136 & NM-9 | campus | no | Executed MOU |
| `switch-citadel-tahoe-reno` | TRIC only | 1 Superloop Circle | campus | no | Data Center Map + mapping |
| `related-the-barn-saline` | Michigan Ave no number | 11600 W Michigan Ave | campus | no | Saline Township |
| `vantage-lighthouse-port-washington` | city; Rotary unused | 531/533/701/723 E Lake Dr | campus | no | WI DOR |
| `fermi-project-matador-campus` | county only | US 60 & FM 2373 | campus | no | TCEQ/NRC |
| `google-the-dalles` | Phase 1 rejected (no AI label) | Re-admitted as named Google campus; street not re-fetched | city | no | Google locations |
| `microsoft-sweden-sandviken` | Phase 1 omitted | Re-admitted city pin for named Microsoft city | city | no | Microsoft 2021 Sweden PR |
| `naver-gak-chuncheon` | Phase 1 deferred | Included as named second NAVER campus | city | no | Phase 1 note |

Not successfully remediated to a single public pin: `aws-morrow-county`, `aws-new-carlisle`, `google-council-bluffs` (human review); `uae-us-ai-campus-abu-dhabi`, `oracle-shackelford` (still research-only).

Non-DC Class B records (fabs, GPU clusters, power) were remediated in the 42-record operations note and are **out of category** for this expansion dataset.

## 5. AI Relevance Summary

| Class | Count |
| --- | ---: |
| `documented_ai` | **21** |
| `ai_capable_or_high_density` | **3** |
| `no_documented_ai` | **158** |
| `unknown` | **282** |
| Sum | **464** |

`unknown` is the default when sources were used for identity/location and AI was not specifically researched. It does not mean the site cannot support AI later.

## 6. Operator Coverage

| Operator (first listed) | Facilities |
| --- | ---: |
| Equinix | 136 |
| Google | 68 |
| Digital Realty | 46 |
| QTS | 44 |
| CyrusOne | 37 |
| Vantage Data Centers | 33 |
| Meta | 28 |
| NEXTDC | 27 |
| Teraco | 8 |
| Microsoft | 6 |
| Hetzner Online | 6 |
| AirTrunk | 4 |
| NAVER | 2 |
| Amazon Web Services | 2 |
| CoreWeave | 2 |
| IREN | 2 |
| CSC | 1 |
| Forschungszentrum Jülich | 1 |
| G42 | 1 |
| Amazon Data Services | 1 |
| Aligned Data Centers | 1 |
| Applied Digital | 1 |
| Lancium | 1 |
| DataOne | 1 |
| Fermi America | 1 |
| Oracle | 1 |
| BorderPlex Digital Assets | 1 |
| Switch | 1 |
| Related Digital | 1 |

**Named on the brief but not individually inventoried this pass** (pages 404, bot-wall, or not fetched to building grain): NTT GDC, Iron Mountain, DataBank, Flexential, Cologix, CoreSite, EdgeConneX, Compass, Stream, Sabey, TierPoint, STACK (except Project Jupiter), Aligned (except DFW-04), Keppel, ST Telemedia GDC, Princeton Digital Group, Bridge, CtrlS, Yondr, Global Switch, Kao Data, Ark, Colt DCS, Telehouse, OVHcloud, Scaleway, Leaseweb, NorthC, Green Mountain, Bulk, atNorth, EcoDataCenter, Bahnhof, Gulf Data Hub, Moro Hub, center3, Mobily, CDC Data Centres, Macquarie Data Centres. These remain discovery targets, not silent inclusions.

## 7. Country / Region Coverage

### By region

| Region | Facilities |
| --- | ---: |
| North America | 230 |
| Europe | 115 |
| Asia | 48 |
| Middle East | 5 |
| Oceania | 32 |
| Latin America | 12 |
| Africa | 22 |

### By country

| Country | Facilities |
| --- | ---: |
| United States | 214 |
| Australia | 31 |
| Germany | 24 |
| Japan | 21 |
| United Kingdom | 18 |
| Netherlands | 17 |
| South Africa | 14 |
| Canada | 13 |
| India | 7 |
| Italy | 7 |
| Finland | 6 |
| Sweden | 6 |
| Ireland | 5 |
| Brazil | 5 |
| France | 5 |
| Spain | 5 |
| Switzerland | 5 |
| South Korea | 4 |
| Malaysia | 4 |
| Singapore | 4 |
| United Arab Emirates | 3 |
| Belgium | 3 |
| Chile | 3 |
| Mexico | 3 |
| Denmark | 2 |
| Austria | 2 |
| Colombia | 2 |
| Portugal | 2 |
| Poland | 2 |
| Oman | 2 |
| Nigeria | 2 |
| Ghana | 2 |
| Hong Kong | 2 |
| Indonesia | 2 |
| Greece | 2 |
| Kenya | 2 |
| Uruguay | 1 |
| Taiwan | 1 |
| Thailand | 1 |
| Norway | 1 |
| Peru | 1 |
| Bulgaria | 1 |
| Türkiye | 1 |
| Côte d’Ivoire | 1 |
| China | 1 |
| Philippines | 1 |
| New Zealand | 1 |
| Mozambique | 1 |
| Croatia | 1 |

**Weak markets:** China (1 city-level Equinix Shanghai + Hong Kong as separate jurisdiction), Vietnam (0), Philippines (Equinix Manila city-only), Czech Republic (0), Argentina (0), Egypt (0), Saudi Arabia/Qatar/Bahrain/Israel (0 named buildings). Coverage follows source availability, not equal country quotas.

## 8. Source Register

| Organization | URL | Source Type | Country/Scope | Reliability | Claims Used | Ongoing Monitoring Value |
| --- | --- | --- | --- | --- | --- | --- |
| `p1` Urdais Phase 1 research package | URDAIS_MAP_RESEARCH_PHASE_1.md | internal_research | global | high — prior sourced pass | identity/location as cited on rows | yes |
| `b42` Urdais Class B 42-record remediation | docs/operations/map-class-b-42-location-remediation.md | internal_research | global | high — 17–18 Sep 2026 location pass | identity/location as cited on rows | yes |
| `ggl` Google Data Centers locations | https://www.google.com/about/datacenters/locations/ | operator_facility_page | global | tier1 identity/city; published lat/lon often city-centroid — not used as map pins | identity/location as cited on rows | yes |
| `eqx` Equinix Data Centers | https://www.equinix.com/data-centers | operator_directory | global | tier1 metro/IBX identity | identity/location as cited on rows | yes |
| `eqx_ny` Equinix New York IBXs | https://www.equinix.com/data-centers/americas-colocation/united-states-colocation/new-york-data-centers | operator_facility_page | US-NY/NJ | tier1 named IBX | identity/location as cited on rows | yes |
| `eqx_ny4` Equinix NY4 | https://www.equinix.com/data-centers/americas-colocation/united-states-colocation/new-york-data-centers/ny4 | operator_facility_page | US-NJ | tier1 street | identity/location as cited on rows | yes |
| `eqx_ny9` Equinix NY9 | https://www.equinix.com/data-centers/americas-colocation/united-states-colocation/new-york-data-centers/ny9 | operator_facility_page | US-NY | tier1 street | identity/location as cited on rows | yes |
| `eqx_dc` Equinix Washington DC IBXs | https://www.equinix.com/data-centers/americas-colocation/united-states-colocation/washington-dc-data-centers | operator_facility_page | US-VA | tier1 named IBX | identity/location as cited on rows | yes |
| `eqx_ld` Equinix London IBXs | https://www.equinix.com/data-centers/europe-colocation/united-kingdom-colocation/london-data-centers | operator_facility_page | UK | tier1 named IBX / street leads | identity/location as cited on rows | yes |
| `eqx_fr` Equinix Frankfurt IBXs | https://www.equinix.com/data-centers/europe-colocation/germany-colocation/frankfurt-data-centers | operator_facility_page | DE | tier1 named IBX / street leads | identity/location as cited on rows | yes |
| `eqx_am` Equinix Amsterdam IBXs | https://www.equinix.com/data-centers/europe-colocation/netherlands-colocation/amsterdam-data-centers | operator_facility_page | NL | tier1 named IBX / street leads | identity/location as cited on rows | yes |
| `eqx_ty` Equinix Tokyo IBXs | https://www.equinix.com/data-centers/asia-pacific-colocation/japan-colocation/tokyo-data-centers | operator_facility_page | JP | tier1 named IBX | identity/location as cited on rows | yes |
| `dlr_am` Digital Realty Americas | https://www.digitalrealty.com/data-centers/americas | operator_directory | Americas | tier1 market presence; not building-resolved except named campuses | identity/location as cited on rows | yes |
| `dlr_emea` Digital Realty EMEA | https://www.digitalrealty.com/data-centers/emea | operator_directory | EMEA | tier1 market presence | identity/location as cited on rows | yes |
| `dlr_apac` Digital Realty Asia Pacific | https://www.digitalrealty.com/data-centers/asia-pacific | operator_directory | APAC | tier1 market presence | identity/location as cited on rows | yes |
| `cyr` CyrusOne Data Centers | https://www.cyrusone.com/data-centers/ | operator_directory | global | tier1 named campus codes | identity/location as cited on rows | yes |
| `qts_us` QTS US Locations | https://q.com/us-locations/ | operator_directory | US | tier1 named campuses | identity/location as cited on rows | yes |
| `qts_eu` QTS Europe Locations | https://q.com/europe-locations/ | operator_directory | EU | tier1 named campuses | identity/location as cited on rows | yes |
| `vant` Vantage Data Center Locations | https://vantage-dc.com/data-center-locations/ | operator_facility_page | global | tier1 streets where published | identity/location as cited on rows | yes |
| `meta` Meta US data center fleet | https://datacenters.atmeta.com/us-locations/ | operator_facility_page | US | tier1 named campuses; city-level | identity/location as cited on rows | yes |
| `nx` NEXTDC Data Centres | https://www.nextdc.com/data-centres | operator_directory | AU/NZ/JP/MY | tier1 named facilities / suburb / MW | identity/location as cited on rows | yes |
| `nx_s1` NEXTDC S1 Sydney | https://www.nextdc.com/data-centres/sydney-data-centres/s1-sydney | operator_facility_page | AU-NSW | tier1 suburb + 16 MW IT; no street | identity/location as cited on rows | yes |
| `air` AirTrunk locations | https://airtrunk.com/locations/ | operator_directory | IN | tier1 named codes BOM2/BOM3/MAA1/HYD1 | identity/location as cited on rows | yes |
| `hetz` Hetzner datacenter parks | https://www.hetzner.com/unternehmen/rechenzentrum/ | operator_facility_page | DE/FI/US/SG | tier1 parks; Ashburn/Hillsboro/Singapore may be colo cages | identity/location as cited on rows | yes |
| `ter_jb` Teraco Johannesburg | https://www.teraco.co.za/data-centre-locations/johannesburg/ | operator_facility_page | ZA | tier1 street + operator GPS | identity/location as cited on rows | yes |
| `ter_ct` Teraco Cape Town | https://www.teraco.co.za/data-centre-locations/cape-town/ | operator_facility_page | ZA | tier1 street + operator GPS | identity/location as cited on rows | yes |
| `khz` Khazna Data Centers | https://khaznadatacenters.com/ | operator_page | UAE | tier1 portfolio counts only; no named buildings | identity/location as cited on rows | yes |
| `ms_home` Microsoft Datacenters | https://datacenters.microsoft.com/home/ | operator_page | global | tier1 named parks/cities; Azure regions excluded | identity/location as cited on rows | yes |
| `ms_fs` Microsoft datacenter fact sheets | https://datacenters.microsoft.com/globe/fact-sheets/ | operator_page | global | tier1 country/state presence | identity/location as cited on rows | yes |

Directory URLs used in Class B remediation (DataCenters.com, Baxtel, ColoMap, Data Center Map, OSM/Nominatim) are documented in `docs/operations/map-class-b-42-location-remediation.md` and are not re-listed unless they contributed to a row in this file.

## 9. Duplicate / Entity-Resolution Review

- `microsoft-fairwater-atlanta` = QTS Fayetteville campus. QTS Fayetteville not added as a second DC.
- `oracle-shackelford` vs `vantage-shackelford` — possible same Frontier campus.
- `vantage-lighthouse-port-washington` — Vantage locations page still says undisclosed; WI DOR streets used from Class B.
- New Albany, OH: Meta, Google, QTS (×2), Vantage, plus Intel Ohio One (fab, out of category) — **not** duplicates.
- Eagle Mountain, UT: Meta vs QTS planned — distinct operators.
- Council Bluffs, IA: Google vs CyrusOne OCB1 — distinct.
- Eemshaven: Google vs QTS — distinct.
- Cedar Rapids: Google vs QTS planned — distinct.
- Equinix NY2–NY6 Secaucus campus: separate IBX IDs per operator practice.
- Equinix AM1/AM2 share Laarderhoogtweg copy — possible one building pair.
- CyrusOne PHX1–PHX8 / NVA1–NVA9 / LON1–LON6 / FRA1–FRA7: campus groups, not exploded.
- Teraco Teleport shares JB1 address/GPS — not a second pin.
- `google-berkeley-county-sc` vs `google-lowcountry-sc` — possible one SC campus.
- `nextdc-s3-sydney` existing vs `nextdc-s6-sydney` new — both Artarmon, distinct halls on NEXTDC directory.
- Digital Realty market rows vs Equinix city rows in the same metro are different operators, not duplicates.
- `uae-us-ai-campus-abu-dhabi` hosts Stargate UAE cluster (GPU category, not duplicated here).
- `dataone-vineland` hosts Nebius cluster (GPU category).
- `meta-richland-parish` hosts Hyperion (GPU category).
- `meta-new-albany` hosts Prometheus (GPU category).

## 10. Human Review Queue

| ID | Blocker |
| --- | --- |
| `aws-morrow-county` | HUMAN REVIEW: multi-campus Boardman cluster (Rippee / Lewis and Clark / Airport Rd). Do not pick one pin. |
| `aws-new-carlisle` | HUMAN REVIEW: one ID covers north and south IEC sites. |
| `cyrusone-sterling-nva` | Operator lists several NVA groups at Sterling. Kept as one Sterling campus pending building streets. HUMAN REVIEW grain. |
| `equinix-queretaro` | HUMAN REVIEW: Equinix lists this under Mexico City copy but says strategically located in Querétaro. City identity vs branding. |
| `google-berkeley-county-sc` | HUMAN REVIEW vs the other SC Lowcountry/Berkeley listing — may be one campus or two. Google lists both. |
| `google-council-bluffs` | HUMAN REVIEW: two attested streets. |
| `google-lowcountry-sc` | HUMAN REVIEW vs the other SC Lowcountry/Berkeley listing — may be one campus or two. Google lists both. |
| `hetzner-ashburn` | HUMAN REVIEW: may be colo cages inside another operator (Equinix/etc.), not a Hetzner-owned building. |
| `hetzner-hillsboro` | HUMAN REVIEW: may be colo cages, not a Hetzner-owned building. |
| `hetzner-singapore` | HUMAN REVIEW: page also peers at Equinix Singapore — possible colo, not a Hetzner building. |
| `oracle-shackelford` | Still research-only. Vantage also lists Shackelford County undisclosed — possible same Frontier campus. HUMAN REVIEW identity. |
| `qts-salem-township` | Distinct from AWS Cumulus / Susquehanna in Salem Township PA if this is a different Salem — verify county before ingest. HUMAN REVIEW. |
| `vantage-shackelford` | HUMAN REVIEW vs oracle-shackelford. Vantage page: undisclosed. Phase 1 noted possible same campus. |

Additional non-blocking reviews (still research-only, not in the human-review outcome bucket): Digital Realty and Equinix city-market rows (building identity unresolved); CyrusOne campus groups; Khazna 30-site portfolio unnamed.

## 11. Rejected Candidates

| Candidate | Reason rejected | Source | Reconsideration condition |
| --- | --- | --- | --- |
| AWS Canada Central / Canada West | Cloud region without named campus | Phase 1 / AWS | Named campus + street or permit |
| AWS Northern Virginia buildings | Region without single named campus address | Phase 1 | Amazon-named building/campus |
| Azure regions (UK South, France Central, etc.) | Region labels, not facilities | datacenters.microsoft.com/globe | Named park/campus as with Cheyenne / Gävle |
| Meta Promontory | Not a Meta campus; NSA Camp Williams | Phase 1 | Meta-named Promontory campus |
| CoreWeave Livingston HQ | Corporate office | Phase 1 | Physical DC evidence |
| Lambda SJ/SCA/MTV directory sites | HQ/office or directory-only | Phase 1 | Operator facility page |
| Equinix Fabric / Distributed AI product | Product, not a facility | Phase 1 | n/a |
| QTS Fayetteville as second DC | Same campus as Fairwater Atlanta | QTS + Microsoft | Only if QTS publishes a non-Fairwater building on a different site |
| Switch Las Vegas CORE | Phase 1 deferred as portfolio dump; Switch CORE page not re-fetched | Phase 1 | Switch facility page with address |
| xAI Southaven / Stateline Rd | Expansion in local press, not Colossus 1/2 | Phase 1 | Primary xAI/deed |
| xAI Colossus water plant | Water infrastructure | Phase 1 | n/a |
| OpenAI Stargate Abilene 600 MW expansion | Reported scrapped; not a live campus | Phase 1 / Bloomberg note | Company confirmation of a distinct site |
| Hut 8 Beacon Point / anonymous Anthropic Texas | Weak sourcing | Phase 1 | Company confirmation |
| Khazna 30 live DCs exploded as 30 rows | Homepage gives a count, not names | khaznadatacenters.com | Operator named facility list |
| DC Atlas Khazna 001–012 numbering | Tier 3 aggregator; not copied as facts | dcatlas.io | Khazna/government name+address |
| QTS Calatorao / Forssa | Operator: in consideration | q.com/europe-locations | Moves to in development with a site |
| Wikipedia / Baxtel / DataCenters.com as sole evidence | Directory-only | Phase 1 rule | Independent Tier 1/2 |
| Mainland China Alibaba/Tencent/Huawei campuses | No primary campus address verified | Phase 1 | Company or PRC government site page |
| Saudi HUMAIN / SDAIA campuses | No physical site primary fetched | Phase 1 | Operator/government site |
| CoreWeave Europe campuses | No European physical campus primary fetched | Phase 1 | Operator facility page |
| Cages/racks inside another DC | Not a facility | methodology | n/a |

Previously rejected **Google The Dalles**, **Equinix named IBXs**, **Digital Realty markets**, **Microsoft Sandviken**, and **NAVER GAK Chuncheon** were re-admitted because the inclusion gate changed from AI-relevance to data-center existence, or because this pass retrieved operator-named facilities.

## 12. Structured Ingestion Notes

Do **not** generate production JSON from this file automatically. Map into the existing Urdais facility-import contract as follows:

| Research field | Import contract | Notes |
| --- | --- | --- |
| `id` | stable `researchKey` / `id` | Preserve existing Phase 1 IDs exactly. New IDs are kebab-case proposals. |
| `name` | `canonicalName` | |
| `operator` | `operator` | May include owner/operator split in review notes |
| `address` | `address` | Keep even when lat/lon null |
| `city` `region` `country` | admin fields | |
| `lat` `lon` | `latitude` `longitude` | Required numeric for `mappingStatus=mapped` |
| `prec` | `coordinatePrecision` | city ⇒ not mapped |
| `status` | `operationalStatus` | |
| `ai` | enrichment, not category | Do not gate ingest |
| `src` | `sources[]` | Expand keys via §8 |
| `result=map_ready` | candidate for mapped ingest | after QA |
| `result=research_only` | unmapped / research quality state | |
| `result=human_review` | hold | |

Category for every row in this artifact is `data_center`. Do not coerce GPU clusters, fabs, or power rows from Phase 1 into this file.

Next conversion step: QA the  22 map-ready pins, geocode the street/campus address-only rows, then emit import JSON. Nominatim was rate-limited during Class B; do not fake centroids.

_End of artifact. 464 Data Center rows. 18 September 2026._
