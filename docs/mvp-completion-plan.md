# MirrorMind — MVP Completion Plan

**Date:** 30 March 2026  
**Author:** Manus AI  
**Version:** 1.0  
**Status:** Active — tracks all remaining work to shippable MVP

---

## 1. Current State Assessment

MirrorMind has progressed from a concept to a substantially functional product. The core product loop — intake questionnaire, archetype assignment, Mirror Report generation, AI Twin chat, friend survey, and decision tracker — is fully operational and deployed on Railway with auto-deploy from GitHub. The 365-day growth plan system, including the Plan dashboard, weekly check-in form, progress visualization, quarterly checkpoints, and Year 2 Plan generation, has been built and wired to a Supabase PostgreSQL database containing ten tables across two migration waves.

The most recent engineering session added four significant capabilities: an animated SVG progress ring with streak and completion statistics, comprehensive mobile responsiveness across all inner screens, per-IP rate limiting on five critical endpoints, and LLM retry logic with exponential backoff. A toast notification system now replaces all browser `alert()` calls for graceful error handling.

The following table summarises the completion status of every major subsystem.

| Subsystem | Completion | Notes |
|---|---|---|
| Intake + Archetype Assignment | 100% | Canonical 8 archetypes enforced via LLM prompt |
| Mirror Report | 100% | Tier-gated content, shareable quote, blind spots |
| AI Twin Chat | 100% | Archetype-specific tone, session memory |
| Friend Survey + Gap Analysis | 100% | Token-based sharing, LLM gap analysis |
| Decision Tracker | 100% | Prediction + 6-month recall |
| 365-Day Growth Plan Dashboard | 95% | Week/quarter display, habit card, check-in form, progress ring |
| Weekly Check-In System | 95% | Form, Twin response, history list, Supabase persistence |
| Quarterly Checkpoints | 90% | 4-question flow, Twin synthesis, archetype revision logic |
| Year 2 Plan | 90% | Generation endpoint, display UI, tier gating |
| Authentication | 100% | Magic link via Resend, session tokens, account page |
| Stripe Payments | 70% | Checkout flow coded; **price IDs are placeholders** |
| Email System | 80% | All email functions coded; **no cron job for weekly delivery** |
| Rate Limiting + Error Handling | 100% | Per-IP limits, LLM retry, global error handler, toasts |
| Mobile Responsiveness | 90% | Plan, Account, Year 2 screens; landing page was already responsive |
| Database Schema | 100% | 10 Supabase tables with indexes |

**Overall estimate: approximately 80% complete toward a shippable MVP.**

---

## 2. Remaining Work Items

The remaining work falls into three categories: **configuration tasks** that require manual action in external dashboards, **engineering tasks** that require code changes, and **validation tasks** that require testing and verification.

### 2.1 Configuration Tasks

These items do not require code changes but are essential for the product to accept real payments and deliver automated emails.

#### Task C1: Create Stripe Products and Price IDs

The Stripe checkout flow is fully coded with a fallback `price_data` mode, but six real Stripe Price IDs are needed for production subscriptions. The server reads these from environment variables, falling back to `price_PLACEHOLDER_*` values that trigger the `price_data` fallback.

| Product | Interval | Monthly Price | Annual Price | Env Variable |
|---|---|---|---|---|
| Core | Monthly | $9.97/mo | — | `STRIPE_PRICE_CORE_MONTHLY` |
| Core | Annual | — | $99.97/yr | `STRIPE_PRICE_CORE_ANNUAL` |
| Social | Monthly | $16.77/mo | — | `STRIPE_PRICE_SOCIAL_MONTHLY` |
| Social | Annual | — | $167.70/yr | `STRIPE_PRICE_SOCIAL_ANNUAL` |
| Deep | Monthly | $27.97/mo | — | `STRIPE_PRICE_DEEP_MONTHLY` |
| Deep | Annual | — | $279.97/yr | `STRIPE_PRICE_DEEP_ANNUAL` |

**Steps to complete:**

1. Log in to the Stripe Dashboard at [dashboard.stripe.com](https://dashboard.stripe.com).
2. Navigate to **Products** and create three products: "MirrorMind Core", "MirrorMind Social", and "MirrorMind Deep".
3. For each product, create two recurring prices: one monthly and one annual (annual saves 2 months).
4. Copy each Price ID (format: `price_1Abc...`).
5. In the Railway dashboard, navigate to the MirrorMind service's **Variables** tab.
6. Set the six `STRIPE_PRICE_*` environment variables plus `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
7. Redeploy the service (Railway auto-deploys on variable change).

**Estimated time:** 30 minutes.  
**Owner:** You (requires Stripe Dashboard access).  
**Dependencies:** None.  
**Risk:** Low. The fallback `price_data` mode means the app works without real price IDs, but Stripe's subscription management features (customer portal, proration, upgrades) require real Price objects.

#### Task C2: Configure Resend Domain Verification

The email system uses `hello@mirrormind.ai` as the sender address. Resend requires domain verification (DNS records) before emails from a custom domain are delivered reliably. Without verification, emails may land in spam or be rejected entirely.

**Steps to complete:**

1. Log in to [resend.com/domains](https://resend.com/domains).
2. Add the domain `mirrormind.ai`.
3. Add the required DNS records (SPF, DKIM, DMARC) to your domain registrar.
4. Wait for verification (typically 5–30 minutes).
5. Set the `RESEND_API_KEY` environment variable in Railway if not already set.

**Estimated time:** 30 minutes (plus DNS propagation wait).  
**Owner:** You (requires domain registrar access).  
**Dependencies:** None.  
**Risk:** Medium. Without domain verification, magic link emails and weekly habit emails may not be delivered. The product is functional without email, but the growth plan's weekly cadence depends on it.

#### Task C3: Set Up Railway Cron for Weekly Habit Emails

The `/api/send-weekly-habit` endpoint exists and the `sendWeeklyHabitEmail` function is fully coded. What is missing is a scheduled trigger that queries all active users every Monday morning and sends each one their personalised weekly habit email.

**Steps to complete:**

1. Create a new cron job endpoint `/api/cron/weekly-emails` that:
   - Queries `mm_users` for all users with `tier != 'free'` and `plan_start_date IS NOT NULL`
   - Calculates each user's current week based on their `plan_start_date`
   - Fetches the week's habit from the 365-day plan data
   - Calls `sendWeeklyHabitEmail` for each user
   - Returns a summary of emails sent
2. Add a shared secret (`CRON_SECRET`) to authenticate the cron request.
3. In Railway, configure a cron job that hits `https://your-domain.railway.app/api/cron/weekly-emails` every Monday at 6:00 AM UTC with the `CRON_SECRET` header.

**Estimated time:** 1–2 hours (code + Railway configuration).  
**Owner:** Manus (code) + You (Railway cron setup).  
**Dependencies:** Task C2 (domain verification) for reliable email delivery.  
**Risk:** Low. The growth plan works without weekly emails — users can check in manually via the Plan dashboard.

---

### 2.2 Engineering Tasks

These items require code changes and can be handled by Manus in subsequent sessions.

#### Task E1: Batch Weekly Email Sender Endpoint

The current `/api/send-weekly-habit` endpoint sends a single email to a single user. A batch endpoint is needed for the cron job.

**Scope:**

- New endpoint: `POST /api/cron/weekly-emails`
- Authentication: `Authorization: Bearer ${CRON_SECRET}` header check
- Logic: Query all active paid users, calculate each user's current week, look up the archetype-specific habit for that week, call `sendWeeklyHabitEmail` for each
- Also check for checkpoint weeks (13, 26, 39, 52) and send `sendCheckpointReminderEmail` when applicable
- Return: `{ sent: N, errors: N, details: [...] }`

**Estimated time:** 2 hours.  
**Dependencies:** None (can be built before C2 and C3).

#### Task E2: Checkpoint History View

The checkpoint system stores data in `mm_checkpoints` and the `/api/checkpoints` GET endpoint returns the history. The frontend does not yet have a dedicated view for reviewing past checkpoints.

**Scope:**

- Add a "Checkpoint History" section below the check-in history on the Plan screen
- Show each completed checkpoint with: quarter number, date, forward commitment, Twin synthesis (expandable)
- Highlight the current or upcoming checkpoint with a countdown

**Estimated time:** 3 hours.  
**Dependencies:** None.

#### Task E3: Archetype CSS Theming on Report Page

Each of the eight archetypes has a distinct colour palette defined in the archetype flow system document. The report page currently uses a single visual style for all archetypes. Adding archetype-specific theming would make the report feel more personalised.

**Scope:**

- Define 8 CSS colour sets (primary, secondary, accent) mapped to archetype names
- Apply the canonical archetype's colour set to the report container via a CSS class
- Update the progress ring, habit card, and checkpoint badge colours to match

**Estimated time:** 2–3 hours.  
**Dependencies:** None.

#### Task E4: Voice Input on Intake and Twin Chat

The `/api/transcribe` endpoint (Whisper) exists and works. The frontend has no microphone button.

**Scope:**

- Add a microphone button to each intake question textarea
- Add a microphone button to the Twin chat input
- Use `MediaRecorder` API to capture audio, POST to `/api/transcribe`, and insert the transcribed text
- Show recording state with a pulsing indicator

**Estimated time:** 3–4 hours.  
**Dependencies:** None.

#### Task E5: Landing Page Final Polish

Minor visual improvements to the landing page for launch readiness.

**Scope:**

- Verify all pricing card CTAs link to the correct checkout flow
- Ensure the "Growth Plan" section accurately describes the current product
- Add social proof placeholder section (testimonials, user count)
- Verify FAQ answers match current product behaviour

**Estimated time:** 2 hours.  
**Dependencies:** Task C1 (Stripe price IDs) for payment flow verification.

---

### 2.3 Validation Tasks

These items ensure the product works correctly end-to-end before launch.

#### Task V1: Full End-to-End User Journey Test

A manual walkthrough of the complete user journey to verify every screen, API call, and data flow works correctly.

**Test script:**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Visit landing page | Hero, pricing, FAQ, growth plan sections render correctly |
| 2 | Click "Begin Your Mirror" | Intake screen loads, 20 questions displayed |
| 3 | Answer all 20 questions | Loading screen appears, profile generated |
| 4 | View Mirror Report | Report renders with archetype, blind spots, shadow self, etc. |
| 5 | Open AI Twin chat | Twin responds in archetype-specific tone |
| 6 | Send friend survey link | Survey link generated, shareable |
| 7 | Navigate to Plan screen | Current week, habit card, check-in form displayed |
| 8 | Submit a check-in | Twin response appears, progress ring updates |
| 9 | View check-in history | Previous check-in appears in history list |
| 10 | Navigate to Account screen | Email, archetype, plan week, subscription status shown |
| 11 | Send magic link | Email received, clicking link verifies account |
| 12 | Test Stripe checkout | Checkout session created, redirect to Stripe works |
| 13 | Test mobile layout | All screens render correctly at 375px width |
| 14 | Test rate limiting | 11th intake request returns 429 |
| 15 | Test LLM failure recovery | Simulated failure triggers retry, toast on final failure |

**Estimated time:** 2–3 hours.  
**Owner:** You + Manus.  
**Dependencies:** Tasks C1, C2 for full payment and email testing.

#### Task V2: Edge Case and Error Testing

Targeted testing of failure modes and boundary conditions.

| Test Case | Method | Expected Behaviour |
|---|---|---|
| Expired magic link token | Use token after 1 hour | "Token expired" error, prompt to resend |
| Empty check-in submission | Submit with blank fields | Validation error, form not submitted |
| Duplicate check-in for same week | Submit twice for week N | Second submission overwrites or is rejected |
| LLM timeout | Disconnect network during report generation | Retry logic fires, toast after 3 failures |
| Rate limit exceeded | Send 11 requests to `/api/intake` in 1 minute | 429 response on 11th request |
| Invalid Stripe price ID | Attempt checkout with placeholder ID | Fallback `price_data` mode activates |
| Session expiry | Clear cookies, revisit plan screen | Graceful redirect to intake or login |
| Year 2 access without Deep tier | Navigate to Year 2 as free user | "Locked" state displayed |
| Checkpoint at week 13 | Set plan week to 13, load plan | Checkpoint notice appears |

**Estimated time:** 2 hours.  
**Owner:** Manus + You.  
**Dependencies:** Task V1 completed first.

---

## 3. Dependency Graph

The following diagram shows the dependency relationships between all remaining tasks. Tasks without incoming arrows can be started immediately.

```
C1 (Stripe Products) ──────────────────────────┐
                                                 ├──→ V1 (E2E Test) ──→ V2 (Edge Cases)
C2 (Resend Domain) ──→ C3 (Railway Cron) ──────┘          ↑
                              ↑                            │
                        E1 (Batch Sender) ─────────────────┘

E2 (Checkpoint History) ──→ V1
E3 (Archetype Theming) ──→ V1
E4 (Voice Input) ──→ V1
E5 (Landing Polish) ──→ V1
```

**Critical path:** C1 → V1 → V2 → Launch. Everything else runs in parallel.

---

## 4. Timeline and Sprint Plan

The remaining work is organised into three sprints. Sprint 1 focuses on unblocking payments and email delivery. Sprint 2 adds polish features. Sprint 3 is validation and launch preparation.

### Sprint 1: Payments and Email Infrastructure (Days 1–2)

| Day | Task | Time | Owner |
|---|---|---|---|
| Day 1 AM | C1: Create Stripe products and set Railway env vars | 30 min | You |
| Day 1 AM | C2: Verify Resend domain (DNS records) | 30 min | You |
| Day 1 PM | E1: Build batch weekly email sender endpoint | 2 hrs | Manus |
| Day 1 PM | C3: Configure Railway cron job | 30 min | You |
| Day 2 AM | Verify Stripe checkout with real price IDs | 1 hr | You + Manus |
| Day 2 PM | Verify weekly email delivery with test user | 1 hr | You + Manus |

**Sprint 1 total: ~6 hours of work across 2 days.**

### Sprint 2: Polish and Feature Completion (Days 3–5)

| Day | Task | Time | Owner |
|---|---|---|---|
| Day 3 | E2: Checkpoint history view on Plan screen | 3 hrs | Manus |
| Day 3 | E3: Archetype CSS theming on report page | 2 hrs | Manus |
| Day 4 | E4: Voice input on intake and Twin chat | 4 hrs | Manus |
| Day 5 | E5: Landing page final polish | 2 hrs | Manus |

**Sprint 2 total: ~11 hours of work across 3 days.**

### Sprint 3: Validation and Launch (Days 6–7)

| Day | Task | Time | Owner |
|---|---|---|---|
| Day 6 | V1: Full end-to-end user journey test | 3 hrs | You + Manus |
| Day 6 | Fix any bugs discovered during V1 | 2 hrs | Manus |
| Day 7 | V2: Edge case and error testing | 2 hrs | You + Manus |
| Day 7 | Final bug fixes and commit | 1 hr | Manus |

**Sprint 3 total: ~8 hours of work across 2 days.**

---

## 5. Resource Allocation

The work is split between two actors: **You** (the product owner, with access to Stripe, Resend, Railway, and domain registrar dashboards) and **Manus** (the AI engineer, handling all code changes).

| Actor | Total Hours | Task Categories |
|---|---|---|
| You | ~5 hours | Stripe setup, Resend domain, Railway cron config, testing |
| Manus | ~20 hours | Batch email endpoint, checkpoint history, archetype theming, voice input, landing polish, bug fixes, testing |
| **Combined** | **~25 hours** | **Full MVP completion** |

The work can be compressed into a single week of focused effort, or spread across two weeks with part-time attention.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stripe account approval delay | Low | High — blocks real payments | The `price_data` fallback allows testing without real Price IDs. Apply for Stripe account early. |
| Resend domain verification failure | Low | Medium — emails go to spam | Use Resend's shared domain (`onboarding@resend.dev`) for testing. Verify DNS records carefully. |
| Railway cron misconfiguration | Medium | Low — weekly emails delayed | Test the cron endpoint manually first. Add logging to track execution. |
| LLM API rate limits during testing | Medium | Low — retries handle it | The exponential backoff retry logic (up to 2 retries) already handles transient failures. |
| Mobile layout regressions | Low | Low — cosmetic only | Test on real devices (iPhone SE, Pixel 5) in addition to Chrome DevTools. |
| Supabase free tier limits | Low | Medium — database unavailable | Monitor usage in Supabase dashboard. Upgrade to Pro if approaching limits. |

---

## 7. Definition of "Shippable MVP"

The product is considered a shippable MVP when all of the following criteria are met:

1. **A new user can complete the full journey** from landing page through intake, report, Twin chat, and growth plan dashboard without encountering errors.
2. **Payments work** — a user can subscribe to Core, Social, or Deep (monthly or annual) via Stripe and their tier is correctly reflected in the product.
3. **Weekly check-ins work** — a user can submit a check-in, receive a Twin response, and see their history.
4. **The progress visualization updates** correctly as check-ins are submitted.
5. **Magic link authentication works** — a user can link their session to a persistent account via email.
6. **The app is usable on mobile** — all screens render correctly at 375px width.
7. **Rate limiting prevents abuse** — excessive requests return 429 errors.
8. **No critical errors** in the end-to-end test (Task V1).

Features that are explicitly **not required** for MVP launch:

- Voice input (nice-to-have, can ship post-launch)
- Archetype CSS theming (cosmetic, can ship post-launch)
- Product Hunt / AppSumo launch assets (marketing, separate workstream)
- Supabase auto-sync GitHub Action (operational, not user-facing)
- Year 2 Plan generation (requires 52 weeks of data; no user will reach it at launch)

With this narrower definition, the **critical path to MVP is Sprint 1 only** (Tasks C1, C2, C3, E1), totalling approximately **6 hours of work**. Sprints 2 and 3 add polish and confidence but are not blockers for a soft launch.

---

## 8. Post-MVP Roadmap

After the MVP ships, the following items should be prioritised for the first month of operation.

| Week | Focus | Items |
|---|---|---|
| Week 1 | Monitoring | Watch error logs, Stripe webhook delivery, email bounce rates |
| Week 2 | Voice input | Ship E4 (voice input on intake and Twin chat) |
| Week 3 | Visual polish | Ship E3 (archetype theming) and E5 (landing polish) |
| Week 4 | Launch marketing | Product Hunt listing, AppSumo submission, social media campaign |

---

## Appendix A: Environment Variables Checklist

The following environment variables must be set in Railway for full production functionality.

| Variable | Status | Source |
|---|---|---|
| `BUILT_IN_FORGE_API_URL` | Set | Manus platform |
| `BUILT_IN_FORGE_API_KEY` | Set | Manus platform |
| `SUPABASE_URL` | Hardcoded | `server.js` line 13 |
| `SUPABASE_SERVICE_KEY` | Hardcoded | `server.js` line 14 |
| `STRIPE_SECRET_KEY` | **Not set** | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | **Not set** | Stripe Dashboard → Developers → Webhooks |
| `STRIPE_PRICE_CORE_MONTHLY` | **Not set** | Stripe Dashboard → Products → Core → Monthly price |
| `STRIPE_PRICE_CORE_ANNUAL` | **Not set** | Stripe Dashboard → Products → Core → Annual price |
| `STRIPE_PRICE_SOCIAL_MONTHLY` | **Not set** | Stripe Dashboard → Products → Social → Monthly price |
| `STRIPE_PRICE_SOCIAL_ANNUAL` | **Not set** | Stripe Dashboard → Products → Social → Annual price |
| `STRIPE_PRICE_DEEP_MONTHLY` | **Not set** | Stripe Dashboard → Products → Deep → Monthly price |
| `STRIPE_PRICE_DEEP_ANNUAL` | **Not set** | Stripe Dashboard → Products → Deep → Annual price |
| `RESEND_API_KEY` | **Not set** | Resend Dashboard → API Keys |
| `CRON_SECRET` | **Not set** | Generate with `openssl rand -hex 32` |

---

## Appendix B: File Inventory

All files relevant to the MVP, with their purpose and modification status.

| File | Purpose | Last Modified |
|---|---|---|
| `server.js` | Backend: 31 API endpoints, Stripe, Resend, Supabase, LLM | 30 Mar 2026 |
| `public/index.html` | Frontend: 9 screens, all UI, all client-side JS | 30 Mar 2026 |
| `package.json` | Dependencies: express 5, stripe, resend, supabase, multer | 29 Mar 2026 |
| `db/growth-plan-migration.sql` | Supabase schema: 5 growth plan tables | 29 Mar 2026 |
| `scripts/weekly_growth_summary.py` | Weekly summary generator (cron) | 28 Mar 2026 |
| `docs/365-day-growth-plans.md` | Complete 365-day plans for 8 archetypes | 28 Mar 2026 |
| `docs/archetype-flow-system.md` | Archetype taxonomy and flow system | 28 Mar 2026 |
| `docs/year-2-plan-generation.md` | Year 2 plan generation specification | 29 Mar 2026 |
| `docs/project-audit-next-steps.md` | Previous gap analysis (most gaps now closed) | 29 Mar 2026 |
| `docs/mvp-completion-plan.md` | This document | 30 Mar 2026 |
