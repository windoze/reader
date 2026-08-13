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

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: "light",
  fontFamily: "system",
  fontSize: 18,
  lineHeight: 1.75,
  paragraphSpacing: 1,
  contentWidth: 720
};

export interface LibraryRepository {
  listLibrary(): Promise<LibrarySnapshot>;
  addBook(imported: ImportedBook): Promise<void>;
  deleteBook(bookId: string): Promise<void>;
  updateBook(book: BookRecord): Promise<void>;
  getBookFile(bookId: string): Promise<StoredBookFile | undefined>;
  createGroup(name: string): Promise<BookGroup>;
  renameGroup(groupId: string, name: string): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;
  listBookmarks(bookId: string): Promise<Bookmark[]>;
  addBookmark(bookmark: Bookmark): Promise<void>;
  removeBookmark(bookmarkId: string): Promise<void>;
  listAnnotations(bookId: string): Promise<Annotation[]>;
  addAnnotation(annotation: Annotation): Promise<void>;
  removeAnnotation(annotationId: string): Promise<void>;
  getSettings(): Promise<ReaderSettings>;
  saveSettings(settings: ReaderSettings): Promise<void>;
  getProgress(bookId: string): Promise<ReadingProgress | undefined>;
  saveProgress(progress: ReadingProgress): Promise<void>;
}
