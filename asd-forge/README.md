# ASD Forge V5 — marketplace and secure payment backend preview

This repository contains the existing ASD Forge public landing page and dashboard, a searchable service marketplace, and a new **Paystack TEST-only payment and order API**. Real-money checkout, escrow, automatic refunds and seller payouts are **not active**. See `backend/README-PAYMENTS.md` for endpoints, security controls and production blockers.

- Landing: `/`
- Seller workspace: `/app/`
- Service discovery: `/app/discover/`
- Catalog and order API: `https://asd-forge-catalog.onrender.com`

## V5 additions

The discovery page now offers non-charging order requests for NGN services. The backend records a server-priced order, keeps distinct buyer and seller authorization, and supports a pending TEST-mode Paystack checkout implementation, verified payment webhooks, delivery acceptance, dispute decisions, and administrator-approved partial refund requests. The proposed 2% completed-order platform fee and 1% eligible-refund fee are displayed in integer kobo amounts.

Live money movement requires a provider-approved controlled-settlement arrangement, identity verification and merchant onboarding, legal/compliance review and additional operational security before public launch. Normal Paystack checkout and split settlement must not be represented as escrow.