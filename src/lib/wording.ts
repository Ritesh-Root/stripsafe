export function clearHeadline(): string {
  return 'No CDSCO alert names this batch yet'
}

export function flaggedHeadline(monthLabel: string): string {
  return `This batch appears in CDSCO alert ${monthLabel}`
}

export function newlyFlaggedTitle(): string {
  return 'Newly flagged since you scanned'
}
