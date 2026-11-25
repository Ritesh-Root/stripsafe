import type { AlertRow, MatchStatus } from './types'

/** OCR pairs that should not hide a real batch or invent a different one. */
export const CONFUSION_GROUPS = [
  ['0', 'O'],
  ['1', 'I', 'L'],
  ['5', 'S'],
  ['8', 'B'],
  ['2', 'Z'],
] as const

const CANON = new Map<string, string>()
for (const group of CONFUSION_GROUPS) {
  const canonical = group[0]
  for (const char of group) CANON.set(char, canonical)
}

const CANON_ALPHABET = '0123456789ACDEFGHJKMNPQRTUVWXY/-'

const NAME_STOP = new Set([
  'pvt', 'ltd', 'limited', 'private', 'llp', 'inc', 'co', 'company', 'india',
  'the', 'and', 'of', 'unit', 'plot', 'dist', 'district', 'village', 'road',
])

const NAME_FOLD: Record<string, string> = {
  pharmaceuticals: 'pharma',
  pharmaceutical: 'pharma',
  pharma: 'pharma',
  laboratories: 'lab',
  laboratory: 'lab',
  labs: 'lab',
  lab: 'lab',
}

export function normalizeBatch(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9/-]/g, '')
}

/** Map confusion twins onto one character so 0/O does not count as an edit. */
export function canonicalBatch(raw: string): string {
  const normalized = normalizeBatch(raw)
  let out = ''
  for (const char of normalized) out += CANON.get(char) ?? char
  return out
}

export function confusionDistance(a: string, b: string): number {
  return levenshtein(canonicalBatch(a), canonicalBatch(b))
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) prev[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    const ac = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j += 1) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost)
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!
  }
  return prev[b.length] ?? 0
}

function keysWithinOne(key: string): string[] {
  if (key.length > 24) return [key]
  const out = new Set<string>([key])
  for (let i = 0; i < key.length; i += 1) {
    out.add(key.slice(0, i) + key.slice(i + 1))
    for (const char of CANON_ALPHABET) {
      if (char !== key[i]) out.add(key.slice(0, i) + char + key.slice(i + 1))
    }
  }
  for (let i = 0; i <= key.length; i += 1) {
    for (const char of CANON_ALPHABET) out.add(key.slice(0, i) + char + key.slice(i))
  }
  return [...out]
}

export type AlertIndex = {
  byKey: Map<string, AlertRow[]>
  count: number
  months: string[]
}

export function buildIndex(rows: AlertRow[]): AlertIndex {
  const byKey = new Map<string, AlertRow[]>()
  const months = new Set<string>()
  for (const row of rows) {
    if (row.month) months.add(row.month)
    const key = canonicalBatch(row.batchNo)
    if (key.length < 3) continue
    const list = byKey.get(key)
    if (list) list.push(row)
    else byKey.set(key, [row])
  }
  return { byKey, count: rows.length, months: [...months] }
}

function tokens(value: string): Set<string> {
  const out = new Set<string>()
  for (const part of value.toLowerCase().split(/[^a-z0-9]+/)) {
    if (part.length < 3 || NAME_STOP.has(part)) continue
    out.add(NAME_FOLD[part] ?? part)
  }
  return out
}

/** Dice overlap of distinctive name tokens. 1 is the same name, 0 shares nothing. */
export function nameScore(a: string, b: string): number {
  const left = tokens(a)
  const right = tokens(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return (2 * shared) / (left.size + right.size)
}

export type Query = {
  batch: string
  product?: string
  brand?: string
  manufacturer?: string
}

export type MatchHit = {
  alert: AlertRow
  batchDistance: number
  batchScore: number
  manufacturerScore: number
  productScore: number
  agreement: number
  status: Exclude<MatchStatus, 'clear'>
}

export type MatchOutcome = {
  status: MatchStatus
  hit: MatchHit | null
  checkedCount: number
  months: string[]
}

function agreementOf(query: Query, row: AlertRow): { manufacturerScore: number; productScore: number; agreement: number; named: boolean } {
  const productQuery = [query.product, query.brand].filter(Boolean).join(' ')
  const productAlert = [row.productName, row.brandName].filter(Boolean).join(' ')
  const manufacturerScore = query.manufacturer && row.manufacturedBy
    ? nameScore(query.manufacturer, row.manufacturedBy)
    : 0
  const productScore = productQuery && productAlert ? nameScore(productQuery, productAlert) : 0
  const hasMfr = Boolean(query.manufacturer?.trim())
  const hasProduct = Boolean(productQuery.trim())
  let agreement = 0
  if (hasMfr && hasProduct) agreement = manufacturerScore * 0.55 + productScore * 0.45
  else if (hasMfr) agreement = manufacturerScore
  else if (hasProduct) agreement = productScore
  return { manufacturerScore, productScore, agreement, named: hasMfr || hasProduct }
}

function decide(distance: number, batchLength: number, named: boolean, agreement: number, manufacturerScore: number, productScore: number, hasBothNames: boolean): Exclude<MatchStatus, 'clear'> | null {
  if (distance > 1 || batchLength < 3) return null
  const namesDisagree = hasBothNames && manufacturerScore < 0.12 && productScore < 0.12
  if (distance === 0 && namesDisagree) return batchLength >= 5 ? 'review' : null
  if (distance === 0 && !named && batchLength >= 5) return 'flagged'
  if (distance === 0 && !named) return 'review'
  if (distance === 0 && agreement >= 0.34) return 'flagged'
  if (distance === 0) return 'review'
  if (distance === 1 && agreement >= 0.55 && batchLength >= 5) return 'flagged'
  if (distance === 1 && (agreement >= 0.2 || !named)) return 'review'
  return null
}

export function matchBatch(query: Query, index: AlertIndex): MatchOutcome {
  const key = canonicalBatch(query.batch)
  const base = { checkedCount: index.count, months: index.months, hit: null as MatchHit | null }
  if (key.length < 3) return { ...base, status: 'clear' }

  let best: MatchHit | null = null
  const seen = new Set<string>()
  for (const candidate of keysWithinOne(key)) {
    const rows = index.byKey.get(candidate)
    if (!rows) continue
    for (const alert of rows) {
      if (seen.has(alert.id)) continue
      seen.add(alert.id)
      const distance = levenshtein(key, canonicalBatch(alert.batchNo))
      if (distance > 1) continue
      const scores = agreementOf(query, alert)
      const hasBoth = Boolean(query.manufacturer?.trim()) && Boolean((query.product || query.brand || '').trim())
      const status = decide(distance, key.length, scores.named, scores.agreement, scores.manufacturerScore, scores.productScore, hasBoth)
      if (!status) continue
      const hit: MatchHit = {
        alert,
        batchDistance: distance,
        batchScore: 1 - distance / Math.max(key.length, canonicalBatch(alert.batchNo).length, 1),
        manufacturerScore: scores.manufacturerScore,
        productScore: scores.productScore,
        agreement: scores.agreement,
        status,
      }
      best = prefer(best, hit)
    }
  }
  return { status: best?.status ?? 'clear', hit: best, checkedCount: index.count, months: index.months }
}

function prefer(current: MatchHit | null, next: MatchHit): MatchHit {
  if (!current) return next
  if (current.status !== next.status) return next.status === 'flagged' ? next : current
  if (next.batchDistance !== current.batchDistance) return next.batchDistance < current.batchDistance ? next : current
  return next.agreement > current.agreement ? next : current
}

export function cycleConfusion(char: string): string {
  const upper = char.toUpperCase()
  const group = CONFUSION_GROUPS.find((entry) => entry.some((item) => item === upper || item === char))
  if (!group) return char
  const index = group.findIndex((item) => item === char || item === upper)
  return group[(index + 1) % group.length] ?? char
}

export function confusionHint(batch: string): string | null {
  const upper = batch.toUpperCase()
  if (/[0O]/.test(upper)) {
    return '“0” or “O” in the batch: we check both spellings so a misread can’t hide a match.'
  }
  if (/[1IL]/.test(upper)) {
    return '“1”, “I” or “l” in the batch: we check those spellings so a misread can’t hide a match.'
  }
  if (/[5S]/.test(upper)) {
    return '“5” or “S” in the batch: we check both spellings so a misread can’t hide a match.'
  }
  if (/[8B]/.test(upper)) {
    return '“8” or “B” in the batch: we check both spellings so a misread can’t hide a match.'
  }
  if (/[2Z]/.test(upper)) {
    return '“2” or “Z” in the batch: we check both spellings so a misread can’t hide a match.'
  }
  return null
}
