import { invoke } from "@tauri-apps/api/core";

export async function engineInfo(path: string): Promise<string> {
  return invoke<string>("engine_info", { path });
}

export async function engineText(path: string): Promise<string> {
  return invoke<string>("engine_text", { path });
}

export async function engineConvert(input: string, output: string): Promise<string> {
  return invoke<string>("engine_convert", { input, output });
}

export async function engineWorkbenchExport(input: string, outputJson: string): Promise<string> {
  return invoke<string>("engine_workbench_export", { input, outputJson });
}

export async function engineWorkbenchApply(
  input: string,
  sessionJson: string,
  output: string
): Promise<string> {
  return invoke<string>("engine_workbench_apply", { input, sessionJson, output });
}
