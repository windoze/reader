import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderLocator, ReaderSettings, StoredBookFile, TextChapter } from "../../../domain/types";
import { TextReader } from "./TextReader";

const settings: ReaderSettings = {
  theme: "light",
  fontFamily: "system",
  fontSize: 18,
  lineHeight: 1.7,
  paragraphSpacing: 1,
  contentWidth: 640,
  controlsAutoHideDelay: 3,
  replaceEpubCss: true
};

const emptyLayoutCache = {
  getTextPaginationCache: vi.fn().mockResolvedValue(undefined),
  saveTextPaginationCache: vi.fn().mockResolvedValue(undefined)
};

describe("TextReader pagination", () => {
  beforeEach(() => {
    emptyLayoutCache.getTextPaginationCache.mockReset();
    emptyLayoutCache.getTextPaginationCache.mockResolvedValue(undefined);
    emptyLayoutCache.saveTextPaginationCache.mockReset();
    emptyLayoutCache.saveTextPaginationCache.mockResolvedValue(undefined);

    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this instanceof HTMLElement && this.classList.contains("paginated-stage")) {
        return rect(760, 430);
      }

      return rect(0, 0);
    });

    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function () {
      if (!(this instanceof HTMLElement) || !this.classList.contains("text-page-measure")) {
        return 0;
      }

      const spacingValue = this.parentElement?.style.getPropertyValue("--paragraph-spacing") ?? "1em";
      const parsedSpacing = Number.parseFloat(spacingValue);
      const paragraphSpacing = Number.isFinite(parsedSpacing) ? parsedSpacing : 1;

      return Array.from(this.children).reduce((height, child) => {
        if (child.tagName === "H2") {
          return height + 80;
        }

        const textLength = child.textContent?.length ?? 0;
        return height + Math.max(42, Math.ceil(textLength / 26) * 42) + paragraphSpacing * 44;
      }, 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the previous chapter on its final page when paging backward across chapters", async () => {
    const { file } = makeBookFile();
    const locators: ReaderLocator[] = [];

    render(
      <TextReader
        bookId="book-1"
        file={file}
        initialLocator={{
          kind: "txt",
          chapterId: "chapter-2",
          offset: 0,
          percentage: 0.7
        }}
        layoutCache={emptyLayoutCache}
        settings={settings}
        tocOpen={false}
        onChapterTitleChange={() => undefined}
        onExcerptChange={() => undefined}
        onLocatorChange={(locator) => locators.push(locator)}
        onSelection={() => undefined}
        onTocOpenChange={() => undefined}
      />
    );

    await screen.findByRole("heading", { name: "第二章" });
    await waitFor(() =>
      expect(locators.some((locator) => locator.kind === "txt" && locator.chapterId === "chapter-2")).toBe(true)
    );

    fireEvent.click(screen.getByTitle("上一页"));

    await waitFor(() => expect(screen.getAllByText(/第一章末页段落/).length).toBeGreaterThan(0));
    await waitFor(() => {
      const lastLocator = locators.at(-1);

      expect(lastLocator).toMatchObject({
        kind: "txt",
        chapterId: "chapter-1"
      });
      expect(lastLocator?.kind === "txt" ? lastLocator.offset : 0).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("heading", { name: "第二章" })).not.toBeInTheDocument();
  });

  it("repaginates when paragraph spacing changes", async () => {
    const file = makeSpacingBookFile();
    const baseProps = {
      bookId: "book-spacing",
      file,
      initialLocator: {
        kind: "txt" as const,
        chapterId: "chapter-1",
        offset: 0,
        percentage: 0
      },
      layoutCache: emptyLayoutCache,
      tocOpen: false,
      onChapterTitleChange: () => undefined,
      onExcerptChange: () => undefined,
      onLocatorChange: () => undefined,
      onSelection: () => undefined,
      onTocOpenChange: () => undefined
    };
    const { rerender } = render(
      <TextReader {...baseProps} settings={{ ...settings, paragraphSpacing: 0 }} />
    );

    await screen.findByRole("heading", { name: "第一章" });
    await waitFor(() => expect(pageTotal()).toBe(1));
    expect(emptyLayoutCache.saveTextPaginationCache).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-spacing",
        chapterId: "chapter-1"
      })
    );

    rerender(<TextReader {...baseProps} settings={{ ...settings, paragraphSpacing: 2 }} />);

    await waitFor(() => expect(pageTotal()).toBeGreaterThan(1));
  });
});

function makeBookFile(): { file: StoredBookFile; chapters: TextChapter[] } {
  const chapterOneParagraphs = [
    "第一章首页段落一，文字足够长，用来占据第一页的主要空间。",
    "第一章首页段落二，继续增加测量高度，确保章节会被切成多页。",
    "第一章中间段落三，仍然属于前半部分。",
    "第一章末页段落四，这是跨章向前翻页后应该看到的内容。",
    "第一章末页段落五，用来确认定位稳定在上一章末尾。"
  ];
  const chapterOne = `第一章\n${chapterOneParagraphs.join("\n\n")}`;
  const chapterTwo = "第二章\n第二章正文第一页。";
  const text = `${chapterOne}\n\n${chapterTwo}`;
  const chapterTwoStart = chapterOne.length + 2;
  const chapters: TextChapter[] = [
    {
      id: "chapter-1",
      title: "第一章",
      start: 0,
      end: chapterOne.length,
      level: 1
    },
    {
      id: "chapter-2",
      title: "第二章",
      start: chapterTwoStart,
      end: text.length,
      level: 1
    }
  ];

  return {
    chapters,
    file: {
      bookId: "book-1",
      blob: new Blob([text], { type: "text/plain" }),
      chapters,
      textContent: text
    }
  };
}

function makeSpacingBookFile(): StoredBookFile {
  const paragraphs = Array.from(
    { length: 6 },
    (_, index) => `用于测试段间距重排的短段落 ${index + 1}。`
  );
  const text = `第一章\n${paragraphs.join("\n\n")}`;

  return {
    bookId: "book-spacing",
    blob: new Blob([text], { type: "text/plain" }),
    chapters: [
      {
        id: "chapter-1",
        title: "第一章",
        start: 0,
        end: text.length,
        level: 1
      }
    ],
    textContent: text
  };
}

function pageTotal(): number {
  const text = document.querySelector(".page-indicator")?.textContent ?? "";
  return Number(text.match(/\/\s*(\d+)/)?.[1] ?? 0);
}

function rect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({})
  };
}
