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
#[derive(Debug)]
pub struct Mindzoo {
    catalog: Catalog,
    pub federation: Federation,
}

impl Mindzoo {
    /// Create a new Mindzoo instance and rebuild the root catalog.
    pub async fn new(dir: PathBuf) -> Result<Self> {
        log::info!("mindzoo::new dir={}", dir.display());
        let catalog = Catalog::new(dir.clone());
        let federation = Federation::new();

        log::info!("mindzoo: rebuilding catalog");
        catalog.rebuild(&federation).await?;
        log::info!("mindzoo: catalog rebuilt");

        Ok(Mindzoo {
            catalog,
            federation,
        })
    }

    /// Find the full path for a mind by UUID prefix.
    pub async fn locate(&self, mind: &str) -> Result<Option<PathBuf>> {
        self.catalog.locate(mind).await
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
        query: Vec<Entry>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Entry>> + Send>>> {
        log::info!("mindzoo::sparql kind={:?} graph={} query={:?}", kind, graph, query);

        let dir_mind = self
            .catalog
            .locate(graph)
            .await?
            .ok_or_else(|| Error::from_message(format!("mind not found: {graph}")))?;

        log::info!("mindzoo::sparql located mind at {}", dir_mind.display());

        let storage = Storage::new(dir_mind.clone());

        match kind {
            Kind::Describe if graph == "root" => {
                Ok(self.catalog.describe(query, &self.federation, &storage))
            }

            Kind::Select | Kind::Describe => Ok(storage.sparql(kind, query)),

            Kind::Update => {
                let stream = storage.sparql(kind, query.clone());

                catalog::drain_stream_boxed(stream).await?;

                self.federation.settle(&dir_mind, None).await?;

                if graph == "root" {
                    for entry in &query {
                        if entry.base == "mind" {
                            self.catalog.induct(entry, &self.federation).await?;
                        }
                    }
                }

                Ok(Box::pin(futures_util::stream::empty()))
            }

            Kind::Delete => {
                let stream = storage.sparql(kind, query.clone());

                catalog::drain_stream_boxed(stream).await?;

                self.federation.settle(&dir_mind, None).await?;

                if graph == "root" {
                    for entry in &query {
                        if entry.base == "mind" {
                            if let Some(mind_value) = &entry.base_value {
                                self.catalog.retire(mind_value).await?;
                            }
                        }
                    }
                }

                Ok(Box::pin(futures_util::stream::empty()))
            }
        }
    }
}
