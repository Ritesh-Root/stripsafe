import { describe, expect, it } from 'vitest'

import { isBatchToken, parseStrip, unsureIndexes } from '../src/lib/parse'

describe('parseStrip', () => {
  it('reads a batch and expiry anchored on B.No and EXP', () => {
    const parsed = parseStrip('B.No. PCM24117 EXP 08/2027')
    expect(parsed.batch).toBe('PCM24117')
    expect(parsed.exp).toBe('08/2027')
    expect(parsed.mfg).toBe('')
  })

  it('reads batch, mfg and exp from one foil line', () => {
    const parsed = parseStrip('B.No. APRCT-2501 MFG 05/2025 EXP 04/2027')
    expect(parsed.batch).toBe('APRCT-2501')
    expect(parsed.mfg).toBe('05/2025')
    expect(parsed.exp).toBe('04/2027')
  })

  it('accepts Batch No and a slash in the code', () => {
    const parsed = parseStrip('Batch No: AB-12/2024')
    expect(parsed.batch).toBe('AB-12/2024')
  })

  it('accepts BATCH NUMBER with a hyphen', () => {
    const parsed = parseStrip('BATCH NUMBER : ZX900')
    expect(parsed.batch).toBe('ZX900')
  })

  it('splits a product line on the foil dot', () => {
    const parsed = parseStrip('PARACET 500 · Paracetamol Tablets IP\nB.No. APRCT-2501 MFG 05/2025 EXP 04/2027')
    expect(parsed.brand).toBe('PARACET 500')
    expect(parsed.product).toBe('Paracetamol Tablets IP')
    expect(parsed.batch).toBe('APRCT-2501')
  })

  it('reads a manufactured-by line without treating Mfg date as the maker', () => {
    const parsed = parseStrip('Manufactured by: Konis Pharmaceuticals, Solan (HP)\nMfg. Date: 05/2025\nExp. Date: 04/2027')
    expect(parsed.manufacturer).toContain('Konis Pharmaceuticals')
    expect(parsed.mfg).toBe('05/2025')
    expect(parsed.exp).toBe('04/2027')
  })

  it('does not treat "Batch of" as a batch number', () => {
    expect(parseStrip('Batch of tablets').batch).toBe('')
    expect(isBatchToken('of')).toBe(false)
  })

  it('returns empty fields when the foil has no anchors', () => {
    const parsed = parseStrip('just a blurry photo')
    expect(parsed.batch).toBe('')
    expect(parsed.exp).toBe('')
    expect(parsed.mfg).toBe('')
  })
})

describe('unsureIndexes', () => {
  it('marks glyphs below the confidence threshold', () => {
    const glyphs = [
      { char: 'A', confidence: 99 },
      { char: 'P', confidence: 98 },
      { char: 'R', confidence: 40 },
      { char: 'C', confidence: 96 },
      { char: 'T', confidence: 97 },
    ]
    expect(unsureIndexes('APRCT', glyphs, 80)).toEqual([2])
  })

  it('returns nothing when the batch is not in the glyph string', () => {
    expect(unsureIndexes('ZZZ', [{ char: 'A', confidence: 10 }])).toEqual([])
  })
})
