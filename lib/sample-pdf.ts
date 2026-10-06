const ESSAY = `A Desk for Pages

There is a particular quiet that arrives when a book is opened on a table and the rest of the room agrees to wait. The page has a weight. It holds still. Light sits on it instead of coming out of it, and the line you are reading is simply the line you are reading.

Most files never get that courtesy. A PDF arrives as a task. It opens in a pane of chrome, with a thumbnail strip and a scrollbar and a page that is really a picture of a page, flattened under glass. You can read it, of course. You have read dozens that way, squinting at a chapter someone exported without asking how it would feel. The trouble is the reminder, on every inch of the frame, that you are operating a document.

This desk tries a smaller ambition. You set the file down. The type is lifted off the export and put back into lines, with a margin wide enough for a thumb and a measure short enough that the eye can return without hunting. The paper is only paper-colored light, but it behaves. It does not scroll. You turn.

Turning matters more than it sounds. A scroll is a slope. You are always midway, always in danger of losing the inch you meant to keep. A turn is a decision. This sheet is finished. The next one is waiting underneath, still uncreased. When you stop for the day, the book stays open at that sheet, the way a novel stays open on a chair if you trust the house. Come back tomorrow and you are returned to the sentence.

Some pages were never text at all. A scan of a printed book, a pencil diagram, a title page with a printer's flower. Those stay as they were printed, laid on the sheet instead of reflowed, because pretending a photograph is type helps no one. You can still turn them. They still count as pages you have been through.

If your eyes are tired, or the hour is late, the desk will read aloud. The page dictates, you listen, and a wash of lamplight follows the line so you can look away and come back without losing the place. You can ask it to slow down. You can stop it mid-sentence and the words will still be there, which is the whole advantage of reading something that also exists as ink.

The margin is for you. A thought that would have been a pencil note can be written, or spoken, and it stays beside the page it belongs to. The books themselves do not leave the browser. There is no account to sign and no score designed to make you feel behind. There is only the slightly stubborn fact of how far you have turned.

People who love paper are sometimes told they are only attached to the smell of glue. The smell is real, and it is not the point. Paper is a technology for attention. It has no notification. It cannot measure your hesitation. The line does not rearrange itself when the window changes size, unless you ask a desk like this one to set the type again, and even then it asks you back to the same sentence.

There is also the hand. On a screen you pinch and flick. In a book you lift. The effort is slight and it is enough to mark the boundary between one thought and the next. Folio keeps that boundary. The right edge of the book is a stack of edges, and your place in it is a ribbon. Drag the ribbon and you move through the gathering the way a finger moves across the fore-edge of a closed novel, guessing at a chapter by the stain of the paper.

You may be here because someone sent a reading you did not choose the format of. A syllabus, a proof, a long letter saved as a PDF because that is how serious things are still passed around. You do not have to like the file to want a fair way to read it. Drop it on the wood. If it asks for a password, the desk asks you once and then remembers, on this machine, so the scans can be laid out again tomorrow. If a page has no words, it will say so, and the dictation will step past it.

Read as far as you want. Leave the rest unread without apology. The shelf will tell you the truth: the pages you have actually opened, and the page that is waiting.

A paper book ends. That is one of its kindnesses. The last sheet is a last sheet, and then the cover, and then the table again. You can stand up. When you want the book once more, it is on the desk, a little thicker in memory than it was this morning, marked by the pages you actually sat with.`;

export const SAMPLE_TITLE = "A Desk for Pages";
export const SAMPLE_AUTHOR = "Folio";
export const SAMPLE_FILE_NAME = "A Desk for Pages.pdf";

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function wrapLines(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function essayPages(text = ESSAY, width = 84, linesPerPage = 16): string[][] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const lines: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) lines.push("");
    lines.push(...wrapLines(paragraph, width));
  });
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage));
  return pages;
}

function pageStream(lines: string[]): string {
  const commands = ["BT", "/F1 11.5 Tf", "15 TL", "68 742 Td"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("T*");
    commands.push(`(${pdfEscape(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
}

export function buildSamplePdf(): Uint8Array {
  const pages = essayPages();
  const firstPageObject = 4;
  const kids: string[] = [];
  const pageObjects: string[] = [];
  pages.forEach((lines, index) => {
    const pageNumber = firstPageObject + index * 2;
    const contentNumber = pageNumber + 1;
    kids.push(`${pageNumber} 0 R`);
    pageObjects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNumber} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    pageObjects.push(pageStream(lines));
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
    ...pageObjects,
    `<< /Title (${pdfEscape(SAMPLE_TITLE)}) /Author (${pdfEscape(SAMPLE_AUTHOR)}) >>`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += table;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}

export function sampleFile(): File {
  const bytes = buildSamplePdf();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], SAMPLE_FILE_NAME, { type: "application/pdf" });
}
