// Shared closed vocabulary of the synthetic archive used by the hybrid benchmark.
export const TAGS = ['Rechnung', 'Versicherung', 'Steuern', 'Lohn', 'Bank', 'Miete', 'Gesundheit', 'Auto', 'Telekom', 'Strom',
  'Schule', 'Garantie', 'Vertrag', 'Mahnung', 'Kündigung', 'Spende', 'Reise', 'Behörde', 'Abo', 'Haushalt',
  'Zahlung offen', 'Bezahlt', 'Wichtig', 'Rente', 'Kinder'];
export const CORRESPONDENTS = ['Swisscom', 'Sunrise', 'Salt', 'CKW', 'EWZ', 'CSS Versicherung', 'Helsana', 'Die Mobiliar', 'AXA', 'Zurich Versicherung',
  'Zürcher Kantonalbank', 'PostFinance', 'Raiffeisen', 'UBS', 'Steueramt Kanton Luzern', 'Strassenverkehrsamt', 'Migros', 'Coop', 'Digitec Galaxus',
  'SBB', 'Livit AG', 'Ausgleichskasse Luzern', 'Kantonsspital Luzern', 'IKEA', 'Amazon', 'British Airways', 'Rotes Kreuz', 'TCS', 'Serafe',
  'Gemeinde Emmen', 'Kantonsschule Alpenquai', 'Zalando', 'Apple', 'Booking.com', 'Die Post', 'Hirslanden Klinik St. Anna'];
export const TYPES = ['Rechnung', 'Police', 'Vertrag', 'Lohnabrechnung', 'Kontoauszug', 'Steuerdokument', 'Mahnung', 'Brief',
  'Quittung', 'Bescheinigung', 'Kündigung', 'Offerte'];
export const LANGS = { de: 'German', en: 'English', fr: 'French', it: 'Italian' };

export async function openrouter(model, messages, { json = true, maxTokens = 1500, temperature = 0 } = {}) {
  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'tagvico-jev-hybrid-eval' },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, usage: { include: true },
        ...(json ? { response_format: { type: 'json_object' } } : {}), reasoning: { effort: 'low' } }),
      signal: AbortSignal.timeout(120_000)
    }).catch((error) => ({ ok: false, status: 0, text: async () => String(error) }));
    if (res.ok) {
      const body = await res.json();
      const text = body.choices?.[0]?.message?.content || '';
      if (text || attempt >= 3) return { text, ms: performance.now() - started, usage: body.usage || {}, cost: Number(body.usage?.cost || 0) };
    } else if (attempt >= 4 || ![0, 408, 429, 500, 502, 503, 529].includes(res.status)) {
      throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
  }
}

export function parseJson(text) {
  const cleaned = String(text).replace(/```json\n?|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
}

export async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const index = next++; results[index] = await worker(items[index], index); }
  }));
  return results;
}
