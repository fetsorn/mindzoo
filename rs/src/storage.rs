use crate::{Kind, Result};
use async_stream::try_stream;
use csvs::{Dataset, Entry};
use futures_core::stream::Stream;
use std::path::PathBuf;
use std::pin::Pin;

/// Storage wraps a csvs Dataset directory and exposes a sparql-like interface.
/// All operations return a stream of Entry for uniform consumption.
pub struct Storage {
    dir: PathBuf,
}

impl Storage {
    pub fn new(dir: PathBuf) -> Self {
        Storage { dir }
    }

    /// Dispatch a sparql-like operation on this storage.
    /// Returns a boxed stream of Entry values.
    pub fn sparql(
        &self,
        kind: Kind,
        query: Entry,
    ) -> Pin<Box<dyn Stream<Item = Result<Entry>> + Send>> {
        let dir = self.dir.clone();

        match kind {
            Kind::Select => Box::pin(select(dir, query)),
            Kind::Describe => Box::pin(describe(dir, query)),
            Kind::Update => Box::pin(update(dir, query)),
            Kind::Delete => Box::pin(delete(dir, query)),
        }
    }
}

fn select(dir: PathBuf, query: Entry) -> impl Stream<Item = Result<Entry>> {
    // csvs select_record_stream takes an input stream of queries and a light flag
    let input = async_stream::stream! {
        yield Ok(query);
    };

    let stream = try_stream! {
        let dataset = Dataset::open(&dir).await.map_err(crate::Error::from)?;

        let record_stream = dataset.select_record_stream(input, true);

        futures_util::pin_mut!(record_stream);

        while let Some(entry) = futures_util::StreamExt::next(&mut record_stream).await {
            yield entry.map_err(crate::Error::from)?;
        }
    };

    stream
}

fn describe(dir: PathBuf, query: Entry) -> impl Stream<Item = Result<Entry>> {
    try_stream! {
        let dataset = Dataset::open(&dir).await.map_err(crate::Error::from)?;
        let record = dataset.build_record(query).await.map_err(crate::Error::from)?;
        yield record;
    }
}

fn update(dir: PathBuf, query: Entry) -> impl Stream<Item = Result<Entry>> {
    async_stream::stream! {
        let result: Result<()> = async {
            let dataset = Dataset::open(&dir).await.map_err(crate::Error::from)?;
            dataset.update_record(vec![query]).await.map_err(crate::Error::from)?;
            Ok(())
        }.await;

        if let Err(e) = result {
            yield Err(e);
        }
    }
}

fn delete(dir: PathBuf, query: Entry) -> impl Stream<Item = Result<Entry>> {
    async_stream::stream! {
        let result: Result<()> = async {
            let dataset = Dataset::open(&dir).await.map_err(crate::Error::from)?;
            dataset.delete_record(vec![query]).await.map_err(crate::Error::from)?;
            Ok(())
        }.await;

        if let Err(e) = result {
            yield Err(e);
        }
    }
}
