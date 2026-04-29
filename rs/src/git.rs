use crate::{Error, mind::Mind, Result};
use std::path::PathBuf;
use git2kit::{Origin, Repository, Resolve};
use std::fs;

pub async fn gitinit(path: PathBuf, mind: &str, name: Option<&str>) -> Result<()>
{
    //let _ = log(&app, "git init");

    let mind = Mind::new(path, mind);

    mind.make_mind(name).await?;

    Ok(())
}

pub async fn rename(path: PathBuf, mind: &str, name: &str) -> Result<()>
{
    let source = Mind::new(path.clone(), mind);

    let source_dir = source.find_mind()?;

    let target_dir = source.name_mind(Some(name))?;

    // NOTE rename won't work with mount points
    match source_dir {
        None => Err(Error::from_message("no mind found")),
        Some(dir) => Ok(fs::rename(dir, target_dir)?),
    }
}

pub async fn clone(path: PathBuf, mind: &str, remote: Origin) -> Result<()>
{
    //let _ = crate::log(&app, "clone");

    let mind = Mind::new(path, mind);

    let mind_dir = mind.name_mind(None)?;

    let existing_mind = mind.find_mind()?;

    match existing_mind {
        None => (),
        Some(dir) => fs::remove_dir_all(dir)?,
    };

    let repo = Repository::clone(mind_dir, &remote)?;

    repo.set_origin(remote)?;

    Ok(())
}

pub async fn set_origin(path: PathBuf, mind: &str, remote: Origin) -> Result<()>
{
    //let _ = crate::log(&app, "set origin");

    let mind = Mind::new(path, mind);

    let mind_dir = mind.find_mind()?.ok_or_else(|| Error::from_message("mind not found"))?;

    let repository = Repository::open(&mind_dir)?;

    repository.set_origin(remote)?;

    Ok(())
}

pub async fn get_origin(path: PathBuf, mind: &str) -> Result<Option<Origin>>
{
    //let _ = crate::log(&app, "get origin");

    let mind = Mind::new(path, mind);

    let mind_dir = mind.find_mind()?.ok_or_else(|| Error::from_message("mind not found"))?;

    let repository = Repository::open(&mind_dir)?;

    Ok(repository.get_origin())
}

pub fn commit(path: PathBuf, mind: &str) -> Result<()>
{
    //let _ = crate::log(&app, "commit");

    let mind = Mind::new(path, mind);

    let mind_dir_path = mind.find_mind()?.ok_or_else(|| Error::from_message("mind not found"))?;

    let repo = Repository::open(&mind_dir_path)?;

    repo.commit()?;

    Ok(())
}

pub async fn resolve(path: PathBuf, mind: &str, remote: Origin) -> Result<Resolve>
{
    //let _ = log(&app, "git init");

    let mind = Mind::new(path, mind);

    let mind_dir = mind.find_mind()?.ok_or_else(|| Error::from_message("mind not found"))?;

    let repository = Repository::open(&mind_dir)?;

    let resolve = repository.resolve(&remote)?;

    Ok(resolve)
}
