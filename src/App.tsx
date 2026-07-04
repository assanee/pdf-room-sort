import * as React from 'react'
import {
  Upload,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  Combine,
  Download,
  Printer,
  Loader2,
  ShieldCheck,
  Files,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { FileCard } from '@/components/FileCard'
import { extractRoom } from '@/lib/extract'
import { mergeFiles, downloadPdf, printPdf } from '@/lib/merge'
import type { FileItem } from '@/lib/types'

const CONCURRENCY = 2

let _idSeq = 0
const nextId = () => `f${++_idSeq}`

/** Sort by numeric room; files with no room always sink to the bottom (regardless of direction). */
function sortItems(list: FileItem[], dir: 'asc' | 'desc'): FileItem[] {
  const withRoom = list.filter((i) => i.room != null)
  const without = list.filter((i) => i.room == null)
  withRoom.sort((a, b) => {
    const ra = parseInt(a.room as string, 10)
    const rb = parseInt(b.room as string, 10)
    return dir === 'asc' ? ra - rb : rb - ra
  })
  return [...withRoom, ...without]
}

function buildFilename(list: FileItem[]): string {
  const rooms = list.map((i) => i.room).filter((r): r is string => r != null)
  if (rooms.length === 0) return 'merged.pdf'
  const label = rooms.slice(0, 6).join('-') + (rooms.length > 6 ? '-etc' : '')
  return `rooms-${label}.pdf`
}

export default function App() {
  const [items, setItems] = React.useState<FileItem[]>([])
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')
  const [isMerged, setIsMerged] = React.useState(false)
  const [isMerging, setIsMerging] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [isOverDropzone, setIsOverDropzone] = React.useState(false)

  const mergedRef = React.useRef<Uint8Array | null>(null)
  const dragIdRef = React.useRef<string | null>(null)
  const sortDirRef = React.useRef(sortDir)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    sortDirRef.current = sortDir
  }, [sortDir])

  // Any add / remove / reorder / re-sort invalidates a previously merged result.
  const invalidateMerge = React.useCallback(() => {
    mergedRef.current = null
    setIsMerged(false)
  }, [])

  const updateItem = React.useCallback((id: string, patch: Partial<FileItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  // ── Batch extraction (concurrency 2, single shared OCR worker) ──────────────
  const processItems = React.useCallback(
    async (batch: FileItem[]) => {
      let cursor = 0
      const runnerCount = Math.min(CONCURRENCY, batch.length)
      const runners = Array.from({ length: runnerCount }, async () => {
        while (cursor < batch.length) {
          const item = batch[cursor++]
          updateItem(item.id, { status: 'processing' })
          try {
            const r = await extractRoom(item.file)
            updateItem(item.id, {
              status: 'done',
              room: r.room,
              confidence: r.confidence,
              pageCount: r.pageCount,
              previewUrl: r.previewUrl,
            })
          } catch (err) {
            updateItem(item.id, {
              status: 'error',
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      })
      await Promise.all(runners)

      // Auto-sort once the batch finishes and nothing is still in flight.
      setItems((prev) => {
        const inFlight = prev.some((i) => i.status === 'processing' || i.status === 'queued')
        return inFlight ? prev : sortItems(prev, sortDirRef.current)
      })
    },
    [updateItem],
  )

  const addFiles = React.useCallback(
    (fileList: FileList | File[]) => {
      const pdfs = Array.from(fileList).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      )
      if (pdfs.length === 0) return // silently skip non-PDFs
      const batch: FileItem[] = pdfs.map((f) => ({
        id: nextId(),
        file: f,
        status: 'queued',
        room: null,
        confidence: 0,
        pageCount: 0,
        previewUrl: '',
      }))
      setItems((prev) => [...prev, ...batch])
      invalidateMerge()
      void processItems(batch)
    },
    [invalidateMerge, processItems],
  )

  // ── Reorder (drag + keyboard/mobile buttons) ────────────────────────────────
  const moveByOffset = React.useCallback(
    (id: string, offset: -1 | 1) => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === id)
        const target = idx + offset
        if (idx < 0 || target < 0 || target >= prev.length) return prev
        const next = [...prev]
        const [moved] = next.splice(idx, 1)
        next.splice(target, 0, moved)
        return next
      })
      invalidateMerge()
    },
    [invalidateMerge],
  )

  const handleDragStart = React.useCallback((id: string) => {
    dragIdRef.current = id
    setDraggingId(id)
  }, [])

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault() // required to allow a drop
  }, [])

  const handleDrop = React.useCallback(
    (targetId: string) => {
      const fromId = dragIdRef.current
      dragIdRef.current = null
      setDraggingId(null)
      if (!fromId || fromId === targetId) return
      setItems((prev) => {
        const from = prev.findIndex((i) => i.id === fromId)
        const to = prev.findIndex((i) => i.id === targetId)
        if (from < 0 || to < 0 || from === to) return prev
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
      invalidateMerge()
    },
    [invalidateMerge],
  )

  const handleDragEnd = React.useCallback(() => {
    dragIdRef.current = null
    setDraggingId(null)
  }, [])

  // ── Toolbar actions ─────────────────────────────────────────────────────────
  const toggleSort = () => {
    const next = sortDir === 'asc' ? 'desc' : 'asc'
    setSortDir(next)
    setItems((prev) => sortItems(prev, next))
    invalidateMerge()
  }

  const removeItem = React.useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id))
      invalidateMerge()
    },
    [invalidateMerge],
  )

  const isProcessing = items.some((i) => i.status === 'processing' || i.status === 'queued')
  const doneCount = items.filter((i) => i.status === 'done' || i.status === 'error').length

  const handleMerge = async () => {
    if (items.length === 0 || isProcessing || isMerging) return
    setIsMerging(true)
    try {
      const bytes = await mergeFiles(items.map((i) => i.file))
      mergedRef.current = bytes
      setIsMerged(true)
    } catch (err) {
      mergedRef.current = null
      setIsMerged(false)
      setToast('รวมไฟล์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsMerging(false)
    }
  }

  const handleDownload = () => {
    if (mergedRef.current) downloadPdf(mergedRef.current, buildFilename(items))
  }

  const handlePrint = () => {
    if (mergedRef.current) printPdf(mergedRef.current, () => setToast('กด Cmd/Ctrl + P เพื่อพิมพ์'))
  }

  // ── Effects: toast auto-dismiss + window-level stray-drop guard ──────────────
  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  React.useEffect(() => {
    // Prevent a PDF dropped outside the dropzone from navigating the tab away.
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const openPicker = () => fileInputRef.current?.click()

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow">
              <Files className="size-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                จัดเรียง PDF ตามเลขห้อง
              </h1>
              <p className="text-sm text-muted-foreground">
                อ่านเลขห้องจากใบเสร็จ/ใบกำกับภาษี แล้วรวมเป็นไฟล์เดียว
              </p>
            </div>
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            ประมวลผลในเครื่อง 100% — ไฟล์ไม่ถูกอัปโหลดออกไปที่ใด
          </div>
        </header>

        {/* Dropzone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="เพิ่มไฟล์ PDF ด้วยการลากมาวางหรือคลิกเพื่อเลือก"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openPicker()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsOverDropzone(true)
          }}
          onDragLeave={() => setIsOverDropzone(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsOverDropzone(false)
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isOverDropzone
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/60 hover:bg-accent/40',
          )}
        >
          <div className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
            <Upload className="size-6" />
          </div>
          <div>
            <p className="font-medium">ลากไฟล์ PDF มาวางที่นี่</p>
            <p className="text-sm text-muted-foreground">หรือคลิกเพื่อเลือกไฟล์ (เลือกได้หลายไฟล์)</p>
          </div>
          <span className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'pointer-events-none')}>
            เลือกไฟล์
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {/* Toolbar */}
        {items.length > 0 && (
          <div className="sticky top-0 z-10 -mx-4 mt-6 flex flex-wrap items-center gap-2 border-b bg-background/90 px-4 py-3 backdrop-blur">
            <div className="mr-auto text-sm text-muted-foreground">
              {isProcessing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  กำลังอ่าน <span className="font-mono">{doneCount}</span>/
                  <span className="font-mono">{items.length}</span>
                </span>
              ) : (
                <span>
                  <span className="font-mono">{items.length}</span> ไฟล์
                </span>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={toggleSort} disabled={items.length < 2}>
              {sortDir === 'asc' ? (
                <ArrowUpNarrowWide className="size-4" />
              ) : (
                <ArrowDownWideNarrow className="size-4" />
              )}
              {sortDir === 'asc' ? 'น้อย → มาก' : 'มาก → น้อย'}
            </Button>

            <Button onClick={handleMerge} disabled={isProcessing || isMerging} size="sm">
              {isMerging ? <Loader2 className="size-4 animate-spin" /> : <Combine className="size-4" />}
              รวมเป็นไฟล์เดียว
            </Button>

            {isMerged && (
              <>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  <Download className="size-4" />
                  ดาวน์โหลด
                </Button>
                <Button variant="secondary" size="sm" onClick={handlePrint}>
                  <Printer className="size-4" />
                  พิมพ์
                </Button>
              </>
            )}
          </div>
        )}

        {/* File list */}
        {items.length > 0 && (
          <ul className="mt-4 space-y-2" onDragOver={handleDragOver}>
            {items.map((item, index) => (
              <FileCard
                key={item.id}
                item={item}
                index={index}
                isDragging={draggingId === item.id}
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
                onRemove={removeItem}
                onMoveUp={(id) => moveByOffset(id, -1)}
                onMoveDown={(id) => moveByOffset(id, 1)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))}
          </ul>
        )}

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          รองรับใบเสร็จ/ใบกำกับภาษีที่มีเลขห้องในหัวกระดาษ • อ่านด้วย OCR • รวมไฟล์โดยคงหน้าต้นฉบับไว้ทุกหน้า
        </footer>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
