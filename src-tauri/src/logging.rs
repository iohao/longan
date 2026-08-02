use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use tracing::{Level, Metadata};
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::Layer;

const LOG_FILE_NAME: &str = "longan.log";
const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024;
const MAX_LOG_FILES: usize = 10;
const APP_TARGET: &str = "longan_lib";
const FRONTEND_TARGET: &str = "frontend";
const WEBVIEW_TARGET: &str = "tauri_runtime_wry";
const UPDATER_TARGET: &str = "tauri_plugin_updater";

fn file_log_enabled(metadata: &Metadata<'_>, app_debug: bool) -> bool {
    file_target_enabled(metadata.target(), *metadata.level(), app_debug)
}

fn file_target_enabled(target: &str, level: Level, app_debug: bool) -> bool {
    if target.starts_with(UPDATER_TARGET) {
        return false;
    }

    let maximum_level = if target.starts_with(APP_TARGET) || target.starts_with(FRONTEND_TARGET) {
        if app_debug {
            Level::DEBUG
        } else {
            Level::INFO
        }
    } else if target.starts_with(WEBVIEW_TARGET) {
        Level::DEBUG
    } else {
        Level::WARN
    };

    level <= maximum_level
}

struct RotatingFile {
    directory: PathBuf,
    file: Option<File>,
    written: u64,
}

impl RotatingFile {
    fn open(directory: &Path) -> io::Result<Self> {
        std::fs::create_dir_all(directory)?;
        let path = directory.join(LOG_FILE_NAME);
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let written = file.metadata()?.len();
        Ok(Self {
            directory: directory.to_path_buf(),
            file: Some(file),
            written,
        })
    }

    fn path_for_index(&self, index: usize) -> PathBuf {
        if index == 0 {
            self.directory.join(LOG_FILE_NAME)
        } else {
            self.directory.join(format!("{LOG_FILE_NAME}.{index}"))
        }
    }

    fn rotate(&mut self) -> io::Result<()> {
        self.file.take();

        let oldest = self.path_for_index(MAX_LOG_FILES - 1);
        if oldest.exists() {
            std::fs::remove_file(oldest)?;
        }
        for index in (1..MAX_LOG_FILES - 1).rev() {
            let source = self.path_for_index(index);
            if source.exists() {
                std::fs::rename(source, self.path_for_index(index + 1))?;
            }
        }
        let current = self.path_for_index(0);
        if current.exists() {
            std::fs::rename(current, self.path_for_index(1))?;
        }

        self.file = Some(
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.path_for_index(0))?,
        );
        self.written = 0;
        Ok(())
    }
}

impl Write for RotatingFile {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if self.written > 0 && self.written.saturating_add(buffer.len() as u64) > MAX_LOG_SIZE {
            self.rotate()?;
        }
        let written = self
            .file
            .as_mut()
            .ok_or_else(|| io::Error::other("log file is not open"))?
            .write(buffer)?;
        self.written = self.written.saturating_add(written as u64);
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file
            .as_mut()
            .ok_or_else(|| io::Error::other("log file is not open"))?
            .flush()
    }
}

struct LogWriter(Mutex<RotatingFile>);

struct LogGuard<'a>(MutexGuard<'a, RotatingFile>);

impl Write for LogGuard<'_> {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.0.write(buffer)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

impl<'a> MakeWriter<'a> for LogWriter {
    type Writer = LogGuard<'a>;

    fn make_writer(&'a self) -> Self::Writer {
        LogGuard(
            self.0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        )
    }
}

pub fn init(logs_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let app_debug = cfg!(debug_assertions);
    let file_layer = tracing_subscriber::fmt::layer()
        .with_ansi(false)
        .with_target(true)
        .with_writer(LogWriter(Mutex::new(RotatingFile::open(logs_dir)?)))
        .with_filter(filter_fn(move |metadata| {
            file_log_enabled(metadata, app_debug)
        }));
    let stderr_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_writer(io::stderr)
        .with_filter(filter_fn(move |metadata| {
            file_log_enabled(metadata, app_debug)
        }));

    tracing_subscriber::registry()
        .with(file_layer)
        .with(stderr_layer)
        .try_init()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotates_and_caps_file_count() {
        let temp = tempfile::tempdir().unwrap();
        let mut writer = RotatingFile::open(temp.path()).unwrap();
        writer.written = MAX_LOG_SIZE;

        for _ in 0..MAX_LOG_FILES + 2 {
            writer.write_all(b"next log line\n").unwrap();
            writer.written = MAX_LOG_SIZE;
        }

        let count = std::fs::read_dir(temp.path()).unwrap().count();
        assert_eq!(count, MAX_LOG_FILES);
        assert!(temp.path().join(LOG_FILE_NAME).exists());
        assert!(temp.path().join(format!("{LOG_FILE_NAME}.9")).exists());
    }

    #[test]
    fn persistent_log_keeps_application_info_in_release() {
        assert!(file_target_enabled(APP_TARGET, Level::INFO, false));
    }

    #[test]
    fn persistent_log_keeps_application_debug_in_development() {
        assert!(file_target_enabled(APP_TARGET, Level::DEBUG, true));
    }

    #[test]
    fn persistent_log_drops_hyper_pool_debug_events() {
        assert!(!file_target_enabled(
            "hyper_util::client::legacy::pool",
            Level::DEBUG,
            true
        ));
    }

    #[test]
    fn persistent_log_drops_hyper_connect_debug_events() {
        assert!(!file_target_enabled(
            "hyper_util::client::legacy::connect::http",
            Level::DEBUG,
            true
        ));
    }

    #[test]
    fn persistent_log_drops_reqwest_connect_debug_events() {
        assert!(!file_target_enabled("reqwest::connect", Level::DEBUG, true));
    }

    #[test]
    fn persistent_log_keeps_webview_termination_diagnostics() {
        assert!(file_target_enabled(WEBVIEW_TARGET, Level::DEBUG, false));
    }

    #[test]
    fn persistent_log_drops_updater_internal_errors() {
        assert!(!file_target_enabled(UPDATER_TARGET, Level::ERROR, false));
    }

    #[test]
    fn persistent_log_drops_updater_internal_debug_events() {
        assert!(!file_target_enabled(
            "tauri_plugin_updater::updater",
            Level::DEBUG,
            true
        ));
    }
}
