<div align="center">

part of the [ontonomy](https://norcivilianlabs.org) software suite

AGPL-3.0. Anton Davydov.

</div>

# mindzoo

A dataset manager for [csvs](https://codeberg.org/fetsorn/csvs).

Point mindzoo at a directory of csvs datasets. It scans every
subdirectory, reads each dataset's schema and metadata, and builds
an ephemeral catalog that maps dataset UUIDs to paths. From there,
a single interface handles queries, writes, and deletes across
all datasets.

```
~/minds/
  family/          <- csvs dataset (events, people, dates)
  reading-notes/   <- csvs dataset (books, quotes, tags)
  root/            <- built by mindzoo: catalog of the above
```

Each dataset is a "mind." New minds are created from a template
or cloned from a git remote. After any write, mindzoo commits
the change and optionally pushes to the remote.

Used by [evenor](https://codeberg.org/norcivilianlabs/evenor)
as a storage layer.

## Implementations

- [js/](js/) JavaScript (browser and Node.js), published as
  [@fetsorn/mindzoo](https://www.npmjs.com/package/@fetsorn/mindzoo)
- [rs/](rs/) Rust (library)
