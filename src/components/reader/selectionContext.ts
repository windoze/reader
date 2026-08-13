export interface ReaderSelectionContext {
  range: Range;
  text: string;
}

interface TextPosition {
  node: Text;
  offset: number;
}

type WordSegment = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};

type WordSegmenter = {
  segment(input: string): Iterable<WordSegment>;
};

type WordSegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity: "word" }
) => WordSegmenter;

export function selectionContextFromContextMenuEvent(
  event: MouseEvent,
  root: Node
): ReaderSelectionContext | undefined {
  const ownerDocument = root instanceof Document ? root : root.ownerDocument;

  if (!ownerDocument) {
    return undefined;
  }

  const existingSelection = selectionAtPoint(ownerDocument, root, event.clientX, event.clientY);

  if (existingSelection) {
    return existingSelection;
  }

  const wordRange = wordRangeFromPoint(ownerDocument, root, event.clientX, event.clientY);

  if (!wordRange) {
    ownerDocument.getSelection()?.removeAllRanges();
    return undefined;
  }

  ownerDocument.getSelection()?.removeAllRanges();
  ownerDocument.getSelection()?.addRange(wordRange);

  const text = normalizedSelectionText(wordRange.toString());

  if (!text) {
    return undefined;
  }

  return {
    range: wordRange.cloneRange(),
    text
  };
}

export function menuPositionFromContextMenuEvent(event: MouseEvent): { x: number; y: number } {
  const frameElement = event.view?.frameElement;

  if (frameElement instanceof HTMLElement) {
    const rect = frameElement.getBoundingClientRect();

    return {
      x: rect.left + event.clientX,
      y: rect.top + event.clientY
    };
  }

  return {
    x: event.clientX,
    y: event.clientY
  };
}

export function textOffsetInBlock(node: Node, offset: number): number | undefined {
  const position = textPositionFromBoundary(node, offset);
  const block = position?.node.parentElement?.closest<HTMLElement>("[data-reader-text-block-start]");
  const blockStart = Number(block?.dataset.readerTextBlockStart);

  if (!position || !block || !Number.isFinite(blockStart)) {
    return undefined;
  }

  return blockStart + textOffsetWithin(block, position.node, position.offset);
}

function selectionAtPoint(
  ownerDocument: Document,
  root: Node,
  x: number,
  y: number
): ReaderSelectionContext | undefined {
  const selection = ownerDocument.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return undefined;
  }

  const range = selection.getRangeAt(0);
  const text = normalizedSelectionText(selection.toString());

  if (!text || !rootContains(root, range.commonAncestorContainer)) {
    return undefined;
  }

  if (!pointIntersectsRange(range, x, y)) {
    return undefined;
  }

  return {
    range: range.cloneRange(),
    text
  };
}

function wordRangeFromPoint(
  ownerDocument: Document,
  root: Node,
  x: number,
  y: number
): Range | undefined {
  const position = textPositionFromPoint(ownerDocument, x, y);

  if (!position || !rootContains(root, position.node)) {
    return undefined;
  }

  const word = wordBoundsAtOffset(position.node.data, position.offset);

  if (!word || word.start === word.end) {
    return undefined;
  }

  const range = ownerDocument.createRange();
  range.setStart(position.node, word.start);
  range.setEnd(position.node, word.end);

  return range;
}

function textPositionFromPoint(ownerDocument: Document, x: number, y: number): TextPosition | undefined {
  const documentWithCaretRange = ownerDocument as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const range = documentWithCaretRange.caretRangeFromPoint?.(x, y);

  if (range) {
    return textPositionFromBoundary(range.startContainer, range.startOffset);
  }

  const caretPosition = documentWithCaretRange.caretPositionFromPoint?.(x, y);

  if (caretPosition) {
    return textPositionFromBoundary(caretPosition.offsetNode, caretPosition.offset);
  }

  return undefined;
}

function textPositionFromBoundary(node: Node, offset: number): TextPosition | undefined {
  if (node.nodeType === Node.TEXT_NODE) {
    return {
      node: node as Text,
      offset: Math.min(Math.max(0, offset), node.textContent?.length ?? 0)
    };
  }

  const childNodes = Array.from(node.childNodes);
  const nextChild = childNodes[Math.min(offset, childNodes.length - 1)];
  const previousChild = childNodes[Math.max(0, offset - 1)];
  const textNode = firstTextNode(nextChild) ?? lastTextNode(previousChild);

  if (!textNode) {
    return undefined;
  }

  return {
    node: textNode,
    offset: nextChild ? 0 : textNode.data.length
  };
}

function firstTextNode(node: Node | undefined): Text | undefined {
  if (!node) {
    return undefined;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }

  for (const child of Array.from(node.childNodes)) {
    const textNode = firstTextNode(child);

    if (textNode) {
      return textNode;
    }
  }

  return undefined;
}

function lastTextNode(node: Node | undefined): Text | undefined {
  if (!node) {
    return undefined;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }

  const children = Array.from(node.childNodes);

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const textNode = lastTextNode(children[index]);

    if (textNode) {
      return textNode;
    }
  }

  return undefined;
}

function wordBoundsAtOffset(text: string, offset: number): { start: number; end: number } | undefined {
  const segmenter = (Intl as typeof Intl & { Segmenter?: WordSegmenterConstructor }).Segmenter;

  if (segmenter) {
    const segments = Array.from(new segmenter(undefined, { granularity: "word" }).segment(text));
    const matchingSegment = segments.find((segment) => {
      const start = segment.index;
      const end = start + segment.segment.length;

      return segment.isWordLike && start <= offset && offset <= end;
    });

    if (matchingSegment) {
      return {
        start: matchingSegment.index,
        end: matchingSegment.index + matchingSegment.segment.length
      };
    }
  }

  return fallbackWordBoundsAtOffset(text, offset);
}

function fallbackWordBoundsAtOffset(text: string, offset: number): { start: number; end: number } | undefined {
  let index = Math.min(Math.max(0, offset), text.length - 1);

  if (!isWordCharacter(text[index]) && index > 0 && isWordCharacter(text[index - 1])) {
    index -= 1;
  }

  if (!isWordCharacter(text[index])) {
    return undefined;
  }

  let start = index;
  let end = index + 1;

  while (start > 0 && isWordCharacter(text[start - 1])) {
    start -= 1;
  }

  while (end < text.length && isWordCharacter(text[end])) {
    end += 1;
  }

  return { start, end };
}

function isWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

function textOffsetWithin(root: Node, target: Text, targetOffset: number): number {
  const ownerDocument = root instanceof Document ? root : root.ownerDocument;

  if (!ownerDocument) {
    return 0;
  }

  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let current = walker.nextNode();

  while (current) {
    if (current === target) {
      return offset + targetOffset;
    }

    offset += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }

  return offset;
}

function pointIntersectsRange(range: Range, x: number, y: number): boolean {
  return Array.from(range.getClientRects()).some((rect) =>
    x >= rect.left - 2 &&
    x <= rect.right + 2 &&
    y >= rect.top - 2 &&
    y <= rect.bottom + 2
  );
}

function rootContains(root: Node, node: Node): boolean {
  return root === node || root.contains(node);
}

function normalizedSelectionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
