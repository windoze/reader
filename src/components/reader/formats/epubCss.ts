import type { ReaderSettings } from "../../../domain/types";

const READER_EPUB_STYLE_ID = "reader-epub-unified-style";

export function applyEpubContentStyle(document: Document, settings: ReaderSettings): void {
  if (!settings.replaceEpubCss) {
    document.getElementById(READER_EPUB_STYLE_ID)?.remove();
    return;
  }

  stripBookStyles(document);

  const style = document.getElementById(READER_EPUB_STYLE_ID) ?? document.createElement("style");
  style.id = READER_EPUB_STYLE_ID;
  style.textContent = unifiedEpubCss(settings);
  document.head.append(style);
}

function stripBookStyles(document: Document): void {
  document
    .querySelectorAll(`style:not(#${READER_EPUB_STYLE_ID}), link[rel~="stylesheet"]`)
    .forEach((element) => element.remove());
  document.querySelectorAll("[style]").forEach((element) => element.removeAttribute("style"));
}

function unifiedEpubCss(settings: ReaderSettings): string {
  const foreground = settings.theme === "dark" ? "#e6e1d8" : "#28231d";
  const colorScheme = settings.theme === "dark" ? "dark" : "light";

  return `
    html,
    body {
      background: transparent !important;
      color: ${foreground} !important;
      color-scheme: ${colorScheme} !important;
      font-family: ${fontFamily(settings.fontFamily)} !important;
      font-size: ${settings.fontSize}px !important;
      line-height: ${settings.lineHeight} !important;
      margin: 0 !important;
      padding: 0 8px !important;
      text-align: start !important;
      word-break: break-word !important;
    }

    body * {
      background-color: transparent !important;
      color: inherit !important;
      font-family: inherit !important;
      line-height: inherit !important;
      letter-spacing: 0 !important;
      max-width: 100% !important;
      text-shadow: none !important;
    }

    p {
      font-size: 1em !important;
      margin: 0 0 ${settings.paragraphSpacing}em !important;
      orphans: 2 !important;
      text-indent: 2em !important;
      widows: 2 !important;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      font-weight: 700 !important;
      line-height: 1.35 !important;
      margin: 0 0 1.2em !important;
      text-align: center !important;
      text-indent: 0 !important;
    }

    blockquote,
    figure,
    ol,
    ul {
      margin: 0 0 ${settings.paragraphSpacing}em !important;
    }

    img,
    svg,
    video {
      display: block !important;
      height: auto !important;
      margin: 1em auto !important;
      max-height: 90vh !important;
      max-width: 100% !important;
      object-fit: contain !important;
    }

    table {
      border-collapse: collapse !important;
      display: block !important;
      max-width: 100% !important;
      overflow: hidden !important;
    }

    a {
      color: inherit !important;
      text-decoration: none !important;
    }

    ::selection {
      background: #f7d560 !important;
      color: #28231d !important;
    }
  `;
}

function fontFamily(value: string): string {
  if (value === "serif") {
    return 'Georgia, "Songti SC", serif';
  }

  if (value === "mono") {
    return '"SFMono-Regular", Consolas, monospace';
  }

  return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';
}
