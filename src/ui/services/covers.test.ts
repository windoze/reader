import { describe, expect, it } from "vitest";
import {
  coverDataUrlForBook,
  createBookCover,
  createGeneratedCoverDataUrl,
  splitCoverTitle
} from "./covers";

describe("covers", () => {
  it("generates a title cover for txt books", () => {
    const dataUrl = createGeneratedCoverDataUrl("我以女儿身闯荡古龙江湖", "txt");
    const svg = decodeSvgDataUrl(dataUrl);

    expect(dataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(svg).toContain("我以女儿身");
    expect(svg).toContain("TXT");
  });

  it("escapes SVG text content", () => {
    const svg = decodeSvgDataUrl(createGeneratedCoverDataUrl("A & B <C>", "txt"));

    expect(svg).toContain("A &amp; B");
    expect(svg).toContain("&lt;C&gt;");
  });

  it("keeps long titles within a small number of cover lines", () => {
    const lines = splitCoverTitle(`《历史粉碎机》${"特别加长".repeat(8)}`);

    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines.at(-1)).toContain("…");
  });

  it("uses generated covers for txt imports", async () => {
    const file = new File(["第一章 测试"], "星河.txt", { type: "text/plain" });
    const cover = await createBookCover(file, "txt", "星河");

    expect(cover.kind).toBe("generated");
    expect(decodeSvgDataUrl(cover.dataUrl)).toContain("星河");
  });

  it("falls back to a generated cover when a stored book has no cover", () => {
    const dataUrl = coverDataUrlForBook({
      title: "旧书",
      format: "txt"
    });

    expect(decodeSvgDataUrl(dataUrl)).toContain("旧书");
  });
});

function decodeSvgDataUrl(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
}
