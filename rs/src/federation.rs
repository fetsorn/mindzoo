use crate::Result;
use git2kit::{MergeStrategy, Origin, Repository};
use std::path::{Path, PathBuf};

/// Federation handles git operations for a mind directory:
/// init, commit, set remote, fetch/merge/push.
/// Mirrors JS federation.settle(dir, origin).
#[derive(Clone, Debug)]
pub struct Federation;

impl Federation {
    pub fn new() -> Self {
        Federation
    }

    /// Apply a merge strategy to reconcile local and remote.
    /// Must be called after settle has fetched (origin/main exists).
    pub async fn merge(&self, dir: &Path, strategy: &str) -> Result<()> {
        let dir = dir.to_path_buf();
        let strategy = MergeStrategy::parse(strategy)?;

        tokio::task::spawn_blocking(move || {
            log::info!("federation::merge({}) {}", strategy, dir.display());
            let repo = Repository::open(&dir)?;

            repo.merge(strategy)?;

            Ok(())
        })
        .await
        .map_err(|e| crate::Error::from_message(format!("spawn_blocking: {e}")))?
    }

    /// Fetch from the configured origin remote.
    /// No-op if no origin is set.
    pub async fn fetch(&self, dir: &Path) -> Result<()> {
        let dir = dir.to_path_buf();

        tokio::task::spawn_blocking(move || {
            log::info!("federation::fetch({})", dir.display());
            let repo = Repository::open(&dir)?;

            if let Some(origin) = repo.get_origin() {
                let _ = repo.fetch(&origin);
            }

            Ok(())
        })
        .await
        .map_err(|e| crate::Error::from_message(format!("spawn_blocking: {e}")))?
    }

    /// Push to the configured origin remote.
    /// No-op if no origin is set.
    pub async fn push(&self, dir: &Path) -> Result<()> {
        let dir = dir.to_path_buf();

        tokio::task::spawn_blocking(move || {
            log::info!("federation::push({})", dir.display());
            let repo = Repository::open(&dir)?;

            if let Some(origin) = repo.get_origin() {
                let _ = repo.push(&origin);
            }

            Ok(())
        })
        .await
        .map_err(|e| crate::Error::from_message(format!("spawn_blocking: {e}")))?
    }

    /// Full lifecycle: ensure git repo, commit changes, set remote, resolve (fetch+merge+push).
    ///
    /// If origin is provided and dir doesn't exist, clone.
    /// Otherwise: init if needed, commit, set remote, resolve.
    /// Runs blocking git2 calls on a separate thread.
    pub async fn settle(&self, dir: &Path, origin: Option<&Origin>) -> Result<()> {
        let dir = dir.to_path_buf();
        let origin = origin.cloned();

        tokio::task::spawn_blocking(move || settle_blocking(&dir, origin.as_ref()))
            .await
            .map_err(|e| crate::Error::from_message(format!("spawn_blocking: {e}")))?
    }

    /// Read origin url and token from git config.
    pub fn get_origin(&self, dir: &Path) -> Option<Origin> {
        let repo = Repository::open(dir).ok()?;
        repo.get_origin()
    }
}

/// Blocking implementation of settle, run via spawn_blocking.
fn settle_blocking(dir: &PathBuf, origin: Option<&Origin>) -> Result<()> {
    log::info!("federation::settle dir={} has_origin={}", dir.display(), origin.is_some());

    // init if no .git
    let git_dir = dir.join(".git");
    if !git_dir.exists() {
        log::info!("federation::settle init {}", dir.display());
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
        log::info!("federation::settle resolving {}", dir.display());
        let _ = repo.resolve(origin);
        log::info!("federation::settle resolve done");
    }

    Ok(())
}
