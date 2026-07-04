export type FileStatus = 'queued' | 'processing' | 'done' | 'error'

/**
 * Why a file needs a human to look at it:
 * - 'wrong_digits' — a room was read but not the required length (e.g. 2 digits)
 * - 'not_found'    — no room could be read from any scanned page
 */
export type ReviewReason = 'wrong_digits' | 'not_found'

/** Result of reading one PDF: the detected room, OCR confidence, page count, and a page-1 thumbnail. */
export type ExtractResult = {
  room: string | null // the VALIDATED room (exactly validDigits long), else null
  rawValue: string | null // any digits found after "Room", even if the wrong length
  needsReview: boolean
  reviewReason: ReviewReason | null
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
  rawValue: string | null
  needsReview: boolean
  reviewReason: ReviewReason | null
  confidence: number
  pageCount: number
  previewUrl: string
  error?: string
}
