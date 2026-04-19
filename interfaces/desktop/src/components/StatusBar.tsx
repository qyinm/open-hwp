import type { DocumentWorkspace } from "../types/document";

type StatusBarProps = {
  document: DocumentWorkspace;
};

function formatSavedAt(value: string | null) {
  if (!value) {
    return "Not saved yet";
  }

  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function StatusBar({ document }: StatusBarProps) {
  return (
    <footer className="status-bar surface">
      <span>{document.importedFromLegacyHwp ? "Imported from HWP" : "Native HWPX"}</span>
      <span>{document.dirty ? "Unsaved changes" : "Saved"}</span>
      <span>{document.session.sections.length} sections</span>
      <span>{formatSavedAt(document.lastSavedAt)}</span>
    </footer>
  );
}
