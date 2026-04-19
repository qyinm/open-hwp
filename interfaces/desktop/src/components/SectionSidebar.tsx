import type { EditorSectionView } from "../types/document";

type SectionSidebarProps = {
  sections: EditorSectionView[];
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
};

export function SectionSidebar({
  sections,
  selectedSectionId,
  onSelectSection
}: SectionSidebarProps) {
  return (
    <aside className="editor-sidebar surface">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Sections</p>
          <h2>문서 구조</h2>
        </div>
      </div>
      <div className="sidebar-list">
        {sections.map((section) => (
          <button
            key={section.id}
            className={section.id === selectedSectionId ? "sidebar-item sidebar-item--active" : "sidebar-item"}
            onClick={() => onSelectSection(section.id)}
          >
            <span className="sidebar-item__title">{section.title}</span>
            <span className="sidebar-item__meta">{section.nodeCount} nodes</span>
            <span className="sidebar-item__preview">{section.preview}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
