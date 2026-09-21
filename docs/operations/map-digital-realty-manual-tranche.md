# Digital Realty manual-verification tranche

Generated 21 September 2026 from the frozen manual-verification input. The source artifact is `data/map/digital-realty-manual-tranche.v1.json`. Digital Realty's market pages are the cited primary evidence; the manually verified facility code and address remain authoritative, while Nominatim supplies only the coordinate transformation.

## Outcome

| Measure | Count |
| --- | ---: |
| Parent market IDs | 29 |
| Physical facilities | 166 |
| Successfully geolocated and canonical-write eligible | 135 |
| Unresolved / excluded | 31 |
| Exact-address / rooftop or named-feature results | 71 |
| Interpolated / street-level results | 64 |
| Lower-precision results | 7 |
| Shared-address groups | 10 |
| Duplicate-coordinate groups | 21 |
| Suspicious duplicate-coordinate groups | 0 |
| Hard errors | 0 |

Canonical dataset digest after projection: 9f9d8ff2d07c1c0031a16b33bb7b87aec8ac7c76dd45f8a4dedff9d83a88c2e8.

MEX01 is included as `digital-realty-mex01` with the superseding verified address `Camino a Nativitas 800, Colon, Querétaro, Mexico`.

## Records requiring review

| Parent ID | Code | Supplied address | Returned coordinates | Precision | Reason |
| --- | --- | --- | --- | --- | --- |
| digital-realty-athens | ATH1 | Ifestou 76, Koropi, Attica, Athens, Greece | null | unresolved | Provider returned no result. |
| digital-realty-athens | ATH2 | Ifestou 76, Koropi, Attica, Athens, Greece — Second Entrance | null | unresolved | Provider returned no result. |
| digital-realty-athens | ATH3 | Ifestou 74, Koropi, Attica, Athens, Greece | null | unresolved | Provider returned no result. |
| digital-realty-copenhagen | CPH-RS | Carl Jacobsensvej 20, Valby, DK-2750, Denmark | null | unresolved | Provider returned no result. |
| digital-realty-hong-kong | HKG10 | 33 Chun Choi Street, Tseung Kwan O, Sai Kung, Hong Kong | null | unresolved | Provider returned no result. |
| digital-realty-hong-kong | HKG11 | 11 Kin Chuen, Kwai Chung, Hong Kong | null | unresolved | Provider returned no result. |
| digital-realty-tokyo | HND10 | 8-7-2, Shimorenjaku, Mitaka-city, Tokyo, Japan | 35.6833926, 139.5592421 | lower_precision | Provider resolved a city, not a physical address/campus feature. |
| digital-realty-osaka | KIX10 | 5-8-1, Saito Yamabuki, Ibaraki-shi, Osaka, Japan | 34.8621004, 135.5173887 | lower_precision | Returned locality does not clearly match Ibaraki. |
| digital-realty-osaka | KIX11 | 6-1, Saito Aokita, Mino-shi, Osaka, Japan | 34.859917, 135.5109068 | lower_precision | Returned locality does not clearly match Minoh. |
| digital-realty-osaka | KIX12 | 6-2-1, Saito Aokita, Mino-shi, Osaka, Japan | 34.859917, 135.5109068 | lower_precision | Returned locality does not clearly match Minoh. |
| digital-realty-osaka | KIX13 | 5-2-1, Saito Aokita, Mino-shi, Osaka, Japan | 34.859917, 135.5109068 | lower_precision | Returned locality does not clearly match Minoh. |
| digital-realty-london | LGW14 | Unit 21 Goldsworth Park Trading Estate, Woking, GU21 3BA, United Kingdom | null | unresolved | Provider returned no result. |
| digital-realty-london | LHR13 | Fountain Court, Cox Lane, Chessington, KT9 1SJ, United Kingdom | null | unresolved | Provider returned no result. |
| digital-realty-london | LHR17 | 1 Airport Gate, Bath Road, West Drayton, Middlesex UB7 0NA, United Kingdom | 51.481285, -0.4854929 | exact_or_rooftop | Returned locality does not clearly match West Drayton. |
| digital-realty-london | LHR19 | Cloud House, London, E14 9SZ, United Kingdom | 51.4968139, -0.0188181 | exact_or_rooftop | Provider returned multiple similarly ranked candidates. |
| digital-realty-lagos | LKK1 | Mopo Onibeju Village, Ogbombo Road, Building 1, Lagos, Nigeria | null | unresolved | Provider returned no result. |
| digital-realty-lagos | LKK2 | Mopo Onibeju Village, Ogbombo Road, Building 2, Lagos, Nigeria | null | unresolved | Provider returned no result. |
| digital-realty-mombasa | MBA1 | Mombassa Road, Mombasa, Kenya | -4.0474076, 39.6723075 | exact_or_rooftop | Provider returned multiple similarly ranked candidates. |
| digital-realty-marseille | MRS2 | Enceinte Portuaire, Porte 4, 13015, France | null | unresolved | Provider returned no result. |
| digital-realty-marseille | MRS3 | Enceinte Portuaire, Porte 4, 13015, France | null | unresolved | Provider returned no result. |
| digital-realty-marseille | MRS4 | Enceinte Portuaire, Porte 4, 13015, France | null | unresolved | Provider returned no result. |
| digital-realty-marseille | MRS5 | Enceinte Portuaire, Porte 4, 13015, France | null | unresolved | Provider returned no result. |
| digital-realty-nairobi | NBO1 | Langata S Rd & LRC Rd, Nairobi, Kenya | null | unresolved | Provider returned no result. |
| digital-realty-nairobi | NBO2 | Langata S Rd / LRC Rd, Nairobi, Kenya | null | unresolved | Provider returned no result. |
| digital-realty-tokyo | NRT10 | 2-9-3, Otsuka, Inzai-city, Chiba, Japan | null | unresolved | Provider returned no result. |
| digital-realty-tokyo | NRT12 | 2-4-1, Otsuka, Inzai-city, Chiba, Japan | 35.8322582, 140.1452981 | lower_precision | Provider resolved a city, not a physical address/campus feature. |
| digital-realty-tokyo | NRT14 | 2-4-3, Otsuka, Inzai-city, Chiba, Japan | 35.8322582, 140.1452981 | lower_precision | Provider resolved a city, not a physical address/campus feature. |
| digital-realty-paris | PAR6 | 11-15 Rue Galliee, Ivry-sur-Seine 94200, France | null | unresolved | Provider returned no result. |
| digital-realty-hillsboro | PDX10 | 3825 NW Aloclek Street, Hillsboro, OR 97124, United States | null | unresolved | Provider returned no result. |
| digital-realty-rio | RIO02 | Avenida Beirute, 863 – Medeiros, Jundiaí – SP, 13212-215, Brazil | null | unresolved | Provider returned no result. |
| digital-realty-sao-paulo | SP04 | R. Bento de Souza Borges, 21, Industrial Anhangüera, Osasco, SP 06276-016, Brazil | null | unresolved | Provider returned no result. |

## Duplicate-coordinate review

Exact coordinate equality never merges records. Every duplicate-coordinate group is explained by a shared normalized address.
