import type {
  DocumentWorkspace,
  EngineStatus,
  RecentDocument
} from "./types/document";

export interface OpenHwpDesktopApi {
  getEngineStatus(): Promise<EngineStatus>;
  openDocument(): Promise<DocumentWorkspace | null>;
  openDocumentPath(path: string): Promise<DocumentWorkspace>;
  getRecentDocuments(): Promise<RecentDocument[]>;
  saveDocument(document: DocumentWorkspace): Promise<DocumentWorkspace>;
  saveDocumentAs(document: DocumentWorkspace): Promise<DocumentWorkspace | null>;
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

export async function openDocument(): Promise<DocumentWorkspace | null> {
  return api().openDocument();
}

export async function openDocumentPath(path: string): Promise<DocumentWorkspace> {
  return api().openDocumentPath(path);
}

export async function getRecentDocuments(): Promise<RecentDocument[]> {
  return api().getRecentDocuments();
}

export async function saveDocument(document: DocumentWorkspace): Promise<DocumentWorkspace> {
  return api().saveDocument(document);
}

export async function saveDocumentAs(
  document: DocumentWorkspace
): Promise<DocumentWorkspace | null> {
  return api().saveDocumentAs(document);
}
