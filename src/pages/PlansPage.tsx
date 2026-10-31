import { Link } from 'react-router-dom'
import { useState } from 'react'
import { CheckCircleFilled, CheckOutlined, FileTextOutlined } from '@ant-design/icons'
import { Alert, App, Button, Modal, Tag } from 'antd'
import type { PageProps } from '../App'
import { api, createOrder, errorMessage, failPayment, verifyPayment, type CurrentSubscription, type Payment, type Plan } from '../api'
import { Bone, ErrorNotice, PageHeader } from '../components'
import { addDays, computers, formatDate, formatMoney, months, todayIso, useLoad } from '../lib'
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
          <p>Thank you. Your {payment.planName} plan is paid and ready to use in Kivonex Accounts.</p>
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
  const plans = useLoad(() => api<{ plans: Plan[] }>('/v1/account/plans').then((body) => body.plans))
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
      const { payment, checkout } = await createOrder(plan.id)
      const outcome = await openCheckout(checkout, (reason) => void failPayment(payment.id, reason).catch(() => undefined))
      if (outcome.type === 'paid') {
        const result = await verifyPayment(payment.id, { razorpayPaymentId: outcome.razorpayPaymentId, razorpaySignature: outcome.razorpaySignature })
        setPaid(result.payment)
        void me.reload()
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
      <PageHeader title="Plans" description="Prices include GST. Pay online by UPI, card or net banking; your GST invoice is ready as soon as you pay." />
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
              const action = current ? 'Renew' : 'Buy'
              return (
                <section key={plan.id} className={current ? 'panel plan-card current' : 'panel plan-card'}>
                  <div className="plan-card-head">
                    <h3>{plan.name}</h3>
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
                    <small>for {months(plan.durationMonths)}</small>
                  </div>
                  <dl className="portal-price-breakdown">
                    {plan.discountPercent > 0 && <div><dt>Discount</dt><dd>− {formatMoney(plan.discountPaise)}</dd></div>}
                    <div><dt>Taxable value</dt><dd>{formatMoney(plan.taxablePaise)}</dd></div>
                    <div><dt>GST ({plan.gstRate}%)</dt><dd>{formatMoney(plan.gstPaise)}</dd></div>
                  </dl>
                  <ul className="plan-points">
                    <li>
                      <CheckOutlined /> {computers(plan.devices)} at a time
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
