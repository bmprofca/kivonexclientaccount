import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppstoreOutlined, CreditCardOutlined, LogoutOutlined, MenuOutlined, ShoppingOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons'
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, type MenuProps } from 'antd'
import { getToken, loadMe, signOut as endSession, type Me } from './api'
import { Bone } from './components'
import { initials, useLoad, type Loaded } from './lib'
import { BillingPage } from './pages/BillingPage'
import { InvoicePage } from './pages/InvoicePage'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { PlansPage } from './pages/PlansPage'
import { ProfilePage } from './pages/ProfilePage'
import { WalletPage } from './pages/WalletPage'

const { Sider, Header, Content } = Layout

export type Page = 'overview' | 'plans' | 'wallet' | 'billing' | 'invoices' | 'profile'

/** Opens a page, optionally one item of it (an invoice is go('invoices', paymentId)). */
export type Go = (page: Page, sub?: string) => void

/** What every page gets: how to open another page, and the signed-in customer (plan, computers) with reload(). */
export type PageProps = { go: Go; sub: string; me: Loaded<Me> }

type PageInfo = { title: string; section: string; icon: ReactNode; nav: boolean; render: (props: PageProps) => ReactNode }

const PAGES: Record<Page, PageInfo> = {
  overview: { title: 'Overview', section: 'My account', icon: <AppstoreOutlined />, nav: true, render: (props) => <OverviewPage {...props} /> },
  plans: { title: 'Plans', section: 'My account', icon: <ShoppingOutlined />, nav: true, render: (props) => <PlansPage {...props} /> },
  wallet: { title: 'Wallet', section: 'My account', icon: <WalletOutlined />, nav: true, render: (props) => <WalletPage {...props} /> },
  billing: { title: 'Billing', section: 'My account', icon: <CreditCardOutlined />, nav: true, render: (props) => <BillingPage {...props} /> },
  // An invoice opens from Billing; it is not in the menu.
  invoices: { title: 'Invoice', section: 'Billing', icon: <CreditCardOutlined />, nav: false, render: (props) => <InvoicePage {...props} /> },
  profile: { title: 'Profile', section: 'Settings', icon: <UserOutlined />, nav: true, render: (props) => <ProfilePage {...props} /> }
}

const SECTIONS = ['My account', 'Settings']

/** The page in the address (/plans, /invoices/<payment id>), so a reload or a shared link opens it again. */
function pageOf(pathname: string): Page {
  const name = pathname.split('/')[1] ?? ''
  return name in PAGES ? (name as Page) : 'overview'
}

/** One page of the panel, with the part of it named in the address (an invoice's payment id). */
function PageRoute({ page, go, me }: { page: Page; go: Go; me: Loaded<Me> }) {
  const { sub = '' } = useParams()
  return <>{PAGES[page].render({ go, sub, me })}</>
}

const NAV: MenuProps['items'] = SECTIONS.map((section) => ({
  type: 'group' as const,
  key: section,
  label: section,
  children: (Object.keys(PAGES) as Page[])
    .filter((key) => PAGES[key].nav && PAGES[key].section === section)
    .map((key) => ({ key, icon: PAGES[key].icon, label: PAGES[key].title }))
}))

export function App() {
  const [token, setSignedIn] = useState<string | null>(getToken())
  const navigate = useNavigate()

  useEffect(() => {
    const onUnauthorized = () => setSignedIn(null)
    window.addEventListener('kivonex-account-unauthorized', onUnauthorized)
    return () => window.removeEventListener('kivonex-account-unauthorized', onUnauthorized)
  }, [])

  if (!token) {
    return (
      <LoginPage
        onSignedIn={(value) => {
          // Every sign-in starts on the overview.
          navigate('/overview', { replace: true })
          setSignedIn(value)
        }}
      />
    )
  }
  return <Shell key={token} onSignedOut={() => setSignedIn(null)} />
}

/** The signed-in panel: the menu at the side (a drawer on phones), the top bar, and the open page. */
function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const navigate = useNavigate()
  const page = pageOf(useLocation().pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const me = useLoad(loadMe)
  const screens = Grid.useBreakpoint()
  const compact = !screens.lg
  const account = me.data?.account

  useEffect(() => {
    document.title = `${PAGES[page].title} · Kivonex`
  }, [page])

  const go: Go = (next, nextSub = '') => {
    navigate(nextSub ? `/${next}/${nextSub}` : `/${next}`)
    setMenuOpen(false)
    window.scrollTo({ top: 0 })
  }

  const signOut = async () => {
    await endSession()
    navigate('/', { replace: true })
    onSignedOut()
  }

  const nav = (
    <>
      <div className="brand">
        <span className="brand-mark">K</span>
        <span className="brand-name">
          Kivonex
          <small>My account</small>
        </span>
      </div>
      <Menu
        className="shell-nav"
        theme="dark"
        mode="inline"
        selectedKeys={[page === 'invoices' ? 'billing' : page]}
        items={NAV}
        onClick={({ key }) => go(key as Page)}
      />
      <div className="sider-foot">
        <strong>Kivonex Accounts</strong>
        Your plan, computers and GST invoices.
      </div>
    </>
  )

  return (
    <Layout className="shell">
      {!compact && (
        <Sider width={248} className="shell-sider">
          {nav}
        </Sider>
      )}
      {compact && (
        <Drawer
          placement="left"
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          size={264}
          closable={false}
          styles={{ body: { padding: 0, background: 'var(--sider)', display: 'flex', flexDirection: 'column' } }}
        >
          {nav}
        </Drawer>
      )}
      <Layout>
        <Header className="topbar">
          <div className="topbar-left">
            {compact && <Button type="text" icon={<MenuOutlined />} onClick={() => setMenuOpen(true)} aria-label="Open menu" />}
            <span className="crumbs">
              {page === 'invoices' ? (
                <>
                  <Link to="/billing">Billing</Link> / <b>Invoice</b>
                </>
              ) : (
                <>
                  {PAGES[page].section} / <b>{PAGES[page].title}</b>
                </>
              )}
            </span>
          </div>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'profile', icon: <UserOutlined />, label: 'Profile' },
                { type: 'divider' },
                { key: 'out', icon: <LogoutOutlined />, label: 'Sign out', danger: true }
              ],
              onClick: ({ key }) => (key === 'out' ? void signOut() : go('profile'))
            }}
          >
            <div className="user-chip" role="button" tabIndex={0} aria-label="Your account">
              <Avatar size={32} style={{ background: 'var(--brand)', fontWeight: 600 }}>
                {account ? initials(account.name) : 'K'}
              </Avatar>
              <span className="user-chip-text">
                {account ? (
                  <>
                    {account.name}
                    <small>{account.mobile}</small>
                  </>
                ) : (
                  <span className="bone-lines" style={{ gap: 6 }} aria-busy>
                    <Bone width={84} height={11} />
                    <Bone width={110} height={9} />
                  </span>
                )}
              </span>
            </div>
          </Dropdown>
        </Header>
        <Content className="content">
          <Routes>
            <Route path="/overview" element={<PageRoute page="overview" go={go} me={me} />} />
            <Route path="/plans" element={<PageRoute page="plans" go={go} me={me} />} />
            <Route path="/wallet" element={<PageRoute page="wallet" go={go} me={me} />} />
            <Route path="/billing" element={<PageRoute page="billing" go={go} me={me} />} />
            <Route path="/invoices/:sub" element={<PageRoute page="invoices" go={go} me={me} />} />
            <Route path="/profile" element={<PageRoute page="profile" go={go} me={me} />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
