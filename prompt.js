// ═══════════════════════════════════════════
// PROMPT — промпт-инъекция + лорбук + карта
// ═══════════════════════════════════════════

import { setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { PROMPT_KEY, MIN_SCORE, RELATION_TYPES } from './config.js';
import { cfg, loveData, getActiveInterp, getPendingMilestones, toast } from './state.js';

// ─── Лорбук ───────────────────────────────────────────────────────────────────
function getLorebookEntries() {
    try {
        const ctx = SillyTavern?.getContext?.();
        if (!ctx) return [];

        const entries = [];

        // Character lorebook (embedded in card)
        const charBook = ctx.characters?.[ctx.characterId]?.data?.character_book?.entries;
        if (Array.isArray(charBook)) {
            charBook.forEach(e => {
                if (e.enabled !== false && e.content?.trim()) {
                    entries.push({
                        source: 'character',
                        keys: Array.isArray(e.keys) ? e.keys : (e.key || '').split(',').map(k => k.trim()),
                        content: e.content.trim(),
                        name: e.comment || e.name || ''
                    });
                }
            });
        }

        // World Info entries
        if (ctx.worldInfoData) {
            const wiEntries = ctx.worldInfoData.entries || ctx.worldInfoData;
            const arr = Array.isArray(wiEntries) ? wiEntries : Object.values(wiEntries || {});
            arr.forEach(e => {
                if (e.disable === true || e.enabled === false) return;
                if (!e.content?.trim()) return;
                entries.push({
                    source: 'world',
                    keys: Array.isArray(e.key) ? e.key : (e.key || '').split(',').map(k => k.trim()),
                    content: e.content.trim(),
                    name: e.comment || e.uid || ''
                });
            });
        }

        return entries;
    } catch (e) {
        console.warn('[LoveScore] Failed to read lorebook:', e);
        return [];
    }
}

// ─── Персонаж ─────────────────────────────────────────────────────────────────
export function getCurrentCharacterCard() {
    try {
        const ctx = SillyTavern?.getContext?.();
        if (!ctx) return null;
        if (ctx.characterId !== undefined && Array.isArray(ctx.characters))
            return ctx.characters[ctx.characterId] ?? null;
        if (Array.isArray(ctx.characters) && ctx.characters.length > 0)
            return ctx.characters[0];
    } catch {}
    return null;
}

export function getCharacterAvatarUrl(char) {
    if (!char) return null;
    const av = char.avatar || (char.data && char.data.avatar);
    if (!av || av === 'none') return null;
    return '/characters/' + av;
}

export function buildCharacterCardText(char) {
    if (!char) return '';
    const parts = [];
    const s = v => (typeof v === 'string' && v.trim()) ? v.trim() : null;

    if (s(char.name)) parts.push('Name: ' + char.name.trim());
    if (s(char.description)) parts.push('Description:\n' + char.description.trim());
    if (s(char.personality)) parts.push('Personality:\n' + char.personality.trim());
    if (s(char.scenario)) parts.push('Scenario:\n' + char.scenario.trim());
    if (s(char.mes_example)) parts.push('Example dialogue:\n' + char.mes_example.trim());

    const d = char.data;
    if (d) {
        if (s(d.description) && d.description !== char.description) parts.push('Description:\n' + d.description.trim());
        if (s(d.personality) && d.personality !== char.personality) parts.push('Personality:\n' + d.personality.trim());
        if (s(d.scenario) && d.scenario !== char.scenario) parts.push('Scenario:\n' + d.scenario.trim());
        if (s(d.character_note)) parts.push('Creator notes:\n' + d.character_note.trim());
        if (Array.isArray(d.tags) && d.tags.length) parts.push('Tags: ' + d.tags.join(', '));
    }

    // Lorebook entries
    const lore = getLorebookEntries();
    if (lore.length > 0) {
        const loreTexts = lore.map(e => {
            const label = e.name ? `[${e.name}]` : `[${e.keys.slice(0, 3).join(', ')}]`;
            return `${label}: ${e.content.slice(0, 500)}`;
        });
        parts.push('Lorebook entries:\n' + loreTexts.join('\n\n'));
    }

    return parts.join('\n\n');
}

// ─── Чат-история ──────────────────────────────────────────────────────────────
export function getChatHistory(n) {
    try {
        const ctx = SillyTavern?.getContext?.();
        if (!ctx?.chat?.length) return '';
        const msgs = n > 0 ? ctx.chat.slice(-n) : ctx.chat;
        const charName = getCurrentCharacterCard()?.name || 'Персонаж';
        return msgs.map(m => {
            const who = m.is_user ? 'Игрок' : charName;
            return who + ': ' + (m.mes || '').trim().slice(0, 500);
        }).join('\n\n');
    } catch { return ''; }
}

// ─── Промпт ───────────────────────────────────────────────────────────────────
function buildPrompt() {
    const c = cfg(), d = loveData();
    if (!c.isEnabled) return '';

    const changes = (d.scoreChanges || []).filter(x => x.description.trim());
    const interps = (d.scaleInterpretations || []).filter(x => x.description.trim());
    const active = getActiveInterp();
    const pending = getPendingMilestones();

    let p = '[OOC - LOVE SCORE SYSTEM]\n\nCurrent love score: ' + d.score + ' (range: ' + MIN_SCORE + ' to ' + d.maxScore + ').';

    if (d.score < 0) {
        p += '\nNEGATIVE ZONE: character feels hostility, distrust or hatred toward the player.';
    }

    if (active?.description?.trim()) {
        p += '\n\nCURRENT BEHAVIOR (score ' + d.score + '):\n' + active.description.trim();
        p += '\n\nPortray the character strictly according to this description.';
    }

    if (pending.length > 0) {
        p += '\n\nROMANTIC EVENTS — YOU MUST INITIATE ALL OF THESE (naturally, within this or the next response):';
        pending.forEach(m => { p += '\n- ' + m.description.trim() + ' (unlocked at score ' + m.threshold + ')'; });
        p += '\nAfter completing each event, include at the very end: <!-- [MILESTONE:threshold] --> for each completed one.';
    }

    if (changes.length) {
        p += '\n\nLove Score Changes:';
        changes.forEach(x => { p += '\n' + (x.delta >= 0 ? '+' : '') + x.delta + ': ' + x.description.trim(); });
    }

    if (interps.length) {
        p += '\n\nLove Scale:';
        interps.forEach(x => {
            p += '\n' + x.min + ' to ' + x.max + ': ' + x.description.trim();
            if (d.score >= x.min && d.score <= x.max) p += ' <- NOW';
        });
    }

    if (c.gradualProgression) {
        p += '\n\nSlowBurn RULE: Allowed score changes per response: -2, -1, 0, +1, +2. Default is 0, use ±1 for noticeable moments, ±2 for significant ones. EXCEPTION: If the change delta matches a configured Score Change rule, its full delta is applied regardless.';
    }

    const rtKeys = Object.keys(RELATION_TYPES).join('|');
    if (d.relationType === 'neutral' || !d.relationType) {
        p += '\n\nOnce the relationship type becomes evident, add once: <!-- [RELATION_TYPE:key] --> where key is one of: ' + rtKeys + '.';
    } else {
        p += '\n\nIf relationship type changes, update with: <!-- [RELATION_TYPE:key] --> (' + rtKeys + ').';
    }

    p += '\n\nAt the end of each response include: <!-- [LOVE_SCORE:X] --> replacing X with the updated score (' + MIN_SCORE + ' to ' + d.maxScore + ').';

    return p;
}

export function updatePromptInjection() {
    try {
        setExtensionPrompt(PROMPT_KEY, cfg().isEnabled ? buildPrompt() : '', extension_prompt_types.IN_CHAT, 0);
    } catch (e) {
        toast('error', 'Ошибка промпта: ' + e.message);
    }
}
