use serde::Serialize;

/// Unified application error, serialized as a structured payload for the frontend.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("network error: {0}")]
    Network(String),

    #[error("github rate limited")]
    RateLimited,

    #[error("invalid token: {0}")]
    InvalidToken(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("skill source unavailable: {0}")]
    SkillSourceUnavailable(String),

    // Reserved for site-sourced skills once v2 supports them.
    #[allow(dead_code)]
    #[error("unsupported source: {0}")]
    UnsupportedSource(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("skill update cancelled")]
    Cancelled,

    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Network(e.to_string())
    }
}

/// Structured error payload so the frontend can map `code` to i18n messages.
#[derive(Serialize)]
struct ErrorPayload {
    code: &'static str,
    message: String,
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::Db(_) => "db",
            AppError::Network(_) => "network",
            AppError::RateLimited => "rate_limited",
            AppError::InvalidToken(_) => "invalid_token",
            AppError::NotFound(_) => "not_found",
            AppError::SkillSourceUnavailable(_) => "skill_source_unavailable",
            AppError::UnsupportedSource(_) => "unsupported_source",
            AppError::InvalidInput(_) => "invalid_input",
            AppError::Cancelled => "cancelled",
            AppError::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
