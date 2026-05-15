use cucumber::{given, when, then};
use csvs::{Dataset, Entry, IntoValue};
use serde_json::json;
use std::fs;

use super::MindzooWorld;

/// Strip optional content type marker (e.g. "json\n") from the start of a docstring.
fn strip_docstring(raw: &str) -> &str {
    let trimmed = raw.trim_start();
    // If first line is just a content type (no '{' or '['), skip it
    if let Some(first_newline) = trimmed.find('\n') {
        let first_line = &trimmed[..first_newline];
        if !first_line.contains('{') && !first_line.contains('[') {
            return &trimmed[first_newline + 1..];
        }
    }
    trimmed
}

// -- Given --

#[given("a zoo directory")]
async fn given_zoo_dir(world: &mut MindzooWorld) {
    world.create_zoo_dir();
}

#[given(expr = "a mind {string} with schema:")]
async fn given_mind_with_schema(
    world: &mut MindzooWorld,
    step: &cucumber::gherkin::Step,
    folder_name: String,
) {
    let dir = world.mind_path(&folder_name);
    let docstring = step.docstring().expect("docstring required");
    let schema: serde_json::Value = serde_json::from_str(strip_docstring(docstring)).unwrap();

    fs::create_dir_all(&dir).unwrap();

    let dataset = Dataset::create(&dir, false).await.unwrap();
    let schema_entry: Entry = schema.try_into().unwrap();

    dataset.update_record(vec![schema_entry]).await.unwrap();
}

#[given(expr = "an empty directory {string}")]
async fn given_empty_dir(world: &mut MindzooWorld, name: String) {
    let dir = world.mind_path(&name);

    fs::create_dir_all(&dir).unwrap();
}

#[given(expr = "the mind {string} has branch records:")]
async fn given_mind_branch_records(
    world: &mut MindzooWorld,
    step: &cucumber::gherkin::Step,
    name: String,
) {
    let dir = world.mind_path(&name);
    let docstring = step.docstring().expect("docstring required");
    let branches: Vec<serde_json::Value> = serde_json::from_str(strip_docstring(docstring)).unwrap();

    for branch_value in branches {
        let entry: Entry = branch_value.try_into().unwrap();
        let dataset = Dataset::open(&dir).await.unwrap();

        dataset.update_record(vec![entry]).await.unwrap();
    }
}

#[given("a rebuilt catalog")]
async fn given_rebuilt_catalog(world: &mut MindzooWorld) {
    let dir = world.zoo_dir.clone().unwrap();

    world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
}

// -- When --

#[when(expr = "I locate {string}")]
async fn when_locate(world: &mut MindzooWorld, mind: String) {
    if world.zoo.is_none() {
        let dir = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
    }

    world.locate_result = world.zoo.as_ref().unwrap().locate(&mind).await.unwrap();
}

#[when("I rebuild the catalog")]
async fn when_rebuild(world: &mut MindzooWorld) {
    let dir = world.zoo_dir.clone().unwrap();

    world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
}

#[when(expr = "I induct a mind with uuid {string} and name {string} and branches:")]
async fn when_induct_with_branches(
    world: &mut MindzooWorld,
    step: &cucumber::gherkin::Step,
    uuid: String,
    name: String,
) {
    let docstring = step.docstring().expect("docstring required");
    let branches: serde_json::Value = serde_json::from_str(strip_docstring(docstring)).unwrap();

    let entry: Entry = json!({
        "_": "mind",
        "mind": &uuid,
        "name": &name,
        "branch": branches,
    })
    .try_into()
    .unwrap();

    if world.zoo.is_none() {
        let dir = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
    }

    let zoo = world.zoo.as_ref().unwrap();

    use futures_util::StreamExt;
    let stream = zoo.sparql(mindzoo::Kind::Update, "root", vec![entry]).await.unwrap();
    futures_util::pin_mut!(stream);
    while let Some(_) = stream.next().await {}
}

#[when(expr = "I induct a mind with uuid {string} and no name and branches:")]
async fn when_induct_no_name_with_branches(
    world: &mut MindzooWorld,
    step: &cucumber::gherkin::Step,
    uuid: String,
) {
    let docstring = step.docstring().expect("docstring required");
    let branches: serde_json::Value = serde_json::from_str(strip_docstring(docstring)).unwrap();

    let entry: Entry = json!({
        "_": "mind",
        "mind": &uuid,
        "branch": branches,
    })
    .try_into()
    .unwrap();

    if world.zoo.is_none() {
        let dir = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
    }

    let zoo = world.zoo.as_ref().unwrap();

    use futures_util::StreamExt;
    let stream = zoo.sparql(mindzoo::Kind::Update, "root", vec![entry]).await.unwrap();
    futures_util::pin_mut!(stream);
    while let Some(_) = stream.next().await {}
}

#[when(expr = "I induct a mind with uuid {string} and name {string} and origin {string} and branches:")]
async fn when_induct_with_origin_and_branches(
    world: &mut MindzooWorld,
    step: &cucumber::gherkin::Step,
    uuid: String,
    name: String,
    origin_template: String,
) {
    let url = world.resolve_origin(&origin_template);
    let docstring = step.docstring().expect("docstring required");
    let branches: serde_json::Value = serde_json::from_str(strip_docstring(docstring)).unwrap();

    let entry: Entry = json!({
        "_": "mind",
        "mind": &uuid,
        "name": &name,
        "origin_url": {
            "_": "origin_url",
            "origin_url": &url,
        },
        "branch": branches,
    })
    .try_into()
    .unwrap();

    if world.zoo.is_none() {
        let dir = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
    }

    let zoo = world.zoo.as_ref().unwrap();

    use futures_util::StreamExt;
    let stream = zoo.sparql(mindzoo::Kind::Update, "root", vec![entry]).await.unwrap();
    futures_util::pin_mut!(stream);
    while let Some(_) = stream.next().await {}
}

#[when(expr = "I retire {string}")]
async fn when_retire(world: &mut MindzooWorld, mind: String) {
    if world.zoo.is_none() {
        let dir = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
    }

    let entry: Entry = json!({
        "_": "mind",
        "mind": &mind,
    })
    .try_into()
    .unwrap();

    match world
        .zoo
        .as_ref()
        .unwrap()
        .sparql(mindzoo::Kind::Delete, "root", vec![entry])
        .await
    {
        Ok(_) => world.last_error = None,
        Err(e) => world.last_error = Some(e.to_string()),
    }
}

#[when(expr = "I describe mind {string}")]
async fn when_describe(world: &mut MindzooWorld, mind: String) {
    if world.zoo.is_none() {
        let dir = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
    }

    let entry: Entry = json!({"_": "mind", "mind": &mind}).try_into().unwrap();

    let stream = world
        .zoo
        .as_ref()
        .unwrap()
        .sparql(mindzoo::Kind::Describe, "root", vec![entry])
        .await
        .unwrap();

    use futures_util::StreamExt;
    futures_util::pin_mut!(stream);

    if let Some(Ok(result)) = stream.next().await {
        world.mind_object = Some(result.into_value());
    }
}

// -- Then --

#[then(expr = "the result is the path to {string}")]
async fn then_result_is_path(world: &mut MindzooWorld, name: String) {
    let expected = world.mind_path(&name);

    assert_eq!(world.locate_result, Some(expected));
}

#[then("the result is empty")]
async fn then_result_empty(world: &mut MindzooWorld) {
    assert_eq!(world.locate_result, None);
}

#[then(expr = "the zoo has a/an {string} directory")]
async fn then_zoo_has_dir(world: &mut MindzooWorld, name: String) {
    let dir = world.mind_path(&name);

    assert!(dir.exists(), "expected {} to exist", dir.display());
}

#[then(expr = "the zoo does not have a/an {string} directory")]
async fn then_zoo_not_has_dir(world: &mut MindzooWorld, name: String) {
    let dir = world.mind_path(&name);

    assert!(!dir.exists(), "expected {} to not exist", dir.display());
}

#[then(expr = "selecting minds from the catalog returns {int} entry/entries")]
async fn then_catalog_has_n_minds(world: &mut MindzooWorld, n: usize) {
    let dir_catalog = world.mind_path("root");
    let dataset = Dataset::open(&dir_catalog).await.unwrap();
    let query: Entry = json!({"_": "mind"}).try_into().unwrap();
    let records = dataset.select_record(vec![query], true).await.unwrap();

    assert_eq!(records.len(), n);
}

#[then(expr = "the mind at {string} has a schema with {string} trunk")]
async fn then_mind_has_schema_trunk(world: &mut MindzooWorld, name: String, trunk: String) {
    let dir = world.mind_path(&name);
    let dataset = Dataset::open(&dir).await.unwrap();
    let query: Entry = json!({"_": "_"}).try_into().unwrap();
    let records = dataset.select_record(vec![query], true).await.unwrap();

    assert!(
        records.first().unwrap().leaves.contains_key(&trunk),
        "expected schema to have trunk \"{}\"",
        trunk
    );
}

#[then(expr = "the mind at {string} has a branch record for {string}")]
async fn then_mind_has_branch_record(world: &mut MindzooWorld, name: String, branch_name: String) {
    let dir = world.mind_path(&name);
    let dataset = Dataset::open(&dir).await.unwrap();
    let query: Entry = json!({"_": "branch", "branch": &branch_name})
        .try_into()
        .unwrap();
    let records = dataset.select_record(vec![query], true).await.unwrap();

    assert!(
        !records.is_empty(),
        "expected branch record for \"{}\"",
        branch_name
    );
}

#[then(expr = "the mind at {string} contains files from the remote")]
async fn then_mind_contains_remote_files(world: &mut MindzooWorld, name: String) {
    let csvs_dir = world.mind_path(&name).join("csvs");

    assert!(csvs_dir.exists(), "expected csvs dir in {}", name);
}

#[then("no error is raised")]
async fn then_no_error(world: &mut MindzooWorld) {
    assert_eq!(world.last_error, None);
}

#[then(expr = "the mind object has uuid {string}")]
async fn then_mind_object_uuid(world: &mut MindzooWorld, uuid: String) {
    let obj = world.mind_object.as_ref().unwrap();

    assert_eq!(obj.get("mind").and_then(|v| v.as_str()), Some(uuid.as_str()));
}

#[then(expr = "the mind object has name {string}")]
async fn then_mind_object_name(world: &mut MindzooWorld, name: String) {
    let obj = world.mind_object.as_ref().unwrap();

    assert_eq!(obj.get("name").and_then(|v| v.as_str()), Some(name.as_str()));
}

#[then(expr = "the mind object has {int} branches")]
async fn then_mind_object_branches(world: &mut MindzooWorld, n: usize) {
    let obj = world.mind_object.as_ref().unwrap();
    let branches = obj.get("branch").and_then(|v| v.as_array());
    let len = branches.map(|b| b.len()).unwrap_or(0);

    assert_eq!(len, n);
}

#[then(expr = "branch {string} has {string} equal to {string}")]
async fn then_branch_has_key_value(
    world: &mut MindzooWorld,
    branch_name: String,
    key: String,
    value: String,
) {
    let obj = world.mind_object.as_ref().unwrap();
    let branches = obj
        .get("branch")
        .and_then(|v| v.as_array())
        .expect("no branches");

    let branch = branches
        .iter()
        .find(|b| b.get("branch").and_then(|v| v.as_str()) == Some(&branch_name))
        .unwrap_or_else(|| panic!("branch \"{}\" not found", branch_name));

    assert_eq!(
        branch.get(&key).and_then(|v| v.as_str()),
        Some(value.as_str())
    );
}

#[then(expr = "branch {string} has trunk {string}")]
async fn then_branch_has_trunk(world: &mut MindzooWorld, branch_name: String, trunk: String) {
    let obj = world.mind_object.as_ref().unwrap();
    let branches = obj
        .get("branch")
        .and_then(|v| v.as_array())
        .expect("no branches");

    let branch = branches
        .iter()
        .find(|b| b.get("branch").and_then(|v| v.as_str()) == Some(&branch_name))
        .unwrap_or_else(|| panic!("branch \"{}\" not found", branch_name));

    let trunks = branch.get("trunk");
    let has_trunk = match trunks {
        Some(serde_json::Value::Array(arr)) => {
            arr.iter().any(|v| v.as_str() == Some(&trunk))
        }
        Some(serde_json::Value::String(s)) => s == &trunk,
        _ => false,
    };

    assert!(has_trunk, "expected trunk \"{}\"", trunk);
}

#[then("the mind object has no origin")]
async fn then_mind_object_no_origin(world: &mut MindzooWorld) {
    let obj = world.mind_object.as_ref().unwrap();

    assert!(
        obj.get("origin_url").is_none(),
        "expected no origin_url"
    );
}
