import { AppleOutlined, DesktopOutlined, IdcardOutlined, InfoCircleOutlined, LaptopOutlined, ShoppingOutlined, WindowsOutlined } from '@ant-design/icons'
import { Alert, Button } from 'antd'
import type { PageProps } from '../App'
import type { Computer, CurrentSubscription } from '../api'
import { Bone, EmptyState, ErrorNotice, ListSkeleton, PageHeader, Panel, SubscriptionTag } from '../components'
import { addDays, computers, daysBetween, formatDate, timeAgo, todayIso } from '../lib'

function platformIcon(platform: string) {
  const name = platform.toLowerCase()
  if (name.includes('mac') || name.includes('darwin')) return <AppleOutlined />
  if (name.includes('win')) return <WindowsOutlined />
  if (name.includes('linux')) return <DesktopOutlined />
  return <LaptopOutlined />
}

/** What the customer should know about where their plan stands, if anything. */
function planNotice(subscription: CurrentSubscription) {
  const today = todayIso()
  const until = formatDate(subscription.validUntil)
  const trial = subscription.kind === 'trial'
  if (subscription.state === 'future') {
    return <Alert type="info" showIcon title={`Your plan starts on ${formatDate(subscription.validFrom)}.`} />
  }
  if (trial && subscription.state === 'expired') {
    return (
      <Alert
        type="error"
        showIcon
        title={`Your trial ended on ${until}.`}
        description="Kivonex Accounts on your computers is locked. Buy a plan to continue using the software."
      />
    )
  }
  if (trial) {
    const left = daysBetween(today, subscription.validUntil)
    return (
      <Alert
        type={left <= 2 ? 'warning' : 'info'}
        showIcon
        title={left <= 0 ? `Your trial ends today (${until}).` : `Your trial ends in ${left} ${left === 1 ? 'day' : 'days'}, on ${until}.`}
        description="After that day Kivonex on your computers stops, even if they are offline. Buy a plan to keep the books working for good; cloud services then follow the plan dates."
      />
    )
  }
  if (subscription.state === 'grace') {
    const lastDay = formatDate(addDays(subscription.validUntil, subscription.graceDays))
    return (
      <Alert
        type="warning"
        showIcon
        title={`Your plan ended on ${until}.`}
        description={`Cloud, backup/sync, remote connection and GST APIs keep working until ${lastDay} (grace days). Your books stay on your computer after that.`}
      />
    )
  }
  if (subscription.state === 'expired') {
    return (
      <Alert
        type="error"
        showIcon
        title={`Your plan ended on ${until}.`}
        description="Your books stay on your computer. Cloud, backup/sync, remote connection and GST APIs are off until you renew."
      />
    )
  }
  const left = daysBetween(today, subscription.validUntil)
  if (left <= 30) {
    return (
      <Alert
        type="warning"
        showIcon
        title={`Your plan ends in ${left} ${left === 1 ? 'day' : 'days'}, on ${until}.`}
        description="Renew now: the new plan starts the day after this one ends, so you lose no days. Your books stay on your computer either way."
      />
    )
  }
  return null
}

function PlanSkeleton() {
  return (
    <div className="plan-hero" aria-busy>
      <div className="plan-hero-main">
        <Bone width={90} height={11} />
        <Bone width={160} height={26} style={{ marginTop: 10 }} />
        <Bone width={220} height={12} style={{ marginTop: 12 }} />
      </div>
      <div className="plan-facts">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="bone-lines">
            <Bone width={70} height={10} />
            <Bone width={96} height={16} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ComputerRow({ computer }: { computer: Computer }) {
  return (
    <li className="computer-row">
      <div className="person">
        <span className="stat-icon tone-slate" style={{ flex: 'none' }}>
          {platformIcon(computer.platform)}
        </span>
        <div className="person-text">
          <strong>{computer.name}</strong>
          <span>
            {computer.platform} · app {computer.appVersion}
          </span>
        </div>
      </div>
      <dl className="computer-facts">
        <div>
          <dt>Signed in</dt>
          <dd>{formatDate(computer.signedInAt)}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{timeAgo(computer.lastSeenAt)}</dd>
        </div>
      </dl>
    </li>
  )
}

/**
 * Overview: the plan the account runs on (or what to do without one) and the computers signed in with it. Computers
 * are only listed here; one is signed out from Kivonex on that computer itself.
 */
export function OverviewPage({ go, me }: PageProps) {
  const { data, error } = me
  const subscription = data?.subscription ?? null
  const signedIn = data?.computers ?? []
  const firstName = data?.account.name.split(/\s+/)[0]

  return (
    <>
      <PageHeader
        title="Overview"
        description={firstName ? `Hello, ${firstName}. Here is your Kivonex plan and the computers signed in with your number.` : 'Your Kivonex plan and the computers signed in with your number.'}
        actions={
          data && (
            <Button type="primary" icon={<ShoppingOutlined />} onClick={() => go('plans')}>
              {subscription && subscription.kind !== 'trial' ? 'Renew' : 'Buy a plan'}
            </Button>
          )
        }
      />
      <ErrorNotice error={error} />

      <Panel title="Your plan" flush>
        {!data ? (
          <PlanSkeleton />
        ) : !subscription ? (
          <EmptyState
            icon={<IdcardOutlined />}
            title="You don't have a plan yet"
            action={
              <Button type="primary" size="large" onClick={() => go('plans')}>
                See plans
              </Button>
            }
          >
            Kivonex Accounts on your computer needs a plan before you can sign in and work on your books. Pick a plan and pay online; it starts the
            same day.
          </EmptyState>
        ) : (
          <>
            <div className="plan-hero">
              <div className="plan-hero-main">
                <span className="plan-eyebrow">{subscription.kind === 'trial' ? 'Trial' : 'Current plan'}</span>
                <h2 className="plan-name">
                  {subscription.planName}
                  <SubscriptionTag state={subscription.state} validFrom={subscription.validFrom} />
                </h2>
                <span className="plan-period">
                  {formatDate(subscription.validFrom)} to {formatDate(subscription.validUntil)}
                </span>
              </div>
              <dl className="plan-facts">
                <div>
                  <dt>Valid from</dt>
                  <dd>{formatDate(subscription.validFrom)}</dd>
                </div>
                <div>
                  <dt>Valid till</dt>
                  <dd data-testid="valid-till">{formatDate(subscription.validUntil)}</dd>
                </div>
                <div>
                  <dt>Computers allowed</dt>
                  <dd>{subscription.devices}</dd>
                </div>
                <div>
                  <dt>In use</dt>
                  <dd>
                    {signedIn.length} of {subscription.devices}
                  </dd>
                </div>
              </dl>
            </div>
            {planNotice(subscription) && <div className="plan-notice">{planNotice(subscription)}</div>}
          </>
        )}
      </Panel>

      <Panel
        title="Signed-in computers"
        description={subscription ? `Your plan allows ${computers(subscription.devices)} at a time.` : 'Computers signed in to Kivonex Accounts with your number.'}
        flush
      >
        {!data ? (
          <ListSkeleton rows={2} trailing />
        ) : signedIn.length === 0 ? (
          <div className="panel-body muted-text">No computers are signed in yet. Open Kivonex Accounts on your computer and sign in with your mobile number.</div>
        ) : (
          <ul className="feed computer-list">
            {signedIn.map((computer) => (
              <ComputerRow key={computer.id} computer={computer} />
            ))}
          </ul>
        )}
        <div className="panel-note">
          <InfoCircleOutlined />
          <span>
            To use Kivonex on another computer when all places are used, sign out of Kivonex on one of these computers first (Companies &amp; data ›
            Sign out of this computer).
          </span>
        </div>
      </Panel>
    </>
  )
}
