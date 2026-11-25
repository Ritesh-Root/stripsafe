import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Pill, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ThemeButton } from '../components/Shell'
import { parseInvoice, type InvoiceLine } from '../lib/csv'
import { matchBatch, type MatchOutcome } from '../lib/match'
import { labelMonth } from '../lib/normalize'
import { downloadPdf } from '../lib/pdf'
import { alertIndex } from '../lib/snapshot'

type Checked = InvoiceLine & { outcome: MatchOutcome }

const PHARMACY_KEY = 'stripsafe.pharmacy'

export function ChemistScreen({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const [pharmacy, setPharmacy] = useState(() => localStorage.getItem(PHARMACY_KEY) ?? '')
  const [fileName, setFileName] = useState('')
  const [lines, setLines] = useState<Checked[]>([])

  const quarantine = useMemo(() => lines.filter((line) => line.outcome.status === 'flagged'), [lines])
  const review = useMemo(() => lines.filter((line) => line.outcome.status === 'review'), [lines])

  function onFile(file: File) {
    setFileName(file.name)
    file.text().then((text) => {
      const parsed = parseInvoice(text)
      setLines(parsed.map((line) => ({
        ...line,
        outcome: matchBatch({
          batch: line.batch,
          product: line.product,
          brand: line.brand,
          manufacturer: line.manufacturer,
        }, alertIndex),
      })))
    }).catch(() => setLines([]))
  }

  function exportPdf() {
    const header = [
      'StripSafe quarantine list',
      pharmacy || 'Pharmacy',
      `${lines.length} invoice lines checked against ${alertIndex.count} loaded CDSCO rows`,
      quarantine.length === 0 ? 'No CDSCO alert names these batches yet.' : `${quarantine.length} batches to quarantine`,
      '',
    ]
    const body = quarantine.map((line) => {
      const month = line.outcome.hit ? labelMonth(line.outcome.hit.alert.month) : ''
      return `${line.product || line.brand} | ${line.batch} | qty ${line.qty || '—'} | ${month} | ${line.customer || ''}`.trim()
    })
    const unsure = review.map((line) => `Check by hand: ${line.product || 'line'} | ${line.batch}`)
    downloadPdf('stripsafe-quarantine.pdf', [...header, ...body, ...(unsure.length ? ['', ...unsure] : [])])
  }

  return (
    <>
      <header className="header">
        <div className="title-row">
          <h1>Chemist mode</h1>
          <ThemeButton theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <p className="supporting">Match a purchase invoice against the loaded CDSCO lists.</p>
      </header>
      <TextInput
        label="Pharmacy name"
        width="100%"
        value={pharmacy}
        placeholder="Shown on the quarantine list"
        onChange={(value) => {
          setPharmacy(value)
          localStorage.setItem(PHARMACY_KEY, value)
        }}
      />
      <label className="drop">
        <Upload aria-hidden="true" />
        <strong>Upload purchase invoice</strong>
        <span className="supporting">CSV export from your billing software</span>
        {fileName ? <span className="file-token">{fileName} · {lines.length} lines</span> : null}
        <input
          className="sr"
          type="file"
          accept=".csv,text/csv,text/plain"
          aria-label="Upload a CSV purchase invoice"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onFile(file)
          }}
        />
      </label>
      <p className="supporting">
        <a className="quiet" href={`${import.meta.env.BASE_URL}samples/invoice-sample.csv`} download>
          Download a labelled sample invoice
        </a>
        {' '}(not a real purchase).
      </p>
      {lines.length > 0 ? (
        <div className="stats">
          <div className="stat"><b>{lines.length}</b><span>lines checked</span></div>
          <div className="stat error"><b>{quarantine.length}</b><span>to quarantine</span></div>
          <div className="stat warn"><b>{review.length}</b><span>check by hand</span></div>
        </div>
      ) : null}
      {quarantine.length > 0 ? <h2 className="section">Quarantine list</h2> : null}
      {quarantine.map((line) => (
        <div key={`${line.line}-${line.batch}`} className="row" style={{ cursor: 'default' }}>
          <span className="thumb"><Pill aria-hidden="true" size={24} /></span>
          <span className="row-copy">
            <strong>{line.product || line.brand || 'Line ' + line.line}</strong>
            <span>{line.batch}{line.qty ? ` · qty ${line.qty}` : ''}{line.customer ? ` · ${line.customer}` : ''}</span>
          </span>
          <span className="file-token">{line.outcome.hit ? `NSQ ${labelMonth(line.outcome.hit.alert.month)}` : 'Flagged'}</span>
        </div>
      ))}
      {lines.length > 0 && quarantine.length === 0 ? (
        <p className="supporting">No CDSCO alert names a batch on this invoice yet.{review.length ? ` ${review.length} ${review.length === 1 ? 'line needs' : 'lines need'} a look by hand.` : ''}</p>
      ) : null}
      <Button label="Export quarantine list (PDF)" variant="primary" width="100%" isDisabled={lines.length === 0} onClick={exportPdf} />
    </>
  )
}
