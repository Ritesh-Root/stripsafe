import type { Draft } from './types'

export type ParsedFields = Pick<Draft, 'product' | 'brand' | 'batch' | 'manufacturer' | 'mfg' | 'exp'>

const DATE =
  /(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[/.-]\d{2,4}|[A-Za-z]{3,9}[-\s]\d{4})/

const BATCH_RE =
  /(?:B\.?\s*No\.?|Batch(?:\s*(?:No\.?|Number|#))?)\s*[:.#-]?\s*([A-Za-z0-9][A-Za-z0-9./-]{1,30})/i

const MFG_RE = new RegExp(
  String.raw`(?:Mfg\.?|Mfd\.?|Manufacturing|Manufactured)(?:\s*Date)?\s*[:-]?\s*(${DATE.source})`,
  'i',
)

const EXP_RE = new RegExp(
  String.raw`(?:Exp\.?|Expiry|Expiration)(?:\s*Date)?\s*[:-]?\s*(${DATE.source})`,
  'i',
)

const MFR_RE =
  /(?:Manufactured\s+by|Mfr\.?|Manufacturer|Mfg\.?\s*by)\s*[:-]?\s*(.+)/i

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** A batch token needs a digit so words like "Batch of" are not captured. */
export function isBatchToken(value: string): boolean {
  const token = value.replace(/[^A-Za-z0-9./-]/g, '')
  return token.length >= 3 && /\d/.test(token)
}

function captureDate(text: string, re: RegExp): string {
  const match = text.match(re)
  return match?.[1] ? clean(match[1]) : ''
}

function captureBatch(text: string): string {
  const match = text.match(BATCH_RE)
  if (!match?.[1]) return ''
  const token = match[1].replace(/(MFG|MFD|EXP|EXPIRY).*$/i, '').replace(/[^A-Za-z0-9./-]+$/g, '')
  return isBatchToken(token) ? token : ''
}

function captureManufacturer(text: string): string {
  const match = text.match(MFR_RE)
  if (!match?.[1]) return ''
  const value = clean(match[1]).replace(/\b(B\.?\s*No\.?|Batch|Mfg\.?|Exp\.?).*$/i, '').trim()
  if (/^(date|dt)\b/i.test(value)) return ''
  return value
}

function productLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => !BATCH_RE.test(line) && !MFG_RE.test(line) && !EXP_RE.test(line) && !MFR_RE.test(line))
}

/**
 * Pull batch, manufacture and expiry off foil text.
 * Anchors are B.No / Batch, Mfg / Mfd, and Exp / Expiry.
 */
export function parseStrip(text: string): ParsedFields {
  const source = text.replace(/\u00a0/g, ' ')
  const lines = productLines(source)
  let brand = ''
  let product = ''
  const lead = lines[0] ?? ''
  const split = lead.split(/\s+[·•|]\s+/)
  if (split.length > 1) {
    brand = clean(split[0] ?? '')
    product = clean(split.slice(1).join(' '))
  } else if (lead) {
    product = lead
    brand = lead
  }
  if (lines.length > 1 && !product.includes(lines[1] ?? '')) {
    product = product || lines.slice(split.length > 1 ? 1 : 0).join(' ')
  }

  return {
    product,
    brand,
    batch: captureBatch(source),
    manufacturer: captureManufacturer(source),
    mfg: captureDate(source, MFG_RE),
    exp: captureDate(source, EXP_RE),
  }
}

export type Glyph = { char: string; confidence: number }

/** Map low-confidence OCR glyphs onto indexes in the parsed batch. */
export function unsureIndexes(batch: string, glyphs: Glyph[], threshold = 80): number[] {
  if (!batch || glyphs.length === 0) return []
  const compact = glyphs.filter((glyph) => glyph.char.trim().length > 0)
  const text = compact.map((glyph) => glyph.char).join('').toUpperCase()
  const needle = batch.toUpperCase().replace(/\s+/g, '')
  const at = text.indexOf(needle)
  if (at < 0) return []
  const indexes: number[] = []
  for (let i = 0; i < needle.length; i += 1) {
    const glyph = compact[at + i]
    if (glyph && glyph.confidence < threshold) indexes.push(i)
  }
  return indexes
}
