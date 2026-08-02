use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const APP_CONFIG_DIR: &str = "com.ionet.longan";
const CONFIG_FILE: &str = "storage.json";

#[derive(Debug, Default, Deserialize, Serialize)]
struct BootstrapConfig {
    storage_root: Option<PathBuf>,
}

pub fn config_file() -> AppResult<PathBuf> {
    let config_dir = dirs::config_dir().ok_or_else(|| {
        AppError::Other("cannot resolve the operating system config directory".into())
    })?;
    Ok(config_dir.join(APP_CONFIG_DIR).join(CONFIG_FILE))
}

pub fn default_storage_root() -> AppResult<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("cannot resolve the home directory".into()))?;
    Ok(home.join(".longan"))
}

pub fn load_storage_root(config_file: &Path) -> AppResult<PathBuf> {
    if !config_file.exists() {
        return default_storage_root();
    }

    let contents = std::fs::read(config_file)?;
    let config: BootstrapConfig = serde_json::from_slice(&contents)
        .map_err(|error| AppError::Other(format!("invalid storage bootstrap config: {error}")))?;
    config.storage_root.map_or_else(default_storage_root, Ok)
}

pub fn save_storage_root(config_file: &Path, storage_root: Option<&Path>) -> AppResult<()> {
    let parent = config_file.parent().ok_or_else(|| {
        AppError::Other("storage bootstrap config has no parent directory".into())
    })?;
    std::fs::create_dir_all(parent)?;

    let config = BootstrapConfig {
        storage_root: storage_root.map(Path::to_path_buf),
    };
    let contents = serde_json::to_vec_pretty(&config)
        .map_err(|error| AppError::Other(format!("cannot serialize storage config: {error}")))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(&contents)?;
    temporary.as_file().sync_all()?;

    #[cfg(windows)]
    if config_file.exists() {
        std::fs::remove_file(config_file)?;
    }

    temporary
        .persist(config_file)
        .map_err(|error| AppError::Io(error.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_storage_root_round_trips() {
        let temp = tempfile::tempdir().unwrap();
        let config_file = temp.path().join("config/storage.json");
        let custom_root = temp.path().join("custom");

        save_storage_root(&config_file, Some(&custom_root)).unwrap();

        assert_eq!(load_storage_root(&config_file).unwrap(), custom_root);
    }

    #[test]
    fn clearing_custom_root_restores_default() {
        let temp = tempfile::tempdir().unwrap();
        let config_file = temp.path().join("storage.json");
        save_storage_root(&config_file, Some(&temp.path().join("custom"))).unwrap();

        save_storage_root(&config_file, None).unwrap();

        assert_eq!(
            load_storage_root(&config_file).unwrap(),
            default_storage_root().unwrap()
        );
    }
}
