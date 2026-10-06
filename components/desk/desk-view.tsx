"use client";

import { useRouter } from "next/navigation";
import { bookPath } from "@/lib/routes";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookCover } from "@/components/desk/book-cover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteBook, listBooks } from "@/lib/db";
import { importBook } from "@/lib/import-book";
import { isPdfFile, PdfPasswordError } from "@/lib/pdf";
import { SAMPLE_AUTHOR, SAMPLE_FILE_NAME, SAMPLE_TITLE, sampleFile } from "@/lib/sample-pdf";
import type { BookRecord } from "@/lib/types";

type ImportState =
  | { kind: "idle" }
  | { kind: "working"; name: string; page: number; total: number }
  | { kind: "password"; file: File; incorrect: boolean }
  | { kind: "error"; message: string };

const sampleRecord: BookRecord = {
  id: "sample",
  title: SAMPLE_TITLE,
  author: SAMPLE_AUTHOR,
  fileName: SAMPLE_FILE_NAME,
  addedAt: 0,
  lastOpenedAt: 0,
  pageCount: 0,
  readPages: [],
  anchor: { sourcePage: 1, offset: 0 },
  notes: [],
};

export function DeskView() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<File[]>([]);
  const openAfterRef = useRef(false);
  const enqueueRef = useRef<(files: File[], openFirst: boolean) => void>(() => {});
  const [books, setBooks] = useState<BookRecord[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BookRecord | null>(null);
  const dragDepth = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setBooks(await listBooks());
      setLoadError("");
    } catch {
      setLoadError("This browser blocked local storage, so the desk cannot keep its books.");
      setBooks([]);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const takeNext = useCallback(async () => {
    let failure = "";
    while (queueRef.current.length) {
      const file = queueRef.current[0];
      if (!isPdfFile(file)) {
        queueRef.current.shift();
        failure = `${file.name} is not a PDF. Folio sets type from PDF files.`;
        continue;
      }
      setImportState({ kind: "working", name: file.name, page: 0, total: 0 });
      try {
        const book = await importBook(file, undefined, (page, total) => {
          setImportState({ kind: "working", name: file.name, page, total });
        });
        queueRef.current.shift();
        if (openAfterRef.current && queueRef.current.length === 0) {
          openAfterRef.current = false;
          router.push(bookPath(book.id));
          return;
        }
      } catch (error) {
        if (error instanceof PdfPasswordError) {
          setPassword("");
          setImportState({ kind: "password", file, incorrect: error.incorrect });
          return;
        }
        queueRef.current.shift();
        openAfterRef.current = false;
        failure = "Folio could not open that file. It may be damaged, or it may not be a PDF.";
      }
    }
    openAfterRef.current = false;
    setImportState(failure ? { kind: "error", message: failure } : { kind: "idle" });
    await refresh();
  }, [refresh, router]);

  function enqueue(files: File[], openFirst: boolean) {
    if (!files.length) return;
    const idle = importState.kind === "idle" || importState.kind === "error";
    const wasWaiting = queueRef.current.length === 0 && idle;
    queueRef.current.push(...files);
    if (wasWaiting) openAfterRef.current = openFirst && files.length === 1;
    if (wasWaiting) void takeNext();
  }

  useEffect(() => {
    enqueueRef.current = enqueue;
  });

  async function submitPassword() {
    if (importState.kind !== "password") return;
    const file = importState.file;
    setImportState({ kind: "working", name: file.name, page: 0, total: 0 });
    try {
      const book = await importBook(file, password, (page, total) => {
        setImportState({ kind: "working", name: file.name, page, total });
      });
      queueRef.current.shift();
      setPassword("");
      if (openAfterRef.current && queueRef.current.length === 0) {
        openAfterRef.current = false;
        router.push(bookPath(book.id));
        return;
      }
      await takeNext();
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        setImportState({ kind: "password", file, incorrect: true });
        return;
      }
      queueRef.current.shift();
      openAfterRef.current = false;
      setImportState({
        kind: "error",
        message: "Folio could not open that file. It may be damaged, or it may not be a PDF.",
      });
    }
  }

  function cancelPassword() {
    queueRef.current.shift();
    openAfterRef.current = false;
    setPassword("");
    void takeNext();
  }

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      enqueueRef.current(Array.from(event.dataTransfer.files), true);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const hasSample = books?.some((book) => book.fileName === SAMPLE_FILE_NAME) ?? false;
  const pagesRead = books?.reduce((sum, book) => sum + book.readPages.length, 0) ?? 0;
  const working = importState.kind === "working";
  const progress =
    working && importState.total > 0 ? Math.round((importState.page / importState.total) * 100) : 8;

  return (
    <div className="folio-desk" data-testid="desk">
      <div className="folio-lamp" aria-hidden />
      <header className="topbar">
        <div className="brand">
          <p className="brand-kicker">A reading desk</p>
          <h1 className="brand-mark">Folio</h1>
        </div>
        <p className="quiet-note">
          {books === null
            ? "Looking through the desk…"
            : books.length === 0
              ? "Books stay in this browser."
              : `${books.length === 1 ? "One book" : `${books.length} books`} · ${pagesRead} ${pagesRead === 1 ? "page" : "pages"} read`}
        </p>
      </header>

      <main className="desk-main">
        {loadError ? <p className="error-banner">{loadError}</p> : null}
        {importState.kind === "error" ? (
          <p className="error-banner">
            {importState.message}{" "}
            <button type="button" className="text-button" onClick={() => setImportState({ kind: "idle" })}>
              Dismiss
            </button>
          </p>
        ) : null}

        <section className="shelf-wrap" aria-label="Shelf">
          <h2 className="shelf-label">On the shelf</h2>
          {books === null ? (
            <p className="shelf-waiting">Looking through the desk…</p>
          ) : (
            <div className="shelf-row">
              {books.map((book) => (
                <BookCover
                  key={book.id}
                  book={book}
                  onOpen={() => router.push(bookPath(book.id))}
                  onRemove={() => setPendingDelete(book)}
                />
              ))}
              {!hasSample ? (
                <BookCover
                  book={sampleRecord}
                  sample
                  onOpen={() => {
                    const existing = books.find((book) => book.fileName === SAMPLE_FILE_NAME);
                    if (existing) router.push(bookPath(existing.id));
                    else enqueue([sampleFile()], true);
                  }}
                />
              ) : null}
              {books.length === 0 && hasSample ? <p className="shelf-waiting">The shelf is clear.</p> : null}
            </div>
          )}
          <div className="shelf-plank" aria-hidden />
        </section>

        <section className={`blotter ${dragging ? "is-dragging" : ""}`} aria-label="Add a PDF">
          {working ? (
            <>
              <p className="blotter-kicker">Setting the type</p>
              <h2 className="blotter-title">{importState.name}</h2>
              <p className="blotter-copy">
                {importState.total > 0
                  ? `Page ${importState.page} of ${importState.total}`
                  : "Opening the file…"}
              </p>
              <div className="progress-track" aria-hidden>
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              <p className="blotter-kicker">{dragging ? "Let it fall" : "Lay a book down"}</p>
              <h2 className="blotter-title">
                {books && books.length > 0 ? "Add another PDF" : "Drop a PDF on the wood"}
              </h2>
              <p className="blotter-copy">
                Folio lifts the type onto paper pages you turn, keeps the place you left, and can read a
                sheet aloud when you want to listen.
              </p>
              <div className="blotter-actions">
                <Button type="button" className="folio-button" onClick={() => inputRef.current?.click()} disabled={working}>
                  Choose a PDF
                </Button>
                {!hasSample ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="folio-button folio-button-quiet"
                    onClick={() => enqueue([sampleFile()], true)}
                    disabled={working}
                  >
                    Read the sample
                  </Button>
                ) : null}
              </div>
            </>
          )}
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : [];
              event.target.value = "";
              enqueue(files, true);
            }}
          />
        </section>
      </main>

      {dragging ? <div className="drag-veil">Let the file fall on the desk</div> : null}

      <Dialog
        open={importState.kind === "password"}
        onOpenChange={(open) => {
          if (!open) cancelPassword();
        }}
      >
        <DialogContent className="paper-dialog">
          <DialogHeader>
            <DialogTitle>This book is locked</DialogTitle>
            <DialogDescription>
              {importState.kind === "password" && importState.incorrect
                ? "That password did not open it. Try the one that came with the file."
                : "Enter the password that came with the PDF. Folio remembers it on this desk so scanned sheets can be laid out again."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitPassword();
            }}
          >
            <Input
              type="password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              aria-label="PDF password"
              autoComplete="off"
              className="paper-input"
            />
            <DialogFooter className="paper-dialog-footer">
              <Button type="button" variant="outline" className="paper-button paper-button-quiet" onClick={cancelPassword}>
                Leave it
              </Button>
              <Button type="submit" className="paper-button" disabled={!password}>
                Unlock
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="paper-dialog">
          <DialogHeader>
            <DialogTitle>Take this book off the desk?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.title} will leave this browser, along with its place and margin notes.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="paper-dialog-footer">
            <Button type="button" variant="outline" className="paper-button paper-button-quiet" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="paper-button paper-button-danger"
              onClick={() => {
                if (!pendingDelete) return;
                const id = pendingDelete.id;
                setPendingDelete(null);
                void deleteBook(id).then(() => refresh());
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
