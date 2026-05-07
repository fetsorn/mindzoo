use crate::federation::Federation;
use crate::storage::Storage;
use crate::{Kind, Result, Error};
use csvs::{Entry, IntoValue};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::path::PathBuf;
use tokio::fs;

/// Static catalog schema: defines collections for the root catalog dataset.
/// Mirrors JS catalog_schema_record.json.
fn catalog_schema_value() -> Value {
    json!({
        "_": "_",
        "mind": ["name", "category", "branch", "origin_url"],
        "branch": ["trunk", "task", "cognate", "description_en", "description_ru"],
        "origin_url": ["origin_token"]
    })
}

/// Static catalog branch records: metadata about each collection.
/// Mirrors JS catalog_branch_records.json.
fn catalog_branch_values() -> Vec<Value> {
    vec![
        json!({"_": "branch", "branch": "mind", "description_en": "mind", "description_ru": "Проект"}),
        json!({"_": "branch", "branch": "name", "description_en": "Name of the mind", "description_ru": "Название проекта"}),
        json!({"_": "branch", "branch": "category", "description_en": "Category of the mind", "description_ru": "Категория проекта"}),
        json!({"_": "branch", "branch": "branch", "description_en": "Branch name", "description_ru": "Название ветки"}),
        json!({"_": "branch", "branch": "trunk", "description_en": "Branch trunk", "description_ru": "Ствол ветки"}),
        json!({"_": "branch", "branch": "task", "description_en": "Branch task", "description_ru": "Предназначение ветки"}),
        json!({"_": "branch", "branch": "cognate", "description_en": "Branch cognate", "description_ru": "Родственная ветка"}),
        json!({"_": "branch", "branch": "description_en", "description_en": "Branch description EN", "description_ru": "Описание ветки на английском"}),
        json!({"_": "branch", "branch": "description_ru", "description_en": "Branch description RU", "description_ru": "Описание ветки на русском"}),
        json!({"_": "branch", "branch": "local_tag", "task": "directory", "description_en": "Path to asset archive", "description_ru": "Путь к локальному архиву"}),
        json!({"_": "branch", "branch": "origin_url", "task": "remote", "description_en": "URL to remote git repository", "description_ru": "Путь к удалённому git репозиторию"}),
        json!({"_": "branch", "branch": "origin_token", "description_en": "Authentication token", "description_ru": "Токен для синхронизации"}),
        json!({"_": "branch", "branch": "sync_tag", "task": "sync", "description_en": "Name of database to sync", "description_ru": "Название базы данных для синхронизации"}),
        json!({"_": "branch", "branch": "sync_tag_search", "description_en": "Search query", "description_ru": "Поисковый запрос"}),
    ]
}

/// Catalog manages the ephemeral root dataset that indexes all minds in a directory.
pub struct Catalog {
    /// Parent directory containing all mind directories and the root catalog.
    dir: PathBuf,
}

impl Catalog {
    pub fn new(dir: PathBuf) -> Self {
        Catalog { dir }
    }

    /// Find the full path for a mind by UUID prefix.
    /// Scans dir for an entry matching `mind` exactly or starting with `{mind}-`.
    pub async fn locate(&self, mind: &str) -> Result<Option<PathBuf>> {
        let mut entries = fs::read_dir(&self.dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            if name_str == mind || name_str.starts_with(&format!("{mind}-")) {
                return Ok(Some(entry.path()));
            }
        }

        Ok(None)
    }

    /// Describe a mind by reading its schema, branches, and git origin.
    /// Builds the mind entry on the fly rather than reading from the catalog.
    pub async fn describe_mind(
        &self,
        mind: &str,
        federation: &Federation,
    ) -> Result<Entry> {
        let dir_mind = self
            .locate(mind)
            .await?
            .ok_or_else(|| Error::from_message(format!("mind not found: {mind}")))?;

        let mind_path_str = dir_mind
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let (uuid, name) = match mind_path_str.split_once('-') {
            Some((u, n)) => (u.to_string(), Some(n.to_string())),
            None => (mind_path_str.clone(), None),
        };

        let mind_storage = Storage::new(dir_mind.clone());

        let schema_query: Entry = json!({"_": "_"}).try_into()?;
        let schema_records = collect_stream(
            mind_storage.sparql(Kind::Select, schema_query),
        ).await?;

        let branch_query: Entry = json!({"_": "branch"}).try_into()?;
        let branch_records = collect_stream(
            mind_storage.sparql(Kind::Select, branch_query),
        ).await?;

        let origin = federation.get_origin(&dir_mind);

        let mind_value = records_to_mind(
            &uuid,
            name.as_deref(),
            schema_records.first(),
            &branch_records,
            origin.as_ref().map(|o| o.url.as_str()),
            origin.as_ref().and_then(|o| o.token.as_deref()),
        );

        let mind_entry: Entry = mind_value.try_into()?;
        log::info!("catalog::describe_mind built entry for {mind}");
        Ok(mind_entry)
    }

    /// Remove a mind directory.
    pub async fn retire(&self, mind: &str) -> Result<()> {
        if let Some(dir_mind) = self.locate(mind).await? {
            let _ = fs::remove_dir_all(&dir_mind).await;
        }

        Ok(())
    }

    /// Destroy and rebuild the root catalog from filesystem layout.
    /// Scans all mind directories, reads their schema + branch records,
    /// and writes mind entries to the root catalog dataset.
    pub async fn rebuild(&self, federation: &Federation) -> Result<()> {
        log::info!("catalog::rebuild dir={}", self.dir.display());

        // remove existing root catalog
        self.retire("root").await?;

        let dir_catalog = self.dir.join("root");

        fs::create_dir_all(&dir_catalog).await?;
        log::info!("catalog::rebuild created {}", dir_catalog.display());

        // create fresh csvs dataset and write catalog schema
        let catalog_storage = Storage::new(dir_catalog.clone());

        // write schema record
        let schema_entry: Entry = catalog_schema_value().try_into()?;
        drain_stream_boxed(catalog_storage.sparql(Kind::Update, schema_entry)).await?;

        // write branch metadata records
        for value in catalog_branch_values() {
            let entry: Entry = value.try_into()?;
            drain_stream_boxed(catalog_storage.sparql(Kind::Update, entry)).await?;
        }

        // scan all mind directories
        let mut entries = fs::read_dir(&self.dir).await?;

        while let Some(dir_entry) = entries.next_entry().await? {
            let mind_path = dir_entry.file_name();
            let mind_path_str = mind_path.to_string_lossy().to_string();

            // skip the root catalog itself
            if mind_path_str == "root" {
                continue;
            }

            log::info!("catalog::rebuild scanning mind {}", mind_path_str);

            // parse uuid from directory name (uuid or uuid-name format)
            let uuid = match mind_path_str.split_once('-') {
                Some((u, _)) => u,
                None => &mind_path_str,
            };

            let mind_entry = self.describe_mind(uuid, federation).await?;
            drain_stream_boxed(catalog_storage.sparql(Kind::Update, mind_entry)).await?;
        }

        // settle the root catalog git repo
        federation.settle(&dir_catalog, None)?;

        Ok(())
    }

    /// Register a new or updated mind.
    /// Mirrors JS catalog.induct(record).
    pub async fn induct(
        &self,
        record: &Entry,
        federation: &Federation,
    ) -> Result<()> {
        let mind = record
            .base_value
            .as_deref()
            .ok_or_else(|| Error::from_message("mind record missing base value"))?;

        let name = get_leaf_value(record, "name");

        let origin_url = get_leaf_entry(record, "origin_url");
        let origin = origin_url.and_then(|ou| {
            let url = ou.base_value.as_ref()?;
            let token = get_leaf_value(&ou, "origin_token");
            Some(git2kit::Origin::new(url, token))
        });

        let dir_mind_existing = self.locate(mind).await?;
        let is_new = dir_mind_existing.is_none();

        let dir_mind_new = match name {
            Some(n) => self.dir.join(format!("{mind}-{n}")),
            None => self.dir.join(mind),
        };

        if is_new {
            if let Some(ref origin) = origin {
                // clone
                federation.settle(&dir_mind_new, Some(origin))?;
            } else {
                fs::create_dir_all(&dir_mind_new).await?;
            }
        } else if let Some(existing) = dir_mind_existing {
            if existing != dir_mind_new {
                fs::rename(&existing, &dir_mind_new).await?;
            }
        }

        // write schema and branch records from the mind record's branch leaves
        let mind_storage = Storage::new(dir_mind_new.clone());

        // extract schema and meta records from branch leaves (mirrors JS mindToRecords)
        let branch_leaves = record.leaves.get("branch");

        if let Some(branches) = branch_leaves {
            let (schema_value, meta_values) = mind_to_records(branches);

            let schema_entry: Entry = schema_value.try_into()?;
            drain_stream_boxed(mind_storage.sparql(Kind::Update, schema_entry)).await?;

            for meta_value in meta_values {
                let meta_entry: Entry = meta_value.try_into()?;
                drain_stream_boxed(mind_storage.sparql(Kind::Update, meta_entry)).await?;
            }
        }

        // settle
        federation.settle(&dir_mind_new, origin.as_ref())?;

        Ok(())
    }
}

// --- helpers ---

/// Drain a boxed stream to completion, discarding values but propagating errors.
pub(crate) async fn drain_stream_boxed(
    stream: std::pin::Pin<Box<dyn futures_core::stream::Stream<Item = Result<Entry>> + Send>>,
) -> Result<()> {
    futures_util::pin_mut!(stream);
    while let Some(result) = stream.next().await {
        if let Err(ref e) = result {
            log::error!("drain_stream_boxed propagating error: {e}");
        }
        result?;
    }
    log::info!("drain_stream_boxed completed ok");
    Ok(())
}

/// Collect a stream into a Vec, propagating errors.
async fn collect_stream(
    stream: std::pin::Pin<Box<dyn futures_core::stream::Stream<Item = Result<Entry>> + Send>>,
) -> Result<Vec<Entry>> {
    futures_util::pin_mut!(stream);
    let mut entries = Vec::new();
    while let Some(result) = stream.next().await {
        entries.push(result?);
    }
    Ok(entries)
}

/// Get the first string value of a leaf by key.
fn get_leaf_value<'a>(entry: &'a Entry, key: &str) -> Option<&'a str> {
    entry
        .leaves
        .get(key)?
        .first()?
        .base_value
        .as_deref()
}

/// Get the first leaf Entry by key.
fn get_leaf_entry<'a>(entry: &'a Entry, key: &str) -> Option<&'a Entry> {
    entry.leaves.get(key)?.first()
}

/// Build a mind JSON value from schema/branch records.
/// Mirrors JS pure.js recordsToMind.
fn records_to_mind(
    uuid: &str,
    name: Option<&str>,
    schema_record: Option<&Entry>,
    branch_records: &[Entry],
    url: Option<&str>,
    token: Option<&str>,
) -> Value {
    let branch_values: Vec<Value> = branch_records
        .iter()
        .map(|br| {
            let mut v = br.clone().into_value();

            // find trunks: which schema keys list this branch as a leaf
            if let Some(schema) = schema_record {
                let branch_name = br.base_value.as_deref().unwrap_or("");
                let mut trunks: Vec<Value> = Vec::new();

                for (trunk, leaves) in &schema.leaves {
                    for leaf_entry in leaves {
                        if leaf_entry.base_value.as_deref() == Some(branch_name) {
                            trunks.push(Value::String(trunk.clone()));
                        }
                    }
                }

                if !trunks.is_empty() {
                    if let Value::Object(ref mut map) = v {
                        map.insert("trunk".to_string(), Value::Array(trunks));
                    }
                }
            }

            v
        })
        .collect();

    let mut mind = json!({
        "_": "mind",
        "mind": uuid,
        "branch": branch_values,
    });

    if let Some(name) = name {
        mind["name"] = Value::String(name.to_string());
    }

    if let Some(url) = url {
        let mut origin_obj = json!({
            "_": "origin_url",
            "origin_url": url,
        });

        if let Some(token) = token {
            origin_obj["origin_token"] = Value::String(token.to_string());
        }

        mind["origin_url"] = origin_obj;
    }

    mind
}

/// Extract schema record and meta records from branch entries.
/// Mirrors JS pure.js mindToRecords.
fn mind_to_records(branches: &[Entry]) -> (Value, Vec<Value>) {
    let mut schema = json!({"_": "_"});
    let mut metas: Vec<Value> = Vec::new();

    for branch in branches {
        let branch_name = match &branch.base_value {
            Some(v) => v.clone(),
            None => continue,
        };

        // extract trunk relationships
        if let Some(trunk_entries) = branch.leaves.get("trunk") {
            for trunk_entry in trunk_entries {
                if let Some(trunk_name) = &trunk_entry.base_value {
                    let leaves = schema
                        .get(trunk_name)
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();

                    let mut new_leaves = leaves;
                    let branch_val = Value::String(branch_name.clone());
                    if !new_leaves.contains(&branch_val) {
                        new_leaves.push(branch_val);
                    }

                    schema[trunk_name] = Value::Array(new_leaves);
                }
            }
        }

        // build meta record (branch record without trunk and leaf)
        let mut meta = branch.clone().into_value();
        if let Value::Object(ref mut map) = meta {
            map.remove("trunk");
            map.remove("leaf");
        }
        metas.push(meta);
    }

    (schema, metas)
}
