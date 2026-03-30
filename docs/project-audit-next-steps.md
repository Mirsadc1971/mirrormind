# MirrorMind — Full Project Audit & Prioritised Next Steps

**Date:** 2026-03-29  
**Author:** Manus AI  
**Status:** Living document — update after each sprint

---

## Executive Summary

MirrorMind has a solid, deployed foundation: intake → archetype assignment → Mirror Report → AI Twin chat → friend survey → Stripe subscriptions → email drip sequence. The 365-day archetype growth plan, Q Integration Checkpoint framework, and Year 2 plan generation have been fully designed and documented. The critical gap is that **none of the growth plan infrastructure exists in the product yet** — it is entirely in design documents. The next phase of work is building the product that delivers on what the landing page now promises.

---

## Part 1 — What Is Built and Working

| Component | Status | Location |
|---|---|---|
| Intake survey (20 questions) | Live | `public/index.html` |
| LLM archetype assignment | Live | `server.js /api/intake` |
| Mirror Report generation | Live | `server.js /api/report` |
| AI Twin chat | Live | `server.js /api/chat` |
| Friend survey (token-based) | Live | `server.js /api/friend-survey` |
| Stripe checkout (monthly + annual) | Live | `server.js /api/checkout` |
| Stripe webhook (subscription lifecycle) | Live | `server.js /api/webhook/stripe` |
| Resend email drip (5-day sequence) | Live | `server.js` email functions |
| Supabase persistence (sessions, reports, purchases) | Live | `server.js` Supabase calls |
| Free tier friendMirror lock + upgrade CTA | Live | `public/index.html` renderReport |
| Pricing: Core / Social / Deep (monthly + annual) | Live | Landing page + `/api/pricing` |
| Annual pricing: "Save 2 months" | Live | Landing page toggle |
| Growth Plan landing section | Live | `#growth-plan` section |
| Q Integration Checkpoint landing copy | Live | Pricing cards + FAQ |
| Route aliases (`/api/generate-report` etc.) | Live | `server.js` |
| Weekly growth summary generator script | Built | `scripts/weekly_growth_summary.py` |
| Weekly auto-generation schedule | Active | Runs every Monday 6 AM |
| 365-day growth plans (all 8 archetypes) | Documented | `docs/365-day-growth-plans.md` |
| Archetype flow system | Documented | `docs/archetype-flow-system.md` |
| Year 2 Plan generation spec | Documented | `docs/year-2-plan-generation.md` |
| Q Checkpoint flowchart | Documented | `docs/q-checkpoint-flowchart.png` |
| Twin synthesis flowchart | Documented | `docs/twin-synthesis-flowchart.png` |
| Growth domain mapping flowchart | Documented | `docs/growth-domain-mapping.png` |
| Shadow pattern assessment flowchart | Documented | `docs/shadow-pattern-assessment.png` |

---

## Part 2 — What Is Missing (Gap Analysis)

### Gap 1 — Archetype Canonicalisation (Critical)

**The problem:** The intake prompt asks the LLM to generate a free-form archetype label (e.g. "The Reluctant Visionary"). This means every user gets a unique, unconstrained archetype — there is no mapping to the canonical eight archetypes (Architect, Performer, Protector, Seeker, Diplomat, Visionary, Anchor, Rebel) that the entire growth plan system is built around.

**Impact:** The 365-day growth plan, Q Integration Checkpoint, archetype-specific Twin tone, and Year 2 plan generation are all built for the canonical eight. Without canonicalisation, none of these features can be delivered.

**Fix required:** Update the intake prompt to steer the LLM toward one of the eight canonical archetypes, with the free-form label as a secondary descriptor. Add a `canonicalArchetype` field to the profile JSON. Update the report prompt to use `canonicalArchetype` for growth plan routing.

---

### Gap 2 — Growth Plan Dashboard (Critical)

**The problem:** The landing page promises a 365-day personalised growth plan with weekly habits and quarterly checkpoints. There is no UI for this anywhere in the product. After a user pays and gets their report, there is no page, screen, or interface that shows them their current week's habit, their quarter, or their progress.

**What needs to be built:**
- A persistent user account / dashboard page (currently the app is entirely session-based with no login)
- A growth plan view showing: current week number, quarter, this week's habit with full instruction, and a weekly check-in form (three questions)
- A checkpoint view for weeks 13, 26, 39, 52 with the four structured questions
- A progress timeline showing completed weeks and upcoming milestones

---

### Gap 3 — User Authentication and Persistent Accounts (Critical)

**The problem:** The entire app is session-based using an in-memory `profiles` Map and a `mirrorSessionId` cookie. There are no user accounts. This means:
- Users lose their report if they clear cookies or switch devices
- There is no way to deliver weekly check-in prompts to a specific user
- The growth plan cannot persist across sessions
- The AI Twin has no memory between sessions

**Fix required:** Implement proper user authentication (email + password, or magic link via Resend). Link the `mirrorSessionId` to a user account on Stripe payment completion. Migrate session data to Supabase user rows.

---

### Gap 4 — Weekly Check-In Delivery (High Priority)

**The problem:** The weekly growth summary generator script produces a Markdown file every Monday. But there is no mechanism to:
1. Identify which users are in which week of their plan
2. Send each user their week-specific habit and check-in questions
3. Receive and store the check-in responses
4. Use those responses in the checkpoint assessment

**What needs to be built:**
- A `mm_growth_plan` Supabase table tracking: `user_id`, `archetype`, `plan_start_date`, `current_week`, `tier`
- A `mm_checkins` table: `user_id`, `week_number`, `q1_response`, `q2_response`, `q3_response`, `submitted_at`
- A weekly email job (Monday morning) that sends each active user their current week's habit and check-in link
- A `/api/checkin` endpoint to receive and store check-in responses
- A check-in UI page (accessible from the weekly email link)

---

### Gap 5 — Q Integration Checkpoint Implementation (High Priority)

**The problem:** The checkpoint is fully designed (four questions, three Twin outcomes, tier gating) but does not exist in the product. Users at weeks 13, 26, 39, and 52 receive no checkpoint experience.

**What needs to be built:**
- A checkpoint detection system: when a user's `current_week` reaches 13, 26, 39, or 52, trigger the checkpoint flow
- A checkpoint UI: four structured questions presented in sequence, with the Twin's response after each
- Checkpoint response storage in a `mm_checkpoints` Supabase table
- The Twin's three outcome logic: archetype confirmation/revision, habit adjustment (escalate/maintain/break down), forward commitment storage
- Tier gating: Core sees Q1 only, Social sees Q1+Q2, Deep sees all four

---

### Gap 6 — Archetype-Specific Twin Tone (Medium Priority)

**The problem:** The AI Twin chat uses a single generic system prompt for all users. The archetype flow system document specifies distinct Twin tones for each of the eight archetypes — The Architect's Twin is a rigorous thinking partner, The Rebel's Twin is direct and provocative, etc. None of this is implemented.

**Fix required:** Update the `/api/chat` system prompt to inject the canonical archetype's Twin tone specification. Read from the archetype flow system document to build the eight prompt variants.

---

### Gap 7 — Voice Input (Medium Priority)

**The problem:** Voice input is listed in `todo.md` as a planned feature. The server has a `/api/transcribe` endpoint (Whisper). The frontend has no microphone button on the intake questions or Twin chat.

**Fix required:** Add MediaRecorder-based voice capture to intake questions and Twin chat input. Wire to the existing `/api/transcribe` endpoint.

---

### Gap 8 — Supabase Schema for Growth Plan (Medium Priority)

**The problem:** The existing Supabase tables (`mm_sessions`, `mm_reports`, `mm_purchases`, `mm_waitlist`, `mm_friend_surveys`, `mm_decisions`) do not include any growth plan tables. The entire growth plan infrastructure needs new tables.

**Tables to create:**
```sql
mm_users          -- email, password_hash, created_at, stripe_customer_id
mm_growth_plans   -- user_id, archetype, canonical_archetype, plan_start_date, current_week, tier, theme_y2
mm_checkins       -- user_id, week_number, q1, q2, q3, submitted_at
mm_checkpoints    -- user_id, quarter (1-4), q1..q4 answers, shadow_score, forward_commitment, archetype_revised
mm_forward_commitments -- user_id, checkpoint_quarter, commitment_text, fulfilled (bool), assessed_at
```

---

### Gap 9 — Email Sequences for Growth Plan (Medium Priority)

**The problem:** The existing email drip is a 5-day curiosity sequence for new signups. There are no emails for:
- Weekly habit delivery (52 emails per user per year)
- Checkpoint reminder emails (4 per year)
- Milestone celebration emails (end of each month)
- Year-End Review invitation (Week 52)

**Fix required:** Build a growth plan email system separate from the acquisition drip. Use Resend's batch send API for the weekly Monday delivery.

---

### Gap 10 — Report Archetype CSS Theming (Low Priority)

**The problem:** The landing page mentions that each archetype has a distinct visual identity. The report page uses a single `archetype-oracle.png` image for all archetypes. There is no archetype-specific colour theming, iconography, or visual differentiation in the report UI.

**Fix required:** Create eight archetype visual identities (colour palette, symbol, tagline). Apply the canonical archetype's CSS class to the report container for visual differentiation.

---

### Gap 11 — Year 2 Plan Generation Logic (Low Priority — Deep Tier Only)

**The problem:** The Year 2 plan generation is fully specified in `docs/year-2-plan-generation.md` but does not exist as code. It requires: 52 weeks of check-in data, four checkpoint records, a Year-End Reflection form, and the Twin's four-step synthesis logic.

**This is a Week 52 feature** — it cannot be built until the check-in and checkpoint infrastructure (Gaps 4 and 5) is in place. Flag for Q4 development.

---

### Gap 12 — Product Hunt / AppSumo Launch Assets (Low Priority)

**The problem:** `todo.md` lists Product Hunt launch page copy, AppSumo submission checklist, and social media launch templates as pending. None of these exist.

**Fix required:** Write Product Hunt tagline, description, and first comment. Write AppSumo submission copy. Write Twitter/X launch thread template.

---

### Gap 13 — Supabase 30-Minute Auto-Sync GitHub Action (Low Priority)

**The problem:** `todo.md` lists a GitHub Action for 30-minute Supabase auto-sync as pending.

**Fix required:** Create `.github/workflows/supabase-sync.yml` that runs every 30 minutes and triggers a health check or data sync job.

---

### Gap 14 — Cancel / Account Management UI (Low Priority)

**The problem:** The FAQ says "cancel anytime from your account settings" but there are no account settings. Users cannot cancel, update payment, or view their subscription status.

**Fix required:** A `/account` page showing: current tier, next billing date, cancel subscription button (calls Stripe Customer Portal), and plan history.

---

## Part 3 — Prioritised Next Steps

The following table orders all gaps by impact and dependency. Items marked **Blocker** must be completed before the items that depend on them.

| Priority | Item | Effort | Blocks |
|---|---|---|---|
| **P0** | Archetype canonicalisation (Gap 1) | 2 hours | Everything in the growth plan |
| **P0** | User authentication + persistent accounts (Gap 3) | 1–2 days | Gaps 4, 5, 9, 14 |
| **P1** | Supabase growth plan schema (Gap 8) | 3 hours | Gaps 4, 5 |
| **P1** | Growth plan dashboard UI (Gap 2) | 1–2 days | Gap 4 |
| **P1** | Weekly check-in delivery system (Gap 4) | 1 day | Gap 5 |
| **P2** | Q Integration Checkpoint implementation (Gap 5) | 2 days | Gap 11 |
| **P2** | Archetype-specific Twin tone (Gap 6) | 3 hours | None |
| **P2** | Growth plan email sequences (Gap 9) | 1 day | Gap 4 |
| **P3** | Voice input (Gap 7) | 4 hours | None |
| **P3** | Report archetype CSS theming (Gap 10) | 4 hours | Gap 1 |
| **P3** | Account management / cancel UI (Gap 14) | 4 hours | Gap 3 |
| **P4** | Product Hunt / AppSumo launch assets (Gap 12) | 3 hours | None |
| **P4** | Supabase auto-sync GitHub Action (Gap 13) | 1 hour | None |
| **P5** | Year 2 Plan generation logic (Gap 11) | 3 days | Gaps 4, 5 |

---

## Part 4 — Immediate Next Actions (This Week)

These three items unblock everything else and should be done first, in order.

**Action 1 — Canonicalise the archetype (2 hours)**  
Update the intake LLM prompt to return a `canonicalArchetype` field constrained to the eight canonical values. Update the report prompt to use it. Update the Twin chat system prompt to inject the archetype-specific tone. This is a server.js change only — no frontend work required.

**Action 2 — Create the Supabase growth plan tables (3 hours)**  
Write and execute the SQL for `mm_users`, `mm_growth_plans`, `mm_checkins`, `mm_checkpoints`, and `mm_forward_commitments`. This is a prerequisite for all growth plan features.

**Action 3 — Build the growth plan dashboard page (1–2 days)**  
Create a `/plan` page in the frontend that shows the user's current week, this week's habit, and a weekly check-in form. This is the first visible product manifestation of everything that has been designed.

---

## Part 5 — Files to Keep Safe

All of the following files contain design work that must not be lost. They are now committed to the repository.

| File | Contents |
|---|---|
| `docs/archetype-flow-system.md` | Full archetype taxonomy, psychological profiles, per-archetype flows |
| `docs/365-day-growth-plans.md` | Complete 365-day plans for all 8 archetypes |
| `docs/year-2-plan-generation.md` | Full Year 2 plan generation specification |
| `docs/q-checkpoint-flowchart.png` | Q Integration Checkpoint process flowchart |
| `docs/twin-synthesis-flowchart.png` | Twin's Four Synthesis Steps flowchart |
| `docs/growth-domain-mapping.png` | Growth Domain Mapping flowchart |
| `docs/shadow-pattern-assessment.png` | Shadow Pattern Evolution Assessment flowchart |
| `docs/weekly-summaries/` | All generated weekly growth plan summaries |
| `scripts/weekly_growth_summary.py` | Weekly auto-generation script |
| `docs/project-audit-next-steps.md` | This document |
