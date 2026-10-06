import type { LeafBlock, RawTextItem, StoredBlock, StoredPage } from "@/lib/types";

export type LineRecord = {
  text: string;
  y: number;
  height: number;
};

const ABBREVIATIONS = /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.$/i;

export function linesFromItems(items: RawTextItem[]): LineRecord[] {
  const lines: { y: number; height: number; parts: { x: number; w: number; str: string }[] }[] = [];
  let current: (typeof lines)[number] | null = null;

  const flush = () => {
    if (current && current.parts.length) lines.push(current);
    current = null;
  };

  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL) flush();
      continue;
    }
    const x = Number(item.transform[4] ?? 0);
    const y = Number(item.transform[5] ?? 0);
    const height = item.height || Math.abs(Number(item.transform[3] ?? 12)) || 12;
    if (!current || Math.abs(current.y - y) > Math.max(2, height * 0.45)) {
      flush();
      current = { y, height, parts: [] };
    }
    current.parts.push({ x, w: item.width || 0, str: item.str });
    if (item.hasEOL) flush();
  }
  flush();

  return lines
    .map((line) => {
      const parts = [...line.parts].sort((a, b) => a.x - b.x);
      let text = "";
      let lastEnd = -Infinity;
      for (const part of parts) {
        const gap = part.x - lastEnd;
        if (
          text &&
          gap > Math.max(1.2, line.height * 0.12) &&
          !text.endsWith(" ") &&
          !part.str.startsWith(" ")
        ) {
          text += " ";
        }
        text += part.str;
        lastEnd = part.x + (part.w || part.str.length * line.height * 0.45);
      }
      return {
        text: text.replace(/\u00ad/g, "").replace(/[ \t]+/g, " ").trim(),
        y: line.y,
        height: line.height,
      };
    })
    .filter((line) => line.text.length > 0);
}

export function isHeadingCandidate(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 72) return false;
  if (/[.!?,:;]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 8) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (upper / letters.length > 0.75) return true;
  if (words.length < 2) return false;
  const capWords = words.filter((word) => /^[A-Z0-9]/.test(word)).length;
  return capWords >= words.length - 1;
}

export function paragraphsFromLines(lines: LineRecord[]): { text: string; heading: boolean }[] {
  if (!lines.length) return [];

  const paragraphs: { text: string; heading: boolean }[] = [];
  let buffer = "";
  let singleLine = true;

  const flush = () => {
    const text = buffer.replace(/[ \t]+/g, " ").trim();
    buffer = "";
    if (!text) return;
    paragraphs.push({ text, heading: singleLine && isHeadingCandidate(text) });
    singleLine = true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;
    if (!line) {
      flush();
      continue;
    }
    if (i > 0 && lines[i - 1].text) {
      const gap = Math.abs(lines[i - 1].y - lines[i].y);
      const lineHeight = Math.max(lines[i].height, lines[i - 1].height, 10);
      if (gap > lineHeight * 1.85) flush();
    }
    if (!buffer) {
      buffer = line;
      singleLine = true;
      continue;
    }
    singleLine = false;
    if (/[-\u2010\u2011]$/.test(buffer) && /^[a-z(]/.test(line)) {
      buffer = buffer.slice(0, -1) + line;
    } else {
      buffer = `${buffer} ${line}`;
    }
  }
  flush();
  return paragraphs;
}

export function blocksFromParagraphs(
  paragraphs: { text: string; heading: boolean }[],
): StoredBlock[] {
  const blocks: StoredBlock[] = [];
  let offset = 0;
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) offset += 2;
    blocks.push({ text: paragraph.text, offset, heading: paragraph.heading });
    offset += paragraph.text.length;
  });
  return blocks;
}

const SCAN_CHAR_THRESHOLD = 80;

export function storedPageFromItems(pageNumber: number, items: RawTextItem[]): StoredPage {
  const paragraphs = paragraphsFromLines(linesFromItems(items));
  const blocks = blocksFromParagraphs(paragraphs);
  const compact = blocks.reduce((sum, block) => sum + block.text.replace(/\s/g, "").length, 0);
  return {
    pageNumber,
    isScan: compact < SCAN_CHAR_THRESHOLD,
    blocks: compact < SCAN_CHAR_THRESHOLD ? [] : blocks,
  };
}

export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences: string[] = [];
  let buffer = "";
  for (const token of cleaned.split(/\s+/)) {
    buffer = buffer ? `${buffer} ${token}` : token;
    const ends = /[.!?]["'”’]?$/.test(token);
    if (ends && !ABBREVIATIONS.test(token) && !/^[A-Z]\.$/.test(token)) {
      sentences.push(buffer);
      buffer = "";
    }
  }
  if (buffer) sentences.push(buffer);
  return sentences;
}

export function leafSentences(blocks: LeafBlock[]): { text: string; blockIndex: number }[] {
  const sentences: { text: string; blockIndex: number }[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.ornament) return;
    for (const text of splitSentences(block.text)) sentences.push({ text, blockIndex });
  });
  return sentences;
}
