// ═══════════════════════════════════════════
// HEART — CSS blur виджет сердца
// ═══════════════════════════════════════════

import { RELATION_TYPES, MIN_SCORE } from './config.js';
import { cfg, loveData, getActiveInterp, escHtml, clamp } from './state.js';
import { saveSettingsDebounced } from '../../../../script.js';

// ─── Цвет сердца ──────────────────────────────────────────────────────────────
function h2r(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function heartColorRgba(score, max, rt = 'neutral') {
    const t = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
    const isHostile = rt === 'hostile';
    const ratio = Math.max(0, Math.min(1, Math.abs(score) / (score >= 0 ? max : 100)));

    if (isHostile) {
        // Hostile always uses green tones regardless of score sign
        const negColor = '#0a8c3a';
        const [r, g, b] = h2r(negColor);
        const alpha = 0.15 + ratio * 0.85;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    if (score >= 0) {
        const [r, g, b] = h2r(t.color);
        const alpha = 0.15 + ratio * 0.85;
        return `rgba(${r},${g},${b},${alpha})`;
    } else {
        const negColor = '#4ec900';
        const [r, g, b] = h2r(negColor);
        const alpha = 0.15 + ratio * 0.85;
        return `rgba(${r},${g},${b},${alpha})`;
    }
}


// ─── Стили ────────────────────────────────────────────────────────────────────
export function injectStyles() {
    if (document.getElementById('ls-styles')) return;
    const el = document.createElement('style');
    el.id = 'ls-styles';
    el.textContent = `
#ls-widget {
    position: fixed; top: 100px; left: 18px; bottom: auto; right: auto;
    width: 64px; height: 60px; cursor: grab; z-index: 999999;
    user-select: none; touch-action: none;
    transition: transform .35s ease;
}
#ls-widget:active { cursor: grabbing; }
#ls-widget.ls-beat { animation: ls-hb .55s cubic-bezier(.36,1.8,.5,1) forwards; }
#ls-widget.ls-flip { animation: ls-flip .55s ease forwards; }
@keyframes ls-hb { 0%{transform:scale(1)} 40%{transform:scale(1.3)} 70%{transform:scale(.92)} 100%{transform:scale(1)} }
@keyframes ls-flip { 0%{transform:scaleY(1)} 35%{transform:scaleY(0) scale(1.15)} 65%{transform:scaleY(0) scale(1.15)} 100%{transform:scaleY(1)} }

/* Pure blur heart — just a blurred SVG shape, nothing else */
.ls-heart-wrap {
    position: relative; width: 100%; height: 100%;
}
.ls-heart-blur {
    position: absolute; inset: 0;
    transition: filter .4s ease;
}
.ls-heart-blur svg { display: block; width: 100%; height: 100%; overflow: visible; }
.ls-heart-blur path { transition: fill .5s ease; }
.ls-heart-score {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    pointer-events: none; z-index: 2;
}
.ls-heart-num {
    font-size: 16px; font-weight: 800; line-height: 1;
    color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,.6), 0 0 20px rgba(0,0,0,.3);
    font-family: system-ui, sans-serif;
}
.ls-heart-denom {
    font-size: 9px; line-height: 1; margin-top: 1px;
    color: rgba(255,255,255,.6);
    text-shadow: 0 1px 4px rgba(0,0,0,.5);
    font-family: system-ui, sans-serif;
}

/* Tooltip */
.ls-tip {
    position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
    background: rgba(18,18,22,.95); backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,.1); border-radius: 8px;
    padding: 6px 10px; font-size: 10px; line-height: 1.45;
    color: rgba(255,255,255,.8); font-family: Comfortaa, system-ui, sans-serif;
    pointer-events: none; opacity: 0; white-space: normal;
    text-align: center; max-width: 200px; min-width: 80px;
    transition: opacity .18s ease; z-index: 1000000;
}
#ls-widget:hover .ls-tip { opacity: 1; }
.ls-tip-type { font-weight: 600; margin-bottom: 2px; }

/* Panel shared styles */
.ls-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
.ls-section-title { font-size:11px; font-weight:600; letter-spacing:.6px; text-transform:uppercase; color:var(--SmartThemeBodyColor,#aaa); opacity:.55; margin:14px 0 5px; padding-bottom:4px; border-bottom:1px solid var(--border-color,rgba(255,255,255,.08)); }
.ls-hint { font-size:11px; color:var(--SmartThemeBodyColor,#aaa); opacity:.4; line-height:1.5; margin-bottom:6px; }
.ls-num-input { background:var(--input-background-fill,rgba(255,255,255,.04)); border:1px solid var(--border-color,rgba(255,255,255,.12)); border-radius:4px; color:var(--SmartThemeBodyColor,#eee); padding:4px 6px; text-align:center; font-size:13px; transition:border-color .15s; }
.ls-num-input:focus { outline:none; border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4)); }
.ls-textarea-field { flex:1; resize:vertical; background:var(--input-background-fill,rgba(255,255,255,.03)); border:1px solid var(--border-color,rgba(255,255,255,.1)); border-radius:4px; color:var(--SmartThemeBodyColor,#eee); padding:6px 8px; font-family:inherit; font-size:12px; line-height:1.55; box-sizing:border-box; min-height:52px; transition:border-color .15s; }
.ls-textarea-field:focus { outline:none; border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35)); }

/* Rule cards — soft fill instead of left border */
.ls-card { display:flex; gap:8px; align-items:flex-start; margin-bottom:6px; padding:8px; border-radius:6px; border:1px solid var(--border-color,rgba(255,255,255,.08)); transition: background .15s; }
.ls-card-pos { background:rgba(255,180,200,.04); border-color:rgba(255,150,180,.15); }
.ls-card-neg { background:rgba(40,40,50,.3); border-color:rgba(80,80,100,.2); }
.ls-card-neu { background:var(--input-background-fill,rgba(255,255,255,.02)); }
.ls-card-milestone { background:rgba(255,220,160,.04); border-color:rgba(220,180,120,.15); }
.ls-card-milestone.ls-done { opacity:.4; }
.ls-heart-box { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:44px; }
.ls-heart-icon { font-size:16px; line-height:1; }
.ls-heart-icon.ls-icon-pos { color: rgba(255,160,180,.7); }
.ls-heart-icon.ls-icon-neg { color: rgba(100,100,120,.6); }
.ls-del-btn { padding:3px 7px!important; min-width:unset!important; align-self:flex-start; opacity:.35; transition:opacity .15s; }
.ls-del-btn:hover { opacity:.8; }
.ls-range-box { display:flex; flex-direction:column; align-items:center; gap:5px; min-width:148px; }
.ls-range-label { font-size:9px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; color:var(--SmartThemeBodyColor,#aaa); opacity:.45; line-height:1; }
.ls-range-inner { display:flex; align-items:center; gap:6px; }
.ls-range-sep { opacity:.3; font-size:12px; }
.ls-range-input { background:var(--input-background-fill,rgba(255,255,255,.04)); border:1px solid var(--border-color,rgba(255,255,255,.12)); border-radius:4px; color:var(--SmartThemeBodyColor,#eee); padding:4px 6px; text-align:center; font-size:13px; width:68px; box-sizing:border-box; transition:border-color .15s; }
.ls-range-input:focus { outline:none; border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.4)); }
.ls-add-btn { width:100%; margin-top:4px; opacity:.7; }
.ls-add-btn:hover { opacity:1; }
.ls-milestone-left { display:flex; flex-direction:column; align-items:center; gap:5px; min-width:72px; }
.ls-milestone-threshold-wrap { display:flex; flex-direction:column; align-items:center; gap:2px; }
.ls-milestone-threshold-label { font-size:9px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; opacity:.4; line-height:1; }
.ls-milestone-done-cb { width:15px; height:15px; cursor:pointer; accent-color:var(--SmartThemeBodyColor,#aaa); margin-top:2px; }
.ls-milestone-status { font-size:9px; opacity:.4; text-align:center; line-height:1.3; }
.ls-milestone-status.ls-status-due { opacity:.8; font-weight:600; }
#ls-active-state { margin-bottom:8px; padding:8px 10px; border-radius:6px; background:var(--input-background-fill,rgba(255,255,255,.03)); border:1px solid var(--border-color,rgba(255,255,255,.1)); font-size:12px; line-height:1.55; color:var(--SmartThemeBodyColor,#ccc); }
#ls-active-state strong { opacity:.7; }
input[type=range].ls-size-slider { flex:1; accent-color:var(--SmartThemeBodyColor,#aaa); }

/* Relation type buttons */
.ls-rel-type-row { display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.ls-rel-type-btn { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; cursor:pointer; opacity:.22; transition:opacity .15s,filter .15s; user-select:none; flex-shrink:0; border-radius:50%; }
.ls-rel-type-btn:hover { opacity:.6; }
.ls-rel-type-btn.ls-rt-active { opacity:1; filter:drop-shadow(0 2px 8px currentColor); }
#ls-type-info { display:none; font-size:11px; line-height:1.55; padding:7px 10px; border-radius:6px; background:var(--input-background-fill,rgba(255,255,255,.04)); border:1px solid var(--border-color,rgba(255,255,255,.1)); color:var(--SmartThemeBodyColor,#ccc); margin-bottom:6px; }
.ls-rt-neutral{color:#c0c0c0} .ls-rt-romance{color:#ff2d55} .ls-rt-friendship{color:#ff9d2e} .ls-rt-family{color:#f0c000} .ls-rt-platonic{color:#00c49a} .ls-rt-rival{color:#2979ff} .ls-rt-obsession{color:#a855f7} .ls-rt-hostile{color:#2e8b00}

/* Presets */
.ls-preset-row { display:flex; align-items:center; gap:8px; margin-bottom:5px; padding:7px 9px; border-radius:5px; background:var(--input-background-fill,rgba(255,255,255,.02)); border:1px solid var(--border-color,rgba(255,255,255,.08)); }
.ls-preset-info { flex:1; min-width:0; }
.ls-preset-name { font-size:12px; font-weight:600; color:var(--SmartThemeBodyColor,#eee); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ls-preset-meta { font-size:10px; opacity:.35; margin-top:1px; }
.ls-preset-actions { display:flex; gap:4px; flex-shrink:0; }
.ls-preset-btn { padding:3px 7px!important; min-width:unset!important; font-size:11px!important; }

/* AI box */
.ls-api-label { font-size:11px; color:var(--SmartThemeBodyColor,#aaa); opacity:.45; margin:6px 0 3px; display:block; }
.ls-api-field { width:100%; box-sizing:border-box; background:var(--input-background-fill,rgba(255,255,255,.04)); border:1px solid var(--border-color,rgba(255,255,255,.1)); border-radius:4px; color:var(--SmartThemeBodyColor,#eee); padding:5px 8px; font-size:12px; transition:border-color .15s; }
.ls-api-field:focus { outline:none; border-color:var(--SmartThemeBodyColor,rgba(255,255,255,.35)); }
.ls-model-row { display:flex; gap:6px; align-items:center; margin-bottom:2px; }
.ls-model-row select { flex:1; background:var(--input-background-fill,rgba(255,255,255,.04)); border:1px solid var(--border-color,rgba(255,255,255,.1)); border-radius:4px; color:var(--SmartThemeBodyColor,#eee); padding:5px 8px; font-size:12px; }
.ls-refresh-btn { padding:5px 9px!important; min-width:unset!important; flex-shrink:0; }
.ls-refresh-btn.ls-loading i { animation:ls-spin .7s linear infinite; }
@keyframes ls-spin { to{transform:rotate(360deg)} }

/* Score log */
.ls-log-entry { display:flex; align-items:center; gap:8px; padding:4px 8px; margin-bottom:2px; border-radius:4px; font-size:11px; }
.ls-log-delta { font-size:12px; font-weight:800; min-width:36px; white-space:nowrap; }
.ls-log-reason { color:var(--SmartThemeBodyColor,#ccc); opacity:.7; line-height:1.4; }
.ls-log-clear { padding:2px 8px!important; min-width:unset!important; font-size:10px!important; opacity:.4; }
.ls-log-clear:hover { opacity:.8; }

/* Analyze */
#ls-analyze-result { margin-top:8px; padding:10px; border-radius:6px; background:var(--input-background-fill,rgba(255,255,255,.03)); border:1px solid var(--border-color,rgba(255,255,255,.12)); display:none; }
.ls-analyze-score { font-size:13px; font-weight:600; color:var(--SmartThemeBodyColor,#eee); margin-bottom:6px; }
.ls-analyze-text { font-size:12px; line-height:1.55; color:var(--SmartThemeBodyColor,#ccc); opacity:.85; margin-bottom:5px; }
.ls-analyze-reason { font-size:11px; line-height:1.4; color:var(--SmartThemeBodyColor,#aaa); opacity:.55; font-style:italic; }

/* Char preview */
#ls-char-preview { display:flex; align-items:center; gap:10px; padding:8px 10px; margin:8px 0 4px; border-radius:6px; background:var(--input-background-fill,rgba(255,255,255,.03)); border:1px solid var(--border-color,rgba(255,255,255,.08)); }
#ls-char-avatar { width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid var(--border-color,rgba(255,255,255,.2)); flex-shrink:0; background:var(--input-background-fill,rgba(255,255,255,.06)); }
#ls-char-avatar.ls-hidden { display:none; }
`;
    document.head.appendChild(el);
}

// ─── Pure blur heart — SVG shape with blur filter, no outlines ────────────────
const HEART_PATH = 'M50 88 C50 88 6 56 6 30 C6 14 18 4 32 4 C42 4 48 10 50 15 C52 10 58 4 68 4 C82 4 94 14 94 30 C94 56 50 88 50 88 Z';

function blurAmount(sz) {
    // Blur scales with widget size: small=3px, large=7px
    return Math.max(3, Math.min(7, Math.round(sz * 0.06)));
}

// ─── Создание виджета ─────────────────────────────────────────────────────────
export function createWidget() {
    if (document.getElementById('ls-widget')) return;
    injectStyles();

    const w = document.createElement('div');
    w.id = 'ls-widget';
    w.innerHTML = buildWidgetInner();
    document.body.appendChild(w);

    const c = cfg();
    const sz = c.widgetSize || 64;
    applyWidgetSize(sz);

    if (c.widgetPos?.top != null) {
        const st = parseFloat(c.widgetPos.top), sl = parseFloat(c.widgetPos.left);
        w.style.top = clamp(isNaN(st) ? 100 : st, 8, window.innerHeight - Math.round(sz * .94) - 8) + 'px';
        w.style.left = clamp(isNaN(sl) ? 18 : sl, 8, window.innerWidth - sz - 8) + 'px';
        w.style.bottom = 'auto'; w.style.right = 'auto';
    }

    makeDraggable(w);
}

function buildWidgetInner() {
    const d = loveData();
    const rt = d.relationType || 'neutral';
    const isNeg = d.score < 0;
    const isHostile = rt === 'hostile';
    const shouldFlip = isNeg || isHostile;
    const color = heartColorRgba(d.score, d.maxScore, rt);
    const interp = getActiveInterp();
    const rtInfo = RELATION_TYPES[rt] || RELATION_TYPES.neutral;
    const sz = cfg().widgetSize || 64;
    const blur = blurAmount(sz);
    const tr = shouldFlip ? ` transform="rotate(180,50,46)"` : '';

    // Tooltip text: if type contradicts score (hostile + high positive), show type desc
    let tipText = interp?.description?.trim() || '';
    if (isHostile && d.score > 0) {
        tipText = rtInfo.desc;
    }
    if (!tipText) tipText = d.score + ' / ' + d.maxScore;

    return `<div class="ls-heart-wrap">
        <div class="ls-heart-blur" style="filter:blur(${blur}px)">
            <svg viewBox="0 0 100 92" xmlns="http://www.w3.org/2000/svg">
                <path d="${HEART_PATH}"${tr} fill="${color}"/>
            </svg>
        </div>
        <div class="ls-heart-score">
            <span class="ls-heart-num">${d.score}</span>
            <span class="ls-heart-denom">/${d.maxScore}</span>
        </div>
        <div class="ls-tip">
            <div class="ls-tip-type" style="color:${rtInfo.color}">${escHtml(rtInfo.label)}</div>
            <div>${escHtml(tipText)}</div>
        </div>
    </div>`;
}

export function applyWidgetSize(sz) {
    const w = document.getElementById('ls-widget');
    if (!w) return;
    w.style.width = sz + 'px';
    w.style.height = Math.round(sz * 0.94) + 'px';
    // Re-render to update blur scaling
    w.innerHTML = buildWidgetInner();
}

export function refreshWidget() {
    const c = cfg(), w = document.getElementById('ls-widget');
    if (!w) return;
    w.style.display = c.isEnabled ? 'block' : 'none';
    w.innerHTML = buildWidgetInner();
}

export function pulseWidget() {
    const w = document.getElementById('ls-widget');
    if (!w) return;
    w.classList.remove('ls-beat', 'ls-flip');
    void w.offsetWidth;
    w.classList.add('ls-beat');
    w.addEventListener('animationend', () => w.classList.remove('ls-beat'), { once: true });
}

export function flipWidget() {
    const w = document.getElementById('ls-widget');
    if (!w) return;
    w.classList.remove('ls-beat', 'ls-flip');
    void w.offsetWidth;
    w.classList.add('ls-flip');
    w.addEventListener('animationend', () => { w.classList.remove('ls-flip'); refreshWidget(); }, { once: true });
}

// ─── Drag ─────────────────────────────────────────────────────────────────────
function makeDraggable(w) {
    let drag = false, moved = false, grabX = 0, grabY = 0;

    w.addEventListener('pointerdown', e => {
        const r = w.getBoundingClientRect();
        grabX = e.clientX - r.left;
        grabY = e.clientY - r.top;
        drag = true; moved = false;
        w.setPointerCapture(e.pointerId);
        w.style.transition = 'none';
        e.preventDefault();
    });

    w.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = Math.abs(e.clientX - (w.getBoundingClientRect().left + grabX));
        const dy = Math.abs(e.clientY - (w.getBoundingClientRect().top + grabY));
        if (!moved && (dx > 4 || dy > 4)) moved = true;
        if (!moved) return;
        w.style.left = clamp(e.clientX - grabX, 8, window.innerWidth - w.offsetWidth - 8) + 'px';
        w.style.right = 'auto';
        w.style.top = clamp(e.clientY - grabY, 8, window.innerHeight - w.offsetHeight - 8) + 'px';
        w.style.bottom = 'auto';
        e.preventDefault();
    });

    w.addEventListener('pointerup', () => {
        if (!drag) return;
        drag = false;
        w.style.transition = 'filter .2s ease, transform .35s ease';
        w.style.filter = '';
        if (moved) {
            cfg().widgetPos = { top: w.style.top, left: w.style.left };
            saveSettingsDebounced();
        }
    });
}
