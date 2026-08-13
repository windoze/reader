import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties } from "react";
import type { ReaderLocator, ReaderSettings, StoredBookFile, TextChapter } from "../../../domain/types";
import { shouldHandleReaderNavigationKey } from "../../../lib/keyboard";
import { chapterizeText } from "../../../services/text/chapterize";
import { decodeTextBuffer } from "../../../services/text/encoding";
import type { SelectionDraft } from "../annotations/SelectionAnnotator";
import {
  buildPaginationLayout,
  paginationCssVariables,
  paginationFingerprint
} from "./paginationLayout";
import { buildChapterBlocks, type TextPageBlock } from "./textBlocks";
import {
  pageIndexForOffset,
  paginateTextBlocks,
  type TextPage
} from "./textPagination";

interface TextReaderProps {
  file: StoredBookFile;
  initialLocator: ReaderLocator;
  settings: ReaderSettings;
  onLocatorChange(locator: ReaderLocator): void;
  onChapterTitleChange(title: string): void;
  onExcerptChange(excerpt: string): void;
  onSelection(selection: SelectionDraft): void;
  tocOpen: boolean;
  onTocOpenChange(open: boolean): void;
}

interface StageSize {
  width: number;
  height: number;
}

export function TextReader({
  file,
  initialLocator,
  settings,
  onLocatorChange,
  onChapterTitleChange,
  onExcerptChange,
  onSelection,
  tocOpen,
  onTocOpenChange
}: TextReaderProps) {
  const [loadedText, setLoadedText] = useState(file.textContent);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [pageIndex, setPageIndex] = useState(0);
  const [pages, setPages] = useState<TextPage[]>([]);
  const [isInitialPageSettled, setIsInitialPageSettled] = useState(false);
  const [pendingLastPage, setPendingLastPage] = useState(false);
  const [turnDirection, setTurnDirection] = useState<"next" | "prev">();
  const stageRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const restoredInitialPage = useRef(false);
  const anchorLocatorRef = useRef(
    initialLocator.kind === "txt"
      ? {
          chapterId: initialLocator.chapterId,
          offset: initialLocator.offset
        }
      : undefined
  );
  const appliedLocatorKey = useRef("");
  const ignoredIncomingLocatorKey = useRef<string | undefined>(undefined);
  const lastReportedLocator = useRef("");

  useEffect(() => {
    if (file.textContent) {
      return;
    }

    let isMounted = true;

    file.blob
      .arrayBuffer()
      .then((buffer) => decodeTextBuffer(buffer).text)
      .then((text) => {
        if (isMounted) {
          setLoadedText(text);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file.blob, file.textContent]);

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

  const text = loadedText ?? "";
  const chapters = useMemo<TextChapter[]>(
    () => file.chapters?.length ? file.chapters : chapterizeText(text),
    [file.chapters, text]
  );
  const firstReadableChapter = chapters[0]?.level === 1
    ? chapters.find((chapter) => chapter.level > 1) ?? chapters[0]
    : chapters[0];
  const initialChapterId =
    initialLocator.kind === "txt" && chapters.some((chapter) => chapter.id === initialLocator.chapterId)
      ? initialLocator.chapterId
      : firstReadableChapter?.id;
  const incomingTxtChapterId = initialLocator.kind === "txt" ? initialLocator.chapterId : "";
  const incomingTxtOffset = initialLocator.kind === "txt" ? initialLocator.offset : 0;
  const [activeChapterId, setActiveChapterId] = useState(initialChapterId);
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? firstReadableChapter;
  const activeChapterIndex = activeChapter
    ? chapters.findIndex((chapter) => chapter.id === activeChapter.id)
    : -1;
  const stageReady = stageSize.width > 0 && stageSize.height > 0;
  const paginationLayout = useMemo(
    () => buildPaginationLayout(stageSize, settings, { minSheetHeight: 360 }),
    [settings, stageSize.height, stageSize.width]
  );
  const pageMode = paginationLayout.pageMode;
  const paginationKey = paginationFingerprint(settings, paginationLayout);

  const blocks = useMemo<TextPageBlock[]>(() => {
    if (!activeChapter) {
      return [];
    }

    return buildChapterBlocks(
      activeChapter,
      text.slice(activeChapter.start, activeChapter.end)
    );
  }, [activeChapter, text]);

  useEffect(() => {
    if (!activeChapterId && firstReadableChapter) {
      setActiveChapterId(firstReadableChapter.id);
    }
  }, [activeChapterId, firstReadableChapter]);

  useEffect(() => {
    if (!incomingTxtChapterId || !chapters.some((chapter) => chapter.id === incomingTxtChapterId)) {
      return;
    }

    const nextKey = textLocatorKey(incomingTxtChapterId, incomingTxtOffset);

    if (ignoredIncomingLocatorKey.current && ignoredIncomingLocatorKey.current !== nextKey) {
      ignoredIncomingLocatorKey.current = undefined;
    }

    if (ignoredIncomingLocatorKey.current === nextKey) {
      return;
    }

    if (appliedLocatorKey.current === nextKey) {
      return;
    }

    anchorLocatorRef.current = {
      chapterId: incomingTxtChapterId,
      offset: incomingTxtOffset
    };
    setPendingLastPage(false);

    if (activeChapter?.id === incomingTxtChapterId && pages.length > 0) {
      appliedLocatorKey.current = nextKey;
      restoredInitialPage.current = true;
      setPageIndex(normalizePageStart(
        pageIndexForOffset(pages, Math.max(0, incomingTxtOffset)),
        pages.length,
        pageMode
      ));
      setIsInitialPageSettled(true);
      return;
    }

    restoredInitialPage.current = false;
    setIsInitialPageSettled(false);
    setActiveChapterId(incomingTxtChapterId);
  }, [
    activeChapter?.id,
    chapters,
    incomingTxtChapterId,
    incomingTxtOffset,
    pageMode,
    pages
  ]);

  const measureBlocks = useCallback((pageBlocks: TextPageBlock[]) => {
    const measurer = measureRef.current;

    if (!measurer) {
      return Number.POSITIVE_INFINITY;
    }

    measurer.replaceChildren(...pageBlocks.map(renderMeasureBlock));
    return measurer.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (!stageReady || !activeChapter || blocks.length === 0 || paginationLayout.sheetWidth <= 0) {
      return;
    }

    const nextPages = paginateTextBlocks(blocks, paginationLayout.sheetHeight, measureBlocks);
    setPages(nextPages);
    setPageIndex((current) => {
      if (pendingLastPage) {
        return normalizePageStart(nextPages.length - 1, nextPages.length, pageMode);
      }

      if (
        !restoredInitialPage.current &&
        anchorLocatorRef.current &&
        anchorLocatorRef.current.chapterId === activeChapter.id
      ) {
        const anchorOffset = anchorLocatorRef.current.offset;

        restoredInitialPage.current = true;
        return normalizePageStart(
          pageIndexForOffset(
            nextPages,
            Math.max(0, anchorOffset)
          ),
          nextPages.length,
          pageMode
        );
      }

      return normalizePageStart(current, nextPages.length, pageMode);
    });
    setPendingLastPage(false);
    setIsInitialPageSettled(true);
  }, [
    activeChapter,
    blocks,
    measureBlocks,
    pageMode,
    paginationKey,
    paginationLayout.sheetHeight,
    paginationLayout.sheetWidth,
    pendingLastPage,
    stageReady
  ]);

  useEffect(() => {
    if (!turnDirection) {
      return;
    }

    const timeout = window.setTimeout(() => setTurnDirection(undefined), 320);
    return () => window.clearTimeout(timeout);
  }, [turnDirection]);

  useEffect(() => {
    if (!isInitialPageSettled || !activeChapter || pages.length === 0) {
      return;
    }

    const page = pages[Math.min(pageIndex, pages.length - 1)];
    const lastPage = pages[Math.min(pages.length - 1, pageIndex + pageMode - 1)];
    const anchor = anchorLocatorRef.current;
    const offset =
      anchor &&
      anchor.chapterId === activeChapter.id &&
      anchor.offset >= page.startOffset &&
      anchor.offset <= (lastPage?.endOffset ?? page.endOffset)
        ? anchor.offset
        : page.startOffset;
    const absoluteOffset = activeChapter.start + offset;
    const percentage = text.length === 0 ? 0 : absoluteOffset / text.length;
    const handledLocatorKey = textLocatorKey(activeChapter.id, offset);
    const locatorKey = `${handledLocatorKey}:${pageIndex}:${pages.length}`;
    const excerpt = page.blocks
      .filter((block) => block.kind === "paragraph")
      .map((block) => block.text)
      .join(" ")
      .slice(0, 120);

    onChapterTitleChange(activeChapter.title);
    onExcerptChange(excerpt);
    if (lastReportedLocator.current === locatorKey) {
      return;
    }

    lastReportedLocator.current = locatorKey;
    appliedLocatorKey.current = handledLocatorKey;
    onLocatorChange({
      kind: "txt",
      chapterId: activeChapter.id,
      offset,
      percentage
    });
  }, [
    activeChapter,
    isInitialPageSettled,
    onChapterTitleChange,
    onExcerptChange,
    onLocatorChange,
    pageIndex,
    pageMode,
    pages,
    text.length
  ]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const handleSelection = () => {
      const selection = document.getSelection();
      const selectedText = selection?.toString().trim();

      if (!selection || !selectedText || selectedText.length < 2) {
        return;
      }

      if (selection.anchorNode && !stage.contains(selection.anchorNode)) {
        return;
      }

      const page = pages[Math.min(pageIndex, pages.length - 1)];

      onSelection({
        text: selectedText.slice(0, 600),
        locator: activeChapter && page
          ? {
              kind: "txt",
              chapterId: activeChapter.id,
              offset: page.startOffset,
              percentage: text.length === 0
                ? 0
                : (activeChapter.start + page.startOffset) / text.length
            }
          : undefined
      });
    };

    stage.addEventListener("mouseup", handleSelection);
    stage.addEventListener("keyup", handleSelection);

    return () => {
      stage.removeEventListener("mouseup", handleSelection);
      stage.removeEventListener("keyup", handleSelection);
    };
  }, [activeChapter, onSelection, pageIndex, pages, text.length]);

  const selectChapter = (chapterId: string) => {
    ignoreCurrentIncomingLocator();
    anchorLocatorRef.current = undefined;
    restoredInitialPage.current = true;
    setPendingLastPage(false);
    setIsInitialPageSettled(false);
    setActiveChapterId(chapterId);
    setPageIndex(0);
    onTocOpenChange(false);
  };

  const goToPage = useCallback((nextPage: number) => {
    ignoreCurrentIncomingLocator();
    anchorLocatorRef.current = undefined;
    setTurnDirection(nextPage > pageIndex ? "next" : "prev");
    setPageIndex(normalizePageStart(nextPage, pages.length, pageMode));
  }, [incomingTxtChapterId, incomingTxtOffset, pageIndex, pageMode, pages.length]);

  const goPrevious = useCallback(() => {
    if (pageIndex > 0) {
      goToPage(pageIndex - pageMode);
      return;
    }

    const previous = chapters[activeChapterIndex - 1];

    if (previous) {
      ignoreCurrentIncomingLocator();
      anchorLocatorRef.current = undefined;
      restoredInitialPage.current = true;
      setPendingLastPage(true);
      setIsInitialPageSettled(false);
      setTurnDirection("prev");
      setActiveChapterId(previous.id);
    }
  }, [activeChapterIndex, chapters, goToPage, pageIndex, pageMode]);

  const goNext = useCallback(() => {
    if (pageIndex + pageMode < pages.length) {
      goToPage(pageIndex + pageMode);
      return;
    }

    const next = chapters[activeChapterIndex + 1];

    if (next) {
      ignoreCurrentIncomingLocator();
      anchorLocatorRef.current = undefined;
      restoredInitialPage.current = true;
      setPendingLastPage(false);
      setIsInitialPageSettled(false);
      setTurnDirection("next");
      setActiveChapterId(next.id);
      setPageIndex(0);
    }
  }, [activeChapterIndex, chapters, goToPage, pageIndex, pageMode, pages.length]);

  function ignoreCurrentIncomingLocator() {
    if (!incomingTxtChapterId) {
      return;
    }

    ignoredIncomingLocatorKey.current = textLocatorKey(incomingTxtChapterId, incomingTxtOffset);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleReaderNavigationKey(event)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }

      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious]);

  if (!loadedText) {
    return <p className="reader-loading">正在解析 TXT...</p>;
  }

  const visiblePages = pages.slice(pageIndex, pageIndex + pageMode);
  const lastVisiblePage = Math.min(pages.length, pageIndex + pageMode);
  const pageIndicator = pages.length > 0
    ? `${pageIndex + 1}${lastVisiblePage > pageIndex + 1 ? `-${lastVisiblePage}` : ""} / ${pages.length}`
    : "";

  return (
    <div className={tocOpen ? "paginated-reader-layout toc-open" : "paginated-reader-layout"}>
      <aside className="chapter-panel" aria-label="目录" data-reader-toc-panel id="reader-toc-panel">
        <div className="chapter-panel-header">
          <span>目录</span>
        </div>
        <nav className="chapter-nav" aria-label="章节">
          {chapters.map((chapter) => (
            <button
              className={chapter.id === activeChapter?.id ? "active" : ""}
              data-level={chapter.level}
              key={chapter.id}
              type="button"
              onClick={() => selectChapter(chapter.id)}
            >
              {chapter.title}
            </button>
          ))}
        </nav>
      </aside>

      <section
        className="paginated-stage"
        ref={stageRef}
        style={{
          ...paginationCssVariables(paginationLayout, settings)
        } as CSSProperties}
      >
        <div
          className={`book-spread pages-${pageMode}${turnDirection ? ` turn-${turnDirection}` : ""}`}
          data-page-mode={pageMode}
        >
          {visiblePages.map((page, index) => (
            <article
              className="reader-surface book-page text-page"
              key={`${activeChapter?.id ?? "chapter"}-${pageIndex + index}`}
              style={{
                fontFamily: fontFamily(settings.fontFamily),
                fontSize: settings.fontSize,
                lineHeight: settings.lineHeight
              }}
            >
              {page.blocks.map((block, blockIndex) => renderPageBlock(block, blockIndex))}
            </article>
          ))}
        </div>

        <button className="page-turn-zone previous" title="上一页" type="button" onClick={goPrevious}>
          <ChevronLeft size={24} aria-hidden />
        </button>
        <button className="page-turn-zone next" title="下一页" type="button" onClick={goNext}>
          <ChevronRight size={24} aria-hidden />
        </button>

        {pageIndicator ? <div className="page-indicator">{pageIndicator}</div> : null}

        <div
          aria-hidden
          className="text-page-measure"
          ref={measureRef}
          style={{
            fontFamily: fontFamily(settings.fontFamily),
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight
          }}
        />
      </section>
    </div>
  );
}

function renderMeasureBlock(block: TextPageBlock): HTMLElement {
  const element = document.createElement(block.kind === "heading" ? "h2" : "p");
  element.textContent = block.text;
  return element;
}

function renderPageBlock(block: TextPageBlock, index: number) {
  if (block.kind === "heading") {
    return <h2 key={`${block.start}-${index}`}>{block.text}</h2>;
  }

  return <p key={`${block.start}-${index}`}>{block.text}</p>;
}

function normalizePageStart(page: number, totalPages: number, pageMode: number): number {
  const maxPage = Math.max(0, totalPages - 1);
  const clamped = Math.min(maxPage, Math.max(0, page));

  if (pageMode === 1) {
    return clamped;
  }

  return clamped - (clamped % pageMode);
}

function textLocatorKey(chapterId: string, offset: number): string {
  return `${chapterId}:${offset}`;
}

function fontFamily(value: string): string {
  if (value === "serif") {
    return 'Georgia, "Songti SC", "Noto Serif CJK SC", serif';
  }

  if (value === "mono") {
    return '"SFMono-Regular", Consolas, monospace';
  }

  if (value === "sans") {
    return '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }

  return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';
}
