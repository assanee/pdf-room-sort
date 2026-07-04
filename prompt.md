# Claude Code build prompt — Client-side PDF room-sorter (Vite + React + shadcn), deploy on Vercel

Copy everything below the line into Claude Code. It is a complete, self-contained build brief. If you also have the reference implementation zip `pdf-room-sort`, treat that as the source of truth and adapt it for Vercel; otherwise build from scratch per this spec.

---

## Role & objective

You are building a **browser-only web app** that:

1. Accepts multiple PDF files (hotel **tax-invoice / receipt** PDFs — one document per file, may be multi-page).
2. Reads the **room number** off each file's **first page** using **OCR**.
3. Shows a first-page **preview** + the detected room per file so the user can visually re-check, and lets them **drag to reorder** if a detection is wrong or they want a different order.
4. **Merges** the files into a single PDF (default order = sorted by room number) and lets the user **download** or **print** it.

Everything runs **100% client-side** — no file is ever uploaded, no backend, no serverless functions, no environment variables. The app is a **static SPA deployed on Vercel**.

## Critical context — validated, do NOT rediscover

These were verified against real sample files; build to them directly.

- **The target PDFs have NO extractable text layer.** The text is drawn as vector paths, so `pdffonts` is empty and PDF.js `getTextContent()` returns nothing. **OCR is mandatory.** Do not attempt text-layer extraction or a "try text first" hybrid — go straight to OCR.
- The room number is in the **top-right header block** of page 1, labeled `Room`, value is numeric (e.g. `401`, `406`, `411`, `515`). It is identical on every page of a file, so **reading page 1 is sufficient**.
- **Trap:** the word "Room" also appears in table rows ("OTA Room Charge"). Defend against it two ways (both required): (1) OCR **only the top-right header region** (a crop), never the whole page; (2) the regex requires **digits immediately after** "Room".
- **Validated OCR parameters — use these exact values:**
  - Render page 1 to canvas at **scale `3.0`** (≈216 DPI).
  - Crop region, as fractions of page width/height: **`{ x0: 0.58, y0: 0.22, x1: 0.99, y1: 0.40 }`**.
  - Tesseract language **`eng`** (header is Latin + digits only → small, fast, accurate; do not load Thai).
  - Page segmentation mode **`PSM.SINGLE_BLOCK`**.
  - Room regex: **`/\bRoom\b[^\d]{0,6}(\d{1,4})\b/`**.
  - With these, OCR reads the sample rooms correctly (401 / 406 / 411 / 515).
- **Merge must copy the ORIGINAL page bytes** (`pdf-lib` `copyPages`). OCR only decides the order — never re-render pages into the output (fidelity must be preserved).

## Tech stack (exact)

- **Vite + React 18 + TypeScript** (strict mode).
- **Tailwind CSS v3 + shadcn/ui** — style `new-york`, base color `slate`, components generated **in-repo** (`src/components/ui/*`). Needed components: `button`, `card`, `badge`.
- Libraries: **`pdfjs-dist`** (render page → canvas), **`tesseract.js`** (OCR), **`pdf-lib`** (merge), **`lucide-react`** (icons), plus shadcn deps: `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`, `tailwindcss-animate`.
- **No** localStorage / sessionStorage / any browser storage — keep all state in React state.
- **UI copy in Thai**; code identifiers & comments in **English**. Fonts: **Sarabun** (UI/body) + **IBM Plex Mono** (numeric metadata: page counts, order index, confidence) via Google Fonts `<link>` in `index.html`.

## Features (must-have)

1. **Add PDFs** via drag-and-drop onto a dropzone or a file picker (accept `application/pdf`; silently skip non-PDFs; also guard the window against stray drops navigating away).
2. **Per-file extraction:** render page 1 → OCR the header region → parse room. **First-page-first priority**: if page 1 yields no room, fall back to pages 2–3. Process the batch with **concurrency 2** and show per-file progress.
3. **File card** shows: page-1 **preview thumbnail**, filename, page count, an order index, and a status **badge**:
   - processing → "กำลังอ่าน…" (spinner)
   - done + room found → primary badge "ห้อง {room}" + OCR confidence %
   - done + no room → destructive badge "ไม่พบเลขห้อง"
   - error → destructive badge "อ่านไฟล์ไม่ได้"
4. **Auto-sort ascending by room** once a batch finishes; a toolbar toggle flips asc/desc. Files with no room sink to the bottom.
5. **Drag-to-reorder** any card (native HTML5 DnD). Manual order always wins.
6. Any **add / remove / reorder invalidates** the previously merged result (hide download/print until re-merged).
7. **"รวมเป็นไฟล์เดียว"** → merge with `pdf-lib` in current display order → reveal **"ดาวน์โหลด"** and **"พิมพ์"**.
8. **Print** via a hidden iframe: wait for `onload`, `focus()`, `print()`, revoke the object URL after ~60s. **Safari/iOS fallback**: on error, open the blob in a new tab and toast "กด Cmd/Ctrl + P".
9. Quality floor: responsive down to mobile, visible keyboard focus, `prefers-reduced-motion` respected.

## Suggested structure

```
src/
  main.tsx
  index.css                # tailwind + shadcn CSS vars; set --primary to a deep ink-blue
  vite-env.d.ts            # /// <reference types="vite/client" />  (needed for ?url imports)
  App.tsx                  # state, batch queue, drag reorder, toolbar, actions
  lib/
    utils.ts               # cn()
    profile.ts             # config-driven extraction profile (region + regex)
    extract.ts             # PDF.js render + Tesseract OCR (self-hosted assets)
    merge.ts               # pdf-lib merge + download + print
  components/
    ui/ { button.tsx, card.tsx, badge.tsx }
    FileCard.tsx
```

Keep extraction **config-driven** so another document template can be added later as another profile:

```ts
// src/lib/profile.ts
export type Profile = {
  id: string
  label: string
  ocrLang: string
  cropRegion: { x0: number; y0: number; x1: number; y1: number } // fractions of page
  fields: { room: { pattern: RegExp } }
}

export const PROFILE: Profile = {
  id: 'b2_tax_invoice',
  label: 'ใบเสร็จ/ใบกำกับภาษี B2 Hotel',
  ocrLang: 'eng',
  cropRegion: { x0: 0.58, y0: 0.22, x1: 0.99, y1: 0.40 },
  fields: { room: { pattern: /\bRoom\b[^\d]{0,6}(\d{1,4})\b/ } }, // widen to alphanumeric if needed
}
```

`extract.ts` essentials — reuse a **single** Tesseract worker across files, render at scale 3.0, OCR the cropped rectangle, and use **self-hosted** asset paths (see Vercel section):

```ts
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker, PSM, type Worker } from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

let _worker: Worker | null = null
async function getWorker() {
  if (!_worker) {
    _worker = await createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/',   // dir with tesseract-core*.wasm(.js)
      langPath: '/tesseract/',   // dir with eng.traineddata.gz
    })
    await _worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
  }
  return _worker
}
// render page → canvas via pdfjs; recognize(canvas, { rectangle }) where rectangle is
// region.* × canvas dimensions; parse with PROFILE.fields.room.pattern; page-1 first, fall back 2–3.
```

`merge.ts` — copy original bytes, and note the TS gotcha:

```ts
import { PDFDocument } from 'pdf-lib'
export async function mergeFiles(files: File[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const f of files) {
    const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true })
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return out.save()
}
// TS ≥5.7 gotcha: `new Blob([bytes], …)` errors because Uint8Array.buffer may be SharedArrayBuffer.
// Fix: `new Blob([bytes as BlobPart], { type: 'application/pdf' })`.
// print(): hidden iframe + onload + focus + print + late revoke (60s) + new-tab fallback for Safari.
```

## Vercel deployment (must configure)

- Pure **static Vite SPA**. On Vercel the framework preset auto-detects as **Vite**: build `npm run build`, output directory `dist`. **No functions, no env vars.** Say this in the README.
- The **PDF.js worker** is imported via `?url` and bundled by Vite into `dist/assets/` automatically — no extra config.
- **Self-host the Tesseract.js assets** (worker, core wasm, and language data). Do **not** rely on the public jsDelivr/unpkg CDN at runtime — for data-privacy (guest/payroll data context) and reliability, OCR assets must load from the app's **own origin**. Implement a build step that populates `public/tesseract/`:

```js
// scripts/copy-tesseract.mjs  — runs before dev & build
import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const out = 'public/tesseract'
await mkdir(out, { recursive: true })

// core wasm + glue (inspect node_modules for exact filenames; copy all tesseract-core*.wasm(.js))
const coreDir = path.dirname(require.resolve('tesseract.js-core/package.json'))
for (const f of await readdir(coreDir))
  if (/^tesseract-core.*\.wasm(\.js)?$/.test(f)) await copyFile(path.join(coreDir, f), path.join(out, f))

// worker script
const tjs = path.dirname(require.resolve('tesseract.js/package.json'))
await copyFile(path.join(tjs, 'dist', 'worker.min.js'), path.join(out, 'worker.min.js'))

// language data (gzipped)
const res = await fetch('https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz')
if (!res.ok) throw new Error(`traineddata download failed: ${res.status}`)
await writeFile(path.join(out, 'eng.traineddata.gz'), Buffer.from(await res.arrayBuffer()))
console.log('Tesseract assets ->', out)
```

- Wire it into `package.json`: `"predev": "node scripts/copy-tesseract.mjs"` and `"prebuild": "node scripts/copy-tesseract.mjs"`. `.gitignore` `public/tesseract/` (generated at build; Vercel runs `prebuild` automatically and has network access to fetch the traineddata). If `require.resolve('<pkg>/package.json')` is blocked by package `exports`, read from `node_modules/<pkg>` directly.
- **No COOP/COEP headers needed** — tesseract.js v5 runs single-threaded without `SharedArrayBuffer`. Do not add `Cross-Origin-Embedder-Policy: require-corp` (it would break loading other cross-origin resources).
- Optional `vercel.json` — long cache for the self-hosted assets:

```json
{
  "headers": [
    { "source": "/tesseract/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
```

## Acceptance criteria (verify before you finish)

1. `npm run build` (tsc strict + `vite build`) passes with **zero** errors.
2. `npm run dev`, then drop the four B2 sample PDFs → detected rooms **401 / 406 / 411 / 515**; the list **auto-sorts to 401 → 406 → 411 → 515**; preview thumbnails render; drag-reorder works; merging produces a single PDF whose **page order matches the on-screen order**; **download** and **print** both work.
3. In the browser Network tab, OCR assets (`worker.min.js`, `tesseract-core*.wasm*`, `eng.traineddata.gz`) load from the **same origin** (self-hosted), not a CDN.
4. Responsive to mobile, visible keyboard focus, reduced-motion respected.
5. README documents local dev (`npm install`, `npm run dev`) and Vercel deploy (import repo → Vite preset → build `npm run build`, output `dist`; no env; static only).

## Steps

1. Scaffold Vite React-TS; add Tailwind v3 + shadcn (`new-york` / `slate`); add all deps above.
2. Implement `profile.ts`, `extract.ts`, `merge.ts`, the shadcn UI components, `FileCard.tsx`, and `App.tsx` per spec.
3. Add `scripts/copy-tesseract.mjs` + `predev`/`prebuild` hooks; configure `createWorker` self-host paths.
4. Run `npm run build`; fix every type/build error (remember the `Uint8Array → BlobPart` cast).
5. `git init`, write the README (with Vercel deploy steps), add `vercel.json`.
6. Report the rooms detected from a test run and confirm each acceptance criterion.