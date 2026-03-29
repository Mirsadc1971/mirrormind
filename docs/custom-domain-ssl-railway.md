# Custom Domain & SSL Setup on Railway — MirrorMind

**Target domain:** `mirrormind.ai` (root) + `www.mirrormind.ai`  
**Platform:** Railway  
**SSL provider:** Let's Encrypt (auto-provisioned by Railway) [^1]

---

## Prerequisites

Before starting, confirm the following are in place:

| Requirement | Status |
|---|---|
| MirrorMind deployed on Railway with a `*.up.railway.app` URL | Required — complete the deployment guide first |
| Ownership of `mirrormind.ai` at a domain registrar | Required |
| Access to your registrar's DNS management panel | Required |
| Railway Hobby plan ($5/month) or higher | Required — the Trial plan is limited to 1 custom domain, which prevents adding both `mirrormind.ai` and `www.mirrormind.ai` simultaneously [^1] |

---

## How Railway SSL Works

Railway automatically provisions free SSL certificates via Let's Encrypt for every custom domain added to a service. [^1] The process is fully automatic — you do not configure certificates manually. When you add a domain, Railway:

1. Initiates a certificate request with Let's Encrypt
2. Completes domain validation challenges
3. Issues and installs the certificate
4. Renews automatically when 30 days of validity remain (certificates are valid for 90 days)

Certificate issuance typically completes within one hour of DNS propagation, though it can take up to 72 hours in edge cases. [^2]

---

## Step 1 — Add the Custom Domain in Railway

Open your MirrorMind service in the Railway dashboard and navigate to **Settings → Networking → Public Networking**. Click **+ Custom Domain**.

Type `mirrormind.ai` into the field and confirm. Railway will immediately display a CNAME target value — something like:

```
g05ns7.up.railway.app
```

**Copy this value.** You will need it in the next step. Do not close this screen yet — Railway shows a pending verification indicator that turns green once DNS is confirmed.

Repeat the process to add `www.mirrormind.ai` as a second custom domain, using the same CNAME target value.

> **Plan limit note:** The Hobby plan allows 2 custom domains per service — exactly enough for `mirrormind.ai` and `www.mirrormind.ai`. If you need additional subdomains later (e.g., `api.mirrormind.ai`), they count against this limit. [^1]

---

## Step 2 — Add DNS Records at Your Registrar

The DNS records you need to create depend on your registrar. The key distinction is between the **root domain** (`mirrormind.ai`) and the **www subdomain** (`www.mirrormind.ai`) — they require slightly different handling.

### For `www.mirrormind.ai` (subdomain — straightforward)

All registrars support a standard CNAME record for subdomains:

| Field | Value |
|---|---|
| **Type** | CNAME |
| **Host / Name** | `www` |
| **Value / Points to** | The CNAME target Railway gave you (e.g., `g05ns7.up.railway.app`) |
| **TTL** | 300 (or "Automatic") |

### For `mirrormind.ai` (root / apex domain — registrar-dependent)

Root domains cannot use a standard CNAME record under DNS standards. [^1] Whether you use a CNAME, ALIAS, or ANAME record depends entirely on your registrar:

| Registrar | Record type to use | Notes |
|---|---|---|
| **Cloudflare** | CNAME (with proxy enabled) | Cloudflare handles CNAME flattening automatically |
| **Namecheap** | CNAME | Namecheap supports CNAME flattening at the root |
| **DNSimple** | ALIAS | Use their dynamic ALIAS record type |
| **Porkbun** | CNAME | Supported at root level |
| **GoDaddy** | Not directly supported | Must change nameservers to Cloudflare first |
| **AWS Route 53** | Not directly supported | Must change nameservers to Cloudflare first |
| **Squarespace DNS** | Not directly supported | Must change nameservers to Cloudflare first |

For registrars that do not support root CNAME/ALIAS, the recommended workaround is to point your domain's nameservers to Cloudflare (free), then add the CNAME record there. [^1]

**Root domain record (Cloudflare, Namecheap, Porkbun):**

| Field | Value |
|---|---|
| **Type** | CNAME |
| **Host / Name** | `@` (represents the root domain) |
| **Value / Points to** | The CNAME target Railway gave you |
| **TTL** | Auto |

---

## Step 3 — Wait for DNS Propagation

DNS changes propagate at different speeds depending on your registrar and global DNS infrastructure. Most records propagate within 15–60 minutes; worldwide propagation can take up to 72 hours. [^1]

Check propagation status using [dnschecker.org](https://dnschecker.org) — enter `mirrormind.ai`, select CNAME, and confirm the value matches your Railway CNAME target across multiple global locations.

> **If using Cloudflare proxy (orange cloud):** DNS lookup tools will show Cloudflare IP addresses rather than the Railway CNAME value. This is expected. Verify your settings directly in the Cloudflare dashboard instead of using external checkers. [^2]

---

## Step 4 — Confirm Domain Verification in Railway

Return to the Railway service Settings → Networking panel. Once DNS has propagated, Railway automatically detects the correct CNAME record and marks the domain with a **green checkmark**. This triggers SSL certificate issuance immediately.

If you are using Cloudflare, Railway will also display a **"Cloudflare proxy detected"** message alongside the green checkmark — this is informational and does not indicate a problem. [^1]

---

## Step 5 — Confirm SSL Certificate Issuance

Once the green checkmark appears in Railway, visit `https://mirrormind.ai` in your browser. You should see:

- The MirrorMind landing page loading over HTTPS
- A padlock icon in the browser address bar
- No SSL warnings or certificate errors

If the certificate is not yet issued, the browser will show an SSL error. Wait up to one hour and try again — Railway provisions certificates automatically once DNS is verified.

---

## Step 6 — Update the Stripe Webhook URL

The Stripe webhook endpoint was previously registered against your `*.up.railway.app` URL. Now that `mirrormind.ai` is live, update it to use the custom domain for a professional appearance and to avoid any future dependency on the Railway-generated subdomain.

In the [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks), find your existing endpoint and update the URL to:

```
https://mirrormind.ai/api/webhook/stripe
```

The webhook secret (`STRIPE_WEBHOOK_SECRET`) does not change — it is tied to the endpoint, not the URL. No environment variable update is needed.

---

## Step 7 — Update the Resend Sending Domain

If `mirrormind.ai` is also your Resend sending domain (used for `hello@mirrormind.ai`), confirm that the Resend DNS records are still present and verified after any DNS changes. In the [Resend Dashboard → Domains](https://resend.com/domains), the status for `mirrormind.ai` should show **Verified**.

If you added new DNS records in Step 2 and the Resend domain status reverted to pending, simply wait for propagation — the Resend DKIM and SPF records are separate from the Railway CNAME and do not conflict.

---

## Troubleshooting

### Certificate stuck on "Validating Challenges"

This is the most common issue when using Cloudflare. Railway's Let's Encrypt validation needs to reach the origin server directly, but Cloudflare's proxy can intercept the challenge.

**The toggle trick:** Temporarily turn the Cloudflare proxy **off** (grey cloud) on the `mirrormind.ai` CNAME record. Wait for Railway to issue the certificate — the green checkmark will appear in the Railway dashboard. Then turn the proxy back **on** (orange cloud). [^2]

### `ERR_TOO_MANY_REDIRECTS`

This occurs when Cloudflare's SSL mode is set to "Flexible" while Railway also enforces HTTPS, creating a redirect loop. Fix it by setting Cloudflare SSL/TLS mode to **Full** (not Full Strict, not Flexible) in Cloudflare → SSL/TLS → Overview. [^2]

### CAA records blocking certificate issuance

If your domain has CAA records that restrict which certificate authorities can issue certificates, Let's Encrypt may be blocked. Check with:

```bash
dig CAA mirrormind.ai
```

If CAA records exist, ensure Let's Encrypt is included:

```
mirrormind.ai.  CAA  0 issue "letsencrypt.org"
```

If no CAA records are returned, this is not the cause of the issue. [^2]

### Root domain not resolving

If `mirrormind.ai` does not resolve but `www.mirrormind.ai` works, your registrar likely does not support CNAME flattening at the root. Transfer DNS management to Cloudflare (free) and add the CNAME record there. [^1]

### Green checkmark in Railway but browser still shows SSL error

The certificate may still be provisioning. Wait 15–30 minutes and hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`). If the error persists after one hour, remove the custom domain from Railway and re-add it to trigger a fresh certificate request.

---

## Post-Setup Verification Checklist

Run through each item after completing all steps:

- [ ] `https://mirrormind.ai` loads the landing page with a padlock icon
- [ ] `https://www.mirrormind.ai` loads the landing page with a padlock icon
- [ ] `http://mirrormind.ai` redirects to `https://mirrormind.ai` (Railway enforces HTTPS automatically)
- [ ] Stripe webhook URL updated to `https://mirrormind.ai/api/webhook/stripe`
- [ ] Resend domain `mirrormind.ai` still shows **Verified** status
- [ ] Run `node scripts/health-check.mjs` — all 5 checks pass at `5/5`

---

## DNS Record Summary

| Domain | Record type | Host / Name | Value |
|---|---|---|---|
| `www.mirrormind.ai` | CNAME | `www` | Railway CNAME target (e.g., `g05ns7.up.railway.app`) |
| `mirrormind.ai` | CNAME / ALIAS / ANAME | `@` | Railway CNAME target (e.g., `g05ns7.up.railway.app`) |
| `mirrormind.ai` | TXT (SPF) | `@` | Resend SPF record (already set) |
| `resend._domainkey` | TXT (DKIM) | `resend._domainkey` | Resend DKIM record (already set) |

The Resend records and the Railway CNAME records coexist on the same domain without conflict.

---

[^1]: [Working with Domains — Railway Docs](https://docs.railway.com/networking/domains/working-with-domains)
[^2]: [Troubleshooting SSL — Railway Docs](https://docs.railway.com/networking/troubleshooting/ssl)
