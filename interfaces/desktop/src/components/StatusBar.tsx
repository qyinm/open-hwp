import type { DocumentWorkspace } from "../types/document";

type StatusBarProps = {
  document: DocumentWorkspace;
};

function formatSavedAt(value: string | null) {
  if (!value) {
    return "아직 저장 안됨";
  }

  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function StatusBar({ document }: StatusBarProps) {
  return (
    <footer className="status-bar surface">
      <span>{document.importedFromLegacyHwp ? "HWP 가져옴" : "HWPX 편집본"}</span>
      <span>{document.dirty ? "저장되지 않음" : "저장됨"}</span>
      <span>{document.session.sections.length}개 섹션</span>
      <span>{formatSavedAt(document.lastSavedAt)}</span>
    </footer>
  );
}
