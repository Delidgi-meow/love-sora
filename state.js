// ═══════════════════════════════════════════
// STATE — доступ к настройкам и данным
// ═══════════════════════════════════════════

import { extension_settings } from '../../../extensions.js';
import { EXT_NAME, defaultLoveData, MIN_SCORE } from './config.js';

export const cfg = () => extension_settings[EXT_NAME];

export function getChatId() {
    try {
        const x = SillyTavern?.getContext?.() ?? {};
        return x.chatId ?? x.chat_metadata?.chat_id ?? '__global__';
    } catch { return '__global__'; }
}

function ensureFields(d) {
    const mk = defaultLoveData();
    if (!d.scoreChanges) d.scoreChanges = mk.scoreChanges;
    if (!d.scaleInterpretations) d.scaleInterpretations = mk.scaleInterpretations;
    if (!d.milestones) d.milestones = mk.milestones;
    if (!d.scoreLog) d.scoreLog = [];
    if (d.maxScore == null) d.maxScore = mk.maxScore;
    if (!d.relationType) d.relationType = 'neutral';
    return d;
}

export function loveData() {
    const c = cfg();
    if (!c.chatLoveData) c.chatLoveData = {};
    const id = getChatId();
    if (!c.chatLoveData[id]) c.chatLoveData[id] = defaultLoveData();
    return ensureFields(c.chatLoveData[id]);
}

export function getActiveInterp() {
    const d = loveData();
    return (d.scaleInterpretations || []).find(ip => d.score >= ip.min && d.score <= ip.max) ?? null;
}

export function getPendingMilestones() {
    const d = loveData();
    return (d.milestones || []).filter(m => !m.done && d.score >= m.threshold);
}

export function addToLog(d, delta, reason) {
    if (!d.scoreLog) d.scoreLog = [];
    const sign = delta >= 0 ? '+' : '';
    d.scoreLog.unshift({ delta, sign: sign + delta, reason: reason || '' });
    if (d.scoreLog.length > 15) d.scoreLog.length = 15;
}

export function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toast(type, msg) {
    try { if (typeof toastr !== 'undefined') toastr[type]?.(msg, 'Love Score', { timeOut: 2300, positionClass: 'toast-top-center' }); } catch {}
}

export function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }
