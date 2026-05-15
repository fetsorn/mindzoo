use cucumber::{given, when, then};
use std::fs;

use super::MindzooWorld;

// -- Given --

#[given(expr = "a mock git server with repo {string} that has uuid {string}")]
async fn given_fixture_repo(world: &mut MindzooWorld, repo_name: String, uuid: String) {
    let zoo_dir = world.zoo_dir.as_ref().unwrap();
    let fixtures_dir = zoo_dir.join(".fixtures").join("bare");

    fs::create_dir_all(&fixtures_dir).unwrap();

    // Create a source repo with content
    let src_dir = zoo_dir.join(".fixtures").join("src").join(&repo_name);

    fs::create_dir_all(&src_dir).unwrap();

    let repo = git2::Repository::init(&src_dir).unwrap();

    let csvs_dir = src_dir.join("csvs");

    fs::create_dir_all(&csvs_dir).unwrap();
    fs::write(csvs_dir.join(".csvs.csv"), format!("uuid,{uuid}\n")).unwrap();
    fs::write(csvs_dir.join("_-_.csv"), "_\n_\n").unwrap();

    let mut index = repo.index().unwrap();

    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).unwrap();
    index.write().unwrap();

    let tree_oid = index.write_tree().unwrap();
    let tree = repo.find_tree(tree_oid).unwrap();
    let sig = git2::Signature::now("test", "test@test").unwrap();

    repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[]).unwrap();

    // Clone to bare repo
    let bare_dir = fixtures_dir.join(&repo_name);
    let mut builder = git2::build::RepoBuilder::new();

    builder.bare(true);
    builder.clone(src_dir.to_str().unwrap(), &bare_dir).unwrap();

    // Store fixture path for resolve_origin to use as file:// URL
    world.fixtures_dir = Some(fixtures_dir);
}

#[given(expr = "a mock git server repo {string} that extends {string} with file {string}")]
async fn given_fixture_extended(
    world: &mut MindzooWorld,
    new_repo: String,
    base_repo: String,
    file_path: String,
) {
    let zoo_dir = world.zoo_dir.as_ref().unwrap();
    let fixtures_dir = world.fixtures_dir.as_ref().unwrap().clone();
    let base_dir = fixtures_dir.join(&base_repo);

    // Clone base bare repo into a working dir
    let work_dir = zoo_dir.join(".fixtures").join("src").join(&new_repo);
    let repo = git2::Repository::clone(base_dir.to_str().unwrap(), &work_dir).unwrap();

    // Add the new file
    let full_path = work_dir.join(&file_path);

    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).unwrap();
    }

    fs::write(&full_path, "remote content\n").unwrap();

    let mut index = repo.index().unwrap();

    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).unwrap();
    index.write().unwrap();

    let tree_oid = index.write_tree().unwrap();
    let tree = repo.find_tree(tree_oid).unwrap();
    let sig = git2::Signature::now("test", "test@test").unwrap();
    let head = repo.head().unwrap().peel_to_commit().unwrap();

    repo.commit(Some("HEAD"), &sig, &sig, "add remote file", &tree, &[&head]).unwrap();

    // Clone to bare repo
    let bare_dir = fixtures_dir.join(&new_repo);
    let mut builder = git2::build::RepoBuilder::new();

    builder.bare(true);
    builder.clone(work_dir.to_str().unwrap(), &bare_dir).unwrap();
}

#[given(expr = "a mind {string} cloned from {string}")]
async fn given_mind_cloned(world: &mut MindzooWorld, name: String, origin_template: String) {
    let url = world.resolve_origin(&origin_template);
    let dir = world.mind_path(&name);

    git2::Repository::clone(&url, &dir).unwrap();
}

// -- When --

#[when(expr = "I settle the mind {string}")]
async fn when_settle(world: &mut MindzooWorld, name: String) {
    if world.zoo.is_none() {
        let dir = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(dir).await.unwrap());
    }

    let dir = world.mind_path(&name);

    world.zoo.as_ref().unwrap().federation.settle(&dir, None).await.unwrap();
}

#[when(expr = "I settle {string} with origin {string}")]
async fn when_settle_with_origin(
    world: &mut MindzooWorld,
    name: String,
    origin_template: String,
) {
    let url = world.resolve_origin(&origin_template);
    let dir = world.mind_path(&name);

    if world.zoo.is_none() {
        let d = world.zoo_dir.clone().unwrap();
        world.zoo = Some(mindzoo::Mindzoo::new(d).await.unwrap());
    }

    let origin = mindzoo::Origin::new(&url, None::<&str>);

    world.zoo.as_ref().unwrap().federation.settle(&dir, Some(&origin)).await.unwrap();
}

#[when(expr = "I write a file {string} in mind {string}")]
async fn when_write_file(world: &mut MindzooWorld, file_path: String, name: String) {
    let full_path = world.mind_path(&name).join(&file_path);

    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).unwrap();
    }

    fs::write(&full_path, "test content\n").unwrap();
}

#[when(expr = "the mind {string} has its origin changed to {string}")]
async fn when_origin_changed(world: &mut MindzooWorld, name: String, origin_template: String) {
    let url = world.resolve_origin(&origin_template);
    let dir = world.mind_path(&name);

    let repo = git2::Repository::open(&dir).unwrap();

    repo.remote_set_url("origin", &url).unwrap();
}

// -- Then --

#[then(expr = "the mind {string} has a {string} directory")]
async fn then_mind_has_subdir(world: &mut MindzooWorld, name: String, subdir: String) {
    let dir = world.mind_path(&name).join(&subdir);

    assert!(dir.exists(), "expected {} to exist", dir.display());
}

#[then(expr = "the git log of {string} has at least {int} commit(s)")]
async fn then_git_log_count(world: &mut MindzooWorld, name: String, n: usize) {
    let dir = world.mind_path(&name);
    let repo = git2::Repository::open(&dir).unwrap();
    let mut revwalk = repo.revwalk().unwrap();

    revwalk.push_head().unwrap();

    let count = revwalk.count();

    assert!(count >= n, "expected at least {} commits, got {}", n, count);
}

#[then(expr = "the mind {string} contains {string}")]
async fn then_mind_contains_file(world: &mut MindzooWorld, name: String, file_path: String) {
    let full_path = world.mind_path(&name).join(&file_path);

    assert!(full_path.exists(), "expected {} to exist", full_path.display());
}
