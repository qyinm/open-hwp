import type { DocumentWorkspace, EditorSectionView } from "../types/document";

type InspectorPanelProps = {
  document: DocumentWorkspace;
  selectedSection: EditorSectionView | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "아직 저장 안됨";
  }

  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function InspectorPanel({
  document,
  selectedSection,
}: InspectorPanelProps) {
  const totalNodes = document.session.sections.reduce((sum, section) => sum + section.nodes.length, 0);

  return (
    <aside className="inspector-panel surface">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">정보</p>
          <h2>문서 정보</h2>
        </div>
      </div>

      <dl className="inspector-list">
        <div>
          <dt>형식</dt>
          <dd>{document.importedFromLegacyHwp ? "HWP에서 가져옴" : "HWPX"}</dd>
        </div>
        <div>
          <dt>원본</dt>
          <dd>
            <code className="path-code">{document.sourcePath}</code>
          </dd>
        </div>
        <div>
          <dt>저장 대상</dt>
          <dd>
            <code className="path-code">{document.saveTargetPath ?? "저장 경로 지정 필요"}</code>
          </dd>
        </div>
        <div>
          <dt>구간</dt>
          <dd>{document.session.sections.length}</dd>
        </div>
        <div>
          <dt>텍스트 항목</dt>
          <dd>{totalNodes}</dd>
        </div>
        <div>
          <dt>마지막 저장</dt>
          <dd>{formatDateTime(document.lastSavedAt)}</dd>
        </div>
      </dl>

      {selectedSection ? (
        <div className="selection-card">
          <p className="eyebrow">현재 구간</p>
          <h3>{selectedSection.title}</h3>
          <code className="path-code">{selectedSection.path}</code>
          <p className="selection-meta">{selectedSection.nodeCount}개 텍스트 항목</p>
        </div>
      ) : null}
    </aside>
  );
}
