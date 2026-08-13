use anyhow::Result;

use super::Storage;

impl Storage {
    pub(super) fn migrate(&self) -> Result<()> {
        self.library.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                author TEXT,
                file_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                format TEXT NOT NULL,
                cover_json TEXT,
                size INTEGER NOT NULL,
                group_id TEXT,
                encoding TEXT,
                chapter_count INTEGER,
                source_path TEXT NOT NULL,
                added_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_books_group ON books(group_id);
            CREATE INDEX IF NOT EXISTS idx_books_added ON books(added_at);

            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bookmarks (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                label TEXT NOT NULL,
                locator_json TEXT NOT NULL,
                chapter_title TEXT,
                excerpt TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);

            CREATE TABLE IF NOT EXISTS annotations (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                text TEXT NOT NULL,
                note TEXT NOT NULL,
                color TEXT NOT NULL,
                locator_json TEXT NOT NULL,
                chapter_title TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS progress (
                book_id TEXT PRIMARY KEY,
                locator_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            ",
        )?;

        self.book_derived.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS text_contents (
                book_id TEXT PRIMARY KEY,
                text_content TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chapters (
                book_id TEXT PRIMARY KEY,
                chapters_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS text_blocks (
                book_id TEXT PRIMARY KEY,
                blocks_json TEXT NOT NULL
            );
            ",
        )?;

        self.layout_derived.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS text_pagination (
                book_id TEXT NOT NULL,
                chapter_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                pages_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (book_id, chapter_id, fingerprint)
            );
            CREATE INDEX IF NOT EXISTS idx_text_pagination_book ON text_pagination(book_id);
            ",
        )?;

        Ok(())
    }
}
