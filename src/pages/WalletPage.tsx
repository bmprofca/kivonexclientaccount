import { useState } from 'react'
import { Alert, App, Button, Descriptions, InputNumber, Modal, Space, Table, Tabs, Tag, Tooltip } from 'antd'
import { ApiOutlined, InfoCircleOutlined, WalletOutlined } from '@ant-design/icons'
import type { PageProps } from '../App'
import { createWalletTopup, errorMessage, failWalletTopup, loadWallet, loadWalletTransactionDetail, loadWalletTransactions, loadWalletUsage, loadWalletUsageDetail, verifyWalletTopup, type WalletTransaction, type WalletUsageEvent } from '../api'
import { ErrorNotice, PageHeader, Panel, StatCard } from '../components'
import { formatMoney, useLoad } from '../lib'
import { openCheckout } from '../razorpay'
import { prettyWalletJson, walletLabel } from '../walletFormat'

const when = (value: string) => value ? new Date(value).toLocaleString('en-IN') : '—'
const codeStyle = { background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const
const detailModalBody = { height: 560, overflowY: 'auto', overflowX: 'hidden' } as const

export function WalletPage(_props: PageProps) {
  const { message } = App.useApp()
  const wallet = useLoad(loadWallet)
  const transactions = useLoad(() => loadWalletTransactions().then((body) => body.transactions))
  const calls = useLoad(() => loadWalletUsage().then((body) => body.usage))
  const [amount, setAmount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [detail, setDetail] = useState<WalletUsageEvent | null>(null)
  const [transactionDetail, setTransactionDetail] = useState<WalletTransaction | null>(null)

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
    try { setTransactionDetail(null); setDetail((await loadWalletUsageDetail(row.id)).usage) }
    catch (error) { message.error(errorMessage(error, 'Could not load the API response.')) }
  }

  async function showTransaction(row: WalletTransaction) {
    try { const result = await loadWalletTransactionDetail(row.id); setTransactionDetail(result.transaction); setDetail(result.usage) }
    catch (error) { message.error(errorMessage(error, 'Could not load the wallet transaction.')) }
  }

  const infoButton = (row: WalletUsageEvent) => <Tooltip title="View full API details"><Button type="text" shape="circle" aria-label={`View details for ${row.operation}`} icon={<InfoCircleOutlined/>} onClick={(event) => { event.stopPropagation(); void showCall(row) }}/></Tooltip>

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
        { title: 'Category', render: (_v, row) => row.category || row.group },
        { title: 'Operation', dataIndex: 'label' },
        { title: 'Price', render: (_v, row) => row.effectivePricePaise == null ? <Tag color="error">Not configured</Tag> : row.effectivePricePaise === 0 ? <Tag color="success">Free</Tag> : formatMoney(row.effectivePricePaise) },
        { title: 'Pricing', render: (_v, row) => row.source === 'account' ? 'Your custom price' : row.source === 'global' ? 'Standard price' : 'Unavailable' }
      ]}/>
    </Panel>
    <Panel title="History" flush>
      <Tabs items={[
        { key: 'transactions', label: 'Wallet transactions', children: <Table rowKey="id" dataSource={transactions.data ?? []} loading={transactions.loading} pagination={{ pageSize: 10 }} columns={[{ title: 'Date', render: (_v,row) => when(row.createdAt) }, { title: 'Type', render: (_v,row) => walletLabel(row.type) }, { title: 'Direction', render: (_v,row) => <Tag color={row.direction === 'credit' ? 'success' : 'default'}>{row.direction}</Tag> }, { title: 'Amount', render: (_v,row) => formatMoney(row.amountPaise) }, { title: 'Balance after', render: (_v,row) => formatMoney(row.balanceAfterPaise) }, { title: 'Details', render: (_v,row) => row.operation || row.note ? walletLabel(row.operation || row.note) : '—' }, { title: '', width: 56, align: 'center', render: (_v,row) => <Tooltip title="View full details"><Button type="text" shape="circle" aria-label={`View details for ${row.type}`} icon={<InfoCircleOutlined/>} onClick={() => void showTransaction(row)}/></Tooltip> }]}/> },
        { key: 'calls', label: 'Service usage', children: <Table rowKey="id" dataSource={calls.data ?? []} loading={calls.loading} pagination={{ pageSize: 10 }} columns={[{ title: 'Date', render: (_v,row) => when(row.createdAt) }, { title: 'Operation', render: (_v,row) => row.label || row.operation }, { title: 'Status', render: (_v,row) => <Tag color={row.status === 'charged' ? 'success' : row.status === 'failed' ? 'error' : 'warning'}>{row.pricePaise === 0 && row.status === 'charged' ? 'free' : row.status}</Tag> }, { title: 'Fee', render: (_v,row) => formatMoney(row.pricePaise) }, { title: '', width: 56, align: 'center', render: (_v,row) => infoButton(row) }]}/> }
      ]}/>
    </Panel>
    <Modal open={Boolean(detail || transactionDetail)} onCancel={() => { setDetail(null); setTransactionDetail(null) }} footer={<Button onClick={() => { setDetail(null); setTransactionDetail(null) }}>Close</Button>} width={900} styles={{ body: detailModalBody }} title={transactionDetail ? 'Wallet transaction details' : 'API usage details'}>
      {transactionDetail && <Descriptions title="Transaction" bordered size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }} items={[{ key: 'type', label: 'Type', children: walletLabel(transactionDetail.type) }, { key: 'direction', label: 'Direction', children: transactionDetail.direction.toUpperCase() }, { key: 'amount', label: 'Amount', children: formatMoney(transactionDetail.amountPaise) }, { key: 'balance', label: 'Balance after', children: formatMoney(transactionDetail.balanceAfterPaise) }, { key: 'date', label: 'Date', children: when(transactionDetail.createdAt) }, { key: 'details', label: 'Details', children: transactionDetail.operation || transactionDetail.note ? walletLabel(transactionDetail.operation || transactionDetail.note) : '—' }]}/>} {detail && <><Descriptions title={transactionDetail ? 'API usage' : undefined} bordered size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }} items={[
        { key: 'operation', label: 'Operation', children: detail.label || detail.operation }, { key: 'gstin', label: 'GSTIN', children: detail.gstin || '—' },
        { key: 'status', label: 'Status', children: <Tag color={detail.status === 'charged' ? 'success' : detail.status === 'failed' ? 'error' : 'warning'}>{detail.status}</Tag> }, { key: 'fee', label: 'Fee', children: formatMoney(detail.pricePaise) },
        { key: 'created', label: 'Started', children: when(detail.createdAt) }, { key: 'completed', label: 'Completed', children: detail.completedAt ? when(detail.completedAt) : '—' },
        { key: 'requestId', label: 'Request ID', children: detail.providerRequestId || '—' }, { key: 'http', label: 'HTTP status', children: detail.httpStatus ?? '—' }
      ]}/>{detail.errorMessage && <Alert type="error" showIcon title={detail.errorCode || 'API error'} description={detail.errorMessage} style={{ marginBottom: 16 }}/>}<strong>Request</strong><pre style={codeStyle}>{prettyWalletJson(detail.request)}</pre><strong>Response</strong><pre style={codeStyle}>{prettyWalletJson(detail.response)}</pre></>}
    </Modal>
  </>
}
