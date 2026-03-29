/**
 * MirrorMind — Supabase table creation script
 * Uses Supabase Management API /database/query endpoint with PAT
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agapaabzdbznfibnxrxd.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = 'sbp_de87d2b25cc032c0849926051189fca27565fb16';
const PROJECT_REF = 'agapaabzdbznfibnxrxd';

const SQL = `
CREATE TABLE IF NOT EXISTS mm_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text DEFAULT 'landing',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  answers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  archetype text,
  tagline text,
  core_truth text,
  blind_spot text,
  shadow_self text,
  avoiding text,
  superpower text,
  kryptonite text,
  shareable_quote text,
  full_report jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mm_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  decision_text text NOT NULL,
  prediction text,
  actual_outcome text,
  created_at timestamptz DEFAULT now(),
  review_at timestamptz
);

CREATE TABLE IF NOT EXISTS mm_friend_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  token text NOT NULL UNIQUE,
  friend_answers jsonb,
  gap_analysis text,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mm_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  session_id text,
  plan text NOT NULL DEFAULT 'lifetime',
  amount_cents int NOT NULL,
  stripe_session_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mm_sessions_session_id ON mm_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_mm_reports_session_id ON mm_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_mm_decisions_session_id ON mm_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_mm_friend_surveys_token ON mm_friend_surveys(token);
CREATE INDEX IF NOT EXISTS idx_mm_purchases_email ON mm_purchases(email);
`;

async function tryMethod(name, url, headers, body) {
  console.log(`\n--- ${name} ---`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text.slice(0, 600));
    return res.status < 300;
  } catch (e) {
    console.log('Error:', e.message);
    return false;
  }
}

// Method 1: Management API with PAT
let ok = await tryMethod(
  'Management API (PAT)',
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  { 'Authorization': `Bearer ${PAT}` },
  { query: SQL }
);

if (!ok) {
  // Method 2: Management API with service role key
  ok = await tryMethod(
    'Management API (service role)',
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    { query: SQL }
  );
}

if (!ok) {
  // Method 3: Postgres REST via pg extension
  ok = await tryMethod(
    'REST API pg_query RPC',
    `${SUPABASE_URL}/rest/v1/rpc/query`,
    {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    { query: SQL }
  );
}

if (!ok) {
  console.log('\n❌ All automated methods failed.');
  console.log('Please run the SQL manually at:');
  console.log(`https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
} else {
  console.log('\n✅ Tables created successfully!');
}
