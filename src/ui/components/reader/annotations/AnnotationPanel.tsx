import { Trash2 } from "lucide-react";
import type { Annotation } from "../../../domain/types";

interface AnnotationPanelProps {
  annotations: Annotation[];
  onRemove(annotationId: string): Promise<void>;
}

export function AnnotationPanel({ annotations, onRemove }: AnnotationPanelProps) {
  return (
    <aside className="reader-side-panel annotations-panel">
      <h2>注解</h2>
      {annotations.length === 0 ? <p className="muted">选择文字后可添加注解。</p> : null}
      <div className="annotation-list">
        {annotations.map((annotation) => (
          <article className="annotation-item" key={annotation.id}>
            <mark style={{ backgroundColor: annotation.color }}>{annotation.text}</mark>
            {annotation.note ? <p>{annotation.note}</p> : null}
            <footer>
              <span>{annotation.chapterTitle ?? new Date(annotation.createdAt).toLocaleString()}</span>
              <button
                className="icon-button subtle"
                title="删除注解"
                type="button"
                onClick={() => void onRemove(annotation.id)}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </footer>
          </article>
        ))}
      </div>
    </aside>
  );
}
