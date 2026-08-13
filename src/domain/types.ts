export type BookFormat = "epub" | "pdf" | "txt";

export type ThemeMode = "light" | "dark";

export type BookCoverKind = "generated" | "embedded" | "pdf";

export interface BookCover {
  kind: BookCoverKind;
  dataUrl: string;
}

export type ReaderLocator =
  | {
      kind: "txt";
      chapterId: string;
      offset: number;
      percentage: number;
    }
  | {
      kind: "pdf";
      page: number;
      percentage: number;
    }
  | {
      kind: "epub";
      cfi: string;
      chapterId?: string;
      offset?: number;
      percentage?: number;
    };

export interface TextChapter {
  id: string;
  title: string;
  start: number;
  end: number;
  level: number;
}

export interface BookRecord {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  mimeType: string;
  format: BookFormat;
  cover?: BookCover;
  size: number;
  groupId?: string;
  encoding?: string;
  chapterCount?: number;
  addedAt: number;
  updatedAt: number;
}

export interface StoredBookFile {
  bookId: string;
  blob: Blob;
  textContent?: string;
  chapters?: TextChapter[];
}

export interface BookGroup {
  id: string;
  name: string;
  createdAt: number;
}

export interface ReaderSettings {
  theme: ThemeMode;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  contentWidth: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  label: string;
  locator: ReaderLocator;
  chapterTitle?: string;
  excerpt?: string;
  createdAt: number;
}

export interface Annotation {
  id: string;
  bookId: string;
  text: string;
  note: string;
  color: string;
  locator: ReaderLocator;
  chapterTitle?: string;
  createdAt: number;
}

export interface ReadingProgress {
  bookId: string;
  locator: ReaderLocator;
  updatedAt: number;
}

export interface ImportedBook {
  book: BookRecord;
  file: StoredBookFile;
}

export interface LibrarySnapshot {
  books: BookRecord[];
  groups: BookGroup[];
}
