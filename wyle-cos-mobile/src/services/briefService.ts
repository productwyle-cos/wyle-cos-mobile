// src/services/briefService.ts
// Generates morning brief or evening recap via Claude API

import { MorningBrief, UIObligation } from '../types';

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
  losScore: number
): Promise<MorningBrief> {
  const isEvening = getBriefTimeOfDay() === 'evening';
  const activeObs = obligations.filter(o => o.status === 'active').slice(0, 8);
  const completed = obligations.filter(o => o.status === 'completed');

  const obsLines = activeObs.length > 0
    ? activeObs.map(o =>
        `  - ${o.emoji} ${o.title} | risk: ${o.risk} | due: ${o.daysUntil}d | type: ${o.type}` +
        (o.amount       ? ` | AED ${o.amount}`        : '') +
        (o.executionPath ? ` | action: ${o.executionPath}` : '')
      ).join('\n')
    : '  - No active obligations';

  const completedLine = completed.length > 0
    ? `\nRecently completed: ${completed.map(o => o.title).join(', ')}`
    : '';

  const prompt =
`You are Buddy — AI personal chief of staff inside Wyle, a life-management app for busy professionals in Dubai, UAE.

Generate a ${isEvening ? 'calm evening recap' : 'sharp morning brief'} for the user.

User context:
- Life Optimization Score: ${losScore}/100
- Active obligations (${activeObs.length}):
${obsLines}${completedLine}

Return ONLY a valid JSON object — no markdown, no explanation — matching this exact shape:
{
  "greeting": "string — ${isEvening ? 'warm, 5-6 word evening greeting' : 'energising, 5-6 word morning greeting'}",
  "headline": "string — one punchy sentence: ${isEvening ? 'what still needs attention tomorrow' : 'the single most important thing today'}",
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
  ],
  "stats": {
    "obligationsTracked": ${activeObs.length},
    "timeSavedThisWeek": "4h 20m",
    "decisionsHandled": 12
  },
  "tip": "one specific, practical tip for today related to their obligations"
}

Rules:
- topPriorities: maximum 3 items, highest riskLevel first. Only include items from the obligations list above.
- Keep all strings short — this renders on a mobile card.
- Tone: ${isEvening ? 'calm, reflective, wind-down' : 'focused, action-oriented, decisive'}.`;

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
