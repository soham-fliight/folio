"use client";

import { clothFor, coverHeight, pageBlockWidth } from "@/lib/cloth";
import { formatOpened, readPercent } from "@/lib/format";
import type { BookRecord } from "@/lib/types";

export function BookCover({
  book,
  sample = false,
  onOpen,
  onRemove,
}: {
  book: BookRecord;
  sample?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const cloth = clothFor(book.title);
  const height = coverHeight(book.title);
  const read = book.readPages.length;
  const percent = readPercent(read, book.pageCount);
  const place = book.anchor.sourcePage || 1;

  return (
    <div className="volume" style={{ ["--cover-h" as string]: `${height}px` }}>
      <button type="button" className="volume-open" onClick={onOpen}>
        <span className="volume-cover" style={{ background: cloth.cover, color: cloth.foil }}>
          {sample ? <span className="sample-flag">Sample</span> : null}
          <span className="foil-rule" />
          <span className="volume-title">{book.title}</span>
          {book.author ? <span className="volume-author">{book.author}</span> : null}
          <span className="volume-meta">
            {sample
              ? "A short gathering, already set in type"
              : read === 0
                ? "Unread"
                : percent === 100
                  ? "Read through"
                  : `Left off on page ${place}`}
          </span>
          <span className="volume-foot">
            {sample ? "Open it" : read === 0 ? `${book.pageCount} pages` : `${read} of ${book.pageCount} read`}
          </span>
          <span className="volume-thread" style={{ width: `${sample ? 0 : percent}%` }} />
        </span>
        <span
          className="volume-edges"
          style={{ width: pageBlockWidth(sample ? 48 : book.pageCount), background: cloth.spine }}
          aria-hidden
        />
      </button>
      {onRemove ? (
        <button type="button" className="volume-remove" onClick={onRemove}>
          Remove
          <span className="sr-only"> {book.title} from the desk</span>
        </button>
      ) : null}
      {!sample && read > 0 ? <span className="volume-opened">{formatOpened(book.lastOpenedAt)}</span> : null}
    </div>
  );
}
