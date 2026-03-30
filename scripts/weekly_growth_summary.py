#!/usr/bin/env python3.11
"""
MirrorMind — Weekly Archetype Growth Plan Summary Generator
============================================================
Runs every Monday. For each of the eight archetypes, determines which
week of the 365-day plan is current, extracts the relevant habits and
focus theme, and writes a structured weekly summary to:
  /home/ubuntu/mirrormind/docs/weekly-summaries/YYYY-WW.md

The week number is calculated from the user's plan start date.
If no start date is stored, the script uses the current ISO week
number as the plan week (i.e. the user started at the beginning of
the calendar year).

Usage:
  python3.11 weekly_growth_summary.py [--week N] [--output-dir PATH]

Options:
  --week N        Override the auto-detected plan week (1–52)
  --output-dir    Override the default output directory
"""

import argparse
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path
from textwrap import dedent

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DOCS_DIR = Path("/home/ubuntu/mirrormind/docs")
OUTPUT_DIR = DOCS_DIR / "weekly-summaries"
STATE_FILE = DOCS_DIR / "plan-state.json"

# ---------------------------------------------------------------------------
# Archetype data — full 52-week plan encoded as structured data
# Each archetype has 4 quarters × 3 months × ~4 weeks
# ---------------------------------------------------------------------------

ARCHETYPES = {
    "The Architect": {
        "tagline": "You build systems to avoid feeling. This year, you learn to act before certainty arrives.",
        "growth_direction": "From deliberate paralysis → toward decisive trust",
        "quarters": {
            1: {
                "theme": "Awareness — Seeing the Blueprint",
                "months": {
                    1: {
                        "focus": "Mapping the Delay",
                        "weeks": {
                            1: ("Map your delayed decisions", "Each evening, list one decision you did not make today. Write the reason you gave yourself."),
                            2: ("Expose the false premise", "For each delayed decision, write: 'If I had all the information I think I need, would I actually decide?'"),
                            3: ("Confront the backlog", "Identify the oldest unresolved decision in your life. Write it down. Do not resolve it yet — just name it."),
                            4: ("External calibration", "Ask one person you trust: 'What do you think I'm avoiding?' Listen without defending."),
                        },
                        "milestone": "You can name your three most-avoided decisions and the specific fear underneath each one.",
                    },
                    2: {
                        "focus": "Understanding the Cost",
                        "weeks": {
                            5: ("Make the cost concrete", "Write a one-page account of one opportunity you lost because you waited too long. Be specific."),
                            6: ("Quantify the pattern", "Track every time you say 'I need to think about it' or 'I need more information.' Count the instances."),
                            7: ("Connect behaviour to emotion", "For each instance tracked, ask: 'What was I actually afraid of?'"),
                            8: ("Introduce the growth identity", "Write the answer to: 'What would the version of me who trusts themselves do right now?'"),
                        },
                        "milestone": "You have a clear, written account of what analysis paralysis has cost you in one specific domain.",
                    },
                    3: {
                        "focus": "Baseline Establishment",
                        "weeks": {
                            9: ("Build decision muscle", "Make one low-stakes decision per day in under 60 seconds. Log the outcome."),
                            10: ("Create a decision rule", "Identify your 'information threshold' — the point at which you have enough to decide. Write it for three current decisions."),
                            11: ("Practice unhedged expression", "Share one opinion in a group setting without qualifying it. Note the response."),
                            12: ("Consolidate awareness", "Write your Q1 reflection: What pattern did you see? What surprised you? What are you still avoiding?"),
                            13: ("Q1 Integration Checkpoint", "Review the three oldest avoided decisions with your AI Twin. Choose one to resolve in Q2."),
                        },
                        "milestone": "You have a working decision rule and have made at least 30 low-stakes decisions without over-researching.",
                    },
                },
            },
            2: {
                "theme": "Disruption — Breaking the Blueprint",
                "months": {
                    4: {
                        "focus": "The 60-Second Decision",
                        "weeks": {
                            14: ("Interrupt the research reflex", "Make one medium-stakes decision per week in under 60 seconds. No research permitted."),
                            15: ("Break the oldest pattern", "Resolve the avoided decision chosen in the Q1 checkpoint. Act on it this week."),
                            16: ("Create a time constraint", "When you feel the urge to research further, set a 10-minute timer. Decide when it ends."),
                            17: ("Observe the approval pattern", "Tell one person about a decision you made quickly. Notice if you feel the need to justify it."),
                        },
                        "milestone": "You have resolved one decision that had been pending for more than three months.",
                    },
                    5: {
                        "focus": "Emotional Vocabulary",
                        "weeks": {
                            18: ("Build emotional literacy", "Each evening, name one emotion you experienced today. Not a thought — a feeling."),
                            19: ("Separate feeling from rationalisation", "When you feel uncomfortable, write: 'The feeling is ___. The thought I'm using to avoid it is ___.'"),
                            20: ("Practise emotional expression", "Have one conversation this week where you lead with a feeling rather than an analysis."),
                            21: ("External emotional calibration", "Ask someone close to you: 'Do you feel like you know what I'm feeling, or just what I'm thinking?'"),
                        },
                        "milestone": "You can consistently name the emotion underneath a decision delay without immediately converting it to analysis.",
                    },
                    6: {
                        "focus": "Imperfect Action",
                        "weeks": {
                            22: ("Practise sufficiency", "Do one thing this week that you know is 'good enough' rather than optimal. Submit it."),
                            23: ("Disrupt the perfectionism reflex", "Start a project with an intentionally imperfect plan. Document the discomfort."),
                            24: ("Create a revision limit", "When you catch yourself revising something for the third time, stop and submit it."),
                            25: ("Reframe the risk calculus", "Write: 'The cost of imperfection in this situation is ___. The cost of delay is ___.' Compare them."),
                            26: ("Q2 Integration Checkpoint", "What decisions did you make quickly? What happened? What are you still over-preparing for?"),
                        },
                        "milestone": "You have submitted at least three 'good enough' pieces of work without revising them to perfection.",
                    },
                },
            },
            3: {
                "theme": "Integration — Building a New Architecture",
                "months": {
                    7: {
                        "focus": "Decision Systems",
                        "weeks": {
                            27: ("Replace research with rules", "Create a personal decision framework: three criteria that are 'enough' for a yes or no."),
                            28: ("Test and refine", "Apply the framework to every decision this week. Note where it fails and why."),
                            29: ("Accountability and calibration", "Share the framework with someone who knows you well. Ask if it sounds like you or like who you want to be."),
                            30: ("Extend the system", "Identify one area of life where you still have no framework. Build one."),
                        },
                        "milestone": "You have a working personal decision framework applied to at least ten decisions.",
                    },
                    8: {
                        "focus": "Relational Integration",
                        "weeks": {
                            31: ("Make it relational", "Tell one person about your growth work this year. Not the insights — the actions."),
                            32: ("External validation of change", "Ask a close friend or partner: 'Have you noticed a difference in how I make decisions?'"),
                            33: ("Practise tolerating ambiguity in relationship", "Have one conversation where you express uncertainty without immediately resolving it."),
                            34: ("Connect pattern to relational cost", "Write: 'The relationships that my old pattern was protecting me from are ___.'"),
                        },
                        "milestone": "At least one person in your life has noticed and named a change in how you operate.",
                    },
                    9: {
                        "focus": "Identity Consolidation",
                        "weeks": {
                            35: ("Anchor the new identity", "Write a new self-description: 'I am someone who ___' — defined by action, not analysis."),
                            36: ("Find the final frontier", "Identify the last remaining domain where the old pattern is still dominant. Name it."),
                            37: ("Apply the new identity to the hardest case", "Make one significant decision in that domain using your framework."),
                            38: ("Consolidate integration", "Write your Q3 reflection: Who are you becoming? What is the old version of you still doing?"),
                            39: ("Q3 Integration Checkpoint", "Review the year so far. What has changed in your decisions, relationships, and self-perception?"),
                        },
                        "milestone": "You have made a significant decision in the domain where the old pattern was most entrenched.",
                    },
                },
            },
            4: {
                "theme": "Expansion — Living the New Architecture",
                "months": {
                    10: {
                        "focus": "The Hardest Commitment",
                        "weeks": {
                            40: ("Surface the final avoidance", "Identify the commitment you have been avoiding for the longest time. Name it."),
                            41: ("Act before certainty", "Make the commitment. Tell someone."),
                            42: ("Apply the year's work to the hardest case", "When the urge to over-prepare arrives, use your decision framework instead."),
                            43: ("Document the shift", "Write: 'I used to need ___ before I could commit. Now I need ___.'"),
                        },
                        "milestone": "You have made one significant commitment that the January version of you would not have made.",
                    },
                    11: {
                        "focus": "Spontaneity as Practice",
                        "weeks": {
                            44: ("Build spontaneity as a skill", "Once per week, do something completely unplanned. No research, no preparation."),
                            45: ("Practise trust", "Say yes to one invitation this week without asking any clarifying questions first."),
                            46: ("Lead with desire, not analysis", "Have one conversation where you share what you want before you share what you think."),
                            47: ("Inventory the growth", "Write: 'The things I used to plan that I now just do are ___.'"),
                        },
                        "milestone": "Spontaneous action has become a regular, unremarkable part of your week.",
                    },
                    12: {
                        "focus": "Year-End Integration",
                        "weeks": {
                            48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                            49: ("External year-end audit", "Ask three people who know you well: 'What is the biggest change you have seen in me this year?'"),
                            50: ("Consolidate the year", "Write your year-end reflection: What did you build? What did you stop avoiding? What remains?"),
                            51: ("Create continuity", "Design your Year 2 focus: one area where the growth needs to continue."),
                            52: ("Year-End Integration Checkpoint", "Full review with AI Twin. What is the new baseline? What is the next frontier?"),
                        },
                        "milestone": "You have a complete year-end reflection and a Year 2 growth direction.",
                    },
                },
            },
        },
    },
    "The Performer": {
        "tagline": "You perform so well that no one — including you — knows what you actually want. This year, you find out.",
        "growth_direction": "From self-erasure for approval → toward self-definition independent of others",
        "quarters": {
            1: {"theme": "Awareness — Seeing the Performance", "months": {
                1: {"focus": "Mapping the Performance", "weeks": {
                    1: ("Surface suppressed desire", "Each evening, answer: 'What did I want today that I didn't say or do?' Write it down. Do not share it."),
                    2: ("Quantify the shapeshifting", "Track every time you adjust your opinion, tone, or behaviour based on who is in the room. Count the instances."),
                    3: ("Name the audience", "Identify the three people whose approval matters most to you. Write why."),
                    4: ("Separate desire from performance", "Ask yourself: 'What would I do this week if none of those three people would ever find out?'"),
                }, "milestone": "You can name five things you want that you have never said out loud."},
                2: {"focus": "Understanding the Cost", "weeks": {
                    5: ("Make the cost concrete", "Write a one-page account of a time you gave someone what they wanted instead of what you wanted. What did it cost you?"),
                    6: ("Name the gap", "Identify one relationship where you feel most 'performed.' Write what the real version of you would say in that relationship."),
                    7: ("Translate the performance", "Notice every time you say 'I'm fine' or 'Whatever you want.' Write what you actually meant."),
                    8: ("Introduce the authentic self", "Write: 'The version of me that no one needs anything from wants ___.'"),
                }, "milestone": "You have a clear, written account of what self-erasure has cost you in one specific relationship."},
                3: {"focus": "Baseline Establishment", "weeks": {
                    9: ("Build preference expression", "Once per day, state a preference — any preference — without qualifying it."),
                    10: ("Practise the boundary", "Decline one request this week without over-explaining. Note the discomfort."),
                    11: ("Practise self-directed desire", "Do one thing this week solely because you want to — not because it helps anyone."),
                    12: ("Consolidate awareness", "Write your Q1 reflection: What performance did you see? What surprised you?"),
                    13: ("Q1 Integration Checkpoint", "Identify the relationship where the performance is costing you the most. This is the focus of Q2."),
                }, "milestone": "You have stated unqualified preferences daily for four weeks and declined at least one request without over-explaining."},
            }},
            2: {"theme": "Disruption — Breaking the Performance", "months": {
                4: {"focus": "The Honest No", "weeks": {
                    14: ("Interrupt the over-accommodation reflex", "Say no to one thing per week without offering an alternative or an apology."),
                    15: ("Break the performance in the hardest relationship", "In the relationship identified in Q1, say one true thing you have been withholding."),
                    16: ("Interrupt the caretaking reflex", "When you feel the urge to manage someone's feelings, pause. Ask: 'Is this mine to manage?'"),
                    17: ("Practise direct desire expression", "Tell one person what you actually want from them — not what you think they can give."),
                }, "milestone": "You have said no at least four times without over-explaining, and the relationships survived."},
                5: {"focus": "Desire Inventory", "weeks": {
                    18: ("Build desire vocabulary", "Each day, complete the sentence: 'Today I wanted ___.' Do not edit for reasonableness."),
                    19: ("Surface the suppressed want", "Identify one desire you have had for more than a year that you have not acted on. Write why."),
                    20: ("Act on authentic desire", "Take one step toward that desire this week — however small."),
                    21: ("External calibration", "Ask someone close to you: 'Do you know what I actually want? Not what I say I want — what I want.'"),
                }, "milestone": "You have taken one concrete action toward something you want that has nothing to do with what anyone else needs."},
                6: {"focus": "Identity Without Audience", "weeks": {
                    22: ("Build private identity", "Spend one hour per week doing something with no audience — no sharing, no documenting, no reporting."),
                    23: ("Define the self", "Write a one-page answer to: 'Who am I when no one needs anything from me?'"),
                    24: ("Test the authenticity", "Share that answer with one person. Notice if you edit it for their reaction."),
                    25: ("Differentiate the self", "Identify one value you hold that is not shared by the people whose approval you seek. Claim it."),
                    26: ("Q2 Integration Checkpoint", "What did you stop performing? What are you still performing?"),
                }, "milestone": "You have a written, unqualified self-description that you can share without editing."},
            }},
            3: {"theme": "Integration — Building an Authentic Self", "months": {
                7: {"focus": "Preference as Identity", "weeks": {
                    27: ("Build the authentic self-document", "Create a 'preference inventory' — 20 things you like, want, or believe, stated without qualification."),
                    28: ("Test the self against friction", "Share three items from the inventory with someone who might disagree."),
                    29: ("Change the sequence", "When someone asks what you want, answer before asking what they want."),
                    30: ("Remove a false preference", "Identify one area of life where you have been performing a preference you do not actually have. Stop."),
                }, "milestone": "You have a written, unqualified preference inventory that you can share without editing."},
                8: {"focus": "Relational Honesty", "weeks": {
                    31: ("Practise honesty over harmony", "Have one conversation this month where you say something true that risks disapproval."),
                    32: ("External relational audit", "Ask a close friend: 'Do you feel like you know the real me, or a very pleasant version of me?'"),
                    33: ("Remove the caretaking", "In one relationship, stop managing the other person's emotional state for a week. Observe what happens."),
                    34: ("Audit the relational landscape", "Write: 'The relationships that can hold the real me are ___. The ones that can't are ___.'"),
                }, "milestone": "At least one person in your life has said they feel they know you better than they did six months ago."},
                9: {"focus": "Identity Consolidation", "weeks": {
                    35: ("Anchor the new identity", "Rewrite your self-description: 'I am someone who ___' — defined by what you want, not what you give."),
                    36: ("Find the final frontier", "Identify the last remaining performance — the role you are still playing. Name it."),
                    37: ("Practise ordinariness", "In one interaction this week, drop the performance entirely. Be unremarkable."),
                    38: ("Consolidate integration", "Write your Q3 reflection: Who are you when you stop performing?"),
                    39: ("Q3 Integration Checkpoint", "Review the year. What has changed in your relationships, your desires, your sense of self?"),
                }, "milestone": "You have dropped the performance in the relationship where it was most entrenched."},
            }},
            4: {"theme": "Expansion — Living Without the Performance", "months": {
                10: {"focus": "The Hardest Relationship", "weeks": {
                    40: ("Surface the final performance", "Identify the relationship where the performance is most entrenched. Name what you have never said in it."),
                    41: ("Break the deepest performance", "Say one true thing in that relationship. Not a complaint — a desire, a need, a truth."),
                    42: ("Practise non-management", "When the urge to manage their reaction arrives, let them have their reaction."),
                    43: ("Document the shift", "Write: 'I used to perform ___ for this person. Now I ___.'"),
                }, "milestone": "You have been honest in the relationship that previously required the most performance."},
                11: {"focus": "Desire as Direction", "weeks": {
                    44: ("Surface the structural performance", "Identify one major life decision that has been shaped by what others want rather than what you want."),
                    45: ("Clarify authentic direction", "Write what you would choose if no one's opinion mattered."),
                    46: ("Act on authentic desire at scale", "Take one step toward that direction."),
                    47: ("Name the divergence", "Write: 'The life I am building is ___. The life I was performing was ___.'"),
                }, "milestone": "You have made or begun one significant life decision based on what you want rather than what others expect."},
                12: {"focus": "Year-End Integration", "weeks": {
                    48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                    49: ("External year-end audit", "Ask three people: 'What is the biggest change you have seen in me this year?'"),
                    50: ("Consolidate the year", "Write your year-end reflection: What did you stop performing? What did you find underneath?"),
                    51: ("Create continuity", "Design your Year 2 focus: one area where the authentic self still needs to grow."),
                    52: ("Year-End Integration Checkpoint", "Full review with AI Twin. What is the new baseline?"),
                }, "milestone": "You have a complete year-end reflection and a Year 2 growth direction."},
            }},
        },
    },
    "The Protector": {
        "tagline": "You keep everyone safe. This year, you learn to be kept.",
        "growth_direction": "From strength-as-armour → toward the capacity to receive",
        "quarters": {
            1: {"theme": "Awareness — Seeing the Armour", "months": {
                1: {"focus": "Mapping the Self-Sufficiency", "weeks": {
                    1: ("Surface suppressed needs", "Each day, complete the sentence: 'Today I needed ___' without adding 'but I handled it.'"),
                    2: ("Quantify the deflection", "Track every time you deflect care, help, or concern from others. Count the instances."),
                    3: ("Calibrate your relationship with receiving", "Identify the last time someone genuinely helped you. How did it feel? Write it down."),
                    4: ("External calibration", "Ask someone close to you: 'Do you feel like you can take care of me, or do I make that impossible?'"),
                }, "milestone": "You can name five things you needed in the past month that you did not ask for."},
                2: {"focus": "Understanding the Cost", "weeks": {
                    5: ("Make the cost concrete", "Write a one-page account of a time your self-sufficiency prevented real intimacy."),
                    6: ("Name the core fear", "Identify the belief underneath the armour: 'If I need things, then ___.' Write it."),
                    7: ("Translate the armour", "Notice every time you say 'I'm fine' when you are not. Write what you actually meant."),
                    8: ("Introduce the vulnerable self", "Write: 'The version of me that could be taken care of would feel ___.'"),
                }, "milestone": "You have a clear, written account of what self-sufficiency has cost you in one specific relationship."},
                3: {"focus": "Baseline Establishment", "weeks": {
                    9: ("Build the receiving muscle", "Accept one offer of help this week without deflecting or minimising it."),
                    10: ("Practise direct asking", "Ask one person for something — help, time, support — without framing it as a favour to them."),
                    11: ("Practise honest response", "When someone expresses concern for you, respond with something true rather than 'I'm fine.'"),
                    12: ("Consolidate awareness", "Write your Q1 reflection: What armour did you see? What surprised you?"),
                    13: ("Q1 Integration Checkpoint", "Identify the relationship where you are most defended. This is the Q2 focus."),
                }, "milestone": "You have accepted help at least four times without deflecting or minimising."},
            }},
            2: {"theme": "Disruption — Lowering the Armour", "months": {
                4: {"focus": "The Ask", "weeks": {
                    14: ("Interrupt the self-sufficiency reflex", "Ask for help once per week in a domain where you would normally handle it alone."),
                    15: ("Lower the armour in the hardest relationship", "In the relationship identified in Q1, share one thing you are struggling with."),
                    16: ("Practise clean receiving", "When someone offers help, accept it and say thank you — nothing else."),
                    17: ("Reverse the direction of care", "Tell one person what you need from them — not what you can do for them."),
                }, "milestone": "You have asked for help at least four times and allowed it to be given without managing the process."},
                5: {"focus": "Vulnerability Practice", "weeks": {
                    18: ("Build vulnerability vocabulary", "Each day, share one thing that is hard — not a problem you are solving, but a feeling you are having."),
                    19: ("Name the most defended feeling", "Identify the emotion you find hardest to show. Write why."),
                    20: ("Practise the hardest vulnerability", "Show that emotion to one person this week — even briefly."),
                    21: ("External vulnerability audit", "Ask someone: 'Do you feel like I let you care about me?'"),
                }, "milestone": "You have shown the emotion you find hardest to show, and the relationship survived."},
                6: {"focus": "Interdependence", "weeks": {
                    22: ("Practise interdependence", "Identify one area of life where you insist on doing everything yourself. Delegate one task."),
                    23: ("Practise restraint", "Let someone else solve a problem for you without offering your solution."),
                    24: ("Inventory the unnecessary burden", "Write: 'The things I am carrying that I do not have to carry are ___.'"),
                    25: ("Act on the inventory", "Put one of those things down. Tell someone you are doing it."),
                    26: ("Q2 Integration Checkpoint", "What did you allow yourself to receive? What are you still protecting?"),
                }, "milestone": "You have put down at least one thing you were carrying unnecessarily and told someone about it."},
            }},
            3: {"theme": "Integration — Building Reciprocal Relationships", "months": {
                7: {"focus": "Needs as Normal", "weeks": {
                    27: ("Build a needs vocabulary", "Create a 'needs inventory' — ten things you regularly need that you rarely ask for."),
                    28: ("Normalise asking", "Ask for three items from the inventory this week."),
                    29: ("Change the default question", "When you feel the urge to handle something alone, pause and ask: 'Who could help me with this?'"),
                    30: ("Practise directness in need expression", "Tell someone: 'I need ___ from you.' Not 'it would be helpful if' — a direct need statement."),
                }, "milestone": "Asking for help has become a regular, unremarkable part of your week."},
                8: {"focus": "Relational Reciprocity", "weeks": {
                    31: ("Rebalance the relational dynamic", "Identify one relationship that is entirely one-directional (you give, they receive). Introduce reciprocity."),
                    32: ("External relational audit", "Ask a close friend: 'Do you feel like our relationship is mutual, or do you feel like you owe me?'"),
                    33: ("Practise role reversal", "In one relationship, let the other person be the strong one for a week."),
                    34: ("Audit the relational landscape", "Write: 'The relationships where I am truly known — not just relied upon — are ___.'"),
                }, "milestone": "At least one relationship has become meaningfully more reciprocal than it was six months ago."},
                9: {"focus": "Identity Consolidation", "weeks": {
                    35: ("Anchor the new identity", "Rewrite your self-description: 'I am someone who ___' — defined by what you receive, not just what you give."),
                    36: ("Find the final frontier", "Identify the last remaining armour — the domain where you are still entirely self-sufficient."),
                    37: ("Apply the new identity to the hardest case", "Ask for help in that domain this week."),
                    38: ("Consolidate integration", "Write your Q3 reflection: Who are you when you are not the strong one?"),
                    39: ("Q3 Integration Checkpoint", "Review the year. What has changed in your relationships, your needs, your sense of self?"),
                }, "milestone": "You have asked for help in the domain where you were most self-sufficient."},
            }},
            4: {"theme": "Expansion — Living in Reciprocity", "months": {
                10: {"focus": "The Deepest Vulnerability", "weeks": {
                    40: ("Surface the final armour", "Identify the thing you have never let anyone help you with. Name it."),
                    41: ("Break the deepest defence", "Ask for help with it."),
                    42: ("Practise sustained vulnerability", "When the urge to take it back and handle it yourself arrives, stay with the discomfort."),
                    43: ("Document the shift", "Write: 'I used to carry ___ alone. Now I ___.'"),
                }, "milestone": "You have asked for help with the thing you have always carried alone."},
                11: {"focus": "Strength Redefined", "weeks": {
                    44: ("Reframe the core value", "Write a new definition of strength — one that includes receiving, asking, and being known."),
                    45: ("Test the new identity", "Share that definition with someone who has always seen you as 'the strong one.'"),
                    46: ("Consolidate the reframe", "Identify one way your old definition of strength was limiting you. Write it."),
                    47: ("Anchor the new definition", "Write: 'The strongest thing I did this year was ___.' (It should involve receiving, not giving.)"),
                }, "milestone": "You have a new, written definition of strength that includes vulnerability."},
                12: {"focus": "Year-End Integration", "weeks": {
                    48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                    49: ("External year-end audit", "Ask three people: 'What is the biggest change you have seen in me this year?'"),
                    50: ("Consolidate the year", "Write your year-end reflection: What did you allow yourself to receive? What did it feel like?"),
                    51: ("Create continuity", "Design your Year 2 focus."),
                    52: ("Year-End Integration Checkpoint", "Full review with AI Twin."),
                }, "milestone": "You have a complete year-end reflection and a Year 2 growth direction."},
            }},
        },
    },
    "The Seeker": {
        "tagline": "You are always searching. This year, you stop searching and start building.",
        "growth_direction": "From insight-collection and commitment-avoidance → toward sustained, embodied action",
        "quarters": {
            1: {"theme": "Awareness — Seeing the Search", "months": {
                1: {"focus": "Mapping the Pattern", "weeks": {
                    1: ("Inventory the search", "List every framework, personality system, or self-help resource you have engaged with in the past two years."),
                    2: ("Expose the insight-action gap", "For each item on the list, write: 'What did I do differently as a result?'"),
                    3: ("Name the stuck insight", "Identify the insight you have had most often — the one that never seems to produce change. Write it."),
                    4: ("External calibration", "Ask someone who knows you well: 'Do you think I act on what I know about myself?'"),
                }, "milestone": "You can articulate the specific insight you have had repeatedly without acting on it."},
                2: {"focus": "Understanding the Cost", "weeks": {
                    5: ("Make the avoidance concrete", "Write a one-page account of a commitment you have been 'almost ready' to make for more than a year."),
                    6: ("Name the false prerequisite", "Identify the belief underneath the search: 'Once I understand myself well enough, then ___.' Write it."),
                    7: ("Quantify the avoidance", "Notice every time you seek a new framework or explanation instead of taking an action. Count the instances."),
                    8: ("Introduce the action identity", "Write: 'The version of me that acts without full understanding would ___.'"),
                }, "milestone": "You have a clear, written account of what insight-without-action has cost you in one specific domain."},
                3: {"focus": "Baseline Establishment", "weeks": {
                    9: ("Build the insight-action habit", "For every insight you record this week, write one specific action it implies. Do the action within 24 hours."),
                    10: ("Practise commitment", "Choose one area of life and make one decision in it. Do not revisit the decision for 30 days."),
                    11: ("Practise sufficiency", "Go one week without consuming any new self-development content. Apply what you already know."),
                    12: ("Consolidate awareness", "Write your Q1 reflection: What search did you see? What surprised you?"),
                    13: ("Q1 Integration Checkpoint", "Identify the commitment you have been avoiding longest. This is the Q2 focus."),
                }, "milestone": "You have maintained one commitment for 30 consecutive days without seeking a new framework."},
            }},
            2: {"theme": "Disruption — From Insight to Action", "months": {
                4: {"focus": "The Framework Fast", "weeks": {
                    14: ("Interrupt the search reflex", "No new personality tests, frameworks, or self-help books for this entire month."),
                    15: ("Break the longest avoidance", "Make the commitment identified in Q1. Tell someone."),
                    16: ("Redirect from search to action", "When the urge to research or explore arrives, ask: 'What action does my existing knowledge imply?'"),
                    17: ("Build action accountability", "At the end of each day, write: 'Today I acted on what I know by ___.'"),
                }, "milestone": "You have made and kept one commitment for 30 consecutive days without seeking a new framework."},
                5: {"focus": "Embodiment", "weeks": {
                    18: ("Build embodied presence", "Each day, do one thing with your body — not your mind. Physical, sensory, present."),
                    19: ("Embody the insight", "Identify one insight that has lived only in your head. Find one physical way to express it."),
                    20: ("Practise non-intellectual engagement", "Spend one hour per week in an activity that requires presence and cannot be intellectualised."),
                    21: ("External embodiment audit", "Ask someone: 'Do I seem present to you, or do I seem like I'm always somewhere else?'"),
                }, "milestone": "You have a regular embodied practice that is not about self-improvement."},
                6: {"focus": "Identity Through Action", "weeks": {
                    22: ("Build action-based identity", "Write weekly: 'This week I was the person who ___' — defined by behaviour, not belief."),
                    23: ("Name the identity gap", "Identify one area where your actions and your self-concept are misaligned. Choose one."),
                    24: ("Act on the identity", "Take one action this week that closes that gap."),
                    25: ("Anchor the action identity", "Write: 'The person I am becoming is defined by ___.' (Actions only — no traits or insights.)"),
                    26: ("Q2 Integration Checkpoint", "What did you act on? What are you still only thinking about?"),
                }, "milestone": "You have a written, action-based identity statement that you have lived for four weeks."},
            }},
            3: {"theme": "Integration — Building Commitment as Character", "months": {
                7: {"focus": "Commitment Architecture", "weeks": {
                    27: ("Make commitments explicit", "Identify your three most important commitments. Write them down. Tell someone."),
                    28: ("Build commitment accountability", "Create a simple weekly review: 'Did I honour my commitments this week? Yes/No. Why?'"),
                    29: ("Create a parking lot for the search", "When a new idea or direction arrives, write it down and return to it in 30 days."),
                    30: ("Address the pattern directly", "Identify one commitment you have broken repeatedly. Recommit with a specific plan."),
                }, "milestone": "You have maintained your three core commitments for a full month without abandoning them for something new."},
                8: {"focus": "Relational Commitment", "weeks": {
                    31: ("Surface the relational avoidance", "Identify one relationship where you have been 'almost present' — engaged but not committed."),
                    32: ("Bring commitment into relationship", "Make one explicit commitment in that relationship."),
                    33: ("External relational audit", "Ask a close friend: 'Do you feel like I show up consistently, or do you feel like you never quite have me?'"),
                    34: ("Audit the relational landscape", "Write: 'The relationships I am fully committed to are ___. The ones I am still exploring are ___.'"),
                }, "milestone": "At least one person in your life has said they feel more certain of your presence than they did six months ago."},
                9: {"focus": "Identity Consolidation", "weeks": {
                    35: ("Anchor the new identity", "Rewrite your self-description: 'I am someone who ___' — defined by what you do, not what you seek."),
                    36: ("Find the final frontier", "Identify the last remaining search — the area where you are still collecting rather than building."),
                    37: ("Apply the new identity", "Stop collecting in that area. Make one decision and act on it."),
                    38: ("Consolidate integration", "Write your Q3 reflection: Who are you when you stop searching?"),
                    39: ("Q3 Integration Checkpoint", "Review the year. What have you built?"),
                }, "milestone": "You have stopped collecting in the area where the search was most entrenched."},
            }},
            4: {"theme": "Expansion — Living as a Builder", "months": {
                10: {"focus": "The Deepest Commitment", "weeks": {
                    40: ("Surface the final avoidance", "Identify the most significant commitment you have been avoiding — the one that would define your direction."),
                    41: ("Act on the year's work", "Make it."),
                    42: ("Practise sustained direction", "When the search reflex arrives, return to the commitment."),
                    43: ("Document the shift", "Write: 'I used to search for ___. Now I am building ___.'"),
                }, "milestone": "You have made the most significant commitment you have been avoiding."},
                11: {"focus": "Depth Over Breadth", "weeks": {
                    44: ("Practise depth", "Identify one area where you have been broad but not deep. Choose depth."),
                    45: ("Build depth as a practice", "Spend this month going deeper in that one area rather than wider."),
                    46: ("Inventory the depth", "Write: 'The things I know deeply — not just broadly — are ___.'"),
                    47: ("Anchor the builder identity", "Write: 'The version of me that builds rather than searches is ___.'"),
                }, "milestone": "You have spent a full month going deeper in one area rather than wider."},
                12: {"focus": "Year-End Integration", "weeks": {
                    48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                    49: ("External year-end audit", "Ask three people: 'What is the biggest change you have seen in me this year?'"),
                    50: ("Consolidate the year", "Write your year-end reflection: What did you build? What did you stop searching for?"),
                    51: ("Create continuity", "Design your Year 2 focus."),
                    52: ("Year-End Integration Checkpoint", "Full review with AI Twin."),
                }, "milestone": "You have a complete year-end reflection and a Year 2 growth direction."},
            }},
        },
    },
    "The Diplomat": {
        "tagline": "You have made everyone comfortable. This year, you make yourself real.",
        "growth_direction": "From conflict-avoidance and self-invisibility → toward directness as an act of love",
        "quarters": {
            1: {"theme": "Awareness — Seeing the Disappearing Act", "months": {
                1: {"focus": "Mapping the Avoidance", "weeks": {
                    1: ("Surface suppressed opinion", "Each day, note one thing you thought but did not say. Write what you thought."),
                    2: ("Quantify the self-erasure", "Track every time you soften, qualify, or withhold a statement. Count the instances."),
                    3: ("Name the avoided truths", "Identify the three conversations you have been avoiding. Write what you would say if you were not afraid."),
                    4: ("External calibration", "Ask someone close to you: 'Do you feel like you know what I really think, or do you get the diplomatic version?'"),
                }, "milestone": "You can name five things you think but have never said to the people they concern."},
                2: {"focus": "Understanding the Cost", "weeks": {
                    5: ("Make the cost concrete", "Write a one-page account of a time your conflict avoidance made a situation worse, not better."),
                    6: ("Name the core fear", "Identify the belief underneath the avoidance: 'If I say what I really think, then ___.' Write it."),
                    7: ("Translate the diplomacy", "Notice every time you say 'I can see both sides' when you actually have a clear view. Write what you actually think."),
                    8: ("Introduce the direct self", "Write: 'The version of me that says the true thing would ___.'"),
                }, "milestone": "You have a clear, written account of what conflict avoidance has cost you in one specific relationship."},
                3: {"focus": "Baseline Establishment", "weeks": {
                    9: ("Build opinion expression", "Once per day, form and state a clear opinion on something — anything. Do not qualify it."),
                    10: ("Practise directness", "Say one direct thing this week that you would normally soften. Note the outcome."),
                    11: ("Practise the avoided conversation", "Have one conversation you have been avoiding. Keep it short. Say the one true thing."),
                    12: ("Consolidate awareness", "Write your Q1 reflection: What disappearing act did you see? What surprised you?"),
                    13: ("Q1 Integration Checkpoint", "Identify the relationship where your avoidance is most costly. This is the Q2 focus."),
                }, "milestone": "You have stated unqualified opinions daily for four weeks and had at least one avoided conversation."},
            }},
            2: {"theme": "Disruption — Speaking Directly", "months": {
                4: {"focus": "The Direct Statement", "weeks": {
                    14: ("Build directness as a habit", "Say one direct thing per day — an opinion, a need, a disagreement — without softening it."),
                    15: ("Break the deepest avoidance", "Have the conversation identified in Q1. Say the true thing."),
                    16: ("Interrupt the diplomatic reflex", "When you feel the urge to see 'both sides,' ask: 'What do I actually think?' State it."),
                    17: ("Practise public directness", "Disagree with someone in a group setting. Notice what happens."),
                }, "milestone": "You have said something direct in at least four situations where you would previously have been diplomatic."},
                5: {"focus": "Conflict as Care", "weeks": {
                    18: ("Change the meaning of directness", "Reframe one avoided conversation as an act of care: 'I am saying this because I care about this relationship.'"),
                    19: ("Apply the reframe", "Have one conversation this week that you have been avoiding for more than a month."),
                    20: ("Build conflict tolerance", "When conflict arises, stay in it for one more exchange before withdrawing."),
                    21: ("External conflict audit", "Ask someone: 'Do you feel like I tell you hard things, or do you feel like I protect you from them?'"),
                }, "milestone": "You have initiated at least two difficult conversations and the relationships are intact."},
                6: {"focus": "Needs Expression", "weeks": {
                    22: ("Practise direct need expression", "Once per week, express a need directly — not as a question, not as a preference, but as a need."),
                    23: ("Break the hint pattern", "Identify one need you have had for months that you have been hinting at rather than stating. State it."),
                    24: ("Practise direct feedback", "When someone does not meet your need, tell them — once, directly, without drama."),
                    25: ("Inventory the unexpressed needs", "Write: 'The things I need that I have never directly asked for are ___.'"),
                    26: ("Q2 Integration Checkpoint", "What did you say directly? What are you still softening?"),
                }, "milestone": "You have expressed needs directly at least four times without framing them as questions or preferences."},
            }},
            3: {"theme": "Integration — Building a Direct Identity", "months": {
                7: {"focus": "Opinion as Identity", "weeks": {
                    27: ("Build the direct self-document", "Create an 'opinion inventory' — 20 things you genuinely think, stated without qualification."),
                    28: ("Test the opinion against friction", "Share three items from the inventory with someone who might disagree."),
                    29: ("Change the sequence", "When asked for your opinion, give it before asking for theirs."),
                    30: ("Remove a false neutrality", "Identify one area where you have been performing neutrality you do not actually feel. Stop."),
                }, "milestone": "You have a written, unqualified opinion inventory that you can share without editing."},
                8: {"focus": "Relational Directness", "weeks": {
                    31: ("Practise honesty over harmony", "Have one conversation this month where you say something true that risks conflict."),
                    32: ("External relational audit", "Ask a close friend: 'Do you feel like you know what I really think, or do I keep you at a comfortable distance?'"),
                    33: ("Remove the diplomatic management", "In one relationship, stop managing the other person's comfort for a week. Observe what happens."),
                    34: ("Audit the relational landscape", "Write: 'The relationships that can hold my real opinions are ___. The ones that can't are ___.'"),
                }, "milestone": "At least one relationship has deepened because you were more honest in it."},
                9: {"focus": "Identity Consolidation", "weeks": {
                    35: ("Anchor the new identity", "Rewrite your self-description: 'I am someone who ___' — defined by what you say, not what you withhold."),
                    36: ("Find the final frontier", "Identify the last remaining diplomatic performance. Name it."),
                    37: ("Apply the new identity", "Say the true thing in that situation this week."),
                    38: ("Consolidate integration", "Write your Q3 reflection: Who are you when you stop managing everyone's comfort?"),
                    39: ("Q3 Integration Checkpoint", "Review the year. What has changed in your relationships, your voice, your sense of self?"),
                }, "milestone": "You have said the true thing in the situation where diplomacy was most entrenched."},
            }},
            4: {"theme": "Expansion — Living with a Voice", "months": {
                10: {"focus": "The Hardest Truth", "weeks": {
                    40: ("Surface the final withholding", "Identify the truest thing you have never said to the person it most concerns."),
                    41: ("Act on the year's work", "Say it."),
                    42: ("Practise sustained directness", "When the urge to soften or retract arrives, stay with what you said."),
                    43: ("Document the shift", "Write: 'I used to withhold ___. Now I ___.'"),
                }, "milestone": "You have said the truest thing you have never said."},
                11: {"focus": "Directness as Love", "weeks": {
                    44: ("Surface the opportunity", "Identify one relationship that would be deeper if you were more honest in it."),
                    45: ("Deepen through directness", "Introduce more honesty into that relationship this month."),
                    46: ("Reframe directness as care", "Write: 'The most loving thing I can say to ___ is ___.'"),
                    47: ("Anchor the direct identity", "Write: 'The version of me that says the true thing is ___.'"),
                }, "milestone": "You have deepened at least one relationship through honesty."},
                12: {"focus": "Year-End Integration", "weeks": {
                    48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                    49: ("External year-end audit", "Ask three people: 'What is the biggest change you have seen in me this year?'"),
                    50: ("Consolidate the year", "Write your year-end reflection: What did you say that you would not have said in January?"),
                    51: ("Create continuity", "Design your Year 2 focus."),
                    52: ("Year-End Integration Checkpoint", "Full review with AI Twin."),
                }, "milestone": "You have a complete year-end reflection and a Year 2 growth direction."},
            }},
        },
    },
    "The Visionary": {
        "tagline": "You can see everything. This year, you finish one thing.",
        "growth_direction": "From inspiration-dependence and perpetual starting → toward the discipline of completion",
        "quarters": {
            1: {"theme": "Awareness — Seeing the Graveyard", "months": {
                1: {"focus": "The Project Audit", "weeks": {
                    1: ("Inventory the graveyard", "List every unfinished project, commitment, or intention from the past three years."),
                    2: ("Name the abandonment pattern", "For each item, write: 'Why did I stop?' Be honest — not 'life got busy' but the real reason."),
                    3: ("Anticipate the abandonment", "Identify the project you are most excited about right now. Write: 'What will I do when the excitement fades?'"),
                    4: ("External calibration", "Ask someone who knows you well: 'Do you trust that I will finish what I start?'"),
                }, "milestone": "You have a complete, honest inventory of your unfinished projects and the real reasons they were abandoned."},
                2: {"focus": "Understanding the Cost", "weeks": {
                    5: ("Make the cost concrete", "Write a one-page account of the most significant thing you did not finish and what it cost you."),
                    6: ("Name the core pattern", "Identify the belief underneath the abandonment: 'Once the excitement fades, ___.' Write it."),
                    7: ("Quantify the starting reflex", "Notice every time you have a new idea and feel the pull to start something new. Count the instances."),
                    8: ("Introduce the completion identity", "Write: 'The version of me that finishes things would feel ___.'"),
                }, "milestone": "You have a clear, written account of what non-completion has cost you in one specific domain."},
                3: {"focus": "Baseline Establishment", "weeks": {
                    9: ("Create focus through elimination", "Choose one item from the project graveyard. Formally archive or abandon every other item."),
                    10: ("Build the completion habit", "Work on the chosen project for 30 minutes per day, every day. No new projects."),
                    11: ("Create a holding space for new ideas", "When a new idea arrives, write it in a 'future ideas' list. Do not act on it."),
                    12: ("Consolidate awareness", "Write your Q1 reflection: What graveyard did you see? What surprised you?"),
                    13: ("Q1 Integration Checkpoint", "Commit to one project for the entire year. Name it."),
                }, "milestone": "You have worked on one project for 30 consecutive days and have a 'future ideas' list with at least five items you did not act on."},
            }},
            2: {"theme": "Disruption — The Discipline of Staying", "months": {
                4: {"focus": "The Boredom Phase", "weeks": {
                    14: ("Practise working through boredom", "When the excitement fades (it will this month), continue working. Log the discomfort."),
                    15: ("Break the abandonment point", "Identify the exact moment you usually abandon a project. Stay past it."),
                    16: ("Build delay tolerance", "When the urge to start something new arrives, wait 48 hours. Note what happens to the urge."),
                    17: ("Create social accountability", "Tell someone about your project. Make the commitment public."),
                }, "milestone": "You have worked on one project for 30 consecutive days, including through at least one period of significant boredom."},
                5: {"focus": "Process Over Inspiration", "weeks": {
                    18: ("Replace inspiration with process", "Create a simple daily process for your project — a specific time, a specific action, a specific output."),
                    19: ("Build process discipline", "Follow the process even on days when you are not inspired. Log the output."),
                    20: ("Interrupt the avoidance", "Identify the part of the project you have been avoiding. Do that part first this week."),
                    21: ("External project audit", "Ask someone: 'What do you think I need to do to actually finish this?'"),
                }, "milestone": "You have a working daily process that does not depend on inspiration."},
                6: {"focus": "Completion Practice", "weeks": {
                    22: ("Build completion momentum", "Identify one small task within your project that you can complete this week. Complete it."),
                    23: ("Reinforce the completion identity", "Celebrate the completion — not the progress, the completion."),
                    24: ("Chain completions", "Identify the next completion milestone. Work toward it."),
                    25: ("Anchor the completion feeling", "Write: 'The feeling of finishing is ___.'"),
                    26: ("Q2 Integration Checkpoint", "What have you finished? What are you still avoiding finishing?"),
                }, "milestone": "You have completed at least three small milestones within your project."},
            }},
            3: {"theme": "Integration — Building Completion as Identity", "months": {
                7: {"focus": "Finish Architecture", "weeks": {
                    27: ("Make completion structural", "Create a 'finish-first protocol': no new commitments until the current project reaches its next milestone."),
                    28: ("Test the protocol", "Apply the protocol when a new opportunity arrives. Say: 'I will consider this when I finish ___.'"),
                    29: ("Make the commitment relational", "Share the protocol with someone who might offer you new opportunities."),
                    30: ("Remove the final blocker", "Identify the biggest remaining obstacle to finishing your project. Address it directly."),
                }, "milestone": "You have declined at least one new opportunity in order to finish what you started."},
                8: {"focus": "Relational Completion", "weeks": {
                    31: ("Surface the relational pattern", "Identify one relationship where you have been 'almost present' — enthusiastic but not consistent."),
                    32: ("Apply completion to relationship", "Show up consistently in that relationship for a full month."),
                    33: ("External relational audit", "Ask a close friend: 'Do you feel like I follow through with you, or do I get excited and then disappear?'"),
                    34: ("Audit the relational landscape", "Write: 'The relationships where I am fully present and consistent are ___.'"),
                }, "milestone": "At least one person in your life has said they feel you show up more consistently than you did six months ago."},
                9: {"focus": "Identity Consolidation", "weeks": {
                    35: ("Anchor the new identity", "Rewrite your self-description: 'I am someone who ___' — defined by what you finish, not what you start."),
                    36: ("Find the final frontier", "Identify the last remaining starting reflex — the area where you are still abandoning."),
                    37: ("Apply the new identity", "Stay with it."),
                    38: ("Consolidate integration", "Write your Q3 reflection: Who are you when you finish things?"),
                    39: ("Q3 Integration Checkpoint", "Review the year. What have you completed?"),
                }, "milestone": "You have stayed with a project past the point where you would previously have abandoned it."},
            }},
            4: {"theme": "Expansion — Living as a Finisher", "months": {
                10: {"focus": "The Year's Project", "weeks": {
                    40: ("Act on the year's work", "Complete the project you committed to in Week 13."),
                    41: ("Reinforce the finisher identity", "Celebrate the completion. Tell people."),
                    42: ("Document the completion", "Write: 'I finished ___. It felt ___.'"),
                    43: ("Document the shift", "Write: 'I used to abandon things when ___. Now I ___.'"),
                }, "milestone": "You have completed the project you committed to at the start of the year."},
                11: {"focus": "Vision with Discipline", "weeks": {
                    44: ("Transfer the discipline", "Now that you have finished one thing, choose the next. Apply the same process."),
                    45: ("Anchor the builder identity", "Write: 'The vision I am building — not just imagining — is ___.'"),
                    46: ("Prevent regression", "Identify what you need to protect the new project from your old pattern. Build that protection."),
                    47: ("Anchor the identity", "Write: 'The version of me that finishes things is ___.'"),
                }, "milestone": "You have started a second project with the same discipline you applied to the first."},
                12: {"focus": "Year-End Integration", "weeks": {
                    48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                    49: ("External year-end audit", "Ask three people: 'What is the biggest change you have seen in me this year?'"),
                    50: ("Consolidate the year", "Write your year-end reflection: What did you finish? What did that feel like?"),
                    51: ("Create continuity", "Design your Year 2 focus."),
                    52: ("Year-End Integration Checkpoint", "Full review with AI Twin."),
                }, "milestone": "You have a complete year-end reflection and a Year 2 growth direction."},
            }},
        },
    },
    "The Anchor": {
        "tagline": "You are the most reliable person in every room. This year, you become the most alive.",
        "growth_direction": "From stability-as-identity → toward chosen evolution",
        "quarters": {
            1: {"theme": "Awareness — Seeing the Stillness", "months": {
                1: {"focus": "The Change Inventory", "weeks": {
                    1: ("Inventory the stasis", "List ten things that have not changed in your life in the past five years."),
                    2: ("Distinguish choice from inertia", "For each item, ask: 'Is this still a choice, or has it become a default?'"),
                    3: ("Name the resistance", "Identify one thing you have wanted to change but have not. Write the real reason."),
                    4: ("External calibration", "Ask someone who knows you well: 'What do you think I'm capable of that I'm not currently doing?'"),
                }, "milestone": "You can distinguish between the things you are keeping by choice and the things you are keeping by default."},
                2: {"focus": "Understanding the Cost", "weeks": {
                    5: ("Make the cost concrete", "Write a one-page account of a path you did not take because it felt too uncertain. What did it cost you?"),
                    6: ("Name the core fear", "Identify the belief underneath the stasis: 'If I change, then ___.' Write it."),
                    7: ("Quantify the resistance", "Notice every time you dismiss a new idea or opportunity as 'not for me.' Count the instances."),
                    8: ("Introduce the evolving self", "Write: 'The version of me that chose change would ___.'"),
                }, "milestone": "You have a clear, written account of what resistance to change has cost you in one specific domain."},
                3: {"focus": "Baseline Establishment", "weeks": {
                    9: ("Build change tolerance", "Change one routine this week — a different route, a different order, a different response. Note the discomfort."),
                    10: ("Expand the comfort zone", "Say yes to one thing this week that you would normally decline as 'not your thing.'"),
                    11: ("Introduce alternative models", "Have a conversation with someone who lives very differently from you. Ask them about their choices."),
                    12: ("Consolidate awareness", "Write your Q1 reflection: What stillness did you see? What surprised you?"),
                    13: ("Q1 Integration Checkpoint", "Identify one thing you want to change this year. Name it."),
                }, "milestone": "You have made at least four small changes and said yes to at least one thing outside your comfort zone."},
            }},
            2: {"theme": "Disruption — Choosing Change", "months": {
                4: {"focus": "The Small Disruption", "weeks": {
                    14: ("Build change as a practice", "Change one thing per week — something small, something you control."),
                    15: ("Act on the chosen change", "Begin the change identified in Q1. Take the first step."),
                    16: ("Build change tolerance", "When the discomfort of change arrives, stay with it for one day before reverting."),
                    17: ("Create accountability", "Tell someone about the change you are making."),
                }, "milestone": "You have made four small changes and one significant change in the past month."},
                5: {"focus": "The Future Self", "weeks": {
                    18: ("Introduce the future self", "Write a letter from the version of yourself one year from now who chose change. What did they gain?"),
                    19: ("Bridge the gap", "Identify one decision the future self would make that the current self is avoiding."),
                    20: ("Act as the future self", "Make that decision."),
                    21: ("External future-self calibration", "Ask someone: 'What do you think I would be like if I were less afraid of change?'"),
                }, "milestone": "You have made one decision that the January version of you would not have made."},
                6: {"focus": "Momentum", "weeks": {
                    22: ("Reinforce positive change", "Identify the change that is producing the most positive results. Double down on it."),
                    23: ("Build resilience", "Identify the change that is hardest. Stay with it."),
                    24: ("Inventory the gains", "Write: 'The things I have changed this year are ___. The things I have gained are ___.'"),
                    25: ("Test the fear", "Write: 'The things I was afraid of losing by changing were ___. Did I lose them?'"),
                    26: ("Q2 Integration Checkpoint", "What have you changed? What are you still defaulting to?"),
                }, "milestone": "You have stayed with at least one difficult change for a full month."},
            }},
            3: {"theme": "Integration — Making Evolution Normal", "months": {
                7: {"focus": "Change as Character", "weeks": {
                    27: ("Make change structural", "Create a 'change practice': one intentional change per month, chosen deliberately."),
                    28: ("Test the structure", "Apply the practice: choose this month's change and make it."),
                    29: ("Build discernment", "When the urge to revert to the old pattern arrives, ask: 'Is this safety or stagnation?'"),
                    30: ("Claim the new identity", "Tell someone: 'I am someone who chooses change.' Note how it feels to say it."),
                }, "milestone": "Change has become a regular, chosen part of your life rather than something that happens to you."},
                8: {"focus": "Relational Evolution", "weeks": {
                    31: ("Apply evolution to relationship", "Identify one relationship that has been static for years. Introduce something new into it."),
                    32: ("External relational audit", "Ask a close friend: 'Do you feel like I'm growing, or do you feel like I'm the same as I was five years ago?'"),
                    33: ("Introduce the evolving self to old relationships", "Share one new thing about yourself with someone who has known you for a long time."),
                    34: ("Audit the relational landscape", "Write: 'The relationships that can hold my growth are ___. The ones that prefer me static are ___.'"),
                }, "milestone": "At least one long-standing relationship has been refreshed by your growth."},
                9: {"focus": "Identity Consolidation", "weeks": {
                    35: ("Anchor the new identity", "Rewrite your self-description: 'I am someone who ___' — defined by evolution, not consistency."),
                    36: ("Find the final frontier", "Identify the last remaining default — the thing you are still doing out of inertia."),
                    37: ("Apply the new identity", "Change it."),
                    38: ("Consolidate integration", "Write your Q3 reflection: Who are you when you choose change?"),
                    39: ("Q3 Integration Checkpoint", "Review the year. What has changed?"),
                }, "milestone": "You have changed the thing you were doing most stubbornly out of inertia."},
            }},
            4: {"theme": "Expansion — Living as an Evolving Person", "months": {
                10: {"focus": "The Significant Change", "weeks": {
                    40: ("Surface the final resistance", "Identify the most significant change you have been avoiding — the one that would most change your life."),
                    41: ("Act on the year's work", "Take the first step toward it."),
                    42: ("Practise change in the face of fear", "When the fear arrives, name it and continue."),
                    43: ("Document the shift", "Write: 'I used to stay because ___. Now I move because ___.'"),
                }, "milestone": "You have taken the first step toward the most significant change you have been avoiding."},
                11: {"focus": "Stability Redefined", "weeks": {
                    44: ("Reframe the core value", "Write a new definition of stability — one that includes growth, change, and uncertainty."),
                    45: ("Test the new identity", "Share that definition with someone who has always relied on your consistency."),
                    46: ("Find the deeper anchor", "Write: 'The most stable thing about me is not what I do — it is ___.'"),
                    47: ("Anchor the identity", "Write: 'The version of me that chooses change is ___.'"),
                }, "milestone": "You have a new, written definition of stability that includes growth."},
                12: {"focus": "Year-End Integration", "weeks": {
                    48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                    49: ("External year-end audit", "Ask three people: 'What is the biggest change you have seen in me this year?'"),
                    50: ("Consolidate the year", "Write your year-end reflection: What did you choose to change? What did that feel like?"),
                    51: ("Create continuity", "Design your Year 2 focus."),
                    52: ("Year-End Integration Checkpoint", "Full review with AI Twin."),
                }, "milestone": "You have a complete year-end reflection and a Year 2 growth direction."},
            }},
        },
    },
    "The Rebel": {
        "tagline": "You have spent years pushing against. This year, you build toward.",
        "growth_direction": "From identity-through-opposition → toward identity-through-creation",
        "quarters": {
            1: {"theme": "Awareness — Seeing the Cage", "months": {
                1: {"focus": "The Reaction Audit", "weeks": {
                    1: ("Inventory the opposition", "Each day, note one thing you pushed against, rejected, or refused. Write it down."),
                    2: ("Distinguish autonomy from reactivity", "For each item, ask: 'Was that a choice or a reflex?'"),
                    3: ("Shift from opposition to direction", "Identify the three things you are most defined by rejecting. Write what you are for instead."),
                    4: ("External calibration", "Ask someone who knows you well: 'What do you think I'm running from?'"),
                }, "milestone": "You can distinguish between your genuine values and your reflexive oppositions."},
                2: {"focus": "Understanding the Cost", "weeks": {
                    5: ("Make the cost concrete", "Write a one-page account of something you rejected that, in retrospect, you should have accepted."),
                    6: ("Name the core fear", "Identify the belief underneath the rebellion: 'If I conform to this, then ___.' Write it."),
                    7: ("Quantify the reflex", "Notice every time you reject something before fully considering it. Count the instances."),
                    8: ("Introduce the builder identity", "Write: 'The version of me that builds rather than pushes would ___.'"),
                }, "milestone": "You have a clear, written account of what reflexive opposition has cost you in one specific domain."},
                3: {"focus": "Baseline Establishment", "weeks": {
                    9: ("Build delay tolerance", "When you feel the urge to reject something, wait 24 hours before responding."),
                    10: ("Practise chosen structure", "Identify one structure, routine, or commitment that would serve your goals. Adopt it voluntarily."),
                    11: ("Practise selective acceptance", "Engage with one idea or system you would normally dismiss. Find what is useful in it."),
                    12: ("Consolidate awareness", "Write your Q1 reflection: What cage did you see? What surprised you?"),
                    13: ("Q1 Integration Checkpoint", "Identify one thing you want to build this year. Name it."),
                }, "milestone": "You have adopted one voluntary structure and engaged with one idea you would previously have dismissed."},
            }},
            2: {"theme": "Disruption — Building Instead of Pushing", "months": {
                4: {"focus": "The Commitment Experiment", "weeks": {
                    14: ("Practise chosen commitment", "Choose one thing to commit to for 30 days — not because you have to, but because you choose to."),
                    15: ("Act on the builder identity", "Begin building the thing identified in Q1. Take the first concrete step."),
                    16: ("Build discernment", "When the urge to abandon or rebel arrives, ask: 'Is this my values or my reflex?'"),
                    17: ("Create accountability", "Tell someone about what you are building."),
                }, "milestone": "You have maintained one voluntary commitment for 30 consecutive days."},
                5: {"focus": "Structure as Tool", "weeks": {
                    18: ("Practise chosen structure", "Design one structure — a routine, a system, a constraint — that serves your goals. Use it."),
                    19: ("Build structural discernment", "When the structure feels constraining, ask: 'Is this constraint serving me or limiting me?'"),
                    20: ("Apply structure to the hardest case", "Identify one area where your rejection of structure is costing you. Introduce structure there."),
                    21: ("External audit", "Ask someone: 'Do you think I use my independence to build things, or to avoid building them?'"),
                }, "milestone": "You have a working structure that you designed and are using voluntarily."},
                6: {"focus": "Identity Through Creation", "weeks": {
                    22: ("Build creator identity", "Write weekly: 'This week I built ___' — defined by creation, not opposition."),
                    23: ("Shift from opposition to direction", "Identify one area where your identity is still defined by what you reject. Name what you are for instead."),
                    24: ("Act on the creator identity", "Take one action this week that is entirely about building, not about pushing back."),
                    25: ("Anchor the creator identity", "Write: 'The person I am becoming is defined by ___.' (What they build, not what they reject.)"),
                    26: ("Q2 Integration Checkpoint", "What have you built? What are you still pushing against?"),
                }, "milestone": "You have a written creator identity statement that you have lived for four weeks."},
            }},
            3: {"theme": "Integration — Building as Identity", "months": {
                7: {"focus": "Legacy Architecture", "weeks": {
                    27: ("Define the legacy", "Write a one-page answer to: 'What am I building? What will it mean when it exists?'"),
                    28: ("Test the sincerity", "Share the answer with someone. Note if you feel the urge to undercut it or make it ironic."),
                    29: ("Apply the new identity to the hardest requirement", "Identify what your project needs from you that your old pattern resists giving. Give it."),
                    30: ("Make building structural", "Create a 'builder's protocol': the specific commitments your project requires. Follow it."),
                }, "milestone": "You have a written legacy statement and a working protocol for building toward it."},
                8: {"focus": "Relational Building", "weeks": {
                    31: ("Surface the relational pattern", "Identify one relationship you have been maintaining through opposition rather than connection."),
                    32: ("Apply building to relationship", "Introduce genuine connection into that relationship — curiosity, vulnerability, care."),
                    33: ("External relational audit", "Ask a close friend: 'Do you feel like I'm building something with you, or just reacting?'"),
                    34: ("Audit the relational landscape", "Write: 'The relationships I am building — not just maintaining — are ___.'"),
                }, "milestone": "At least one relationship has shifted from opposition-maintenance to genuine building."},
                9: {"focus": "Identity Consolidation", "weeks": {
                    35: ("Anchor the new identity", "Rewrite your self-description: 'I am someone who ___' — defined by what you build, not what you reject."),
                    36: ("Find the final frontier", "Identify the last remaining opposition reflex — the thing you are still pushing against by default."),
                    37: ("Apply the new identity", "Choose to build something in that domain instead."),
                    38: ("Consolidate integration", "Write your Q3 reflection: Who are you when you build rather than push?"),
                    39: ("Q3 Integration Checkpoint", "Review the year. What have you built?"),
                }, "milestone": "You have built something in the domain where you previously only pushed back."},
            }},
            4: {"theme": "Expansion — Living as a Builder", "months": {
                10: {"focus": "The Thing That Requires Staying", "weeks": {
                    40: ("Surface the final challenge", "Identify the most significant thing you want to build — the one that requires sustained commitment."),
                    41: ("Act on the year's work", "Commit to it. Publicly."),
                    42: ("Practise sustained commitment", "When the urge to leave, rebel, or undercut arrives, stay."),
                    43: ("Document the shift", "Write: 'I used to leave when ___. Now I stay because ___.'"),
                }, "milestone": "You have made a public commitment to something that requires staying."},
                11: {"focus": "Freedom Redefined", "weeks": {
                    44: ("Reframe the core value", "Write a new definition of freedom — one that includes commitment, structure, and staying."),
                    45: ("Test the new identity", "Share that definition with someone who has always known you as the one who leaves."),
                    46: ("Anchor the new definition", "Write: 'The most free I have felt this year was when I ___.' (It should involve building, not escaping.)"),
                    47: ("Anchor the identity", "Write: 'The version of me that builds things is ___.'"),
                }, "milestone": "You have a new, written definition of freedom that includes commitment."},
                12: {"focus": "Year-End Integration", "weeks": {
                    48: ("Measure the distance", "Re-read your Week 1 journal entry. Write a response from who you are now."),
                    49: ("External year-end audit", "Ask three people: 'What is the biggest change you have seen in me this year?'"),
                    50: ("Consolidate the year", "Write your year-end reflection: What did you build? What did you stop pushing against?"),
                    51: ("Create continuity", "Design your Year 2 focus."),
                    52: ("Year-End Integration Checkpoint", "Full review with AI Twin."),
                }, "milestone": "You have a complete year-end reflection and a Year 2 growth direction."},
            }},
        },
    },
}

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def get_plan_week(state: dict) -> int:
    """Return the current plan week (1-52) based on stored start date or ISO week."""
    if "plan_start_date" in state:
        start = date.fromisoformat(state["plan_start_date"])
        delta = (date.today() - start).days
        week = min(max(1, (delta // 7) + 1), 52)
        return week
    # Fall back to ISO week number (assumes plan started Jan 1)
    return min(date.today().isocalendar()[1], 52)


def get_quarter(week: int) -> int:
    if week <= 13:
        return 1
    elif week <= 26:
        return 2
    elif week <= 39:
        return 3
    else:
        return 4


def get_month_number(week: int) -> int:
    """Return the 1-based global month number (1-12) for a given plan week.

    Each quarter spans 13 weeks split into three months:
      Month 1 of quarter: weeks 1-4  (4 weeks)
      Month 2 of quarter: weeks 5-8  (4 weeks)
      Month 3 of quarter: weeks 9-13 (5 weeks, includes checkpoint)
    """
    quarter = get_quarter(week)
    q_start = (quarter - 1) * 13 + 1
    week_in_q = week - q_start + 1  # 1-13
    if week_in_q <= 4:
        m_in_q = 1
    elif week_in_q <= 8:
        m_in_q = 2
    else:
        m_in_q = 3
    return (quarter - 1) * 3 + m_in_q


def get_week_data(archetype_data: dict, week: int) -> dict | None:
    """Extract the habit data for a specific week from the archetype plan."""
    quarter = get_quarter(week)
    global_month = get_month_number(week)
    quarters = archetype_data.get("quarters", {})
    q_data = quarters.get(quarter, {})
    months = q_data.get("months", {})
    # Month keys in the data are global month numbers (1-12)
    m_data = months.get(global_month, {})
    weeks = m_data.get("weeks", {})
    if week in weeks:
        title, habit = weeks[week]
        return {
            "quarter": quarter,
            "quarter_theme": q_data.get("theme", ""),
            "month": global_month,
            "month_focus": m_data.get("focus", ""),
            "month_milestone": m_data.get("milestone", ""),
            "week_title": title,
            "week_habit": habit,
        }
    return None


def is_checkpoint_week(week: int) -> bool:
    return week in (13, 26, 39, 52)


def is_milestone_week(week: int) -> bool:
    """Last week of each month is milestone review week."""
    return week % 4 == 0


def generate_summary(plan_week: int, run_date: date) -> str:
    """Generate the full weekly summary document for all eight archetypes."""
    iso_week = run_date.isocalendar()[1]
    quarter = get_quarter(plan_week)
    lines = [
        f"# MirrorMind — Weekly Growth Plan Summary",
        f"",
        f"**Plan Week:** {plan_week} of 52  |  **Calendar Date:** {run_date.strftime('%B %d, %Y')}  |  **ISO Week:** {iso_week}",
        f"**Quarter:** Q{quarter}  |  **Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}",
        f"",
        f"---",
        f"",
        f"## This Week at a Glance",
        f"",
    ]

    # Quick reference table
    lines.append("| Archetype | Month Focus | This Week's Habit Title |")
    lines.append("|---|---|---|")
    for name, data in ARCHETYPES.items():
        wd = get_week_data(data, plan_week)
        if wd:
            lines.append(f"| **{name}** | {wd['month_focus']} | {wd['week_title']} |")
        else:
            lines.append(f"| **{name}** | — | — |")

    lines += ["", "---", ""]

    # Per-archetype detailed section
    for name, data in ARCHETYPES.items():
        wd = get_week_data(data, plan_week)
        lines += [
            f"## {name}",
            f"",
            f"> *{data['tagline']}*",
            f"",
            f"**Growth Direction:** {data['growth_direction']}",
            f"",
        ]

        if wd:
            lines += [
                f"**Quarter {wd['quarter']} — {wd['quarter_theme']}**",
                f"",
                f"**Month Focus:** {wd['month_focus']}",
                f"",
                f"### Week {plan_week} Habit",
                f"",
                f"**{wd['week_title']}**",
                f"",
                f"{wd['week_habit']}",
                f"",
            ]

            if is_milestone_week(plan_week):
                lines += [
                    f"### Month {wd['month']} Milestone",
                    f"",
                    f"*Review this milestone at the end of the week:*",
                    f"",
                    f"> {wd['month_milestone']}",
                    f"",
                ]

            if is_checkpoint_week(plan_week):
                lines += [
                    f"### Q{wd['quarter']} Integration Checkpoint",
                    f"",
                    f"This is a **quarter-end checkpoint week**. Schedule a session with your AI Twin to review:",
                    f"",
                    f"1. What changed this quarter?",
                    f"2. What did you avoid?",
                    f"3. What surprised you?",
                    f"4. What is the focus for next quarter?",
                    f"",
                ]
        else:
            lines += [
                f"*No habit data found for Week {plan_week}. Check plan-state.json.*",
                f"",
            ]

        lines += ["---", ""]

    # Weekly check-in reminder
    lines += [
        "## Weekly Check-In (All Archetypes)",
        "",
        "Every user should answer these three questions with their AI Twin this week:",
        "",
        "1. **What did I do differently this week?**",
        "2. **What did I avoid?**",
        "3. **What did I notice about myself?**",
        "",
        "---",
        "",
        f"*Generated automatically by MirrorMind Weekly Growth Summary — Plan Week {plan_week}*",
        "",
    ]

    return "\n".join(lines)


def load_state() -> dict:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="MirrorMind Weekly Growth Plan Summary Generator")
    parser.add_argument("--week", type=int, help="Override plan week (1-52)")
    parser.add_argument("--output-dir", type=str, help="Override output directory")
    args = parser.parse_args()

    # Resolve output directory
    output_dir = Path(args.output_dir) if args.output_dir else OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load state
    state = load_state()

    # Determine plan week
    if args.week:
        plan_week = max(1, min(52, args.week))
    else:
        plan_week = get_plan_week(state)

    today = date.today()
    iso_week = today.isocalendar()[1]

    print(f"[MirrorMind] Generating weekly summary for Plan Week {plan_week} (ISO week {iso_week}, {today})")

    # Generate summary
    summary = generate_summary(plan_week, today)

    # Write output file
    filename = f"{today.strftime('%Y')}-W{str(iso_week).zfill(2)}.md"
    output_path = output_dir / filename
    with open(output_path, "w") as f:
        f.write(summary)

    print(f"[MirrorMind] Summary written to: {output_path}")

    # Update state
    state["last_run"] = today.isoformat()
    state["last_plan_week"] = plan_week
    state["last_output_file"] = str(output_path)
    if "plan_start_date" not in state:
        # First run — record start date as today
        state["plan_start_date"] = today.isoformat()
        print(f"[MirrorMind] Plan start date set to {today.isoformat()} (first run)")
    save_state(state)

    print(f"[MirrorMind] Done. Next run: Plan Week {min(plan_week + 1, 52)}")
    return str(output_path)


if __name__ == "__main__":
    main()
