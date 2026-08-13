use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use super::{
    types::{Annotation, Bookmark, ReadingProgress, TextPaginationCache},
    util::json_value,
    Storage,
};

impl Storage {
    pub fn list_bookmarks(&self, book_id: &str) -> Result<Vec<Bookmark>> {
        let mut stmt = self.library.prepare(
            "SELECT id, book_id, label, locator_json, chapter_title, excerpt, created_at
             FROM bookmarks WHERE book_id = ?1 ORDER BY created_at DESC",
        )?;
        let bookmarks = stmt
            .query_map([book_id], |row| {
                Ok(Bookmark {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    label: row.get(2)?,
                    locator: json_value(row.get::<_, String>(3)?)?,
                    chapter_title: row.get(4)?,
                    excerpt: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(bookmarks)
    }

    pub fn add_bookmark(&mut self, bookmark: Bookmark) -> Result<()> {
        self.library.execute(
            "INSERT OR REPLACE INTO bookmarks
                (id, book_id, label, locator_json, chapter_title, excerpt, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                bookmark.id,
                bookmark.book_id,
                bookmark.label,
                serde_json::to_string(&bookmark.locator)?,
                bookmark.chapter_title,
                bookmark.excerpt,
                bookmark.created_at
            ],
        )?;
        Ok(())
    }

    pub fn remove_bookmark(&mut self, bookmark_id: &str) -> Result<()> {
        self.library
            .execute("DELETE FROM bookmarks WHERE id = ?1", [bookmark_id])?;
        Ok(())
    }

    pub fn list_annotations(&self, book_id: &str) -> Result<Vec<Annotation>> {
        let mut stmt = self.library.prepare(
            "SELECT id, book_id, text, note, color, locator_json, chapter_title, created_at
             FROM annotations WHERE book_id = ?1 ORDER BY created_at DESC",
        )?;
        let annotations = stmt
            .query_map([book_id], |row| {
                Ok(Annotation {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    text: row.get(2)?,
                    note: row.get(3)?,
                    color: row.get(4)?,
                    locator: json_value(row.get::<_, String>(5)?)?,
                    chapter_title: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(annotations)
    }

    pub fn add_annotation(&mut self, annotation: Annotation) -> Result<()> {
        self.library.execute(
            "INSERT OR REPLACE INTO annotations
                (id, book_id, text, note, color, locator_json, chapter_title, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                annotation.id,
                annotation.book_id,
                annotation.text,
                annotation.note,
                annotation.color,
                serde_json::to_string(&annotation.locator)?,
                annotation.chapter_title,
                annotation.created_at
            ],
        )?;
        Ok(())
    }

    pub fn remove_annotation(&mut self, annotation_id: &str) -> Result<()> {
        self.library
            .execute("DELETE FROM annotations WHERE id = ?1", [annotation_id])?;
        Ok(())
    }

    pub fn get_progress(&self, book_id: &str) -> Result<Option<ReadingProgress>> {
        self.library
            .query_row(
                "SELECT book_id, locator_json, updated_at FROM progress WHERE book_id = ?1",
                [book_id],
                |row| {
                    Ok(ReadingProgress {
                        book_id: row.get(0)?,
                        locator: json_value(row.get::<_, String>(1)?)?,
                        updated_at: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn save_progress(&mut self, progress: ReadingProgress) -> Result<()> {
        self.library.execute(
            "INSERT OR REPLACE INTO progress (book_id, locator_json, updated_at)
             VALUES (?1, ?2, ?3)",
            params![
                progress.book_id,
                serde_json::to_string(&progress.locator)?,
                progress.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_text_pagination_cache(
        &self,
        book_id: &str,
        chapter_id: &str,
        fingerprint: &str,
    ) -> Result<Option<TextPaginationCache>> {
        self.layout_derived
            .query_row(
                "SELECT book_id, chapter_id, fingerprint, pages_json, created_at, updated_at
                 FROM text_pagination
                 WHERE book_id = ?1 AND chapter_id = ?2 AND fingerprint = ?3",
                params![book_id, chapter_id, fingerprint],
                |row| {
                    Ok(TextPaginationCache {
                        book_id: row.get(0)?,
                        chapter_id: row.get(1)?,
                        fingerprint: row.get(2)?,
                        pages: json_value(row.get::<_, String>(3)?)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn save_text_pagination_cache(&mut self, cache: TextPaginationCache) -> Result<()> {
        self.layout_derived.execute(
            "INSERT OR REPLACE INTO text_pagination
                (book_id, chapter_id, fingerprint, pages_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                cache.book_id,
                cache.chapter_id,
                cache.fingerprint,
                serde_json::to_string(&cache.pages)?,
                cache.created_at,
                cache.updated_at
            ],
        )?;
        Ok(())
    }
}
