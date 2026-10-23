import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'

// The API never answers here: pages show their loading state, the shell and the address are what is tested.
beforeEach(() => {
  global.fetch = jest.fn(() => new Promise<Response>(() => undefined))
})
afterEach(() => localStorage.clear())

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
// Plain queries: CRA's jsdom cannot match antd's newer CSS selectors, which role queries run into.
const crumbs = () => document.querySelector('.crumbs')?.textContent
const heading = () => document.querySelector('h1')?.textContent
const crumbLink = () => document.querySelector('.crumbs a')

describe('the address opens the page', () => {
  it('asks for the sign-in while signed out, whatever the address', () => {
    at('/billing')
    expect(heading()).toBe('Sign in')
  })

  it('opens each page of the panel by its address once signed in', () => {
    localStorage.setItem('kivonex-account-token', 'token')
    at('/plans')
    expect(crumbs()).toBe('My account / Plans')
  })

  it('opens an invoice by its payment, with the way back to Billing', () => {
    localStorage.setItem('kivonex-account-token', 'token')
    at('/invoices/pay-1')
    expect(crumbs()).toBe('Billing / Invoice')
    expect(crumbLink()).toHaveTextContent('Billing')
    expect(crumbLink()).toHaveAttribute('href', '/billing')
  })

  it('sends an unknown address to the overview', () => {
    localStorage.setItem('kivonex-account-token', 'token')
    at('/no-such-page')
    expect(crumbs()).toBe('My account / Overview')
  })
})
