// src/services/briefService.ts
// Generates morning brief or evening recap via Claude API

import { MorningBrief, UIObligation } from '../types';
import { DayProgress } from './snapshotService';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

// ── Time helpers ───────────────────────────────────────────────────────────────

export function getBriefTimeOfDay(): 'morning' | 'evening' {
  return new Date().getHours() >= 17 ? 'evening' : 'morning';
}

/** Unique key for the current brief period — "YYYY-MM-DD-morning" or "-evening" */
export function getBriefKey(): string {
  const dateStr = new Date().toISOString().split('T')[0];
  return `${dateStr}-${getBriefTimeOfDay()}`;
}

/** Returns true when the stored brief key no longer matches the current period */
export function isBriefStale(lastBriefKey: string | null): boolean {
  return lastBriefKey !== getBriefKey();
}

// ── Brief generation ───────────────────────────────────────────────────────────

export async function generateBrief(
  obligations: UIObligation[],
  losScore: number,
  dayProgress?: DayProgress,   // evening only — pass result of getDayProgress()
): Promise<MorningBrief> {
  const isEvening = getBriefTimeOfDay() === 'evening';
  const activeObs = obligations.filter(o => o.status !== 'completed').slice(0, 8);

  const obsLines = activeObs.length > 0
    ? activeObs.map(o =>
        `  - ${o.emoji} ${o.title} | risk: ${o.risk} | due: ${o.daysUntil}d | type: ${o.type}` +
        (o.amount        ? ` | AED ${o.amount}`        : '') +
        (o.executionPath ? ` | action: ${o.executionPath}` : '')
      ).join('\n')
    : '  - No active obligations';

  // ── Build evening-specific progress block ─────────────────────────────────
  let eveningProgressBlock = '';
  if (isEvening && dayProgress) {
    const { totalAtStart, completedToday, stillPending, addedToday, snapshotExists } = dayProgress;

    const completedLines = completedToday.length > 0
      ? completedToday.map(o => `    ✅ ${o.emoji} ${o.title} (${o.risk} risk)`).join('\n')
      : '    (none completed today)';

    const pendingLines = stillPending.length > 0
      ? stillPending.map(o => `    ⏳ ${o.emoji} ${o.title} (${o.risk} risk, ${o.daysUntil}d left)`).join('\n')
      : '    (all clear!)';

    const addedLines = addedToday.length > 0
      ? addedToday.map(o => `    ➕ ${o.emoji} ${o.title}`).join('\n')
      : '    (none added today)';

    eveningProgressBlock = `

TODAY'S PROGRESS SUMMARY (${snapshotExists ? 'tracked since morning' : 'approximate — no morning snapshot'}):
- Started the day with: ${totalAtStart} active obligation${totalAtStart !== 1 ? 's' : ''}
- Completed today (${completedToday.length}):
${completedLines}
- Still pending (${stillPending.length}):
${pendingLines}
- New items added today (${addedToday.length}):
${addedLines}`;
  }

  const prompt =
`You are Buddy — AI personal chief of staff inside Wyle, a life-management app for busy professionals in Dubai, UAE.

Generate a ${isEvening ? 'calm evening recap' : 'sharp morning brief'} for the user.

User context:
- Life Optimization Score: ${losScore}/100
- Currently active / pending obligations (${activeObs.length}):
${obsLines}${eveningProgressBlock}

Return ONLY a valid JSON object — no markdown, no explanation — matching this exact shape:
{
  "greeting": "string — ${isEvening ? 'warm, 5-6 word evening greeting' : 'energising, 5-6 word morning greeting'}",
  "headline": "string — one punchy sentence: ${isEvening ? 'how the day went, referencing actual completed/pending counts' : 'the single most important thing today'}",
  "lifeOptimizationScore": ${losScore},
  "topPriorities": [
    {
      "id": "p1",
      "title": "obligation title",
      "type": "visa|emirates_id|car_registration|insurance|bill|school_fee|medical|payment|task|other",
      "riskLevel": "high|medium|low",
      "emoji": "relevant emoji",
      "daysUntil": 0,
      "executionPath": "one-line how-to",
      "action": "short imperative e.g. Renew now"
    }
  ],${isEvening ? `
  "completedItems": [
    {
      "id": "c1",
      "title": "completed obligation title",
      "emoji": "relevant emoji",
      "completedNote": "short win note e.g. Filed on time or Saved AED 450"
    }
  ],
  "tomorrowPreview": "one calm sentence about the top pending item for tomorrow",` : ''}
  "stats": {
    "obligationsTracked": ${activeObs.length},
    "timeSavedThisWeek": "4h 20m",
    "decisionsHandled": 12
  },
  "tip": "one specific, practical tip for ${isEvening ? 'tonight or tomorrow morning' : 'today'} related to their obligations"
}

Rules:
- topPriorities: up to 3 items from the STILL PENDING list (highest risk first). Empty array [] if nothing pending.
- Keep all strings short — this renders on a mobile card.
- Tone: ${isEvening ? 'calm, reflective, wind-down' : 'focused, action-oriented, decisive'}.${isEvening ? `
- completedItems: use ONLY items from "Completed today" list in TODAY'S PROGRESS SUMMARY. Empty array [] if none.
- headline: MUST mention the actual numbers e.g. "Solid day — 2 done, 1 still waiting on you"
- tomorrowPreview: reference the highest-risk pending item by name. "You're all clear for tomorrow." if nothing pending.` : ''}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? 'Brief generation failed');
  }

  const data = await res.json();
  const raw   = data.content?.[0]?.text ?? '{}';
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as MorningBrief;
}
