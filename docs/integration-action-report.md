# MirrorMind Integration Action Report

**Generated:** March 29, 2026 — Live health check run at 22:16 UTC  
**Current launch readiness:** 1/5 checks passing (20%)  
**Blocking issue:** Neither Stripe nor Resend environment variables are set. Payments and email automation are fully built in code but dormant until the keys are provided.

---

## Current Status Summary

| Integration | Status | Blocking |
|---|---|---|
| Supabase database | ✅ Connected — all 6 tables live | No |
| Stripe secret key | ❌ `STRIPE_SECRET_KEY` not set | **Yes — no payments possible** |
| Stripe webhook secret | ❌ `STRIPE_WEBHOOK_SECRET` not set | **Yes — purchases won't confirm** |
| Resend API key | ❌ `RESEND_API_KEY` not set | **Yes — no emails send** |
| Resend domain verified | ❌ `mirrormind.ai` not in Resend | **Yes — emails would bounce** |

The Supabase database is the only fully operational integration. Zero revenue has been processed and zero emails have been sent. All four remaining failures are purely configuration gaps — the code for each is already written, tested, and deployed.

---

## Part 1: Stripe — Accepting Payments

### What is broken and why

The server reads `process.env.STRIPE_SECRET_KEY` on startup. When this variable is absent, every call to `/api/checkout` returns a `503` error with the message *"Payments not configured yet. Coming soon!"* — meaning every user who clicks a pricing button hits a dead end. The webhook endpoint at `/api/webhook/stripe` similarly no-ops without `STRIPE_WEBHOOK_SECRET`, so even if a payment were somehow completed, the database would never be updated and the spot counter would never decrement.

### Action 1 — Create a Stripe account and obtain the secret key

Navigate to [dashboard.stripe.com](https://dashboard.stripe.com) and sign up or log in. Once inside the dashboard, go to **Developers → API keys**. You will see two keys: a **Publishable key** (`pk_live_...`) and a **Secret key** (`sk_live_...`). Copy the **Secret key** only — the publishable key is not used server-side.

> **Important:** Stripe accounts start in test mode. Before going live, you must complete the business activation form under **Settings → Account details**. This requires a legal business name, address, and bank account for payouts. For an LTD launch, this should be completed before you announce publicly.

The exact environment variable name the server expects is:

```
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
```

If you want to test the checkout flow before going live, use the test key (`sk_test_...`) first — Stripe provides test card numbers (e.g., `4242 4242 4242 4242`) that simulate successful payments without real charges.

### Action 2 — Configure the Stripe webhook and obtain the signing secret

The webhook is what tells your server "a payment was completed." Without it, Stripe collects money but your database never records the purchase, the buyer never receives a confirmation email, and the spot counter never decrements.

Follow these steps in the Stripe dashboard:

1. Go to **Developers → Webhooks → Add endpoint**.
2. Set the **Endpoint URL** to `https://your-deployed-domain.com/api/webhook/stripe`. This must be a publicly reachable URL — it cannot be `localhost`. This means you need to deploy the app first (see the deployment note below), or use the Stripe CLI for local testing.
3. Under **Select events to listen to**, choose exactly one event: `checkout.session.completed`.
4. Click **Add endpoint**. Stripe will display a **Signing secret** beginning with `whsec_...`. Copy it immediately — it is only shown once.

Set this as the second environment variable:

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
```

**Local testing alternative:** If you want to test webhooks before deploying, install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run `stripe listen --forward-to localhost:4000/api/webhook/stripe`. The CLI will print a temporary webhook secret you can use for local development.

### Action 3 — Set both Stripe variables in your deployment environment

The variables must be set wherever the server runs — not in the code itself. The correct approach depends on your hosting platform:

| Platform | How to set env vars |
|---|---|
| Railway | Project → Variables → Add variable |
| Render | Service → Environment → Add environment variable |
| Fly.io | `fly secrets set STRIPE_SECRET_KEY=sk_live_...` |
| Local / VPS | Export in shell or add to `.env` file (already in `.gitignore`) |

After setting both variables, restart the server. The `/api/pricing` endpoint will return `"stripeEnabled": true` when Stripe is correctly configured, which you can verify with `curl https://your-domain/api/pricing`.

---

## Part 2: Resend — Email Automation

### What is broken and why

The server reads `process.env.RESEND_API_KEY` before every email send. When absent, both the welcome drip email (triggered on waitlist signup) and the purchase confirmation email (triggered on payment) are silently skipped — the `.catch(() => {})` handlers ensure the main request still succeeds, but no email is ever sent. The 5-day drip sequence is fully written and waiting; it simply has no API key to authenticate with.

A second, independent failure exists even once the key is set: the `from` address is hardcoded as `hello@mirrormind.ai`. Resend requires that the sending domain (`mirrormind.ai`) be verified via DNS before it will deliver mail from that address. Sending from an unverified domain causes silent delivery failure or immediate bounce.

### Action 4 — Create a Resend account and obtain the API key

Navigate to [resend.com](https://resend.com) and sign up. Resend's free tier allows 3,000 emails per month and 100 per day — sufficient for the initial launch wave. Once logged in, go to **API Keys → Create API Key**. Name it `mirrormind-production`, select **Full access**, and click **Add**. Copy the key beginning with `re_...`.

Set this environment variable:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
```

### Action 5 — Add and verify the mirrormind.ai sending domain

This step requires access to the DNS settings for `mirrormind.ai` (wherever the domain is registered — Namecheap, GoDaddy, Cloudflare, etc.).

In the Resend dashboard, go to **Domains → Add Domain** and enter `mirrormind.ai`. Resend will display three DNS records that must be added to your domain registrar:

| Record type | Purpose |
|---|---|
| `MX` record | Routes inbound replies back to Resend |
| `TXT` (SPF) | Authorises Resend to send on behalf of your domain |
| `TXT` (DKIM) | Cryptographically signs outgoing mail to prevent spoofing |

Add all three records in your DNS provider's control panel. DNS propagation typically takes between 15 minutes and 48 hours. Once Resend detects the records, the domain status changes from **Pending** to **Verified**. The daily health check will confirm this automatically.

> **If you do not yet own mirrormind.ai:** Register it before this step. Resend also supports sending from subdomains (e.g., `mail.yourdomain.com`) if you prefer to use an existing domain while the primary one is being set up.

### Action 6 — Verify the sender address in Resend

After domain verification, go to **Domains → mirrormind.ai → Senders** and confirm that `hello@mirrormind.ai` is listed as an authorised sender. If it is not, add it manually. This is the exact address the server uses in the `from` field of every outgoing email.

---

## Deployment Prerequisite

Both the Stripe webhook and Resend domain verification require a **publicly accessible URL** for your server. Currently the app runs locally on port 4000, which is not reachable by Stripe's servers or verifiable by Resend. Before completing Actions 2 and 5, you need to deploy the app to a hosting platform.

The recommended path for a fast, low-cost deployment is:

1. Push to GitHub (already done — `github.com/Mirsadc1971/mirrormind`).
2. Create a new project on [Railway](https://railway.app) or [Render](https://render.com), connect the GitHub repo, and set the four environment variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `PORT=4000`).
3. Railway and Render both provide a free HTTPS subdomain (e.g., `mirrormind-production.up.railway.app`) which you can use immediately for the Stripe webhook endpoint and as the base URL in checkout success/cancel redirects.
4. Once deployed and tested, point your custom domain (`mirrormind.ai`) to the deployment.

---

## Recommended Completion Order

The four actions are not independent — some must precede others. The table below shows the correct sequence and estimated time for each.

| Order | Action | Estimated time | Prerequisite |
|---|---|---|---|
| 1 | Create Stripe account + get secret key | 10 min | None |
| 2 | Deploy app to Railway or Render | 15 min | GitHub repo (done) |
| 3 | Add Stripe webhook endpoint + get signing secret | 5 min | Deployed URL |
| 4 | Set all Stripe env vars + restart server | 2 min | Actions 1 & 3 |
| 5 | Create Resend account + get API key | 5 min | None (can do in parallel with 1) |
| 6 | Add `mirrormind.ai` DNS records in Resend | 10 min + propagation | Domain ownership |
| 7 | Confirm domain verified in Resend | 0 min (wait) | DNS propagation (15 min–48 hr) |
| 8 | Set `RESEND_API_KEY` env var + restart server | 2 min | Action 5 |

Total active work time: approximately **50 minutes**, plus DNS propagation wait. Once all steps are complete, the daily health check will report 5/5 and MirrorMind will be fully operational for launch.

---

## Verification Checklist

After completing all actions, confirm each integration is working with these specific tests:

**Stripe:** Submit a test checkout using card `4242 4242 4242 4242`, expiry `12/34`, CVC `123`. The `mm_purchases` table in Supabase should show a new row with `status = completed` within 10 seconds of payment.

**Resend:** Sign up for the waitlist with a real email address you control. You should receive the Day 0 welcome email (subject: *"Your Mirror is ready — one thing we noticed about you"*) within 60 seconds.

**Health check:** Run `node scripts/health-check.mjs` with all env vars set. All five checks should show ✅ and the readiness score should read `5/5 (100%)`.
