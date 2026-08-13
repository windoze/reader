use std::fs;

use anyhow::{Context, Result};
use rusqlite::{params, OptionalExtension};

use super::{
    types::{
        BookGroup, BookRecord, ImportedBook, LibrarySnapshot, StoredBookFile, TextChapter,
        TextChapterBlocks,
    },
    util::{create_id, json_opt, now_millis},
    Storage,
};

impl Storage {
    pub fn list_library(&self) -> Result<LibrarySnapshot> {
        let mut books_stmt = self.library.prepare(
            "SELECT id, title, author, file_name, mime_type, format, cover_json, size,
                    group_id, encoding, chapter_count, added_at, updated_at
             FROM books
             ORDER BY added_at DESC",
        )?;
        let books = books_stmt
            .query_map([], read_book_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut groups_stmt = self
            .library
            .prepare("SELECT id, name, created_at FROM groups ORDER BY created_at ASC")?;
        let groups = groups_stmt
            .query_map([], |row| {
                Ok(BookGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(LibrarySnapshot { books, groups })
    }

    pub fn add_book(&mut self, imported: ImportedBook) -> Result<()> {
        let source_path =
            self.source_path_for(&imported.book.id, &imported.book.file_name, &imported.book.format);
        fs::write(&source_path, &imported.file.bytes)
            .with_context(|| format!("failed to write source book file {}", source_path.display()))?;

        let cover_json = json_opt(&imported.book.cover)?;
        let source_path_text = source_path.to_string_lossy().to_string();
        let tx = self.library.transaction()?;
        tx.execute(
            "INSERT OR REPLACE INTO books (
                id, title, author, file_name, mime_type, format, cover_json, size,
                group_id, encoding, chapter_count, source_path, added_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                imported.book.id,
                imported.book.title,
                imported.book.author,
                imported.book.file_name,
                imported.book.mime_type,
                imported.book.format,
                cover_json,
                imported.book.size,
                imported.book.group_id,
                imported.book.encoding,
                imported.book.chapter_count,
                source_path_text,
                imported.book.added_at,
                imported.book.updated_at
            ],
        )?;
        tx.commit()?;

        self.save_book_derived(&imported.file)
    }

    pub fn delete_book(&mut self, book_id: &str) -> Result<()> {
        if let Some(source_path) = self.source_path(book_id)? {
            let _ = fs::remove_file(source_path);
        }

        let library_tx = self.library.transaction()?;
        library_tx.execute("DELETE FROM books WHERE id = ?1", [book_id])?;
        library_tx.execute("DELETE FROM progress WHERE book_id = ?1", [book_id])?;
        library_tx.execute("DELETE FROM bookmarks WHERE book_id = ?1", [book_id])?;
        library_tx.execute("DELETE FROM annotations WHERE book_id = ?1", [book_id])?;
        library_tx.commit()?;

        let derived_tx = self.book_derived.transaction()?;
        derived_tx.execute("DELETE FROM text_contents WHERE book_id = ?1", [book_id])?;
        derived_tx.execute("DELETE FROM chapters WHERE book_id = ?1", [book_id])?;
        derived_tx.execute("DELETE FROM text_blocks WHERE book_id = ?1", [book_id])?;
        derived_tx.commit()?;

        let layout_tx = self.layout_derived.transaction()?;
        layout_tx.execute("DELETE FROM text_pagination WHERE book_id = ?1", [book_id])?;
        layout_tx.commit()?;
        Ok(())
    }

    pub fn update_book(&mut self, book: BookRecord) -> Result<()> {
        let cover_json = json_opt(&book.cover)?;
        self.library.execute(
            "UPDATE books
             SET title = ?2, author = ?3, file_name = ?4, mime_type = ?5, format = ?6,
                 cover_json = ?7, size = ?8, group_id = ?9, encoding = ?10,
                 chapter_count = ?11, added_at = ?12, updated_at = ?13
             WHERE id = ?1",
            params![
                book.id,
                book.title,
                book.author,
                book.file_name,
                book.mime_type,
                book.format,
                cover_json,
                book.size,
                book.group_id,
                book.encoding,
                book.chapter_count,
                book.added_at,
                book.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_book_file(&self, book_id: &str) -> Result<Option<StoredBookFile>> {
        let Some(source_path) = self.source_path(book_id)? else {
            return Ok(None);
        };
        let bytes = fs::read(&source_path)
            .with_context(|| format!("failed to read source book file {}", source_path.display()))?;
        let text_content: Option<String> = self
            .book_derived
            .query_row(
                "SELECT text_content FROM text_contents WHERE book_id = ?1",
                [book_id],
                |row| row.get(0),
            )
            .optional()?;
        let chapters = self.json_by_book_id::<Vec<TextChapter>>("chapters", "chapters_json", book_id)?;
        let text_blocks =
            self.json_by_book_id::<Vec<TextChapterBlocks>>("text_blocks", "blocks_json", book_id)?;

        Ok(Some(StoredBookFile {
            book_id: book_id.to_string(),
            bytes,
            text_content,
            chapters,
            text_blocks,
        }))
    }

    pub fn create_group(&mut self, name: String) -> Result<BookGroup> {
        let group = BookGroup {
            id: create_id("group"),
            name: name.trim().to_string(),
            created_at: now_millis(),
        };
        self.library.execute(
            "INSERT INTO groups (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![group.id, group.name, group.created_at],
        )?;
        Ok(group)
    }

    pub fn rename_group(&mut self, group_id: &str, name: String) -> Result<()> {
        self.library.execute(
            "UPDATE groups SET name = ?2 WHERE id = ?1",
            params![group_id, name.trim()],
        )?;
        Ok(())
    }

    pub fn delete_group(&mut self, group_id: &str) -> Result<()> {
        let tx = self.library.transaction()?;
        tx.execute("DELETE FROM groups WHERE id = ?1", [group_id])?;
        tx.execute(
            "UPDATE books SET group_id = NULL, updated_at = ?2 WHERE group_id = ?1",
            params![group_id, now_millis()],
        )?;
        tx.commit()?;
        Ok(())
    }
}

fn read_book_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BookRecord> {
    let cover_json: Option<String> = row.get(6)?;
    let cover = cover_json
        .map(|value| serde_json::from_str(&value))
        .transpose()
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;

    Ok(BookRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        file_name: row.get(3)?,
        mime_type: row.get(4)?,
        format: row.get(5)?,
        cover,
        size: row.get(7)?,
        group_id: row.get(8)?,
        encoding: row.get(9)?,
        chapter_count: row.get(10)?,
        added_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}
