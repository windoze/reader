import type { TextPageBlock } from "../../../services/text/blocks";

export interface TextPage {
  blocks: TextPageBlock[];
  startOffset: number;
  endOffset: number;
}

export type MeasureBlocks = (blocks: TextPageBlock[]) => number;

const MIN_REMAINDER_FRAGMENT_LENGTH = 16;

export function paginateTextBlocks(
  blocks: TextPageBlock[],
  pageHeight: number,
  measureBlocks: MeasureBlocks
): TextPage[] {
  const pages: TextPage[] = [];
  let current: TextPageBlock[] = [];

  for (const block of blocks) {
    if (block.kind === "heading") {
      if (current.length > 0 && measureBlocks([...current, block]) > pageHeight) {
        pages.push(createPage(current));
        current = [];
      }

      current.push(block);
      continue;
    }

    let remainingBlock: TextPageBlock | undefined = block;

    while (remainingBlock) {
      if (measureBlocks([...current, remainingBlock]) <= pageHeight) {
        current.push(remainingBlock);
        remainingBlock = undefined;
        continue;
      }

      const split = splitParagraphForPage(
        remainingBlock,
        current,
        pageHeight,
        measureBlocks
      );

      if (split) {
        current.push(split.current);
        pages.push(createPage(current));
        current = [];
        remainingBlock = split.remaining;
        continue;
      }

      if (current.length > 0) {
        pages.push(createPage(current));
        current = [];
        continue;
      }

      const fallbackSplit = splitParagraphForPage(
        remainingBlock,
        [],
        Number.POSITIVE_INFINITY,
        measureBlocks
      );

      current.push(fallbackSplit?.current ?? remainingBlock);
      remainingBlock = fallbackSplit?.remaining;

      if (remainingBlock) {
        pages.push(createPage(current));
        current = [];
      }
    }
  }

  if (current.length > 0) {
    pages.push(createPage(current));
  }

  return pages.length > 0 ? pages : [createPage([])];
}

export function pageIndexForOffset(pages: TextPage[], offset: number): number {
  const index = pages.findIndex((page, pageIndex) =>
    offset >= page.startOffset &&
    (offset < page.endOffset || (pageIndex === pages.length - 1 && offset <= page.endOffset))
  );
  return index === -1 ? 0 : index;
}

function splitParagraphForPage(
  block: TextPageBlock,
  previousBlocks: TextPageBlock[],
  pageHeight: number,
  measureBlocks: MeasureBlocks
): { current: TextPageBlock; remaining: TextPageBlock } | undefined {
  if (block.kind !== "paragraph" || block.text.length <= 1) {
    return undefined;
  }

  const fittingLength = findFittingTextLength(block, previousBlocks, pageHeight, measureBlocks);

  if (
    fittingLength <= 0 ||
    (
      previousBlocks.length > 0 &&
      fittingLength < Math.min(MIN_REMAINDER_FRAGMENT_LENGTH, block.text.length - 1)
    )
  ) {
    return undefined;
  }

  const splitIndex = refineSplitIndex(block.text, fittingLength);

  return {
    current: {
      ...block,
      text: block.text.slice(0, splitIndex),
      end: block.start + splitIndex,
      continuesToNext: true
    },
    remaining: {
      ...block,
      text: block.text.slice(splitIndex),
      start: block.start + splitIndex,
      isContinuation: true,
      continuesToNext: undefined
    }
  };
}

function findFittingTextLength(
  block: TextPageBlock,
  previousBlocks: TextPageBlock[],
  pageHeight: number,
  measureBlocks: MeasureBlocks
): number {
  let low = 0;
  let high = block.text.length - 1;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = {
      ...block,
      text: block.text.slice(0, middle),
      end: block.start + middle,
      continuesToNext: true
    };

    if (measureBlocks([...previousBlocks, candidate]) <= pageHeight) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}

function refineSplitIndex(text: string, fittingLength: number): number {
  const safeLength = Math.min(Math.max(1, fittingLength), text.length - 1);
  const minimum = Math.max(
    1,
    Math.min(safeLength - 1, Math.floor(safeLength * 0.55))
  );

  for (let index = safeLength; index >= minimum; index -= 1) {
    if (/[。！？!?；;，,、：:）)」』”’]/.test(text[index - 1])) {
      return index;
    }
  }

  return safeLength;
}

function createPage(blocks: TextPageBlock[]): TextPage {
  return {
    blocks,
    startOffset: blocks[0]?.start ?? 0,
    endOffset: blocks.at(-1)?.end ?? 0
  };
}
