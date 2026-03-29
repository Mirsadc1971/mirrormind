import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory store (replace with DB in production) ────────────────────────
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
app.post('/api/session', (req, res) => {
  const id = crypto.randomUUID();
  profiles.set(id, { answers: [], profile: null, report: null, createdAt: Date.now() });
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
  const reportPrompt = `You are writing a Mirror Report — a deeply personal psychological document that feels like it was written by someone who has known this person for years.

PROFILE DATA:
Archetype: ${p.archetype}
Communication Style: ${p.communicationStyle}
Decision Style: ${p.decisionStyle}
Core Values: ${p.coreValues.join(', ')}
Self-Deception: ${p.selfDeception}
Superpower: ${p.superpower}
Kryptonite: ${p.kryptonite}
Shadow Self: ${p.shadowSelf}

Write a Mirror Report with these sections. Be specific, provocative, and accurate. No generic platitudes. Write as if you know them personally.

Return JSON with EXACTLY this structure:
{
  "headline": "A single sentence that captures their essence — should make them feel seen",
  "openingParagraph": "2-3 sentences that feel startlingly accurate about who they are right now",
  "strengthsNarrative": "A paragraph about their genuine strengths — not flattery, real specific strengths",
  "shadowNarrative": "A paragraph about their shadow patterns — the things they do that undermine them, written with compassion but unflinching honesty",
  "blindSpotDeepDive": "Pick their most significant blind spot and write 2 paragraphs going deep on it",
  "theThingYoureAvoiding": "A direct 2-3 sentence statement about the thing they are currently avoiding in their life",
  "yourNextChapter": "A forward-looking paragraph about what becomes possible when they face their shadow",
  "shareableQuote": "A single powerful sentence from the report that they would want to share on social media — make it profound and personal"
}`;

  try {
    const raw = await callLLM([{ role: 'user', content: reportPrompt }], { maxTokens: 2000 });
    const report = JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    session.report = report;
    profiles.set(sessionId, session);
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
  profiles.set(`survey_${surveyId}`, survey);

  // Generate gap analysis
  const p = survey.profile;
  const gapPrompt = `A person with this profile: Archetype "${p.archetype}", Self-Deception: "${p.selfDeception}", Superpower: "${p.superpower}"

Their friends described them as:
${responses.map((r, i) => `Q${i + 1}: ${r}`).join('\n')}

Write a brief "Mirror Gap Analysis" — 2-3 sentences about the gap between how this person sees themselves and how others see them. Be specific and insightful. Return plain text only.`;

  try {
    const gapAnalysis = await callLLM([{ role: 'user', content: gapPrompt }], { maxTokens: 300 });
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
    res.json({ prediction, decisionId: entry.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get decision history
app.get('/api/decisions/:sessionId', (req, res) => {
  const list = decisions.get(req.params.sessionId) || [];
  res.json({ decisions: list });
});

// Serve the frontend for all other routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`MirrorMind running on port ${PORT}`));
