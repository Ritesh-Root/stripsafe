export type InvoiceLine = {
  line: number
  product: string
  brand: string
  batch: string
  manufacturer: string
  mfg: string
  exp: string
  qty: string
  customer: string
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') cell += char
  }
  if (cell.length || row.length) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows.filter((entry) => entry.some((value) => value.length > 0))
}

function headerIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ''))
  for (const name of names) {
    const key = name.replace(/[^a-z0-9]+/g, '')
    const index = normalized.findIndex((header) => header === key || header.includes(key))
    if (index >= 0) return index
  }
  return -1
}

export function parseInvoice(text: string): InvoiceLine[] {
  const table = parseCsv(text)
  if (table.length === 0) return []
  const headers = table[0] ?? []
  const product = headerIndex(headers, ['product', 'medicine', 'item', 'drug'])
  const looksLikeHeader = product >= 0 || headerIndex(headers, ['batch', 'batchno']) >= 0
  const start = looksLikeHeader ? 1 : 0
  const columns = looksLikeHeader
    ? {
        product,
        brand: headerIndex(headers, ['brand']),
        batch: headerIndex(headers, ['batch', 'batchno', 'bno']),
        manufacturer: headerIndex(headers, ['manufacturer', 'mfr', 'manufacturedby', 'maker']),
        mfg: headerIndex(headers, ['mfg', 'manufacturing', 'mfgdate']),
        exp: headerIndex(headers, ['exp', 'expiry', 'expiration']),
        qty: headerIndex(headers, ['qty', 'quantity', 'qtynos']),
        customer: headerIndex(headers, ['customer', 'buyer', 'party', 'soldto']),
      }
    : { product: 0, brand: -1, batch: 1, manufacturer: 2, mfg: -1, exp: -1, qty: 3, customer: -1 }

  const cell = (row: string[], index: number) => (index >= 0 ? row[index] ?? '' : '')
  return table.slice(start).map((row, offset) => ({
    line: offset + 1,
    product: cell(row, columns.product),
    brand: cell(row, columns.brand),
    batch: cell(row, columns.batch),
    manufacturer: cell(row, columns.manufacturer),
    mfg: cell(row, columns.mfg),
    exp: cell(row, columns.exp),
    qty: cell(row, columns.qty),
    customer: cell(row, columns.customer),
  })).filter((line) => line.batch || line.product)
}
