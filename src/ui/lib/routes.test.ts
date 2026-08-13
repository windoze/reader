import { describe, expect, it } from "vitest";
import { locatorFromRoute, parseAppRoute, routeForGroup, routeForLocator } from "./routes";

describe("reader routes", () => {
  it("builds and parses group routes", () => {
    expect(routeForGroup("group_1")).toBe("/groups/group_1");
    expect(parseAppRoute("/groups/group_1")).toEqual({
      view: "library",
      groupId: "group_1"
    });
  });

  it("builds stable txt offset routes without page numbers", () => {
    const route = routeForLocator("book_1", {
      kind: "txt",
      chapterId: "chapter_12",
      offset: 345,
      percentage: 0.42
    });

    expect(route).toBe("/books/book_1/chapters/chapter_12/offset/345");
    expect(parseAppRoute(route)).toEqual({
      view: "reader",
      bookId: "book_1",
      locator: {
        chapterId: "chapter_12",
        offset: 345
      }
    });
  });

  it("keeps epub hrefs path-safe and stores CFI in the query string", () => {
    const route = routeForLocator("book_1", {
      kind: "epub",
      chapterId: "OEBPS/chapter 1.xhtml",
      offset: 128,
      cfi: "epubcfi(/6/2!/4/2/10:3)",
      percentage: 0.2
    });

    expect(route).toContain("/chapters/OEBPS~2Fchapter~201.xhtml/offset/128");
    expect(parseAppRoute(route)).toEqual({
      view: "reader",
      bookId: "book_1",
      locator: {
        chapterId: "OEBPS/chapter 1.xhtml",
        offset: 128,
        cfi: "epubcfi(/6/2!/4/2/10:3)"
      }
    });
  });

  it("creates typed locators from route state", () => {
    expect(locatorFromRoute("pdf", { page: 4 })).toEqual({
      kind: "pdf",
      page: 4,
      percentage: 0
    });
    expect(locatorFromRoute("txt", { chapterId: "chapter_2", offset: 30 })).toEqual({
      kind: "txt",
      chapterId: "chapter_2",
      offset: 30,
      percentage: 0
    });
  });
});
