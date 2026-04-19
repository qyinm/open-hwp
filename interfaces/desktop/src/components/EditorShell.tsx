import type { DocumentWorkspace, EditorSectionView } from "../types/document";
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
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSelectSection: (sectionId: string) => void;
  onNodeChange: (sectionId: string, nodeIndex: number, nextText: string) => void;
};

function fileName(pathValue: string | null) {
  if (!pathValue) {
    return "제목 없음";
  }

  const parts = pathValue.split(/[\\/]/);
  return parts[parts.length - 1] || pathValue;
}

export function EditorShell({
  busy,
  document,
  sections,
  selectedSectionId,
  onOpen,
  onSave,
  onSaveAs,
  onSelectSection,
  onNodeChange
}: EditorShellProps) {
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0] ?? null;
  const saveButtonLabel = document.saveTargetPath ? "저장" : "저장 (새 파일로)";

  return (
    <main className="editor-shell">
      <header className="editor-toolbar surface">
        <div>
          <p className="eyebrow">OpenHWP Desktop</p>
          <h1>
            {fileName(document.saveTargetPath ?? document.sourcePath)}
            {document.dirty ? " *" : ""}
          </h1>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={onOpen} disabled={busy}>
            문서 열기
          </button>
          <button className="primary-button" onClick={onSave} disabled={busy}>
            {busy ? "저장 중..." : saveButtonLabel}
          </button>
          <button className="secondary-button" onClick={onSaveAs} disabled={busy}>
            다른 이름으로 저장
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
        />
      </div>

      <StatusBar document={document} />
    </main>
  );
}
