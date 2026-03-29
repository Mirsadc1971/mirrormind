# MirrorMind — Deployment Guide

**Last updated:** March 2026  
**Repo:** `github.com/Mirsadc1971/mirrormind`  
**Stack:** Node.js (ESM) · Express 5 · Supabase · Stripe · Resend

---

## Before You Deploy

One issue was fixed automatically before this guide was written: `node_modules/` was previously committed to the repo and has now been removed. The repo is clean and deploy-ready. Confirm this is the case with:

```bash
git log --oneline -3
# Should show: "chore: remove node_modules from git tracking" as the most recent commit
```

You will need the following before starting:

| Item | Where to get it |
|---|---|
| GitHub account with access to `Mirsadc1971/mirrormind` | Already set up |
| Supabase service role key | [app.supabase.com](https://app.supabase.com) → Project Settings → API |
| Stripe secret key (optional at deploy time) | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) |
| Resend API key (optional at deploy time) | [resend.com](https://resend.com) → API Keys |

Stripe and Resend keys are optional at first deploy — the app starts without them and returns graceful errors for payment/email features. You can add them after the app is live.

---

## Option A — Deploy to Railway

Railway is the recommended path. It detects Node.js automatically, requires no config files, and the free Starter plan covers a small launch.

### Step 1 — Create a Railway account

Go to [railway.app](https://railway.app) and sign up with your GitHub account. This grants Railway permission to access your repositories.

### Step 2 — Create a new project

From the Railway dashboard, click **New Project** → **Deploy from GitHub repo** → select `Mirsadc1971/mirrormind`.

Railway will detect the `package.json` and automatically:
- Set the build command to `npm install`
- Set the start command to `npm start` (which runs `node server.js`)
- Assign a random public domain (e.g., `mirrormind-production.up.railway.app`)

### Step 3 — Set environment variables

In the Railway project, go to **Variables** and add the following. All five are required for full functionality; the first two are the minimum needed for the app to start.

| Variable | Value | Required to start |
|---|---|---|
| `SUPABASE_URL` | `https://mlsuttoccqcpjhvkfeuv.supabase.co` | **Yes** |
| `SUPABASE_SERVICE_KEY` | Your service_role key from Supabase | **Yes** |
| `STRIPE_SECRET_KEY` | `sk_live_...` from Stripe | No (payments disabled) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe | No (webhook disabled) |
| `RESEND_API_KEY` | `re_...` from Resend | No (emails disabled) |

> **Note:** Do not set `PORT`. Railway injects it automatically. The server already reads `process.env.PORT || 4000`, so it will pick up Railway's value correctly.

### Step 4 — Trigger the first deploy

Railway deploys automatically when you connect the repo. Watch the build log in the **Deployments** tab. A successful deploy ends with:

```
MirrorMind running on port XXXX
```

### Step 5 — Confirm the app is live

Click the generated domain in the Railway dashboard. You should see the MirrorMind landing page. Test the waitlist form — a new row should appear in the `mm_waitlist` table in Supabase.

### Step 6 — Add the Stripe webhook (after deploy)

Now that you have a public URL, go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) and click **Add endpoint**:

- **URL:** `https://your-railway-domain.up.railway.app/api/webhook/stripe`
- **Event:** `checkout.session.completed` (only this one)

After saving, Stripe shows a **Signing secret** (`whsec_...`). Copy it, go back to Railway → Variables, and add `STRIPE_WEBHOOK_SECRET`. Railway will redeploy automatically.

### Step 7 — Add a custom domain (optional)

In Railway → Settings → Domains, click **Add Custom Domain** and enter `mirrormind.ai`. Railway will show a CNAME record to add at your domain registrar. DNS propagation takes 15 min–48 hr.

---

## Option B — Deploy to Render

Render is a solid alternative with a generous free tier. The free tier spins down after 15 minutes of inactivity (cold starts take ~30 seconds), so it is better suited for testing than a live launch. Upgrade to the $7/month Starter plan to eliminate cold starts.

### Step 1 — Create a Render account

Go to [render.com](https://render.com) and sign up with your GitHub account.

### Step 2 — Create a new Web Service

From the Render dashboard, click **New** → **Web Service** → connect your GitHub account → select `Mirsadc1971/mirrormind`.

Configure the service as follows:

| Setting | Value |
|---|---|
| **Name** | `mirrormind` |
| **Region** | Oregon (US West) or closest to your users |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free (or Starter $7/mo to avoid cold starts) |

### Step 3 — Set environment variables

In the **Environment** tab of the Render service, add the same variables as listed in the Railway section above. The same rules apply: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are required; the rest unlock payments and email.

Do not set `PORT` — Render injects it automatically, and the server already handles it correctly.

### Step 4 — Deploy

Click **Create Web Service**. Render will clone the repo, run `npm install`, and start the server. The build log shows progress. A successful deploy ends with the app URL (e.g., `https://mirrormind.onrender.com`).

### Step 5 — Add the Stripe webhook

Follow the same process as Railway Step 6, substituting your Render URL:

- **URL:** `https://mirrormind.onrender.com/api/webhook/stripe`

### Step 6 — Add a custom domain (optional)

In Render → Settings → Custom Domains, add `mirrormind.ai`. Render provides a CNAME record to add at your registrar.

---

## Post-Deploy Checklist

Run through these after the app is live on either platform:

- [ ] Landing page loads at the public URL
- [ ] Waitlist form submits successfully — new row appears in Supabase `mm_waitlist`
- [ ] `/api/health` returns `{ "status": "ok" }` (or equivalent)
- [ ] Stripe test checkout completes — `mm_purchases` row shows `status: completed`
- [ ] Stripe webhook fires — check Stripe Dashboard → Webhooks → recent events
- [ ] Waitlist signup triggers Day 0 welcome email (check inbox + Resend logs)
- [ ] Run `node scripts/health-check.mjs` with all env vars set — readiness score reads `5/5`

---

## Environment Variables — Complete Reference

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL | **Yes** |
| `SUPABASE_SERVICE_KEY` | Service role key (not anon key) — full DB access | **Yes** |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) | For payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) | For purchase confirmation |
| `RESEND_API_KEY` | Resend API key (`re_...`) | For all emails |
| `PORT` | Server port — **do not set manually** on Railway/Render | Auto-injected |

---

## Troubleshooting

**Build fails with `Cannot find module`**
The `node_modules/` removal commit may not have propagated. Run `git pull` locally, confirm `node_modules/` is not in `git ls-files`, then push again.

**App starts but Supabase calls fail**
Confirm `SUPABASE_SERVICE_KEY` is the **service_role** key, not the anon key. Both are shown in Supabase → Project Settings → API — the service_role key is the longer one labelled "secret".

**Stripe webhook returns 400 signature verification failed**
The webhook endpoint uses `express.raw()` middleware, which is correct. The most common cause is copying the wrong secret — make sure you are using the **Endpoint Signing Secret** (shown after creating the webhook endpoint), not the general API key.

**Resend emails not arriving**
Check that `mirrormind.ai` is verified in the Resend dashboard (Domains → status must show "Verified"). If DNS records were added recently, wait up to 48 hours for propagation. Use [mxtoolbox.com](https://mxtoolbox.com) to confirm the DKIM TXT record is live.

**Cold starts on Render free tier**
The free tier hibernates after 15 minutes of inactivity. The first request after hibernation takes 20–30 seconds. Upgrade to the $7/month Starter plan to keep the service always on, or use Railway which does not hibernate on its free tier.
