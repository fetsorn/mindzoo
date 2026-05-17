---
status: active
---

# Plan 0002: Federation merge model

## Context

Clone, force-pull, and force-push are currently tangled into settle and induct. This causes problems:
- induct with origin silently swaps the uuid, and the caller never learns the real identity
- settle triggers clone as a side effect of any update on a mind with origin
- there is no way for the user to resolve merge conflicts or choose a strategy

## Insight

Clone, force-pull, and force-push are all **merge strategies**, not separate federation operations. Normal settle is the safe auto-merge path. When it fails, the user chooses a strategy.

## Model

### settle

Always does: init, commit, set remote, fetch, merge(safe), push(safe).

If merge or push fails, that's fine. Remote is already fetched, local is already committed. They're just not reconciled. The repo is in a "fetched but unmerged" state.

### merge(strategy)

User-triggered operation to reconcile local and remote:

- **merge(theirs)**: discard local, checkout origin/main. This IS clone / force-pull.
- **merge(ours)**: keep local, allow-unrelated-histories merge. Next settle pushes it. This IS force-push.
- **merge(hunks)**: hunk-level conflict resolution via the diff3 merge driver. User resolves per-hunk.

### Normal flows

**New mind, no origin:**
settle (init, commit) -> done.

**New mind, with origin (clone):**
1. UPDATE creates mind stub with origin_url (writes stub schema + version record to disk)
2. settle runs: init, commit stub, set remote, fetch, merge fails (unrelated histories) -- expected
3. User sees stub state (remote is fetched but not merged), clicks merge(theirs)
4. Local now matches remote. Next settle is peaceful.

**Existing mind, normal sync:**
settle (fetch, merge auto, push) -> done.

**Existing mind, conflict:**
1. settle: fetch succeeds, merge fails
2. User sees conflict, chooses merge(theirs), merge(ours), or merge(hunks)
3. Next settle pushes the resolution.

### UI state divergence

Mutating sparql (UPDATE, DELETE) does not return records — the API stays sparql-like with empty streams. Since mind identity now lives in federation-owned version tablets (`.csvs.csv`), the UI's record is always a snapshot that may diverge from disk truth (e.g. after clone changes the uuid). This is accepted as inherent to distributed identity. The UI can SELECT to refresh, but there is no guarantee of consistency without an explicit read.

## What changes

### federation (git.js / federation.rs)
- Remove clone from settle (done)
- Remove clone from federation.clone (done, replaced by merge)
- settle: init -> commit -> set remote -> fetch -> merge(safe) -> push(safe), tolerating merge/push failures (done)
- New: merge(strategy) function that applies theirs/ours (done), hunks (future)

### catalog (catalog.js / catalog.rs)
- induct: always writes locally (no clone branch), always settles

### evenor
- Wire merge(theirs) to a UI action ("pull" / "clone")
- Wire merge(ours) to a UI action ("force push")
- Future: wire merge(hunks) for per-hunk resolution

## Open questions

- How to surface federation state (unmerged, conflict, etc.) through the sparql API gracefully. For now, user sees side-effects in app state.
