use crate::{mind::Mind, Result};
use std::fs::create_dir_all;
use std::path::PathBuf;

// ensure app_data_dir/store exists
pub fn get_store_dir(mind: &Mind) -> Result<PathBuf> {
    let app_data_dir = &mind.path;

    let store_dir = app_data_dir.join("store");

    if !store_dir.exists() {
        create_dir_all(&store_dir)?;
    }

    Ok(store_dir)
}
