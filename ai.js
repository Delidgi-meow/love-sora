import { MIN_SCORE, RELATION_TYPES } from './config.js';
import { cfg, loveData, toast } from './state.js';

function getBaseUrl() {
    return (cfg().genEndpoint || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/v1$/, '');
}

// ─── Модели ───────────────────────────────────────────────────────────────────
export async function fetchModels() {
    const base = getBaseUrl(), apiKey = (cfg().genApiKey || '').trim();
    if (!base || !apiKey) { toast('warning', 'Укажи Endpoint и API Key'); return []; }
    const resp = await fetch(base + '/v1/models', { method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    return (data.data || data.models || []).map(m => typeof m === 'string' ? m : m.id).filter(Boolean).sort();
}

// ─── Генерация правил ─────────────────────────────────────────────────────────
export async function generateRules(charCard, chatHistory = '') {
    const c = cfg(), base = getBaseUrl(), apiKey = (c.genApiKey || '').trim(), model = (c.genModel || '').trim() || 'gpt-4o';
    if (!base) throw new Error('Укажи Endpoint');
    if (!apiKey) throw new Error('Укажи API Key');

    const d = loveData(), maxScore = d.maxScore || 100;
    const lang = c.genLang || 'ru', langLabel = lang === 'ru' ? 'Russian' : 'English';
    const userNotes = (c.genUserNotes || '').trim();
    const hasHistory = chatHistory.trim().length > 0;

    const systemMsg = 'You are configuring a Love Score system for a text-based RPG. Reply with ONLY valid JSON — no explanations, no markdown, no code blocks.';

    const schema = `{
  "suggestedMax": ${maxScore},
  "changes": [{"delta": 2, "text": "..."},{"delta": -10, "text": "..."}],
  "ranges": [{"min": -100, "max": -1, "text": "..."},{"min": 0, "max": 20, "text": "..."}],
  "milestones": [{"threshold": 15, "text": "..."}]
}`;

    const rules = [
        'RULES:',
        '- changes: at least 6 items with varied positive and negative deltas',
        '- negative ranges (min:' + MIN_SCORE + ' to max:-1): describe hostility, hatred, fear — no gaps',
        '- positive ranges (min:0 to max:' + maxScore + '): describe attraction and love — no gaps',
        '- milestones: at least 5 POSITIVE thresholds only, ordered ascending',
        '- suggestedMax: suggest higher max (200-300) for cold/distant characters',
        '- All text in ' + langLabel,
    ];
    if (userNotes) rules.push('', 'SPECIAL USER INSTRUCTIONS (priority):', userNotes);

    const userMsg = [
        hasHistory
            ? 'Analyze the character card AND the real chat history to generate accurate love score rules.'
            : 'Analyze the character card and generate love score rules.',
        'Score range: ' + MIN_SCORE + ' to ' + maxScore + '. Negative = hostility/hatred. Positive = love/affection.',
        '', 'CHARACTER CARD:', charCard, '',
        ...(hasHistory ? ['RECENT CHAT HISTORY (use this to ground descriptions):', chatHistory, '', 'IMPORTANT: Base descriptions on what actually happens in this chat.'] : []),
        'Reply with STRICTLY valid JSON matching this schema:', schema, '',
        ...rules
    ].filter(Boolean).join('\n');

    const resp = await fetch(base + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }], temperature: 0.7, max_tokens: 2800 })
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP ' + resp.status + ': ' + t.slice(0, 300)); }
    const result = await resp.json();
    return result?.choices?.[0]?.message?.content ?? '';
}

export function parseGenerateResponse(raw) {
    try {
        let cleaned = raw.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
        const js = cleaned.indexOf('{'), je = cleaned.lastIndexOf('}');
        if (js !== -1 && je > js) cleaned = cleaned.slice(js, je + 1);
        const p = JSON.parse(cleaned);
        return {
            changes: (p.changes || []).filter(x => typeof x.delta === 'number' && x.text).map(x => ({ delta: x.delta, description: String(x.text).trim() })),
            ranges: (p.ranges || []).filter(x => typeof x.min === 'number' && typeof x.max === 'number' && x.text).map(x => ({ min: x.min, max: x.max, description: String(x.text).trim() })),
            milestones: (p.milestones || []).filter(x => typeof x.threshold === 'number' && x.text).sort((a, b) => a.threshold - b.threshold).map(x => ({ threshold: x.threshold, description: String(x.text).trim(), done: false })),
            suggestedMax: p.suggestedMax || null,
            ok: true
        };
    } catch { return { changes: [], ranges: [], milestones: [], suggestedMax: null, ok: false }; }
}

// ─── Анализ чата ──────────────────────────────────────────────────────────────
export async function analyzeChat(charCard, chatHistory) {
    const c = cfg(), base = getBaseUrl(), apiKey = (c.genApiKey || '').trim(), model = (c.genModel || '').trim() || 'gpt-4o';
    if (!base) throw new Error('Не указан Endpoint');
    if (!apiKey) throw new Error('Не указан API Key');

    const d = loveData(), lang = c.genLang === 'ru';
    const systemMsg = 'You are an expert analyst for a text-based RPG relationship tracker. Reply ONLY with valid JSON, no markdown.';
    const userMsg = [
        'Analyze the relationship between the player and the character based on the chat history.',
        'Current love score: ' + d.score + ' (range: ' + MIN_SCORE + ' to ' + d.maxScore + ').',
        '', 'CHARACTER CARD:', charCard,
        '', 'RECENT CHAT HISTORY:', chatHistory, '',
        'Reply in ' + (lang ? 'Russian' : 'English') + ' with STRICTLY valid JSON:',
        '{"suggestedScore":<integer>,"relationType":"<one of: romance|friendship|family|obsession|rival|platonic>","analysis":"<2-3 sentences>","reasoning":"<why this score>"}',
        'RULES: suggestedScore must be integer between ' + MIN_SCORE + ' and ' + d.maxScore + '. Be accurate.',
    ].join('\n');

    const resp = await fetch(base + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }], temperature: 0.5, max_tokens: 600 })
    });
    if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP ' + resp.status + ': ' + t.slice(0, 200)); }
    const result = await resp.json();
    return result?.choices?.[0]?.message?.content ?? '';
}

export function parseAnalyzeResponse(raw) {
    try {
        const cleaned = raw.replace(/```json\n?/gm, '').replace(/```\n?/gm, '').trim();
        const p = JSON.parse(cleaned);
        const validRT = Object.keys(RELATION_TYPES);
        return {
            suggestedScore: typeof p.suggestedScore === 'number' ? Math.round(p.suggestedScore) : null,
            relationType: validRT.includes(p.relationType) ? p.relationType : null,
            analysis: String(p.analysis || ''),
            reasoning: String(p.reasoning || ''),
            ok: true
        };
    } catch { return { suggestedScore: null, analysis: '', reasoning: '', ok: false }; }
}
