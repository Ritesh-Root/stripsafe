import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'

import { cycleConfusion, confusionHint } from '../lib/match'
import type { Draft } from '../lib/types'

type Props = {
  draft: Draft
  onChange: (draft: Draft) => void
  onCheck: () => void
}

export function ReviewScreen({ draft, onChange, onCheck }: Props) {
  const hint = confusionHint(draft.batch)
  const set = (key: keyof Draft, value: string) => onChange({ ...draft, [key]: value })
  return (
    <>
      <div className="crop" aria-label="Text read from the strip">
        {draft.imageUrl ? <img className="preview" src={draft.imageUrl} alt="Strip photo you uploaded" style={{ width: '100%', borderRadius: 10, marginBottom: 8 }} /> : null}
        <p className="mono">{draft.brand || draft.product || 'No product line yet'}</p>
        <p className="mono"><strong>{draft.ocrText || `B.No. ${draft.batch || '—'}  MFG ${draft.mfg || '—'}  EXP ${draft.exp || '—'}`}</strong></p>
      </div>
      <TextInput label="Medicine" width="100%" value={draft.product} onChange={(value) => set('product', value)} />
      <TextInput label="Brand on strip" width="100%" value={draft.brand} onChange={(value) => set('brand', value)} />
      <TextInput label="Batch number" width="100%" value={draft.batch} onChange={(value) => set('batch', value)} />
      {draft.unsureIndexes.length > 0 ? (
        <div>
          <p className="supporting">Tap a character the reader was unsure about. Each tap tries the lookalike spelling.</p>
          <div className="chars">
            {draft.unsureIndexes.map((index) => (
              <button
                key={`${index}-${draft.batch[index] ?? ''}`}
                type="button"
                onClick={() => {
                  const char = draft.batch[index]
                  if (!char) return
                  const next = cycleConfusion(char)
                  const batch = draft.batch.slice(0, index) + next + draft.batch.slice(index + 1)
                  onChange({ ...draft, batch })
                }}
                aria-label={`Character ${index + 1} is ${draft.batch[index]}. Try the lookalike spelling.`}
              >
                {draft.batch[index]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="supporting">Edit any character before the check.</p>
      )}
      <TextInput label="Manufacturer" width="100%" value={draft.manufacturer} onChange={(value) => set('manufacturer', value)} />
      <TextInput label="Mfg" width="100%" value={draft.mfg} onChange={(value) => set('mfg', value)} />
      <TextInput label="Exp" width="100%" value={draft.exp} onChange={(value) => set('exp', value)} />
      {hint ? <Banner status="warning" title="One character looks unsure" description={hint} collapsible={false} /> : null}
      <Button label="Check against CDSCO lists" variant="primary" width="100%" isDisabled={draft.batch.trim().length < 3} onClick={onCheck} />
    </>
  )
}
