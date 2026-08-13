import { ArrowLeft, Highlighter, ListTree, Settings } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type {
  Annotation,
  BookRecord,
  Bookmark,
  ReaderLocator,
  ReaderSettings,
  StoredBookFile
} from "../../domain/types";
import { createId } from "../../lib/id";
import type { LibraryRepository } from "../../services/libraryRepository";
import { locatorFromRoute, parseAppRoute, routeKey, type ReaderRouteLocator } from "../../lib/routes";
import { AnnotationPanel } from "./annotations/AnnotationPanel";
import { SelectionAnnotator, type SelectionDraft } from "./annotations/SelectionAnnotator";
import { BookmarkMenu } from "./bookmarks/BookmarkMenu";
import { ReaderSettingsPanel } from "./settings/ReaderSettingsPanel";

const TextReader = lazy(async () => ({
  default: (await import("./formats/TextReader")).TextReader
}));
const PdfReader = lazy(async () => ({
  default: (await import("./formats/PdfReader")).PdfReader
}));
const EpubReader = lazy(async () => ({
  default: (await import("./formats/EpubReader")).EpubReader
}));

const BOOT_HASH = typeof window === "undefined" ? "" : window.location.hash;

interface ReaderViewProps {
  book: BookRecord;
  repository: LibraryRepository;
  routeLocator?: ReaderRouteLocator;
  onLocatorUrlChange(locator: ReaderLocator): void;
  onClose(): void;
}

export function ReaderView({
  book,
  repository,
  routeLocator,
  onLocatorUrlChange,
  onClose
}: ReaderViewProps) {
  const bootRouteLocator = useRef<ReaderRouteLocator | undefined>(routeLocatorFromHash(book, BOOT_HASH));
  const [hasConsumedBootRoute, setHasConsumedBootRoute] = useState(false);
  const effectiveRouteLocator =
    (!hasConsumedBootRoute ? bootRouteLocator.current : undefined) ??
    routeLocator ??
    routeLocatorFromHash(book);
  const [file, setFile] = useState<StoredBookFile>();
  const [settings, setSettings] = useState<ReaderSettings>();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [locator, setLocator] = useState<ReaderLocator>();
  const [chapterTitle, setChapterTitle] = useState<string>();
  const [excerpt, setExcerpt] = useState<string>();
  const [selection, setSelection] = useState<SelectionDraft>();
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [error, setError] = useState<string>();
  const contentRef = useRef<HTMLDivElement>(null);
  const tocButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const annotationsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const annotationsPanelRef = useRef<HTMLDivElement>(null);
  const routeLocatorKey = routeKey(effectiveRouteLocator);
  const latestRouteLocator = useRef(effectiveRouteLocator);
  const hasToc = book.format === "txt" || book.format === "epub";

  useEffect(() => {
    latestRouteLocator.current = effectiveRouteLocator;
  }, [effectiveRouteLocator, routeLocatorKey]);

  useEffect(() => {
    bootRouteLocator.current = routeLocatorFromHash(book, BOOT_HASH);
    setHasConsumedBootRoute(false);
    let isMounted = true;
    setFile(undefined);
    setSettings(undefined);
    setLocator(undefined);
    setShowBookmarks(false);
    setShowSettings(false);
    setShowAnnotations(false);
    setTocOpen(false);
    setError(undefined);

    async function load() {
      try {
        const [storedFile, loadedSettings, loadedBookmarks, loadedAnnotations, progress] =
          await Promise.all([
            repository.getBookFile(book.id),
            repository.getSettings(),
            repository.listBookmarks(book.id),
            repository.listAnnotations(book.id),
            repository.getProgress(book.id)
          ]);

        if (!isMounted) {
          return;
        }

        setFile(storedFile);
        setSettings(loadedSettings);
        setBookmarks(loadedBookmarks);
        setAnnotations(loadedAnnotations);
        setLocator(
          (current) =>
            current ??
            locatorFromRoute(book.format, latestRouteLocator.current) ??
            progress?.locator ??
            defaultLocator(book.format)
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "读取图书失败");
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [book.format, book.id, repository]);

  useEffect(() => {
    const nextLocator = locatorFromRoute(book.format, effectiveRouteLocator);

    if (!nextLocator) {
      return;
    }

    setLocator((current) => (sameReaderLocator(current, nextLocator) ? current : nextLocator));
  }, [book.format, effectiveRouteLocator, routeLocatorKey]);

  useEffect(() => {
    if (!tocOpen && !showBookmarks && !showSettings && !showAnnotations) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      const tocPanel = document.querySelector("[data-reader-toc-panel]");
      const bookmarkMenu = document.querySelector("[data-reader-bookmark-menu]");

      if (tocOpen && !tocPanel?.contains(target) && !tocButtonRef.current?.contains(target)) {
        setTocOpen(false);
      }

      if (showBookmarks && !bookmarkMenu?.contains(target)) {
        setShowBookmarks(false);
      }

      if (
        showSettings &&
        !settingsPanelRef.current?.contains(target) &&
        !settingsButtonRef.current?.contains(target)
      ) {
        setShowSettings(false);
      }

      if (
        showAnnotations &&
        !annotationsPanelRef.current?.contains(target) &&
        !annotationsButtonRef.current?.contains(target)
      ) {
        setShowAnnotations(false);
      }
    };

    const handleWindowBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) {
          setTocOpen(false);
          setShowBookmarks(false);
          setShowSettings(false);
          setShowAnnotations(false);
        }
      }, 0);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [showAnnotations, showBookmarks, showSettings, tocOpen]);

  const persistLocator = useCallback(
    (nextLocator: ReaderLocator) => {
      const bootLocator = !hasConsumedBootRoute
        ? locatorFromRoute(book.format, bootRouteLocator.current)
        : undefined;

      if (bootLocator && !sameReaderLocator(nextLocator, bootLocator)) {
        setLocator(bootLocator);
        return;
      }

      setHasConsumedBootRoute(true);
      setLocator(nextLocator);
      onLocatorUrlChange(nextLocator);
      void repository.saveProgress({
        bookId: book.id,
        locator: nextLocator,
        updatedAt: Date.now()
      });
    },
    [book.format, book.id, hasConsumedBootRoute, onLocatorUrlChange, repository]
  );

  const handleSettingsChange = useCallback(
    (nextSettings: ReaderSettings) => {
      setSettings(nextSettings);
      void repository.saveSettings(nextSettings);
    },
    [repository]
  );

  const handleAddBookmark = useCallback(async () => {
    if (!locator) {
      return;
    }

    const bookmark: Bookmark = {
      id: createId("bookmark"),
      bookId: book.id,
      label: chapterTitle ?? bookmarkLabel(locator),
      locator,
      chapterTitle,
      excerpt,
      createdAt: Date.now()
    };

    await repository.addBookmark(bookmark);
    setBookmarks(await repository.listBookmarks(book.id));
  }, [book.id, chapterTitle, excerpt, locator, repository]);

  const handleRemoveBookmark = useCallback(
    async (bookmarkId: string) => {
      await repository.removeBookmark(bookmarkId);
      setBookmarks(await repository.listBookmarks(book.id));
    },
    [book.id, repository]
  );

  const handleSelectBookmark = useCallback(
    (bookmark: Bookmark) => {
      setHasConsumedBootRoute(true);
      setShowBookmarks(false);
      setShowAnnotations(false);
      setShowSettings(false);
      setTocOpen(false);
      setLocator(bookmark.locator);
      onLocatorUrlChange(bookmark.locator);
      void repository.saveProgress({
        bookId: book.id,
        locator: bookmark.locator,
        updatedAt: Date.now()
      });
    },
    [book.id, onLocatorUrlChange, repository]
  );

  const handleAddAnnotation = useCallback(
    async (draft: SelectionDraft, note: string, color: string) => {
      const annotationLocator = draft.locator ?? locator;

      if (!annotationLocator) {
        return;
      }

      const annotation: Annotation = {
        id: createId("annotation"),
        bookId: book.id,
        text: draft.text,
        note,
        color,
        locator: annotationLocator,
        chapterTitle,
        createdAt: Date.now()
      };

      await repository.addAnnotation(annotation);
      setAnnotations(await repository.listAnnotations(book.id));
      setSelection(undefined);
    },
    [book.id, chapterTitle, locator, repository]
  );

  const handleRemoveAnnotation = useCallback(
    async (annotationId: string) => {
      await repository.removeAnnotation(annotationId);
      setAnnotations(await repository.listAnnotations(book.id));
    },
    [book.id, repository]
  );

  if (!file || !settings || !locator) {
    return (
      <main className="reader-shell loading">
        <p>{error ?? "正在打开图书..."}</p>
        <button className="secondary-button" type="button" onClick={onClose}>
          返回书架
        </button>
      </main>
    );
  }

  return (
    <main className={`reader-shell theme-${settings.theme}`}>
      <div className="reader-top-title" title={book.title}>
        {book.title}
      </div>

      <div className="reader-floating-tools reader-tools-left">
        <button className="icon-button" title="返回书架" type="button" onClick={onClose}>
          <ArrowLeft size={20} aria-hidden />
        </button>
        {hasToc ? (
          <button
            className={tocOpen ? "icon-button active" : "icon-button"}
            aria-controls="reader-toc-panel"
            aria-expanded={tocOpen}
            ref={tocButtonRef}
            title="目录"
            type="button"
            onClick={() => {
              setShowAnnotations(false);
              setShowBookmarks(false);
              setShowSettings(false);
              setTocOpen((value) => !value);
            }}
          >
            <ListTree size={20} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="reader-floating-tools reader-tools-right">
        <BookmarkMenu
          bookmarks={bookmarks}
          isOpen={showBookmarks}
          onAddBookmark={handleAddBookmark}
          onOpenChange={(open) => {
            setShowBookmarks(open);

            if (open) {
              setShowAnnotations(false);
              setShowSettings(false);
              setTocOpen(false);
            }
          }}
          onRemoveBookmark={handleRemoveBookmark}
          onSelectBookmark={handleSelectBookmark}
        />
        <button
          aria-controls="reader-annotations-panel"
          aria-expanded={showAnnotations}
          className={showAnnotations ? "icon-button active" : "icon-button"}
          ref={annotationsButtonRef}
          title="注解"
          type="button"
          onClick={() => {
            setShowBookmarks(false);
            setShowSettings(false);
            setTocOpen(false);
            setShowAnnotations((value) => !value);
          }}
        >
          <Highlighter size={20} aria-hidden />
        </button>
        <button
          aria-controls="reader-settings-panel"
          aria-expanded={showSettings}
          className={showSettings ? "icon-button active" : "icon-button"}
          ref={settingsButtonRef}
          title="阅读设置"
          type="button"
          onClick={() => {
            setShowAnnotations(false);
            setShowBookmarks(false);
            setTocOpen(false);
            setShowSettings((value) => !value);
          }}
        >
          <Settings size={20} aria-hidden />
        </button>
      </div>

      <section className="reader-workspace">
        <div className="reader-content" ref={contentRef}>
          <Suspense fallback={<p className="reader-loading">正在准备阅读器...</p>}>
            {book.format === "txt" ? (
              <TextReader
                bookId={book.id}
                file={file}
                initialLocator={locator}
                layoutCache={repository}
                settings={settings}
                onChapterTitleChange={setChapterTitle}
                onExcerptChange={setExcerpt}
                onLocatorChange={persistLocator}
                onSelection={setSelection}
                tocOpen={tocOpen}
                onTocOpenChange={setTocOpen}
              />
            ) : null}
            {book.format === "pdf" ? (
              <PdfReader
                file={file}
                initialLocator={locator}
                settings={settings}
                onExcerptChange={setExcerpt}
                onLocatorChange={persistLocator}
                onSelection={setSelection}
              />
            ) : null}
            {book.format === "epub" ? (
              <EpubReader
                file={file}
                initialLocator={locator}
                settings={settings}
                onChapterTitleChange={setChapterTitle}
                onLocatorChange={persistLocator}
                onSelection={setSelection}
                tocOpen={tocOpen}
                onTocOpenChange={setTocOpen}
              />
            ) : null}
          </Suspense>
        </div>
      </section>

      {showSettings ? (
        <div
          className="reader-floating-panel settings-float"
          data-reader-settings-panel
          id="reader-settings-panel"
          ref={settingsPanelRef}
        >
          <ReaderSettingsPanel settings={settings} onChange={handleSettingsChange} />
        </div>
      ) : null}

      {showAnnotations ? (
        <div
          className="reader-floating-panel annotations-float"
          data-reader-annotations-panel
          id="reader-annotations-panel"
          ref={annotationsPanelRef}
        >
          <AnnotationPanel annotations={annotations} onRemove={handleRemoveAnnotation} />
        </div>
      ) : null}

      {selection ? (
        <SelectionAnnotator
          draft={selection}
          onCancel={() => setSelection(undefined)}
          onSave={handleAddAnnotation}
        />
      ) : null}

    </main>
  );
}

function defaultLocator(format: BookRecord["format"]): ReaderLocator {
  if (format === "pdf") {
    return { kind: "pdf", page: 1, percentage: 0 };
  }

  if (format === "epub") {
    return { kind: "epub", cfi: "" };
  }

  return { kind: "txt", chapterId: "", offset: 0, percentage: 0 };
}

function routeLocatorFromHash(book: BookRecord, hash = window.location.hash): ReaderRouteLocator | undefined {
  if (!hash.startsWith("#/")) {
    return undefined;
  }

  const route = parseAppRoute(hash.slice(1));
  return route.view === "reader" && route.bookId === book.id ? route.locator : undefined;
}

function bookmarkLabel(locator: ReaderLocator): string {
  if (locator.kind === "pdf") {
    return `第 ${locator.page} 页`;
  }

  if (locator.kind === "epub") {
    return typeof locator.offset === "number" ? `位置 ${locator.offset}` : "当前位置";
  }

  return `进度 ${Math.round(locator.percentage * 100)}%`;
}

function sameReaderLocator(left: ReaderLocator | undefined, right: ReaderLocator): boolean {
  if (!left || left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "pdf" && right.kind === "pdf") {
    return left.page === right.page;
  }

  if (left.kind === "txt" && right.kind === "txt") {
    return left.chapterId === right.chapterId && left.offset === right.offset;
  }

  if (left.kind === "epub" && right.kind === "epub") {
    return (
      left.cfi === right.cfi &&
      left.chapterId === right.chapterId &&
      (left.offset ?? 0) === (right.offset ?? 0)
    );
  }

  return false;
}
