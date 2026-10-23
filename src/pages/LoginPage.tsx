import { useEffect, useRef, useState } from 'react'
import { FileDoneOutlined, LaptopOutlined, LockOutlined, MobileOutlined, SafetyCertificateOutlined, SafetyOutlined, UserAddOutlined, WalletOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input, type InputRef } from 'antd'
import { ApiError, errorMessage, requestSignInCode, setToken, signIn } from '../api'

function Brand({ dark }: { dark?: boolean }) {
  return (
    <div className="brand" style={{ padding: 0, height: 'auto', color: dark ? '#fff' : 'var(--ink)' }}>
      <span className="brand-mark" style={{ color: '#fff' }}>
        K
      </span>
      <span className="brand-name">
        Kivonex
        <small>My account</small>
      </span>
    </div>
  )
}

type NewAccountFields = { name: string; email?: string }

/**
 * Customer sign-in: the mobile number, then the one-time code sent to it. There is no password. A number that has
 * no account yet also gives a name (and an email, if they like) on the code step, which creates the account.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobile, setMobile] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(false)
  // A new number: the account is made with the name given here.
  const [newAccount, setNewAccount] = useState(false)
  // A new set of empty code boxes (cursor in the first) after a wrong code.
  const [attempt, setAttempt] = useState(0)
  const [details] = Form.useForm<NewAccountFields>()
  const nameInput = useRef<InputRef>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  async function sendCode(number: string) {
    setSubmitting(true)
    setError(null)
    try {
      const result = await requestSignInCode(number)
      setMobile(number)
      setSentTo(result.mobile)
      setNewAccount(result.newAccount)
      setWait(result.resendAfterSeconds)
    } catch (err) {
      setError(errorMessage(err, 'Could not send the code'))
    } finally {
      setSubmitting(false)
    }
  }

  /** Asks for the name (keeping the code typed so far): the number is new to Kivonex. */
  function askForName(message = 'Enter your name to create your account.') {
    setNewAccount(true)
    // The field may only now be on screen; set its error once it is.
    window.setTimeout(() => {
      details.setFields([{ name: 'name', errors: [message] }])
      nameInput.current?.focus()
    })
  }

  async function verify(code: string) {
    if (submitting) return
    if (!/^\d{6}$/.test(code)) return setCodeError(true)
    let fields: NewAccountFields | null = null
    if (newAccount) {
      fields = await details.validateFields().catch(() => null)
      if (!fields) return nameInput.current?.focus()
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await signIn({ mobile, code, ...(fields ? { name: fields.name.trim(), email: fields.email?.trim() || undefined } : {}) })
      setToken(result.token)
      onSignedIn(result.token)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NAME_REQUIRED') {
        // The code is right and still valid: it is sent again with the name.
        askForName()
      } else {
        setError(errorMessage(err, 'Sign-in failed'))
        setCode('')
        setAttempt((count) => count + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setSentTo(null)
    setError(null)
    setWait(0)
    setCode('')
    setNewAccount(false)
    details.resetFields()
  }

  return (
    <div className="login">
      <aside className="login-art">
        <Brand dark />
        <div>
          <span className="login-eyebrow">
            <SafetyCertificateOutlined /> Kivonex Accounts
          </span>
          <h2>Your plan, computers and invoices in one place.</h2>
          <p>Buy or renew your Kivonex plan, see which computers are signed in, and download GST invoices for every payment.</p>
          <ul className="login-points">
            <li>
              <span className="login-point-icon">
                <WalletOutlined />
              </span>
              <span>
                <b>Buy or renew a plan</b>
                Pay securely by UPI, card or net banking through Razorpay.
              </span>
            </li>
            <li>
              <span className="login-point-icon">
                <LaptopOutlined />
              </span>
              <span>
                <b>Your computers</b>
                See every computer signed in to Kivonex with your number.
              </span>
            </li>
            <li>
              <span className="login-point-icon">
                <FileDoneOutlined />
              </span>
              <span>
                <b>GST invoices</b>
                A tax invoice for every payment, ready to print or save as PDF.
              </span>
            </li>
          </ul>
        </div>
        <div className="login-foot">
          <LockOutlined /> Your company books stay on your computer. This panel only handles your plan and payments.
        </div>
      </aside>

      <main className="login-form">
        <div className="login-card">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <div className="login-steps" aria-hidden>
            <span className="on" />
            <span className={sentTo ? 'on' : ''} />
          </div>
          <span className="login-step-icon">{sentTo ? newAccount ? <UserAddOutlined /> : <SafetyOutlined /> : <MobileOutlined />}</span>
          <h1>{sentTo ? (newAccount ? 'Create your account' : 'Enter your code') : 'Sign in'}</h1>
          {sentTo ? (
            newAccount ? (
              <p>
                <strong>{sentTo}</strong> is new to Kivonex. Enter your name and the 6-digit code we sent to it to create your account.
              </p>
            ) : (
              <p>
                We sent a 6-digit code to <strong>{sentTo}</strong>. It works once, for 10 minutes.
              </p>
            )
          ) : (
            <p>Enter your mobile number. We'll send a one-time code to it. New to Kivonex? The same steps create your account.</p>
          )}
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 20 }} />}
          {!sentTo ? (
            <Form layout="vertical" requiredMark={false} size="large" onFinish={(values: { mobile: string }) => void sendCode(values.mobile)}>
              <Form.Item
                label="Mobile number"
                name="mobile"
                rules={[{ required: true, pattern: /^(\+?91[\s-]*)?[6-9](\s*-?\d){9}$/, message: 'Enter a 10-digit mobile number.' }]}
              >
                <Input
                  prefix={<span className="login-prefix">+91</span>}
                  placeholder="98765 43210"
                  inputMode="tel"
                  autoFocus
                  autoComplete="tel-national"
                  maxLength={16}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Send code
              </Button>
            </Form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void verify(code)
              }}
            >
              {newAccount && (
                <Form form={details} component={false} layout="vertical" requiredMark={false}>
                  <div className="login-details">
                    <Form.Item label="Your name" name="name" rules={[{ required: true, whitespace: true, message: 'Enter your name to create your account.' }]}>
                      <Input ref={nameInput} size="large" placeholder="As it should appear on invoices" autoComplete="name" maxLength={120} autoFocus />
                    </Form.Item>
                    <Form.Item label="Email (optional)" name="email" rules={[{ type: 'email', message: 'Enter a valid email, or leave it blank.' }]}>
                      <Input size="large" placeholder="you@example.com" type="email" autoComplete="email" maxLength={200} />
                    </Form.Item>
                  </div>
                </Form>
              )}
              <div className="login-otp">
                {newAccount && <div className="login-otp-label">6-digit code</div>}
                <Input.OTP
                  key={attempt}
                  length={6}
                  size="large"
                  autoFocus={!newAccount || attempt > 0}
                  inputMode="numeric"
                  aria-label="Sign-in code"
                  disabled={submitting}
                  status={codeError ? 'error' : undefined}
                  value={code}
                  onInput={(cells) => {
                    setCode(cells.join(''))
                    setCodeError(false)
                  }}
                  // Six digits sign in by themselves.
                  onChange={(value) => void verify(value)}
                />
                {codeError && <div className="login-otp-error">Enter the 6-digit code.</div>}
              </div>
              <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
                {newAccount ? 'Create account' : 'Verify and sign in'}
              </Button>
              <div className="login-code-actions">
                <Button type="link" onClick={() => reset()} style={{ padding: 0 }}>
                  Change number
                </Button>
                <Button type="link" disabled={wait > 0 || submitting} onClick={() => void sendCode(mobile)} style={{ padding: 0 }}>
                  {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
                </Button>
              </div>
            </form>
          )}
          <div className="login-secure">
            <LockOutlined /> No password. Each code works once.
          </div>
        </div>
      </main>
    </div>
  )
}
