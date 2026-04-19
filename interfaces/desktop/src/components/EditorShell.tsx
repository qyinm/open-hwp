import type { DocumentWorkspace, EditorSectionView, EngineStatus } from "../types/document";
import { DocumentCanvas } from "./DocumentCanvas";
import { ImportBanner } from "./ImportBanner";
import { InspectorPanel } from "./InspectorPanel";
import { SectionSidebar } from "./SectionSidebar";
import { StatusBar } from "./StatusBar";

type EditorShellProps = {
  busy: boolean;
  document: DocumentWorkspace;
  sections: EditorSectionView[];
  selectedSectionId: string | null;
  engineStatus: EngineStatus | null;
  activity: string[];
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSelectSection: (sectionId: string) => void;
  onNodeChange: (sectionId: string, nodeIndex: number, nextText: string) => void;
};

function fileName(pathValue: string | null) {
  if (!pathValue) {
    return "Untitled";
  }

  const parts = pathValue.split(/[\\/]/);
  return parts[parts.length - 1] || pathValue;
}

export function EditorShell({
  busy,
  document,
  sections,
  selectedSectionId,
  engineStatus,
  activity,
  onOpen,
  onSave,
  onSaveAs,
  onSelectSection,
  onNodeChange
}: EditorShellProps) {
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0] ?? null;

  return (
    <main className="editor-shell">
      <header className="editor-toolbar surface">
        <div>
          <p className="eyebrow">OpenHWP Desktop</p>
          <h1>
            {fileName(document.saveTargetPath ?? document.sourcePath)}
            {document.dirty ? " *" : ""}
          </h1>
          <p className="toolbar-meta">문서 중심 편집 워크플로우</p>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={onOpen} disabled={busy}>
            Open
          </button>
          <button className="primary-button" onClick={onSave} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
          <button className="secondary-button" onClick={onSaveAs} disabled={busy}>
            Save As
          </button>
        </div>
      </header>

      {document.importedFromLegacyHwp ? <ImportBanner /> : null}

      <div className="editor-layout">
        <SectionSidebar
          sections={sections}
          selectedSectionId={selectedSection?.id ?? null}
          onSelectSection={onSelectSection}
        />
        <DocumentCanvas
          section={selectedSection}
          onNodeChange={(nodeIndex, nextText) => {
            if (!selectedSection) {
              return;
            }

            onNodeChange(selectedSection.id, nodeIndex, nextText);
          }}
        />
        <InspectorPanel
          document={document}
          selectedSection={selectedSection}
          engineStatus={engineStatus}
          activity={activity}
        />
      </div>

      <StatusBar document={document} />
    </main>
  );
}
