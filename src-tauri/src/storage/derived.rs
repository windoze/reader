use std::path::{Path, PathBuf};

use anyhow::Result;
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;

use super::{types::StoredBookFile, Storage};

impl Storage {
    pub(super) fn save_book_derived(&mut self, file: &StoredBookFile) -> Result<()> {
        let tx = self.book_derived.transaction()?;

        if let Some(text_content) = &file.text_content {
            tx.execute(
                "INSERT OR REPLACE INTO text_contents (book_id, text_content)
                 VALUES (?1, ?2)",
                params![file.book_id, text_content],
            )?;
        }

        if let Some(chapters) = &file.chapters {
            tx.execute(
                "INSERT OR REPLACE INTO chapters (book_id, chapters_json)
                 VALUES (?1, ?2)",
                params![file.book_id, serde_json::to_string(chapters)?],
            )?;
        }

        if let Some(text_blocks) = &file.text_blocks {
            tx.execute(
                "INSERT OR REPLACE INTO text_blocks (book_id, blocks_json)
                 VALUES (?1, ?2)",
                params![file.book_id, serde_json::to_string(text_blocks)?],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    pub(super) fn source_path(&self, book_id: &str) -> Result<Option<PathBuf>> {
        let value: Option<String> = self
            .library
            .query_row(
                "SELECT source_path FROM books WHERE id = ?1",
                [book_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(value.map(PathBuf::from))
    }

    pub(super) fn source_path_for(&self, book_id: &str, file_name: &str, format: &str) -> PathBuf {
        let extension = Path::new(file_name)
            .extension()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .unwrap_or(format);
        self.files_dir.join(format!("{book_id}.{extension}"))
    }

    pub(super) fn json_by_book_id<T: for<'de> Deserialize<'de>>(
        &self,
        table: &str,
        column: &str,
        book_id: &str,
    ) -> Result<Option<T>> {
        let sql = format!("SELECT {column} FROM {table} WHERE book_id = ?1");
        let json: Option<String> = self
            .book_derived
            .query_row(&sql, [book_id], |row| row.get(0))
            .optional()?;
        json.map(|value| serde_json::from_str(&value).map_err(Into::into))
            .transpose()
    }
}
