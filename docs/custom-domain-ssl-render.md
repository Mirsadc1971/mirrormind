# Custom Domain & SSL Setup on Render — MirrorMind

**Target domain:** `mirrormind.ai` (root) + `www.mirrormind.ai`  
**Platform:** Render  
**SSL provider:** Let's Encrypt and Google Trust Services (auto-provisioned by Render) [^1]

---

## Prerequisites

Before starting, confirm the following are in place:

| Requirement | Status |
|---|---|
| MirrorMind deployed on Render with an `*.onrender.com` URL | Required — complete the deployment guide first |
| Ownership of `mirrormind.ai` at a domain registrar | Required |
| Access to your registrar's DNS management panel | Required |
| Render Hobby workspace or higher | Required — the free Hobby workspace supports a maximum of two custom domains across all services [^2] |

---

## How Render SSL Works

Render provides fully managed, free TLS certificates for every custom domain. [^1] There is no manual certificate configuration — Render handles the entire lifecycle automatically. Certificates are issued using both Let's Encrypt and Google Trust Services, and are renewed automatically before expiration. [^1]

Render also enforces HTTPS by default: all HTTP requests to a custom domain are automatically redirected to HTTPS without any configuration on your part. [^1]

The process for getting a custom domain live involves three steps: adding the domain in the Render dashboard, configuring DNS at your registrar, and clicking Verify in the Render dashboard to trigger certificate issuance. [^2]

---

## Step 1 — Add the Custom Domain in the Render Dashboard

Open your MirrorMind service in the Render dashboard and navigate to **Settings → Custom Domains**. Click **+ Add Custom Domain**.

There is an important behaviour to understand here that differs from Railway: Render automatically handles the root/www pairing for you. [^2]

- If you type `www.mirrormind.ai`, Render automatically adds `mirrormind.ai` as well and redirects the root to `www`.
- If you type `mirrormind.ai`, Render automatically adds `www.mirrormind.ai` and redirects `www` to the root.

**Type `mirrormind.ai` and click Save.** Render will add both domains simultaneously. You will see both listed in the Custom Domains section, each with a pending verification status.

> **Plan limit note:** The Hobby workspace supports a maximum of two custom domains across all services. Since Render adds both `mirrormind.ai` and `www.mirrormind.ai` automatically when you add one, this uses both slots. If you need additional domains on other services, you will need to upgrade to a Professional workspace. [^2]

---

## Step 2 — Configure DNS at Your Registrar

After adding the domain in Render, you need to create DNS records at your registrar. The record types differ depending on whether you are configuring the root domain or the `www` subdomain, and on your registrar's capabilities.

> **Important:** Remove any existing `AAAA` records for `mirrormind.ai` before proceeding. Render uses IPv4 only, and `AAAA` records (IPv6) will cause unexpected routing behaviour. [^3]

### For `www.mirrormind.ai` (subdomain — straightforward)

All registrars support a standard CNAME record for subdomains:

| Field | Value |
|---|---|
| **Type** | CNAME |
| **Host / Name** | `www` |
| **Value / Points to** | `mirrormind.onrender.com` (your Render subdomain) |
| **TTL** | 300 (or "Automatic") |

### For `mirrormind.ai` (root / apex domain — registrar-dependent)

Root domains require different record types depending on your registrar's capabilities. Render supports three approaches: [^3]

**Option 1 — ANAME or ALIAS record (preferred where supported)**

Some registrars implement ANAME or ALIAS records, which behave like CNAME records at the root level. Providers that support this include DNSimple, DNS Made Easy, Name.com, and NS1.

| Field | Value |
|---|---|
| **Type** | ANAME or ALIAS |
| **Host / Name** | `@` |
| **Value / Points to** | `mirrormind.onrender.com` |

**Option 2 — CNAME with flattening (Cloudflare, Namecheap, Porkbun)**

Cloudflare, Namecheap, and Porkbun support CNAME flattening at the root, which allows a standard CNAME record to be used:

| Field | Value |
|---|---|
| **Type** | CNAME |
| **Host / Name** | `@` |
| **Value / Points to** | `mirrormind.onrender.com` |

> **Cloudflare-specific note:** If using Cloudflare, you **must** use a CNAME record rather than an A record. [^3] Set the proxy status to **DNS only** (grey cloud) initially during verification. Once the domain is verified and SSL is issued, you can optionally enable the proxy (orange cloud), but be aware this routes traffic through Cloudflare's network rather than directly to Render.

**Option 3 — A record pointing to Render's load balancer IP (fallback)**

If your registrar supports none of the above (GoDaddy, AWS Route 53, Squarespace DNS), use a static A record pointing to Render's load balancer IP:

| Field | Value |
|---|---|
| **Type** | A |
| **Host / Name** | `@` |
| **Value / Points to** | `216.24.57.1` |

This is the least preferred option because it ties your domain to a specific IP address. If Render ever changes their load balancer IP, the record would need updating manually. The CNAME or ALIAS approaches are always preferred where available.

---

## Step 3 — Wait for DNS Propagation

DNS changes propagate at different speeds depending on your registrar and global DNS infrastructure. Most records propagate within 15–60 minutes; worldwide propagation can take up to 72 hours.

To speed up verification, Render recommends flushing the DNS cache in public resolvers after updating your records: [^2]

- [Flush Google Public DNS Cache](https://dns.google/cache)
- [Purge Cloudflare Public DNS Cache](https://1.1.1.1/purge-cache/)
- [Refresh OpenDNS Cache](https://cachecheck.opendns.com/)

Check propagation status using [dnschecker.org](https://dnschecker.org) — enter `mirrormind.ai`, select the record type you created (CNAME or A), and confirm the value is resolving correctly across multiple global locations.

---

## Step 4 — Verify the Domain in the Render Dashboard

Return to your service's **Settings → Custom Domains** in the Render dashboard. Click the **Verify** button next to `mirrormind.ai`.

If verification succeeds, Render immediately begins issuing TLS certificates for both `mirrormind.ai` and `www.mirrormind.ai`. The status indicator next to each domain updates to show a verified state.

If verification fails, DNS has not yet propagated. Wait a few minutes and click Verify again — there is no penalty for retrying. [^2]

> **502 Bad Gateway after verification:** If you see a 502 error immediately after verification succeeds, Render may still be updating its internal routing rules. Wait two to three minutes and refresh the page. [^2]

---

## Step 5 — Confirm SSL Certificate Issuance

Once verification succeeds, visit `https://mirrormind.ai` in your browser. You should see:

- The MirrorMind landing page loading over HTTPS
- A padlock icon in the browser address bar
- No SSL warnings or certificate errors

Certificate issuance is typically instantaneous after domain verification on Render. If an SSL error appears, wait five minutes and hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`).

---

## Step 6 — Update the Stripe Webhook URL

The Stripe webhook endpoint was previously registered against your `*.onrender.com` URL. Now that `mirrormind.ai` is live, update it to use the custom domain.

In the [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks), find your existing endpoint and update the URL to:

```
https://mirrormind.ai/api/webhook/stripe
```

The webhook secret (`STRIPE_WEBHOOK_SECRET`) does not change — it is tied to the endpoint configuration, not the URL. No environment variable update is needed.

---

## Step 7 — Update the Resend Sending Domain

If `mirrormind.ai` is your Resend sending domain (used for `hello@mirrormind.ai`), confirm that the Resend DNS records are still present and verified after any DNS changes. In the [Resend Dashboard → Domains](https://resend.com/domains), the status for `mirrormind.ai` should show **Verified**.

The Resend DKIM and SPF records are separate TXT records and do not conflict with the CNAME or A records added for Render. Both sets of records coexist on the same domain.

---

## Step 8 — Optionally Disable the `onrender.com` Subdomain

Once your custom domain is confirmed working, you can disable the default `mirrormind.onrender.com` subdomain so the app is only reachable at `mirrormind.ai`. This prevents search engines from indexing duplicate content and gives a cleaner production setup.

In Render → Settings → Custom Domains, toggle the **Render Subdomain** setting to **Disabled** and confirm. All requests to `mirrormind.onrender.com` will return a 404 response. You can re-enable it at any time. [^2]

---

## Troubleshooting

### Verification keeps failing

The most common cause is DNS not yet propagating. Use the DNS cache flush links in Step 3 to speed this up, then retry verification. If it continues to fail after 30 minutes, double-check the record value — it must point to `mirrormind.onrender.com`, not to a Railway URL or any other value.

### `AAAA` record conflict

If you have existing `AAAA` (IPv6) records for `mirrormind.ai`, remove them. Render uses IPv4 only, and `AAAA` records will cause some users to receive errors depending on their network. [^3]

### CAA records blocking certificate issuance

If your domain has CAA records restricting which certificate authorities can issue certificates, Render requires entries for both Let's Encrypt and Google Trust Services: [^2]

```
mirrormind.ai.  CAA  0 issue "letsencrypt.org"
mirrormind.ai.  CAA  0 issue "pki.goog; cansignhttpexchanges=yes"
```

If no CAA records exist on your domain, this is not the cause of the issue.

### Cloudflare proxy causing SSL errors

If using Cloudflare with the proxy enabled (orange cloud) and you see SSL errors, set Cloudflare's SSL/TLS mode to **Full** (not Full Strict, not Flexible) in Cloudflare → SSL/TLS → Overview. The "Flexible" mode creates a redirect loop because Render already enforces HTTPS.

Alternatively, disable the Cloudflare proxy entirely (grey cloud) and let traffic route directly to Render — this is simpler and avoids all Cloudflare SSL configuration concerns.

### Free tier cold starts affecting first impression

If you are on Render's free tier, the service hibernates after 15 minutes of inactivity. The first visitor after hibernation will experience a 20–30 second delay while the service wakes up. For a live launch, upgrade to the $7/month Starter plan to keep the service always on.

---

## Post-Setup Verification Checklist

Run through each item after completing all steps:

- [ ] `https://mirrormind.ai` loads the landing page with a padlock icon
- [ ] `https://www.mirrormind.ai` redirects to `https://mirrormind.ai` (or vice versa, depending on which you set as primary)
- [ ] `http://mirrormind.ai` redirects to `https://mirrormind.ai` (Render enforces HTTPS automatically)
- [ ] `mirrormind.onrender.com` returns 404 (if subdomain was disabled in Step 8)
- [ ] Stripe webhook URL updated to `https://mirrormind.ai/api/webhook/stripe`
- [ ] Resend domain `mirrormind.ai` still shows **Verified** status
- [ ] Run `node scripts/health-check.mjs` — all 5 checks pass at `5/5`

---

## DNS Record Summary

| Domain | Record type | Host / Name | Value |
|---|---|---|---|
| `www.mirrormind.ai` | CNAME | `www` | `mirrormind.onrender.com` |
| `mirrormind.ai` | CNAME / ANAME / ALIAS | `@` | `mirrormind.onrender.com` |
| `mirrormind.ai` | A (fallback only) | `@` | `216.24.57.1` |
| `mirrormind.ai` | TXT (SPF) | `@` | Resend SPF record (already set) |
| `resend._domainkey` | TXT (DKIM) | `resend._domainkey` | Resend DKIM record (already set) |

Use the CNAME/ANAME/ALIAS row for your registrar if supported. Fall back to the A record only if your registrar does not support any form of CNAME flattening.

---

## Key Differences from the Railway Guide

| Aspect | Railway | Render |
|---|---|---|
| Root + www pairing | Must add both domains manually | Adds the paired domain automatically |
| Root domain record type | CNAME (flattening required) | CNAME, ANAME, ALIAS, or A record (`216.24.57.1`) |
| Verification step | Automatic (green checkmark appears) | Manual — must click **Verify** button |
| SSL issuance timing | Up to 1 hour after DNS propagation | Near-instant after verification |
| HTTP → HTTPS redirect | Automatic | Automatic |
| Disable default subdomain | Not available | Available (Settings → Render Subdomain toggle) |
| Free tier cold starts | None | 20–30 seconds after 15 min idle |

---

[^1]: [Fully Managed TLS Certificates — Render Docs](https://render.com/docs/tls)
[^2]: [Custom Domains on Render — Render Docs](https://render.com/docs/custom-domains)
[^3]: [Configuring DNS Providers — Render Docs](https://render.com/docs/configure-other-dns)
