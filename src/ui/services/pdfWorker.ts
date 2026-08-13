import { GlobalWorkerOptions } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";

let worker: Worker | undefined;

export function ensurePdfWorker(): void {
  if (!worker && typeof window !== "undefined") {
    worker = new PdfWorker();
    GlobalWorkerOptions.workerPort = worker;
  }
}
