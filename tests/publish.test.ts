import { describe, expect, it } from 'vitest'

import { buildIndex, matchBatch } from '../src/lib/match'
import { hydrateSnapshot, serializePublicSnapshot, toPublicRow } from '../src/lib/publish'
import type { AlertRow, AlertSnapshot } from '../src/lib/types'

function row(partial: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'nsq|SEP-2026|60098|alprazolam|uniza',
    kind: 'nsq',
    productName: 'Alprazolam Tablets IP 0.5 mg',
    brandName: 'Alzomac-0.5 Tablets',
    batchNo: '60098',
    mfgDate: 'Feb-2026',
    expDate: 'Jan-2028',
    manufacturedBy: 'Uniza Lifecare Pvt. Ltd.',
    result: 'Does not conform to IP with respect to Assay',
    source: 'State',
    reportedBy: 'DCL Gujarat',
    month: 'SEP-2026',
    dosageForm: '',
    remarks: '',
    ...partial,
  }
}

function snapshot(rows: AlertRow[]): AlertSnapshot {
  return {
    generatedAt: '2026-11-25T00:00:00.000Z',
    sourceBase: 'https://cdscoonline.gov.in/CDSCO',
    rowCount: rows.length,
    months: ['SEP-2026'],
    errors: [],
    rows,
  }
}

describe('public snapshot', () => {
  it('drops empty fields and keeps the CDSCO text that was present', () => {
    const published = toPublicRow(row())
    expect(published).not.toHaveProperty('dosageForm')
    expect(published).not.toHaveProperty('remarks')
    expect(published.batchNo).toBe('60098')
    expect(published.productName).toBe('Alprazolam Tablets IP 0.5 mg')
    expect(published.manufacturedBy).toBe('Uniza Lifecare Pvt. Ltd.')
    expect(published.result).toContain('Assay')
    expect(published.source).toBe('State')
  })

  it('round-trips through the compact file and still flags the batch', () => {
    const encoded = serializePublicSnapshot(snapshot([row()]))
    expect(encoded).not.toContain('dosageForm')
    const restored = hydrateSnapshot(JSON.parse(encoded))
    expect(restored.rowCount).toBe(1)
    expect(restored.rows[0]?.dosageForm).toBe('')
    expect(restored.rows[0]?.productName).toBe('Alprazolam Tablets IP 0.5 mg')
    const outcome = matchBatch({
      batch: '60098',
      product: 'Alprazolam Tablets IP 0.5 mg',
      manufacturer: 'Uniza Lifecare',
    }, buildIndex(restored.rows))
    expect(outcome.status).toBe('flagged')
    expect(outcome.hit?.alert.month).toBe('SEP-2026')
  })

  it('rejects a payload that is not a snapshot', () => {
    expect(() => hydrateSnapshot(null)).toThrow(/not an object/)
    expect(() => hydrateSnapshot({ rows: 'nope' })).toThrow(/no rows/)
  })
})
