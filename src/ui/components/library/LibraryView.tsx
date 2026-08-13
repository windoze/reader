import type { BookRecord, LibrarySnapshot } from "../../domain/types";
import { BookGrid } from "./BookGrid";
import { ShelfSidebar } from "./ShelfSidebar";
import { UploadDropzone } from "./UploadDropzone";

interface LibraryViewProps {
  library: LibrarySnapshot;
  selectedGroupId: string | "all";
  isBusy: boolean;
  message?: string;
  onSelectGroup(groupId: string | "all"): void;
  onCreateGroup(name: string): Promise<void>;
  onDeleteGroup(groupId: string): Promise<void>;
  onImport(files: File[], groupId?: string): Promise<void>;
  onOpenBook(bookId: string): void;
  onUpdateBook(book: BookRecord): Promise<void>;
  onDeleteBook(bookId: string): Promise<void>;
}

export function LibraryView({
  library,
  selectedGroupId,
  isBusy,
  message,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup,
  onImport,
  onOpenBook,
  onUpdateBook,
  onDeleteBook
}: LibraryViewProps) {
  const selectedGroup = library.groups.find((group) => group.id === selectedGroupId);
  const books =
    selectedGroupId === "all"
      ? library.books
      : library.books.filter((book) => book.groupId === selectedGroupId);

  return (
    <main className="library-shell">
      <ShelfSidebar
        groups={library.groups}
        books={library.books}
        selectedGroupId={selectedGroupId}
        onSelectGroup={onSelectGroup}
        onCreateGroup={onCreateGroup}
        onDeleteGroup={onDeleteGroup}
      />
      <section className="library-main">
        <header className="library-header">
          <div>
            <p className="eyebrow">书架</p>
            <h1>{selectedGroup?.name ?? "全部图书"}</h1>
          </div>
          <UploadDropzone
            disabled={isBusy}
            groupId={selectedGroupId === "all" ? undefined : selectedGroupId}
            onImport={onImport}
          />
        </header>

        {message ? <p className="status-line">{message}</p> : null}

        <BookGrid
          books={books}
          groups={library.groups}
          isBusy={isBusy}
          onOpenBook={onOpenBook}
          onUpdateBook={onUpdateBook}
          onDeleteBook={onDeleteBook}
        />
      </section>
    </main>
  );
}
