/**
 * MirrorMind Daily Integration Health Check
 * Checks Stripe and Resend key status, Supabase connectivity,
 * and reports a full dashboard to the console (and optionally via webhook).
 *
 * Usage: node scripts/health-check.mjs
 * Env vars read: STRIPE_SECRET_KEY, RESEND_API_KEY, STRIPE_WEBHOOK_SECRET
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://mlsuttoccqcpjhvkfeuv.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sc3V0dG9jY3FjcGpodmtmZXV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxODc5OSwiZXhwIjoyMDkwMzk0Nzk5fQ.qb62UnhsqkPwJE3KiuxZFdLNWZWO9FTiJohKLsOjNwk';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS = { OK: '✅', WARN: '⚠️ ', FAIL: '❌', INFO: 'ℹ️ ' };

function badge(ok, warnMsg, okMsg) {
  return ok ? `${STATUS.OK} ${okMsg}` : `${STATUS.WARN} ${warnMsg}`;
}

async function checkStripe() {
  const result = { configured: false, webhookConfigured: false, balance: null, error: null };

  if (!STRIPE_SECRET_KEY) {
    result.error = 'STRIPE_SECRET_KEY not set';
    return result;
  }

  result.configured = true;
  result.webhookConfigured = !!STRIPE_WEBHOOK_SECRET;

  try {
    // Validate key by fetching balance
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

    const avail = data.available?.[0];
    result.balance = avail
      ? `$${(avail.amount / 100).toFixed(2)} ${avail.currency.toUpperCase()}`
      : 'N/A';
    result.liveMode = !STRIPE_SECRET_KEY.startsWith('sk_test_');
  } catch (e) {
    result.error = e.message;
    result.configured = false;
  }

  return result;
}

async function checkResend() {
  const result = { configured: false, domainVerified: false, error: null };

  if (!RESEND_API_KEY) {
    result.error = 'RESEND_API_KEY not set';
    return result;
  }

  result.configured = true;

  try {
    // Validate key by listing domains
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

    const domains = data.data || [];
    const mirrorDomain = domains.find(d =>
      d.name?.includes('mirrormind') || d.name?.includes('hello')
    );
    result.domains = domains.map(d => `${d.name} (${d.status})`);
    result.domainVerified = mirrorDomain?.status === 'verified';
    result.domainStatus = mirrorDomain
      ? `${mirrorDomain.name}: ${mirrorDomain.status}`
      : 'No mirrormind.ai domain found — add it in Resend dashboard';
  } catch (e) {
    result.error = e.message;
    result.configured = false;
  }

  return result;
}

async function checkSupabase() {
  const result = { connected: false, tables: {}, error: null };

  try {
    const tables = ['mm_waitlist', 'mm_sessions', 'mm_reports', 'mm_decisions', 'mm_purchases', 'mm_friend_surveys'];
    const counts = await Promise.all(
      tables.map(async (t) => {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        return { table: t, count: error ? 'ERR' : count };
      })
    );

    result.connected = true;
    counts.forEach(({ table, count }) => { result.tables[table] = count; });

    // Revenue calculation
    const { data: purchases } = await supabase
      .from('mm_purchases')
      .select('amount_cents, status, plan')
      .eq('status', 'completed');

    result.completedPurchases = purchases?.length || 0;
    result.totalRevenueCents = purchases?.reduce((sum, p) => sum + (p.amount_cents || 0), 0) || 0;
    result.revenueByPlan = purchases?.reduce((acc, p) => {
      acc[p.plan] = (acc[p.plan] || 0) + 1;
      return acc;
    }, {}) || {};
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runHealthCheck() {
  const now = new Date().toISOString();
  console.log('\n' + '═'.repeat(60));
  console.log(`  MirrorMind Integration Health Check`);
  console.log(`  ${now}`);
  console.log('═'.repeat(60));

  const [stripe, resend, db] = await Promise.all([checkStripe(), checkResend(), checkSupabase()]);

  // ── Stripe ──
  console.log('\n📦 STRIPE');
  if (stripe.error && !stripe.configured) {
    console.log(`  ${STATUS.FAIL} Not configured: ${stripe.error}`);
    console.log(`  ${STATUS.INFO} Get your key at: https://dashboard.stripe.com/apikeys`);
    console.log(`  ${STATUS.INFO} Set env var: STRIPE_SECRET_KEY=sk_live_...`);
  } else {
    console.log(`  ${badge(stripe.configured, 'Key invalid', 'Secret key valid')} ${stripe.liveMode ? '(LIVE mode)' : '(TEST mode)'}`);
    console.log(`  ${badge(stripe.webhookConfigured, 'Webhook secret not set — payment confirmations may fail', 'Webhook secret configured')}`);
    if (stripe.balance) console.log(`  ${STATUS.INFO} Account balance: ${stripe.balance}`);
    if (stripe.error) console.log(`  ${STATUS.FAIL} Error: ${stripe.error}`);
  }

  // ── Resend ──
  console.log('\n📧 RESEND (Email)');
  if (resend.error && !resend.configured) {
    console.log(`  ${STATUS.FAIL} Not configured: ${resend.error}`);
    console.log(`  ${STATUS.INFO} Sign up free at: https://resend.com`);
    console.log(`  ${STATUS.INFO} Set env var: RESEND_API_KEY=re_...`);
    console.log(`  ${STATUS.INFO} Then add & verify domain: hello@mirrormind.ai`);
  } else {
    console.log(`  ${badge(resend.configured, 'Key invalid', 'API key valid')}`);
    console.log(`  ${badge(resend.domainVerified, 'Domain not verified — emails will fail', 'mirrormind.ai domain verified')}`);
    if (resend.domainStatus) console.log(`  ${STATUS.INFO} Domain: ${resend.domainStatus}`);
    if (resend.domains?.length) console.log(`  ${STATUS.INFO} All domains: ${resend.domains.join(', ')}`);
    if (resend.error) console.log(`  ${STATUS.FAIL} Error: ${resend.error}`);
  }

  // ── Supabase ──
  console.log('\n🗄️  SUPABASE');
  if (!db.connected) {
    console.log(`  ${STATUS.FAIL} Connection failed: ${db.error}`);
  } else {
    console.log(`  ${STATUS.OK} Connected to mlsuttoccqcpjhvkfeuv`);
    Object.entries(db.tables).forEach(([table, count]) => {
      console.log(`  ${STATUS.INFO} ${table.padEnd(22)} ${count} rows`);
    });
  }

  // ── Revenue Dashboard ──
  console.log('\n💰 REVENUE DASHBOARD');
  if (db.connected) {
    const revenue = (db.totalRevenueCents / 100).toFixed(2);
    console.log(`  ${STATUS.INFO} Completed purchases:  ${db.completedPurchases}`);
    console.log(`  ${STATUS.INFO} Total revenue:        $${revenue}`);
    if (Object.keys(db.revenueByPlan).length) {
      Object.entries(db.revenueByPlan).forEach(([plan, count]) => {
        const prices = { starter: 29, pro: 79, lifetime: 149 };
        console.log(`  ${STATUS.INFO}   ${plan.padEnd(12)} ${count} sales ($${(count * (prices[plan] || 0)).toFixed(0)})`);
      });
    } else {
      console.log(`  ${STATUS.INFO} No sales yet — add Stripe key to enable payments`);
    }
    console.log(`  ${STATUS.INFO} Waitlist signups:     ${db.tables['mm_waitlist'] || 0}`);
    const spotsUsed = db.completedPurchases;
    const spotsLeft = Math.max(0, 500 - spotsUsed);
    console.log(`  ${STATUS.INFO} LTD spots remaining:  ${spotsLeft}/500`);
  }

  // ── Overall Status ──
  console.log('\n📊 OVERALL READINESS');
  const checks = [
    { name: 'Supabase database', ok: db.connected },
    { name: 'Stripe payments', ok: stripe.configured && !stripe.error },
    { name: 'Stripe webhook', ok: stripe.webhookConfigured },
    { name: 'Resend email', ok: resend.configured && !resend.error },
    { name: 'Email domain verified', ok: resend.domainVerified },
  ];

  checks.forEach(({ name, ok }) => {
    console.log(`  ${ok ? STATUS.OK : STATUS.FAIL} ${name}`);
  });

  const readyCount = checks.filter(c => c.ok).length;
  const pct = Math.round((readyCount / checks.length) * 100);
  console.log(`\n  Launch readiness: ${readyCount}/${checks.length} (${pct}%)`);

  if (pct < 100) {
    console.log('\n🎯 NEXT ACTIONS');
    if (!stripe.configured || stripe.error) {
      console.log('  1. Create Stripe account → get sk_live_... key → set STRIPE_SECRET_KEY');
    }
    if (!stripe.webhookConfigured) {
      console.log('  2. In Stripe dashboard: Webhooks → Add endpoint → https://your-domain/api/webhook/stripe');
      console.log('     Events to listen: checkout.session.completed');
      console.log('     Copy webhook signing secret → set STRIPE_WEBHOOK_SECRET');
    }
    if (!resend.configured || resend.error) {
      console.log('  3. Create Resend account → get re_... key → set RESEND_API_KEY');
    }
    if (!resend.domainVerified) {
      console.log('  4. In Resend dashboard: Add domain mirrormind.ai → verify DNS → add hello@ sender');
    }
  } else {
    console.log('\n  🎉 All systems GO — MirrorMind is fully launch-ready!');
  }

  console.log('\n' + '═'.repeat(60) + '\n');

  // Return structured result for scheduled task use
  return { stripe, resend, db, readyCount, total: checks.length, pct, timestamp: now };
}

runHealthCheck().catch(console.error);
