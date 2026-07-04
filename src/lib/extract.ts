import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { PROFILE, type Profile } from './profile'
import type { ExtractResult, ReviewReason } from './types'

// PDF.js renders on its own worker thread (bundled by Vite via the ?url import).
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const RENDER_SCALE = 3.0 // ≈216 DPI — validated OCR sweet spot for these headers
const PREVIEW_MAX_WIDTH = 380 // px — page-1 thumbnail width
const MAX_PAGES_TO_TRY = 3 // page-1 first, then fall back to pages 2–3

// ── Single shared Tesseract worker ──────────────────────────────────────────
// One worker is reused across every file. Creation is guarded so that a burst
// of concurrent extractions only ever spins up one worker.
let _worker: Worker | null = null
let _workerInit: Promise<Worker> | null = null

async function getWorker(lang: string): Promise<Worker> {
  if (_worker) return _worker
  if (!_workerInit) {
    _workerInit = (async () => {
      const worker = await createWorker(lang, OEM.LSTM_ONLY, {
        // Self-hosted assets served from our own origin (see scripts/copy-tesseract.mjs).
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/', // dir containing tesseract-core*.wasm(.js)
        langPath: '/tesseract/', // dir containing eng.traineddata.gz
      })
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
      _worker = worker
      return worker
    })()
  }
  return _workerInit
}

// ── OCR serialization ────────────────────────────────────────────────────────
// A single tesseract.js worker runs one recognize job at a time. The batch queue
// keeps two files in flight for pipelining (render one while OCR'ing another),
// but every recognize call funnels through this promise-chain mutex so jobs never
// overlap on the shared worker.
const noop = () => {}
let _ocrChain: Promise<unknown> = Promise.resolve()
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = _ocrChain.then(task, task)
  _ocrChain = result.then(noop, noop)
  return result
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
function cropRectangle(canvas: HTMLCanvasElement, region: Profile['cropRegion']) {
  const { x0, y0, x1, y1 } = region
  return {
    left: Math.round(x0 * canvas.width),
    top: Math.round(y0 * canvas.height),
    width: Math.round((x1 - x0) * canvas.width),
    height: Math.round((y1 - y0) * canvas.height),
  }
}

// Downscale the (large, 3×) render into a lightweight JPEG data URL for the card thumbnail.
function makePreview(canvas: HTMLCanvasElement): string {
  const scale = Math.min(1, PREVIEW_MAX_WIDTH / canvas.width)
  const w = Math.max(1, Math.round(canvas.width * scale))
  const h = Math.max(1, Math.round(canvas.height * scale))
  const thumb = document.createElement('canvas')
  thumb.width = w
  thumb.height = h
  const ctx = thumb.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/jpeg', 0.82)
  ctx.drawImage(canvas, 0, 0, w, h)
  return thumb.toDataURL('image/jpeg', 0.82)
}

/**
 * Render page 1 (fallback 2–3) of a PDF, OCR the header crop, and parse the room.
 * OCR only — these PDFs have no extractable text layer, so text extraction is skipped entirely.
 */
export async function extractRoom(file: File, profile: Profile = PROFILE): Promise<ExtractResult> {
  const worker = await getWorker(profile.ocrLang)
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise

  try {
    const pageCount = pdf.numPages
    const requiredDigits = profile.fields.room.validDigits
    let previewUrl = ''
    let room: string | null = null // valid = exactly requiredDigits long
    let rawValue: string | null = null // first candidate seen, any length (for review)
    let confidence = 0

    const maxPages = Math.min(MAX_PAGES_TO_TRY, pageCount)
    for (let n = 1; n <= maxPages; n++) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')

      // PDF pages are transparent where nothing is drawn; the viewer normally
      // supplies the white "paper". Paint white first so OCR always sees dark
      // text on a light background (and the thumbnail isn't black).
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({ canvasContext: ctx, viewport }).promise
      if (n === 1) previewUrl = makePreview(canvas)

      const rectangle = cropRectangle(canvas, profile.cropRegion)
      const { data } = await runExclusive(() => worker.recognize(canvas, { rectangle }))
      const match = profile.fields.room.pattern.exec(data.text ?? '')

      // Release the large 3× canvas ASAP to keep memory low across the batch.
      canvas.width = 0
      canvas.height = 0
      page.cleanup()

      if (match) {
        const digits = match[1]
        if (digits.length === requiredDigits) {
          // Accepted — a full, valid room number. Stop here.
          room = digits
          rawValue = digits
          confidence = data.confidence ?? 0
          break
        }
        // Wrong length (e.g. a 2-digit misread): remember the first one, but
        // keep scanning the remaining pages in case a valid room shows up.
        if (rawValue === null) {
          rawValue = digits
          confidence = data.confidence ?? 0
        }
        continue
      }
      if (n === 1 && rawValue === null) confidence = data.confidence ?? 0 // page-1 confidence if nothing matched
    }

    const needsReview = room === null
    const reviewReason: ReviewReason | null = !needsReview
      ? null
      : rawValue !== null
        ? 'wrong_digits'
        : 'not_found'

    return { room, rawValue, needsReview, reviewReason, confidence, pageCount, previewUrl }
  } finally {
    await pdf.destroy()
  }
}

/** Optional cleanup (e.g. on teardown). Not required for normal use. */
export async function terminateWorker(): Promise<void> {
  if (_worker) {
    await _worker.terminate()
    _worker = null
    _workerInit = null
  }
}
