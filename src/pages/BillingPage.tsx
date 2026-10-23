import { Link } from 'react-router-dom'
import { FileTextOutlined, ShoppingOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { PageProps } from '../App'
import { api, type Payment } from '../api'
import { DataTable, ErrorNotice, PageHeader, Panel, PaymentTag, RowActions } from '../components'
import { formatDate, formatMoney, useLoad } from '../lib'

/** Billing: every payment, paid or not, newest first. A paid one has a tax invoice. */
export function BillingPage({ go }: PageProps) {
  const { data, error, loading } = useLoad(() => api<{ payments: Payment[] }>('/v1/account/payments').then((body) => body.payments))
  const payments = data ?? []

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your payments and their GST invoices. A payment that was not completed took no money."
        actions={
          <Button icon={<ShoppingOutlined />} onClick={() => go('plans')}>
            See plans
          </Button>
        }
      />
      <ErrorNotice error={error} />
      <Panel title="Payments" flush>
        <DataTable
          rowKey="id"
          loading={loading}
          dataSource={payments}
          skeletonRows={3}
          pagination={payments.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'No payments yet. Your payments and invoices appear here after you buy a plan.' }}
          columns={[
            {
              title: 'Date',
              width: 130,
              render: (_value, row: Payment) => formatDate(row.paidAt ?? row.createdAt)
            },
            {
              title: 'Plan',
              skeleton: 'lines',
              render: (_value, row: Payment) => (
                <span>
                  {row.planName}
                  <span className="cell-sub">
                    {row.status === 'paid' && row.validFrom && row.validUntil
                      ? `${formatDate(row.validFrom)} to ${formatDate(row.validUntil)}`
                      : row.status === 'failed'
                        ? row.failureReason
                        : 'Checkout was not finished'}
                  </span>
                </span>
              )
            },
            { title: 'Amount', dataIndex: 'amountPaise', width: 120, align: 'right', render: (value: number) => <span className="num">{formatMoney(value)}</span> },
            { title: 'Status', dataIndex: 'status', width: 140, skeleton: 'tag', render: (value: Payment['status']) => <PaymentTag status={value} /> },
            {
              title: 'Invoice',
              dataIndex: 'invoiceNumber',
              width: 170,
              render: (value: string | null, row: Payment) => (value ? <Link to={`/invoices/${row.id}`}>{value}</Link> : <span className="muted-text">—</span>)
            },
            {
              title: '',
              width: 56,
              align: 'right',
              skeleton: 'actions',
              render: (_value, row: Payment) => (
                <RowActions
                  label={`Actions for ${row.invoiceNumber ?? row.planName}`}
                  actions={[
                    row.status === 'paid' && {
                      key: 'invoice',
                      icon: <FileTextOutlined />,
                      label: 'View invoice',
                      hint: 'Print it or save it as PDF',
                      onClick: () => go('invoices', row.id)
                    }
                  ]}
                />
              )
            }
          ]}
        />
      </Panel>
    </>
  )
}
