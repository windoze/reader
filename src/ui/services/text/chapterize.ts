import type { TextChapter } from "../../domain/types";

interface LineInfo {
  index: number;
  raw: string;
  text: string;
  start: number;
  end: number;
}

interface ChapterCandidate {
  line: LineInfo;
  title: string;
  level: number;
  score: number;
}

const CHAPTER_CHARS = "章节回卷部篇集";
const CHINESE_NUMERAL = "零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟";
const HEADING_PATTERNS: Array<{ pattern: RegExp; level: number; weight: number }> = [
  {
    pattern: new RegExp(`^第\\s*[${CHINESE_NUMERAL}0-9０-９]+\\s*[${CHAPTER_CHARS}]\\s*[:：、.．\\-—]?\\s*\\S{0,48}$`),
    level: 2,
    weight: 80
  },
  {
    pattern: /^(卷|部|篇|集)\s*[一二三四五六七八九十百千万0-9０-９]+\s*[:：、.．\-—]?\s*\S{0,48}$/,
    level: 1,
    weight: 74
  },
  {
    pattern: /^(序章|楔子|引子|前言|尾声|后记|番外)(\s*[:：、.．\-—]?\s*\S{0,48})?$/,
    level: 2,
    weight: 70
  },
  {
    pattern: /^chapter\s+[0-9ivxlcdm]+(\s*[:：、.．\-—]?\s*.{0,56})?$/i,
    level: 2,
    weight: 66
  },
  {
    pattern: /^[0-9０-９]{1,4}\s*[、.．]\s*(?=.*[A-Za-z\u3400-\u9FFF]).{1,56}$/,
    level: 2,
    weight: 46
  }
];

export interface ChapterizeOptions {
  fallbackChunkSize?: number;
  minimumGap?: number;
}

export function chapterizeText(text: string, options: ChapterizeOptions = {}): TextChapter[] {
  const fallbackChunkSize = options.fallbackChunkSize ?? 24_000;
  const configuredMinimumGap = options.minimumGap ?? 80;
  const minimumGap = text.length < 20_000 ? 0 : configuredMinimumGap;
  const lines = buildLineIndex(text);
  const candidates = findChapterCandidates(lines, minimumGap);

  if (candidates.length === 0) {
    return createFallbackChapters(text, fallbackChunkSize);
  }

  const chapters: TextChapter[] = [];
  const first = candidates[0];

  if (first.line.start > 1200) {
    chapters.push({
      id: "chapter_preface",
      title: "开始",
      start: 0,
      end: first.line.start,
      level: 1
    });
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const next = candidates[index + 1];

    chapters.push({
      id: `chapter_${chapters.length + 1}`,
      title: candidate.title,
      start: candidate.line.start,
      end: next?.line.start ?? text.length,
      level: candidate.level
    });
  }

  return chapters;
}

export function buildLineIndex(text: string): LineInfo[] {
  const lines: LineInfo[] = [];
  const pattern = /.*(?:\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) && match[0] !== "") {
    const raw = match[0];
    const end = pattern.lastIndex;

    lines.push({
      index: lines.length,
      raw,
      text: raw.replace(/\r?\n|\r/g, "").trim(),
      start: match.index,
      end
    });
  }

  return lines;
}

function findChapterCandidates(lines: LineInfo[], minimumGap: number): ChapterCandidate[] {
  const candidates: ChapterCandidate[] = [];
  let lastAcceptedStart = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    const candidate = scoreLine(line, lines);

    if (!candidate) {
      continue;
    }

    const previous = candidates[candidates.length - 1];

    if (
      line.start - lastAcceptedStart < minimumGap &&
      candidate.level !== 1 &&
      previous?.level !== 1
    ) {
      if (previous && candidate.score > previous.score + 12) {
        candidates[candidates.length - 1] = candidate;
        lastAcceptedStart = line.start;
      }

      continue;
    }

    candidates.push(candidate);
    lastAcceptedStart = line.start;
  }

  return candidates;
}

function scoreLine(line: LineInfo, lines: LineInfo[]): ChapterCandidate | undefined {
  const title = normalizeTitle(line.text);

  if (!title || title.length > 72) {
    return undefined;
  }

  for (const { pattern, level, weight } of HEADING_PATTERNS) {
    if (!pattern.test(title)) {
      continue;
    }

    let score = weight;
    const previous = lines[line.index - 1]?.text;
    const next = lines[line.index + 1]?.text;

    if (!previous) {
      score += 10;
    }

    if (!next) {
      score += 3;
    }

    if (line.raw.startsWith("　　") || line.raw.startsWith("  ")) {
      score -= 8;
    }

    if (title.length <= 26) {
      score += 6;
    }

    if (new RegExp(`第\\s*[${CHINESE_NUMERAL}0-9０-９]+\\s*[卷部篇集]`).test(title)) {
      return { line, title, level: 1, score: score + 8 };
    }

    return { line, title, level, score };
  }

  return undefined;
}

function normalizeTitle(title: string): string {
  return title
    .replace(/^[\s　]+|[\s　]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[：:]\s*$/g, "");
}

function createFallbackChapters(text: string, chunkSize: number): TextChapter[] {
  if (text.length <= chunkSize) {
    return [
      {
        id: "chapter_1",
        title: "全文",
        start: 0,
        end: text.length,
        level: 1
      }
    ];
  }

  const chapters: TextChapter[] = [];

  let start = 0;

  while (start < text.length) {
    const end = findChunkBoundary(text, Math.min(text.length, start + chunkSize));
    chapters.push({
      id: `chapter_${chapters.length + 1}`,
      title: `片段 ${chapters.length + 1}`,
      start,
      end,
      level: 1
    });
    start = end;
  }

  return chapters;
}

function findChunkBoundary(text: string, preferredEnd: number): number {
  if (preferredEnd >= text.length) {
    return text.length;
  }

  const nextBreak = text.indexOf("\n", preferredEnd);

  if (nextBreak > -1 && nextBreak - preferredEnd < 1200) {
    return nextBreak + 1;
  }

  return preferredEnd;
}
