import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../../../domain/types";
import { BookmarkMenu } from "./BookmarkMenu";

describe("BookmarkMenu", () => {
  it("selects an existing bookmark from the popover", () => {
    const bookmark = makeBookmark();
    const onSelectBookmark = vi.fn();

    render(
      <BookmarkMenu
        bookmarks={[bookmark]}
        isOpen
        onAddBookmark={async () => undefined}
        onOpenChange={() => undefined}
        onRemoveBookmark={async () => undefined}
        onSelectBookmark={onSelectBookmark}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /第一章/ }));

    expect(onSelectBookmark).toHaveBeenCalledWith(bookmark);
  });

  it("does not select a bookmark when deleting it", () => {
    const bookmark = makeBookmark();
    const onRemoveBookmark = vi.fn();
    const onSelectBookmark = vi.fn();

    render(
      <BookmarkMenu
        bookmarks={[bookmark]}
        isOpen
        onAddBookmark={async () => undefined}
        onOpenChange={() => undefined}
        onRemoveBookmark={onRemoveBookmark}
        onSelectBookmark={onSelectBookmark}
      />
    );

    fireEvent.click(screen.getByTitle("删除书签"));

    expect(onRemoveBookmark).toHaveBeenCalledWith(bookmark.id);
    expect(onSelectBookmark).not.toHaveBeenCalled();
  });
});

function makeBookmark(): Bookmark {
  return {
    id: "bookmark-1",
    bookId: "book-1",
    label: "第一章",
    locator: {
      kind: "txt",
      chapterId: "chapter-1",
      offset: 42,
      percentage: 0.2
    },
    createdAt: 1_234
  };
}
