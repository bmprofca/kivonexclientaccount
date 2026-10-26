export function walletLabel(value: unknown): string {
  return String(value ?? '').replaceAll('_', ' ').trim().toUpperCase()
}

export function prettyWalletJson(value: unknown): string {
  if (value === undefined) return 'Not recorded'
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) }
    catch { return value }
  }
  return JSON.stringify(parsed, null, 2)
}
