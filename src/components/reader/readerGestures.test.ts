import { describe, expect, it } from "vitest";
import {
  directionFromSwipe,
  directionFromTap,
  isHorizontalReaderWheel,
  navigationDirectionFromWheel,
  type ReaderWheelGesture
} from "./readerGestures";

describe("reader gestures", () => {
  it("maps edge taps to navigation and center taps to toolbar toggling", () => {
    expect(directionFromTap(20, 390)).toBe("previous");
    expect(directionFromTap(370, 390)).toBe("next");
    expect(directionFromTap(195, 390)).toBe("toggle");
  });

  it("maps horizontal swipes to page turns", () => {
    expect(directionFromSwipe(-80, 12)).toBe("next");
    expect(directionFromSwipe(80, 12)).toBe("previous");
    expect(directionFromSwipe(28, 4)).toBeUndefined();
    expect(directionFromSwipe(80, 90)).toBeUndefined();
  });

  it("accumulates horizontal wheel deltas before turning pages", () => {
    const wheel: ReaderWheelGesture = {
      accumulatedDeltaX: 0,
      hasNavigatedInSequence: false,
      lastWheelAt: 0,
      lastNavigationAt: 0
    };

    expect(navigationDirectionFromWheel(wheelEvent(40, 2), wheel, 1_000)).toBeUndefined();
    expect(navigationDirectionFromWheel(wheelEvent(60, 2), wheel, 1_050)).toBe("next");
    expect(navigationDirectionFromWheel(wheelEvent(-100, 2), wheel, 1_120)).toBeUndefined();
    expect(navigationDirectionFromWheel(wheelEvent(-100, 2), wheel, 1_700)).toBe("previous");
  });

  it("turns only once during a continuous horizontal wheel gesture", () => {
    const wheel = freshWheel();

    expect(navigationDirectionFromWheel(wheelEvent(120, 1), wheel, 1_000)).toBe("next");
    expect(navigationDirectionFromWheel(wheelEvent(180, 1), wheel, 1_080)).toBeUndefined();
    expect(navigationDirectionFromWheel(wheelEvent(180, 1), wheel, 1_360)).toBeUndefined();
    expect(navigationDirectionFromWheel(wheelEvent(120, 1), wheel, 1_900)).toBe("next");
  });

  it("detects horizontal wheel gestures before they reach the page-turn threshold", () => {
    expect(isHorizontalReaderWheel(wheelEvent(12, 1))).toBe(true);
    expect(navigationDirectionFromWheel(wheelEvent(12, 1), freshWheel(), 1_000)).toBeUndefined();
    expect(isHorizontalReaderWheel(wheelEvent(12, 30))).toBe(false);
  });
});

function freshWheel(): ReaderWheelGesture {
  return {
    accumulatedDeltaX: 0,
    hasNavigatedInSequence: false,
    lastWheelAt: 0,
    lastNavigationAt: 0
  };
}

function wheelEvent(deltaX: number, deltaY: number): WheelEvent {
  return { deltaX, deltaY } as WheelEvent;
}
