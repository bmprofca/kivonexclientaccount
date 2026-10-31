import { useEffect, useState } from 'react'
import { App, Button, Form, Input, Select } from 'antd'
import type { PageProps } from '../App'
import {
  api,
  confirmEmailChange,
  confirmMobileChange,
  errorMessage,
  requestEmailChangeCode,
  requestMobileChangeCode,
  type Billing,
  type CustomerAccount
} from '../api'
import { ErrorNotice, FormSkeleton, PageHeader, Panel } from '../components'
import { INDIAN_STATES } from '../lib'

type ProfileFields = { name: string; tradeName: string; billing: Omit<Billing, 'email'> }

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const MOBILE = /^(\+?91[\s-]*)?[6-9](\s*-?\d){9}$/

type ChangeKind = 'email' | 'mobile'

/**
 * Profile: name, trade name and billing, plus email and mobile. Changing email sends a code to the current
 * mobile; changing mobile sends a code to the current email.
 */
export function ProfilePage({ me }: PageProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<ProfileFields>()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const account = me.data?.account

  async function save(values: ProfileFields) {
    if (!account) return
    setSaving(true)
    setSaveError(null)
    try {
      await api<{ account: CustomerAccount }>('/v1/account/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: values.name.trim(),
          tradeName: values.tradeName?.trim() ?? '',
          billing: {
            name: values.billing.name?.trim() ?? '',
            gstin: values.billing.gstin?.trim().toUpperCase() ?? '',
            address: values.billing.address?.trim() ?? '',
            state: values.billing.state ?? '',
            email: account.billing.email
          }
        })
      })
      message.success('Profile saved')
      void me.reload()
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not save your profile'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Profile" description="Your details, and the billing details that go on your invoices." />
      <ErrorNotice error={me.error} />
      <ErrorNotice error={saveError} />
      <Panel flush>
        {!account ? (
          <FormSkeleton sections={2} />
        ) : (
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{
              name: account.name,
              tradeName: account.tradeName ?? '',
              billing: { name: account.billing.name, gstin: account.billing.gstin, address: account.billing.address, state: account.billing.state || undefined }
            }}
            onFinish={(values) => void save(values)}
          >
            <div className="form-section">
              <div>
                <h4>Your details</h4>
                <p>We use these to reach you about your plan and payments. You sign in with your mobile number.</p>
              </div>
              <div>
                <div className="form-row">
                  <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true, message: 'Enter your name.' }]}>
                    <Input placeholder="Your full name" maxLength={120} autoComplete="name" />
                  </Form.Item>
                  <Form.Item label="Trade name" name="tradeName">
                    <Input maxLength={160} autoComplete="organization" placeholder="Your business or firm name" />
                  </Form.Item>
                </div>
                <ContactChange account={account} kind="email" onChanged={() => void me.reload()} />
                <ContactChange account={account} kind="mobile" onChanged={() => void me.reload()} />
              </div>
            </div>
            <div className="form-section">
              <div>
                <h4>Billing details</h4>
                <p>
                  These go on the tax invoice of every payment you make after saving them. Add your GSTIN to claim input tax credit. Your state decides
                  whether the invoice shows CGST and SGST or IGST.
                </p>
              </div>
              <div>
                <div className="form-row">
                  <Form.Item label="Billing name" name={['billing', 'name']} extra="Your business name. Leave blank to use your own name.">
                    <Input placeholder="Name to print on invoices" maxLength={120} autoComplete="organization" />
                  </Form.Item>
                  <Form.Item
                    label="GSTIN"
                    name={['billing', 'gstin']}
                    normalize={(value: string) => value.toUpperCase().replace(/\s+/g, '')}
                    rules={[{ pattern: GSTIN, message: 'Enter a valid 15-character GSTIN, or leave it blank.' }]}
                  >
                    <Input maxLength={15} placeholder="19ABCDE1234F1Z5" className="mono" />
                  </Form.Item>
                </div>
                <Form.Item label="Address" name={['billing', 'address']}>
                  <Input.TextArea placeholder="Building, street, city, PIN code" maxLength={400} autoSize={{ minRows: 2, maxRows: 5 }} autoComplete="street-address" />
                </Form.Item>
                <Form.Item label="State" name={['billing', 'state']}>
                  <Select
                    showSearch
                    allowClear
                    placeholder="Choose your state or union territory"
                    options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
                    aria-label="State"
                  />
                </Form.Item>
              </div>
            </div>
            <div className="form-actions">
              <Button type="primary" htmlType="submit" loading={saving}>
                Save changes
              </Button>
            </div>
          </Form>
        )}
      </Panel>
    </>
  )
}

function ContactChange({ account, kind, onChanged }: { account: CustomerAccount; kind: ChangeKind; onChanged: () => void }) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emailChange = kind === 'email'
  const current = emailChange ? account.email || '' : account.mobile
  const blocked = emailChange ? !account.mobile : !account.email
  const blockedWhy = emailChange
    ? 'This account has no mobile number, so we cannot send a code.'
    : 'Add an email first. We send the code there when you change your mobile number.'
  const extra = emailChange
    ? account.email
      ? account.emailVerified
        ? 'To change this, we send a code to your mobile.'
        : 'To change or verify this, we send a code to your mobile.'
      : 'Add an email. We send a code to your mobile to confirm it.'
    : account.email
      ? 'To change this, we send a code to your email. You sign in with this number.'
      : 'Add an email first, then you can change this number.'

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  function reset() {
    setOpen(false)
    setValue('')
    setSentTo(null)
    setCode('')
    setWait(0)
    setError(null)
  }

  async function sendCode(next = value) {
    const trimmed = next.trim()
    if (emailChange) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setError('Enter a valid email address.')
    } else if (!MOBILE.test(trimmed)) {
      return setError('Enter a 10-digit mobile number.')
    }
    setBusy(true)
    setError(null)
    try {
      if (emailChange) {
        const result = await requestEmailChangeCode(trimmed)
        setSentTo(result.mobile)
        setWait(result.resendAfterSeconds)
      } else {
        const result = await requestMobileChangeCode(trimmed)
        setSentTo(result.email)
        setWait(result.resendAfterSeconds)
      }
      setValue(trimmed)
    } catch (err) {
      setError(errorMessage(err, 'Could not send the code'))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code.')
    setBusy(true)
    setError(null)
    try {
      if (emailChange) await confirmEmailChange({ email: value.trim(), code })
      else await confirmMobileChange({ mobile: value.trim(), code })
      message.success(emailChange ? 'Email updated' : 'Mobile number updated')
      reset()
      onChanged()
    } catch (err) {
      setError(errorMessage(err, emailChange ? 'Could not change your email' : 'Could not change your mobile number'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="contact-field">
      <div className="contact-field-row">
        <div>
          <div className="contact-field-label">{emailChange ? 'Email' : 'Mobile number'}</div>
          <div className="contact-field-value">{current || <span className="muted-text">Not set</span>}</div>
          <div className="contact-field-extra">{extra}</div>
        </div>
        <Button
          type="link"
          style={{ paddingInline: 0 }}
          disabled={blocked}
          onClick={() => {
            setOpen(true)
            setError(null)
            setSentTo(null)
            setCode('')
            setValue('')
          }}
        >
          {current ? 'Change' : 'Add'}
        </Button>
      </div>
      {blocked && <div className="contact-field-extra">{blockedWhy}</div>}
      {open && (
        <div className="contact-change" onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}>
          {!sentTo ? (
            <>
              {emailChange ? (
                <Input
                  autoFocus
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  placeholder="you@business.com"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onPressEnter={() => void sendCode()}
                />
              ) : (
                <Input
                  autoFocus
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={16}
                  placeholder="98765 43210"
                  prefix={<span className="login-prefix">+91</span>}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onPressEnter={() => void sendCode()}
                />
              )}
              <div className="contact-change-actions">
                <Button type="primary" loading={busy} onClick={() => void sendCode()}>
                  Send code
                </Button>
                <Button type="link" onClick={reset} style={{ paddingInline: 0 }}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                We sent a 6-digit code to <strong>{sentTo}</strong>. It works once, for 10 minutes.
              </p>
              <Input.OTP
                length={6}
                size="large"
                autoFocus
                inputMode="numeric"
                aria-label={emailChange ? 'Mobile code' : 'Email code'}
                disabled={busy}
                value={code}
                onInput={(cells) => {
                  setCode(cells.join(''))
                  setError(null)
                }}
              />
              <div className="contact-change-actions">
                <Button type="primary" loading={busy} onClick={() => void confirm()}>
                  {emailChange ? 'Save email' : 'Save number'}
                </Button>
                <Button type="link" disabled={wait > 0 || busy} onClick={() => void sendCode(value)} style={{ paddingInline: 0 }}>
                  {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
                </Button>
                <Button type="link" onClick={reset} style={{ paddingInline: 0 }}>
                  Cancel
                </Button>
              </div>
            </>
          )}
          {error && <div className="login-otp-error">{error}</div>}
        </div>
      )}
    </div>
  )
}
