use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BookCover {
    pub kind: String,
    pub data_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextChapter {
    pub id: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub level: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextContentBlock {
    pub kind: String,
    pub text: String,
    pub start: i64,
    pub end: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextChapterBlocks {
    pub chapter_id: String,
    pub blocks: Vec<TextContentBlock>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BookRecord {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub file_name: String,
    pub mime_type: String,
    pub format: String,
    pub cover: Option<BookCover>,
    pub size: i64,
    pub group_id: Option<String>,
    pub encoding: Option<String>,
    pub chapter_count: Option<i64>,
    pub added_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredBookFile {
    pub book_id: String,
    pub bytes: Vec<u8>,
    pub text_content: Option<String>,
    pub chapters: Option<Vec<TextChapter>>,
    pub text_blocks: Option<Vec<TextChapterBlocks>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportedBook {
    pub book: BookRecord,
    pub file: StoredBookFile,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BookGroup {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReaderSettings {
    pub theme: String,
    pub font_family: String,
    pub font_size: i64,
    pub line_height: f64,
    pub paragraph_spacing: f64,
    pub content_width: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: String,
    pub book_id: String,
    pub label: String,
    pub locator: serde_json::Value,
    pub chapter_title: Option<String>,
    pub excerpt: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub book_id: String,
    pub text: String,
    pub note: String,
    pub color: String,
    pub locator: serde_json::Value,
    pub chapter_title: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub book_id: String,
    pub locator: serde_json::Value,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub books: Vec<BookRecord>,
    pub groups: Vec<BookGroup>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextPage {
    pub blocks: Vec<TextContentBlock>,
    pub start_offset: i64,
    pub end_offset: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextPaginationCache {
    pub book_id: String,
    pub chapter_id: String,
    pub fingerprint: String,
    pub pages: Vec<TextPage>,
    pub created_at: i64,
    pub updated_at: i64,
}
