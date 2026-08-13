import { BrowserLibraryRepository } from "./browserLibraryRepository";
import type { LibraryRepository } from "./libraryRepository";
import { TauriLibraryRepository } from "./tauriLibraryRepository";

export const libraryRepository: LibraryRepository = isTauriRuntime()
  ? new TauriLibraryRepository()
  : new BrowserLibraryRepository();

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
