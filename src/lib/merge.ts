import { PDFDocument } from 'pdf-lib'

/**
 * Merge PDFs in the given order into one document, copying the ORIGINAL page
 * bytes (never re-rendering) so fidelity is preserved exactly. OCR only decides
 * the order; it never touches the output pages.
 */
export async function mergeFiles(files: File[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const f of files) {
    const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true })
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return out.save()
}

// TS ≥5.7 gotcha: `new Blob([bytes], …)` errors because Uint8Array.buffer may be a
// SharedArrayBuffer, which is not a valid BlobPart. Cast through BlobPart to fix it.
function toPdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

/** Trigger a browser download of the merged PDF. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(toPdfBlob(bytes))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Print the merged PDF via a hidden iframe: wait for onload, focus, print, then
 * revoke the object URL late (~60s) so the print dialog keeps working.
 * Safari/iOS fallback: on any error, open the blob in a new tab and let the caller
 * toast "กด Cmd/Ctrl + P".
 */
export function printPdf(bytes: Uint8Array, onFallback?: () => void): void {
  const url = URL.createObjectURL(toPdfBlob(bytes))
  const revokeLater = () => setTimeout(() => URL.revokeObjectURL(url), 60_000)

  const fallback = () => {
    window.open(url, '_blank', 'noopener')
    onFallback?.()
    revokeLater()
  }

  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  })

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow
      if (!win) throw new Error('iframe window unavailable')
      win.focus()
      win.print()
      revokeLater()
      setTimeout(() => iframe.remove(), 60_000)
    } catch {
      iframe.remove()
      fallback()
    }
  }
  iframe.onerror = () => {
    iframe.remove()
    fallback()
  }

  iframe.src = url
  document.body.appendChild(iframe)
}
