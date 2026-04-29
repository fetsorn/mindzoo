use crate::Result;
mod zip;
use std::path::PathBuf;
mod find_mind;
mod get_store_dir;
mod make_mind;
mod name_mind;

#[derive(Debug)]
pub struct Mind
{
    pub path: PathBuf,
    pub mind: String,
}

impl Mind
{
    pub fn new(path: PathBuf, mind: &str) -> Self {
        Mind {
            path: path.clone(),
            mind: mind.to_string(),
        }
    }

    // ensure app_data_dir/store exists
    pub fn get_store_dir(&self) -> Result<PathBuf> {
        get_store_dir::get_store_dir(self)
    }

    // make a path for store/mind-name
    pub fn name_mind(&self, name: Option<&str>) -> Result<PathBuf> {
        name_mind::name_mind(self, name)
    }

    // find ^mind in app_data_dir
    pub fn find_mind(&self) -> Result<Option<PathBuf>> {
        find_mind::find_mind(self)
    }

    pub async fn make_mind(&self, name: Option<&str>) -> Result<()> {
        make_mind::make_mind(self, name).await
    }

    pub async fn zip(&self) -> Result<()> {
        zip::zip(self).await
    }
}
