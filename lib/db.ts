import { openDB, type DBSchema } from "idb";
import type { BookRecord, StoredPage } from "@/lib/types";

interface FolioDB extends DBSchema {
  books: { key: string; value: BookRecord };
  texts: { key: string; value: StoredPage[] };
  files: { key: string; value: Blob };
}

function db() {
  return openDB<FolioDB>("folio", 1, {
    upgrade(database) {
      database.createObjectStore("books");
      database.createObjectStore("texts");
      database.createObjectStore("files");
    },
  });
}

export async function listBooks(): Promise<BookRecord[]> {
  const database = await db();
  const books = await database.getAll("books");
  return books.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  return (await db()).get("books", id);
}

export async function getText(id: string): Promise<StoredPage[] | undefined> {
  return (await db()).get("texts", id);
}

export async function getFile(id: string): Promise<Blob | undefined> {
  return (await db()).get("files", id);
}

export async function saveNewBook(book: BookRecord, pages: StoredPage[], file: Blob): Promise<void> {
  const database = await db();
  const tx = database.transaction(["books", "texts", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("books").put(book, book.id),
    tx.objectStore("texts").put(pages, book.id),
    tx.objectStore("files").put(file, book.id),
    tx.done,
  ]);
}

export async function updateBook(book: BookRecord): Promise<void> {
  await (await db()).put("books", book, book.id);
}

export async function deleteBook(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(["books", "texts", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("books").delete(id),
    tx.objectStore("texts").delete(id),
    tx.objectStore("files").delete(id),
    tx.done,
  ]);
}
