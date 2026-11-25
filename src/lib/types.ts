export type AlertKind = 'nsq' | 'spurious'

export type AlertRow = {
  id: string
  kind: AlertKind
  productName: string
  brandName: string
  batchNo: string
  mfgDate: string
  expDate: string
  manufacturedBy: string
  result: string
  source: string
  reportedBy: string
  month: string
  dosageForm: string
  remarks: string
}

export type FetchError = {
  url: string
  message: string
}

export type AlertSnapshot = {
  generatedAt: string
  sourceBase: string
  rowCount: number
  months: string[]
  errors: FetchError[]
  rows: AlertRow[]
}

export type DiffSnapshot = {
  generatedAt: string
  previousGeneratedAt: string | null
  newRowCount: number
  rows: AlertRow[]
}

export type MatchStatus = 'flagged' | 'clear' | 'review'

export type Draft = {
  product: string
  brand: string
  batch: string
  manufacturer: string
  mfg: string
  exp: string
  imageUrl: string
  ocrText: string
  unsureIndexes: number[]
}

export type CabinetItem = {
  id: string
  product: string
  brand: string
  batch: string
  manufacturer: string
  mfg: string
  exp: string
  scannedAt: string
  statusAtScan: MatchStatus
  matchedAlertIds: string[]
  currentStatus: MatchStatus
  currentAlertId: string | null
  newlyFlagged: boolean
  lastCheckedAt: string
}
