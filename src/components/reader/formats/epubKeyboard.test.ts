import { describe, expect, it, vi } from "vitest";
import {
  bindEpubFrameFocusPolling,
  bindEpubFrameFocusRestoration,
  bindEpubKeyboardNavigation
} from "./epubKeyboard";

describe("bindEpubKeyboardNavigation", () => {
  it("handles keydown inside the epub iframe before bubbling handlers can stop it", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const contentDocument = iframe.contentDocument!;
    const contentWindow = iframe.contentWindow!;
    const handler = vi.fn((event: KeyboardEvent) => event.preventDefault());

    contentDocument.body.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
    bindEpubKeyboardNavigation(
      {
        document: contentDocument,
        window: contentWindow
      },
      handler
    );

    const event = new contentWindow.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight"
    });
    contentDocument.body.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    iframe.remove();
  });

  it("also handles keyup events for webviews that do not deliver iframe keydown reliably", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const contentDocument = iframe.contentDocument!;
    const contentWindow = iframe.contentWindow!;
    const handler = vi.fn();

    bindEpubKeyboardNavigation(
      {
        document: contentDocument,
        window: contentWindow
      },
      handler
    );

    contentDocument.body.dispatchEvent(
      new contentWindow.KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key: "Space"
      })
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].key).toBe("Space");

    iframe.remove();
  });

  it("restores focus to the reader shell after a plain click inside the epub iframe", async () => {
    const iframe = document.createElement("iframe");
    const focusTarget = document.createElement("button");
    document.body.append(iframe, focusTarget);
    const contentDocument = iframe.contentDocument!;
    const contentWindow = iframe.contentWindow!;

    bindEpubKeyboardNavigation(
      {
        document: contentDocument,
        window: contentWindow
      },
      () => undefined,
      {
        restoreFocus: () => focusTarget.focus()
      }
    );

    contentDocument.body.dispatchEvent(
      new contentWindow.MouseEvent("mouseup", {
        bubbles: true
      })
    );
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.activeElement).toBe(focusTarget);

    iframe.remove();
    focusTarget.remove();
  });

  it("restores focus when the iframe element itself becomes active", async () => {
    const host = document.createElement("div");
    const iframe = document.createElement("iframe");
    const focusTarget = document.createElement("button");
    host.append(iframe);
    document.body.append(host, focusTarget);

    const unbind = bindEpubFrameFocusRestoration(host, () => focusTarget.focus());

    iframe.focus();
    iframe.dispatchEvent(new FocusEvent("focus"));
    await new Promise((resolve) => window.setTimeout(resolve, 90));

    expect(document.activeElement).toBe(focusTarget);

    unbind();
    host.remove();
    focusTarget.remove();
  });

  it("polls iframe focus as a fallback when focus events are not delivered", async () => {
    const host = document.createElement("div");
    const iframe = document.createElement("iframe");
    const focusTarget = document.createElement("button");
    host.append(iframe);
    document.body.append(host, focusTarget);

    const unbind = bindEpubFrameFocusPolling(host, () => focusTarget.focus());

    iframe.focus();
    await new Promise((resolve) => window.setTimeout(resolve, 280));

    expect(document.activeElement).toBe(focusTarget);

    unbind();
    host.remove();
    focusTarget.remove();
  });
});
