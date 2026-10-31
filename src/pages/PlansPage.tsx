import { Link } from 'react-router-dom'
import { useState } from 'react'
import { CheckCircleFilled, CheckOutlined, FileTextOutlined } from '@ant-design/icons'
import { Alert, App, Button, Modal, Select, Tag } from 'antd'
import type { PageProps } from '../App'
import { api, createOrder, errorMessage, failPayment, verifyPayment, type CurrentSubscription, type Payment, type Plan } from '../api'
import { Bone, ErrorNotice, PageHeader } from '../components'
import { addDays, formatDate, formatMoney, months, todayIso, useLoad } from '../lib'
import { openCheckout } from '../razorpay'

/** When a plan bought today starts, the same way the API counts it: today, or the day after the running plan ends. */
function nextStart(subscription: CurrentSubscription | null): string {
  const today = todayIso()
  return subscription && subscription.validUntil >= today ? addDays(subscription.validUntil, 1) : today
}

function PlanCardSkeleton() {
  return (
    <section className="panel plan-card" aria-busy>
      <Bone width={90} height={16} />
      <Bone width="85%" height={11} style={{ marginTop: 12 }} />
      <Bone width={130} height={32} style={{ marginTop: 22 }} />
      <Bone width={100} height={11} style={{ marginTop: 10 }} />
      <div className="bone-lines" style={{ marginTop: 22 }}>
        <Bone width="60%" height={11} />
        <Bone width="50%" height={11} />
      </div>
      <Bone height={40} style={{ marginTop: 24, borderRadius: 8 }} />
    </section>
  )
}

/** "Payment received": the invoice number and the period the payment bought, with a link to the invoice. */
function PaidDialog({ payment, onClose, onInvoice }: { payment: Payment | null; onClose: () => void; onInvoice: (payment: Payment) => void }) {
  return (
    <Modal
      open={Boolean(payment)}
      onCancel={onClose}
      centered
      width={460}
      footer={
        payment && [
          <Button key="done" onClick={onClose}>
            Done
          </Button>,
          <Button key="invoice" type="primary" icon={<FileTextOutlined />} onClick={() => onInvoice(payment)}>
            View invoice
          </Button>
        ]
      }
    >
      {payment && (
        <div className="paid-result">
          <CheckCircleFilled className="paid-icon" />
          <h2>Payment received</h2>
          <p>
            {payment.planKind === 'renewal'
              ? `Thank you. Your ${payment.planName} renewal is paid.`
              : `Thank you. Your account is activated with ${payment.planName} and ready to use in Kivonex Accounts. Renew when the included period ends.`}
          </p>
          <dl className="paid-facts">
            <div>
              <dt>Invoice number</dt>
              <dd className="paid-invoice">{payment.invoiceNumber}</dd>
            </div>
            <div>
              <dt>Amount paid</dt>
              <dd>{formatMoney(payment.amountPaise)}</dd>
            </div>
            <div>
              <dt>Valid from</dt>
              <dd>{formatDate(payment.validFrom)}</dd>
            </div>
            <div>
              <dt>Valid till</dt>
              <dd className="paid-valid-till">{formatDate(payment.validUntil)}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  )
}

/**
 * Plans: what can be bought, with prices (GST included). Buying opens Razorpay Checkout; a plan bought while one is
 * running starts the day after it ends.
 */
export function PlansPage({ go, me }: PageProps) {
  const { message } = App.useApp()
  // Only what this account can buy: Activation until it has one, Renewal after that.
  const offer = useLoad(() => api<{ activated: boolean; maxRenewalYears?: number; plans: Plan[] }>('/v1/account/plans'))
  /** Years of Renewal to buy at once: the yearly price times the years. */
  const [years, setYears] = useState(1)
  const maxYears = offer.data?.maxRenewalYears ?? 5
  const plans = { ...offer, data: offer.data?.plans }
  const activated = offer.data?.activated ?? false
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [paid, setPaid] = useState<Payment | null>(null)
  const subscription = me.data?.subscription ?? null
  const startsOn = nextStart(subscription)
  const running = subscription && subscription.validUntil >= todayIso()

  async function buy(plan: Plan) {
    setBuying(plan.id)
    setBuyError(null)
    try {
      const { payment, checkout } = await createOrder(plan.id, plan.kind === 'renewal' ? years : 1)
      const outcome = await openCheckout(checkout, (reason) => void failPayment(payment.id, reason).catch(() => undefined))
      if (outcome.type === 'paid') {
        const result = await verifyPayment(payment.id, { razorpayPaymentId: outcome.razorpayPaymentId, razorpaySignature: outcome.razorpaySignature })
        setPaid(result.payment)
        void me.reload()
        // After the Activation the page offers Renewal.
        void offer.reload()
      } else if (outcome.failure) {
        setBuyError(`The payment did not go through: ${outcome.failure} You can try again.`)
      } else {
        await failPayment(payment.id, 'Checkout closed').catch(() => undefined)
        message.info('Payment not completed. You can buy the plan whenever you are ready.')
      }
    } catch (err) {
      setBuyError(errorMessage(err, 'Could not start the payment. Please try again.'))
    } finally {
      setBuying(null)
    }
  }

  return (
    <>
      <PageHeader
        title={offer.data ? (activated ? 'Renewal' : 'Activation') : 'Plans'}
        description={
          offer.data && activated
            ? 'Your account is activated for life. Renew to keep the cloud services (sync, AI reading, GST APIs, imports, remote access) running. Prices include GST; your GST invoice is ready as soon as you pay.'
            : 'Buy Activation once: the software is unlocked for life, with the first year of renewal included free. Prices include GST; your GST invoice is ready as soon as you pay.'
        }
      />
      <ErrorNotice error={plans.error} />
      {buyError && <Alert type="error" showIcon title={buyError} closable onClose={() => setBuyError(null)} style={{ marginBottom: 20 }} />}
      {running && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          title={`Your ${subscription.planName} plan is valid till ${formatDate(subscription.validUntil)}.`}
          description={`A plan you buy now is added after it ends: it starts on ${formatDate(startsOn)}, so you lose no days.`}
        />
      )}

      <div className="plans-grid">
        {!plans.data
          ? [0, 1].map((index) => <PlanCardSkeleton key={index} />)
          : plans.data.map((plan) => {
              const current = subscription?.plan === plan.code && subscription.state !== 'expired'
              const renewal = plan.kind === 'renewal'
              const count = renewal ? years : 1
              const action = renewal ? `Renew for ${count} ${count === 1 ? 'year' : 'years'}` : 'Buy Activation'
              return (
                <section key={plan.id} className={current ? 'panel plan-card current' : 'panel plan-card'}>
                  <div className="plan-card-head">
                    <h3>{plan.name}</h3>
                    <Tag color={plan.kind === 'renewal' ? 'blue' : 'green'} variant="filled">
                      {plan.kind === 'renewal' ? 'Renewal' : 'Activation'}
                    </Tag>
                    {current && (
                      <Tag color="purple" variant="filled">
                        Your plan
                      </Tag>
                    )}
                  </div>
                  {plan.description && <p className="plan-card-desc">{plan.description}</p>}
                  {plan.discountPercent > 0 && <div className="portal-plan-offer"><s>{formatMoney(plan.mrpPaise)}</s><Tag color="green" variant="filled">{plan.discountPercent}% off</Tag></div>}
                  <div className="plan-price">
                    <span className="num">{formatMoney(plan.pricePaise)}</span>
                    <small>{renewal ? 'a year' : 'one time'}</small>
                  </div>
                  {renewal && (
                    <label className="portal-years">
                      <span>Years</span>
                      <Select
                        value={years}
                        onChange={setYears}
                        disabled={Boolean(buying)}
                        aria-label="Years of renewal"
                        options={Array.from({ length: maxYears }, (_, index) => ({ value: index + 1, label: `${index + 1} ${index === 0 ? 'year' : 'years'}` }))}
                        style={{ width: 120 }}
                      />
                    </label>
                  )}
                  <dl className="portal-price-breakdown">
                    {renewal && count > 1 && <div><dt>{formatMoney(plan.pricePaise)} × {count} years</dt><dd>{formatMoney(plan.pricePaise * count)}</dd></div>}
                    {plan.discountPercent > 0 && <div><dt>Discount</dt><dd>− {formatMoney(plan.discountPaise * count)}</dd></div>}
                    <div><dt>Taxable value</dt><dd>{formatMoney(Math.round((plan.pricePaise * count * 100) / (100 + plan.gstRate)))}</dd></div>
                    <div><dt>GST ({plan.gstRate}%)</dt><dd>{formatMoney(plan.pricePaise * count - Math.round((plan.pricePaise * count * 100) / (100 + plan.gstRate)))}</dd></div>
                    {renewal && <div className="portal-price-total"><dt>Total to pay</dt><dd>{formatMoney(plan.pricePaise * count)}</dd></div>}
                  </dl>
                  <ul className="plan-points">
                    {plan.kind !== 'renewal' && (
                      <li>
                        <CheckOutlined /> {months(plan.durationMonths)} of renewal included free
                      </li>
                    )}
                    <li>
                      <CheckOutlined /> {plan.kind === 'renewal' ? 'Cloud sync, AI reading, GST APIs and imports' : 'Lifetime use of the software'}
                    </li>
                    <li>
                      <CheckOutlined /> Signed in on one computer at a time
                    </li>
                    <li>
                      <CheckOutlined /> Final price includes GST
                    </li>
                    <li>
                      <CheckOutlined /> Starts {startsOn === todayIso() ? 'today' : `on ${formatDate(startsOn)}`}
                    </li>
                  </ul>
                  <Button
                    type="primary"
                    size="large"
                    block
                    loading={buying === plan.id}
                    disabled={Boolean(buying) && buying !== plan.id}
                    aria-label={`${action} ${plan.name}`}
                    onClick={() => void buy(plan)}
                  >
                    {action}
                  </Button>
                </section>
              )
            })}
      </div>
      {plans.data && plans.data.length === 0 && <div className="panel panel-body muted-text">No plans are on sale right now. Please check again later.</div>}
      <p className="fine-print">
        Payments are handled by Razorpay. Your card and UPI details go to Razorpay only, never to Kivonex. Add your GSTIN and billing address in{' '}
        <Link to="/profile">Profile</Link> before you pay to have them on the invoice.
      </p>

      <PaidDialog payment={paid} onClose={() => setPaid(null)} onInvoice={(payment) => go('invoices', payment.id)} />
    </>
  )
}
