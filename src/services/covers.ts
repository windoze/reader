import type { BookCover, BookFormat, BookRecord } from "../domain/types";

const COVER_WIDTH = 360;
const COVER_HEIGHT = 500;
const PDF_PAGE_MARGIN = 18;
const MAX_DEVICE_PIXEL_RATIO = 2;

interface EpubCoverBook {
  ready: Promise<unknown>;
  coverUrl?: () => Promise<string | null | undefined>;
}

export async function createBookCover(
  file: File,
  format: BookFormat,
  title: string
): Promise<BookCover> {
  if (format === "epub") {
    try {
      const cover = await createEpubCover(file);

      if (cover) {
        return {
          kind: "embedded",
          dataUrl: cover
        };
      }
    } catch {
      // Embedded cover extraction is best-effort; importing should still succeed.
    }
  }

  if (format === "pdf") {
    try {
      const cover = await createPdfCover(file);

      if (cover) {
        return {
          kind: "pdf",
          dataUrl: cover
        };
      }
    } catch {
      // Some PDFs cannot render in the browser worker; use the title cover instead.
    }
  }

  return {
    kind: "generated",
    dataUrl: createGeneratedCoverDataUrl(title, format)
  };
}

export function coverDataUrlForBook(
  book: Pick<BookRecord, "cover" | "format" | "title">
): string {
  return book.cover?.dataUrl ?? createGeneratedCoverDataUrl(book.title, book.format);
}

export function createGeneratedCoverDataUrl(title: string, format: BookFormat = "txt"): string {
  const lines = splitCoverTitle(title);
  const fontSize = lines.length >= 4 ? 31 : lines.length === 3 ? 34 : 38;
  const lineHeight = fontSize * 1.24;
  const firstLineY = 156 - ((lines.length - 1) * lineHeight) / 2;
  const label = xmlEscape(format.toUpperCase());
  const titleText = lines
    .map((line, index) => {
      const y = firstLineY + index * lineHeight;
      return `<text x="180" y="${numberAttr(y)}">${xmlEscape(line)}</text>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f628e"/>
      <stop offset="0.54" stop-color="#224f78"/>
      <stop offset="1" stop-color="#153956"/>
    </linearGradient>
    <radialGradient id="light" cx="42%" cy="18%" r="74%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.17"/>
      <stop offset="0.48" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#071b2d" stop-opacity="0.42"/>
    </radialGradient>
    <filter id="paper" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.84" numOctaves="3" seed="11"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.2"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="360" height="500" rx="9" fill="url(#bg)"/>
  <rect width="360" height="500" rx="9" fill="url(#light)"/>
  <rect x="-8" y="-8" width="376" height="516" filter="url(#paper)" opacity="0.3"/>
  <path d="M30 40C87 17 161 25 222 51C279 75 321 68 340 45V500H0V85C8 69 17 53 30 40Z" fill="#08233a" opacity="0.16"/>
  <g fill="#d3c5b7" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans CJK SC', sans-serif" font-size="${fontSize}" font-weight="500" letter-spacing="0" text-anchor="middle">
    ${titleText}
  </g>
  <g fill="none" stroke="#c8bbac" stroke-linecap="round" opacity="0.45">
    <path d="M94 387c13-9 22-9 34 0"/>
    <path d="M232 387c13-9 22-9 34 0"/>
    <path d="M114 392c-8 2-15 0-21-6"/>
    <path d="M246 392c8 2 15 0 21-6"/>
  </g>
  <text x="180" y="421" fill="#d3c5b7" opacity="0.74" font-family="Georgia, 'Times New Roman', serif" font-size="39" font-weight="700" letter-spacing="0" text-anchor="middle">${label}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function splitCoverTitle(title: string, maxWeight = 7.6, maxLines = 4): string[] {
  const normalized = (title || "未命名")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "未命名";
  const lines: string[] = [];
  let current = "";

  for (const char of Array.from(normalized)) {
    const next = current + char;

    if (current && visualWeight(next) > maxWeight) {
      lines.push(current.trim());
      current = char.trimStart();
    } else {
      current = next;
    }

    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current.trim()) {
    lines.push(current.trim());
  }

  if (lines.length === 0) {
    return ["未命名"];
  }

  const didTruncate = Array.from(normalized).join("") !== lines.join("");
  const visibleLines = lines.slice(0, maxLines);

  if (didTruncate) {
    visibleLines[visibleLines.length - 1] = withEllipsis(visibleLines.at(-1) ?? "", maxWeight);
  }

  return visibleLines;
}

async function createEpubCover(file: File): Promise<string | undefined> {
  const { default: ePub } = await import("epubjs");
  const buffer = await file.arrayBuffer();
  const book = (ePub as unknown as (data: ArrayBuffer) => EpubCoverBook)(buffer);
  let coverUrl: string | null | undefined;

  try {
    await book.ready;
    coverUrl = await book.coverUrl?.();

    if (!coverUrl) {
      return undefined;
    }

    return readUrlAsDataUrl(coverUrl);
  } finally {
    if (coverUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(coverUrl);
    }
  }
}

async function createPdfCover(file: File): Promise<string | undefined> {
  if (typeof document === "undefined") {
    return undefined;
  }

  const [{ getDocument }, { ensurePdfWorker }] = await Promise.all([
    import("pdfjs-dist"),
    import("./pdfWorker")
  ]);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return undefined;
  }

  ensurePdfWorker();
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;

  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      (COVER_WIDTH - PDF_PAGE_MARGIN * 2) / baseViewport.width,
      (COVER_HEIGHT - PDF_PAGE_MARGIN * 2) / baseViewport.height
    );
    const viewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.round(COVER_WIDTH * pixelRatio);
    canvas.height = Math.round(COVER_HEIGHT * pixelRatio);
    context.scale(pixelRatio, pixelRatio);
    context.fillStyle = "#f7f4ed";
    context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
    context.save();
    context.translate(
      Math.max(PDF_PAGE_MARGIN, (COVER_WIDTH - viewport.width) / 2),
      Math.max(PDF_PAGE_MARGIN, (COVER_HEIGHT - viewport.height) / 2)
    );
    await page.render({
      canvas,
      canvasContext: context,
      viewport
    }).promise;
    context.restore();

    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    await Promise.resolve(
      (pdf as unknown as { destroy?: () => Promise<void> | void }).destroy?.()
    );
  }
}

async function readUrlAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    return url;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("封面读取失败");
  }

  return blobToDataUrl(await response.blob());
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Blob 读取失败")));
    reader.readAsDataURL(blob);
  });
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function visualWeight(value: string): number {
  return Array.from(value).reduce((total, char) => total + (/[\x00-\x7F]/.test(char) ? 0.56 : 1), 0);
}

function withEllipsis(value: string, maxWeight: number): string {
  let next = value;

  while (next && visualWeight(`${next}…`) > maxWeight) {
    next = next.slice(0, -1);
  }

  return `${next || value.slice(0, 1)}…`;
}

function numberAttr(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
