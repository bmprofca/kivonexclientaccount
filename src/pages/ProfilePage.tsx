import { useState } from 'react'
import { LockOutlined } from '@ant-design/icons'
import { App, Button, Form, Input, Select } from 'antd'
import type { PageProps } from '../App'
import { api, errorMessage, type Billing, type CustomerAccount } from '../api'
import { ErrorNotice, FormSkeleton, PageHeader, Panel } from '../components'
import { INDIAN_STATES } from '../lib'

type ProfileFields = { name: string; email: string; billing: Omit<Billing, 'email'> }

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/**
 * Profile: the customer's name and email, and the billing details printed on their invoices (billing name, GSTIN,
 * address and state; the state decides CGST + SGST or IGST). The mobile number is how they sign in, so it is shown
 * but not changed here.
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
          email: values.email?.trim() || undefined,
          billing: {
            name: values.billing.name?.trim() ?? '',
            gstin: values.billing.gstin?.trim().toUpperCase() ?? '',
            address: values.billing.address?.trim() ?? '',
            state: values.billing.state ?? '',
            // Not edited here; kept as it is.
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
              email: account.email ?? '',
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
                    <Input maxLength={120} autoComplete="name" />
                  </Form.Item>
                  <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Enter a valid email, or leave it blank.' }]}>
                    <Input maxLength={200} type="email" autoComplete="email" placeholder="you@example.com" />
                  </Form.Item>
                </div>
                <Form.Item label="Mobile number" extra="To use a different number, contact Kivonex.">
                  <Input value={account.mobile} readOnly disabled prefix={<LockOutlined />} aria-label="Mobile number" />
                </Form.Item>
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
                    <Input maxLength={120} autoComplete="organization" />
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
                  <Input.TextArea maxLength={400} autoSize={{ minRows: 2, maxRows: 5 }} autoComplete="street-address" />
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
