import type { EditorSectionView } from "../types/document";

type DocumentCanvasProps = {
  section: EditorSectionView | null;
  onNodeChange: (nodeIndex: number, nextText: string) => void;
};

export function DocumentCanvas({ section, onNodeChange }: DocumentCanvasProps) {
  if (!section) {
    return (
      <section className="document-stage surface">
        <div className="document-paper empty-paper">
          <p>표시할 섹션이 없습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="document-stage surface">
      <div className="document-paper">
        <header className="paper-header">
          <p className="eyebrow">{section.path}</p>
          <h2>{section.title}</h2>
        </header>
        <div className="paper-content">
          {section.nodes.map((node) => (
            <label key={node.id} className="node-block">
              <span className="node-label">Paragraph {node.nodeIndex + 1}</span>
              <textarea
                className="node-editor"
                value={node.text}
                onChange={(event) => onNodeChange(node.nodeIndex, event.target.value)}
                spellCheck={false}
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
