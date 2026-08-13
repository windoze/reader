mod storage;

use std::sync::Mutex;

use storage::{
    Annotation, BookGroup, BookRecord, Bookmark, ImportedBook, LibrarySnapshot, ReaderSettings,
    ReadingProgress, Storage, StoredBookFile, TextPaginationCache,
};
use tauri::{Manager, State};

struct AppState {
    storage: Mutex<Storage>,
}

type CommandResult<T> = Result<T, String>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let storage = Storage::new(app.handle())?;
            app.manage(AppState {
                storage: Mutex::new(storage),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_library,
            add_book,
            delete_book,
            update_book,
            get_book_file,
            create_group,
            rename_group,
            delete_group,
            list_bookmarks,
            add_bookmark,
            remove_bookmark,
            list_annotations,
            add_annotation,
            remove_annotation,
            get_settings,
            save_settings,
            get_progress,
            save_progress,
            get_text_pagination_cache,
            save_text_pagination_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[tauri::command]
fn list_library(state: State<'_, AppState>) -> CommandResult<LibrarySnapshot> {
    with_storage(state, |storage| storage.list_library())
}

#[tauri::command]
fn add_book(state: State<'_, AppState>, imported: ImportedBook) -> CommandResult<()> {
    with_storage(state, |storage| storage.add_book(imported))
}

#[tauri::command]
fn delete_book(state: State<'_, AppState>, book_id: String) -> CommandResult<()> {
    with_storage(state, |storage| storage.delete_book(&book_id))
}

#[tauri::command]
fn update_book(state: State<'_, AppState>, book: BookRecord) -> CommandResult<()> {
    with_storage(state, |storage| storage.update_book(book))
}

#[tauri::command]
fn get_book_file(state: State<'_, AppState>, book_id: String) -> CommandResult<Option<StoredBookFile>> {
    with_storage(state, |storage| storage.get_book_file(&book_id))
}

#[tauri::command]
fn create_group(state: State<'_, AppState>, name: String) -> CommandResult<BookGroup> {
    with_storage(state, |storage| storage.create_group(name))
}

#[tauri::command]
fn rename_group(state: State<'_, AppState>, group_id: String, name: String) -> CommandResult<()> {
    with_storage(state, |storage| storage.rename_group(&group_id, name))
}

#[tauri::command]
fn delete_group(state: State<'_, AppState>, group_id: String) -> CommandResult<()> {
    with_storage(state, |storage| storage.delete_group(&group_id))
}

#[tauri::command]
fn list_bookmarks(state: State<'_, AppState>, book_id: String) -> CommandResult<Vec<Bookmark>> {
    with_storage(state, |storage| storage.list_bookmarks(&book_id))
}

#[tauri::command]
fn add_bookmark(state: State<'_, AppState>, bookmark: Bookmark) -> CommandResult<()> {
    with_storage(state, |storage| storage.add_bookmark(bookmark))
}

#[tauri::command]
fn remove_bookmark(state: State<'_, AppState>, bookmark_id: String) -> CommandResult<()> {
    with_storage(state, |storage| storage.remove_bookmark(&bookmark_id))
}

#[tauri::command]
fn list_annotations(state: State<'_, AppState>, book_id: String) -> CommandResult<Vec<Annotation>> {
    with_storage(state, |storage| storage.list_annotations(&book_id))
}

#[tauri::command]
fn add_annotation(state: State<'_, AppState>, annotation: Annotation) -> CommandResult<()> {
    with_storage(state, |storage| storage.add_annotation(annotation))
}

#[tauri::command]
fn remove_annotation(state: State<'_, AppState>, annotation_id: String) -> CommandResult<()> {
    with_storage(state, |storage| storage.remove_annotation(&annotation_id))
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> CommandResult<Option<ReaderSettings>> {
    with_storage(state, |storage| storage.get_settings())
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: ReaderSettings) -> CommandResult<()> {
    with_storage(state, |storage| storage.save_settings(settings))
}

#[tauri::command]
fn get_progress(state: State<'_, AppState>, book_id: String) -> CommandResult<Option<ReadingProgress>> {
    with_storage(state, |storage| storage.get_progress(&book_id))
}

#[tauri::command]
fn save_progress(state: State<'_, AppState>, progress: ReadingProgress) -> CommandResult<()> {
    with_storage(state, |storage| storage.save_progress(progress))
}

#[tauri::command]
fn get_text_pagination_cache(
    state: State<'_, AppState>,
    book_id: String,
    chapter_id: String,
    fingerprint: String,
) -> CommandResult<Option<TextPaginationCache>> {
    with_storage(state, |storage| {
        storage.get_text_pagination_cache(&book_id, &chapter_id, &fingerprint)
    })
}

#[tauri::command]
fn save_text_pagination_cache(
    state: State<'_, AppState>,
    cache: TextPaginationCache,
) -> CommandResult<()> {
    with_storage(state, |storage| storage.save_text_pagination_cache(cache))
}

fn with_storage<T>(
    state: State<'_, AppState>,
    action: impl FnOnce(&mut Storage) -> anyhow::Result<T>,
) -> CommandResult<T> {
    let mut storage = state
        .storage
        .lock()
        .map_err(|_| "storage lock poisoned".to_string())?;

    action(&mut storage).map_err(|error| error.to_string())
}
