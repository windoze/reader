import type { BookFormat } from "../domain/types";

const EXTENSION_TO_FORMAT: Record<string, BookFormat> = {
  epub: "epub",
  pdf: "pdf",
  txt: "txt"
};

export function resolveBookFormat(file: File): BookFormat | undefined {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && extension in EXTENSION_TO_FORMAT) {
    return EXTENSION_TO_FORMAT[extension];
  }

  if (file.type === "application/pdf") {
    return "pdf";
  }

  if (file.type === "application/epub+zip") {
    return "epub";
  }

  if (file.type.startsWith("text/")) {
    return "txt";
  }

  return undefined;
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || fileName;
}

export function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
