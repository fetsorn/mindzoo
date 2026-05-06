mod catalog;
pub mod error;
pub mod federation;
mod kind;
mod storage;

pub use error::{Error, Result};
pub use federation::Federation;
pub use git2kit::Origin;
pub use kind::Kind;
pub use storage::Storage;

use catalog::Catalog;
use csvs::Entry;
use futures_core::stream::Stream;
use std::path::PathBuf;
use std::pin::Pin;

/// Mindzoo maps SPARQL named graphs to csvs datasets.
///
/// Each named graph is a "mind" — a csvs dataset in a directory.
/// The graph "root" is an ephemeral catalog rebuilt from the filesystem
/// layout on startup, indexing all managed datasets.
///
/// Single entry point: `sparql(kind, graph, query)` returns a stream of entries.
pub struct Mindzoo {
    catalog: Catalog,
    federation: Federation,
}

impl Mindzoo {
    /// Create a new Mindzoo instance and rebuild the root catalog.
    pub async fn new(dir: PathBuf) -> Result<Self> {
        let catalog = Catalog::new(dir.clone());
        let federation = Federation::new();

        catalog.rebuild(&federation).await?;

        Ok(Mindzoo {
            catalog,
            federation,
        })
    }

    /// Single entry point. Returns a stream of Entry values.
    ///
    /// - SELECT: stream of matching records
    /// - DESCRIBE: stream of one enriched record
    /// - UPDATE: empty stream (writes, then settles via federation)
    /// - DELETE: empty stream (deletes, then settles via federation)
    pub async fn sparql(
        &self,
        kind: Kind,
        graph: &str,
        query: Entry,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Entry>> + Send>>> {
        let dir_mind = self
            .catalog
            .locate(graph)
            .await?
            .ok_or_else(|| Error::from_message(format!("mind not found: {graph}")))?;

        let storage = Storage::new(dir_mind.clone());

        match kind {
            Kind::Select | Kind::Describe => Ok(storage.sparql(kind, query)),

            Kind::Update => {
                let stream = storage.sparql(kind, query.clone());

                // drain the update stream to completion
                catalog::drain_stream_boxed(stream).await?;

                // settle git
                self.federation.settle(&dir_mind, None)?;

                // if updating a mind record in root, induct it
                if graph == "root" && query.base == "mind" {
                    self.catalog.induct(&query, &self.federation).await?;
                }

                Ok(Box::pin(futures_util::stream::empty()))
            }

            Kind::Delete => {
                let stream = storage.sparql(kind, query.clone());

                // drain the delete stream to completion
                catalog::drain_stream_boxed(stream).await?;

                // settle git
                self.federation.settle(&dir_mind, None)?;

                // if deleting a mind record from root, retire it
                if graph == "root" && query.base == "mind" {
                    if let Some(mind_value) = &query.base_value {
                        self.catalog.retire(mind_value).await?;
                    }
                }

                Ok(Box::pin(futures_util::stream::empty()))
            }
        }
    }
}
