import type { ReaderSettings } from "../../../domain/types";

interface ReaderSettingsPanelProps {
  settings: ReaderSettings;
  onChange(settings: ReaderSettings): void;
}

const FONTS = [
  { value: "system", label: "系统" },
  { value: "serif", label: "衬线" },
  { value: "sans", label: "无衬线" },
  { value: "mono", label: "等宽" }
];

export function ReaderSettingsPanel({ settings, onChange }: ReaderSettingsPanelProps) {
  const update = <Key extends keyof ReaderSettings>(key: Key, value: ReaderSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <aside className="reader-side-panel settings-panel">
      <h2>阅读设置</h2>

      <label className="setting-row">
        <span>主题</span>
        <div className="segmented-control">
          <button
            className={settings.theme === "light" ? "active" : ""}
            type="button"
            onClick={() => update("theme", "light")}
          >
            亮
          </button>
          <button
            className={settings.theme === "dark" ? "active" : ""}
            type="button"
            onClick={() => update("theme", "dark")}
          >
            暗
          </button>
        </div>
      </label>

      <label className="setting-row">
        <span>字体</span>
        <select
          value={settings.fontFamily}
          onChange={(event) => update("fontFamily", event.target.value)}
        >
          {FONTS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <label className="setting-row">
        <span>字号 {settings.fontSize}px</span>
        <input
          max={28}
          min={14}
          type="range"
          value={settings.fontSize}
          onChange={(event) => update("fontSize", Number(event.target.value))}
        />
      </label>

      <label className="setting-row">
        <span>行距 {settings.lineHeight.toFixed(2)}</span>
        <input
          max={2.4}
          min={1.35}
          step={0.05}
          type="range"
          value={settings.lineHeight}
          onChange={(event) => update("lineHeight", Number(event.target.value))}
        />
      </label>

      <label className="setting-row">
        <span>段间距 {settings.paragraphSpacing.toFixed(2)}em</span>
        <input
          max={2}
          min={0}
          step={0.05}
          type="range"
          value={settings.paragraphSpacing}
          onChange={(event) => update("paragraphSpacing", Number(event.target.value))}
        />
      </label>

      <label className="setting-row">
        <span>版心 {settings.contentWidth}px</span>
        <input
          max={960}
          min={520}
          step={20}
          type="range"
          value={settings.contentWidth}
          onChange={(event) => update("contentWidth", Number(event.target.value))}
        />
      </label>
    </aside>
  );
}
