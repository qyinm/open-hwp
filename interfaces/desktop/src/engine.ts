import { invoke } from "@tauri-apps/api/core";

export type EngineStatus = {
  enginePath: string;
  engineAvailable: boolean;
  usingBundledEngine: boolean;
  converterPath: string | null;
  converterAvailable: boolean;
};

export async function getEngineStatus(): Promise<EngineStatus> {
  return invoke<EngineStatus>("get_engine_status");
}

export async function pickDocumentPath(): Promise<string | null> {
  return invoke<string | null>("pick_document_path");
}

export async function pickOutputHwpxPath(currentDoc?: string): Promise<string | null> {
  return invoke<string | null>("pick_output_hwpx_path", {
    currentDoc: currentDoc ?? null,
  });
}

export async function pickSessionJsonPath(currentDoc?: string): Promise<string | null> {
  return invoke<string | null>("pick_session_json_path", {
    currentDoc: currentDoc ?? null,
  });
}

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
