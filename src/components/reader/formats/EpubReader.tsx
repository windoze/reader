import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import ePub from "epubjs";
import type { ReaderLocator, ReaderSettings, StoredBookFile } from "../../../domain/types";
import { shouldHandleReaderNavigationKey } from "../../../lib/keyboard";
import type { SelectionDraft } from "../annotations/SelectionAnnotator";
import {
  buildPaginationLayout,
  paginationCssVariables
} from "./paginationLayout";

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

interface EpubBookLike {
  ready: Promise<unknown>;
  loaded?: {
    navigation?: Promise<{ toc?: EpubNavItem[] }>;
  };
  locations: {
    generate(chars: number): Promise<unknown>;
    percentageFromCfi(cfi: string): number;
    cfiFromPercentage(percentage: number): string;
  };
  getRange(cfiRange: string): Promise<Range>;
  load(path: string): Promise<object>;
  renderTo(element: HTMLElement, options: Record<string, unknown>): EpubRenditionLike;
  section(target: string): EpubSectionLike | undefined;
  destroy(): void;
}

interface EpubSectionLike {
  document?: Document;
  load(request: Function): Promise<unknown>;
  cfiFromRange(range: Range): string;
}

interface EpubRenditionLike {
  display(target?: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  destroy(): void;
  themes: {
    register(name: string, rules: Record<string, unknown>): void;
    select(name: string): void;
    fontSize(value: string): void;
  };
  annotations: {
    highlight(cfiRange: string, data: unknown, callback: () => void, className: string, styles: unknown): void;
  };
}

interface EpubLocation {
  start?: {
    cfi?: string;
    displayed?: {
      page?: number;
      total?: number;
    };
    href?: string;
  };
}

interface EpubContents {
  document?: Document;
  window?: Window;
}

interface EpubNavItem {
  id?: string;
  label: string;
  href: string;
  subitems?: EpubNavItem[];
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

type EpubKeyboardHandler = (event: KeyboardEvent) => void;
const epubKeyboardHandlers = new WeakMap<Document, EpubKeyboardHandler>();

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
  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBookLike | null>(null);
  const renditionRef = useRef<EpubRenditionLike | null>(null);
  const initialEpubLocator = initialLocator.kind === "epub" ? initialLocator : undefined;
  const initialCfi = useRef(initialEpubLocator?.cfi ?? "");
  const initialChapterId = useRef(initialEpubLocator?.chapterId);
  const initialOffset = useRef(initialEpubLocator?.offset ?? 0);
  const latestCfi = useRef(initialCfi.current);
  const settingsRef = useRef(settings);
  const onLocatorChangeRef = useRef(onLocatorChange);
  const onChapterTitleChangeRef = useRef(onChapterTitleChange);
  const onSelectionRef = useRef(onSelection);
  const progressRef = useRef<EpubProgress>({ percentage: 0 });
  const appliedIncomingLocatorKey = useRef(epubLocatorKey(initialEpubLocator));
  const reportedInternalLocatorKeys = useRef<Set<string>>(new Set());
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

  const handleReaderKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!shouldHandleReaderNavigationKey(event)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setTurnDirection("prev");
        void renditionRef.current?.prev();
      }

      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setTurnDirection("next");
        void renditionRef.current?.next();
      }
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

        rendition.on("selected", (cfiRangeValue, contentsValue) => {
          const cfiRange = String(cfiRangeValue);
          const contents = contentsValue as EpubContents;
          const selectedText = contents.window?.getSelection()?.toString().trim();

          if (!selectedText) {
            return;
          }

          rendition!.annotations.highlight(
            cfiRange,
            {},
            () => undefined,
            "reader-highlight",
            { fill: "#f7d560", "fill-opacity": "0.45" }
          );
          onSelectionRef.current({
            text: selectedText.slice(0, 600),
            locator: {
              kind: "epub",
              cfi: cfiRange
            }
          });
        });

        rendition.on("rendered", (_sectionValue, viewValue) => {
          const view = viewValue as { contents?: EpubContents };
          const document = view.contents?.document;

          if (!document) {
            return;
          }

          const previousHandler = epubKeyboardHandlers.get(document);

          if (previousHandler) {
            document.removeEventListener("keydown", previousHandler);
          }

          document.addEventListener("keydown", handleReaderKeyDown);
          epubKeyboardHandlers.set(document, handleReaderKeyDown);
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
      renditionRef.current = null;
      bookRef.current = null;
      rendition?.destroy();
      book?.destroy();
      host.replaceChildren();
    };
  }, [file.blob, handleReaderKeyDown, pageMode, stageReady]);

  useEffect(() => {
    if (renditionRef.current) {
      applyEpubTheme(renditionRef.current, settings);
    }
  }, [settings]);

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
          className={`reader-surface epub-reader book-page-shell pages-${pageMode}${turnDirection ? ` turn-${turnDirection}` : ""}`}
          ref={hostRef}
        />

        <button className="page-turn-zone previous" title="上一页" type="button" onClick={goPrevious}>
          <ChevronLeft size={24} aria-hidden />
        </button>
        <button className="page-turn-zone next" title="下一页" type="button" onClick={goNext}>
          <ChevronRight size={24} aria-hidden />
        </button>

        {pageIndicator ? <div className="page-indicator">{pageIndicator}</div> : null}
      </section>
    </div>
  );
}

function flattenToc(items: EpubNavItem[], depth = 0): Array<EpubNavItem & { depth: number }> {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenToc(item.subitems ?? [], depth + 1)
  ]);
}

function epubLocatorKey(locator?: Extract<ReaderLocator, { kind: "epub" }>): string {
  if (!locator) {
    return "";
  }

  if (locator.cfi) {
    return `cfi:${locator.cfi}`;
  }

  return `chapter:${locator.chapterId ?? ""}:offset:${locator.offset ?? 0}`;
}

async function resolveInitialEpubTarget(
  book: EpubBookLike,
  cfi: string,
  chapterId?: string,
  offset = 0
): Promise<string | undefined> {
  if (cfi) {
    return cfi;
  }

  if (!chapterId) {
    return undefined;
  }

  if (offset <= 0) {
    return chapterId;
  }

  return cfiFromEpubTextOffset(book, chapterId, offset).catch(() => chapterId);
}

async function textOffsetFromCfi(book: EpubBookLike, cfi: string): Promise<number> {
  const range = await book.getRange(cfi);
  return textOffsetFromRange(range);
}

function textOffsetFromRange(range: Range): number {
  const document = range.startContainer.ownerDocument;
  const root = document?.body;

  if (!document || !root) {
    return 0;
  }

  let offset = 0;
  const walker = document.createTreeWalker(root, 4);
  let node = walker.nextNode();

  while (node) {
    if (node === range.startContainer) {
      return offset + range.startOffset;
    }

    offset += node.textContent?.length ?? 0;
    node = walker.nextNode();
  }

  return offset;
}

async function cfiFromEpubTextOffset(
  book: EpubBookLike,
  chapterId: string,
  offset: number
): Promise<string> {
  const section = book.section(chapterId);

  if (!section) {
    return chapterId;
  }

  await section.load(book.load.bind(book));
  const document = section.document;
  const root = document?.body;

  if (!document || !root) {
    return chapterId;
  }

  const point = textPointAtOffset(root, offset);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);

  return section.cfiFromRange(range);
}

function textPointAtOffset(root: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, 4);
  let remaining = Math.max(0, targetOffset);
  let node = walker.nextNode();
  let lastTextNode: Node | undefined;

  while (node) {
    lastTextNode = node;
    const length = node.textContent?.length ?? 0;

    if (remaining <= length) {
      return {
        node,
        offset: remaining
      };
    }

    remaining -= length;
    node = walker.nextNode();
  }

  return {
    node: lastTextNode ?? root,
    offset: lastTextNode?.textContent?.length ?? root.childNodes.length
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
