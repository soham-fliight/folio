import { cleanMeta } from "@/lib/format";
import { storedPageFromItems } from "@/lib/text";
import type { RawTextItem, StoredPage } from "@/lib/types";

export class PdfPasswordError extends Error {
  incorrect: boolean;
  constructor(incorrect: boolean) {
    super(incorrect ? "That password did not open the book." : "This PDF is locked.");
    this.name = "PdfPasswordError";
    this.incorrect = incorrect;
  }
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import("pdfjs-dist");
      if (!lib.GlobalWorkerOptions.workerSrc) {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        const response = await fetch(`${base}/pdf.worker.min.mjs`);
        if (!response.ok) throw new Error("The PDF worker failed to load.");
        const blob = new Blob([await response.arrayBuffer()], { type: "text/javascript" });
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      }
      return lib;
    })();
  }
  return pdfjsPromise;
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function extractPdf(
  data: ArrayBuffer,
  password: string | undefined,
  onProgress?: (page: number, total: number) => void,
): Promise<{ title: string; author: string; pages: StoredPage[] }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: data.slice(0), password });
  try {
    const doc = await task.promise;
    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: unknown; Author?: unknown };
    const pages: StoredPage[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      onProgress?.(number, doc.numPages);
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const items: RawTextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        items.push({
          str: item.str,
          transform: item.transform as number[],
          width: item.width,
          height: item.height,
          hasEOL: item.hasEOL,
        });
      }
      pages.push(storedPageFromItems(number, items));
      page.cleanup();
    }
    await closePdf(doc);
    return {
      title: cleanMeta(info.Title),
      author: cleanMeta(info.Author),
      pages,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      const code = (error as { code?: number }).code;
      throw new PdfPasswordError(code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw error;
  }
}

export async function closePdf(doc: { cleanup: () => Promise<unknown>; loadingTask: { destroy: () => Promise<void> } }) {
  await doc.cleanup().catch(() => undefined);
  await doc.loadingTask.destroy().catch(() => undefined);
}

export async function openPdfDocument(data: ArrayBuffer, password?: string) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data, password });
  return task.promise;
}

export async function renderPageImage(
  doc: Awaited<ReturnType<typeof openPdfDocument>>,
  pageNumber: number,
  maxWidth: number,
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.max(1, maxWidth / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({ canvas, viewport });
  await task.promise;
  const url = canvas.toDataURL("image/jpeg", 0.86);
  page.cleanup();
  return url;
}
