export interface SmartParagraph {
  text: string;
  start: number;
  end: number;
}

const CJK_PATTERN = /[\u3400-\u9FFF]/;
const TERMINAL_PUNCTUATION = /[。！？!?；;…」』”’）)]$/;
const STRONG_PARAGRAPH_START = /^([\s　]{2,}|\t+|[-*]\s+|[0-9０-９]+[、.．]\s+)/;
const SEPARATOR_LINE = /^[-_=*·・.。~～]{4,}$/;

export function smartSplitParagraphs(text: string): SmartParagraph[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.match(/[^\n]*(?:\n|$)/g) ?? [];
  const paragraphs: SmartParagraph[] = [];
  let current = "";
  let currentStart = 0;
  let currentEnd = 0;
  let previousLine = "";
  let cursor = 0;

  const flush = () => {
    const cleaned = current.trim();

    if (cleaned) {
      paragraphs.push({
        text: cleaned,
        start: currentStart,
        end: currentEnd
      });
    }

    current = "";
    previousLine = "";
  };

  for (const rawLineWithBreak of lines) {
    if (!rawLineWithBreak) {
      continue;
    }

    const rawLine = rawLineWithBreak.replace(/\n$/, "");
    const lineStart = cursor;
    const lineEnd = cursor + rawLine.length;
    const line = rawLine.trim();
    cursor += rawLineWithBreak.length;

    if (!line || SEPARATOR_LINE.test(line)) {
      flush();
      continue;
    }

    if (!current) {
      current = line;
      currentStart = lineStart;
      currentEnd = lineEnd;
      previousLine = line;
      continue;
    }

    if (shouldStartNewParagraph(rawLine, line, previousLine)) {
      flush();
      current = line;
      currentStart = lineStart;
      currentEnd = lineEnd;
      previousLine = line;
      continue;
    }

    current = mergeLines(current, line);
    currentEnd = lineEnd;
    previousLine = line;
  }

  flush();
  return paragraphs;
}

function shouldStartNewParagraph(rawLine: string, line: string, previousLine: string): boolean {
  if (STRONG_PARAGRAPH_START.test(rawLine)) {
    return true;
  }

  if (looksLikeHeading(line)) {
    return true;
  }

  if (previousLine.length <= 28 && TERMINAL_PUNCTUATION.test(previousLine)) {
    return true;
  }

  if (/^[“"「『]/.test(line) && TERMINAL_PUNCTUATION.test(previousLine)) {
    return true;
  }

  return false;
}

function mergeLines(previous: string, next: string): string {
  if (CJK_PATTERN.test(previous.at(-1) ?? "") || CJK_PATTERN.test(next[0] ?? "")) {
    return `${previous}${next}`;
  }

  return `${previous} ${next}`;
}

function looksLikeHeading(line: string): boolean {
  return /^第\s*[零〇一二两三四五六七八九十百千万0-9０-９]+\s*[章节卷回部篇集]/.test(line)
    || /^(序章|楔子|引子|前言|尾声|后记|番外)(\s|$|[:：])/.test(line)
    || /^chapter\s+[0-9ivxlcdm]+/i.test(line);
}
