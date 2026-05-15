mod catalog;
mod federation;

use cucumber::World;
use mindzoo::Mindzoo;
use std::path::PathBuf;
use temp_dir::TempDir;
use csvs::Entry;

#[derive(Debug, World)]
#[world(init = Self::new)]
pub struct MindzooWorld {
    /// Temp directory serving as the zoo root.
    pub zoo_temp: Option<TempDir>,
    pub zoo_dir: Option<PathBuf>,

    /// Mindzoo instance (created on rebuild).
    pub zoo: Option<Mindzoo>,

    /// Fixtures directory containing bare repos.
    pub fixtures_dir: Option<PathBuf>,

    /// Results from queries.
    pub locate_result: Option<PathBuf>,
    pub mind_object: Option<serde_json::Value>,
    pub last_error: Option<String>,
}

impl MindzooWorld {
    fn new() -> Self {
        MindzooWorld {
            zoo_temp: None,
            zoo_dir: None,
            zoo: None,
            fixtures_dir: None,
            locate_result: None,
            mind_object: None,
            last_error: None,
        }
    }

    /// Create a fresh temp directory as the zoo root.
    pub fn create_zoo_dir(&mut self) -> PathBuf {
        let temp = TempDir::new().expect("failed to create temp dir");
        let dir = temp.path().to_path_buf();

        self.zoo_dir = Some(dir.clone());
        self.zoo_temp = Some(temp);

        dir
    }

    /// Resolve a mind name to its full path within the zoo.
    pub fn mind_path(&self, name: &str) -> PathBuf {
        self.zoo_dir
            .as_ref()
            .expect("zoo dir not created")
            .join(name)
    }

    /// Replace {server} placeholder with file:// path to fixtures dir.
    pub fn resolve_origin(&self, template: &str) -> String {
        let fixtures = self.fixtures_dir.as_ref().expect("fixtures dir not set");

        template.replace(
            "{server}",
            &format!("file://{}", fixtures.display()),
        )
    }
}
