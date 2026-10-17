# OG CAPS commerce backend

Express and PostgreSQL/Prisma backend for the OG CAPS storefront. Express serves files from `public/` and falls back to `public/index.html` for non-API GET routes so path-based frontend routes work. Existing root landing-page files are not used or modified by the backend.

## Requirements and setup

- Node.js 20 or newer and npm
- PostgreSQL
- A Stripe account and webhook endpoint for real checkout

1. Copy `.env.example` to `.env`; set `DATABASE_URL`, choose `PHP_PER_USD` (default 57.5 pesos per US dollar), and choose `SESSION_TTL_DAYS` (1–30, default 7). Configure `ADMIN_EMAIL` and `ADMIN_PASSWORD` together if an administrator account should be seeded. Local development requires at least 8 password characters; production requires at least 12.
2. Install dependencies: `npm install`
3. Generate Prisma client and create the development database schema: `npm run db:generate` then `npm run db:migrate`
4. Add clearly labeled sample-only products and collections: `npm run db:seed`
5. Start locally: `npm run dev`

For deployment, use `npm run db:deploy` against an already provisioned PostgreSQL database, then `npm start`. Never use development migration commands against production.

## Vercel static demo deployment

Vercel deploys this project as a static, read-only storefront using `vercel.json` and `npm run build:vercel`. It serves the files in `public/` and does not start the Express or Prisma backend, so no database or environment variables are required. The included sample catalog supports browsing, search, filters, currency display, and a local demo bag. Prices and stock are placeholders; checkout, accounts, order history, and administration are unavailable. Do not treat the sample catalog as real products, prices, or inventory.

Import the `OG-CAPS` GitHub repository into Vercel and deploy with the repository's default settings. To make the storefront dynamic and enable checkout, accounts, and administration, deploy the Express backend to a host with PostgreSQL support (such as Render), or connect it to a separately provisioned PostgreSQL provider and configure `DATABASE_URL` there. Vercel can use external databases; it simply does not create one automatically.

## Render demo deployment

The repository includes a Render Blueprint in `render.yaml`. To create the free demo:

1. Push this project to the empty GitHub repository and sign in to Render.
2. In Render, create a new Blueprint from `pangsspogi/og.caps` and approve the `og-caps-demo` web service and `og-caps-db` PostgreSQL database.
3. Wait for the first deploy to complete, then open the service's `onrender.com` URL. The start command applies migrations and seeds the sample-only catalog. `RENDER_EXTERNAL_URL` is automatically included in the API's allowed origins.

This is a temporary demo, not production hosting: Render's free web service can sleep when idle, and its free PostgreSQL database expires after 30 days. The sample catalog is explicitly non-purchasable, Stripe is not configured, and no real payment processing is enabled. Do not enter real customer data. Render's filesystem is ephemeral; media included in `public/` is restored from the repository at each deploy. Before a production launch, upgrade to persistent hosting, configure a strong admin account and Stripe secrets in Render, and review the security and known limitations below.

## API overview

- Canonical API prefix: `/api/v1` (`/api` aliases remain available)
- `GET /api/v1/store-config` exposes the configured PHP-per-USD display conversion rate
- `GET /api/v1/health`
- `GET /api/v1/products?q=black&page=1&limit=24&sort=featured&minPrice=1000&maxPrice=5000&color=black&inStock=true` (`sort` also accepts `newest`, `oldest`, `price_asc`, `price_desc`, `name_asc`, and `name_desc`)
- `GET /api/v1/products/:slug`
- Product responses preserve `imageUrl` and also expose an `images` array. Admin product `imageUrl` accepts a safe `/assets/...` path or an absolute HTTPS URL.
- `GET /api/v1/collections`, `GET /api/v1/collections/:slug`, and `GET /api/v1/collections/:slug/products` (supports the same filters, sort, and pagination)
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`
- Login/register set `ogcaps_session` (HttpOnly) and `ogcaps_csrf` (JS-readable) cookies. Use credentialed requests; send the CSRF cookie value as `x-csrf-token` on state-changing requests while signed in. Logout revokes the persisted session.
- `POST /api/v1/cart/validate` with `{ "items": [{ "productId": "...", "quantity": 1 }] }`
- `POST /api/v1/orders/checkout` with `items`, `email`, `successUrl`, and `cancelUrl`; returns `orderId` and Stripe `checkoutUrl`
- `GET /api/v1/orders` and `GET /api/v1/orders/:id` return only the signed-in account's orders
- Administrator-cookie-protected: `GET /api/v1/admin/products`, `POST /api/v1/admin/product-images` (multipart field `image`, JPEG/PNG/WebP up to 5 MB), `GET /api/v1/admin/orders`, `GET /api/v1/admin/inventory`, `PATCH /api/v1/admin/orders/:id/fulfillment` with `{ "fulfillmentStatus": "PROCESSING" | "FULFILLED" | "UNFULFILLED" }`, and `PATCH /api/v1/admin/inventory/:productId` with `{ "stock": 0 }`
- Admin catalog writes: `POST /api/v1/admin/products`, `PATCH/DELETE /api/v1/admin/products/:id`, and `POST /api/v1/admin/collections`; products can be marked featured for the homepage and featured sort order
- `POST /api/v1/payments/webhook` is reserved for Stripe's signed webhook delivery

The guest cart is client-held in local storage, not a server-side cart record. Its contents are untrusted: validation and checkout accept product IDs and quantities only; the server reloads active products, checks stock, and calculates prices from the database. Product prices are stored in USD for checkout. The storefront lets shoppers switch between USD and estimated PHP display prices, and administrators can enter prices in either currency; PHP amounts are converted using `PHP_PER_USD` (default 57.5). Keep that configured rate up to date. Checkout and Stripe charges remain USD. Checkout reserves stock transactionally before creating a Stripe session; a session-creation error restores the reservation. Paid orders are marked paid only from a verified Stripe event whose session reports `payment_status: paid`. Event IDs are stored uniquely for webhook idempotency. Expired or failed async payments release inventory once.

The seed creates visible but non-purchasable sample-only catalog rows in the frontend's `new-arrivals`, `fitted-caps`, `vintage-caps`, and `accessories` collections. Their prices and stock counts are placeholders, not real stock or offers; do not use seeded inventory as an actual availability statement.

## Replacing media

- Replace the original SVG campaign poster at `public/assets/images/campaigns/hero-poster.svg`, or update the `poster` attribute in `public/index.html` and matching CSS background URL in `public/css/global.css`.
- The supplied videos are installed as `public/assets/videos/hero-campaign.mp4` (homepage hero) and `public/assets/videos/collection-film.mp4` (editorial section). Replace them with original or licensed campaign footage when ready; the browser uses local image fallbacks when videos are missing or unavailable.
- Replace the original SVG category illustrations under `public/assets/images/categories/` with licensed OG CAPS photography.
- The supplied sample images are installed under `public/assets/images/products/` and assigned to sample catalog products. Admins can upload JPEG, PNG, or WebP product photos (up to 5 MB) on the Products page; local and Render uploads are stored under `public/assets/images/products/uploads/`, while Vercel uploads use the connected public Blob store. Alternatively, set `imageUrl` to a same-origin `/assets/...` path or HTTPS URL using the admin API. With no product photo the storefront shows a neutral cap placeholder. The local/Render upload directory is ephemeral on hosts that do not provide persistent disks.

In Stripe, configure a webhook URL of `https://<your-host>/api/v1/payments/webhook` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`; place the endpoint signing secret in `STRIPE_WEBHOOK_SECRET`. Set `STRIPE_SECRET_KEY` and keep the signing secret private. Checkout requires both Stripe values and returns a service-unavailable response if missing. `successUrl`/`cancelUrl` must use an origin listed in `CORS_ORIGINS`; use fixed storefront return URLs.

## Security and known limitations

The backend uses Helmet, origin allowlisting with credentialed CORS, request-size limits, API/auth rate limits, Zod validation, bcrypt password hashes, HttpOnly SameSite=Lax session cookies, opaque server-side PostgreSQL sessions, session revocation, a session-bound double-submit CSRF token, and database-backed role checks. Cookies are Secure in production. Set `TRUST_PROXY` only to the number of trusted reverse-proxy hops when deployed behind a proxy; configure the frontend to send credentials and `x-csrf-token`. Serve the application over HTTPS.

This is a foundation, not a production-readiness claim. Inventory and color are currently tracked at the product level; per-size/color variant stock and a normalized product-image table are not implemented. Saved customer addresses, shipping/tax calculation, refunds, payment reconciliation tooling, email, account recovery, persistent guest carts, inventory reservation expiry without Stripe's expiry webhook, inventory change audit history, and protection against all multi-region/payment-provider failure modes are also not implemented. Fulfillment currently supports unfulfilled, processing, and fulfilled states, rather than a full shipped/delivered/refunded lifecycle. Webhook handling acknowledges unknown events after recording them; monitor delivery and reconcile orders with Stripe. Order status is not exposed to unauthenticated guests. Build operational monitoring, backups, privacy/compliance controls, and deployment-specific abuse defenses before production use.

## Tests

Run `npm test` for cart pricing, CSRF/session token, and admin-role helper tests. Database migration, seed, Stripe webhook, and full HTTP integration tests require configured services and credentials and are not covered by these unit tests.
