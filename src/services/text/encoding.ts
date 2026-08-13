import { analyse } from "chardet";

export interface DecodedText {
  text: string;
  encoding: string;
  confidence: number;
}

interface EncodingCandidate {
  label: string;
  confidence: number;
  language?: string;
}

const CHINESE_DECODERS = ["gb18030", "gbk", "big5"];

const ENCODING_LABELS: Record<string, string> = {
  ascii: "utf-8",
  utf8: "utf-8",
  "utf-8": "utf-8",
  utf_8: "utf-8",
  utf16le: "utf-16le",
  "utf-16le": "utf-16le",
  utf16be: "utf-16be",
  "utf-16be": "utf-16be",
  gb18030: "gb18030",
  gb2312: "gb18030",
  gbk: "gbk",
  big5: "big5",
  shift_jis: "shift_jis",
  sjis: "shift_jis",
  euc_jp: "euc-jp",
  "euc-jp": "euc-jp",
  euc_kr: "euc-kr",
  "euc-kr": "euc-kr",
  windows1252: "windows-1252",
  "windows-1252": "windows-1252",
  iso88591: "iso-8859-1",
  "iso-8859-1": "iso-8859-1"
};

export async function decodeTextFile(file: File): Promise<DecodedText> {
  return decodeTextBuffer(await file.arrayBuffer());
}

export function decodeTextBuffer(buffer: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const bom = detectBom(bytes);

  if (bom) {
    return {
      text: decodeWithLabel(bytes, bom.label, bom.offset),
      encoding: bom.label,
      confidence: 1
    };
  }

  const candidates = buildEncodingCandidates(bytes);
  let best: DecodedText | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const text = safeDecode(bytes, candidate.label);

    if (text === undefined) {
      continue;
    }

    const score = scoreDecodedText(text, candidate);

    if (score > bestScore) {
      bestScore = score;
      best = {
        text,
        encoding: candidate.label,
        confidence: Math.min(1, candidate.confidence / 100)
      };
    }
  }

  return best ?? {
    text: new TextDecoder().decode(bytes),
    encoding: "utf-8",
    confidence: 0
  };
}

function detectBom(bytes: Uint8Array): { label: string; offset: number } | undefined {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { label: "utf-8", offset: 3 };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { label: "utf-16le", offset: 2 };
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { label: "utf-16be", offset: 2 };
  }

  return undefined;
}

function buildEncodingCandidates(bytes: Uint8Array): EncodingCandidate[] {
  const seen = new Set<string>();
  const results: EncodingCandidate[] = [];

  for (const detected of analyse(bytes)) {
    const label = normalizeEncodingLabel(detected.name);

    if (!label || seen.has(label)) {
      continue;
    }

    seen.add(label);
    results.push({
      label,
      confidence: detected.confidence,
      language: detected.lang
    });
  }

  for (const fallback of ["utf-8", ...CHINESE_DECODERS, "utf-16le", "windows-1252"]) {
    if (!seen.has(fallback)) {
      results.push({ label: fallback, confidence: 0 });
      seen.add(fallback);
    }
  }

  return results;
}

function normalizeEncodingLabel(name: string): string | undefined {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return ENCODING_LABELS[key] ?? ENCODING_LABELS[name.toLowerCase()];
}

function safeDecode(bytes: Uint8Array, label: string): string | undefined {
  try {
    return decodeWithLabel(bytes, label, 0);
  } catch {
    return undefined;
  }
}

function decodeWithLabel(bytes: Uint8Array, label: string, offset: number): string {
  return new TextDecoder(label).decode(bytes.subarray(offset));
}

function scoreDecodedText(text: string, candidate: EncodingCandidate): number {
  const sample = text.slice(0, 120_000);
  const length = Math.max(1, sample.length);
  const replacementCount = countMatches(sample, /\uFFFD/g);
  const nulCount = countMatches(sample, /\u0000/g);
  const controlCount = countMatches(sample, /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g);
  const mojibakeCount = countMatches(sample, /[ÃÂ¤¦§¨©ª«¬®¯]/g);
  const cjkCount = countMatches(sample, /[\u3400-\u9FFF]/g);
  const kanaCount = countMatches(sample, /[\u3040-\u30FF]/g);
  const commonChinesePunctuation = countMatches(sample, /[，。！？；：“”‘’、]/g);

  let score = candidate.confidence * 1.4;

  score -= replacementCount * 50;
  score -= nulCount * 20;
  score -= controlCount * 6;
  score -= mojibakeCount * 4;
  score += Math.min(35, (cjkCount / length) * 90);
  score += Math.min(15, (commonChinesePunctuation / length) * 80);

  if (candidate.language === "zh") {
    score += 16;
  }

  if (candidate.label === "utf-8") {
    score += 8;
  }

  if (CHINESE_DECODERS.includes(candidate.label)) {
    score += 6;
  }

  if (candidate.label === "shift_jis" && cjkCount > 20 && kanaCount > cjkCount * 0.3) {
    score -= 14;
  }

  return score;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}
