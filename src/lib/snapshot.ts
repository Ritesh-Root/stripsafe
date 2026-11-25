import snapshotJson from '../../data/alerts.json'
import { buildIndex, type AlertIndex } from './match'
import type { AlertSnapshot } from './types'
import { latestMonth, sortedMonths } from './normalize'

export const snapshot = snapshotJson as AlertSnapshot

export const alertIndex: AlertIndex = buildIndex(snapshot.rows)

export function monthSpan(): string {
  const months = sortedMonths(snapshot.rows)
  if (months.length === 0) return ''
  if (months.length === 1) return months[0] ?? ''
  return `${months[0]} – ${months[months.length - 1]}`
}

export function latestListMonth(): string {
  return latestMonth(snapshot.rows)
}

export const nsqCount = snapshot.rows.filter((row) => row.kind === 'nsq').length
export const spuriousCount = snapshot.rows.filter((row) => row.kind === 'spurious').length
