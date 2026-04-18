export type EngineStatus = {
  enginePath: string;
  engineAvailable: boolean;
  usingBundledEngine: boolean;
  converterPath: string | null;
  converterAvailable: boolean;
};

export interface OpenHwpDesktopApi {
  getEngineStatus(): Promise<EngineStatus>;
  pickDocumentPath(): Promise<string | null>;
  pickOutputHwpxPath(currentDoc?: string | null): Promise<string | null>;
  pickSessionJsonPath(currentDoc?: string | null): Promise<string | null>;
  engineInfo(path: string): Promise<string>;
  engineText(path: string): Promise<string>;
  engineConvert(input: string, output: string): Promise<string>;
  engineWorkbenchExport(input: string, outputJson: string): Promise<string>;
  engineWorkbenchApply(
    input: string,
    sessionJson: string,
    output: string
  ): Promise<string>;
}

function api(): OpenHwpDesktopApi {
  if (typeof window === "undefined" || !window.openhwp) {
    throw new Error("Electron preload bridge is unavailable. Start the desktop app with `npm run dev`.");
  }

  return window.openhwp;
}

export async function getEngineStatus(): Promise<EngineStatus> {
  return api().getEngineStatus();
}

export async function pickDocumentPath(): Promise<string | null> {
  return api().pickDocumentPath();
}

export async function pickOutputHwpxPath(currentDoc?: string): Promise<string | null> {
  return api().pickOutputHwpxPath(currentDoc ?? null);
}

export async function pickSessionJsonPath(currentDoc?: string): Promise<string | null> {
  return api().pickSessionJsonPath(currentDoc ?? null);
}

export async function engineInfo(path: string): Promise<string> {
  return api().engineInfo(path);
}

export async function engineText(path: string): Promise<string> {
  return api().engineText(path);
}

export async function engineConvert(input: string, output: string): Promise<string> {
  return api().engineConvert(input, output);
}

export async function engineWorkbenchExport(input: string, outputJson: string): Promise<string> {
  return api().engineWorkbenchExport(input, outputJson);
}

export async function engineWorkbenchApply(
  input: string,
  sessionJson: string,
  output: string
): Promise<string> {
  return api().engineWorkbenchApply(input, sessionJson, output);
}
