# Document Title

### mindzoo -- git on injected filesystem
Minds in jars, industrial. A facility that keeps them alive and connected.
it's a zoo for minds — a manager of version-controlled data stores that happen to use git today but could use pijul tomorrow.

- Accepts an injected virtual filesystem (lightningfs, tauri FS, or any implementation matching the FS trait/interface)
- Provides opinionated repo management: create, clone, delete, list, sync (commit + pull + push), conflict resolution
- Uses git2kit-rs / isogit as internal dependencies
- Does not know what is inside the files -- no opinion on content format
- Marketable independently to the tauri ecosystem
