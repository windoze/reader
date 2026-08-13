import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDocument, TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import type { ReaderLocator, ReaderSettings, StoredBookFile } from "../../../domain/types";
import { shouldHandleReaderNavigationKey } from "../../../lib/keyboard";
import { ensurePdfWorker } from "../../../services/pdfWorker";
import type { SelectionDraft } from "../annotations/SelectionAnnotator";
import { READER_NAVIGATION_EVENT, type ReaderNavigationDirection } from "../readerGestures";

interface PdfReaderProps {
  file: StoredBookFile;
  initialLocator: ReaderLocator;
  settings: ReaderSettings;
  onLocatorChange(locator: ReaderLocator): void;
  onExcerptChange(excerpt: string): void;
  onSelection(selection: SelectionDraft): void;
}

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  maxHeight: number;
  maxWidth: number;
  onExcerptChange?: (excerpt: string) => void;
}

interface StageSize {
  width: number;
  height: number;
}

const PAGE_GAP = 24;
const PAGE_SURFACE_PADDING = 0;

export function PdfReader({
  file,
  initialLocator,
  onLocatorChange,
  onExcerptChange,
  onSelection
}: PdfReaderProps) {
  const initialPage = initialLocator.kind === "pdf" ? normalizePdfPage(initialLocator.page) : 1;
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [turnDirection, setTurnDirection] = useState<"next" | "prev">();
  const [error, setError] = useState<string>();
  const stageRef = useRef<HTMLDivElement>(null);
  const appliedIncomingPage = useRef(initialPage);
  const reportedInternalPages = useRef<Set<number>>(new Set());
  const lastReportedPage = useRef<number | undefined>(undefined);

  const pageMode = stageSize.width >= 900 ? 2 : 1;
  const incomingPdfPage = initialLocator.kind === "pdf" ? initialLocator.page : undefined;
  const pageBounds = useMemo(() => {
    const width = stageSize.width || 900;
    const height = stageSize.height || 700;
    const outerPadding = width < 620 ? 12 : 24;
    const controlsAndMargins = width < 620 ? 30 : 42;
    const availableWidth = Math.max(280, width - outerPadding);
    const availableHeight = Math.max(300, height - controlsAndMargins);
    const slotWidth = pageMode === 2
      ? Math.floor((availableWidth - PAGE_GAP) / 2)
      : availableWidth;

    return {
      maxWidth: Math.max(220, Math.floor(slotWidth - PAGE_SURFACE_PADDING * 2)),
      maxHeight: Math.max(260, Math.floor(availableHeight - PAGE_SURFACE_PADDING * 2))
    };
  }, [pageMode, stageSize.height, stageSize.width]);

  const visiblePages = useMemo(() => {
    if (!pdf) {
      return [];
    }

    return Array.from({ length: pageMode }, (_, index) => pageNumber + index)
      .filter((page) => page <= pdf.numPages);
  }, [pageMode, pageNumber, pdf]);

  const canGoPrevious = pageNumber > 1;
  const canGoNext = pdf ? pageNumber + pageMode <= pdf.numPages : false;

  const goPrevious = useCallback(() => {
    setPageNumber((page) => {
      const nextPage = Math.max(1, page - pageMode);

      if (nextPage !== page) {
        setTurnDirection("prev");
      }

      return nextPage;
    });
  }, [pageMode]);

  const goNext = useCallback(() => {
    setPageNumber((page) => {
      const nextPage = pdf ? Math.min(pdf.numPages, page + pageMode) : page;

      if (nextPage !== page && page + pageMode <= (pdf?.numPages ?? page)) {
        setTurnDirection("next");
        return nextPage;
      }

      return page;
    });
  }, [pageMode, pdf]);

  useEffect(() => {
    ensurePdfWorker();
    let cancelled = false;

    file.blob
      .arrayBuffer()
      .then((buffer) => getDocument({ data: new Uint8Array(buffer) }).promise)
      .then((document) => {
        if (!cancelled) {
          setPdf(document);
        }
      })
      .catch(() => setError("PDF 打开失败"));

    return () => {
      cancelled = true;
    };
  }, [file.blob]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({
        width: rect.width,
        height: rect.height
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => {
    if (typeof incomingPdfPage !== "number" || !pdf) {
      return;
    }

    const nextPage = normalizePdfPage(incomingPdfPage, pdf.numPages);

    if (appliedIncomingPage.current === nextPage) {
      reportedInternalPages.current.delete(nextPage);
      return;
    }

    appliedIncomingPage.current = nextPage;

    if (reportedInternalPages.current.delete(nextPage)) {
      return;
    }

    setPageNumber((currentPage) => (currentPage === nextPage ? currentPage : nextPage));
  }, [incomingPdfPage, pdf]);

  useEffect(() => {
    if (!turnDirection) {
      return;
    }

    const timeout = window.setTimeout(() => setTurnDirection(undefined), 320);
    return () => window.clearTimeout(timeout);
  }, [turnDirection]);

  useEffect(() => {
    if (!pdf) {
      return;
    }

    if (lastReportedPage.current === pageNumber) {
      return;
    }

    if (pageNumber !== appliedIncomingPage.current) {
      reportedInternalPages.current.add(pageNumber);
    }

    if (reportedInternalPages.current.size > 6) {
      const oldestPage = reportedInternalPages.current.values().next().value;

      if (typeof oldestPage === "number") {
        reportedInternalPages.current.delete(oldestPage);
      }
    }

    lastReportedPage.current = pageNumber;
    appliedIncomingPage.current = pageNumber;
    onLocatorChange({
      kind: "pdf",
      page: pageNumber,
      percentage: pdf.numPages === 0 ? 0 : (pageNumber - 1) / pdf.numPages
    });
  }, [onLocatorChange, pageNumber, pdf]);

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

      const selectionPage = pageNumberFromNode(selection.anchorNode) ?? pageNumber;

      onSelection({
        text: selectedText.slice(0, 600),
        locator: {
          kind: "pdf",
          page: selectionPage,
          percentage: pdf?.numPages ? (selectionPage - 1) / pdf.numPages : 0
        }
      });
    };

    stage.addEventListener("mouseup", handleSelection);
    stage.addEventListener("keyup", handleSelection);

    return () => {
      stage.removeEventListener("mouseup", handleSelection);
      stage.removeEventListener("keyup", handleSelection);
    };
  }, [onSelection, pageNumber, pdf?.numPages]);

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

  if (error) {
    return <p className="reader-loading">{error}</p>;
  }

  if (!pdf) {
    return <p className="reader-loading">正在打开 PDF...</p>;
  }

  return (
    <div className="pdf-reader" ref={stageRef}>
      <div className={`pdf-spread pages-${pageMode}${turnDirection ? ` turn-${turnDirection}` : ""}`}>
        {visiblePages.map((visiblePage, index) => (
          <PdfPageCanvas
            key={visiblePage}
            maxHeight={pageBounds.maxHeight}
            maxWidth={pageBounds.maxWidth}
            pageNumber={visiblePage}
            pdf={pdf}
            onExcerptChange={index === 0 ? onExcerptChange : undefined}
          />
        ))}
      </div>

      <div className="page-indicator">{pageNumber} / {pdf.numPages}</div>

      <button
        className="page-turn-zone previous"
        disabled={!canGoPrevious}
        title="上一页"
        type="button"
        onClick={goPrevious}
      >
        <ChevronLeft size={24} aria-hidden />
      </button>
      <button
        className="page-turn-zone next"
        disabled={!canGoNext}
        title="下一页"
        type="button"
        onClick={goNext}
      >
        <ChevronRight size={24} aria-hidden />
      </button>
    </div>
  );
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  maxHeight,
  maxWidth,
  onExcerptChange
}: PdfPageCanvasProps) {
  const [renderError, setRenderError] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerTaskRef = useRef<TextLayer | null>(null);
  const renderSequence = useRef(0);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const textLayerContainer = textLayerRef.current;

    if (!canvasElement || !textLayerContainer || maxHeight <= 0 || maxWidth <= 0) {
      return;
    }

    let cancelled = false;
    const renderId = renderSequence.current + 1;
    renderSequence.current = renderId;

    async function renderPage(canvasElement: HTMLCanvasElement, textLayerContainer: HTMLDivElement) {
      setRenderError(undefined);
      renderTaskRef.current?.cancel();
      textLayerTaskRef.current?.cancel();
      textLayerContainer.replaceChildren();

      const page = await pdf.getPage(pageNumber);

      if (cancelled || renderSequence.current !== renderId) {
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height);
      const scale = Math.max(0.05, fitScale);
      const viewport = page.getViewport({ scale });
      const context = canvasElement.getContext("2d");

      if (!context || cancelled) {
        return;
      }

      const deviceScale = window.devicePixelRatio || 1;
      canvasElement.width = Math.floor(viewport.width * deviceScale);
      canvasElement.height = Math.floor(viewport.height * deviceScale);
      canvasElement.style.width = `${viewport.width}px`;
      canvasElement.style.height = `${viewport.height}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);

      textLayerContainer.style.width = `${viewport.width}px`;
      textLayerContainer.style.height = `${viewport.height}px`;

      const renderTask = page.render({
        canvas: canvasElement,
        viewport,
        transform: deviceScale === 1 ? undefined : [deviceScale, 0, 0, deviceScale, 0, 0]
      });
      renderTaskRef.current = renderTask;
      await renderTask.promise;

      if (cancelled || renderSequence.current !== renderId) {
        return;
      }

      const textContent = await page.getTextContent();

      if (cancelled || renderSequence.current !== renderId) {
        return;
      }

      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textLayerContainer,
        viewport
      });
      textLayerTaskRef.current = textLayer;
      await textLayer.render();

      if (cancelled || renderSequence.current !== renderId) {
        return;
      }

      onExcerptChange?.(textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ").slice(0, 120));
    }

    void renderPage(canvasElement, textLayerContainer).catch((renderError: unknown) => {
      if (!cancelled && !isPdfRenderCancelled(renderError)) {
        setRenderError("PDF 页面渲染失败");
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      textLayerTaskRef.current?.cancel();
    };
  }, [maxHeight, maxWidth, onExcerptChange, pageNumber, pdf]);

  return (
    <article className="reader-surface pdf-page" data-page-number={pageNumber}>
      {renderError ? <p className="reader-loading">{renderError}</p> : null}
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textLayerRef} />
    </article>
  );
}

function pageNumberFromNode(node: Node | null): number | undefined {
  const element = node instanceof Element ? node : node?.parentElement;
  const pageElement = element?.closest<HTMLElement>(".pdf-page[data-page-number]");
  const pageNumber = Number(pageElement?.dataset.pageNumber);

  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : undefined;
}

function isPdfRenderCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function normalizePdfPage(page: number, totalPages = Number.POSITIVE_INFINITY): number {
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedTotal = Number.isFinite(totalPages) ? Math.max(1, Math.floor(totalPages)) : totalPages;

  return Math.min(normalizedPage, normalizedTotal);
}
