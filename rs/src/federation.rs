use crate::Result;
use git2kit::{Origin, Repository};
use std::path::Path;

/// Federation handles git operations for a mind directory:
/// init, commit, set remote, fetch/merge/push.
/// Mirrors JS federation.settle(dir, origin).
pub struct Federation;

impl Federation {
    pub fn new() -> Self {
        Federation
    }

    /// Full lifecycle: ensure git repo, commit changes, set remote, resolve (fetch+merge+push).
    ///
    /// If origin is provided and dir doesn't exist, clone.
    /// Otherwise: init if needed, commit, set remote, resolve.
    pub fn settle(&self, dir: &Path, origin: Option<&Origin>) -> Result<()> {
        log::info!("federation::settle dir={} has_origin={}", dir.display(), origin.is_some());

        // clone if origin provided and dir doesn't exist
        if let Some(origin) = origin {
            if !dir.exists() {
                let repo = Repository::clone(dir.to_path_buf(), origin)?;
                repo.set_origin(origin.clone())?;
                return Ok(());
            }
        }

        // init if no .git
        let git_dir = dir.join(".git");
        if !git_dir.exists() {
            Repository::init(dir)?;
        }

        // commit any changes
        let repo = Repository::open(dir)?;
        let _ = repo.commit();

        // set remote and token
        if let Some(origin) = origin {
            repo.set_origin(origin.clone())?;
        }

        // fetch/merge/push (ignore errors — mirrors JS try/catch around resolve)
        if let Some(origin) = &repo.get_origin() {
            let _ = repo.resolve(origin);
        }

        Ok(())
    }

    /// Read origin url and token from git config.
    pub fn get_origin(&self, dir: &Path) -> Option<Origin> {
        let repo = Repository::open(dir).ok()?;
        repo.get_origin()
    }
}
