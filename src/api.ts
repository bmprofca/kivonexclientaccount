const TOKEN_KEY = 'kivonex-account-token'

/**
 * Where the Kivonex Cloud API is. Blank (the default) means this site's own /v1, which the dev server forwards;
 * a build served on its own address sets REACT_APP_KIVONEX_API (e.g. https://api.kivonex.in) when building.
 */
const API_BASE = (process.env.REACT_APP_KIVONEX_API ?? '').replace(/\/+$/, '')

/** Billing details: they go on every invoice made after they are saved. */
export type Billing = {
  name: string
  /** 15 characters, upper case; blank when the customer has none. */
  gstin: string
  address: string
  /** An Indian state or union territory; decides CGST + SGST or IGST. */
  state: string
  email: string
}

export type CustomerAccount = {
  id: string
  name: string
  /** As shown: +91 73640 76458. */
  mobile: string
  email: string | null
  billing: Billing
  createdAt: string
}

export type SubscriptionState = 'active' | 'grace' | 'expired' | 'future'

/** The plan the account runs on now (or the next one, when it has not started yet). */
export type CurrentSubscription = {
  id: string
  /** Plan code. */
  plan: string
  planName: string
  validFrom: string
  validUntil: string
  graceDays: number
  /** Computers that may be signed in at once. */
  devices: number
  state: SubscriptionState
}

/** A computer signed in to Kivonex Accounts with this account. */
export type Computer = {
  id: string
  name: string
  platform: string
  appVersion: string
  signedInAt: string
  lastSeenAt: string | null
}

export type Me = {
  account: CustomerAccount
  subscription: CurrentSubscription | null
  computers: Computer[]
  /** Online payment is set up (Razorpay keys saved in ADMIN). */
  paymentsReady: boolean
}

export type Plan = {
  id: string
  code: string
  name: string
  description: string
  /** Amount charged, GST included. */
  pricePaise: number
  durationMonths: number
  devices: number
  entitlements: string[]
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type PaymentStatus = 'created' | 'paid' | 'failed'

export type Payment = {
  id: string
  planId: string
  planName: string
  amountPaise: number
  currency: 'INR'
  status: PaymentStatus
  razorpayOrderId: string
  razorpayPaymentId: string | null
  /** KVX/2026-27/0001, set when paid. */
  invoiceNumber: string | null
  subscriptionId: string | null
  /** The period this payment bought. */
  validFrom: string | null
  validUntil: string | null
  createdAt: string
  paidAt: string | null
  failureReason: string | null
}

/** What Razorpay Checkout needs to open for an order. */
export type CheckoutOptions = {
  keyId: string
  orderId: string
  amount: number
  currency: string
  name: string
  description: string
  prefill: { name: string; contact: string; email: string }
}

export type WalletSummary = { balancePaise: number; reservedPaise: number; availablePaise: number; currency: 'INR' }
export type EffectiveOperationPrice = { code: string; label: string; category: string; group: string; globalPricePaise: number | null; overridePricePaise: number | null; effectivePricePaise: number | null; source: 'global' | 'account' | 'missing' }
export type WalletView = { wallet: WalletSummary; prices: EffectiveOperationPrice[]; topupSettings: { presetsPaise: number[]; minPaise: number; maxPaise: number } }
export type WalletTransaction = { id: string; direction: 'credit' | 'debit'; type: string; amountPaise: number; balanceAfterPaise: number; operation?: string; apiCallId?: string; note?: string; createdAt: string }
export type WalletUsageEvent = { id: string; operation: string; label?: string; category?: string; gstin?: string; pricePaise: number; priceSource: string; status: string; providerRequestId: string; httpStatus?: number | null; errorCode: string; errorMessage: string; createdAt: string; completedAt: string | null; request?: unknown; response?: unknown }
export type WalletTopup = { id: string; amountPaise: number; currency: 'INR'; status: 'created' | 'paid' | 'failed'; razorpayOrderId: string; razorpayPaymentId: string | null; failureReason: string | null; createdAt: string; paidAt: string | null }

export type Invoice = {
  number: string
  /** The day it was paid. */
  date: string
  seller: { name: string; gstin: string; address: string; state: string }
  buyer: Billing & { mobile: string }
  line: { description: string; amountPaise: number }
  taxablePaise: number
  gstRate: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalPaise: number
  payment: { razorpayPaymentId: string; paidAt: string }
}

/** An error answer from the API, with its code (CODE_INVALID, NAME_REQUIRED, PAYMENTS_OFF …). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('Could not reach Kivonex. Check your internet connection and try again.', 'NETWORK', 0)
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string }
  }
  // A session that ended (signed out elsewhere, or expired) goes back to the sign-in screen.
  if (response.status === 401 && token) {
    clearToken()
    window.dispatchEvent(new Event('kivonex-account-unauthorized'))
  }
  if (!response.ok) {
    throw new ApiError(body.error?.message ?? 'Something went wrong. Please try again.', body.error?.code ?? 'ERROR', response.status)
  }
  return body as T
}

/** The message of an error, for showing to the customer. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Ends this session on the server, then forgets it here. */
export async function signOut(): Promise<void> {
  await api('/v1/account/session', { method: 'DELETE' }).catch(() => undefined)
  clearToken()
}

/** Sign-in, step 1: a one-time code for the mobile number. `newAccount` means the number has no account yet. */
export function requestSignInCode(mobile: string): Promise<{ sent: true; mobile: string; resendAfterSeconds: number; newAccount: boolean }> {
  return api('/v1/account/session/code', { method: 'POST', body: JSON.stringify({ mobile }) })
}

/** Sign-in, step 2: the mobile number and its code; a new number also sends the name (and email) for its account. */
export function signIn(input: { mobile: string; code: string; name?: string; email?: string }): Promise<{ token: string; account: CustomerAccount }> {
  return api('/v1/account/session', { method: 'POST', body: JSON.stringify(input) })
}

export function loadMe(): Promise<Me> {
  return api<Me>('/v1/account/me')
}

/** Starts buying a plan: a Razorpay order and what Checkout needs to open for it. */
export function createOrder(planId: string): Promise<{ payment: Payment; checkout: CheckoutOptions }> {
  return api('/v1/account/orders', { method: 'POST', body: JSON.stringify({ planId }) })
}

/** Confirms a payment with what Razorpay Checkout handed back; the answer has the new subscription. */
export function verifyPayment(
  paymentId: string,
  input: { razorpayPaymentId: string; razorpaySignature: string }
): Promise<{ payment: Payment; subscription: CurrentSubscription | null }> {
  return api(`/v1/account/orders/${paymentId}/verify`, { method: 'POST', body: JSON.stringify(input) })
}

/** Records that checkout was closed or the payment failed. */
export function failPayment(paymentId: string, reason: string): Promise<{ payment: Payment }> {
  return api(`/v1/account/orders/${paymentId}/fail`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export const loadWallet = (): Promise<WalletView> => api('/v1/account/wallet')
export const loadWalletTransactions = (): Promise<{ transactions: WalletTransaction[] }> => api('/v1/account/wallet/transactions')
export const loadWalletTransactionDetail = (id: string): Promise<{ transaction: WalletTransaction; usage: WalletUsageEvent | null }> => api(`/v1/account/wallet/transactions/${id}`)
export const loadWalletUsage = (): Promise<{ usage: WalletUsageEvent[] }> => api('/v1/account/wallet/usage')
export const loadWalletUsageDetail = (id: string): Promise<{ usage: WalletUsageEvent }> => api(`/v1/account/wallet/usage/${id}`)
export const createWalletTopup = (amountPaise: number): Promise<{ topup: WalletTopup; checkout: CheckoutOptions }> => api('/v1/account/wallet/orders', { method: 'POST', body: JSON.stringify({ amountPaise }) })
export const verifyWalletTopup = (id: string, input: { razorpayPaymentId: string; razorpaySignature: string }): Promise<{ topup: WalletTopup } & WalletView> => api(`/v1/account/wallet/orders/${id}/verify`, { method: 'POST', body: JSON.stringify(input) })
export const failWalletTopup = (id: string, reason: string): Promise<{ topup: WalletTopup }> => api(`/v1/account/wallet/orders/${id}/fail`, { method: 'POST', body: JSON.stringify({ reason }) })
