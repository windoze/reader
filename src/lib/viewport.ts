const APP_VIEWPORT_HEIGHT_PROPERTY = "--app-viewport-height";

export function bindAppViewportHeight(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  let animationFrame = 0;

  const currentViewportHeight = () => {
    const visualViewportHeight = window.visualViewport?.height;

    if (typeof visualViewportHeight === "number" && visualViewportHeight > 0) {
      return visualViewportHeight;
    }

    return window.innerHeight;
  };

  const updateViewportHeight = () => {
    animationFrame = 0;
    const height = Math.max(1, Math.floor(currentViewportHeight()));
    document.documentElement.style.setProperty(APP_VIEWPORT_HEIGHT_PROPERTY, `${height}px`);
  };

  const scheduleViewportHeightUpdate = () => {
    if (animationFrame !== 0) {
      return;
    }

    animationFrame = window.requestAnimationFrame(updateViewportHeight);
  };

  updateViewportHeight();

  window.addEventListener("resize", scheduleViewportHeightUpdate);
  window.addEventListener("orientationchange", scheduleViewportHeightUpdate);
  window.visualViewport?.addEventListener("resize", scheduleViewportHeightUpdate);
  window.visualViewport?.addEventListener("scroll", scheduleViewportHeightUpdate);

  return () => {
    if (animationFrame !== 0) {
      window.cancelAnimationFrame(animationFrame);
    }

    window.removeEventListener("resize", scheduleViewportHeightUpdate);
    window.removeEventListener("orientationchange", scheduleViewportHeightUpdate);
    window.visualViewport?.removeEventListener("resize", scheduleViewportHeightUpdate);
    window.visualViewport?.removeEventListener("scroll", scheduleViewportHeightUpdate);
  };
}
