import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Bell, Shield, TriangleAlert } from 'lucide-react'

import type { MatchOutcome } from '../lib/match'
import { labelMonth } from '../lib/normalize'
import { nsqCount, snapshot, spuriousCount } from '../lib/snapshot'
import type { Draft } from '../lib/types'
import { clearHeadline, flaggedHeadline, newlyFlaggedTitle } from '../lib/wording'

type Props = {
  draft: Draft
  outcome: MatchOutcome
  newly: boolean
  saved: boolean
  onSave: () => void
  onScanAnother: () => void
  onShare: () => void
}

export function ResultScreen({ draft, outcome, newly, saved, onSave, onScanAnother, onShare }: Props) {
  const hit = outcome.hit
  const flagged = outcome.status === 'flagged' && hit
  const month = hit ? labelMonth(hit.alert.month) : ''
  const headline = flagged
    ? flaggedHeadline(month)
    : outcome.status === 'review'
      ? 'Confirm this batch before you rely on the check'
      : clearHeadline()
  const rows: [string, string][] = flagged
    ? [
        ['Product', hit.alert.productName || draft.product || '—'],
        ['Brand', hit.alert.brandName || draft.brand || '—'],
        ['Batch', `${hit.alert.batchNo} (${hit.batchDistance === 0 ? 'exact match' : 'close match'})`],
        ['Mfg / Exp', [hit.alert.mfgDate || draft.mfg, hit.alert.expDate || draft.exp].filter(Boolean).join(' – ') || '—'],
        ['Manufacturer', hit.alert.manufacturedBy || draft.manufacturer || '—'],
        ['Failed test', hit.alert.result || '—'],
        ['Tested by', hit.alert.reportedBy || '—'],
        ['Alert month', hit.alert.month || '—'],
      ]
    : [
        ['Medicine', draft.product || draft.brand || '—'],
        ['Batch', draft.batch || '—'],
        ['Manufacturer', draft.manufacturer || '—'],
        ['Expiry', draft.exp || '—'],
        ['Rows checked', snapshot.rowCount === 0 ? 'None loaded' : `${nsqCount} NSQ, ${spuriousCount} spurious`],
      ]

  const clearDetail = snapshot.rowCount === 0
    ? 'No CDSCO rows are loaded in this snapshot, so this is not a full check of every published list.'
    : `Checked ${draft.batch} against ${nsqCount} NSQ rows and ${spuriousCount} spurious rows in this snapshot.`

  return (
    <div aria-live="polite">
      {newly ? (
        <div style={{ marginBottom: 12 }}>
          <Banner status="error" title={newlyFlaggedTitle()} description="A list published after you scanned names this batch." collapsible={false} />
        </div>
      ) : null}
      <div className={`hero ${flagged ? 'error' : outcome.status === 'review' ? 'warning' : 'success'}`}>
        {flagged ? <TriangleAlert aria-hidden="true" /> : outcome.status === 'review' ? <TriangleAlert aria-hidden="true" /> : <Shield aria-hidden="true" />}
        <h2>{headline}</h2>
        <p>
          {flagged
            ? `${hit.alert.kind === 'spurious' ? 'Listed as spurious' : 'Declared Not of Standard Quality'} in the ${month} list. The failure is specific to this batch.`
            : outcome.status === 'review'
              ? `A close batch is in the loaded lists. ${clearDetail} Confirm the characters before you rely on this.`
              : clearDetail}
        </p>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <dl>
          {rows.map(([key, value]) => (
            <div className="meta" key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {flagged ? (
        <div className="card pad" style={{ marginTop: 12 }}>
          <h2 className="section">What to do now</h2>
          <div className="steps" style={{ marginTop: 8 }}>
            <p>1. Don’t open a new strip from this batch. Ask your doctor before stopping a prescribed medicine.</p>
            <p>2. Return it to your chemist with the bill and ask for a different batch.</p>
            <p>3. Report it to your State Drug Controller.</p>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <Banner
            status="info"
            title="We keep watching"
            description="If this batch shows up in a future CDSCO list, it is marked here the next time you open the app. Not a medical judgement: it only means no loaded alert names it yet."
            icon={<Bell aria-hidden="true" />}
            collapsible={false}
          />
        </div>
      )}
      <div className="actions" style={{ marginTop: 16 }}>
        {flagged ? <Button label="Share alert with family" variant="primary" width="100%" onClick={onShare} /> : null}
        <Button label={saved ? 'Saved in my cabinet' : 'Add to my cabinet'} variant={flagged ? 'secondary' : 'primary'} width="100%" isDisabled={saved} onClick={onSave} />
        <Button label="Scan another strip" variant="secondary" width="100%" onClick={onScanAnother} />
      </div>
      <p className="supporting" style={{ marginTop: 12 }}>
        StripSafe reports whether a batch appears in a published CDSCO list. It isn’t medical advice.
      </p>
    </div>
  )
}
