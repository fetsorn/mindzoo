---
status: proposed
date: 2026-06-16
decision-makers: fetsorn
---

# ADR-0027: Catalogue overlap stats via value-set intersection

## Context and Problem Statement

Mindzoo manages CSVS minds. Many share entities: the same UUID appears as a value in tablets of multiple minds. This is not a linkset — no dataset references another. It's independent duplication driven by access-control scoping.

The catalogue currently stores identity, schema, and sync metadata per mind. There is no way to ask "which minds overlap and by how much?" without scanning all tablets manually. We need this to reason about coverage, prioritize data entry, and eventually build the ego-network federation UI.

DCAT and VoID are the standard ontologies for dataset catalogues and dataset statistics. VoID defines `void:Linkset` for cross-dataset links, but our case — entity co-occurrence without directed references — has no VoID term. We define our own `overlap` collection now, and align to VoID/DCAT later when SPARQL lands in mindzoo.

## Decision Drivers

* "duplication is not bad, but i lack a way to think about it"
* "data is just duplicated, so we have mind1:uuid1 and mind2:uuid1" — not a linkset, just co-occurrence
* Need cardinalities only, not the shared values themselves
* Schema-agnostic: pool all values across all tablets, don't split by collection
* Must be cheap enough to run on every `catalog.rebuild()`

## Considered Options

### 1. Value-set intersection at rebuild time

During `catalog.rebuild()`, for each mind, collect all distinct values from all data tablets into a `HashSet`. After scanning all minds, compute pairwise intersections. Store `entity_count` per mind and `overlap` records (with `mind_a`, `mind_b`, `cardinality`) for pairs with cardinality > 0.

Schema additions to root catalogue:
```
mind,entity_count
overlap,mind_a
overlap,mind_b
overlap,cardinality
```

### 2. Per-collection overlap (schema-aware)

Same as option 1 but partition values by collection name and store `(mind_a, mind_b, collection, cardinality)`. More granular, but requires schema alignment across minds and explodes the number of overlap records.

### 3. External tool / separate pass

A standalone script that reads tablet files and writes overlap data to a separate store. Decoupled from mindzoo, but creates a second source of truth for catalogue metadata and requires separate invocation.

### 4. Content-hash fingerprinting

Instead of exact value sets, use MinHash or similar sketches to estimate overlap. Trades accuracy for memory on very large datasets.

## Decision Outcome

Chosen option: **1 — Value-set intersection at rebuild time**, because:

- Schema-agnostic pooling is the simplest model and matches the stated need ("just the cardinality, we calculate all and discard those that don't overlap")
- Exact intersection is feasible at current scale (40 minds, 780 pairs, small tablets)
- Computing at rebuild time keeps the catalogue as single source of truth
- The overlap collection is CSVS-native and will map cleanly to VoID-like vocabulary later

Option 2 is a future refinement if per-collection reasoning becomes needed. Option 3 is rejected because it fragments the catalogue. Option 4 is premature — exact computation is cheap at current scale.

## Implementation

See plan 0003-catalogue-overlap.md. Summary:

1. In `rebuild()` scan loop, after `describe_mind()`, read all `*-*.csv` tablet files for each mind, collect distinct values into a `HashSet<String>`
2. Write `entity_count` to each mind's catalogue entry
3. After the scan loop, compute pairwise intersections, write `overlap` records for pairs with cardinality > 0
4. Add five new branch metadata records (entity_count, overlap, mind_a, mind_b, cardinality)
5. Mirror in JS implementation

## Consequences

### Good
- Enables reasoning about dataset overlap from the catalogue alone
- No new dependencies — uses existing CSVS tablet I/O and HashSet
- Rebuild is already ephemeral (delete + recreate), so overlap data stays fresh
- Natural stepping stone to DCAT/VoID alignment

### Neutral
- Rebuild time increases proportionally to total tablet data volume (expected: seconds)
- Memory usage during rebuild increases by sum of all value sets (expected: manageable at current scale)

### Bad
- Schema-agnostic pooling may produce false-positive overlaps (e.g. two minds both have the value "2025" but in unrelated collections). Acceptable for now; per-collection overlap (option 2) can refine later.
- O(n²) pairwise comparison won't scale to thousands of minds. If that happens, switch to option 4 (sketching).
