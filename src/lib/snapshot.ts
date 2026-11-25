import type { AlertIndex } from './match'
import { hydrateSnapshot } from './publish'
import type { AlertSnapshot } from './types'

export function alertsUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}data/alerts.json`
}

let inflight: Promise<AlertSnapshot> | null = null

export function resetSnapshotCache(): void {
  inflight = null
}

/** Fetch the snapshot as a static file. The service worker may answer from cache. */
export function loadSnapshot(): Promise<AlertSnapshot> {
  if (!inflight) {
    const request = fetch(alertsUrl())
      .then(async (response) => {
        if (!response.ok) throw new Error(`CDSCO list responded ${response.status}`)
        return hydrateSnapshot(await response.json())
      })
      .catch((error: unknown) => {
        if (inflight === request) inflight = null
        throw error instanceof Error ? error : new Error('CDSCO list failed to load')
      })
    inflight = request
  }
  return inflight
}

export function snapshotCounts(snapshot: AlertSnapshot): { nsq: number; spurious: number } {
  let nsq = 0
  let spurious = 0
  for (const row of snapshot.rows) {
    if (row.kind === 'spurious') spurious += 1
    else nsq += 1
  }
  return { nsq, spurious }
}

export type { AlertIndex }
