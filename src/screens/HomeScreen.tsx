import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Pill } from 'lucide-react'

import { ThemeButton } from '../components/Shell'
import type { CabinetItem } from '../lib/types'
import { labelMonth, latestMonth } from '../lib/normalize'
import { nsqCount, snapshot, spuriousCount } from '../lib/snapshot'

type Props = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  items: CabinetItem[]
  onScan: () => void
  onType: () => void
  onOpen: (item: CabinetItem) => void
}

function scannedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function HomeScreen({ theme, onToggleTheme, items, onScan, onType, onOpen }: Props) {
  const latest = latestMonth(snapshot.rows)
  const recent = items.slice(0, 3)
  return (
    <>
      <header className="header">
        <div className="title-row">
          <h1>StripSafe</h1>
          <ThemeButton theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <p className="lede">Is your medicine batch in a CDSCO quality alert?</p>
      </header>
      <div className="viewfinder" aria-hidden="true">
        <div className="target">
          <p className="mono">B.No. PCM24117&nbsp;&nbsp; EXP 08/2027</p>
        </div>
        <p className="guide">Line up the batch number inside the box</p>
      </div>
      <div className="actions">
        <Button label="Scan a strip" variant="primary" width="100%" onClick={onScan} />
        <Button label="Type the batch number" variant="secondary" width="100%" onClick={onType} />
      </div>
      {snapshot.rowCount === 0 ? (
        <Banner
          status="warning"
          title="CDSCO portal didn't respond"
          description="This snapshot has no rows. The public CDSCO site stalled before any list could be saved, and nothing was invented. A check can only say that no loaded alert names the batch."
          collapsible={false}
        />
      ) : (
        <Banner
          status="info"
          title={`Latest CDSCO list: ${labelMonth(latest)}`}
          description={`${nsqCount} not-of-standard-quality and ${spuriousCount} spurious rows are in this snapshot. Your cabinet is re-checked when the app opens.`}
          collapsible={false}
        />
      )}
      <h2 className="section">Recent scans</h2>
      {recent.length === 0 ? (
        <p className="supporting empty">No scans yet. A strip you check is saved on this phone.</p>
      ) : recent.map((item) => (
        <button key={item.id} type="button" className="row" onClick={() => onOpen(item)}>
          <span className="thumb"><Pill aria-hidden="true" size={24} /></span>
          <span className="row-copy">
            <strong>{item.brand || item.product || 'Medicine'}</strong>
            <span>Batch {item.batch} · scanned {scannedLabel(item.scannedAt)}</span>
          </span>
          <StatusBadge item={item} />
        </button>
      ))}
    </>
  )
}

export function StatusBadge({ item }: { item: CabinetItem }) {
  if (item.newlyFlagged || item.currentStatus === 'flagged') {
    return <Badge variant="error" label={item.newlyFlagged ? 'Newly flagged' : 'In CDSCO alert'} />
  }
  if (item.currentStatus === 'review') return <Badge variant="warning" label="Check batch" />
  return <Badge variant="info" label="Watching" />
}
