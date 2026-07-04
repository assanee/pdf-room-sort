export type FileStatus = 'queued' | 'processing' | 'done' | 'error'

/** Result of reading one PDF: the detected room, OCR confidence, page count, and a page-1 thumbnail. */
export type ExtractResult = {
  room: string | null
  confidence: number
  pageCount: number
  previewUrl: string
}

/** One row in the UI — a file plus everything we learned (or failed to learn) about it. */
export type FileItem = {
  id: string
  file: File
  status: FileStatus
  room: string | null
  confidence: number
  pageCount: number
  previewUrl: string
  error?: string
}
