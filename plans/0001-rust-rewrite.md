---
status: active
---

# Plan 0001: Rewrite mindzoo JS to Rust

## Context

mindzoo JS maps SPARQL named graphs to csvs datasets.
Each named graph is a "mind" — a csvs dataset in a directory.
The default graph "root" is an ephemeral catalog rebuilt from the filesystem layout on startup.
The single entry point is `sparql({ kind, graph, query })`.

Consumers:
- evenor tauri (lib.rs) calls mindzoo as a Rust library, exposes `sparql` IPC command
- evenor tauri.js wraps IPC into a ReadableStream via repeated pull
- future: CLI, wasm

## Design decisions

1. **All sparql results are streams.** SELECT yields many entries, DESCRIBE yields one, UPDATE/DELETE yield zero. Uniform `Pin<Box<dyn Stream<Item = Result<Entry>>>>` return type.

2. **Mindzoo is Tauri-agnostic.** It takes a dir and produces streams. Evenor's lib.rs owns the IPC-to-stream bridge (StreamStored + repeated command pattern).

3. **Fs is async trait.** csvs-rs is async (tokio), so mindzoo follows suit. Default impl wraps tokio::fs. Can swap for wasm later.

4. **Federation is a trait.** Default impl wraps git2kit. `settle(dir, origin)` = init + commit + fetch/merge/push. Swappable.

5. **LFS and zip are out of scope for v1.**

## csvs-rs API (current)

```rust
Dataset::open(dir: &PathBuf) -> Result<Dataset>
Dataset::create(dir: &PathBuf, nested: bool) -> Result<Dataset>
dataset.select_record_stream(input: S, light: bool) -> impl Stream<Item = Result<Entry>>
  where S: Stream<Item = Result<Entry>>
dataset.select_record(query: Vec<Entry>) -> Result<Vec<Entry>>
dataset.build_record(query: Entry) -> Result<Entry>
dataset.update_record(query: Vec<Entry>) -> Result<()>
dataset.delete_record(query: Vec<Entry>) -> Result<()>
dataset.select_schema() -> Result<Entry>
dataset.update_schema(query: Entry) -> Result<()>

Entry { base, base_value, leader_value, leaves: HashMap<String, Vec<Entry>> }
Entry: TryFrom<Value>, IntoValue -> Value
```

## git2kit API (current, used by legacy mindzoo rust)

```rust
gitinit(path, mind, name) -> Result<()>
rename(path, mind, name) -> Result<()>
clone(path, mind, remote: Origin) -> Result<()>
set_origin(path, mind, remote: Origin) -> Result<()>
get_origin(path, mind) -> Result<Option<Origin>>
commit(path, mind) -> Result<()>
resolve(path, mind, remote: Origin) -> Result<Resolve>
```

## Module layout

```
mindzoo/rs/src/
  lib.rs             Mindzoo struct, sparql dispatch, re-exports
  error.rs           Error/Result
  kind.rs            Kind enum (Select, Describe, Update, Delete)
  fs.rs              Fs trait + TokioFs default impl
  federation.rs      Federation trait + Git2Federation default impl
  catalog.rs         Catalog: locate, rebuild, induct, retire
  csvs_provider.rs   Wraps csvs::Dataset into sparql(kind, query) -> Stream
```

## Public API

```rust
pub struct Mindzoo {
    dir: PathBuf,
}

impl Mindzoo {
    /// Build a new Mindzoo, rebuilding the root catalog from disk.
    pub async fn new(dir: PathBuf) -> Result<Self>;

    /// Single entry point. Returns a stream of Entry values.
    /// SELECT: stream of matching records
    /// DESCRIBE: stream of one enriched record
    /// UPDATE: empty stream (writes, then settles via federation)
    /// DELETE: empty stream (deletes, then settles via federation)
    pub fn sparql(
        &self,
        kind: Kind,
        graph: &str,
        query: Entry,
    ) -> impl Stream<Item = Result<Entry>>;
}
```

## Catalog behavior (mirrors JS catalog.js)

- `locate(mind)` — scan dir for entry matching `^{mind}` prefix (uuid or uuid-name)
- `rebuild()` — delete root dir, create fresh csvs dataset, scan all mind dirs, read their schema + branch records, write mind entries to root catalog, settle root
- `induct(record)` — if new mind: mkdir or clone; if existing: rename. Write schema + branch records from mind record. Settle.
- `retire(mind)` — rm -rf mind dir

Catalog schema comes from static JSON (catalog_schema_record.json + catalog_branch_records.json in JS). These define the "mind", "branch", "name", "origin_url", "origin_token" collections.

## sparql dispatch (mirrors JS index.js)

```
sparql(kind, graph, query):
  dir_mind = catalog.locate(graph)
  dataset = Dataset::open(dir_mind)

  SELECT:
    input_stream = stream::once(Ok(query))
    return dataset.select_record_stream(input_stream, true)

  DESCRIBE:
    record = dataset.build_record(query)
    return stream::once(Ok(record))

  UPDATE:
    dataset.update_record(vec![query])
    federation.settle(dir_mind)
    if graph == "root" && query.base == "mind": catalog.induct(query)
    return stream::empty()

  DELETE:
    dataset.delete_record(vec![query])
    federation.settle(dir_mind)
    if graph == "root" && query.base == "mind": catalog.retire(query.mind)
    return stream::empty()
```

## Implementation order

### Phase 1: Core sparql over csvs (no git)
1. error.rs — define Error enum, Result alias
2. kind.rs — Kind enum with FromStr/Deserialize
3. csvs_provider.rs — wrap Dataset operations into stream-returning functions
4. catalog.rs — locate, rebuild (without settle), retire, induct (without settle)
5. lib.rs — Mindzoo::new, Mindzoo::sparql dispatch
6. Test with csvs-test fixtures

### Phase 2: Federation
7. federation.rs — Federation trait, Git2Federation wrapping git2kit
8. Wire settle calls into catalog.rebuild, catalog.induct, UPDATE, DELETE
9. Integration test with git repos

### Phase 3: Evenor integration
10. Update evenor src-tauri/src/lib.rs to use new mindzoo API
11. Verify tauri.js ReadableStream bridge works end-to-end

## Dependencies (Cargo.toml changes)

Keep: csvs, serde, serde_json, futures-core, futures-util, async-stream, tokio, git2kit, git2
Remove: tauri-build, tauri-plugin-dialog, tauri-plugin-log (these belong to evenor, not mindzoo)
Add: (none expected)

## Migration from legacy

Legacy modules to replace:
- mind/ (Mind struct, find_mind, make_mind, name_mind, get_store_dir) -> catalog.rs locate/induct
- db.rs -> moves to evenor lib.rs (tauri commands) + mindzoo sparql
- git.rs -> federation.rs
- lfs.rs, zip.rs -> dropped for v1
