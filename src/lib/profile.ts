// Config-driven extraction profile. Adding support for another document
// template later is a matter of adding another Profile (crop region + regex),
// not touching the extraction engine.
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
  // Top-right header block of page 1 — validated against real sample files.
  cropRegion: { x0: 0.58, y0: 0.22, x1: 0.99, y1: 0.4 },
  // Require digits immediately after "Room" so table rows like
  // "OTA Room Charge" can never satisfy it. Widen to alphanumeric if needed.
  fields: { room: { pattern: /\bRoom\b[^\d]{0,6}(\d{1,4})\b/ } },
}
