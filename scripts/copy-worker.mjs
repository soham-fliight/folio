import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const target = path.join(root, "public/pdf.worker.min.mjs");
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
