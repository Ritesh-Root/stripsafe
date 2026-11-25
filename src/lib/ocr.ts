import type { Glyph } from './parse'

type OcrWord = {
  text?: string
  symbols?: { text?: string; confidence?: number }[]
}

let workerPromise: Promise<{ recognize: (image: Blob | string) => Promise<{ data: { text?: string; words?: OcrWord[] } }> }> | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('eng')
    })().catch((error: unknown) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

export async function readStrip(image: Blob | string): Promise<{ text: string; glyphs: Glyph[] }> {
  const worker = await getWorker()
  const result = await worker.recognize(image)
  const text = result.data.text ?? ''
  const glyphs: Glyph[] = []
  for (const word of result.data.words ?? []) {
    const symbols = word.symbols ?? []
    if (symbols.length === 0 && word.text) {
      glyphs.push({ char: word.text, confidence: 100 })
      glyphs.push({ char: ' ', confidence: 100 })
      continue
    }
    for (const symbol of symbols) {
      if (!symbol.text) continue
      glyphs.push({ char: symbol.text, confidence: symbol.confidence ?? 0 })
    }
    glyphs.push({ char: ' ', confidence: 100 })
  }
  return { text, glyphs }
}
