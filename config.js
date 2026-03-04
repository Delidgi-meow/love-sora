// ═══════════════════════════════════════════
// CONFIG — константы и настройки по умолчанию
// ═══════════════════════════════════════════

export const EXT_NAME = 'love-score';
export const PROMPT_KEY = EXT_NAME + '_injection';
export const MIN_SCORE = -100;

export const RELATION_TYPES = {
    neutral:    { label: 'Нейтрально',  color: '#d0d0d0', deep: '#888888', desc: 'Тип не определён. Отношения только начинаются.' },
    romance:    { label: 'Романтика',   color: '#ff2d55', deep: '#c0002a', desc: 'Влюблённость, страсть, нежность.' },
    friendship: { label: 'Дружба',      color: '#ff9d2e', deep: '#b35000', desc: 'Тепло, забота и доверие без романтики.' },
    family:     { label: 'Семья',       color: '#f0c000', deep: '#8a6c00', desc: 'Глубокая привязанность как к родному.' },
    platonic:   { label: 'Платоника',   color: '#00c49a', deep: '#006655', desc: 'Духовная близость без физики.' },
    rival:      { label: 'Соперник',    color: '#2979ff', deep: '#003a99', desc: 'Уважение через конкуренцию.' },
    obsession:  { label: 'Одержимость', color: '#a855f7', deep: '#5c00b0', desc: 'Всепоглощающая фиксация.' },
    hostile:    { label: 'Ненависть',   color: '#2e8b00', deep: '#050f00', desc: 'Открытая ненависть и враждебность.' },
};

export const defaultSettings = {
    isEnabled: true,
    maxScore: 100,
    gradualProgression: true,
    widgetPos: null,
    widgetSize: 64,
    lastCheckedMessageId: null,
    chatLoveData: {},
    genEndpoint: '',
    genApiKey: '',
    genModel: '',
    genLang: 'ru',
    genUserNotes: '',
    chatAnalysisMsgCount: 20,
    presets: []
};

export const defaultLoveData = () => ({
    score: 0,
    maxScore: 100,
    relationType: 'neutral',
    scoreLog: [],
    scoreChanges: [
        { delta: 1, description: '' },
        { delta: 2, description: '' },
        { delta: -1, description: '' },
        { delta: -2, description: '' },
        { delta: -5, description: '' },
        { delta: -10, description: '' }
    ],
    scaleInterpretations: [
        { min: 0, max: 10, description: '' },
        { min: 11, max: 30, description: '' },
        { min: 31, max: 50, description: '' },
        { min: 51, max: 70, description: '' },
        { min: 71, max: 85, description: '' },
        { min: 86, max: 95, description: '' },
        { min: 96, max: 100, description: '' },
        { min: -30, max: -1, description: '' },
        { min: -70, max: -31, description: '' },
        { min: -100, max: -71, description: '' }
    ],
    milestones: [
        { threshold: 15, description: 'Комплимент или знак внимания.', done: false },
        { threshold: 30, description: 'Предложить провести время вместе.', done: false },
        { threshold: 50, description: 'Подарок или особый жест.', done: false },
        { threshold: 65, description: 'Открыто признаться в чувствах.', done: false },
        { threshold: 80, description: 'Заговорить о серьёзных отношениях.', done: false },
        { threshold: 90, description: 'Предложение руки и сердца.', done: false },
        { threshold: 97, description: 'Разговор о совместном будущем.', done: false }
    ]
});
