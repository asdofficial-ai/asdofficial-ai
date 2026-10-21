# ASD Forge — Version 3 beta

Business launchpad for solo freelancers and independent service providers.

## Public experience
- Landing page at `/` with one call-to-action at the bottom; local signup and app at `/app/`.
- Dashboard, studio, customer pipeline, invoices, growth guidance.
- Notifications with 2% proposed seller fee, 1% proposed refund fee, seller responsibilities, and payment limits.
- Read-to-end Terms of Service requirement before service publishing.
- Editable profile name, business name, interests, description, WhatsApp, photo gallery upload (local device only).
- Local orders and delivered-work tracking, buyer acceptance or rejection (rejection requires reason), handoff via shareable reference.
- Demonstration fee calculation: accepted order seller 98%; eligible refund buyer 99%.

## Payment architecture proposal (NOT IMPLEMENTED)
1. Customer commits to order and pays at licensed PSP checkout or unique PSP-managed transfer account.
2. Server verifies webhook, ties payment reference to order, and records actual custody/settlement status with the licensed partner.
3. Service provider delivers and submits evidence. Buyer confirms acceptance or raises a dispute.
4. On verified acceptance, service backend instructs payout, 2% platform fee (subject to PSP fees/tax).
5. On **eligible** rejection after defined review criteria, backend requests a 99% partial refund to the original payment method, with planned 1% handling fee (subject to provider capability and disclosures). Never mark refunded before a verified PSP confirmation.
6. Set clear deadlines, escalation for unresponsive parties and fraud checks; no client-generated reference is sufficient proof without authenticating their account on the server.
7. Avoid taking funds into ASD Forge's own unlicensed wallet or a personal bank account. Partner terms, licensing, KYC, and legal review required.

## Important limits
All demo orders, decision references, accounts, photo uploads and notifications save **only in this browser**. They do not verify buyer identity, escrow funds, pay sellers, accept deposits or process refunds. No provider is connected. The beta signup is not secure cloud authentication and should not be used for financial data. Payment terms are proposed, not a binding promise for actual orders.

## Tests
`node /mnt/data/test_forge_unit.js` for core fee/rejection/acceptance checks in development environment. JavaScript syntax parsed with Node 22. Full cross-device browser interaction tests are pending due browser tool restrictions.