# UCPI-H100-SXM-LISTED Sibling Specification

**Status: proposed sibling specification, version 0.1.1-draft. Not launched.** Prepared 14 September 2026; amended the same day. No production value has been published under this document, and none may be until the family methodology and this specification carry approved versions. A candidate value computed as a labelled simulation is not a publication.

This is a sibling of [UCPI-H100-SXM](/docs/methodology/ucpi-h100-sxm) under the [Urdais Compute Price Index family](/docs/methodology/ucpi). It measures a **different economic object** from that child and must never be presented as the same series, as a substitute for it, or as "the H100 price". The distinction is the reason this document exists.

## Why a sibling, and not the child

The family fixes UCPI-H100-SXM's economic object as a **current accessible offer**: a price at which the specified product can be obtained now, evidenced by a discriminating availability signal at Grade 3 or stronger, in a country, from a participant whose exclusive full-device tenancy is stated or documented. The family names the *advertised price* as a distinct statistic and rejects it as UCPI's target because "a price displayed beside no capacity is not formed by the competitive forces of supply and demand".

A licensed market-data source now exists that redistributes provider-level **listed** on-demand H100 SXM prices with attribution, for eleven sellers on one day. Its own terms state what it is: *"listed prices, not guaranteed availability"*. Those observations cannot enter UCPI-H100-SXM without inventing availability, tenancy and topology evidence the source does not carry, and this document does not invent any of it.

The listed price is nonetheless a legitimate object in its own right, and the first child's research already said so: *"a broad advertised-price H100 series may well be useful in its own right. It would be a different output measuring a different economic object, and its usefulness would not justify quietly redefining UCPI."* This sibling is that different output, named so that it cannot be confused with the child.

## Primary Question

> What do independent sellers currently list, per accelerator-hour, for on-demand H100 SXM compute in the per-accelerator allocation class?

The published statistic is the **median across independent sellers of each seller's listed on-demand per-accelerator-hour price for the specified product, on the calculation date**. It is a supply-side listed-price statistic. It is not an accessible price, not a clearing price, not capacity-weighted, and not a measure of what compute can actually be obtained for.

## Inherited from the family, unchanged

The compute-instrument identity framework; the seller, operator and marketplace identity framework and the capacity-source collapse rule; seller identity by legal identity and the independence rule at the floor; the procurement taxonomy and the prohibition on blending modes; the topology principle that per-accelerator normalization is permitted only within a declared class; the prohibition on fractional devices and on synthetic decomposition; the calculation calendar, cutoff and publication deadline; zero carry at launch; the regional median with the even-`N` convention; the market-breadth qualifier and its participant-count rule; the dispersion withholding at Minimum breadth; the source-concentration diagnostics; the source hierarchy, including that a licensed specialist dataset is admissible only where its methodology is disclosed, assessed and recorded; corrections; lineage; and versioning.

## Fixed by this sibling

**Instrument identity.** NVIDIA H100, SXM form factor, 80 GB, full physical device. Where the source is a licensed dataset with a disclosed canonical SKU mapping that separates SXM from PCIe and NVL, the vendor's canonical SKU is admitted as Grade C identity evidence, the mapping is recorded, and the 80 GB device memory follows from NVIDIA's specification of the SXM part. H100 PCIe, H100 NVL and any partition are different instruments and are excluded.

**Economic object and observation type.** A listed on-demand price. The admitted observation type is the family's *indicative or list price*, at availability evidence Grade 5, and the observation records exactly that. Availability is **not** a requirement of this sibling, and the sibling never states or implies that a listed price is obtainable.

**Procurement mode.** On-demand only, taken from the source's own pricing-type separation. Spot, interruptible, community, serverless, reserved and negotiated observations are excluded, never blended.

**Topology.** The per-accelerator allocation class. A vendor feed does not carry topology, so the class must be established from **Urdais's own evidence about the seller**, recorded per seller with its source: a documented single-accelerator instance type, a minimum-count source field, or a per-accelerator listing on the seller's own price surface. A seller whose product is sold only as a whole node is excluded with `WHOLE_NODE_REQUIRED`; a seller whose minimum quantity Urdais has not established is excluded with `MINIMUM_TOPOLOGY_UNKNOWN`. A vendor's division of a node price by its accelerator count is not an observation of this sibling.

**Participants.** The aggregator is the technical source, never a participant. Each underlying seller named by the source is mapped to a Urdais market entity by its source-native identifier and is the candidate participant. A marketplace's platform-level figure is an aggregate across many hosts, not a seller, and is excluded as a service-product mismatch, exactly as the child treats it. Resellers are sellers with an undetermined operator and carry the family's standing double-counting limitation. Independence follows the family rule: distinct sellers by legal identity. A seller is a participant only when Urdais has established the single contracting legal entity behind its listed price and recorded it on the market entity. A brand whose contracting entity Urdais has not evidenced, or whose contracting entity varies by customer jurisdiction so that one provider-wide listed price cannot be tied to one legal seller, is excluded with `SELLER_LEGAL_IDENTITY_UNRESOLVED` and is disclosed as an excluded candidate, never counted toward breadth. Legal identity is never inferred from a brand name or from the source's provider label.

**Geography.** This sibling publishes **one series with region scope "listed, provider-wide"**, not country series. The observations are list prices that the sellers publish without regional differentiation, and the source records region only "where known", which on the first retrieval was four rows in sixteen, three of them on excluded rows. Assigning a country to a region-less list price would fabricate an attribute. Where the source or the seller states a region it is retained on the observation; it is never used to place the observation in a country series, and no country series is published by this sibling. This is a named limitation, disclosed with every value, and it is the reason the sibling is not a regional accessible-price measure.

**Tenancy, bundle and service tier.** Recorded as metadata where evidenced by Urdais's own seller research, never gated and never inferred. Shared or fractional devices remain excluded by the instrument identity.

**Freshness.** The family's calendar applies with Urdais's own retrieval time controlling. The source's own observation time is retained as the source-effective time and never controls eligibility. Zero carry.

**Source rights and attribution.** A source enters only with a permitted and reproducible collection path and permitted data use, recorded as a permission basis. Where the source requires attribution, the attribution is carried on every observation, every capacity-source and regional record, and every public representation of the value, and the sibling's published surface names each contributing technical source.

**Source concentration.** One licensed dataset may supply observations for many independent sellers. The participant count then exceeds the technical-source count, and the family's contributing-source count and largest-source participant share are published so that a user can see that the breadth comes through one vendor.

**Publication.** The family's structural rule: no eligible participant or exactly one produces Unavailable; exactly two publishes at Minimum breadth with dispersion withheld; three or more publishes at Normal breadth. Publication requires approved versions of the family methodology and of this specification; a value computed before then is a labelled candidate.

## Relationship to direct provider sources

A seller may later be observed both through the licensed dataset and through its own interface once that interface is permitted. Both are technical sources for the same seller; the seller remains one participant, the capacity-source collapse governs, and the participant count does not change because a second interface appeared. Which observation represents the seller on a date is decided by the family's source hierarchy and the child's or sibling's rules, not by which interface arrived first, and every observation retains which technical source produced it.

## Vocabulary

Exclusion reasons and diagnostics are the child's, with one addition: `SELLER_LEGAL_IDENTITY_UNRESOLVED`, a P1 exclusion for a seller whose contracting legal entity is not established or is not single. The published surface adds a region-scope field with the value *listed, provider-wide*, and an attribution list.

## Published Surface

UCPI-H100-SXM-LISTED, listed provider-wide: price in United States dollars per H100 SXM accelerator-hour; the one-day percentage change under the child's rule; procurement mode on-demand; topology per-accelerator allocation; observation type listed price; the participant count; the market-breadth qualifier; the contributing technical-source count and the largest-source participant share; the price distribution, withheld at Minimum breadth; the as-of date; the status; the required attributions; and the family and sibling versions.

## Launch Requirements

Before a first publication: an approved family methodology version; an approved version of this specification; at least one permitted licensed source with its methodology assessed and recorded; per-seller topology evidence recorded for every admitted participant; and the first production calculation completed after its cutoff with every gate passed.

## Version History

**0.1.1-draft, 14 September 2026**: seller legal identity made a participation requirement rather than a disclosure. A seller without an evidenced single contracting legal entity is excluded with `SELLER_LEGAL_IDENTITY_UNRESOLVED`. Prompted by review of the first candidate: Nebius's listed price could not be tied to one contracting entity. Its Services Agreement (effective 26 June 2026) assigns the contracting entity by customer jurisdiction: Nebius Inc. for United States customers registered after 13 November 2025, Nebius Israel Ltd for Israel customers registered on or after 11 March 2026, and Nebius B.V. otherwise. No production effective date.

**0.1.0-draft, 14 September 2026**: initial sibling specification, prompted by the qualification of a licensed provider-level listed-price dataset. Defines the listed on-demand economic object, admits vendor canonical SKU identity at Grade C, requires the per-accelerator class from Urdais's own seller evidence, excludes marketplace aggregates and node-only sellers, fixes a single provider-wide listed series rather than country series, records tenancy and bundle as metadata, inherits the family calendar, breadth rule and independence rule unchanged, and requires attribution and source-concentration disclosure. No production effective date.
