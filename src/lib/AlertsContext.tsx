import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { buildIndex, type AlertIndex } from './match'
import { loadSnapshot, resetSnapshotCache } from './snapshot'
import type { AlertSnapshot } from './types'

export type AlertsState = {
  status: 'loading' | 'ready' | 'error'
  snapshot: AlertSnapshot | null
  index: AlertIndex | null
  message: string
  reload: () => void
}

const AlertsContext = createContext<AlertsState | null>(null)

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AlertsState['status']>('loading')
  const [snapshot, setSnapshot] = useState<AlertSnapshot | null>(null)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => {
    resetSnapshotCache()
    setStatus('loading')
    setMessage('')
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancel = false
    setStatus('loading')
    loadSnapshot()
      .then((next) => {
        if (cancel) return
        setSnapshot(next)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancel) return
        setSnapshot(null)
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'CDSCO list failed to load')
      })
    return () => {
      cancel = true
    }
  }, [attempt])

  const index = useMemo(() => (snapshot ? buildIndex(snapshot.rows) : null), [snapshot])

  const value = useMemo<AlertsState>(() => ({
    status,
    snapshot,
    index,
    message,
    reload,
  }), [status, snapshot, index, message, reload])

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

export function useAlerts(): AlertsState {
  const value = useContext(AlertsContext)
  if (!value) throw new Error('useAlerts must be used inside AlertsProvider')
  return value
}
