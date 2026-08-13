export function shouldHandleReaderNavigationKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (!["ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    return false;
  }

  const target = event.target;

  if (isElementTarget(target)) {
    return !target.closest("input, textarea, select, [contenteditable='true']");
  }

  return true;
}

function isElementTarget(target: EventTarget | null): target is Element {
  return typeof (target as Element | null)?.closest === "function";
}
