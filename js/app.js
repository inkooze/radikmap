// ================ КОНФИГ ================

const BUILDINGS = {
  C: { name: 'Главный',    floors: { 0: 'data/floor0.svg', 1: 'data/floor1.svg', 2: 'data/floor2.svg', 3: 'data/floor3.svg', 4: 'data/floor4.svg' } },
  L: { name: 'Лабок',      floors: {} },
  B: { name: 'Инкубатор',  floors: {} },
  F: { name: 'Военка',     floors: {} }
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

const SEARCH_SYNONYMS = {
  'спорт':      ['спорт', 'спортзал', 'спортивный', 'стадион', 'физра', 'физкультура', 'самбо', 'атлетика'],
  'столовая':   ['столовая', 'буфет', 'кафе', 'кофейня', 'столовка'],
  'туалет':     ['туалет', 'wc', 'санузел', 'уборная'],
  'деканат':    ['деканат', 'деконат', 'деканаты'],
  'библиотека': ['библиотека', 'читальный зал', 'читалка'],
  'гардероб':   ['гардероб', 'раздевалка', 'вешалка']
};

const QUICK_TAGS = [
  { label: '🏃 Спорт',      query: 'спорт' },
  { label: '🍽 Столовая',   query: 'столовая' },
  { label: '🚻 Туалет',     query: 'туалет' },
  { label: '📚 Библиотека', query: 'библиотека' }
];

// ================ TELEGRAM ================

const tg = window.Telegram?.WebApp;
let telegramUser = null;

function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    telegramUser = tg.initDataUnsafe?.user || null;
    if (!localStorage.getItem('theme')) {
      document.documentElement.dataset.theme = tg.colorScheme === 'light' ? 'light' : 'dark';
    }
    tg.onEvent?.('themeChanged', () => {
      if (localStorage.getItem('theme')) return;
      document.documentElement.dataset.theme = tg.colorScheme === 'light' ? 'light' : 'dark';
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

let panelMode = null;
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
let routePickSide = 'from';    // 'from' | 'to' — в какое поле попадёт следующий клик по карте

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

routeLayer = L.layerGroup().addTo(map);
routePickLayer = L.layerGroup().addTo(map);

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
}

function closePanel() {
  document.getElementById('panel').classList.remove('open');
  clearSelectedRoom();
  updateURL(null, { push: false });
  panelMode = null;
  currentRoomPanelId = null;
  smoothInvalidateSize(260);
  updatePanelHandle();
}

function closeRoomPanel() {
  clearSelectedRoom();
  updateURL(null, { push: false });
  currentRoomPanelId = null;

  if (freeModeOn) {
    panelMode = 'free';
    renderFreePanel();
    scheduleLabelRefresh();
  } else {
    closePanel();
  }
}

function collapseFreePanel() {
  freePanelCollapsed = true;
  document.getElementById('panel').classList.remove('open');
  smoothInvalidateSize(260);
  updatePanelHandle();
}

function expandFreePanel() {
  freePanelCollapsed = false;
  panelMode = 'free';
  currentRoomPanelId = null;
  clearSelectedRoom();
  openPanel();
  renderFreePanel();
  updatePanelHandle();
}

function disableFreeMode() {
  freeModeOn = false;
  freePanelCollapsed = false;
  try { localStorage.setItem('free_mode', '0'); } catch (e) {}
  const btn = document.querySelector('.free-toggle');
  if (btn) btn.classList.remove('active');
  applyFreeHighlight();
  closePanel();
  updatePanelHandle();
}

function updatePanelHandle() {
  const h = document.getElementById('panel-handle');
  if (!h) return;

  if (!freeModeOn || panelMode === 'room' || panelMode === 'route') {
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
  // Убираем все предыдущие метки
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
    if (!freePanelCollapsed) renderFreePanelWarming(result.progress);
    pollCacheStatus();
  } else if (result.ok) {
    applyFreeHighlight();
    if (!freePanelCollapsed) renderFreePanel();
  } else {
    if (!freePanelCollapsed) renderFreePanelError(result.error);
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
      } else if (!freePanelCollapsed) {
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
      btn.innerHTML = `
        <span class="checkbox"><i class="mdi mdi-check"></i></span>
        <span>Свободны сейчас</span>
      `;

      const saved = localStorage.getItem('free_mode');
      if (saved === '1') {
        freeModeOn = true;
        btn.classList.add('active');
      }

      btn.addEventListener('click', async () => {
        if (!freeModeOn) {
          freeModeOn = true;
          freePanelCollapsed = false;
          btn.classList.add('active');
          try { localStorage.setItem('free_mode', '1'); } catch (e) {}
          panelMode = 'free';
          currentRoomPanelId = null;
          clearSelectedRoom();
          openPanel();
          renderFreePanelLoading();
          await refreshFreeMode();
        } else {
          disableFreeMode();
        }
      });

      wrap.appendChild(btn);

      if (freeModeOn) {
        setTimeout(async () => {
          panelMode = 'free';
          currentRoomPanelId = null;
          clearSelectedRoom();
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
    if (!freeModeOn || panelMode === 'room' || panelMode === 'route') return;
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
      else if (panelMode === 'free' || panelMode === 'route') { /* оставляем */ }
      else closePanel();
    }
  } finally {
    isPoppingState = false;
  }
});

// ================ UI: ЗДАНИЯ ================

function buildBuildingsUI() {
  const container = document.getElementById('buildings');
  container.innerHTML = '';
  const tabs = document.createElement('div');
  tabs.className = 'tabs';

  Object.entries(BUILDINGS).forEach(([code, b]) => {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.code = code;
    tab.textContent = b.name;
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      onTabClick(code);
    });
    tabs.appendChild(tab);
  });

  const underline = document.createElement('div');
  underline.className = 'tab-underline';
  tabs.appendChild(underline);
  container.appendChild(tabs);

  requestAnimationFrame(() => {
    updateTabActive();
    requestAnimationFrame(() => { underline.style.transition = ''; });
  });
}

function updateTabActive() {
  const tabs = document.querySelectorAll('.tab');
  let activeTab = null;
  tabs.forEach(tab => {
    const isActive = tab.dataset.code === currentBuilding;
    tab.classList.toggle('active', isActive);
    if (isActive) activeTab = tab;
  });
  const underline = document.querySelector('.tab-underline');
  if (underline && activeTab) {
    underline.style.left = activeTab.offsetLeft + 'px';
    underline.style.width = activeTab.offsetWidth + 'px';
  }
}

function onTabClick(code) {
  if (code === currentBuilding) return;
  const b = BUILDINGS[code];
  if (!b) return;
  const floors = Object.keys(b.floors).map(Number).sort((a, b) => a - b);
  if (floors.length === 0) {
    showToast(`Этажи корпуса «${b.name}» ещё не добавлены`);
    return;
  }
  currentBuilding = code;
  updateTabActive();
  showFloor(code, floors[0]);
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

// ================ ПОИСК ================

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

function expandQuery(query) {
  const q = query.toLowerCase().trim();
  for (const variants of Object.values(SEARCH_SYNONYMS)) {
    for (const v of variants) {
      if (q === v || (q.length >= 4 && levenshtein(q, v) <= 1)) return variants;
    }
  }
  return [q];
}

function searchRooms(query, limit = 20) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const expanded = expandQuery(q);
  const exact = [], fuzzy = [], seen = new Set();

  for (const [id, meta] of Object.entries(roomsMeta)) {
    const name = (meta.name || '').toLowerCase();
    const haystack = name + ' ' + id.toLowerCase() + ' ' + (meta.shortName || '').toLowerCase();
    if (expanded.some(v => haystack.includes(v))) {
      exact.push({ id, meta }); seen.add(id); continue;
    }
    if (q.length >= 4) {
      const parts = name.split(/\s+/).filter(p => p.length >= 3);
      for (const part of parts) {
        if (levenshtein(q, part) <= 2) {
          if (!seen.has(id)) { fuzzy.push({ id, meta }); seen.add(id); }
          break;
        }
      }
    }
  }
  return [...exact, ...fuzzy].slice(0, limit);
}

function setupSearch() {
  const wrap    = document.getElementById('search-wrap');
  const toggle  = document.getElementById('search-toggle');
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const tagsEl  = document.getElementById('quick-tags');
  const historyEl = document.getElementById('search-history');

  let history = [];
  try { history = JSON.parse(localStorage.getItem('search_history') || '[]'); } catch (e) { history = []; }

  function saveHistory(q) {
    q = (q || '').trim(); if (!q) return;
    history = [q, ...history.filter(h => h !== q)].slice(0, 5);
    try { localStorage.setItem('search_history', JSON.stringify(history)); } catch (e) {}
  }

  function renderTags() {
    tagsEl.innerHTML = '';
    QUICK_TAGS.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'quick-tag';
      btn.textContent = t.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.value = t.query;
        renderResults();
      });
      tagsEl.appendChild(btn);
    });
  }

  function renderHistory() {
    historyEl.innerHTML = '';
    if (input.value.trim()) return;
    history.slice(0, 3).forEach(h => {
      const btn = document.createElement('button');
      btn.className = 'history-item';
      btn.textContent = h;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.value = h;
        renderResults();
      });
      historyEl.appendChild(btn);
    });
  }

  function renderResults() {
    const raw = input.value.trim();
    results.innerHTML = '';
    if (!raw) { renderHistory(); return; }
    historyEl.innerHTML = '';
    const found = searchRooms(raw, 20);
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'res-empty';
      li.textContent = 'ничего не найдено';
      results.appendChild(li);
      return;
    }
    found.forEach(({ id, meta }) => {
      const bName = BUILDINGS[meta.building]?.name || meta.building || '?';
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="res-name">${escapeHtml(formatRoomName(meta.name))}</div>
        <div class="res-meta">${escapeHtml(bName)}${meta.floor != null ? ' · ' + meta.floor + ' этаж' : ''}</div>
      `;
      li.addEventListener('click', () => {
        saveHistory(raw);
        navigateToRoom(id);
        wrap.classList.remove('open');
      });
      results.appendChild(li);
    });
  }

  renderTags();
  renderHistory();

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.toggle('open');
    if (isOpen) {
      input.focus();
      if (input.value.trim()) renderResults(); else renderHistory();
    }
  });

  input.addEventListener('input', renderResults);

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

// ================ ТЕМА ================

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const updateIcon = () => {
    const theme = document.documentElement.dataset.theme || 'dark';
    btn.innerHTML = theme === 'dark'
      ? '<i class="mdi mdi-weather-sunny"></i>'
      : '<i class="mdi mdi-weather-night"></i>';
  };
  updateIcon();
  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
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
  const meta = roomsMeta[roomId];
  if (!meta) return;
  const b = BUILDINGS[meta.building];
  if (!b) return;

  const availableFloors = Object.keys(b.floors).map(Number);
  let targetFloor = meta.floor;

  if (targetFloor == null || !availableFloors.includes(targetFloor)) {
    if (!availableFloors.length) {
      alert(`Этажи корпуса «${b.name}» ещё не добавлены на карту`);
      return;
    }
    targetFloor = availableFloors[0];
  }

  pendingHighlight = roomId;
  currentBuilding = meta.building;
  await showFloor(meta.building, targetFloor);
  onRoomClick(roomId);
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
  `;

  const descriptionBlock = meta?.description
    ? `<div class="room-notes">${renderMultiline(meta.description)}</div>`
    : '';

  if (!meta || !meta.building || !meta.classroom) {
    const block = descriptionBlock ||
      `<div class="room-notes empty">У этого помещения нет заметок.</div>`;
    panel.innerHTML = buildPanelLayout(`${header}${block}`, '');
    attachShareListener(panel, id);
    return;
  }

  panel.innerHTML = buildPanelLayout(
    `${header}${descriptionBlock}`,
    `<p class="muted-text">Загрузка расписания…</p>`
  );
  attachShareListener(panel, id);

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
      attachShareListener(panel, id);
      return;
    }
    renderSchedule(panel, title, data, header, descriptionBlock);
    attachShareListener(panel, id);
    haptic('success');
  } catch (err) {
    if (token !== roomRequestToken) return;
    if (currentRoomPanelId !== id || panelMode !== 'room') return;

    panel.innerHTML = buildPanelLayout(
      `${header}${descriptionBlock}`,
      `<p style="color:#f87171">Ошибка загрузки: ${escapeHtml(err.message)}</p>`
    );
    attachShareListener(panel, id);
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
      catch (err) { alert('Не удалось скопировать. Ссылка: ' + url); }
      document.body.removeChild(ta);
    }
  });
}

// ================ TOAST ================

function showToast(text) {
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
        const m = text.match(/^(.*?),?\s*гр\.\s*([^,]+),\s*(.+)$/);
        if (m) {
          subject  = m[1].replace(/,\s*$/, '').trim();
          group    = m[2].trim();
          lecturer = m[3].trim();
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
                ${sg.group ? 'гр. ' + escapeHtml(sg.group) : ''}${sg.group && sg.lecturer ? ' · ' : ''}${escapeHtml(sg.lecturer || '')}
              </div>
            `).join('');
          } else {
            metaHtml = `<div class="meta">${l.group ? 'гр. ' + escapeHtml(l.group) : ''}${l.group && l.lecturer ? ' · ' : ''}${escapeHtml(l.lecturer || '')}</div>`;
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

// Дейкстра. Возвращает массив id узлов от startId до endId или null.
function dijkstra(startId, endId) {
  if (!graph.nodes[startId] || !graph.nodes[endId]) return null;
  if (startId === endId) return [startId];

  const adj = {};
  for (const id of Object.keys(graph.nodes)) adj[id] = [];
  for (const e of graph.edges) {
    if (adj[e.from] && adj[e.to]) {
      adj[e.from].push({ to: e.to, weight: e.weight });
      adj[e.to].push({ to: e.from, weight: e.weight });
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

// Центроид фигуры в SVG-координатах
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

// Ближайший узел графа на том же корпусе и этаже
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

// Длина маршрута (сумма весов рёбер)
function computeRouteLength(path) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const edge = graph.edges.find(e =>
      (e.from === a && e.to === b) || (e.from === b && e.to === a)
    );
    if (edge) total += edge.weight;
  }
  return Math.round(total);
}

// Сглаживание пути алгоритмом Чайкина (corner cutting)
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

// Отрисовка маршрута
function drawRoute(path) {
  if (!routeLayer) return;
  routeLayer.clearLayers();
  if (!path || path.length === 0) return;

  const { H } = currentSvgViewBox;
  const latlngs = [];
  const visibleNodes = [];

  for (const id of path) {
    const n = graph.nodes[id];
    if (!n) continue;
    if (n.building !== currentBuilding || n.floor !== currentFloor) continue;
    latlngs.push([H - n.y, n.x]);
    visibleNodes.push(id);
  }

  if (latlngs.length < 2) return;

  // Сглаженная линия
  const smooth = smoothPath(latlngs, 2);

  L.polyline(smooth, {
    color: getComputedStyle(document.documentElement).getPropertyValue('--route-color').trim() || '#22c55e',
    weight: 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(routeLayer);

  // Старт
  const startId = visibleNodes[0];
  const startNode = graph.nodes[startId];
  L.circleMarker([H - startNode.y, startNode.x], {
    radius: 9,
    color: '#ffffff',
    weight: 3,
    fillColor: getComputedStyle(document.documentElement).getPropertyValue('--route-start').trim() || '#22c55e',
    fillOpacity: 1
  }).addTo(routeLayer);

  // Финиш
  const endId = visibleNodes[visibleNodes.length - 1];
  const endNode = graph.nodes[endId];
  L.circleMarker([H - endNode.y, endNode.x], {
    radius: 9,
    color: '#ffffff',
    weight: 3,
    fillColor: getComputedStyle(document.documentElement).getPropertyValue('--route-end').trim() || '#ef4444',
    fillOpacity: 1
  }).addTo(routeLayer);
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
  if (panelMode === 'route') {
    // Закрыть
    closeRoutePanel();
    return;
  }
  if (freeModeOn) disableFreeMode();

  panelMode = 'route';
  routePickSide = 'from';
  clearSelectedRoom();
  document.getElementById('route-toggle').classList.add('active');
  openPanel();
  renderRoutePanel();
  refreshRoutePickHighlight();
}

function closeRoutePanel() {
  panelMode = null;
  closePanel();
  clearRoute();
  document.getElementById('route-toggle').classList.remove('active');
}

// Обработка клика по помещению в режиме маршрута
function handleRouteMapPick(id) {
  const meta = roomsMeta[id];
  if (!meta) return;
  if (meta.building !== currentBuilding || meta.floor !== currentFloor) {
    showToast('Можно выбирать только помещения текущего этажа');
    return;
  }
  setRoutePoint(routePickSide, id, formatRoomName(meta.name));
  // Переключаем активное поле
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
        <input class="route-input ${fromValue ? 'filled' : ''}" id="route-from" placeholder="Аудитория, вход…" value="${escapeHtml(fromValue)}" autocomplete="off">
        <ul class="route-results" id="route-from-results"></ul>
      </div>
    </div>
    <div class="route-field">
      <label>Куда <span class="label-hint">${routePickSide === 'to' ? '← или ткните на карте' : ''}</span></label>
      <div class="route-input-wrap">
        <input class="route-input ${toValue ? 'filled' : ''}" id="route-to" placeholder="Аудитория, вход…" value="${escapeHtml(toValue)}" autocomplete="off">
        <ul class="route-results" id="route-to-results"></ul>
      </div>
    </div>
    <button class="route-build-btn" id="route-build-btn" ${routeState.fromRoomId && routeState.toRoomId ? '' : 'disabled'}>
      <i class="mdi mdi-directions"></i> Построить маршрут
    </button>
    ${routeState.path ? `<button class="route-clear-btn" id="route-clear-btn">Очистить маршрут</button>` : ''}
  `;

  let scroll = '';
  if (routeState.path) {
    scroll = renderRouteResult(routeState.path);
  } else {
    scroll = `
      <div class="route-hint">
        Введи начальную и конечную точки в поля выше, либо кликни по ним на карте. Активное поле подсвечено зелёным.
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

  updatePanelHandle();
}

function setupRouteInput(side) {
  const inputId = side === 'from' ? 'route-from' : 'route-to';
  const resultsId = side === 'from' ? 'route-from-results' : 'route-to-results';
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  input.addEventListener('focus', () => {
    routePickSide = side;
    // Обновляем подсказки в label
    const labelFrom = document.querySelector('#route-from')?.closest('.route-field')?.querySelector('.label-hint');
    const labelTo = document.querySelector('#route-to')?.closest('.route-field')?.querySelector('.label-hint');
    if (labelFrom) labelFrom.textContent = side === 'from' ? '← или ткните на карте' : '';
    if (labelTo) labelTo.textContent = side === 'to' ? '← или ткните на карте' : '';
  });

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) {
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
  const input = document.getElementById(inputId);
  if (input) {
    input.value = name;
    input.classList.add('filled');
  }

  const resultsId = side === 'from' ? 'route-from-results' : 'route-to-results';
  const results = document.getElementById(resultsId);
  if (results) results.classList.remove('open');

  const buildBtn = document.getElementById('route-build-btn');
  if (buildBtn) buildBtn.disabled = !(routeState.fromRoomId && routeState.toRoomId);

  refreshRoutePickHighlight();
}

function onBuildRouteClick() {
  const panel = document.getElementById('panel');

  if (!routeState.fromRoomId || !routeState.toRoomId) {
    showToast('Выберите обе точки маршрута');
    return;
  }

  const fromMeta = roomsMeta[routeState.fromRoomId];
  const toMeta = roomsMeta[routeState.toRoomId];

  if (fromMeta.building !== currentBuilding || fromMeta.floor !== currentFloor ||
      toMeta.building !== currentBuilding || toMeta.floor !== currentFloor) {
    panel.querySelector('.panel-scroll').innerHTML = `
      <div class="route-warning">
        Одна из точек находится на другом этаже или в другом корпусе.
        Перейди на нужный этаж и выбери точки снова.
      </div>
    `;
    return;
  }

  const fromCentroid = getShapeCentroidSvg(routeState.fromRoomId);
  const toCentroid = getShapeCentroidSvg(routeState.toRoomId);

  if (!fromCentroid || !toCentroid) {
    panel.querySelector('.panel-scroll').innerHTML = `
      <div class="route-warning">Не удалось определить положение выбранных помещений на карте.</div>
    `;
    return;
  }

  const fromNode = findNearestNode(fromCentroid, currentBuilding, currentFloor);
  const toNode = findNearestNode(toCentroid, currentBuilding, currentFloor);

  if (!fromNode || !toNode) {
    panel.querySelector('.panel-scroll').innerHTML = `
      <div class="route-warning">Рядом с этими помещениями нет узлов графа. Возможно, граф для этого этажа ещё не размечен.</div>
    `;
    return;
  }

  const path = dijkstra(fromNode, toNode);

  if (!path) {
    panel.querySelector('.panel-scroll').innerHTML = `
      <div class="route-warning">Между этими точками нет пути по графу. Проверь, что все нужные рёбра размечены.</div>
    `;
    return;
  }

  routeState.path = path;
  drawRoute(path);
  renderRoutePanel();
  haptic('success');
}

function renderRouteResult(path) {
  const length = computeRouteLength(path);
  const steps = path.length - 1;

  const stepsHtml = path.slice(1).map((nodeId, idx) => {
    const prevId = path[idx];
    const a = graph.nodes[prevId];
    const b = graph.nodes[nodeId];
    if (!a || !b) return '';
    const dist = Math.round(Math.hypot(a.x - b.x, a.y - b.y));
    const angle = computeTurn(prevId, nodeId, path[idx + 2]);
    const turnText = angle ? ` · ${angle}` : '';

    return `
      <li class="route-step">
        <span class="step-num">${idx + 1}</span>
        <div class="step-body">
          Пройдите <strong>${dist}</strong> ед.${turnText}
        </div>
      </li>
    `;
  }).join('');

  return `
    <div class="route-summary">
      <div class="metric">
        <span class="metric-value">${steps}</span>
        <span class="metric-label">шагов</span>
      </div>
      <div class="metric">
        <span class="metric-value">${length}</span>
        <span class="metric-label">ед. длины</span>
      </div>
    </div>
    <ol class="route-steps">${stepsHtml}</ol>
  `;
}

// Угол поворота от prev→cur к cur→next
function computeTurn(prevId, curId, nextId) {
  if (!nextId) return null;
  const p = graph.nodes[prevId], c = graph.nodes[curId], n = graph.nodes[nextId];
  if (!p || !c || !n) return null;

  const v1 = { x: c.x - p.x, y: c.y - p.y };
  const v2 = { x: n.x - c.x, y: n.y - c.y };
  const a1 = Math.atan2(v1.y, v1.x);
  const a2 = Math.atan2(v2.y, v2.x);
  let diff = (a2 - a1) * 180 / Math.PI;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  const abs = Math.abs(diff);
  if (abs < 20) return 'прямо';
  if (abs > 150) return 'разворот';
  return diff > 0 ? 'поверните налево' : 'поверните направо';
}

// ================ ГОРЯЧИЕ КЛАВИШИ ================

function setupHotkeys() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea';

    if (e.key === 'Escape') {
      const wrap = document.querySelector('.search-wrap');
      if (wrap.classList.contains('open')) {
        wrap.classList.remove('open');
        if (isInput) e.target.blur();
        return;
      }
      if (document.getElementById('panel').classList.contains('open')) {
        if (panelMode === 'room') closeRoomPanel();
        else if (panelMode === 'free') collapseFreePanel();
        else if (panelMode === 'route') closeRoutePanel();
        else closePanel();
      }
      return;
    }
    if (isInput) return;
    if (e.key === '/') {
      e.preventDefault();
      const wrap = document.querySelector('.search-wrap');
      const toggle = document.getElementById('search-toggle');
      const input = document.getElementById('search-input');
      if (!wrap.classList.contains('open')) toggle.click();
      else input.focus();
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
  await loadGraph();

  buildBuildingsUI();
  setupSearch();
  setupThemeToggle();
  setupResetControl().addTo(map);
  createFloorSwitcher().addTo(map);
  setupFreeToggle().addTo(map);
  setupPanelHandle();
  setupHotkeys();

  document.getElementById('route-toggle').addEventListener('click', openRoutePanel);

  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (roomId && roomsMeta[roomId]) {
    isPoppingState = true;
    await navigateToRoom(roomId);
    isPoppingState = false;
  } else {
    showFloor('C', 1);
  }
})();