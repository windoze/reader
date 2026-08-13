import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { ReaderNavigationDirection } from "../readerGestures";

const PAGE_TURN_ARROW_AUTO_HIDE_MS = 100;

interface PageTurnButtonProps {
  direction: ReaderNavigationDirection;
  disabled?: boolean;
  title: string;
  onTurn(): void;
}

export function PageTurnButton({ direction, disabled, title, onTurn }: PageTurnButtonProps) {
  const [autoHidden, setAutoHidden] = useState(false);
  const autoHideTimeout = useRef<number | undefined>(undefined);
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;

  const clearAutoHideTimeout = useCallback(() => {
    if (autoHideTimeout.current === undefined) {
      return;
    }

    window.clearTimeout(autoHideTimeout.current);
    autoHideTimeout.current = undefined;
  }, []);

  const revealArrow = useCallback(() => {
    clearAutoHideTimeout();
    setAutoHidden(false);
  }, [clearAutoHideTimeout]);

  const scheduleAutoHide = useCallback(() => {
    clearAutoHideTimeout();
    autoHideTimeout.current = window.setTimeout(() => {
      autoHideTimeout.current = undefined;
      setAutoHidden(true);
    }, PAGE_TURN_ARROW_AUTO_HIDE_MS);
  }, [clearAutoHideTimeout]);

  useEffect(() => clearAutoHideTimeout, [clearAutoHideTimeout]);

  const handleClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    setAutoHidden(false);
    onTurn();
    scheduleAutoHide();
  }, [onTurn, scheduleAutoHide]);

  const handlePointerMove = useCallback(() => {
    if (autoHidden) {
      revealArrow();
    }
  }, [autoHidden, revealArrow]);

  return (
    <button
      className={`page-turn-zone ${direction}${autoHidden ? " auto-hidden" : ""}`}
      disabled={disabled}
      title={title}
      type="button"
      onClick={handleClick}
      onPointerEnter={revealArrow}
      onPointerLeave={revealArrow}
      onPointerMove={handlePointerMove}
    >
      <Icon size={24} aria-hidden />
    </button>
  );
}
