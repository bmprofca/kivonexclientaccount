import { useState } from 'react'
import { Alert, App, Button, InputNumber, Modal, Space, Table, Tabs, Tag } from 'antd'
import { ApiOutlined, WalletOutlined } from '@ant-design/icons'
import type { PageProps } from '../App'
import { createWalletTopup, errorMessage, failWalletTopup, loadWallet, loadWalletTransactions, loadWalletUsage, loadWalletUsageDetail, verifyWalletTopup, type WalletUsageEvent } from '../api'
import { ErrorNotice, PageHeader, Panel, StatCard } from '../components'
import { formatMoney, useLoad } from '../lib'
import { openCheckout } from '../razorpay'

const when = (value: string) => value ? new Date(value).toLocaleString('en-IN') : '—'

export function WalletPage(_props: PageProps) {
  const { message } = App.useApp()
  const wallet = useLoad(loadWallet)
  const transactions = useLoad(() => loadWalletTransactions().then((body) => body.transactions))
  const calls = useLoad(() => loadWalletUsage().then((body) => body.usage))
  const [amount, setAmount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [detail, setDetail] = useState<WalletUsageEvent | null>(null)

  async function topup(value: number) {
    setBusy(true); setFailure('')
    try {
      const created = await createWalletTopup(value)
      const outcome = await openCheckout(created.checkout, (reason) => void failWalletTopup(created.topup.id, reason).catch(() => undefined))
      if (outcome.type === 'paid') {
        await verifyWalletTopup(created.topup.id, { razorpayPaymentId: outcome.razorpayPaymentId, razorpaySignature: outcome.razorpaySignature })
        message.success('Wallet balance added'); await Promise.all([wallet.reload(), transactions.reload()])
      } else await failWalletTopup(created.topup.id, outcome.failure ?? 'Checkout closed').catch(() => undefined)
    } catch (error) { setFailure(errorMessage(error, 'Could not add wallet balance.')) }
    finally { setBusy(false) }
  }

  async function showCall(row: WalletUsageEvent) {
    try { setDetail((await loadWalletUsageDetail(row.id)).usage) }
    catch (error) { message.error(errorMessage(error, 'Could not load the provider response.')) }
  }

  const data = wallet.data
  const customAllowed = amount != null && data && amount * 100 >= data.topupSettings.minPaise && amount * 100 <= data.topupSettings.maxPaise
  return <>
    <PageHeader title="Wallet" description="Your account-wide Kivonex balance for paid APIs, AI and other services. Failed service calls are recorded but not charged." />
    <ErrorNotice error={wallet.error || transactions.error || calls.error}/>
    {failure && <Alert type="error" showIcon title={failure} closable onClose={() => setFailure('')} style={{ marginBottom: 20 }}/>} 
    <div className="stats-grid">
      <StatCard label="Wallet balance" value={formatMoney(data?.wallet.balancePaise ?? 0)} icon={<WalletOutlined/>} tone="green" loading={wallet.loading && !data} foot="Credits never expire"/>
      <StatCard label="Available" value={formatMoney(data?.wallet.availablePaise ?? 0)} icon={<ApiOutlined/>} tone="indigo" loading={wallet.loading && !data} foot={data?.wallet.reservedPaise ? `${formatMoney(data.wallet.reservedPaise)} temporarily reserved` : 'No pending service holds'}/>
    </div>
    <Panel title="Add wallet balance" description="Payments are handled securely by Razorpay.">
      <Space wrap>
        {(data?.topupSettings.presetsPaise ?? []).map((value) => <Button key={value} disabled={busy} onClick={() => void topup(value)}>{formatMoney(value)}</Button>)}
        <InputNumber prefix="₹" min={(data?.topupSettings.minPaise ?? 10000) / 100} max={(data?.topupSettings.maxPaise ?? 10000000) / 100} precision={2} value={amount} onChange={setAmount} placeholder="Custom amount"/>
        <Button type="primary" loading={busy} disabled={!customAllowed} onClick={() => amount && void topup(Math.round(amount * 100))}>Add balance</Button>
      </Space>
      {data && <p className="fine-print">Custom top-ups: {formatMoney(data.topupSettings.minPaise)} to {formatMoney(data.topupSettings.maxPaise)}.</p>}
    </Panel>
    <Panel title="Prices" description="Your effective price is captured when a call starts; later price changes do not change history." flush>
      <Table rowKey="code" dataSource={data?.prices ?? []} loading={wallet.loading} pagination={{ pageSize: 8 }} columns={[
        { title: 'Service', render: (_v, row) => <><strong>{row.service === 'whitebooks' ? 'WhiteBooks' : row.service}</strong><br/><span className="muted-text">{row.category || row.group}</span></> },
        { title: 'Operation', dataIndex: 'label' },
        { title: 'Price', render: (_v, row) => row.effectivePricePaise == null ? <Tag color="error">Not configured</Tag> : row.effectivePricePaise === 0 ? <Tag color="success">Free</Tag> : formatMoney(row.effectivePricePaise) },
        { title: 'Pricing', render: (_v, row) => row.source === 'account' ? 'Your custom price' : row.source === 'global' ? 'Standard price' : 'Unavailable' }
      ]}/>
    </Panel>
    <Panel title="History" flush>
      <Tabs items={[
        { key: 'transactions', label: 'Wallet transactions', children: <Table rowKey="id" dataSource={transactions.data ?? []} loading={transactions.loading} pagination={{ pageSize: 10 }} columns={[{ title: 'Date', render: (_v,row) => when(row.createdAt) }, { title: 'Type', dataIndex: 'type' }, { title: 'Direction', render: (_v,row) => <Tag color={row.direction === 'credit' ? 'success' : 'default'}>{row.direction}</Tag> }, { title: 'Amount', render: (_v,row) => formatMoney(row.amountPaise) }, { title: 'Balance after', render: (_v,row) => formatMoney(row.balanceAfterPaise) }, { title: 'Details', render: (_v,row) => row.operation || row.note || '—' }]}/> },
        { key: 'calls', label: 'Service usage', children: <Table rowKey="id" dataSource={calls.data ?? []} loading={calls.loading} pagination={{ pageSize: 10 }} onRow={(row) => ({ onClick: () => void showCall(row), style: { cursor: 'pointer' } })} columns={[{ title: 'Date', render: (_v,row) => when(row.createdAt) }, { title: 'Service', render: (_v,row) => data?.prices.find((price) => price.code === row.operation)?.service === 'whitebooks' ? 'WhiteBooks' : data?.prices.find((price) => price.code === row.operation)?.service || 'Service' }, { title: 'Operation', dataIndex: 'operation' }, { title: 'Status', render: (_v,row) => <Tag color={row.status === 'charged' ? 'success' : row.status === 'failed' ? 'error' : 'warning'}>{row.pricePaise === 0 && row.status === 'charged' ? 'free' : row.status}</Tag> }, { title: 'Fee', render: (_v,row) => formatMoney(row.pricePaise) }, { title: 'Provider request', dataIndex: 'providerRequestId' }]}/> }
      ]}/>
    </Panel>
    <Modal open={Boolean(detail)} onCancel={() => setDetail(null)} footer={null} width={800} title="WhiteBooks response">
      {detail && <><Space wrap><Tag>{detail.operation}</Tag><Tag color={detail.status === 'charged' ? 'success' : 'error'}>{detail.status}</Tag><span>{when(detail.createdAt)}</span></Space>{detail.errorMessage && <Alert type="error" showIcon title={detail.errorMessage} style={{ marginTop: 16 }}/>}<pre style={{ marginTop: 16, maxHeight: 480, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8 }}>{typeof detail.response === 'string' ? detail.response : JSON.stringify(detail.response, null, 2)}</pre></>}
    </Modal>
  </>
}
