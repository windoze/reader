import { describe, expect, it } from "vitest";
import type { ReaderSettings } from "../../../domain/types";
import { applyEpubContentStyle } from "./epubCss";

const settings: ReaderSettings = {
  theme: "light",
  fontFamily: "serif",
  fontSize: 19,
  lineHeight: 1.8,
  paragraphSpacing: 1.2,
  contentWidth: 720,
  replaceEpubCss: true
};

describe("applyEpubContentStyle", () => {
  it("removes embedded epub styles and injects the reader stylesheet", () => {
    const document = new DOMParser().parseFromString(
      `<!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="book.css">
          <style>p { color: red; }</style>
        </head>
        <body>
          <p style="font-size: 12px">正文</p>
        </body>
      </html>`,
      "text/html"
    );

    applyEpubContentStyle(document, settings);

    expect(document.querySelector('link[rel~="stylesheet"]')).toBeNull();
    expect(document.querySelector("style:not(#reader-epub-unified-style)")).toBeNull();
    expect(document.querySelector("p")?.getAttribute("style")).toBeNull();
    expect(document.getElementById("reader-epub-unified-style")?.textContent).toContain("font-size: 19px");
    expect(document.getElementById("reader-epub-unified-style")?.textContent).toContain(
      "background: transparent"
    );
  });

  it("removes only the reader stylesheet when replacement is disabled", () => {
    const document = new DOMParser().parseFromString(
      `<!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="book.css">
          <style id="reader-epub-unified-style">body { color: black; }</style>
        </head>
        <body><p style="font-size: 12px">正文</p></body>
      </html>`,
      "text/html"
    );

    applyEpubContentStyle(document, {
      ...settings,
      replaceEpubCss: false
    });

    expect(document.querySelector('link[rel~="stylesheet"]')).not.toBeNull();
    expect(document.getElementById("reader-epub-unified-style")).toBeNull();
    expect(document.querySelector("p")?.getAttribute("style")).toBe("font-size: 12px");
  });
});
