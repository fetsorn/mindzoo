use crate::{mind::Mind, Result};
use std::path::PathBuf;

pub async fn zip(path: PathBuf, mind: &str) -> Result<()>
{
    //let _ = crate::log(&app, "zip");

    let mind = Mind::new(path, mind);

    mind.zip().await?;

    Ok(())
}
