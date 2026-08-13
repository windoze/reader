import type { EpubContents } from "./epubTypes";

export type EpubKeyboardHandler = (event: KeyboardEvent) => boolean | void;

interface EpubKeyboardOptions {
  restoreFocus?(): void;
}

interface EpubKeyboardBinding {
  document: Document;
  window?: Window;
  listener: EventListener;
  restoreFocusListener?: EventListener;
}

interface EpubFrameFocusBinding {
  host: HTMLElement;
  listener: EventListener;
  observer: MutationObserver;
  frameListeners: WeakSet<HTMLIFrameElement>;
}

const boundKeyboardHandlers = new WeakMap<Document, EpubKeyboardBinding>();
const boundFrameFocusHandlers = new WeakMap<HTMLElement, EpubFrameFocusBinding>();
const handledKeyboardEvents = new WeakSet<KeyboardEvent>();
const KEYBOARD_EVENT_TYPES = ["keydown", "keyup", "keypress", "keypressed"] as const;
const FOCUS_RESTORE_EVENT_TYPES = ["mouseup", "click", "pointerup", "touchend", "focusin"] as const;

export function bindEpubKeyboardNavigation(
  contents: EpubContents,
  handler: EpubKeyboardHandler,
  options: EpubKeyboardOptions = {}
): void {
  const document = contents.document;

  if (!document) {
    return;
  }

  unbindEpubKeyboardNavigation(document);

  const listener: EventListener = (event) => {
    if (!isKeyboardEvent(event)) {
      return;
    }

    if (handledKeyboardEvents.has(event)) {
      return;
    }

    handledKeyboardEvents.add(event);
    handler(event);
  };
  const contentWindow = contents.window ?? document.defaultView ?? undefined;
  const restoreFocusListener = options.restoreFocus
    ? () => scheduleEpubContentFocusRestore(contentWindow, options.restoreFocus!)
    : undefined;

  for (const eventType of KEYBOARD_EVENT_TYPES) {
    contentWindow?.addEventListener(eventType, listener, true);
    document.addEventListener(eventType, listener, true);
  }

  if (restoreFocusListener) {
    for (const eventType of FOCUS_RESTORE_EVENT_TYPES) {
      document.addEventListener(eventType, restoreFocusListener, true);
    }
    contentWindow?.addEventListener("focus", restoreFocusListener, true);
  }

  boundKeyboardHandlers.set(document, {
    document,
    window: contentWindow,
    listener,
    restoreFocusListener
  });
}

export function unbindEpubKeyboardNavigation(document: Document): void {
  const binding = boundKeyboardHandlers.get(document);

  if (!binding) {
    return;
  }

  for (const eventType of KEYBOARD_EVENT_TYPES) {
    binding.window?.removeEventListener(eventType, binding.listener, true);
    binding.document.removeEventListener(eventType, binding.listener, true);
  }

  if (binding.restoreFocusListener) {
    for (const eventType of FOCUS_RESTORE_EVENT_TYPES) {
      binding.document.removeEventListener(eventType, binding.restoreFocusListener, true);
    }
    binding.window?.removeEventListener("focus", binding.restoreFocusListener, true);
  }

  boundKeyboardHandlers.delete(document);
}

export function bindEpubFrameFocusRestoration(host: HTMLElement, restoreFocus: () => void): () => void {
  unbindEpubFrameFocusRestoration(host);

  const frameListeners = new WeakSet<HTMLIFrameElement>();
  const listener: EventListener = () => scheduleEpubFrameFocusRestore(host, restoreFocus);

  const bindFrame = (frame: HTMLIFrameElement) => {
    if (frameListeners.has(frame)) {
      return;
    }

    frameListeners.add(frame);
    frame.tabIndex = -1;
    frame.addEventListener("focus", listener, true);
    frame.addEventListener("load", listener, true);
  };

  const bindFrames = () => {
    for (const frame of host.querySelectorAll("iframe")) {
      bindFrame(frame);
    }
  };

  bindFrames();

  const observer = new MutationObserver(bindFrames);
  observer.observe(host, {
    childList: true,
    subtree: true
  });

  host.ownerDocument.addEventListener("focusin", listener, true);

  boundFrameFocusHandlers.set(host, {
    host,
    listener,
    observer,
    frameListeners
  });

  return () => unbindEpubFrameFocusRestoration(host);
}

export function bindEpubFrameFocusPolling(host: HTMLElement, restoreFocus: () => void): () => void {
  let candidateSince = 0;

  const restoreIfNeeded = () => {
    const activeElement = host.ownerDocument.activeElement;
    const shouldRestore =
      !activeElement ||
      activeElement === host.ownerDocument.body ||
      activeElement === host ||
      (isIframeElement(activeElement) && host.contains(activeElement));

    if (!shouldRestore || hasSelectedTextInEpubFrame(host)) {
      candidateSince = 0;
      return;
    }

    const now = Date.now();

    if (!candidateSince) {
      candidateSince = now;
      return;
    }

    if (now - candidateSince >= 180) {
      restoreFocus();
      candidateSince = 0;
    }
  };

  const interval = window.setInterval(restoreIfNeeded, 80);
  window.setTimeout(restoreIfNeeded, 0);

  return () => window.clearInterval(interval);
}

function unbindEpubFrameFocusRestoration(host: HTMLElement): void {
  const binding = boundFrameFocusHandlers.get(host);

  if (!binding) {
    return;
  }

  binding.observer.disconnect();
  binding.host.ownerDocument.removeEventListener("focusin", binding.listener, true);
  for (const frame of binding.host.querySelectorAll("iframe")) {
    frame.removeEventListener("focus", binding.listener, true);
    frame.removeEventListener("load", binding.listener, true);
  }

  boundFrameFocusHandlers.delete(host);
}

function scheduleEpubContentFocusRestore(contentWindow: Window | undefined, restoreFocus: () => void): void {
  const restore = () => {
    const selectedText = selectedTextFromWindow(contentWindow);

    if (selectedText) {
      return;
    }

    try {
      if (!navigator.userAgent.toLowerCase().includes("jsdom")) {
        contentWindow?.blur();
        window.focus();
      }
    } catch {
      // jsdom does not implement window focus APIs; browsers and WebViews do.
    }

    restoreFocus();
  };

  window.setTimeout(restore, 0);
  window.setTimeout(restore, 80);
}

function scheduleEpubFrameFocusRestore(host: HTMLElement, restoreFocus: () => void): void {
  const restore = () => {
    const activeElement = host.ownerDocument.activeElement;

    if (!isIframeElement(activeElement) || !host.contains(activeElement)) {
      return;
    }

    const selectedText = selectedTextFromWindow(activeElement.contentWindow ?? undefined);

    if (selectedText) {
      return;
    }

    try {
      if (!navigator.userAgent.toLowerCase().includes("jsdom")) {
        activeElement.contentWindow?.blur();
        window.focus();
      }
    } catch {
      // jsdom does not implement window focus APIs; browsers and WebViews do.
    }

    restoreFocus();
  };

  window.setTimeout(restore, 0);
  window.setTimeout(restore, 80);
}

function isKeyboardEvent(event: Event): event is KeyboardEvent {
  return typeof (event as KeyboardEvent).key === "string";
}

function isIframeElement(element: Element | null): element is HTMLIFrameElement {
  return element instanceof HTMLIFrameElement || element?.tagName === "IFRAME";
}

function selectedTextFromWindow(targetWindow: Window | undefined): string {
  try {
    return targetWindow?.getSelection()?.toString().trim() ?? "";
  } catch {
    return "";
  }
}

function hasSelectedTextInEpubFrame(host: HTMLElement): boolean {
  for (const frame of host.querySelectorAll("iframe")) {
    if (selectedTextFromWindow(frame.contentWindow ?? undefined)) {
      return true;
    }
  }

  return false;
}
