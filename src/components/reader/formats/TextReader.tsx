import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type {
  Annotation,
  ReaderLocator,
  ReaderSettings,
  StoredBookFile,
  TextChapter
} from "../../../domain/types";
import { shouldHandleReaderNavigationKey } from "../../../lib/keyboard";
import type { LibraryRepository } from "../../../services/libraryRepository";
import { chapterizeText } from "../../../services/text/chapterize";
import { buildChapterBlocks, type TextPageBlock } from "../../../services/text/blocks";
import { decodeTextBuffer } from "../../../services/text/encoding";
import type { SelectionDraft } from "../annotations/SelectionAnnotator";
import { showReaderContextMenu } from "../readerContextMenu";
import {
  buildPaginationLayout,
  paginationCssVariables,
  paginationFingerprint
} from "./paginationLayout";
import { READER_NAVIGATION_EVENT, type ReaderNavigationDirection } from "../readerGestures";
import {
  pageIndexForOffset,
  paginateTextBlocks,
  type TextPage
} from "./textPagination";
import {
  menuPositionFromContextMenuEvent,
  selectionContextFromContextMenuEvent,
  textOffsetInBlock
} from "../selectionContext";

interface TextReaderProps {
  annotations?: Annotation[];
  bookId: string;
  file: StoredBookFile;
  initialLocator: ReaderLocator;
  layoutCache: Pick<LibraryRepository, "getTextPaginationCache" | "saveTextPaginationCache">;
  settings: ReaderSettings;
  onLocatorChange(locator: ReaderLocator): void;
  onChapterTitleChange(title: string): void;
  onExcerptChange(excerpt: string): void;
  onSelection(selection: SelectionDraft): void;
  tocOpen: boolean;
  onTocOpenChange(open: boolean): void;
  searchOpen?: boolean;
  onSearchOpenChange?(open: boolean): void;
}

interface StageSize {
  width: number;
  height: number;
}

interface SearchableChapter {
  chapter: TextChapter;
  blocks: TextPageBlock[];
}

interface TextSearchResult {
  chapterId: string;
  chapterTitle: string;
  offset: number;
  before: string;
  match: string;
  after: string;
  prefixEllipsis: boolean;
  suffixEllipsis: boolean;
}

interface TextAnnotationHighlight {
  id: string;
  color: string;
  start: number;
  end: number;
}

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_CONTEXT_LENGTH = 10;
const SEARCH_FULL_PARAGRAPH_LIMIT = 80;
const SEARCH_RESULT_LIMIT = 200;

export function TextReader({
  annotations = [],
  bookId,
  file,
  initialLocator,
  layoutCache,
  settings,
  onLocatorChange,
  onChapterTitleChange,
  onExcerptChange,
  onSelection,
  tocOpen,
  onTocOpenChange,
  searchOpen = false,
  onSearchOpenChange
}: TextReaderProps) {
  const [loadedText, setLoadedText] = useState(file.textContent);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [pageIndex, setPageIndex] = useState(0);
  const [pages, setPages] = useState<TextPage[]>([]);
  const [isInitialPageSettled, setIsInitialPageSettled] = useState(false);
  const [pendingLastPage, setPendingLastPage] = useState(false);
  const [turnDirection, setTurnDirection] = useState<"next" | "prev">();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TextSearchResult[]>([]);
  const [hasSearchRun, setHasSearchRun] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const storedTextBlocks = useMemo<Map<string, TextPageBlock[]>>(
    () => new Map((file.textBlocks ?? []).map((chapterBlocks) => [chapterBlocks.chapterId, chapterBlocks.blocks])),
    [file.textBlocks]
  );

  const blocks = useMemo<TextPageBlock[]>(() => {
    if (!activeChapter) {
      return [];
    }

    const derivedBlocks = storedTextBlocks.get(activeChapter.id);

    return derivedBlocks ?? buildChapterBlocks(
      activeChapter,
      text.slice(activeChapter.start, activeChapter.end)
    );
  }, [activeChapter, storedTextBlocks, text]);

  const annotationHighlights = useMemo(
    () => activeChapter
      ? resolveTextAnnotationHighlights(annotations, activeChapter.id, blocks)
      : [],
    [activeChapter, annotations, blocks]
  );

  const searchableChapters = useMemo<SearchableChapter[]>(
    () => chapters.map((chapter) => ({
      chapter,
      blocks: storedTextBlocks.get(chapter.id) ?? buildChapterBlocks(
        chapter,
        text.slice(chapter.start, chapter.end)
      )
    })),
    [chapters, storedTextBlocks, text]
  );

  const trimmedSearchQuery = searchQuery.trim();
  const shouldShowSearchResults = trimmedSearchQuery.length > 0 && hasSearchRun;

  useEffect(() => {
    if (!activeChapterId && firstReadableChapter) {
      setActiveChapterId(firstReadableChapter.id);
    }
  }, [activeChapterId, firstReadableChapter]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [searchOpen]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setHasSearchRun(false);
      return;
    }

    setSearchResults([]);
    setHasSearchRun(false);

    const timeout = window.setTimeout(() => {
      setSearchResults(findTextSearchResults(searchableChapters, query));
      setHasSearchRun(true);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [searchQuery, searchableChapters]);

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

  const applyPages = useCallback((nextPages: TextPage[]) => {
    setPages(nextPages);
    setPageIndex((current) => {
      if (pendingLastPage) {
        return normalizePageStart(nextPages.length - 1, nextPages.length, pageMode);
      }

      if (
        !restoredInitialPage.current &&
        anchorLocatorRef.current &&
        anchorLocatorRef.current.chapterId === activeChapter?.id
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
  }, [activeChapter?.id, pageMode, pendingLastPage]);

  useEffect(() => {
    if (!stageReady || !activeChapter || blocks.length === 0 || paginationLayout.sheetWidth <= 0) {
      return;
    }

    let isActive = true;
    setIsInitialPageSettled(false);

    async function loadOrBuildPages() {
      const cached = await layoutCache
        .getTextPaginationCache(bookId, activeChapter!.id, paginationKey)
        .catch(() => undefined);

      if (!isActive) {
        return;
      }

      if (cached) {
        applyPages(cached.pages);
        return;
      }

      const nextPages = paginateTextBlocks(blocks, paginationLayout.sheetHeight, measureBlocks);
      const now = Date.now();
      applyPages(nextPages);
      void layoutCache.saveTextPaginationCache({
        bookId,
        chapterId: activeChapter!.id,
        fingerprint: paginationKey,
        pages: nextPages,
        createdAt: now,
        updatedAt: now
      });
    }

    void loadOrBuildPages();

    return () => {
      isActive = false;
    };
  }, [
    activeChapter,
    applyPages,
    blocks,
    bookId,
    layoutCache,
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

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearchRun(false);
    searchInputRef.current?.focus();
  };

  const selectSearchResult = (result: TextSearchResult) => {
    ignoreCurrentIncomingLocator();
    anchorLocatorRef.current = {
      chapterId: result.chapterId,
      offset: result.offset
    };
    setPendingLastPage(false);
    onTocOpenChange(false);
    onSearchOpenChange?.(false);

    if (activeChapter?.id === result.chapterId && pages.length > 0) {
      restoredInitialPage.current = true;
      setPageIndex(normalizePageStart(
        pageIndexForOffset(pages, result.offset),
        pages.length,
        pageMode
      ));
      setIsInitialPageSettled(true);
      return;
    }

    restoredInitialPage.current = false;
    setIsInitialPageSettled(false);
    setActiveChapterId(result.chapterId);
    setPageIndex(0);
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

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();

    const stage = stageRef.current;

    if (!stage || !activeChapter) {
      return;
    }

    const context = selectionContextFromContextMenuEvent(event.nativeEvent, stage);

    if (!context) {
      return;
    }

    const currentPage = pages[Math.min(pageIndex, pages.length - 1)];
    const offset = textOffsetInBlock(context.range.startContainer, context.range.startOffset) ??
      currentPage?.startOffset ??
      0;
    const draft: SelectionDraft = {
      text: context.text.slice(0, 600),
      locator: {
        kind: "txt",
        chapterId: activeChapter.id,
        offset,
        percentage: text.length === 0 ? 0 : (activeChapter.start + offset) / text.length
      }
    };

    void showReaderContextMenu({
      position: menuPositionFromContextMenuEvent(event.nativeEvent),
      onAddNote: () => onSelection(draft)
    });
  }, [activeChapter, onSelection, pageIndex, pages, text.length]);

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

      {searchOpen ? (
        <aside
          className={shouldShowSearchResults ? "reader-search-panel expanded" : "reader-search-panel"}
          aria-label="查找"
          data-reader-search-panel
          id="reader-search-panel"
        >
          <div className="reader-search-input-wrap">
            <input
              aria-label="查找"
              className="reader-search-input"
              placeholder="查找"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button
              aria-label="清空查找"
              className="reader-search-clear"
              disabled={!searchQuery}
              title="清空"
              type="button"
              onClick={clearSearch}
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          {shouldShowSearchResults ? (
            searchResults.length > 0 ? (
              <div className="reader-search-results">
                {searchResults.map((result, index) => (
                  <button
                    className="reader-search-result"
                    key={`${result.chapterId}-${result.offset}-${index}`}
                    title={result.chapterTitle}
                    type="button"
                    onClick={() => selectSearchResult(result)}
                  >
                    {renderSearchSnippet(result)}
                  </button>
                ))}
                {searchResults.length >= SEARCH_RESULT_LIMIT ? (
                  <p className="reader-search-note">仅显示前 {SEARCH_RESULT_LIMIT} 条结果</p>
                ) : null}
              </div>
            ) : (
              <p className="reader-search-empty">未找到匹配内容</p>
            )
          ) : null}
        </aside>
      ) : null}

      <section
        className="paginated-stage"
        ref={stageRef}
        style={{
          ...paginationCssVariables(paginationLayout, settings)
        } as CSSProperties}
        onContextMenu={handleContextMenu}
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
              {page.blocks.map((block, blockIndex) =>
                renderPageBlock(block, blockIndex, annotationHighlights)
              )}
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

  if (block.isContinuation) {
    element.dataset.continuation = "true";
  }

  if (block.continuesToNext) {
    element.dataset.continues = "true";
  }

  return element;
}

function renderPageBlock(
  block: TextPageBlock,
  index: number,
  annotationHighlights: TextAnnotationHighlight[]
) {
  const children = renderAnnotatedText(block, annotationHighlights);

  if (block.kind === "heading") {
    return (
      <h2
        data-reader-text-block-end={block.end}
        data-reader-text-block-start={block.start}
        key={`${block.start}-${index}`}
      >
        {children}
      </h2>
    );
  }

  return (
    <p
      data-continuation={block.isContinuation ? "true" : undefined}
      data-continues={block.continuesToNext ? "true" : undefined}
      data-reader-text-block-end={block.end}
      data-reader-text-block-start={block.start}
      key={`${block.start}-${index}`}
    >
      {children}
    </p>
  );
}

function renderAnnotatedText(
  block: TextPageBlock,
  annotationHighlights: TextAnnotationHighlight[]
) {
  const blockHighlights = annotationHighlights.filter(
    (highlight) => highlight.start < block.end && highlight.end > block.start
  );

  if (blockHighlights.length === 0) {
    return block.text;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  for (const highlight of blockHighlights) {
    const start = Math.max(0, highlight.start - block.start);
    const end = Math.min(block.text.length, highlight.end - block.start);

    if (start < cursor || end <= start) {
      continue;
    }

    if (start > cursor) {
      segments.push(block.text.slice(cursor, start));
    }

    segments.push(
      <mark
        className="text-annotation-highlight"
        data-annotation-id={highlight.id}
        key={`${highlight.id}-${highlight.start}-${highlight.end}`}
        style={{ backgroundColor: highlight.color }}
      >
        {block.text.slice(start, end)}
      </mark>
    );
    cursor = end;
  }

  if (cursor < block.text.length) {
    segments.push(block.text.slice(cursor));
  }

  return segments;
}

function resolveTextAnnotationHighlights(
  annotations: Annotation[],
  chapterId: string,
  blocks: TextPageBlock[]
): TextAnnotationHighlight[] {
  const highlights = annotations
    .filter((annotation) => annotation.locator.kind === "txt" && annotation.locator.chapterId === chapterId)
    .map((annotation) => {
      if (annotation.locator.kind !== "txt") {
        return undefined;
      }

      const match = findTextAnnotationMatch(blocks, annotation.text.trim(), annotation.locator.offset);

      if (!match) {
        return undefined;
      }

      return {
        id: annotation.id,
        color: annotation.color,
        start: match.start,
        end: match.end
      };
    })
    .filter((highlight): highlight is TextAnnotationHighlight => Boolean(highlight))
    .sort((left, right) => left.start - right.start || right.end - left.end);

  const resolved: TextAnnotationHighlight[] = [];
  let occupiedUntil = -1;

  for (const highlight of highlights) {
    if (highlight.start < occupiedUntil) {
      continue;
    }

    resolved.push(highlight);
    occupiedUntil = highlight.end;
  }

  return resolved;
}

function findTextAnnotationMatch(
  blocks: TextPageBlock[],
  text: string,
  anchorOffset: number
): { start: number; end: number } | undefined {
  if (text.length === 0) {
    return undefined;
  }

  let bestMatch: { start: number; end: number; distance: number } | undefined;

  for (const block of blocks) {
    let fromIndex = 0;

    while (fromIndex < block.text.length) {
      const matchIndex = block.text.indexOf(text, fromIndex);

      if (matchIndex === -1) {
        break;
      }

      const start = block.start + matchIndex;
      const distance = start >= anchorOffset
        ? start - anchorOffset
        : anchorOffset - start + text.length;

      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = {
          start,
          end: start + text.length,
          distance
        };
      }

      fromIndex = matchIndex + Math.max(text.length, 1);
    }
  }

  return bestMatch ? { start: bestMatch.start, end: bestMatch.end } : undefined;
}

function renderSearchSnippet(result: TextSearchResult) {
  return (
    <span className="reader-search-snippet">
      {result.prefixEllipsis ? "..." : ""}
      {result.before}
      <mark>{result.match}</mark>
      {result.after}
      {result.suffixEllipsis ? "..." : ""}
    </span>
  );
}

function findTextSearchResults(chapters: SearchableChapter[], query: string): TextSearchResult[] {
  const results: TextSearchResult[] = [];

  for (const { chapter, blocks } of chapters) {
    for (const block of blocks) {
      if (block.kind !== "paragraph") {
        continue;
      }

      let fromIndex = 0;

      while (results.length < SEARCH_RESULT_LIMIT) {
        const matchIndex = block.text.indexOf(query, fromIndex);

        if (matchIndex === -1) {
          break;
        }

        const useFullParagraph = block.text.length <= SEARCH_FULL_PARAGRAPH_LIMIT;
        const snippetStart = useFullParagraph
          ? 0
          : Math.max(0, matchIndex - SEARCH_CONTEXT_LENGTH);
        const snippetEnd = useFullParagraph
          ? block.text.length
          : Math.min(block.text.length, matchIndex + query.length + SEARCH_CONTEXT_LENGTH);

        results.push({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          offset: block.start + matchIndex,
          before: block.text.slice(snippetStart, matchIndex),
          match: block.text.slice(matchIndex, matchIndex + query.length),
          after: block.text.slice(matchIndex + query.length, snippetEnd),
          prefixEllipsis: snippetStart > 0,
          suffixEllipsis: snippetEnd < block.text.length
        });

        fromIndex = matchIndex + Math.max(query.length, 1);
      }

      if (results.length >= SEARCH_RESULT_LIMIT) {
        return results;
      }
    }
  }

  return results;
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
