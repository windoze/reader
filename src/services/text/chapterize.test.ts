import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeTextBuffer } from "./encoding";
import { chapterizeText } from "./chapterize";

function readSample(fileName: string): string {
  const buffer = readFileSync(resolve(process.cwd(), "sample-text", fileName));
  return decodeTextBuffer(buffer).text;
}

describe("TXT decoding and chapterization", () => {
  it("detects and decodes the UTF-8 sample", () => {
    const buffer = readFileSync(resolve(process.cwd(), "sample-text", "我以女儿身闯荡古龙江湖.txt"));
    const decoded = decodeTextBuffer(buffer);

    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text.slice(0, 80)).toContain("我以女儿身闯荡古龙江湖");
  });

  it("detects and decodes the GB18030 sample", () => {
    const buffer = readFileSync(resolve(process.cwd(), "sample-text", "学姐，我对你们真没非分之想！.txt"));
    const decoded = decodeTextBuffer(buffer);

    expect(decoded.encoding).toMatch(/gb/);
    expect(decoded.text.slice(0, 80)).toContain("学姐");
    expect(decoded.text.slice(0, 120)).toContain("作者");
  });

  it("splits a UTF-8 novel sample into useful chapters", () => {
    const text = readSample("我以女儿身闯荡古龙江湖.txt");
    const chapters = chapterizeText(text);

    expect(chapters.length).toBeGreaterThan(100);
    expect(chapters[0].title).toContain("第一卷");
    expect(chapters.some((chapter) => chapter.title.includes("第1章"))).toBe(true);
    expect(chapters.at(-1)?.end).toBe(text.length);
  });

  it("splits a GB18030 novel sample into useful chapters", () => {
    const text = readSample("学姐，我对你们真没非分之想！.txt");
    const chapters = chapterizeText(text);

    expect(chapters.length).toBeGreaterThan(500);
    expect(chapters[0].title).toContain("第一章");
    expect(chapters[1].start).toBeGreaterThan(chapters[0].start);
    expect(chapters.at(-1)?.end).toBe(text.length);
  });

  it("recognizes classic chapter titles with spaces in the heading", () => {
    const text = readSample("三国演义.txt");
    const chapters = chapterizeText(text);
    const chapterTitles = chapters.map((chapter) => chapter.title);

    expect(chapterTitles).toContain("第一回 宴桃园豪杰三结义 斩黄巾英雄首立功");
    expect(chapterTitles).toContain("第一百二十回 荐杜预老将献新谋 降孙皓三分归一统");
    expect(chapterTitles.filter((title) => /^第[零一二三四五六七八九十百千万]+回/.test(title))).toHaveLength(120);
    expect(chapters.at(-1)?.end).toBe(text.length);
  });

  it("recognizes common chapter heading variants", () => {
    const text = [
      "序章",
      "这是开头。",
      "",
      "Chapter 2: The Road",
      "English content.",
      "",
      "003、第三个片段",
      "正文。"
    ].join("\n");
    const chapters = chapterizeText(text);

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "序章",
      "Chapter 2: The Road",
      "003、第三个片段"
    ]);
  });

  it("falls back to fixed chunks when no heading exists", () => {
    const text = "没有章节标题的正文。".repeat(5000);
    const chapters = chapterizeText(text, { fallbackChunkSize: 3000 });

    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters[0].title).toBe("片段 1");
    expect(chapters.at(-1)?.end).toBe(text.length);
  });
});
