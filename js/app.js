// ================ КОНФИГ ================

const BUILDINGS = {
  C: {
    name: 'Главный корпус',
    floors: {
      0: 'data/floor0.svg',
      1: 'data/floor1.svg',
      2: 'data/floor2.svg',
      3: 'data/floor3.svg',
      4: 'data/floor4.svg'
    }
  }
};

const BREAKS = {
  '08:10': '08:55–09:00',
  '09:55': '10:40–10:45',
  '11:40': '12:25–12:30',
  '13:35': '14:20–14:25',
  '15:20': '16:05–16:10',
  '17:05': '17:50–17:55',
  '18:50': '19:35–19:40',
  '20:25': '21:10–21:15'
};

const LESSON_TYPES = {
  'Лек.': { cls: 'lec', icon: 'mdi-book-open-page-variant' },
  'Лаб.': { cls: 'lab', icon: 'mdi-microscope' },
  'Упр.': { cls: 'pr',  icon: 'mdi-function-variant' }
};

const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня',
                     'июля','августа','сентября','октября','ноября','декабря'];

const DAY_GENITIVE = {
  'Понедельник': 'понедельника',
  'Вторник':     'вторника',
  'Среда':       'среды',
  'Четверг':     'четверга',
  'Пятница':     'пятницы',
  'Суббота':     'субботы',
  'Воскресенье': 'воскресенья'
};

const SEARCH_CATEGORY_RULES = [
  {
    triggers: ['столовая', 'столовка', 'буфет', 'поесть', 'еда', 'перекус', 'обед', 'кафе', 'кофе', 'кофейня', 'питание'],
    types: ['buffet'],
    keywords: ['буфет', 'столовая', 'кофейня', 'кофе-поинт']
  },
  {
    triggers: ['спорт', 'спортзал', 'спортивный', 'стадион', 'физра', 'физкультура', 'самбо', 'атлетика', 'тренажерный'],
    types: ['gym'],
    keywords: ['спортзал', 'спортивный', 'самбо', 'атлетик', 'стадион']
  },
  {
    triggers: ['туалет', 'wc', 'санузел', 'уборная', 'тубзик'],
    types: ['wc'],
    keywords: ['туалет', 'санузел']
  },
  {
    triggers: ['гардероб', 'раздевалка', 'вешалка', 'куртка', 'одежда'],
    types: ['wardrobe'],
    keywords: ['гардероб']
  },
  {
    triggers: ['медпункт', 'врач', 'медик', 'здравпункт', 'аптечка'],
    types: ['medical'],
    keywords: ['медпункт', 'медицинск']
  },
  {
    triggers: ['деканат', 'деконат', 'деканаты'],
    types: [],
    keywords: ['деканат']
  },
  {
    triggers: ['вход', 'выход', 'вахта', 'турникет', 'главный вход'],
    types: ['entrance'],
    keywords: ['вход', 'выход']
  },
  {
    triggers: ['музей'],
    types: ['museum'],
    keywords: ['музей']
  }
];

const QUICK_TAGS = [
  { label: '📅 Группы и преподаватели', action: 'directory' },
  { label: '🍽 Столовая и буфет', query: 'столовая' },
  { label: '🏃 Спортзал',         query: 'спорт' },
  { label: '🚻 Туалет',           query: 'туалет' },
  { label: '🎓 Деканаты',         query: 'деканат' },
  { label: '🧥 Гардероб',         query: 'гардероб' },
  { label: '⚕️ Медпункт',         query: 'медпункт' }
];

const AI_QUICK_PROMPTS = [
  'В каких аудиториях на этой неделе у Устюкова будут пары?',
  'Какие аудитории сейчас свободны на 1 этаже?',
  'Расписание группы 445 на этой неделе',
  'Где поесть в Главном корпусе?',
  'Как пройти от входа до 100 аудитории?',
  'Где находится деканат ФВТ?'
];

// ================ TELEGRAM ================

const tg = window.Telegram?.WebApp;
let telegramUser = null;

function initTelegram() {
  if (!tg || !tg.initData) return;
  try {
    tg.ready();
    tg.expand();
    telegramUser = tg.initDataUnsafe?.user || null;
    if (!localStorage.getItem('theme') && tg.colorScheme) {
      document.documentElement.dataset.theme = tg.colorScheme === 'dark' ? 'dark' : 'light';
    }
    tg.onEvent?.('themeChanged', () => {
      if (localStorage.getItem('theme')) return;
      document.documentElement.dataset.theme = tg.colorScheme === 'dark' ? 'dark' : 'light';
    });
  } catch (e) {
    console.warn('[telegram] init failed', e);
  }
}

function haptic(type = 'light') {
  if (tg?.HapticFeedback) {
    try {
      if (type === 'light') tg.HapticFeedback.impactOccurred('light');
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    } catch (e) { /* no-op */ }
  }
}

// ================ УТИЛИТЫ ================

function formatRoomName(name) {
  if (!name) return '';
  return name.replace(/^Аудитория\s+(Спортзал|Зал|Стадион|Бассейн|Буфет|Столовая|Гардероб|Деканат|Библиотека)/i, '$1');
}

function naturalRoomSort(a, b) {
  const nameA = formatRoomName(a.meta?.name || '').toLowerCase();
  const nameB = formatRoomName(b.meta?.name || '').toLowerCase();
  const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
  return collator.compare(nameA, nameB);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMultiline(s) {
  return escapeHtml(s).replace(/\n/g, '<br>');
}

// ================ СОСТОЯНИЕ ================

let currentBuilding = 'C';
let currentFloor = 1;
let currentOverlay = null;
let currentLabels = null;
let labelTimer = null;
let roomsMeta = {};
let roomShapes = {};
let pendingHighlight = null;
let selectedRoomId = null;
let selectedShapes = [];
let hoveredRoomId = null;

let currentSvgViewBox = { W: 1000, H: 1000 };

let panelMode = null; // 'room' | 'free' | 'route' | 'ai' | null
let currentRoomPanelId = null;

let freeModeOn = false;
let freePanelCollapsed = false;
let freeRoomIds = new Set();
let busyRoomIds = new Set();
let freeRoomData = new Map();
let busyRoomData = new Map();

let isPoppingState = false;
let roomRequestToken = 0;

// Маршруты
let graph = { nodes: {}, edges: [] };
let routeLayer = null;
let routePickLayer = null;
let routeState = {
  fromRoomId: null,
  toRoomId: null,
  path: null
};
let routePickSide = 'from';

// ИИ-навигатор
let aiMessages = [];
let aiLoading = false;

// Справочник расписания (Группы и Преподаватели)
let scheduleDirectory = { ready: false, groups: [], lecturers: [] };
let directoryActiveTab = 'groups'; // 'groups' | 'lecturers'
let directoryFilterQuery = '';
let currentEntitySchedule = null; // { type: 'group'|'lecturer', name: string }
let scheduleViewOpen = false;
let scheduleMobileStep = 'list'; // 'list' | 'detail'
let scheduleDayFilter = 'all';   // 'all' | date string
let currentEntityData = null;
let entityLoading = false;
let entityError = null;

// Кэш для SVG документов при кросс-этажных запросах
const svgCache = {};

// ================ КАРТА ================

const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -3,
  maxZoom: 3,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  wheelPxPerZoomLevel: 200,
  wheelDebounceTime: 20,
  zoomAnimation: true,
  attributionControl: false
});

map.createPane('routePane');
map.getPane('routePane').style.zIndex = 450;

routeLayer = L.layerGroup().addTo(map);
routePickLayer = L.layerGroup().addTo(map);

// ================ СИНХРОНИЗАЦИЯ КНОПОК РЕЖИМОВ ================

function syncModeUI() {
  const freeTopBtn = document.getElementById('free-top-btn');
  const freeMapBtn = document.querySelector('.free-toggle');
  const schedDirBtn = document.querySelector('.schedule-dir-toggle');
  const routeTopBtn = document.getElementById('route-toggle');
  const routeMapBtn = document.querySelector('.map-route-btn');
  const aiTopBtn = document.getElementById('ai-toggle');
  const omniAiBtn = document.getElementById('omni-ai-btn');

  if (freeTopBtn) freeTopBtn.classList.toggle('active-free', freeModeOn);
  if (freeMapBtn) freeMapBtn.classList.toggle('active', freeModeOn);

  const isSchedDir = scheduleViewOpen || panelMode === 'directory' || panelMode === 'entity';
  if (schedDirBtn) schedDirBtn.classList.toggle('active', isSchedDir);

  const isRoute = panelMode === 'route';
  if (routeTopBtn) routeTopBtn.classList.toggle('active', isRoute);
  if (routeMapBtn) routeMapBtn.classList.toggle('active', isRoute);

  // Кнопка «ИИ» остаётся синей в режиме ИИ даже когда правая панель свёрнута язычком
  const isAiActive = panelMode === 'ai';
  if (aiTopBtn) aiTopBtn.classList.toggle('active-ai', isAiActive);
  if (omniAiBtn) omniAiBtn.classList.toggle('active', isAiActive);
}

// ================ ПАНЕЛЬ ================

function smoothInvalidateSize(duration = 260) {
  const start = performance.now();
  (function tick() {
    map.invalidateSize({ animate: false });
    if (performance.now() - start < duration) {
      requestAnimationFrame(tick);
    } else {
      scheduleLabelRefresh();
    }
  })();
}

function openPanel() {
  document.getElementById('panel').classList.add('open');
  smoothInvalidateSize(260);
  setTimeout(updatePanelHandle, 260);
  syncModeUI();
}

function closePanel() {
  document.getElementById('panel').classList.remove('open');
  clearSelectedRoom();
  updateURL(null, { push: false });
  panelMode = null;
  currentRoomPanelId = null;
  currentEntitySchedule = null;
  smoothInvalidateSize(260);
  updatePanelHandle();
  syncModeUI();
}

function closeRoomPanel() {
  clearSelectedRoom();
  updateURL(null, { push: false });
  currentRoomPanelId = null;

  if (freeModeOn) {
    panelMode = 'free';
    renderFreePanel();
    scheduleLabelRefresh();
    syncModeUI();
  } else {
    closePanel();
  }
}

function collapseFreePanel() {
  if (panelMode === 'free') freePanelCollapsed = true;
  document.getElementById('panel').classList.remove('open');
  smoothInvalidateSize(260);
  updatePanelHandle();
  syncModeUI();
}

function expandFreePanel() {
  if (panelMode === 'free' || (freeModeOn && !panelMode)) {
    freePanelCollapsed = false;
    panelMode = 'free';
    currentRoomPanelId = null;
    clearSelectedRoom();
    openPanel();
    renderFreePanel();
  } else if (panelMode === 'room' || panelMode === 'directory' || panelMode === 'entity') {
    openPanel();
  } else if (panelMode === 'route') {
    openPanel();
    renderRoutePanel();
  } else if (panelMode === 'ai') {
    openPanel();
    renderAiPanel();
  }
  updatePanelHandle();
  syncModeUI();
}

function disableFreeMode() {
  freeModeOn = false;
  freePanelCollapsed = false;
  try { localStorage.setItem('free_mode', '0'); } catch (e) {}
  applyFreeHighlight();
  if (panelMode === 'free') {
    closePanel();
  }
  updatePanelHandle();
  syncModeUI();
}

async function toggleFreeMode() {
  if (scheduleViewOpen) closeScheduleView({ updateHistory: false });
  if (!freeModeOn) {
    if (panelMode === 'route') {
      clearRoute();
    }
    freeModeOn = true;
    freePanelCollapsed = false;
    try { localStorage.setItem('free_mode', '1'); } catch (e) {}
    panelMode = 'free';
    currentRoomPanelId = null;
    clearSelectedRoom();
    syncModeUI();
    openPanel();
    renderFreePanelLoading();
    await refreshFreeMode();
  } else {
    disableFreeMode();
  }
}

function isAnyCollapsiblePanelMode() {
  if (scheduleViewOpen) return false;
  return (
    panelMode === 'room' ||
    panelMode === 'free' ||
    panelMode === 'route' ||
    panelMode === 'ai' ||
    freeModeOn
  );
}

function updatePanelHandle() {
  const h = document.getElementById('panel-handle');
  if (!h) return;

  if (!isAnyCollapsiblePanelMode()) {
    h.classList.add('hidden');
    h.classList.remove('open-panel');
    return;
  }

  const panel = document.getElementById('panel');
  const isOpen = panel.classList.contains('open');

  if (isOpen) {
    h.classList.remove('hidden');
    h.classList.add('open-panel');
    h.innerHTML = '<i class="mdi mdi-chevron-right"></i>';
    h.title = 'Свернуть панель';
  } else {
    h.classList.remove('hidden');
    h.classList.remove('open-panel');
    h.innerHTML = '<i class="mdi mdi-chevron-left"></i>';
    h.title = 'Развернуть панель';
  }
}

function buildPanelLayout(fixedHtml, scrollHtml) {
  return `<div class="panel-fixed">${fixedHtml}</div><div class="panel-scroll">${scrollHtml}</div>`;
}

// ================ ВЫДЕЛЕНИЕ ================

function clearSelectedRoom() {
  selectedShapes.forEach(s => s.classList.remove('room-selected'));
  selectedShapes = [];
  selectedRoomId = null;
}

function selectRoom(id) {
  clearSelectedRoom();
  const shapes = roomShapes[id] || [];
  shapes.forEach(s => s.classList.add('room-selected'));
  selectedShapes = shapes;
  selectedRoomId = id;
}

// ================ ПОДСВЕТКА ТОЧЕК МАРШРУТА ================

function refreshRoutePickHighlight() {
  Object.values(roomShapes).forEach(shapes => {
    shapes.forEach(s => {
      s.classList.remove('room-route-from');
      s.classList.remove('room-route-to');
    });
  });

  if (panelMode !== 'route') return;

  if (routeState.fromRoomId && roomShapes[routeState.fromRoomId]) {
    roomShapes[routeState.fromRoomId].forEach(s => s.classList.add('room-route-from'));
  }
  if (routeState.toRoomId && roomShapes[routeState.toRoomId]) {
    roomShapes[routeState.toRoomId].forEach(s => s.classList.add('room-route-to'));
  }
}

// ================ СВОБОДНЫЕ / ЗАНЯТЫЕ ================

function roomMatchesCurrentView(id) {
  const meta = roomsMeta[id];
  if (!meta) return false;
  if (meta.building !== currentBuilding) return false;
  if (meta.floor != null && meta.floor !== currentFloor) return false;
  return true;
}

function applyFreeHighlight() {
  Object.values(roomShapes).forEach(shapes => {
    shapes.forEach(s => {
      s.classList.remove('room-free');
      s.classList.remove('room-busy');
    });
  });
  if (!freeModeOn) return;

  for (const id of freeRoomIds) {
    if (!roomMatchesCurrentView(id)) continue;
    (roomShapes[id] || []).forEach(s => s.classList.add('room-free'));
  }
  for (const id of busyRoomIds) {
    if (!roomMatchesCurrentView(id)) continue;
    (roomShapes[id] || []).forEach(s => s.classList.add('room-busy'));
  }
}

async function fetchFreeRooms() {
  try {
    const res = await fetch('/api/free-now');
    if (res.status === 503) {
      const data = await res.json();
      return { warming: true, progress: data.progress };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    freeRoomIds = new Set();
    freeRoomData = new Map();
    busyRoomIds = new Set();
    busyRoomData = new Map();

    data.free.forEach(r => {
      freeRoomIds.add(r.id);
      freeRoomData.set(r.id, { untilText: r.untilText, noSchedule: r.noSchedule });
    });
    (data.busy || []).forEach(r => {
      busyRoomIds.add(r.id);
      busyRoomData.set(r.id, { untilText: r.untilText, subject: r.subject });
    });

    return { ok: true, updatedAt: data.updatedAt };
  } catch (e) {
    console.error('[free-now]', e);
    return { error: e.message };
  }
}

async function refreshFreeMode() {
  const result = await fetchFreeRooms();
  if (!freeModeOn) return;
  if (result.warming) {
    if (!freePanelCollapsed && panelMode === 'free') renderFreePanelWarming(result.progress);
    pollCacheStatus();
  } else if (result.ok) {
    applyFreeHighlight();
    if (!freePanelCollapsed && panelMode === 'free') renderFreePanel();
  } else {
    if (!freePanelCollapsed && panelMode === 'free') renderFreePanelError(result.error);
  }
}

let warmingPollInterval = null;

function pollCacheStatus() {
  if (warmingPollInterval) return;
  warmingPollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/cache-status');
      const st = await res.json();
      if (st.ready) {
        clearInterval(warmingPollInterval);
        warmingPollInterval = null;
        refreshFreeMode();
      } else if (!freePanelCollapsed && panelMode === 'free') {
        renderFreePanelWarming(st.progress);
      }
    } catch (e) { console.error('[cache-status]', e); }
  }, 1500);
}

function setupFreeToggle() {
  const FreeToggleControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'free-toggle-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      const btn = document.createElement('button');
      btn.className = 'free-toggle';
      btn.title = 'Показать свободные аудитории';
      btn.innerHTML = `<span>Свободные</span>`;

      const schedBtn = document.createElement('button');
      schedBtn.className = 'schedule-dir-toggle';
      schedBtn.title = 'Расписание групп и преподавателей';
      schedBtn.innerHTML = `<span>Расписание</span>`;

      const routeBtn = document.createElement('button');
      routeBtn.className = 'map-route-btn';
      routeBtn.title = 'Построить маршрут';
      routeBtn.setAttribute('aria-label', 'Построить маршрут');
      routeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="12.5" cy="18.2" r="2.7" fill="currentColor"/>
          <path d="M16.2 15.4C18.2 14.0 18.4 10.6 15.6 9.9C13.1 9.3 10.9 13.7 8.1 13.1C5.9 12.6 5.8 9.8 7.5 8.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8.6 5.9C8.1 5.4 8.3 4.6 9.0 4.4L12.7 3.5C13.4 3.3 14.0 3.9 13.8 4.6L12.7 8.3C12.5 9.0 11.6 9.2 11.1 8.6L8.6 5.9Z" fill="currentColor"/>
        </svg>
      `;

      const saved = localStorage.getItem('free_mode');
      if (saved === '1') {
        freeModeOn = true;
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => {
        toggleFreeMode();
      });

      schedBtn.addEventListener('click', () => {
        openScheduleDirectory();
      });

      routeBtn.addEventListener('click', () => {
        openRoutePanel();
      });

      wrap.appendChild(btn);
      wrap.appendChild(schedBtn);
      wrap.appendChild(routeBtn);

      if (freeModeOn) {
        setTimeout(async () => {
          panelMode = 'free';
          currentRoomPanelId = null;
          clearSelectedRoom();
          syncModeUI();
          openPanel();
          renderFreePanelLoading();
          await refreshFreeMode();
        }, 500);
      }

      return wrap;
    }
  });
  return new FreeToggleControl();
}

function setupPanelHandle() {
  const h = document.getElementById('panel-handle');
  if (!h) return;
  h.addEventListener('click', () => {
    if (!isAnyCollapsiblePanelMode()) return;
    const panel = document.getElementById('panel');
    if (panel.classList.contains('open')) {
      collapseFreePanel();
    } else {
      expandFreePanel();
    }
  });
}

// ================ ПАНЕЛЬ СВОБОДНЫХ ================

function renderFreePanelLoading() {
  const panel = document.getElementById('panel');
  const header = `
    <div class="panel-header">
      <button class="close" onclick="disableFreeMode()" title="Выключить режим">✕</button>
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
  `;
  const scroll = `<div class="free-warming"><div class="spinner"></div><div>Загружаю расписание…</div></div>`;
  panel.innerHTML = buildPanelLayout(header, scroll);
  updatePanelHandle();
}

function renderFreePanelWarming(progress) {
  const panel = document.getElementById('panel');
  if (!panel.classList.contains('open')) return;
  const header = `
    <div class="panel-header">
      <button class="close" onclick="disableFreeMode()" title="Выключить режим">✕</button>
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
  `;
  const scroll = `
    <div class="free-warming">
      <div class="spinner"></div>
      <div>Идёт первый прогрев кэша</div>
      <div class="progress">${progress || '0/0'}</div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-dim)">Это займёт 1–3 минуты. Дальше будет мгновенно.</div>
    </div>
  `;
  panel.innerHTML = buildPanelLayout(header, scroll);
}

function renderFreePanelError(msg) {
  const panel = document.getElementById('panel');
  const header = `
    <div class="panel-header">
      <button class="close" onclick="disableFreeMode()" title="Выключить режим">✕</button>
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
  `;
  const scroll = `<div class="free-panel-empty" style="color:#f87171">Ошибка загрузки: ${escapeHtml(msg)}</div>`;
  panel.innerHTML = buildPanelLayout(header, scroll);
}

function renderFreePanel() {
  const panel = document.getElementById('panel');
  panel.classList.add('open');
  freePanelCollapsed = false;

  const relevantFree = [...freeRoomIds]
    .map(id => ({ id, meta: roomsMeta[id], data: freeRoomData.get(id) }))
    .filter(x => x.meta && x.meta.building === currentBuilding)
    .filter(x => x.meta.floor == null || x.meta.floor === currentFloor)
    .sort(naturalRoomSort);

  const relevantBusy = [...busyRoomIds]
    .map(id => ({ id, meta: roomsMeta[id], data: busyRoomData.get(id) }))
    .filter(x => x.meta && x.meta.building === currentBuilding)
    .filter(x => x.meta.floor == null || x.meta.floor === currentFloor)
    .sort(naturalRoomSort);

  const header = `
    <div class="panel-header">
      <button class="close" onclick="disableFreeMode()" title="Выключить режим">✕</button>
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
  `;

  if (relevantFree.length === 0 && relevantBusy.length === 0) {
    panel.innerHTML = buildPanelLayout(header, `<div class="free-panel-empty">На этом этаже нет аудиторий с расписанием</div>`);
    updatePanelHandle();
    return;
  }

  const summaryHtml = `
    ${relevantFree.length > 0 ? `
      <div class="free-summary">
        <strong>${relevantFree.length}</strong>
        <span class="free-summary-label">свободных</span>
      </div>
    ` : ''}
    ${relevantBusy.length > 0 ? `
      <div class="free-summary busy-summary" style="margin-top:${relevantFree.length > 0 ? '8px' : '0'}">
        <strong>${relevantBusy.length}</strong>
        <span class="free-summary-label">занятых</span>
      </div>
    ` : ''}
  `;

  const freeListHtml = relevantFree.map(x => {
    const untilHtml = x.data.noSchedule ? 'свободна' : `свободна <span class="accent">${x.data.untilText}</span>`;
    return `
      <div class="free-item" data-room-id="${x.id}">
        <span class="free-dot"></span>
        <div class="free-body">
          <div class="free-name">${renderMultiline(formatRoomName(x.meta.name))}</div>
          <div class="free-until">${untilHtml}</div>
        </div>
      </div>`;
  }).join('');

  const busyListHtml = relevantBusy.map(x => {
    const untilHtml = x.data.untilText
      ? `занята <span class="accent-busy">до ${x.data.untilText}</span>`
      : 'занята';
    return `
      <div class="free-item busy-item" data-room-id="${x.id}">
        <span class="busy-dot"></span>
        <div class="free-body">
          <div class="free-name">${renderMultiline(formatRoomName(x.meta.name))}</div>
          <div class="free-until">${untilHtml}</div>
        </div>
      </div>`;
  }).join('');

  const scroll = `
    ${relevantFree.length > 0 ? `<div class="free-list">${freeListHtml}</div>` : ''}
    ${relevantBusy.length > 0 ? `<div class="free-list" style="margin-top:${relevantFree.length > 0 ? '12px' : '0'}">${busyListHtml}</div>` : ''}
  `;

  panel.innerHTML = buildPanelLayout(`${header}${summaryHtml}`, scroll);

  panel.querySelectorAll('.free-item').forEach(el => {
    el.addEventListener('click', () => onRoomClick(el.dataset.roomId));
  });

  updatePanelHandle();
}

// ================ URL / HISTORY ================

function updateURL(id, { push = true } = {}) {
  if (isPoppingState) return;
  const url = new URL(location);
  if (!id) {
    url.searchParams.delete('room');
    url.searchParams.delete('building');
    url.searchParams.delete('floor');
  } else {
    const meta = roomsMeta[id];
    if (meta) {
      url.searchParams.set('building', meta.building);
      if (meta.floor != null) url.searchParams.set('floor', meta.floor);
      url.searchParams.set('room', id);
    }
  }
  const currentUrl = location.pathname + location.search;
  const newUrl = url.pathname + url.search;
  if (currentUrl === newUrl) return;

  const state = { roomId: id || null };
  if (push) history.pushState(state, '', url);
  else history.replaceState(state, '', url);
}

window.addEventListener('popstate', () => {
  isPoppingState = true;
  try {
    const params = new URLSearchParams(location.search);
    const roomId = params.get('room');
    if (roomId && roomsMeta[roomId]) {
      onRoomClick(roomId, { pushHistory: false });
    } else {
      if (panelMode === 'room') closeRoomPanel();
      else if (panelMode === 'free' || panelMode === 'route' || panelMode === 'ai') { /* оставляем */ }
      else closePanel();
    }
  } finally {
    isPoppingState = false;
  }
});

// ================ UI: ЗДАНИЯ ================

function buildBuildingsUI() {
  const container = document.getElementById('buildings');
  if (!container) return;
  container.innerHTML = `
    <div class="building-context" title="Главный учебный корпус РГРТУ">
      <i class="mdi mdi-domain"></i>
      <span>Главный корпус</span>
    </div>
  `;
}

function updateTabActive() {
  // Единственный активный корпус — Главный корпус
}

// ================ ПЕРЕКЛЮЧАТЕЛЬ ЭТАЖЕЙ ================

function createFloorSwitcher() {
  const FloorSwitcher = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'floor-switcher-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      return wrap;
    }
  });
  return new FloorSwitcher();
}

function updateFloorSwitcher() {
  const wrap = document.querySelector('.floor-switcher-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const b = BUILDINGS[currentBuilding];
  if (!b) return;
  const floors = Object.keys(b.floors).map(Number).sort((a, b) => b - a);
  if (floors.length < 2) return;
  const sw = document.createElement('div');
  sw.className = 'floor-switcher';
  floors.forEach(f => {
    const btn = document.createElement('button');
    btn.textContent = f;
    if (f === currentFloor) btn.classList.add('active');
    btn.addEventListener('click', () => showFloor(currentBuilding, f));
    sw.appendChild(btn);
  });
  wrap.appendChild(sw);
}

// ================ УМНЫЙ ПОИСК БЕЗ ЛОЖНЫХ СРАБАТЫВАНИЙ ================

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenizeWords(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter(Boolean);
}

function wordMatchesToken(words, queryToken) {
  for (const w of words) {
    if (w === queryToken) return true;
    // Защита: слово «кафе» не должно совпадать с «кафедра» / «кафедры»
    if (queryToken === 'кафе' && w.startsWith('кафедр')) continue;
    if (queryToken.length >= 3 && w.startsWith(queryToken)) {
      if (queryToken.length <= 4 && w.length > queryToken.length + 2) continue;
      return true;
    }
  }
  return false;
}

function searchRooms(query, limit = 20) {
  const q = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!q) return [];

  // 1. Проверяем семантическую категорию (столовая/буфет, спортзал, туалет, деканат и т.д.)
  const matchedRule = SEARCH_CATEGORY_RULES.find(rule =>
    rule.triggers.some(t => q === t || (q.length >= 4 && levenshtein(q, t) <= 1))
  );

  if (matchedRule) {
    const results = [];
    for (const [id, meta] of Object.entries(roomsMeta)) {
      const typeMatch = matchedRule.types.includes(meta.type);
      const textWords = tokenizeWords(`${meta.name || ''} ${meta.shortName || ''} ${meta.description || ''}`);
      const kwMatch = matchedRule.keywords.some(kw => wordMatchesToken(textWords, kw.toLowerCase()));
      if (typeMatch || kwMatch) {
        if (matchedRule.types.includes('buffet') && meta.type === 'lab') continue;
        results.push({ id, meta });
      }
    }
    return results.slice(0, limit);
  }

  // 2. Поиск по номеру аудитории, названию и описанию с учётом границ слов
  const queryTokens = tokenizeWords(q);
  const exact = [];
  const prefix = [];
  const fuzzy = [];
  const seen = new Set();

  for (const [id, meta] of Object.entries(roomsMeta)) {
    const name = (meta.name || '').toLowerCase().replace(/ё/g, 'е');
    const shortName = (meta.shortName || '').toLowerCase().replace(/ё/g, 'е');
    const desc = (meta.description || '').toLowerCase().replace(/ё/g, 'е');
    const classroom = String(meta.classroom || '').toLowerCase();

    if (shortName === q || classroom === q || id.toLowerCase() === q) {
      exact.push({ id, meta });
      seen.add(id);
      continue;
    }

    const words = tokenizeWords(`${name} ${shortName} ${desc} ${classroom}`);
    if (queryTokens.length > 0 && queryTokens.every(qt => wordMatchesToken(words, qt))) {
      prefix.push({ id, meta });
      seen.add(id);
      continue;
    }

    if (q.length >= 4 && queryTokens.length === 1) {
      const qt = queryTokens[0];
      for (const w of words) {
        if (w.length >= 4 && Math.abs(w.length - qt.length) <= 1 && levenshtein(qt, w) <= 1) {
          if (qt === 'кафе' && w.startsWith('кафедр')) continue;
          if (!seen.has(id)) {
            fuzzy.push({ id, meta });
            seen.add(id);
          }
          break;
        }
      }
    }
  }

  return [...exact, ...prefix, ...fuzzy].slice(0, limit);
}

function searchEntitiesLocal(query, limit = 5) {
  const q = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!q || !scheduleDirectory.ready) return { lecturers: [], groups: [] };

  const lecturers = scheduleDirectory.lecturers
    .filter(l => l.name.toLowerCase().replace(/ё/g, 'е').includes(q) || l.shortName.toLowerCase().replace(/ё/g, 'е').includes(q))
    .slice(0, limit);

  const cleanGroupQ = q.replace(/^(?:гр\.?|группа)\s*/i, '').trim();
  const groups = cleanGroupQ
    ? scheduleDirectory.groups
        .filter(g => g.name.toLowerCase().replace(/ё/g, 'е').startsWith(cleanGroupQ) || g.name.toLowerCase() === cleanGroupQ)
        .slice(0, limit)
    : [];

  return { lecturers, groups };
}

function isLikelyAiQuestion(raw, foundCount) {
  const q = raw.toLowerCase().trim();
  if (!q) return false;
  if (q.includes('?')) return true;
  if (/^(где|как|какие|какая|какой|в каких|у кого|куда|почему|сколько|покажи|найди|подскажи|расскажи|свободн|маршрут|пройти|дойти)\b/i.test(q)) {
    return true;
  }
  const words = q.split(/\s+/);
  if (words.length >= 3) return true;
  if (foundCount === 0 && q.length >= 3) return true;
  return false;
}

function setupSearch() {
  const wrap          = document.getElementById('search-wrap');
  const input         = document.getElementById('search-input');
  const clearBtn      = document.getElementById('search-clear');
  const omniAiBtn     = document.getElementById('omni-ai-btn');
  const inlineAiBtn   = document.getElementById('ai-inline-trigger');
  const inlineAiQuery = document.getElementById('ai-inline-query');
  const results       = document.getElementById('search-results');
  const tagsEl        = document.getElementById('quick-tags');
  const historyEl     = document.getElementById('search-history');

  let history = [];
  try { history = JSON.parse(localStorage.getItem('search_history') || '[]'); } catch (e) { history = []; }

  function saveHistory(q) {
    q = (q || '').trim();
    if (!q) return;
    history = [q, ...history.filter(h => h !== q)].slice(0, 5);
    try { localStorage.setItem('search_history', JSON.stringify(history)); } catch (e) {}
  }

  function updateClearAndInlineAi() {
    const raw = input.value.trim();
    if (clearBtn) clearBtn.classList.toggle('hidden', !raw);
    if (inlineAiBtn && inlineAiQuery) {
      if (raw.length >= 2) {
        inlineAiQuery.textContent = raw;
        inlineAiBtn.classList.remove('hidden');
      } else {
        inlineAiBtn.classList.add('hidden');
      }
    }
  }

  function renderTags() {
    tagsEl.innerHTML = '';
    QUICK_TAGS.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'quick-tag';
      btn.textContent = t.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (t.action === 'directory') {
          wrap.classList.remove('open');
          openScheduleDirectory();
          return;
        }
        input.value = t.query;
        updateClearAndInlineAi();
        renderResults();
      });
      tagsEl.appendChild(btn);
    });
  }

  function renderHistory() {
    historyEl.innerHTML = '';
    if (input.value.trim()) return;
    history.slice(0, 4).forEach(h => {
      const btn = document.createElement('button');
      btn.className = 'history-item';
      btn.innerHTML = `<i class="mdi mdi-history" style="margin-right:4px"></i>${escapeHtml(h)}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.value = h;
        updateClearAndInlineAi();
        renderResults();
      });
      historyEl.appendChild(btn);
    });
  }

  function renderResults() {
    const raw = input.value.trim();
    updateClearAndInlineAi();
    results.innerHTML = '';
    if (!raw) {
      renderHistory();
      return;
    }
    historyEl.innerHTML = '';
    const entities = searchEntitiesLocal(raw, 4);
    const found = searchRooms(raw, 16);

    if (!found.length && !entities.lecturers.length && !entities.groups.length) {
      const li = document.createElement('li');
      li.className = 'res-empty';
      li.innerHTML = `По прямому совпадению не найдено — нажмите <strong>Enter</strong> или кнопку выше, чтобы спросить ИИ-навигатора`;
      results.appendChild(li);
      return;
    }

    // Преподаватели
    entities.lecturers.forEach(lec => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="res-main">
          <div class="res-name">${escapeHtml(lec.name)}</div>
          <div class="res-meta">Преподаватель · ${lec.lessonsCount} пар · ${lec.roomsCount} ауд.</div>
        </div>
        <span class="res-badge-entity"><i class="mdi mdi-calendar-clock"></i> Расписание</span>
      `;
      li.addEventListener('click', () => {
        saveHistory(raw);
        wrap.classList.remove('open');
        openEntitySchedule('lecturer', lec.name);
      });
      results.appendChild(li);
    });

    // Группы
    entities.groups.forEach(grp => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="res-main">
          <div class="res-name">Группа ${escapeHtml(grp.name)}</div>
          <div class="res-meta">Учебная группа · ${grp.lessonsCount} пар · ${grp.roomsCount} ауд.</div>
        </div>
        <span class="res-badge-entity"><i class="mdi mdi-account-group-outline"></i> Расписание</span>
      `;
      li.addEventListener('click', () => {
        saveHistory(raw);
        wrap.classList.remove('open');
        openEntitySchedule('group', grp.name);
      });
      results.appendChild(li);
    });

    // Аудитории и места
    found.forEach(({ id, meta }) => {
      const bName = BUILDINGS[meta.building]?.name || meta.building || '?';
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="res-main">
          <div class="res-name">${escapeHtml(formatRoomName(meta.name))}</div>
          <div class="res-meta">${escapeHtml(bName)}${meta.floor != null ? ' · ' + meta.floor + ' этаж' : ''}${meta.description ? ' · ' + escapeHtml(meta.description.split('\n')[0]) : ''}</div>
        </div>
        <button class="res-route-btn" type="button" title="Построить маршрут сюда">
          <i class="mdi mdi-directions"></i> Маршрут
        </button>
      `;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.res-route-btn')) return;
        saveHistory(raw);
        navigateToRoom(id);
        wrap.classList.remove('open');
      });
      const rBtn = li.querySelector('.res-route-btn');
      if (rBtn) {
        rBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          saveHistory(raw);
          wrap.classList.remove('open');
          startRouteToRoom(id);
        });
      }
      results.appendChild(li);
    });
  }

  renderTags();
  renderHistory();
  updateClearAndInlineAi();

  input.addEventListener('focus', () => {
    wrap.classList.add('open');
    if (input.value.trim()) renderResults();
    else renderHistory();
  });

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.add('open');
  });

  input.addEventListener('input', () => {
    wrap.classList.add('open');
    renderResults();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) return;
      const entities = searchEntitiesLocal(raw, 2);
      const found = searchRooms(raw, 5);
      saveHistory(raw);
      wrap.classList.remove('open');
      input.blur();
      if (isLikelyAiQuestion(raw, found.length + entities.lecturers.length + entities.groups.length)) {
        openAiPanel(raw);
      } else if (entities.lecturers.length === 1 && found.length === 0) {
        openEntitySchedule('lecturer', entities.lecturers[0].name);
      } else if (entities.groups.length === 1 && found.length === 0) {
        openEntitySchedule('group', entities.groups[0].name);
      } else if (found.length > 0) {
        navigateToRoom(found[0].id);
      } else if (entities.lecturers.length > 0) {
        openEntitySchedule('lecturer', entities.lecturers[0].name);
      } else if (entities.groups.length > 0) {
        openEntitySchedule('group', entities.groups[0].name);
      } else {
        openAiPanel(raw);
      }
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      updateClearAndInlineAi();
      results.innerHTML = '';
      renderHistory();
      input.focus();
    });
  }

  if (omniAiBtn) {
    omniAiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const raw = input.value.trim();
      wrap.classList.remove('open');
      openAiPanel(raw || null);
    });
  }

  if (inlineAiBtn) {
    inlineAiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const raw = input.value.trim();
      wrap.classList.remove('open');
      if (raw) {
        saveHistory(raw);
        openAiPanel(raw);
      } else {
        openAiPanel(null);
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });

  const params = new URLSearchParams(location.search);
  const searchQuery = params.get('search');
  if (searchQuery) {
    input.value = searchQuery;
    wrap.classList.add('open');
    renderResults();
  }
}

// ================ ИИ-НАВИГАТОР КАМПУСА ================

function openAiPanel(initialQuery = null) {
  if (scheduleViewOpen) closeScheduleView({ updateHistory: false });
  const panel = document.getElementById('panel');
  if (panelMode === 'ai' && !initialQuery) {
    if (panel && !panel.classList.contains('open')) {
      openPanel();
      renderAiPanel();
      syncModeUI();
    } else {
      closeAiPanel();
    }
    return;
  }
  if (freeModeOn) disableFreeMode();
  if (panelMode === 'route') clearRoute();

  panelMode = 'ai';
  currentRoomPanelId = null;
  clearSelectedRoom();
  openPanel();
  renderAiPanel();
  syncModeUI();

  if (initialQuery && initialQuery.trim()) {
    submitAiQuery(initialQuery.trim());
  }
}

function closeAiPanel() {
  panelMode = null;
  closePanel();
  syncModeUI();
}

function renderAiPanel() {
  const panel = document.getElementById('panel');

  const headerHtml = `
    <div class="ai-panel-header">
      <div class="panel-header">
        <button class="close" onclick="closeAiPanel()" title="Закрыть чат">✕</button>
        <div class="panel-crumbs"><i class="mdi mdi-creation" style="color:var(--text-accent)"></i> Умный помощник кампуса</div>
        <h2>Чат с ИИ</h2>
      </div>
    </div>
  `;

  let feedHtml = '';
  if (aiMessages.length === 0 && !aiLoading) {
    feedHtml = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon">
          <i class="mdi mdi-robot-happy-outline"></i>
        </div>
        <div class="ai-empty-title">ИИ-навигатор по РГРТУ</div>
        <div class="ai-empty-desc">
          Спросите про свободные аудитории, расписание, деканаты, столовые или попросите построить маршрут до нужного кабинета.
        </div>
      </div>
    `;
  } else {
    const messagesInner = aiMessages.map((msg, idx) => {
      if (msg.role === 'user') {
        return `<div class="ai-user-msg">${escapeHtml(msg.text)}</div>`;
      }
      const roomsHtml = (msg.rooms || []).map(r => {
        const meta = roomsMeta[r.id];
        if (!meta) return '';
        const floorText = meta.floor != null ? `${meta.floor} этаж` : '';
        return `
          <div class="ai-room-card" data-room-id="${escapeHtml(r.id)}">
            <div class="ai-room-info">
              <div class="ai-room-title">${escapeHtml(formatRoomName(meta.name))}</div>
              <div class="ai-room-sub">${escapeHtml(floorText)}${meta.description ? ' · ' + escapeHtml(meta.description.split('\n')[0]) : ''}</div>
            </div>
            <div class="ai-room-actions">
              <button type="button" class="ai-room-btn primary" data-action="locate" data-room-id="${escapeHtml(r.id)}" title="Показать на карте" aria-label="Показать на карте">
                <i class="mdi mdi-map-marker-radius-outline"></i>
              </button>
              <button type="button" class="ai-room-btn" data-action="route" data-room-id="${escapeHtml(r.id)}" title="Построить маршрут сюда">
                <i class="mdi mdi-directions"></i> Маршрут
              </button>
            </div>
          </div>
        `;
      }).join('');

      let routeCtaHtml = '';
      if (msg.route && msg.route.fromRoomId && msg.route.toRoomId) {
        const fromMeta = roomsMeta[msg.route.fromRoomId];
        const toMeta = roomsMeta[msg.route.toRoomId];
        if (fromMeta && toMeta) {
          routeCtaHtml = `
            <button type="button" class="ai-route-cta" data-from="${escapeHtml(msg.route.fromRoomId)}" data-to="${escapeHtml(msg.route.toRoomId)}">
              <i class="mdi mdi-routes"></i>
              <span>Показать маршрут: ${escapeHtml(formatRoomName(fromMeta.name))} → ${escapeHtml(formatRoomName(toMeta.name))}</span>
            </button>
          `;
        }
      }

      let entityCtaHtml = '';
      if (msg.entitySchedule && msg.entitySchedule.type && msg.entitySchedule.name) {
        const label = msg.entitySchedule.type === 'lecturer'
          ? `Открыть расписание: ${msg.entitySchedule.name}`
          : `Открыть расписание группы ${msg.entitySchedule.name}`;
        entityCtaHtml = `
          <button type="button" class="ai-entity-cta" data-entity-type="${escapeHtml(msg.entitySchedule.type)}" data-entity-name="${escapeHtml(msg.entitySchedule.name)}">
            <i class="mdi mdi-calendar-clock"></i>
            <span>${escapeHtml(label)}</span>
          </button>
        `;
      }

      return `
        <div class="ai-bot-card" data-msg-idx="${idx}">
          <div class="ai-bot-header">
            <i class="mdi mdi-creation"></i>
            <span>ИИ-навигатор</span>
          </div>
          <div class="ai-bot-answer">${renderMultiline(msg.answer || '')}</div>
          ${entityCtaHtml}
          ${routeCtaHtml}
          ${roomsHtml ? `<div class="ai-suggested-rooms">${roomsHtml}</div>` : ''}
        </div>
      `;
    }).join('');

    const loadingHtml = aiLoading
      ? `
        <div class="ai-loading">
          <div class="spinner"></div>
          <span>Анализирую карту и расписание…</span>
        </div>
      `
      : '';

    feedHtml = `<div class="ai-feed" id="ai-feed">${messagesInner}${loadingHtml}</div>`;
  }

  const promptsHtml = AI_QUICK_PROMPTS.map(p =>
    `<button type="button" class="ai-prompt-chip" data-prompt="${escapeHtml(p)}">${escapeHtml(p)}</button>`
  ).join('');

  const dockHtml = `
    <div class="ai-chat-dock">
      <div class="ai-suggestions-strip" id="ai-suggestions-strip">${promptsHtml}</div>
      <form class="ai-composer-form" id="ai-panel-form">
        <div class="ai-input-wrap">
          <input type="text" class="ai-input" id="ai-panel-input" placeholder="Напишите вопрос ИИ…" autocomplete="off" ${aiLoading ? 'disabled' : ''}>
          <button type="button" class="input-clear-btn hidden" id="ai-input-clear" title="Очистить" aria-label="Очистить">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
        <button type="submit" class="ai-send-btn" id="ai-panel-send" ${aiLoading ? 'disabled' : ''} title="Отправить сообщение">
          <i class="mdi mdi-send"></i>
        </button>
      </form>
    </div>
  `;

  panel.innerHTML = `${headerHtml}<div class="ai-chat-scroll" id="ai-chat-scroll">${feedHtml}</div>${dockHtml}`;

  const strip = document.getElementById('ai-suggestions-strip');
  if (strip) {
    strip.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        strip.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  const form = document.getElementById('ai-panel-form');
  const input = document.getElementById('ai-panel-input');
  const aiClearBtn = document.getElementById('ai-input-clear');
  if (form && input) {
    const syncAiClear = () => {
      if (aiClearBtn) aiClearBtn.classList.toggle('hidden', !input.value);
    };
    input.addEventListener('input', syncAiClear);
    if (aiClearBtn) {
      aiClearBtn.addEventListener('click', () => {
        input.value = '';
        syncAiClear();
        input.focus();
      });
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || aiLoading) return;
      submitAiQuery(q);
    });
  }

  panel.querySelectorAll('.ai-prompt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (aiLoading) return;
      submitAiQuery(btn.dataset.prompt);
    });
  });

  panel.querySelectorAll('.ai-room-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const roomId = btn.dataset.roomId;
      const action = btn.dataset.action;
      if (!roomId) return;
      if (action === 'route') {
        startRouteToRoom(roomId);
      } else {
        focusRoomFromAi(roomId);
      }
    });
  });

  panel.querySelectorAll('.ai-room-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.ai-room-btn')) return;
      const roomId = card.dataset.roomId;
      if (roomId) focusRoomFromAi(roomId);
    });
  });

  panel.querySelectorAll('.ai-route-cta').forEach(btn => {
    btn.addEventListener('click', () => {
      const fromId = btn.dataset.from;
      const toId = btn.dataset.to;
      if (fromId && toId) {
        executeRouteBetween(fromId, toId);
      }
    });
  });

  panel.querySelectorAll('.ai-entity-cta').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.entityType;
      const name = btn.dataset.entityName;
      if (type && name) {
        openEntitySchedule(type, name);
      }
    });
  });

  const scrollContainer = document.getElementById('ai-chat-scroll');
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }

  updatePanelHandle();
  syncModeUI();
}

function panToRoom(roomId) {
  const centroid = getShapeCentroidSvg(roomId);
  if (!centroid) return;
  const { H } = currentSvgViewBox;
  const targetLatLng = [H - centroid.y, centroid.x];
  const targetZoom = Math.max(map.getZoom(), 0.25);
  map.flyTo(targetLatLng, targetZoom, { animate: true, duration: 0.45 });
  scheduleLabelRefresh();
}

async function focusRoomFromAi(roomId) {
  if (scheduleViewOpen) {
    closeScheduleView({ updateHistory: false });
  }
  const meta = roomsMeta[roomId];
  if (!meta) return;
  const b = BUILDINGS[meta.building];
  if (!b) return;
  const availableFloors = Object.keys(b.floors).map(Number);
  const targetFloor = (meta.floor != null && availableFloors.includes(meta.floor)) ? meta.floor : availableFloors[0];

  if (currentBuilding !== meta.building || currentFloor !== targetFloor) {
    await showFloor(meta.building, targetFloor);
  }
  selectRoom(roomId);
  panToRoom(roomId);
  const shapes = roomShapes[roomId];
  if (shapes && shapes.length) {
    shapes.forEach(s => { s.style.opacity = '0.7'; });
    setTimeout(() => shapes.forEach(s => { s.style.opacity = ''; }), 1500);
  }
  haptic('light');
}

async function submitAiQuery(query) {
  aiMessages.push({ role: 'user', text: query });
  aiLoading = true;
  renderAiPanel();

  try {
    const res = await fetch('/api/ai-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, currentFloor })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const validRooms = (data.roomIds || [])
      .filter(id => roomsMeta[id])
      .map(id => ({ id }));

    aiMessages.push({
      role: 'assistant',
      answer: data.answer || 'Готово!',
      rooms: validRooms,
      route: data.route || null,
      entitySchedule: data.entitySchedule || null
    });

    // Если найдена ровно одна целевая комната и нет маршрута — сразу подсвечиваем и перемещаем к ней карту
    if (validRooms.length === 1 && !data.route) {
      focusRoomFromAi(validRooms[0].id);
    }
    haptic('success');
  } catch (err) {
    console.error('[ai-assistant]', err);
    aiMessages.push({
      role: 'assistant',
      answer: 'Не удалось связаться с сервером помощника. Попробуйте ещё раз.',
      rooms: [],
      route: null,
      entitySchedule: null
    });
    haptic('error');
  } finally {
    aiLoading = false;
    if (panelMode === 'ai') {
      renderAiPanel();
    }
  }
}

// ================ ТЕМА ================

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const updateIcon = () => {
    const theme = document.documentElement.dataset.theme || 'light';
    btn.innerHTML = theme === 'dark'
      ? '<i class="mdi mdi-weather-sunny"></i>'
      : '<i class="mdi mdi-weather-night"></i>';
  };
  updateIcon();
  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    updateIcon();
  });
}

// ================ СБРОС ВИДА ================

function setupResetControl() {
  const ResetControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'leaflet-control-reset');
      const btn = L.DomUtil.create('button', 'reset-view-btn', wrap);
      btn.title = 'Сбросить вид';
      btn.innerHTML = '<i class="mdi mdi-image-filter-center-focus"></i>';
      L.DomEvent.disableClickPropagation(wrap);
      btn.addEventListener('click', resetView);
      return wrap;
    }
  });
  return new ResetControl();
}

function resetView() {
  if (currentOverlay) {
    const bounds = currentOverlay.getBounds();
    map.fitBounds(bounds);
    scheduleLabelRefresh();
  }
}

// ================ НАВИГАЦИЯ ================

async function navigateToRoom(roomId) {
  if (scheduleViewOpen) {
    closeScheduleView({ updateHistory: false });
  }
  const meta = roomsMeta[roomId];
  if (!meta) return;
  const b = BUILDINGS[meta.building];
  if (!b) return;

  const availableFloors = Object.keys(b.floors).map(Number);
  let targetFloor = meta.floor;

  if (targetFloor == null || !availableFloors.includes(targetFloor)) {
    if (!availableFloors.length) {
      showToast(`Этажи корпуса «${b.name}» ещё не добавлены на карту`);
      return;
    }
    targetFloor = availableFloors[0];
  }

  pendingHighlight = roomId;
  currentBuilding = meta.building;
  await showFloor(meta.building, targetFloor);
  onRoomClick(roomId);
  setTimeout(() => panToRoom(roomId), 270);
}

// ================ ОТРИСОВКА ЭТАЖА ================

async function showFloor(buildingCode, floorNum) {
  const b = BUILDINGS[buildingCode];
  const svgUrl = b?.floors?.[floorNum];
  if (!svgUrl) return;

  currentBuilding = buildingCode;
  currentFloor = floorNum;
  clearSelectedRoom();
  hoveredRoomId = null;

  const svgText = await fetch(svgUrl).then(r => r.text());
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return;

  const vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
  const W = vb[2], H = vb[3];
  currentSvgViewBox = { W, H };

  if (currentOverlay) map.removeLayer(currentOverlay);
  if (currentLabels) map.removeLayer(currentLabels);
  currentLabels = null;

  const bounds = [[0, 0], [H, W]];
  currentOverlay = L.svgOverlay(svgEl, bounds).addTo(map);
  map.fitBounds(bounds);

  svgEl.style.pointerEvents = 'none';

  roomShapes = {};

  svgEl.querySelectorAll('rect[id], path[id], polygon[id], circle[id], ellipse[id]').forEach(shape => {
    const id = shape.getAttribute('id');
    if (!roomsMeta[id]) return;
    if (!roomShapes[id]) roomShapes[id] = [];
    roomShapes[id].push(shape);
  });

  svgEl.querySelectorAll('g[id]').forEach(g => {
    const id = g.getAttribute('id');
    if (!roomsMeta[id]) return;
    if (!roomShapes[id]) roomShapes[id] = [];
    g.querySelectorAll('rect, path, polygon, circle, ellipse').forEach(shape => {
      const ownId = shape.getAttribute('id');
      if (ownId && roomsMeta[ownId]) return;
      roomShapes[id].push(shape);
    });
  });

  Object.values(roomShapes).forEach(shapes => {
    shapes.forEach(s => {
      s.style.pointerEvents = 'auto';
      s.style.cursor = 'pointer';
      s.style.transition = 'filter 0.15s ease';
    });
  });

  const findRoomIdForShape = (el) => {
    let cur = el;
    while (cur && cur !== svgEl) {
      if (cur.nodeType === 1 && cur.hasAttribute && cur.hasAttribute('id')) {
        const id = cur.getAttribute('id');
        if (roomsMeta[id] && roomShapes[id]) return id;
      }
      cur = cur.parentNode;
    }
    return null;
  };

  svgEl.addEventListener('mouseover', (e) => {
    const id = findRoomIdForShape(e.target);
    if (!id || id === hoveredRoomId) return;
    if (hoveredRoomId) {
      (roomShapes[hoveredRoomId] || []).forEach(s => { s.style.filter = ''; });
    }
    hoveredRoomId = id;
    (roomShapes[id] || []).forEach(s => {
      s.style.filter = 'brightness(0.78) saturate(1.35)';
    });
  });

  svgEl.addEventListener('mouseout', (e) => {
    const nextEl = e.relatedTarget;
    const nextId = nextEl ? findRoomIdForShape(nextEl) : null;
    if (nextId === hoveredRoomId) return;
    if (hoveredRoomId) {
      (roomShapes[hoveredRoomId] || []).forEach(s => { s.style.filter = ''; });
      hoveredRoomId = null;
    }
  });

  svgEl.addEventListener('click', (e) => {
    const id = findRoomIdForShape(e.target);
    if (!id) return;
    e.stopPropagation();
    haptic('light');

    if (panelMode === 'route') {
      handleRouteMapPick(id);
    } else {
      onRoomClick(id);
    }
  });

  updateTabActive();
  updateFloorSwitcher();
  applyFreeHighlight();
  refreshRoutePickHighlight();
  scheduleLabelRefresh();

  if (selectedRoomId && roomShapes[selectedRoomId]) selectRoom(selectedRoomId);
  if (pendingHighlight && roomShapes[pendingHighlight]) {
    const shapes = roomShapes[pendingHighlight];
    shapes.forEach(s => s.style.opacity = '0.65');
    setTimeout(() => shapes.forEach(s => s.style.opacity = ''), 1500);
    pendingHighlight = null;
  }

  if (routeState.path) redrawRoute();

  if (freeModeOn && panelMode === 'free' && !freePanelCollapsed &&
      document.getElementById('panel').classList.contains('open')) {
    renderFreePanel();
  }
}

// ================ ПОДПИСИ ================

function scheduleLabelRefresh() {
  if (labelTimer) clearTimeout(labelTimer);
  labelTimer = setTimeout(() => { labelTimer = null; placeLabels(); }, 400);
}

function placeLabels() {
  if (currentLabels) map.removeLayer(currentLabels);
  currentLabels = L.layerGroup().addTo(map);

  const mapRect = map.getContainer().getBoundingClientRect();

  for (const [id, shapes] of Object.entries(roomShapes)) {
    const meta = roomsMeta[id];
    const labelText = meta?.shortName;
    if (!labelText) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let anyValid = false;
    for (const shape of shapes) {
      const r = shape.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) continue;
      anyValid = true;
      if (r.left   < minX) minX = r.left;
      if (r.top    < minY) minY = r.top;
      if (r.right  > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    }
    if (!anyValid) continue;

    const cX = (minX + maxX) / 2 - mapRect.left;
    const cY = (minY + maxY) / 2 - mapRect.top;
    const latlng = map.containerPointToLatLng(L.point(cX, cY));

    const labelHtml = renderMultiline(labelText);

    const icon = L.divIcon({
      className: 'room-label-wrap',
      html: `<span class="room-label">${labelHtml}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    L.marker(latlng, { icon, interactive: false, keyboard: false }).addTo(currentLabels);
  }
}

window.addEventListener('resize', scheduleLabelRefresh);

// ================ «СЕЙЧАС В АУДИТОРИИ» ================

function computeNowStatus(data) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayD = now.getDate();
  const todayM = now.getMonth() + 1;

  const totalLessons = data.days.reduce((sum, d) => sum + d.lessons.length, 0);
  if (totalLessons === 0) return { type: 'none' };

  const parseStart = (t) => {
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : null;
  };
  const parseEnd = (t) => {
    const m = t.match(/[–-](\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : null;
  };

  const todayIdx = data.days.findIndex(d => d.date && d.date.d === todayD && d.date.m === todayM);

  if (todayIdx !== -1) {
    const todayLessons = data.days[todayIdx].lessons;
    const current = todayLessons.find(l => {
      const s = parseStart(l.time);
      const e = parseEnd(l.time);
      return s !== null && e !== null && nowMin >= s && nowMin <= e;
    });
    if (current) {
      const endMatch = current.time.match(/[–-](\d{1,2}:\d{2})/);
      return { type: 'busy', subject: current.subject, untilText: endMatch ? endMatch[1] : '' };
    }
    const next = todayLessons.find(l => {
      const s = parseStart(l.time);
      return s !== null && s > nowMin;
    });
    if (next) {
      const startMatch = next.time.match(/^(\d{1,2}:\d{2})/);
      return { type: 'free', untilText: startMatch ? startMatch[1] : '' };
    }
  }

  const startIdx = todayIdx === -1 ? 0 : todayIdx + 1;
  for (let i = startIdx; i < data.days.length; i++) {
    if (data.days[i].lessons.length > 0) {
      const dayName = data.days[i].dayName;
      const genitive = DAY_GENITIVE[dayName] || dayName.toLowerCase();
      const firstLesson = data.days[i].lessons[0];
      const startMatch = firstLesson.time.match(/^(\d{1,2}:\d{2})/);
      return {
        type: 'free',
        untilText: `${genitive}` + (startMatch ? ` в ${startMatch[1]}` : '')
      };
    }
  }
  return { type: 'free', untilText: 'до конца недели' };
}

function renderNowStatus(status) {
  if (status.type === 'none') {
    return `<div class="now-status none"><div class="now-dot"></div><div class="now-body"><div class="now-title">Пар на этой неделе нет</div><div class="now-details">Аудитория всегда свободна</div></div></div>`;
  }
  if (status.type === 'busy') {
    return `<div class="now-status busy"><div class="now-dot"></div><div class="now-body"><div class="now-title">Сейчас идёт пара</div><div class="now-details">${escapeHtml(status.subject)}${status.untilText ? ' · до ' + status.untilText : ''}</div></div></div>`;
  }
  return `<div class="now-status free"><div class="now-dot"></div><div class="now-body"><div class="now-title">Аудитория свободна</div><div class="now-details">${status.untilText ? 'до ' + status.untilText : 'до конца дня'}</div></div></div>`;
}

function buildRoomActionBar(roomId) {
  return `
    <div class="room-action-bar">
      <button type="button" class="room-action-btn primary" data-route-to="${escapeHtml(roomId)}">
        <i class="mdi mdi-directions"></i>
        <span>Маршрут сюда</span>
      </button>
      <button type="button" class="room-action-btn" data-route-from="${escapeHtml(roomId)}">
        <i class="mdi mdi-ray-start-arrow"></i>
        <span>Отсюда</span>
      </button>
    </div>
  `;
}

function attachRoomActionListeners(panel, id) {
  attachShareListener(panel, id);
  const toBtn = panel.querySelector('[data-route-to]');
  if (toBtn) {
    toBtn.addEventListener('click', () => startRouteToRoom(id));
  }
  const fromBtn = panel.querySelector('[data-route-from]');
  if (fromBtn) {
    fromBtn.addEventListener('click', () => startRouteFromRoom(id));
  }
}

// ================ КЛИК ПО АУДИТОРИИ ================

async function onRoomClick(id, { pushHistory = true } = {}) {
  const meta = roomsMeta[id];
  const panel = document.getElementById('panel');

  if (currentRoomPanelId === id && panelMode === 'room') {
    closeRoomPanel();
    return;
  }

  const token = ++roomRequestToken;

  openPanel();
  panelMode = 'room';
  currentRoomPanelId = id;

  selectRoom(id);
  updateURL(id, { push: pushHistory });
  updatePanelHandle();
  syncModeUI();

  const title = formatRoomName(meta?.name || id);
  const b = meta ? BUILDINGS[meta.building] : null;

  const crumbs = b ? `${b.name}${meta.floor != null ? ' · ' + meta.floor + ' этаж' : ''}` : '';
  const shareIcon = `<i class="mdi mdi-link-variant share-icon" title="Скопировать ссылку"></i>`;
  const closeBtn = freeModeOn
    ? `<button class="back-btn" onclick="closeRoomPanel()" title="Вернуться к списку свободных"><i class="mdi mdi-arrow-left"></i></button>`
    : `<button class="close" onclick="closeRoomPanel()">✕</button>`;

  const header = `
    <div class="panel-header">
      ${closeBtn}
      ${crumbs ? `<div class="panel-crumbs">${escapeHtml(crumbs)}</div>` : ''}
      <h2>${escapeHtml(title)}${shareIcon}</h2>
    </div>
    ${buildRoomActionBar(id)}
  `;

  const descriptionBlock = meta?.description
    ? `<div class="room-notes">${renderMultiline(meta.description)}</div>`
    : '';

  if (!meta || !meta.building || !meta.classroom) {
    const block = descriptionBlock ||
      `<div class="room-notes empty">У этого помещения нет заметок.</div>`;
    panel.innerHTML = buildPanelLayout(`${header}${block}`, '');
    attachRoomActionListeners(panel, id);
    return;
  }

  panel.innerHTML = buildPanelLayout(
    `${header}${descriptionBlock}`,
    `<p class="muted-text">Загрузка расписания…</p>`
  );
  attachRoomActionListeners(panel, id);

  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const shift = today.getDay() === 0 ? 1 : 1 - today.getDay();
  monday.setDate(today.getDate() + shift);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  const isoDate = `${yyyy}-${mm}-${dd}`;

  const url = `/api/schedule?building=${encodeURIComponent(meta.building)}&classroom=${encodeURIComponent(meta.classroom)}&date=${isoDate}`;

  try {
    const res = await fetch(url);
    if (token !== roomRequestToken) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const data = parseSchedule(html);

    if (token !== roomRequestToken) return;
    if (currentRoomPanelId !== id || panelMode !== 'room') return;

    if (data.empty) {
      panel.innerHTML = buildPanelLayout(
        `${header}${descriptionBlock}`,
        `<div class="no-schedule-msg">У этой аудитории нет расписания занятий</div>`
      );
      attachRoomActionListeners(panel, id);
      return;
    }
    renderSchedule(panel, title, data, header, descriptionBlock);
    attachRoomActionListeners(panel, id);
    haptic('success');
  } catch (err) {
    if (token !== roomRequestToken) return;
    if (currentRoomPanelId !== id || panelMode !== 'room') return;

    panel.innerHTML = buildPanelLayout(
      `${header}${descriptionBlock}`,
      `<p style="color:#f87171">Ошибка загрузки: ${escapeHtml(err.message)}</p>`
    );
    attachRoomActionListeners(panel, id);
    haptic('error');
  }
}

// ================ ПОДЕЛИТЬСЯ ================

function attachShareListener(panel, id) {
  const icon = panel.querySelector('.share-icon');
  if (!icon) return;
  icon.addEventListener('click', async () => {
    const meta = roomsMeta[id];
    if (!meta) return;
    const url = new URL(location);
    url.searchParams.set('building', meta.building);
    if (meta.floor != null) url.searchParams.set('floor', meta.floor);
    url.searchParams.set('room', id);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('Ссылка скопирована');
      haptic('success');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = url.toString();
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('Ссылка скопирована'); }
      catch (err) { showToast('Не удалось скопировать ссылку'); }
      document.body.removeChild(ta);
    }
  });
}

// ================ TOAST ================

function showToast(text) {
  document.querySelectorAll('#map-wrap .toast').forEach(el => el.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.getElementById('map-wrap').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2000);
}

// ================ ПАРСЕР РАСПИСАНИЯ ================

function parseWeekType(doc) {
  const dateSelect = doc.querySelector('select[name="date"]');
  if (!dateSelect) return null;
  const selected = dateSelect.querySelector('option[selected]') ||
                   dateSelect.options[dateSelect.selectedIndex];
  if (!selected) return null;
  const text = (selected.textContent || '').toLowerCase();
  if (text.includes('числ')) return 'числитель';
  if (text.includes('знам')) return 'знаменатель';
  return null;
}

function splitGroupAndLecturerClient(rawTail) {
  const combined = String(rawTail || '').trim();
  if (!combined) return { group: '', lecturer: '' };

  const tokens = combined.split(',').map(t => t.trim()).filter(Boolean);
  const groupTokens = [];
  const lecturerTokens = [];
  let hitLecturer = false;

  const isGroupLike = (tok) => {
    if (/^(доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.|к\.т\.н\.|д\.т\.н\.)/i.test(tok)) return false;
    if (/[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\./.test(tok)) return false;
    if (/^\d/.test(tok)) return true;
    if (/п\.?\s*г\.?/i.test(tok) || /подгр/i.test(tok)) return true;
    if (/^[А-ЯЁA-Z0-9-]{2,8}$/i.test(tok) && /\d/.test(tok)) return true;
    return false;
  };

  for (const tok of tokens) {
    if (!hitLecturer && isGroupLike(tok)) {
      groupTokens.push(tok);
    } else {
      hitLecturer = true;
      lecturerTokens.push(tok);
    }
  }

  return {
    group: groupTokens.join(', '),
    lecturer: lecturerTokens.join(', ')
  };
}

function parseSchedule(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const weekType = parseWeekType(doc);
  const dateSelect = doc.querySelector('select[name="date"]');
  const dateOptions = dateSelect ? [...dateSelect.options].filter(o => o.value) : [];
  if (dateOptions.length === 0) return { empty: true, days: [], weekType };

  const table = doc.querySelector('table.table');
  if (!table) return { empty: false, days: [], weekType };

  const rows = [...table.rows];
  if (rows.length < 2) return { empty: false, days: [], weekType };

  const headerCells = [...rows[0].cells].slice(1);
  const days = headerCells.map(th => {
    const span = th.querySelector('span');
    const dateText = span ? span.textContent.trim() : '';
    const dm = dateText.match(/(\d{1,2})\s+([а-яёА-ЯЁ]+)/);
    let date = null;
    if (dm) {
      const d = +dm[1];
      const m = MONTH_NAMES.indexOf(dm[2].toLowerCase());
      if (m !== -1) date = { d, m: m + 1 };
    }
    const fullTitle = (th.textContent || '').replace(/\s+/g, ' ').trim();
    const dayName = fullTitle.split(' ').pop();
    return { date, dateText, dayName, lessons: [] };
  });

  for (let i = 1; i < rows.length; i++) {
    const cells = [...rows[i].cells];
    if (cells.length < 2) continue;
    const timeDivs = cells[0].querySelectorAll('div');
    const start = timeDivs[0]?.textContent.trim() || '';
    const end   = timeDivs[1]?.textContent.trim() || '';
    if (!start || !end) continue;
    const time = `${start}–${end}`;
    for (let d = 0; d < days.length; d++) {
      const cell = cells[d + 1];
      if (!cell || !cell.classList.contains('schedule-cell')) continue;
      const items = cell.querySelectorAll(':scope > div');
      items.forEach(item => {
        const badge = item.querySelector('.schedule-lesson-type-badge');
        const type  = badge ? badge.textContent.trim() : '';
        const clone = item.cloneNode(true);
        const badgeClone = clone.querySelector('.schedule-lesson-type-badge');
        if (badgeClone) badgeClone.remove();
        const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
        let subject = text, group = '', lecturer = '';
        const m = text.match(/^(.*?),?\s*гр\.\s*(.+)$/);
        if (m) {
          subject = m[1].replace(/,\s*$/, '').trim();
          const parsedTail = splitGroupAndLecturerClient(m[2]);
          group = parsedTail.group;
          lecturer = parsedTail.lecturer;
        }
        days[d].lessons.push({ time, type, subject, group, lecturer });
      });
    }
  }

  days.forEach(day => {
    const byTime = new Map();
    day.lessons.forEach(l => {
      if (!byTime.has(l.time)) byTime.set(l.time, []);
      byTime.get(l.time).push(l);
    });
    day.lessons = [...byTime.entries()].map(([time, items]) => {
      if (items.length === 1) return items[0];
      const subgroups = items.map(i => ({ group: i.group, lecturer: i.lecturer }));
      return { time, type: items[0].type, subject: items[0].subject, group: '', lecturer: '', subgroups };
    });
    day.lessons.sort((a, b) => a.time.localeCompare(b.time));
  });

  return { empty: false, days, weekType };
}

function formatInteractiveGroupAndLecturerHtml(groupStr, lecturerStr) {
  let groupPart = '';
  if (groupStr) {
    const renderedGroups = String(groupStr).replace(/\b(\d{2,5}[а-яa-z]?)\b/gi, (match) =>
      `<span class="entity-inline-link" data-entity-type="group" data-entity-name="${escapeHtml(match)}" title="Открыть расписание группы ${escapeHtml(match)}">${escapeHtml(match)}</span>`
    );
    groupPart = `гр. ${renderedGroups}`;
  }
  let lecPart = '';
  if (lecturerStr) {
    lecPart = `<span class="entity-inline-link" data-entity-type="lecturer" data-entity-name="${escapeHtml(lecturerStr)}" title="Открыть расписание преподавателя">${escapeHtml(lecturerStr)}</span>`;
  }
  return `${groupPart}${groupPart && lecPart ? ' · ' : ''}${lecPart}`;
}

function attachEntityInlineLinks(container) {
  if (!container) return;
  container.querySelectorAll('.entity-inline-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = el.dataset.entityType;
      const name = el.dataset.entityName;
      if (type && name) {
        openEntitySchedule(type, name);
      }
    });
  });
}

// ================ РЕНДЕР РАСПИСАНИЯ ================

function renderSchedule(panel, title, data, header, descriptionBlock = '') {
  const nowStatus = computeNowStatus(data);
  const today = new Date();
  const nowMin = today.getHours() * 60 + today.getMinutes();

  const weekChip = data.weekType ? `<span class="week-chip">${data.weekType}</span>` : '';

  const fixedHtml = `
    ${header}
    ${weekChip ? `<div style="margin-top:6px;margin-bottom:14px">${weekChip}</div>` : ''}
    ${descriptionBlock}
    ${renderNowStatus(nowStatus)}
  `;

  const daysHtml = data.days.map(day => {
    const isToday = day.date
      && day.date.d === today.getDate()
      && day.date.m === (today.getMonth() + 1);

    const lessonsHtml = day.lessons.length === 0
      ? `<div class="lesson empty">—</div>`
      : day.lessons.map(l => {
          const m = l.time.match(/(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/);
          let status = '';
          if (isToday && m) {
            const s = +m[1] * 60 + +m[2];
            const e = +m[3] * 60 + +m[4];
            if (nowMin >= s && nowMin <= e) status = 'now';
          }
          const cls = status === 'now' ? 'lesson now' : 'lesson';

          let badgeHtml = '';
          if (l.type && LESSON_TYPES[l.type]) {
            const t = LESSON_TYPES[l.type];
            badgeHtml = `<span class="badge ${t.cls}"><i class="mdi ${t.icon}"></i>${l.type}</span>`;
          } else if (l.type) {
            badgeHtml = `<span class="badge pr">${escapeHtml(l.type)}</span>`;
          }

          let breakText = '';
          const mStart = l.time.match(/^(\d{1,2}:\d{2})/);
          if (mStart && BREAKS[mStart[1]]) {
            breakText = ` · перерыв ${BREAKS[mStart[1]]}`;
          }

          let metaHtml = '';
          if (l.subgroups && l.subgroups.length > 1) {
            metaHtml = l.subgroups.map(sg => `
              <div class="subgroup">
                ${formatInteractiveGroupAndLecturerHtml(sg.group, sg.lecturer)}
              </div>
            `).join('');
          } else {
            metaHtml = `<div class="meta">${formatInteractiveGroupAndLecturerHtml(l.group, l.lecturer)}</div>`;
          }

          return `
            <div class="${cls}">
              <div class="time">${l.time}${breakText}</div>
              <div class="subject">${badgeHtml}${escapeHtml(l.subject)}</div>
              ${metaHtml}
            </div>`;
        }).join('');

    return `
      <div class="day-block${isToday ? ' today' : ''}">
        <div class="day-header">${day.dayName}${day.dateText ? ', ' + day.dateText : ''}${isToday ? ' · сегодня' : ''}</div>
        ${lessonsHtml}
      </div>`;
  }).join('');

  panel.innerHTML = buildPanelLayout(fixedHtml, daysHtml);
  attachEntityInlineLinks(panel);
}

// ================ ПОЛНОЭКРАННЫЙ РАЗДЕЛ РАСПИСАНИЯ (ГРУППЫ И ПРЕПОДАВАТЕЛИ) ================

async function loadScheduleDirectory() {
  try {
    const res = await fetch('/api/schedule-directory');
    if (!res.ok) return;
    const data = await res.json();
    scheduleDirectory = {
      ready: Boolean(data.ready),
      groups: data.groups || [],
      lecturers: data.lecturers || []
    };
  } catch (e) {
    console.warn('[schedule-directory]', e.message);
  }
}

function updateScheduleURL({ push = false } = {}) {
  if (isPoppingState) return;
  const url = new URL(location);
  if (scheduleViewOpen) {
    url.searchParams.set('view', 'schedule');
    url.searchParams.delete('room');
    if (currentEntitySchedule && currentEntitySchedule.type && currentEntitySchedule.name) {
      url.searchParams.set('type', currentEntitySchedule.type);
      url.searchParams.set('name', currentEntitySchedule.name);
    } else {
      url.searchParams.delete('type');
      url.searchParams.delete('name');
    }
  } else {
    url.searchParams.delete('view');
    url.searchParams.delete('type');
    url.searchParams.delete('name');
  }
  const currentUrl = location.pathname + location.search;
  const newUrl = url.pathname + url.search;
  if (currentUrl === newUrl) return;
  if (push) history.pushState({}, '', url);
  else history.replaceState({}, '', url);
}

function closeScheduleView({ updateHistory = true } = {}) {
  const view = document.getElementById('schedule-view');
  if (!view) return;
  scheduleViewOpen = false;
  view.classList.add('hidden');
  document.body.classList.remove('schedule-view-active');
  if (updateHistory) updateScheduleURL({ push: false });
  updatePanelHandle();
  syncModeUI();
  setTimeout(() => {
    map.invalidateSize({ animate: false });
    scheduleLabelRefresh();
  }, 60);
}

async function openScheduleDirectory(tab = null) {
  if (scheduleViewOpen && !tab) {
    closeScheduleView();
    return;
  }

  if (tab) directoryActiveTab = tab;
  scheduleViewOpen = true;
  scheduleMobileStep = 'list';
  document.body.classList.add('schedule-view-active');

  const view = document.getElementById('schedule-view');
  if (view) view.classList.remove('hidden');

  updatePanelHandle();
  syncModeUI();

  if (!scheduleDirectory.ready || (scheduleDirectory.groups.length === 0 && scheduleDirectory.lecturers.length === 0)) {
    renderScheduleWorkspace();
    await loadScheduleDirectory();
  }

  // На десктопе сразу открываем выбранную ранее группу/преподавателя или первую группу в списке,
  // чтобы правая часть страницы сразу показывала полноценное расписание
  if (!currentEntitySchedule && window.innerWidth > 768) {
    if (directoryActiveTab === 'lecturers' && scheduleDirectory.lecturers.length > 0) {
      await selectScheduleEntity('lecturer', scheduleDirectory.lecturers[0].name, { switchMobileToDetail: false });
      return;
    } else if (scheduleDirectory.groups.length > 0) {
      const preferred = scheduleDirectory.groups.find(g => g.name === '445') || scheduleDirectory.groups[0];
      await selectScheduleEntity('group', preferred.name, { switchMobileToDetail: false });
      return;
    }
  }

  updateScheduleURL({ push: false });
  renderScheduleWorkspace();
}

async function openEntitySchedule(type, name) {
  scheduleViewOpen = true;
  scheduleMobileStep = 'detail';
  directoryActiveTab = type === 'group' ? 'groups' : 'lecturers';
  document.body.classList.add('schedule-view-active');

  const view = document.getElementById('schedule-view');
  if (view) view.classList.remove('hidden');

  updatePanelHandle();
  syncModeUI();

  if (!scheduleDirectory.ready || (scheduleDirectory.groups.length === 0 && scheduleDirectory.lecturers.length === 0)) {
    await loadScheduleDirectory();
  }

  await selectScheduleEntity(type, name, { switchMobileToDetail: true });
}

async function selectScheduleEntity(type, name, { switchMobileToDetail = true } = {}) {
  currentEntitySchedule = { type, name };
  scheduleDayFilter = 'all';
  if (switchMobileToDetail) scheduleMobileStep = 'detail';
  entityLoading = true;
  entityError = null;
  updateScheduleURL({ push: false });
  renderScheduleWorkspace();

  try {
    const res = await fetch(`/api/entity-schedule?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('Расписание не найдено');
    const data = await res.json();
    currentEntityData = data;
    currentEntitySchedule = { type: data.entityType || type, name: data.name || name };
    entityLoading = false;
    renderScheduleWorkspace();
    haptic('success');
  } catch (e) {
    entityLoading = false;
    entityError = e.message || 'Ошибка загрузки расписания';
    renderScheduleWorkspace();
  }
}

function renderScheduleWorkspace() {
  const view = document.getElementById('schedule-view');
  if (!view) return;

  view.dataset.mobileStep = scheduleMobileStep;

  const q = directoryFilterQuery.toLowerCase().replace(/ё/g, 'е').trim();
  const filteredGroups = scheduleDirectory.groups.filter(g =>
    !q || g.name.toLowerCase().replace(/ё/g, 'е').includes(q)
  );
  const filteredLecturers = scheduleDirectory.lecturers.filter(l =>
    !q || l.name.toLowerCase().replace(/ё/g, 'е').includes(q) || l.shortName.toLowerCase().replace(/ё/g, 'е').includes(q)
  );

  const listItems = directoryActiveTab === 'groups' ? filteredGroups : filteredLecturers;
  let sidebarListHtml = '';

  if (!scheduleDirectory.ready) {
    sidebarListHtml = `<div class="free-warming"><div class="spinner"></div><div>Загружаем справочник расписания…</div></div>`;
  } else if (listItems.length === 0) {
    sidebarListHtml = `<div class="free-panel-empty">Ничего не найдено по запросу «${escapeHtml(directoryFilterQuery)}»</div>`;
  } else {
    sidebarListHtml = listItems.map(item => {
      const itemType = directoryActiveTab === 'groups' ? 'group' : 'lecturer';
      const isActive = currentEntitySchedule &&
        currentEntitySchedule.type === itemType &&
        currentEntitySchedule.name === item.name;
      const titleText = itemType === 'group' ? `Группа ${item.name}` : item.name;
      return `
        <button type="button" class="sched-dir-item ${isActive ? 'active' : ''}" data-entity-type="${itemType}" data-entity-name="${escapeHtml(item.name)}">
          <div class="sched-dir-main">
            <div class="sched-dir-title">${escapeHtml(titleText)}</div>
            <div class="sched-dir-sub">${item.lessonsCount} пар в неделю · ${item.roomsCount} ауд.</div>
          </div>
          <i class="mdi mdi-chevron-right sched-dir-arrow"></i>
        </button>
      `;
    }).join('');
  }

  const mainHtml = renderScheduleMainPane();

  view.innerHTML = `
    <div class="schedule-workspace">
      <aside class="schedule-sidebar">
        <div class="schedule-sidebar-top">
          <div class="schedule-sidebar-title-row">
            <div>
              <div class="panel-crumbs">РГРТУ · Главный корпус</div>
              <h2 class="schedule-sidebar-heading">Расписание</h2>
            </div>
            <button type="button" class="schedule-back-map-btn" id="schedule-close-btn" title="Вернуться на интерактивную карту">
              <i class="mdi mdi-map-outline"></i>
              <span>На карту</span>
            </button>
          </div>

          <div class="sched-tabs">
            <button type="button" class="sched-tab ${directoryActiveTab === 'groups' ? 'active' : ''}" data-tab="groups">
              <span>Группы</span>
              <span class="sched-tab-count">${filteredGroups.length}</span>
            </button>
            <button type="button" class="sched-tab ${directoryActiveTab === 'lecturers' ? 'active' : ''}" data-tab="lecturers">
              <span>Преподаватели</span>
              <span class="sched-tab-count">${filteredLecturers.length}</span>
            </button>
          </div>

          <div class="sched-filter-wrap">
            <i class="mdi mdi-magnify sched-filter-icon"></i>
            <input type="text" class="sched-filter-input" id="sched-view-search"
                   placeholder="${directoryActiveTab === 'groups' ? 'Поиск группы (например, 445)…' : 'Поиск преподавателя (например, Устюков)…'}"
                   value="${escapeHtml(directoryFilterQuery)}" autocomplete="off">
            <button type="button" class="input-clear-btn ${directoryFilterQuery ? '' : 'hidden'}" id="sched-view-clear" title="Очистить поиск" aria-label="Очистить поиск">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
        </div>

        <div class="schedule-sidebar-list" id="schedule-sidebar-list">
          ${sidebarListHtml}
        </div>
      </aside>

      <main class="schedule-main" id="schedule-main">
        ${mainHtml}
      </main>
    </div>
  `;

  attachScheduleWorkspaceListeners(view);
}

function renderScheduleMainPane() {
  if (entityLoading) {
    return `
      <div class="schedule-main-empty">
        <div class="spinner"></div>
        <div class="schedule-empty-title">Загружаем расписание…</div>
      </div>
    `;
  }

  if (entityError) {
    return `
      <div class="schedule-main-empty">
        <button type="button" class="sched-mobile-back-btn" id="sched-mobile-back">
          <i class="mdi mdi-arrow-left"></i> К списку
        </button>
        <div class="schedule-empty-title">Не удалось загрузить расписание</div>
        <div class="schedule-empty-sub">${escapeHtml(entityError)}</div>
      </div>
    `;
  }

  if (!currentEntityData) {
    return `
      <div class="schedule-main-empty">
        <div class="schedule-empty-icon"><i class="mdi mdi-calendar-clock-outline"></i></div>
        <div class="schedule-empty-title">Выберите группу или преподавателя</div>
        <div class="schedule-empty-sub">В списке слева доступно расписание всех учебных групп и преподавателей Главного корпуса с быстрым переходом к любой аудитории на карте.</div>
      </div>
    `;
  }

  const data = currentEntityData;
  const isGroup = data.entityType === 'group';
  const title = isGroup ? `Группа ${data.name}` : data.name;
  const badgeLabel = isGroup ? 'Учебная группа' : 'Преподаватель';

  const st = data.nowStatus || { type: 'free', title: 'Сейчас пар нет', details: '' };
  const statusCardHtml = `
    <div class="now-status ${st.type === 'busy' ? 'busy' : 'free'} schedule-hero-status" ${st.roomId ? `data-room-id="${escapeHtml(st.roomId)}" style="cursor:pointer" title="Показать аудиторию на карте"` : ''}>
      <div class="now-dot"></div>
      <div class="now-body">
        <div class="now-title">${escapeHtml(st.title)}</div>
        <div class="now-details">${escapeHtml(st.details)}</div>
      </div>
      ${st.roomId ? `<span class="schedule-status-map-link"><i class="mdi mdi-map-marker-radius-outline"></i> На карте</span>` : ''}
    </div>
  `;

  const roomsChipsHtml = (data.rooms || []).map(r => `
    <button type="button" class="entity-room-chip" data-room-id="${escapeHtml(r.id)}" title="Показать ${escapeHtml(formatRoomName(r.name))} на карте (${r.floor} этаж)">
      <i class="mdi mdi-map-marker-radius-outline"></i>
      <span>ауд. ${escapeHtml(r.shortName)} · ${r.floor} эт.</span>
    </button>
  `).join('');

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const days = data.days || [];
  const totalLessonsCount = data.lessonsCount || days.reduce((acc, d) => acc + ((d.lessons && d.lessons.length) || 0), 0);

  const dayFilterPillsHtml = `
    <div class="schedule-day-filters">
      <button type="button" class="schedule-day-pill ${scheduleDayFilter === 'all' ? 'active' : ''}" data-day-filter="all">
        Вся неделя
      </button>
      ${days.map(d => {
        const isToday = d.date === todayISO;
        const count = (d.lessons || []).length;
        return `
          <button type="button" class="schedule-day-pill ${scheduleDayFilter === d.date ? 'active' : ''} ${isToday ? 'today' : ''}" data-day-filter="${escapeHtml(d.date)}">
            <span>${escapeHtml(d.dayName)}</span>
            ${count > 0 ? `<span class="schedule-day-pill-count">${count}</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;

  const visibleDays = scheduleDayFilter === 'all'
    ? days
    : days.filter(d => d.date === scheduleDayFilter);

  const daysGridHtml = visibleDays.map(day => {
    const isToday = day.date === todayISO;
    const [, mStr, dStr] = (day.date || '').split('-');
    const dateLabel = dStr && mStr ? `${parseInt(dStr, 10)} ${MONTH_NAMES[parseInt(mStr, 10) - 1] || ''}` : '';

    const lessonsHtml = (!day.lessons || day.lessons.length === 0)
      ? `<div class="lesson empty">Пар нет</div>`
      : day.lessons.map(l => {
          const m = l.time.match(/(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/);
          let isNow = false;
          if (isToday && m) {
            const s = +m[1] * 60 + +m[2];
            const e = +m[3] * 60 + +m[4];
            if (nowMin >= s && nowMin <= e) isNow = true;
          }
          const cls = isNow ? 'lesson now' : 'lesson';

          let badgeHtml = '';
          if (l.type && LESSON_TYPES[l.type]) {
            const t = LESSON_TYPES[l.type];
            badgeHtml = `<span class="badge ${t.cls}"><i class="mdi ${t.icon}"></i>${l.type}</span>`;
          } else if (l.type) {
            badgeHtml = `<span class="badge pr">${escapeHtml(l.type)}</span>`;
          }

          let breakText = '';
          const mStart = l.time.match(/^(\d{1,2}:\d{2})/);
          if (mStart && BREAKS[mStart[1]]) {
            breakText = ` · перерыв ${BREAKS[mStart[1]]}`;
          }

          const metaLine = isGroup
            ? formatInteractiveGroupAndLecturerHtml('', l.lecturer)
            : formatInteractiveGroupAndLecturerHtml(l.group, '');

          return `
            <div class="${cls}" data-room-id="${escapeHtml(l.roomId)}">
              <div class="lesson-top-row">
                <div class="time" style="margin-bottom:0">${escapeHtml(l.time)}${breakText}</div>
                <button type="button" class="lesson-room-badge" data-room-id="${escapeHtml(l.roomId)}" title="Показать аудиторию на карте">
                  <i class="mdi mdi-map-marker-radius-outline"></i>
                  <span>ауд. ${escapeHtml(l.roomShort)} · ${l.floor} эт.</span>
                </button>
              </div>
              <div class="subject">${badgeHtml}${escapeHtml(l.subject)}</div>
              ${metaLine ? `<div class="meta">${metaLine}</div>` : ''}
            </div>
          `;
        }).join('');

    return `
      <div class="schedule-day-card ${isToday ? 'today' : ''}">
        <div class="schedule-day-card-header">
          <span class="schedule-day-name">${escapeHtml(day.dayName)}</span>
          <span class="schedule-day-date">${escapeHtml(dateLabel)}${isToday ? ' · сегодня' : ''}</span>
        </div>
        <div class="schedule-day-lessons">
          ${lessonsHtml}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="schedule-main-header">
      <div class="schedule-mobile-nav">
        <button type="button" class="sched-mobile-back-btn" id="sched-mobile-back">
          <i class="mdi mdi-arrow-left"></i>
          <span>К списку</span>
        </button>
        <button type="button" class="schedule-back-map-btn" id="sched-mobile-close-map">
          <i class="mdi mdi-map-outline"></i>
          <span>На карту</span>
        </button>
      </div>

      <div class="schedule-hero-top">
        <div>
          <div class="panel-crumbs">${escapeHtml(badgeLabel)} · ${totalLessonsCount} пар на неделе</div>
          <h1 class="schedule-entity-title">
            <span>${escapeHtml(title)}</span>
            <button type="button" class="schedule-share-btn" id="schedule-share-btn" title="Скопировать прямую ссылку на расписание">
              <i class="mdi mdi-link-variant"></i>
            </button>
          </h1>
        </div>
      </div>

      ${statusCardHtml}

      ${roomsChipsHtml ? `
        <div class="schedule-rooms-section">
          <span class="schedule-rooms-label">Аудитории на карте:</span>
          <div class="entity-rooms-strip">${roomsChipsHtml}</div>
        </div>
      ` : ''}

      ${dayFilterPillsHtml}
    </div>

    <div class="schedule-days-grid">
      ${daysGridHtml}
    </div>
  `;
}

function attachScheduleWorkspaceListeners(view) {
  const closeBtn = view.querySelector('#schedule-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeScheduleView());
  }

  const mobileCloseMapBtn = view.querySelector('#sched-mobile-close-map');
  if (mobileCloseMapBtn) {
    mobileCloseMapBtn.addEventListener('click', () => closeScheduleView());
  }

  const mobileBackBtn = view.querySelector('#sched-mobile-back');
  if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
      scheduleMobileStep = 'list';
      view.dataset.mobileStep = 'list';
    });
  }

  const shareBtn = view.querySelector('#schedule-share-btn');
  if (shareBtn && currentEntitySchedule) {
    shareBtn.addEventListener('click', async () => {
      const url = new URL(location);
      url.searchParams.set('view', 'schedule');
      url.searchParams.set('type', currentEntitySchedule.type);
      url.searchParams.set('name', currentEntitySchedule.name);
      try {
        await navigator.clipboard.writeText(url.toString());
        showToast('Ссылка на расписание скопирована');
      } catch (e) {
        showToast('Ссылка обновлена в адресной строке');
      }
    });
  }

  view.querySelectorAll('.sched-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      directoryActiveTab = btn.dataset.tab;
      renderScheduleWorkspace();
    });
  });

  const searchInput = view.querySelector('#sched-view-search');
  const clearBtn = view.querySelector('#sched-view-clear');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      directoryFilterQuery = searchInput.value;
      const pos = searchInput.selectionStart;
      renderScheduleWorkspace();
      const nextInput = document.getElementById('sched-view-search');
      if (nextInput) {
        nextInput.focus();
        try { nextInput.setSelectionRange(pos, pos); } catch (e) {}
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      directoryFilterQuery = '';
      renderScheduleWorkspace();
      const nextInput = document.getElementById('sched-view-search');
      if (nextInput) nextInput.focus();
    });
  }

  view.querySelectorAll('.sched-dir-item').forEach(item => {
    item.addEventListener('click', () => {
      selectScheduleEntity(item.dataset.entityType, item.dataset.entityName, { switchMobileToDetail: true });
    });
  });

  view.querySelectorAll('[data-day-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      scheduleDayFilter = pill.dataset.dayFilter || 'all';
      renderScheduleWorkspace();
    });
  });

  view.querySelectorAll('[data-room-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.entity-inline-link')) return;
      if (el.classList.contains('lesson') && !e.target.closest('.lesson-room-badge')) {
        // Клик по карточке занятия или по бейджу аудитории переносит на карту к этой аудитории
      }
      e.stopPropagation();
      const roomId = el.dataset.roomId;
      if (roomId) {
        closeScheduleView();
        focusRoomFromAi(roomId);
      }
    });
  });

  attachEntityInlineLinks(view);
}

// ================ ГРАФ И МАРШРУТЫ ================

async function loadGraph() {
  try {
    const res = await fetch('data/graph.json');
    if (!res.ok) throw new Error('graph.json не найден');
    const data = await res.json();
    graph = {
      nodes: data.nodes || {},
      edges: data.edges || []
    };
    console.log(`[route] graph загружен: ${Object.keys(graph.nodes).length} узлов, ${graph.edges.length} рёбер`);
  } catch (e) {
    console.warn('[route] не удалось загрузить граф:', e.message);
    graph = { nodes: {}, edges: [] };
  }
}

function dijkstra(startId, endId) {
  if (!graph.nodes[startId] || !graph.nodes[endId]) return null;
  if (startId === endId) return [startId];

  const adj = {};
  for (const id of Object.keys(graph.nodes)) adj[id] = [];
  for (const e of graph.edges) {
    if (adj[e.from] && adj[e.to]) {
      const weight = Number(e.weight) || 1;
      adj[e.from].push({ to: e.to, weight });
      adj[e.to].push({ to: e.from, weight });
    }
  }

  const dist = {};
  const prev = {};
  const visited = new Set();
  for (const id of Object.keys(graph.nodes)) dist[id] = Infinity;
  dist[startId] = 0;

  while (true) {
    let u = null, minD = Infinity;
    for (const id of Object.keys(graph.nodes)) {
      if (!visited.has(id) && dist[id] < minD) {
        minD = dist[id];
        u = id;
      }
    }
    if (u === null) break;
    if (u === endId) break;
    visited.add(u);

    for (const { to, weight } of adj[u]) {
      if (visited.has(to)) continue;
      const nd = dist[u] + weight;
      if (nd < dist[to]) {
        dist[to] = nd;
        prev[to] = u;
      }
    }
  }

  if (dist[endId] === Infinity) return null;

  const path = [];
  let cur = endId;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

function getShapeCentroidSvg(id) {
  const shapes = roomShapes[id];
  if (!shapes || !shapes.length) return null;
  const mapRect = map.getContainer().getBoundingClientRect();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let anyValid = false;
  for (const shape of shapes) {
    const r = shape.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) continue;
    anyValid = true;
    if (r.left   < minX) minX = r.left;
    if (r.top    < minY) minY = r.top;
    if (r.right  > maxX) maxX = r.right;
    if (r.bottom > maxY) maxY = r.bottom;
  }
  if (!anyValid) return null;

  const cX = (minX + maxX) / 2 - mapRect.left;
  const cY = (minY + maxY) / 2 - mapRect.top;
  const latlng = map.containerPointToLatLng(L.point(cX, cY));
  const { H } = currentSvgViewBox;
  return { x: latlng.lng, y: H - latlng.lat };
}

async function fetchSvgCentroid(building, floor, roomId) {
  const b = BUILDINGS[building];
  const svgUrl = b?.floors?.[floor];
  if (!svgUrl) return null;

  try {
    if (!svgCache[svgUrl]) {
      const svgText = await fetch(svgUrl).then(r => r.text());
      svgCache[svgUrl] = svgText;
    }

    const svgText = svgCache[svgUrl];
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return null;

    const vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
    const W = vb[2], H = vb[3];

    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.top = '-9999px';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = W + 'px';
    tempDiv.style.height = H + 'px';
    tempDiv.innerHTML = svgText;

    const svgNode = tempDiv.querySelector('svg');
    svgNode.style.width = '100%';
    svgNode.style.height = '100%';

    document.body.appendChild(tempDiv);

    const el = tempDiv.querySelector(`[id="${roomId}"]`);
    if (!el) {
      document.body.removeChild(tempDiv);
      return null;
    }

    const rect = el.getBoundingClientRect();
    const divRect = tempDiv.getBoundingClientRect();

    const cX = (rect.left + rect.right) / 2 - divRect.left;
    const cY = (rect.top + rect.bottom) / 2 - divRect.top;

    document.body.removeChild(tempDiv);

    return { x: cX, y: cY };
  } catch (e) {
    console.error('Error fetching SVG:', e);
    return null;
  }
}

async function getRoomNode(roomId) {
  const meta = roomsMeta[roomId];
  if (!meta) return null;

  let centroid = null;

  if (meta.building === currentBuilding && meta.floor === currentFloor) {
    centroid = getShapeCentroidSvg(roomId);
  }

  if (!centroid) {
    centroid = await fetchSvgCentroid(meta.building, meta.floor, roomId);
  }

  if (!centroid) return null;

  return findNearestNode(centroid, meta.building, meta.floor);
}

function findNearestNode(point, building, floor) {
  let best = null, bestDist = Infinity;
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.building !== building) continue;
    if (node.floor !== floor) continue;
    const d = Math.hypot(node.x - point.x, node.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

function computeRouteLength(path) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const edge = graph.edges.find(e =>
      (e.from === a && e.to === b) || (e.from === b && e.to === a)
    );
    if (edge) total += (Number(edge.weight) || 1);
  }
  return Math.round(total);
}

function smoothPath(latlngs, iterations = 2) {
  if (!latlngs || latlngs.length < 3) return latlngs;
  let pts = latlngs.map(p => ({ lat: p[0], lng: p[1] }));
  for (let it = 0; it < iterations; it++) {
    const newPts = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      newPts.push(
        { lat: a.lat + 0.25 * (b.lat - a.lat), lng: a.lng + 0.25 * (b.lng - a.lng) },
        { lat: a.lat + 0.75 * (b.lat - a.lat), lng: a.lng + 0.75 * (b.lng - a.lng) }
      );
    }
    newPts.push(pts[pts.length - 1]);
    pts = newPts;
  }
  return pts.map(p => [p.lat, p.lng]);
}

function drawRoute(path) {
  if (!routeLayer) return;
  routeLayer.clearLayers();
  if (!path || path.length === 0) return;

  const { H } = currentSvgViewBox;
  const routeColor = getComputedStyle(document.documentElement).getPropertyValue('--route-color').trim() || '#22c55e';
  const startColor = getComputedStyle(document.documentElement).getPropertyValue('--route-start').trim() || '#22c55e';
  const endColor = getComputedStyle(document.documentElement).getPropertyValue('--route-end').trim() || '#ef4444';
  const stairColor = '#a855f7';

  let currentSegment = [];
  const allSegments = [];

  for (let i = 0; i < path.length; i++) {
    const nodeId = path[i];
    const n = graph.nodes[nodeId];
    if (!n) continue;

    if (n.building === currentBuilding && n.floor === currentFloor) {
      currentSegment.push({ id: nodeId, latlng: [H - n.y, n.x], node: n });
    } else {
      if (currentSegment.length > 0) {
        allSegments.push(currentSegment);
        currentSegment = [];
      }
    }
  }
  if (currentSegment.length > 0) allSegments.push(currentSegment);

  allSegments.forEach(seg => {
    if (seg.length < 2) return;
    const latlngs = seg.map(p => p.latlng);
    const smooth = smoothPath(latlngs, 2);
    L.polyline(smooth, {
      pane: 'routePane',
      color: routeColor, weight: 3, opacity: 0.92, lineCap: 'round', lineJoin: 'round'
    }).addTo(routeLayer);
  });

  const fromMeta = roomsMeta[routeState.fromRoomId];
  const toMeta = roomsMeta[routeState.toRoomId];

  if (fromMeta && fromMeta.building === currentBuilding && fromMeta.floor === currentFloor) {
    const startNode = graph.nodes[path[0]];
    if (startNode && startNode.building === currentBuilding && startNode.floor === currentFloor) {
      const centroid = getShapeCentroidSvg(routeState.fromRoomId);
      if (centroid) {
        L.polyline([[H - centroid.y, centroid.x], [H - startNode.y, startNode.x]], {
          pane: 'routePane', color: startColor, weight: 2, dashArray: '4, 4', opacity: 0.82
        }).addTo(routeLayer);

        L.circleMarker([H - centroid.y, centroid.x], {
          pane: 'routePane', radius: 6, color: '#ffffff', weight: 2, fillColor: startColor, fillOpacity: 1
        }).addTo(routeLayer);
      }
    }
  }

  if (toMeta && toMeta.building === currentBuilding && toMeta.floor === currentFloor) {
    const endNode = graph.nodes[path[path.length - 1]];
    if (endNode && endNode.building === currentBuilding && endNode.floor === currentFloor) {
      const centroid = getShapeCentroidSvg(routeState.toRoomId);
      if (centroid) {
        L.polyline([[H - centroid.y, centroid.x], [H - endNode.y, endNode.x]], {
          pane: 'routePane', color: endColor, weight: 2, dashArray: '4, 4', opacity: 0.82
        }).addTo(routeLayer);

        L.circleMarker([H - centroid.y, centroid.x], {
          pane: 'routePane', radius: 6, color: '#ffffff', weight: 2, fillColor: endColor, fillOpacity: 1
        }).addTo(routeLayer);
      }
    }
  }

  path.forEach(id => {
    const node = graph.nodes[id];
    if (node && node.type === 'stairs' && node.building === currentBuilding && node.floor === currentFloor) {
      const isTransition = path.some(otherId => {
        const other = graph.nodes[otherId];
        return other && other.type === 'stairs' && other.floor !== currentFloor;
      });
      if (isTransition) {
        L.circleMarker([H - node.y, node.x], {
          pane: 'routePane', radius: 5.5, color: '#fff', weight: 2, fillColor: stairColor, fillOpacity: 1
        }).addTo(routeLayer);
      }
    }
  });
}

function redrawRoute() {
  if (routeState.path) drawRoute(routeState.path);
}

function clearRoute() {
  routeState = { fromRoomId: null, toRoomId: null, path: null };
  if (routeLayer) routeLayer.clearLayers();
  refreshRoutePickHighlight();
}

// ================ ПАНЕЛЬ МАРШРУТА ================

function openRoutePanel() {
  if (scheduleViewOpen) closeScheduleView({ updateHistory: false });
  const panel = document.getElementById('panel');
  if (panelMode === 'route') {
    if (panel && !panel.classList.contains('open')) {
      openPanel();
      renderRoutePanel();
      syncModeUI();
    } else {
      closeRoutePanel();
    }
    return;
  }
  if (freeModeOn) disableFreeMode();

  panelMode = 'route';
  routePickSide = routeState.fromRoomId && !routeState.toRoomId ? 'to' : 'from';
  clearSelectedRoom();
  openPanel();
  renderRoutePanel();
  refreshRoutePickHighlight();
  syncModeUI();
}

function closeRoutePanel() {
  panelMode = null;
  closePanel();
  clearRoute();
  syncModeUI();
}

function startRouteToRoom(toRoomId) {
  if (scheduleViewOpen) closeScheduleView({ updateHistory: false });
  if (freeModeOn) disableFreeMode();
  panelMode = 'route';
  clearSelectedRoom();
  routeState.toRoomId = toRoomId;
  routeState.path = null;
  if (routeLayer) routeLayer.clearLayers();
  routePickSide = routeState.fromRoomId ? 'to' : 'from';
  openPanel();
  renderRoutePanel();
  refreshRoutePickHighlight();
  syncModeUI();
  if (routeState.fromRoomId && routeState.toRoomId) {
    onBuildRouteClick();
  }
}

function startRouteFromRoom(fromRoomId) {
  if (scheduleViewOpen) closeScheduleView({ updateHistory: false });
  if (freeModeOn) disableFreeMode();
  panelMode = 'route';
  clearSelectedRoom();
  routeState.fromRoomId = fromRoomId;
  routeState.path = null;
  if (routeLayer) routeLayer.clearLayers();
  routePickSide = 'to';
  openPanel();
  renderRoutePanel();
  refreshRoutePickHighlight();
  syncModeUI();
  if (routeState.fromRoomId && routeState.toRoomId) {
    onBuildRouteClick();
  }
}

async function executeRouteBetween(fromRoomId, toRoomId) {
  if (scheduleViewOpen) closeScheduleView({ updateHistory: false });
  if (freeModeOn) disableFreeMode();
  panelMode = 'route';
  clearSelectedRoom();
  routeState.fromRoomId = fromRoomId;
  routeState.toRoomId = toRoomId;
  routeState.path = null;
  openPanel();
  renderRoutePanel();
  refreshRoutePickHighlight();
  syncModeUI();

  const fromMeta = roomsMeta[fromRoomId];
  if (fromMeta && (fromMeta.building !== currentBuilding || fromMeta.floor !== currentFloor)) {
    const b = BUILDINGS[fromMeta.building];
    if (b && b.floors[fromMeta.floor]) {
      await showFloor(fromMeta.building, fromMeta.floor);
    }
  }
  await onBuildRouteClick();
}

function handleRouteMapPick(id) {
  const meta = roomsMeta[id];
  if (!meta) return;
  setRoutePoint(routePickSide, id, formatRoomName(meta.name));
  routePickSide = routePickSide === 'from' ? 'to' : 'from';
}

function renderRoutePanel() {
  const panel = document.getElementById('panel');

  const fromMeta = routeState.fromRoomId ? roomsMeta[routeState.fromRoomId] : null;
  const toMeta = routeState.toRoomId ? roomsMeta[routeState.toRoomId] : null;

  const fromValue = fromMeta ? formatRoomName(fromMeta.name) : '';
  const toValue = toMeta ? formatRoomName(toMeta.name) : '';

  const header = `
    <div class="panel-header">
      <button class="close" onclick="closeRoutePanel()">✕</button>
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Маршрут</h2>
    </div>
  `;

  const fixed = `
    ${header}
    <div class="route-field">
      <label>Откуда <span class="label-hint">${routePickSide === 'from' ? '← или ткните на карте' : ''}</span></label>
      <div class="route-input-wrap">
        <input class="route-input has-clear ${fromValue ? 'filled' : ''}" id="route-from" placeholder="Аудитория, вход…" value="${escapeHtml(fromValue)}" autocomplete="off">
        <button type="button" class="input-clear-btn ${fromValue ? '' : 'hidden'}" id="route-from-clear" title="Очистить" aria-label="Очистить поле Откуда">
          <i class="mdi mdi-close"></i>
        </button>
        <ul class="route-results" id="route-from-results"></ul>
      </div>
    </div>
    <div class="route-field">
      <label>Куда <span class="label-hint">${routePickSide === 'to' ? '← или ткните на карте' : ''}</span></label>
      <div class="route-input-wrap">
        <input class="route-input has-clear ${toValue ? 'filled' : ''}" id="route-to" placeholder="Аудитория, вход…" value="${escapeHtml(toValue)}" autocomplete="off">
        <button type="button" class="input-clear-btn ${toValue ? '' : 'hidden'}" id="route-to-clear" title="Очистить" aria-label="Очистить поле Куда">
          <i class="mdi mdi-close"></i>
        </button>
        <ul class="route-results" id="route-to-results"></ul>
      </div>
    </div>
    <button class="route-build-btn" id="route-build-btn" ${routeState.fromRoomId && routeState.toRoomId ? '' : 'disabled'}>
      <i class="mdi mdi-directions"></i> Построить маршрут
    </button>
    ${routeState.path ? `<button class="route-clear-btn" id="route-clear-btn">Сбросить маршрут</button>` : ''}
  `;

  let scroll = '';
  if (routeState.path) {
    scroll = renderRouteResult(routeState.path);
  } else {
    scroll = `
      <div class="route-hint">
        Выберите начальную и конечную точки в полях выше или просто кликните по нужным аудиториям на карте.
      </div>
    `;
  }

  panel.innerHTML = buildPanelLayout(fixed, scroll);

  setupRouteInput('from');
  setupRouteInput('to');

  document.getElementById('route-build-btn').addEventListener('click', onBuildRouteClick);

  const clearBtn = document.getElementById('route-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearRoute();
      renderRoutePanel();
    });
  }

  panel.querySelectorAll('.step-floor-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const b = target.dataset.building;
      const f = parseInt(target.dataset.floor, 10);
      if (b && !isNaN(f)) {
        showFloor(b, f);
      }
    });
  });

  updatePanelHandle();
}

function setupRouteInput(side) {
  const inputId = side === 'from' ? 'route-from' : 'route-to';
  const clearId = side === 'from' ? 'route-from-clear' : 'route-to-clear';
  const resultsId = side === 'from' ? 'route-from-results' : 'route-to-results';
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  const syncClearVisibility = () => {
    if (clearBtn) clearBtn.classList.toggle('hidden', !input.value);
  };

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      input.classList.remove('filled');
      syncClearVisibility();
      if (side === 'from') routeState.fromRoomId = null;
      else routeState.toRoomId = null;
      routeState.path = null;
      if (routeLayer) routeLayer.clearLayers();
      results.classList.remove('open');
      results.innerHTML = '';
      const buildBtn = document.getElementById('route-build-btn');
      if (buildBtn) buildBtn.disabled = !(routeState.fromRoomId && routeState.toRoomId);
      refreshRoutePickHighlight();
      input.focus();
    });
  }

  input.addEventListener('focus', () => {
    routePickSide = side;
    const labelFrom = document.querySelector('#route-from')?.closest('.route-field')?.querySelector('.label-hint');
    const labelTo = document.querySelector('#route-to')?.closest('.route-field')?.querySelector('.label-hint');
    if (labelFrom) labelFrom.textContent = side === 'from' ? '← или ткните на карте' : '';
    if (labelTo) labelTo.textContent = side === 'to' ? '← или ткните на карте' : '';
  });

  input.addEventListener('input', () => {
    syncClearVisibility();
    const q = input.value.trim();
    if (!q) {
      if (side === 'from') routeState.fromRoomId = null;
      else routeState.toRoomId = null;
      input.classList.remove('filled');
      const buildBtn = document.getElementById('route-build-btn');
      if (buildBtn) buildBtn.disabled = !(routeState.fromRoomId && routeState.toRoomId);
      refreshRoutePickHighlight();
      results.classList.remove('open');
      results.innerHTML = '';
      return;
    }
    const found = searchRooms(q, 10);
    results.innerHTML = '';
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'res-empty';
      li.textContent = 'ничего не найдено';
      results.appendChild(li);
    } else {
      found.forEach(({ id, meta }) => {
        const bName = BUILDINGS[meta.building]?.name || meta.building || '?';
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="res-name">${escapeHtml(formatRoomName(meta.name))}</div>
          <div class="res-meta">${escapeHtml(bName)}${meta.floor != null ? ' · ' + meta.floor + ' этаж' : ''}</div>
        `;
        li.addEventListener('click', () => {
          setRoutePoint(side, id, formatRoomName(meta.name));
        });
        results.appendChild(li);
      });
    }
    results.classList.add('open');
  });

  input.addEventListener('blur', () => {
    setTimeout(() => results.classList.remove('open'), 150);
  });
}

function setRoutePoint(side, roomId, name) {
  if (side === 'from') {
    routeState.fromRoomId = roomId;
  } else {
    routeState.toRoomId = roomId;
  }
  routeState.path = null;
  if (routeLayer) routeLayer.clearLayers();

  const inputId = side === 'from' ? 'route-from' : 'route-to';
  const clearId = side === 'from' ? 'route-from-clear' : 'route-to-clear';
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  if (input) {
    input.value = name;
    input.classList.add('filled');
  }
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !name);
  }

  const resultsId = side === 'from' ? 'route-from-results' : 'route-to-results';
  const results = document.getElementById(resultsId);
  if (results) results.classList.remove('open');

  const buildBtn = document.getElementById('route-build-btn');
  if (buildBtn) buildBtn.disabled = !(routeState.fromRoomId && routeState.toRoomId);

  refreshRoutePickHighlight();
}

async function onBuildRouteClick() {
  const panel = document.getElementById('panel');

  if (!routeState.fromRoomId || !routeState.toRoomId) {
    showToast('Выберите обе точки маршрута');
    return;
  }

  const scrollEl = panel.querySelector('.panel-scroll');
  if (scrollEl) scrollEl.innerHTML = '<p class="muted-text">Строим маршрут…</p>';

  const fromNode = await getRoomNode(routeState.fromRoomId);
  const toNode = await getRoomNode(routeState.toRoomId);

  if (!fromNode || !toNode) {
    if (scrollEl) {
      scrollEl.innerHTML = `
        <div class="route-warning">Не удалось определить положение выбранных помещений на графе этого этажа (сейчас граф проложен по 0 и 1 этажам Главного корпуса).</div>
      `;
    }
    return;
  }

  const path = dijkstra(fromNode, toNode);

  if (!path) {
    if (scrollEl) {
      scrollEl.innerHTML = `
        <div class="route-warning">Между этими точками пока нет связанного пути по графу.</div>
      `;
    }
    return;
  }

  routeState.path = path;
  drawRoute(path);
  renderRoutePanel();
  haptic('success');
}

function calculateRouteMetricsClient(path) {
  if (!path || path.length < 2) {
    return { meters: 0, seconds: 0, timeText: '< 1 мин', stairsCount: 0, floorsVisited: [] };
  }
  let rawPixels = 0;
  let stairsTransitions = 0;
  const floorsVisited = [];

  for (let i = 0; i < path.length; i++) {
    const n = graph.nodes[path[i]];
    if (n && typeof n.floor === 'number' && floorsVisited[floorsVisited.length - 1] !== n.floor) {
      floorsVisited.push(n.floor);
    }
    if (i < path.length - 1) {
      const a = path[i], b = path[i + 1];
      const na = graph.nodes[a], nb = graph.nodes[b];
      if (na && nb && na.floor !== nb.floor) {
        stairsTransitions += Math.abs((nb.floor || 0) - (na.floor || 0)) || 1;
      } else {
        const edge = graph.edges.find(e =>
          (e.from === a && e.to === b) || (e.from === b && e.to === a)
        );
        if (edge) rawPixels += (Number(edge.weight) || 1);
      }
    }
  }

  // 10 пикселей на плане этажа ≈ 1 метр + ~8 м на каждый межэтажный лестничный марш
  const meters = Math.max(5, Math.round(rawPixels / 10 + stairsTransitions * 8));
  // Средняя скорость ходьбы ~1.25 м/с + ~22 сек на подъём/спуск по лестнице между этажами
  const walkSeconds = (rawPixels / 10) / 1.25;
  const stairSeconds = stairsTransitions * 22;
  const seconds = Math.max(10, Math.round(walkSeconds + stairSeconds));
  const minutes = Math.round(seconds / 60);
  const timeText = seconds < 45 ? '< 1 мин' : `~${Math.max(1, minutes)} мин`;

  return { meters, seconds, timeText, stairsCount: stairsTransitions, floorsVisited };
}

function renderRouteResult(path) {
  const metrics = calculateRouteMetricsClient(path);

  let currentFloorGroup = [];
  const floorGroups = [];

  for (let i = 0; i < path.length; i++) {
    const nodeId = path[i];
    const n = graph.nodes[nodeId];
    if (!n) continue;

    if (currentFloorGroup.length === 0) {
      currentFloorGroup.push({ id: nodeId, node: n, index: i });
    } else {
      const lastItem = currentFloorGroup[currentFloorGroup.length - 1];
      if (lastItem.node.floor === n.floor && lastItem.node.building === n.building) {
        currentFloorGroup.push({ id: nodeId, node: n, index: i });
      } else {
        floorGroups.push(currentFloorGroup);
        currentFloorGroup = [{ id: nodeId, node: n, index: i }];
      }
    }
  }
  if (currentFloorGroup.length > 0) floorGroups.push(currentFloorGroup);

  const fromMeta = roomsMeta[routeState.fromRoomId];
  const toMeta = roomsMeta[routeState.toRoomId];
  const fromTitle = fromMeta ? formatRoomName(fromMeta.name) : 'Начальная точка';
  const toTitle = toMeta ? formatRoomName(toMeta.name) : 'Конечная точка';
  const fromFloor = fromMeta?.floor ?? floorGroups[0]?.[0]?.node?.floor ?? currentFloor;
  const toFloor = toMeta?.floor ?? floorGroups[floorGroups.length - 1]?.[0]?.node?.floor ?? currentFloor;

  let milestonesHtml = `
    <li class="route-step route-milestone start">
      <span class="step-num start-dot">A</span>
      <div class="step-body">
        <div class="step-title">${escapeHtml(fromTitle)}</div>
        <div class="step-meta">${fromFloor} этаж · старт маршрута</div>
      </div>
      ${fromFloor !== currentFloor ? `
        <button type="button" class="step-floor-link" data-building="${escapeHtml(fromMeta?.building || currentBuilding)}" data-floor="${fromFloor}">
          ${fromFloor} эт.
        </button>
      ` : ''}
    </li>
  `;

  floorGroups.forEach((group, groupIdx) => {
    if (groupIdx > 0) {
      const prevNode = floorGroups[groupIdx - 1][floorGroups[groupIdx - 1].length - 1].node;
      const currNode = group[0].node;
      const dir = currNode.floor > prevNode.floor ? 'Поднимитесь по лестнице' : 'Спуститесь по лестнице';

      milestonesHtml += `
        <li class="route-step route-milestone stairs">
          <span class="step-num stairs-dot">↕</span>
          <div class="step-body">
            <div class="step-title">${dir} на ${currNode.floor} этаж</div>
            <div class="step-meta">переход с ${prevNode.floor} на ${currNode.floor} этаж</div>
          </div>
          <button type="button" class="step-floor-link" data-building="${escapeHtml(currNode.building)}" data-floor="${currNode.floor}">
            Показать ${currNode.floor} эт.
          </button>
        </li>
      `;
    }
  });

  milestonesHtml += `
    <li class="route-step route-milestone finish">
      <span class="step-num finish-dot">B</span>
      <div class="step-body">
        <div class="step-title">${escapeHtml(toTitle)}</div>
        <div class="step-meta">${toFloor} этаж · пункт назначения</div>
      </div>
      ${toFloor !== currentFloor ? `
        <button type="button" class="step-floor-link" data-building="${escapeHtml(toMeta?.building || currentBuilding)}" data-floor="${toFloor}">
          ${toFloor} эт.
        </button>
      ` : ''}
    </li>
  `;

  return `
    <div class="route-summary">
      <div class="metric">
        <span class="metric-value">~${metrics.meters} м</span>
        <span class="metric-label">расстояние</span>
      </div>
      <div class="metric">
        <span class="metric-value">${metrics.timeText}</span>
        <span class="metric-label">пешком${metrics.stairsCount > 0 ? ' (с лестницей)' : ''}</span>
      </div>
    </div>
    <ol class="route-steps">${milestonesHtml}</ol>
  `;
}

// ================ ГОРЯЧИЕ КЛАВИШИ ================

function setupHotkeys() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea';

    if (e.key === 'Escape') {
      const wrap = document.getElementById('search-wrap');
      if (wrap && wrap.classList.contains('open')) {
        wrap.classList.remove('open');
        if (isInput) e.target.blur();
        return;
      }
      if (scheduleViewOpen) {
        closeScheduleView();
        return;
      }
      if (document.getElementById('panel').classList.contains('open')) {
        if (panelMode === 'room') closeRoomPanel();
        else if (panelMode === 'free') collapseFreePanel();
        else if (panelMode === 'route') closeRoutePanel();
        else if (panelMode === 'ai') closeAiPanel();
        else closePanel();
      }
      return;
    }
    if (isInput) return;
    if (e.key === '/') {
      e.preventDefault();
      const wrap = document.getElementById('search-wrap');
      const input = document.getElementById('search-input');
      if (wrap && input) {
        wrap.classList.add('open');
        input.focus();
      }
      return;
    }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); map.zoomIn(); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); map.zoomOut(); return; }
  });
}

// ================ СТАРТ ================

(async function init() {
  initTelegram();
  roomsMeta = await fetch('data/rooms.json').then(r => r.json());
  await Promise.all([loadGraph(), loadScheduleDirectory()]);

  buildBuildingsUI();
  setupSearch();
  setupThemeToggle();
  setupResetControl().addTo(map);
  createFloorSwitcher().addTo(map);
  setupFreeToggle().addTo(map);
  setupPanelHandle();
  setupHotkeys();

  const freeTopBtn = document.getElementById('free-top-btn');
  if (freeTopBtn) freeTopBtn.addEventListener('click', toggleFreeMode);

  const routeTopBtn = document.getElementById('route-toggle');
  if (routeTopBtn) routeTopBtn.addEventListener('click', openRoutePanel);

  const aiTopBtn = document.getElementById('ai-toggle');
  if (aiTopBtn) aiTopBtn.addEventListener('click', () => openAiPanel(null));

  const brandEl = document.querySelector('.topbar-brand');
  if (brandEl) {
    brandEl.style.cursor = 'pointer';
    brandEl.addEventListener('click', () => {
      if (scheduleViewOpen) closeScheduleView();
    });
  }

  syncModeUI();

  const params = new URLSearchParams(location.search);
  const viewParam = params.get('view');
  const entityTypeParam = params.get('type');
  const entityNameParam = params.get('name');
  const roomId = params.get('room');

  if (roomId && roomsMeta[roomId]) {
    isPoppingState = true;
    await navigateToRoom(roomId);
    isPoppingState = false;
  } else {
    await showFloor('C', 1);
    if (viewParam === 'schedule') {
      if (entityTypeParam && entityNameParam) {
        await openEntitySchedule(entityTypeParam, entityNameParam);
      } else {
        await openScheduleDirectory();
      }
    }
  }
})();