import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { diffAlerts, mergeAlertRows, normalizeTable, sortedMonths } from '../src/lib/normalize'
import { serializePublicSnapshot } from '../src/lib/publish'
import type { AlertRow, AlertSnapshot, DiffSnapshot, FetchError } from '../src/lib/types'

const BASE = process.env.CDSCO_NSQ_BASE_URL?.replace(/\/$/, '') || 'https://cdscoonline.gov.in/CDSCO'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALERTS_PATH = path.join(ROOT, 'data', 'alerts.json')
const PUBLIC_ALERTS_PATH = path.join(ROOT, 'public', 'data', 'alerts.json')
const DIFF_PATH = path.join(ROOT, 'data', 'diff-latest.json')
const TIMEOUT_MS = 18_000
const DELAY_MS_MIN = 1_500
const DELAY_MS_MAX = 3_000
const RETRY_ATTEMPTS = 5
const RETRY_BASE_MS = 2_000
const MONTH_ABBREV = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const headers = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'StripSafeIngest/0.1 (+https://github.com/Ritesh-Root/stripsafe)',
  Referer: `${BASE}/viewPublicNSQDrug`,
}

class FetchFailed extends Error {
  url: string
  constructor(url: string, message: string) {
    super(message)
    this.url = url
  }
}

function envFlag(name: string): boolean {
  const value = process.env[name]
  return !!value && /^(1|true|yes|on)$/i.test(value.trim())
}

function envInt(name: string): number | null {
  const value = process.env[name]
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function politeDelayMs(): number {
  return DELAY_MS_MIN + Math.random() * (DELAY_MS_MAX - DELAY_MS_MIN)
}

function isRetryable(message: string): boolean {
  return /abort|timeout|Timeout|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|TLS|certificate|network|EPIPE|ECONNRESET|UND_ERR|HTTP 5\d\d|HTTP 429|Unexpected end|JSON/i.test(
    message,
  )
}

function decodeBody(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

let lastRequestAt = 0

async function pauseBeforeRequest(): Promise<void> {
  if (!lastRequestAt) return
  const wait = politeDelayMs()
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < wait) await sleep(wait - elapsed)
}

async function fetchJson(url: string): Promise<unknown> {
  let lastError: FetchFailed | undefined
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    await pauseBeforeRequest()
    lastRequestAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(url, { headers, signal: controller.signal })
      if (!response.ok) {
        throw new FetchFailed(url, `HTTP ${response.status}`)
      }
      const text = decodeBody(await response.arrayBuffer())
      return JSON.parse(text) as unknown
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed'
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
      const full = cause ? `${message}: ${cause}` : message
      lastError = error instanceof FetchFailed ? error : new FetchFailed(url, full)
      const retryable = isRetryable(lastError.message)
      if (!retryable || attempt === RETRY_ATTEMPTS) throw lastError
      const backoff = RETRY_BASE_MS * 2 ** (attempt - 1)
      console.warn(`retry ${attempt}/${RETRY_ATTEMPTS} after ${backoff}ms: ${lastError.message} (${url})`)
      await sleep(backoff)
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError ?? new FetchFailed(url, 'request failed')
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const list = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return list.length ? list : null
}

function aaData(value: unknown): unknown[] | null {
  if (!value || typeof value !== 'object') return null
  const data = (value as { aaData?: unknown }).aaData
  return Array.isArray(data) ? data : null
}

function monthTokens(token: string, year: string): string[] {
  const raw = token.trim()
  if (/\d{4}/.test(raw)) return [raw.toUpperCase(), raw]
  const mon = raw.slice(0, 3)
  const upper = `${mon.toUpperCase()}-${year}`
  const title = `${mon.slice(0, 1).toUpperCase()}${mon.slice(1).toLowerCase()}-${year}`
  return [...new Set([upper, title])]
}

function yearOfMonth(month: string): string | null {
  const match = month.match(/(\d{4})/)
  return match?.[1] ?? null
}

function fallbackYears(previous: AlertSnapshot | null): string[] {
  const years = new Set<string>()
  const latest = new Date().getUTCFullYear()
  for (let year = 2019; year <= latest; year++) years.add(String(year))
  if (previous) {
    for (const month of previous.months) {
      const year = yearOfMonth(month)
      if (year) years.add(year)
    }
  }
  return [...years].sort()
}

async function fetchMonth(
  kind: 'nsq' | 'spurious',
  token: string,
  year: string,
  errors: FetchError[],
): Promise<{ rows: AlertRow[]; month: string; ok: boolean }> {
  const endpoint = kind === 'nsq' ? 'filteredNsqDrugTable' : 'filteredSpuriousDrugTable'
  const tab = kind
  for (const month of monthTokens(token, year)) {
    const url = `${BASE}/${endpoint}?month=${encodeURIComponent(month)}&source=All&tab=${tab}`
    try {
      const payload = await fetchJson(url)
      const rows = aaData(payload)
      if (!rows) {
        errors.push({ url, message: 'response had no aaData array' })
        continue
      }
      console.log(`${kind} ${month}: ${rows.length} rows`)
      return { rows: normalizeTable(rows, kind, month), month, ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed'
      const failedUrl = error instanceof FetchFailed ? error.url : url
      errors.push({ url: failedUrl, message })
    }
  }
  return { rows: [], month: token, ok: false }
}

async function readPrevious(): Promise<AlertSnapshot | null> {
  try {
    const text = await readFile(ALERTS_PATH, 'utf8')
    return JSON.parse(text) as AlertSnapshot
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const errors: FetchError[] = []
  const collected: AlertRow[] = []
  const seen = new Set<string>()
  const successfulKeys = new Set<string>()
  const push = (rows: AlertRow[]) => {
    for (const row of rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      collected.push(row)
    }
  }
  const markSuccess = (kind: 'nsq' | 'spurious', month: string, rows: AlertRow[], year: string, token: string) => {
    for (const candidate of [...monthTokens(token, year), month]) {
      successfulKeys.add(`${kind}|${candidate.toUpperCase()}`)
    }
    for (const row of rows) successfulKeys.add(`${kind}|${row.month.toUpperCase()}`)
  }

  const previous = await readPrevious()
  const fromYear = envInt('INGEST_FROM_YEAR')
  const newestFirst = envFlag('INGEST_NEWEST_FIRST')

  let years: string[] = []
  try {
    const listed = asStringList(await fetchJson(`${BASE}/reportingYears?tab=nsq`))
    years = listed ?? []
    if (!listed) errors.push({ url: `${BASE}/reportingYears?tab=nsq`, message: 'years response was not a string array' })
    else console.log(`years: ${years.join(', ')}`)
  } catch (error) {
    errors.push({
      url: `${BASE}/reportingYears?tab=nsq`,
      message: error instanceof Error ? error.message : 'request failed',
    })
  }

  if (years.length === 0) {
    years = fallbackYears(previous)
    console.warn(`using fallback years: ${years.join(', ')}`)
  }

  if (fromYear !== null) {
    years = years.filter((year) => Number(year) >= fromYear)
    console.log(`INGEST_FROM_YEAR=${fromYear}; years: ${years.join(', ')}`)
  }
  if (newestFirst) years = [...years].reverse()

  for (const year of years) {
    let months: string[]
    try {
      months = asStringList(await fetchJson(`${BASE}/publicReportingMonths?year=${year}&tab=nsq`)) ?? []
      console.log(`${year}: ${months.join(', ') || '(no months)'}`)
    } catch (error) {
      errors.push({
        url: `${BASE}/publicReportingMonths?year=${year}&tab=nsq`,
        message: error instanceof Error ? error.message : 'request failed',
      })
      months = MONTH_ABBREV
      console.warn(`${year}: month list failed, trying ${months.join(', ')}`)
    }
    if (newestFirst) months = [...months].reverse()
    for (const month of months) {
      const nsq = await fetchMonth('nsq', month, year, errors)
      if (nsq.ok) {
        markSuccess('nsq', nsq.month, nsq.rows, year, month)
        push(nsq.rows)
      }
      const spurious = await fetchMonth('spurious', month, year, errors)
      if (spurious.ok) {
        markSuccess('spurious', spurious.month, spurious.rows, year, month)
        push(spurious.rows)
      }
    }
  }

  try {
    const latest = aaData(await fetchJson(`${BASE}/publicNsqDrugTable`))
    if (latest) {
      const rows = normalizeTable(latest, 'nsq', 'LATEST')
      successfulKeys.add('nsq|LATEST')
      push(rows)
      console.log(`latest nsq table: ${rows.length} rows`)
    } else errors.push({ url: `${BASE}/publicNsqDrugTable`, message: 'response had no aaData array' })
  } catch (error) {
    errors.push({
      url: `${BASE}/publicNsqDrugTable`,
      message: error instanceof Error ? error.message : 'request failed',
    })
  }

  try {
    const spurious = aaData(await fetchJson(`${BASE}/viewPublicSpuriousDrugData`))
    if (spurious) {
      const rows = normalizeTable(spurious, 'spurious', 'LATEST')
      successfulKeys.add('spurious|LATEST')
      push(rows)
      console.log(`latest spurious table: ${rows.length} rows`)
    } else errors.push({ url: `${BASE}/viewPublicSpuriousDrugData`, message: 'response had no aaData array' })
  } catch (error) {
    errors.push({
      url: `${BASE}/viewPublicSpuriousDrugData`,
      message: error instanceof Error ? error.message : 'request failed',
    })
  }

  await mkdir(path.dirname(ALERTS_PATH), { recursive: true })

  const merged = mergeAlertRows(previous?.rows ?? [], collected, successfulKeys)

  if (merged.length === 0 && previous && previous.rows.length > 0) {
    console.error('CDSCO returned no rows. Keeping the previous snapshot so a network block cannot wipe real data.')
    for (const error of errors) console.error(`- ${error.url}: ${error.message}`)
    return
  }

  const generatedAt = new Date().toISOString()
  const snapshot: AlertSnapshot = {
    generatedAt,
    sourceBase: BASE,
    rowCount: merged.length,
    months: sortedMonths(merged),
    errors,
    rows: merged,
  }
  const diffRows = diffAlerts(previous?.rows ?? [], merged)
  const diff: DiffSnapshot = {
    generatedAt,
    previousGeneratedAt: previous?.generatedAt ?? null,
    newRowCount: diffRows.length,
    rows: diffRows,
  }
  await writeFile(ALERTS_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
  await mkdir(path.dirname(PUBLIC_ALERTS_PATH), { recursive: true })
  await writeFile(PUBLIC_ALERTS_PATH, serializePublicSnapshot(snapshot))
  await writeFile(DIFF_PATH, `${JSON.stringify(diff, null, 2)}\n`)
  console.log(
    `wrote ${merged.length} rows (${collected.length} fetched this run), ${diffRows.length} new since the previous snapshot, ${successfulKeys.size} month keys refreshed`,
  )
  if (errors.length) {
    console.error(`${errors.length} fetch errors`)
    for (const error of errors.slice(0, 8)) console.error(`- ${error.url}: ${error.message}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
