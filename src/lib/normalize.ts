import type { AlertKind, AlertRow } from './types'
import { canonicalBatch } from './match'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

export function monthSortKey(month: string): number {
  const match = month.toUpperCase().match(/^([A-Z]{3})[-\s]?(\d{4})$/)
  if (!match) return 0
  const index = MONTHS.indexOf(match[1] ?? '')
  return Number(match[2]) * 12 + (index < 0 ? 0 : index)
}

export function labelMonth(month: string): string {
  const match = month.trim().match(/^([A-Za-z]{3,9})[-\s]?(\d{4})$/)
  if (!match?.[1] || !match[2]) return month.trim()
  const name = match[1].slice(0, 1).toUpperCase() + match[1].slice(1, 3).toLowerCase()
  return `${name} ${match[2]}`
}

export function nextMonthLabel(month: string): string | null {
  const match = month.trim().toUpperCase().match(/^([A-Z]{3})[-\s]?(\d{4})$/)
  if (!match?.[1] || !match[2]) return null
  const index = MONTHS.indexOf(match[1])
  if (index < 0) return null
  const next = (index + 1) % 12
  const year = Number(match[2]) + (next === 0 ? 1 : 0)
  return labelMonth(`${MONTHS[next]}-${year}`)
}

type RawRow = Record<string, unknown>

function pick(row: RawRow, keys: string[]): string {
  for (const key of keys) {
    const value = cleanText(row[key])
    if (value) return value
  }
  return ''
}

export function alertId(kind: AlertKind, month: string, batchNo: string, productName: string, manufacturedBy: string): string {
  return [
    kind,
    month.toUpperCase(),
    batchNo.toUpperCase().replace(/\s+/g, ''),
    productName.toLowerCase().slice(0, 48),
    manufacturedBy.toLowerCase().slice(0, 40),
  ].join('|')
}

export function normalizeRow(row: RawRow, kind: AlertKind, fallbackMonth: string): AlertRow | null {
  const batchNo = pick(row, ['str_batch_no', 'batch_no', 'batchNo'])
  const productName = pick(row, ['str_product_name', 'product_name_from_dtl', 'product_name'])
  if (!batchNo && !productName) return null
  const month = (pick(row, ['dt_reporting_month_year', 'reporting_month']) || fallbackMonth).toUpperCase()
  const manufacturedBy = pick(row, ['str_manufactured_by', 'manufactured_by', 'str_manufacturer_name'])
  const brandName = pick(row, ['str_brand_name', 'brand_name'])
  return {
    id: alertId(kind, month, batchNo, productName, manufacturedBy),
    kind,
    productName,
    brandName,
    batchNo,
    mfgDate: pick(row, ['dt_manufacturing_date', 'manufacturing_date']),
    expDate: pick(row, ['dt_expiry_date', 'expiry_date']),
    manufacturedBy,
    result: pick(row, ['str_nsq_result', 'nsq_result', 'str_nsq_remarks']),
    source: pick(row, ['str_reporting_source', 'reporting_source']),
    reportedBy: pick(row, ['str_reported_by_lab_or_state', 'reported_by']),
    month,
    dosageForm: pick(row, ['str_dosage_form', 'dosage_form']),
    remarks: pick(row, ['str_nsq_remarks', 'remarks']),
  }
}

export function normalizeTable(rows: unknown, kind: AlertKind, fallbackMonth: string): AlertRow[] {
  if (!Array.isArray(rows)) return []
  const out: AlertRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const alert = normalizeRow(row as RawRow, kind, fallbackMonth)
    if (!alert || seen.has(alert.id)) continue
    seen.add(alert.id)
    out.push(alert)
  }
  return out
}

export function diffAlerts(previous: AlertRow[], next: AlertRow[]): AlertRow[] {
  const known = new Set(previous.map((row) => row.id))
  return next.filter((row) => !known.has(row.id))
}

export function sortedMonths(rows: AlertRow[]): string[] {
  return [...new Set(rows.map((row) => row.month).filter(Boolean))].sort((a, b) => monthSortKey(a) - monthSortKey(b))
}

export function latestMonth(rows: AlertRow[]): string {
  const months = sortedMonths(rows)
  return months[months.length - 1] ?? ''
}

/** Used by the index so a confusion-only difference still finds the published batch. */
export function indexKey(batchNo: string): string {
  return canonicalBatch(batchNo)
}
