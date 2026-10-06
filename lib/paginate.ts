import type { Leaf, LeafBlock, PageBreak, StoredPage } from "@/lib/types";

export function paginateBlocks(items: LeafBlock[], fits: (blocks: LeafBlock[]) => boolean): LeafBlock[][] {
  const pages: LeafBlock[][] = [];
  const queue = items.map((item) => ({ ...item }));
  let current: LeafBlock[] = [];
  let guard = 0;
  const limit = Math.max(50, items.length * 40);

  while (queue.length) {
    if (++guard > limit) {
      pages.push([...current, ...queue]);
      return pages;
    }
    const item = queue[0];
    if (fits([...current, item])) {
      current.push(queue.shift()!);
      continue;
    }
    if (current.length > 0) {
      const split = splitBlock(item, (part) => fits([...current, part]));
      if (split && split[0].text !== item.text && fits([...current, split[0]])) {
        current.push(split[0]);
        pages.push(current);
        current = [];
        queue.shift();
        queue.unshift(split[1]);
        continue;
      }
      pages.push(current);
      current = [];
      continue;
    }
    const split = splitBlock(item, (part) => fits([part]));
    queue.shift();
    if (!split || split[0].text === item.text) {
      pages.push([item]);
      continue;
    }
    queue.unshift(split[0], split[1]);
  }

  if (current.length) pages.push(current);
  return pages;
}

function locate(block: LeafBlock, index: number): { sourcePage: number; offset: number } {
  let sourcePage = block.sourcePage;
  let baseAt = 0;
  let baseOffset = block.offset;
  for (const pageBreak of block.pageBreaks ?? []) {
    if (pageBreak.at <= index) {
      sourcePage = pageBreak.sourcePage;
      baseAt = pageBreak.at;
      baseOffset = pageBreak.offset;
    } else {
      break;
    }
  }
  return { sourcePage, offset: baseOffset + (index - baseAt) };
}

function sliceBreaks(block: LeafBlock, start: number, end: number): PageBreak[] | undefined {
  const breaks = (block.pageBreaks ?? [])
    .filter((pageBreak) => pageBreak.at > start && pageBreak.at < end)
    .map((pageBreak) => ({ ...pageBreak, at: pageBreak.at - start }));
  return breaks.length ? breaks : undefined;
}

function splitBlock(block: LeafBlock, fits: (block: LeafBlock) => boolean): [LeafBlock, LeafBlock] | null {
  if (block.ornament) return null;
  const words = block.text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  let low = 1;
  let high = words.length - 1;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const text = words.slice(0, mid).join(" ");
    if (fits({ ...block, text, heading: false, pageBreaks: undefined })) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best <= 0) return null;
  const leftText = words.slice(0, best).join(" ");
  const rightText = words.slice(best).join(" ");
  const found = block.text.indexOf(rightText);
  const cut = found >= 0 ? found : leftText.length + 1;
  const right = locate(block, cut);
  return [
    {
      ...block,
      text: leftText,
      heading: false,
      ornament: false,
      pageBreaks: sliceBreaks(block, 0, leftText.length),
    },
    {
      ...block,
      text: rightText,
      sourcePage: right.sourcePage,
      offset: right.offset,
      heading: false,
      ornament: false,
      pageBreaks: sliceBreaks(block, cut, block.text.length),
    },
  ];
}

function endsOpenSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !/[.!?…]["'”’)\]]?$/.test(trimmed);
}

function continuesSentence(previous: string, next: string): boolean {
  const incoming = next.trim();
  if (!incoming || !endsOpenSentence(previous)) return false;
  if (/[-\u2010\u2011]$/.test(previous.trim()) && /^[a-z]/.test(incoming)) return true;
  return /^(?:["“'])?[a-z]/.test(incoming);
}

function joinAcrossPages(previous: LeafBlock, next: LeafBlock): LeafBlock {
  const prior = previous.text.trimEnd();
  const incoming = next.text.trim();
  let text: string;
  let at: number;
  if (/[-\u2010\u2011]$/.test(prior) && /^[a-z]/.test(incoming)) {
    text = prior.slice(0, -1) + incoming;
    at = prior.length - 1;
  } else {
    text = `${prior} ${incoming}`;
    at = prior.length + 1;
  }
  return {
    ...previous,
    text,
    pageBreaks: [...(previous.pageBreaks ?? []), { sourcePage: next.sourcePage, at, offset: next.offset }],
  };
}

function sourcePagesOf(block: LeafBlock): number[] {
  const pages = [block.sourcePage];
  for (const pageBreak of block.pageBreaks ?? []) {
    if (!pages.includes(pageBreak.sourcePage)) pages.push(pageBreak.sourcePage);
  }
  return pages;
}

function toLeaf(blocks: LeafBlock[], scan: boolean): Leaf {
  const sourcePages = [...new Set(blocks.flatMap(sourcePagesOf))];
  const first = blocks[0];
  return {
    blocks,
    sourcePages,
    anchor: first
      ? { sourcePage: first.sourcePage, offset: first.offset }
      : { sourcePage: sourcePages[0] ?? 1, offset: 0 },
    scan,
  };
}

export function buildLeaves(pages: StoredPage[], fits: (blocks: LeafBlock[]) => boolean): Leaf[] {
  const leaves: Leaf[] = [];
  let prose: LeafBlock[] = [];

  const flush = () => {
    if (!prose.length) return;
    for (const blocks of paginateBlocks(prose, fits)) leaves.push(toLeaf(blocks, false));
    prose = [];
  };

  for (const page of pages) {
    if (page.isScan || page.blocks.length === 0) {
      flush();
      leaves.push({
        blocks: [],
        sourcePages: [page.pageNumber],
        anchor: { sourcePage: page.pageNumber, offset: 0 },
        scan: true,
      });
      continue;
    }
    page.blocks.forEach((block, index) => {
      const leafBlock: LeafBlock = { ...block, sourcePage: page.pageNumber };
      const previous = prose[prose.length - 1];
      if (
        index === 0 &&
        previous &&
        !previous.heading &&
        !previous.ornament &&
        !leafBlock.heading &&
        continuesSentence(previous.text, leafBlock.text)
      ) {
        prose[prose.length - 1] = joinAcrossPages(previous, leafBlock);
        return;
      }
      prose.push(leafBlock);
    });
  }
  flush();

  const lastPage = pages[pages.length - 1]?.pageNumber ?? 1;
  const ornament: LeafBlock = {
    text: "❧",
    sourcePage: lastPage,
    offset: Number.MAX_SAFE_INTEGER,
    heading: false,
    ornament: true,
  };
  const last = leaves[leaves.length - 1];
  if (last && !last.scan && fits([...last.blocks, ornament])) {
    last.blocks = [...last.blocks, ornament];
  } else if (leaves.length) {
    leaves.push(toLeaf([ornament], false));
  }

  return leaves;
}

export function findLeafIndex(leaves: Leaf[], anchor: { sourcePage: number; offset: number }): number {
  let index = 0;
  for (let i = 0; i < leaves.length; i++) {
    const leafAnchor = leaves[i].anchor;
    const before =
      leafAnchor.sourcePage < anchor.sourcePage ||
      (leafAnchor.sourcePage === anchor.sourcePage && leafAnchor.offset <= anchor.offset);
    if (before) index = i;
    else break;
  }
  return index;
}

export function leavesOnSpread(
  spread: number,
  leafCount: number,
  single: boolean,
): { left: number | null; right: number | null } {
  if (leafCount <= 0) return { left: null, right: null };
  if (single) return { left: spread >= 0 && spread < leafCount ? spread : null, right: null };
  if (spread <= 0) return { left: null, right: 0 };
  const left = spread * 2 - 1;
  const right = spread * 2;
  return {
    left: left < leafCount ? left : null,
    right: right < leafCount ? right : null,
  };
}

export function spreadForLeaf(leafIndex: number): number {
  if (leafIndex <= 0) return 0;
  return Math.ceil(leafIndex / 2);
}

export function maxSpread(leafCount: number, single: boolean): number {
  if (leafCount <= 0) return 0;
  if (single) return leafCount - 1;
  return Math.ceil((leafCount - 1) / 2);
}

export function clampSpread(spread: number, leafCount: number, single: boolean): number {
  return Math.min(maxSpread(leafCount, single), Math.max(0, spread));
}

export function visibleLeafIndexes(spread: number, leafCount: number, single: boolean): number[] {
  const { left, right } = leavesOnSpread(spread, leafCount, single);
  return [left, right].filter((index): index is number => index !== null);
}
