import type { BookFormat, ReaderLocator } from "../domain/types";

export interface ReaderRouteLocator {
  chapterId?: string;
  offset?: number;
  page?: number;
  cfi?: string;
}

export type AppRoute =
  | {
      view: "library";
      groupId: string | "all";
    }
  | {
      view: "reader";
      bookId: string;
      locator?: ReaderRouteLocator;
    };

export function parseAppRoute(pathname: string, search = ""): AppRoute {
  const [pathOnly, inlineSearch] = pathname.split("?");
  const effectiveSearch = search || (inlineSearch ? `?${inlineSearch}` : "");
  const segments = pathOnly
    .split("/")
    .filter(Boolean)
    .map(decodeRouteSegment);
  const params = new URLSearchParams(effectiveSearch);

  if (segments[0] === "groups") {
    return {
      view: "library",
      groupId: segments[1] || "all"
    };
  }

  if (segments[0] === "books" && segments[1]) {
    const locator: ReaderRouteLocator = {};

    if (segments[2] === "chapters" && segments[3]) {
      locator.chapterId = segments[3];
    }

    if (segments[4] === "offset" && segments[5]) {
      locator.offset = parseNonNegativeInteger(segments[5]);
    }

    if (segments[2] === "pages" && segments[3]) {
      locator.page = Math.max(1, parseNonNegativeInteger(segments[3]) ?? 1);
    }

    const cfi = params.get("cfi");
    if (cfi) {
      locator.cfi = cfi;
    }

    return {
      view: "reader",
      bookId: segments[1],
      locator: Object.keys(locator).length > 0 ? locator : undefined
    };
  }

  return {
    view: "library",
    groupId: "all"
  };
}

export function routeForGroup(groupId: string | "all" = "all"): string {
  return `/groups/${encodeRouteSegment(groupId)}`;
}

export function routeForBook(bookId: string): string {
  return `/books/${encodeRouteSegment(bookId)}`;
}

export function routeForLocator(bookId: string, locator: ReaderLocator): string {
  const encodedBookId = encodeRouteSegment(bookId);

  if (locator.kind === "pdf") {
    return `/books/${encodedBookId}/pages/${Math.max(1, Math.floor(locator.page))}`;
  }

  if (locator.kind === "txt") {
    return `/books/${encodedBookId}/chapters/${encodeRouteSegment(locator.chapterId)}/offset/${Math.max(
      0,
      Math.floor(locator.offset)
    )}`;
  }

  if (locator.chapterId) {
    const path = `/books/${encodedBookId}/chapters/${encodeRouteSegment(locator.chapterId)}/offset/${Math.max(
      0,
      Math.floor(locator.offset ?? 0)
    )}`;
    return locator.cfi ? `${path}?cfi=${encodeURIComponent(locator.cfi)}` : path;
  }

  return locator.cfi
    ? `/books/${encodedBookId}?cfi=${encodeURIComponent(locator.cfi)}`
    : `/books/${encodedBookId}`;
}

export function locatorFromRoute(format: BookFormat, routeLocator?: ReaderRouteLocator): ReaderLocator | undefined {
  if (!routeLocator) {
    return undefined;
  }

  if (format === "pdf" && routeLocator.page) {
    return {
      kind: "pdf",
      page: routeLocator.page,
      percentage: 0
    };
  }

  if (format === "txt" && routeLocator.chapterId) {
    return {
      kind: "txt",
      chapterId: routeLocator.chapterId,
      offset: routeLocator.offset ?? 0,
      percentage: 0
    };
  }

  if (format === "epub" && (routeLocator.chapterId || routeLocator.cfi)) {
    return {
      kind: "epub",
      cfi: routeLocator.cfi ?? "",
      chapterId: routeLocator.chapterId,
      offset: routeLocator.offset ?? 0
    };
  }

  return undefined;
}

export function routeKey(locator?: ReaderRouteLocator): string {
  if (!locator) {
    return "";
  }

  return JSON.stringify(locator);
}

function encodeRouteSegment(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "~");
}

function decodeRouteSegment(value: string): string {
  return decodeURIComponent(value.replace(/~/g, "%"));
}

function parseNonNegativeInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
