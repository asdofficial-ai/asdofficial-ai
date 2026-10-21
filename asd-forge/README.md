# ASD FORGE — Your business launchpad

## What it actually does
ASD Forge is a **working, browser-based business starter app**, built in one HTML file. It helps independent service sellers create professional offer pages, share a direct WhatsApp sales link, manually track leads, issue PDF/printable invoices, and generate template-based client outreach.

**No account, server, paid AI API, or subscription is needed** for this first version. All business workspace data is saved in your browser's localStorage. Export your JSON backup frequently.

## Start immediately
Open `index.html` in Chrome or another modern browser.

1. Go to **Settings** and enter your business name and WhatsApp number with country code (e.g. `2348012345678`).
2. Go to **Launch studio**, type your offer and price, and click **Publish offer**.
3. Click **Share** on the published offer.
4. **Important:** Before customers can use the link, publish this `index.html` file to an HTTPS static website host. On a local `file://` URL, the generated link only works on the computer that opened the file.
5. When someone messages you, add the lead manually under **Clients & deals**.
6. Create an **Invoice**, then click **Print/PDF** to save or print it. Mark it paid only after confirming the payment independently.

## Deploy to a public URL (free options)
- Upload the folder to a static hosting platform such as Netlify (Netlify Drop), Cloudflare Pages, GitHub Pages, or Render Static Sites.
- Make sure `index.html` is published as the site root.
- Open your HTTPS URL once, set up your business profile, and create your offers there.
- Copy new share links *from the hosted app*, not from `file://`.

## How shared offers work
Each offer's text, price, WhatsApp number and payment URL (if present) is encoded **inside the URL fragment** (`#offer=...`). This means the offer page renders on another device without requiring a database. Previously shared links do not automatically update when you edit or delete a local offer; send your latest link again. Visitors can't place an order within ASD Forge: they request a service by messaging you on WhatsApp. Optional checkout buttons open *your own externally configured* payment link.

## Limitations
- **No backend or cloud account:** offers, clients, invoices, settings and revenue data are **not synchronized between browsers**.
- **Not a payment processor:** payment confirmation is manual and invoices don't prove a real transaction.
- **Not an AI model:** the sales assistant uses well-made message templates, not an AI API.
- **No sales, millionaire or trillionaire guarantees.** The app helps with business operations; revenue comes only from actual customers.
- Protect your device and backups. The local data may contain client contact details. Do not store card numbers, passwords or other sensitive financial data in notes.

## Files
- `index.html` — Complete standalone app; no external dependencies.
- `README.md` — Setup and limitations.

Created as an immediate, practical response to the "trillionaire by tomorrow" challenge.