import { BookmarkPlus, ChevronDown, Trash2 } from "lucide-react";
import type { Bookmark } from "../../../domain/types";

interface BookmarkMenuProps {
  bookmarks: Bookmark[];
  isOpen: boolean;
  onAddBookmark(): Promise<void>;
  onOpenChange(open: boolean): void;
  onRemoveBookmark(bookmarkId: string): Promise<void>;
  onSelectBookmark(bookmark: Bookmark): void;
}

export function BookmarkMenu({
  bookmarks,
  isOpen,
  onAddBookmark,
  onOpenChange,
  onRemoveBookmark,
  onSelectBookmark
}: BookmarkMenuProps) {
  const handleAddBookmark = async () => {
    await onAddBookmark();
    onOpenChange(false);
  };

  return (
    <div className="bookmark-menu" data-reader-bookmark-menu>
      <button
        aria-controls="reader-bookmark-popover"
        aria-expanded={isOpen}
        className={isOpen ? "icon-button split active" : "icon-button split"}
        title="书签"
        type="button"
        onClick={() => onOpenChange(!isOpen)}
      >
        <BookmarkPlus size={20} aria-hidden />
        <ChevronDown size={14} aria-hidden />
      </button>
      {isOpen ? (
        <div className="bookmark-popover" id="reader-bookmark-popover">
          <button
            className="primary-button full"
            type="button"
            onClick={() => void handleAddBookmark()}
          >
            <BookmarkPlus size={17} aria-hidden />
            <span>添加书签</span>
          </button>
          <div className="bookmark-list">
            {bookmarks.length === 0 ? <p>暂无书签</p> : null}
            {bookmarks.map((bookmark) => (
              <div className="bookmark-item" key={bookmark.id}>
                <button
                  className="bookmark-jump"
                  type="button"
                  onClick={() => onSelectBookmark(bookmark)}
                >
                  <strong>{bookmark.label}</strong>
                  <span>{new Date(bookmark.createdAt).toLocaleString()}</span>
                </button>
                <button
                  className="icon-button subtle"
                  title="删除书签"
                  type="button"
                  onClick={() => void onRemoveBookmark(bookmark.id)}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
