#!/usr/bin/env python3
"""
MirrorMind — Create Supabase tables via Management API
"""
import urllib.request
import urllib.error
import json

PAT = "sbp_f2bf964066f278825884892df995125c269c48fc"
PROJECT_REF = "mlsuttoccqcpjhvkfeuv"

STATEMENTS = [
    """CREATE TABLE IF NOT EXISTS mm_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text DEFAULT 'landing',
  created_at timestamptz DEFAULT now()
)""",
    """CREATE TABLE IF NOT EXISTS mm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  answers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)""",
    """CREATE TABLE IF NOT EXISTS mm_reports (
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
)""",
    """CREATE TABLE IF NOT EXISTS mm_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  decision_text text NOT NULL,
  prediction text,
  actual_outcome text,
  created_at timestamptz DEFAULT now(),
  review_at timestamptz
)""",
    """CREATE TABLE IF NOT EXISTS mm_friend_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  token text NOT NULL UNIQUE,
  friend_answers jsonb,
  gap_analysis text,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)""",
    """CREATE TABLE IF NOT EXISTS mm_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  session_id text,
  plan text NOT NULL DEFAULT 'lifetime',
  amount_cents int NOT NULL,
  stripe_session_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
)""",
    "CREATE INDEX IF NOT EXISTS idx_mm_sessions_session_id ON mm_sessions(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_mm_reports_session_id ON mm_reports(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_mm_decisions_session_id ON mm_decisions(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_mm_friend_surveys_token ON mm_friend_surveys(token)",
    "CREATE INDEX IF NOT EXISTS idx_mm_purchases_email ON mm_purchases(email)",
]

def run_query(sql):
    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    data = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {PAT}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return e.code, body
    except Exception as ex:
        return 0, str(ex)

print(f"Creating tables in project: {PROJECT_REF}\n")
all_ok = True
for stmt in STATEMENTS:
    name = stmt.strip().split("\n")[0][:60]
    status, body = run_query(stmt)
    if status in (200, 201):
        print(f"  ✅  {name}")
    else:
        print(f"  ❌  {name}")
        print(f"      Status: {status}  Body: {body[:200]}")
        all_ok = False

# Verify tables exist
print("\nVerifying tables...")
status, body = run_query(
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema = 'public' AND table_name LIKE 'mm_%' ORDER BY table_name"
)
print(f"Status: {status}")
try:
    rows = json.loads(body)
    if rows:
        for r in rows:
            print(f"  ✅  {r.get('table_name', r)}")
    else:
        print("  (no mm_ tables found)")
except Exception:
    print(f"  Raw: {body[:300]}")

print("\n✅ Done!" if all_ok else "\n⚠️  Some statements failed — check output above.")
