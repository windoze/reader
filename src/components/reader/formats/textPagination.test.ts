import { describe, expect, it } from "vitest";
import type { TextPageBlock } from "../../../services/text/blocks";
import { pageIndexForOffset, paginateTextBlocks } from "./textPagination";

describe("paginateTextBlocks", () => {
  it("splits a paragraph into the remaining space on the current page", () => {
    const longParagraphStart = 30;
    const blocks: TextPageBlock[] = [
      {
        kind: "heading",
        text: "第一章",
        start: 0,
        end: 3
      },
      {
        kind: "paragraph",
        text: "短".repeat(20),
        start: 10,
        end: longParagraphStart
      },
      {
        kind: "paragraph",
        text: "长".repeat(50),
        start: longParagraphStart,
        end: longParagraphStart + 50
      }
    ];

    const pages = paginateTextBlocks(blocks, 60, measureBlocks);
    const firstPageSplit = pages[0].blocks.at(-1);
    const secondPageContinuation = pages[1].blocks[0];

    expect(pages).toHaveLength(2);
    expect(pages[0].blocks).toHaveLength(3);
    expect(firstPageSplit).toMatchObject({
      kind: "paragraph",
      text: "长".repeat(25),
      start: longParagraphStart,
      end: longParagraphStart + 25,
      continuesToNext: true
    });
    expect(secondPageContinuation).toMatchObject({
      kind: "paragraph",
      text: "长".repeat(25),
      start: longParagraphStart + 25,
      end: longParagraphStart + 50,
      isContinuation: true
    });
    expect(pageIndexForOffset(pages, longParagraphStart + 24)).toBe(0);
    expect(pageIndexForOffset(pages, longParagraphStart + 25)).toBe(1);
  });
});

function measureBlocks(blocks: TextPageBlock[]): number {
  return blocks.reduce((height, block, index) => {
    if (block.kind === "heading") {
      return height + 10;
    }

    const hasFollowingBlock = index < blocks.length - 1;
    const paragraphSpacing = hasFollowingBlock && !block.continuesToNext ? 5 : 0;
    return height + block.text.length + paragraphSpacing;
  }, 0);
}
