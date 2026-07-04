import * as React from 'react'
import {
  GripVertical,
  Loader2,
  FileText,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
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
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (id: string) => void
  onDragEnd: () => void
}

/** Status badge (+ confidence) driven by the item's extraction result. */
function StatusBadge({ item }: { item: FileItem }) {
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
  // done
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
  return (
    <Badge variant="destructive" className="gap-1.5">
      <AlertTriangle className="size-3" />
      ไม่พบเลขห้อง
    </Badge>
  )
}

function Thumbnail({ item }: { item: FileItem }) {
  const box = 'w-12 shrink-0 aspect-[210/297] overflow-hidden rounded-md border bg-muted'
  if (item.previewUrl) {
    return (
      <div className={box}>
        <img
          src={item.previewUrl}
          alt={`หน้าแรกของ ${item.file.name}`}
          className="h-full w-full object-cover object-top"
          draggable={false}
        />
      </div>
    )
  }
  return (
    <div className={cn(box, 'grid place-items-center text-muted-foreground')}>
      {item.status === 'error' ? (
        <FileText className="size-5" />
      ) : (
        <Loader2 className="size-5 animate-spin" />
      )}
    </div>
  )
}

export function FileCard({
  item,
  index,
  isDragging,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: FileCardProps) {
  const [over, setOver] = React.useState(false)

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
      )}
    >
      {/* Drag handle + order index */}
      <div className="flex shrink-0 flex-col items-center gap-1 text-muted-foreground">
        <GripVertical className="size-4 cursor-grab active:cursor-grabbing" aria-hidden />
        <span className="font-mono text-xs tabular-nums" aria-label={`ลำดับที่ ${index + 1}`}>
          {index + 1}
        </span>
      </div>

      <Thumbnail item={item} />

      {/* Filename + metadata */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.pageCount > 0 ? (
            <span className="font-mono">{item.pageCount}</span>
          ) : (
            <span className="font-mono">–</span>
          )}{' '}
          หน้า
        </p>
        <div className="mt-2">
          <StatusBadge item={item} />
        </div>
      </div>

      {/* Reorder + remove controls (keyboard/mobile alternative to drag) */}
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
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(item.id)}
        aria-label={`ลบ ${item.file.name}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  )
}
