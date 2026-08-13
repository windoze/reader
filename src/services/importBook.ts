import type { ImportedBook } from "../domain/types";
import { titleFromFileName, resolveBookFormat } from "../lib/file";
import { createId } from "../lib/id";
import { createBookCover } from "./covers";
import { buildChapterBlocks } from "./text/blocks";
import { chapterizeText } from "./text/chapterize";
import { decodeTextFile } from "./text/encoding";

export async function buildImportedBook(file: File, groupId?: string): Promise<ImportedBook> {
  const format = resolveBookFormat(file);

  if (!format) {
    throw new Error(`不支持的文件类型：${file.name}`);
  }

  const now = Date.now();
  const bookId = createId("book");
  const title = titleFromFileName(file.name);
  const cover = await createBookCover(file, format, title);
  const book = {
    id: bookId,
    title,
    fileName: file.name,
    mimeType: file.type || mimeTypeForFormat(format),
    format,
    cover,
    size: file.size,
    groupId,
    addedAt: now,
    updatedAt: now
  };

  if (format !== "txt") {
    return {
      book,
      file: {
        bookId,
        blob: file
      }
    };
  }

  const decoded = await decodeTextFile(file);
  const chapters = chapterizeText(decoded.text);
  const textBlocks = chapters.map((chapter) => ({
    chapterId: chapter.id,
    blocks: buildChapterBlocks(
      chapter,
      decoded.text.slice(chapter.start, chapter.end)
    )
  }));

  return {
    book: {
      ...book,
      encoding: decoded.encoding,
      chapterCount: chapters.length
    },
    file: {
      bookId,
      blob: file,
      textContent: decoded.text,
      chapters,
      textBlocks
    }
  };
}

function mimeTypeForFormat(format: string): string {
  if (format === "pdf") {
    return "application/pdf";
  }

  if (format === "epub") {
    return "application/epub+zip";
  }

  return "text/plain";
}
