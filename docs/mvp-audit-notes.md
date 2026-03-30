# MirrorMind MVP Audit Notes (2026-03-30)

## What Is Built and Deployed (Railway auto-deploy from GitHub)

### Core Product Loop (100% complete)
- Intake questionnaire (20 questions) → LLM archetype assignment (canonical 8)
- Mirror Report generation with archetype-specific content
- AI Twin chat with archetype-specific tone
- Friend survey (token-based) with gap analysis
- Decision Tracker with prediction recall

### Growth Plan System (85% complete)
- 365-day growth plans documented for all 8 archetypes
- Growth Plan dashboard screen with week/quarter display
- Progress ring SVG with animated fill (% complete)
- Stats panel: streak, check-ins done, checkpoints passed, next check-in
- Weekly check-in form (3 questions) with Twin response
- Check-in history list with expandable items
- Quarterly checkpoint system (weeks 13, 26, 39, 52)
- Year 2 Plan generation and display UI (Deep tier)
- Weekly growth summary auto-generation (Monday 6 AM)

### Authentication (100% complete)
- Magic link auth via Resend email
- Session token persistence
- Account management page

### Payments (70% complete)
- Stripe checkout flow coded (monthly + annual for Core/Social/Deep)
- Webhook handler for subscription lifecycle
- Price IDs are PLACEHOLDERS — need real Stripe products created
- Fallback price_data mode works for testing

### Email System (80% complete)
- Resend integration coded
- Welcome email, purchase confirmation
- Magic link email
- Weekly habit email function exists
- Checkpoint reminder email function exists
- NO cron job configured to trigger weekly emails

### Error Handling & Security (NEW — just added)
- Per-IP rate limiting on 5 key endpoints
- LLM retry with exponential backoff (2 retries)
- Global Express error handler
- Toast notification system (replaces alert())

### Mobile Responsiveness (NEW — just added)
- 768px and 480px breakpoints for Plan, Account, Year 2 screens

## Database (Supabase)
### Tables that exist:
- mm_sessions, mm_reports, mm_purchases, mm_waitlist, mm_friend_surveys, mm_decisions (original)
- mm_users, mm_growth_plans, mm_checkins, mm_checkpoints, mm_forward_commitments (growth plan migration)

## What Is Missing for Shippable MVP

### P0 — Stripe Configuration (manual, ~30 min)
- Create 6 products in Stripe Dashboard
- Get 6 real price IDs
- Set as Railway env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_CORE_MONTHLY, etc.

### P1 — Railway Cron for Weekly Emails (~1 hr)
- Configure Railway cron to hit /api/send-weekly-habit every Monday
- Need to build a batch sender that queries all active users and sends personalized emails

### P2 — End-to-End Testing (~2-3 hrs)
- Full user journey: landing → intake → report → twin chat → plan → check-in → checkpoint
- Payment flow testing (requires real Stripe keys)
- Mobile device testing
- Edge cases: expired sessions, rate limiting, LLM failures

### P3 — Nice-to-Have Polish
- Archetype CSS theming on report page
- Voice input on intake and twin chat
- Product Hunt / AppSumo launch assets
- Supabase auto-sync GitHub Action
