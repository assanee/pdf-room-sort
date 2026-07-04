import * as React from 'react'
import {
  GripVertical,
  Loader2,
  FileText,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Eye,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FileItem } from '@/lib/types'

type FileCardProps = {
  item: FileItem
  index: number
  isDragging: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onRemove: (id: string) => void
  onView: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (id: string) => void
  onDragEnd: () => void
}

/** Status badge (+ confidence) driven by the item's extraction result. */
export function StatusBadge({ item }: { item: FileItem }) {
  if (item.status === 'queued' || item.status === 'processing') {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Loader2 className="size-3 animate-spin" />
        กำลังอ่าน…
      </Badge>
    )
  }
  if (item.status === 'error') {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <AlertTriangle className="size-3" />
        อ่านไฟล์ไม่ได้
      </Badge>
    )
  }
  // done + valid 3-digit room
  if (item.room) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="gap-1">
          ห้อง <span className="font-mono">{item.room}</span>
        </Badge>
        <span className="font-mono text-xs text-muted-foreground">
          {Math.round(item.confidence)}%
        </span>
      </div>
    )
  }
  // done + needs review: wrong-length read (show the suspicious value) …
  if (item.reviewReason === 'wrong_digits') {
    return (
      <Badge variant="warning" className="gap-1.5">
        <AlertTriangle className="size-3" />
        พบเลข <span className="font-mono">{item.rawValue}</span> — โปรดตรวจสอบ
      </Badge>
    )
  }
  // … or nothing found at all
  return (
    <Badge variant="warning" className="gap-1.5">
      <AlertTriangle className="size-3" />
      ไม่พบเลขห้อง — โปรดตรวจสอบ
    </Badge>
  )
}

/** Page-1 thumbnail. Clicking it opens the original PDF in a new tab for review. */
function Thumbnail({ item, onView }: { item: FileItem; onView: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onView(item.id)}
      aria-label={`ดูไฟล์ ${item.file.name}`}
      className="group/thumb relative aspect-[210/297] w-12 shrink-0 overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt=""
          className="h-full w-full object-cover object-top"
          draggable={false}
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted-foreground">
          {item.status === 'error' ? (
            <FileText className="size-5" />
          ) : (
            <Loader2 className="size-5 animate-spin" />
          )}
        </span>
      )}
      <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100">
        <Eye className="size-4" />
      </span>
    </button>
  )
}

export function FileCard({
  item,
  index,
  isDragging,
  canMoveUp,
  canMoveDown,
  onRemove,
  onView,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: FileCardProps) {
  const [over, setOver] = React.useState(false)
  const flagged = item.status === 'done' && item.needsReview

  const handleDragStart = (e: React.DragEvent) => {
    // setData is required for Firefox to initiate a drag.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
    onDragStart(item.id)
  }

  return (
    <li
      draggable
      onDragStart={handleDragStart}
      onDragOver={(e) => {
        onDragOver(e)
        e.dataTransfer.dropEffect = 'move'
      }}
      onDragEnter={() => setOver(true)}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onDrop(item.id)
      }}
      onDragEnd={() => {
        setOver(false)
        onDragEnd()
      }}
      aria-roledescription="รายการที่ลากจัดเรียงได้"
      className={cn(
        'group flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors',
        over && 'border-primary ring-2 ring-primary/40',
        isDragging && 'opacity-40',
        flagged && 'border-amber-400 bg-amber-50/60 dark:border-amber-500/50 dark:bg-amber-500/5',
      )}
    >
      {/* Drag handle + order index */}
      <div className="flex shrink-0 flex-col items-center gap-1 text-muted-foreground">
        <GripVertical className="size-4 cursor-grab active:cursor-grabbing" aria-hidden />
        <span className="font-mono text-xs tabular-nums" aria-label={`ลำดับที่ ${index + 1}`}>
          {index + 1}
        </span>
      </div>

      <Thumbnail item={item} onView={onView} />

      {/* Filename + metadata */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{item.pageCount > 0 ? item.pageCount : '–'}</span> หน้า
        </p>
        <div className="mt-2">
          <StatusBadge item={item} />
        </div>
      </div>

      {/* Reorder controls (keyboard/mobile alternative to drag) */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canMoveUp}
          onClick={() => onMoveUp(item.id)}
          aria-label="เลื่อนขึ้น"
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canMoveDown}
          onClick={() => onMoveDown(item.id)}
          aria-label="เลื่อนลง"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {/* View + remove */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', flagged && 'text-amber-600 dark:text-amber-400')}
          onClick={() => onView(item.id)}
          aria-label={`ดูไฟล์ ${item.file.name}`}
        >
          <Eye className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(item.id)}
          aria-label={`ลบ ${item.file.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  )
}
