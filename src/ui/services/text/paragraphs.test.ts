import { describe, expect, it } from "vitest";
import { smartSplitParagraphs } from "./paragraphs";

describe("smartSplitParagraphs", () => {
  it("merges hard-wrapped Chinese lines into one paragraph", () => {
    const paragraphs = smartSplitParagraphs("这是一个被硬换行切开的段落\n下一行本应继续同一段\n直到这里才结束。");

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe("这是一个被硬换行切开的段落下一行本应继续同一段直到这里才结束。");
  });

  it("keeps indented Chinese paragraphs separate", () => {
    const paragraphs = smartSplitParagraphs("　　第一段内容\n仍然是第一段\n　　第二段内容");

    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      "第一段内容仍然是第一段",
      "第二段内容"
    ]);
  });

  it("uses blank lines and separator lines as paragraph boundaries", () => {
    const paragraphs = smartSplitParagraphs("第一段\n\n------\n第二段");

    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual(["第一段", "第二段"]);
  });
});
