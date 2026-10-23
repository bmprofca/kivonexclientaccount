import type { CSSProperties, ReactNode } from 'react'
import { MoreOutlined } from '@ant-design/icons'
import { Alert, App, Button, Dropdown, Table, Tag, type TableProps } from 'antd'
import type { ColumnType } from 'antd/es/table'
import type { PaymentStatus, SubscriptionState } from './api'
import { formatDate } from './lib'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Panel({
  title,
  description,
  extra,
  children,
  flush,
  className
}: {
  title?: ReactNode
  description?: ReactNode
  extra?: ReactNode
  children: ReactNode
  /** No body padding, for tables and lists that run edge to edge. */
  flush?: boolean
  className?: string
}) {
  return (
    <section className={['panel', className].filter(Boolean).join(' ')}>
      {(title || extra) && (
        <div className="panel-head">
          <div>
            {title && <h3>{title}</h3>}
            {description && <p>{description}</p>}
          </div>
          {extra}
        </div>
      )}
      {flush ? children : <div className="panel-body">{children}</div>}
    </section>
  )
}

export type Tone = 'indigo' | 'green' | 'amber' | 'sky' | 'rose' | 'slate'

export function StatCard({
  label,
  value,
  icon,
  tone,
  foot,
  loading
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tone: Tone
  foot?: ReactNode
  /** First load: the value and foot are shown as skeleton bones. */
  loading?: boolean
}) {
  return (
    <section className="panel stat" aria-busy={loading || undefined}>
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon tone-${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">{loading ? <Bone width={72} height={28} /> : value}</div>
      <div className="stat-foot">{loading ? <Bone width="70%" height={12} /> : foot}</div>
    </section>
  )
}

// ------------------------------------------------------------------ skeletons

/** One shimmering placeholder bar (or circle) standing in for content that is loading. */
export function Bone({ width = '100%', height = 12, round, style }: { width?: number | string; height?: number; round?: boolean; style?: CSSProperties }) {
  return <span className={round ? 'bone round' : 'bone'} style={{ width, height, ...style }} aria-hidden />
}

/** A person (avatar, name, detail line) while it loads. */
export function PersonSkeleton({ size = 36 }: { size?: number }) {
  return (
    <div className="person">
      <Bone width={size} height={size} round />
      <div className="bone-lines">
        <Bone width={140} height={12} />
        <Bone width={190} height={10} />
      </div>
    </div>
  )
}

/** Rows of a feed list (icon or avatar, two lines, something on the right) while they load. */
export function ListSkeleton({ rows = 4, avatar = 34, trailing = true }: { rows?: number; avatar?: number; trailing?: boolean }) {
  return (
    <ul className="feed" aria-busy>
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <PersonSkeleton size={avatar} />
          {trailing && <Bone width={64} height={20} style={{ borderRadius: 6 }} />}
        </li>
      ))}
    </ul>
  )
}

/** A settings form (label column, fields, actions) while it loads. */
export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div aria-busy>
      {Array.from({ length: sections }, (_, index) => (
        <div className="form-section" key={index}>
          <div className="bone-lines">
            <Bone width={110} height={13} />
            <Bone width="90%" height={10} />
            <Bone width="70%" height={10} />
          </div>
          <div className="bone-lines" style={{ gap: 10 }}>
            <Bone width={90} height={11} />
            <Bone height={36} style={{ borderRadius: 8 }} />
            {index % 2 === 0 && (
              <div className="form-row">
                <Bone height={36} style={{ borderRadius: 8 }} />
                <Bone height={36} style={{ borderRadius: 8 }} />
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="form-actions">
        <Bone width={120} height={36} style={{ borderRadius: 8 }} />
        <Bone width={120} height={36} style={{ borderRadius: 8 }} />
      </div>
    </div>
  )
}

/** What a column shows while the table first loads: a person, a tag, the ⋮ button, or a line of text. */
export type SkeletonCell = 'person' | 'tag' | 'actions' | 'text' | 'lines'

export type DataColumn<T> = ColumnType<T> & { skeleton?: SkeletonCell }

const BONE_WIDTHS = ['72%', '56%', '84%', '64%', '48%', '78%']

function skeletonCell(kind: SkeletonCell, row: number) {
  if (kind === 'person') return <PersonSkeleton />
  if (kind === 'tag') return <Bone width={70} height={22} style={{ borderRadius: 6 }} />
  if (kind === 'actions') return <Bone width={28} height={28} style={{ borderRadius: 8, marginLeft: 'auto' }} />
  if (kind === 'lines') {
    return (
      <div className="bone-lines">
        <Bone width={BONE_WIDTHS[row % BONE_WIDTHS.length]} height={12} />
        <Bone width="60%" height={10} />
      </div>
    )
  }
  return <Bone width={BONE_WIDTHS[(row + 2) % BONE_WIDTHS.length]} height={12} />
}

/**
 * A table that shows skeleton rows shaped like its columns on the first load, and keeps showing the rows
 * it has while it loads again (no spinner over data the customer is reading).
 */
export function DataTable<T extends object>({
  loading,
  dataSource,
  columns,
  skeletonRows = 6,
  ...props
}: Omit<TableProps<T>, 'columns' | 'loading'> & { loading: boolean; columns: DataColumn<T>[]; skeletonRows?: number }) {
  const first = loading && (!dataSource || dataSource.length === 0)
  if (first) {
    const placeholders = Array.from({ length: skeletonRows }, (_, index) => ({ __skeleton: index }))
    return (
      <Table<{ __skeleton: number }>
        {...(props as TableProps<{ __skeleton: number }>)}
        className={['table-skeleton', props.className].filter(Boolean).join(' ')}
        rowKey="__skeleton"
        dataSource={placeholders}
        pagination={false}
        aria-busy
        columns={columns.map((column) => ({
          title: column.title as ReactNode,
          width: column.width,
          align: column.align,
          render: (_value: unknown, row: { __skeleton: number }) => skeletonCell(column.skeleton ?? 'text', row.__skeleton)
        }))}
      />
    )
  }
  return <Table<T> {...props} dataSource={dataSource} columns={columns} />
}

// ------------------------------------------------------------------ row actions

export type RowAction = {
  key: string
  label: ReactNode
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** Shown under the label: why it is disabled, or what it does. */
  hint?: ReactNode
  /** Asks first, in a dialog, before running. */
  confirm?: { title: ReactNode; description: ReactNode; okText: string }
  onClick: () => void | Promise<unknown>
}

/** The ⋮ button at the end of a table row. Its actions open in a menu; risky ones ask in a dialog first. */
export function RowActions({ actions, label = 'Actions' }: { actions: Array<RowAction | false | null | undefined>; label?: string }) {
  const { modal } = App.useApp()
  const shown = actions.filter(Boolean) as RowAction[]
  if (shown.length === 0) return null

  const run = (action: RowAction) => {
    if (!action.confirm) return void action.onClick()
    modal.confirm({
      title: action.confirm.title,
      content: action.confirm.description,
      okText: action.confirm.okText,
      okButtonProps: { danger: action.danger },
      cancelText: 'Cancel',
      centered: true,
      onOk: () => action.onClick()
    })
  }

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="row-actions-menu"
      menu={{
        items: shown.map((action) => ({
          key: action.key,
          icon: action.icon,
          danger: action.danger,
          disabled: action.disabled,
          label: (
            <span className="row-action">
              {action.label}
              {action.hint && <small>{action.hint}</small>}
            </span>
          )
        })),
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation()
          const action = shown.find((item) => item.key === key)
          if (action && !action.disabled) run(action)
        }
      }}
    >
      <Button type="text" size="small" className="row-actions-button" icon={<MoreOutlined />} aria-label={label} onClick={(event) => event.stopPropagation()} />
    </Dropdown>
  )
}

export function ErrorNotice({ error }: { error: string | null }) {
  if (!error) return null
  return <Alert type="error" showIcon title={error} style={{ marginBottom: 20 }} />
}

/** A friendly empty panel: an icon, what is missing, what to do, and a button for it. */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

/** Where the account's plan stands: Active, In grace days, Ended, or Starts on a day. */
export function SubscriptionTag({ state, validFrom }: { state: SubscriptionState; validFrom: string }) {
  if (state === 'active')
    return (
      <Tag color="success" variant="filled">
        <span className="status-dot" />
        Active
      </Tag>
    )
  if (state === 'grace')
    return (
      <Tag color="orange" variant="filled">
        In grace days
      </Tag>
    )
  if (state === 'future')
    return (
      <Tag color="processing" variant="filled">
        Starts on {formatDate(validFrom)}
      </Tag>
    )
  return <Tag variant="filled">Ended</Tag>
}

const PAYMENT_TAGS: Record<PaymentStatus, { color: string; label: string }> = {
  paid: { color: 'success', label: 'Paid' },
  failed: { color: 'error', label: 'Failed' },
  created: { color: 'default', label: 'Not completed' }
}

export function PaymentTag({ status }: { status: PaymentStatus }) {
  const tag = PAYMENT_TAGS[status]
  return (
    <Tag color={tag.color} variant="filled">
      {tag.label}
    </Tag>
  )
}
