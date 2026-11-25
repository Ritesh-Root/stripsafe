import { Banner } from '@astryxdesign/core/Banner'
import { Pill } from 'lucide-react'

import { StatusBadge } from './HomeScreen'
import { ThemeButton } from '../components/Shell'
import { useAlerts } from '../lib/AlertsContext'
import type { CabinetItem } from '../lib/types'
import { labelMonth, latestMonth } from '../lib/normalize'
import { newlyFlaggedTitle } from '../lib/wording'

type Props = {
  items: CabinetItem[]
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpen: (item: CabinetItem) => void
}

export function AlertsScreen({ items, theme, onToggleTheme, onOpen }: Props) {
  const alerts = useAlerts()
  const snapshot = alerts.snapshot
  const fresh = items.filter((item) => item.newlyFlagged)
  const flagged = items.filter((item) => item.currentStatus === 'flagged' && !item.newlyFlagged)
  const latest = snapshot ? latestMonth(snapshot.rows) : ''
  return (
    <>
      <header className="header">
        <div className="title-row">
          <h1>Alerts</h1>
          <ThemeButton theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <p className="supporting">
          {!snapshot
            ? 'The CDSCO list is still loading.'
            : snapshot.rowCount === 0
              ? 'No CDSCO rows are loaded, so nothing on this phone can be matched to a list yet.'
              : `${snapshot.rowCount} rows loaded${latest ? `, latest ${labelMonth(latest)}` : ''}.`}
        </p>
      </header>
      {fresh.length > 0 ? (
        <Banner status="error" title={newlyFlaggedTitle()} description="These were clear when you scanned them. A later list names the batch." collapsible={false} />
      ) : (
        <Banner status="info" title="No new flags since you scanned" description="Medicines already in a list when you scanned them stay under In a CDSCO alert." collapsible={false} />
      )}
      {fresh.map((item) => (
        <AlertRow key={item.id} item={item} onOpen={onOpen} />
      ))}
      {flagged.length > 0 ? <h2 className="section">In a CDSCO alert</h2> : null}
      {flagged.map((item) => (
        <AlertRow key={item.id} item={item} onOpen={onOpen} />
      ))}
      {fresh.length === 0 && flagged.length === 0 ? (
        <p className="supporting empty">Your cabinet has no flagged batches.</p>
      ) : null}
    </>
  )
}

function AlertRow({ item, onOpen }: { item: CabinetItem; onOpen: (item: CabinetItem) => void }) {
  return (
    <button type="button" className="row" onClick={() => onOpen(item)}>
      <span className="thumb"><Pill aria-hidden="true" size={24} /></span>
      <span className="row-copy">
        <strong>{item.brand || item.product || 'Medicine'}</strong>
        <span>Batch {item.batch}</span>
      </span>
      <StatusBadge item={item} />
    </button>
  )
}
