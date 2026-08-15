# Yunique Fashion Store — Yuno Full Checkout Demo

Generic checkout page implementing Yuno's **Full Checkout Web SDK** (`Yuno.initialize` →
`startCheckout` → `mountCheckout` → `startPayment`), backed by an Express server that does the
two required backend-to-backend calls: create checkout session, create payment.
Card payments are routed through the **Yuno Test Payment Gateway** (sandbox only).

## 1. Dashboard setup (do this once, before running the code)

Source: [Set Up Your Account](https://docs.y.uno/docs/how-yuno-works/step-1-set-up-your-account.md)

1. **Connection** — Dashboard → Connections → search "Yuno Test Payment Gateway" → Connect →
   name it → Save.
2. **Routing** — Dashboard → Routing → "Not published" tab → find **Card** → Set Up → Create new
   route → name it → Save → Add step → choose **Yuno Test Payment Gateway** → Select → **Publish**.
3. **Checkout Builder** — Dashboard → Checkout Builder → toggle **Card** on → **Publish settings**.
4. **Credentials** — Dashboard → Developers → copy `public-api-key`, `private-secret-key`,
   and `account_id`.

If you skip step 2 or 3, the SDK mounts but no card option shows up / payments get rejected —
that's usually the first thing to check if the demo looks empty in front of the customer.

## 2. Run it

```bash
cp .env.example .env
# fill in YUNO_PUBLIC_API_KEY, YUNO_PRIVATE_SECRET_KEY, YUNO_ACCOUNT_ID
npm install
npm start
```

Open `http://localhost:3000`.

## 3. Test cards (Yuno Testing Gateway)

Source: [Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway.md)

| Number | Exp | CVV | Result |
|---|---|---|---|
| 4507 9900 0000 0002 | 11/28 | 123 | SUCCEEDED |
| 4507 9900 0000 0010 | 11/28 | 123 | INSUFFICIENT_FUNDS |
| 4507 9900 0000 0028 | 11/28 | 123 | DECLINED_BY_BANK |

Full table (Mastercard/Amex/Diners/UATP + 3DS challenge cards) is in the doc above. I'm not
100% sure whether the generic `4111 1111 1111 1111` number from the SDK quickstart also maps
cleanly to SUCCEEDED on this specific gateway — the numbers above are the ones Yuno's own
testing-gateway doc guarantees, so use those for the demo to avoid a surprise DECLINED on stage.

## 4. How the flow maps to the three customer requirements

- **"Implement Credit Card payments using SDK FULL"** → `public/checkout.html` uses
  `Yuno.initialize()` + `startCheckout()` + `mountCheckout()`, the pre-built-UI flow (this is
  what the docs call Full/Seamless Checkout — automatic payment-method listing, no manual UI
  building).
- **"Embedded, no redirect"** → `elementSelector: '#payment-form'` mounts the form inline in the
  page; no `window.location` redirect happens for card payments.
- **"Add payment methods later without new integration"** → new payment methods get toggled on
  in Checkout Builder + wired in Routing, no frontend code change needed since the SDK reads
  available methods from the checkout session/config at runtime.

## 5. Architecture (for the whiteboard / call)

```
Browser                         Your backend (server.js)              Yuno API (sandbox)
--------                        ------------------------              -------------------
GET  /                 ------->  serves checkout.html
GET  /api/config       ------->  returns public key + country
POST /api/create-session ----->  POST /checkout/sessions  ----------->  returns checkout_session
Yuno.initialize()
startCheckout({checkoutSession, elementSelector:'#payment-form', ...})
mountCheckout()  -- renders card form inline
user submits card
yunoCreatePayment(oneTimeToken) fires
                        POST /api/process-payment -->  POST /payments (X-Idempotency-Key) --> status
yuno.continuePayment()  -- required for 3DS/async methods
```

Secret key never touches the browser — only `server.js` holds `YUNO_PRIVATE_SECRET_KEY`.

## 6. Likely Q&A during the role play

- **"Why continuePayment() after every payment, even simple card success?"** — it's a no-op
  when there's nothing left to do; it's required when `sdk_action_required: true` comes back
  (3DS challenge, PIX QR, bank redirect). Calling it unconditionally is the pattern in Yuno's
  own quickstart.
- **"Payment came back DECLINED — how do you debug it?"** — check `status_detail.sub_status` on
  the payment response first, or the payment description trick (set description = expected
  status name) mentioned in the testing-gateway doc; also check whether the routing step is
  actually published and pointing at the right connection.
- **"How do you avoid double-charging on a retry?"** — `X-Idempotency-Key` header on
  `/payments`, generated fresh per attempt, reused only when retrying an unclear failure
  (timeout / 5xx), not on a genuine new attempt.
- **"PCI scope?"** — card data goes straight from the SDK's hosted fields to Yuno, never touches
  your server; you only ever see a one-time token.

## Honest gaps / things to verify before the actual call

- I built this from Yuno's public docs (`docs.y.uno`), fetched today. The PDF referenced a
  dashboard invite/config walkthrough via hyperlinks that didn't survive the PDF-to-text
  extraction — skim your actual invite email in case it differs from the public "Set Up Your
  Account" guide I followed.
- I did not implement customer creation (`/customers`) — checkout sessions don't strictly
  require `customer_id` per the current API schema, so I left it out to keep the demo focused.
  Mention this as a deliberate scope cut if asked, not an oversight.
- Not tested against a live sandbox account (no credentials available in this environment) —
  run it yourself against your real sandbox keys before the call.
