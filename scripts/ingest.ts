import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { diffAlerts, normalizeTable, sortedMonths } from '../src/lib/normalize'
import type { AlertRow, AlertSnapshot, DiffSnapshot, FetchError } from '../src/lib/types'

const BASE = process.env.CDSCO_NSQ_BASE_URL?.replace(/\/$/, '') || 'https://cdscoonline.gov.in/CDSCO'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALERTS_PATH = path.join(ROOT, 'data', 'alerts.json')
const DIFF_PATH = path.join(ROOT, 'data', 'diff-latest.json')
const TIMEOUT_MS = 18_000

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

let portalDown = false

function decodeBody(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

async function fetchJson(url: string): Promise<unknown> {
  if (portalDown) throw new FetchFailed(url, 'skipped after CDSCO stopped responding')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) throw new FetchFailed(url, `HTTP ${response.status}`)
    const text = decodeBody(await response.arrayBuffer())
    return JSON.parse(text) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed'
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    const full = cause ? `${message}: ${cause}` : message
    const timedOut = /abort|timeout|Timeout|fetch failed|ECONN|certificate/i.test(full)
    if (timedOut) portalDown = true
    if (error instanceof FetchFailed) throw error
    throw new FetchFailed(url, full)
  } finally {
    clearTimeout(timer)
  }
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

async function fetchMonth(kind: 'nsq' | 'spurious', token: string, year: string, errors: FetchError[]): Promise<AlertRow[]> {
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
      return normalizeTable(rows, kind, month)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed'
      const url = error instanceof FetchFailed ? error.url : `${BASE}/${endpoint}`
      errors.push({ url, message })
      if (portalDown) return []
    }
  }
  return []
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
  const push = (rows: AlertRow[]) => {
    for (const row of rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      collected.push(row)
    }
  }

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

  if (!portalDown) {
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
        if (portalDown) break
        continue
      }
      for (const month of months) {
        if (portalDown) break
        push(await fetchMonth('nsq', month, year, errors))
        push(await fetchMonth('spurious', month, year, errors))
      }
    }
  }

  if (!portalDown) {
    try {
      const latest = aaData(await fetchJson(`${BASE}/publicNsqDrugTable`))
      if (latest) push(normalizeTable(latest, 'nsq', 'LATEST'))
      else errors.push({ url: `${BASE}/publicNsqDrugTable`, message: 'response had no aaData array' })
    } catch (error) {
      errors.push({
        url: `${BASE}/publicNsqDrugTable`,
        message: error instanceof Error ? error.message : 'request failed',
      })
    }
  }

  if (!portalDown) {
    try {
      const spurious = aaData(await fetchJson(`${BASE}/viewPublicSpuriousDrugData`))
      if (spurious) push(normalizeTable(spurious, 'spurious', 'LATEST'))
      else errors.push({ url: `${BASE}/viewPublicSpuriousDrugData`, message: 'response had no aaData array' })
    } catch (error) {
      errors.push({
        url: `${BASE}/viewPublicSpuriousDrugData`,
        message: error instanceof Error ? error.message : 'request failed',
      })
    }
  }

  const previous = await readPrevious()
  await mkdir(path.dirname(ALERTS_PATH), { recursive: true })

  if (collected.length === 0 && previous && previous.rows.length > 0) {
    console.error('CDSCO returned no rows. Keeping the previous snapshot so a network block cannot wipe real data.')
    for (const error of errors) console.error(`- ${error.url}: ${error.message}`)
    return
  }

  const generatedAt = new Date().toISOString()
  const snapshot: AlertSnapshot = {
    generatedAt,
    sourceBase: BASE,
    rowCount: collected.length,
    months: sortedMonths(collected),
    errors,
    rows: collected,
  }
  const diffRows = diffAlerts(previous?.rows ?? [], collected)
  const diff: DiffSnapshot = {
    generatedAt,
    previousGeneratedAt: previous?.generatedAt ?? null,
    newRowCount: diffRows.length,
    rows: diffRows,
  }
  await writeFile(ALERTS_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
  await writeFile(DIFF_PATH, `${JSON.stringify(diff, null, 2)}\n`)
  console.log(`wrote ${collected.length} rows, ${diffRows.length} new since the previous snapshot`)
  if (errors.length) {
    console.error(`${errors.length} fetch errors`)
    for (const error of errors.slice(0, 8)) console.error(`- ${error.url}: ${error.message}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
