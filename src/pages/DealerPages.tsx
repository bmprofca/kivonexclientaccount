import { useState } from 'react'
import { CheckCircleFilled, HistoryOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined, UserAddOutlined } from '@ant-design/icons'
import { Alert, App, Button, Form, Input, Select, Tag } from 'antd'
import type { PageProps } from '../App'
import { activateForCustomer, errorMessage, loadDealer, lookupForDealer, renewForCustomer, type DealerAccount, type DealerEntry } from '../api'
import { DataTable, ErrorNotice, PageHeader, Panel, StatCard } from '../components'
import { formatDate, formatDateTime, months, useLoad } from '../lib'

/**
 * Dealer pages (owner 2026-10-31), shown only to an account ADMIN made a dealer. Its Activation credits activate new
 * accounts for life (one each); its Renewal credits renew activated accounts (one a year). Kivonex gives the credits
 * by hand after a deal made outside the system, so nothing here is paid for.
 */

const REASON: Record<DealerEntry['reason'], string> = { credit: 'Credits added by Kivonex', debit: 'Credits taken back by Kivonex', activation: 'Activation given', renewal: 'Renewal given' }

function Balances({ loading, activation, renewal }: { loading: boolean; activation: number; renewal: number }) {
  return (
    <div className="stats-grid">
      <StatCard label="Activation credits" value={activation} icon={<UserAddOutlined />} tone="green" loading={loading} foot="One activates a new account for life" />
      <StatCard label="Renewal credits" value={renewal} icon={<ReloadOutlined />} tone="indigo" loading={loading} foot="One renews an account for a year" />
    </div>
  )
}

/** Dealer › Credits: both balances and every change to them. */
export function DealerPage({ go }: PageProps) {
  const dealer = useLoad(loadDealer)
  const data = dealer.data
  return (
    <>
      <PageHeader
        title="Dealer"
        description="Activate new customers and renew existing ones with the credits Kivonex gives you. Contact Kivonex for more credits."
        actions={
          <>
            <Button icon={<UserAddOutlined />} onClick={() => go('dealer-activate')}>
              Activate an account
            </Button>
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => go('dealer-renew')}>
              Renew an account
            </Button>
          </>
        }
      />
      <ErrorNotice error={dealer.error} />
      <Balances loading={dealer.loading && !data} activation={data?.balances.activation ?? 0} renewal={data?.balances.renewal ?? 0} />
      <Panel title="History" description="Credits added or taken back by Kivonex, and each activation and renewal you gave." flush>
        <DataTable<DealerEntry>
          rowKey="id"
          loading={dealer.loading}
          dataSource={data?.entries ?? []}
          pagination={(data?.entries.length ?? 0) > 15 ? { pageSize: 15, showSizeChanger: false } : false}
          locale={{ emptyText: 'Nothing yet. Credits from Kivonex will show here.' }}
          scroll={{ x: 760 }}
          columns={[
            { title: 'When', width: 170, render: (_v, row) => formatDateTime(row.createdAt) },
            { title: 'Credits', width: 120, render: (_v, row) => <Tag color={row.kind === 'renewal' ? 'blue' : 'green'} variant="filled">{row.kind === 'renewal' ? 'Renewal' : 'Activation'}</Tag> },
            {
              title: 'What',
              render: (_v, row) =>
                row.target ? (
                  <span>
                    {REASON[row.reason]} · {row.target.name}
                    <small className="muted-text" style={{ display: 'block' }}>
                      {row.target.mobile}
                      {row.years ? ` · ${row.years} ${row.years === 1 ? 'year' : 'years'}` : ''}
                    </small>
                  </span>
                ) : (
                  <span>
                    {REASON[row.reason]}
                    {row.note && <small className="muted-text" style={{ display: 'block' }}>{row.note}</small>}
                  </span>
                )
            },
            { title: 'Change', width: 90, align: 'right', render: (_v, row) => <span className="num" style={{ color: row.units > 0 ? '#087a3e' : '#b42318', fontWeight: 600 }}>{row.units > 0 ? `+${row.units}` : row.units}</span> },
            { title: 'Left', width: 70, align: 'right', render: (_v, row) => <span className="num">{row.balanceAfter}</span> }
          ]}
        />
      </Panel>
    </>
  )
}

/** The account found for a number, as a dealer is shown it. */
function AccountCard({ account }: { account: DealerAccount }) {
  return (
    <div className="dealer-account">
      <div>
        <strong>{account.name}</strong>
        {account.tradeName && <span className="muted-text"> · {account.tradeName}</span>}
        <small className="muted-text" style={{ display: 'block' }}>{account.mobile}</small>
      </div>
      {account.disabled ? (
        <Tag color="red" variant="filled">Disabled</Tag>
      ) : account.activated ? (
        <Tag color="green" variant="filled">
          Activated{account.renewalUntil ? ` · renewal till ${formatDate(account.renewalUntil)}` : ''}
        </Tag>
      ) : (
        <Tag variant="filled">Not activated</Tag>
      )}
    </div>
  )
}

/** Looks a number up; `checked` is the number it was looked up for, so a changed number is looked up again. */
function useLookup() {
  const [checked, setChecked] = useState('')
  const [found, setFound] = useState<DealerAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function lookup(mobile: string) {
    setBusy(true)
    setError(null)
    try {
      setFound((await lookupForDealer(mobile)).account)
      setChecked(mobile)
    } catch (err) {
      setError(errorMessage(err, 'Could not look the number up.'))
    } finally {
      setBusy(false)
    }
  }
  const reset = () => {
    setChecked('')
    setFound(null)
  }
  return { checked, found, busy, error, lookup, reset, setFound }
}

/** Dealer › Activate: a new number gets an account and an activation; one Activation credit. */
export function DealerActivatePage({ go }: PageProps) {
  const { message } = App.useApp()
  const dealer = useLoad(loadDealer)
  const look = useLookup()
  const [mobile, setMobile] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<DealerAccount | null>(null)
  const [form] = Form.useForm<{ name: string; tradeName: string }>()
  const credits = dealer.data?.balances.activation ?? 0
  const looked = look.checked !== '' && look.checked === mobile.trim()
  const newAccount = looked && !look.found

  async function activate(values: { name?: string; tradeName?: string }) {
    setSaving(true)
    setFailure(null)
    try {
      const result = await activateForCustomer({ mobile, name: values.name ?? '', tradeName: values.tradeName ?? '' })
      setDone(result.account)
      message.success(`${result.account.name} is activated`)
      look.reset()
      setMobile('')
      form.resetFields()
      await dealer.reload()
    } catch (err) {
      setFailure(errorMessage(err, 'Could not activate the account.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Activate an account" description={`Unlocks Kivonex for life on a customer's account, with ${months(dealer.data?.activationMonths ?? 12)} of renewal included. Uses one Activation credit.`} />
      <ErrorNotice error={dealer.error} />
      <Balances loading={dealer.loading && !dealer.data} activation={credits} renewal={dealer.data?.balances.renewal ?? 0} />
      {done && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleFilled />}
          style={{ marginBottom: 20 }}
          title={`${done.name} (${done.mobile}) is activated${done.renewalUntil ? `, with renewal till ${formatDate(done.renewalUntil)}` : ''}.`}
          description="They can now sign in to Kivonex Accounts on their computer with this mobile number."
          closable
          onClose={() => setDone(null)}
        />
      )}
      {dealer.data && credits < 1 && <Alert type="warning" showIcon style={{ marginBottom: 20 }} title="You have no Activation credits left. Contact Kivonex for more." />}
      <Panel title="Customer" description="Enter the customer's mobile number. A number with no Kivonex account gets one.">
        <div className="dealer-lookup">
          <Input
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            onPressEnter={() => mobile.trim() && void look.lookup(mobile.trim())}
            placeholder="98765 43210"
            inputMode="tel"
            maxLength={16}
            aria-label="Customer mobile number"
            style={{ maxWidth: 240 }}
          />
          <Button icon={<SearchOutlined />} loading={look.busy} disabled={!mobile.trim()} onClick={() => void look.lookup(mobile.trim())}>
            Check number
          </Button>
        </div>
        <ErrorNotice error={look.error ?? failure} />
        {looked && look.found && <AccountCard account={look.found} />}
        {looked && look.found?.activated && <Alert type="info" showIcon style={{ marginTop: 12 }} title="This account is already activated." action={<Button size="small" onClick={() => go('dealer-renew')}>Renew it</Button>} />}
        {looked && (newAccount || (look.found && !look.found.activated && !look.found.disabled)) && (
          <Form form={form} layout="vertical" requiredMark={false} onFinish={activate} style={{ marginTop: 16, maxWidth: 520 }}>
            {newAccount && (
              <>
                <Alert type="info" showIcon style={{ marginBottom: 16 }} title="No Kivonex account has this number. One is made for the customer when you activate." />
                <div className="form-row">
                  <Form.Item label="Customer name" name="name" rules={[{ required: true, whitespace: true, max: 120, message: "Enter the customer's name." }]}>
                    <Input placeholder="Asha Mehta" />
                  </Form.Item>
                  <Form.Item label="Trade name" name="tradeName" rules={[{ max: 160 }]}>
                    <Input placeholder="Asha Traders" />
                  </Form.Item>
                </div>
              </>
            )}
            <Button type="primary" htmlType="submit" icon={<SafetyCertificateOutlined />} loading={saving} disabled={credits < 1}>
              Activate · uses 1 credit
            </Button>
          </Form>
        )}
      </Panel>
    </>
  )
}

/** Dealer › Renew: an activated account renewed for 1–10 years; one Renewal credit a year. */
export function DealerRenewPage({ go }: PageProps) {
  const { message } = App.useApp()
  const dealer = useLoad(loadDealer)
  const look = useLookup()
  const [mobile, setMobile] = useState('')
  const [years, setYears] = useState(1)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<{ account: DealerAccount; years: number } | null>(null)
  const credits = dealer.data?.balances.renewal ?? 0
  const maxYears = dealer.data?.maxRenewalYears ?? 10
  const looked = look.checked !== '' && look.checked === mobile.trim()
  const renewable = looked && look.found?.activated && !look.found.disabled

  async function renew() {
    setSaving(true)
    setFailure(null)
    try {
      const result = await renewForCustomer({ mobile, years })
      setDone({ account: result.account, years })
      message.success(`${result.account.name} is renewed`)
      look.setFound(result.account)
      await dealer.reload()
    } catch (err) {
      setFailure(errorMessage(err, 'Could not renew the account.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Renew an account" description="Keeps the cloud services (sync, AI reading, GST APIs, imports, remote access) running on an activated account. Uses one Renewal credit a year." />
      <ErrorNotice error={dealer.error} />
      <Balances loading={dealer.loading && !dealer.data} activation={dealer.data?.balances.activation ?? 0} renewal={credits} />
      {done && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 20 }}
          title={`${done.account.name} is renewed for ${done.years} ${done.years === 1 ? 'year' : 'years'}${done.account.renewalUntil ? `, till ${formatDate(done.account.renewalUntil)}` : ''}.`}
          closable
          onClose={() => setDone(null)}
        />
      )}
      {dealer.data && credits < 1 && <Alert type="warning" showIcon style={{ marginBottom: 20 }} title="You have no Renewal credits left. Contact Kivonex for more." />}
      <Panel title="Customer" description="Enter the mobile number of the customer's Kivonex account.">
        <div className="dealer-lookup">
          <Input
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            onPressEnter={() => mobile.trim() && void look.lookup(mobile.trim())}
            placeholder="98765 43210"
            inputMode="tel"
            maxLength={16}
            aria-label="Customer mobile number"
            style={{ maxWidth: 240 }}
          />
          <Button icon={<SearchOutlined />} loading={look.busy} disabled={!mobile.trim()} onClick={() => void look.lookup(mobile.trim())}>
            Check number
          </Button>
        </div>
        <ErrorNotice error={look.error ?? failure} />
        {looked && !look.found && <Alert type="warning" showIcon style={{ marginTop: 12 }} title="No Kivonex account has this number." action={<Button size="small" onClick={() => go('dealer-activate')}>Activate it</Button>} />}
        {looked && look.found && <AccountCard account={look.found} />}
        {looked && look.found && !look.found.activated && <Alert type="info" showIcon style={{ marginTop: 12 }} title="This account is not activated yet. Activate it first." action={<Button size="small" onClick={() => go('dealer-activate')}>Activate</Button>} />}
        {renewable && (
          <div className="dealer-renew">
            <label>
              <span>Years</span>
              <Select
                value={years}
                onChange={setYears}
                aria-label="Years of renewal"
                options={Array.from({ length: maxYears }, (_, index) => ({ value: index + 1, label: `${index + 1} ${index === 0 ? 'year' : 'years'}`, disabled: index + 1 > credits }))}
                style={{ width: 130 }}
              />
            </label>
            <Button type="primary" icon={<ReloadOutlined />} loading={saving} disabled={years > credits} onClick={() => void renew()}>
              Renew · uses {years} {years === 1 ? 'credit' : 'credits'}
            </Button>
          </div>
        )}
      </Panel>
      <p className="fine-print">
        <HistoryOutlined /> Every activation and renewal you give is listed on the{' '}
        <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => go('dealer')}>
          Credits
        </Button>{' '}
        page.
      </p>
    </>
  )
}
