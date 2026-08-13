import { BookOpen, MoreHorizontal, Trash2 } from "lucide-react";
import type { BookGroup, BookRecord } from "../../domain/types";
import { formatFileSize } from "../../lib/file";
import { coverDataUrlForBook } from "../../services/covers";

interface BookGridProps {
  books: BookRecord[];
  groups: BookGroup[];
  isBusy: boolean;
  onOpenBook(bookId: string): void;
  onUpdateBook(book: BookRecord): Promise<void>;
  onDeleteBook(bookId: string): Promise<void>;
}

export function BookGrid({
  books,
  groups,
  isBusy,
  onOpenBook,
  onUpdateBook,
  onDeleteBook
}: BookGridProps) {
  if (books.length === 0) {
    return (
      <div className="empty-library">
        <BookOpen size={42} aria-hidden />
        <h2>没有图书</h2>
        <p>上传 EPUB、PDF 或 TXT 后会显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="book-grid">
      {books.map((book) => (
        <article className="book-card" key={book.id}>
          <button className={`book-cover ${book.format}`} type="button" onClick={() => onOpenBook(book.id)}>
            <img alt={`${book.title} 封面`} loading="lazy" src={coverDataUrlForBook(book)} />
          </button>
          <div className="book-meta">
            <button className="book-title" type="button" onClick={() => onOpenBook(book.id)}>
              {book.title}
            </button>
            <p>
              {formatFileSize(book.size)}
              {book.chapterCount ? ` · ${book.chapterCount} 章` : ""}
              {book.encoding ? ` · ${book.encoding.toUpperCase()}` : ""}
            </p>
          </div>
          <div className="book-actions">
            <select
              aria-label={`设置 ${book.title} 的分组`}
              disabled={isBusy}
              value={book.groupId ?? ""}
              onChange={(event) =>
                void onUpdateBook({
                  ...book,
                  groupId: event.target.value || undefined
                })
              }
            >
              <option value="">未分组</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button className="icon-button subtle" title="更多" type="button">
              <MoreHorizontal size={17} aria-hidden />
            </button>
            <button
              className="icon-button danger"
              title="删除图书"
              type="button"
              onClick={() => void onDeleteBook(book.id)}
            >
              <Trash2 size={17} aria-hidden />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
