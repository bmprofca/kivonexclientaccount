// Browser test of the account panel: sign-up with a mobile number and code, the profile's billing details, buying
// a plan through Razorpay Checkout (stood in for here), the invoice, and Billing. It runs against a throwaway
// in-memory API (BACKEND/test/ui-server.ts, which also fakes Razorpay's order API) and its own dev server, never
// the real database or Razorpay. Needs Google Chrome.
//
//   npm run test:ui
import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const BACKEND_DIR = fileURLToPath(new URL('../../BACKEND', import.meta.url))
const API_PORT = 8796
const WEB_PORT = 5187
const API = `http://127.0.0.1:${API_PORT}`
const WEB = `http://127.0.0.1:${WEB_PORT}`
const MOBILE = '9876501234'
const CODE = '123456'
// ui-server.ts's Razorpay test settings: checkout signs "order_id|payment_id" with this key secret.
const RAZORPAY_SECRET = 'ui-razorpay-secret'
const RAZORPAY_KEY_ID = 'rzp_test_KivonexUi'
const BRAND = '#4f46e5'

const children = []
function start(command, args, cwd, env, ready, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    // Its own process group, so stopping it also stops what npx started (tsx, react-scripts).
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    children.push(child)
    let output = ''
    const timer = setTimeout(() => reject(new Error(`${command} ${args.join(' ')} did not start:\n${output}`)), timeoutMs)
    const onData = (data) => {
      output += data
      if (ready.test(output)) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => reject(new Error(`${command} exited with ${code}:\n${output}`)))
  })
}

let failures = 0
let passes = 0
/** With UI_SHOTS=<folder>, saves screenshots of the main screens there for a look by eye. */
async function shot(page, name) {
  if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/${name}.png`, fullPage: true })
}
function check(condition, message) {
  if (condition) {
    passes += 1
    console.log(`  ok  ${message}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${message}`)
  }
}
const seen = (locator, timeout = 5000) => locator.first().waitFor({ timeout }).then(() => true, () => false)

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json' } })
  return { status: response.status, body: await response.json() }
}

// ---- dates as the API counts them (UTC days)
const today = new Date().toISOString().slice(0, 10)
const show = (iso) => iso.split('-').reverse().join('-')
function addDays(iso, days) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}
function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}
function financialYear(iso) {
  const [y, m] = iso.split('-').map(Number)
  const startYear = m >= 4 ? y : y - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}
const proValidTill = addDays(addMonths(today, 12), -1)

/**
 * Stands in for Razorpay's checkout.js. window.__rzpMode picks what the "customer" does: 'pay' (the handler gets
 * pay_ui1 and a real signature, made in Node), 'dismiss' (closes the window) or 'fail' (a declined card, then close).
 */
const CHECKOUT_STUB = `
window.__rzpScriptLoads = (window.__rzpScriptLoads || 0) + 1
window.Razorpay = class {
  constructor(options) {
    this.options = options
    this.handlers = {}
    window.__rzpLast = { key: options.key, order_id: options.order_id, amount: options.amount, currency: options.currency, name: options.name, color: options.theme && options.theme.color, contact: options.prefill && options.prefill.contact }
  }
  on(event, handler) { this.handlers[event] = handler }
  open() {
    const mode = window.__rzpMode || 'pay'
    setTimeout(async () => {
      if (mode === 'dismiss') return this.options.modal.ondismiss()
      if (mode === 'fail') {
        this.handlers['payment.failed'] && this.handlers['payment.failed']({ error: { description: 'Your card was declined.' } })
        return setTimeout(() => this.options.modal.ondismiss(), 200)
      }
      const signature = await window.kivonexSignPayment(this.options.order_id, 'pay_ui1')
      this.options.handler({ razorpay_payment_id: 'pay_ui1', razorpay_order_id: this.options.order_id, razorpay_signature: signature })
    }, 150)
  }
}
`

async function typeCode(page, code) {
  await page.locator('.ant-otp input').first().click()
  await page.keyboard.type(code)
}

async function noSideScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

/** Opens a page of the panel by its address, in the app (the router follows it), as a click on a link would. */
function openPath(page, path) {
  return page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/** Opens a page by its address and checks that skeletons show before the data. */
async function openWithSkeleton(page, hash, selector, label) {
  await openPath(page, hash)
  check(await seen(page.locator(selector), 3000), `${label}: skeleton shows while loading`)
}

let browser
try {
  await start('node', ['test/ui-server.js'], BACKEND_DIR, { PORT: String(API_PORT), ADMIN_FIXED_CODE: CODE, UI_DELAY_MS: process.env.UI_DELAY_MS ?? '400' }, /UI_SERVER_READY/)
  // Create React App's development server (its first build takes a while).
  await start('npx', ['react-scripts', 'start'], APP_DIR, { KIVONEX_API: API, PORT: String(WEB_PORT), HOST: '127.0.0.1', BROWSER: 'none' }, /Compiled successfully|compiled successfully/, 180000)

  // ---- the API keeps the code when a new number has no name yet (the panel relies on it)
  console.log('API: new number without a name')
  {
    const other = '9123450000'
    await call('/v1/account/session/code', { method: 'POST', body: JSON.stringify({ mobile: other }) })
    const noName = await call('/v1/account/session', { method: 'POST', body: JSON.stringify({ mobile: other, code: CODE }) })
    check(noName.status === 400 && noName.body.error?.code === 'NAME_REQUIRED', 'A new number without a name answers NAME_REQUIRED')
    const withName = await call('/v1/account/session', { method: 'POST', body: JSON.stringify({ mobile: other, code: CODE, name: 'Ravi Kumar' }) })
    check(withName.status === 200 && Boolean(withName.body.token), 'The same code then works with the name')
  }

  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  let checkoutRequests = 0
  await context.route('https://checkout.razorpay.com/v1/checkout.js', (route) => {
    checkoutRequests += 1
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: CHECKOUT_STUB })
  })
  await context.exposeFunction('kivonexSignPayment', (orderId, paymentId) =>
    createHmac('sha256', RAZORPAY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  // ---- sign-up
  console.log('Sign-up with a new number')
  await page.goto(WEB)
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  await shot(page, '01-login')
  check((await page.getByLabel('Password').count()) === 0, 'No password field')
  check((await page.getByText('My account').count()) > 0, 'Branded Kivonex / My account')
  await page.getByLabel('Mobile number').fill('12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  check(await seen(page.getByText('Enter a 10-digit mobile number.'), 3000), 'A short number is refused')
  await page.getByLabel('Mobile number').fill('98765 01234')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByRole('heading', { name: 'Create your account' }).waitFor()
  check(await page.getByText('+91 98765 01234').first().isVisible(), 'Code step names the number')
  check(await page.getByLabel('Your name').isVisible(), 'A new number is asked for a name')
  check(await page.getByLabel('Email (optional)').isVisible(), 'and an optional email')
  check(await page.getByRole('button', { name: /Resend in \d+s/ }).isDisabled(), 'Resend waits 30 seconds')
  await typeCode(page, '000000')
  check(await seen(page.getByText('Enter your name to create your account.'), 3000), 'The code alone does not create the account: the name is required')
  const kept = await page.locator('.ant-otp input').evaluateAll((inputs) => inputs.map((input) => input.value).join(''))
  check(kept === '000000', 'The typed code is kept while the name is asked for')
  await page.getByLabel('Your name').fill('Asha Mehta')
  await page.getByLabel('Email (optional)').fill('asha@example.com')
  await page.getByRole('button', { name: 'Create account' }).click()
  check(await seen(page.getByText('The code is not valid or has expired')), 'A wrong code is refused')
  const cleared = await page.locator('.ant-otp input').evaluateAll((inputs) => inputs.every((input) => input.value === ''))
  check(cleared, 'The code boxes are cleared for another try')
  await page.waitForFunction(() => document.activeElement === document.querySelector('.login-card .ant-otp input'))
  await shot(page, '02-signup')
  await page.keyboard.type(CODE)
  await page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 15000 })
  check(true, 'Six digits create the account and sign in')
  check(await seen(page.locator('.plan-hero[aria-busy] .bone'), 3000), 'Overview: the plan shows as a skeleton while loading')

  // ---- overview without a plan
  console.log('Overview without a plan')
  await page.getByText("You don't have a plan yet").waitFor()
  check(await page.getByRole('button', { name: 'See plans' }).isVisible(), 'No plan: an empty state with See plans')
  check(await page.getByText('Sign out of this computer').isVisible(), 'Computers: the note on signing out of a computer to free a place')
  check((await page.getByRole('button', { name: /remove/i }).count()) === 0, 'Computers cannot be removed here')
  check(await page.locator('.user-chip').getByText('Asha Mehta').isVisible(), 'The top bar names the customer')
  await shot(page, '03-overview-empty')

  // ---- profile (billing details go on the invoice, so they are set before buying)
  console.log('Profile')
  // The account is loaded once for the whole panel, so the form shows at once here (its skeleton is checked on reload).
  await openPath(page, '/profile')
  await page.getByLabel('Billing name').waitFor()
  check((await page.getByLabel('Mobile number').inputValue()) === '+91 98765 01234', 'The mobile number is shown')
  check(await page.getByLabel('Mobile number').isDisabled(), 'and cannot be changed here')
  await page.getByLabel('Billing name').fill('Mehta Traders')
  await page.getByLabel('GSTIN').fill('19abc')
  await page.getByRole('button', { name: 'Save changes' }).click()
  check(await seen(page.getByText('Enter a valid 15-character GSTIN'), 3000), 'A short GSTIN is refused')
  await page.getByLabel('GSTIN').fill('19aaacm1234f1z5')
  check((await page.getByLabel('GSTIN').inputValue()) === '19AAACM1234F1Z5', 'GSTIN is typed in capitals')
  await page.getByLabel('Address').fill('12 Park Street, Kolkata 700016')
  await page.getByLabel('State').click()
  await page.keyboard.type('West Ben')
  await page.locator('.ant-select-item-option', { hasText: 'West Bengal' }).click()
  await shot(page, '04-profile')
  await page.getByRole('button', { name: 'Save changes' }).click()
  check(await seen(page.getByText('Profile saved')), 'Profile saves')
  await page.reload()
  check(await seen(page.locator('.form-section .bone'), 3000), 'Profile form: skeleton shows while loading')
  await page.getByLabel('Billing name').waitFor()
  check((await page.getByLabel('Billing name').inputValue()) === 'Mehta Traders', 'Billing details are kept')
  check(await page.locator('.ant-select-content, .ant-select-selection-item').getByText('West Bengal').first().isVisible(), 'The state is kept')

  // ---- plans
  console.log('Plans')
  await openWithSkeleton(page, '/plans', '.plan-card .bone', 'Plan cards')
  await page.getByRole('heading', { name: 'Pro' }).waitFor()
  check(await page.getByText('₹4,999', { exact: true }).isVisible(), 'Basic costs ₹4,999')
  check(await page.getByText('₹9,999', { exact: true }).isVisible(), 'Pro costs ₹9,999')
  check((await page.getByText('for 12 months').count()) === 2, 'Both are for 12 months')
  check(await page.getByText('3 computers at a time').isVisible(), 'Pro allows 3 computers')
  check((await page.getByText('GST included').count()) === 2, 'GST included is said')
  check((await page.locator('script[src*="checkout.razorpay.com"]').count()) === 0, 'Checkout script is not loaded until buying')
  await shot(page, '05-plans')

  console.log('Buying Pro')
  await page.evaluate(() => (window.__rzpMode = 'pay'))
  await page.getByRole('button', { name: 'Buy Pro' }).click()
  await page.getByText('Payment received').waitFor({ timeout: 15000 })
  const invoiceNumber = (await page.locator('.paid-invoice').textContent())?.trim()
  check(invoiceNumber === `KVX/${financialYear(today)}/0001`, `Payment received with invoice ${invoiceNumber}`)
  check((await page.locator('.paid-valid-till').textContent()) === show(proValidTill), `Valid till ${show(proValidTill)}`)
  const options = await page.evaluate(() => window.__rzpLast)
  check(options.key === RAZORPAY_KEY_ID && options.order_id === 'order_ui1' && options.amount === 999900 && options.currency === 'INR', 'Checkout opens with the key, order and amount')
  check(options.color === BRAND && options.contact === '9876501234', 'Checkout gets the panel colour and the customer prefill')
  await shot(page, '06-paid')
  await page.getByRole('button', { name: 'View invoice' }).click()

  // ---- invoice
  console.log('Invoice')
  await page.getByRole('heading', { name: 'Tax invoice' }).waitFor()
  const invoice = page.locator('.invoice')
  check((await invoice.locator('.invoice-number').textContent()) === invoiceNumber, 'Invoice number')
  check(await invoice.getByText(show(today)).first().isVisible(), 'Invoice date as DD-MM-YYYY')
  check(await invoice.getByText('Kivonex Technologies').isVisible(), 'Seller block')
  check(await invoice.getByText('Mehta Traders').isVisible() && await invoice.getByText('19AAACM1234F1Z5').isVisible(), 'Buyer block with billing name and GSTIN')
  check(await invoice.getByText('+91 98765 01234').isVisible() && await invoice.getByText('asha@example.com').isVisible(), 'Buyer mobile and email')
  check(await invoice.getByText(/Kivonex Pro, 12 months/).isVisible(), 'Line describes the plan')
  check(await invoice.getByText('CGST @ 9%').isVisible() && await invoice.getByText('SGST @ 9%').isVisible(), 'Same state: CGST + SGST at 9% each')
  check((await invoice.getByText(/IGST/).count()) === 0, 'No IGST within the state')
  const totals = (await invoice.locator('.invoice-totals').textContent()) ?? ''
  check(['₹8,473.73', '₹762.63', '₹762.64', '₹9,999.00'].every((value) => totals.includes(value)), 'Taxable value, CGST, SGST and total add up')
  check(await invoice.getByText('Rupees Nine Thousand Nine Hundred Ninety Nine Only').isVisible(), 'Amount in words')
  check(await invoice.getByText('pay_ui1').isVisible(), 'Razorpay payment id')
  await shot(page, '07-invoice')
  await page.evaluate(() => {
    window.__printed = false
    window.print = () => (window.__printed = true)
  })
  await page.getByRole('button', { name: 'Print / Save as PDF' }).click()
  check(await page.evaluate(() => window.__printed), 'Print / Save as PDF opens printing')
  await page.emulateMedia({ media: 'print' })
  const printed = await page.evaluate(() => ({
    sider: getComputedStyle(document.querySelector('.shell-sider')).display,
    topbar: getComputedStyle(document.querySelector('.topbar')).display,
    toolbar: getComputedStyle(document.querySelector('.invoice-toolbar')).display,
    invoice: getComputedStyle(document.querySelector('.invoice')).display
  }))
  check(printed.sider === 'none' && printed.topbar === 'none' && printed.toolbar === 'none' && printed.invoice !== 'none', 'Printing shows only the invoice')
  await page.emulateMedia({ media: 'screen' })

  // ---- overview with the plan
  console.log('Overview with Pro')
  await openPath(page, '/overview')
  await page.locator('.plan-name', { hasText: 'Pro' }).waitFor()
  check(await page.locator('.plan-name').getByText('Active').isVisible(), 'Pro is active')
  check((await page.getByTestId('valid-till').textContent()) === show(proValidTill), `Valid till ${show(proValidTill)} on the overview`)
  check(await page.getByRole('button', { name: 'Renew' }).isVisible(), 'Renew button')
  await shot(page, '08-overview-pro')

  // ---- a checkout closed, and a declined card
  console.log('Checkout closed or failed')
  await openPath(page, '/plans')
  check(await seen(page.getByText(`A plan you buy now is added after it ends: it starts on ${show(addDays(proValidTill, 1))}`)), 'Plans: a purchase is added after the current plan ends')
  await page.evaluate(() => (window.__rzpMode = 'dismiss'))
  await page.getByRole('button', { name: 'Renew Pro' }).click()
  check(await seen(page.getByText('Payment not completed')), 'Closing checkout says the payment was not completed')
  await page.evaluate(() => (window.__rzpMode = 'fail'))
  await page.getByRole('button', { name: 'Buy Basic' }).click()
  check(await seen(page.getByText(/did not go through: Your card was declined/)), 'A declined card says so')
  check(checkoutRequests === 1 && (await page.evaluate(() => window.__rzpScriptLoads)) === 1, 'Checkout script is loaded once')

  // ---- billing
  console.log('Billing')
  await openWithSkeleton(page, '/billing', '.table-skeleton .bone', 'Payments table')
  await page.getByText(invoiceNumber).waitFor()
  const rows = page.locator('.ant-table-tbody .ant-table-row')
  check((await rows.count()) === 3, 'Three payments listed')
  check((await rows.filter({ hasText: 'Paid' }).count()) === 1, 'One Paid')
  const closed = rows.filter({ hasText: 'Checkout closed' })
  check((await closed.count()) === 1 && /Failed|Not completed/.test((await closed.textContent()) ?? ''), 'The closed checkout shows as not completed')
  check((await rows.filter({ hasText: 'Your card was declined.' }).getByText('Failed').count()) === 1, 'The declined card shows as Failed')
  check(await rows.filter({ hasText: 'Paid' }).getByText('₹9,999').isVisible(), 'Amounts in rupees')
  check((await page.locator('.ant-table-tbody .row-actions-button').count()) === 1, 'Only the paid payment has a ⋮ menu')
  await shot(page, '09-billing')
  await page.getByRole('button', { name: `Actions for ${invoiceNumber}` }).click()
  await page.locator('.row-actions-menu:visible').getByText('View invoice').click()
  await page.getByRole('heading', { name: 'Tax invoice' }).waitFor()
  check(true, '⋮ › View invoice opens the invoice')

  // ---- phone width
  console.log('Phone width')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const hash of ['/invoices/' + page.url().split('/').pop(), '/overview', '/plans', '/billing', '/profile']) {
    await openPath(page, hash)
    await page.waitForTimeout(1200)
    check(await noSideScroll(page), `${hash.split('/')[1]}: no sideways scroll on a phone`)
  }
  await shot(page, '10-phone-profile')
  check(await page.getByRole('button', { name: 'Open menu' }).isVisible(), 'The menu opens from a button on a phone')
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await phone.goto(WEB)
  await phone.getByRole('heading', { name: 'Sign in' }).waitFor()
  check(await noSideScroll(phone), 'Sign-in has no sideways scroll on a phone')
  await phone.close()
  await page.setViewportSize({ width: 1440, height: 900 })

  // ---- sign out, and back in with the same number
  console.log('Sign out')
  await page.locator('.user-chip').click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  check(true, 'Signs out')
  await page.getByLabel('Mobile number').fill('9876501234')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByRole('heading', { name: 'Enter your code' }).waitFor()
  check((await page.getByLabel('Your name').count()) === 0, 'A known number is not asked for a name')
  await page.waitForFunction(() => document.activeElement === document.querySelector('.login-card .ant-otp input'))
  await page.keyboard.type(CODE)
  await page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 15000 })
  await page.locator('.plan-name', { hasText: 'Pro' }).waitFor()
  check(true, 'Signs back in to the same account')

  const visibleText = await page.evaluate(() => document.body.innerText)
  check(!/tally/i.test(visibleText), 'No other software is named')
  check((await page.locator('.ant-spin-spinning').count()) === 0, 'No spinners over the content')
  check(errors.length === 0, `No page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
} catch (error) {
  failures += 1
  console.error(error)
  const file = new URL('../ui-test-failure.png', import.meta.url).pathname
  await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: file, fullPage: true }).catch(() => undefined)
  console.error(`Screenshot: ${file}`)
} finally {
  await browser?.close()
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill()
    }
  }
}

console.log(failures ? `\n${failures} check(s) failed, ${passes} passed` : `\n${passes} checks passed\nACCOUNT_UI_OK`)
process.exit(failures ? 1 : 0)
