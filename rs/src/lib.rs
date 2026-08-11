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

/// Mindzoo manages a directory of csvs datasets ("minds").
///
/// On startup it scans subdirectories, reads each dataset's schema
/// and metadata, and builds an ephemeral "root" catalog that maps
/// UUIDs to paths.
///
/// Single entry point: `sparql(kind, graph, query)` returns a stream of entries.
#[derive(Debug)]
pub struct Mindzoo {
    pub catalog: Catalog,
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

    /// Apply a merge strategy to a mind and rebuild its catalog entry.
    pub async fn merge(&self, mind: &str, strategy: &str) -> Result<()> {
        self.catalog.merge(mind, strategy, &self.federation).await
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

            Kind::Insert => {
                let stream = storage.sparql(kind, query);
                catalog::drain_stream_boxed(stream).await?;
                self.federation.settle(&dir_mind, None).await?;
                Ok(Box::pin(futures_util::stream::empty()))
            }

            Kind::Update => {
                if graph == "root" {
                    // mind entries are handled by induct (which writes to catalog + settles)
                    let mut non_mind_entries = Vec::new();

                    for entry in &query {
                        if entry.base == "mind" {
                            self.catalog.induct(entry, &self.federation).await?;
                        } else {
                            non_mind_entries.push(entry.clone());
                        }
                    }

                    if !non_mind_entries.is_empty() {
                        let stream = storage.sparql(kind, non_mind_entries);
                        catalog::drain_stream_boxed(stream).await?;
                        self.federation.settle(&dir_mind, None).await?;
                    }
                } else {
                    let stream = storage.sparql(kind, query);
                    catalog::drain_stream_boxed(stream).await?;
                    self.federation.settle(&dir_mind, None).await?;
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
