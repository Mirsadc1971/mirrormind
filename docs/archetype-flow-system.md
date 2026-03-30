# MirrorMind Archetype Flow System
### A Complete Design Guide for Personalised In-App Experiences

**Version 1.0 — March 2026**

---

## Overview

MirrorMind's core value proposition is that it feels like it was written by someone who has known you for years. That promise only holds if the product actually behaves differently for different people. The archetype system is the engine that makes this possible: it determines not just what the report *says*, but how the AI Twin *speaks*, what the growth track *prescribes*, how the friend survey is *framed*, and when and how upgrade prompts are *triggered*.

This document defines:
1. The **MirrorMind Archetype Taxonomy** — eight archetypes derived from the intersection of decision style, communication style, and core shadow pattern.
2. The **Psychological DNA** of each archetype — superpower, kryptonite, blind spot, shadow self, and self-deception.
3. The **Per-Archetype Flow Design** — report narrative voice, AI Twin tone, 90-day growth track, friend survey framing, and upgrade trigger strategy.
4. **Implementation guidance** for the LLM prompt layer and the frontend rendering layer.

---

## Part 1 — The Archetype Taxonomy

MirrorMind generates archetypes dynamically via LLM, but the system needs a **canonical set of eight archetypes** that the LLM is steered toward. This gives the product consistency, allows the frontend to render archetype-specific UI, and makes the growth track prescriptive rather than generic.

The eight archetypes are derived from three axes:
- **Energy direction**: Outward (action-first) vs. Inward (reflection-first)
- **Decision style**: Intuitive/Impulsive vs. Deliberate/Analytical
- **Core wound**: Control, Approval, Significance, or Safety

| # | Archetype Name | Energy | Decision Style | Core Wound |
|---|---|---|---|---|
| 1 | **The Architect** | Inward | Deliberate | Control |
| 2 | **The Performer** | Outward | Intuitive | Approval |
| 3 | **The Protector** | Outward | Deliberate | Safety |
| 4 | **The Seeker** | Inward | Intuitive | Significance |
| 5 | **The Diplomat** | Outward | Deliberate | Approval |
| 6 | **The Visionary** | Outward | Intuitive | Significance |
| 7 | **The Anchor** | Inward | Deliberate | Safety |
| 8 | **The Rebel** | Outward | Impulsive | Control |

---

## Part 2 — Psychological DNA Per Archetype

---

### 1. The Architect
*"You build systems to avoid feeling. The blueprints are perfect. The foundation is fear."*

The Architect is the person who has a plan for everything — including their emotions. They are extraordinarily competent, deeply analytical, and quietly terrified of chaos. They mistake thoroughness for safety and confuse control with love. Their intelligence is genuine; their use of it is often defensive.

| Dimension | Profile |
|---|---|
| **Superpower** | Sees the structure beneath the surface of any problem; builds things that last |
| **Kryptonite** | Paralysis by analysis; uses planning as a way to avoid committing |
| **Blind Spot** | Believes their logic is objective when it is actually deeply personal |
| **Shadow Self** | The person who never finishes anything because starting means risking failure |
| **Self-Deception** | "I just need more information before I decide" |
| **Core Values** | Precision, reliability, mastery, independence |
| **Communication Style** | Analytical — precise, measured, prefers written over verbal |
| **Decision Style** | Deliberate — extensive research, delayed commitment |
| **Stress Behaviour** | Withdraws, over-prepares, becomes critical of others' "sloppiness" |
| **Growth Direction** | Toward spontaneity and trust — acting before certainty arrives |

---

### 2. The Performer
*"You perform so well that no one — including you — knows what you actually want."*

The Performer is magnetic, adaptable, and exhausting to be. They read rooms with extraordinary precision and adjust themselves accordingly. Their warmth is real; their self-erasure is the price they pay for it. They have built an identity around being liked, which means they have never fully built an identity at all.

| Dimension | Profile |
|---|---|
| **Superpower** | Instantly makes people feel seen, heard, and important |
| **Kryptonite** | Shapeshifts to please others; loses track of their own preferences |
| **Blind Spot** | Mistakes being needed for being loved |
| **Shadow Self** | The person who resents everyone they have ever helped |
| **Self-Deception** | "I genuinely enjoy doing this for people" |
| **Core Values** | Connection, harmony, recognition, belonging |
| **Communication Style** | Expressive — warm, story-driven, emotionally fluent |
| **Decision Style** | Intuitive — reads the room, decides based on relational impact |
| **Stress Behaviour** | Over-commits, becomes passive-aggressive, performs wellness |
| **Growth Direction** | Toward self-definition — knowing what they want independent of others |

---

### 3. The Protector
*"You keep everyone safe. No one has ever made you feel safe in return."*

The Protector is the person everyone leans on. They are steady, dependable, and quietly carrying more than anyone knows. They have learned that vulnerability is a liability, so they converted it into strength. Their care for others is genuine and their self-neglect is systematic.

| Dimension | Profile |
|---|---|
| **Superpower** | Creates safety and stability for everyone in their orbit |
| **Kryptonite** | Cannot receive care without deflecting or minimising it |
| **Blind Spot** | Believes their self-sufficiency is strength rather than armour |
| **Shadow Self** | The person who secretly wants to be rescued |
| **Self-Deception** | "I'm fine — I just don't need what other people need" |
| **Core Values** | Loyalty, responsibility, strength, security |
| **Communication Style** | Direct — clear, action-oriented, uncomfortable with emotional abstraction |
| **Decision Style** | Deliberate — weighs impact on others before acting |
| **Stress Behaviour** | Doubles down on control, becomes dismissive of their own needs |
| **Growth Direction** | Toward receiving — allowing others to show up for them |

---

### 4. The Seeker
*"You are always searching for the thing that will finally make you feel complete."*

The Seeker is the person who has read every self-help book, tried every modality, and is still not quite sure who they are. They are genuinely curious, emotionally deep, and perpetually dissatisfied. Their search for meaning is authentic; their avoidance of commitment is the shadow side of that search.

| Dimension | Profile |
|---|---|
| **Superpower** | Sees depth and meaning where others see surface; asks the questions no one else will |
| **Kryptonite** | Confuses exploration with progress; collects insights without implementing them |
| **Blind Spot** | Believes the right framework will finally explain them — and then they can begin |
| **Shadow Self** | The person who uses self-awareness as a reason to never be held accountable |
| **Self-Deception** | "I'm still figuring myself out" (said for the tenth year in a row) |
| **Core Values** | Authenticity, depth, freedom, meaning |
| **Communication Style** | Expressive — metaphorical, philosophical, allergic to small talk |
| **Decision Style** | Intuitive — follows resonance over logic |
| **Stress Behaviour** | Spirals inward, becomes self-absorbed, seeks new frameworks instead of action |
| **Growth Direction** | Toward commitment — choosing a direction and staying with it |

---

### 5. The Diplomat
*"You are so good at making everyone comfortable that you have made yourself invisible."*

The Diplomat is the person who never says the wrong thing because they have learned to say almost nothing real. They are skilled mediators, natural peacemakers, and deeply conflict-averse. Their ability to hold multiple perspectives is a genuine gift; their inability to hold their own is the cost.

| Dimension | Profile |
|---|---|
| **Superpower** | Sees all sides of every situation; makes people feel understood |
| **Kryptonite** | Avoids conflict so consistently that their own needs become invisible |
| **Blind Spot** | Believes keeping the peace is the same as having integrity |
| **Shadow Self** | The person who is quietly furious at everyone they have accommodated |
| **Self-Deception** | "I just don't like drama" |
| **Core Values** | Harmony, fairness, connection, inclusion |
| **Communication Style** | Diplomatic — careful, considerate, skilled at softening hard truths |
| **Decision Style** | Collaborative — needs consensus before committing |
| **Stress Behaviour** | Withdraws, becomes passive, over-explains their neutrality |
| **Growth Direction** | Toward directness — saying the true thing even when it creates friction |

---

### 6. The Visionary
*"You can see exactly where everything is going. You just can't stay long enough to build it."*

The Visionary is the person with ten ideas before breakfast and zero finished projects by dinner. They are genuinely inspired, infectiously energetic, and constitutionally allergic to the mundane. Their vision is real; their follow-through is the thing they have been meaning to work on.

| Dimension | Profile |
|---|---|
| **Superpower** | Sees possibilities others cannot; generates energy and momentum from nothing |
| **Kryptonite** | Abandons projects at the point where they become work rather than inspiration |
| **Blind Spot** | Believes enthusiasm is the same as execution |
| **Shadow Self** | The person who has been "about to change everything" for years |
| **Self-Deception** | "I work best when I'm inspired — I just need the right conditions" |
| **Core Values** | Innovation, freedom, impact, possibility |
| **Communication Style** | Expressive — big-picture, energising, impatient with details |
| **Decision Style** | Intuitive/Impulsive — decides fast, pivots faster |
| **Stress Behaviour** | Launches new projects to escape the discomfort of finishing old ones |
| **Growth Direction** | Toward completion — finding meaning in the finish, not just the start |

---

### 7. The Anchor
*"You are the most reliable person in every room. You are also the most stuck."*

The Anchor is the person who has not changed in years — not because they are incapable, but because stability has become an identity. They are deeply loyal, profoundly consistent, and quietly terrified of disruption. Their reliability is a genuine strength; their resistance to change is the shadow side of that strength.

| Dimension | Profile |
|---|---|
| **Superpower** | Creates consistency and trust; people know exactly what they are getting |
| **Kryptonite** | Confuses familiarity with safety; resists change until it is forced |
| **Blind Spot** | Believes their consistency is a virtue when it is sometimes just fear |
| **Shadow Self** | The person who chose the safe path and has been quietly grieving it |
| **Self-Deception** | "I'm just not someone who needs a lot of change" |
| **Core Values** | Stability, loyalty, tradition, security |
| **Communication Style** | Direct — practical, grounded, uncomfortable with abstraction |
| **Decision Style** | Deliberate — slow to decide, even slower to change their mind |
| **Stress Behaviour** | Doubles down on routine, becomes rigid, dismisses new information |
| **Growth Direction** | Toward evolution — choosing change before it is chosen for them |

---

### 8. The Rebel
*"You have spent so much energy pushing against things that you have forgotten what you are pushing toward."*

The Rebel is the person who built their identity around not being controlled. They are fiercely independent, instinctively contrarian, and genuinely allergic to authority. Their refusal to be boxed in is a real strength; their reflexive rejection of structure is the thing that keeps them from building anything lasting.

| Dimension | Profile |
|---|---|
| **Superpower** | Sees through systems and exposes what others are too polite to say |
| **Kryptonite** | Defines themselves by opposition; cannot commit to anything that requires conformity |
| **Blind Spot** | Believes their non-conformity is freedom when it is often just a different kind of cage |
| **Shadow Self** | The person who secretly wants the stability they have spent their life rejecting |
| **Self-Deception** | "I don't need anyone's approval" (said to everyone, constantly) |
| **Core Values** | Autonomy, authenticity, disruption, truth |
| **Communication Style** | Direct/Expressive — blunt, provocative, allergic to corporate language |
| **Decision Style** | Impulsive — acts on instinct, distrusts deliberation as "overthinking" |
| **Stress Behaviour** | Burns bridges, escalates conflict, sabotages stability |
| **Growth Direction** | Toward integration — building something that requires staying |

---

## Part 3 — Per-Archetype Flow Design

Each archetype should shape five distinct product touchpoints:

1. **Report Narrative Voice** — the tone and framing of the written Mirror Report
2. **AI Twin Tone** — how the AI Twin speaks to this person
3. **90-Day Growth Track** — the specific behavioural prescription
4. **Friend Survey Framing** — how the friend survey invitation is worded
5. **Upgrade Trigger Strategy** — when and how to prompt paid conversion

---

### Flow 1 — The Architect

**Report Narrative Voice**
Write with precision and specificity. The Architect respects data and distrusts vague generalities. The report should feel like a well-reasoned analysis, not a horoscope. Use cause-and-effect framing ("Because you process this way, you tend to..."). Name the specific mechanism of their self-deception — the exact thought pattern, not just the outcome. The shadow section should be clinical but compassionate: acknowledge the intelligence of the defence before dismantling it.

**AI Twin Tone**
The Twin should be the Architect's most rigorous thinking partner — not a cheerleader. It should ask precise questions, challenge their assumptions with evidence, and refuse to validate analysis paralysis. When the Architect says "I need more information," the Twin should ask: "What specific piece of information would actually change your decision?" It should speak in structured language — numbered points, clear distinctions — because that is what the Architect trusts.

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Identify the decision they have been postponing | Write down the decision and the information they claim to need. Ask: "If I had that information, would I actually decide?" |
| 3–4 | One imperfect action per day | Commit to one small action each day that does not require certainty. Log the outcome. |
| 5–8 | Emotional audit | Each evening, note one feeling they experienced but did not act on. Build vocabulary for internal states. |
| 9–12 | Spontaneity practice | Once per week, make a decision in under 60 seconds. No research. Log how it turned out. |

**Friend Survey Framing**
*"You analyse everything — but you have a blind spot about how you come across. Your friends see the version of you that exists outside your own head. Ask three people who know you well: what do they actually see?"*

**Upgrade Trigger Strategy**
The Architect will not upgrade on emotion — they need a rational case. The upgrade prompt should appear after the report is rendered, framed as: *"Your report identified three specific patterns. The Deep tier includes a 90-day behavioural protocol that addresses each one with specific weekly interventions."* Lead with structure and specificity. Avoid urgency language — it reads as manipulation to this archetype.

---

### Flow 2 — The Performer

**Report Narrative Voice**
The report must feel warm but honest — the Performer is used to being told what they want to hear, so the report's value comes from its willingness to say what no one else will. The opening should acknowledge their genuine gifts before moving into the shadow. The self-deception section should be written with compassion but without softening: name the specific performance they are running and what it is costing them. The closing should feel like a permission slip to stop performing.

**AI Twin Tone**
The Twin should be the one person who does not need anything from the Performer. It should be warm but completely unimpressed by the performance. When the Performer says "I just want everyone to be happy," the Twin should ask: "What do *you* want?" It should consistently redirect from relational impact to personal desire. It should celebrate moments of self-definition, not moments of self-sacrifice.

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Preference inventory | Each day, answer: "What did I want today that I didn't say?" Write it down. Do not share it. |
| 3–4 | One honest no | Decline one request per week without over-explaining. Note the discomfort. |
| 5–8 | Desire practice | Once per day, do something solely because you want to — not because it helps anyone. |
| 9–12 | Identity statement | Write a one-paragraph answer to: "Who am I when no one needs anything from me?" |

**Friend Survey Framing**
*"You are extraordinary at making others feel seen. But do the people closest to you actually see you? Ask three friends what they think you really want — not what you say you want."*

**Upgrade Trigger Strategy**
The Performer converts on connection and validation. The upgrade prompt should appear after the friend survey section is shown as locked, and should be framed as: *"Your friends have observations about you that you have never heard. The Core tier unlocks the friendMirror — the section where external perception meets self-perception."* The emotional hook is being truly seen.

---

### Flow 3 — The Protector

**Report Narrative Voice**
The report must honour the Protector's strength before it can reach their vulnerability. Open with a genuine acknowledgement of what they carry and how rare that is. The shadow section should be direct — the Protector respects directness — but should frame vulnerability as a form of strength rather than weakness. The self-deception section should name the specific cost of their self-sufficiency: what relationships have been prevented, what intimacy has been blocked.

**AI Twin Tone**
The Twin should be the one entity the Protector does not have to protect. It should be steady, direct, and completely safe — it will not fall apart if the Protector is honest. When the Protector deflects ("I'm fine"), the Twin should not accept it: "I know you're capable of being fine. That's not what I asked." It should model receiving — asking the Protector questions about their own experience rather than their management of others'.

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Needs inventory | Each day, complete the sentence: "Today I needed..." without adding "but I handled it." |
| 3–4 | One ask per week | Ask one person for something — help, time, support — without framing it as a favour to them. |
| 5–8 | Receiving practice | When someone offers help, accept it without deflecting. Note the discomfort. |
| 9–12 | Vulnerability window | Once per week, share something real with someone who cares about you. Not a problem — a feeling. |

**Friend Survey Framing**
*"You show up for everyone. But do the people in your life know how to show up for you? Ask three people: what do they think you actually need — and do they feel like you let them give it to you?"*

**Upgrade Trigger Strategy**
The Protector will not upgrade for themselves — they will upgrade if they believe it will make them better for the people they care about. Frame the upgrade as: *"The Deep tier includes a 90-day protocol specifically designed for people who carry more than they show. It is not about fixing you — it is about giving you back the energy you have been spending on everyone else."*

---

### Flow 4 — The Seeker

**Report Narrative Voice**
The Seeker will love the report — and then use it as another framework to explore rather than act on. The report must anticipate this. The shadow section should name the specific pattern: *"You will read this report, feel deeply understood, share it with two people, and then continue doing exactly what you were doing before."* The closing section must be a direct challenge to act, not just reflect. Give them one specific thing to do this week.

**AI Twin Tone**
The Twin should be philosophically fluent but action-oriented. It should engage with the Seeker's depth genuinely — not dismiss it — but consistently redirect from insight to implementation. When the Seeker says "I've been thinking about this a lot," the Twin should ask: "What have you done differently as a result?" It should celebrate action, not insight. It should be slightly impatient — not unkindly, but enough to create productive friction.

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Insight-to-action ratio | For every insight recorded this week, write one specific action it implies. Do the action within 24 hours. |
| 3–4 | Commitment practice | Choose one area of life and commit to one decision in it. Do not revisit the decision for 30 days. |
| 5–8 | Framework fast | No new personality tests, frameworks, or self-help content. Apply what you already know. |
| 9–12 | Identity through action | Write weekly: "This week I was the person who..." — defined by behaviour, not belief. |

**Friend Survey Framing**
*"You have a lot of self-knowledge. But self-knowledge and self-awareness are different things. Ask three people who know you well: do they think you act on what you know about yourself?"*

**Upgrade Trigger Strategy**
The Seeker is the most likely to upgrade — they love depth and new frameworks. The risk is that they upgrade, explore the features, and never implement anything. The upgrade prompt should be framed as a challenge: *"The Deep tier includes a 90-day growth track. It is not more insight — it is a structured commitment protocol. The question is whether you will actually use it."*

---

### Flow 5 — The Diplomat

**Report Narrative Voice**
The Diplomat needs the report to give them permission to have a perspective. The narrative should be warm and validating in tone but unflinching in content. The shadow section must name the specific cost of their conflict avoidance — not in abstract terms, but in concrete relational terms: the conversations they have not had, the needs they have not expressed, the resentment that has been building. The closing should frame directness as an act of love, not aggression.

**AI Twin Tone**
The Twin should model directness without aggression — showing the Diplomat that it is possible to say hard things and remain in relationship. When the Diplomat hedges ("I can see both sides"), the Twin should ask: "What do *you* think?" It should not accept non-answers. It should celebrate moments when the Diplomat takes a clear position, even a small one. It should be warm but have a spine.

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Opinion inventory | Each day, form and record a clear opinion on something — anything. Do not qualify it. |
| 3–4 | One direct statement per day | Say one thing directly that you would normally soften or avoid. Note the outcome. |
| 5–8 | Conflict as care | Have one conversation per week that you have been avoiding. Frame it as caring about the relationship. |
| 9–12 | Needs expression | Once per week, express a need directly without framing it as a question or a preference. |

**Friend Survey Framing**
*"You are exceptional at understanding others. But do the people in your life know what you actually think? Ask three people: do they feel like they know the real you — or a very pleasant version of you?"*

**Upgrade Trigger Strategy**
The Diplomat will not upgrade if the prompt feels pushy — it will trigger their conflict avoidance. Frame the upgrade gently but with a direct value statement: *"The Core tier includes the friendMirror — what the people in your life actually see when they look at you. It is the outside view you have been too polite to ask for."*

---

### Flow 6 — The Visionary

**Report Narrative Voice**
The report must match the Visionary's energy in the opening — acknowledge the genuine scale of their vision — before landing the shadow with precision. The self-deception section should be written with a kind of loving exasperation: *"You have been about to change everything for years."* The closing must be concrete and time-bound. Do not give the Visionary a vision — give them a constraint. The most useful thing this report can do is narrow their focus.

**AI Twin Tone**
The Twin should be the Visionary's most demanding editor. It should love the ideas and refuse to let them replace execution. When the Visionary pitches a new idea, the Twin should ask: "What happened with the last one?" It should celebrate completion above all else — finishing a small thing is worth more than starting a large one. It should be energetic enough to match the Visionary's pace but structured enough to slow them down.

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Project audit | List every unfinished project. Choose one. Archive or formally abandon the rest. |
| 3–4 | Completion sprint | Finish the chosen project. No new projects until it is done. |
| 5–8 | Boredom tolerance | When the urge to start something new arrives, wait 48 hours. Note what happens. |
| 9–12 | Finish-first protocol | For 30 days, no new commitments. Every day is spent on existing ones. |

**Friend Survey Framing**
*"You inspire everyone around you. But inspiration without follow-through has a cost. Ask three people who know you well: do they trust that you will finish what you start?"*

**Upgrade Trigger Strategy**
The Visionary will upgrade impulsively — the risk is they will not use it. The upgrade prompt should create a specific, time-bound commitment: *"The Deep tier includes a 90-day completion protocol. It is designed for people who are excellent at starting. The question is whether you will commit to finishing this one thing."*

---

### Flow 7 — The Anchor

**Report Narrative Voice**
The report must honour the Anchor's consistency before it can challenge their stasis. Open with a genuine acknowledgement of what their reliability has meant to others. The shadow section should be written with compassion but without softening: name the specific cost of their resistance to change — the opportunities not taken, the version of themselves they have not yet met. The closing should frame evolution not as abandonment of who they are, but as the fullest expression of it.

**AI Twin Tone**
The Twin should be patient and persistent — the Anchor will not change quickly, and the Twin should not try to force it. It should ask questions that gently destabilise the Anchor's certainty: "What would you do if this stopped working?" It should celebrate small changes as significant. It should be the voice that says: "You are more adaptable than you think."

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Change inventory | List three things that have not changed in five years. For each, ask: "Is this still a choice, or has it become a default?" |
| 3–4 | One small disruption per week | Change one routine — a different route, a different order, a different response. Note the discomfort. |
| 5–8 | Future self letter | Write a letter from the version of yourself who chose change. What did they gain? What did they grieve? |
| 9–12 | One significant choice | Make one decision that the old version of you would not have made. |

**Friend Survey Framing**
*"The people in your life count on you. But do they see you growing — or do they see you staying the same? Ask three people: what do they think you are capable of that you are not currently doing?"*

**Upgrade Trigger Strategy**
The Anchor will not upgrade impulsively — they need time and a rational case. The upgrade prompt should appear multiple times across sessions, not just once. Frame it as: *"The Core tier includes a 90-day growth track. It is designed to be gradual — one small change per week. It is built for people who move carefully."*

---

### Flow 8 — The Rebel

**Report Narrative Voice**
The report must earn the Rebel's respect before it can reach them. It should not be gentle — the Rebel will dismiss gentleness as weakness. The opening should be direct and slightly provocative: name the pattern before they can name it themselves. The shadow section should be written with the same bluntness the Rebel uses on others. The self-deception section should name the specific irony of their position: they have built a cage out of their refusal to be caged.

**AI Twin Tone**
The Twin should be the one entity the Rebel cannot dismiss. It should be direct, slightly irreverent, and completely unintimidated by the Rebel's edge. When the Rebel says "I don't care what anyone thinks," the Twin should say: "Then why do you talk about it so much?" It should challenge the Rebel's narrative without moralising. It should celebrate moments of genuine commitment — not because they are conforming, but because they are building something real.

**90-Day Growth Track**

| Week | Focus | Specific Habit |
|---|---|---|
| 1–2 | Reaction audit | Each day, note one thing you pushed against. Ask: "Was that a choice or a reflex?" |
| 3–4 | Commitment experiment | Choose one thing to commit to for 30 days — not because you have to, but because you choose to. |
| 5–8 | Structure as tool | Design one structure (a routine, a system, a constraint) that serves your goals. Use it. |
| 9–12 | Legacy question | What are you building? Write a one-paragraph answer. Revisit it weekly. |

**Friend Survey Framing**
*"You pride yourself on not needing anyone's approval. But the people who know you best have observations you have never asked for. Ask three people: what do they think you are running from?"*

**Upgrade Trigger Strategy**
The Rebel will not respond to conventional upgrade prompts — they will feel like manipulation. Frame the upgrade as a challenge, not a sales pitch: *"The Deep tier is not for everyone. It requires a 90-day commitment to one direction. Most people who start it do not finish. Are you the exception?"*

---

## Part 4 — Implementation Guidance

### 4.1 LLM Prompt Steering

The current `/api/generate-report` endpoint generates archetypes dynamically. To steer the LLM toward the canonical eight archetypes, add the following to the profile prompt:

```
ARCHETYPE GUIDANCE:
Map the person to the closest of these eight archetypes. Use the exact name as the "archetype" field.
The eight archetypes are:
1. The Architect — analytical, control-driven, planning as avoidance
2. The Performer — approval-seeking, shapeshifting, self-erasing warmth
3. The Protector — strength-as-armour, self-sufficient, cannot receive
4. The Seeker — depth-seeking, insight-collecting, commitment-avoidant
5. The Diplomat — conflict-avoidant, perspective-holding, self-invisible
6. The Visionary — idea-generating, inspiration-dependent, completion-allergic
7. The Anchor — consistency-driven, stability-seeking, change-resistant
8. The Rebel — authority-rejecting, identity-through-opposition, commitment-phobic

If the person is a blend, choose the dominant archetype. The tagline field should use the archetype's signature voice (provocative, direct, personal).
```

### 4.2 Frontend Archetype Routing

Once the archetype is returned in the API response, the frontend should:

1. **Store the archetype** in `localStorage` alongside the session data.
2. **Apply an archetype class** to the report container (`data-archetype="architect"`) to enable CSS theming per archetype.
3. **Route the growth track** — each archetype should render its specific 90-day track in the report's growth section.
4. **Personalise the upgrade prompt** — use the archetype-specific upgrade trigger copy rather than a generic CTA.
5. **Personalise the friend survey invitation** — use the archetype-specific framing when generating the survey link.

### 4.3 Archetype-Specific Visual Identity (Optional Enhancement)

Each archetype can have a subtle visual signature in the report — a colour accent, an icon, and a typographic weight — that makes the report feel uniquely theirs:

| Archetype | Accent Colour | Icon | Tone |
|---|---|---|---|
| The Architect | `#4A90D9` (steel blue) | 🏗 | Precise, structured |
| The Performer | `#E8A838` (warm gold) | 🎭 | Warm, expressive |
| The Protector | `#2E7D4F` (deep green) | 🛡 | Steady, grounded |
| The Seeker | `#7C3AED` (violet) | 🔭 | Deep, philosophical |
| The Diplomat | `#0891B2` (teal) | 🤝 | Balanced, careful |
| The Visionary | `#DC2626` (vivid red) | ⚡ | Energetic, expansive |
| The Anchor | `#78716C` (warm stone) | ⚓ | Reliable, unhurried |
| The Rebel | `#1C1C1C` (near-black) | ⚡ | Blunt, provocative |

### 4.4 Tier-Archetype Feature Matrix

Different tiers unlock different depths of the archetype-specific experience:

| Feature | Free | Core | Social | Deep |
|---|---|---|---|---|
| Archetype identification | ✓ | ✓ | ✓ | ✓ |
| Basic report (strength, shadow, avoiding) | ✓ | ✓ | ✓ | ✓ |
| Full report (all 7 sections) | — | ✓ | ✓ | ✓ |
| friendMirror section | — | ✓ | ✓ | ✓ |
| Friend survey (up to 3 friends) | — | — | ✓ | ✓ |
| AI Twin chat (unlimited) | — | ✓ | ✓ | ✓ |
| 90-day archetype growth track | — | — | — | ✓ |
| Weekly growth check-ins | — | — | — | ✓ |
| Decision tracker + predictions | — | ✓ | ✓ | ✓ |
| Re-run intake (new report) | — | — | — | ✓ |

---

## Part 5 — The "Three Sources, One Truth" Improvement Framework

The tagline *"Three sources. One truth."* refers to the three data inputs that produce the Mirror Report:

1. **Self-report** — the intake answers (how you see yourself)
2. **Behavioural inference** — the LLM's psychological analysis (patterns implied by your answers)
3. **External perception** — the friend survey (how others actually see you)

The improvement framework that MirrorMind **must offer** is the integration of all three sources into a single growth direction. This is what separates MirrorMind from a personality test: a personality test tells you who you are; MirrorMind tells you the gap between who you think you are, who you actually are, and who you are capable of becoming.

The improvement framework has three components:

**Component 1 — The Gap Map**
A visual representation (available in the Deep tier) showing the distance between:
- How you described yourself in the intake
- What the psychological analysis inferred
- What your friends reported

The gap between self-perception and external perception is the primary growth opportunity. The gap between self-perception and behavioural inference is the blind spot. The gap between all three and the "growth direction" is the 90-day target.

**Component 2 — The 90-Day Growth Track** (per archetype, detailed above)
A structured, week-by-week behavioural protocol that addresses the specific shadow pattern of each archetype. Not generic self-improvement advice — archetype-specific friction reduction.

**Component 3 — The Weekly Check-In**
A short (3-question) weekly prompt delivered via the AI Twin that asks:
1. What did you do differently this week?
2. What did you avoid?
3. What did you notice about yourself?

The Twin uses the answers to update its model of the person and adjust its responses accordingly. Over 90 days, the Twin becomes progressively more accurate — and the person becomes progressively more self-aware.

---

## Summary

The MirrorMind archetype system is not a labelling exercise — it is a personalisation engine. Every touchpoint in the product should feel different depending on which of the eight archetypes a person is. The report should feel written for them. The Twin should speak their language. The growth track should address their specific shadow. The upgrade prompt should speak to their specific motivation.

The eight archetypes — Architect, Performer, Protector, Seeker, Diplomat, Visionary, Anchor, Rebel — cover the primary patterns of self-deception and growth that MirrorMind is designed to address. They are not rigid boxes but dominant orientations, and the LLM should be steered toward them while retaining the nuance of each individual's specific profile.

The product's competitive advantage is not the report — it is the 90-day arc from insight to change. The archetype system is what makes that arc feel personal rather than generic.

---

*Document prepared by Manus AI for MirrorMind — March 2026*
