import type { TextPageBlock } from "./textBlocks";

export interface TextPage {
  blocks: TextPageBlock[];
  startOffset: number;
  endOffset: number;
}

export type MeasureBlocks = (blocks: TextPageBlock[]) => number;

export function paginateTextBlocks(
  blocks: TextPageBlock[],
  pageHeight: number,
  measureBlocks: MeasureBlocks
): TextPage[] {
  const pages: TextPage[] = [];
  let current: TextPageBlock[] = [];

  for (const block of blocks) {
    const candidate = [...current, block];

    if (measureBlocks(candidate) <= pageHeight || current.length === 0) {
      if (measureBlocks(candidate) <= pageHeight) {
        current = candidate;
        continue;
      }

      const splitBlocks = splitOversizedBlock(block, pageHeight, measureBlocks);

      for (const splitBlock of splitBlocks) {
        if (measureBlocks([...current, splitBlock]) > pageHeight && current.length > 0) {
          pages.push(createPage(current));
          current = [];
        }

        current.push(splitBlock);
      }

      continue;
    }

    pages.push(createPage(current));
    current = [block];
  }

  if (current.length > 0) {
    pages.push(createPage(current));
  }

  return pages.length > 0 ? pages : [createPage([])];
}

export function pageIndexForOffset(pages: TextPage[], offset: number): number {
  const index = pages.findIndex((page) => offset >= page.startOffset && offset <= page.endOffset);
  return index === -1 ? 0 : index;
}

function splitOversizedBlock(
  block: TextPageBlock,
  pageHeight: number,
  measureBlocks: MeasureBlocks
): TextPageBlock[] {
  if (block.kind === "heading") {
    return [block];
  }

  const chunks = splitTextChunks(block.text);
  const splitBlocks: TextPageBlock[] = [];
  let current = "";
  let currentStart = block.start;
  let cursor = block.start;

  for (const chunk of chunks) {
    const candidate = `${current}${chunk}`;
    const candidateBlock = {
      ...block,
      text: candidate,
      start: currentStart,
      end: cursor + chunk.length
    };

    if (measureBlocks([candidateBlock]) <= pageHeight || !current) {
      current = candidate;
      cursor += chunk.length;
      continue;
    }

    splitBlocks.push({
      ...block,
      text: current,
      start: currentStart,
      end: cursor
    });
    currentStart = cursor;
    current = chunk;
    cursor += chunk.length;
  }

  if (current) {
    splitBlocks.push({
      ...block,
      text: current,
      start: currentStart,
      end: cursor
    });
  }

  return splitBlocks;
}

function splitTextChunks(text: string): string[] {
  const chunks = text.match(/[^。！？!?；;…]+[。！？!?；;…]?|.+$/g) ?? [text];
  const result: string[] = [];

  for (const chunk of chunks) {
    if (chunk.length <= 120) {
      result.push(chunk);
      continue;
    }

    for (let index = 0; index < chunk.length; index += 80) {
      result.push(chunk.slice(index, index + 80));
    }
  }

  return result;
}

function createPage(blocks: TextPageBlock[]): TextPage {
  return {
    blocks,
    startOffset: blocks[0]?.start ?? 0,
    endOffset: blocks.at(-1)?.end ?? 0
  };
}
