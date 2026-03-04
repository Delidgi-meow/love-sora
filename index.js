// ═══════════════════════════════════════════
// LOVE SCORE — точка входа
// ═══════════════════════════════════════════

import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { EXT_NAME, defaultSettings, RELATION_TYPES, MIN_SCORE } from './config.js';
import { cfg, loveData, addToLog, toast } from './state.js';
import { createWidget, refreshWidget, pulseWidget, flipWidget } from './heart.js';
import { updatePromptInjection } from './prompt.js';
import { settingsPanelHTML, bindMainEvents, syncUI, renderScoreLog, renderMilestones } from './ui.js';

// ─── Обработка сообщений ──────────────────────────────────────────────────────
function onMessageReceived() {
    if (!cfg().isEnabled) return;
    try {
        const chat = typeof SillyTavern?.getContext === 'function' ? SillyTavern.getContext().chat : window.chat;
        if (!chat?.length) return;
        const msg = chat[chat.length - 1];
        if (!msg || msg.is_user) return;
        const text = msg.mes || '';

        const d = loveData();

        // Счёт
        const sm = text.match(/<!--\s*\[LOVE_SCORE:(-?\d+)\]\s*-->/i);
        if (sm) {
            const c = cfg();
            let nv = parseInt(sm[1], 10), ov = d.score;
            if (c.gradualProgression) {
                const sbDelta = nv - ov;
                const sbRule = (d.scoreChanges || []).find(r => r.delta === sbDelta && r.description.trim());
                if (!sbRule) {
                    const md = 2;
                    nv = Math.max(ov - md, Math.min(ov + md, nv));
                }
            }
            d.score = Math.max(MIN_SCORE, Math.min(nv, d.maxScore));
            const delta = d.score - ov;
            if (delta !== 0) {
                const mr = (d.scoreChanges || []).find(r => r.delta === delta && r.description.trim());
                addToLog(d, delta, mr?.description?.slice(0, 35) || '');
                const crossed = (ov >= 0 && d.score < 0) || (ov < 0 && d.score >= 0);
                if (crossed) flipWidget(); else pulseWidget();
            }
            refreshWidget(); syncUI(); renderScoreLog();
        }

        // Вехи
        const msm = [...text.matchAll(/<!--\s*\[MILESTONE:(\d+)\]\s*-->/gi)];
        msm.forEach(mm => {
            const thr = parseInt(mm[1], 10);
            const ms = (d.milestones || []).find(m => m.threshold === thr && !m.done);
            if (ms) {
                ms.done = true;
                toast('success', 'Событие: ' + ms.description.slice(0, 55));
                renderMilestones();
            }
        });

        // Тип отношений
        const rtm = text.match(/<!--\s*\[RELATION_TYPE:([\w]+)\]\s*-->/i);
        if (rtm) {
            const key = rtm[1].toLowerCase();
            if (RELATION_TYPES[key] && key !== d.relationType) {
                d.relationType = key;
                toast('info', 'Тип отношений: ' + RELATION_TYPES[key].label);
                syncUI();
            }
        }

        saveSettingsDebounced();
        updatePromptInjection();
    } catch (e) { toast('error', 'Ошибка: ' + e.message); }
}

// ─── Инициализация ────────────────────────────────────────────────────────────
jQuery(() => {
    try {
        // Настройки по умолчанию
        if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = structuredClone(defaultSettings);
        const c = cfg();
        for (const [k, v] of Object.entries(defaultSettings)) {
            if (c[k] === undefined) c[k] = structuredClone(v);
        }
        if (c.isEnabled === false && !c._wasManuallyDisabled) c.isEnabled = true;
        if (c.widgetPos && c.widgetPos.top == null) c.widgetPos = null;
        if (!c.presets) c.presets = [];

        // UI
        $('#extensions_settings').append(settingsPanelHTML());
        createWidget();
        bindMainEvents();
        syncUI();
        updatePromptInjection();

        // События ST
        eventSource.on(event_types.MESSAGE_SENT, () => updatePromptInjection());
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

        if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
                cfg().lastCheckedMessageId = null;
                // Сброс UI анализа
                const ar = document.getElementById('ls-analyze-result');
                if (ar) { ar.style.display = 'none'; ar.innerHTML = ''; }
                const as = document.getElementById('ls-analyze-status');
                if (as) as.textContent = '';
                const ti = document.getElementById('ls-type-info');
                if (ti) { ti.style.display = 'none'; ti.dataset.showing = ''; }
                syncUI();
                updatePromptInjection();
            });
        }

        console.log('[LoveScore] v2.0.0 initialized — modular + lorebook + blur heart');
    } catch (e) {
        toast('error', 'Love Score: ошибка инициализации — ' + e.message);
    }
});
