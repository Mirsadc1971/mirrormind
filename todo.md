# MirrorMind — LTD Launch Playbook (Based on FLOGA $120K Strategy)

## Step 1: Validate (DONE — idea already validated by concept)
- [x] Talk to target market about their problems (psychological self-awareness gap)
- [x] Define MVP features (intake → report → AI twin chat)
- [x] Build MVP

## Step 2: Marketing Assets (Landing Page)
- [ ] LTD pricing section with 3 tiers (Basic $29 one-time / Standard $49 one-time / Lifetime $79 one-time)
- [ ] Urgency countdown timer (5-day launch window)
- [ ] Spot counter ("Only 500 Lifetime spots available — X remaining")
- [ ] Transparent "How It Works" demo section (show real screens, admit current limitations)
- [ ] No-refunds policy clearly stated
- [ ] Social proof section (testimonials, stat counters)
- [ ] FAQ section addressing objections

## Step 3: Email Capture & Waitlist
- [ ] Email waitlist form above the fold ("Get early access + 40% off")
- [ ] Backend endpoint to store waitlist emails
- [ ] Curiosity-driven email sequence copy (5 emails, price revealed only on day 5)
- [ ] Email sequence: Week 1 tease, Week 2 demo, Week 3 social proof, Launch day reveal

## Step 4: Launch Mechanics
- [ ] Stripe integration for one-time LTD payments
- [ ] Spot counter decrements on each purchase
- [ ] Countdown timer resets to 5 days on launch day
- [ ] Post-purchase onboarding email

## Step 5: Distribution
- [ ] Product Hunt launch page copy
- [ ] AppSumo submission checklist
- [ ] Twitter/X launch thread template
- [ ] Reddit posts (r/SaaS, r/Entrepreneur, r/yoga, r/selfimprovement)

## Supabase Persistence (mlsuttoccqcpjhvkfeuv)
- [x] Wire server.js to MirrorMind Supabase project
- [x] Persist waitlist email signups to mm_waitlist
- [x] Persist user sessions and answers to mm_sessions
- [x] Persist generated Mirror Reports to mm_reports
- [x] Persist decisions to mm_decisions
- [x] Persist friend survey tokens to mm_friend_surveys
- [ ] Add 30-minute auto-sync GitHub Action

## Phase 2 — Subscription Pricing + Voice + Landing Page

### Landing Page (Rebuild)
- [ ] Hero section — headline, subheadline, single CTA
- [ ] Problem section — the blind spot story
- [ ] How it works — 3 steps (intake, friends, report)
- [ ] Report preview — sample friendMirror section
- [ ] Pricing section — Free / Core / Social / Deep / Lifetime with monthly/annual toggle
- [ ] Social proof / waitlist count
- [ ] Footer

### Stripe Subscriptions
- [ ] Create Stripe products: Core monthly $9.97, Core annual $107.68, Social monthly $16.77, Social annual $181.12, Deep monthly $27.97, Deep annual $302.08, Lifetime $349
- [ ] Add plan field to session (free / core / social / deep / lifetime)
- [ ] Enforce friend survey limits by plan (0 / 1 / 3 / 5 / unlimited)
- [ ] Stripe subscription checkout flow (monthly + annual)
- [ ] Stripe webhook: handle subscription created, updated, cancelled
- [ ] Show locked friendMirror teaser on free reports

### Voice Input
- [ ] Microphone button on each intake question
- [ ] Record audio in browser (MediaRecorder API)
- [ ] POST audio to /api/transcribe endpoint
- [ ] Whisper transcription returns text, populates answer field
- [ ] Voice input on AI Twin chat
- [ ] Loading state while transcribing
