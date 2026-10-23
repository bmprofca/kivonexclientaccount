# Kivonex account panel

The customer side of Kivonex Cloud for Kivonex Accounts users. Customers sign in with their mobile number and a one-time code (a new number creates an account), buy or renew a plan through Razorpay Checkout, and see their subscription, the computers signed in with their number, their payments and GST tax invoices (printable on A4 or saved as PDF). Billing details (name, GSTIN, address, state) are set under **Profile** and go on invoices for payments made after saving them.

A Create React App project (TypeScript) with React Router: every page has its own address (`/plans`, `/invoices/<payment id>`).

Computers are only listed here. To free a place, the customer signs out on that computer in Kivonex Accounts (Companies & data › Sign out of this computer).

## Run

Start `BACKEND` first, then:

```bash
npm install
npm start                                         # http://127.0.0.1:5176 (.env.development), API at http://127.0.0.1:8790
KIVONEX_API=http://127.0.0.1:8791 PORT=5180 npm start   # another API or port
```

The development server forwards `/v1` to `KIVONEX_API` (`src/setupProxy.js`). Sign-in codes are shown in the API server's log until an SMS service is connected (`ADMIN_FIXED_CODE` in BACKEND's `.env` makes every code that value in development).

## Payments

Razorpay keys, the GST rate and the seller details printed on invoices are set in **ADMIN › Settings › Payments**. Until keys are saved, buying a plan answers that online payment is not set up yet. Plans and prices are managed in ADMIN too.

## Tests

```bash
npm run typecheck
npm test            # Jest: money and dates, and which page each address opens (CI=true npm test runs once)
npm run test:ui     # needs Google Chrome; prints ACCOUNT_UI_OK
```

`test:ui` starts a throwaway in-memory API (`BACKEND/test/ui-server.ts`, port 8796, which fakes Razorpay's order API) and its own development server (port 5187), stands in for Razorpay's checkout script in the browser, and runs sign-up, profile, buying a plan, the invoice, Billing and phone width. `UI_SHOTS=<folder>` saves screenshots; `UI_DELAY_MS` slows the API so loading states show. On a failure it saves `ui-test-failure.png`.

## Production

```bash
npm run build       # static files in build/
```

Serve `build/` from any static host that answers unknown paths with `index.html` (the pages use real paths), either with `/v1` going to the Kivonex Cloud API (a reverse proxy on the same origin), or on its own address with the API's address built in: `REACT_APP_KIVONEX_API=https://api.kivonex.in npm run build`. For its own address, BACKEND must list the panel's origin in `CORS_ORIGINS` (comma-separated, e.g. `CORS_ORIGINS=https://account.kivonex.in`), and the **Account panel URL** in ADMIN › Settings › Payments should point at it: the desktop app sends customers there to buy a plan.
