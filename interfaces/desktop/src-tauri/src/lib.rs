use std::path::PathBuf;
use std::process::Command;

fn engine_bin_path() -> PathBuf {
    if let Ok(path) = std::env::var("OPENHWP_ENGINE_BIN") {
        return PathBuf::from(path);
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../engines/openhwp-zig/zig-out/bin/openhwp")
}

fn run_engine(args: &[&str]) -> Result<String, String> {
    let engine = engine_bin_path();
    let output = Command::new(&engine)
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
fn engine_info(path: String) -> Result<String, String> {
    run_engine(&["info", &path])
}

#[tauri::command]
fn engine_text(path: String) -> Result<String, String> {
    run_engine(&["text", &path])
}

#[tauri::command]
fn engine_convert(input: String, output: String) -> Result<String, String> {
    run_engine(&["convert", &input, "--output", &output])
}

#[tauri::command]
fn engine_workbench_export(input: String, output_json: String) -> Result<String, String> {
    run_engine(&["workbench", "export", &input, "--output", &output_json])
}

#[tauri::command]
fn engine_workbench_apply(
    input: String,
    session_json: String,
    output: String,
) -> Result<String, String> {
    run_engine(&[
        "workbench",
        "apply",
        &input,
        &session_json,
        "--output",
        &output,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
