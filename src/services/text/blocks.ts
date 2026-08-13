import type { TextChapter, TextContentBlock } from "../../domain/types";
import { smartSplitParagraphs } from "./paragraphs";

export type TextPageBlock = TextContentBlock;

export function buildChapterBlocks(chapter: TextChapter, chapterContent: string): TextPageBlock[] {
  const bodyStart = findBodyStart(chapterContent, chapter.title);
  const body = chapterContent.slice(bodyStart);
  const paragraphs = smartSplitParagraphs(body);

  return [
    {
      kind: "heading",
      text: chapter.title,
      start: 0,
      end: bodyStart
    },
    ...paragraphs.map((paragraph) => ({
      kind: "paragraph" as const,
      text: paragraph.text,
      start: bodyStart + paragraph.start,
      end: bodyStart + paragraph.end
    }))
  ];
}

function findBodyStart(content: string, title: string): number {
  const trimmedStart = content.search(/\S/);

  if (trimmedStart === -1) {
    return 0;
  }

  const normalized = content.slice(trimmedStart);

  if (!normalized.startsWith(title)) {
    return 0;
  }

  const afterTitle = trimmedStart + title.length;
  const nextLineBreak = content.indexOf("\n", afterTitle);

  return nextLineBreak === -1 ? afterTitle : nextLineBreak + 1;
}
