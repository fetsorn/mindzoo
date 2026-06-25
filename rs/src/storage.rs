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

    pub fn dir(&self) -> &PathBuf {
        &self.dir
    }

    /// Dispatch a sparql-like operation on this storage.
    /// Returns a boxed stream of Entry values.
    pub fn sparql(
        &self,
        kind: Kind,
        query: Vec<Entry>,
    ) -> Pin<Box<dyn Stream<Item = Result<Entry>> + Send>> {
        log::info!("storage::sparql kind={:?} dir={}", kind, self.dir.display());
        let dir = self.dir.clone();

        match kind {
            Kind::Select => Box::pin(select(dir, query)),
            Kind::Describe => Box::pin(describe(dir, query)),
            Kind::Insert => Box::pin(insert(dir, query)),
            Kind::Update => Box::pin(update(dir, query)),
            Kind::Delete => Box::pin(delete(dir, query)),
        }
    }
}

fn select(dir: PathBuf, query: Vec<Entry>) -> impl Stream<Item = Result<Entry>> {
    let stream = try_stream! {
        log::info!("storage::select polled dir={}", dir.display());
        let dataset = Dataset::open(&dir).await.map_err(crate::Error::from)?;
        log::info!("storage::select dataset opened");

        let record_stream = dataset.select_record_stream(query, true);

        futures_util::pin_mut!(record_stream);

        let mut count = 0usize;

        while let Some(entry) = futures_util::StreamExt::next(&mut record_stream).await {
            count += 1;
            log::info!("storage::select yielding entry #{count}");
            yield entry.map_err(crate::Error::from)?;
        }
        log::info!("storage::select done, yielded {count} entries");
    };

    stream
}

fn describe(dir: PathBuf, query: Vec<Entry>) -> impl Stream<Item = Result<Entry>> {
    try_stream! {
        let dataset = Dataset::open(&dir).await.map_err(crate::Error::from)?;
        for q in query {
            let record = dataset.clone().build_record_with_prose(q).await.map_err(crate::Error::from)?;
            yield record;
        }
    }
}

/// Open a dataset, creating it if it doesn't exist yet.
/// Mirrors SPARQL semantics: UPDATE creates the named graph on first write.
async fn open_or_create(dir: &PathBuf) -> crate::Result<Dataset> {
    match Dataset::open(dir).await {
        Ok(ds) => Ok(ds),
        Err(_) => Dataset::create(dir, false).await.map_err(crate::Error::from),
    }
}

fn insert(dir: PathBuf, query: Vec<Entry>) -> impl Stream<Item = Result<Entry>> {
    async_stream::stream! {
        log::info!("storage::insert polled dir={}", dir.display());
        let result: Result<()> = async {
            let dataset = open_or_create(&dir).await?;
            dataset.insert_record(query).await.map_err(crate::Error::from)?;
            Ok(())
        }.await;

        match &result {
            Ok(()) => log::info!("storage::insert ok"),
            Err(e) => log::error!("storage::insert error: {e}"),
        }

        if let Err(e) = result {
            yield Err(e);
        }
    }
}

fn update(dir: PathBuf, query: Vec<Entry>) -> impl Stream<Item = Result<Entry>> {
    async_stream::stream! {
        log::info!("storage::update polled dir={}", dir.display());
        let result: Result<()> = async {
            let dataset = open_or_create(&dir).await?;
            dataset.update_record(query).await.map_err(crate::Error::from)?;
            Ok(())
        }.await;

        match &result {
            Ok(()) => log::info!("storage::update ok"),
            Err(e) => log::error!("storage::update error: {e}"),
        }

        if let Err(e) = result {
            yield Err(e);
        }
    }
}

fn delete(dir: PathBuf, query: Vec<Entry>) -> impl Stream<Item = Result<Entry>> {
    async_stream::stream! {
        let result: Result<()> = async {
            let dataset = Dataset::open(&dir).await.map_err(crate::Error::from)?;
            dataset.delete_record(query).await.map_err(crate::Error::from)?;
            Ok(())
        }.await;

        if let Err(e) = result {
            yield Err(e);
        }
    }
}
