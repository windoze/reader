import { Check, X } from "lucide-react";
import { forwardRef, useState } from "react";
import type { ReaderLocator } from "../../../domain/types";

export interface SelectionDraft {
  text: string;
  locator?: ReaderLocator;
}

interface SelectionAnnotatorProps {
  draft: SelectionDraft;
  onCancel(): void;
  onSave(draft: SelectionDraft, note: string, color: string): Promise<void>;
}

const COLORS = ["#f7d560", "#8bd3dd", "#b8e986", "#f5a3b7"];

export const SelectionAnnotator = forwardRef<HTMLElement, SelectionAnnotatorProps>(
function SelectionAnnotator({ draft, onCancel, onSave }, ref) {
  const [note, setNote] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  return (
    <aside className="selection-annotator" ref={ref}>
      <p>{draft.text}</p>
      <textarea
        aria-label="注解内容"
        placeholder="添加注解"
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="annotator-footer">
        <div className="color-swatches" aria-label="注解颜色">
          {COLORS.map((item) => (
            <button
              aria-label={item}
              className={item === color ? "active" : ""}
              key={item}
              style={{ backgroundColor: item }}
              type="button"
              onClick={() => setColor(item)}
            />
          ))}
        </div>
        <button className="icon-button subtle" title="取消" type="button" onClick={onCancel}>
          <X size={18} aria-hidden />
        </button>
        <button
          className="icon-button"
          title="保存注解"
          type="button"
          onClick={() => void onSave(draft, note.trim(), color)}
        >
          <Check size={18} aria-hidden />
        </button>
      </div>
    </aside>
  );
});
