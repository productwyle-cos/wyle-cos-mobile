// src/services/aiService.ts
// Unified AI caller: Claude primary → Groq fallback on failure

const ANTHROPIC_API_KEY = (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '').trim();
const GROQ_API_KEY      = (process.env.EXPO_PUBLIC_GROQ_API_KEY      ?? '').trim();

type Role = 'user' | 'assistant';

export interface AIMessage {
  role:    Role;
  content: string;
}

export interface AIRequest {
  /** Shorthand for a single user message (ignored if messages is provided) */
  prompt?:    string;
  messages?:  AIMessage[];
  system?:    string;
  maxTokens?: number;
  model?:     string;
  tools?:     any[];
}

export interface AIResponse {
  text:        string;
  stopReason?: string;
  toolUse?:    { name: string; input: any } | null;
}

// ── Groq fallback (OpenAI-compatible API, free tier) ─────────────────────────
async function callGroq(req: AIRequest): Promise<AIResponse> {
  if (!GROQ_API_KEY) throw new Error('No Groq API key configured');

  const msgs: AIMessage[] = req.messages ?? (req.prompt ? [{ role: 'user', content: req.prompt }] : []);

  const groqMessages: any[] = [];
  if (req.system) {
    groqMessages.push({ role: 'system', content: req.system });
  }
  groqMessages.push(...msgs.map(m => ({ role: m.role, content: m.content })));

  const body = {
    model:      'llama-3.3-70b-versatile',
    messages:   groqMessages,
    max_tokens: req.maxTokens ?? 1000,
  };

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Groq API error');

  const text = data.choices?.[0]?.message?.content ?? '';
  return { text, stopReason: 'end_turn', toolUse: null };
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function callAI(req: AIRequest): Promise<AIResponse> {
  const msgs: AIMessage[] = req.messages ?? (req.prompt ? [{ role: 'user', content: req.prompt }] : []);

  const claudeBody: any = {
    model:      req.model ?? 'claude-sonnet-4-20250514',
    max_tokens: req.maxTokens ?? 1000,
    messages:   msgs,
  };
  if (req.system) claudeBody.system = req.system;
  if (req.tools)  claudeBody.tools  = req.tools;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                            'application/json',
        'x-api-key':                               ANTHROPIC_API_KEY,
        'anthropic-version':                       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(claudeBody),
    });

    const data = await res.json();

    if (res.ok && !data.error) {
      const toolUse = data.content?.find((c: any) => c.type === 'tool_use') ?? null;
      const text    = data.content?.find((c: any) => c.type === 'text')?.text ?? '';
      return { text, stopReason: data.stop_reason, toolUse };
    }

    console.warn(`[AIService] Claude failed (${res.status}: ${data.error?.message}) — falling back to Groq`);
  } catch (e) {
    console.warn('[AIService] Claude network error — falling back to Groq');
  }

  return callGroq(req);
}
