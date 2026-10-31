import { useEffect, useState } from 'react'
import { FileDoneOutlined, LaptopOutlined, LockOutlined, MailOutlined, MobileOutlined, SafetyCertificateOutlined, SafetyOutlined, UserAddOutlined, WalletOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input } from 'antd'
import { ApiError, errorMessage, register, requestRegisterCodes, requestSignInCode, setToken, signIn, type RegisterInput } from '../api'

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

type Mode = 'signin' | 'register'

/**
 * Customer sign-in with a mobile number and a one-time code, or registration with name, trade name, mobile and
 * email. Registration verifies both the mobile and the email with their own codes. There is no password.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [signMobile, setSignMobile] = useState('')
  const [sentMobile, setSentMobile] = useState<string | null>(null)
  const [mobileCode, setMobileCode] = useState('')
  const [mobileCodeError, setMobileCodeError] = useState(false)
  const [details] = Form.useForm<RegisterInput>()
  const [pending, setPending] = useState<RegisterInput | null>(null)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [emailCode, setEmailCode] = useState('')
  const [emailCodeError, setEmailCodeError] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setWait(0)
    setSentMobile(null)
    setPending(null)
    setSentEmail(null)
    setMobileCode('')
    setEmailCode('')
    setMobileCodeError(false)
    setEmailCodeError(false)
  }

  async function sendSignInCode(number: string) {
    setSubmitting(true)
    setError(null)
    try {
      const result = await requestSignInCode(number)
      if (result.newAccount) {
        details.setFieldsValue({ mobile: number })
        switchMode('register')
        setError('This number is new to Kivonex. Create your account with your name, trade name and email.')
        return
      }
      setSignMobile(number)
      setSentMobile(result.mobile)
      setWait(result.resendAfterSeconds)
    } catch (err) {
      setError(errorMessage(err, 'Could not send the code'))
    } finally {
      setSubmitting(false)
    }
  }

  async function verifySignIn(code: string) {
    if (submitting) return
    if (!/^\d{6}$/.test(code)) return setMobileCodeError(true)
    setSubmitting(true)
    setError(null)
    try {
      const result = await signIn({ mobile: signMobile, code })
      setToken(result.token)
      onSignedIn(result.token)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NAME_REQUIRED') {
        details.setFieldsValue({ mobile: signMobile })
        switchMode('register')
        setError('This number is new to Kivonex. Create your account with your name, trade name and email.')
        return
      }
      setError(errorMessage(err, 'Sign-in failed'))
      setMobileCode('')
      setAttempt((count) => count + 1)
    } finally {
      setSubmitting(false)
    }
  }

  async function sendRegisterCodes(values: RegisterInput) {
    setSubmitting(true)
    setError(null)
    try {
      const result = await requestRegisterCodes(values)
      setPending(values)
      setSentMobile(result.mobile)
      setSentEmail(result.email)
      setWait(result.resendAfterSeconds)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MOBILE_TAKEN') {
        switchMode('signin')
        setError(errorMessage(err, 'This number already has an account. Sign in instead.'))
        return
      }
      setError(errorMessage(err, 'Could not send the codes'))
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyRegister() {
    if (!pending || submitting) return
    if (!/^\d{6}$/.test(mobileCode)) return setMobileCodeError(true)
    if (!/^\d{6}$/.test(emailCode)) return setEmailCodeError(true)
    setSubmitting(true)
    setError(null)
    try {
      const result = await register({ ...pending, mobileCode, emailCode })
      setToken(result.token)
      onSignedIn(result.token)
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account'))
      setAttempt((count) => count + 1)
    } finally {
      setSubmitting(false)
    }
  }

  const registering = mode === 'register'
  const awaitingCodes = registering ? Boolean(pending) : Boolean(sentMobile)

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
        <div className={`login-card${registering ? ' is-register' : ''}`}>
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <div className="login-mode" role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" aria-selected={!registering} className={!registering ? 'on' : ''} onClick={() => switchMode('signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={registering} className={registering ? 'on' : ''} onClick={() => switchMode('register')}>
              Create account
            </button>
          </div>
          <div className="login-steps" aria-hidden>
            <span className="on" />
            <span className={awaitingCodes ? 'on' : ''} />
          </div>
          <span className="login-step-icon">{awaitingCodes ? registering ? <MailOutlined /> : <SafetyOutlined /> : registering ? <UserAddOutlined /> : <MobileOutlined />}</span>
          <h1>
            {awaitingCodes ? (registering ? 'Enter both codes' : 'Enter your code') : registering ? 'Create your account' : 'Sign in'}
          </h1>
          {awaitingCodes ? (
            registering ? (
              <p>
                We sent a 6-digit code to <strong>{sentMobile}</strong> and another to <strong>{sentEmail}</strong>. Each works once, for 10 minutes.
              </p>
            ) : (
              <p>
                We sent a 6-digit code to <strong>{sentMobile}</strong>. It works once, for 10 minutes.
              </p>
            )
          ) : registering ? (
            <p>Enter your name, trade name, mobile number and email. We will send a one-time code to the number and another to the email.</p>
          ) : (
            <p>Enter your mobile number. We'll send a one-time code to it.</p>
          )}
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 20 }} />}

          {!registering && !sentMobile && (
            <Form layout="vertical" requiredMark={false} size="large" onFinish={(values: { mobile: string }) => void sendSignInCode(values.mobile)}>
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
          )}

          {!registering && sentMobile && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void verifySignIn(mobileCode)
              }}
            >
              <div className="login-otp">
                <Input.OTP
                  key={attempt}
                  length={6}
                  size="large"
                  autoFocus
                  inputMode="numeric"
                  aria-label="Sign-in code"
                  disabled={submitting}
                  status={mobileCodeError ? 'error' : undefined}
                  value={mobileCode}
                  onInput={(cells) => {
                    setMobileCode(cells.join(''))
                    setMobileCodeError(false)
                  }}
                  onChange={(value) => void verifySignIn(value)}
                />
                {mobileCodeError && <div className="login-otp-error">Enter the 6-digit code.</div>}
              </div>
              <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
                Verify and sign in
              </Button>
              <div className="login-code-actions">
                <Button type="link" onClick={() => switchMode('signin')} style={{ padding: 0 }}>
                  Change number
                </Button>
                <Button type="link" disabled={wait > 0 || submitting} onClick={() => void sendSignInCode(signMobile)} style={{ padding: 0 }}>
                  {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
                </Button>
              </div>
            </form>
          )}

          {registering && !pending && (
            <Form form={details} layout="vertical" requiredMark={false} size="large" onFinish={(values) => void sendRegisterCodes(values)}>
              <Form.Item label="Your name" name="name" rules={[{ required: true, whitespace: true, message: 'Enter your name.' }]}>
                <Input placeholder="As it should appear on invoices" autoComplete="name" maxLength={120} autoFocus />
              </Form.Item>
              <Form.Item label="Trade name" name="tradeName" rules={[{ required: true, whitespace: true, message: 'Enter your trade name.' }]}>
                <Input placeholder="Your business or firm name" autoComplete="organization" maxLength={160} />
              </Form.Item>
              <Form.Item
                label="Mobile number"
                name="mobile"
                rules={[{ required: true, pattern: /^(\+?91[\s-]*)?[6-9](\s*-?\d){9}$/, message: 'Enter a 10-digit mobile number.' }]}
              >
                <Input prefix={<span className="login-prefix">+91</span>} placeholder="98765 43210" inputMode="tel" autoComplete="tel-national" maxLength={16} />
              </Form.Item>
              <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Enter a valid email address.' }]}>
                <Input placeholder="you@business.com" type="email" autoComplete="email" maxLength={200} />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Send codes
              </Button>
            </Form>
          )}

          {registering && pending && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void verifyRegister()
              }}
            >
              <div className="login-otp-pair">
                <div className="login-otp">
                  <div className="login-otp-label">Code sent to {sentMobile}</div>
                  <Input.OTP
                    key={`m-${attempt}`}
                    length={6}
                    size="large"
                    autoFocus
                    inputMode="numeric"
                    aria-label="Mobile code"
                    disabled={submitting}
                    status={mobileCodeError ? 'error' : undefined}
                    value={mobileCode}
                    onInput={(cells) => {
                      setMobileCode(cells.join(''))
                      setMobileCodeError(false)
                    }}
                  />
                  {mobileCodeError && <div className="login-otp-error">Enter the 6-digit mobile code.</div>}
                </div>
                <div className="login-otp">
                  <div className="login-otp-label">Code sent to {sentEmail}</div>
                  <Input.OTP
                    key={`e-${attempt}`}
                    length={6}
                    size="large"
                    inputMode="numeric"
                    aria-label="Email code"
                    disabled={submitting}
                    status={emailCodeError ? 'error' : undefined}
                    value={emailCode}
                    onInput={(cells) => {
                      setEmailCode(cells.join(''))
                      setEmailCodeError(false)
                    }}
                  />
                  {emailCodeError && <div className="login-otp-error">Enter the 6-digit email code.</div>}
                </div>
              </div>
              <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
                Create account
              </Button>
              <div className="login-code-actions">
                <Button
                  type="link"
                  onClick={() => {
                    setPending(null)
                    setSentMobile(null)
                    setSentEmail(null)
                    setMobileCode('')
                    setEmailCode('')
                    setError(null)
                  }}
                  style={{ padding: 0 }}
                >
                  Change details
                </Button>
                <Button type="link" disabled={wait > 0 || submitting} onClick={() => void sendRegisterCodes(pending)} style={{ padding: 0 }}>
                  {wait > 0 ? `Resend in ${wait}s` : 'Resend codes'}
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
