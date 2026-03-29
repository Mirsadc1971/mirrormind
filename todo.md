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
- [ ] Wire server.js to MirrorMind Supabase project
- [ ] Persist waitlist email signups to mm_waitlist
- [ ] Persist user sessions and answers to mm_sessions
- [ ] Persist generated Mirror Reports to mm_reports
- [ ] Persist decisions to mm_decisions
- [ ] Persist friend survey tokens to mm_friend_surveys
- [ ] Add 30-minute auto-sync GitHub Action
