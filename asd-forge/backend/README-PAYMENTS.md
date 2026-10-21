# ASD Forge payments backend (V5, integration preview)

## Current status (2026-10-21)

ASD Forge uses Paystack **TEST-only** integration code. This does NOT create escrow, a wallet, delayed settlement guarantees or a financial-service licence. No production transfers, automatic payouts or live checkout are allowed by this code. Do not represent TEST funds as real funds.

Payments are blocked until `PAYMENT_MODE=test` AND a **test** Paystack secret (`PAYSTACK_SECRET_KEY=sk_test_...`) are set as **private server-side Render environment variables**. Never add API keys to source, browser JavaScript or GitHub.

To go live, contractually verify Paystack (or a licensed marketplace/escrow partner) can hold, control and release funds after customer approval. Check whether the 1% refund charge and 2% service fee are lawful, contractually supported and adequately cover gateway fees; do not promise a guaranteed 99% refund until confirmed. No direct transfers to sellers are implemented. Buyer/seller identity verification, dispute SLAs, chargebacks, transaction reconciliation, seller KYC/KYB and admin authentication need production hardening before activating real money.

## Server-side API

- `GET /v1/payment/status` — provider setup status and fee policy; explicitly `livePaymentsEnabled: false`.
- `GET /v1/payments/health` — payment module health (does not imply real funds ready).
- `POST /v1/orders` — create quote from published service's server price. Body `{serviceId,buyerName,buyerEmail,idempotencyKey}`. Returns a ONE-TIME buyer token; store privately.
- `GET /v1/orders/:id` — seller/buyer bearer capability required.
- `GET /v1/seller/orders?serviceId=UUID` — seller-only order list.
- `POST /v1/orders/:id/checkout` — buyer-only, Paystack `sk_test_` only. No live key permitted.
- `POST /v1/orders/:id/verify` — verify transaction server-side against Paystack test gateway; amount, reference, currency, domain and email must match.
- `POST /v1/payments/webhook/paystack` — Paystack webhook with raw-body HMAC-SHA512 signature and server-side transaction re-verification.
- `POST /v1/orders/:id/deliver` — seller-only; after verified TEST payment.
- `POST /v1/orders/:id/decision` — buyer-only; accepts or rejects completed delivery. Rejections open dispute review, they do **not** instantly refund money.
- `POST /v1/orders/:id/resolve` — admin-only; authorize a TEST refund or deny dispute.
- `POST /v1/orders/:id/refund` — admin-only; submit a TEST partial refund ONCE following authorization. Provider operation may remain pending; manual reconciliation needed after network errors.
- `POST /v1/orders/:id/refund-check` — admin-only; query refund status from provider.

Never assume a successful HTTP response from Paystack means money is settled; always reconcile the final provider status. The 2% service fee and proposed 1% refund deduction are rounded to kobo, exclude third-party gateway fees and taxes.

## Security controls

- Server-owned offer price and immutable order quote, NGN-only
- Separate bearer capability hashes for seller/buyer, admin-only dispute decisions
- Unique payment reference and idempotency key to reduce double charges
- SQL parameterization, payment state guards, order audit events
- Paystack webhook HMAC SHA512 validation before accepting events
- Server-side transaction verification (amount, reference, currency, email, domain)
- HTTPS gateway provider URL and verified database TLS certificate
- 12KB normal JSON size limit, 64KB webhook limit, order-create rate limit
- **No live payouts, escrow, wallet, automatic releases or live refunds**

## Setup / tests

Run `npm install` then `npm test` from the backend folder. `npm start` runs the Node server using `DATABASE_URL` (PostgreSQL/Neon) provided as a server environment variable. The server creates additive order/event tables at startup.

For Paystack TEST checkout only, set `PAYMENT_MODE=test`, `PAYSTACK_SECRET_KEY=sk_test_...` in the Render backend environment. Configure the Paystack **test** webhook URL as `https://asd-forge-catalog.onrender.com/v1/payments/webhook/paystack`. For admin dispute review (TEST only), configure a unique random `FORGE_ADMIN_API_KEY` at least 32 characters long; don't put it in frontend JavaScript. Without this key, admin resolution and refunds remain disabled.

### State workflow

`awaiting_payment → checkout_pending → funded_test → delivered_test → approved_test`

or

`delivered_test → disputed_test → refund_authorized_test → refund_processing_test → refunded_test`

`disputed_test → approved_test` after admin denial. Approved test service orders generate *no* seller transfer; payout requires licensed settlement arrangement and separate audited implementation.