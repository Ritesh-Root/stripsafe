import { describe, expect, it } from 'vitest'

import { diffAlerts, mergeAlertRows } from '../src/lib/normalize'
import type { AlertKind, AlertRow } from '../src/lib/types'

function row(id: string, month: string, kind: AlertKind = 'nsq', productName = 'Paracetamol IP'): AlertRow {
  return {
    id,
    kind,
    productName,
    brandName: '',
    batchNo: id,
    mfgDate: '',
    expDate: '',
    manufacturedBy: 'Example Pharma',
    result: '',
    source: '',
    reportedBy: '',
    month,
    dosageForm: '',
    remarks: '',
  }
}

describe('mergeAlertRows', () => {
  it('keeps previous rows for a month that was not fetched this run', () => {
    const previous = [row('a', 'JAN-2022'), row('b', 'FEB-2022')]
    const collected = [row('c', 'SEP-2026')]
    const merged = mergeAlertRows(previous, collected, new Set(['nsq|SEP-2026']))
    expect(merged.map((item) => item.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('drops previous rows for a month+kind that was freshly fetched', () => {
    const previous = [row('old', 'JAN-2022'), row('keep-spurious', 'JAN-2022', 'spurious')]
    const collected = [row('new', 'JAN-2022')]
    const merged = mergeAlertRows(previous, collected, new Set(['nsq|JAN-2022']))
    expect(merged.map((item) => item.id).sort()).toEqual(['keep-spurious', 'new'])
  })

  it('dedupes by id and prefers the collected row', () => {
    const previous = [row('same', 'JAN-2022', 'nsq', 'Old name')]
    const collected = [row('same', 'JAN-2022', 'nsq', 'New name')]
    const merged = mergeAlertRows(previous, collected, new Set())
    expect(merged).toHaveLength(1)
    expect(merged[0]?.productName).toBe('New name')
  })

  it('feeds the merged list into the usual new-row diff', () => {
    const previous = [row('a', 'JAN-2022')]
    const collected = [row('b', 'SEP-2026')]
    const merged = mergeAlertRows(previous, collected, new Set(['nsq|SEP-2026']))
    expect(diffAlerts(previous, merged).map((item) => item.id)).toEqual(['b'])
  })
})
