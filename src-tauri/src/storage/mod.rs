mod derived;
mod library;
mod migrations;
mod settings;
mod types;
mod user_data;
mod util;

use std::{fs, path::PathBuf};

use anyhow::{Context, Result};
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

pub use types::{
    Annotation, BookGroup, BookRecord, Bookmark, ImportedBook, LibrarySnapshot, ReaderSettings,
    ReadingProgress, StoredBookFile, TextPaginationCache,
};

pub struct Storage {
    pub(super) files_dir: PathBuf,
    pub(super) settings_path: PathBuf,
    pub(super) library: Connection,
    pub(super) book_derived: Connection,
    pub(super) layout_derived: Connection,
}

impl Storage {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .context("failed to resolve app data directory")?;
        Self::open(data_dir)
    }

    fn open(data_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&data_dir).context("failed to create app data directory")?;

        let files_dir = data_dir.join("files");
        fs::create_dir_all(&files_dir).context("failed to create book files directory")?;
        let settings_path = data_dir.join("settings.json");

        let library = Connection::open(data_dir.join("reader.sqlite"))
            .context("failed to open reader.sqlite")?;
        let book_derived = Connection::open(data_dir.join("book-derived.sqlite"))
            .context("failed to open book-derived.sqlite")?;
        let layout_derived = Connection::open(data_dir.join("layout-derived.sqlite"))
            .context("failed to open layout-derived.sqlite")?;

        let storage = Self {
            files_dir,
            settings_path,
            library,
            book_derived,
            layout_derived,
        };
        storage.migrate()?;
        Ok(storage)
    }

    #[cfg(test)]
    fn new_for_test(data_dir: &std::path::Path) -> Result<Self> {
        Self::open(data_dir.to_path_buf())
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
    };

    use uuid::Uuid;

    use super::{
        types::{TextChapter, TextChapterBlocks, TextContentBlock, TextPage},
        BookRecord, ImportedBook, ReaderSettings, Storage, StoredBookFile, TextPaginationCache,
    };

    #[test]
    fn stores_original_file_on_disk_and_book_derived_data_in_separate_db() {
        let temp_dir = TempStorageDir::new();
        let mut storage = Storage::new_for_test(temp_dir.path()).unwrap();

        storage.add_book(sample_import()).unwrap();

        let snapshot = storage.list_library().unwrap();
        assert_eq!(snapshot.books.len(), 1);
        assert_eq!(snapshot.books[0].id, "book-test");

        let source_path = storage.source_path("book-test").unwrap().unwrap();
        assert!(source_path.starts_with(temp_dir.path().join("files")));
        assert_eq!(fs::read(&source_path).unwrap(), b"original txt bytes");

        let files_table_count: i64 = storage
            .library
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'files'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(files_table_count, 0);

        let stored = storage.get_book_file("book-test").unwrap().unwrap();
        assert_eq!(stored.bytes, b"original txt bytes");
        assert_eq!(stored.text_content.as_deref(), Some("第一章\n正文。"));
        assert_eq!(stored.chapters.unwrap()[0].title, "第一章");
        assert_eq!(stored.text_blocks.unwrap()[0].blocks[0].kind, "heading");
    }

    #[test]
    fn keeps_layout_cache_separate_and_removes_it_with_the_book() {
        let temp_dir = TempStorageDir::new();
        let mut storage = Storage::new_for_test(temp_dir.path()).unwrap();

        storage.add_book(sample_import()).unwrap();
        let source_path = storage.source_path("book-test").unwrap().unwrap();
        storage.save_text_pagination_cache(sample_cache()).unwrap();

        let cache = storage
            .get_text_pagination_cache("book-test", "chapter-1", "font:18")
            .unwrap()
            .unwrap();
        assert_eq!(cache.pages.len(), 1);

        let layout_table_count_in_book_db: i64 = storage
            .book_derived
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'text_pagination'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(layout_table_count_in_book_db, 0);

        storage.delete_book("book-test").unwrap();

        assert!(!source_path.exists());
        assert!(storage.get_book_file("book-test").unwrap().is_none());
        assert!(storage
            .get_text_pagination_cache("book-test", "chapter-1", "font:18")
            .unwrap()
            .is_none());
    }

    #[test]
    fn stores_reader_settings_in_json_file_with_epub_css_replacement_enabled_by_default() {
        let temp_dir = TempStorageDir::new();
        let mut storage = Storage::new_for_test(temp_dir.path()).unwrap();

        let defaults = storage.get_settings().unwrap().unwrap();

        assert!(defaults.replace_epub_css);
        assert_eq!(defaults.controls_auto_hide_delay, 3);
        assert!(storage.settings_path.exists());

        let settings = ReaderSettings {
            replace_epub_css: false,
            font_size: 20,
            controls_auto_hide_delay: 5,
            ..defaults
        };
        storage.save_settings(settings).unwrap();

        let content = fs::read_to_string(&storage.settings_path).unwrap();
        assert!(content.contains("\"replaceEpubCss\": false"));
        assert!(content.contains("\"controlsAutoHideDelay\": 5"));

        let reloaded = Storage::new_for_test(temp_dir.path())
            .unwrap()
            .get_settings()
            .unwrap()
            .unwrap();
        assert!(!reloaded.replace_epub_css);
        assert_eq!(reloaded.font_size, 20);
        assert_eq!(reloaded.controls_auto_hide_delay, 5);
    }

    #[test]
    fn migrates_legacy_sqlite_settings_to_json_file() {
        let temp_dir = TempStorageDir::new();
        let storage = Storage::new_for_test(temp_dir.path()).unwrap();
        storage
            .library
            .execute(
                "INSERT INTO settings (key, value_json) VALUES ('reader', ?1)",
                [r#"{"theme":"dark","fontFamily":"serif","fontSize":19,"lineHeight":1.9,"paragraphSpacing":1.2,"contentWidth":760}"#],
            )
            .unwrap();

        let migrated = storage.get_settings().unwrap().unwrap();

        assert_eq!(migrated.theme, "dark");
        assert_eq!(migrated.font_family, "serif");
        assert_eq!(migrated.font_size, 19);
        assert!(migrated.replace_epub_css);
        assert_eq!(migrated.controls_auto_hide_delay, 3);
        assert!(storage.settings_path.exists());
    }

    fn sample_import() -> ImportedBook {
        ImportedBook {
            book: BookRecord {
                id: "book-test".to_string(),
                title: "测试书".to_string(),
                author: None,
                file_name: "test.txt".to_string(),
                mime_type: "text/plain".to_string(),
                format: "txt".to_string(),
                cover: None,
                size: 18,
                group_id: None,
                encoding: Some("utf-8".to_string()),
                chapter_count: Some(1),
                added_at: 10,
                updated_at: 10,
            },
            file: StoredBookFile {
                book_id: "book-test".to_string(),
                bytes: b"original txt bytes".to_vec(),
                text_content: Some("第一章\n正文。".to_string()),
                chapters: Some(vec![TextChapter {
                    id: "chapter-1".to_string(),
                    title: "第一章".to_string(),
                    start: 0,
                    end: 18,
                    level: 1,
                }]),
                text_blocks: Some(vec![TextChapterBlocks {
                    chapter_id: "chapter-1".to_string(),
                    blocks: vec![
                        TextContentBlock {
                            kind: "heading".to_string(),
                            text: "第一章".to_string(),
                            start: 0,
                            end: 4,
                        },
                        TextContentBlock {
                            kind: "paragraph".to_string(),
                            text: "正文。".to_string(),
                            start: 4,
                            end: 10,
                        },
                    ],
                }]),
            },
        }
    }

    fn sample_cache() -> TextPaginationCache {
        TextPaginationCache {
            book_id: "book-test".to_string(),
            chapter_id: "chapter-1".to_string(),
            fingerprint: "font:18".to_string(),
            pages: vec![TextPage {
                blocks: vec![TextContentBlock {
                    kind: "paragraph".to_string(),
                    text: "正文。".to_string(),
                    start: 4,
                    end: 10,
                }],
                start_offset: 4,
                end_offset: 10,
            }],
            created_at: 20,
            updated_at: 20,
        }
    }

    struct TempStorageDir {
        path: PathBuf,
    }

    impl TempStorageDir {
        fn new() -> Self {
            Self {
                path: std::env::temp_dir().join(format!("reader-storage-test-{}", Uuid::new_v4())),
            }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempStorageDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
