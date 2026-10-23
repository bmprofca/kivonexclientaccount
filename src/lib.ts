import { useCallback, useEffect, useRef, useState } from 'react'

/** Loads data from the API with loading and error state; reload() fetches again. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const latest = useRef(load)
  latest.current = load

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await latest.current())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload }
}

export type Loaded<T> = ReturnType<typeof useLoad<T>>

// ------------------------------------------------------------------ dates

/** "23-10-2026" from an ISO date or date-time (the day as it is in India for a moment). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('-')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('day')}-${part('month')}-${part('year')}`
}

/** "23-10-2026, 4:05 pm". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  return `${formatDate(value)}, ${time.toLowerCase()}`
}

/** "3 min ago", "2 days ago", or the date once it is over a month old. */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—'
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (Number.isNaN(seconds)) return value
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return formatDate(value)
}

/** Today in UTC, as the API counts plan days. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000)
}

export function months(count: number): string {
  return count === 12 ? '12 months' : `${count} ${count === 1 ? 'month' : 'months'}`
}

export function computers(count: number): string {
  return `${count} ${count === 1 ? 'computer' : 'computers'}`
}

// ------------------------------------------------------------------ money

const RUPEES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const RUPEES_PAISE = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Paise as rupees with Indian grouping: ₹9,999 for 999900, ₹1,23,456.50 for 12345650.
 * Paise show only when there are some, unless `paise` asks for them always (the invoice's columns line up that way).
 */
export function formatMoney(amountPaise: number, options: { paise?: boolean } = {}): string {
  const rupees = amountPaise / 100
  const whole = amountPaise % 100 === 0
  return `₹${options.paise || !whole ? RUPEES_PAISE.format(rupees) : RUPEES.format(rupees)}`
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/** 0 to 99 in words. */
function twoDigits(value: number): string {
  if (value < 20) return ONES[value]!
  return [TENS[Math.floor(value / 10)], ONES[value % 10]].filter(Boolean).join(' ')
}

/** A whole number in words, counted the Indian way (thousand, lakh, crore). */
export function numberInWords(value: number): string {
  if (value === 0) return 'Zero'
  const words: string[] = []
  const crore = Math.floor(value / 10_000_000)
  let rest = value % 10_000_000
  if (crore) words.push(`${numberInWords(crore)} Crore`)
  const lakh = Math.floor(rest / 100_000)
  rest %= 100_000
  if (lakh) words.push(`${twoDigits(lakh)} Lakh`)
  const thousand = Math.floor(rest / 1000)
  rest %= 1000
  if (thousand) words.push(`${twoDigits(thousand)} Thousand`)
  const hundred = Math.floor(rest / 100)
  rest %= 100
  if (hundred) words.push(`${ONES[hundred]} Hundred`)
  if (rest) words.push(twoDigits(rest))
  return words.join(' ')
}

/** "Rupees Nine Thousand Nine Hundred Ninety Nine Only", with "and Fifty Paise" when there are paise. */
export function amountInWords(amountPaise: number): string {
  const rupees = Math.floor(amountPaise / 100)
  const paise = amountPaise % 100
  return `Rupees ${numberInWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`
}

// ------------------------------------------------------------------ people

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '?'
}

/** The states and union territories of India, for the billing address. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
]
