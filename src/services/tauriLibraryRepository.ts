import { invoke } from "@tauri-apps/api/core";
import type {
  Annotation,
  BookGroup,
  BookRecord,
  Bookmark,
  ImportedBook,
  LibrarySnapshot,
  ReaderSettings,
  ReadingProgress,
  StoredBookFile,
  TextChapter,
  TextChapterBlocks,
  TextPaginationCache
} from "../domain/types";
import {
  DEFAULT_READER_SETTINGS,
  type LibraryRepository
} from "./libraryRepository";

interface TauriStoredBookFile {
  bookId: string;
  bytes: number[];
  textContent?: string;
  chapters?: TextChapter[];
  textBlocks?: TextChapterBlocks[];
}

interface TauriStoredBookFilePayload extends Omit<TauriStoredBookFile, "bytes"> {
  bytes: number[];
}

interface TauriImportedBook {
  book: BookRecord;
  file: TauriStoredBookFilePayload;
}

export class TauriLibraryRepository implements LibraryRepository {
  async listLibrary(): Promise<LibrarySnapshot> {
    return invoke<LibrarySnapshot>("list_library");
  }

  async addBook(imported: ImportedBook): Promise<void> {
    await invoke("add_book", {
      imported: await toTauriImportedBook(imported)
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    await invoke("delete_book", { bookId });
  }

  async updateBook(book: BookRecord): Promise<void> {
    await invoke("update_book", {
      book: {
        ...book,
        updatedAt: Date.now()
      }
    });
  }

  async getBookFile(bookId: string): Promise<StoredBookFile | undefined> {
    const stored = await invoke<TauriStoredBookFile | null>("get_book_file", { bookId });

    if (!stored) {
      return undefined;
    }

    const bytes = new Uint8Array(stored.bytes);

    return {
      bookId: stored.bookId,
      blob: new Blob([bytes]),
      textContent: stored.textContent,
      chapters: stored.chapters,
      textBlocks: stored.textBlocks
    };
  }

  async createGroup(name: string): Promise<BookGroup> {
    return invoke<BookGroup>("create_group", { name });
  }

  async renameGroup(groupId: string, name: string): Promise<void> {
    await invoke("rename_group", { groupId, name });
  }

  async deleteGroup(groupId: string): Promise<void> {
    await invoke("delete_group", { groupId });
  }

  async listBookmarks(bookId: string): Promise<Bookmark[]> {
    return invoke<Bookmark[]>("list_bookmarks", { bookId });
  }

  async addBookmark(bookmark: Bookmark): Promise<void> {
    await invoke("add_bookmark", { bookmark });
  }

  async removeBookmark(bookmarkId: string): Promise<void> {
    await invoke("remove_bookmark", { bookmarkId });
  }

  async listAnnotations(bookId: string): Promise<Annotation[]> {
    return invoke<Annotation[]>("list_annotations", { bookId });
  }

  async addAnnotation(annotation: Annotation): Promise<void> {
    await invoke("add_annotation", { annotation });
  }

  async removeAnnotation(annotationId: string): Promise<void> {
    await invoke("remove_annotation", { annotationId });
  }

  async getSettings(): Promise<ReaderSettings> {
    const settings = await invoke<Partial<ReaderSettings> | null>("get_settings");

    return {
      ...DEFAULT_READER_SETTINGS,
      ...settings
    };
  }

  async saveSettings(settings: ReaderSettings): Promise<void> {
    await invoke("save_settings", { settings });
  }

  async getProgress(bookId: string): Promise<ReadingProgress | undefined> {
    return (await invoke<ReadingProgress | null>("get_progress", { bookId })) ?? undefined;
  }

  async saveProgress(progress: ReadingProgress): Promise<void> {
    await invoke("save_progress", { progress });
  }

  async getTextPaginationCache(
    bookId: string,
    chapterId: string,
    fingerprint: string
  ): Promise<TextPaginationCache | undefined> {
    return (
      (await invoke<TextPaginationCache | null>("get_text_pagination_cache", {
        bookId,
        chapterId,
        fingerprint
      })) ?? undefined
    );
  }

  async saveTextPaginationCache(cache: TextPaginationCache): Promise<void> {
    await invoke("save_text_pagination_cache", { cache });
  }
}

async function toTauriImportedBook(imported: ImportedBook): Promise<TauriImportedBook> {
  const bytes = new Uint8Array(await imported.file.blob.arrayBuffer());

  return {
    book: imported.book,
    file: {
      bookId: imported.file.bookId,
      bytes: Array.from(bytes),
      textContent: imported.file.textContent,
      chapters: imported.file.chapters,
      textBlocks: imported.file.textBlocks
    }
  };
}
