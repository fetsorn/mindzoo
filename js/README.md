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

This is the JavaScript implementation. It works in the browser
(with [isomorphic-git](https://isomorphic-git.org/) and
[lightning-fs](https://github.com/nicolo-ribaudo/jsgit/tree/main/packages/lightning-fs))
and in Node.js.

Source and Rust implementation:
[codeberg.org/norcivilianlabs/mindzoo](https://codeberg.org/norcivilianlabs/mindzoo).

## Install

```
npm i @fetsorn/mindzoo
```

## Use

```js
import createMindZoo from "@fetsorn/mindzoo";

const zoo = await createMindZoo({ fs, dir: "/minds", http });

// list all datasets in the catalog
const catalog = await zoo.sparql({
  kind: "SELECT",
  graph: "root",
  query: { _: "mind" },
});

// query a specific dataset by UUID
const records = await zoo.sparql({
  kind: "SELECT",
  graph: "abc-123-uuid",
  query: { _: "event" },
});

// write a record
await zoo.sparql({
  kind: "UPDATE",
  graph: "abc-123-uuid",
  query: { _: "event", event: "new-id", actdate: "2026-08-11" },
});
```

After each write, mindzoo commits the change and pushes to the
dataset's git remote if one is configured.

AGPL-3.0. Anton Davydov.
