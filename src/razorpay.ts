import type { CheckoutOptions } from './api'
import { colors } from './theme'

/**
 * Razorpay Checkout: its script is added to the page the first time a customer buys, then reused. Card and UPI
 * details are typed into Razorpay's own window, never into this panel.
 */

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

type SuccessResponse = { razorpay_payment_id: string; razorpay_order_id?: string; razorpay_signature: string }
type FailedResponse = { error?: { description?: string; reason?: string } }

type RazorpayOptions = {
  key: string
  order_id: string
  amount: number
  currency: string
  name: string
  description: string
  prefill: { name: string; contact: string; email: string }
  theme: { color: string }
  handler: (response: SuccessResponse) => void
  modal: { ondismiss: () => void }
}

type RazorpayInstance = {
  open: () => void
  on: (event: 'payment.failed', handler: (response: FailedResponse) => void) => void
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

let loading: Promise<RazorpayConstructor> | null = null

/** Adds Razorpay's checkout script once (on the first purchase) and waits for it. */
export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (loading) return loading
  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('The payment window did not load.')))
    script.onerror = () => {
      script.remove()
      reject(new Error('Could not load the payment window. Check your internet connection and try again.'))
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    // A later try loads the script again.
    loading = null
    throw error
  })
  return loading
}

/** How a checkout ended: paid (to be verified with the API), or closed, after a failed try or without one. */
export type CheckoutOutcome =
  | { type: 'paid'; razorpayPaymentId: string; razorpaySignature: string }
  | { type: 'closed'; failure: string | null }

/**
 * Opens Razorpay Checkout for an order and waits until it ends. A failed try (a declined card) is reported through
 * `onFailed` straight away; the customer can still try again in the same window, so it only ends when they pay
 * or close it.
 */
export async function openCheckout(checkout: CheckoutOptions, onFailed: (reason: string) => void): Promise<CheckoutOutcome> {
  const Razorpay = await loadRazorpay()
  return new Promise<CheckoutOutcome>((resolve) => {
    let failure: string | null = null
    const instance = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: { color: colors.brand },
      handler: (response) =>
        resolve({ type: 'paid', razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }),
      modal: { ondismiss: () => resolve({ type: 'closed', failure }) }
    })
    instance.on('payment.failed', (response) => {
      failure = response.error?.description || 'Payment failed'
      onFailed(failure)
    })
    instance.open()
  })
}
