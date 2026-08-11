<div align="center">

part of the [ontonomy](https://norcivilianlabs.org) software suite

</div>

# mindzoo

A dataset manager for [csvs](https://codeberg.org/fetsorn/csvs).
Point it at a directory of csvs datasets and get a single interface
to query, write, and delete records across all of them.

```
~/minds/
  family/          <- csvs dataset
  reading-notes/   <- csvs dataset
  root/            <- built by mindzoo: catalog of the above
```

This is the Rust implementation (library only, no CLI).

Source and JavaScript implementation:
[codeberg.org/norcivilianlabs/mindzoo](https://codeberg.org/norcivilianlabs/mindzoo).

## Install

```toml
[dependencies]
mindzoo = { git = "https://codeberg.org/norcivilianlabs/mindzoo" }
```

## Use

```rust
use mindzoo::{Mindzoo, Kind};
use csvs::Entry;
use serde_json::json;
use futures_util::StreamExt;

let zoo = Mindzoo::new("/minds".into()).await?;

// list all datasets
let query: Entry = json!({"_": "mind"}).try_into()?;
let mut stream = zoo.sparql(Kind::Select, "root", vec![query]).await?;
while let Some(entry) = stream.next().await {
    let entry = entry?;
    // ...
}

// query a specific dataset
let query: Entry = json!({"_": "event"}).try_into()?;
let mut stream = zoo.sparql(Kind::Select, "abc-123-uuid", vec![query]).await?;
```

After each write, mindzoo commits the change and pushes to the
dataset's git remote if one is configured.

AGPL-3.0. Anton Davydov.
