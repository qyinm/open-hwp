export type SourceFormat = "hwp" | "hwpx";
export type OpenMode = "direct-hwpx" | "imported-hwp";

export type EngineStatus = {
  enginePath: string;
  engineAvailable: boolean;
  usingBundledEngine: boolean;
  converterPath: string | null;
  converterAvailable: boolean;
};

export type WorkbenchNode = {
  text: string;
};

export type WorkbenchSection = {
  path: string;
  nodes: WorkbenchNode[];
};

export type WorkbenchSession = {
  schema: "openhwp-workbench-v1";
  source_document: string;
  sections: WorkbenchSection[];
};

export type DocumentWorkspace = {
  sourcePath: string;
  sourceFormat: SourceFormat;
  openMode: OpenMode;
  workingDirectory: string;
  workingHwpxPath: string;
  saveTargetPath: string | null;
  importedFromLegacyHwp: boolean;
  session: WorkbenchSession;
  dirty: boolean;
  lastSavedAt: string | null;
};

export type RecentDocument = {
  path: string;
  label: string;
  lastOpenedAt: string;
  sourceFormat: SourceFormat;
};

export type EditorNodeView = {
  id: string;
  nodeIndex: number;
  text: string;
};

export type EditorSectionView = {
  id: string;
  title: string;
  path: string;
  nodeCount: number;
  preview: string;
  nodes: EditorNodeView[];
};
