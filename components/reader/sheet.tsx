"use client";

import type { Ref } from "react";
import type { Cloth } from "@/lib/cloth";
import type { Leaf } from "@/lib/types";

export function fillMeasurer(element: HTMLElement, blocks: Leaf["blocks"], dropCap: boolean) {
  element.replaceChildren();
  blocks.forEach((block, index) => {
    if (block.ornament) {
      const ornament = document.createElement("div");
      ornament.className = "ornament";
      ornament.textContent = block.text;
      element.appendChild(ornament);
      return;
    }
    const node = document.createElement(block.heading ? "h2" : "p");
    if (!block.heading && dropCap && index === 0) node.className = "drop-cap";
    node.textContent = block.text;
    element.appendChild(node);
  });
}

function Prose({
  leaf,
  dropCap,
  activeSentence,
}: {
  leaf: Leaf;
  dropCap: boolean;
  activeSentence: string | null;
}) {
  return (
    <>
      {leaf.blocks.map((block, index) => {
        if (block.ornament) {
          return (
            <div className="ornament" key={`${block.offset}-ornament`}>
              {block.text}
            </div>
          );
        }
        const Tag = block.heading ? "h2" : "p";
        const sentence = activeSentence && block.text.includes(activeSentence) ? activeSentence : null;
        const at = sentence ? block.text.indexOf(sentence) : -1;
        return (
          <Tag
            key={`${block.sourcePage}-${block.offset}-${index}`}
            className={!block.heading && dropCap && index === 0 ? "drop-cap" : undefined}
          >
            {sentence && at >= 0 ? (
              <>
                {block.text.slice(0, at)}
                <mark>{sentence}</mark>
                {block.text.slice(at + sentence.length)}
              </>
            ) : (
              block.text
            )}
          </Tag>
        );
      })}
    </>
  );
}

export function Sheet({
  side,
  leaf,
  leafIndex,
  dropCap,
  activeSentence,
  imageUrl,
  imagePending,
  cover,
  endpaper,
  bodyRef,
}: {
  side: "left" | "right" | "single";
  leaf: Leaf | null;
  leafIndex: number | null;
  dropCap: boolean;
  activeSentence: string | null;
  imageUrl?: string;
  imagePending?: boolean;
  cover?: { title: string; author: string; read: number; total: number; cloth: Cloth } | null;
  endpaper?: { read: number; total: number } | null;
  bodyRef?: Ref<HTMLDivElement>;
}) {
  const speaking = Boolean(activeSentence && leaf && !leaf.scan);
  return (
    <article
      className={`sheet side-${side} ${cover ? "cover-face" : ""} ${endpaper ? "end-face" : ""} ${speaking ? "is-speaking" : ""}`}
      style={cover ? { background: cover.cloth.cover, color: cover.cloth.foil } : undefined}
      data-testid={side === "right" || side === "single" ? "sheet" : undefined}
    >
      {cover ? (
        <div className="cover-copy">
          <p className="cover-kicker">Folio</p>
          <h2>{cover.title}</h2>
          {cover.author ? <p className="cover-author">{cover.author}</p> : null}
          <p className="cover-stat">
            {cover.total === 0
              ? "The gathering is empty."
              : cover.read >= cover.total
                ? "You have read every page."
                : `You have read ${cover.read} of ${cover.total} pages.`}
          </p>
          <p className="cover-stat quiet">This copy lives on this desk, in this browser.</p>
        </div>
      ) : endpaper ? (
        <div className="end-copy">
          <p className="ornament">❧</p>
          <h2>The last sheet</h2>
          <p>
            {endpaper.read >= endpaper.total
              ? "You have read every page of the file."
              : `You have read ${endpaper.read} of ${endpaper.total} pages. The rest can wait.`}
          </p>
        </div>
      ) : leaf?.scan ? (
        <div className="sheet-body scan-body" ref={bodyRef}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={`Scanned file page ${leaf.sourcePages[0]}`} />
          ) : (
            <p className="scan-wait">
              {imagePending
                ? "Laying the printed sheet on the paper…"
                : "This scan stayed in the file. The page is counted, and dictation will turn past it."}
            </p>
          )}
        </div>
      ) : (
        <div className="sheet-body" ref={bodyRef}>
          {leaf ? <Prose leaf={leaf} dropCap={dropCap} activeSentence={activeSentence} /> : null}
        </div>
      )}
      {leafIndex !== null && !cover && !endpaper ? (
        <footer className="sheet-footer">
          <span>{leafIndex + 1}</span>
        </footer>
      ) : null}
    </article>
  );
}
