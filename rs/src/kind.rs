use crate::Error;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Kind {
    Select,
    Describe,
    Insert,
    Update,
    Delete,
}

impl FromStr for Kind {
    type Err = Error;

    fn from_str(s: &str) -> crate::Result<Self> {
        match s.to_uppercase().as_str() {
            "SELECT" => Ok(Kind::Select),
            "DESCRIBE" => Ok(Kind::Describe),
            "INSERT" => Ok(Kind::Insert),
            "UPDATE" => Ok(Kind::Update),
            "DELETE" => Ok(Kind::Delete),
            other => Err(Error::from_message(format!("unknown kind: {other}"))),
        }
    }
}
