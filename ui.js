// ═══════════════════════════════════════════
// UI — панель настроек, рендер, события
// ═══════════════════════════════════════════

import { saveSettingsDebounced } from '../../../../script.js';
import { RELATION_TYPES, MIN_SCORE } from './config.js';
import { cfg, loveData, addToLog, escHtml, toast, getActiveInterp } from './state.js';
import { refreshWidget, pulseWidget, applyWidgetSize } from './heart.js';
import { updatePromptInjection, getCurrentCharacterCard, getCharacterAvatarUrl, buildCharacterCardText, getChatHistory } from './prompt.js';
import { fetchModels, generateRules, parseGenerateResponse, analyzeChat, parseAnalyzeResponse } from './ai.js';

const $ = jQuery;

// ─── Пресеты (упрощённые) ─────────────────────────────────────────────────────
function snapshotData(name) {
    const d = loveData();
    return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name,
        createdAt: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        maxScore: d.maxScore,
        scoreChanges: JSON.parse(JSON.stringify(d.scoreChanges || [])),
        scaleInterpretations: JSON.parse(JSON.stringify(d.scaleInterpretations || [])),
        milestones: JSON.parse(JSON.stringify((d.milestones || []).map(m => ({ ...m, done: false }))))
    };
}

function savePreset(name) {
    if (!name.trim()) { toast('warning', 'Введи название пресета'); return; }
    const c = cfg();
    if (!c.presets) c.presets = [];
    const existing = c.presets.findIndex(p => p.name === name.trim());
    const snap = snapshotData(name.trim());
    if (existing >= 0) c.presets[existing] = snap; else c.presets.push(snap);
    saveSettingsDebounced();
    toast('success', 'Пресет сохранён');
    renderPresets();
}

function loadPreset(src) {
    const d = loveData();
    d.scoreChanges = JSON.parse(JSON.stringify(src.scoreChanges || []));
    d.scaleInterpretations = JSON.parse(JSON.stringify(src.scaleInterpretations || []));
    d.milestones = JSON.parse(JSON.stringify(src.milestones || []));
    if (src.maxScore) { d.maxScore = src.maxScore; cfg().maxScore = src.maxScore; }
    saveSettingsDebounced(); updatePromptInjection(); syncUI();
    toast('success', 'Пресет «' + src.name + '» загружен');
}

export function autoSnapshot(reason) {
    const c = cfg();
    if (!c.presets) c.presets = [];
    const autoSnaps = c.presets.filter(p => p.name.startsWith('🔄'));
    if (autoSnaps.length >= 5) c.presets.splice(c.presets.indexOf(autoSnaps[0]), 1);
    c.presets.push(snapshotData('🔄 ' + reason + ' ' + new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })));
    saveSettingsDebounced();
}

function exportPresetJSON(src) {
    const blob = new Blob([JSON.stringify(src, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ls-preset-' + (src.name || 'preset').replace(/[^a-zа-яё0-9_-]/gi, '_').slice(0, 40) + '.json';
    a.click(); URL.revokeObjectURL(a.href);
}

function importPresetJSON(json) {
    try {
        const src = JSON.parse(json.trim());
        if (!src.name) src.name = 'Импорт ' + new Date().toLocaleTimeString('ru-RU');
        if (!src.id) src.id = Date.now().toString(36);
        const c = cfg();
        if (!c.presets) c.presets = [];
        c.presets.push(src);
        saveSettingsDebounced(); renderPresets();
        toast('success', 'Пресет импортирован');
    } catch (e) { toast('error', 'Неверный JSON: ' + e.message); }
}

// ─── HTML панели ──────────────────────────────────────────────────────────────
function accordion(id, title, icon, content, open = false) {
    return `<div class="inline-drawer" id="${id}">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b><i class="fa-solid ${icon}" style="margin-right:6px;opacity:.5"></i>${title}</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content"${open ? '' : ' style="display:none"'}>${content}</div>
    </div>`;
}

function heartSvgMini(rt) {
    return `<svg viewBox="0 0 20 16" width="18" height="14" style="display:block;fill:currentColor;${rt === 'hostile' ? 'transform:rotate(180deg);' : ''}"><path d="M10,15.5 C10,15.5 1,9.5 1,4.5 C1,2 3,0.5 5.5,0.5 C7.5,0.5 9.2,2 10,3.5 C10.8,2 12.5,0.5 14.5,0.5 C17,0.5 19,2 19,4.5 C19,9.5 10,15.5 10,15.5Z"/></svg>`;
}

export function settingsPanelHTML() {
    const c = cfg();

    // ── Основное ──
    const mainContent = `
        <div class="ls-row"><label class="checkbox_label" for="ls-enabled"><input type="checkbox" id="ls-enabled"><span>Включено</span></label></div>
        <div class="ls-row">
            <span style="font-size:12px;opacity:.6;">Очки:</span>
            <input id="ls-val" type="number" class="ls-num-input" style="width:72px;">
            <span style="opacity:.3;">/</span>
            <input id="ls-max" type="number" min="1" class="ls-num-input" style="width:72px;">
            <button id="ls-reset-btn" class="menu_button">Сброс</button>
        </div>
        <div class="ls-rel-type-row">
            ${Object.entries(RELATION_TYPES).map(([k, v]) =>
                `<span class="ls-rel-type-btn ls-rt-${k}" data-rt="${k}" title="${v.label}">${heartSvgMini(k)}</span>`
            ).join('')}
            <span style="font-size:11px;opacity:.45;margin-left:4px;" id="ls-rt-label"></span>
        </div>
        <div id="ls-type-info"></div>
        <div id="ls-active-state" style="display:none;"><strong>Сейчас:</strong> <span id="ls-active-text"></span></div>
        <div class="ls-row">
            <span style="font-size:12px;opacity:.6;">Размер:</span>
            <input type="range" id="ls-size" min="36" max="128" step="4" class="ls-size-slider" style="flex:1">
            <span id="ls-size-label" style="font-size:12px;min-width:36px;text-align:right;opacity:.5;">64px</span>
            <button id="ls-reset-pos" class="menu_button" title="Вернуть в угол">Позиция</button>
        </div>
        <div class="ls-row"><label class="checkbox_label" for="ls-gradual"><input type="checkbox" id="ls-gradual"><span>SlowBurn (±2 макс за ответ)</span></label></div>
        <div class="ls-section-title" style="display:flex;align-items:center;justify-content:space-between;">История <button id="ls-log-clear" class="menu_button ls-log-clear">очистить</button></div>
        <div id="ls-score-log"></div>`;

    // ── Правила ──
    const rulesContent = `
        <div class="ls-section-title" style="margin-top:0">Правила изменения</div>
        <div class="ls-hint">За что растут и падают очки.</div>
        <div id="ls-changes-container"></div>
        <div class="ls-section-title">Поведение по диапазонам</div>
        <div class="ls-hint">Как ведёт себя персонаж при разном счёте.</div>
        <div id="ls-interp-container"></div>
        <div class="ls-section-title">Романтические события</div>
        <div class="ls-hint">При достижении порога персонаж инициирует событие.</div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:6px;">
            <button id="ls-milestone-reset-all" class="menu_button">Сбросить все</button>
        </div>
        <div id="ls-milestones-container"></div>`;

    // ── AI ──
    const curModel = escHtml(c.genModel || '');
    const curEndpoint = escHtml(c.genEndpoint || '');
    const curKey = escHtml(c.genApiKey || '');
    const curNotes = escHtml(c.genUserNotes || '');

    const aiContent = `
        <label class="ls-api-label">Endpoint</label>
        <input id="ls-gen-endpoint" class="ls-api-field" type="text" placeholder="https://api.example.com/v1" value="${curEndpoint}">
        <label class="ls-api-label">API Key</label>
        <input id="ls-gen-apikey" class="ls-api-field" type="password" placeholder="sk-..." value="${curKey}">
        <label class="ls-api-label">Модель</label>
        <div class="ls-model-row">
            <select id="ls-gen-model-select">${curModel ? `<option value="${curModel}" selected>${curModel}</option>` : '<option value="">-- нажми обновить --</option>'}</select>
            <button id="ls-refresh-models" class="menu_button ls-refresh-btn" title="Загрузить"><i class="fa-solid fa-sync"></i></button>
        </div>
        <label class="ls-api-label">Особые пожелания</label>
        <textarea id="ls-gen-notes" class="ls-api-field" rows="2" placeholder="Например: не добавляй события про брак..." style="resize:vertical;font-family:inherit;font-size:12px;line-height:1.5;">${curNotes}</textarea>
        <div style="font-size:11px;color:var(--SmartThemeBodyColor,#aaa);opacity:.45;margin:8px 0 0;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">Персонаж</div>
        <div id="ls-char-preview"><img id="ls-char-avatar" class="ls-hidden" src="" alt=""><span id="ls-char-avatar-name" style="font-size:12px;opacity:.6;"></span></div>
        <div class="ls-row" style="margin-bottom:6px;gap:6px;">
            <span style="font-size:12px;opacity:.6;white-space:nowrap">Сообщений:</span>
            <input type="number" id="ls-gen-msg-count" class="ls-num-input" min="0" max="200" style="width:60px" value="${c.chatAnalysisMsgCount || 20}">
            <span style="font-size:10px;opacity:.35">0 = без истории</span>
        </div>
        <button id="ls-gen-btn" class="menu_button" style="width:100%">Сгенерировать правила</button>
        <div id="ls-gen-status" style="font-size:11px;opacity:.6;margin-top:5px;min-height:14px;"></div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color,rgba(255,255,255,.08));">
            <div class="ls-section-title" style="margin-top:0">Анализ чата</div>
            <div class="ls-hint">ИИ читает историю и предлагает счёт</div>
            <button id="ls-analyze-btn" class="menu_button" style="width:100%"><i class="fa-solid fa-chart-line"></i> Анализировать</button>
            <div id="ls-analyze-status" style="font-size:11px;opacity:.6;margin-top:5px;min-height:14px;"></div>
            <div id="ls-analyze-result"></div>
        </div>`;

    // ── Пресеты ──
    const presetsContent = `
        <div class="ls-hint">Сохраняй и загружай наборы правил.</div>
        <div class="ls-row">
            <input type="text" id="ls-preset-name-input" class="ls-api-field" style="flex:1;" placeholder="Название...">
            <button id="ls-preset-save" class="menu_button">Сохранить</button>
        </div>
        <div class="ls-row">
            <button id="ls-preset-import-btn" class="menu_button"><i class="fa-solid fa-folder-open"></i> Импорт JSON</button>
            <input type="file" id="ls-preset-file" accept=".json" style="display:none;">
        </div>
        <div id="ls-preset-list"></div>`;

    return `<div id="ls-settings-panel" class="extension-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>❤ Love Score</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                ${accordion('ls-acc-main', 'Основное', 'fa-heart', mainContent, true)}
                ${accordion('ls-acc-rules', 'Правила', 'fa-list-check', rulesContent)}
                ${accordion('ls-acc-ai', 'AI генерация', 'fa-robot', aiContent)}
                ${accordion('ls-acc-presets', 'Пресеты', 'fa-bookmark', presetsContent)}
            </div>
        </div>
    </div>`;
}

// ─── Рендеры ──────────────────────────────────────────────────────────────────
export function renderChanges() {
    const ct = document.getElementById('ls-changes-container'); if (!ct) return;
    const arr = loveData().scoreChanges || [];
    let html = '';
    arr.forEach((c, i) => {
        const pos = c.delta >= 0, cls = pos ? 'ls-card-pos' : 'ls-card-neg';
        const icon = pos ? '<i class="fa-solid fa-heart ls-heart-icon ls-icon-pos"></i>' : '<i class="fa-solid fa-heart-crack ls-heart-icon ls-icon-neg"></i>';
        const ph = pos ? 'При каких условиях растёт...' : 'При каких условиях падает...';
        html += `<div class="ls-card ${cls}" data-idx="${i}">
            <div class="ls-heart-box">${icon}
            <input type="number" class="ls-delta-input ls-num-input" value="${c.delta}" data-idx="${i}" style="width:56px;font-weight:600;"></div>
            <textarea class="ls-change-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="${ph}">${escHtml(c.description)}</textarea>
            <button class="ls-del-change menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
        </div>`;
    });
    html += '<button id="ls-add-change" class="menu_button ls-add-btn">+ Правило</button>';
    ct.innerHTML = html;
    bindChanges();
}

export function renderInterps() {
    const ct = document.getElementById('ls-interp-container'); if (!ct) return;
    const d = loveData(), arr = d.scaleInterpretations || [];
    let html = '';
    arr.forEach((ip, i) => {
        const act = d.score >= ip.min && d.score <= ip.max, isNeg = ip.max < 0;
        const bst = act ? (isNeg ? 'border-color:rgba(80,200,0,.7);' : 'border-color:rgba(180,100,120,.6);') : '';
        const cls = isNeg ? 'ls-card-neg' : 'ls-card-neu';
        const lbl = act ? '▶ активно' : (isNeg ? '☠ негатив' : 'диапазон');
        html += `<div class="ls-card ${cls}" data-idx="${i}" style="${bst}">
            <div class="ls-range-box"><span class="ls-range-label">${lbl}</span>
            <div class="ls-range-inner">
                <input type="number" class="ls-interp-min ls-range-input" value="${ip.min}" data-idx="${i}">
                <span class="ls-range-sep">—</span>
                <input type="number" class="ls-interp-max ls-range-input" value="${ip.max}" data-idx="${i}">
            </div></div>
            <textarea class="ls-interp-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="Описание поведения...">${escHtml(ip.description)}</textarea>
            <button class="ls-del-interp menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
        </div>`;
    });
    html += '<button id="ls-add-interp" class="menu_button ls-add-btn">+ Диапазон</button>';
    ct.innerHTML = html;

    const act = getActiveInterp(), box = document.getElementById('ls-active-state'), txt = document.getElementById('ls-active-text');
    if (box && txt) {
        if (act?.description?.trim()) { txt.textContent = act.description.trim(); box.style.display = 'block'; }
        else box.style.display = 'none';
    }
    bindInterps();
}

export function renderMilestones() {
    const ct = document.getElementById('ls-milestones-container'); if (!ct) return;
    const d = loveData(), arr = d.milestones || [];
    let html = '';
    arr.forEach((m, i) => {
        const reached = d.score >= m.threshold, dc = m.done ? ' ls-done' : '';
        const rs = reached && !m.done ? 'border-color:rgba(200,160,80,.65);' : '';
        const st = m.done ? 'выполнено' : (reached ? 'пора!' : 'ждёт');
        const sc = (!m.done && reached) ? ' ls-status-due' : '';
        html += `<div class="ls-card ls-card-milestone${dc}" data-idx="${i}" style="${rs}">
            <div class="ls-milestone-left">
                <div class="ls-milestone-threshold-wrap">
                    <span class="ls-milestone-threshold-label">от</span>
                    <input type="number" class="ls-milestone-thr ls-num-input" value="${m.threshold}" data-idx="${i}" min="0" style="width:56px;">
                </div>
                <input type="checkbox" class="ls-milestone-done-cb" data-idx="${i}" ${m.done ? 'checked' : ''}>
                <span class="ls-milestone-status${sc}">${st}</span>
            </div>
            <textarea class="ls-milestone-desc ls-textarea-field" data-idx="${i}" rows="3" placeholder="Что должен сделать...">${escHtml(m.description)}</textarea>
            <button class="ls-del-milestone menu_button ls-del-btn" data-idx="${i}"><i class="fa-solid fa-times"></i></button>
        </div>`;
    });
    html += '<button id="ls-add-milestone" class="menu_button ls-add-btn">+ Событие</button>';
    ct.innerHTML = html;
    bindMilestones();
}

export function renderScoreLog() {
    const ct = document.getElementById('ls-score-log'); if (!ct) return;
    const log = loveData().scoreLog || [];
    if (!log.length) { ct.innerHTML = '<div style="font-size:11px;opacity:.3;padding:5px 6px;">Пока пусто</div>'; return; }
    ct.innerHTML = log.map(e => {
        const pos = e.delta > 0, neg = e.delta < 0;
        const dc = pos ? '#6ee86e' : neg ? '#ff6b6b' : '#b0b0b0';
        const bg = pos ? 'rgba(80,200,80,.07)' : neg ? 'rgba(220,60,60,.07)' : 'rgba(180,180,180,.04)';
        const bc = pos ? 'rgba(100,220,100,.4)' : neg ? 'rgba(220,80,80,.4)' : 'rgba(160,160,160,.2)';
        const arr = pos ? '↑' : neg ? '↓' : '→';
        const sig = e.sign || (e.delta >= 0 ? '+' + e.delta : String(e.delta));
        return `<div class="ls-log-entry" style="background:${bg};border-left:3px solid ${bc};">
            <span class="ls-log-delta" style="color:${dc};">${arr}&thinsp;${escHtml(sig)}</span>
            ${(e.reason || '').trim()
                ? `<span class="ls-log-reason">${escHtml(e.reason)}</span>`
                : '<span style="font-size:11px;opacity:.25;font-style:italic;">—</span>'}
        </div>`;
    }).join('');
}

export function renderPresets() {
    const ct = document.getElementById('ls-preset-list'); if (!ct) return;
    const presets = cfg().presets || [];
    if (!presets.length) { ct.innerHTML = '<div style="font-size:11px;opacity:.3;padding:5px;">Нет пресетов</div>'; return; }
    ct.innerHTML = [...presets].reverse().map(p => {
        const isAuto = p.name.startsWith('🔄');
        return `<div class="ls-preset-row${isAuto ? ' ls-preset-snap' : ''}" style="${isAuto ? 'opacity:.6' : ''}">
            <div class="ls-preset-info"><div class="ls-preset-name">${escHtml(p.name)}</div><div class="ls-preset-meta">${escHtml(p.createdAt || '')}${p.maxScore ? ' · макс ' + p.maxScore : ''}</div></div>
            <div class="ls-preset-actions">
                <button class="menu_button ls-preset-btn ls-preset-load" data-id="${p.id}">Загрузить</button>
                <button class="menu_button ls-preset-btn ls-preset-export" data-id="${p.id}">JSON</button>
                <button class="menu_button ls-preset-btn ls-del-btn ls-preset-del" data-id="${p.id}">✕</button>
            </div>
        </div>`;
    }).join('');

    $(ct).off('click', '.ls-preset-load').on('click', '.ls-preset-load', function () {
        const id = $(this).data('id'), p = (cfg().presets || []).find(x => x.id === String(id));
        if (p) loadPreset(p);
    });
    $(ct).off('click', '.ls-preset-export').on('click', '.ls-preset-export', function () {
        const id = $(this).data('id'), p = (cfg().presets || []).find(x => x.id === String(id));
        if (p) exportPresetJSON(p);
    });
    $(ct).off('click', '.ls-preset-del').on('click', '.ls-preset-del', function () {
        const c = cfg();
        c.presets = (c.presets || []).filter(p => p.id !== String($(this).data('id')));
        saveSettingsDebounced(); renderPresets();
    });
}

function updateCharPreview(char) {
    const img = document.getElementById('ls-char-avatar'), name = document.getElementById('ls-char-avatar-name');
    if (!img || !name) return;
    const url = getCharacterAvatarUrl(char);
    if (url) { img.src = url; img.classList.remove('ls-hidden'); img.onerror = () => img.classList.add('ls-hidden'); }
    else { img.classList.add('ls-hidden'); img.src = ''; }
    name.textContent = char?.name || '';
}

// ─── Sync UI ──────────────────────────────────────────────────────────────────
export function syncUI() {
    const c = cfg(), d = loveData();
    const el = id => document.getElementById(id);

    const cb = el('ls-enabled'); if (cb) cb.checked = c.isEnabled;
    const v = el('ls-val'); if (v) v.value = d.score;
    const m = el('ls-max'); if (m) m.value = d.maxScore;
    const gr = el('ls-gradual'); if (gr) gr.checked = c.gradualProgression ?? true;
    const sz = el('ls-size'), lb = el('ls-size-label');
    if (sz) { sz.value = c.widgetSize || 64; if (lb) lb.textContent = (c.widgetSize || 64) + 'px'; }
    const nt = el('ls-gen-notes'); if (nt && document.activeElement !== nt) nt.value = c.genUserNotes || '';

    // Тип отношений
    const rt = d.relationType || 'neutral';
    document.querySelectorAll('.ls-rel-type-btn').forEach(b => {
        b.classList.toggle('ls-rt-active', b.dataset.rt === rt);
    });
    const rtl = el('ls-rt-label'); if (rtl) rtl.textContent = RELATION_TYPES[rt]?.label || '';

    updateCharPreview(getCurrentCharacterCard());
    renderChanges(); renderInterps(); renderMilestones(); renderScoreLog(); renderPresets(); refreshWidget();
}

// ─── Биндинги ─────────────────────────────────────────────────────────────────
function bindChanges() {
    $('.ls-delta-input').off('change').on('change', function () { loveData().scoreChanges[+$(this).data('idx')].delta = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderChanges(); });
    $('.ls-change-desc').off('input').on('input', function () { loveData().scoreChanges[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
    $('.ls-del-change').off('click').on('click', function () { loveData().scoreChanges.splice(+$(this).data('idx'), 1); saveSettingsDebounced(); updatePromptInjection(); renderChanges(); });
    $('#ls-add-change').off('click').on('click', () => { loveData().scoreChanges.push({ delta: 1, description: '' }); saveSettingsDebounced(); renderChanges(); });
}

function bindInterps() {
    $('.ls-interp-min').off('change').on('change', function () { loveData().scaleInterpretations[+$(this).data('idx')].min = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
    $('.ls-interp-max').off('change').on('change', function () { loveData().scaleInterpretations[+$(this).data('idx')].max = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
    $('.ls-interp-desc').off('input').on('input', function () { loveData().scaleInterpretations[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
    $('.ls-del-interp').off('click').on('click', function () { loveData().scaleInterpretations.splice(+$(this).data('idx'), 1); saveSettingsDebounced(); updatePromptInjection(); renderInterps(); });
    $('#ls-add-interp').off('click').on('click', () => { const a = loveData().scaleInterpretations, lm = a[a.length - 1]?.max ?? 0; a.push({ min: lm + 1, max: lm + 10, description: '' }); saveSettingsDebounced(); renderInterps(); });
}

function bindMilestones() {
    $('.ls-milestone-thr').off('change').on('change', function () { loveData().milestones[+$(this).data('idx')].threshold = parseInt(this.value) || 0; saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
    $('.ls-milestone-done-cb').off('change').on('change', function () { loveData().milestones[+$(this).data('idx')].done = this.checked; saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
    $('.ls-milestone-desc').off('input').on('input', function () { loveData().milestones[+$(this).data('idx')].description = this.value; saveSettingsDebounced(); updatePromptInjection(); });
    $('.ls-del-milestone').off('click').on('click', function () { loveData().milestones.splice(+$(this).data('idx'), 1); saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
    $('#ls-add-milestone').off('click').on('click', () => { const a = loveData().milestones, l = a[a.length - 1]?.threshold ?? 0; a.push({ threshold: l + 10, description: '', done: false }); saveSettingsDebounced(); renderMilestones(); });
    $('#ls-milestone-reset-all').off('click').on('click', () => { loveData().milestones.forEach(m => m.done = false); saveSettingsDebounced(); updatePromptInjection(); renderMilestones(); });
}

export function bindMainEvents() {
    $('#ls-enabled').off('change').on('change', function () { cfg().isEnabled = this.checked; saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); });

    $('#ls-val').off('change').on('change', function () {
        const d = loveData(), prev = d.score;
        d.score = Math.max(MIN_SCORE, Math.min(parseInt(this.value) || 0, d.maxScore));
        const delta = d.score - prev;
        if (delta !== 0) { addToLog(d, delta, 'вручную'); renderScoreLog(); }
        saveSettingsDebounced(); updatePromptInjection(); refreshWidget(); renderInterps(); renderMilestones();
    });

    $('#ls-max').off('change').on('change', function () {
        const d = loveData(), c = cfg();
        d.maxScore = Math.max(1, parseInt(this.value) || 100);
        c.maxScore = d.maxScore;
        if (d.score > d.maxScore) d.score = d.maxScore;
        saveSettingsDebounced(); updatePromptInjection(); refreshWidget();
    });

    $('#ls-reset-btn').off('click').on('click', () => { loveData().score = 0; saveSettingsDebounced(); pulseWidget(); syncUI(); updatePromptInjection(); });
    $('#ls-gradual').off('change').on('change', function () { cfg().gradualProgression = this.checked; saveSettingsDebounced(); updatePromptInjection(); });
    $(document).off('click', '#ls-log-clear').on('click', '#ls-log-clear', () => { loveData().scoreLog = []; saveSettingsDebounced(); renderScoreLog(); });

    // Размер / позиция
    $(document).off('input', '#ls-size').on('input', '#ls-size', function () {
        const sz = parseInt(this.value), lb = document.getElementById('ls-size-label');
        if (lb) lb.textContent = sz + 'px';
        applyWidgetSize(sz); cfg().widgetSize = sz; saveSettingsDebounced();
    });
    $(document).off('click', '#ls-reset-pos').on('click', '#ls-reset-pos', () => {
        cfg().widgetPos = null; saveSettingsDebounced();
        const w = document.getElementById('ls-widget');
        if (w) { w.style.top = '100px'; w.style.bottom = 'auto'; w.style.left = '18px'; w.style.right = 'auto'; }
    });

    // Тип отношений
    $(document).off('click', '.ls-rel-type-btn').on('click', '.ls-rel-type-btn', function () {
        const k = this.dataset.rt, t = RELATION_TYPES[k], info = document.getElementById('ls-type-info');
        if (!info || !t) return;
        // Toggle info display
        if (info.dataset.showing === k) { info.style.display = 'none'; info.dataset.showing = ''; return; }
        info.dataset.showing = k;
        info.innerHTML = `<span style="color:${t.color};font-weight:600;">${escHtml(t.label)}</span> — <span style="opacity:.7;">${escHtml(t.desc)}</span>
            <button class="menu_button" style="margin-top:6px;width:100%;font-size:11px;" id="ls-set-rt" data-rt="${k}">Установить тип</button>`;
        info.style.display = 'block';
        document.getElementById('ls-set-rt')?.addEventListener('click', function () {
            loveData().relationType = this.dataset.rt;
            saveSettingsDebounced(); syncUI(); pulseWidget();
            toast('success', 'Тип: ' + RELATION_TYPES[this.dataset.rt]?.label);
        });
    });

    // AI
    $(document).off('input', '#ls-gen-endpoint').on('input', '#ls-gen-endpoint', function () { cfg().genEndpoint = this.value; saveSettingsDebounced(); });
    $(document).off('input', '#ls-gen-apikey').on('input', '#ls-gen-apikey', function () { cfg().genApiKey = this.value; saveSettingsDebounced(); });
    $(document).off('input', '#ls-gen-notes').on('input', '#ls-gen-notes', function () { cfg().genUserNotes = this.value; saveSettingsDebounced(); });
    $(document).off('change', '#ls-gen-model-select').on('change', '#ls-gen-model-select', function () { cfg().genModel = this.value; saveSettingsDebounced(); });
    $(document).off('change', '#ls-gen-msg-count').on('change', '#ls-gen-msg-count', function () { cfg().chatAnalysisMsgCount = parseInt(this.value) || 0; saveSettingsDebounced(); });
    $(document).off('click', '#ls-refresh-models').on('click', '#ls-refresh-models', onRefreshModels);
    $(document).off('click', '#ls-gen-btn').on('click', '#ls-gen-btn', onGenerate);
    $(document).off('click', '#ls-analyze-btn').on('click', '#ls-analyze-btn', onAnalyze);

    // Пресеты
    $(document).off('click', '#ls-preset-save').on('click', '#ls-preset-save', () => {
        const inp = document.getElementById('ls-preset-name-input');
        savePreset(inp?.value || ''); if (inp) inp.value = '';
    });
    $(document).off('click', '#ls-preset-import-btn').on('click', '#ls-preset-import-btn', () => {
        document.getElementById('ls-preset-file')?.click();
    });
    $(document).off('change', '#ls-preset-file').on('change', '#ls-preset-file', function () {
        const file = this.files?.[0]; if (!file) return;
        const r = new FileReader();
        r.onload = e => { importPresetJSON(e.target.result); this.value = ''; };
        r.readAsText(file, 'utf-8');
    });
}

// ─── AI обработчики ───────────────────────────────────────────────────────────
async function onRefreshModels() {
    const btn = document.getElementById('ls-refresh-models'), sel = document.getElementById('ls-gen-model-select');
    if (!btn || !sel) return;
    btn.classList.add('ls-loading');
    try {
        const models = await fetchModels(), current = cfg().genModel;
        sel.innerHTML = '<option value="">-- выбери модель --</option>';
        models.forEach(id => { const opt = document.createElement('option'); opt.value = id; opt.textContent = id; if (id === current) opt.selected = true; sel.appendChild(opt); });
        if (!models.length) toast('warning', 'Список пуст'); else toast('success', 'Загружено: ' + models.length);
    } catch (e) { toast('error', e.message); }
    finally { btn.classList.remove('ls-loading'); }
}

async function onGenerate() {
    const btn = document.getElementById('ls-gen-btn'), status = document.getElementById('ls-gen-status');
    if (!btn || !status) return;
    btn.disabled = true; btn.textContent = 'Генерирую...'; status.textContent = 'Запрос к API...';
    try {
        autoSnapshot('До генерации');
        const char = getCurrentCharacterCard();
        if (!char) { status.textContent = 'Нет персонажа.'; return; }
        const cardText = buildCharacterCardText(char);
        if (!cardText.trim()) { status.textContent = 'Пустая карта.'; return; }
        const n = parseInt(cfg().chatAnalysisMsgCount ?? 0);
        const history = n > 0 ? getChatHistory(n) : '';
        status.textContent = history ? 'Читаю ' + n + ' сообщ...' : 'Читаю карту...';
        const raw = await generateRules(cardText, history);
        const parsed = parseGenerateResponse(raw);
        if (!parsed.ok) { status.textContent = 'Ошибка: ' + raw.slice(0, 120); return; }
        const d = loveData();
        if (parsed.changes.length) d.scoreChanges = parsed.changes;
        if (parsed.ranges.length) d.scaleInterpretations = parsed.ranges;
        if (parsed.milestones.length) d.milestones = parsed.milestones;
        if (parsed.suggestedMax && parsed.suggestedMax !== d.maxScore) {
            d.maxScore = parsed.suggestedMax; cfg().maxScore = parsed.suggestedMax;
        }
        saveSettingsDebounced(); updatePromptInjection(); syncUI();
        status.textContent = 'Готово! Правил: ' + parsed.changes.length + ', диапазонов: ' + parsed.ranges.length;
        toast('success', 'Сгенерировано для ' + (char.name || 'персонаж'));
    } catch (e) { status.textContent = e.message; toast('error', e.message); }
    finally { btn.disabled = false; btn.textContent = 'Сгенерировать правила'; }
}

async function onAnalyze() {
    const btn = document.getElementById('ls-analyze-btn'), status = document.getElementById('ls-analyze-status'), result = document.getElementById('ls-analyze-result');
    if (!btn || !status) return;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Анализирую...';
    status.textContent = 'Запрос к API...';
    if (result) result.style.display = 'none';
    try {
        const char = getCurrentCharacterCard();
        if (!char) { status.textContent = 'Нет персонажа.'; return; }
        const cardText = buildCharacterCardText(char);
        const n = parseInt(cfg().chatAnalysisMsgCount ?? 20);
        const history = getChatHistory(n);
        if (!history.trim()) { status.textContent = 'Нет сообщений.'; return; }
        const raw = await analyzeChat(cardText, history);
        const parsed = parseAnalyzeResponse(raw);
        if (!parsed.ok || parsed.suggestedScore === null) { status.textContent = raw.slice(0, 150); return; }
        status.textContent = '';
        if (result) {
            const d = loveData(), diff = parsed.suggestedScore - d.score;
            const rtInfo = parsed.relationType ? RELATION_TYPES[parsed.relationType] : null;
            result.style.display = 'block';
            result.innerHTML = `
                <div class="ls-analyze-score">Рекомендация: <strong>${parsed.suggestedScore}</strong>
                    <span style="opacity:.5;font-size:11px;margin-left:6px">(сейчас ${d.score}, ${diff !== 0 ? (diff > 0 ? '+' : '') + diff : 'без изменений'})</span>
                </div>
                ${rtInfo ? `<div style="display:flex;align-items:center;gap:6px;margin:4px 0 8px;">
                    <span style="color:${rtInfo.color};font-size:16px;">♥</span>
                    <span style="font-size:12px;opacity:.8;">${escHtml(rtInfo.label)}</span>
                    <button class="menu_button" style="padding:2px 8px;font-size:11px;margin-left:auto;" id="ls-apply-rt" data-rt="${parsed.relationType}">Применить тип</button>
                </div>` : ''}
                ${parsed.analysis ? `<div class="ls-analyze-text">${escHtml(parsed.analysis)}</div>` : ''}
                ${parsed.reasoning ? `<div class="ls-analyze-reason">${escHtml(parsed.reasoning)}</div>` : ''}
                <button id="ls-apply-score" class="menu_button" style="margin-top:8px;width:100%"><i class="fa-solid fa-check"></i> Применить ${parsed.suggestedScore}</button>`;

            document.getElementById('ls-apply-rt')?.addEventListener('click', function () {
                loveData().relationType = this.dataset.rt;
                saveSettingsDebounced(); syncUI(); pulseWidget();
                toast('success', 'Тип: ' + (RELATION_TYPES[this.dataset.rt]?.label || ''));
            });
            document.getElementById('ls-apply-score')?.addEventListener('click', () => {
                const d = loveData(), prev = d.score;
                d.score = Math.max(MIN_SCORE, Math.min(parsed.suggestedScore, d.maxScore));
                if (d.score - prev !== 0) addToLog(d, d.score - prev, 'AI анализ');
                saveSettingsDebounced(); updatePromptInjection(); syncUI(); pulseWidget(); renderScoreLog();
                toast('success', 'Счёт: ' + d.score);
            });
        }
    } catch (e) { status.textContent = e.message; toast('error', e.message); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-chart-line"></i> Анализировать'; }
}
