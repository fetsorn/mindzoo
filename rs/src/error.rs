use serde::{Serialize, Serializer};
use std::fmt;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Fmt(#[from] fmt::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("csvs: {0}")]
    Csvs(String),
    #[error(transparent)]
    Git2kit(#[from] git2kit::Error),
    #[error(transparent)]
    Git2(#[from] git2::Error),
}

impl Error {
    pub fn from_message(message: impl ToString) -> Self {
        Error::Message(message.to_string())
    }

    pub fn context(self, message: impl ToString) -> Self {
        Error::Message(format!("{}: {self}", message.to_string()))
    }
}

impl From<csvs::Error> for Error {
    fn from(e: csvs::Error) -> Self {
        Error::Csvs(e.to_string())
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Serialize)]
        struct JsonError {
            message: String,
        }

        JsonError {
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

impl serde::de::Error for Error {
    fn custom<T>(msg: T) -> Self
    where
        T: fmt::Display,
    {
        Error::from_message(msg)
    }
}
