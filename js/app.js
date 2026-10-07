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

let panelMode = null;
let currentRoomPanelId = null;

let freeModeOn = false;
let freePanelCollapsed = false;
let freeRoomIds = new Set();
let freeRoomData = new Map();

let isPoppingState = false;
let roomClickInProgress = false;

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

  if (!freeModeOn || panelMode === 'room') {
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

// ================ СВОБОДНЫЕ АУДИТОРИИ ================

function applyFreeHighlight() {
  Object.values(roomShapes).forEach(shapes => {
    shapes.forEach(s => s.classList.remove('room-free'));
  });
  if (!freeModeOn) return;
  for (const id of freeRoomIds) {
    const meta = roomsMeta[id];
    if (!meta) continue;
    if (meta.building !== currentBuilding) continue;
    if (meta.floor != null && meta.floor !== currentFloor) continue;
    const shapes = roomShapes[id] || [];
    shapes.forEach(s => s.classList.add('room-free'));
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
    data.free.forEach(r => {
      freeRoomIds.add(r.id);
      freeRoomData.set(r.id, { untilText: r.untilText, noSchedule: r.noSchedule });
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
    if (!freeModeOn || panelMode === 'room') return;
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
  panel.innerHTML = `
    <div class="panel-header">
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
    <div class="free-warming">
      <div class="spinner"></div>
      <div>Загружаю расписание…</div>
    </div>
  `;
  updatePanelHandle();
}

function renderFreePanelWarming(progress) {
  const panel = document.getElementById('panel');
  if (!panel.classList.contains('open')) return;
  panel.innerHTML = `
    <div class="panel-header">
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
    <div class="free-warming">
      <div class="spinner"></div>
      <div>Идёт первый прогрев кэша</div>
      <div class="progress">${progress || '0/0'}</div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-dim)">
        Это займёт 1–3 минуты. Дальше будет мгновенно.
      </div>
    </div>
  `;
}

function renderFreePanelError(msg) {
  const panel = document.getElementById('panel');
  panel.innerHTML = `
    <div class="panel-header">
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
    <div class="free-panel-empty" style="color:#f87171">Ошибка загрузки: ${msg}</div>
  `;
}

function renderFreePanel() {
  const panel = document.getElementById('panel');
  panel.classList.add('open');
  freePanelCollapsed = false;

  const relevant = [...freeRoomIds]
    .map(id => ({ id, meta: roomsMeta[id], data: freeRoomData.get(id) }))
    .filter(x => x.meta && x.meta.building === currentBuilding)
    .filter(x => x.meta.floor == null || x.meta.floor === currentFloor)
    .sort(naturalRoomSort);

  const header = `
    <div class="panel-header">
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Свободны сейчас</h2>
    </div>
  `;

  if (relevant.length === 0) {
    panel.innerHTML = `${header}
      <div class="free-panel-empty">На этом этаже все аудитории заняты</div>`;
    updatePanelHandle();
    return;
  }

  const listHtml = relevant.map(x => {
    const untilHtml = x.data.noSchedule
      ? 'свободна'
      : `свободна <span class="accent">${x.data.untilText}</span>`;
    return `
      <div class="free-item" data-room-id="${x.id}">
        <span class="free-dot"></span>
        <div class="free-body">
          <div class="free-name">${formatRoomName(x.meta.name)}</div>
          <div class="free-until">${untilHtml}</div>
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `${header}
    <div class="free-summary">
      <strong>${relevant.length}</strong>
      <span class="free-summary-label">свободных аудиторий</span>
    </div>
    <div class="free-list">${listHtml}</div>
  `;

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
      if (panelMode === 'room') {
        closeRoomPanel();
      } else if (panelMode === 'free') {
        // остаёмся в списке свободных
      } else {
        closePanel();
      }
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
    const q = raw.toLowerCase();
    results.innerHTML = '';
    if (!q) { renderHistory(); return; }
    historyEl.innerHTML = '';

    const expanded = expandQuery(q);
    const exact = [], fuzzy = [], seen = new Set();

    for (const [id, meta] of Object.entries(roomsMeta)) {
      const name = (meta.name || '').toLowerCase();
      const haystack = name + ' ' + id.toLowerCase();
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

    const found = [...exact, ...fuzzy].slice(0, 20);
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
        <div class="res-name">${formatRoomName(meta.name)}</div>
        <div class="res-meta">${bName}${meta.floor != null ? ' · ' + meta.floor + ' этаж' : ''}</div>
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
    onRoomClick(id);
  });

  updateTabActive();
  updateFloorSwitcher();
  applyFreeHighlight();
  scheduleLabelRefresh();

  if (selectedRoomId && roomShapes[selectedRoomId]) selectRoom(selectedRoomId);

  if (pendingHighlight && roomShapes[pendingHighlight]) {
    const shapes = roomShapes[pendingHighlight];
    shapes.forEach(s => s.style.opacity = '0.65');
    setTimeout(() => shapes.forEach(s => s.style.opacity = ''), 1500);
    pendingHighlight = null;
  }

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

    const icon = L.divIcon({
      className: 'room-label-wrap',
      html: `<span class="room-label">${labelText}</span>`,
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
    return `
      <div class="now-status none">
        <div class="now-dot"></div>
        <div class="now-body">
          <div class="now-title">Пар на этой неделе нет</div>
          <div class="now-details">Аудитория всегда свободна</div>
        </div>
      </div>`;
  }
  if (status.type === 'busy') {
    return `
      <div class="now-status busy">
        <div class="now-dot"></div>
        <div class="now-body">
          <div class="now-title">Сейчас идёт пара</div>
          <div class="now-details">${status.subject}${status.untilText ? ' · до ' + status.untilText : ''}</div>
        </div>
      </div>`;
  }
  return `
    <div class="now-status free">
      <div class="now-dot"></div>
      <div class="now-body">
        <div class="now-title">Аудитория свободна</div>
        <div class="now-details">${status.untilText ? 'до ' + status.untilText : 'до конца дня'}</div>
      </div>
    </div>`;
}

// ================ КЛИК ПО АУДИТОРИИ ================

async function onRoomClick(id, { pushHistory = true } = {}) {
  if (roomClickInProgress) return;

  const meta = roomsMeta[id];
  const panel = document.getElementById('panel');

  if (currentRoomPanelId === id && panelMode === 'room') {
    closeRoomPanel();
    return;
  }

  roomClickInProgress = true;

  try {
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
        ${crumbs ? `<div class="panel-crumbs">${crumbs}</div>` : ''}
        <h2>${title}${shareIcon}</h2>
      </div>
    `;

    const descriptionBlock = meta?.description
      ? `<div class="room-notes">${meta.description}</div>`
      : '';

    // ===== Помещение без classroom =====
    if (!meta || !meta.building || !meta.classroom) {
      const block = descriptionBlock ||
        `<div class="room-notes empty">У этого помещения нет заметок.</div>`;
      panel.innerHTML = `${header}${block}`;
      attachShareListener(panel, id);
      return;
    }

    // ===== Аудитория с classroom =====
    panel.innerHTML = `${header}${descriptionBlock}<p class="muted-text">Загрузка расписания…</p>`;
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

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const data = parseSchedule(html);

    if (currentRoomPanelId !== id || panelMode !== 'room') return;

    if (data.empty) {
      panel.innerHTML = `${header}${descriptionBlock}<div class="no-schedule-msg">У этой аудитории нет расписания занятий</div>`;
      attachShareListener(panel, id);
      return;
    }
    renderSchedule(panel, title, data, header, descriptionBlock);
    attachShareListener(panel, id);
  } catch (err) {
    if (currentRoomPanelId !== id || panelMode !== 'room') return;

    // Пересчитываем header и descriptionBlock заново — на случай, если ошибка
    // приключилась до их объявления
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
        ${crumbs ? `<div class="panel-crumbs">${crumbs}</div>` : ''}
        <h2>${title}${shareIcon}</h2>
      </div>
    `;
    const descriptionBlock = meta?.description
      ? `<div class="room-notes">${meta.description}</div>`
      : '';

    panel.innerHTML = `${header}${descriptionBlock}
      <p style="color:#f87171">Ошибка загрузки: ${err.message}</p>`;
    attachShareListener(panel, id);
    console.error('[onRoomClick]', err);
  } finally {
    roomClickInProgress = false;
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

// ================ ПАРСЕР ================

function parseSchedule(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dateSelect = doc.querySelector('select[name="date"]');
  const dateOptions = dateSelect ? [...dateSelect.options].filter(o => o.value) : [];
  if (dateOptions.length === 0) return { empty: true, days: [] };

  const table = doc.querySelector('table.table');
  if (!table) return { empty: false, days: [] };

  const rows = [...table.rows];
  if (rows.length < 2) return { empty: false, days: [] };

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

  return { empty: false, days };
}

// ================ РЕНДЕР ПАНЕЛИ ================

function renderSchedule(panel, title, data, header, descriptionBlock = '') {
  const nowStatus = computeNowStatus(data);
  const today = new Date();
  const nowMin = today.getHours() * 60 + today.getMinutes();

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
            badgeHtml = `<span class="badge pr">${l.type}</span>`;
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
                ${sg.group ? 'гр. ' + sg.group : ''}${sg.group && sg.lecturer ? ' · ' : ''}${sg.lecturer || ''}
              </div>
            `).join('');
          } else {
            metaHtml = `<div class="meta">${l.group ? 'гр. ' + l.group : ''}${l.group && l.lecturer ? ' · ' : ''}${l.lecturer || ''}</div>`;
          }

          return `
            <div class="${cls}">
              <div class="time">${l.time}${breakText}</div>
              <div class="subject">${badgeHtml}${l.subject}</div>
              ${metaHtml}
            </div>`;
        }).join('');

    return `
      <div class="day-block${isToday ? ' today' : ''}">
        <div class="day-header">
          ${day.dayName}${day.dateText ? ', ' + day.dateText : ''}${isToday ? ' · сегодня' : ''}
        </div>
        ${lessonsHtml}
      </div>`;
  }).join('');

  panel.innerHTML = `${header}${descriptionBlock}${renderNowStatus(nowStatus)}${daysHtml}`;
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
  roomsMeta = await fetch('data/rooms.json').then(r => r.json());
  buildBuildingsUI();
  setupSearch();
  setupThemeToggle();
  setupResetControl().addTo(map);
  createFloorSwitcher().addTo(map);
  setupFreeToggle().addTo(map);
  setupPanelHandle();
  setupHotkeys();

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