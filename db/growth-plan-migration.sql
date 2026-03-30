-- ============================================================
-- MirrorMind Growth Plan Schema Migration
-- Run this in the Supabase SQL editor for the mirrormind project
-- ============================================================

-- 1. mm_users — persistent user accounts linked to email + session
CREATE TABLE IF NOT EXISTS mm_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  canonical_archetype TEXT CHECK (canonical_archetype IN (
    'The Architect','The Performer','The Protector','The Seeker',
    'The Diplomat','The Visionary','The Anchor','The Rebel'
  )),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','core','social','deep')),
  plan TEXT,
  stripe_customer_id TEXT,
  magic_token TEXT,
  magic_token_expires_at TIMESTAMPTZ,
  plan_start_date DATE,
  current_plan_week INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. mm_growth_plans — one row per user, tracks their 365-day plan state
CREATE TABLE IF NOT EXISTS mm_growth_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES mm_users(id) ON DELETE CASCADE,
  session_id TEXT,  -- fallback for non-auth users
  archetype TEXT NOT NULL,
  plan_year INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_week INTEGER NOT NULL DEFAULT 1,
  current_quarter INTEGER NOT NULL DEFAULT 1,
  theme TEXT,  -- Year 2 theme: Externalisation | Deepening | Expansion | Recalibration
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, plan_year)
);

-- 3. mm_checkins — weekly check-in responses (3 questions per week)
CREATE TABLE IF NOT EXISTS mm_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES mm_users(id) ON DELETE CASCADE,
  session_id TEXT,
  growth_plan_id UUID REFERENCES mm_growth_plans(id) ON DELETE CASCADE,
  plan_week INTEGER NOT NULL,
  plan_year INTEGER NOT NULL DEFAULT 1,
  q1_what_changed TEXT,     -- What did you do differently this week?
  q2_what_avoided TEXT,     -- What did you avoid?
  q3_what_noticed TEXT,     -- What did you notice about yourself?
  twin_response TEXT,       -- AI Twin's response to the check-in
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. mm_checkpoints — Q Integration Checkpoint responses (weeks 13, 26, 39, 52)
CREATE TABLE IF NOT EXISTS mm_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES mm_users(id) ON DELETE CASCADE,
  session_id TEXT,
  growth_plan_id UUID REFERENCES mm_growth_plans(id) ON DELETE CASCADE,
  checkpoint_number INTEGER NOT NULL CHECK (checkpoint_number IN (1,2,3,4)),
  plan_week INTEGER NOT NULL CHECK (plan_week IN (13,26,39,52)),
  plan_year INTEGER NOT NULL DEFAULT 1,
  -- Four structured questions
  q1_what_changed TEXT,           -- What changed in the last quarter?
  q2_what_avoided TEXT,           -- What did you avoid?
  q3_what_surprised TEXT,         -- What surprised you about yourself?
  q4_next_quarter_focus TEXT,     -- What is your focus for next quarter?
  -- Archetype-specific reflection
  archetype_reflection TEXT,
  -- Twin outcomes
  archetype_confirmed BOOLEAN,
  archetype_revised_to TEXT,
  habit_adjustment TEXT CHECK (habit_adjustment IN ('escalate','maintain','break_down')),
  forward_commitment TEXT,        -- Stored verbatim for next checkpoint recall
  twin_synthesis TEXT,            -- Full Twin response
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, checkpoint_number, plan_year)
);

-- 5. mm_forward_commitments — commitments made at each checkpoint, recalled at next
CREATE TABLE IF NOT EXISTS mm_forward_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES mm_users(id) ON DELETE CASCADE,
  session_id TEXT,
  checkpoint_id UUID REFERENCES mm_checkpoints(id) ON DELETE CASCADE,
  plan_week INTEGER NOT NULL,
  plan_year INTEGER NOT NULL DEFAULT 1,
  commitment_text TEXT NOT NULL,
  fulfilled BOOLEAN,
  fulfilment_notes TEXT,
  reviewed_at_week INTEGER,  -- which checkpoint reviewed this commitment
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mm_checkins_user_week ON mm_checkins(user_id, plan_week, plan_year);
CREATE INDEX IF NOT EXISTS idx_mm_checkpoints_user ON mm_checkpoints(user_id, plan_year);
CREATE INDEX IF NOT EXISTS idx_mm_growth_plans_user ON mm_growth_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_mm_users_email ON mm_users(email);
CREATE INDEX IF NOT EXISTS idx_mm_users_magic_token ON mm_users(magic_token);
CREATE INDEX IF NOT EXISTS idx_mm_checkins_session ON mm_checkins(session_id);
CREATE INDEX IF NOT EXISTS idx_mm_growth_plans_session ON mm_growth_plans(session_id);

-- ============================================================
-- END OF MIGRATION
-- ============================================================
