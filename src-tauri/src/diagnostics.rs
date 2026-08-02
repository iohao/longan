use std::io::Write;
use std::path::{Path, PathBuf};

use flate2::write::GzEncoder;
use flate2::Compression;
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::paths::Paths;

#[derive(Serialize)]
struct DiagnosticMetadata<'a> {
    generated_at: String,
    app_version: &'a str,
    operating_system: &'static str,
    architecture: &'static str,
    storage_root: String,
    github_token_configured: bool,
    last_skill_update_check_at: Option<&'a str>,
}

fn privacy_safe_path(path: &Path) -> String {
    dirs::home_dir()
        .and_then(|home| path.strip_prefix(home).ok().map(Path::to_path_buf))
        .map_or_else(
            || path.to_string_lossy().into_owned(),
            |relative| {
                if relative.as_os_str().is_empty() {
                    "~".into()
                } else {
                    format!("~/{}", relative.display())
                }
            },
        )
}

fn redact_log_contents(contents: &[u8]) -> String {
    let home = dirs::home_dir().map(|path| path.to_string_lossy().into_owned());
    String::from_utf8_lossy(contents)
        .lines()
        .map(|line| {
            let lowercase = line.to_ascii_lowercase();
            if [
                "authorization",
                "github_token",
                "password",
                "secret",
                "token=",
            ]
            .iter()
            .any(|needle| lowercase.contains(needle))
            {
                "[redacted sensitive line]".into()
            } else if let Some(home) = home.as_deref() {
                line.replace(home, "~")
            } else {
                line.into()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn export(
    paths: &Paths,
    app_version: &str,
    github_token_configured: bool,
    last_skill_update_check_at: Option<&str>,
) -> AppResult<PathBuf> {
    let diagnostics_dir = paths.root.join("diagnostics");
    std::fs::create_dir_all(&diagnostics_dir)?;
    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let output_path = diagnostics_dir.join(format!("longan-diagnostics-{timestamp}.tar.gz"));

    let output = std::fs::File::create(&output_path)?;
    let encoder = GzEncoder::new(output, Compression::default());
    let mut archive = tar::Builder::new(encoder);

    let metadata = DiagnosticMetadata {
        generated_at: chrono::Utc::now().to_rfc3339(),
        app_version,
        operating_system: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        storage_root: privacy_safe_path(&paths.root),
        github_token_configured,
        last_skill_update_check_at,
    };
    let metadata_json = serde_json::to_vec_pretty(&metadata)
        .map_err(|error| AppError::Other(format!("cannot serialize diagnostics: {error}")))?;
    let mut header = tar::Header::new_gnu();
    header.set_mode(0o600);
    header.set_size(metadata_json.len() as u64);
    header.set_cksum();
    archive.append_data(&mut header, "diagnostics.json", metadata_json.as_slice())?;

    if paths.logs_dir().exists() {
        for entry in std::fs::read_dir(paths.logs_dir())? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let name = entry.file_name();
            if !name.to_string_lossy().starts_with("longan.log") {
                continue;
            }
            let redacted = redact_log_contents(&std::fs::read(entry.path())?);
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o600);
            header.set_size(redacted.len() as u64);
            header.set_cksum();
            archive.append_data(
                &mut header,
                Path::new("logs").join(name),
                redacted.as_bytes(),
            )?;
        }
    }

    let mut encoder = archive.into_inner()?;
    encoder.flush()?;
    encoder.finish()?;
    Ok(output_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_metadata_and_logs_without_secrets() {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(temp.path().join("console"));
        paths.ensure_layout().unwrap();
        let home = dirs::home_dir().unwrap();
        std::fs::write(
            paths.logs_dir().join("longan.log"),
            format!("path={}\ntoken=supersecret\n", home.display()),
        )
        .unwrap();

        let output = export(&paths, "1.2.3", true, Some("12345")).unwrap();

        assert!(output.exists());
        assert!(output.starts_with(paths.root.join("diagnostics")));
        assert!(output.metadata().unwrap().len() > 0);

        let decoder = flate2::read::GzDecoder::new(std::fs::File::open(output).unwrap());
        let mut archive = tar::Archive::new(decoder);
        let mut archived_log = String::new();
        for entry in archive.entries().unwrap() {
            let mut entry = entry.unwrap();
            if entry.path().unwrap() == Path::new("logs/longan.log") {
                use std::io::Read;
                entry.read_to_string(&mut archived_log).unwrap();
            }
        }
        assert!(archived_log.contains("path=~"));
        assert!(archived_log.contains("[redacted sensitive line]"));
        assert!(!archived_log.contains("supersecret"));
    }
}
