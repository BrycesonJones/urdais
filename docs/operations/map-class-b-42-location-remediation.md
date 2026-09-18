# Existing Urdais 42-Record Location Remediation

Research date: **17–18 September 2026**.

This is Workstream A of the global data-centre expansion brief. It remediates every Phase 3 Class B record (`B — persist, research-only`) from `data/map/facilities.v1.json` / `docs/operations/map-phase-3-dataset-review.md`. IDs are the existing stable `researchKey` values. No IDs were invented.

Phase 3 Class B is **42 records**, not 42 data centres: **24 data_center**, **11 semiconductor_fab**, **5 gpu_compute_cluster**, **2 power_infrastructure**. All 42 were queued and researched individually.

Previous state for every row: **B — persist, research-only** (unplaceable: 41 with no coordinates; `aws-morrow-county` flagged city precision).

Result vocabulary:

- `resolved_map_ready` — street/campus/building evidence plus usable non-city coordinates.
- `resolved_address_only` — credible street, campus, parcel, or named industrial-park address; coordinates left null for later geocode.
- `still_research_only` — facility is real; physical position still not established.
- `human_review` — conflicting addresses, multi-site identity, or campus/building split.

---

## Remediation queue (42)

1. `aws-cumulus-susquehanna`
2. `fermi-project-matador-campus`
3. `google-hamina`
4. `fermi-matador-gas-generation`
5. `google-inzai`
6. `naver-gak-sejong`
7. `microsoft-sweden-gavle`
8. `microsoft-sweden-staffanstorp`
9. `uae-us-ai-campus-abu-dhabi`
10. `aws-morrow-county`
11. `aws-new-carlisle`
12. `coreweave-lancaster-pa`
13. `cyrusone-dfw10-bosque`
14. `dataone-vineland`
15. `google-cedar-rapids`
16. `google-council-bluffs`
17. `google-pryor-mayes-county`
18. `google-stillwater`
19. `meta-eagle-mountain`
20. `meta-richland-parish`
21. `oracle-shackelford`
22. `project-jupiter-dona-ana`
23. `switch-citadel-tahoe-reno`
24. `related-the-barn-saline`
25. `vantage-lighthouse-port-washington`
26. `nscc-aspire-2a`
27. `stargate-uae-cluster`
28. `bristol-isambard-ai`
29. `meta-hyperion`
30. `nebius-vineland-cluster`
31. `intel-leixlip-fab34`
32. `micron-singapore-hbm-packaging`
33. `sk-hynix-cheongju`
34. `sk-hynix-yongin`
35. `samsung-hwaseong`
36. `samsung-pyeongtaek`
37. `tsmc-ap6-zhunan`
38. `intel-gordon-moore-park-oregon`
39. `intel-ohio-one`
40. `micron-boise`
41. `samsung-taylor-tx`
42. `xai-colossus-onsite-gas-turbines`

---

## Existing Urdais 42-Record Location Remediation

| Existing ID | Facility | Country | Previous State | Previous Location | New Address | New Coordinates | Precision | Best Location Source | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aws-cumulus-susquehanna` | AWS Cumulus Data Center Campus (Susquehanna) | United States | B research-only | Salem Township, PA; adjacent to SSES; no street/coords | 1125 Electron Avenue, Salem Township (postal Berwick), Luzerne County, PA 18603-6655 | 41.0838485, -76.1435333 | building | [SRBC consumptive-use application 2024-056](https://www.srbc.gov/waav/Search/getpending?documenttype=Application&isabre=False&projectnumber=2024-056) (Amazon Data Services PHL100) | resolved_map_ready | OSM names the industrial building “Amazon AWS PHL” at this street. DataCenters.com matches. Talen sale identity unchanged. |
| `fermi-project-matador-campus` | Fermi America Project Matador Compute Campus | United States | B research-only | Carson County, TX; no street/coords | North side of US Highway 60 near US 60 & FM 2373, ~15–17 miles NE of Amarillo, Carson County, TX (Texas Tech lease; bounded by US 60, FM 683, FM 2373, Pantex) | null | campus | [TCEQ NSR project 407047](https://www2.tceq.texas.gov/airperm/index.cfm?fuseaction=airpermits.project_report&proj_id=407047); [NRC COLA ML25169A396](https://www.nrc.gov/docs/ML2516/ML25169A396.pdf) | resolved_address_only | Government site description, not a street number. GEM wiki coords not used. Campus vs on-site generation share this site; records stay distinct. |
| `google-hamina` | Google Hamina Data Center | Finland | B research-only | Hamina; Summa mill; no street/coords | Ensontie 1, 49420 Hamina | 60.5381382, 27.1234892 | campus | Google Hamina facility page (Summa mill) + [DataCenters.com Ensontie 1](https://www.datacenters.com/google-hamina-finland); OSM named **Google Haminan palvelinkeskus** on Ensontie | resolved_map_ready | Operator confirms Hamina/Summa; street from directories; campus pin from named OSM feature, not a city centroid. |
| `fermi-matador-gas-generation` | Fermi America Project Matador Gas Power Plant | United States | B research-only | Carson County greenfield; no coords | Same TCEQ East Campus site: N side of US 60 near US 60 & FM 2373, Carson County, TX | null | campus | [TCEQ permit narrative](https://records.tceq.texas.gov/cs/idcplg?IdcService=GET_FILE&allowInterrupt=1&dDocName=8281238&dID=9562398) | resolved_address_only | Power is on-site for the compute campus. Do not borrow a neighbour pin; same documented site, two entities. |
| `google-inzai` | Google Inzai Data Center | Japan | B research-only | Inzai, Chiba; no street/coords | 千葉県印西市鹿黒南2丁目2-4 (2-chōme-2-4 Kagurominami, Inzai, 270-1369) | 35.81831, 140.13274 | building | [Sankei 2023-04-13](https://www.sankei.com/article/20230413-3FR4DET6CRMN7CDC5IA622NG3U/) (印西市鹿黒南) + OSM way named **Google 印西データセンター** with that block address; Google Inzai page confirms city | resolved_map_ready | Official page still omits street; neighbourhood + named mapping feature + directories agree. |
| `naver-gak-sejong` | NAVER GAK Sejong | South Korea | B research-only | Sejong; unofficial 824 Haengbok-daero omitted | 세종특별자치시 행복대로 824 (824 Haengbok-daero, Jipyeon-dong, Sejong 30138) | null | street | [NAVER Data Center GAK Sejong](https://datacenter.navercorp.com/gaksejong/) | resolved_address_only | Operator now publishes the street that Phase 1 refused as a snippet. [Chosunbiz](https://cbiz.chosun.com/svc/bulletin/bulletin_art.html?contid=2023110800949) corroborates. Nominatim returned the road, not a building. |
| `microsoft-sweden-gavle` | Microsoft Gävle Datacenter | Sweden | B research-only | Gävle city; no street/coords | Fastighet Stackbo 1:35, Gävle kommun (directory street Bakvretsgatan, 805 91 Gävle) | 60.59862, 17.01082 | campus | [Länsstyrelsen Dalarna MPD permit 2022-09-13](https://www.naturvardsverket.se/4accb3/contentassets/4eef28e4813b4c309697ffd56ae8165c/2022-09-13-mpd-dalarna.pdf) — SWEREF 99 N 6 719 765 / E 610 115 | resolved_map_ready | Permit places the Microsoft Stackbo datacentre ~10 km SW of Gävle centrum. WGS84 converted from the official SWEREF 99 TM pair. Farfarsvägen 1 Valbo is a different listed hall and was not used. |
| `microsoft-sweden-staffanstorp` | Microsoft Staffanstorp Datacenter | Sweden | B research-only | Staffanstorp; no street/coords | Västanvägen 86, 245 42 Staffanstorp (property STAFFANSTORP KRONOSLÄTT 1:9) | null | street | [DataCenters.com](https://www.datacenters.com/microsoft-azure-staffanstorp-sweden) + OCOLO + TIC property report; Microsoft Sweden PR confirms Staffanstorp DC exists | resolved_address_only | One weaker directory lists Hambovägen 17; not used. Västanvägen 86 is the consistent street. |
| `uae-us-ai-campus-abu-dhabi` | UAE–US AI Campus (Abu Dhabi) | United Arab Emirates | B research-only | Abu Dhabi; no street/coords | none established | null | null | G42 PR / WAM still city-only | still_research_only | Aggregator “Masdar City” / guessed coords not corroborated on operator or WAM pages retrieved. |
| `aws-morrow-county` | AWS Morrow County / Eastern Oregon Campus Cluster | United States | B research-only | Boardman, OR; city precision; multi-building cluster | none as a single campus | null | city (unchanged) | Amazon Oregon fact sheets still county-level | human_review | Directories list distinct Boardman streets (79539 Rippee Rd; 73579 Lewis and Clark Dr; Boardman Airport Rd). Splitting buildings would change the entity. Do not pick one. |
| `aws-new-carlisle` | AWS New Carlisle / St. Joseph County Campus | United States | B research-only | Indiana Enterprise Center, New Carlisle; no building street | Indiana Enterprise Center; northern site on Edison Road west of Larrison Blvd / 31,000 block (directory 33100 Edison Rd, New Carlisle IN 46552); additional sites at IN-2 & Larrison | null | campus | [IEDC / Gov. Holcomb announcement](https://www.aboutamazon.com/news/aws/aws-indiana-investment-11-billion) (IEC) + [local press Edison Road](http://m.pjstar.com/story/news/local/2025/10/30/first-part-of-amazon-web-services-project-near-new-carlisle-operational/86983620007/) + [WSBT 31000 block Edison](https://wsbt.com/news/local/amazon-fire-injuries-victims-injuries-data-center-edison-walnut-construction-web-services-roads-medical-flights-hospital-severe-st-joseph-county-indiana) | human_review | Named park is solid; the record is a multi-site IEC campus. Pinning only Edison Road would hide the south parcels. |
| `coreweave-lancaster-pa` | CoreWeave Lancaster Pennsylvania Data Center | United States | B research-only | Lancaster, PA; conflicting unofficial streets omitted | 216 Greenfield Road, Lancaster, PA (former R.R. Donnelley / LSC plant) | null | street | [City of Lancaster data-center page](https://www.cityoflancasterpa.gov/data-center/) + [LNP / LancasterOnline](https://lancasteronline.com/news/local/plans-submitted-for-lancaster-city-data-centers-second-phase/article_d97cd11b-cb7f-49c8-9f57-7bb2a5a0facf.html) | resolved_address_only | Phase 1 conflict is resolved: 216 Greenfield is the CoreWeave site under construction. 1375 Harrisburg Pike is a separate Chirisa proposal. Nominatim snapped to East Lampeter — coords withheld. |
| `cyrusone-dfw10-bosque` | CyrusOne DFW10 (Bosque County) | United States | B research-only | Adjacent Thad Hill, Bosque County; no city/street | 557 CR 3610, Whitney, TX 76692, Bosque County | null | street | [TDLR TABS 2025005284](https://www.tdlr.texas.gov/TABS/Projects/TABS2025005284) (CyrusOne DFW10 shell & upfit) | resolved_address_only | Operator page confirms Bosque / Thad Hill. Baxtel matches 557 County Rd 3610. Nominatim did not resolve this CR. |
| `dataone-vineland` | DataOne Vineland AI Data Center | United States | B research-only | Lincoln Ave & Sheridan Ave; street; coords null | Lincoln Avenue and Sheridan Avenue, Vineland, NJ (Block 7503 Lots 1.01 & 35.01) | null | street | City of Vineland Planning Board minutes (already on the record) | resolved_address_only | Address already documented. Intersection still not geocoded. Keep; do not fail for missing coords. |
| `google-cedar-rapids` | Google Cedar Rapids Data Center | United States | B research-only | Cedar Rapids, IA; city-level only | Big Cedar Industrial Center, along Edgewood Road SW and 76th Avenue SW, Cedar Rapids, IA 52404 | null | campus | [City of Cedar Rapids Google Data Center Project FAQ](https://cms8.revize.com/revize/cedarrapids/Economic%20Development/Google%20Data%20Center%20Project%20_%20FAQ.pdf); [Cedar Rapids Economic Development](https://www.economicdevelopmentcr.com/data-centers/) | resolved_address_only | Named industrial park + two streets from city economic-development documents. |
| `google-council-bluffs` | Google Council Bluffs Data Center | United States | B research-only | Council Bluffs, IA; no official street | competing: 10410 Bunge Ave (Iowa DNR stormwater, Gazette caption) vs 1430 Veterans Memorial Hwy (DataCenters.com / ColoMap) | null | null | [Iowa DNR stormwater affiliate 10410 BUNGE AVE](https://programs.iowadnr.gov/stormwater/pages/affiliates.aspx?permitID=14754) vs directory Veterans Memorial Hwy | human_review | Two attested streets. Likely original campus vs expansion, or two halls. Do not merge onto one pin without a person. |
| `google-pryor-mayes-county` | Google Pryor / Mayes County Data Center | United States | B research-only | Pryor / Mayes County; no street | 4581 Webb Street, Pryor, OK 74361 (MidAmerica Industrial Park) | null | street | [Tulsa Regional Chamber listing](https://tulsachamber.com/membership/active-member/google-inc./) + Apple Maps / MapQuest + ColoMap; Google announcement names Pryor / Mayes County | resolved_address_only | Operator city + mapping/chamber street. Park identity MidAmerica is consistent. |
| `google-stillwater` | Google Stillwater Data Center Campus | United States | B research-only | Stillwater, OK; city-level only | 1500 E. Richmond Road; SW corner Richmond Road & Jardot Road / Perkins Road (US-177) & Richmond Road, Stillwater, OK | null | campus | [Oklahoma Dept. of Commerce](https://www.okcommerce.gov/google-has-acquired-land-in-stillwater/); [Stillwater Planning Commission coverage](https://www.thestillwegian.news/planning-commission-advances-google-data-center-final-plat/); city economic-development project plan | resolved_address_only | City/state sources, not Google’s marketing page. |
| `meta-eagle-mountain` | Meta Eagle Mountain Data Center | United States | B research-only | Eagle Mountain, UT; city-level | 1275 N Community Circle, Eagle Mountain, UT 84005 | null | campus | [DataCenters.com](https://www.datacenters.com/facebook-eagle-mountain-utah) + [Baxtel](https://baxtel.com/data-center/meta-eagle-mountain-utah-campus) + MapQuest; Meta confirms Eagle Mountain campus | resolved_address_only | Permit trackers also list 1499 N Pony Express Pkwy — treated as campus frontage, not a second facility. Nominatim did not return the Community Circle building. |
| `meta-richland-parish` | Meta Richland Parish Data Center | United States | B research-only | Richland Parish; Holly Ridge contractor-level | Holly Ridge, LA, along LA-183; construction access at Highway 80 and Jaggers Lane | null | campus | [Gulf States Newsroom / News From The States](https://www.newsfromthestates.com/article/construction-metas-largest-data-center-brings-600-crash-spike-chaos-rural-louisiana); Mortenson Holly Ridge; Meta parish-level pages | resolved_address_only | No street number. Named community + highway intersection from local reporting. Same campus as Hyperion. |
| `oracle-shackelford` | Oracle Shackelford County AI Data Center Campus | United States | B research-only | Shackelford County only | none independently retrieved | null | null | [Oracle Shackelford page](https://www.oracle.com/data-centers/shackelford-county/) and [Vantage Frontier](https://vantage-dc.com/data-center-locations/north-america/shackelford-county-tx) remain county-scale | still_research_only | Aggregators cite TX-604 & TX-351 or 175 Private Road 1604. Those were not on operator pages or a government PDF opened in this pass. |
| `project-jupiter-dona-ana` | Project Jupiter (Doña Ana County) | United States | B research-only | Santa Teresa / Doña Ana; no street | SE of NM Highway 136 and NM Highway 9, ~1,400 acres, listed parcel IDs in the executed MOU; near Santa Teresa Port of Entry | null | campus | [Executed MOU](https://haussamen.com/wp-content/uploads/2025/12/Executed-Memorandum-of-Understanding-MOU.pdf); [Haussamen / county application reporting](https://haussamen.com/2025/09/03/developer-must-guarantee-project-jupiters-rosy-promises/) | resolved_address_only | Named intersection + parcels. Directory “NM-136 & Pete V Domenici Hwy” is the same junction (NM-136 is Pete Domenici Hwy). |
| `switch-citadel-tahoe-reno` | Switch Citadel Campus (Tahoe Reno) | United States | B research-only | TRIC / Storey County; no street (do not use Tesla) | 1 Superloop Circle, McCarran, NV 89434 (postal Sparks 89437 also appears); Tahoe Reno Industrial Center | null | campus | [Data Center Map](https://www.datacentermap.com/usa/nevada/reno/switch-tahoe-reno/) + MapQuest + datacenterHawk; Switch TRIC / Tesla-adjacent pages | resolved_address_only | Two independent directories + mapping agree. Operator still omits the street. Nominatim rate-limited; coords null. |
| `related-the-barn-saline` | The Barn (Saline Township Stargate Campus) | United States | B research-only | N side of Michigan Ave, ~575 acres; no street number | 11600 W Michigan Avenue, Saline Township, MI 48176 (plus adjoining parcels on N side of US-12 / Michigan Ave, east of Rustic Glen Golf Club, ~575 acres) | null | campus | [Saline Township Act 198 hearing notice](https://thesuntimesnews.com/saline-twp-board-of-trustees-notice-of-public-hearing-9-10-25/) (parcel commonly known as 11600 W Michigan Ave); [consent judgment](https://salinetownship.org/uploads/notices/SalineDataCenterConsentJudgmentFinalExecutionCopy492124804975v1.pdf); township FAQ | resolved_address_only | Named street number is a township-identified parcel in a multi-parcel campus. Nominatim returned the highway, not a building. |
| `vantage-lighthouse-port-washington` | Vantage Lighthouse Campus (Port Washington) | United States | B research-only | Port Washington; Rotary 1374 Lake Drive unused | 531, 533, 701, and 723 E. Lake Drive, Port Washington, WI (four certified buildings) | null | campus | [Wisconsin DOR Qualified Data Center Exemption list](https://www.revenue.wi.gov/pages/faqs/exemptionforqualifieddatacenter.aspx) — Oracle America Cloud Services LLC, certified 2025-10-31 | resolved_address_only | Government certification of the four Lake Drive buildings. Rotary 1374 Lake Dr is a tour meeting point, not used as the campus address. Vantage/Oracle pages still omit streets. |
| `nscc-aspire-2a` | NSCC ASPIRE 2A / ASPIRE 2A+ | Singapore | B research-only | Singapore; no facility address (Fusionopolis is HQ) | NUS Innovation 4.0 (i4.0) building, 3 Research Link, Singapore 117602 (Level 2 data halls) | null | building | [NSCC maintenance notice](https://help.nscc.sg/aspire2a/urgent_maintenance_2a_30_apr_2026-3-2-2-3/) (NUS i4.0 electrical shutdown affects ASPIRE 2A & 2A+); [SBR tropical DC at NUS i4](https://sbr.com.sg/co-written-partner/event-news/bringing-sustainable-supercomputing-tropics); NSCC workshop “Innovation i4.0 Building”; NUS IPUR lists 3 Research Link | resolved_address_only | Fusionopolis Way remains NSCC offices, not the machine. 2A and 2A+ share adjacent halls in one building. |
| `stargate-uae-cluster` | Stargate UAE | United Arab Emirates | B research-only | Abu Dhabi; hosted by UAE–US campus; no coords | none established | null | null | G42 PR (hosted inside the Abu Dhabi 5GW campus) | still_research_only | Cluster inherits the host campus gap. Do not invent Masdar City coordinates. |
| `bristol-isambard-ai` | Isambard-AI | United Kingdom | B research-only | Bristol; Isambard Park #1 not geocoded | National Composites Centre, Feynman Way Central, Bristol & Bath Science Park, Emersons Green, Bristol BS16 7FS | 51.4981533, -2.4758639 | building | [University of Bristol launch](https://www.bristol.ac.uk/news/2025/july/isambard-launch.html) (based at NCC on the science park); OSM named **National Composites Centre**; [NCC contact address](https://www.nccuk.com/contact-us/) | resolved_map_ready | BriCS page still says Isambard Park #1 in the same high-security compound. Treated as the NCC / science-park campus, not a second site. |
| `meta-hyperion` | Meta Hyperion | United States | B research-only | Named cluster at Richland Parish DC; no separate address | Same as `meta-richland-parish`: Holly Ridge, LA, LA-183 / Hwy 80 & Jaggers Lane | null | campus | Meta Richland Parish / Hyperion posts; location evidence as for the host campus | resolved_address_only | GPU cluster hosted by the parish campus. Shared site expected. Duplicate-campus question vs the DC record remains a Phase 4 identity issue, not a new pin. |
| `nebius-vineland-cluster` | Nebius Vineland GPU Factory | United States | B research-only | Same intersection as DataOne; street; coords null | Lincoln Avenue and Sheridan Avenue, Vineland, NJ | null | street | Same Vineland planning / Nebius evidence as `dataone-vineland` | resolved_address_only | Keep the documented intersection. Geocode later with the landlord record. |
| `intel-leixlip-fab34` | Intel Leixlip Campus (Fab 34) | Ireland | B research-only | Leixlip; Collinstown Park unused | Collinstown Industrial Park, Leixlip, Co. Kildare, W23 CX68 | 53.3752546, -6.5224636 | campus | [EPA Ireland GHG permit](https://epawebapp.epa.ie/licences/lic_eDMS/090151b28094078f.pdf) (Fab 34 emergency generators at Collinstown); OSM named **Collinstown Industrial Park** | resolved_map_ready | Named industrial park from a government permit plus OSM industrial landuse. |
| `micron-singapore-hbm-packaging` | Micron Singapore HBM Advanced Packaging Facility | Singapore | B research-only | Adjacent to current Singapore facilities; no street | Adjacent to Micron Woodlands campus at 1 Woodlands Industrial Park D Street 1, Singapore 738799 | null | campus | [Micron 2025-01-08 PR](https://investors.micron.com/news/press-release/2025/Micron-Breaks-Ground-on-New-HBM-Advanced-Packaging-Facility-in-Singapore-01-08-2025/default.aspx) (adjacent to current Singapore facilities); [Business Times Woodlands](https://www.businesstimes.com.sg/companies-markets/micron-invests-us7-billion-woodlands-advanced-packaging-site-1400-jobs-be-created) | resolved_address_only | New hall is adjacent, not proven to reuse the exact existing door number. Campus of the Woodlands site. |
| `sk-hynix-cheongju` | SK hynix Cheongju Campus | South Korea | B research-only | Cheongju; no street | Cheongju Campus, Heungdeok-gu: 215 Daesin-ro (28429); 959 2sunhwan-ro (28433); 337 Jikji-daero (28436); 120 SK-ro (28356, M15) | null | campus | [SK hynix company locations](https://www.skhynix.com/company/UI-FR-CP06/) | resolved_address_only | Operator publishes four campus streets. Keep one campus entity; do not explode M11/M12/M15/M17 into map points without a person. |
| `sk-hynix-yongin` | SK hynix Yongin Semiconductor Cluster | South Korea | B research-only | Wonsam-myeon township; no pin | Yongin Semiconductor Cluster General Industrial Complex, Wonsam-myeon (Godang-ri, Dokseong-ri, Jukneung-ri), Cheoin-gu, Yongin, Gyeonggi | null | campus | [Yongin City industrial-complex page](https://www.yongin.go.kr/home/www/www19/www19_02_01/www19_02_01_02.jsp); SK hynix Yongin investment PRs | resolved_address_only | Named industrial complex + three ri. No street number yet. Y1/Y2 footprints still not separated. |
| `samsung-hwaseong` | Samsung Foundry Hwaseong | South Korea | B research-only | Hwaseong; no street | 1 Samsungjeonja-ro, Hwaseong-si, Gyeonggi-do 18448 | null | campus | [Samsung Foundry IATF certificate](https://download.semiconductor.samsung.com/resources/others/samsung_electronics_co_ltd_device_solutions_foundry_business_iatf_52883_002.pdf); [ISO 22301 certificate](https://download.semiconductor.samsung.com/resources/others/Certificate_of_Registration_ISO22301_DS_2024.pdf) | resolved_address_only | Operator-published manufacturing address. Nominatim returned the road name only. |
| `samsung-pyeongtaek` | Samsung Foundry Pyeongtaek | South Korea | B research-only | Pyeongtaek; no street | 114 Samsung-ro, Godeok-myeon, Pyeongtaek-si, Gyeonggi-do 17786 | null | campus | Same Samsung IATF / ISO 22301 certificates | resolved_address_only | Official foundry plant address. |
| `tsmc-ap6-zhunan` | TSMC Advanced Backend Fab 6 (Zhunan) | Taiwan | B research-only | 1, Kezhuan 1st Rd., Zhunan; Nominatim failed | 350-012 苗栗縣竹南鎮科專一路1號 (1 Kezhuan 1st Rd, Zhunan Township, Miaoli; Hsinchu Science Park Zhunan) | null | street | [TSMC Fabs directory](https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs) (already on the record); [SIPA Zhunan park vendor list](https://www.sipa.gov.tw/home.jsp?contlink=ap%2Fintroduction_3_5.jsp&menudata=ChineseMenu&mserno=201001210037&serno=201001210040&serno3=201002010019) | resolved_address_only | Official street already present. Park directory corroborates. Still no geocode. |
| `intel-gordon-moore-park-oregon` | Intel Gordon Moore Park at Ronler Acres (D1X) | United States | B research-only | Hillsboro, OR; no street | 2501 NE Century Boulevard, Hillsboro, OR 97124 | 45.5470127, -122.9142624 | campus | [Oregon DEQ Intel Aloha / Ronler Acres](https://www.oregon.gov/deq/aq/cao/nwr/Pages/Intel-Aloha.aspx); OSM industrial buildings D1B / RA1 at that address | resolved_map_ready | Government street plus named campus buildings. Multi-building campus at one published address. |
| `intel-ohio-one` | Intel Ohio One | United States | B research-only | New Albany, OH; no street | 11511 Green Chapel Road NW, New Albany, OH 43031 (FTZ physical address); site bordered by Clover Valley, Green Chapel, Mink, and south of Jug/Miller | null | campus | [US FTZ Zone 138 Subzone 00I Site 001](https://ofis.trade.gov/Site/Details/4951); Licking County local press on site bounds; Ohio grant also cites 8600 Smith’s Mill Road parcels | resolved_address_only | Smith’s Mill appears as a grant/parcel reference on the same megasite, not a competing city. 8255 Innovation Campus Way W is a separate 27-acre FTZ site and was not used as the fab pin. |
| `micron-boise` | Micron Boise Leading-Edge DRAM Campus | United States | B research-only | Boise, ID; no street | 8000 S Federal Way, Boise, ID 83716 (existing campus; new HVM fabs co-located) | null | campus | [Micron locations](https://www.micron.com/about/locations); [NIST CHIPS Micron Idaho](https://www.nist.gov/chips/micron-idaho-boise) (Boise 83716); BoiseDev expansion tracker | resolved_address_only | Nominatim returned a house interpolation; not used as a campus centroid. Address stands. |
| `samsung-taylor-tx` | Samsung Austin Semiconductor Taylor | United States | B research-only | Taylor, TX; no street | 1530 FM 973, Taylor, TX 76574-4540; campus between Highway 79 and FM 973 (CR 404 runs through the site) | null | campus | [TCEQ correspondence to Samsung Austin Semiconductor Taylor Site](https://records.tceq.texas.gov/cs/idcplg?IdcService=TCEQ_EXTERNAL_SEARCH_GET_FILE&Rendition=Web&dID=9611376&searchType=External); [City of Taylor](https://www.taylortx.gov/1276/Samsung-Austin-Semiconductor) | resolved_address_only | MapQuest 2351 County Road 404 is consistent with the CR 404 corridor now largely Samsung-owned; TCEQ 1530 FM 973 is the government mailing/site address used here. |
| `xai-colossus-onsite-gas-turbines` | xAI Colossus On-site Gas Turbines (Memphis) | United States | B research-only | 3231 Paul R. Lowry Road; no coords/precision | 3231 Paul R. Lowry Road, Memphis, TN 38109 | 35.0600576, -90.1522248 | street | [TDEC SOP-24025](https://dataviewers.tdec.tn.gov/dataviewers/BGWPC.GET_WPC_DOCUMENTS?p_file=1326053310376643980) (CTC Property / 3231 Paul R. Lowry Rd); Commercial Appeal turbine coverage; Nominatim street geocode | resolved_map_ready | Address was already on the record. Government corroboration + street geocode. Turbines are on-site equipment of Colossus; do not invent a second pin. |

**Row count: 42.**

---

## Remediation summary

| Metric | Count |
| --- | --- |
| Total attempted | **42** |
| `resolved_map_ready` | **8** |
| `resolved_address_only` | **28** |
| `still_research_only` | **3** |
| `human_review` | **3** |
| Sum of outcomes | **42** |

Secondary counts:

| Metric | Count |
| --- | --- |
| Upgraded from no coordinates (now have lat/lon) | **8** |
| Upgraded from city precision | **0** (`aws-morrow-county` remains city / human_review) |
| Address found (street, campus, parcel, or named park) | **38** |
| Coordinates found | **8** |
| Directory evidence contributed to the location | **12** |
| Government / property evidence contributed to the location | **20** |

Map-eligible under the Urdais methodology (non-city precision + position evidence): the 8 `resolved_map_ready` rows. The 28 address-only rows are valid research records and become map-eligible after geocode/validation. The 3 human-review rows must not be published as a single dot until a person chooses the entity grain. The 3 still-research-only rows remain unpublished.

---

## Expanded evidence notes

### Map-ready (8)

**`aws-cumulus-susquehanna`.** Amazon Data Services’ SRBC application states facility address **1125 Electron Avenue, Salem Township, Luzerne County, PA 18603-6655** for PHL100 (three buildings). OSM has a named industrial building “Amazon AWS PHL” at that street (41.0838485, -76.1435333). DataCenters.com lists the same address. Identity matches the Talen Cumulus / Susquehanna-adjacent campus.

**`google-hamina`.** Google’s own page: purchased the Summa paper mill in 2009. DataCenters.com and Data Center Platform: **Ensontie 1, 49420 Hamina**. Nominatim returns Ensontie with display name including **Google Haminan palvelinkeskus** at 60.5381382, 27.1234892 — a named campus feature, campus precision.

**`google-inzai`.** Google: Inzai, Chiba, opened March 2023. Sankei: 印西市鹿黒南. OSM way named **Google 印西データセンター** with addr:quarter 鹿黒南, block ２−４ (35.81831, 140.13274). Directories independently give 2-chōme-2-4 Kagurominami.

**`microsoft-sweden-gavle`.** Swedish environmental permit: Microsoft datacenter on **Stackbo 1:35**, Gävle, coordinates **N 6 719 765 / E 610 115 (SWEREF 99)**, ~10 km SW of Gävle centrum. Converted WGS84 **60.59862, 17.01082**. Directory street Bakvretsgatan is consistent with that campus and is recorded as alias/street, not a second site. OCOLO’s Farfarsvägen 1 Valbo was not applied to this record.

**`bristol-isambard-ai`.** University launch article: Isambard-AI is based at the **National Composites Centre** on Bristol and Bath Science Park. NCC address: Feynman Way Central, Emersons Green, BS16 7FS. OSM named building National Composites Centre (51.4981533, -2.4758639). The BriCS page’s “Isambard Park #1” is the same high-security compound.

**`intel-leixlip-fab34`.** EPA Ireland GHG permit operator/site: **Collinstown Industrial Park, Leixlip, Kildare, W23 CX68**, with Fab 34 generators listed. OSM industrial landuse Collinstown Industrial Park (53.3752546, -6.5224636). Campus precision for a multi-fab park.

**`intel-gordon-moore-park-oregon`.** Oregon DEQ: Gordon Moore Park at Ronler Acres, **2501 NE Century Boulevard, Hillsboro, OR 97124**. Nominatim returns named industrial buildings D1B and RA1 at that address (45.5470127, -122.9142624). Campus precision.

**`xai-colossus-onsite-gas-turbines`.** Address **3231 Paul R. Lowry Road** was already stored. TDEC SOP-24025 correspondence uses that address for CTC Property / Colossus. Shelby County turbine permitting is at the same site. Nominatim street geocode 35.0600576, -90.1522248. Street precision; on-site equipment of Colossus, not a second campus.

### Address-only highlights

**`naver-gak-sejong`.** NAVER’s GAK Sejong site now prints **세종특별자치시 행복대로 824**. Phase 1 correctly refused a third-party snippet; the operator page is now the source.

**`coreweave-lancaster-pa`.** City of Lancaster: Chirisa/Machine Investment developing **216 Greenfield Road** and **1375 Harrisburg Pike**; Greenfield is the active construction / CoreWeave lease. Treat Harrisburg Pike as a separate future building, not a conflicting address for this ID.

**`cyrusone-dfw10-bosque`.** TDLR architectural-barriers project: CyrusOne DFW10 at **557 CR 3610, Whitney, TX 76692**, Bosque County. That is the street Phase 1 saw only in directories.

**`vantage-lighthouse-port-washington`.** Wisconsin DOR certified Oracle America Cloud Services LLC at **531, 533, 701, and 723 E. Lake Drive**, Port Washington (2025-10-31). Stronger than the Rotary tour address 1374 Lake Drive.

**`google-cedar-rapids` / `google-stillwater`.** City and state economic-development documents supply a named park or plat street that Google’s own pages still omit.

**`sk-hynix-cheongju` / `samsung-hwaseong` / `samsung-pyeongtaek`.** Operator location pages or certificates list streets. Multi-building campuses stay one row.

**`dataone-vineland` / `nebius-vineland-cluster` / `tsmc-ap6-zhunan`.** Addresses were already on the records. This pass corroborates and keeps coordinates null.

### Human review (3)

**`aws-morrow-county`.** Intentionally a Morrow County cluster. Rippee Road, Lewis and Clark Drive, and Boardman Airport Road are different Boardman campuses in directories. Publishing one street would mis-state the entity.

**`aws-new-carlisle`.** IEC is confirmed. Local press describes a northern Edison Road site **and** south sites at IN-2 & Larrison. One research ID currently covers all of them.

**`google-council-bluffs`.** Iowa DNR: **10410 Bunge Ave**. Directories: **1430 Veterans Memorial Hwy**. Both are attested. A person should decide whether this ID is one campus, two halls, or needs a split.

### Still research-only (3)

**`uae-us-ai-campus-abu-dhabi` and `stargate-uae-cluster`.** G42/WAM: Abu Dhabi construction of Stargate UAE inside a 5GW UAE–US campus. No street, parcel, or named park on retrieved primary pages. Aggregator Masdar City / ~24.43, 54.62 not used.

**`oracle-shackelford`.** Oracle and Vantage confirm a 1,200-acre Shackelford County Frontier campus. TX-604/TX-351 and 175 Private Road 1604 remain aggregator-only until a Comptroller/permit PDF is opened.

---

## Source classes used in this pass

Tier 1 examples: SRBC, TCEQ, TDLR, EPA Ireland, Oregon DEQ, Wisconsin DOR, US FTZ, Iowa DNR, Yongin City, Saline Township, Cedar Rapids city FAQ, Oklahoma Commerce, NAVER GAK page, SK hynix locations, Samsung certificates, TSMC/SIPA, Micron locations, NRC COLA.

Tier 2 examples: LancasterOnline, Gazette (Council Bluffs caption), Business Times (Woodlands), Sankei (Inzai), University of Bristol news, Gulf States Newsroom.

Tier 3 examples: DataCenters.com, Data Center Map, Baxtel, ColoMap, OSM/Nominatim as geocoder or named-feature corroboration.

Directory metadata (MW, certifications, customers) was not copied.

---

## What this pass does not do

It does not rewrite `data/map/facilities.v1.json`. That file remains the Phase 1 projection. Import/coding should geocode the 28 address-only rows and apply the 8 map-ready coordinates under the existing IDs.
