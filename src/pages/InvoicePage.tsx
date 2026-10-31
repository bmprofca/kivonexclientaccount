import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { PageProps } from '../App'
import { api, type Invoice } from '../api'
import { Bone, ErrorNotice } from '../components'
import { amountInWords, formatDate, formatMoney, useLoad } from '../lib'

/** "9" for 9, "2.5" for 2.5: a GST rate as printed. */
function rate(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** Paise as printed on the invoice: always with two decimals, so the column lines up. */
const money = (paise: number) => formatMoney(paise, { paise: true })

function InvoiceSkeleton() {
  return (
    <div className="invoice" aria-busy>
      <div className="invoice-head">
        <div className="bone-lines" style={{ maxWidth: 260 }}>
          <Bone width={160} height={18} />
          <Bone width="90%" height={11} />
          <Bone width="70%" height={11} />
        </div>
        <div className="bone-lines" style={{ maxWidth: 200, justifyItems: 'end' }}>
          <Bone width={140} height={20} />
          <Bone width={160} height={11} />
          <Bone width={120} height={11} />
        </div>
      </div>
      <div className="bone-lines" style={{ marginTop: 32, maxWidth: 300 }}>
        <Bone width={80} height={10} />
        <Bone width={180} height={14} />
        <Bone width="80%" height={11} />
      </div>
      <Bone height={120} style={{ marginTop: 32, borderRadius: 8 }} />
    </div>
  )
}

function Party({ label, name, lines }: { label: string; name: string; lines: Array<[string, string]> }) {
  return (
    <div className="invoice-party">
      <span className="invoice-label">{label}</span>
      <strong>{name}</strong>
      {lines
        .filter(([, value]) => value)
        .map(([key, value]) => (
          <span key={key}>
            {key && <b>{key}: </b>}
            {value}
          </span>
        ))}
    </div>
  )
}

/**
 * A paid payment's tax invoice, laid out to print on A4 (Print / Save as PDF hides the rest of the panel). The
 * price includes GST: it is split into the taxable value and CGST + SGST (same state as the seller) or IGST.
 */
export function InvoicePage({ go, sub }: PageProps) {
  const { data: invoice, error } = useLoad(
    () => api<{ invoice: Invoice }>(`/v1/account/payments/${encodeURIComponent(sub)}/invoice`).then((body) => body.invoice),
    [sub]
  )
  const local = invoice ? invoice.igstPaise === 0 : true

  return (
    <>
      <div className="invoice-toolbar no-print">
        <Button icon={<ArrowLeftOutlined />} onClick={() => go('billing')}>
          Billing
        </Button>
        <Button type="primary" icon={<PrinterOutlined />} disabled={!invoice} onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>
      <ErrorNotice error={error} />
      {!invoice ? (
        !error && <InvoiceSkeleton />
      ) : (
        <article className="invoice">
          <header className="invoice-head">
            <div className="invoice-seller">
              <span className="invoice-mark">K</span>
              <div>
                <strong>{invoice.seller.name}</strong>
                {invoice.seller.address && <span>{invoice.seller.address}</span>}
                {invoice.seller.state && <span>{invoice.seller.state}</span>}
                {invoice.seller.gstin && (
                  <span>
                    <b>GSTIN: </b>
                    {invoice.seller.gstin}
                  </span>
                )}
              </div>
            </div>
            <div className="invoice-title">
              <h1>Tax invoice</h1>
              <dl>
                <div>
                  <dt>Invoice no.</dt>
                  <dd className="invoice-number">{invoice.number}</dd>
                </div>
                <div>
                  <dt>Invoice date</dt>
                  <dd>{formatDate(invoice.date)}</dd>
                </div>
                <div>
                  <dt>Place of supply</dt>
                  <dd>{invoice.buyer.state || invoice.seller.state}</dd>
                </div>
              </dl>
            </div>
          </header>

          <Party
            label="Billed to"
            name={invoice.buyer.name}
            lines={[
              ['GSTIN', invoice.buyer.gstin],
              ['', invoice.buyer.address],
              ['State', invoice.buyer.state],
              ['Mobile', invoice.buyer.mobile],
              ['Email', invoice.buyer.email]
            ]}
          />

          <table className="invoice-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Description</th>
                <th className="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>{invoice.line.description}</td>
                <td className="amount num">{money(invoice.line.amountPaise)}</td>
              </tr>
            </tbody>
          </table>

          <div className="invoice-bottom">
            <div className="invoice-words">
              <span className="invoice-label">Amount in words</span>
              <strong>{amountInWords(invoice.totalPaise)}</strong>
              <p>The price includes GST at {rate(invoice.gstRate)}%.</p>
            </div>
            <table className="invoice-totals">
              <tbody>
                {invoice.discountPaise > 0 && (
                  <>
                    <tr>
                      <th>MRP</th>
                      <td className="num">{money(invoice.mrpPaise)}</td>
                    </tr>
                    <tr>
                      <th>Discount</th>
                      <td className="num">− {money(invoice.discountPaise)}</td>
                    </tr>
                  </>
                )}
                <tr>
                  <th>Taxable value</th>
                  <td className="num">{money(invoice.taxablePaise)}</td>
                </tr>
                {local ? (
                  <>
                    <tr>
                      <th>CGST @ {rate(invoice.gstRate / 2)}%</th>
                      <td className="num">{money(invoice.cgstPaise)}</td>
                    </tr>
                    <tr>
                      <th>SGST @ {rate(invoice.gstRate / 2)}%</th>
                      <td className="num">{money(invoice.sgstPaise)}</td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th>IGST @ {rate(invoice.gstRate)}%</th>
                    <td className="num">{money(invoice.igstPaise)}</td>
                  </tr>
                )}
                <tr className="invoice-total">
                  <th>Total</th>
                  <td className="num">{money(invoice.totalPaise)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <footer className="invoice-foot">
            <span>
              Paid online through Razorpay on {formatDate(invoice.payment.paidAt)}. Payment ID: <span className="mono">{invoice.payment.razorpayPaymentId}</span>
            </span>
            <span>This is a computer-generated invoice and needs no signature.</span>
          </footer>
        </article>
      )}
    </>
  )
}
