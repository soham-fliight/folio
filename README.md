# Folio

A reading desk for PDFs. Drop a file on the wood and Folio sets the type onto paper pages you turn, remembers the pages you have actually opened, and can read a sheet aloud when you would rather listen.

Books stay in this browser. Nothing is uploaded.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847).

The published desk is [soham-fliight.github.io/folio](https://soham-fliight.github.io/folio/). A push to `main` builds a static export and deploys it with GitHub Pages.

Choose a PDF, or drop one anywhere on the desk. A sample gathering is already on the shelf if you want to feel the pages before you bring your own.

## Reading

- Arrow keys, the page edges, and the fore-edge ribbon move through the book.
- **Dictation** reads the current sheet aloud and turns the page when the sentences run out. Pace can be unhurried, steady, or brisk. Press `D` to start or stop.
- **Margin notes** can be written or dictated. They stay beside the file page they belong to.
- The shelf shows how many pages of each file you have opened, and the book reopens at the sheet you left.

Scanned pages, and pages with almost no type, are laid on the sheet as they were printed. Dictation steps past them.
