import { describe, expect, it } from 'vitest'

import { assessCabinetItem } from '../src/lib/cabinet'
import { diffAlerts, normalizeRow } from '../src/lib/normalize'
import {
  buildIndex,
  canonicalBatch,
  confusionDistance,
  matchBatch,
  nameScore,
} from '../src/lib/match'
import type { AlertRow, CabinetItem } from '../src/lib/types'
import { clearHeadline, flaggedHeadline } from '../src/lib/wording'

function alert(partial: Partial<AlertRow> & Pick<AlertRow, 'batchNo'>): AlertRow {
  const productName = partial.productName ?? 'Paracetamol IP 500 mg Tablets'
  const manufacturedBy = partial.manufacturedBy ?? 'Konis Pharmaceuticals, Solan (HP)'
  const month = partial.month ?? 'SEP-2026'
  return {
    id: partial.id ?? `nsq|${month}|${partial.batchNo}`,
    kind: partial.kind ?? 'nsq',
    productName,
    brandName: partial.brandName ?? 'Paracet 500',
    batchNo: partial.batchNo,
    mfgDate: partial.mfgDate ?? 'May-2025',
    expDate: partial.expDate ?? 'Apr-2027',
    manufacturedBy,
    result: partial.result ?? 'Does not conform in respect of Assay and Dissolution',
    source: partial.source ?? 'State',
    reportedBy: partial.reportedBy ?? 'DCL Telangana',
    month,
    dosageForm: partial.dosageForm ?? 'Tablet',
    remarks: partial.remarks ?? '',
  }
}

describe('confusion distance', () => {
  it.each([
    ['PCM24117', 'PCM24I17'],
    ['PCM24117', 'pcm24l17'],
    ['PCM24110', 'PCM2411O'],
    ['AB158', 'ABI5B'],
    ['AB158', 'AB1SB'],
    ['LOT82', 'LOT8Z'],
    ['LOT82', 'LOTB2'],
    ['APRCT-2501', 'aprct-2501'],
    ['PCM 24117', 'PCM24117'],
  ])('treats %s and %s as the same batch', (left, right) => {
    expect(confusionDistance(left, right)).toBe(0)
  })

  it('counts a real one-character edit as distance 1', () => {
    expect(confusionDistance('PCM24117', 'PCM24118')).toBe(1)
  })

  it('counts two real edits as distance 2', () => {
    expect(confusionDistance('PCM24117', 'PCM24199')).toBe(2)
  })

  it('canonicalises every confusion pair', () => {
    expect(canonicalBatch('oIlSBz')).toBe('011582')
  })
})

describe('name agreement', () => {
  it('scores the same manufacturer highly after address and pharma wording', () => {
    const score = nameScore('Konis Pharmaceuticals, Solan (HP)', 'Konis Pharma Pvt Ltd')
    expect(score).toBeGreaterThan(0.6)
  })

  it('scores unrelated makers at zero', () => {
    expect(nameScore('Totally Different Labs', 'Konis Pharmaceuticals')).toBe(0)
  })
})

describe('matchBatch', () => {
  const rows = [
    alert({ batchNo: 'PCM24117', productName: 'Paracetamol IP 650 mg', brandName: 'Example', manufacturedBy: 'Example Pharma, Baddi', month: 'AUG-2026' }),
    alert({ batchNo: 'APRCT-2501' }),
    alert({ batchNo: 'FMT26015SL', productName: 'Montelukast and Levocetirizine Tablets', brandName: 'Flumont-LC', manufacturedBy: 'Other Labs' }),
  ]
  const index = buildIndex(rows)

  it('flags an exact batch when the product agrees', () => {
    const outcome = matchBatch({
      batch: 'APRCT-2501',
      product: 'Paracetamol IP 500 mg Tablets',
      brand: 'Paracet 500',
      manufacturer: 'Konis Pharmaceuticals',
    }, index)
    expect(outcome.status).toBe('flagged')
    expect(outcome.hit?.batchDistance).toBe(0)
    expect(outcome.hit?.alert.batchNo).toBe('APRCT-2501')
  })

  it('flags a confusion twin so a misread cannot hide a listed batch', () => {
    const outcome = matchBatch({
      batch: 'APRCT-25O1',
      product: 'Paracetamol Tablets',
      manufacturer: 'Konis Pharma',
    }, index)
    expect(outcome.status).toBe('flagged')
    expect(outcome.hit?.batchDistance).toBe(0)
  })

  it('does not flag a one-edit near miss when the names disagree', () => {
    const outcome = matchBatch({
      batch: 'APRCT-2502',
      product: 'Cough Syrup',
      manufacturer: 'Totally Different Labs',
    }, index)
    expect(outcome.status).not.toBe('flagged')
  })

  it('does not flag distance 2', () => {
    const outcome = matchBatch({
      batch: 'APRCT-9999',
      product: 'Paracetamol Tablets',
      manufacturer: 'Konis Pharmaceuticals',
    }, index)
    expect(outcome.status).toBe('clear')
    expect(outcome.hit).toBeNull()
  })

  it('does not flag the same batch code from a different company when both names are given', () => {
    const outcome = matchBatch({
      batch: 'PCM24117',
      product: 'Cough Syrup',
      manufacturer: 'Totally Different Labs',
    }, index)
    expect(outcome.status).not.toBe('flagged')
  })

  it('flags the same batch when the product agrees', () => {
    const outcome = matchBatch({
      batch: 'PCM24117',
      product: 'Paracetamol IP 650 mg',
      manufacturer: 'Example Pharma, Baddi',
    }, index)
    expect(outcome.status).toBe('flagged')
  })

  it('holds a short or unnamed near miss for a person to check', () => {
    const outcome = matchBatch({ batch: 'PCM24118' }, index)
    expect(outcome.status).toBe('review')
  })

  it('does not match an empty batch', () => {
    expect(matchBatch({ batch: '' }, index).status).toBe('clear')
    expect(matchBatch({ batch: 'NA' }, index).status).toBe('clear')
  })
})

describe('cabinet recheck', () => {
  it('marks a medicine newly flagged when a later list names the batch', () => {
    const item: CabinetItem = {
      id: '1',
      product: 'Paracetamol IP 500 mg Tablets',
      brand: 'Paracet 500',
      batch: 'APRCT-2501',
      manufacturer: 'Konis Pharmaceuticals',
      mfg: '05/2025',
      exp: '04/2027',
      scannedAt: '2026-10-12T00:00:00.000Z',
      statusAtScan: 'clear',
      matchedAlertIds: [],
      currentStatus: 'clear',
      currentAlertId: null,
      newlyFlagged: false,
      lastCheckedAt: '2026-10-12T00:00:00.000Z',
    }
    const next = assessCabinetItem(item, buildIndex([alert({ batchNo: 'APRCT-2501' })]), '2026-11-01T00:00:00.000Z')
    expect(next.newlyFlagged).toBe(true)
    expect(next.currentStatus).toBe('flagged')
  })

  it('does not call an already flagged scan newly flagged', () => {
    const listed = alert({ batchNo: 'APRCT-2501' })
    const item: CabinetItem = {
      id: '1',
      product: 'Paracetamol IP 500 mg Tablets',
      brand: 'Paracet 500',
      batch: 'APRCT-2501',
      manufacturer: 'Konis Pharmaceuticals',
      mfg: '',
      exp: '',
      scannedAt: '2026-10-12T00:00:00.000Z',
      statusAtScan: 'flagged',
      matchedAlertIds: [listed.id],
      currentStatus: 'flagged',
      currentAlertId: listed.id,
      newlyFlagged: false,
      lastCheckedAt: '2026-10-12T00:00:00.000Z',
    }
    expect(assessCabinetItem(item, buildIndex([listed])).newlyFlagged).toBe(false)
  })
})

describe('normalize and diff', () => {
  it('keeps the CDSCO field names and skips a row with no batch and no product', () => {
    const row = normalizeRow({
      str_product_name: 'Paracetamol Tablets',
      str_brand_name: 'Paracet',
      str_batch_no: 'APRCT-2501',
      dt_manufacturing_date: 'May-2025',
      dt_expiry_date: 'Apr-2027',
      str_manufactured_by: 'Konis',
      str_nsq_result: 'Assay',
      str_reporting_source: 'State',
      str_reported_by_lab_or_state: 'DCL',
      dt_reporting_month_year: 'SEP-2026',
    }, 'nsq', 'SEP-2026')
    expect(row?.batchNo).toBe('APRCT-2501')
    expect(row?.month).toBe('SEP-2026')
    expect(normalizeRow({ str_nsq_result: 'blank' }, 'nsq', 'SEP-2026')).toBeNull()
  })

  it('diffs rows that were not in the previous snapshot', () => {
    const older = [alert({ batchNo: 'A1' })]
    const newer = [alert({ batchNo: 'A1' }), alert({ batchNo: 'B2', id: 'new' })]
    expect(diffAlerts(older, newer).map((row) => row.batchNo)).toEqual(['B2'])
  })
})

describe('wording', () => {
  it('never calls a batch safe', () => {
    expect(clearHeadline().toLowerCase()).not.toMatch(/\bsafe\b/)
    expect(flaggedHeadline('Sep 2026').toLowerCase()).not.toMatch(/\bsafe\b/)
    expect(clearHeadline()).toBe('No CDSCO alert names this batch yet')
    expect(flaggedHeadline('Sep 2026')).toBe('This batch appears in CDSCO alert Sep 2026')
  })
})
