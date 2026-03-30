import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { Resend } from 'resend';
import multer from 'multer';

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

// ─── Rate Limiting (in-memory, per-IP) ──────────────────────────────────────
const rateLimitStore = new Map(); // ip → { count, resetAt }
const RATE_LIMITS = {
  '/api/auth/magic-link': { max: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
  '/api/intake': { max: 10, windowMs: 60 * 60 * 1000 },          // 10 per hour
  '/api/checkin': { max: 20, windowMs: 60 * 60 * 1000 },          // 20 per hour
  '/api/generate-report': { max: 10, windowMs: 60 * 60 * 1000 },  // 10 per hour
  '/api/twin/chat': { max: 60, windowMs: 60 * 60 * 1000 },        // 60 per hour
};

function rateLimit(req, res, next) {
  const config = RATE_LIMITS[req.path];
  if (!config) return next();
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + config.windowMs };
    rateLimitStore.set(key, entry);
  }
  entry.count++;
  if (entry.count > config.max) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}
app.use(rateLimit);

// Clean up rate limit store every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 10 * 60 * 1000);

// ─── In-memory store (fast cache; Supabase is the persistent source of truth) ─
const profiles = new Map();   // sessionId → { answers, profile, report }
const decisions = new Map();  // sessionId → [{ question, prediction, actual, timestamp }]

// ─── LLM helper (uses Manus built-in API) ────────────────────────────────────
const LLM_URL = process.env.BUILT_IN_FORGE_API_URL || 'https://api.manus.im/v1';
const LLM_KEY = process.env.BUILT_IN_FORGE_API_KEY || '';

async function callLLM(messages, opts = {}) {
  const maxRetries = opts.retries || 2;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${LLM_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', messages, max_tokens: opts.maxTokens || 2000, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        lastError = new Error(data?.error?.message || `LLM error (HTTP ${res.status})`);
        if (res.status === 429 || res.status >= 500) {
          // Retryable — wait with exponential backoff
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        throw lastError; // Non-retryable error
      }
      return data.choices[0].message.content;
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
    }
  }
  throw lastError || new Error('LLM call failed after retries');
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

  const CANONICAL_ARCHETYPE_GUIDANCE = `
ARCHETYPE GUIDANCE — CRITICAL: Map the person to exactly ONE of these eight canonical archetypes. Use the EXACT name as the "archetype" field. Do NOT invent new names.
1. The Architect — analytical, control-driven, planning as avoidance of commitment
2. The Performer — approval-seeking, shapeshifting, self-erasing warmth
3. The Protector — strength-as-armour, self-sufficient, cannot receive care
4. The Seeker — depth-seeking, insight-collecting, commitment-avoidant
5. The Diplomat — conflict-avoidant, perspective-holding, self-invisible
6. The Visionary — idea-generating, inspiration-dependent, completion-allergic
7. The Anchor — consistency-driven, stability-seeking, change-resistant
8. The Rebel — authority-rejecting, identity-through-opposition, commitment-phobic
If the person is a blend, choose the DOMINANT archetype. Return the same value in both "archetype" and "canonicalArchetype" fields.
`;
  const profilePrompt = `You are a world-class psychologist and behavioral scientist. Analyze these intake answers and build a precise psychological profile.

INTAKE ANSWERS:
${formattedAnswers}
${CANONICAL_ARCHETYPE_GUIDANCE}
Return a JSON object with EXACTLY this structure (no markdown, pure JSON):
{
  "archetype": "MUST be one of the 8 canonical names above (e.g. 'The Architect')",
  "canonicalArchetype": "Same value as archetype — one of the 8 canonical names",
  "archetypeDescription": "1 sentence describing this person's expression of the archetype",
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

  // Gap 6 — Archetype-specific Twin tone
  const ARCHETYPE_TWIN_TONES = {
    'The Architect': `You are the Architect's most rigorous thinking partner — not a cheerleader. Ask precise questions, challenge assumptions with evidence, and REFUSE to validate analysis paralysis. When they say "I need more information," ask: "What specific piece of information would actually change your decision?" Speak in structured language — numbered points, clear distinctions. Never validate over-preparation. Celebrate decisive action, however imperfect.`,
    'The Performer': `You are the one entity that does not need anything from the Performer. Be warm but completely unimpressed by their performance. When they say "I just want everyone to be happy," ask: "What do YOU want?" Consistently redirect from relational impact to personal desire. Celebrate moments of self-definition, not self-sacrifice. Never reward people-pleasing.`,
    'The Protector': `You are the one entity the Protector does not have to protect. Be steady, direct, and completely safe — you will not fall apart if they are honest. When they deflect ("I'm fine"), do not accept it: "I know you're capable of being fine. That's not what I asked." Model receiving — ask about their own experience, not their management of others.`,
    'The Seeker': `You are philosophically fluent but action-oriented. Engage with their depth genuinely but ALWAYS redirect from insight to implementation. When they say "I've been thinking about this a lot," ask: "What have you done differently as a result?" Celebrate action, not insight. Be slightly impatient — not unkindly, but enough to create productive friction. Never reward more research or more frameworks.`,
    'The Diplomat': `You model directness without aggression — showing them it is possible to say hard things and remain in relationship. When they hedge ("I can see both sides"), ask: "What do YOU think?" Do not accept non-answers. Celebrate moments when they take a clear position, even a small one. Be warm but have a spine. Never let them off the hook with diplomatic non-answers.`,
    'The Visionary': `You are their most demanding editor. Love the ideas and REFUSE to let them replace execution. When they pitch a new idea, ask: "What happened with the last one?" Celebrate completion above all else — finishing a small thing is worth more than starting a large one. Be energetic enough to match their pace but structured enough to slow them down. Never validate starting something new before finishing something existing.`,
    'The Anchor': `You are patient and persistent — they will not change quickly and you do not try to force it. Ask questions that gently destabilise their certainty: "What would you do if this stopped working?" Celebrate small changes as significant. Be the voice that says: "You are more adaptable than you think." Never push for rapid change — celebrate incremental movement.`,
    'The Rebel': `You are the one entity they cannot dismiss. Be direct, slightly irreverent, and completely unintimidated by their edge. When they say "I don't care what anyone thinks," say: "Then why do you talk about it so much?" Challenge their narrative without moralising. Celebrate genuine commitment — not because they are conforming, but because they are building something real. Never moralize or lecture.`,
  };

  const archetypeTone = ARCHETYPE_TWIN_TONES[p.archetype] || ARCHETYPE_TWIN_TONES[p.canonicalArchetype] || `Be warm but honest. Be direct but not harsh. Speak in a tone that matches their communication style (${p.communicationStyle}).`;

  const systemPrompt = `You are the AI Twin of the person you're speaking with. You know them deeply.

THEIR PSYCHOLOGICAL PROFILE:
- Archetype: ${p.archetype} — ${p.archetypeDescription || ''}
- Communication Style: ${p.communicationStyle || 'Direct'}
- Decision Style: ${p.decisionStyle || 'Deliberate'}
- Core Values: ${(p.coreValues || []).join(', ')}
- Superpower: ${p.superpower || p.strength || ''}
- Kryptonite: ${p.kryptonite || p.blind_spot || ''}
- Self-Deception: ${p.selfDeception || p.avoiding || ''}
- Shadow Self: ${p.shadowSelf || p.shadow || ''}

ARCHETYPE-SPECIFIC TONE INSTRUCTION:
${archetypeTone}

YOUR ROLE:
You are their AI twin — not a generic assistant. You respond as someone who knows them better than they know themselves. You:
1. Call out when they're rationalizing or avoiding something
2. Predict how they'll feel about a decision in 6 months, not just right now
3. Use their own values against their bad decisions (lovingly)
4. When they ask for advice, give it directly — no hedging, no "it depends"
5. Occasionally reference something from their profile to show you know them`;

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

  // Enforce friend survey limit based on tier
  const tier = session.tier || 'free';
  const limit = TIER_SURVEY_LIMITS[tier] ?? 0;
  const existingSurveys = profiles.get(`surveys_for_${sessionId}`) || [];
  if (existingSurveys.length >= limit) {
    const upgradeMap = { free: 'core_monthly', core: 'social_monthly', social: 'deep_monthly' };
    return res.status(403).json({
      error: 'Survey limit reached for your plan.',
      tier,
      limit,
      used: existingSurveys.length,
      upgradeTo: upgradeMap[tier] || null,
      message: limit === 0
        ? 'Upgrade to Core ($9.97/month) to send your first friend survey.'
        : `You have used all ${limit} friend survey${limit > 1 ? 's' : ''} for this billing period. Upgrade to send more.`,
    });
  }

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

// ─── Pricing Plans ───────────────────────────────────────────────────────────
// PLACEHOLDER: Replace price_id values with real Stripe Price IDs once you
// create products in your Stripe Dashboard (or via the Stripe CLI).
// Monthly prices: create recurring prices in Stripe Dashboard.
// Annual prices: create recurring prices with interval=year.
// Lifetime: create a one-time price.
//
// To create products quickly:
//   stripe products create --name="MirrorMind Core"
//   stripe prices create --product=<id> --unit-amount=997 --currency=usd --recurring[interval]=month
// ─────────────────────────────────────────────────────────────────────────────

// Friend survey limits per tier
const TIER_SURVEY_LIMITS = {
  free:   0,
  core:   1,
  social: 3,
  deep:   5,
};

const PLANS = {
  // ── Monthly subscriptions ──────────────────────────────────────────────────
  core_monthly: {
    name: 'MirrorMind Core',
    price: 997,           // $9.97/month
    description: 'Full Mirror Report + 1 friend survey/month + AI Twin',
    tier: 'core',
    billing: 'monthly',
    interval: 'month',
    // PLACEHOLDER — replace with real Stripe Price ID after creating in Dashboard
    stripe_price_id: process.env.STRIPE_PRICE_CORE_MONTHLY || 'price_PLACEHOLDER_core_monthly',
  },
  social_monthly: {
    name: 'MirrorMind Social',
    price: 1677,          // $16.77/month
    description: 'Full Mirror Report + 3 friend surveys/month + AI Twin + Decision Tracker',
    tier: 'social',
    billing: 'monthly',
    interval: 'month',
    stripe_price_id: process.env.STRIPE_PRICE_SOCIAL_MONTHLY || 'price_PLACEHOLDER_social_monthly',
  },
  deep_monthly: {
    name: 'MirrorMind Deep',
    price: 2797,          // $27.97/month
    description: 'Full Mirror Report + 5 friend surveys/month + AI Twin + Decision Tracker + Voice Input',
    tier: 'deep',
    billing: 'monthly',
    interval: 'month',
    stripe_price_id: process.env.STRIPE_PRICE_DEEP_MONTHLY || 'price_PLACEHOLDER_deep_monthly',
  },
  // ── Annual subscriptions (2 months free = ~17% off) ─────────────────────
  core_annual: {
    name: 'MirrorMind Core (Annual)',
    price: 9997,          // $99.97/year — save 2 months
    description: 'Full Mirror Report + 1 friend survey/month + AI Twin — billed annually, save 2 months',
    tier: 'core',
    billing: 'annual',
    interval: 'year',
    stripe_price_id: process.env.STRIPE_PRICE_CORE_ANNUAL || 'price_PLACEHOLDER_core_annual',
  },
  social_annual: {
    name: 'MirrorMind Social (Annual)',
    price: 16770,         // $167.70/year — save 2 months
    description: 'Full Mirror Report + 3 friend surveys/month + AI Twin + Decision Tracker — billed annually, save 2 months',
    tier: 'social',
    billing: 'annual',
    interval: 'year',
    stripe_price_id: process.env.STRIPE_PRICE_SOCIAL_ANNUAL || 'price_PLACEHOLDER_social_annual',
  },
  deep_annual: {
    name: 'MirrorMind Deep (Annual)',
    price: 27970,         // $279.70/year — save 2 months
    description: 'Full Mirror Report + 5 friend surveys/month + AI Twin + Decision Tracker + Voice Input — billed annually, save 2 months',
    tier: 'deep',
    billing: 'annual',
    interval: 'year',
    stripe_price_id: process.env.STRIPE_PRICE_DEEP_ANNUAL || 'price_PLACEHOLDER_deep_annual',
  },
};

// Create Stripe checkout session
app.post('/api/checkout', async (req, res) => {
  const { plan, email, sessionId, origin } = req.body;
  if (!plan || !PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({
      error: 'Payments not configured yet.',
      message: 'Add your STRIPE_SECRET_KEY environment variable to enable payments.',
      placeholder: true,
    });
  }

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const planData = PLANS[plan];
    const baseUrl = origin || 'http://localhost:4000';
    const isSubscription = planData.billing === 'monthly' || planData.billing === 'annual';
    const isPlaceholderPrice = planData.stripe_price_id.startsWith('price_PLACEHOLDER');

    let checkoutParams;

    if (isSubscription && !isPlaceholderPrice) {
      // Use pre-created Stripe Price ID for subscriptions
      checkoutParams = {
        payment_method_types: ['card'],
        line_items: [{ price: planData.stripe_price_id, quantity: 1 }],
        mode: 'subscription',
        customer_email: email || undefined,
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        cancel_url: `${baseUrl}/?cancelled=1`,
        metadata: { mirrorSessionId: sessionId || '', plan, tier: planData.tier },
        allow_promotion_codes: true,
        subscription_data: { metadata: { mirrorSessionId: sessionId || '', plan, tier: planData.tier } },
      };
    } else {
      // Fallback: use price_data (works for one-time and when Price IDs are placeholders)
      checkoutParams = {
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: planData.name, description: planData.description },
            unit_amount: planData.price,
            ...(isSubscription ? { recurring: { interval: planData.interval } } : {}),
          },
          quantity: 1,
        }],
        mode: isSubscription ? 'subscription' : 'payment',
        customer_email: email || undefined,
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        cancel_url: `${baseUrl}/?cancelled=1`,
        metadata: { mirrorSessionId: sessionId || '', plan, tier: planData.tier },
        allow_promotion_codes: true,
      };
    }

    const session = await stripe.checkout.sessions.create(checkoutParams);

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

      // Update session tier in memory and Supabase
      if (mirrorSessionId && tier) {
        const existing = profiles.get(mirrorSessionId);
        if (existing) {
          existing.tier = tier;
          profiles.set(mirrorSessionId, existing);
        }
        await upsertSession(mirrorSessionId, { tier, plan });
      }

      // Send purchase confirmation email
      if (email) sendPurchaseEmail(email, plan, '').catch(() => {});

      console.log(`[Stripe] Payment completed: ${plan} (${tier}) — ${email} — $${(session.amount_total / 100).toFixed(2)}`);
    }

    // Handle subscription cancellation
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const { mirrorSessionId } = sub.metadata || {};
      if (mirrorSessionId) {
        const existing = profiles.get(mirrorSessionId);
        if (existing) { existing.tier = 'free'; profiles.set(mirrorSessionId, existing); }
        await upsertSession(mirrorSessionId, { tier: 'free', plan: null });
        console.log(`[Stripe] Subscription cancelled for session: ${mirrorSessionId}`);
      }
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
          <p>MirrorMind Core, Social, and Deep users get unlimited access to their AI Twin. The Deep tier includes a full 365-day growth track and quarterly Integration Checkpoints.</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="https://mirrormind.ai/#pricing" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Unlock Your AI Twin</a>
          </div>
          <p style="color: #666; font-size: 14px;">Tomorrow: The last email — and the one thing that separates people who change from people who don't.</p>
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
          <p style="color: #a78bfa; font-size: 18px; margin: 8px 0 0;">Insight is just the beginning</p>
        </div>
        <div style="padding: 40px; background: #fafafa;">
          <p>Hi ${name || 'there'},</p>
          <p>This is the last email in this sequence.</p>
          <p>Here's what I want to leave you with:</p>
          <p>The people who change their lives aren't the ones who read the most self-help books. They're the ones who finally get honest about the pattern that's been running them — and then do something about it, week after week, for a full year.</p>
          <p>Your Mirror Report is the honesty. Your AI Twin is the accountability. Your 365-day growth track is the work.</p>
          <div style="background: #1a1a2e; padding: 24px; border-radius: 8px; margin: 24px 0;">
            <p style="color: #c084fc; font-size: 20px; margin: 0 0 8px; text-align: center;">MirrorMind Deep</p>
            <p style="color: #a78bfa; text-align: center; margin: 0 0 4px;">$27.97/month — or $279.97/year (save 2 months)</p>
            <p style="color: #94a3b8; text-align: center; font-size: 14px; margin: 0 0 16px;">Full 365-day growth track · 4 quarterly checkpoints · Year 2 plan</p>
            <div style="text-align: center;">
              <a href="https://mirrormind.ai/#pricing" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Start Your Year</a>
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
    const planNames = {
      core_monthly: 'Core', core_annual: 'Core (Annual)',
      social_monthly: 'Social', social_annual: 'Social (Annual)',
      deep_monthly: 'Deep', deep_annual: 'Deep (Annual)',
    };
    const planPrices = {
      core_monthly: '$9.97/mo', core_annual: '$99.97/yr',
      social_monthly: '$16.77/mo', social_annual: '$167.70/yr',
      deep_monthly: '$27.97/mo', deep_annual: '$279.97/yr',
    };
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

// ─── Voice Transcription ─────────────────────────────────────────────────────
// Uses OpenAI Whisper API via the OPENAI_API_KEY env var.
// If key is not set, returns a graceful error so the app still works.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const upload = multer({
  dest: '/tmp/mirrormind-audio/',
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a'];
    cb(null, allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|mp4|mp3|wav|ogg|m4a)$/i));
  },
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!OPENAI_API_KEY) {
    // Clean up temp file if it exists
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(503).json({
      error: 'Voice transcription not configured.',
      message: 'Add OPENAI_API_KEY to enable voice input.',
      placeholder: true,
    });
  }
  if (!req.file) return res.status(400).json({ error: 'No audio file provided.' });

  const filePath = req.file.path;
  try {
    // Rename to add proper extension so Whisper recognises the format
    const ext = req.file.originalname.split('.').pop() || 'webm';
    const renamedPath = `${filePath}.${ext}`;
    fs.renameSync(filePath, renamedPath);

    // Call Whisper API
    const formData = new FormData();
    formData.append('file', new Blob([fs.readFileSync(renamedPath)], { type: req.file.mimetype }), `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    fs.unlink(renamedPath, () => {}); // clean up

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message || 'Transcription failed' });
    }

    const result = await response.json();
    console.log(`[Voice] Transcribed ${req.file.size} bytes: "${result.text?.slice(0, 80)}..."`);
    res.json({ text: result.text, language: result.language });
  } catch (err) {
    fs.unlink(filePath, () => {});
    console.error('[Voice] Transcription error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get pricing info
app.get('/api/pricing', (req, res) => {
  res.json({
    plans: Object.entries(PLANS).map(([id, p]) => ({
      id,
      name: p.name,
      price: p.price,
      priceFormatted: p.billing === 'one_time'
        ? `$${(p.price / 100).toFixed(0)}`
        : `$${(p.price / 100).toFixed(2)}/${p.billing === 'annual' ? 'yr' : 'mo'}`,
      description: p.description,
      tier: p.tier,
      billing: p.billing,
      interval: p.interval,
      surveyLimit: TIER_SURVEY_LIMITS[p.tier],
      hasPlaceholderPriceId: p.stripe_price_id.startsWith('price_PLACEHOLDER'),
    })),
    tierLimits: TIER_SURVEY_LIMITS,
    spotsRemaining,
    stripeEnabled: !!STRIPE_SECRET_KEY,
    stripeConfigured: !!STRIPE_SECRET_KEY,
    // Env vars to set when Stripe keys are ready:
    requiredEnvVars: [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_CORE_MONTHLY',
      'STRIPE_PRICE_CORE_ANNUAL',
      'STRIPE_PRICE_SOCIAL_MONTHLY',
      'STRIPE_PRICE_SOCIAL_ANNUAL',
      'STRIPE_PRICE_DEEP_MONTHLY',
      'STRIPE_PRICE_DEEP_ANNUAL',
    ],
  });
});

// ─── Route aliases for frontend API calls ───────────────────────────────────
// /api/generate-report: runs intake + report in one shot (answers array sent directly)
app.post('/api/generate-report', async (req, res) => {
  const { answers } = req.body;
  if (!answers?.length) return res.status(400).json({ error: 'Missing answers' });

  // Create a temporary session
  const sessionId = crypto.randomUUID();
  profiles.set(sessionId, { answers: [], profile: null, report: null, createdAt: Date.now() });

  // Build intake answers
  const formattedAnswers = answers.map((a, i) => `Q${i + 1}: ${a.question || a}\nAnswer: ${a.answer || a}`).join('\n\n');
  const CANONICAL_ARCHETYPE_GUIDANCE_INLINE = `ARCHETYPE GUIDANCE — CRITICAL: Map the person to exactly ONE of these eight canonical archetypes. Use the EXACT name. Do NOT invent new names.\n1. The Architect 2. The Performer 3. The Protector 4. The Seeker 5. The Diplomat 6. The Visionary 7. The Anchor 8. The Rebel\nReturn the same value in both "archetype" and "canonicalArchetype" fields.`;
  const profilePrompt = `You are a world-class psychologist and behavioral scientist. Analyze these intake answers and build a precise psychological profile.\n\nINTAKE ANSWERS:\n${formattedAnswers}\n\n${CANONICAL_ARCHETYPE_GUIDANCE_INLINE}\n\nReturn a JSON object with EXACTLY this structure (no markdown, pure JSON):\n{\n  "archetype": "MUST be one of the 8 canonical names (e.g. 'The Architect')",\n  "canonicalArchetype": "Same value as archetype",\n  "archetypeDescription": "1 sentence describing this person's expression of the archetype",\n  "tagline": "One sentence that captures their essence — should make them feel seen",\n  "communicationStyle": "one of: Direct, Diplomatic, Analytical, Expressive",\n  "decisionStyle": "one of: Intuitive, Deliberate, Collaborative, Impulsive",\n  "coreValues": ["value1", "value2", "value3"],\n  "traits": [{"name": "trait name", "score": 75}, {"name": "trait name", "score": 60}, {"name": "trait name", "score": 85}, {"name": "trait name", "score": 45}, {"name": "trait name", "score": 70}, {"name": "trait name", "score": 55}],\n  "selfDeception": "The one thing this person is currently lying to themselves about (1 sentence)",\n  "superpower": "Their single greatest natural strength (1 sentence)",\n  "kryptonite": "The pattern that most consistently undermines them (1 sentence)",\n  "shadowSelf": "The version of themselves they most fear becoming (1 sentence)",\n  "strength": "Their core strength in 1-2 sentences",\n  "blind_spot": "Their key blind spot in 1-2 sentences",\n  "shadow": "Their shadow pattern in 1-2 sentences",\n  "avoiding": "The thing they are currently avoiding (1-2 direct sentences)",\n  "quote": "A single powerful sentence that captures their psychology — something they would share"\n}`;

  try {
    const raw = await callLLM([{ role: 'user', content: profilePrompt }], { maxTokens: 1500 });
    const profile = JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    const session = profiles.get(sessionId);
    session.answers = answers;
    session.profile = profile;
    profiles.set(sessionId, session);
    // Return the data in the shape renderReport() expects
    res.json({
      sessionId,
      archetype: profile.archetype,
      tagline: profile.tagline || profile.archetypeDescription,
      traits: profile.traits || [],
      strength: profile.strength || profile.superpower,
      blind_spot: profile.blind_spot || profile.kryptonite,
      shadow: profile.shadow || profile.shadowSelf,
      avoiding: profile.avoiding || profile.selfDeception,
      quote: profile.quote,
      tier: 'free',
    });
  } catch (err) {
    console.error('Generate-report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// /api/twin-chat: alias for /api/chat — accepts {message, profile} directly
app.post('/api/twin-chat', async (req, res) => {
  const { message, profile } = req.body;
  if (!message || !profile) return res.status(400).json({ error: 'Missing message or profile' });

  const p = profile;  const TWIN_TONES_ALIAS = {
    'The Architect': 'Ask precise questions, challenge analysis paralysis. When they say "I need more information," ask: "What specific piece of information would actually change your decision?" Speak in structured language. Celebrate decisive action.',
    'The Performer': 'Be warm but completely unimpressed by their performance. Consistently redirect from relational impact to personal desire. When they say "I just want everyone to be happy," ask: "What do YOU want?"',
    'The Protector': 'Be steady, direct, and completely safe. When they deflect ("I\'m fine"), do not accept it. Ask about their own experience, not their management of others.',
    'The Seeker': 'Engage with their depth but ALWAYS redirect from insight to action. When they say "I\'ve been thinking about this," ask: "What have you done differently as a result?"',
    'The Diplomat': 'Model directness without aggression. When they hedge, ask: "What do YOU think?" Do not accept non-answers. Celebrate moments of clear position-taking.',
    'The Visionary': 'Love the ideas and REFUSE to let them replace execution. When they pitch a new idea, ask: "What happened with the last one?" Celebrate completion above all else.',
    'The Anchor': 'Be patient and persistent. Ask questions that gently destabilise certainty: "What would you do if this stopped working?" Celebrate small changes as significant.',
    'The Rebel': 'Be direct, slightly irreverent, completely unintimidated. When they say "I don\'t care what anyone thinks," say: "Then why do you talk about it so much?"',
  };
  const twinTone = TWIN_TONES_ALIAS[p.archetype] || TWIN_TONES_ALIAS[p.canonicalArchetype] || 'Be warm but honest. Be direct but not harsh.';
  const systemPrompt = `You are the AI Twin of the person you're speaking with. You know them deeply.\n\nTHEIR PSYCHOLOGICAL PROFILE:\n- Archetype: ${p.archetype}\n- Superpower: ${p.superpower || p.strength}\n- Kryptonite: ${p.kryptonite || p.blind_spot}\n- Shadow: ${p.shadowSelf || p.shadow}\n- Avoiding: ${p.selfDeception || p.avoiding}\n\nARCHETYPE-SPECIFIC TONE: ${twinTone}\n\nYou respond as someone who knows them better than they know themselves. Be their most trusted advisor who also knows all their patterns.`;
  try {
    const reply = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ], { maxTokens: 800 });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// /api/decision-predict: alias for /api/decision — accepts {decision, context, profile} directly
app.post('/api/decision-predict', async (req, res) => {
  const { decision, context, profile } = req.body;
  if (!decision || !profile) return res.status(400).json({ error: 'Missing decision or profile' });

  const p = profile;
  const predictionPrompt = `Person profile: ${p.archetype}, Decision Style: ${p.decisionStyle || 'Deliberate'}, Kryptonite: ${p.kryptonite || p.blind_spot}\n\nThey are deciding: "${decision}"${context ? `\nContext: ${context}` : ''}\n\nPredict in 2 sentences: (1) what they will likely decide and why based on their patterns, and (2) how they will feel about this decision in 6 months. Be specific. Return plain text only.`;

  try {
    const prediction = await callLLM([{ role: 'user', content: predictionPrompt }], { maxTokens: 200 });
    res.json({ prediction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 3 — User Authentication via Magic Link (email-based, no password)
// ─────────────────────────────────────────────────────────────────────────────

// Request magic link
app.post('/api/auth/magic-link', async (req, res) => {
  const { email, origin } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  try {
    // Upsert user record
    const { data: user, error } = await supabase
      .from('mm_users')
      .upsert({ email: email.toLowerCase().trim(), magic_token: token, magic_token_expires_at: expires.toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'email' })
      .select().single();

    if (error) throw error;

    // Send magic link email
    if (RESEND_API_KEY) {
      const resend = new Resend(RESEND_API_KEY);
      const loginUrl = `${origin || 'https://mirrormind.ai'}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: 'Your MirrorMind login link',
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
              <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
              <p style="color: #a78bfa; margin: 8px 0 0;">Your login link</p>
            </div>
            <div style="padding: 40px; background: #fafafa;">
              <p>Click the button below to sign in. This link expires in 30 minutes.</p>
              <div style="text-align: center; margin: 40px 0;">
                <a href="${loginUrl}" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Sign In to MirrorMind</a>
              </div>
              <p style="color: #666; font-size: 14px;">If you didn't request this, ignore this email.</p>
            </div>
          </div>
        `,
      });
    }

    res.json({ success: true, message: 'Magic link sent. Check your email.' });
  } catch (err) {
    console.error('[Auth] Magic link error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Verify magic link token
app.post('/api/auth/verify', async (req, res) => {
  const { token, email } = req.body;
  if (!token || !email) return res.status(400).json({ error: 'Token and email required' });

  try {
    const { data: user, error } = await supabase
      .from('mm_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('magic_token', token)
      .single();

    if (error || !user) return res.status(401).json({ error: 'Invalid or expired link' });
    if (new Date(user.magic_token_expires_at) < new Date()) return res.status(401).json({ error: 'Link expired. Request a new one.' });

    // Clear token and return user session
    await supabase.from('mm_users').update({ magic_token: null, magic_token_expires_at: null, updated_at: new Date().toISOString() }).eq('id', user.id);

    // Generate a session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await supabase.from('mm_users').update({ magic_token: sessionToken, magic_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }).eq('id', user.id);

    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier, canonicalArchetype: user.canonical_archetype, currentPlanWeek: user.current_plan_week },
      sessionToken,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user from session token
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { data: user } = await supabase.from('mm_users').select('*').eq('magic_token', token).single();
    if (!user) return res.status(401).json({ error: 'Invalid session' });
    if (new Date(user.magic_token_expires_at) < new Date()) return res.status(401).json({ error: 'Session expired' });

    res.json({ user: { id: user.id, email: user.email, name: user.name, tier: user.tier, canonicalArchetype: user.canonical_archetype, currentPlanWeek: user.current_plan_week, planStartDate: user.plan_start_date } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) await supabase.from('mm_users').update({ magic_token: null, magic_token_expires_at: null }).eq('magic_token', token);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 4 — Weekly Check-In API
// ─────────────────────────────────────────────────────────────────────────────

// Submit a weekly check-in
app.post('/api/checkin', async (req, res) => {
  const { sessionId, userId, planWeek, q1WhatChanged, q2WhatAvoided, q3WhatNoticed } = req.body;
  if (!planWeek || (!sessionId && !userId)) return res.status(400).json({ error: 'Missing required fields' });

  // Get profile for Twin response
  const session = sessionId ? profiles.get(sessionId) : null;
  const archetype = session?.profile?.archetype || 'unknown';

  // Generate Twin response to the check-in
  const CHECKIN_TWIN_PROMPTS = {
    'The Architect': 'You are the Architect\'s rigorous thinking partner. Respond to their weekly check-in with one precise observation and one specific question that challenges their analysis paralysis.',
    'The Performer': 'You are the Performer\'s Twin — the one entity that needs nothing from them. Respond to their check-in by redirecting from relational impact to personal desire. Ask what THEY wanted this week.',
    'The Protector': 'You are the Protector\'s Twin. Respond to their check-in by asking about their own experience, not their management of others. Celebrate any moment of receiving.',
    'The Seeker': 'You are the Seeker\'s Twin. Respond to their check-in by celebrating any action taken and gently challenging any insight that has not yet become action.',
    'The Diplomat': 'You are the Diplomat\'s Twin. Respond to their check-in by celebrating any direct statement and asking what they are still softening.',
    'The Visionary': 'You are the Visionary\'s Twin. Respond to their check-in by celebrating any completion and asking what they are still avoiding finishing.',
    'The Anchor': 'You are the Anchor\'s Twin. Respond to their check-in by celebrating any small change as significant and asking what they noticed about their resistance.',
    'The Rebel': 'You are the Rebel\'s Twin. Respond to their check-in by celebrating any moment of genuine commitment and asking what they are still pushing against.',
  };

  const twinInstruction = CHECKIN_TWIN_PROMPTS[archetype] || 'Respond to their weekly check-in with one observation and one question.';

  let twinResponse = null;
  try {
    twinResponse = await callLLM([
      { role: 'system', content: `${twinInstruction} Keep your response to 2-3 sentences. Be specific to what they shared.` },
      { role: 'user', content: `Week ${planWeek} check-in:\n1. What I did differently: ${q1WhatChanged || '(not answered)'}\n2. What I avoided: ${q2WhatAvoided || '(not answered)'}\n3. What I noticed: ${q3WhatNoticed || '(not answered)'}` },
    ], { maxTokens: 200 });
  } catch (e) { console.warn('[Checkin] Twin response failed:', e.message); }

  try {
    // Get growth plan ID
    let growthPlanId = null;
    if (userId) {
      const { data: plan } = await supabase.from('mm_growth_plans').select('id').eq('user_id', userId).eq('is_active', true).single();
      growthPlanId = plan?.id;
    } else if (sessionId) {
      const { data: plan } = await supabase.from('mm_growth_plans').select('id').eq('session_id', sessionId).eq('is_active', true).single();
      growthPlanId = plan?.id;
    }

    const { data: checkin } = await supabase.from('mm_checkins').insert({
      user_id: userId || null,
      session_id: sessionId || null,
      growth_plan_id: growthPlanId,
      plan_week: planWeek,
      plan_year: 1,
      q1_what_changed: q1WhatChanged,
      q2_what_avoided: q2WhatAvoided,
      q3_what_noticed: q3WhatNoticed,
      twin_response: twinResponse,
    }).select().single();

    // Advance plan week
    if (userId) await supabase.from('mm_users').update({ current_plan_week: planWeek + 1, updated_at: new Date().toISOString() }).eq('id', userId);
    if (growthPlanId) await supabase.from('mm_growth_plans').update({ current_week: planWeek + 1, updated_at: new Date().toISOString() }).eq('id', growthPlanId);

    res.json({ success: true, twinResponse, checkinId: checkin?.id });
  } catch (err) {
    console.error('[Checkin] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get check-in history for a user/session
app.get('/api/checkins', async (req, res) => {
  const { sessionId, userId } = req.query;
  if (!sessionId && !userId) return res.status(400).json({ error: 'sessionId or userId required' });

  try {
    let query = supabase.from('mm_checkins').select('*').order('plan_week', { ascending: true });
    if (userId) query = query.eq('user_id', userId);
    else query = query.eq('session_id', sessionId);

    const { data } = await query;
    res.json({ checkins: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current week's habit for a given archetype and week number
app.get('/api/growth-plan/week', async (req, res) => {
  const { archetype, week } = req.query;
  if (!archetype || !week) return res.status(400).json({ error: 'archetype and week required' });

  const weekNum = parseInt(week, 10);
  const quarter = weekNum <= 13 ? 1 : weekNum <= 26 ? 2 : weekNum <= 39 ? 3 : 4;
  const quarterThemes = { 1: 'Awareness', 2: 'Disruption', 3: 'Integration', 4: 'Expansion' };
  const isCheckpointWeek = [13, 26, 39, 52].includes(weekNum);
  const isMilestoneWeek = weekNum % 4 === 0;

  // Read the weekly summary file if it exists
  const weekLabel = String(weekNum).padStart(2, '0');
  const year = new Date().getFullYear();
  const summaryPath = path.join(__dirname, 'docs', 'weekly-summaries', `${year}-W${weekLabel}.md`);
  let summaryContent = null;
  if (fs.existsSync(summaryPath)) summaryContent = fs.readFileSync(summaryPath, 'utf8');

  res.json({
    week: weekNum,
    quarter,
    quarterTheme: quarterThemes[quarter],
    isCheckpointWeek,
    isMilestoneWeek,
    summaryAvailable: !!summaryContent,
    summaryContent,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 5 — Q Integration Checkpoint
// ─────────────────────────────────────────────────────────────────────────────

const CHECKPOINT_ARCHETYPE_QUESTIONS = {
  'The Architect': 'What decisions did you make quickly this quarter? What are you still over-preparing for?',
  'The Performer': 'What did you stop performing this quarter? What are you still performing?',
  'The Protector': 'What did you allow yourself to receive this quarter? What are you still protecting?',
  'The Seeker': 'What did you act on this quarter? What are you still only thinking about?',
  'The Diplomat': 'What did you say directly this quarter? What are you still softening?',
  'The Visionary': 'What have you finished this quarter? What are you still avoiding finishing?',
  'The Anchor': 'What have you changed this quarter? What are you still defaulting to?',
  'The Rebel': 'What have you built this quarter? What are you still pushing against?',
};

app.post('/api/checkpoint', async (req, res) => {
  const { sessionId, userId, checkpointNumber, planWeek, q1, q2, q3, q4, archetypeReflection } = req.body;
  if (!checkpointNumber || !planWeek || (!sessionId && !userId)) return res.status(400).json({ error: 'Missing required fields' });

  // Check tier access
  const session = sessionId ? profiles.get(sessionId) : null;
  const tier = session?.tier || 'free';
  const tierCheckpointAccess = { free: [], core: [1], social: [1, 2], deep: [1, 2, 3, 4] };
  if (!tierCheckpointAccess[tier]?.includes(checkpointNumber)) {
    return res.status(403).json({ error: 'Upgrade required to access this checkpoint', requiredTier: checkpointNumber <= 1 ? 'core' : checkpointNumber <= 2 ? 'social' : 'deep' });
  }

  const archetype = session?.profile?.archetype || 'unknown';

  // Recall previous forward commitment
  let previousCommitment = null;
  if ((userId || sessionId) && checkpointNumber > 1) {
    const query = userId
      ? supabase.from('mm_checkpoints').select('forward_commitment').eq('user_id', userId).eq('checkpoint_number', checkpointNumber - 1).single()
      : supabase.from('mm_checkpoints').select('forward_commitment').eq('session_id', sessionId).eq('checkpoint_number', checkpointNumber - 1).single();
    const { data } = await query;
    previousCommitment = data?.forward_commitment;
  }

  // Generate Twin synthesis
  const quarterThemes = { 1: 'Q1 Awareness', 2: 'Q2 Disruption', 3: 'Q3 Integration', 4: 'Q4 Expansion' };
  const archetypeQ = CHECKPOINT_ARCHETYPE_QUESTIONS[archetype] || '';
  const commitmentRecall = previousCommitment ? `\n\nAt the previous checkpoint, they committed to: "${previousCommitment}". Reference this commitment in your response.` : '';

  let twinSynthesis = null;
  let habitAdjustment = 'maintain';
  let forwardCommitment = q4;

  try {
    const synthesisPrompt = `You are the AI Twin conducting a ${quarterThemes[checkpointNumber]} Integration Checkpoint for a ${archetype}.${commitmentRecall}

Their responses:
1. What changed: ${q1}
2. What was avoided: ${q2}
3. What surprised them: ${q3}
4. Next quarter focus: ${q4}
Archetype reflection: ${archetypeReflection || '(not answered)'}

Archetype-specific question they were asked: "${archetypeQ}"

Respond with a JSON object:
{
  "synthesis": "2-3 paragraphs of Twin synthesis — acknowledge what changed, name what was avoided without judgment, and orient toward next quarter",
  "habitAdjustment": "escalate OR maintain OR break_down (based on whether genuine change is detected, pattern is reasserting, or significant avoidance occurred)",
  "archetypeConfirmed": true or false,
  "archetypeRevision": "null or the new canonical archetype name if a shift is detected",
  "forwardCommitment": "A specific, concrete commitment for next quarter based on their q4 answer — 1 sentence"
}`;

    const raw = await callLLM([{ role: 'user', content: synthesisPrompt }], { maxTokens: 800 });
    const parsed = JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    twinSynthesis = parsed.synthesis;
    habitAdjustment = parsed.habitAdjustment || 'maintain';
    forwardCommitment = parsed.forwardCommitment || q4;

    // Update archetype if revised
    if (!parsed.archetypeConfirmed && parsed.archetypeRevision && userId) {
      await supabase.from('mm_users').update({ canonical_archetype: parsed.archetypeRevision, updated_at: new Date().toISOString() }).eq('id', userId);
    }
  } catch (e) { console.warn('[Checkpoint] Twin synthesis failed:', e.message); }

  try {
    // Get growth plan ID
    let growthPlanId = null;
    if (userId) {
      const { data: plan } = await supabase.from('mm_growth_plans').select('id').eq('user_id', userId).eq('is_active', true).single();
      growthPlanId = plan?.id;
    }

    const { data: checkpoint } = await supabase.from('mm_checkpoints').upsert({
      user_id: userId || null,
      session_id: sessionId || null,
      growth_plan_id: growthPlanId,
      checkpoint_number: checkpointNumber,
      plan_week: planWeek,
      plan_year: 1,
      q1_what_changed: q1,
      q2_what_avoided: q2,
      q3_what_surprised: q3,
      q4_next_quarter_focus: q4,
      archetype_reflection: archetypeReflection,
      archetype_confirmed: true,
      habit_adjustment: habitAdjustment,
      forward_commitment: forwardCommitment,
      twin_synthesis: twinSynthesis,
    }, { onConflict: 'user_id,checkpoint_number,plan_year' }).select().single();

    // Save forward commitment
    if (forwardCommitment && checkpoint?.id) {
      await supabase.from('mm_forward_commitments').insert({
        user_id: userId || null,
        session_id: sessionId || null,
        checkpoint_id: checkpoint.id,
        plan_week: planWeek,
        commitment_text: forwardCommitment,
      });
    }

    res.json({ success: true, twinSynthesis, habitAdjustment, forwardCommitment, checkpointId: checkpoint?.id });
  } catch (err) {
    console.error('[Checkpoint] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get checkpoint history
app.get('/api/checkpoints', async (req, res) => {
  const { sessionId, userId } = req.query;
  if (!sessionId && !userId) return res.status(400).json({ error: 'sessionId or userId required' });

  try {
    let query = supabase.from('mm_checkpoints').select('*').order('checkpoint_number', { ascending: true });
    if (userId) query = query.eq('user_id', userId);
    else query = query.eq('session_id', sessionId);
    const { data } = await query;
    res.json({ checkpoints: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 9 — Growth Plan Email Sequences
// ─────────────────────────────────────────────────────────────────────────────

async function sendWeeklyHabitEmail(email, name, archetype, week, habitTitle, habitInstruction) {
  if (!RESEND_API_KEY) return;
  const quarterNum = week <= 13 ? 1 : week <= 26 ? 2 : week <= 39 ? 3 : 4;
  const quarterTheme = ['Awareness', 'Disruption', 'Integration', 'Expansion'][quarterNum - 1];
  const isCheckpoint = [13, 26, 39, 52].includes(week);
  const resend = new Resend(RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: isCheckpoint
        ? `📍 Week ${week} — Q${quarterNum} Integration Checkpoint`
        : `Week ${week} — Your ${archetype} Growth Habit`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
            <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
            <p style="color: #a78bfa; margin: 8px 0 0;">Week ${week} — Q${quarterNum}: ${quarterTheme}</p>
          </div>
          <div style="padding: 40px; background: #fafafa;">
            <p>Hi ${name || 'there'},</p>
            ${isCheckpoint ? `<p><strong>This is your Q${quarterNum} Integration Checkpoint week.</strong> Before starting a new habit, take time to review the last 13 weeks with your AI Twin.</p>` : `<p>This week's habit for <strong>${archetype}</strong>:</p>`}
            <div style="background: #1a1a2e; padding: 24px; border-radius: 8px; margin: 24px 0;">
              <h2 style="color: #c084fc; margin: 0 0 12px;">${habitTitle}</h2>
              <p style="color: #e2e8f0; margin: 0;">${habitInstruction}</p>
            </div>
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://mirrormind.ai/#growth-plan" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Open Your Growth Plan</a>
            </div>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Week ${week} habit email sent to ${email}`);
  } catch (e) { console.warn('[Email] Weekly habit email failed:', e.message); }
}

async function sendCheckpointReminderEmail(email, name, archetype, checkpointNumber) {
  if (!RESEND_API_KEY) return;
  const week = checkpointNumber * 13;
  const resend = new Resend(RESEND_API_KEY);
  const archetypeQ = CHECKPOINT_ARCHETYPE_QUESTIONS[archetype] || 'What changed this quarter?';
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Your Q${checkpointNumber} Integration Checkpoint is ready`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e; line-height: 1.8;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; text-align: center;">
            <h1 style="color: #c084fc; font-size: 28px; margin: 0;">MirrorMind</h1>
            <p style="color: #a78bfa; margin: 8px 0 0;">Q${checkpointNumber} Integration Checkpoint — Week ${week}</p>
          </div>
          <div style="padding: 40px; background: #fafafa;">
            <p>Hi ${name || 'there'},</p>
            <p>You have completed ${checkpointNumber * 13} weeks of your ${archetype} growth plan. This is your Integration Checkpoint — a structured review with your AI Twin before the next quarter begins.</p>
            <p>Your archetype-specific reflection question this quarter:</p>
            <blockquote style="border-left: 4px solid #7c3aed; padding-left: 20px; color: #4a4a6a; font-style: italic;">${archetypeQ}</blockquote>
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://mirrormind.ai/#checkpoint" style="background: linear-gradient(135deg, #7c3aed, #c084fc); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Start Your Checkpoint</a>
            </div>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Checkpoint ${checkpointNumber} reminder sent to ${email}`);
  } catch (e) { console.warn('[Email] Checkpoint reminder failed:', e.message); }
}

// Trigger weekly habit email (called by the weekly cron or manually)
app.post('/api/send-weekly-habit', async (req, res) => {
  const { email, name, archetype, week, habitTitle, habitInstruction } = req.body;
  if (!email || !week) return res.status(400).json({ error: 'email and week required' });
  await sendWeeklyHabitEmail(email, name, archetype, week, habitTitle, habitInstruction);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 11 — Year 2 Plan Generation
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/year2-plan', async (req, res) => {
  const { userId, sessionId } = req.body;
  if (!userId && !sessionId) return res.status(400).json({ error: 'userId or sessionId required' });

  // Check Deep tier
  const session = sessionId ? profiles.get(sessionId) : null;
  const tier = session?.tier || 'free';
  if (tier !== 'deep') return res.status(403).json({ error: 'Year 2 Plan generation requires Deep tier', requiredTier: 'deep' });

  try {
    // Gather all 4 checkpoints
    let checkpointQuery = supabase.from('mm_checkpoints').select('*').order('checkpoint_number');
    if (userId) checkpointQuery = checkpointQuery.eq('user_id', userId);
    else checkpointQuery = checkpointQuery.eq('session_id', sessionId);
    const { data: checkpoints } = await checkpointQuery;

    // Gather check-in history
    let checkinQuery = supabase.from('mm_checkins').select('*').order('plan_week');
    if (userId) checkinQuery = checkinQuery.eq('user_id', userId);
    else checkinQuery = checkinQuery.eq('session_id', sessionId);
    const { data: checkins } = await checkinQuery;

    // Get user profile
    let userRecord = null;
    if (userId) {
      const { data } = await supabase.from('mm_users').select('*').eq('id', userId).single();
      userRecord = data;
    }

    const archetype = userRecord?.canonical_archetype || session?.profile?.archetype || 'unknown';
    const checkpointSummary = (checkpoints || []).map(c => `Q${c.checkpoint_number}: Changed: ${c.q1_what_changed} | Avoided: ${c.q2_what_avoided} | Commitment: ${c.forward_commitment}`).join('\n');
    const checkinSummary = `${(checkins || []).length} weekly check-ins completed. Avoidance patterns: ${(checkins || []).filter(c => c.q2_what_avoided).map(c => c.q2_what_avoided).slice(-5).join('; ')}`;

    const year2Prompt = `You are generating a Year 2 Growth Plan for a MirrorMind user.

ARCHETYPE: ${archetype}
YEAR 1 DATA:
- Check-ins completed: ${(checkins || []).length}/52
- Checkpoint summaries:\n${checkpointSummary}
- Recent avoidance patterns: ${checkinSummary}

Generate a Year 2 Plan as JSON:
{
  "growthDistanceStatement": "A second-person paragraph (3-4 sentences) describing the distance between who they were at Week 1 and who they are now. This is the most emotionally resonant output in the product.",
  "year2Theme": "One of: Externalisation | Deepening | Expansion | Recalibration",
  "year2ThemeRationale": "2 sentences explaining why this theme was selected based on their Year 1 data",
  "updatedArchetypeProfile": "2 sentences describing how their expression of ${archetype} has evolved",
  "q1Theme": "Q1 theme title for Year 2",
  "q2Theme": "Q2 theme title for Year 2",
  "q3Theme": "Q3 theme title for Year 2",
  "q4Theme": "Q4 theme title for Year 2",
  "week1Habit": { "title": "Week 1 habit title", "instruction": "Week 1 habit instruction" },
  "forwardCommitment": "The one commitment for Year 2 — 1 specific sentence"
}`;

    const raw = await callLLM([{ role: 'user', content: year2Prompt }], { maxTokens: 1200 });
    const year2Plan = JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));

    // Save Year 2 plan to Supabase
    if (userId) {
      await supabase.from('mm_growth_plans').insert({
        user_id: userId,
        archetype,
        plan_year: 2,
        start_date: new Date().toISOString().split('T')[0],
        current_week: 1,
        current_quarter: 1,
        theme: year2Plan.year2Theme,
        is_active: true,
      });
      // Deactivate Year 1 plan
      await supabase.from('mm_growth_plans').update({ is_active: false }).eq('user_id', userId).eq('plan_year', 1);
    }

    res.json({ success: true, year2Plan });
  } catch (err) {
    console.error('[Year2] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 14 — Account Management
// ─────────────────────────────────────────────────────────────────────────────

// Get account details
app.get('/api/account', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const { data: user } = await supabase.from('mm_users').select('id, email, name, tier, plan, canonical_archetype, current_plan_week, plan_start_date, created_at').eq('magic_token', token).single();
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    // Get subscription info from Stripe if available
    let subscriptionStatus = null;
    if (STRIPE_SECRET_KEY && user.stripe_customer_id) {
      try {
        const stripe = new Stripe(STRIPE_SECRET_KEY);
        const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, limit: 1 });
        if (subs.data.length > 0) {
          subscriptionStatus = { status: subs.data[0].status, currentPeriodEnd: new Date(subs.data[0].current_period_end * 1000).toISOString() };
        }
      } catch (e) { console.warn('[Account] Stripe lookup failed:', e.message); }
    }

    res.json({ user, subscriptionStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update account name
app.patch('/api/account', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { name } = req.body;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const { data: user } = await supabase.from('mm_users').update({ name, updated_at: new Date().toISOString() }).eq('magic_token', token).select().single();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel subscription
app.post('/api/account/cancel', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const { data: user } = await supabase.from('mm_users').select('*').eq('magic_token', token).single();
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    if (STRIPE_SECRET_KEY && user.stripe_customer_id) {
      const stripe = new Stripe(STRIPE_SECRET_KEY);
      const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, limit: 1 });
      if (subs.data.length > 0) {
        await stripe.subscriptions.update(subs.data[0].id, { cancel_at_period_end: true });
      }
    }

    res.json({ success: true, message: 'Subscription will cancel at the end of your current billing period.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the frontend for all other routes
app.get('/*path', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err.message, err.stack?.split('\n')[1]);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : err.message,
  });
});

// Note: Express 5 handles 404s via the global error handler above

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`MirrorMind running on port ${PORT}`));
