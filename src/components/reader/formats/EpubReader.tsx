import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import ePub from "epubjs";
import type { ReaderLocator, ReaderSettings, StoredBookFile } from "../../../domain/types";
import { shouldHandleReaderNavigationKey } from "../../../lib/keyboard";
import type { SelectionDraft } from "../annotations/SelectionAnnotator";
import { PageTurnButton } from "../pagination/PageTurnButton";
import { showReaderContextMenu } from "../readerContextMenu";
import {
  buildPaginationLayout,
  paginationCssVariables
} from "./paginationLayout";
import { applyEpubContentStyle } from "./epubCss";
import {
  directionFromSwipe,
  directionFromTap,
  dispatchReaderControlsToggle,
  dispatchReaderNavigation,
  hasReadableSelection,
  isHorizontalReaderWheel,
  isTapGesture,
  isTouchLikePointer,
  navigationDirectionFromWheel,
  READER_NAVIGATION_EVENT,
  shouldIgnoreReaderGestureTarget,
  type ReaderNavigationDirection,
  type ReaderPointerGesture,
  type ReaderWheelGesture
} from "../readerGestures";
import {
  menuPositionFromContextMenuEvent,
  selectionContextFromContextMenuEvent
} from "../selectionContext";
import {
  bindEpubFrameFocusPolling,
  bindEpubFrameFocusRestoration,
  bindEpubKeyboardNavigation
} from "./epubKeyboard";
import {
  epubLocatorKey,
  flattenToc,
  resolveInitialEpubTarget,
  textOffsetFromCfi
} from "./epubNavigation";
import type {
  EpubBookLike,
  EpubContents,
  EpubLocation,
  EpubNavItem,
  EpubRenditionLike
} from "./epubTypes";

interface EpubReaderProps {
  file: StoredBookFile;
  initialLocator: ReaderLocator;
  settings: ReaderSettings;
  onLocatorChange(locator: ReaderLocator): void;
  onChapterTitleChange(title: string): void;
  onSelection(selection: SelectionDraft): void;
  tocOpen: boolean;
  onTocOpenChange(open: boolean): void;
}

interface StageSize {
  width: number;
  height: number;
}

interface EpubProgress {
  page?: number;
  total?: number;
  percentage: number;
}

export function EpubReader({
  file,
  initialLocator,
  settings,
  onLocatorChange,
  onChapterTitleChange,
  onSelection,
  tocOpen,
  onTocOpenChange
}: EpubReaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const keyboardFocusRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBookLike | null>(null);
  const renditionRef = useRef<EpubRenditionLike | null>(null);
  const initialEpubLocator = initialLocator.kind === "epub" ? initialLocator : undefined;
  const initialCfi = useRef(initialEpubLocator?.cfi ?? "");
  const initialChapterId = useRef(initialEpubLocator?.chapterId);
  const initialOffset = useRef(initialEpubLocator?.offset ?? 0);
  const latestCfi = useRef(initialCfi.current);
  const lastNavigationKey = useRef({ key: "", handledAt: 0 });
  const settingsRef = useRef(settings);
  const onLocatorChangeRef = useRef(onLocatorChange);
  const onChapterTitleChangeRef = useRef(onChapterTitleChange);
  const onSelectionRef = useRef(onSelection);
  const progressRef = useRef<EpubProgress>({ percentage: 0 });
  const appliedIncomingLocatorKey = useRef(epubLocatorKey(initialEpubLocator));
  const reportedInternalLocatorKeys = useRef<Set<string>>(new Set());
  const boundGestureDocuments = useRef<WeakSet<Document>>(new WeakSet());
  const gestureCleanups = useRef<Array<() => void>>([]);
  const [toc, setToc] = useState<Array<EpubNavItem & { depth: number }>>([]);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [turnDirection, setTurnDirection] = useState<"next" | "prev">();
  const [progress, setProgress] = useState<EpubProgress>({ percentage: 0 });
  const [isLocationsReady, setIsLocationsReady] = useState(false);
  const [error, setError] = useState<string>();
  const stageReady = stageSize.width > 0 && stageSize.height > 0;
  const paginationLayout = useMemo(
    () => buildPaginationLayout(stageSize, settings, { minSheetHeight: 420, pagePaddingY: 0 }),
    [settings, stageSize.height, stageSize.width]
  );
  const pageMode = paginationLayout.pageMode;
  const incomingEpubLocator = initialLocator.kind === "epub" ? initialLocator : undefined;
  const incomingEpubLocatorKey = epubLocatorKey(incomingEpubLocator);

  const focusReaderKeyboardSurface = useCallback(() => {
    keyboardFocusRef.current?.focus({ preventScroll: true });
  }, []);

  const handleReaderKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!shouldHandleReaderNavigationKey(event)) {
        return false;
      }

      const key = normalizeNavigationKey(event.key);
      const now = Date.now();

      if (lastNavigationKey.current.key === key && now - lastNavigationKey.current.handledAt < 220) {
        consumeReaderNavigationEvent(event);
        return true;
      }

      lastNavigationKey.current = {
        key,
        handledAt: now
      };

      if (key === "ArrowLeft") {
        consumeReaderNavigationEvent(event);
        setTurnDirection("prev");
        void renditionRef.current?.prev();
        return true;
      }

      if (key === "ArrowRight" || key === " ") {
        consumeReaderNavigationEvent(event);
        setTurnDirection("next");
        void renditionRef.current?.next();
        return true;
      }

      return false;
    },
    []
  );

  useEffect(() => {
    settingsRef.current = settings;
    onLocatorChangeRef.current = onLocatorChange;
    onChapterTitleChangeRef.current = onChapterTitleChange;
    onSelectionRef.current = onSelection;
  }, [onChapterTitleChange, onLocatorChange, onSelection, settings]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const updateSize = (width: number, height: number) => {
      setStageSize({
        width,
        height
      });
    };
    const rect = stage.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    const observer = new ResizeObserver(() => {
      const nextRect = stage.getBoundingClientRect();
      updateSize(nextRect.width, nextRect.height);
    });
    observer.observe(stage);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;

    if (!host || !stageReady) {
      return;
    }

    let isActive = true;
    let book: EpubBookLike | undefined;
    let rendition: EpubRenditionLike | undefined;
    setIsLocationsReady(false);
    setError(undefined);
    host.replaceChildren();

    const startTimer = window.setTimeout(() => {
      file.blob.arrayBuffer().then((buffer) => {
        if (!isActive) {
          return undefined;
        }

        book = ePub(buffer) as unknown as EpubBookLike;
        rendition = book.renderTo(host, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: pageMode === 2 ? "always" : "none",
          manager: "default"
        });
        bookRef.current = book;
        renditionRef.current = rendition;
        applyEpubTheme(rendition, settingsRef.current);
        rendition.on("keydown", (eventValue) => {
          handleReaderKeyDown(eventValue as KeyboardEvent);
        });
        rendition.on("keyup", (eventValue) => {
          handleReaderKeyDown(eventValue as KeyboardEvent);
        });
        rendition.on("keypressed", (eventValue) => {
          handleReaderKeyDown(eventValue as KeyboardEvent);
        });

        book.loaded?.navigation
          ?.then((navigation) => {
            if (isActive) {
              setToc(flattenToc(navigation.toc ?? []));
            }
          })
          .catch(() => {
            if (isActive) {
              setToc([]);
            }
          });

        rendition.on("relocated", (locationValue) => {
          const location = locationValue as EpubLocation;
          const cfi = location.start?.cfi ?? "";
          const chapterId = location.start?.href;
          const percentage = cfi
            ? safePercentageFromCfi(book!, cfi, progressRef.current.percentage)
            : progressRef.current.percentage;
          const nextProgress = {
            page: location.start?.displayed?.page,
            total: location.start?.displayed?.total,
            percentage
          };

          progressRef.current = nextProgress;
          setProgress(nextProgress);

          if (cfi) {
            latestCfi.current = cfi;
            const baseLocator = {
              kind: "epub" as const,
              cfi,
              chapterId,
              percentage
            };
            const baseLocatorKey = epubLocatorKey(baseLocator);
            appliedIncomingLocatorKey.current = baseLocatorKey;
            reportedInternalLocatorKeys.current.add(baseLocatorKey);
            void textOffsetFromCfi(book!, cfi)
              .then((offset) => {
                if (!isActive || latestCfi.current !== cfi) {
                  return;
                }

                const nextLocator = {
                  kind: "epub",
                  cfi,
                  chapterId,
                  offset,
                  percentage
                } as const;

                const nextLocatorKey = epubLocatorKey(nextLocator);
                appliedIncomingLocatorKey.current = nextLocatorKey;
                reportedInternalLocatorKeys.current.add(nextLocatorKey);
                onLocatorChangeRef.current(nextLocator);
              })
              .catch(() => {
                if (!isActive || latestCfi.current !== cfi) {
                  return;
                }

                onLocatorChangeRef.current(baseLocator);
              });
          }

          onChapterTitleChangeRef.current(chapterId ?? "当前位置");
        });

        rendition.on("rendered", (_sectionValue, viewValue) => {
          const view = viewValue as { contents?: EpubContents };
          const document = view.contents?.document;

          if (!document) {
            return;
          }

          bindEpubKeyboardNavigation(view.contents ?? { document }, handleReaderKeyDown, {
            restoreFocus: focusReaderKeyboardSurface
          });

          if (!boundGestureDocuments.current.has(document)) {
            boundGestureDocuments.current.add(document);
            gestureCleanups.current.push(bindEpubTouchGestures(document));
            gestureCleanups.current.push(bindEpubSelectionContextMenu(
              view.contents ?? { document },
              (draft) => onSelectionRef.current(draft),
              () => latestCfi.current
            ));
          }

          applyEpubContentStyle(document, settingsRef.current);
        });

        return book.ready
          .then(async () => {
            if (!isActive) {
              return undefined;
            }

            const target = await resolveInitialEpubTarget(
              book!,
              latestCfi.current,
              initialChapterId.current,
              initialOffset.current
            );

            if (!isActive) {
              return undefined;
            }

            await rendition!.display(target);
            window.setTimeout(focusReaderKeyboardSurface, 0);

            void book!.locations
              .generate(1200)
              .then(() => {
                if (!isActive) {
                  return;
                }

                setIsLocationsReady(true);
                const currentCfi = latestCfi.current;

                if (!currentCfi) {
                  return;
                }

                const percentage = safePercentageFromCfi(book!, currentCfi, progressRef.current.percentage);
                progressRef.current = {
                  ...progressRef.current,
                  percentage
                };
                setProgress(progressRef.current);
              })
              .catch(() => {
                setIsLocationsReady(false);
              });

            return undefined;
          });
      })
      .catch(() => {
        if (isActive) {
          setError("EPUB 打开失败");
        }
      });
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(startTimer);
      for (const cleanup of gestureCleanups.current.splice(0)) {
        cleanup();
      }
      boundGestureDocuments.current = new WeakSet();
      renditionRef.current = null;
      bookRef.current = null;
      rendition?.destroy();
      book?.destroy();
      host.replaceChildren();
    };
  }, [file.blob, focusReaderKeyboardSurface, handleReaderKeyDown, pageMode, settings.replaceEpubCss, stageReady]);

  useEffect(() => {
    if (renditionRef.current) {
      applyEpubTheme(renditionRef.current, settings);
      applyEpubContentStylesToRendition(renditionRef.current, settings);
    }
  }, [settings]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    return bindEpubFrameFocusRestoration(host, focusReaderKeyboardSurface);
  }, [focusReaderKeyboardSurface, stageReady]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    return bindEpubFrameFocusPolling(host, focusReaderKeyboardSurface);
  }, [focusReaderKeyboardSurface, stageReady]);

  useEffect(() => {
    const book = bookRef.current;
    const rendition = renditionRef.current;

    if (!book || !rendition || !incomingEpubLocator || !incomingEpubLocatorKey) {
      return;
    }

    if (appliedIncomingLocatorKey.current === incomingEpubLocatorKey) {
      reportedInternalLocatorKeys.current.delete(incomingEpubLocatorKey);
      return;
    }

    appliedIncomingLocatorKey.current = incomingEpubLocatorKey;

    if (reportedInternalLocatorKeys.current.delete(incomingEpubLocatorKey)) {
      return;
    }

    void resolveInitialEpubTarget(
      book,
      incomingEpubLocator.cfi,
      incomingEpubLocator.chapterId,
      incomingEpubLocator.offset ?? 0
    )
      .then((target) => {
        if (target) {
          return rendition.display(target);
        }

        return undefined;
      })
      .catch(() => undefined);
  }, [incomingEpubLocator, incomingEpubLocatorKey]);

  useEffect(() => {
    if (!turnDirection) {
      return;
    }

    const timeout = window.setTimeout(() => setTurnDirection(undefined), 320);
    return () => window.clearTimeout(timeout);
  }, [turnDirection]);

  const goPrevious = useCallback(() => {
    setTurnDirection("prev");
    void renditionRef.current?.prev();
  }, []);

  const goNext = useCallback(() => {
    setTurnDirection("next");
    void renditionRef.current?.next();
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleReaderKeyDown);

    return () => window.removeEventListener("keydown", handleReaderKeyDown);
  }, [handleReaderKeyDown]);

  useEffect(() => {
    const handleReaderNavigation = (event: Event) => {
      const direction = (event as CustomEvent<{ direction?: ReaderNavigationDirection }>).detail?.direction;

      if (direction === "previous") {
        goPrevious();
      }

      if (direction === "next") {
        goNext();
      }
    };

    window.addEventListener(READER_NAVIGATION_EVENT, handleReaderNavigation);

    return () => window.removeEventListener(READER_NAVIGATION_EVENT, handleReaderNavigation);
  }, [goNext, goPrevious]);

  const displayTocItem = (href: string) => {
    onTocOpenChange(false);
    void renditionRef.current?.display(href);
  };

  if (error) {
    return <p className="reader-loading">{error}</p>;
  }

  const pageIndicator = progress.page
    ? `${progress.page}${isLocationsReady && progress.total ? ` / ${progress.total}` : ""}`
    : "";

  return (
    <div className={tocOpen ? "paginated-reader-layout toc-open" : "paginated-reader-layout"}>
      <aside className="chapter-panel" aria-label="目录" data-reader-toc-panel id="reader-toc-panel">
        <div className="chapter-panel-header">
          <span>目录</span>
        </div>
        <nav className="chapter-nav" aria-label="章节">
          {toc.length === 0 ? <p className="toc-empty">正在读取目录...</p> : null}
          {toc.map((item) => (
            <button
              data-level={Math.min(3, item.depth + 1)}
              key={`${item.href}-${item.label}`}
              type="button"
              onClick={() => displayTocItem(item.href)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section
        className="paginated-stage epub-stage"
        ref={stageRef}
        style={{
          ...paginationCssVariables(paginationLayout, settings)
        } as CSSProperties}
      >
        <div
          aria-label="阅读键盘导航"
          className="reader-keyboard-focus"
          ref={keyboardFocusRef}
          tabIndex={0}
        />
        <div
          className={`reader-surface epub-reader book-page-shell pages-${pageMode}${turnDirection ? ` turn-${turnDirection}` : ""}`}
          ref={hostRef}
          tabIndex={-1}
        />

        <PageTurnButton direction="previous" title="上一页" onTurn={goPrevious} />
        <PageTurnButton direction="next" title="下一页" onTurn={goNext} />

        {pageIndicator ? <div className="page-indicator">{pageIndicator}</div> : null}
      </section>
    </div>
  );
}

function applyEpubContentStylesToRendition(
  rendition: EpubRenditionLike,
  settings: ReaderSettings
): void {
  for (const contents of rendition.getContents?.() ?? []) {
    if (contents.document) {
      applyEpubContentStyle(contents.document, settings);
    }
  }
}

function bindEpubSelectionContextMenu(
  contents: EpubContents,
  onSelection: (selection: SelectionDraft) => void,
  fallbackCfi: () => string
): () => void {
  const ownerDocument = contents.document;

  if (!ownerDocument) {
    return () => undefined;
  }

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();

    const root = ownerDocument.body ?? ownerDocument.documentElement;
    const context = selectionContextFromContextMenuEvent(event, root);

    if (!context) {
      return;
    }

    const cfi = safeCfiFromEpubRange(contents, context.range) ?? fallbackCfi();
    const draft: SelectionDraft = {
      text: context.text.slice(0, 600),
      locator: cfi
        ? {
            kind: "epub",
            cfi
          }
        : undefined
    };

    void showReaderContextMenu({
      position: menuPositionFromContextMenuEvent(event),
      onAddNote: () => onSelection(draft)
    });
  };

  ownerDocument.addEventListener("contextmenu", handleContextMenu);

  return () => ownerDocument.removeEventListener("contextmenu", handleContextMenu);
}

function safeCfiFromEpubRange(contents: EpubContents, range: Range): string | undefined {
  try {
    return contents.cfiFromRange?.(range);
  } catch {
    return undefined;
  }
}

function bindEpubTouchGestures(ownerDocument: Document): () => void {
  const wheelGesture: ReaderWheelGesture = {
    accumulatedDeltaX: 0,
    hasNavigatedInSequence: false,
    lastWheelAt: 0,
    lastNavigationAt: 0
  };
  let pointerGesture: ReaderPointerGesture | undefined;

  const handlePointerDown = (event: PointerEvent) => {
    if (
      !isTouchLikePointer(event) ||
      !event.isPrimary ||
      event.button !== 0 ||
      shouldIgnoreReaderGestureTarget(event.target)
    ) {
      pointerGesture = undefined;
      return;
    }

    pointerGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      target: event.target
    };
  };

  const handlePointerUp = (event: PointerEvent) => {
    const gesture = pointerGesture;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    pointerGesture = undefined;

    if (shouldIgnoreReaderGestureTarget(gesture.target) || hasReadableSelection(ownerDocument)) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const swipeDirection = directionFromSwipe(deltaX, deltaY);

    if (swipeDirection) {
      event.preventDefault();
      dispatchReaderNavigation(swipeDirection);
      return;
    }

    if (!isTapGesture(deltaX, deltaY)) {
      return;
    }

    const width = ownerDocument.defaultView?.innerWidth ?? ownerDocument.documentElement.clientWidth;
    const tapAction = directionFromTap(event.clientX, width);

    if (tapAction === "toggle") {
      event.preventDefault();
      dispatchReaderControlsToggle();
      return;
    }

    if (tapAction) {
      event.preventDefault();
      dispatchReaderNavigation(tapAction);
    }
  };

  const handlePointerCancel = (event: PointerEvent) => {
    if (pointerGesture?.pointerId === event.pointerId) {
      pointerGesture = undefined;
    }
  };

  const handleWheel = (event: WheelEvent) => {
    if (shouldIgnoreReaderGestureTarget(event.target) || !isHorizontalReaderWheel(event)) {
      return;
    }

    event.preventDefault();
    const direction = navigationDirectionFromWheel(event, wheelGesture);

    if (!direction) {
      return;
    }

    dispatchReaderNavigation(direction);
  };

  ownerDocument.addEventListener("pointerdown", handlePointerDown, { passive: true });
  ownerDocument.addEventListener("pointerup", handlePointerUp);
  ownerDocument.addEventListener("pointercancel", handlePointerCancel);
  ownerDocument.addEventListener("wheel", handleWheel, { passive: false });

  return () => {
    ownerDocument.removeEventListener("pointerdown", handlePointerDown);
    ownerDocument.removeEventListener("pointerup", handlePointerUp);
    ownerDocument.removeEventListener("pointercancel", handlePointerCancel);
    ownerDocument.removeEventListener("wheel", handleWheel);
  };
}

function safePercentageFromCfi(book: EpubBookLike, cfi: string, fallback: number): number {
  try {
    const percentage = book.locations.percentageFromCfi(cfi);
    return Number.isFinite(percentage) ? percentage : fallback;
  } catch {
    return fallback;
  }
}

function normalizeNavigationKey(key: string): string {
  if (key === "Left") {
    return "ArrowLeft";
  }

  if (key === "Right") {
    return "ArrowRight";
  }

  return key === "Space" || key === "Spacebar" || key === "space" ? " " : key;
}

function consumeReaderNavigationEvent(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function applyEpubTheme(rendition: EpubRenditionLike, settings: ReaderSettings): void {
  rendition.themes.register("reader", {
    body: {
      color: settings.theme === "dark" ? "#e6e1d8" : "#28231d",
      background: settings.theme === "dark" ? "#171716" : "#fbfaf7",
      "font-family": fontFamily(settings.fontFamily),
      "line-height": `${settings.lineHeight} !important`,
      "padding": "0 8px !important"
    },
    p: {
      "line-height": `${settings.lineHeight} !important`,
      "margin-top": "0 !important",
      "margin-bottom": `${settings.paragraphSpacing}em !important`
    },
    "::selection": {
      background: "#f7d560"
    }
  });
  rendition.themes.select("reader");
  rendition.themes.fontSize(`${settings.fontSize}px`);
}

function fontFamily(value: string): string {
  if (value === "serif") {
    return 'Georgia, "Songti SC", serif';
  }

  if (value === "mono") {
    return '"SFMono-Regular", Consolas, monospace';
  }

  return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';
}
