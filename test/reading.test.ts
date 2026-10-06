import assert from "node:assert/strict";
import test from "node:test";
import { buildLeaves, findLeafIndex, leavesOnSpread, maxSpread, paginateBlocks } from "../lib/paginate.ts";
import { buildSamplePdf, essayPages } from "../lib/sample-pdf.ts";
import { linesFromItems, paragraphsFromLines, splitSentences, storedPageFromItems } from "../lib/text.ts";
import type { LeafBlock, RawTextItem } from "../lib/types.ts";

function item(str: string, x: number, y: number, width: number, hasEOL = false): RawTextItem {
  return { str, transform: [12, 0, 0, 12, x, y], width, height: 12, hasEOL };
}

test("joins words on a line and dehyphenates a wrapped word", () => {
  const lines = linesFromItems([
    item("inter-", 72, 700, 40, true),
    item("esting", 72, 686, 48, true),
    item("tale", 130, 686, 28, true),
  ]);
  const paragraphs = paragraphsFromLines(lines);
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].text, "interesting tale");
});

test("keeps a short title as a heading and the body as prose", () => {
  const page = storedPageFromItems(1, [
    item("A Desk for Pages", 72, 740, 140, true),
    item("There is a particular quiet that arrives when a book is opened on a table and the", 72, 700, 400, true),
    item("rest of the room agrees to wait beside the lamp.", 72, 686, 280, true),
  ]);
  assert.equal(page.isScan, false);
  assert.equal(page.blocks[0]?.heading, true);
  assert.match(page.blocks[1]?.text ?? "", /particular quiet/);
});

test("a nearly blank page stays a scan", () => {
  const page = storedPageFromItems(2, [item("12", 300, 40, 12, true)]);
  assert.equal(page.isScan, true);
  assert.equal(page.blocks.length, 0);
});

test("splits sentences without breaking Mr.", () => {
  assert.deepEqual(splitSentences("Mr. Hale went home. The lamp stayed on."), [
    "Mr. Hale went home.",
    "The lamp stayed on.",
  ]);
});

test("pagination splits a long block on word boundaries", () => {
  const block: LeafBlock = {
    text: "one two three four five six seven eight",
    sourcePage: 1,
    offset: 0,
    heading: false,
  };
  const pages = paginateBlocks([block], (blocks) => blocks.map((entry) => entry.text).join(" ").length <= 18);
  assert.ok(pages.length >= 2);
  assert.ok(pages.every((page) => page.map((entry) => entry.text).join(" ").length <= 18 || page[0].text.split(" ").length === 1));
  const flattened = pages.flatMap((page) => page.map((entry) => entry.text)).join(" ");
  assert.equal(flattened, block.text);
});

test("opening spread puts the first sheet on the right", () => {
  assert.deepEqual(leavesOnSpread(0, 5, false), { left: null, right: 0 });
  assert.deepEqual(leavesOnSpread(1, 5, false), { left: 1, right: 2 });
  assert.equal(maxSpread(5, false), 2);
  assert.equal(maxSpread(1, true), 0);
});

test("joins a sentence broken by a file page", () => {
  const leaves = buildLeaves(
    [
      {
        pageNumber: 2,
        isScan: false,
        blocks: [{ text: "the desk will read aloud. The page", offset: 40, heading: false }],
      },
      {
        pageNumber: 3,
        isScan: false,
        blocks: [
          { text: "dictates, you listen.", offset: 0, heading: false },
          { text: "Morning came late.", offset: 24, heading: false },
        ],
      },
    ],
    () => true,
  );
  const prose = leaves.flatMap((leaf) => leaf.blocks).filter((block) => !block.ornament);
  assert.equal(prose.length, 2);
  assert.equal(prose[0].text, "the desk will read aloud. The page dictates, you listen.");
  assert.deepEqual(leaves[0].sourcePages, [2, 3]);
  assert.equal(prose[1].text, "Morning came late.");
  assert.equal(prose[1].sourcePage, 3);
});

test("dehyphenates a word broken onto the next file page", () => {
  const leaves = buildLeaves(
    [
      {
        pageNumber: 1,
        isScan: false,
        blocks: [{ text: "A long inter-", offset: 0, heading: false }],
      },
      {
        pageNumber: 2,
        isScan: false,
        blocks: [{ text: "esting pause.", offset: 0, heading: false }],
      },
    ],
    () => true,
  );
  const prose = leaves.flatMap((leaf) => leaf.blocks).filter((block) => !block.ornament);
  assert.equal(prose.length, 1);
  assert.equal(prose[0].text, "A long interesting pause.");
  assert.deepEqual(leaves[0].sourcePages, [1, 2]);
});

test("a finished sentence stays a new paragraph on the next file page", () => {
  const leaves = buildLeaves(
    [
      {
        pageNumber: 1,
        isScan: false,
        blocks: [{ text: "The lamp stayed on.", offset: 0, heading: false }],
      },
      {
        pageNumber: 2,
        isScan: false,
        blocks: [{ text: "Morning came late.", offset: 0, heading: false }],
      },
    ],
    () => true,
  );
  const prose = leaves.flatMap((leaf) => leaf.blocks).filter((block) => !block.ornament);
  assert.equal(prose.length, 2);
  assert.equal(prose[1].sourcePage, 2);
});

test("a scan sheet keeps the sentences on either side apart", () => {
  const leaves = buildLeaves(
    [
      {
        pageNumber: 1,
        isScan: false,
        blocks: [{ text: "The page", offset: 0, heading: false }],
      },
      { pageNumber: 2, isScan: true, blocks: [] },
      {
        pageNumber: 3,
        isScan: false,
        blocks: [{ text: "dictates.", offset: 0, heading: false }],
      },
    ],
    () => true,
  );
  const prose = leaves.filter((leaf) => !leaf.scan).flatMap((leaf) => leaf.blocks).filter((block) => !block.ornament);
  assert.equal(prose.length, 2);
  assert.equal(prose[0].text, "The page");
  assert.equal(prose[1].text, "dictates.");
});

test("a split after a joined page keeps the later file page", () => {
  const leaves = buildLeaves(
    [
      {
        pageNumber: 2,
        isScan: false,
        blocks: [{ text: "The page", offset: 8, heading: false }],
      },
      {
        pageNumber: 3,
        isScan: false,
        blocks: [{ text: "dictates slowly tonight", offset: 0, heading: false }],
      },
    ],
    (blocks) => blocks.map((block) => block.text).join(" ").length <= 9,
  );
  const prose = leaves.flatMap((leaf) => leaf.blocks).filter((block) => !block.ornament);
  assert.equal(prose.map((block) => block.text).join(" "), "The page dictates slowly tonight");
  const later = prose.find((block) => block.text.startsWith("dictates"));
  assert.ok(later);
  assert.equal(later?.sourcePage, 3);
  assert.equal(later?.offset, 0);
});

test("leaves restore an anchor in the middle of a file page", () => {
  const pages = [
    {
      pageNumber: 1,
      isScan: false,
      blocks: [{ text: "alpha beta gamma delta epsilon zeta eta theta", offset: 0, heading: false }],
    },
  ];
  const leaves = buildLeaves(pages, (blocks) => blocks.map((block) => block.text).join(" ").length <= 20);
  const index = findLeafIndex(leaves, { sourcePage: 1, offset: 20 });
  assert.ok(leaves[index].anchor.offset <= 20);
  const following = leaves[index + 1];
  if (following && !following.blocks[0]?.ornament) assert.ok(following.anchor.offset > 20);
});

test("sample pdf is a multi-page document", () => {
  const pages = essayPages();
  assert.ok(pages.length >= 3);
  const bytes = buildSamplePdf();
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  assert.equal(header, "%PDF-1.4");
  const body = new TextDecoder().decode(bytes);
  assert.ok(body.includes("/Count " + pages.length));
  assert.ok(body.includes("A Desk for Pages"));
});
