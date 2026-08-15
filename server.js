require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const {
  YUNO_PUBLIC_API_KEY,
  YUNO_PRIVATE_SECRET_KEY,
  YUNO_ACCOUNT_ID,
  YUNO_API_BASE = 'https://api-sandbox.y.uno/v1',
  PORT = 3000,
} = process.env;

if (!YUNO_PUBLIC_API_KEY || !YUNO_PRIVATE_SECRET_KEY || !YUNO_ACCOUNT_ID) {
  console.warn(
    '[WARN] Missing YUNO_PUBLIC_API_KEY / YUNO_PRIVATE_SECRET_KEY / YUNO_ACCOUNT_ID in .env — copy .env.example to .env and fill them in from https://dashboard.y.uno/developers'
  );
}

function yunoHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'public-api-key': YUNO_PUBLIC_API_KEY,
    'private-secret-key': YUNO_PRIVATE_SECRET_KEY,
    ...extra,
  };
}

// Frontend needs the public key + a default country to initialize the SDK.
// Never expose YUNO_PRIVATE_SECRET_KEY here — that one stays server-side only.
app.get('/api/config', (req, res) => {
  res.json({
    publicKey: YUNO_PUBLIC_API_KEY,
    countryCode: 'US',
    language: 'en-US',
  });
});

// Step 1: create a checkout session (backend-to-backend call).
// https://docs.y.uno/reference/checkout-sessions/create-checkout-session
app.post('/api/create-session', async (req, res) => {
  try {
    const {
      amount = 1000, // smallest-unit-agnostic demo value; Yuno expects the numeric amount, e.g. 1000 = $10.00 USD in this sandbox setup
      currency = 'USD',
      country = 'US',
    } = req.body || {};

    const merchant_order_id = `order-${Date.now()}`;

    const response = await fetch(`${YUNO_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: yunoHeaders(),
      body: JSON.stringify({
        account_id: YUNO_ACCOUNT_ID,
        merchant_order_id,
        payment_description: 'Yunique Fashion Store - test order',
        country,
        amount: { currency, value: amount },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('create-session failed:', data);
      return res.status(response.status).json(data);
    }

    // Return exactly what the frontend needs to init the SDK + re-use later.
    res.json({
      checkout_session: data.checkout_session,
      merchant_order_id,
      amount,
      currency,
      country,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'create-session failed', detail: err.message });
  }
});

// Step 2: create the payment using the one-time token the SDK hands back
// in yunoCreatePayment(). https://docs.y.uno/reference/payments/create-payment
app.post('/api/process-payment', async (req, res) => {
  try {
    const {
      one_time_token,
      checkout_session,
      merchant_order_id,
      amount,
      currency,
      country,
    } = req.body || {};

    if (!one_time_token || !checkout_session) {
      return res.status(400).json({ error: 'one_time_token and checkout_session are required' });
    }

    const response = await fetch(`${YUNO_API_BASE}/payments`, {
      method: 'POST',
      headers: yunoHeaders({ 'X-Idempotency-Key': crypto.randomUUID() }),
      body: JSON.stringify({
        account_id: YUNO_ACCOUNT_ID,
        merchant_order_id,
        description: 'Yunique Fashion Store - test order',
        country,
        amount: { currency, value: amount },
        workflow: 'SDK_CHECKOUT',
        checkout: { session: checkout_session },
        payment_method: {
          token: one_time_token,
          detail: {
            card: { capture: true }, // single-step: authorize + capture together
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('create-payment failed:', data);
      return res.status(response.status).json(data);
    }

    // sdk_action_required tells the frontend whether to call yuno.continuePayment()
    // (needed for 3DS, PIX, and other async methods).
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'process-payment failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Yuno checkout demo running at http://localhost:${PORT}`);
});
