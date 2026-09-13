# Urdais Methodology

## Purpose

Urdais methodologies define how source information becomes a published Urdais information product. Each output will be developed individually, from its definition through its data requirements to implementation.

Methodology precedes backend implementation: methodology determines what the system must know; the backend implements the system required to know it.

This document establishes the framework. It does not define a finished methodology for any individual output.

## Methodology Principles

- **Traceability:** connect published outputs to their inputs and transformations.
- **Reproducibility:** retain enough context to explain and reproduce results where technically possible.
- **Explicit source provenance:** identify original sources and how observations were obtained.
- **Versioned methodology:** associate outputs with the rules effective at publication.
- **Transparent eligibility rules:** document what is included, excluded, and why.
- **Historical integrity:** preserve the context of past publications and document revisions.
- **Separation of data stages:** distinguish raw, normalized, calculated, and published data.

## Standard Output Methodology Chain

1. **Output Definition:** establish what the information product represents and its intended use.
2. **Underlying Data Structure:** identify the information and relationships needed to describe the output.
3. **Methodology:** define how eligible information becomes the output.
4. **Source Specification:** identify sources, provenance requirements, and eligibility criteria.
5. **Ingestion Contract:** describe the inputs and delivery expectations required from each source.
6. **Stored Outputs:** define what must be retained to support publication and historical explanation.
7. **Validation / Quality Rules:** specify how completeness, consistency, and fitness for publication are assessed.
8. **Backend Implementation:** implement the system required by the preceding decisions.

## Output Methodology Template

Copy these headings when developing an individual output. Leave unresolved decisions explicit; the headings below do not prescribe schemas, calculations, sources, or publication schedules.

```markdown
# [Output name] Methodology

## Output Identity

## Output Definition

## Published Surface

## Underlying Data Structure

## Methodology

## Source Specification

## Ingestion Contract

## Stored Outputs

## Validation / Quality Rules

## Lineage and Reproducibility

## Publication and Revision Behavior

## Methodology Version

## Version History
```

## Methodology Categories

The following categories are reserved for future output-specific methodologies. None is defined by this framework.

- **Indices:** to be developed one output at a time. The first proposed index methodology is [UGAI](/docs/methodology/ugai), the Urdais Global AI Index, which consumes the shared AI Equity Universe. [UAVI](/docs/methodology/uavi), the Urdais AI Volatility Index, is a proposed sibling output that consumes the same universe and measures 30-day option-implied volatility across its option-eligible members.
- **Compute prices:** [UCPI](/docs/methodology/ucpi), the Urdais Compute Price Index family, is a separate shared methodology for measuring what a defined unit of market-accessible accelerated compute costs. It is a parent for per-instrument children rather than a single index, and it does not consume the AI Equity Universe.
- **Markets:** to be developed one output at a time.
- **Market Analytics:** to be developed one output at a time.
- **Maps:** to be developed one output at a time.
- **News / Information:** to be developed one output at a time.

## Shared Methodologies

The [Urdais AI Equity Universe](/docs/methodology/ai-equity-universe) proposes shared company eligibility and base weighting for future UGAI and UAVI outputs. It is a draft with unresolved empirical parameters, not a production universe or a completed index methodology.

## Lineage Model

Published Output → Methodology Version → Calculated / Normalized Inputs → Raw Observations → Original Sources

Future Urdais outputs should be historically explainable and reproducible where technically possible. Each output's methodology should describe which stages apply and document any limits to reconstructing its lineage.

## Versioning

Each output methodology should have a version identifier, an effective date, documented material changes, and a historical changelog. Published outputs should remain attributable to the methodology version that produced them; subsequent changes should not silently rewrite that history.
