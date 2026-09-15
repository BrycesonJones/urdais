# UCPI-LISTED-GPU Family Specification

**Status: approved, version 1.0.0, effective 15 September 2026.** Prepared 14 September 2026, approved 15 September 2026. This document defines the behaviour shared by every *listed on-demand GPU price* sibling under the [Urdais Compute Price Index family](/docs/methodology/ucpi). A GPU child under this specification fixes only its hardware identity, its admitted upstream SKUs and its model-specific evidence; everything else it inherits from here and from the family.

From 1.0.0 this specification is the **methodology of record for its children**. Each listed child declares this specification as its methodology and binds its specification versions to a version of this document. It no longer routes its versioning through the UCPI family document; the family remains the source of the shared primitives named below, and nothing about those primitives changes.

## Why a reusable specification

The first listed sibling, [UCPI-H100-SXM-LISTED](/docs/methodology/ucpi-h100-sxm-listed), was written for one device. Its rules about the economic object, procurement mode, topology evidence, seller identity, source rights, geography, freshness, breadth and publication are not about the H100; they are about listed prices. Restating them per GPU would invite drift. This specification holds them once, so that adding a listed GPU is a matter of configuration and documented evidence rather than a new methodology.

A listed sibling measures a **different economic object** from the accessible-offer child UCPI-H100-SXM and from any future accessible child. Nothing here weakens that separation: a listed price is what a seller asks, evidenced at availability Grade 5, and is never presented as an obtainable price.

## Primary Question

> What do independent legal sellers currently list, per accelerator-hour, for on-demand rental of the specified GPU in the per-accelerator allocation class?

The published statistic for each child is the **median across independent sellers of each seller's listed on-demand per-accelerator-hour price for the child's instrument, on the calculation date**. It is a supply-side listed-price statistic, not a clearing price and not capacity-weighted.

## Inherited from the family, unchanged

The compute-instrument identity framework; the seller, operator and marketplace identity framework and the capacity-source collapse rule; seller identity by legal identity and the independence rule at the floor; the procurement taxonomy and the prohibition on blending modes; the topology principle that per-accelerator normalization is permitted only within a declared class; the prohibition on fractional devices and on synthetic decomposition; the calculation calendar, cutoff and publication deadline; zero carry at launch; the regional median with the even-`N` convention; the market-breadth qualifier and its participant-count rule; the dispersion withholding at Minimum breadth; the source-concentration diagnostics; the source hierarchy, including that a licensed specialist dataset is admissible only where its methodology is disclosed, assessed and recorded; corrections; lineage; and versioning.

## Fixed by this specification for every child

**Economic object and observation type.** A listed on-demand price. The admitted observation type is the family's *indicative or list price*, at availability evidence Grade 5, recorded as exactly that. Availability is not a requirement and is never implied.

**Procurement mode.** On-demand only, taken from the source's own pricing-type separation. Spot, interruptible, community, serverless, reserved and negotiated observations are excluded, never blended.

**Hardware identity.** Each child fixes vendor, model, form factor and, where it distinguishes products, device memory. Where the source is a licensed dataset with a disclosed canonical SKU mapping that separates form factors and memory classes, the vendor's canonical SKU is admitted as Grade C identity and the mapping is recorded in the child. A SKU denoting a different form factor or memory class of the same model is a different instrument and is never collapsed into a sibling. A SKU the registry does not recognise is unsupported and fails identity.

**Full device.** Every child requires the whole physical device. Partitions, virtualized slices and shared hosts are excluded by identity.

**Topology.** The per-accelerator allocation class, established per seller *and per instrument* from Urdais's own evidence: a documented single-accelerator instance type, a minimum-count source field, or a per-accelerator listing on the seller's own price surface, recorded with its source and date. A seller that sells the instrument only as a whole node is excluded with `WHOLE_NODE_REQUIRED`; a seller whose minimum quantity for that instrument Urdais has not established is excluded with `MINIMUM_TOPOLOGY_UNKNOWN`. A vendor's division of a node price by its accelerator count is not an observation of any child. A seller that sells one GPU per accelerator may sell another only as a node; evidence for one instrument never transfers to another.

**Quantity-tiered listings.** Where a seller lists different per-accelerator prices by instance quantity and the source supplies one provider-level figure, that figure may be the seller's median across quantities rather than the canonical single-accelerator price. The observation carries the diagnostic `SELLER_PRICE_TIERED_BY_QUANTITY`; it is disclosed, not excluded, and it is a known limitation of aggregator-sourced listed prices.

**Participants.** The technical source is never a participant. Each underlying seller named by the source is mapped to a Urdais market entity by its source-native identifier. A marketplace's platform-level figure is an aggregate across hosts, not a seller, and is excluded as a service-product mismatch. Resellers are sellers with an undetermined operator and carry the family's standing double-counting limitation.

**Seller legal identity.** Seller identity is legal identity. A seller is a participant only when Urdais has established the single contracting legal entity behind its listed price and recorded it on the market entity, from the seller's own terms. A brand whose contracting entity is unevidenced, evidenced only by a copyright notice or website terms rather than a services agreement, or varies by customer jurisdiction, is excluded with `SELLER_LEGAL_IDENTITY_UNRESOLVED`. Legal identity is never inferred from a brand name or a source's provider label.

**Geography.** One series per child with region scope *listed, provider-wide*, never country series. List prices are published without regional differentiation and the source records region only where known; assigning a country would fabricate an attribute. A stated region is retained on the observation and never used to place it.

**Tenancy, bundle and service tier.** Recorded as metadata where evidenced by Urdais's own seller research, never gated and never inferred.

**Freshness.** The family's calendar, with Urdais's own retrieval time controlling. The source's observation time is retained as the source-effective time. Zero carry.

**Source rights and attribution.** A source enters only with a permitted and reproducible collection path and permitted data use, recorded as a permission basis. Required attribution is carried on every observation, every seller, capacity-source and regional record, and every public representation of the value.

**Source concentration.** One licensed dataset may supply observations for many sellers. The participant count then exceeds the technical-source count; the contributing-source count and the largest-source participant share are published with every value. Many underlying sellers through one technical source are one technical source.

**Direct-source deduplication.** A seller observed both through a licensed dataset and through its own interface, once that interface is permitted, remains one participant: the same market entity, one seller-level observation, the capacity-source collapse governing. Which observation represents the seller is decided by the family's source hierarchy, and every observation retains its technical source. This is a rule now and an implementation only when a second interface exists.

**Publication.** The family's structural rule: no eligible participant or exactly one produces Unavailable; exactly two publishes at Minimum breadth with dispersion withheld; three or more publishes at Normal breadth. Publication requires approved versions of the family methodology, of this specification and of the child; a value computed before then is a labelled candidate. A child with no calculation recorded is reported as such, never with a placeholder price.

## What a child defines

Vendor, model, form factor and memory where it distinguishes products; the upstream SKUs, per technical source, that denote exactly that instrument; the per-seller topology evidence for that instrument; and any model-specific exclusion. A child may not relax anything above.

## Seller refusal of the intended use

A listed price reaches Urdais through a technical source, and the source's terms govern Urdais's use of the source's dataset. That is the ordinary case and it is why a seller's own interface being closed does not by itself remove the seller from a listed series.

It is not the whole rule. Where **the seller has refused Urdais, in writing, permission to use that seller's price data for the intended use**, and the refusal is expressed as a decision about the intended use rather than about a retrieval mechanism, the seller is excluded with `SELLER_USE_REFUSED` and is disclosed as an excluded candidate. Receiving the same price through an intermediary does not cure such a refusal, because the thing refused was the use and not the route.

Two situations are kept apart deliberately:

- A seller whose own interface Urdais may not collect from, with nothing said about the data itself, **remains eligible** through a permitted source. Its exclusion, if any, is for an ordinary reason.
- A seller that has refused the use is **excluded from every route**, and the refusal is recorded on the seller's market entity with its correspondence reference.

This rule exists because the alternative is to treat a licensed aggregator as a way around an answer Urdais asked for and received. Urdais asked; the answer was no; the answer is respected wherever the data arrives from. A seller excluded under this rule never counts toward breadth, and the count of such sellers is published with every value so that a user can see the measure is narrower than the market.

Reopening requires a materially different intended use and a fresh written approval from the seller.

## Vocabulary

Exclusion reasons and diagnostics are the family's and the H100 child's, with three listed-family additions: `SELLER_LEGAL_IDENTITY_UNRESOLVED` (P1 exclusion), `SELLER_USE_REFUSED` (P1 exclusion) and `SELLER_PRICE_TIERED_BY_QUANTITY` (diagnostic).

## Published Surface

For each child: symbol and display name; the GPU identity; price in United States dollars per accelerator-hour; the one-day percentage change under the family rule, never a currency difference; procurement mode on-demand; observation type listed; the participant count; the market-breadth qualifier; the contributing technical-source count and the largest-source participant share; the price distribution, withheld at Minimum breadth; the as-of date; the status; the required attributions; and the family, specification and child versions. Constituent sellers and their prices are never exposed.

## Version History

**1.0.0, 15 September 2026, effective 15 September 2026**: approved. This specification becomes the methodology of record for its children, which bind their specification versions to it directly rather than to the UCPI family document; no shared primitive changed. Adds the seller-refusal rule and `SELLER_USE_REFUSED`, which excludes a seller that has refused Urdais the intended use, by every route including an intermediary. No value had been published under any earlier version, so nothing is superseded in the sense of a restatement: the drafts are retained as lineage.

**0.1.0-draft, 14 September 2026**: initial reusable specification, extracted from UCPI-H100-SXM-LISTED 0.1.1-draft without change of semantics, adding per-instrument topology evidence, the quantity-tier diagnostic and the no-placeholder rule for children without a calculation. No production effective date.
