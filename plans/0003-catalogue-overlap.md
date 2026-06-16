---
status: active
---

# 0003 — Catalogue overlap stats in mindzoo

## Goal

During `catalog.rebuild()`, compute per-mind entity counts and pairwise overlap cardinalities. Store them in the root catalogue CSVS. Discard pairs with zero overlap.

## Context

minds share schemas and duplicate entities across access-control boundaries The catalogue currently stores identity + schema + sync metadata but no content statistics. We need overlap cardinalities to reason about coverage, duplication, and data-entry priorities across the ego network.

Later, when mindzoo gets SPARQL, these collections align with DCAT (dataset catalogue) and VoID (dataset statistics). For now they're native CSVS.

## Schema additions

```
_-_.csv (new lines)
mind,entity_count
overlap,mind_a
overlap,mind_b
overlap,cardinality
```

Branch metadata records (new):
```json
{"_": "branch", "branch": "entity_count", "@en": "Number of distinct values", "@ru": "Количество уникальных значений"}
{"_": "branch", "branch": "overlap", "@en": "Pairwise dataset overlap", "@ru": "Попарное пересечение датасетов"}
{"_": "branch", "branch": "mind_a", "@en": "First mind in overlap pair", "@ru": "Первый проект в паре"}
{"_": "branch", "branch": "mind_b", "@en": "Second mind in overlap pair", "@ru": "Второй проект в паре"}
{"_": "branch", "branch": "cardinality", "@en": "Number of shared values", "@ru": "Количество общих значений"}
```

## Implementation steps

### 1. Collect value sets during rebuild scan

In `catalog.rs` `rebuild()`, the loop already iterates all mind directories and opens each as a `Storage`. After `describe_mind()`, also collect all distinct values from the mind's data tablets.

**Approach**: read the mind's csvs directory, open every `*-*.csv` file (skipping `_-_.csv` and `.csvs.csv`), parse each two-column line, insert both key and value into a `HashSet<String>`. This is the mind's "value universe."

Store: `Vec<(String, HashSet<String>)>` — list of `(uuid, values)` pairs, accumulated across the loop.

### 2. Compute entity_count

After the scan loop, for each mind, `entity_count = value_set.len()`. Write to catalogue:

```json
{"_": "mind", "mind": "<uuid>", "entity_count": "<count>"}
```

This reuses the existing mind record — the `entity_count` leaf is added alongside `name`, `category`, etc. Alternatively, write it as a separate UPDATE after the mind entry is written. Simpler: extend the `describe_mind()` return value or write a second UPDATE per mind.

### 3. Compute pairwise overlaps

After all value sets are collected, iterate all `(n*(n-1))/2` unique pairs. For each pair, `cardinality = a_set.intersection(b_set).count()`. If cardinality > 0, write to catalogue:

```json
{"_": "overlap", "overlap": "<uuid_a>-<uuid_b>", "mind_a": "<uuid_a>", "mind_b": "<uuid_b>", "cardinality": "<count>"}
```

The overlap UUID is deterministic (sorted pair concatenation or hash) so it's stable across rebuilds.

### 4. Mirror in JS

`catalog.js` `rebuild()` gets the same logic. Read tablet files with `fs.readdir` + line parsing, same set intersection.

### 5. Branch metadata

Add the five new branch records to `catalog_branch_values()` in Rust and `catalog_branch_records.json` in JS.

## Cost estimate

For 40 minds, worst case 780 pairs. Each mind's value set is built by reading all tablet files — I/O-bound but tablets are small text files, well under a second each. Set intersection in Rust is fast. Total rebuild overhead: seconds, not minutes.

## Not in scope

- Storing the actual shared values (just cardinalities)
- Per-collection overlap (schema-agnostic, all values pooled)
- SPARQL/VoID alignment (deferred to when SPARQL lands)
- Overlap visualization (that's TBN / ego network UI, ADR-0026)
