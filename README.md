# PDF Room Sorter

จัดเรียงและรวมไฟล์ PDF ใบเสร็จ/ใบกำกับภาษีโรงแรมตาม **เลขห้อง** โดยอ่านเลขห้องด้วย **OCR** — ทำงานใน
เบราว์เซอร์ **100%** ไม่มีการอัปโหลดไฟล์ ไม่มี backend ไม่มี serverless functions และไม่มี environment variables

A browser-only web app that reads the **room number** off each hotel tax-invoice PDF (via OCR of the
first page's header), lets you visually re-check and **drag to reorder**, then **merges** the files into a
single PDF sorted by room — all **client-side**. No file ever leaves the browser.

## How it works

1. **Add PDFs** — drag-and-drop or pick files (`application/pdf`; non-PDFs are silently skipped).
2. **Extract** — for each file, PDF.js renders page 1 to a canvas at 3× scale, then **tesseract.js OCRs
   only the top-right header crop** (`{ x0: 0.58, y0: 0.22, x1: 0.99, y1: 0.40 }`) and parses the room with
   `\bRoom\b[^\d]{0,6}(\d{1,6})\b`. A room is only **accepted when it has exactly 3 digits**
   (`validDigits` in the profile). A wrong-length read (e.g. a 2-digit misread) is *not* accepted: the app
   keeps scanning pages 2–3 for a valid room, and if none is found the file is **flagged for review**
   (showing the suspicious value it did read). The batch runs at **concurrency 2** through a **single
   shared OCR worker** (OCR calls are serialized via a mutex).
3. **Review & reorder** — each card shows a page-1 thumbnail, filename, page count, order index, and a
   status badge: valid room + confidence, an amber **"โปรดตรวจสอบ"** warning (wrong-length read or none
   found), or "อ่านไฟล์ไม่ได้". A toolbar chip counts how many files need review. **Click the thumbnail or
   the eye button to open the original PDF in a modal viewer** (with an "open in new tab" fallback for
   browsers that won't embed PDFs) and check by eye. Drag cards or use the up/down
   buttons to reorder. The list auto-sorts ascending by room when a batch finishes (a toolbar toggle flips
   asc/desc); files needing review sink to the bottom. **Manual order wins.**
4. **Merge** — `pdf-lib` copies the **original page bytes** (never re-rendered, so fidelity is preserved)
   in the current on-screen order. Then **download** or **print** the result.

Any add / remove / reorder invalidates the previous merge (the download/print buttons hide until you
re-merge).

## Tech stack

- **Vite + React 18 + TypeScript** (strict)
- **Tailwind CSS v3 + shadcn/ui** (`new-york` / `slate`)
- [`pdfjs-dist`](https://github.com/mozilla/pdf.js) — render page → canvas
- [`tesseract.js`](https://github.com/naptha/tesseract.js) — OCR (self-hosted assets)
- [`pdf-lib`](https://github.com/Hopding/pdf-lib) — merge
- `lucide-react`, plus shadcn deps (`clsx`, `tailwind-merge`, `class-variance-authority`,
  `@radix-ui/react-slot`, `tailwindcss-animate`)

Fonts: **Sarabun** (UI/body) + **IBM Plex Mono** (numeric metadata) via Google Fonts.

## Local development

```bash
npm install
npm run dev        # runs "predev" first: populates public/tesseract/ then starts Vite
```

Open the printed URL and drop in some PDFs.

> **Note on OCR assets.** `scripts/copy-tesseract.mjs` runs automatically before `dev` and `build`. It
> copies the tesseract.js worker + core WASM out of `node_modules` and downloads `eng.traineddata.gz`
> into `public/tesseract/`, so OCR loads entirely from **your own origin** (data privacy + reliability),
> never a public CDN. This directory is git-ignored and regenerated on each build. The download step needs
> network access the first time.

## Build

```bash
npm run build      # runs "prebuild" (copy-tesseract) -> tsc --noEmit -> vite build
npm run preview    # serve the production build locally
```

Output is a static site in `dist/`.

## Deploy on Vercel

This is a **pure static Vite SPA** — no functions, no environment variables.

1. Push the repo to GitHub/GitLab/Bitbucket.
2. In Vercel, **Import** the repo. The framework preset auto-detects as **Vite**:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Environment Variables:** none
3. Deploy. Vercel runs the `prebuild` hook automatically (it has network access to fetch the traineddata),
   so `public/tesseract/` is regenerated during the build.

`vercel.json` sets a long, immutable cache header for `/tesseract/*` (the self-hosted OCR assets).

### No special headers needed

tesseract.js v5 runs single-threaded without `SharedArrayBuffer`, so **no COOP/COEP headers** are
required. Do **not** add `Cross-Origin-Embedder-Policy: require-corp` — it would break loading other
cross-origin resources (e.g. the Google Fonts stylesheet).

## Adding another document template

Extraction is config-driven. To support a different invoice/receipt layout, add another `Profile` in
[`src/lib/profile.ts`](src/lib/profile.ts) (crop region + room regex + OCR language) — the extraction
engine in `extract.ts` stays unchanged.
