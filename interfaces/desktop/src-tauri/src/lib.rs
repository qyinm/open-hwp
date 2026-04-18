use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

use rfd::FileDialog;
use tauri::{AppHandle, Manager, State};

const ENGINE_BIN_NAME: &str = "openhwp";

#[derive(Clone)]
struct AppState {
    engine_path: PathBuf,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatus {
    engine_path: String,
    engine_available: bool,
    using_bundled_engine: bool,
    converter_path: Option<String>,
    converter_available: bool,
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

fn command_candidates(command_name: &str, pathext: Option<&str>) -> Vec<String> {
    let mut names = vec![command_name.to_string()];

    if Path::new(command_name).extension().is_none() {
        let extensions = pathext.unwrap_or_default().split(';').filter_map(|ext| {
            let ext = ext.trim();
            (!ext.is_empty()).then_some(ext)
        });

        for ext in extensions {
            names.push(format!("{command_name}{ext}"));
        }
    }

    names.sort();
    names.dedup();
    names
}

fn find_command_in_path(
    command_name: &str,
    path_env: Option<&str>,
    pathext: Option<&str>,
) -> Option<PathBuf> {
    let path_env = path_env.unwrap_or_default();
    if path_env.trim().is_empty() {
        return None;
    }

    let candidates = command_candidates(command_name, pathext);
    env::split_paths(path_env).find_map(|dir| {
        candidates
            .iter()
            .map(|name| dir.join(name))
            .find(|candidate| candidate.is_file())
    })
}

fn resolve_converter_bin_path(
    env_override: Option<&str>,
    path_env: Option<&str>,
    pathext: Option<&str>,
) -> Option<PathBuf> {
    if let Some(path) = env_override.filter(|value| !value.trim().is_empty()) {
        return Some(PathBuf::from(path));
    }

    find_command_in_path("hwpx-converter", path_env, pathext)
}

fn current_engine_status(state: &AppState) -> EngineStatus {
    let converter_path = resolve_converter_bin_path(
        env::var("OPENHWP_HWPX_CONVERTER").ok().as_deref(),
        env::var("PATH").ok().as_deref(),
        env::var("PATHEXT").ok().as_deref(),
    );
    let engine_path_text = state.engine_path.display().to_string();

    EngineStatus {
        engine_path: engine_path_text.clone(),
        engine_available: state.engine_path.is_file(),
        using_bundled_engine: engine_path_text.contains("/Resources/bin/")
            || engine_path_text.contains("\\Resources\\bin\\"),
        converter_path: converter_path
            .as_ref()
            .map(|path| path.display().to_string()),
        converter_available: converter_path.as_ref().is_some_and(|path| path.is_file()),
    }
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
fn get_engine_status(state: State<'_, AppState>) -> EngineStatus {
    current_engine_status(&state)
}

#[tauri::command]
fn pick_document_path() -> Option<String> {
    FileDialog::new()
        .add_filter("HWP Documents", &["hwp", "hwpx"])
        .pick_file()
        .map(|path| path.display().to_string())
}

#[tauri::command]
fn pick_output_hwpx_path(current_doc: Option<String>) -> Option<String> {
    let file_name = current_doc
        .as_deref()
        .and_then(|path| Path::new(path).file_stem())
        .map(|stem| format!("{}.converted.hwpx", stem.to_string_lossy()))
        .unwrap_or_else(|| "output.hwpx".to_string());

    FileDialog::new()
        .add_filter("HWPX Document", &["hwpx"])
        .set_file_name(&file_name)
        .save_file()
        .map(|path| path.display().to_string())
}

#[tauri::command]
fn pick_session_json_path(current_doc: Option<String>) -> Option<String> {
    let file_name = current_doc
        .as_deref()
        .and_then(|path| Path::new(path).file_stem())
        .map(|stem| format!("{}.session.json", stem.to_string_lossy()))
        .unwrap_or_else(|| "session.json".to_string());

    FileDialog::new()
        .add_filter("JSON", &["json"])
        .set_file_name(&file_name)
        .save_file()
        .map(|path| path.display().to_string())
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

    #[test]
    fn resolve_converter_bin_path_prefers_env_override() {
        let resolved =
            resolve_converter_bin_path(Some("/tmp/custom-converter"), Some("/usr/bin"), None);
        assert_eq!(resolved, Some(PathBuf::from("/tmp/custom-converter")));
    }

    #[test]
    fn resolve_converter_bin_path_finds_converter_on_path() {
        let temp = std::env::temp_dir().join(format!("openhwp-converter-{}", std::process::id()));
        let binary = temp.join("hwpx-converter");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        std::fs::write(&binary, b"#!/bin/sh\n").unwrap();

        let resolved =
            resolve_converter_bin_path(None, Some(temp.to_string_lossy().as_ref()), None);
        assert_eq!(resolved, Some(binary));

        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn resolve_converter_bin_path_returns_none_when_missing() {
        let temp =
            std::env::temp_dir().join(format!("openhwp-no-converter-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();

        let resolved =
            resolve_converter_bin_path(None, Some(temp.to_string_lossy().as_ref()), None);
        assert_eq!(resolved, None);

        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn resolve_converter_bin_path_finds_windows_style_extension() {
        let temp =
            std::env::temp_dir().join(format!("openhwp-converter-windows-{}", std::process::id()));
        let binary = temp.join("hwpx-converter.EXE");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        std::fs::write(&binary, b"binary").unwrap();

        let resolved = resolve_converter_bin_path(
            None,
            Some(temp.to_string_lossy().as_ref()),
            Some(".COM;.EXE;.BAT;.CMD"),
        );
        assert_eq!(resolved, Some(binary));

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
            get_engine_status,
            pick_document_path,
            pick_output_hwpx_path,
            pick_session_json_path,
            engine_info,
            engine_text,
            engine_convert,
            engine_workbench_export,
            engine_workbench_apply
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
