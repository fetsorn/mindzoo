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
        "branch": ["trunk", "task", "cognate"],
        "origin_url": ["origin_token"]
    })
}

/// Static catalog branch records: metadata about each collection.
/// Mirrors JS catalog_branch_records.json.
fn catalog_branch_values() -> Vec<Value> {
    vec![
        json!({"_": "branch", "branch": "mind", "@en": "mind", "@ru": "Проект"}),
        json!({"_": "branch", "branch": "name", "@en": "Name of the mind", "@ru": "Название проекта"}),
        json!({"_": "branch", "branch": "category", "@en": "Category of the mind", "@ru": "Категория проекта"}),
        json!({"_": "branch", "branch": "branch", "@en": "Branch name", "@ru": "Название ветки"}),
        json!({"_": "branch", "branch": "trunk", "@en": "Branch trunk", "@ru": "Ствол ветки"}),
        json!({"_": "branch", "branch": "task", "@en": "Branch task", "@ru": "Предназначение ветки"}),
        json!({"_": "branch", "branch": "cognate", "@en": "Branch cognate", "@ru": "Родственная ветка"}),
        json!({"_": "branch", "branch": "local_tag", "task": "directory", "@en": "Path to asset archive", "@ru": "Путь к локальному архиву"}),
        json!({"_": "branch", "branch": "origin_url", "task": "remote", "@en": "URL to remote git repository", "@ru": "Путь к удалённому git репозиторию"}),
        json!({"_": "branch", "branch": "origin_token", "@en": "Authentication token", "@ru": "Токен для синхронизации"}),
        json!({"_": "branch", "branch": "sync_tag", "task": "sync", "@en": "Name of database to sync", "@ru": "Название базы данных для синхронизации"}),
        json!({"_": "branch", "branch": "sync_tag_search", "@en": "Search query", "@ru": "Поисковый запрос"}),
    ]
}

/// Catalog manages the ephemeral root dataset that indexes all minds in a directory.
#[derive(Clone, Debug)]
pub struct Catalog {
    /// Parent directory containing all mind directories and the root catalog.
    dir: PathBuf,
}

impl Catalog {
    pub fn new(dir: PathBuf) -> Self {
        Catalog { dir }
    }

    /// Find the full path for a mind by UUID.
    /// Scans dir for an entry whose csvs/.csvs.csv contains matching uuid/id,
    /// falls back to matching folder name.
    pub async fn locate(&self, mind: &str) -> Result<Option<PathBuf>> {
        let mut entries = fs::read_dir(&self.dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            // check csvs/.csvs.csv for uuid/id match
            let mind_storage = Storage::new(path.clone());
            let version_query: Entry = json!({"_": "."}).try_into()?;
            let version_records = collect_stream(
                mind_storage.sparql(Kind::Select, vec![version_query]),
            ).await;

            if let Ok(records) = version_records {
                let found_uuid = records.first().and_then(|v| {
                    v.leaves.get("uuid")
                        .or_else(|| v.leaves.get("id"))
                        .and_then(|entries| entries.first())
                        .and_then(|e| e.base_value.as_deref())
                });

                if found_uuid == Some(mind) {
                    return Ok(Some(path));
                }
            }

            // fallback: match folder name
            let name_str = entry.file_name();
            let name_str = name_str.to_string_lossy();
            if name_str == mind {
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

        let name = dir_mind
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let mind_storage = Storage::new(dir_mind.clone());

        // read uuid from csvs/.csvs.csv version record
        let version_query: Entry = json!({"_": "."}).try_into()?;
        let version_records = collect_stream(
            mind_storage.sparql(Kind::Select, vec![version_query]),
        ).await?;

        let uuid = version_records.first().and_then(|v| {
            v.leaves.get("uuid")
                .or_else(|| v.leaves.get("id"))
                .and_then(|entries| entries.first())
                .and_then(|e| e.base_value.clone())
        }).unwrap_or_else(|| mind.to_string());

        let schema_query: Entry = json!({"_": "_"}).try_into()?;
        let schema_records = collect_stream(
            mind_storage.sparql(Kind::Select, vec![schema_query]),
        ).await?;

        // Extract all branch names from schema (trunks and leaves),
        // then DESCRIBE each to get prose (@en/@ru)
        let mut branch_names: Vec<String> = Vec::new();
        if let Some(schema) = schema_records.first() {
            for (trunk, leaves) in &schema.leaves {
                if !branch_names.contains(trunk) {
                    branch_names.push(trunk.clone());
                }
                for leaf_entry in leaves {
                    if let Some(leaf_name) = leaf_entry.base_value.as_deref() {
                        let leaf_name = leaf_name.to_string();
                        if !branch_names.contains(&leaf_name) {
                            branch_names.push(leaf_name);
                        }
                    }
                }
            }
        }

        let mut branch_records: Vec<Entry> = Vec::new();
        for branch_name in &branch_names {
            let query: Entry = json!({"_": "branch", "branch": branch_name}).try_into()?;
            let described = collect_stream(
                mind_storage.sparql(Kind::Describe, vec![query]),
            ).await?;
            if let Some(entry) = described.into_iter().next() {
                branch_records.push(entry);
            }
        }

        let origin = federation.get_origin(&dir_mind);

        let mind_value = records_to_mind(
            &uuid,
            Some(&name),
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

    /// Describe entries from the root graph as a stream.
    /// Each entry is handled in order: root self-description is built
    /// dynamically, all others go through normal storage describe.
    pub fn describe(
        &self,
        query: Vec<Entry>,
        federation: &Federation,
        storage: &Storage,
    ) -> std::pin::Pin<Box<dyn futures_core::stream::Stream<Item = Result<Entry>> + Send>> {
        let catalog = self.clone();
        let federation = federation.clone();
        let storage_dir = storage.dir().clone();

        let stream = async_stream::try_stream! {
            for entry in query {
                if entry.base == "mind" && entry.base_value.as_deref() == Some("root") {
                    let described = catalog.describe_mind("root", &federation).await?;
                    yield described;
                } else {
                    let s = Storage::new(storage_dir.clone());
                    let mut desc_stream = s.sparql(Kind::Describe, vec![entry]);
                    while let Some(result) = futures_util::StreamExt::next(&mut desc_stream).await {
                        yield result?;
                    }
                }
            }
        };

        Box::pin(stream)
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
        drain_stream_boxed(catalog_storage.sparql(Kind::Update, vec![schema_entry])).await?;

        // write branch metadata records
        for value in catalog_branch_values() {
            let entry: Entry = value.try_into()?;
            drain_stream_boxed(catalog_storage.sparql(Kind::Update, vec![entry])).await?;
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

            // read uuid from csvs/.csvs.csv version record
            let mind_dir = dir_entry.path();
            let mind_storage = Storage::new(mind_dir.clone());
            let version_query: Entry = json!({"_": "."}).try_into()?;
            let version_records = match collect_stream(
                mind_storage.sparql(Kind::Select, vec![version_query]),
            ).await {
                Ok(r) => r,
                Err(_) => {
                    log::warn!("catalog::rebuild skipping {} — no .csvs.csv", mind_path_str);
                    continue;
                }
            };

            let uuid = version_records.first().and_then(|v| {
                v.leaves.get("uuid")
                    .or_else(|| v.leaves.get("id"))
                    .and_then(|entries| entries.first())
                    .and_then(|e| e.base_value.as_deref())
            });

            let uuid = match uuid {
                Some(u) => u,
                None => {
                    log::warn!("catalog::rebuild skipping {} — no uuid in .csvs.csv", mind_path_str);
                    continue;
                }
            };

            let mind_entry = match self.describe_mind(uuid, federation).await {
                Ok(entry) => entry,
                Err(e) => {
                    log::warn!("catalog::rebuild skipping {}: {}", mind_path_str, e);
                    continue;
                }
            };
            drain_stream_boxed(catalog_storage.sparql(Kind::Update, vec![mind_entry])).await?;
        }

        // settle the root catalog git repo
        federation.settle(&dir_catalog, None).await?;

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

        // if no name, use uuid as name
        let name = get_leaf_value(record, "name").unwrap_or(mind);

        let origin_url = get_leaf_entry(record, "origin_url");
        let origin = origin_url.and_then(|ou| {
            let url = ou.base_value.as_ref()?;
            let token = get_leaf_value(&ou, "origin_token");
            Some(git2kit::Origin::new(url, token))
        });

        let dir_mind_existing = self.locate(mind).await?;
        let is_new = dir_mind_existing.is_none();

        // if folder name collides with a different uuid, use name-uuid
        let mut dir_mind_new = self.dir.join(name);
        if is_new && dir_mind_new.exists() {
            let existing_uuid = {
                let s = Storage::new(dir_mind_new.clone());
                let vq: Entry = json!({"_": "."}).try_into()?;
                let vr = collect_stream(s.sparql(Kind::Select, vec![vq])).await.ok();
                vr.and_then(|r| r.first().and_then(|v| {
                    v.leaves.get("uuid")
                        .or_else(|| v.leaves.get("id"))
                        .and_then(|entries| entries.first())
                        .and_then(|e| e.base_value.clone())
                }))
            };
            if existing_uuid.as_deref() != Some(mind) {
                dir_mind_new = self.dir.join(format!("{name}-{mind}"));
            }
        }

        if is_new {
            if let Some(ref origin) = origin {
                // clone
                federation.settle(&dir_mind_new, Some(origin)).await?;

                // read uuid from cloned repo's version record
                let cloned_storage = Storage::new(dir_mind_new.clone());
                let vq: Entry = json!({"_": "."}).try_into()?;
                let cloned_vr = collect_stream(
                    cloned_storage.sparql(Kind::Select, vec![vq]),
                ).await.ok();

                let cloned_uuid = cloned_vr.and_then(|r| r.first().and_then(|v| {
                    v.leaves.get("uuid")
                        .or_else(|| v.leaves.get("id"))
                        .and_then(|entries| entries.first())
                        .and_then(|e| e.base_value.clone())
                }));

                let cloned_uuid = match cloned_uuid {
                    Some(u) => u,
                    None => {
                        log::warn!("catalog::induct cloned repo has no uuid, skipping {}", dir_mind_new.display());
                        return Ok(());
                    }
                };

                // read actual schema from cloned repo and write to catalog
                let mind_entry = self.describe_mind(&cloned_uuid, federation).await?;

                let dir_catalog = self.dir.join("root");
                let catalog_storage = Storage::new(dir_catalog);
                drain_stream_boxed(catalog_storage.sparql(Kind::Update, vec![mind_entry])).await?;

                return Ok(());
            } else {
                fs::create_dir_all(&dir_mind_new).await?;

                // write uuid to csvs/.csvs.csv version record
                let new_mind_storage = Storage::new(dir_mind_new.clone());
                let version_entry: Entry = json!({"_": ".", "uuid": mind}).try_into()?;
                drain_stream_boxed(new_mind_storage.sparql(Kind::Update, vec![version_entry])).await?;
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
            drain_stream_boxed(mind_storage.sparql(Kind::Update, vec![schema_entry])).await?;

            for meta_value in meta_values {
                let meta_entry: Entry = meta_value.try_into()?;
                drain_stream_boxed(mind_storage.sparql(Kind::Update, vec![meta_entry])).await?;
            }
        }

        // settle
        federation.settle(&dir_mind_new, origin.as_ref()).await?;

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
    // collect all unique branch names from the schema (both trunks and leaves)
    let branch_values: Vec<Value> = if let Some(schema) = schema_record {
        let mut all_branches: Vec<String> = Vec::new();

        for (trunk, leaves) in &schema.leaves {
            if !all_branches.contains(trunk) {
                all_branches.push(trunk.clone());
            }
            for leaf_entry in leaves {
                if let Some(leaf_name) = leaf_entry.base_value.as_deref() {
                    if !all_branches.contains(&leaf_name.to_string()) {
                        all_branches.push(leaf_name.to_string());
                    }
                }
            }
        }

        all_branches
            .iter()
            .map(|branch_name| {
                // start with metaRecord if one exists, otherwise empty
                let mut v = branch_records
                    .iter()
                    .find(|br| br.base_value.as_deref() == Some(branch_name.as_str()))
                    .map(|br| br.clone().into_value())
                    .unwrap_or_else(|| json!({}));

                // always ensure _ and branch are set
                if let Value::Object(ref mut map) = v {
                    map.insert("_".to_string(), Value::String("branch".to_string()));
                    map.insert("branch".to_string(), Value::String(branch_name.clone()));
                }

                // find trunks: which schema keys list this branch as a leaf
                let mut trunks: Vec<Value> = Vec::new();

                for (trunk, leaves) in &schema.leaves {
                    for leaf_entry in leaves {
                        if leaf_entry.base_value.as_deref() == Some(branch_name.as_str()) {
                            trunks.push(Value::String(trunk.clone()));
                        }
                    }
                }

                if !trunks.is_empty() {
                    if let Value::Object(ref mut map) = v {
                        map.insert("trunk".to_string(), Value::Array(trunks));
                    }
                }

                v
            })
            .collect()
    } else {
        vec![]
    };

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

#[cfg(test)]
mod tests {
    use super::*;
    use csvs::{Dataset, Entry, IntoValue};
    use serde_json::json;
    use temp_dir::TempDir;

    /// Helper: build default branches matching the JS test fixture.
    fn default_branches() -> Vec<Value> {
        vec![
            json!({"_": "branch", "branch": "event", "@en": "Record", "@ru": "Запись"}),
            json!({"_": "branch", "branch": "actdate", "trunk": "event", "task": "date", "@en": "Date of the event", "@ru": "Дата события"}),
            json!({"_": "branch", "branch": "category", "trunk": "event", "@en": "Category", "@ru": "Категория"}),
            json!({"_": "branch", "branch": "branch", "@en": "Branch name", "@ru": "Название ветки"}),
            json!({"_": "branch", "branch": "trunk", "trunk": "branch", "@en": "Branch trunk", "@ru": "Ствол ветки"}),
            json!({"_": "branch", "branch": "task", "trunk": "branch", "@en": "Branch task", "@ru": "Предназначение ветки"}),
        ]
    }

    /// Write schema + meta records to a temp dataset, mirroring JS mindToRecords flow.
    async fn write_branches(dir: &std::path::Path) -> csvs::Result<()> {
        let branches: Vec<Entry> = default_branches()
            .into_iter()
            .map(|v| v.try_into())
            .collect::<csvs::Result<Vec<Entry>>>()?;

        let (schema_value, meta_values) = mind_to_records(&branches);

        let schema_entry: Entry = schema_value.try_into()?;
        let dataset = Dataset::create(&dir.to_path_buf(), false).await?;
        dataset.update_record(vec![schema_entry]).await?;

        for meta_value in meta_values {
            let meta_entry: Entry = meta_value.try_into()?;
            let dataset = Dataset::open(&dir.to_path_buf()).await?;
            dataset.update_record(vec![meta_entry]).await?;
        }

        Ok(())
    }

    #[tokio::test]
    async fn update_record_writes_prose_blobs_for_branch_meta_records() -> csvs::Result<()> {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().to_path_buf();

        write_branches(&dir).await?;

        let prose_dir = dir.join("csvs").join("prose");
        assert!(prose_dir.exists(), "prose dir should exist");

        let files: Vec<String> = std::fs::read_dir(&prose_dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();

        assert!(files.contains(&"event.en".to_string()), "missing event.en");
        assert!(files.contains(&"event.ru".to_string()), "missing event.ru");
        assert!(files.contains(&"actdate.en".to_string()), "missing actdate.en");
        assert!(files.contains(&"actdate.ru".to_string()), "missing actdate.ru");
        assert!(files.contains(&"category.en".to_string()), "missing category.en");
        assert!(files.contains(&"branch.en".to_string()), "missing branch.en");
        assert!(files.contains(&"trunk.en".to_string()), "missing trunk.en");
        assert!(files.contains(&"task.en".to_string()), "missing task.en");

        Ok(())
    }

    #[tokio::test]
    async fn build_record_with_prose_returns_en_ru() -> csvs::Result<()> {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().to_path_buf();

        write_branches(&dir).await?;

        let query: Entry = json!({"_": "branch", "branch": "event"}).try_into()?;
        let dataset = Dataset::open(&dir.join("csvs")).await?;
        let entry = dataset.build_record_with_prose(query).await?;

        assert_eq!(
            entry.prose.get(&Some("en".to_string())),
            Some(&"Record".to_string()),
            "event branch should have @en"
        );
        assert_eq!(
            entry.prose.get(&Some("ru".to_string())),
            Some(&"Запись".to_string()),
            "event branch should have @ru"
        );

        Ok(())
    }

    #[tokio::test]
    async fn schema_describe_then_records_to_mind_preserves_prose() -> csvs::Result<()> {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().to_path_buf();
        let csvs_dir = dir.join("csvs");

        write_branches(&dir).await?;

        // 1. SELECT schema
        let schema_query: Entry = json!({"_": "_"}).try_into()?;
        let dataset = Dataset::open(&csvs_dir).await?;
        let schema_records = dataset.select_record(vec![schema_query], true).await?;
        let schema = &schema_records[0];

        // 2. extract all branch names from schema
        let mut branch_names: Vec<String> = Vec::new();
        for (trunk, leaves) in &schema.leaves {
            if !branch_names.contains(trunk) {
                branch_names.push(trunk.clone());
            }
            for leaf_entry in leaves {
                if let Some(leaf_name) = leaf_entry.base_value.as_deref() {
                    let s = leaf_name.to_string();
                    if !branch_names.contains(&s) {
                        branch_names.push(s);
                    }
                }
            }
        }

        // 3. DESCRIBE each branch with prose
        let mut branch_records: Vec<Entry> = Vec::new();
        for branch_name in &branch_names {
            let query: Entry = json!({"_": "branch", "branch": branch_name}).try_into()?;
            let dataset = Dataset::open(&csvs_dir).await?;
            let entry = dataset.build_record_with_prose(query).await?;
            branch_records.push(entry);
        }

        // 4. records_to_mind
        let mind_value = records_to_mind(
            "abc123",
            Some("test"),
            Some(schema),
            &branch_records,
            None,
            None,
        );

        let branches = mind_value.get("branch").unwrap().as_array().unwrap();

        let event = branches.iter().find(|b| b.get("branch").and_then(|v| v.as_str()) == Some("event")).unwrap();
        assert_eq!(event.get("@en").and_then(|v| v.as_str()), Some("Record"));
        assert_eq!(event.get("@ru").and_then(|v| v.as_str()), Some("Запись"));

        let actdate = branches.iter().find(|b| b.get("branch").and_then(|v| v.as_str()) == Some("actdate")).unwrap();
        assert_eq!(actdate.get("@en").and_then(|v| v.as_str()), Some("Date of the event"));

        let branch_branch = branches.iter().find(|b| b.get("branch").and_then(|v| v.as_str()) == Some("branch")).unwrap();
        assert_eq!(branch_branch.get("@en").and_then(|v| v.as_str()), Some("Branch name"));

        Ok(())
    }

    #[tokio::test]
    async fn update_record_with_nested_prose_writes_blobs() -> csvs::Result<()> {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().to_path_buf();

        // create dataset with catalog-like schema (create with bare=false adds csvs/ internally)
        let catalog_schema: Entry = json!({
            "_": "_",
            "mind": ["name", "branch"],
            "branch": ["trunk", "task", "cognate"]
        }).try_into()?;

        let dataset = Dataset::create(&dir, false).await?;
        dataset.update_record(vec![catalog_schema]).await?;

        // write a mind record with nested branches containing @en/@ru
        let mind_record: Entry = json!({
            "_": "mind",
            "mind": "abc123",
            "name": "test",
            "branch": [
                {"_": "branch", "branch": "event", "@en": "Record", "@ru": "Запись"},
                {"_": "branch", "branch": "actdate", "trunk": "event", "task": "date", "@en": "Date of the event", "@ru": "Дата события"}
            ]
        }).try_into()?;

        let csvs_dir = dir.join("csvs");
        let dataset = Dataset::open(&csvs_dir).await?;
        dataset.update_record(vec![mind_record]).await?;

        // check nested prose was written
        let prose_dir = csvs_dir.join("prose");
        assert!(prose_dir.exists(), "prose dir should exist");

        let files: Vec<String> = std::fs::read_dir(&prose_dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();

        assert!(files.contains(&"event.en".to_string()), "missing event.en");
        assert!(files.contains(&"event.ru".to_string()), "missing event.ru");
        assert!(files.contains(&"actdate.en".to_string()), "missing actdate.en");
        assert!(files.contains(&"actdate.ru".to_string()), "missing actdate.ru");

        // read back with buildRecord + prose
        let query: Entry = json!({"_": "mind", "mind": "abc123"}).try_into()?;
        let dataset = Dataset::open(&csvs_dir).await?;
        let entry = dataset.build_record_with_prose(query).await?;
        let entry_json = entry.into_value();

        let branches = entry_json.get("branch").unwrap().as_array().unwrap();

        let event = branches.iter().find(|b| {
            b.get("branch").and_then(|v| v.as_str()) == Some("event")
        }).expect("should have event branch as object");

        assert_eq!(event.get("@en").and_then(|v| v.as_str()), Some("Record"));
        assert_eq!(event.get("@ru").and_then(|v| v.as_str()), Some("Запись"));

        Ok(())
    }
}
