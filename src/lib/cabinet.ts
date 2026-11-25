import { matchBatch, type AlertIndex } from './match'
import type { CabinetItem, Draft, MatchStatus } from './types'

const DB_NAME = 'stripsafe'
const STORE = 'cabinet'
const LOCAL_KEY = 'stripsafe.cabinet'

export function assessCabinetItem(item: CabinetItem, index: AlertIndex, checkedAt = new Date().toISOString()): CabinetItem {
  const outcome = matchBatch({
    batch: item.batch,
    product: item.product,
    brand: item.brand,
    manufacturer: item.manufacturer,
  }, index)
  const alertId = outcome.hit?.alert.id ?? null
  const alreadyKnown = alertId ? item.matchedAlertIds.includes(alertId) : false
  const newlyFlagged = outcome.status === 'flagged' && item.statusAtScan !== 'flagged' && !alreadyKnown
  return {
    ...item,
    currentStatus: outcome.status,
    currentAlertId: alertId,
    newlyFlagged,
    lastCheckedAt: checkedAt,
  }
}

export function cabinetItemFromDraft(draft: Draft, status: MatchStatus, alertIds: string[], scannedAt = new Date().toISOString()): CabinetItem {
  return {
    id: crypto.randomUUID(),
    product: draft.product,
    brand: draft.brand,
    batch: draft.batch,
    manufacturer: draft.manufacturer,
    mfg: draft.mfg,
    exp: draft.exp,
    scannedAt,
    statusAtScan: status,
    matchedAlertIds: alertIds,
    currentStatus: status,
    currentAlertId: alertIds[0] ?? null,
    newlyFlagged: false,
    lastCheckedAt: scannedAt,
  }
}

function readLocal(): CabinetItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as CabinetItem[] : []
  } catch {
    return []
  }
}

function writeLocal(items: CabinetItem[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getAll(db: IDBDatabase): Promise<CabinetItem[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result as CabinetItem[])
    request.onerror = () => reject(request.error)
  })
}

function putAll(db: IDBDatabase, items: CabinetItem[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.clear()
    for (const item of items) store.put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadCabinet(): Promise<CabinetItem[]> {
  try {
    const db = await openDb()
    const rows = await getAll(db)
    db.close()
    if (rows.length > 0) return rows
    return readLocal()
  } catch {
    return readLocal()
  }
}

export async function saveCabinet(items: CabinetItem[]): Promise<void> {
  writeLocal(items)
  try {
    const db = await openDb()
    await putAll(db, items)
    db.close()
  } catch {
    /* localStorage already has the cabinet */
  }
}
