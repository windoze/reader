import { useEffect, useState } from "react";

interface PageProgressProps {
  label: string;
  max: number;
  value: number;
  onChange(value: number): void;
}

export function PageProgress({ label, max, value, onChange }: PageProgressProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setIsVisible(true);
    const timeout = window.setTimeout(() => setIsVisible(false), 1600);

    return () => window.clearTimeout(timeout);
  }, [label, value]);

  return (
    <div
      className={isVisible ? "page-progress visible" : "page-progress"}
      onFocus={() => setIsVisible(true)}
      onMouseEnter={() => setIsVisible(true)}
    >
      <input
        aria-label="阅读进度"
        max={max}
        min={1}
        type="range"
        value={Math.min(max, Math.max(1, value))}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span>{label}</span>
    </div>
  );
}
