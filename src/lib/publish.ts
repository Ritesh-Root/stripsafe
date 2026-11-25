import type { AlertKind, AlertRow, AlertSnapshot, FetchError } from './types'
import { sortedMonths } from './normalize'

const OPTIONAL_KEYS = [
  'productName',
  'brandName',
  'mfgDate',
  'expDate',
  'manufacturedBy',
  'result',
  'source',
  'reportedBy',
  'dosageForm',
  'remarks',
] as const

export type PublicAlertRow = {
  id: string
  kind: AlertKind
  batchNo: string
  month: string
} & Partial<Pick<AlertRow, (typeof OPTIONAL_KEYS)[number]>>

/** Drop empty strings so the file the browser fetches stays smaller. Non-empty CDSCO text is unchanged. */
export function toPublicRow(row: AlertRow): PublicAlertRow {
  const out: PublicAlertRow = {
    id: row.id,
    kind: row.kind,
    batchNo: row.batchNo,
    month: row.month,
  }
  for (const key of OPTIONAL_KEYS) {
    const value = row[key]
    if (value) out[key] = value
  }
  return out
}

export function toPublicSnapshot(snapshot: AlertSnapshot): AlertSnapshot {
  return {
    generatedAt: snapshot.generatedAt,
    sourceBase: snapshot.sourceBase,
    rowCount: snapshot.rows.length,
    months: snapshot.months.length ? snapshot.months : sortedMonths(snapshot.rows),
    errors: snapshot.errors,
    rows: snapshot.rows.map((row) => hydrateRow(toPublicRow(row))),
  }
}

export function serializePublicSnapshot(snapshot: AlertSnapshot): string {
  const rows = snapshot.rows.map(toPublicRow)
  return JSON.stringify({
    generatedAt: snapshot.generatedAt,
    sourceBase: snapshot.sourceBase,
    rowCount: rows.length,
    months: snapshot.months.length ? snapshot.months : sortedMonths(snapshot.rows),
    errors: snapshot.errors,
    rows,
  })
}

function asKind(value: unknown): AlertKind {
  return value === 'spurious' ? 'spurious' : 'nsq'
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function hydrateRow(raw: Partial<AlertRow> & Pick<AlertRow, 'id' | 'batchNo' | 'month'>): AlertRow {
  return {
    id: raw.id,
    kind: asKind(raw.kind),
    productName: asText(raw.productName),
    brandName: asText(raw.brandName),
    batchNo: raw.batchNo,
    mfgDate: asText(raw.mfgDate),
    expDate: asText(raw.expDate),
    manufacturedBy: asText(raw.manufacturedBy),
    result: asText(raw.result),
    source: asText(raw.source),
    reportedBy: asText(raw.reportedBy),
    month: raw.month,
    dosageForm: asText(raw.dosageForm),
    remarks: asText(raw.remarks),
  }
}

export function hydrateSnapshot(value: unknown): AlertSnapshot {
  if (!value || typeof value !== 'object') throw new Error('CDSCO snapshot was not an object')
  const raw = value as {
    generatedAt?: unknown
    sourceBase?: unknown
    months?: unknown
    errors?: unknown
    rows?: unknown
  }
  if (!Array.isArray(raw.rows)) throw new Error('CDSCO snapshot has no rows')
  const rows: AlertRow[] = []
  for (const item of raw.rows) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<AlertRow>
    const id = asText(record.id)
    const batchNo = asText(record.batchNo)
    const month = asText(record.month)
    if (!id || (!batchNo && !asText(record.productName))) continue
    rows.push(hydrateRow({ ...record, id, batchNo, month }))
  }
  const months = Array.isArray(raw.months)
    ? raw.months.filter((month): month is string => typeof month === 'string' && month.length > 0)
    : sortedMonths(rows)
  const errors: FetchError[] = []
  if (Array.isArray(raw.errors)) {
    for (const error of raw.errors) {
      if (!error || typeof error !== 'object') continue
      const url = asText((error as FetchError).url)
      const message = asText((error as FetchError).message)
      if (url || message) errors.push({ url, message })
    }
  }
  return {
    generatedAt: asText(raw.generatedAt),
    sourceBase: asText(raw.sourceBase),
    rowCount: rows.length,
    months,
    errors,
    rows,
  }
}
