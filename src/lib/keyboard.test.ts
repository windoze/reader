import { describe, expect, it } from "vitest";
import { shouldHandleReaderNavigationKey } from "./keyboard";

describe("shouldHandleReaderNavigationKey", () => {
  it("accepts platform direction key aliases", () => {
    expect(shouldHandleReaderNavigationKey(keyboardEvent("Right"))).toBe(true);
    expect(shouldHandleReaderNavigationKey(keyboardEvent("Left"))).toBe(true);
  });

  it("ignores editable targets", () => {
    const input = document.createElement("input");
    document.body.append(input);

    expect(shouldHandleReaderNavigationKey(keyboardEvent("Right", input))).toBe(false);

    input.remove();
  });
});

function keyboardEvent(key: string, target?: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key
  });

  if (target) {
    Object.defineProperty(event, "target", {
      value: target
    });
  }

  return event;
}
