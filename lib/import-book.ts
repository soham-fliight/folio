import { saveNewBook } from "@/lib/db";
import { titleFromFileName } from "@/lib/format";
import { extractPdf } from "@/lib/pdf";
import type { BookRecord } from "@/lib/types";

export async function importBook(
  file: File,
  password: string | undefined,
  onProgress?: (page: number, total: number) => void,
): Promise<BookRecord> {
  const buffer = await file.arrayBuffer();
  const extracted = await extractPdf(buffer, password, onProgress);
  if (extracted.pages.length === 0) {
    throw new Error("That PDF has no pages.");
  }
  const id = crypto.randomUUID();
  const book: BookRecord = {
    id,
    title: extracted.title || titleFromFileName(file.name),
    author: extracted.author,
    fileName: file.name,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
    pageCount: extracted.pages.length,
    readPages: [],
    anchor: { sourcePage: extracted.pages[0]?.pageNumber ?? 1, offset: 0 },
    notes: [],
    password: password || undefined,
  };
  const copy = buffer.slice(0);
  await saveNewBook(book, extracted.pages, new Blob([copy], { type: "application/pdf" }));
  return book;
}
