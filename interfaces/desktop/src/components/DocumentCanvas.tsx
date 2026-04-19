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
          <p>표시할 구간이 없습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="document-stage surface">
      <div className="document-paper">
        <div className="paper-content">
          {section.nodes.map((node) => (
            <textarea
              key={node.id}
              className="node-editor"
              value={node.text}
              onChange={(event) => onNodeChange(node.nodeIndex, event.target.value)}
              spellCheck={false}
              aria-label={`문서 내용 ${node.nodeIndex + 1}`}
              placeholder="텍스트를 입력하세요."
            />
          ))}
        </div>
      </div>
    </section>
  );
}
