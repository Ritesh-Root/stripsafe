import { Banner } from '@astryxdesign/core/Banner'
import { Pill } from 'lucide-react'
import { useState } from 'react'

import { StatusBadge } from './HomeScreen'
import { ThemeButton } from '../components/Shell'
import type { CabinetItem } from '../lib/types'
import { labelMonth, nextMonthLabel } from '../lib/normalize'
import { latestListMonth } from '../lib/snapshot'
import { newlyFlaggedTitle } from '../lib/wording'

type Filter = 'all' | 'flagged' | 'watching'

type Props = {
  items: CabinetItem[]
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpen: (item: CabinetItem) => void
}

export function CabinetScreen({ items, theme, onToggleTheme, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const flagged = items.filter((item) => item.currentStatus === 'flagged')
  const watching = items.filter((item) => item.currentStatus !== 'flagged')
  const visible = filter === 'flagged' ? flagged : filter === 'watching' ? watching : items
  const fresh = items.filter((item) => item.newlyFlagged)
  const latest = latestListMonth()
  const next = latest ? nextMonthLabel(latest) : null

  return (
    <>
      <header className="header">
        <div className="title-row">
          <h1>My cabinet</h1>
          <ThemeButton theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <p className="supporting">{items.length} {items.length === 1 ? 'strip' : 'strips'} · re-checked against the loaded lists</p>
      </header>
      <div className="segments" role="tablist" aria-label="Filter cabinet">
        {([
          ['all', `All (${items.length})`],
          ['flagged', `Flagged (${flagged.length})`],
          ['watching', `Watching (${watching.length})`],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      {fresh.length > 0 ? (
        <Banner
          status="error"
          title={newlyFlaggedTitle()}
          description={fresh.map((item) => `${item.brand || item.product} (${item.batch})`).join(', ')}
          collapsible={false}
        />
      ) : flagged.length > 0 ? (
        <Banner
          status="error"
          title={`${flagged.length} ${flagged.length === 1 ? 'medicine' : 'medicines'} in a CDSCO alert`}
          description="Open a row for the lab result and what to do."
          collapsible={false}
        />
      ) : null}
      {visible.length === 0 ? (
        <p className="supporting empty">Nothing in this filter. Scan a strip and add it here.</p>
      ) : visible.map((item) => (
        <button key={item.id} type="button" className="row" onClick={() => onOpen(item)}>
          <span className="thumb"><Pill aria-hidden="true" size={24} /></span>
          <span className="row-copy">
            <strong>{item.brand || item.product || 'Medicine'}</strong>
            <span>{item.batch}{item.exp ? ` · Exp ${item.exp}` : ''}</span>
          </span>
          <StatusBadge item={item} />
        </button>
      ))}
      <p className="supporting">
        {next ? `Next check: as soon as CDSCO publishes the ${next} list.` : 'Next check: when a newer CDSCO list is in the snapshot.'}
        {latest ? ` Latest loaded list: ${labelMonth(latest)}.` : ''}
      </p>
    </>
  )
}
