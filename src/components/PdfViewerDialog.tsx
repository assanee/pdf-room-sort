import { ExternalLink } from 'lucide-react'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { StatusBadge } from '@/components/FileCard'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { FileItem } from '@/lib/types'

type PdfViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string | null
  name: string
  item: FileItem | null
}

/**
 * Views the original PDF in an <iframe> (the browser's native viewer) inside a
 * modal. The header repeats the detected room / review status so the user can
 * cross-check while looking at the page. "เปิดในแท็บใหม่" is a fallback for
 * browsers that won't render a PDF in an iframe (notably mobile Safari).
 */
export function PdfViewerDialog({ open, onOpenChange, url, name, item }: PdfViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{name}</DialogTitle>
          <DialogDescription className="sr-only">ตัวอย่างไฟล์ PDF: {name}</DialogDescription>
          {item && (
            <div className="pt-1">
              <StatusBadge item={item} />
            </div>
          )}
        </DialogHeader>

        {url && (
          <iframe
            src={url}
            title={`ตัวอย่าง ${name}`}
            className="h-[72vh] w-full rounded-md border bg-muted"
          />
        )}

        <DialogFooter>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <ExternalLink className="size-4" />
              เปิดในแท็บใหม่
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
