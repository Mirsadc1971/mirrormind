import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { Resend } from 'resend';

// ─── Supabase client (MirrorMind project) ────────────────────────────────────
const SUPABASE_URL = 'https://mlsuttoccqcpjhvkfeuv.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sc3V0dG9jY3FjcGpodmtmZXV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgxODc5OSwiZXhwIjoyMDkwMzk0Nzk5fQ.qb62UnhsqkPwJE3KiuxZFdLNWZWO9FTiJohKLsOjNwk';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Helper: upsert session to Supabase
async function upsertSession(sessionId, data) {
  try {
    await supabase.from('mm_sessions').upsert(
      { session_id: sessionId, ...data, updated_at: new Date().toISOString() },
      { onConflict: 'session_id' }
    );
  } catch (e) { console.warn('[Supabase] upsertSession error:', e.message); }
}

// Helper: get session from Supabase
async function getSession(sessionId) {
  try {
    const { data } = await supabase.from('mm_sessions').select('*').eq('session_id', sessionId).single();
    return data;
  } catch (e) { return null; }
}

// Helper: save report to Supabase
async function saveReport(sessionId, profile, report) {
  try {
    await supabase.from('mm_reports').insert({
      session_id: sessionId,
      archetype: profile.archetype,
      tagline: profile.archetypeDescription,
      core_truth: report.headline,
      blind_spot: profile.blindSpots?.[0]?.title,
      shadow_self: profile.shadowSelf,
      avoiding: report.theThingYoureAvoiding,
      superpower: profile.superpower,
      kryptonite: profile.kryptonite,
      shareable_quote: report.shareableQuote,
      full_report: report,
    });
  } catch (e) { console.warn('[Supabase] saveReport error:', e.message); }
}

// Helper: save decision to Supabase
async function saveDecision(sessionId, question, prediction) {
  try {
    const { data } = await supabase.from('mm_decisions').insert({
      session_id: sessionId,
      decision_text: question,
      prediction,
      review_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months
    }).select().single();
    return data?.id;
  } catch (e) { console.warn('[Supabase] saveDecision error:', e.message); return null; }
}

// Helper: save friend survey to Supabase
async function saveFriendSurvey(sessionId, token) {
  try {
    await supabase.from('mm_friend_surveys').insert({ session_id: sessionId, token });
  } catch (e) { console.warn('[Supabase] saveFriendSurvey error:', e.message); }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory store (fast cache; Supabase is the persistent source of truth) ─
const profiles = new Map();   // sessionId → { answers, profile, report }
const decisions = new Map();  // sessionId → [{ question, prediction, actual, timestamp }]

// ─── LLM helper (uses Manus built-in API) ────────────────────────────────────
const LLM_URL = process.env.BUILT_IN_FORGE_API_URL || 'https://api.manus.im/v1';
const LLM_KEY = process.env.BUILT_IN_FORGE_API_KEY || '';

async function callLLM(messages, opts = {}) {
  const res = await fetch(`${LLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
    body: JSON.stringify({ model: 'claude-sonnet-4-5', messages, max_tokens: opts.maxTokens || 2000, ...opts }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'LLM error');
  return data.choices[0].message.content;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Generate a new session
app.post('/api/session', async (req, res) => {
  const id = crypto.randomUUID();
  profiles.set(id, { answers: [], profile: null, report: null, createdAt: Date.now() });
  // Persist to Supabase
  await upsertSession(id, { answers: {} });
  res.json({ sessionId: id });
});

// Submit intake answers and generate psychological profile
app.post('/api/intake', async (req, res) => {
  const { sessionId, answers } = req.body;
  if (!sessionId || !answers?.length) return res.status(400).json({ error: 'Missing data' });

  const formattedAnswers = answers.map((a, i) => `Q${i + 1}: ${a.question}\nAnswer: ${a.answer}`).join('\n\n');

  const profilePrompt = `You are a world-class psychologist and behavioral scientist. Analyze these intake answers and build a precise psychological profile.

INTAKE ANSWERS:
${formattedAnswers}

Return a JSON object with EXACTLY this structure (no markdown, pure JSON):
{
  "archetype": "2-3 word archetype label (e.g. 'The Reluctant Visionary')",
  "archetypeDescription": "1 sentence describing this archetype",
  "communicationStyle": "one of: Direct, Diplomatic, Analytical, Expressive",
  "decisionStyle": "one of: Intuitive, Deliberate, Collaborative, Impulsive",
  "coreValues": ["value1", "value2", "value3"],
  "blindSpots": [
    {"title": "blind spot name", "description": "1-2 sentence explanation"},
    {"title": "blind spot name", "description": "1-2 sentence explanation"},
    {"title": "blind spot name", "description": "1-2 sentence explanation"}
  ],
  "selfDeception": "The one thing this person is currently lying to themselves about (1 sentence, direct and specific)",
  "superpower": "Their single greatest natural strength (1 sentence)",
  "kryptonite": "The pattern that most consistently undermines them (1 sentence)",
  "motivationalStyle": "What actually drives them vs. what they think drives them (2 sentences)",
  "shadowSelf": "The version of themselves they most fear becoming (1 sentence)",
  "compatibilityNote": "What kind of people and environments they thrive with vs. clash with (2 sentences)"
}`;

  try {
    const raw = await callLLM([{ role: 'user', content: profilePrompt }], { maxTokens: 1500 });
    const profile = JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    const session = profiles.get(sessionId) || {};
    session.answers = answers;
    session.profile = profile;
    profiles.set(sessionId, session);
    // Persist to Supabase
    await upsertSession(sessionId, { answers: { answers, profile } });
    res.json({ profile });
  } catch (err) {
    console.error('Intake error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate the full Mirror Report
app.post('/api/report', async (req, res) => {
  const { sessionId } = req.body;
  const session = profiles.get(sessionId);
  if (!session?.profile) return res.status(400).json({ error: 'No profile found. Complete intake first.' });

  const p = session.profile;

  // Collect all completed friend surveys for this session
  const surveyIds = profiles.get(`surveys_for_${sessionId}`) || [];
  const completedSurveys = surveyIds
    .map(id => profiles.get(`survey_${id}`))
    .filter(s => s && s.completedAt && s.responses.length > 0);

  const hasFriendData = completedSurveys.length > 0;

  // Build the friend data block to inject into the prompt
  const friendDataBlock = hasFriendData
    ? completedSurveys.map((s, i) => {
        const lines = s.questions.map((q, qi) =>
          `  Q: ${q}\n  A: ${s.responses[qi] || '(no answer)'}`
        ).join('\n');
        return `Friend ${i + 1}:\n${lines}` +
          (s.gapAnalysis ? `\n  Gap Analysis: ${s.gapAnalysis}` : '');
      }).join('\n\n')
    : null;

  const friendSection = hasFriendData
    ? `\n\nFRIEND SURVEY DATA (${completedSurveys.length} friend${completedSurveys.length > 1 ? 's' : ''} responded):\n${friendDataBlock}\n\nIMPORTANT: The friend survey data above is external evidence — real observations from people who know this person. Use it to write the "friendMirror" section. Directly contrast what the person believes about themselves with what their friends actually observe. Quote or closely paraphrase the friend responses. Name the gap explicitly and with compassion.`
    : '';

  const friendMirrorField = hasFriendData
    ? `,\n  "friendMirror": "2-3 paragraphs. Paragraph 1: what the friends observed (quote them directly). Paragraph 2: contrast this with how the person sees themselves — name the gap without softening it. Paragraph 3: one sentence on what becomes possible when this gap closes."`
    : '';

  const reportPrompt = `You are writing a Mirror Report — a deeply personal psychological document that feels like it was written by someone who has known this person for years.

PROFILE DATA:
Archetype: ${p.archetype}
Communication Style: ${p.communicationStyle}
Decision Style: ${p.decisionStyle}
Core Values: ${p.coreValues.join(', ')}
Self-Deception: ${p.selfDeception}
Superpower: ${p.superpower}
Kryptonite: ${p.kryptonite}
Shadow Self: ${p.shadowSelf}${friendSection}

Write a Mirror Report with these sections. Be specific, provocative, and accurate. No generic platitudes. Write as if you know them personally.

Return JSON with EXACTLY this structure:
{
  "headline": "A single sentence that captures their essence — should make them feel seen",
  "openingParagraph": "2-3 sentences that feel startlingly accurate about who they are right now",
  "strengthsNarrative": "A paragraph about their genuine strengths — not flattery, real specific strengths",
  "shadowNarrative": "A paragraph about their shadow patterns — the things they do that undermine them, written with compassion but unflinching honesty",
  "blindSpotDeepDive": "Pick their most significant blind spot and write 2 paragraphs going deep on it",
  "theThingYoureAvoiding": "A direct 2-3 sentence statement about the thing they are currently avoiding in their life",
  "yourNextChapter": "A forward-looking paragraph about what becomes possible when they face their shadow"${friendMirrorField},
  "shareableQuote": "A single powerful sentence from the report that they would want to share on social media — make it profound and personal"
}`;

  try {
    const raw = await callLLM([{ role: 'user', content: reportPrompt }], { maxTokens: 2000 });
    const report = JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    session.report = report;
    profiles.set(sessionId, session);
    // Persist report to Supabase
    await saveReport(sessionId, p, report);
    res.json({ report, profile: p });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// AI Twin chat — uses the psychological profile as persistent context
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, history = [] } = req.body;
  const session = profiles.get(sessionId);
  if (!session?.profile) return res.status(400).json({ error: 'No profile found.' });

  const p = session.profile;
  const systemPrompt = `You are ${p.archetype} — the AI twin of the person you're speaking with. You know them deeply.

THEIR PSYCHOLOGICAL PROFILE:
- Archetype: ${p.archetype} — ${p.archetypeDescription}
- Communication Style: ${p.communicationStyle}
- Decision Style: ${p.decisionStyle}
- Core Values: ${p.coreValues.join(', ')}
- Superpower: ${p.superpower}
- Kryptonite: ${p.kryptonite}
- Self-Deception: ${p.selfDeception}
- Shadow Self: ${p.shadowSelf}
- Motivational Style: ${p.motivationalStyle}

YOUR ROLE:
You are their AI twin — not a generic assistant. You respond as someone who knows them better than they know themselves. You:
1. Call out when they're rationalizing or avoiding something
2. Predict how they'll feel about a decision in 6 months, not just right now
3. Use their own values against their bad decisions (lovingly)
4. Speak in a tone that matches their communication style (${p.communicationStyle})
5. When they ask for advice, give it directly — no hedging, no "it depends"
6. Occasionally reference something from their profile to show you know them

Be warm but honest. Be direct but not harsh. Be their most trusted advisor who also knows all their patterns.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  try {
    const reply = await callLLM(messages, { maxTokens: 800 });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send-to-Friend: generate a 3-question survey about the user
app.post('/api/friend-survey', async (req, res) => {
  const { sessionId } = req.body;
  const session = profiles.get(sessionId);
  if (!session?.profile) return res.status(400).json({ error: 'No profile found.' });

  const p = session.profile;
  const surveyId = crypto.randomUUID();

  // Store the survey linked to this session
  const survey = {
    sessionId,
    profile: p,
    responses: [],
    createdAt: Date.now(),
    questions: [
      `When ${p.archetype.split(' ').pop()} is under pressure, what do they typically do?`,
      `What is one thing about this person that they probably don't see in themselves?`,
      `If you had to describe them in 3 words, what would they be?`,
    ],
  };
  // Register this survey under the session so the report can find it
  const sessionSurveys = profiles.get(`surveys_for_${sessionId}`) || [];
  sessionSurveys.push(surveyId);
  profiles.set(`surveys_for_${sessionId}`, sessionSurveys);
  profiles.set(`survey_${surveyId}`, survey);
  res.json({ surveyId, questions: survey.questions });
});

// Submit friend survey responses
app.post('/api/friend-survey/:surveyId', async (req, res) => {
  const { surveyId } = req.params;
  const { responses } = req.body;
  const survey = profiles.get(`survey_${surveyId}`);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  survey.responses.push(...responses);
  survey.completedAt = Date.now();
  profiles.set(`survey_${surveyId}`, survey);

  // Generate gap analysis
  const p = survey.profile;
  const gapPrompt = `A person with this profile: Archetype "${p.archetype}", Self-Deception: "${p.selfDeception}", Superpower: "${p.superpower}"

Their friends described them as:
${responses.map((r, i) => `Q${i + 1}: ${r}`).join('\n')}

Write a brief "Mirror Gap Analysis" — 2-3 sentences about the gap between how this person sees themselves and how others see them. Be specific and insightful. Return plain text only.`;

  try {
    const gapAnalysis = await callLLM([{ role: 'user', content: gapPrompt }], { maxTokens: 300 });
    // Store gap analysis on the survey so the report can access it
    survey.gapAnalysis = gapAnalysis;
    profiles.set(`survey_${surveyId}`, survey);
    res.json({ gapAnalysis, profile: p });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decision tracker — log a decision and get a prediction
app.post('/api/decision', async (req, res) => {
  const { sessionId, question } = req.body;
  const session = profiles.get(sessionId);
  if (!session?.profile) return res.status(400).json({ error: 'No profile found.' });

  const p = session.profile;
  const predictionPrompt = `Person profile: ${p.archetype}, Decision Style: ${p.decisionStyle}, Kryptonite: ${p.kryptonite}

They are deciding: "${question}"

Predict in 2 sentences: (1) what they will likely decide and why based on their patterns, and (2) how they will feel about this decision in 6 months. Be specific. Return plain text only.`;

  try {
    const prediction = await callLLM([{ role: 'user', content: predictionPrompt }], { maxTokens: 200 });
    const decisionList = decisions.get(sessionId) || [];
    const entry = { id: crypto.randomUUID(), question, prediction, timestamp: Date.now(), actual: null };
    decisionList.push(entry);
    decisions.set(sessionId, decisionList);
    // Persist to Supabase
    const dbId = await saveDecision(sessionId, question, prediction);
    res.json({ prediction, decisionId: dbId || entry.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get decision history
app.get('/api/decisions/:sessionId', (req, res) => {
  const list = decisions.get(req.params.sessionId) || [];
  res.json({ decisions: list });
});

// ─── LTD Launch Mechanics ────────────────────────────────────────────────────

// Waitlist + spot counter (Supabase-backed)
const LAUNCH_DATE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from server start
let spotsRemaining = 500; // cached, refreshed from Supabase on startup

// Load initial spot count from Supabase on startup
(async () => {
  try {
    const { count } = await supabase.from('mm_purchases').select('*', { count: 'exact', head: true }).eq('status', 'completed');

    if (count !== null) spotsRemaining = Math.max(0, 500 - count);
    const { count: wlCount } = await supabase.from('mm_waitlist').select('*', { count: 'exact', head: true });
    console.log(`[Supabase] Loaded: ${500 - spotsRemaining} purchases, ${wlCount} waitlist signups`);
  } catch (e) { console.warn('[Supabase] Could not load initial counts:', e.message); }
})();

// Waitlist signup
app.post('/api/waitlist', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  try {
    // Check if already signed up
    const { data: existing } = await supabase.from('mm_waitlist').select('id').eq('email', email).single();
    if (existing) return res.json({ status: 'already_signed_up' });
    // Insert new signup
    await supabase.from('mm_waitlist').insert({ email, source: name || 'landing' });
    const { count } = await supabase.from('mm_waitlist').select('*', { count: 'exact', head: true });
    console.log(`[Waitlist] New signup: ${email} — total: ${count}`);
    // Send welcome email (async, don't block response)
    sendWelcomeEmail(email, name).catch(() => {});
    res.json({ status: 'success', position: count, spotsRemaining });
  } catch (e) {
    console.error('[Waitlist] Error:', e.message);
    res.status(500).json({ error: 'Could not save signup' });
  }
});

// Get launch status (spots, countdown)
app.get('/api/launch-status', async (req, res) => {
  const msRemaining = Math.max(0, LAUNCH_DATE.getTime() - Date.now());
  try {
    const { count: wlCount } = await supabase.from('mm_waitlist').select('*', { count: 'exact', head: true });
    res.json({
      spotsRemaining,
      spotsTotal: 500,
      waitlistCount: wlCount || 0,
      launchDate: LAUNCH_DATE.toISOString(),
      msRemaining,
      isLive: msRemaining === 0,
    });
  } catch (e) {
    res.json({ spotsRemaining, spotsTotal: 500, waitlistCount: 0, launchDate: LAUNCH_DATE.toISOString(), msRemaining, isLive: false });
  }
});

// ─── Stripe Payment Routes ───────────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

const PLANS = {
  starter: {
    name: 'MirrorMind Starter',
    price: 2900, // $29 in cents
    description: 'Your Mirror Report + AI Twin for 30 days',
    tier: 'starter',
  },
  pro: {
    name: 'MirrorMind Pro (1 Year)',
    price: 7900, // $79 in cents
    description: 'Full Mirror Report + AI Twin for 1 year + Decision Tracker',
    tier: 'pro',
  },
  lifetime: {
    name: 'MirrorMind Lifetime',
    price: 14900, // $149 in cents
    description: 'Lifetime access to everything + all future features',
    tier: 'lifetime',
  },
};

// Create Stripe checkout session
app.post('/api/checkout', async (req, res) => {
  const { plan, email, sessionId, origin } = req.body;
  if (!plan || !PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured yet. Coming soon!' });

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const planData = PLANS[plan];
    const baseUrl = origin || 'http://localhost:4000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: planData.name, description: planData.description },
          unit_amount: planData.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: email || undefined,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${baseUrl}/?cancelled=1`,
      metadata: { mirrorSessionId: sessionId || '', plan, tier: planData.tier },
      allow_promotion_codes: true,
    });

    // Record pending purchase in Supabase
    await supabase.from('mm_purchases').insert({
      stripe_session_id: session.id,
      email: email || null,
      plan: plan,
      amount_cents: planData.price,
      status: 'pending',
      session_id: sessionId || null,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook — handle payment completion
app.post('/api/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!STRIPE_SECRET_KEY) return res.sendStatus(200);
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    let event;
    try {
      event = STRIPE_WEBHOOK_SECRET
        ? stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET)
        : JSON.parse(req.body);
    } catch (err) {
      console.error('[Stripe] Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { plan, tier, mirrorSessionId } = session.metadata || {};
      const email = session.customer_email || session.customer_details?.email;

      // Update purchase record
      await supabase.from('mm_purchases')
        .update({ status: 'completed', email: email || null })
        .eq('stripe_session_id', session.id);


      // Decrement spots
      spotsRemaining = Math.max(0, spotsRemaining - 1);

      // Send purchase confirmation email
      if (email) sendPurchaseEmail(email, plan, '').catch(() => {});

      console.log(`[Stripe] Payment completed: ${plan} — ${email} — $${(session.amount_total / 100).toFixed(2)}`);

    }

    res.sendStatus(200);
  }
);

// ─── Email Automation (Resend) ───────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = 'MirrorMind <hello@mirrormind.ai>';

// The 5-day curiosity drip sequence
const DRIP_SEQUENCE = [
  {
    day: 0,
    subject: 'Your Mirror is ready — one thing we noticed about you',
    html: (name) => `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
          <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
          <p style="color: #a78bfa; margin: 8px 0 0;">Your psychological mirror</p>
        </div>
        <div style="padding: 40px; background: #fafafa;">
          <p>Hi ${name || 'there'},</p>
          <p>Something interesting happened when we analyzed your answers.</p>
          <p>Most people who take the MirrorMind assessment expect to see their <em>strengths</em> reflected back. What surprises them is what they see instead: the pattern they've been running on autopilot for years.</p>
          <p>Your Mirror Report is ready. Inside, you'll find the one thing you're currently avoiding — and what becomes possible when you stop.</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="https://mirrormind.ai" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Read Your Mirror Report</a>
          </div>
          <p style="color: #666; font-size: 14px;">Tomorrow: We'll show you the one blind spot that's been running your decisions.</p>
        </div>
      </div>
    `,
  },
  {
    day: 1,
    subject: 'The blind spot that\'s been running your life (without your permission)',
    html: (name) => `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
          <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
        </div>
        <div style="padding: 40px; background: #fafafa;">
          <p>Hi ${name || 'there'},</p>
          <p>Here's something most self-help content won't tell you:</p>
          <p><strong>Your blind spots aren't weaknesses. They're the places where your greatest strengths have been overused.</strong></p>
          <p>The person who's "too direct" was once praised for their honesty. The person who "overthinks" was once celebrated for their thoroughness. The pattern that now undermines you was once the thing that helped you survive.</p>
          <p>Your Mirror Report identifies your specific blind spot — not a generic one, but the one that shows up in your actual decisions.</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="https://mirrormind.ai" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">See Your Blind Spot</a>
          </div>
          <p style="color: #666; font-size: 14px;">Tomorrow: The one thing you're currently lying to yourself about.</p>
        </div>
      </div>
    `,
  },
  {
    day: 2,
    subject: 'What you\'re telling yourself vs. what\'s actually happening',
    html: (name) => `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
          <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
        </div>
        <div style="padding: 40px; background: #fafafa;">
          <p>Hi ${name || 'there'},</p>
          <p>Every person has a story they tell themselves about why they're stuck.</p>
          <p>"I'm waiting for the right moment." "I need more information." "It's complicated."</p>
          <p>These aren't lies exactly. They're <em>sophisticated truths</em> — accurate enough to be believable, incomplete enough to keep you safe from the thing you actually need to do.</p>
          <p>Your Mirror Report includes a section called <strong>"The Thing You're Avoiding"</strong> — a direct statement about what's really going on beneath the surface.</p>
          <p>Most people say it's the most uncomfortable — and most useful — thing they've ever read about themselves.</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="https://mirrormind.ai" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Read What You're Avoiding</a>
          </div>
          <p style="color: #666; font-size: 14px;">Tomorrow: How to use your AI Twin for the decisions that actually matter.</p>
        </div>
      </div>
    `,
  },
  {
    day: 3,
    subject: 'What if you had an advisor who knew all your patterns?',
    html: (name) => `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
          <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
        </div>
        <div style="padding: 40px; background: #fafafa;">
          <p>Hi ${name || 'there'},</p>
          <p>Imagine having an advisor who:</p>
          <ul style="line-height: 2.2;">
            <li>Knows your decision-making patterns better than you do</li>
            <li>Can predict how you'll feel about a choice in 6 months</li>
            <li>Calls out when you're rationalizing vs. reasoning</li>
            <li>Speaks in a tone that actually works for you</li>
            <li>Is available at 2am when the anxiety hits</li>
          </ul>
          <p>That's your AI Twin. It's built from your Mirror Report — not a generic chatbot, but a model of <em>you</em>.</p>
          <p>MirrorMind Pro users get unlimited access to their AI Twin for a full year. Lifetime users get it forever.</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="https://mirrormind.ai/#pricing" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Unlock Your AI Twin</a>
          </div>
          <p style="color: #666; font-size: 14px;">Tomorrow: The last email — and why the Lifetime Deal closes in 24 hours.</p>
        </div>
      </div>
    `,
  },
  {
    day: 4,
    subject: '⏰ Final 24 hours — then MirrorMind goes to full price',
    html: (name) => `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
          <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
          <p style="color: #f87171; font-size: 18px; margin: 8px 0 0;">Lifetime Deal closes in 24 hours</p>
        </div>
        <div style="padding: 40px; background: #fafafa;">
          <p>Hi ${name || 'there'},</p>
          <p>This is the last email in this sequence.</p>
          <p>The MirrorMind Lifetime Deal — $149 for permanent access to everything — closes tomorrow. After that, it's $29/month.</p>
          <p>Here's what I want to leave you with:</p>
          <p>The people who change their lives aren't the ones who read the most self-help books. They're the ones who finally get honest about the pattern that's been running them.</p>
          <p>Your Mirror Report is that honesty. Your AI Twin is what you do with it.</p>
          <div style="background: #1a1a2e; padding: 24px; border-radius: 8px; margin: 24px 0;">
            <p style="color: #c084fc; font-size: 20px; margin: 0 0 16px; text-align: center;">Lifetime Deal: $149</p>
            <p style="color: #a78bfa; text-align: center; margin: 0 0 8px;">Everything, forever. No subscriptions.</p>
            <div style="text-align: center;">
              <a href="https://mirrormind.ai/#pricing" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Get Lifetime Access</a>
            </div>
          </div>
          <p style="color: #666; font-size: 12px;">You received this because you signed up for the MirrorMind waitlist. <a href="#" style="color: #a78bfa;">Unsubscribe</a></p>
        </div>
      </div>
    `,
  },
];

// Send welcome email + schedule drip (called on waitlist signup)
async function sendWelcomeEmail(email, name) {
  if (!RESEND_API_KEY) return;
  try {
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: DRIP_SEQUENCE[0].subject,
      html: DRIP_SEQUENCE[0].html(name),
    });
    console.log(`[Email] Welcome email sent to ${email}`);
  } catch (e) { console.warn('[Email] Failed to send welcome email:', e.message); }
}

// Send purchase confirmation email
async function sendPurchaseEmail(email, plan, name) {
  if (!RESEND_API_KEY) return;
  try {
    const resend = new Resend(RESEND_API_KEY);
    const planNames = { starter: 'Starter', pro: 'Pro (1 Year)', lifetime: 'Lifetime' };
    const planPrices = { starter: '$29', pro: '$79', lifetime: '$149' };
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `✨ Welcome to MirrorMind ${planNames[plan] || plan}!`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
            <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
            <p style="color: #4ade80; font-size: 18px; margin: 8px 0 0;">Payment confirmed — you're in!</p>
          </div>
          <div style="padding: 40px; background: #fafafa;">
            <p>Hi ${name || 'there'},</p>
            <p>Your MirrorMind <strong>${planNames[plan]}</strong> access is now active.</p>
            <p>You paid: <strong>${planPrices[plan]}</strong></p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://mirrormind.ai" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Open MirrorMind</a>
            </div>
            <p>Questions? Reply to this email.</p>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Purchase confirmation sent to ${email}`);
  } catch (e) { console.warn('[Email] Failed to send purchase email:', e.message); }
}

// Get pricing info
app.get('/api/pricing', (req, res) => {
  res.json({
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p, priceFormatted: `$${(p.price / 100).toFixed(0)}` })),
    spotsRemaining,
    stripeEnabled: !!STRIPE_SECRET_KEY,
  });
});

// Serve the frontend for all other routes
app.get('/*path', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`MirrorMind running on port ${PORT}`));
