export type ReaderNavigationDirection = "previous" | "next";

export const READER_NAVIGATION_EVENT = "reader:navigation";
export const READER_CONTROLS_TOGGLE_EVENT = "reader:controls-toggle";

const EDGE_TAP_RATIO = 0.28;
const TAP_MOVE_TOLERANCE = 12;
const SWIPE_MIN_DISTANCE = 46;
const SWIPE_AXIS_RATIO = 1.25;
const WHEEL_AXIS_RATIO = 1.35;
const WHEEL_NAVIGATION_THRESHOLD = 92;
const WHEEL_GESTURE_IDLE_MS = 420;
const WHEEL_NAVIGATION_COOLDOWN_MS = 120;

const IGNORED_GESTURE_SELECTOR = [
  "a",
  "button",
  "input",
  "label",
  "select",
  "summary",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='menu']",
  "[role='menuitem']",
  ".reader-floating-tools",
  ".reader-floating-panel",
  ".reader-side-panel",
  ".chapter-panel",
  ".bookmark-popover",
  ".selection-annotator"
].join(",");

export interface ReaderPointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  target: EventTarget | null;
}

export interface ReaderWheelGesture {
  accumulatedDeltaX: number;
  hasNavigatedInSequence: boolean;
  lastWheelAt: number;
  lastNavigationAt: number;
}

export function isTouchLikePointer(event: Pick<PointerEvent, "pointerType">): boolean {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

export function shouldIgnoreReaderGestureTarget(target: EventTarget | null): boolean {
  const element = eventTargetElement(target);

  if (!element) {
    return false;
  }

  return Boolean(element.closest(IGNORED_GESTURE_SELECTOR));
}

export function hasReadableSelection(ownerDocument: Document = document): boolean {
  const selection = ownerDocument.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length > 0);
}

export function directionFromSwipe(deltaX: number, deltaY: number): ReaderNavigationDirection | undefined {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX < SWIPE_MIN_DISTANCE || absX < absY * SWIPE_AXIS_RATIO) {
    return undefined;
  }

  return deltaX < 0 ? "next" : "previous";
}

export function directionFromTap(clientX: number, width: number): ReaderNavigationDirection | "toggle" | undefined {
  const leftEdge = width * EDGE_TAP_RATIO;
  const rightEdge = width * (1 - EDGE_TAP_RATIO);

  if (clientX <= leftEdge) {
    return "previous";
  }

  if (clientX >= rightEdge) {
    return "next";
  }

  return "toggle";
}

export function isTapGesture(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) <= TAP_MOVE_TOLERANCE && Math.abs(deltaY) <= TAP_MOVE_TOLERANCE;
}

export function dispatchReaderNavigation(direction: ReaderNavigationDirection): void {
  window.dispatchEvent(new CustomEvent(READER_NAVIGATION_EVENT, { detail: { direction } }));
}

export function dispatchReaderControlsToggle(): void {
  window.dispatchEvent(new CustomEvent(READER_CONTROLS_TOGGLE_EVENT));
}

export function navigationDirectionFromWheel(
  event: WheelEvent,
  wheelGesture: ReaderWheelGesture,
  now = Date.now()
): ReaderNavigationDirection | undefined {
  if (!isHorizontalReaderWheel(event)) {
    wheelGesture.accumulatedDeltaX = 0;
    wheelGesture.hasNavigatedInSequence = false;
    wheelGesture.lastWheelAt = now;
    return undefined;
  }

  if (now - wheelGesture.lastWheelAt > WHEEL_GESTURE_IDLE_MS) {
    wheelGesture.accumulatedDeltaX = 0;
    wheelGesture.hasNavigatedInSequence = false;
  }

  if (wheelGesture.hasNavigatedInSequence) {
    wheelGesture.accumulatedDeltaX = 0;
    wheelGesture.lastWheelAt = now;
    return undefined;
  }

  wheelGesture.accumulatedDeltaX += event.deltaX;
  wheelGesture.lastWheelAt = now;

  if (Math.abs(wheelGesture.accumulatedDeltaX) < WHEEL_NAVIGATION_THRESHOLD) {
    return undefined;
  }

  if (now - wheelGesture.lastNavigationAt < WHEEL_NAVIGATION_COOLDOWN_MS) {
    wheelGesture.accumulatedDeltaX = 0;
    return undefined;
  }

  const direction = wheelGesture.accumulatedDeltaX > 0 ? "next" : "previous";
  wheelGesture.accumulatedDeltaX = 0;
  wheelGesture.hasNavigatedInSequence = true;
  wheelGesture.lastNavigationAt = now;

  return direction;
}

export function isHorizontalReaderWheel(event: Pick<WheelEvent, "deltaX" | "deltaY">): boolean {
  const absX = Math.abs(event.deltaX);
  const absY = Math.abs(event.deltaY);

  return absX >= 2 && absX >= absY * WHEEL_AXIS_RATIO;
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object") {
    return null;
  }

  const maybeNode = target as { nodeType?: number; parentElement?: Element | null };

  if (maybeNode.nodeType === 1) {
    return target as Element;
  }

  return maybeNode.parentElement ?? null;
}
