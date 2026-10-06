"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Mic, Pause, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fillMeasurer, Sheet } from "@/components/reader/sheet";
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { clothFor } from "@/lib/cloth";
import { getBook, getFile, getText, updateBook } from "@/lib/db";
import { readPercent } from "@/lib/format";
import {
  buildLeaves,
  clampSpread,
  findLeafIndex,
  leavesOnSpread,
  maxSpread,
  spreadForLeaf,
  visibleLeafIndexes,
} from "@/lib/paginate";
import { closePdf, openPdfDocument, renderPageImage } from "@/lib/pdf";
import { canListen, listenOnce, loadVoices, pickVoice, RATES, type RateName } from "@/lib/speech";
import { leafSentences } from "@/lib/text";
import type { BookRecord, Leaf, MarginNote, StoredPage } from "@/lib/types";

function filePageLabel(leaves: Leaf[], indexes: number[], total: number): string {
  const pages = [...new Set(indexes.flatMap((index) => leaves[index]?.sourcePages ?? []))].sort((a, b) => a - b);
  if (!pages.length) return `${total} pages in the file`;
  if (pages.length === 1) return `File page ${pages[0]} of ${total}`;
  return `File pages ${pages[0]}–${pages[pages.length - 1]} of ${total}`;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function ReaderView({ bookId }: { bookId: string }) {
  const single = useMediaQuery("(max-width: 960px)");
  const wide = useMediaQuery("(min-width: 1180px)");
  const [book, setBook] = useState<BookRecord | null>(null);
  const [pages, setPages] = useState<StoredPage[] | null>(null);
  const [status, setStatus] = useState<"loading" | "missing" | "ready" | "error">("loading");
  const [leaves, setLeaves] = useState<Leaf[] | null>(null);
  const [spread, setSpread] = useState(0);
  const [sweep, setSweep] = useState<"forward" | "back" | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  const [docReady, setDocReady] = useState(false);
  const [highlight, setHighlight] = useState<{ leafId: number; text: string } | null>(null);
  const [dictating, setDictating] = useState(false);
  const [paused, setPaused] = useState(false);
  const [spokenOut, setSpokenOut] = useState("");
  const [rate, setRate] = useState<RateName>("steady");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState<MarginNote | null>(null);
  const [listening, setListening] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [live, setLive] = useState("");

  const bookRef = useRef<BookRecord | null>(null);
  const leavesRef = useRef<Leaf[] | null>(null);
  const spreadRef = useRef(0);
  const singleRef = useRef(single);
  const bodyRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<Awaited<ReturnType<typeof openPdfDocument>> | null>(null);
  const sessionRef = useRef(0);
  const dictatingRef = useRef(false);
  const pausedRef = useRef(false);
  const rateRef = useRef(rate);
  const voicesRef = useRef(voices);
  const voiceUriRef = useRef(voiceUri);
  const listenRef = useRef<{ stop: () => void } | null>(null);
  const dialogRef = useRef(false);
  const renderingRef = useRef(new Set<number>());
  const [sizeKey, setSizeKey] = useState("");

  bookRef.current = book;
  leavesRef.current = leaves;
  singleRef.current = single;
  rateRef.current = rate;
  voicesRef.current = voices;
  voiceUriRef.current = voiceUri;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [record, text, file] = await Promise.all([getBook(bookId), getText(bookId), getFile(bookId)]);
          if (cancelled) return;
          if (!record || !text || !file) {
            setStatus("missing");
            return;
          }
          const opened = { ...record, lastOpenedAt: Date.now() };
          bookRef.current = opened;
          setBook(opened);
          setPages(text);
          setStatus("ready");
          void updateBook(opened);
          try {
            const buffer = await file.arrayBuffer();
            const doc = await openPdfDocument(buffer, record.password);
            if (cancelled) {
              await closePdf(doc);
              return;
            }
            docRef.current = doc;
            setDocReady(true);
          } catch {
            if (!cancelled) setDocReady(false);
          }
        } catch {
          if (!cancelled) setStatus("error");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (docRef.current) void closePdf(docRef.current);
      docRef.current = null;
      sessionRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, [bookId]);

  useEffect(() => {
    const probe = bodyRef.current;
    if (!probe || status !== "ready") return;
    const publish = () => {
      const next = `${probe.clientWidth}x${probe.clientHeight}`;
      if (probe.clientHeight > 40) setSizeKey((current) => (current === next ? current : next));
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [status, single]);

  useEffect(() => {
    if (!pages || !sizeKey) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        await document.fonts.ready;
        if (cancelled) return;
        const measure = measureRef.current;
        const body = bodyRef.current;
        if (!measure || !body || body.clientHeight < 40) return;
        const firstPage = pages.find((page) => !page.isScan && page.blocks.length);
        const firstProse = firstPage?.blocks[0];
        const built = buildLeaves(pages, (blocks) => {
          const opening = blocks[0];
          const dropCap = Boolean(
            firstPage &&
              firstProse &&
              opening &&
              !opening.heading &&
              !opening.ornament &&
              opening.sourcePage === firstPage.pageNumber &&
              opening.offset === firstProse.offset &&
              /^[A-Za-z]/.test(opening.text),
          );
          measure.style.width = `${body.clientWidth}px`;
          fillMeasurer(measure, blocks, dropCap);
          return measure.scrollHeight <= body.clientHeight + 1;
        });
        if (cancelled || !bookRef.current) return;
        setLeaves(built);
        const leaf = findLeafIndex(built, bookRef.current.anchor);
        const next = clampSpread(single ? leaf : spreadForLeaf(leaf), built.length, single);
        spreadRef.current = next;
        setSpread(next);
        remember(next, built, single);
      })();
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [pages, sizeKey, single]);

  useEffect(() => {
    const savedRate = window.localStorage.getItem("folio-rate");
    const savedVoice = window.localStorage.getItem("folio-voice");
    if (savedRate === "unhurried" || savedRate === "steady" || savedRate === "brisk") {
      // Saved pace is read after mount so the first paint matches the server.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRate(savedRate);
    }
    if (savedVoice) setVoiceUri(savedVoice);
    void loadVoices().then(setVoices);
    const onVoices = () => setVoices(window.speechSynthesis.getVoices());
    window.speechSynthesis?.addEventListener("voiceschanged", onVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", onVoices);
  }, []);

  useEffect(() => {
    if (!sweep) return;
    const timer = window.setTimeout(() => setSweep(null), 560);
    return () => window.clearTimeout(timer);
  }, [sweep]);

  const leafCount = leaves?.length ?? 0;
  const indexes = leaves ? visibleLeafIndexes(spread, leafCount, single) : [];
  const placed = leaves ? leavesOnSpread(spread, leafCount, single) : { left: null, right: null };

  useEffect(() => {
    if (!docReady || !leaves || !docRef.current) return;
    const scans = visibleLeafIndexes(spread, leaves.length, single)
      .map((index) => leaves[index])
      .filter((leaf) => leaf?.scan)
      .map((leaf) => leaf.sourcePages[0]);
    let cancelled = false;
    for (const pageNumber of scans) {
      if (images[pageNumber] || imageErrors[pageNumber] || renderingRef.current.has(pageNumber)) continue;
      renderingRef.current.add(pageNumber);
      void renderPageImage(docRef.current, pageNumber, 1000)
        .then((url) => {
          renderingRef.current.delete(pageNumber);
          if (!cancelled) setImages((current) => ({ ...current, [pageNumber]: url }));
        })
        .catch(() => {
          renderingRef.current.delete(pageNumber);
          if (!cancelled) setImageErrors((current) => ({ ...current, [pageNumber]: true }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [docReady, leaves, spread, single, images, imageErrors]);

  function remember(nextSpread: number, leafList: Leaf[], isSingle: boolean) {
    const current = bookRef.current;
    if (!current) return;
    const visible = visibleLeafIndexes(nextSpread, leafList.length, isSingle);
    const sourcePages = [...new Set(visible.flatMap((index) => leafList[index].sourcePages))].filter(
      (page) => page > 0 && page <= current.pageCount,
    );
    const primary = visible[visible.length - 1];
    if (primary === undefined) return;
    const anchor = leafList[primary].anchor;
    const read = new Set(current.readPages);
    let grew = false;
    for (const page of sourcePages) {
      if (!read.has(page)) {
        read.add(page);
        grew = true;
      }
    }
    const moved = current.anchor.sourcePage !== anchor.sourcePage || current.anchor.offset !== anchor.offset;
    if (!grew && !moved) return;
    const nextBook: BookRecord = {
      ...current,
      anchor: anchor.offset === Number.MAX_SAFE_INTEGER ? current.anchor : anchor,
      readPages: [...read].sort((a, b) => a - b),
      lastOpenedAt: Date.now(),
    };
    bookRef.current = nextBook;
    setBook(nextBook);
    void updateBook(nextBook);
  }

  function applySpread(nextSpread: number, source: "user" | "dictation") {
    if (!leavesRef.current) return;
    const leafList = leavesRef.current;
    const next = clampSpread(nextSpread, leafList.length, singleRef.current);
    if (next === spreadRef.current && source === "user") return;
    setSweep(next > spreadRef.current ? "forward" : next < spreadRef.current ? "back" : null);
    spreadRef.current = next;
    setSpread(next);
    remember(next, leafList, singleRef.current);
    const label = filePageLabel(leafList, visibleLeafIndexes(next, leafList.length, singleRef.current), bookRef.current?.pageCount ?? 0);
    setLive(label);
    if (source === "user" && dictatingRef.current) void startDictation(next);
  }

  function stopDictation() {
    sessionRef.current += 1;
    dictatingRef.current = false;
    pausedRef.current = false;
    window.speechSynthesis?.cancel();
    setDictating(false);
    setPaused(false);
    setHighlight(null);
  }

  async function startDictation(fromSpread: number) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setSpokenOut("This browser has no voice for dictation. The page is still here to read.");
      return;
    }
    const my = ++sessionRef.current;
    dictatingRef.current = true;
    pausedRef.current = false;
    setDictating(true);
    setPaused(false);
    setSpokenOut("");
    window.speechSynthesis.cancel();
    let cursor = fromSpread;
    while (my === sessionRef.current) {
      const leafList = leavesRef.current;
      if (!leafList) return;
      const isSingle = singleRef.current;
      const max = maxSpread(leafList.length, isSingle);
      const prose = visibleLeafIndexes(cursor, leafList.length, isSingle).filter((index) => {
        const leaf = leafList[index];
        return leaf && !leaf.scan && leafSentences(leaf.blocks).length > 0;
      });
      if (!prose.length) {
        if (cursor >= max) break;
        cursor += 1;
        applySpread(cursor, "dictation");
        continue;
      }
      for (const leafId of prose) {
        const sentences = leafSentences(leafList[leafId].blocks);
        for (const sentence of sentences) {
          if (my !== sessionRef.current) return;
          while (pausedRef.current && my === sessionRef.current) await delay(40);
          if (my !== sessionRef.current) return;
          setHighlight({ leafId, text: sentence.text });
          const outcome = await speak(sentence.text, my);
          if (outcome !== "done") {
            if (my === sessionRef.current) {
              endDictation("This browser could not speak the page. You can still read it on the sheet.");
            }
            return;
          }
        }
      }
      if (cursor >= max) break;
      cursor += 1;
      applySpread(cursor, "dictation");
    }
    if (my === sessionRef.current) endDictation("That was the last page with type.");
  }

  function endDictation(message = "") {
    dictatingRef.current = false;
    pausedRef.current = false;
    setDictating(false);
    setPaused(false);
    setHighlight(null);
    if (message) setSpokenOut(message);
  }

  function speak(text: string, my: number): Promise<"done" | "stopped"> {
    return new Promise((resolve) => {
      if (my !== sessionRef.current || !window.speechSynthesis) {
        resolve("stopped");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = RATES[rateRef.current];
      const voice = pickVoice(voicesRef.current, voiceUriRef.current);
      if (voice) utterance.voice = voice;
      let settled = false;
      const words = Math.max(1, text.split(/\s+/).length);
      const budget = Math.min(25000, Math.max(2800, (words / Math.max(utterance.rate, 0.7)) * 480));
      let elapsed = 0;
      const tick = window.setInterval(() => {
        if (settled || pausedRef.current) return;
        elapsed += 200;
        if (elapsed < budget) return;
        const synth = window.speechSynthesis;
        if (synth.speaking || synth.pending) synth.cancel();
        finish(my === sessionRef.current ? "done" : "stopped");
      }, 200);
      const finish = (outcome: "done" | "stopped") => {
        if (settled) return;
        settled = true;
        window.clearInterval(tick);
        resolve(outcome);
      };
      utterance.onend = () => finish(my === sessionRef.current ? "done" : "stopped");
      utterance.onerror = (event) => {
        const error = event.error;
        if ((error === "interrupted" || error === "canceled") && my === sessionRef.current) {
          finish("done");
          return;
        }
        finish("stopped");
      };
      window.speechSynthesis.speak(utterance);
      window.speechSynthesis.resume();
    });
  }

  const actionsRef = useRef({
    apply(next: number, source: "user" | "dictation") {
      void next;
      void source;
    },
    start() {},
    stop() {},
  });
  actionsRef.current = {
    apply: applySpread,
    start: () => void startDictation(spreadRef.current),
    stop: stopDictation,
  };
  dialogRef.current = noteOpen || jumpOpen;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (dialogRef.current) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.getAttribute("role") === "slider")
      ) {
        return;
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        actionsRef.current.apply(spreadRef.current + 1, "user");
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        actionsRef.current.apply(spreadRef.current - 1, "user");
      } else if (event.key === "Home") {
        event.preventDefault();
        actionsRef.current.apply(0, "user");
      } else if (event.key === "End") {
        event.preventDefault();
        actionsRef.current.apply(maxSpread(leavesRef.current?.length ?? 1, singleRef.current), "user");
      } else if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (dictatingRef.current) actionsRef.current.stop();
        else actionsRef.current.start();
      } else if (event.key === "Escape" && dictatingRef.current) {
        event.preventDefault();
        actionsRef.current.stop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function noteSourcePage(): number | null {
    if (!leaves) return null;
    const visible = visibleLeafIndexes(spread, leaves.length, single);
    const leaf = leaves[visible[visible.length - 1] ?? visible[0] ?? -1];
    return leaf?.sourcePages[0] ?? null;
  }

  function openNote(existing?: MarginNote) {
    const sourcePage = existing?.sourcePage ?? noteSourcePage();
    if (!sourcePage) return;
    setEditingNote(existing ?? null);
    setNoteDraft(existing?.text ?? "");
    setNoteError("");
    setNoteOpen(true);
  }

  function saveNote() {
    const current = bookRef.current;
    const sourcePage = editingNote?.sourcePage ?? noteSourcePage();
    const text = noteDraft.trim();
    if (!current || !sourcePage || !text) return;
    const notes = editingNote
      ? current.notes.map((note) => (note.id === editingNote.id ? { ...note, text } : note))
      : [{ id: crypto.randomUUID(), sourcePage, text, createdAt: Date.now() }, ...current.notes];
    const next = { ...current, notes };
    bookRef.current = next;
    setBook(next);
    void updateBook(next);
    setNoteOpen(false);
    listenRef.current?.stop();
    setListening(false);
  }

  function deleteNote(id: string) {
    const current = bookRef.current;
    if (!current) return;
    const next = { ...current, notes: current.notes.filter((note) => note.id !== id) };
    bookRef.current = next;
    setBook(next);
    void updateBook(next);
    setNoteOpen(false);
  }

  function startListening() {
    setNoteError("");
    if (!canListen()) {
      setNoteError("This browser cannot take dictation. You can still write the note.");
      return;
    }
    const handle = listenOnce({
      onText: ({ transcript }) => setNoteDraft(transcript),
      onError: (message) => setNoteError(message),
      onEnd: () => setListening(false),
    });
    if (!handle) {
      setNoteError("This browser cannot take dictation. You can still write the note.");
      return;
    }
    listenRef.current = handle;
    setListening(true);
  }

  function jumpToPage() {
    if (!leaves || !book) return;
    const page = Number(jumpValue);
    if (!Number.isInteger(page) || page < 1 || page > book.pageCount) return;
    const index = leaves.findIndex((leaf) => leaf.sourcePages.includes(page));
    if (index < 0) return;
    const current = bookRef.current;
    if (current) {
      const next = { ...current, anchor: { sourcePage: page, offset: 0 } };
      bookRef.current = next;
      setBook(next);
    }
    applySpread(single ? index : spreadForLeaf(index), "user");
    setJumpOpen(false);
  }

  if (status === "loading") {
    return (
      <div className="folio-desk">
        <div className="folio-lamp" aria-hidden />
        <p className="reader-status">Opening the book…</p>
      </div>
    );
  }

  if (status === "missing" || status === "error" || !book || !pages) {
    return (
      <div className="folio-desk">
        <div className="folio-lamp" aria-hidden />
        <div className="reader-status">
          <p>{status === "error" ? "The book could not be opened from this desk." : "That book has left the desk."}</p>
          <Link href="/" className="back-link">
            Return to the shelf
          </Link>
        </div>
      </div>
    );
  }

  const cloth = clothFor(book.title);
  const showCover = !single && spread === 0;
  const showEnd = !single && spread > 0 && placed.right === null && placed.left !== null;
  const leftLeaf = placed.left !== null ? leaves?.[placed.left] ?? null : null;
  const rightLeaf = placed.right !== null ? leaves?.[placed.right] ?? null : null;
  const activeLeaf = single ? leftLeaf : rightLeaf ?? leftLeaf;
  const read = book.readPages.length;
  const percent = readPercent(read, book.pageCount);
  const visibleNotes = book.notes.filter((note) => {
    const visiblePages = indexes.flatMap((index) => leaves?.[index]?.sourcePages ?? []);
    return visiblePages.includes(note.sourcePage);
  });
  const firstProse = pages.find((page) => !page.isScan && page.blocks[0]);
  const dropOn = (leaf: Leaf | null) =>
    Boolean(
      leaf &&
        firstProse &&
        leaf.blocks[0] &&
        !leaf.blocks[0].heading &&
        !leaf.blocks[0].ornament &&
        leaf.blocks[0].sourcePage === firstProse.pageNumber &&
        leaf.blocks[0].offset === firstProse.blocks[0].offset,
    );
  const atStart = spread <= 0;
  const atEnd = leaves ? spread >= maxSpread(leaves.length, single) : true;
  const ribbonHeight = `${Math.max(18, Math.round((percent / 100) * 78))}%`;

  function onForeEdge(event: React.PointerEvent<HTMLDivElement>) {
    if (!leaves) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    applySpread(Math.round(ratio * maxSpread(leaves.length, single)), "user");
  }

  return (
    <div className={`folio-desk ${sweep ? `sweep-${sweep}` : ""}`} data-testid="reader">
      <div className="folio-lamp" aria-hidden />
      <header className="topbar reader-top">
        <Link href="/" className="back-link">
          <ChevronLeft size={16} /> Desk
        </Link>
        <div className="reader-heading">
          <h1>{book.title}</h1>
          {book.author ? <p>{book.author}</p> : null}
        </div>
        <button type="button" className="page-jump" onClick={() => { setJumpValue(String(book.anchor.sourcePage || 1)); setJumpOpen(true); }}>
          {leaves ? filePageLabel(leaves, indexes, book.pageCount) : "Setting the type"}
          <span>{read} of {book.pageCount} read</span>
        </button>
      </header>

      <main className="book-stage">
        <div className="spread-row">
          {wide && visibleNotes.length ? (
            <aside className="margin-col" aria-label="Margin notes">
              {visibleNotes.map((note) => (
                <button key={note.id} type="button" className="margin-note" onClick={() => openNote(note)}>
                  {note.text}
                </button>
              ))}
            </aside>
          ) : (
            <div className="margin-col" aria-hidden />
          )}

          <div className={`book ${single ? "is-single" : ""}`}>
            {!single ? <div className="cover-board" style={{ background: cloth.cover }} aria-hidden /> : null}
            {single ? (
              <Sheet
                side="single"
                leaf={activeLeaf}
                leafIndex={placed.left}
                dropCap={dropOn(activeLeaf)}
                activeSentence={highlight && placed.left === highlight.leafId ? highlight.text : null}
                imageUrl={activeLeaf?.scan ? images[activeLeaf.sourcePages[0]] : undefined}
                imagePending={Boolean(activeLeaf?.scan && docReady && !imageErrors[activeLeaf.sourcePages[0]])}
              />
            ) : (
              <>
                <Sheet
                  side="left"
                  leaf={showCover ? null : leftLeaf}
                  leafIndex={showCover ? null : placed.left}
                  dropCap={dropOn(leftLeaf)}
                  activeSentence={highlight && placed.left === highlight.leafId ? highlight.text : null}
                  imageUrl={leftLeaf?.scan ? images[leftLeaf.sourcePages[0]] : undefined}
                  imagePending={Boolean(leftLeaf?.scan && docReady && !imageErrors[leftLeaf.sourcePages[0]])}
                  cover={showCover ? { title: book.title, author: book.author, read, total: book.pageCount, cloth } : null}
                />
                <div className="gutter" aria-hidden>
                  <div className="ribbon" style={{ height: ribbonHeight }} />
                </div>
                <Sheet
                  side="right"
                  leaf={showEnd ? null : rightLeaf}
                  leafIndex={showEnd ? null : placed.right}
                  dropCap={dropOn(rightLeaf)}
                  activeSentence={highlight && placed.right === highlight.leafId ? highlight.text : null}
                  imageUrl={rightLeaf?.scan ? images[rightLeaf.sourcePages[0]] : undefined}
                  imagePending={Boolean(rightLeaf?.scan && docReady && !imageErrors[rightLeaf.sourcePages[0]])}
                  endpaper={showEnd ? { read, total: book.pageCount } : null}
                />
              </>
            )}
            <div
              className="fore-edge"
              role="slider"
              tabIndex={0}
              aria-valuemin={0}
              aria-valuemax={leaves ? maxSpread(leaves.length, single) : 0}
              aria-valuenow={spread}
              aria-label="Place in the book"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                onForeEdge(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) onForeEdge(event);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                  event.preventDefault();
                  event.stopPropagation();
                  applySpread(spread + 1, "user");
                }
                if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  event.stopPropagation();
                  applySpread(spread - 1, "user");
                }
              }}
            >
              <span className="fore-fill" style={{ height: `${leaves && leafCount > 1 ? (spread / maxSpread(leafCount, single)) * 100 : 0}%` }} />
            </div>
            {!atStart ? (
              <button type="button" tabIndex={-1} className="edge edge-back" aria-label="Turn back" onClick={() => applySpread(spread - 1, "user")} />
            ) : null}
            {!atEnd ? (
              <button type="button" tabIndex={-1} className="edge edge-forward" aria-label="Turn forward" onClick={() => applySpread(spread + 1, "user")} />
            ) : null}
            <div className="sheet side-single measure-probe" aria-hidden>
              <div className="sheet-body" ref={bodyRef} />
            </div>
            <div className="sheet-body measurer" ref={measureRef} aria-hidden />
          </div>

          {wide ? <div className="margin-col" aria-hidden /> : null}
        </div>

        {!leaves ? <p className="setting-type">Setting the type…</p> : null}

        <div className="controls" data-testid="dictation">
          <Button type="button" variant="outline" className="folio-button folio-button-quiet" onClick={() => applySpread(spread - 1, "user")} disabled={atStart || !leaves}>
            <ChevronLeft /> Turn back
          </Button>
          <Button
            type="button"
            className="folio-button"
            aria-pressed={dictating}
            onClick={() => (dictating ? stopDictation() : void startDictation(spread))}
            disabled={!leaves}
          >
            <Volume2 /> {dictating ? "Stop dictation" : "Dictation"}
          </Button>
          <Button type="button" variant="outline" className="folio-button folio-button-quiet" onClick={() => openNote()} disabled={!leaves}>
            Margin note{book.notes.length ? ` (${book.notes.length})` : ""}
          </Button>
          <Button type="button" variant="outline" className="folio-button folio-button-quiet" onClick={() => applySpread(spread + 1, "user")} disabled={atEnd || !leaves}>
            Turn forward <ChevronRight />
          </Button>
        </div>

        {dictating || spokenOut ? (
          <div className="dictation-panel">
            <p>{paused ? "Paused on this sentence." : dictating ? "Reading this page aloud." : spokenOut}</p>
            {dictating ? (
              <div className="dictation-tools">
                <Button type="button" variant="outline" className="folio-button folio-button-quiet" onClick={() => {
                  pausedRef.current = !pausedRef.current;
                  setPaused(pausedRef.current);
                  if (pausedRef.current) window.speechSynthesis.pause();
                  else window.speechSynthesis.resume();
                }}>
                  {paused ? <Volume2 /> : <Pause />} {paused ? "Resume" : "Pause"}
                </Button>
                <Button type="button" variant="outline" className="folio-button folio-button-quiet" onClick={stopDictation}>
                  <Square /> Stop
                </Button>
                <div className="rate-group" role="group" aria-label="Reading pace">
                  {(["unhurried", "steady", "brisk"] as const).map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={rate === name}
                      className={rate === name ? "is-on" : ""}
                      onClick={() => {
                        setRate(name);
                        window.localStorage.setItem("folio-rate", name);
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                {voices.filter((voice) => voice.lang.toLowerCase().startsWith("en")).length > 1 ? (
                  <label className="voice-pick">
                    Voice
                    <select
                      value={voiceUri}
                      onChange={(event) => {
                        setVoiceUri(event.target.value);
                        window.localStorage.setItem("folio-voice", event.target.value);
                      }}
                    >
                      <option value="">A quiet default</option>
                      {voices
                        .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
                        .map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <p className="control-hint">Arrow keys turn the page. D starts dictation. Drag the fore-edge to move through the book.</p>
        <p className="sr-only" aria-live="polite">{live}</p>
      </main>

      <Dialog open={noteOpen} onOpenChange={(open) => { if (!open) { listenRef.current?.stop(); setListening(false); } setNoteOpen(open); }}>
        <DialogContent className="paper-dialog">
          <DialogHeader>
            <DialogTitle>{editingNote ? "The note in the margin" : "A note in the margin"}</DialogTitle>
            <DialogDescription>
              {noteSourcePage() ? `Kept beside file page ${editingNote?.sourcePage ?? noteSourcePage()}.` : "Kept with this book."} Write it, or dictate it.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="note-box"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={5}
            maxLength={500}
            placeholder="A pencil line beside the page"
            aria-label="Margin note"
          />
          {noteError ? <p className="note-error">{noteError}</p> : null}
          <DialogFooter className="paper-dialog-footer">
            {editingNote ? (
              <Button type="button" variant="destructive" className="paper-button paper-button-danger" onClick={() => deleteNote(editingNote.id)}>
                Erase
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="paper-button paper-button-quiet" onClick={listening ? () => { listenRef.current?.stop(); setListening(false); } : startListening}>
              <Mic /> {listening ? "Listening…" : "Dictate"}
            </Button>
            <Button type="button" className="paper-button" onClick={saveNote} disabled={!noteDraft.trim()}>
              Keep the note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jumpOpen} onOpenChange={setJumpOpen}>
        <DialogContent className="paper-dialog">
          <DialogHeader>
            <DialogTitle>Turn to a page of the file</DialogTitle>
            <DialogDescription>This is the page number printed in the PDF, from 1 to {book.pageCount}.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              jumpToPage();
            }}
          >
            <Input
              className="paper-input"
              inputMode="numeric"
              value={jumpValue}
              onChange={(event) => setJumpValue(event.target.value)}
              aria-label="File page number"
            />
            <DialogFooter className="paper-dialog-footer">
              <Button type="submit" className="paper-button">
                Turn there
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
