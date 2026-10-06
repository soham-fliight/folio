export type Anchor = {
  sourcePage: number;
  offset: number;
};

export type MarginNote = {
  id: string;
  sourcePage: number;
  text: string;
  createdAt: number;
};

export type StoredBlock = {
  text: string;
  offset: number;
  heading: boolean;
};

export type StoredPage = {
  pageNumber: number;
  isScan: boolean;
  blocks: StoredBlock[];
};

export type BookRecord = {
  id: string;
  title: string;
  author: string;
  fileName: string;
  addedAt: number;
  lastOpenedAt: number;
  pageCount: number;
  readPages: number[];
  anchor: Anchor;
  notes: MarginNote[];
  /** Kept locally so scanned sheets can be drawn again. */
  password?: string;
};

export type PageBreak = {
  sourcePage: number;
  /** Index in the joined text where this file page begins. */
  at: number;
  offset: number;
};

export type LeafBlock = {
  text: string;
  sourcePage: number;
  offset: number;
  heading: boolean;
  ornament?: boolean;
  /** Later file pages whose text was joined onto this block. */
  pageBreaks?: PageBreak[];
};

export type Leaf = {
  blocks: LeafBlock[];
  sourcePages: number[];
  anchor: Anchor;
  scan: boolean;
};

export type RawTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
};
