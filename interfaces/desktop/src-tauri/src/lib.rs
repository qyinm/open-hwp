use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Manager, State};

const ENGINE_BIN_NAME: &str = "openhwp";

struct AppState {
    engine_path: PathBuf,
}

fn dev_engine_bin_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../engines/openhwp-zig/zig-out/bin/openhwp")
}

fn bundled_engine_bin_path(resource_dir: &Path) -> PathBuf {
    resource_dir.join("bin").join(ENGINE_BIN_NAME)
}

fn resolve_engine_bin_path(env_override: Option<&str>, resource_dir: Option<&Path>) -> PathBuf {
    if let Some(path) = env_override.filter(|value| !value.trim().is_empty()) {
        return PathBuf::from(path);
    }

    if let Some(dir) = resource_dir {
        let bundled = bundled_engine_bin_path(dir);
        if bundled.is_file() {
            return bundled;
        }
    }

    dev_engine_bin_path()
}

fn build_app_state(app: &AppHandle) -> AppState {
    let env_override = std::env::var("OPENHWP_ENGINE_BIN").ok();
    let resource_dir = app.path().resource_dir().ok();
    let engine_path = resolve_engine_bin_path(env_override.as_deref(), resource_dir.as_deref());
    AppState { engine_path }
}

fn run_engine(engine: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new(engine)
        .args(args)
        .output()
        .map_err(|err| format!("failed to spawn engine ({engine:?}): {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(stdout)
    } else if !stderr.trim().is_empty() {
        Err(stderr)
    } else if !stdout.trim().is_empty() {
        Err(stdout)
    } else {
        Err(format!("engine exited with status {}", output.status))
    }
}

#[tauri::command]
fn engine_info(state: State<'_, AppState>, path: String) -> Result<String, String> {
    run_engine(state.engine_path.as_path(), &["info", &path])
}

#[tauri::command]
fn engine_text(state: State<'_, AppState>, path: String) -> Result<String, String> {
    run_engine(state.engine_path.as_path(), &["text", &path])
}

#[tauri::command]
fn engine_convert(
    state: State<'_, AppState>,
    input: String,
    output: String,
) -> Result<String, String> {
    run_engine(
        state.engine_path.as_path(),
        &["convert", &input, "--output", &output],
    )
}

#[tauri::command]
fn engine_workbench_export(
    state: State<'_, AppState>,
    input: String,
    output_json: String,
) -> Result<String, String> {
    run_engine(
        state.engine_path.as_path(),
        &["workbench", "export", &input, "--output", &output_json],
    )
}

#[tauri::command]
fn engine_workbench_apply(
    state: State<'_, AppState>,
    input: String,
    session_json: String,
    output: String,
) -> Result<String, String> {
    run_engine(
        state.engine_path.as_path(),
        &[
            "workbench",
            "apply",
            &input,
            &session_json,
            "--output",
            &output,
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn resolve_engine_bin_path_prefers_env_override() {
        let resolved = resolve_engine_bin_path(
            Some("/tmp/custom-engine"),
            Some(Path::new("/bundle/Resources")),
        );
        assert_eq!(resolved, PathBuf::from("/tmp/custom-engine"));
    }

    #[test]
    fn resolve_engine_bin_path_uses_bundled_resource_when_available() {
        let temp =
            std::env::temp_dir().join(format!("openhwp-bundled-engine-{}", std::process::id()));
        let bin_dir = temp.join("bin");
        let bundled = bin_dir.join(ENGINE_BIN_NAME);
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&bin_dir).unwrap();
        std::fs::write(&bundled, b"#!/bin/sh\n").unwrap();

        let resolved = resolve_engine_bin_path(None, Some(temp.as_path()));
        assert_eq!(resolved, bundled);

        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn resolve_engine_bin_path_falls_back_to_dev_engine_path() {
        let resolved = resolve_engine_bin_path(None, None);
        assert_eq!(resolved, dev_engine_bin_path());
    }

    #[test]
    fn resolve_engine_bin_path_ignores_missing_bundled_engine() {
        let temp =
            std::env::temp_dir().join(format!("openhwp-missing-engine-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();

        let resolved = resolve_engine_bin_path(None, Some(temp.as_path()));
        assert_eq!(resolved, dev_engine_bin_path());

        let _ = std::fs::remove_dir_all(&temp);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(build_app_state(app.handle()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine_info,
            engine_text,
            engine_convert,
            engine_workbench_export,
            engine_workbench_apply
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
