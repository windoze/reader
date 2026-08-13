import type { ReaderLocator } from "../../../domain/types";
import type { EpubBookLike, EpubNavItem } from "./epubTypes";

export function flattenToc(items: EpubNavItem[], depth = 0): Array<EpubNavItem & { depth: number }> {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenToc(item.subitems ?? [], depth + 1)
  ]);
}

export function epubLocatorKey(locator?: Extract<ReaderLocator, { kind: "epub" }>): string {
  if (!locator) {
    return "";
  }

  if (locator.cfi) {
    return `cfi:${locator.cfi}`;
  }

  return `chapter:${locator.chapterId ?? ""}:offset:${locator.offset ?? 0}`;
}

export async function resolveInitialEpubTarget(
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

export async function textOffsetFromCfi(book: EpubBookLike, cfi: string): Promise<number> {
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
