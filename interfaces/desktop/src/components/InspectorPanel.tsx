import type { DocumentWorkspace, EditorSectionView, EngineStatus } from "../types/document";

type InspectorPanelProps = {
  document: DocumentWorkspace;
  selectedSection: EditorSectionView | null;
  engineStatus: EngineStatus | null;
  activity: string[];
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not saved yet";
  }

  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function InspectorPanel({
  document,
  selectedSection,
  engineStatus,
  activity
}: InspectorPanelProps) {
  const totalNodes = document.session.sections.reduce((sum, section) => sum + section.nodes.length, 0);

  return (
    <aside className="inspector-panel surface">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Inspector</p>
          <h2>문서 정보</h2>
        </div>
      </div>

      <dl className="inspector-list">
        <div>
          <dt>Format</dt>
          <dd>{document.importedFromLegacyHwp ? "Imported from HWP" : "HWPX"}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <code className="path-code">{document.sourcePath}</code>
          </dd>
        </div>
        <div>
          <dt>Save Target</dt>
          <dd>
            <code className="path-code">{document.saveTargetPath ?? "Save As required"}</code>
          </dd>
        </div>
        <div>
          <dt>Sections</dt>
          <dd>{document.session.sections.length}</dd>
        </div>
        <div>
          <dt>Text Nodes</dt>
          <dd>{totalNodes}</dd>
        </div>
        <div>
          <dt>Last Saved</dt>
          <dd>{formatDateTime(document.lastSavedAt)}</dd>
        </div>
      </dl>

      {selectedSection ? (
        <div className="selection-card">
          <p className="eyebrow">Current Section</p>
          <h3>{selectedSection.title}</h3>
          <code className="path-code">{selectedSection.path}</code>
          <p className="selection-meta">{selectedSection.nodeCount} editable text nodes</p>
        </div>
      ) : null}

      <details className="details-panel" open>
        <summary>Editor Notes</summary>
        <div className="details-panel__body">
          <p>
            현재 에디터는 `workbench v1` 위에서 동작하므로 텍스트 노드 단위 편집에 집중합니다.
          </p>
          <p>
            문서 구조 추가/삭제까지 가려면 이후 `workbench v2`가 필요합니다.
          </p>
        </div>
      </details>

      <details className="details-panel">
        <summary>Runtime Diagnostics</summary>
        <div className="details-panel__body">
          <p>
            <strong>Engine</strong>
          </p>
          <code className="path-code">{engineStatus?.enginePath ?? "-"}</code>
          <p>
            <strong>Converter</strong>
          </p>
          <code className="path-code">{engineStatus?.converterPath ?? "Not configured"}</code>
        </div>
      </details>

      <details className="details-panel">
        <summary>Activity</summary>
        <div className="details-panel__body details-panel__body--activity">
          {activity.length === 0 ? <p>아직 기록이 없습니다.</p> : activity.map((line) => <p key={line}>{line}</p>)}
        </div>
      </details>
    </aside>
  );
}
