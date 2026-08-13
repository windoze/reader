import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Annotation,
  BookGroup,
  BookRecord,
  Bookmark,
  ImportedBook,
  LibrarySnapshot,
  ReaderSettings,
  ReadingProgress,
  StoredBookFile
} from "../domain/types";
import { createId } from "../lib/id";
import {
  DEFAULT_READER_SETTINGS,
  type LibraryRepository
} from "./libraryRepository";

interface SettingsRecord {
  key: "reader";
  value: ReaderSettings;
}

interface ReaderDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
    indexes: {
      "by-group": string;
      "by-added": number;
    };
  };
  files: {
    key: string;
    value: StoredBookFile;
  };
  groups: {
    key: string;
    value: BookGroup;
    indexes: {
      "by-created": number;
    };
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: {
      "by-book": string;
    };
  };
  annotations: {
    key: string;
    value: Annotation;
    indexes: {
      "by-book": string;
    };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
  progress: {
    key: string;
    value: ReadingProgress;
  };
}

let dbPromise: Promise<IDBPDatabase<ReaderDB>> | undefined;

export class BrowserLibraryRepository implements LibraryRepository {
  async listLibrary(): Promise<LibrarySnapshot> {
    const db = await getDb();
    const [books, groups] = await Promise.all([
      db.getAllFromIndex("books", "by-added"),
      db.getAllFromIndex("groups", "by-created")
    ]);

    return {
      books: books.sort((left, right) => right.addedAt - left.addedAt),
      groups: groups.sort((left, right) => left.createdAt - right.createdAt)
    };
  }

  async addBook(imported: ImportedBook): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(["books", "files"], "readwrite");
    await Promise.all([
      tx.objectStore("books").put(imported.book),
      tx.objectStore("files").put(imported.file),
      tx.done
    ]);
  }

  async deleteBook(bookId: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(
      ["books", "files", "bookmarks", "annotations", "progress"],
      "readwrite"
    );
    const [bookmarks, annotations] = await Promise.all([
      tx.objectStore("bookmarks").index("by-book").getAllKeys(bookId),
      tx.objectStore("annotations").index("by-book").getAllKeys(bookId)
    ]);

    await Promise.all([
      tx.objectStore("books").delete(bookId),
      tx.objectStore("files").delete(bookId),
      tx.objectStore("progress").delete(bookId),
      ...bookmarks.map((key) => tx.objectStore("bookmarks").delete(key)),
      ...annotations.map((key) => tx.objectStore("annotations").delete(key)),
      tx.done
    ]);
  }

  async updateBook(book: BookRecord): Promise<void> {
    const db = await getDb();
    await db.put("books", { ...book, updatedAt: Date.now() });
  }

  async getBookFile(bookId: string): Promise<StoredBookFile | undefined> {
    return (await getDb()).get("files", bookId);
  }

  async createGroup(name: string): Promise<BookGroup> {
    const group = {
      id: createId("group"),
      name: name.trim(),
      createdAt: Date.now()
    };

    await (await getDb()).add("groups", group);
    return group;
  }

  async renameGroup(groupId: string, name: string): Promise<void> {
    const db = await getDb();
    const group = await db.get("groups", groupId);

    if (!group) {
      return;
    }

    await db.put("groups", { ...group, name: name.trim() });
  }

  async deleteGroup(groupId: string): Promise<void> {
    const db = await getDb();
    const books = await db.getAllFromIndex("books", "by-group", groupId);
    const tx = db.transaction(["groups", "books"], "readwrite");

    await Promise.all([
      tx.objectStore("groups").delete(groupId),
      ...books.map((book) =>
        tx.objectStore("books").put({
          ...book,
          groupId: undefined,
          updatedAt: Date.now()
        })
      ),
      tx.done
    ]);
  }

  async listBookmarks(bookId: string): Promise<Bookmark[]> {
    const bookmarks = await (await getDb()).getAllFromIndex("bookmarks", "by-book", bookId);
    return bookmarks.sort((left, right) => right.createdAt - left.createdAt);
  }

  async addBookmark(bookmark: Bookmark): Promise<void> {
    await (await getDb()).put("bookmarks", bookmark);
  }

  async removeBookmark(bookmarkId: string): Promise<void> {
    await (await getDb()).delete("bookmarks", bookmarkId);
  }

  async listAnnotations(bookId: string): Promise<Annotation[]> {
    const annotations = await (await getDb()).getAllFromIndex("annotations", "by-book", bookId);
    return annotations.sort((left, right) => right.createdAt - left.createdAt);
  }

  async addAnnotation(annotation: Annotation): Promise<void> {
    await (await getDb()).put("annotations", annotation);
  }

  async removeAnnotation(annotationId: string): Promise<void> {
    await (await getDb()).delete("annotations", annotationId);
  }

  async getSettings(): Promise<ReaderSettings> {
    const record = await (await getDb()).get("settings", "reader");
    return {
      ...DEFAULT_READER_SETTINGS,
      ...record?.value
    };
  }

  async saveSettings(settings: ReaderSettings): Promise<void> {
    await (await getDb()).put("settings", { key: "reader", value: settings });
  }

  async getProgress(bookId: string): Promise<ReadingProgress | undefined> {
    return (await getDb()).get("progress", bookId);
  }

  async saveProgress(progress: ReadingProgress): Promise<void> {
    await (await getDb()).put("progress", progress);
  }
}

export const libraryRepository = new BrowserLibraryRepository();

function getDb(): Promise<IDBPDatabase<ReaderDB>> {
  dbPromise ??= openDB<ReaderDB>("reader-web-library", 1, {
    upgrade(db) {
      const books = db.createObjectStore("books", { keyPath: "id" });
      books.createIndex("by-group", "groupId");
      books.createIndex("by-added", "addedAt");

      db.createObjectStore("files", { keyPath: "bookId" });

      const groups = db.createObjectStore("groups", { keyPath: "id" });
      groups.createIndex("by-created", "createdAt");

      const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
      bookmarks.createIndex("by-book", "bookId");

      const annotations = db.createObjectStore("annotations", { keyPath: "id" });
      annotations.createIndex("by-book", "bookId");

      db.createObjectStore("settings", { keyPath: "key" });
      db.createObjectStore("progress", { keyPath: "bookId" });
    }
  });

  return dbPromise;
}
