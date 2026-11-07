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
  '18:45': '19:30–19:35',
  '18:50': '19:35–19:40',
  '20:25': '21:10–21:15'
};

const LESSON_TYPES = {
  'Лек.':  { cls: 'lec',  icon: 'mdi-book-open-page-variant' },
  'Лаб.':  { cls: 'lab',  icon: 'mdi-microscope' },
  'Упр.':  { cls: 'pr',   icon: 'mdi-function-variant' },
  'Конс.': { cls: 'cons', icon: 'mdi-comment-question-outline' },
  'Зач.':  { cls: 'zach', icon: 'mdi-check-decagram-outline' },
  'Экз.':  { cls: 'exam', icon: 'mdi-school-outline' }
};

function normalizeClientLessonType(rawType) {
  const s = String(rawType || '').trim();
  if (!s) return '';
  if (/^конс/i.test(s)) return 'Конс.';
  if (/^зач/i.test(s)) return 'Зач.';
  if (/^экз/i.test(s)) return 'Экз.';
  if (/^лек/i.test(s)) return 'Лек.';
  if (/^(?:упр|прак|сем)/i.test(s)) return 'Упр.';
  if (/^лаб/i.test(s)) return 'Лаб.';
  return s;
}

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

const FACULTY_FULL_NAMES = {
  'ФРТ': 'Факультет радиотехники и телекоммуникаций',
  'ФЭ': 'Факультет электроники',
  'ФАИТУ': 'Факультет автоматики и информационных технологий в управлении',
  'ФВТ': 'Факультет вычислительной техники',
  'ИЭФ': 'Инженерно-экономический факультет',
  'ОА': 'Отдел аспирантуры',
  'ИДО': 'Институт дополнительного образования'
};

function formatFacultyFullName(fac) {
  const raw = String(fac || '').trim();
  if (!raw) return '';
  return FACULTY_FULL_NAMES[raw] || FACULTY_FULL_NAMES[raw.toUpperCase()] || raw;
}

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
  '🟢 Какие аудитории сейчас свободны?',
  'В каких аудиториях на этой неделе у Скворцова будут пары?',
  'Какие аудитории сейчас свободны на 2 этаже?',
  'Что сейчас в 302 аудитории?',
  'Расписание группы 445 на этой неделе',
  'Какая сейчас пара и расписание звонков?',
  'Где поесть в Главном корпусе?',
  'Как пройти от входа до 100 аудитории?'
];

// ================ TELEGRAM ================

const tg = window.Telegram?.WebApp;
let telegramUser = null;

function initTelegram() {
  if (!tg || !tg.initData) return;
  try {
    tg.ready();
    tg.expand();
    document.body.classList.add('tg-webapp');
    document.documentElement.style.setProperty('--tg-safe-top', '0px');
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
  if (!tg || !tg.initData || typeof tg.isVersionAtLeast !== 'function' || !tg.isVersionAtLeast('6.1')) return;
  if (tg.HapticFeedback) {
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
let roomSvgCentroids = {};
let pendingHighlight = null;
let selectedRoomId = null;
let selectedShapes = [];
let hoveredRoomId = null;

let currentSvgViewBox = { W: 1000, H: 1000 };
let mapBearingDeg = 0;

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
let routeIncludeOutdoor = true;

// ИИ-навигатор
let aiMessages = [];
let aiLoading = false;
let aiFreeFloorFilter = 'all'; // 'all' | 0 | 1 | 2 | 3 | 4

// Справочник расписания (Группы, Преподаватели и Аудитории)
let scheduleDirectory = { ready: false, groups: [], lecturers: [], classrooms: [] };
let directoryActiveTab = 'groups'; // 'groups' | 'lecturers' | 'classrooms'
let directoryFilterQuery = '';
let currentEntitySchedule = null; // { type: 'group'|'lecturer'|'classroom', name: string }
let scheduleViewOpen = false;
let scheduleSidebarCollapsed = false;
let scheduleMobileStep = 'list'; // 'list' | 'detail'
let scheduleDayFilter = 'all';   // 'all' | date string
let currentEntityData = null;
let entityLoading = false;
let entityError = null;
let selectedScheduleWeekDate = '';
let scheduleWeekDropdownOpen = false;
let availableScheduleWeeks = [];

// Пользовательский профиль и Telegram-авторизация
let currentUserId = localStorage.getItem('rsreu_user_id') || '';
let userProfile = {
  role: localStorage.getItem('rsreu_user_role') || 'student',
  targetName: localStorage.getItem('rsreu_user_target') || '',
  notificationsEnabled: localStorage.getItem('rsreu_user_notif') !== 'false',
  telegramLinked: localStorage.getItem('rsreu_user_linked') === 'true',
  firstName: localStorage.getItem('rsreu_user_first_name') || '',
  username: localStorage.getItem('rsreu_user_username') || '',
  favorites: (() => { try { return JSON.parse(localStorage.getItem('rsreu_user_favorites') || '[]'); } catch (e) { return []; } })(),
  recentViews: (() => { try { return JSON.parse(localStorage.getItem('rsreu_user_recent') || '{}'); } catch (e) { return {}; } })(),
  lessonNotes: (() => { try { return JSON.parse(localStorage.getItem('rsreu_user_notes') || '{}'); } catch (e) { return {}; } })(),
  theme: localStorage.getItem('theme') || 'system'
};
let botUsername = 'rsreu_map_bot';
let authPollTimer = null;
let activeAuthSessionToken = '';
const currentWeekStatusByEntityKey = new Map();

// Сообщество (POI метки, отзывы о буфетах) и гибридный GPS
let poiLayerVisible = (() => {
  try {
    const saved = localStorage.getItem('radikmap_poi_layer');
    return saved === null ? true : saved !== 'false';
  } catch (e) {
    return true;
  }
})();
let communityState = {
  markers: [],
  reviews: [],
  userReviews: [],
  gpsConfig: null
};
let poiLayer = null;
let gpsLayer = null;
let addingPoiMode = false;
let gpsState = {
  active: false,
  watchId: null,
  pickMode: false,
  pickingPoiMode: false,
  x: null,
  y: null,
  floor: 1,
  building: 'C',
  nearestNodeId: null,
  accuracyMeters: null,
  headingDeg: 0,
  lastStepAt: 0
};

// Стек истории действий для Ctrl+Z / Ctrl+Y и кнопок мыши Назад/Вперёд
const navHistoryStack = [];
let navHistoryIndex = -1;
let isApplyingNavHistory = false;

// Кэш для SVG документов при кросс-этажных запросах
const svgCache = {};

// ================ КАРТА ================

const map = L.map('map', {
  crs: L.CRS.Simple,
  renderer: L.svg({ padding: 2.0 }),
  minZoom: -3,
  maxZoom: 3,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  wheelPxPerZoomLevel: 200,
  wheelDebounceTime: 20,
  zoomAnimation: true,
  zoomControl: false,
  attributionControl: false
});

map.createPane('routePane');
map.getPane('routePane').style.zIndex = 450;
map.createPane('poiPane');
map.getPane('poiPane').style.zIndex = 460;
map.createPane('gpsPane');
map.getPane('gpsPane').style.zIndex = 470;

routeLayer = L.layerGroup().addTo(map);
routePickLayer = L.layerGroup().addTo(map);
poiLayer = L.layerGroup().addTo(map);
gpsLayer = L.layerGroup().addTo(map);

function syncMapRotationTransform() {
  if (!map) return;
  const { W, H } = currentSvgViewBox;
  const centerLayerPt = map.latLngToLayerPoint(L.latLng((H || 1000) / 2, (W || 1000) / 2));
  const originStr = `${Math.round(centerLayerPt.x)}px ${Math.round(centerLayerPt.y)}px`;
  const rotStr = mapBearingDeg ? `rotate(${mapBearingDeg}deg)` : '';
  ['overlayPane', 'routePane', 'poiPane', 'gpsPane', 'markerPane', 'shadowPane', 'tooltipPane', 'popupPane'].forEach(paneName => {
    const p = map.getPane(paneName);
    if (p) {
      p.style.transformOrigin = originStr;
      p.style.transform = rotStr;
    }
  });
}

function syncMapLabelScale() {
  if (!map) return;
  const z = typeof map.getZoom === 'function' ? map.getZoom() : 0;
  const scale = z < 0 ? Math.max(0.54, Math.pow(2, z * 0.42)) : 1;
  document.documentElement.style.setProperty('--map-label-scale', scale.toFixed(3));
}

map.on('zoom zoomend viewreset moveend resize', () => {
  syncMapRotationTransform();
  syncMapLabelScale();
});

// На мобильных при перетаскивании карты в режиме маршрута панель автоматически прижимается вниз
map.on('dragstart', () => {
  if (window.innerWidth <= 768 && panelMode === 'route') {
    const panel = document.getElementById('panel');
    if (panel && panel.classList.contains('open')) {
      panel.classList.remove('mobile-expanded');
      panel.classList.add('mobile-minimized');
    }
  }
});

// ================ СИНХРОНИЗАЦИЯ КНОПОК РЕЖИМОВ ================

function closeUserDropdown() {
  const dropdown = document.getElementById('user-dropdown');
  const btn = document.getElementById('user-menu-btn');
  const suggestions = document.getElementById('user-target-suggestions');
  if (dropdown) dropdown.classList.add('hidden');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('open-active');
  }
  if (suggestions) suggestions.classList.add('hidden');
  document.body.classList.remove('mobile-profile-open');
}

function closeSearchDropdown() {
  const wrap = document.getElementById('search-wrap');
  if (wrap) wrap.classList.remove('open');
  document.body.classList.remove('mobile-search-open');
}

function isMobileAiBarMode() {
  const panel = document.getElementById('panel');
  return Boolean(
    window.innerWidth <= 768 &&
    panelMode === 'ai' &&
    panel &&
    panel.classList.contains('open')
  );
}

function syncModeUI() {
  const omniAiBtn = document.getElementById('omni-ai-btn');
  const omniRouteBtn = document.getElementById('omni-route-btn');
  const omniAiSendBtn = document.getElementById('omni-ai-send');
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  const cornerTab = document.getElementById('schedule-corner-tab');
  const cornerTabLabel = document.getElementById('schedule-corner-label');
  const cornerTabIcon = document.getElementById('schedule-corner-icon');
  const panel = document.getElementById('panel');

  const isRoute = panelMode === 'route';
  if (omniRouteBtn) omniRouteBtn.classList.toggle('active', isRoute);

  // Кнопка «ИИ'шка» остаётся синей в режиме ИИ даже когда правая панель свёрнута язычком
  const isAiActive = panelMode === 'ai';
  if (omniAiBtn) omniAiBtn.classList.toggle('active', isAiActive);

  if (cornerTab) {
    cornerTab.classList.toggle('active', scheduleViewOpen);
  }
  if (cornerTabLabel) {
    cornerTabLabel.textContent = scheduleViewOpen ? 'На карту' : 'Расписание';
  }
  if (cornerTabIcon) {
    cornerTabIcon.className = scheduleViewOpen
      ? 'mdi mdi-map-outline'
      : 'mdi mdi-calendar-month-outline';
  }

  const isPanelOpen = Boolean(panel && panel.classList.contains('open'));
  const isAiPanelOpen = Boolean(isAiActive && isPanelOpen);
  document.body.classList.toggle('panel-is-open', isPanelOpen);
  document.body.classList.toggle('route-mode-active', Boolean(isRoute && isPanelOpen));
  document.body.classList.toggle('ai-mode-active', isAiPanelOpen);
  document.body.classList.toggle('schedule-is-open', scheduleViewOpen);

  const mobileAi = window.innerWidth <= 768 && isAiPanelOpen;
  if (omniAiSendBtn) {
    omniAiSendBtn.classList.toggle('hidden', !mobileAi);
    omniAiSendBtn.disabled = Boolean(aiLoading);
  }
  if (searchInput) {
    searchInput.placeholder = mobileAi
      ? "Сообщение ИИ'шке..."
      : 'Поиск и выбор мест';
    const hasText = Boolean(searchInput.value.length > 0);
    if (clearBtn) clearBtn.classList.toggle('hidden', !hasText);
    if (omniRouteBtn && !mobileAi) omniRouteBtn.classList.toggle('hidden', hasText);
  }
}

// ================ ПАНЕЛЬ ================

function syncMobileMapViewportWithSheet() {
  if (window.innerWidth > 768) {
    document.documentElement.style.setProperty('--mobile-sheet-offset', '0px');
    return;
  }
  const panel = document.getElementById('panel');
  const isSheetActive = Boolean(
    panel &&
    panel.classList.contains('open') &&
    !scheduleViewOpen
  );
  if (!isSheetActive) {
    document.documentElement.style.setProperty('--mobile-sheet-offset', '0px');
    return;
  }
  const rect = panel.getBoundingClientRect();
  const visibleH = Math.max(0, Math.min(window.innerHeight - 68, window.innerHeight - rect.top));
  document.documentElement.style.setProperty('--mobile-sheet-offset', `${Math.round(visibleH)}px`);
}

function applyMobileSheetSnapMeasurement(panel, { preserveHeight = false } = {}) {
  if (!panel || window.innerWidth > 768 || panelMode === 'ai') {
    if (panel) {
      panel.classList.remove('mobile-no-expand');
      panel.style.removeProperty('--mobile-base-snap');
      if (window.innerWidth > 768) panel.style.height = '';
    }
    return;
  }

  requestAnimationFrame(() => {
    if (!panel.classList.contains('open') || panelMode === 'ai') return;
    const dragBarEl = panel.querySelector('.panel-drag-bar');
    const fixedEl = panel.querySelector('.panel-fixed');
    const scrollEl = panel.querySelector('.panel-scroll');

    const dragH = dragBarEl ? dragBarEl.offsetHeight : 20;
    const fixedH = fixedEl ? fixedEl.offsetHeight : 150;
    const hasScrollContent = Boolean(
      scrollEl &&
      scrollEl.children.length > 0 &&
      scrollEl.textContent.trim().length > 0 &&
      !scrollEl.querySelector('.no-schedule-msg')
    );

    panel.classList.toggle('mobile-no-expand', !hasScrollContent);
    if (!hasScrollContent) {
      panel.classList.remove('mobile-expanded');
    }

    const extraPad = panelMode === 'route' ? 24 : 14;
    const exactSnap = Math.min(
      Math.round(window.innerHeight * 0.68),
      Math.max(124, dragH + fixedH + extraPad)
    );
    panel.dataset.baseSnapPx = String(exactSnap);
    panel.style.setProperty('--mobile-base-snap', `${exactSnap}px`);
    if (!preserveHeight && !panel.classList.contains('mobile-expanded') && !panel.classList.contains('mobile-minimized')) {
      panel.style.height = '';
    }
    syncMobileMapViewportWithSheet();
  });
}

function smoothInvalidateSize(duration = 260) {
  const start = performance.now();
  (function tick() {
    syncMobileMapViewportWithSheet();
    map.invalidateSize({ animate: false });
    if (performance.now() - start < duration) {
      requestAnimationFrame(tick);
    } else {
      syncMobileMapViewportWithSheet();
      scheduleLabelRefresh();
    }
  })();
}

let aiClosingTimer = null;

function triggerAiModeClosingTransition() {
  if (aiClosingTimer) {
    clearTimeout(aiClosingTimer);
    aiClosingTimer = null;
  }
  document.body.classList.add('ai-mode-closing');
  aiClosingTimer = setTimeout(() => {
    document.body.classList.remove('ai-mode-closing');
    aiClosingTimer = null;
  }, 280);
}

function openPanel() {
  if (aiClosingTimer) {
    clearTimeout(aiClosingTimer);
    aiClosingTimer = null;
  }
  document.body.classList.remove('ai-mode-closing');
  closeUserDropdown();
  closeSearchDropdown();
  const panel = document.getElementById('panel');
  panel.classList.add('open');
  panel.classList.remove('mobile-minimized');
  document.body.classList.add('panel-is-open');
  smoothInvalidateSize(260);
  setTimeout(updatePanelHandle, 260);
  syncModeUI();
}

function closePanel() {
  if (panelMode === 'ai' || document.body.classList.contains('ai-mode-active')) {
    triggerAiModeClosingTransition();
  }
  const panel = document.getElementById('panel');
  panel.classList.remove('open', 'mobile-compact', 'mobile-expanded', 'mobile-minimized', 'mobile-no-expand');
  panel.style.height = '';
  panel.style.removeProperty('--mobile-base-snap');
  document.body.classList.remove('panel-is-open', 'route-mode-active');
  clearSelectedRoom();
  updateURL(null, { push: false });
  panelMode = null;
  currentRoomPanelId = null;
  smoothInvalidateSize(260);
  updatePanelHandle();
  syncModeUI();
  recordNavState();
}

function closeRoomPanel() {
  clearSelectedRoom();
  updateURL(null, { push: false });
  currentRoomPanelId = null;
  closePanel();
}

function collapseFreePanel() {
  if (panelMode === 'ai' || document.body.classList.contains('ai-mode-active')) {
    triggerAiModeClosingTransition();
  }
  const panel = document.getElementById('panel');
  panel.classList.remove('open');
  document.body.classList.remove('panel-is-open', 'route-mode-active');
  smoothInvalidateSize(260);
  updatePanelHandle();
  syncModeUI();
}

function expandFreePanel() {
  if (panelMode === 'room' || panelMode === 'directory' || panelMode === 'entity') {
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
  if (panelMode === 'ai') {
    renderAiPanel();
  }
  updatePanelHandle();
  syncModeUI();
}

async function toggleFreeMode() {
  if (!freeModeOn) {
    freeModeOn = true;
    freePanelCollapsed = false;
    try { localStorage.setItem('free_mode', '1'); } catch (e) {}
    await fetchFreeRooms();
    applyFreeHighlight();
    if (panelMode === 'ai') renderAiPanel();
    syncModeUI();
  } else {
    disableFreeMode();
  }
}

function isAnyCollapsiblePanelMode() {
  if (scheduleViewOpen && panelMode !== 'ai') return false;
  return (
    panelMode === 'room' ||
    panelMode === 'route' ||
    panelMode === 'ai'
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

function getMobileDragBarHtml() {
  return `
    <div class="panel-drag-bar" data-panel-drag="true" title="Потяните, чтобы изменить высоту панели">
      <div class="panel-drag-pill"></div>
    </div>
  `;
}

function buildPanelLayout(fixedHtml, scrollHtml) {
  return `${getMobileDragBarHtml()}<div class="panel-fixed">${fixedHtml}</div><div class="panel-scroll">${scrollHtml}</div>`;
}

function setupMobilePanelSheet() {
  const panel = document.getElementById('panel');
  if (!panel) return;

  let startY = 0;
  let startHeight = 0;
  let currentDeltaY = 0;
  let dragging = false;
  let activePointerId = null;

  const toggleMobileSheetState = () => {
    const noExpand = panel.classList.contains('mobile-no-expand');
    if (panel.classList.contains('mobile-minimized')) {
      panel.classList.remove('mobile-minimized');
    } else if (noExpand) {
      panel.classList.add('mobile-minimized');
    } else if (panel.classList.contains('mobile-expanded')) {
      panel.classList.remove('mobile-expanded');
      panel.classList.add('mobile-minimized');
    } else {
      panel.classList.add('mobile-minimized');
    }
    smoothInvalidateSize(260);
  };

  panel.addEventListener('click', (e) => {
    const dragBar = e.target.closest('[data-panel-drag]');
    if (dragBar && window.innerWidth <= 768 && Math.abs(currentDeltaY) < 6) {
      toggleMobileSheetState();
    }
  });

  const beginDrag = (clientY) => {
    dragging = true;
    startY = clientY;
    startHeight = panel.getBoundingClientRect().height || Number(panel.dataset.baseSnapPx) || Math.round(window.innerHeight * 0.45);
    currentDeltaY = 0;
    panel.classList.add('dragging');
  };

  const moveDrag = (clientY) => {
    if (!dragging) return;
    currentDeltaY = clientY - startY;
    const noExpand = panel.classList.contains('mobile-no-expand');
    const baseSnap = Number(panel.dataset.baseSnapPx) || startHeight;
    const maxH = (noExpand && panelMode !== 'ai')
      ? Math.max(baseSnap, 140)
      : Math.max(240, window.innerHeight - 54);
    const minH = 54;
    const nextH = Math.max(minH, Math.min(maxH, startHeight - currentDeltaY));
    panel.style.height = `${nextH}px`;
    syncMobileMapViewportWithSheet();
  };

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    activePointerId = null;
    panel.classList.remove('dragging');
    const finalHeight = panel.getBoundingClientRect().height;
    panel.style.height = '';

    const vh = window.innerHeight || 800;
    const noExpand = panel.classList.contains('mobile-no-expand');
    const baseSnap = Number(panel.dataset.baseSnapPx) || Math.round(vh * 0.4);

    if (currentDeltaY > 36) {
      if (panel.classList.contains('mobile-expanded') && finalHeight > baseSnap * 0.85) {
        panel.classList.remove('mobile-expanded');
      } else if (panelMode === 'ai') {
        closeAiPanel();
      } else {
        panel.classList.remove('mobile-expanded');
        panel.classList.add('mobile-minimized');
      }
    } else if (currentDeltaY < -36) {
      if (panel.classList.contains('mobile-minimized')) {
        panel.classList.remove('mobile-minimized');
      } else if (!noExpand) {
        panel.classList.add('mobile-expanded');
      }
    } else if (Math.abs(currentDeltaY) >= 6) {
      panel.classList.remove('mobile-expanded', 'mobile-minimized');
      if (!noExpand && finalHeight >= vh * 0.72) {
        panel.classList.add('mobile-expanded');
      } else if (finalHeight <= Math.min(130, baseSnap * 0.65)) {
        if (panelMode === 'ai') closeAiPanel();
        else panel.classList.add('mobile-minimized');
      }
    }

    smoothInvalidateSize(260);
    setTimeout(() => { currentDeltaY = 0; }, 50);
  };

  panel.addEventListener('pointerdown', (e) => {
    if (window.innerWidth > 768) return;
    const dragHeader = e.target.closest('[data-panel-drag], .panel-header, .ai-panel-header');
    if (!dragHeader || e.target.closest('button, input, a, .share-icon')) return;
    activePointerId = e.pointerId;
    try { dragHeader.setPointerCapture(e.pointerId); } catch (err) {}
    beginDrag(e.clientY);
  });

  panel.addEventListener('pointermove', (e) => {
    if (!dragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    moveDrag(e.clientY);
  });

  panel.addEventListener('pointerup', finishDrag);
  panel.addEventListener('pointercancel', finishDrag);

  panel.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768 || dragging) return;
    const dragHeader = e.target.closest('[data-panel-drag], .panel-header, .ai-panel-header');
    if (!dragHeader || e.target.closest('button, input, a, .share-icon')) return;
    beginDrag(e.touches[0].clientY);
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    moveDrag(e.touches[0].clientY);
  }, { passive: true });

  panel.addEventListener('touchend', finishDrag);
  panel.addEventListener('touchcancel', finishDrag);

  // Свайп/перетаскивание вниз для закрытия окна профиля на мобильных (Touch + Pointer)
  const userDropdown = document.getElementById('user-dropdown');
  if (userDropdown) {
    let udStartY = 0;
    let udDeltaY = 0;
    let udDragging = false;
    let udPointerId = null;

    const startUdDrag = (clientY) => {
      udDragging = true;
      udStartY = clientY;
      udDeltaY = 0;
      userDropdown.style.transition = 'none';
    };
    const moveUdDrag = (clientY) => {
      if (!udDragging) return;
      udDeltaY = Math.max(0, clientY - udStartY);
      userDropdown.style.transform = `translateY(${udDeltaY}px)`;
    };
    const endUdDrag = () => {
      if (!udDragging) return;
      udDragging = false;
      udPointerId = null;
      userDropdown.style.transition = '';
      userDropdown.style.transform = '';
      if (udDeltaY > 52) closeUserDropdown();
      udDeltaY = 0;
    };

    userDropdown.addEventListener('pointerdown', (e) => {
      if (window.innerWidth > 768) return;
      const handle = e.target.closest('.user-dropdown-drag-pill, .user-dropdown-header');
      if (!handle || e.target.closest('button, input, a')) return;
      udPointerId = e.pointerId;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      startUdDrag(e.clientY);
    });
    userDropdown.addEventListener('pointermove', (e) => {
      if (!udDragging || (udPointerId !== null && e.pointerId !== udPointerId)) return;
      moveUdDrag(e.clientY);
    });
    userDropdown.addEventListener('pointerup', endUdDrag);
    userDropdown.addEventListener('pointercancel', endUdDrag);

    userDropdown.addEventListener('touchstart', (e) => {
      if (window.innerWidth > 768 || udDragging) return;
      if (!e.target.closest('.user-dropdown-drag-pill, .user-dropdown-header') || e.target.closest('button, input, a')) return;
      startUdDrag(e.touches[0].clientY);
    }, { passive: true });
    userDropdown.addEventListener('touchmove', (e) => {
      if (!udDragging) return;
      moveUdDrag(e.touches[0].clientY);
    }, { passive: true });
    userDropdown.addEventListener('touchend', endUdDrag);
    userDropdown.addEventListener('touchcancel', endUdDrag);
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
    pollCacheStatus();
  } else if (result.ok) {
    applyFreeHighlight();
    if (panelMode === 'ai') renderAiPanel();
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
      }
    } catch (e) { console.error('[cache-status]', e); }
  }, 1500);
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

// ================ URL / HISTORY & UNDO/REDO ================

function getNavSnapshot() {
  return {
    scheduleViewOpen: Boolean(scheduleViewOpen),
    entity: currentEntitySchedule ? { ...currentEntitySchedule } : null,
    weekDate: selectedScheduleWeekDate || '',
    building: currentBuilding || 'C',
    floor: currentFloor ?? 1,
    panelMode: panelMode || null,
    roomId: currentRoomPanelId || null,
    routeFrom: routeState.fromRoomId || null,
    routeTo: routeState.toRoomId || null
  };
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.scheduleViewOpen === b.scheduleViewOpen &&
    (a.entity?.type || '') === (b.entity?.type || '') &&
    (a.entity?.name || '') === (b.entity?.name || '') &&
    a.weekDate === b.weekDate &&
    a.building === b.building &&
    a.floor === b.floor &&
    a.panelMode === b.panelMode &&
    a.roomId === b.roomId &&
    a.routeFrom === b.routeFrom &&
    a.routeTo === b.routeTo
  );
}

function recordNavState() {
  if (isPoppingState || isApplyingNavHistory) return;
  const snap = getNavSnapshot();
  if (navHistoryIndex >= 0 && snapshotsEqual(navHistoryStack[navHistoryIndex], snap)) {
    return;
  }
  navHistoryStack.splice(navHistoryIndex + 1);
  navHistoryStack.push(snap);
  if (navHistoryStack.length > 50) {
    navHistoryStack.shift();
  }
  navHistoryIndex = navHistoryStack.length - 1;
}

async function applyNavSnapshot(snap) {
  if (!snap) return;
  isApplyingNavHistory = true;
  try {
    if (snap.building && snap.floor != null && (snap.building !== currentBuilding || snap.floor !== currentFloor)) {
      await showFloor(snap.building, snap.floor);
    }
    if (snap.scheduleViewOpen) {
      if (snap.entity && snap.entity.type && snap.entity.name) {
        selectedScheduleWeekDate = snap.weekDate || '';
        await openEntitySchedule(snap.entity.type, snap.entity.name);
      } else {
        await openScheduleDirectory();
      }
      return;
    } else if (scheduleViewOpen) {
      closeScheduleView({ updateHistory: false });
    }

    if (snap.panelMode === 'room' && snap.roomId && roomsMeta[snap.roomId]) {
      await onRoomClick(snap.roomId, { pushHistory: false });
      panToRoom(snap.roomId);
    } else if (snap.panelMode === 'route') {
      routeState.fromRoomId = snap.routeFrom;
      routeState.toRoomId = snap.routeTo;
      openRoutePanel();
      if (snap.routeFrom && snap.routeTo) {
        await onBuildRouteClick();
      }
    } else {
      if (panelMode === 'room') closeRoomPanel();
      else if (panelMode === 'route') closeRoutePanel();
      else if (panelMode === 'ai') closeAiPanel();
      else if (document.getElementById('panel')?.classList.contains('open')) closePanel();
    }
  } finally {
    isApplyingNavHistory = false;
  }
}

async function undoNavHistory() {
  if (navHistoryIndex <= 0) return;
  navHistoryIndex--;
  await applyNavSnapshot(navHistoryStack[navHistoryIndex]);
}

async function redoNavHistory() {
  if (navHistoryIndex >= navHistoryStack.length - 1) return;
  navHistoryIndex++;
  await applyNavSnapshot(navHistoryStack[navHistoryIndex]);
}

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

window.addEventListener('popstate', async () => {
  isPoppingState = true;
  try {
    const params = new URLSearchParams(location.search);
    const viewParam = params.get('view');
    const typeParam = params.get('type');
    const nameParam = params.get('name');
    const roomId = params.get('room');
    if (viewParam === 'schedule') {
      if (typeParam && nameParam) {
        await openEntitySchedule(typeParam, nameParam);
      } else {
        await openScheduleDirectory();
      }
    } else {
      if (scheduleViewOpen) closeScheduleView({ updateHistory: false });
      if (roomId && roomsMeta[roomId]) {
        await navigateToRoom(roomId);
      } else {
        if (panelMode === 'room') closeRoomPanel();
        else if (panelMode === 'route') closeRoutePanel();
        else closePanel();
      }
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
    if (w.startsWith(queryToken)) return true;
  }
  return false;
}

function searchRooms(query, limit = 30) {
  const q = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!q) return [];

  const isStairsQuery = q.includes('лестниц');
  const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

  // 1. Проверяем семантическую категорию (столовая/буфет, спортзал, туалет, деканат и т.д.)
  const matchedRule = SEARCH_CATEGORY_RULES.find(rule =>
    rule.triggers.some(t => q === t || (q.length >= 4 && levenshtein(q, t) <= 1))
  );

  if (matchedRule) {
    const results = [];
    for (const [id, meta] of Object.entries(roomsMeta)) {
      if (!meta || (meta.type === 'stairs' && !isStairsQuery)) continue;
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

  // 2. Поиск по номеру аудитории, названию и описанию (включая префиксы и подстроки от 1 символа)
  const queryTokens = tokenizeWords(q);
  const scored = [];

  for (const [id, meta] of Object.entries(roomsMeta)) {
    if (!meta || (meta.type === 'stairs' && !isStairsQuery)) continue;

    const name = (meta.name || '').toLowerCase().replace(/ё/g, 'е');
    const shortName = (meta.shortName || '').toLowerCase().replace(/ё/g, 'е');
    const desc = (meta.description || '').toLowerCase().replace(/ё/g, 'е');
    const classroom = String(meta.classroom || '').toLowerCase();

    if (shortName === q || name === q || id.toLowerCase() === q) {
      scored.push({ id, meta, score: 200 });
      continue;
    }

    if (shortName && shortName.startsWith(q)) {
      scored.push({ id, meta, score: 150 });
      continue;
    }

    const shortTokens = tokenizeWords(shortName);
    if (shortTokens.some(t => t === q || t.startsWith(q))) {
      scored.push({ id, meta, score: 125 });
      continue;
    }

    if (shortName && shortName.includes(q)) {
      scored.push({ id, meta, score: 105 });
      continue;
    }

    const words = tokenizeWords(`${name} ${shortName} ${desc}`);
    let allTokensMatched = queryTokens.length > 0;
    let tokenScoreSum = 0;

    for (const qt of queryTokens) {
      let bestTokenScore = 0;
      for (const w of words) {
        if (qt === 'кафе' && w.startsWith('кафедр')) continue;
        if (w === qt) {
          bestTokenScore = Math.max(bestTokenScore, 85);
        } else if (w.startsWith(qt)) {
          bestTokenScore = Math.max(bestTokenScore, 70);
        } else if (qt.length >= 2 && w.includes(qt)) {
          bestTokenScore = Math.max(bestTokenScore, 50);
        } else if (qt.length >= 4 && w.length >= 4 && Math.abs(w.length - qt.length) <= 1 && levenshtein(qt, w) <= 1) {
          bestTokenScore = Math.max(bestTokenScore, 35);
        }
      }
      if (bestTokenScore === 0) {
        allTokensMatched = false;
        break;
      }
      tokenScoreSum += bestTokenScore;
    }

    if (allTokensMatched && tokenScoreSum > 0) {
      const typeBoost = meta.type === 'room' && classroom ? 5 : 0;
      scored.push({ id, meta, score: tokenScoreSum + typeBoost });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const keyA = String(a.meta.shortName || formatRoomName(a.meta.name || ''));
    const keyB = String(b.meta.shortName || formatRoomName(b.meta.name || ''));
    return collator.compare(keyA, keyB);
  });

  return scored.slice(0, limit).map(({ id, meta }) => ({ id, meta }));
}

function searchEntitiesLocal(query, limit = 5) {
  const q = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!q || !scheduleDirectory.ready) return { lecturers: [], groups: [] };

  const lecturers = scheduleDirectory.lecturers
    .filter(l => {
      const hay = `${l.name} ${l.shortName} ${l.fullName || ''} ${l.regalia || ''}`.toLowerCase().replace(/ё/g, 'е');
      return hay.includes(q);
    })
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
  const omniRouteBtn  = document.getElementById('omni-route-btn');
  const omniSubmitBtn = document.getElementById('omni-search-submit');
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

  const omniAiSendBtn = document.getElementById('omni-ai-send');

  function updateClearAndInlineAi() {
    const hasText = Boolean(input.value.length > 0);
    const raw = input.value.trim();
    const mobileAi = isMobileAiBarMode();
    if (clearBtn) clearBtn.classList.toggle('hidden', !hasText);
    if (omniRouteBtn) omniRouteBtn.classList.toggle('hidden', hasText || mobileAi);
    if (omniAiSendBtn) omniAiSendBtn.classList.toggle('hidden', !mobileAi);
    if (inlineAiBtn && inlineAiQuery) {
      if (raw.length >= 2 && !mobileAi) {
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
    const found = searchRooms(raw, 40);

    if (!found.length && !entities.lecturers.length && !entities.groups.length) {
      const li = document.createElement('li');
      li.className = 'res-empty';
      li.innerHTML = `По прямому совпадению не найдено — нажмите <strong>Enter</strong> или кнопку выше, чтобы спросить ИИ'шку`;
      results.appendChild(li);
      return;
    }

    // 1. Сначала аудитории и помещения на карте
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

    // 2. Группы
    entities.groups.forEach(grp => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="res-main">
          <div class="res-name">Группа ${escapeHtml(grp.name)}</div>
          <div class="res-meta">${escapeHtml(formatFacultyFullName(grp.faculty || grp.facultyCode || 'Учебная группа'))}</div>
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

    // 3. Преподаватели
    entities.lecturers.forEach(lec => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="res-main">
          <div class="res-name">${escapeHtml(lec.fullName || lec.name)}</div>
          <div class="res-meta">${escapeHtml(lec.regalia || 'Преподаватель')}</div>
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
  }

  const setSearchOpen = (isOpen) => {
    wrap.classList.toggle('open', isOpen);
    document.body.classList.toggle('mobile-search-open', isOpen);
    if (isOpen) {
      closeUserDropdown();
    }
  };

  renderTags();
  renderHistory();
  updateClearAndInlineAi();

  // Синхронизация подъёма #omni-bar, панели поиска и чата ИИ с экранной клавиатурой на мобильных без задержки
  const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  let baseMobileViewportH = Math.max(
    document.documentElement.clientHeight || 0,
    window.innerHeight || 0,
    window.visualViewport ? Math.round(window.visualViewport.height) : 0
  );
  let savedKbH = 0;
  try {
    const parsedKb = parseInt(localStorage.getItem('rsreu_kb_h') || '0', 10);
    if (parsedKb >= 180 && parsedKb <= 450) savedKbH = parsedKb;
  } catch (e) {}
  let estimatedKbH = savedKbH || Math.round(
    Math.min(isIOSDevice ? 336 : 300, Math.max(240, (window.screen?.height || 800) * (isIOSDevice ? 0.39 : 0.35)))
  );
  let isSearchBarFocused = false;
  let focusStartTime = 0;
  let kbPollRafId = null;
  let kbBlurCleanupTimer = null;

  const syncMobileKeyboardOffset = () => {
    if (window.innerWidth > 768) {
      document.documentElement.style.setProperty('--kb-offset', '0px');
      document.documentElement.style.removeProperty('--vvh');
      document.body.classList.remove('kb-lifting', 'kb-synced');
      return;
    }

    const layoutH = document.documentElement.clientHeight || window.innerHeight;
    const vv = window.visualViewport;
    const vvH = vv ? vv.height : (tg?.viewportHeight || layoutH);
    const vvTop = vv ? vv.offsetTop : 0;
    const vvBottom = vvH + vvTop;

    if (!isSearchBarFocused) {
      const currentMaxH = Math.round(Math.max(layoutH, vvH));
      if (currentMaxH > 360 && Math.abs(currentMaxH - baseMobileViewportH) > 20) {
        baseMobileViewportH = currentMaxH;
      }
      document.documentElement.style.setProperty('--kb-offset', '0px');
      document.documentElement.style.setProperty('--vvh', `${Math.round(vvH)}px`);
      return;
    }

    if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0) {
      window.scrollTo(0, 0);
    }

    const browserTotalShrink = Math.max(0, Math.round(baseMobileViewportH - vvBottom));
    const layoutShrink = Math.max(0, Math.round(baseMobileViewportH - layoutH));
    const vvOffsetFromLayout = Math.max(0, Math.round(layoutH - vvBottom));
    const elapsed = performance.now() - focusStartTime;

    if (browserTotalShrink >= 80) {
      if (browserTotalShrink >= 170 && browserTotalShrink <= 450 && browserTotalShrink !== estimatedKbH) {
        estimatedKbH = browserTotalShrink;
        try { localStorage.setItem('rsreu_kb_h', String(estimatedKbH)); } catch (e) {}
      }
      document.body.classList.remove('kb-lifting');
      document.body.classList.add('kb-synced');
      document.documentElement.style.setProperty('--kb-offset', `${vvOffsetFromLayout}px`);
      document.documentElement.style.setProperty('--vvh', `${Math.round(vvH)}px`);
    } else if (elapsed < 580) {
      // Упреждающий подъём в момент нажатия, пока WebView ещё не обновил размер вьюпорта под клавиатуру
      const predictedOffset = Math.max(0, estimatedKbH - layoutShrink);
      const predictedVvh = Math.max(240, baseMobileViewportH - estimatedKbH);
      document.body.classList.add('kb-lifting');
      document.body.classList.remove('kb-synced');
      document.documentElement.style.setProperty('--kb-offset', `${predictedOffset}px`);
      document.documentElement.style.setProperty('--vvh', `${predictedVvh}px`);
    } else {
      document.body.classList.remove('kb-lifting');
      document.body.classList.add('kb-synced');
      document.documentElement.style.setProperty('--kb-offset', `${vvOffsetFromLayout}px`);
      document.documentElement.style.setProperty('--vvh', `${Math.round(vvH)}px`);
    }

    if (panelMode === 'ai') {
      const scrollContainer = document.getElementById('ai-chat-scroll');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  const startKbRafTracking = (durationMs = 600) => {
    if (kbPollRafId) cancelAnimationFrame(kbPollRafId);
    const start = performance.now();
    const step = () => {
      syncMobileKeyboardOffset();
      if (performance.now() - start < durationMs) {
        kbPollRafId = requestAnimationFrame(step);
      } else {
        kbPollRafId = null;
        syncMobileKeyboardOffset();
      }
    };
    kbPollRafId = requestAnimationFrame(step);
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncMobileKeyboardOffset);
    window.visualViewport.addEventListener('scroll', syncMobileKeyboardOffset);
  }
  window.addEventListener('resize', syncMobileKeyboardOffset);
  tg?.onEvent?.('viewportChanged', syncMobileKeyboardOffset);

  input.addEventListener('focus', () => {
    if (kbBlurCleanupTimer) {
      clearTimeout(kbBlurCleanupTimer);
      kbBlurCleanupTimer = null;
    }
    if (window.innerWidth <= 768) {
      const layoutH = document.documentElement.clientHeight || window.innerHeight;
      const vvH = window.visualViewport ? window.visualViewport.height : layoutH;
      if (!isSearchBarFocused && Math.max(layoutH, vvH) > 360) {
        baseMobileViewportH = Math.round(Math.max(layoutH, vvH));
      }
      isSearchBarFocused = true;
      focusStartTime = performance.now();
      syncMobileKeyboardOffset();
      startKbRafTracking(620);
    }
    if (isMobileAiBarMode()) {
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
    if (input.value.trim()) renderResults();
    else renderHistory();
  });

  input.addEventListener('blur', () => {
    if (window.innerWidth <= 768) {
      isSearchBarFocused = false;
      document.body.classList.remove('kb-synced');
      document.body.classList.add('kb-lifting');
      document.documentElement.style.setProperty('--kb-offset', '0px');
      document.documentElement.style.setProperty('--vvh', `${baseMobileViewportH}px`);
      startKbRafTracking(320);
      kbBlurCleanupTimer = setTimeout(() => {
        document.body.classList.remove('kb-lifting');
        kbBlurCleanupTimer = null;
      }, 240);
    }
  });

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMobileAiBarMode()) {
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  });

  input.addEventListener('input', () => {
    if (isMobileAiBarMode()) {
      updateClearAndInlineAi();
      return;
    }
    setSearchOpen(true);
    renderResults();
  });

  function triggerSearchSubmit() {
    const raw = input.value.trim();
    if (isMobileAiBarMode()) {
      if (!raw || aiLoading) {
        input.focus();
        return;
      }
      input.value = '';
      updateClearAndInlineAi();
      submitAiQuery(raw);
      return;
    }
    if (!raw) {
      setSearchOpen(true);
      input.focus();
      return;
    }
    const entities = searchEntitiesLocal(raw, 2);
    const found = searchRooms(raw, 5);
    saveHistory(raw);
    setSearchOpen(false);
    input.blur();
    if (isLikelyAiQuestion(raw, found.length + entities.lecturers.length + entities.groups.length)) {
      openAiPanel(raw);
    } else if (found.length > 0) {
      navigateToRoom(found[0].id);
    } else if (entities.groups.length > 0) {
      openEntitySchedule('group', entities.groups[0].name);
    } else if (entities.lecturers.length > 0) {
      openEntitySchedule('lecturer', entities.lecturers[0].name);
    } else {
      openAiPanel(raw);
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearchSubmit();
    }
  });

  if (omniSubmitBtn) {
    omniSubmitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSearchSubmit();
    });
  }

  if (omniAiSendBtn) {
    omniAiSendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSearchSubmit();
    });
  }

  if (omniRouteBtn) {
    omniRouteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setSearchOpen(false);
      openRoutePanel();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      updateClearAndInlineAi();
      if (!isMobileAiBarMode()) {
        results.innerHTML = '';
        renderHistory();
      }
      input.focus();
    });
  }

  if (omniAiBtn) {
    omniAiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const raw = input.value.trim();
      setSearchOpen(false);
      if (window.innerWidth <= 768 && raw) {
        input.value = '';
      }
      openAiPanel(raw || null);
      updateClearAndInlineAi();
    });
  }

  if (inlineAiBtn) {
    inlineAiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const raw = input.value.trim();
      setSearchOpen(false);
      if (raw) {
        saveHistory(raw);
        openAiPanel(raw);
      } else {
        openAiPanel(null);
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) setSearchOpen(false);
  });

  const params = new URLSearchParams(location.search);
  const searchQuery = params.get('search');
  if (searchQuery) {
    input.value = searchQuery;
    setSearchOpen(true);
    renderResults();
  }
}

// ================ ИИ-НАВИГАТОР РГРТУ ================

function buildAiFreeMenuHtml() {
  const filterFloor = aiFreeFloorFilter;
  const relevantFree = [...freeRoomIds]
    .map(id => ({ id, meta: roomsMeta[id], data: freeRoomData.get(id) || {} }))
    .filter(x => x.meta && x.meta.building === currentBuilding)
    .filter(x => filterFloor === 'all' ? true : x.meta.floor === Number(filterFloor))
    .sort(naturalRoomSort);

  const relevantBusy = [...busyRoomIds]
    .map(id => ({ id, meta: roomsMeta[id], data: busyRoomData.get(id) || {} }))
    .filter(x => x.meta && x.meta.building === currentBuilding)
    .filter(x => filterFloor === 'all' ? true : x.meta.floor === Number(filterFloor))
    .sort(naturalRoomSort);

  const floors = ['all', 0, 1, 2, 3, 4];
  const floorBtns = floors.map(f => {
    const active = String(filterFloor) === String(f);
    const label = f === 'all' ? 'Все' : `${f} эт.`;
    return `<button type="button" class="ai-free-floor-btn ${active ? 'active' : ''}" data-free-floor="${f}">${label}</button>`;
  }).join('');

  const itemsHtml = relevantFree.slice(0, 45).map(x => {
    const untilHtml = x.data.noSchedule ? 'свободна' : `до ${escapeHtml(x.data.untilText || 'конца дня')}`;
    const fl = x.meta.floor != null ? ` · ${x.meta.floor} эт.` : '';
    return `
      <div class="ai-free-item" data-free-room-id="${escapeHtml(x.id)}">
        <span class="free-dot"></span>
        <span class="ai-free-item-name">${escapeHtml(formatRoomName(x.meta.name))}${escapeHtml(fl)}</span>
        <span class="ai-free-item-until">${untilHtml}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="ai-free-menu">
      <div class="ai-free-menu-header">
        <span class="ai-free-badge"><i class="mdi mdi-check-circle-outline"></i> Свободно: ${relevantFree.length} · Занято: ${relevantBusy.length}</span>
        <button type="button" class="ai-free-floor-btn ${freeModeOn ? 'active' : ''}" data-toggle-free-map="1" title="Подсветить свободные и занятые аудитории на карте">
          <i class="mdi mdi-layers-outline"></i> ${freeModeOn ? 'Подсветка ВКЛ' : 'Подсветить карту'}
        </button>
      </div>
      <div class="ai-free-floor-pills">${floorBtns}</div>
      <div class="ai-free-list">
        ${itemsHtml || `<div class="muted-text" style="padding:6px 4px">Свободных аудиторий по выбранному фильтру не найдено</div>`}
      </div>
    </div>
  `;
}

function openAiPanel(initialQuery = null) {
  // Не закрываем страницу расписания, чтобы ИИ-помощник мог открываться прямо поверх неё
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
  if (panelMode === 'route') clearRoute();

  panelMode = 'ai';
  currentRoomPanelId = null;
  clearSelectedRoom();
  if (panel) panel.classList.remove('mobile-compact');
  openPanel();
  renderAiPanel();
  syncModeUI();

  if (initialQuery && initialQuery.trim()) {
    submitAiQuery(initialQuery.trim());
  }
}

function closeAiPanel() {
  triggerAiModeClosingTransition();
  panelMode = null;
  closePanel();
  syncModeUI();
}

function renderAiPanel() {
  const panel = document.getElementById('panel');

  const headerHtml = `
    ${getMobileDragBarHtml()}
    <div class="ai-panel-header">
      <div class="panel-header">
        <button class="close" onclick="closeAiPanel()" title="Закрыть чат">✕</button>
        <h2 class="ai-title-heading"><i class="mdi mdi-creation ai-title-sparkle" aria-hidden="true"></i><span>ИИ'шка</span></h2>
      </div>
    </div>
  `;

  let feedHtml = '';
  if (aiMessages.length === 0 && !aiLoading) {
    feedHtml = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon">
          <i class="mdi mdi-creation"></i>
        </div>
        <div class="ai-empty-title">ИИ'шка по РГРТУ</div>
        <div class="ai-empty-desc">
          Спросите про свободные аудитории, расписание групп и преподавателей, столовые или попросите построить маршрут.
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
        const statusPart = r.statusText ? ` · ${r.statusText}` : (meta.description ? ` · ${meta.description.split('\n')[0]}` : '');
        return `
          <div class="ai-room-card" data-room-id="${escapeHtml(r.id)}">
            <div class="ai-room-info">
              <div class="ai-room-title">${escapeHtml(formatRoomName(meta.name))}</div>
              <div class="ai-room-sub">${escapeHtml(floorText)}${escapeHtml(statusPart)}</div>
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

      const freeMenuHtml = msg.openFreePanel ? buildAiFreeMenuHtml() : '';

      return `
        <div class="ai-bot-card" data-msg-idx="${idx}">
          <div class="ai-bot-header">
            <i class="mdi mdi-creation"></i>
            <span>ИИ'шка</span>
          </div>
          <div class="ai-bot-answer">${renderMultiline(msg.answer || '')}</div>
          ${freeMenuHtml}
          ${entityCtaHtml}
          ${routeCtaHtml}
          ${(!msg.openFreePanel && roomsHtml) ? `<div class="ai-suggested-rooms">${roomsHtml}</div>` : ''}
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
          <input type="text" class="ai-input" id="ai-panel-input" placeholder="Сообщение ИИ'шке..." autocomplete="off" ${aiLoading ? 'disabled' : ''}>
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

  panel.querySelectorAll('[data-free-floor]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = btn.dataset.freeFloor;
      aiFreeFloorFilter = f === 'all' ? 'all' : Number(f);
      if (f !== 'all' && Number(f) !== currentFloor) {
        showFloor(currentBuilding, Number(f));
      }
      renderAiPanel();
    });
  });

  panel.querySelectorAll('[data-toggle-free-map]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFreeMode();
    });
  });

  panel.querySelectorAll('[data-free-room-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const roomId = el.dataset.freeRoomId;
      if (roomId) focusRoomFromAi(roomId);
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
  syncMobileMapViewportWithSheet();
  const { W, H } = currentSvgViewBox;
  let targetLatLng = L.latLng(H - centroid.y, centroid.x);
  if (mapBearingDeg) {
    const cLayer = map.latLngToLayerPoint(L.latLng((H || 1000) / 2, (W || 1000) / 2));
    const pLayer = map.latLngToLayerPoint(targetLatLng);
    const rad = (mapBearingDeg * Math.PI) / 180;
    const vx = pLayer.x - cLayer.x;
    const vy = pLayer.y - cLayer.y;
    const rx = cLayer.x + vx * Math.cos(rad) - vy * Math.sin(rad);
    const ry = cLayer.y + vx * Math.sin(rad) + vy * Math.cos(rad);
    targetLatLng = map.layerPointToLatLng(L.point(rx, ry));
  }
  const targetZoom = Math.max(map.getZoom(), 0.25);
  map.flyTo(targetLatLng, targetZoom, { animate: true, duration: 0.42 });
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
  const historyPayload = aiMessages.slice(-6).map(m => ({
    role: m.role,
    text: m.role === 'user' ? (m.text || '') : (m.answer || ''),
    roomIds: Array.isArray(m.rooms) ? m.rooms.map(r => r.id).filter(Boolean) : [],
    entitySchedule: m.entitySchedule || null
  }));

  aiMessages.push({ role: 'user', text: query });
  aiLoading = true;
  renderAiPanel();

  try {
    const res = await fetch('/api/ai-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, currentFloor, history: historyPayload })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.openFreePanel) {
      await fetchFreeRooms();
      freeModeOn = true;
      applyFreeHighlight();
    }

    const roomStatusMap = new Map((data.rooms || []).map(r => [r.id, r]));
    const validRooms = (data.roomIds || [])
      .filter(id => roomsMeta[id])
      .map(id => {
        const enriched = roomStatusMap.get(id);
        return {
          id,
          statusType: enriched ? enriched.statusType : null,
          statusText: enriched ? enriched.statusText : ''
        };
      });

    aiMessages.push({
      role: 'assistant',
      answer: data.answer || 'Готово!',
      rooms: validRooms,
      route: data.route || null,
      entitySchedule: data.entitySchedule || null,
      openFreePanel: Boolean(data.openFreePanel)
    });

    // Если найдена ровно одна целевая комната и нет маршрута — сразу подсвечиваем и перемещаем к ней карту
    if (validRooms.length === 1 && !data.route && !scheduleViewOpen) {
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
      entitySchedule: null,
      openFreePanel: false
    });
    haptic('error');
  } finally {
    aiLoading = false;
    if (panelMode === 'ai') {
      renderAiPanel();
    }
  }
}

// ================ ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ, ТЕМА И TELEGRAM ================

function ensureUserId() {
  if (!currentUserId) {
    currentUserId = 'web_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    try { localStorage.setItem('rsreu_user_id', currentUserId); } catch (e) {}
  }
  return currentUserId;
}

function resolveThemePreference(themePref) {
  const pref = (themePref === 'dark' || themePref === 'light' || themePref === 'system') ? themePref : 'system';
  if (pref === 'system') {
    if (tg && tg.colorScheme) {
      return tg.colorScheme === 'dark' ? 'dark' : 'light';
    }
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return pref;
}

function applyTheme(themePref) {
  const pref = (themePref === 'dark' || themePref === 'light' || themePref === 'system') ? themePref : 'system';
  const resolved = resolveThemePreference(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = pref;
  userProfile.theme = pref;
  try { localStorage.setItem('theme', pref); } catch (e) {}
  document.querySelectorAll('[data-theme-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === pref);
  });
}

function saveUserProfileLocalCache() {
  try {
    localStorage.setItem('rsreu_user_role', userProfile.role || 'student');
    localStorage.setItem('rsreu_user_target', userProfile.targetName || '');
    localStorage.setItem('rsreu_user_notif', userProfile.notificationsEnabled === false ? 'false' : 'true');
    localStorage.setItem('rsreu_user_linked', userProfile.telegramLinked ? 'true' : 'false');
    localStorage.setItem('rsreu_user_first_name', userProfile.firstName || '');
    localStorage.setItem('rsreu_user_username', userProfile.username || '');
    if (Array.isArray(userProfile.favorites)) {
      localStorage.setItem('rsreu_user_favorites', JSON.stringify(userProfile.favorites));
    }
    if (userProfile.recentViews && typeof userProfile.recentViews === 'object') {
      localStorage.setItem('rsreu_user_recent', JSON.stringify(userProfile.recentViews));
    }
    if (userProfile.lessonNotes && typeof userProfile.lessonNotes === 'object') {
      localStorage.setItem('rsreu_user_notes', JSON.stringify(userProfile.lessonNotes));
    }
  } catch (e) {}
}

function mergeServerUserIntoProfile(srvUser) {
  if (!srvUser) return;
  const localFavs = Array.isArray(userProfile.favorites) ? [...userProfile.favorites] : [];
  const localRecent = (userProfile.recentViews && typeof userProfile.recentViews === 'object') ? { ...userProfile.recentViews } : {};
  const localNotes = (userProfile.lessonNotes && typeof userProfile.lessonNotes === 'object') ? { ...userProfile.lessonNotes } : {};
  const localTarget = userProfile.targetName || '';
  const localRole = userProfile.role || 'student';
  let localTargetTs = 0;
  try { localTargetTs = Number(localStorage.getItem('rsreu_user_target_ts')) || 0; } catch (e) {}
  const srvUpdatedAt = Number(srvUser.updatedAt) || 0;
  const keepLocalTarget = (localTargetTs > srvUpdatedAt) || (!srvUser.targetName && Boolean(localTarget));

  Object.assign(userProfile, srvUser);
  userProfile.telegramLinked = Boolean(srvUser.isTelegramLinked || srvUser.telegramLinked || srvUser.telegramId || srvUser.username);
  if (keepLocalTarget) {
    userProfile.targetName = localTarget;
    userProfile.role = localRole;
  }
  if ((!Array.isArray(userProfile.favorites) || userProfile.favorites.length === 0) && localFavs.length > 0) {
    userProfile.favorites = localFavs;
  }
  if ((!userProfile.recentViews || Object.keys(userProfile.recentViews).length === 0) && Object.keys(localRecent).length > 0) {
    userProfile.recentViews = localRecent;
  }
  if (!userProfile.lessonNotes || typeof userProfile.lessonNotes !== 'object') {
    userProfile.lessonNotes = localNotes;
  } else {
    userProfile.lessonNotes = { ...localNotes, ...userProfile.lessonNotes };
  }
  saveUserProfileLocalCache();
}

async function syncUserProfileToServer(patch = {}) {
  if (patch.targetName !== undefined || patch.role !== undefined) {
    try { localStorage.setItem('rsreu_user_target_ts', String(Date.now())); } catch (e) {}
  }
  Object.assign(userProfile, patch);
  saveUserProfileLocalCache();

  try {
    const uid = ensureUserId();
    const payload = { userId: uid, ...patch };
    const res = await fetch('/api/user/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    });
    if (!res.ok) return;
    const data = await res.json();
    const srvUser = data.user || data.profile;
    if (data.ok && srvUser) {
      currentUserId = srvUser.id || uid;
      try { localStorage.setItem('rsreu_user_id', currentUserId); } catch (e) {}
      mergeServerUserIntoProfile(srvUser);
      updateUserMenuUI();
      updateSmartNextClassPill();
    }
  } catch (e) {
    console.warn('[profile] sync failed', e.message);
  }
}

function updateUserMenuUI() {
  const menuBtn = document.getElementById('user-menu-btn');
  const statusDot = document.getElementById('user-status-dot');
  const nameEl = document.getElementById('user-dropdown-name');
  const subEl = document.getElementById('user-dropdown-sub');
  const academicSec = document.getElementById('user-academic-section');
  const tgSec = document.getElementById('user-tg-section');
  const targetInput = document.getElementById('user-target-input');
  const targetClear = document.getElementById('user-target-clear');
  const quickRow = document.getElementById('user-quick-actions-row');
  const openSchedBtn = document.getElementById('user-open-schedule-btn');
  const openSchedText = document.getElementById('user-open-schedule-text');
  const openCheatsheetBtn = document.getElementById('user-open-cheatsheet-btn');
  const tgUnauth = document.getElementById('user-tg-unlinked');
  const tgAuth = document.getElementById('user-tg-linked');
  const notifyCheck = document.getElementById('user-notif-checkbox');
  const logoutBtn = document.getElementById('user-logout-btn');

  const isLinked = Boolean(userProfile.telegramLinked || userProfile.isTelegramLinked || userProfile.telegramId);
  userProfile.telegramLinked = isLinked;

  const hasProfile = Boolean(isLinked);
  if (menuBtn) menuBtn.classList.toggle('active', hasProfile);
  if (statusDot) statusDot.classList.toggle('hidden', !hasProfile);
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !isLinked);

  if (academicSec) {
    academicSec.classList.toggle('hidden', !isLinked);
  }
  if (tgSec) {
    tgSec.classList.toggle('hidden', isLinked);
  }

  if (nameEl) {
    if (isLinked) {
      nameEl.textContent = userProfile.firstName || (userProfile.username ? `@${userProfile.username}` : 'Telegram-профиль');
    } else {
      nameEl.textContent = 'Гость';
    }
  }
  if (subEl) {
    if (isLinked && userProfile.targetName) {
      const displayLec = scheduleDirectory.lecturers.find(l => l.name === userProfile.targetName);
      subEl.textContent = userProfile.role === 'lecturer'
        ? `Преподаватель · ${displayLec ? (displayLec.fullName || displayLec.name) : userProfile.targetName}`
        : `Студент · Группа ${userProfile.targetName}`;
    } else if (isLinked) {
      subEl.textContent = 'Укажите свою учебную группу или ФИО преподавателя';
    } else {
      subEl.textContent = 'Войдите через Telegram для наиболее удобного взаимодействия!';
    }
  }
  if (targetInput) {
    if (document.activeElement !== targetInput) {
      if (userProfile.role === 'lecturer' && userProfile.targetName) {
        const displayLec = scheduleDirectory.lecturers.find(l => l.name === userProfile.targetName);
        targetInput.value = displayLec ? (displayLec.fullName || displayLec.name) : userProfile.targetName;
      } else {
        targetInput.value = userProfile.targetName || '';
      }
    }
  }
  if (targetClear) {
    targetClear.classList.toggle('hidden', !(targetInput && targetInput.value));
  }
  const canShowSched = Boolean(isLinked && userProfile.targetName);
  const canShowCheatsheet = Boolean(isLinked && userProfile.role === 'student' && userProfile.targetName);
  if (openSchedBtn) {
    openSchedBtn.classList.toggle('hidden', !canShowSched);
  }
  if (openSchedText) {
    openSchedText.textContent = 'Моё расписание';
  }
  if (openCheatsheetBtn) {
    openCheatsheetBtn.classList.toggle('hidden', !canShowCheatsheet);
  }
  if (quickRow) {
    quickRow.classList.toggle('hidden', !canShowSched);
    quickRow.classList.toggle('single-col', canShowSched && !canShowCheatsheet);
  }
  if (tgUnauth) tgUnauth.classList.toggle('hidden', isLinked);
  if (tgAuth) tgAuth.classList.toggle('hidden', !isLinked);
  if (notifyCheck) {
    notifyCheck.checked = userProfile.notificationsEnabled !== false;
  }
  const activeThemePref = userProfile.theme || document.documentElement.dataset.themePref || localStorage.getItem('theme') || 'system';
  document.querySelectorAll('[data-theme-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === activeThemePref);
  });
}

function setupUserProfileAndTheme() {
  const wrap = document.getElementById('user-menu-wrap');
  const btn = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');
  const targetInput = document.getElementById('user-target-input');
  const targetClear = document.getElementById('user-target-clear');
  const suggestions = document.getElementById('user-target-suggestions');
  const openSchedBtn = document.getElementById('user-open-schedule-btn');
  const botLink = document.getElementById('user-tg-deeplink');
  const codeInput = document.getElementById('user-tg-code-input');
  const codeSubmit = document.getElementById('user-tg-code-submit');
  const feedbackEl = document.getElementById('user-tg-feedback');
  const notifyCheck = document.getElementById('user-notif-checkbox');
  const logoutBtn = document.getElementById('user-logout-btn');

  applyTheme(localStorage.getItem('theme') || 'system');

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = () => {
      if ((userProfile.theme || localStorage.getItem('theme') || 'system') === 'system') {
        applyTheme('system');
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemThemeChange);
    else if (mq.addListener) mq.addListener(onSystemThemeChange);
  }

  if (!wrap || !btn || !dropdown) return;

  const stopAuthSessionPolling = () => {
    if (authPollTimer) {
      clearInterval(authPollTimer);
      authPollTimer = null;
    }
  };

  const checkPendingAuthSessionOnce = async () => {
    if (!activeAuthSessionToken || userProfile.telegramLinked) {
      stopAuthSessionPolling();
      return;
    }
    try {
      const res = await fetch('/api/user/auth-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'session-check',
          sessionToken: activeAuthSessionToken,
          role: userProfile.role,
          targetName: userProfile.targetName,
          theme: userProfile.theme
        })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'expired') {
        stopAuthSessionPolling();
        activeAuthSessionToken = '';
        return;
      }
      if (data.status === 'verified' && data.user) {
        stopAuthSessionPolling();
        activeAuthSessionToken = '';
        currentUserId = data.user.id;
        try { localStorage.setItem('rsreu_user_id', currentUserId); } catch (e) {}
        Object.assign(userProfile, data.user);
        userProfile.telegramLinked = true;
        if (feedbackEl) feedbackEl.classList.add('hidden');
        updateUserMenuUI();
        if (scheduleViewOpen) {
          const view = document.getElementById('schedule-view');
          if (view) updateScheduleSidebarListInPlace(view);
        }
        showToast('Telegram успешно подключён!');
        haptic('success');
      }
    } catch (e) {}
  };

  const startAuthSessionPolling = () => {
    stopAuthSessionPolling();
    if (!activeAuthSessionToken || userProfile.telegramLinked) return;
    authPollTimer = setInterval(checkPendingAuthSessionOnce, 2000);
  };

  window.addEventListener('focus', () => {
    if (activeAuthSessionToken && !userProfile.telegramLinked) {
      checkPendingAuthSessionOnce();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && activeAuthSessionToken && !userProfile.telegramLinked) {
      checkPendingAuthSessionOnce();
    }
  });

  const startBrowserDeepLinkSession = async () => {
    try {
      const res = await fetch('/api/user/auth-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'session-start' })
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.botUsername) botUsername = data.botUsername;
      if (data.sessionToken) {
        activeAuthSessionToken = data.sessionToken;
        startAuthSessionPolling();
      }
      if (botLink && data.botLink) {
        botLink.href = data.botLink;
        botLink.classList.remove('hidden');
      }
      return data;
    } catch (e) {
      return null;
    }
  };

  if (botLink) {
    botLink.addEventListener('click', async (e) => {
      if (userProfile.telegramLinked) return;
      if (feedbackEl) {
        feedbackEl.textContent = 'Нажмите «Запустить / Start» в открывшемся боте Telegram — вход выполнится автоматически…';
        feedbackEl.classList.remove('error', 'hidden');
      }
      if (activeAuthSessionToken && botLink.href && botLink.href.includes('start=login_')) {
        startAuthSessionPolling();
        return;
      }
      e.preventDefault();
      const data = await startBrowserDeepLinkSession();
      if (data && data.botLink) {
        window.open(data.botLink, '_blank', 'noopener');
      }
    });
  }

  const closeDropdownBtn = document.getElementById('user-dropdown-close');
  if (closeDropdownBtn) {
    closeDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeUserDropdown();
    });
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      closeSearchDropdown();
      const panel = document.getElementById('panel');
      if (panel && panel.classList.contains('open')) {
        if (panelMode === 'room') closeRoomPanel();
        else collapseFreePanel();
      }
      dropdown.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('open-active');
      document.body.classList.add('mobile-profile-open');
      updateUserMenuUI();
      if (!userProfile.telegramLinked) {
        startBrowserDeepLinkSession();
      }
    } else {
      closeUserDropdown();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      closeUserDropdown();
    }
  });

  const renderTargetSuggestions = () => {
    if (!suggestions || !targetInput) return;
    const q = targetInput.value.trim().toLowerCase().replace(/ё/g, 'е');
    if (targetClear) targetClear.classList.toggle('hidden', !targetInput.value);

    const groupMatches = (scheduleDirectory.groups || [])
      .filter(item => {
        if (!q) return true;
        const hay = `${item.name} группа ${item.faculty || ''} ${item.facultyCode || ''}`.toLowerCase().replace(/ё/g, 'е');
        return hay.includes(q);
      })
      .map(item => ({
        role: 'student',
        name: item.name,
        display: item.name,
        label: `Группа ${item.name}`,
        meta: formatFacultyFullName(item.faculty || item.facultyCode || '')
      }));

    const lecMatches = (scheduleDirectory.lecturers || [])
      .filter(item => {
        if (!q) return true;
        const hay = `${item.name} ${item.fullName || ''} ${item.regalia || ''}`.toLowerCase().replace(/ё/g, 'е');
        return hay.includes(q);
      })
      .map(item => ({
        role: 'lecturer',
        name: item.name,
        display: item.fullName || item.name,
        label: item.fullName || item.name,
        meta: item.regalia || 'Преподаватель'
      }));

    const matches = [...groupMatches.slice(0, 8), ...lecMatches.slice(0, 8)].slice(0, 14);

    if (matches.length === 0) {
      suggestions.innerHTML = `<div class="user-target-option" style="color:var(--text-muted);cursor:default">Ничего не найдено</div>`;
      suggestions.classList.remove('hidden');
      return;
    }

    suggestions.innerHTML = matches.map(item => `
      <button type="button" class="user-target-option ${userProfile.targetName === item.name ? 'active' : ''}" data-target-role="${escapeHtml(item.role)}" data-target-val="${escapeHtml(item.name)}" data-target-display="${escapeHtml(item.display)}">
        <span>${escapeHtml(item.label)}</span>
        <span style="color:var(--text-dim);font-size:11px">${escapeHtml(item.meta)}</span>
      </button>
    `).join('');
    suggestions.classList.remove('hidden');

    suggestions.querySelectorAll('[data-target-val]').forEach(optBtn => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextRole = optBtn.dataset.targetRole === 'lecturer' ? 'lecturer' : 'student';
        const val = optBtn.dataset.targetVal;
        const display = optBtn.dataset.targetDisplay || val;
        userProfile.role = nextRole;
        targetInput.value = display;
        suggestions.classList.add('hidden');
        syncUserProfileToServer({ role: nextRole, targetName: val });
        updateUserMenuUI();
        showToast(nextRole === 'lecturer' ? `Выбран преподаватель: ${display}` : `Выбрана группа ${val}`);
      });
    });
  };

  const commitTypedTargetInput = (showFeedback = false) => {
    if (!targetInput) return;
    const rawVal = targetInput.value.trim();
    if (!rawVal) {
      if (userProfile.targetName) {
        syncUserProfileToServer({ targetName: '' });
        updateUserMenuUI();
      }
      return;
    }
    const norm = rawVal.toLowerCase().replace(/ё/g, 'е').replace(/^группа\s+/i, '').trim();
    const exactGroup = (scheduleDirectory.groups || []).find(
      g => String(g.name || '').toLowerCase().replace(/ё/g, 'е') === norm
    );
    if (exactGroup) {
      if (userProfile.targetName !== exactGroup.name || userProfile.role !== 'student') {
        userProfile.role = 'student';
        targetInput.value = exactGroup.name;
        syncUserProfileToServer({ role: 'student', targetName: exactGroup.name });
        updateUserMenuUI();
        if (showFeedback) showToast(`Выбрана группа ${exactGroup.name}`);
      }
      return;
    }
    const exactLec = (scheduleDirectory.lecturers || []).find(
      l => String(l.name || '').toLowerCase().replace(/ё/g, 'е') === norm ||
           String(l.fullName || '').toLowerCase().replace(/ё/g, 'е') === norm
    );
    if (exactLec) {
      const disp = exactLec.fullName || exactLec.name;
      if (userProfile.targetName !== exactLec.name || userProfile.role !== 'lecturer') {
        userProfile.role = 'lecturer';
        targetInput.value = disp;
        syncUserProfileToServer({ role: 'lecturer', targetName: exactLec.name });
        updateUserMenuUI();
        if (showFeedback) showToast(`Выбран преподаватель: ${disp}`);
      }
      return;
    }
    // Если пользователь ввёл номер группы вручную (даже если справочник ещё грузится)
    const cleanedGroup = rawVal.replace(/^группа\s+/i, '').trim();
    if (cleanedGroup && cleanedGroup !== userProfile.targetName) {
      const nextRole = /\s/.test(cleanedGroup) && !/\d/.test(cleanedGroup) ? 'lecturer' : 'student';
      userProfile.role = nextRole;
      syncUserProfileToServer({ role: nextRole, targetName: cleanedGroup });
      updateUserMenuUI();
      if (showFeedback) {
        showToast(nextRole === 'lecturer' ? `Выбран преподаватель: ${cleanedGroup}` : `Выбрана группа ${cleanedGroup}`);
      }
    }
  };

  if (targetInput) {
    targetInput.addEventListener('focus', renderTargetSuggestions);
    targetInput.addEventListener('input', renderTargetSuggestions);
    targetInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestions) suggestions.classList.add('hidden');
        commitTypedTargetInput(true);
        targetInput.blur();
      }
    });
    targetInput.addEventListener('change', () => {
      setTimeout(() => commitTypedTargetInput(false), 120);
    });
    targetInput.addEventListener('blur', () => {
      setTimeout(() => commitTypedTargetInput(false), 180);
    });
  }

  if (targetClear && targetInput) {
    targetClear.addEventListener('click', (e) => {
      e.stopPropagation();
      targetInput.value = '';
      if (suggestions) suggestions.classList.add('hidden');
      syncUserProfileToServer({ targetName: '' });
      updateUserMenuUI();
      targetInput.focus();
    });
  }

  if (openSchedBtn) {
    openSchedBtn.addEventListener('click', () => {
      if (!userProfile.targetName) return;
      closeUserDropdown();
      const entityType = userProfile.role === 'lecturer' ? 'lecturer' : 'group';
      openEntitySchedule(entityType, userProfile.targetName);
    });
  }

  const openCheatsheetBtn = document.getElementById('user-open-cheatsheet-btn');
  if (openCheatsheetBtn) {
    openCheatsheetBtn.addEventListener('click', async () => {
      if (!userProfile.targetName) return;
      closeUserDropdown();
      await openEntitySchedule('group', userProfile.targetName);
      openCheatSheetModal();
    });
  }

  document.querySelectorAll('[data-theme-val]').forEach(tBtn => {
    tBtn.addEventListener('click', () => {
      const nextTheme = tBtn.dataset.themeVal;
      applyTheme(nextTheme);
      syncUserProfileToServer({ theme: nextTheme });
    });
  });

  if (codeSubmit && codeInput) {
    codeSubmit.addEventListener('click', async () => {
      const raw = codeInput.value.trim();
      if (!raw) return;
      const isCode = /^\d{6}$/.test(raw);
      try {
        const res = await fetch('/api/user/auth-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: isCode ? 'code' : 'quick',
            code: isCode ? raw : undefined,
            identifier: !isCode ? raw : undefined,
            role: userProfile.role,
            targetName: userProfile.targetName,
            theme: userProfile.theme
          })
        });
        const data = await res.json();
        const srvUser = data.user || data.profile;
        if (!res.ok || !data.ok || !srvUser) {
          if (feedbackEl) {
            feedbackEl.textContent = data.error || 'Не удалось привязать Telegram';
            feedbackEl.classList.add('error');
            feedbackEl.classList.remove('hidden');
          }
          showToast(data.error || 'Не удалось привязать Telegram');
          return;
        }
        currentUserId = srvUser.id;
        try { localStorage.setItem('rsreu_user_id', currentUserId); } catch (e) {}
        Object.assign(userProfile, srvUser);
        userProfile.telegramLinked = true;
        codeInput.value = '';
        if (feedbackEl) feedbackEl.classList.add('hidden');
        updateUserMenuUI();
        showToast('Telegram успешно подключён!');
      } catch (e) {
        showToast('Ошибка соединения с сервером');
      }
    });
  }

  if (notifyCheck) {
    notifyCheck.addEventListener('change', () => {
      syncUserProfileToServer({ notificationsEnabled: notifyCheck.checked });
      showToast(notifyCheck.checked ? 'Уведомления о парах включены' : 'Уведомления о парах отключены');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      currentUserId = '';
      userProfile = {
        role: 'student',
        targetName: '',
        notificationsEnabled: true,
        telegramLinked: false,
        firstName: '',
        username: '',
        favorites: [],
        recentViews: {},
        lessonNotes: {},
        theme: userProfile.theme || 'system'
      };
      try {
        localStorage.removeItem('rsreu_user_id');
        localStorage.removeItem('rsreu_user_role');
        localStorage.removeItem('rsreu_user_target');
        localStorage.removeItem('rsreu_user_notif');
        localStorage.removeItem('rsreu_user_linked');
        localStorage.removeItem('rsreu_user_first_name');
        localStorage.removeItem('rsreu_user_username');
        localStorage.removeItem('rsreu_user_favorites');
        localStorage.removeItem('rsreu_user_recent');
        localStorage.removeItem('rsreu_user_notes');
      } catch (e) {}
      updateUserMenuUI();
      if (scheduleViewOpen) {
        const view = document.getElementById('schedule-view');
        if (view) updateScheduleSidebarListInPlace(view);
      }
      showToast('Вы вышли из аккаунта');
    });
  }

  (async () => {
    try {
      if (tg && tg.initData && telegramUser) {
        let localTargetTs = 0;
        try { localTargetTs = Number(localStorage.getItem('rsreu_user_target_ts')) || 0; } catch (e) {}
        const res = await fetch('/api/user/auth-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'webapp',
            initData: tg.initData,
            unsafeUser: telegramUser,
            role: userProfile.role,
            targetName: userProfile.targetName,
            theme: userProfile.theme,
            targetUpdatedAt: localTargetTs
          })
        });
        if (res.ok) {
          const data = await res.json();
          const srvUser = data.user || data.profile;
          if (data.ok && srvUser) {
            currentUserId = srvUser.id;
            try { localStorage.setItem('rsreu_user_id', currentUserId); } catch (e) {}
            const prevLocalFavs = Array.isArray(userProfile.favorites) ? [...userProfile.favorites] : [];
            const prevLocalTarget = userProfile.targetName || '';
            const prevLocalRole = userProfile.role || 'student';
            const srvUpdatedAt = Number(srvUser.updatedAt) || 0;
            mergeServerUserIntoProfile(srvUser);
            userProfile.telegramLinked = true;
            saveUserProfileLocalCache();
            const restorePatch = {};
            if ((!Array.isArray(srvUser.favorites) || srvUser.favorites.length === 0) && prevLocalFavs.length > 0) {
              restorePatch.favorites = prevLocalFavs;
            }
            if ((!srvUser.targetName || localTargetTs > srvUpdatedAt) && prevLocalTarget && srvUser.targetName !== prevLocalTarget) {
              restorePatch.targetName = prevLocalTarget;
              restorePatch.role = prevLocalRole;
            }
            if (Object.keys(restorePatch).length > 0) {
              syncUserProfileToServer(restorePatch);
            }
            updateUserMenuUI();
            updateSmartNextClassPill();
            if (scheduleViewOpen) {
              const view = document.getElementById('schedule-view');
              if (view) updateScheduleSidebarListInPlace(view);
            }
            return;
          }
        }
      }

      if (currentUserId) {
        let localTargetTs = 0;
        try { localTargetTs = Number(localStorage.getItem('rsreu_user_target_ts')) || 0; } catch (e) {}
        const res = await fetch(`/api/user/profile?userId=${encodeURIComponent(currentUserId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.botUsername) botUsername = data.botUsername;
          const srvUser = data.user || data.profile;
          if (srvUser) {
            const localTheme = localStorage.getItem('theme');
            const prevLocalFavs = Array.isArray(userProfile.favorites) ? [...userProfile.favorites] : [];
            const prevLocalTarget = userProfile.targetName || '';
            const prevLocalRole = userProfile.role || 'student';
            const srvUpdatedAt = Number(srvUser.updatedAt) || 0;
            mergeServerUserIntoProfile(srvUser);
            if (!localTheme) {
              userProfile.theme = 'system';
            }
            applyTheme(userProfile.theme);
            const restorePatch = {};
            if ((!Array.isArray(srvUser.favorites) || srvUser.favorites.length === 0) && prevLocalFavs.length > 0) {
              restorePatch.favorites = prevLocalFavs;
            }
            if ((!srvUser.targetName || localTargetTs > srvUpdatedAt) && prevLocalTarget && srvUser.targetName !== prevLocalTarget) {
              restorePatch.targetName = prevLocalTarget;
              restorePatch.role = prevLocalRole;
            }
            if (Object.keys(restorePatch).length > 0) {
              syncUserProfileToServer(restorePatch);
            }
            updateSmartNextClassPill();
            if (scheduleViewOpen) {
              const view = document.getElementById('schedule-view');
              if (view) updateScheduleSidebarListInPlace(view);
            }
          } else if (userProfile.telegramLinked || userProfile.targetName || userProfile.firstName || userProfile.username) {
            await syncUserProfileToServer({
              role: userProfile.role || 'student',
              targetName: userProfile.targetName || '',
              notificationsEnabled: userProfile.notificationsEnabled !== false,
              firstName: userProfile.firstName || '',
              username: userProfile.username || '',
              favorites: Array.isArray(userProfile.favorites) ? userProfile.favorites : [],
              recentViews: userProfile.recentViews && typeof userProfile.recentViews === 'object' ? userProfile.recentViews : {},
              theme: userProfile.theme || 'system'
            });
          }
        }
      }
    } catch (e) {}
    updateUserMenuUI();
  })();
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

function fitMapToBuildingBounds(bounds) {
  const { W, H } = currentSvgViewBox;
  if (window.innerWidth <= 768 && W > 0 && H > 0) {
    const mapSize = map.getSize();
    const availH = Math.max(240, (mapSize.y || window.innerHeight) - 124);
    const zoomByHeight = Math.log2(availH / H);
    const snappedZoom = Math.max(-2.5, Math.min(2, Math.floor(zoomByHeight * 4) / 4));
    map.setView([H / 2, W / 2], snappedZoom, { animate: false });
  } else {
    map.fitBounds(bounds);
  }
}

function resetView() {
  if (currentOverlay) {
    setMapBearing(0);
    const bounds = currentOverlay.getBounds();
    fitMapToBuildingBounds(bounds);
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

function computeShapeBBoxSvg(shape) {
  try {
    if (typeof shape.getBBox === 'function') {
      const bb = shape.getBBox();
      if (bb && (bb.width > 0 || bb.height > 0)) {
        return { minX: bb.x, minY: bb.y, maxX: bb.x + bb.width, maxY: bb.y + bb.height };
      }
    }
  } catch (e) {}
  const tag = (shape.tagName || '').toLowerCase();
  if (tag === 'rect') {
    const x = parseFloat(shape.getAttribute('x') || '0');
    const y = parseFloat(shape.getAttribute('y') || '0');
    const w = parseFloat(shape.getAttribute('width') || '0');
    const h = parseFloat(shape.getAttribute('height') || '0');
    if (w > 0 || h > 0) return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }
  return null;
}

async function showFloor(buildingCode, floorNum) {
  const b = BUILDINGS[buildingCode];
  const svgUrl = b?.floors?.[floorNum];
  if (!svgUrl) return;

  currentBuilding = buildingCode;
  currentFloor = floorNum;
  clearSelectedRoom();
  hoveredRoomId = null;

  const svgText = await fetch(svgUrl).then(r => r.text());
  svgCache[svgUrl] = svgText;
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
  svgEl.setAttribute('preserveAspectRatio', 'none');
  currentOverlay = L.svgOverlay(svgEl, bounds).addTo(map);
  try { map.invalidateSize({ pan: false, animate: false }); } catch (e) {}
  fitMapToBuildingBounds(bounds);
  syncMapRotationTransform();
  syncMapLabelScale();

  setTimeout(() => {
    if (currentBuilding === buildingCode && currentFloor === floorNum && currentOverlay) {
      try { map.invalidateSize({ pan: false, animate: false }); } catch (e) {}
      syncMapRotationTransform();
      syncMapLabelScale();
    }
  }, 120);

  svgEl.style.pointerEvents = 'none';

  roomShapes = {};
  roomSvgCentroids = {};

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

  // Очищаем кэш центров аудиторий для текущего этажа — он заполнится в placeLabels() напрямую в SVG-координатах
  roomSvgCentroids = {};

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
    if (addingPoiMode || (gpsState.active && gpsState.calibratingClick)) return;
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
  placeLabels();
  try { renderCommunityPoiMarkers(); } catch (e) {}
  try { renderGpsPositionOnMap(); } catch (e) {}

  if (selectedRoomId && roomShapes[selectedRoomId]) selectRoom(selectedRoomId);
  if (pendingHighlight && roomShapes[pendingHighlight]) {
    const shapes = roomShapes[pendingHighlight];
    shapes.forEach(s => s.style.opacity = '0.65');
    setTimeout(() => shapes.forEach(s => s.style.opacity = ''), 1500);
    pendingHighlight = null;
  }

  if (routeState.path) redrawRoute();
}

// ================ ПОДПИСИ ================

function computeRoomCentroidInSvg(svgEl, shapes) {
  if (!shapes || !shapes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let anyValid = false;

  let invSvgCtm = null;
  try {
    const svgCtm = svgEl && typeof svgEl.getScreenCTM === 'function' ? svgEl.getScreenCTM() : null;
    if (svgCtm) invSvgCtm = svgCtm.inverse();
  } catch (e) {}

  for (const shape of shapes) {
    const bb = computeShapeBBoxSvg(shape);
    if (!bb) continue;
    let corners = [
      { x: bb.minX, y: bb.minY },
      { x: bb.maxX, y: bb.minY },
      { x: bb.minX, y: bb.maxY },
      { x: bb.maxX, y: bb.maxY }
    ];
    if (invSvgCtm && svgEl && typeof svgEl.createSVGPoint === 'function' && typeof shape.getScreenCTM === 'function') {
      try {
        const shapeCtm = shape.getScreenCTM();
        if (shapeCtm) {
          const relMat = invSvgCtm.multiply(shapeCtm);
          corners = corners.map(pt => {
            const svgPt = svgEl.createSVGPoint();
            svgPt.x = pt.x;
            svgPt.y = pt.y;
            const tr = svgPt.matrixTransform(relMat);
            return { x: tr.x, y: tr.y };
          });
        }
      } catch (e) {}
    }
    for (const c of corners) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
      anyValid = true;
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
  }

  if (!anyValid) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function scheduleLabelRefresh() {
  if (labelTimer) clearTimeout(labelTimer);
  labelTimer = setTimeout(() => {
    labelTimer = null;
    syncMapRotationTransform();
    syncMapLabelScale();
    if (!currentLabels) placeLabels();
  }, 120);
}

function placeLabels() {
  if (currentLabels) map.removeLayer(currentLabels);
  currentLabels = L.layerGroup().addTo(map);

  const { H } = currentSvgViewBox;
  const svgEl = currentOverlay ? currentOverlay.getElement() : null;

  for (const [id, shapes] of Object.entries(roomShapes)) {
    const meta = roomsMeta[id];
    const labelText = meta?.shortName;
    if (!labelText) continue;

    let centroid = roomSvgCentroids[id];
    if (!centroid) {
      centroid = computeRoomCentroidInSvg(svgEl, shapes);
      if (!centroid) continue;
      roomSvgCentroids[id] = centroid;
    }

    const latlng = L.latLng(H - centroid.y, centroid.x);
    const labelHtml = renderMultiline(labelText);

    const icon = L.divIcon({
      className: 'room-label-wrap',
      html: `<span class="room-label">${labelHtml}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    L.marker(latlng, { icon, interactive: false, keyboard: false }).addTo(currentLabels);
  }
  syncMapRotationTransform();
  syncMapLabelScale();
}

window.addEventListener('resize', scheduleLabelRefresh);

// ================ «СЕЙЧАС В АУДИТОРИИ» ================

function computeNowStatus(data) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayD = now.getDate();
  const todayM = now.getMonth() + 1;
  const todayISO = `${now.getFullYear()}-${String(todayM).padStart(2, '0')}-${String(todayD).padStart(2, '0')}`;

  const days = Array.isArray(data?.days) ? data.days : [];
  const totalLessons = days.reduce((sum, d) => sum + (d.lessons ? d.lessons.length : 0), 0);
  if (totalLessons === 0) return { type: 'none' };

  const parseStart = (t) => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : null;
  };
  const parseEnd = (t) => {
    const m = String(t || '').match(/[–-](\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : null;
  };

  const todayIdx = days.findIndex(d => {
    if (!d || !d.date) return false;
    if (typeof d.date === 'string') return d.date === todayISO;
    return d.date.d === todayD && d.date.m === todayM;
  });

  if (todayIdx !== -1) {
    const todayLessons = days[todayIdx].lessons || [];
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
  for (let i = startIdx; i < days.length; i++) {
    if ((days[i].lessons || []).length > 0) {
      const dayName = days[i].dayName || '';
      const genitive = DAY_GENITIVE[dayName] || dayName.toLowerCase();
      const firstLesson = days[i].lessons[0];
      const startMatch = firstLesson.time.match(/^(\d{1,2}:\d{2})/);
      return {
        type: 'free',
        untilText: `${genitive}` + (startMatch ? ` в ${startMatch[1]}` : '')
      };
    }
  }
  return { type: 'free', untilText: 'до конца недели' };
}

function formatStatusRoomLabelClient(lesson) {
  if (!lesson) return '';
  const raw = lesson.roomShort === '🏀' ? 'Спортзал' : String(lesson.roomShort || '').trim();
  if (!raw) return '';
  if (/^(спортзал|спортивный зал|зал|стадион|бассейн|каф)/i.test(raw)) return raw;
  const bld = lesson.building || 'С';
  const withBld = String(raw).endsWith(` ${bld}`) ? raw : `${raw} ${bld}`;
  return `ауд. ${withBld}`;
}

function computeClientEntityNowStatus(data) {
  if (!data) return { type: 'free', title: 'Сейчас пар нет', details: '', roomId: null };
  const entityKey = `${data.entityType || 'group'}:${data.name || ''}`;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const sourceDays = (Array.isArray(data.currentWeekDays) && data.currentWeekDays.length > 0)
    ? data.currentWeekDays
    : (currentWeekStatusByEntityKey.get(entityKey) || data.days || []);

  if (!Array.isArray(sourceDays) || sourceDays.length === 0) {
    return data.nowStatus || { type: 'free', title: 'Сейчас пар нет', details: '', roomId: null };
  }

  const parseRange = (t) => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return {
      start: +m[1] * 60 + +m[2],
      end: +m[3] * 60 + +m[4],
      startStr: `${m[1].padStart(2, '0')}:${m[2]}`,
      endStr: `${m[3].padStart(2, '0')}:${m[4]}`
    };
  };

  let todayIdx = sourceDays.findIndex(d => d && d.date === todayISO);
  if (todayIdx === -1 && data.isCurrentWeek !== false && !selectedScheduleWeekDate) {
    const dayNamesByDow = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const todayName = dayNamesByDow[now.getDay()];
    todayIdx = sourceDays.findIndex(d => d && d.dayName === todayName);
  }

  if (todayIdx !== -1) {
    const todayLessons = sourceDays[todayIdx].lessons || [];
    const activeLessons = todayLessons.filter(l => {
      const r = parseRange(l.time);
      return r && nowMin >= r.start && nowMin <= r.end;
    });

    if (activeLessons.length > 0) {
      const first = activeLessons[0];
      const r = parseRange(first.time);
      const leftMin = Math.max(1, r.end - nowMin);
      const roomLabels = [...new Set(activeLessons.map(formatStatusRoomLabelClient).filter(Boolean))];
      const roomSuffix = roomLabels.length > 0 ? ` · ${roomLabels.join(' / ')}` : '';
      const subjects = [...new Set(activeLessons.map(l => l.subject).filter(Boolean))];
      const subjectText = subjects.join(' / ');
      const primaryRoomId = activeLessons.find(l => l.roomId)?.roomId || null;

      return {
        type: 'busy',
        title: `Сейчас идёт пара${roomSuffix}`,
        details: `${subjectText} · до ${r.endStr} (осталось ${leftMin} мин)`,
        roomId: primaryRoomId
      };
    }

    const upcomingToday = todayLessons.filter(l => {
      const r = parseRange(l.time);
      return r && r.start > nowMin;
    });

    if (upcomingToday.length > 0) {
      const firstNext = upcomingToday[0];
      const nextRange = parseRange(firstNext.time);
      const sameSlotNext = upcomingToday.filter(l => {
        const r = parseRange(l.time);
        return r && r.start === nextRange.start;
      });
      const untilMin = nextRange.start - nowMin;
      const roomLabels = [...new Set(sameSlotNext.map(formatStatusRoomLabelClient).filter(Boolean))];
      const roomText = roomLabels.join(' / ');
      const subjects = [...new Set(sameSlotNext.map(l => l.subject).filter(Boolean))].join(' / ');
      const primaryRoomId = sameSlotNext.find(l => l.roomId)?.roomId || null;

      if (untilMin <= 25) {
        return {
          type: 'free',
          title: `Перемена · скоро пара${roomText ? ' · ' + roomText : ''}`,
          details: `${subjects} · начало в ${nextRange.startStr} (через ${untilMin} мин)`,
          roomId: primaryRoomId
        };
      }
      return {
        type: 'free',
        title: 'Сейчас пар нет',
        details: `Следующая пара в ${nextRange.startStr}${roomText ? ' · ' + roomText : ''} (${subjects})`,
        roomId: primaryRoomId
      };
    }
  }

  const searchStart = todayIdx !== -1 ? todayIdx + 1 : 0;
  for (let i = searchStart; i < sourceDays.length; i++) {
    const d = sourceDays[i];
    if (d && Array.isArray(d.lessons) && d.lessons.length > 0) {
      if (todayIdx === -1 && typeof d.date === 'string' && d.date < todayISO) continue;
      const first = d.lessons[0];
      const r = parseRange(first.time);
      const roomLabel = formatStatusRoomLabelClient(first);
      const hadLessonsToday = todayIdx !== -1 && (sourceDays[todayIdx].lessons || []).length > 0;
      return {
        type: 'free',
        title: hadLessonsToday ? 'На сегодня пары закончились' : 'Сегодня по расписанию пар нет',
        details: `Ближайшая пара: ${d.dayName}${r ? ' в ' + r.startStr : ''}${roomLabel ? ' · ' + roomLabel : ''} (${first.subject})`,
        roomId: first.roomId || null
      };
    }
  }

  return {
    type: 'free',
    title: 'На этой неделе пар больше нет',
    details: 'Свободное время',
    roomId: null
  };
}

function renderNowStatus(status) {
  if (status.type === 'none') {
    return `
      <div class="now-status none">
        <div class="now-body">
          <div class="now-top-row">
            <div class="now-title">Пар на этой неделе нет</div>
          </div>
          <div class="now-bottom-row">
            <div class="now-details">Аудитория всегда свободна</div>
          </div>
        </div>
      </div>
    `;
  }
  if (status.type === 'busy') {
    return `
      <div class="now-status busy">
        <div class="now-body">
          <div class="now-top-row">
            <div class="now-title">Сейчас идёт пара</div>
          </div>
          <div class="now-bottom-row">
            <div class="now-details">${escapeHtml(status.subject)}${status.untilText ? ' · до ' + status.untilText : ''}</div>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="now-status free">
      <div class="now-body">
        <div class="now-top-row">
          <div class="now-title">Аудитория свободна</div>
        </div>
        <div class="now-bottom-row">
          <div class="now-details">${status.untilText ? 'до ' + status.untilText : 'до конца дня'}</div>
        </div>
      </div>
    </div>
  `;
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

function buildRoomCommunityBlockHtml(roomId, meta) {
  const isBuffet = meta && meta.type === 'buffet';
  const reviews = (communityState.reviews || []).filter(r => r.roomId === roomId);

  const descSuggestHtml = `
    <div class="room-community-actions">
      <button type="button" class="room-community-btn" data-open-desc-suggest="${escapeHtml(roomId)}">
        <svg class="room-community-btn-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <span>${meta?.description ? 'Дополнить описание' : 'Предложить описание'}</span>
      </button>
    </div>
  `;

  let buffetHtml = '';
  if (isBuffet) {
    const avg = reviews.length > 0
      ? (reviews.reduce((s, r) => s + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
      : '—';

    const existingUserReview = currentUserId
      ? ((communityState.userReviews || []).find(r => r && r.roomId === roomId) ||
         reviews.find(r => r && r.authorId === currentUserId))
      : null;

    const listHtml = reviews.length > 0
      ? `<div class="buffet-reviews-list">${reviews.slice(0, 12).map(r => `
          <div class="buffet-review-item">
            <div class="buffet-review-top">
              <span class="buffet-review-author">${escapeHtml(r.authorName || 'Студент')}</span>
              <span class="buffet-review-stars">${'★'.repeat(Number(r.rating) || 5)}</span>
            </div>
            ${r.text ? `<div class="buffet-review-text">${escapeHtml(r.text)}</div>` : ''}
          </div>
        `).join('')}</div>`
      : `<div style="font-size:12px;color:var(--text-muted);padding:4px 0">Пока нет опубликованных отзывов. Будьте первым!</div>`;

    const addReviewSvg = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    `;

    const editReviewSvg = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    `;

    const commentSvg = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    `;

    buffetHtml = `
      <div class="buffet-reviews-box">
        <div class="buffet-reviews-header">
          <div class="buffet-rating-summary">
            <span class="buffet-rating-score">${avg}</span>
            <i class="mdi mdi-star buffet-star-icon" aria-hidden="true"></i>
            <span class="buffet-summary-sep">·</span>
            <span class="buffet-comments-count">
              <span>${reviews.length}</span>
              <span class="buffet-comment-icon">${commentSvg}</span>
            </span>
          </div>
          <button type="button" class="buffet-review-action-btn" data-open-review="${escapeHtml(roomId)}" title="${existingUserReview ? 'Редактировать отзыв' : 'Оставить отзыв'}" aria-label="${existingUserReview ? 'Редактировать отзыв' : 'Оставить отзыв'}">
            ${existingUserReview ? editReviewSvg : addReviewSvg}
          </button>
        </div>
        ${listHtml}
      </div>
    `;
  }

  return `
    ${descSuggestHtml}
    ${buffetHtml}
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
  const revBtn = panel.querySelector('[data-open-review]');
  if (revBtn) {
    revBtn.addEventListener('click', () => openBuffetReviewModal(id));
  }
  const descBtn = panel.querySelector('[data-open-desc-suggest]');
  if (descBtn) {
    descBtn.addEventListener('click', () => openRoomDescriptionSuggestModal(id));
  }
  attachLessonNoteListeners(panel);
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

  // Если у помещения нет расписания (гардероб, буфет, туалет и т.д.), на мобилке открываем компактную панель
  const isCompactRoom = !meta || !meta.building || !meta.classroom;
  panel.classList.toggle('mobile-compact', isCompactRoom);
  panel.classList.remove('mobile-expanded', 'mobile-minimized');

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
  const shareIcon = `<i class="mdi mdi-share share-icon" title="Поделиться ссылкой"></i>`;
  const closeBtn = `<button class="close" onclick="closeRoomPanel()">✕</button>`;

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
  const communityBlock = buildRoomCommunityBlockHtml(id, meta);

  if (isCompactRoom) {
    const block = descriptionBlock ||
      `<div class="room-notes empty">Служебное или общественное помещение корпуса.</div>`;
    panel.innerHTML = buildPanelLayout(`${header}${block}${communityBlock}`, '');
    attachRoomActionListeners(panel, id);
    applyMobileSheetSnapMeasurement(panel);
    recordNavState();
    return;
  }

  panel.innerHTML = buildPanelLayout(
    `${header}${descriptionBlock}${communityBlock}`,
    `<p class="muted-text">Загрузка расписания…</p>`
  );
  attachRoomActionListeners(panel, id);
  applyMobileSheetSnapMeasurement(panel);
  recordNavState();

  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const shift = today.getDay() === 0 ? 1 : 1 - today.getDay();
  monday.setDate(today.getDate() + shift);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  let isoDate = `${yyyy}-${mm}-${dd}`;
  if (selectedRoomWeekDate) {
    if (selectedRoomWeekDate.includes('-')) {
      isoDate = selectedRoomWeekDate;
    } else if (selectedRoomWeekDate.includes('.')) {
      isoDate = selectedRoomWeekDate.split('.').reverse().join('-');
    }
  }

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
      panel.classList.add('mobile-compact');
      panel.innerHTML = buildPanelLayout(
        `${header}${descriptionBlock}${communityBlock}`,
        `<div class="no-schedule-msg">У этой аудитории нет расписания занятий</div>`
      );
      attachRoomActionListeners(panel, id);
      applyMobileSheetSnapMeasurement(panel);
      return;
    }
    panel.classList.remove('mobile-compact');
    renderSchedule(panel, title, data, header, `${descriptionBlock}${communityBlock}`, id);
    attachRoomActionListeners(panel, id);
    applyMobileSheetSnapMeasurement(panel);
    haptic('success');
  } catch (err) {
    if (token !== roomRequestToken) return;
    if (currentRoomPanelId !== id || panelMode !== 'room') return;

    panel.innerHTML = buildPanelLayout(
      `${header}${descriptionBlock}${communityBlock}`,
      `<p style="color:#f87171">Ошибка загрузки: ${escapeHtml(err.message)}</p>`
    );
    attachRoomActionListeners(panel, id);
    applyMobileSheetSnapMeasurement(panel);
    haptic('error');
  }
}

// ================ ПОДЕЛИТЬСЯ (ЧИСТЫЕ ССЫЛКИ + ШТОРКА НА МОБИЛЬНЫХ) ================

function buildCleanShareUrl(paramsObj = {}) {
  const cleanUrl = new URL(location.origin + location.pathname);
  for (const [k, v] of Object.entries(paramsObj)) {
    if (v !== undefined && v !== null && v !== '') {
      cleanUrl.searchParams.set(k, String(v));
    }
  }
  cleanUrl.hash = '';
  return cleanUrl.toString();
}

async function copyTextToClipboard(text, successMsg = 'Ссылка скопирована') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
    haptic('success');
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
      haptic('success');
      document.body.removeChild(ta);
      return true;
    } catch (err) {
      document.body.removeChild(ta);
      showToast('Не удалось скопировать ссылку');
      return false;
    }
  }
}

function openMobileShareSheet(cleanUrl, shareTitle = 'Карта и расписание РГРТУ') {
  const backdrop = document.getElementById('share-sheet-backdrop');
  if (!backdrop) {
    copyTextToClipboard(cleanUrl);
    return;
  }
  const urlPreview = document.getElementById('share-sheet-url-preview');
  if (urlPreview) urlPreview.textContent = cleanUrl;
  backdrop.classList.remove('hidden');

  const closeSheet = () => backdrop.classList.add('hidden');
  document.getElementById('share-sheet-close')?.addEventListener('click', closeSheet, { once: true });
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeSheet();
  };

  const tgBtn = document.getElementById('share-sheet-tg');
  if (tgBtn) {
    tgBtn.onclick = () => {
      closeSheet();
      const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(cleanUrl)}&text=${encodeURIComponent(shareTitle)}`;
      if (tg && typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(tgShareUrl);
      } else {
        window.open(tgShareUrl, '_blank', 'noopener');
      }
    };
  }

  const vkBtn = document.getElementById('share-sheet-vk');
  if (vkBtn) {
    vkBtn.onclick = () => {
      closeSheet();
      const vkShareUrl = `https://vk.com/share.php?url=${encodeURIComponent(cleanUrl)}&title=${encodeURIComponent(shareTitle)}`;
      window.open(vkShareUrl, '_blank', 'noopener');
    };
  }

  const nativeBtn = document.getElementById('share-sheet-native');
  if (nativeBtn) {
    nativeBtn.onclick = async () => {
      closeSheet();
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: shareTitle, url: cleanUrl });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      await copyTextToClipboard(cleanUrl);
    };
  }

  const copyBtn = document.getElementById('share-sheet-copy');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      closeSheet();
      await copyTextToClipboard(cleanUrl);
    };
  }
}

async function triggerSmartShare(cleanUrl, shareTitle = 'Карта и расписание РГРТУ') {
  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) {
    await copyTextToClipboard(cleanUrl);
    return;
  }
  if (typeof navigator.share === 'function' && !(tg && tg.initData)) {
    try {
      await navigator.share({ title: shareTitle, url: cleanUrl });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  openMobileShareSheet(cleanUrl, shareTitle);
}

function attachShareListener(panel, id) {
  const icon = panel.querySelector('.share-icon');
  if (!icon) return;
  icon.addEventListener('click', async (e) => {
    e.stopPropagation();
    const meta = roomsMeta[id];
    if (!meta) return;
    const cleanUrl = buildCleanShareUrl({
      building: meta.building,
      floor: meta.floor != null ? meta.floor : undefined,
      room: id
    });
    const title = `${formatRoomName(meta.name || id)} · РГРТУ`;
    await triggerSmartShare(cleanUrl, title);
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
        const type  = badge ? normalizeClientLessonType(badge.textContent.trim()) : '';
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

  const availableWeeks = dateOptions.map(o => ({
    value: o.value,
    label: o.textContent.trim(),
    selected: o.selected
  }));

  return { empty: false, days, weekType, availableWeeks };
}

function formatSubgroupDisplay(sg) {
  if (!sg) return '';
  const s = String(sg).trim();
  const m = s.match(/(\d+)/);
  if (m) return `п.г. ${m[1]}`;
  return s;
}

function formatInteractiveGroupAndLecturerHtml(groupStr, lecturerStr) {
  let groupPart = '';
  if (groupStr) {
    const renderedGroups = String(groupStr).replace(/(\d{2,5}[а-яёa-z]{0,4})/gi, (match) =>
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

const STANDARD_TIME_SLOTS = [
  '08:10–09:45',
  '09:55–11:30',
  '11:40–13:15',
  '13:35–15:10',
  '15:20–16:55',
  '17:05–18:40',
  '18:45–20:10'
];

function buildWeeklyScheduleTableHtml(days = [], { mode = 'group' } = {}) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;

  const tom = new Date(now);
  tom.setDate(now.getDate() + 1);
  const tomorrowISO = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

  const isDayToday = (day) => {
    if (!day) return false;
    if (typeof day.date === 'string') return day.date === todayISO;
    if (day.date && typeof day.date === 'object') {
      return day.date.d === now.getDate() && day.date.m === (now.getMonth() + 1);
    }
    return false;
  };

  const isDayTomorrow = (day) => {
    if (!day) return false;
    if (typeof day.date === 'string') return day.date === tomorrowISO;
    if (day.date && typeof day.date === 'object') {
      return day.date.d === tom.getDate() && day.date.m === (tom.getMonth() + 1);
    }
    return false;
  };

  const formatDayHeaderDate = (day) => {
    if (day.dateText) return day.dateText;
    if (day.dateLabel) return day.dateLabel;
    if (typeof day.date === 'string' && day.date.includes('-')) {
      const [, mStr, dStr] = day.date.split('-');
      if (dStr && mStr) {
        return `${parseInt(dStr, 10)} ${MONTH_NAMES[parseInt(mStr, 10) - 1] || ''}`;
      }
    }
    return '';
  };

  const slotSet = new Set(STANDARD_TIME_SLOTS);
  days.forEach(d => {
    (d.lessons || []).forEach(l => {
      if (l.time) slotSet.add(l.time.replace('-', '–'));
    });
  });
  const allSlots = [...slotSet].sort((a, b) => a.localeCompare(b));

  const headColsHtml = days.map(day => {
    const isToday = isDayToday(day);
    const isTomorrow = isDayTomorrow(day);
    const dateLabel = formatDayHeaderDate(day);
    return `
      <th class="${isToday ? 'today-col' : ''}">
        <div class="th-day-top">
          <span class="th-day-name">${escapeHtml(day.dayName || '')}</span>
          ${isToday ? '<span class="th-today-badge">Сегодня</span>' : (isTomorrow ? '<span class="th-tomorrow-badge">Завтра</span>' : '')}
        </div>
        <span class="th-day-date">${escapeHtml(dateLabel)}</span>
      </th>
    `;
  }).join('');

  const rowsHtml = allSlots.map((slot, slotIdx) => {
    const mStart = slot.match(/^(\d{1,2}:\d{2})/);
    const breakRange = mStart && BREAKS[mStart[1]] ? BREAKS[mStart[1]] : '';
    const pairLabel = `${slotIdx + 1} пара`;

    const cellsHtml = days.map(day => {
      const isToday = isDayToday(day);
      const matching = (day.lessons || []).filter(l => (l.time || '').replace('-', '–') === slot);

      if (matching.length === 0) {
        return `<td class="slot-col empty-col ${isToday ? 'today-col' : ''}"><span class="wt-empty-dash">·</span></td>`;
      }

      // Group matching lessons by subject + type so multiple subgroups share ONE badge and ONE title:
      const groupedLessons = [];
      const groupMap = new Map();
      matching.forEach(l => {
        const key = `${(l.subject || '').trim()}|${(l.type || '').trim()}`;
        if (!groupMap.has(key)) {
          const entry = { subject: l.subject, type: l.type, items: [] };
          groupMap.set(key, entry);
          groupedLessons.push(entry);
        }
        groupMap.get(key).items.push(l);
      });

      const itemsHtml = groupedLessons.map(entry => {
        let badgeHtml = '';
        if (entry.type && LESSON_TYPES[entry.type]) {
          const t = LESSON_TYPES[entry.type];
          badgeHtml = `<span class="badge ${t.cls}"><i class="mdi ${t.icon}"></i>${escapeHtml(entry.type)}</span>`;
        } else if (entry.type) {
          badgeHtml = `<span class="badge pr">${escapeHtml(entry.type)}</span>`;
        }

        const buildSubDetails = (l) => {
          const lecturerRaw = Array.isArray(l.lecturers) && l.lecturers.length > 0
            ? l.lecturers.join(', ')
            : (l.lecturer || '');

          let entityHtml = '';
          if (mode === 'room') {
            if (l.subgroups && l.subgroups.length > 1) {
              entityHtml = l.subgroups
                .map(sg => formatInteractiveGroupAndLecturerHtml(sg.group, sg.lecturer))
                .filter(Boolean)
                .join('; ');
            } else {
              entityHtml = formatInteractiveGroupAndLecturerHtml(l.group, lecturerRaw);
            }
          } else if (mode === 'group') {
            entityHtml = formatInteractiveGroupAndLecturerHtml('', lecturerRaw);
          } else {
            entityHtml = formatInteractiveGroupAndLecturerHtml(l.group, '');
          }

          let roomLinkHtml = '';
          if (mode !== 'room') {
            const cleanRoomShort = l.roomShort === '🏀' ? 'Спортзал' : (l.roomShort || '');
            const isNamedVenue = /^(спортзал|спортивный зал|зал|стадион|бассейн|каф)/i.test(cleanRoomShort);
            const prefix = isNamedVenue ? '' : 'ауд. ';
            const bld = l.building || 'С';
            if (l.roomId) {
              const shortDisp = String(cleanRoomShort).endsWith(` ${bld}`) ? cleanRoomShort : `${cleanRoomShort} ${bld}`;
              roomLinkHtml = `${prefix}<button type="button" class="wt-room-link" data-room-id="${escapeHtml(l.roomId)}" title="Открыть ${escapeHtml(cleanRoomShort)} (${l.floor ?? ''} этаж) на карте">${escapeHtml(shortDisp)}</button>`;
            } else if (cleanRoomShort) {
              const shortDisp = String(cleanRoomShort).endsWith(` ${bld}`) ? cleanRoomShort : `${cleanRoomShort} ${bld}`;
              roomLinkHtml = `<span class="wt-room-unmapped">${prefix}${escapeHtml(shortDisp)}</span>`;
            }
          }

          const detailsParts = [];
          if (l.subgroup) detailsParts.push(escapeHtml(formatSubgroupDisplay(l.subgroup)));
          if (entityHtml) detailsParts.push(entityHtml);
          if (roomLinkHtml) detailsParts.push(roomLinkHtml);
          return detailsParts.join(', ');
        };

        const noteKey = `${day.dayName || ''}|${slot}|${(entry.subject || '').trim()}`;
        const rawNoteVal = (userProfile.lessonNotes && userProfile.lessonNotes[noteKey]);
        const savedNote = rawNoteVal
          ? (typeof rawNoteVal === 'object' ? String(rawNoteVal.text || '') : String(rawNoteVal))
          : '';
        const noteLabelStr = `${day.dayName || ''} · ${slot} · ${entry.subject || ''}`;
        const noteBtnHtml = `<button type="button" class="wt-note-btn ${savedNote ? 'has-note' : ''}" data-note-key="${escapeHtml(noteKey)}" data-note-label="${escapeHtml(noteLabelStr)}" title="${savedNote ? 'Редактировать личную заметку к паре' : 'Добавить личную заметку к паре'}" aria-label="Личная заметка к паре"><i class="mdi ${savedNote ? 'mdi-note-text-outline' : 'mdi-note-plus-outline'}"></i></button>`;
        const noteBoxHtml = savedNote
          ? `<div class="wt-user-note-box" data-note-key="${escapeHtml(noteKey)}" data-note-label="${escapeHtml(noteLabelStr)}"><i class="mdi mdi-text-short"></i><span>${escapeHtml(savedNote)}</span></div>`
          : '';

        if (entry.items.length === 1) {
          const l = entry.items[0];
          const detailsLine = buildSubDetails(l);
          return `
            <div class="wt-cell-item">
              <div class="wt-cell-main">${badgeHtml}<span class="wt-cell-subject">${escapeHtml(entry.subject)}${detailsLine ? ',' : ''}</span></div>
              ${detailsLine ? `<div class="wt-cell-details">${detailsLine}</div>` : ''}
              ${noteBoxHtml}
              ${noteBtnHtml}
            </div>
          `;
        }

        // Multiple subgroups for same subject & type:
        // Render ONE badge and ONE title, with each subgroup description on its own line:
        const linesHtml = entry.items.map(l => {
          const line = buildSubDetails(l);
          return `<div class="wt-subgroup-line">${line}</div>`;
        }).join('');

        return `
          <div class="wt-cell-item wt-subgrouped-item">
            <div class="wt-cell-main">${badgeHtml}<span class="wt-cell-subject">${escapeHtml(entry.subject)},</span></div>
            <div class="wt-cell-subgroups">
              ${linesHtml}
            </div>
            ${noteBoxHtml}
            ${noteBtnHtml}
          </div>
        `;
      }).join('');

      return `<td class="slot-col ${isToday ? 'today-col' : ''}">${itemsHtml}</td>`;
    }).join('');

    return `
      <tr>
        <td class="time-col">
          <span class="wt-pair-num">${pairLabel}</span>
          <div class="wt-time-range">${escapeHtml(slot)}</div>
          ${breakRange ? `<div class="wt-time-break">перерыв<br>${escapeHtml(breakRange)}</div>` : ''}
        </td>
        ${cellsHtml}
      </tr>
    `;
  }).join('');

  return `
    <div class="weekly-table-wrap ${mode === 'room' ? 'room-weekly-table-wrap' : ''}">
      <table class="weekly-schedule-table ${mode === 'room' ? 'room-weekly-schedule-table' : ''}">
        <thead>
          <tr>
            <th class="time-col">Время</th>
            ${headColsHtml}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function scrollScheduleTableToToday(rootEl) {
  if (!rootEl) return;
  requestAnimationFrame(() => {
    const wraps = rootEl.querySelectorAll('.weekly-table-wrap');
    wraps.forEach(wrap => {
      const todayTh = wrap.querySelector('thead th.today-col');
      const timeTh = wrap.querySelector('thead th.time-col');
      if (todayTh) {
        const stickyW = timeTh ? timeTh.offsetWidth : 96;
        const targetLeft = Math.max(0, todayTh.offsetLeft - stickyW);
        wrap.scrollLeft = targetLeft;
      }
    });
  });
}

let selectedRoomWeekDate = '';
let roomWeekDropdownOpen = false;

function getMondayDDMMYYYY(dateObj = new Date()) {
  const day = dateObj.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mon = new Date(dateObj);
  mon.setDate(dateObj.getDate() + diffToMonday);
  const dd = String(mon.getDate()).padStart(2, '0');
  const mm = String(mon.getMonth() + 1).padStart(2, '0');
  const yyyy = mon.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function getRoomWeekTriggerLabel(data) {
  if (selectedRoomWeekDate && availableScheduleWeeks.length > 0) {
    const found = availableScheduleWeeks.find(w => w.value === selectedRoomWeekDate || String(w.label || '').startsWith(selectedRoomWeekDate));
    if (found) {
      const raw = String(found.label || found.value || '').trim();
      const m = raw.match(/(\d{2}\.\d{2}\.\d{4})/);
      const datePart = m ? m[1] : raw;
      const lower = raw.toLowerCase();
      let kind = '';
      if (lower.includes('знам')) kind = 'знаменатель';
      else if (lower.includes('числ')) kind = 'числитель';
      return kind ? `${datePart} · ${kind}` : datePart;
    }
  }
  if (data && data.weekType) {
    const mondayStr = getMondayDDMMYYYY();
    return `${mondayStr} · ${data.weekType.toLowerCase()}`;
  }
  return getDefaultAcademicWeekDisplay();
}

function renderSchedule(panel, title, data, header, descriptionBlock = '', roomId = null) {
  const targetId = roomId || currentRoomPanelId;
  const nowStatus = computeNowStatus(data);

  const fixedHtml = `
    ${header}
    ${descriptionBlock}
    ${renderNowStatus(nowStatus)}
  `;

  const roomWeekTriggerLabel = getRoomWeekTriggerLabel(data);
  const weeks = (Array.isArray(data.availableWeeks) && data.availableWeeks.length > 0)
    ? data.availableWeeks
    : (availableScheduleWeeks.length > 0 ? availableScheduleWeeks : [{ value: '', label: roomWeekTriggerLabel, selected: true }]);

  const roomWeekOptionsHtml = weeks.map(w => {
    const isSelected = selectedRoomWeekDate
      ? w.value === selectedRoomWeekDate
      : Boolean(w.selected);
    const isCurrentWeek = String(w.label || '').toLowerCase().includes('текущ');
    return `
      <button type="button" class="schedule-week-option ${isSelected ? 'active' : ''}" data-room-week-val="${escapeHtml(w.value || '')}">
        <span>${escapeHtml(w.label || w.value)}</span>
        ${isCurrentWeek ? '<span class="schedule-week-option-tag">текущая</span>' : ''}
      </button>
    `;
  }).join('');

  const roomToolbarHtml = `
    <div class="room-schedule-toolbar">
      <div class="schedule-week-picker-row borderless-picker">
        <button type="button" class="schedule-week-trigger borderless ${roomWeekDropdownOpen ? 'open' : ''}" id="room-week-trigger" title="Выбрать учебную неделю">
          <span>${escapeHtml(roomWeekTriggerLabel)}</span>
          <i class="mdi mdi-chevron-down"></i>
        </button>
        <div class="schedule-week-dropdown ${roomWeekDropdownOpen ? '' : 'hidden'}" id="room-week-dropdown">
          ${roomWeekOptionsHtml}
        </div>
      </div>
      <button type="button" class="schedule-icon-btn-borderless schedule-export-right" id="room-export-png-btn" title="Скачать расписание аудитории в PNG" aria-label="Скачать расписание аудитории в PNG">
        ${DOWNLOAD_SVG_ICON}
      </button>
    </div>
  `;

  const tableHtml = buildWeeklyScheduleTableHtml(data.days || [], { mode: 'room' });

  panel.innerHTML = buildPanelLayout(fixedHtml, `${roomToolbarHtml}${tableHtml}`);
  if (targetId) {
    attachRoomActionListeners(panel, targetId);
  }
  attachEntityInlineLinks(panel);
  scrollScheduleTableToToday(panel);
  applyMobileSheetSnapMeasurement(panel);

  const roomWeekTrig = panel.querySelector('#room-week-trigger');
  const roomWeekDd = panel.querySelector('#room-week-dropdown');
  if (roomWeekTrig && roomWeekDd) {
    roomWeekTrig.addEventListener('click', (e) => {
      e.stopPropagation();
      roomWeekDropdownOpen = !roomWeekDropdownOpen;
      roomWeekTrig.classList.toggle('open', roomWeekDropdownOpen);
      roomWeekDd.classList.toggle('hidden', !roomWeekDropdownOpen);
    });
    panel.querySelectorAll('[data-room-week-val]').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextWeek = opt.dataset.roomWeekVal || '';
        selectedRoomWeekDate = nextWeek;
        roomWeekDropdownOpen = false;
        roomWeekTrig.classList.remove('open');
        roomWeekDd.classList.add('hidden');
        if (currentRoomPanelId) {
          openRoom(currentRoomPanelId, { preserveView: true });
        }
      });
    });
  }

  const roomPngBtn = panel.querySelector('#room-export-png-btn');
  if (roomPngBtn) {
    roomPngBtn.addEventListener('click', () => {
      exportRoomScheduleToPng(title, data);
    });
  }
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
      lecturers: data.lecturers || [],
      classrooms: data.classrooms || []
    };
    if (Array.isArray(data.availableWeeks) && data.availableWeeks.length > 0 && availableScheduleWeeks.length === 0) {
      availableScheduleWeeks = data.availableWeeks;
    }
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
  view.classList.remove('open');
  document.body.classList.remove('schedule-view-active', 'schedule-is-open');
  if (updateHistory) updateScheduleURL({ push: false });
  updatePanelHandle();
  syncModeUI();
  recordNavState();
  setTimeout(() => {
    if (!scheduleViewOpen) view.classList.add('hidden');
    syncMobileMapViewportWithSheet();
    map.invalidateSize({ animate: false });
    scheduleLabelRefresh();
  }, 380);
}

async function openScheduleDirectory(tab = null) {
  if (scheduleViewOpen && !tab) {
    closeScheduleView();
    return;
  }

  closeUserDropdown();
  closeSearchDropdown();
  if (panelMode === 'room') closeRoomPanel();
  else if (panelMode === 'route') closeRoutePanel();

  if (tab) directoryActiveTab = tab;
  scheduleViewOpen = true;
  scheduleMobileStep = 'list';
  document.body.classList.add('schedule-view-active', 'schedule-is-open');

  const view = document.getElementById('schedule-view');
  if (view) {
    view.classList.remove('hidden');
    requestAnimationFrame(() => view.classList.add('open'));
  }

  updatePanelHandle();
  syncModeUI();
  recordNavState();

  if (!scheduleDirectory.ready || (scheduleDirectory.groups.length === 0 && scheduleDirectory.lecturers.length === 0)) {
    renderScheduleWorkspace();
    await loadScheduleDirectory();
  }

  if (!currentEntitySchedule) {
    if (userProfile.telegramLinked && userProfile.targetName) {
      const entityType = userProfile.role === 'lecturer' ? 'lecturer' : 'group';
      await selectScheduleEntity(entityType, userProfile.targetName, { switchMobileToDetail: false });
      return;
    }
    if (window.innerWidth > 768) {
      const favFirst = userProfile.telegramLinked && Array.isArray(userProfile.favorites) ? userProfile.favorites[0] : '';
      if (favFirst && favFirst.includes(':')) {
        const [fType, ...fRest] = favFirst.split(':');
        const fName = fRest.join(':');
        if ((fType === 'group' || fType === 'lecturer') && fName) {
          await selectScheduleEntity(fType, fName, { switchMobileToDetail: false });
          return;
        }
      }
      if (scheduleDirectory.groups.length > 0) {
        const preferred = scheduleDirectory.groups.find(g => g.name === '546')
          || scheduleDirectory.groups.find(g => g.name === '445')
          || scheduleDirectory.groups[0];
        await selectScheduleEntity('group', preferred.name, { switchMobileToDetail: false });
        return;
      }
    }
  }

  updateScheduleURL({ push: false });
  renderScheduleWorkspace();
}

async function openEntitySchedule(type, name) {
  closeUserDropdown();
  closeSearchDropdown();
  if (panelMode === 'room') closeRoomPanel();
  else if (panelMode === 'route') closeRoutePanel();

  scheduleViewOpen = true;
  scheduleMobileStep = 'detail';
  directoryActiveTab = type === 'group' ? 'groups' : 'lecturers';
  document.body.classList.add('schedule-view-active', 'schedule-is-open');

  const view = document.getElementById('schedule-view');
  if (view) {
    view.classList.remove('hidden');
    requestAnimationFrame(() => view.classList.add('open'));
  }

  updatePanelHandle();
  syncModeUI();

  if (!scheduleDirectory.ready || (scheduleDirectory.groups.length === 0 && scheduleDirectory.lecturers.length === 0)) {
    await loadScheduleDirectory();
  }

  await selectScheduleEntity(type, name, { switchMobileToDetail: true });
}

function getDefaultAcademicWeekDisplay() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMonday);
  const dd = String(mon.getDate()).padStart(2, '0');
  const mm = String(mon.getMonth() + 1).padStart(2, '0');
  const yyyy = mon.getFullYear();
  return `${dd}.${mm}.${yyyy} · знаменатель`;
}

function getCurrentWeekTriggerLabel() {
  let mondayDDMMYYYY = '';
  if (currentEntityData && Array.isArray(currentEntityData.days) && currentEntityData.days[0]?.date) {
    const [yyyy, mm, dd] = String(currentEntityData.days[0].date).split('-');
    if (yyyy && mm && dd) mondayDDMMYYYY = `${dd}.${mm}.${yyyy}`;
  }

  if (availableScheduleWeeks.length > 0) {
    const targetDate = selectedScheduleWeekDate || mondayDDMMYYYY;
    const found = (targetDate && availableScheduleWeeks.find(w => w.value === targetDate || String(w.label || '').startsWith(targetDate))) ||
                  availableScheduleWeeks.find(w => w.selected || String(w.label || '').toLowerCase().includes('текущ'));
    if (found) {
      const raw = String(found.label || found.value || '').trim();
      const m = raw.match(/(\d{2}\.\d{2}\.\d{4})/);
      const datePart = m ? m[1] : raw;
      const lower = raw.toLowerCase();
      let kind = '';
      if (lower.includes('знам')) kind = 'знаменатель';
      else if (lower.includes('числ')) kind = 'числитель';
      return kind ? `${datePart} · ${kind}` : datePart;
    }
  }

  if (mondayDDMMYYYY) {
    return `${mondayDDMMYYYY} · знаменатель`;
  }
  return getDefaultAcademicWeekDisplay();
}

async function selectScheduleEntity(type, name, { switchMobileToDetail = true, weekDate = selectedScheduleWeekDate } = {}) {
  currentEntitySchedule = { type, name };
  scheduleDayFilter = 'all';
  if (switchMobileToDetail) scheduleMobileStep = 'detail';
  entityLoading = true;
  entityError = null;
  updateScheduleURL({ push: false });
  renderScheduleWorkspace();

  try {
    const dateQuery = weekDate ? `&date=${encodeURIComponent(weekDate)}` : '';
    const res = await fetch(`/api/entity-schedule?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}${dateQuery}`);
    if (!res.ok) throw new Error('Расписание не найдено');
    const data = await res.json();
    currentEntityData = data;
    currentEntitySchedule = { type: data.entityType || type, name: data.name || name };
    const entityKey = `${currentEntitySchedule.type}:${currentEntitySchedule.name}`;
    if (Array.isArray(data.currentWeekDays) && data.currentWeekDays.length > 0) {
      currentWeekStatusByEntityKey.set(entityKey, data.currentWeekDays);
    } else if (data.isCurrentWeek !== false && Array.isArray(data.days) && data.days.length > 0) {
      currentWeekStatusByEntityKey.set(entityKey, data.days);
    }
    if (Array.isArray(data.availableWeeks) && data.availableWeeks.length > 0) {
      availableScheduleWeeks = data.availableWeeks;
    }
    if (data.selectedWeek && data.selectedWeek.value) {
      selectedScheduleWeekDate = data.selectedWeek.value;
    } else if (data.selectedWeekDate) {
      selectedScheduleWeekDate = data.selectedWeekDate;
    }
    if (!userProfile.recentViews || typeof userProfile.recentViews !== 'object') {
      userProfile.recentViews = {};
    }
    const prevEntry = userProfile.recentViews[entityKey];
    const prevCount = (prevEntry && typeof prevEntry === 'object') ? (Number(prevEntry.count) || 0) : (Number(prevEntry) ? 1 : 0);
    userProfile.recentViews[entityKey] = {
      count: prevCount + 1,
      lastViewedAt: Date.now()
    };
    syncUserProfileToServer({ recentViews: userProfile.recentViews });
    entityLoading = false;
    renderScheduleWorkspace();
    haptic('success');
  } catch (e) {
    entityLoading = false;
    entityError = e.message || 'Ошибка загрузки расписания';
    renderScheduleWorkspace();
  }
}

function toggleScheduleFavorite(entityType, entityName) {
  const key = `${entityType}:${entityName}`;
  const favs = Array.isArray(userProfile.favorites) ? [...userProfile.favorites] : [];
  const idx = favs.indexOf(key);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.unshift(key);
  }
  userProfile.favorites = favs;
  syncUserProfileToServer({ favorites: favs });
  const view = document.getElementById('schedule-view');
  if (view) updateScheduleSidebarListInPlace(view);
}

function buildScheduleSidebarData() {
  const q = directoryFilterQuery.toLowerCase().replace(/ё/g, 'е').trim();
  const favSet = new Set(Array.isArray(userProfile.favorites) ? userProfile.favorites : []);
  const recentMap = (userProfile.recentViews && typeof userProfile.recentViews === 'object')
    ? userProfile.recentViews
    : {};

  const getRecentScore = (key) => {
    const val = recentMap[key];
    if (!val) return { count: 0, lastViewedAt: 0 };
    if (typeof val === 'number') return { count: 1, lastViewedAt: val };
    return {
      count: Number(val.count) || 0,
      lastViewedAt: Number(val.lastViewedAt) || 0
    };
  };

  const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
  const matchedGroups = scheduleDirectory.groups
    .filter(g => !q || `${g.name} группа ${g.faculty || ''} ${g.facultyCode || ''}`.toLowerCase().replace(/ё/g, 'е').includes(q))
    .map(g => ({ ...g, itemType: 'group' }));

  const matchedLecturers = scheduleDirectory.lecturers
    .filter(l => !q || `${l.name} ${l.shortName || ''} ${l.fullName || ''} ${l.regalia || ''}`.toLowerCase().replace(/ё/g, 'е').includes(q))
    .map(l => ({ ...l, itemType: 'lecturer' }));

  const matchedClassrooms = (scheduleDirectory.classrooms || [])
    .filter(c => !q || `${c.name} ауд аудитория ${c.fullName || ''} ${c.buildingName || ''} ${c.floor != null ? c.floor + ' этаж' : ''}`.toLowerCase().replace(/ё/g, 'е').includes(q))
    .map(c => ({ ...c, itemType: 'classroom' }));

  const typeOrder = { group: 0, lecturer: 1, classroom: 2 };
  const getItemLabel = (it) => {
    if (it.itemType === 'group') return it.name;
    if (it.itemType === 'classroom') return it.fullName || `Аудитория ${it.name}`;
    return it.fullName || it.name;
  };

  const unifiedItems = [...matchedGroups, ...matchedLecturers, ...matchedClassrooms].sort((a, b) => {
    const kA = `${a.itemType}:${a.name}`;
    const kB = `${b.itemType}:${b.name}`;

    const fA = favSet.has(kA) ? 1 : 0;
    const fB = favSet.has(kB) ? 1 : 0;
    if (fA !== fB) return fB - fA;

    const rA = getRecentScore(kA);
    const rB = getRecentScore(kB);
    if (rA.count !== rB.count) return rB.count - rA.count;
    if (rA.lastViewedAt !== rB.lastViewedAt) return rB.lastViewedAt - rA.lastViewedAt;

    if (q) {
      const aLabel = getItemLabel(a).toLowerCase().replace(/ё/g, 'е');
      const bLabel = getItemLabel(b).toLowerCase().replace(/ё/g, 'е');
      const aStarts = (aLabel.startsWith(q) || String(a.name || '').toLowerCase().startsWith(q)) ? 1 : 0;
      const bStarts = (bLabel.startsWith(q) || String(b.name || '').toLowerCase().startsWith(q)) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
    }

    if (a.itemType !== b.itemType) {
      return (typeOrder[a.itemType] ?? 9) - (typeOrder[b.itemType] ?? 9);
    }

    return collator.compare(getItemLabel(a), getItemLabel(b));
  });

  let sidebarListHtml = '';

  if (!scheduleDirectory.ready) {
    sidebarListHtml = `<div class="free-warming"><div class="spinner"></div><div>Загружаем справочник расписания…</div></div>`;
  } else if (unifiedItems.length === 0) {
    sidebarListHtml = `<div class="free-panel-empty">Ничего не найдено по запросу «${escapeHtml(directoryFilterQuery)}»</div>`;
  } else {
    sidebarListHtml = unifiedItems.map(item => {
      const itemType = item.itemType;
      const entityKey = `${itemType}:${item.name}`;
      const isFav = favSet.has(entityKey);
      const isActive = currentEntitySchedule &&
        currentEntitySchedule.type === itemType &&
        currentEntitySchedule.name === item.name;
      let titleText = '';
      let subText = '';
      if (itemType === 'group') {
        titleText = `Группа ${item.name}`;
        subText = formatFacultyFullName(item.faculty || item.facultyCode || '');
      } else if (itemType === 'classroom') {
        titleText = item.fullName || `Аудитория ${item.name}`;
        subText = `${item.buildingName || 'Главный корпус'}${item.floor != null ? ' · ' + item.floor + ' этаж' : ''}`;
      } else {
        titleText = item.fullName || item.shortName || item.name;
        subText = item.regalia || '';
      }
      return `
        <div class="sched-dir-item ${isActive ? 'active' : ''}" role="button" tabindex="0" data-entity-type="${itemType}" data-entity-name="${escapeHtml(item.name)}">
          <div class="sched-dir-main">
            <div class="sched-dir-title">${escapeHtml(titleText)}</div>
            ${subText ? `<div class="sched-dir-sub">${escapeHtml(subText)}</div>` : ''}
          </div>
          <div class="sched-dir-right">
            <button type="button" class="sched-fav-btn ${isFav ? 'active' : ''}" data-fav-type="${itemType}" data-fav-name="${escapeHtml(item.name)}" title="${isFav ? 'Убрать из избранного' : 'В избранное'}" aria-label="Избранное">
              <i class="mdi ${isFav ? 'mdi-star' : 'mdi-star-outline'}"></i>
            </button>
            <i class="mdi mdi-chevron-right sched-dir-arrow"></i>
          </div>
        </div>
      `;
    }).join('');
  }

  return { filteredGroups: matchedGroups, filteredLecturers: matchedLecturers, filteredClassrooms: matchedClassrooms, sidebarListHtml };
}

function attachScheduleSidebarItemListeners(container) {
  if (!container) return;
  container.querySelectorAll('.sched-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleScheduleFavorite(btn.dataset.favType, btn.dataset.favName);
    });
  });
  container.querySelectorAll('.sched-dir-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.sched-fav-btn')) return;
      selectScheduleEntity(item.dataset.entityType, item.dataset.entityName, { switchMobileToDetail: true });
    });
  });
}

// Обновление списка без пересоздания <input id="sched-view-search"> (исправляет сброс цифровой клавиатуры на iOS/iPhone)
function updateScheduleSidebarListInPlace(view) {
  const { sidebarListHtml } = buildScheduleSidebarData();
  const listEl = view.querySelector('#schedule-sidebar-list');
  if (listEl) {
    listEl.innerHTML = sidebarListHtml;
    attachScheduleSidebarItemListeners(listEl);
  }
  const clearBtn = view.querySelector('#sched-view-clear');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !directoryFilterQuery);
  }
}

const DOWNLOAD_SVG_ICON = `<svg class="action-icon-download" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11.5"/><path d="m7.75 11.25 4.25 4.25 4.25-4.25"/><path d="M5 19.5h14"/></svg>`;

const MDI_BADGE_PATHS = {
  book: 'M19 2L14 6.5V17.5L19 13V2M6.5 5C4.55 5 2.45 5.4 1 6.5V21.16C1 21.41 1.25 21.66 1.5 21.66C1.6 21.66 1.65 21.59 1.75 21.59C3.1 20.94 5.05 20.5 6.5 20.5C8.45 20.5 10.55 20.9 12 22C13.35 21.15 15.8 20.5 17.5 20.5C19.15 20.5 20.85 20.81 22.25 21.56C22.35 21.61 22.4 21.59 22.5 21.59C22.75 21.59 23 21.34 23 21.09V6.5C22.4 6.05 21.75 5.75 21 5.5V19C19.9 18.65 18.7 18.5 17.5 18.5C15.8 18.5 13.35 19.15 12 20V6.5C10.55 5.4 8.45 5 6.5 5Z',
  fx: 'M12.42 5.29C11.32 5.19 10.35 5.93 10.17 7.01L9.67 10H13V12H9.33L8.24 18.59C7.92 20.57 6.19 22 4.19 22C3.5 22 2.86 21.84 2.27 21.54L3.16 19.75C3.47 19.91 3.82 20 4.19 20C5.21 20 6.09 19.27 6.26 18.26L7.31 12H5V10H7.65L8.2 6.68C8.55 4.54 10.5 3.09 12.66 3.29C13.39 3.36 14.08 3.63 14.66 4.07L13.46 5.67C13.15 5.44 12.79 5.32 12.42 5.29M22 13.65L20.59 12.24L17.76 15.07L14.93 12.24L13.5 13.65L16.35 16.5L13.5 19.31L14.93 20.72L17.76 17.89L20.59 20.72L22 19.31L19.17 16.5L22 13.65Z',
  microscope: 'M11.68 4.4L9.56 2.28L6.03 5.81L8.15 7.93L6.74 9.35L5.32 7.93L3.91 9.35L7.44 12.88L8.86 11.47L7.44 10.05L8.86 8.64L10.97 10.76L14.5 7.23L12.39 5.11L13.1 4.4C14.12 3.92 15.27 3.74 16.41 3.92C19.55 4.41 21.7 7.35 21.21 10.5C20.92 12.37 19.72 13.97 18 14.79V13.17C19.24 12.08 19.65 10.32 19 8.79C18.35 7.27 16.79 6.34 15.14 6.5C14.43 6.57 13.75 6.84 13.19 7.29L11.78 5.88L12.39 5.11L11.68 4.4M5 16V18H10.5C11.47 18 12.35 18.56 12.76 19.44L13 20H3V22H21V20H18C19.93 18.54 21 16.27 21 13.85V11H19V13.85C19 16.14 17.14 18 14.85 18H14.15C13.61 16.8 12.41 16 11.09 16H5Z',
  comment: 'M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22V22H9M10,16V19.08L13.08,16H20V4H4V16H10Z',
  check: 'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z',
  school: 'M12,3L1,9L12,15L21,10.09V17H23V9M5,13.18V17.18L12,21L19,17.18V13.18L12,17L5,13.18Z'
};

function drawCanvasBadge(ctx, text, x, y) {
  ctx.save();
  const norm = normalizeClientLessonType(text);
  const badgeMap = {
    'Лек.': { bg: '#e4ffe8', text: '#1b952d', border: '#c6f5cd', icon: 'book' },
    'Упр.': { bg: '#eff7fd', text: '#4386bb', border: '#d2e8fb', icon: 'fx' },
    'Лаб.': { bg: '#fbf0fe', text: '#c05fdd', border: '#f3d9fd', icon: 'microscope' },
    'Конс.': { bg: '#fef3c7', text: '#d97706', border: '#fde68a', icon: 'comment' },
    'Зач.': { bg: '#ccfbf1', text: '#0d9488', border: '#99f6e4', icon: 'check' },
    'Экз.': { bg: '#ffe4e6', text: '#e11d48', border: '#fecdd3', icon: 'school' }
  };
  const cfg = badgeMap[norm] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', icon: 'dot' };
  const h = 20;

  ctx.font = 'bold 11px Onest, sans-serif';
  const textW = norm ? ctx.measureText(norm).width : 0;
  const w = norm ? Math.max(58, Math.ceil(22 + textW + 8)) : 32;
  const r = 6;

  ctx.fillStyle = cfg.bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = cfg.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (MDI_BADGE_PATHS[cfg.icon] && typeof Path2D !== 'undefined') {
    ctx.save();
    ctx.translate(x + 5, y + 4);
    ctx.scale(12 / 24, 12 / 24);
    ctx.fillStyle = cfg.text;
    ctx.fill(new Path2D(MDI_BADGE_PATHS[cfg.icon]));
    ctx.restore();
  }

  ctx.font = 'bold 11px Onest, sans-serif';
  ctx.fillStyle = cfg.text;
  ctx.textAlign = 'left';
  ctx.fillText(norm || '', x + 20, y + 14);

  ctx.restore();
  return w;
}

async function saveCanvasPng(canvas, filename, title = '') {
  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

  if (isMobile && blob && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        // Передаём только файл картинки без дублирующего текста или заголовка
        await navigator.share({
          files: [file]
        });
        showToast('Изображение готово к отправке');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  const dataUrl = canvas.toDataURL('image/png');

  if (isMobile) {
    try {
      const tgId = telegramUser?.id || userProfile?.telegramId || null;
      const inTgWebApp = Boolean(tg && tg.initData);
      const res = await fetch('/api/export-png', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl,
          filename,
          title: '',
          sendToTelegram: Boolean(inTgWebApp && tgId),
          telegramId: tgId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.url) {
          const fullUrl = new URL(data.url, location.origin).toString();
          if (inTgWebApp && typeof tg.downloadFile === 'function') {
            try {
              tg.downloadFile({ url: fullUrl, file_name: filename });
            } catch (e) {}
          }
          if (data.sentToTelegram) {
            showToast('Отправлено в чат с ботом — сохраните в галерею в 1 касание');
            return;
          }
          const a = document.createElement('a');
          a.href = fullUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showToast('Изображение сохранено в PNG');
          return;
        }
      }
    } catch (e) {}
  }

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Изображение сохранено в PNG');
}

function wrapCanvasLines(ctx, text, maxWidth) {
  if (!text) return [];
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function formatSchedulePngSubtitle(triggerLabel) {
  const raw = String(triggerLabel || '').trim();
  const m = raw.match(/(\d{2}\.\d{2}\.\d{4})/);
  const dateStr = m ? m[1] : raw;
  const isZnam = raw.toLowerCase().includes('знам');
  const isChisl = raw.toLowerCase().includes('числ');
  const parity = isZnam ? 'Знаменатель' : (isChisl ? 'Числитель' : '');
  return parity ? `Неделя ${dateStr} · ${parity}` : `Неделя ${dateStr}`;
}

function renderScheduleWorkspace() {
  const view = document.getElementById('schedule-view');
  if (!view) return;

  view.dataset.mobileStep = scheduleMobileStep;

  const { sidebarListHtml } = buildScheduleSidebarData();
  const mainHtml = renderScheduleMainPane();

  view.innerHTML = `
    <div class="schedule-workspace ${scheduleSidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <div class="schedule-sidebar-wrap">
        <aside class="schedule-sidebar ${scheduleSidebarCollapsed ? 'collapsed' : ''}" id="schedule-sidebar">
          <div class="schedule-sidebar-top">
            <div class="schedule-sidebar-title-row">
              <h2 class="schedule-sidebar-heading">Расписание</h2>
            </div>

            <div class="sched-filter-caption">Можно вводить номер группы, фамилию преподавателя или номер аудитории</div>
            <div class="sched-filter-wrap">
              <i class="mdi mdi-magnify sched-filter-icon"></i>
              <input type="text" class="sched-filter-input" id="sched-view-search"
                     placeholder="Например: 546, Скворцов или 337…"
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
        <button type="button" class="schedule-sidebar-handle" id="schedule-sidebar-handle" title="${scheduleSidebarCollapsed ? 'Развернуть список групп, преподавателей и аудиторий' : 'Свернуть список групп, преподавателей и аудиторий'}">
          <i class="mdi ${scheduleSidebarCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'}"></i>
        </button>
      </div>

      <main class="schedule-main" id="schedule-main">
        ${mainHtml}
      </main>
    </div>
  `;

  attachScheduleWorkspaceListeners(view);
  scrollScheduleTableToToday(view);
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
        <button type="button" class="schedule-back-arrow-btn" id="sched-mobile-back" title="К списку" aria-label="К списку">
          <i class="mdi mdi-chevron-left"></i>
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
        <div class="schedule-empty-title">Выберите группу, преподавателя или аудиторию</div>
        <div class="schedule-empty-sub">В списке слева доступно расписание всех учебных групп, преподавателей и аудиторий Главного корпуса с быстрым переходом к любой аудитории на карте.</div>
      </div>
    `;
  }

  const data = currentEntityData;
  const isGroup = data.entityType === 'group';
  const isClassroom = data.entityType === 'classroom';
  const title = isGroup
    ? `Группа ${data.name}`
    : (isClassroom ? (data.fullName || `Аудитория ${data.name}`) : (data.fullName || data.shortName || data.name));
  const kickerText = isGroup
    ? formatFacultyFullName(data.faculty || data.facultyCode || '')
    : (data.regalia || '');

  const weekTriggerLabel = getCurrentWeekTriggerLabel();
  const weekOptionsHtml = (availableScheduleWeeks.length > 0 ? availableScheduleWeeks : [
    { value: '', label: weekTriggerLabel, selected: true }
  ]).map(w => {
    const isSelected = selectedScheduleWeekDate
      ? w.value === selectedScheduleWeekDate
      : Boolean(w.selected);
    const isCurrentWeek = String(w.label || '').toLowerCase().includes('текущ');
    return `
      <button type="button" class="schedule-week-option ${isSelected ? 'active' : ''}" data-week-val="${escapeHtml(w.value || '')}">
        <span>${escapeHtml(w.label || w.value)}</span>
        ${isCurrentWeek ? '<span class="schedule-week-option-tag">текущая</span>' : ''}
      </button>
    `;
  }).join('');

  const st = computeClientEntityNowStatus(data);
  const statusCardHtml = `
    <div class="now-status ${st.type === 'busy' ? 'busy' : 'free'} schedule-hero-status">
      <div class="now-body">
        <div class="now-top-row">
          <div class="now-title">${escapeHtml(st.title)}</div>
        </div>
        <div class="now-bottom-row">
          ${st.details ? `<div class="now-details">${escapeHtml(st.details)}</div>` : '<div class="now-details"></div>'}
          ${st.roomId ? `
            <button type="button" class="now-locate-btn" data-room-id="${escapeHtml(st.roomId)}" title="Показать аудиторию на карте" aria-label="Показать аудиторию на карте">
              <i class="mdi mdi-map-marker-radius-outline"></i>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  const days = data.days || [];
  const tableMode = isClassroom ? 'room' : (isGroup ? 'group' : 'lecturer');
  const tableHtml = buildWeeklyScheduleTableHtml(days, { mode: tableMode });

  const toolbarHtml = `
    <div class="schedule-table-toolbar">
      <div class="schedule-week-picker-row borderless-picker">
        <button type="button" class="schedule-week-trigger borderless ${scheduleWeekDropdownOpen ? 'open' : ''}" id="schedule-week-trigger" title="Выбрать учебную неделю">
          <span>${escapeHtml(weekTriggerLabel)}</span>
          <i class="mdi mdi-chevron-down"></i>
        </button>
        <div class="schedule-week-dropdown ${scheduleWeekDropdownOpen ? '' : 'hidden'}" id="schedule-week-dropdown">
          ${weekOptionsHtml}
        </div>
      </div>
      <button type="button" class="schedule-icon-btn-borderless schedule-export-right" id="schedule-export-png-btn" title="Скачать расписание в PNG" aria-label="Скачать расписание в PNG">
        ${DOWNLOAD_SVG_ICON}
      </button>
    </div>
  `;

  return `
    <div class="schedule-main-header">
      <div class="schedule-hero-top">
        <button type="button" class="schedule-detail-close-btn" id="sched-detail-close" title="Закрыть" aria-label="Закрыть">✕</button>
        <div class="schedule-hero-title-block">
          ${kickerText ? `<div class="schedule-entity-kicker">${escapeHtml(kickerText)}</div>` : ''}
          <h1 class="schedule-entity-title">
            <span class="schedule-entity-title-text">${escapeHtml(title)}</span><button type="button" class="share-icon schedule-share-icon" id="schedule-share-btn" title="Скопировать прямую ссылку на расписание" aria-label="Скопировать прямую ссылку на расписание"><i class="mdi mdi-share"></i></button>
          </h1>
        </div>
      </div>

      ${statusCardHtml}
    </div>

    ${toolbarHtml}

    ${tableHtml}
  `;
}

function renderLessonTypeBadgeHtml(typeStr) {
  const t = LESSON_TYPES[typeStr];
  if (t) {
    return `<span class="badge ${t.cls}"><i class="mdi ${t.icon}"></i>${escapeHtml(typeStr)}</span>`;
  }
  return `<span class="badge pr">${escapeHtml(typeStr || 'Занятие')}</span>`;
}

function openCheatSheetModal() {
  const modal = document.getElementById('cheatsheet-modal-backdrop');
  if (!modal || !currentEntityData) return;
  const list = Array.isArray(currentEntityData.cheatSheet) ? currentEntityData.cheatSheet : [];

  const renderLecturerInteractive = (lec) => {
    const display = lec.displayTitle || lec.display || lec.fullFio || lec.fullName || lec.shortName || '';
    const lookup = lec.shortName || lec.fullFio || lec.fullName || '';
    if (!lookup) return escapeHtml(display);
    return `<button type="button" class="cheatsheet-lecturer-inline" data-cs-lecturer="${escapeHtml(lookup)}">${escapeHtml(display)}</button>`;
  };

  let bodyHtml = '';
  if (list.length === 0) {
    bodyHtml = `<div class="free-panel-empty">На выбранной неделе дисциплины и преподаватели не указаны</div>`;
  } else {
    const trsHtml = list.map((item) => {
      const subjectFull = String(item.subject || item.headerLabel || 'Дисциплина').replace(/:+$/, '');
      const rows = Array.isArray(item.rows) ? item.rows : [];
      const rowsHtml = rows.map(row => {
        const badgesHtml = (row.types || []).map(renderLessonTypeBadgeHtml).join(' ');
        const lecsHtml = Array.isArray(row.lecturers) && row.lecturers.length > 0
          ? row.lecturers.map(renderLecturerInteractive).join(' и ')
          : escapeHtml(row.text || 'преподаватель не указан');
        return `
          <div class="cheatsheet-table-row-item">
            <div class="cheatsheet-table-badges">${badgesHtml}</div>
            <div class="cheatsheet-table-lecturers">${lecsHtml}</div>
          </div>
        `;
      }).join('');

      return `
        <tr>
          <td class="cs-col-subject">${escapeHtml(subjectFull)}</td>
          <td class="cs-col-details">${rowsHtml}</td>
        </tr>
      `;
    }).join('');

    bodyHtml = `
      <div class="cheatsheet-table-wrap">
        <table class="cheatsheet-table">
          <thead>
            <tr>
              <th class="cs-col-subject">Дисциплина</th>
              <th class="cs-col-details">Вид занятий и преподаватели</th>
            </tr>
          </thead>
          <tbody>
            ${trsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="cheatsheet-modal-card">
      <div class="cheatsheet-modal-header">
        <div class="cheatsheet-modal-title">
          <i class="mdi mdi-notebook-outline"></i>
          <span>Группа ${escapeHtml(currentEntityData.name)}</span>
        </div>
        <div class="cheatsheet-modal-header-actions">
          ${list.length > 0 ? `
            <button type="button" class="schedule-icon-btn-borderless" id="cheatsheet-export-png-btn" title="Скачать шпаргалку в PNG" aria-label="Скачать шпаргалку в PNG">
              ${DOWNLOAD_SVG_ICON}
            </button>
          ` : ''}
          <button type="button" class="cheatsheet-modal-close" id="cheatsheet-modal-close" aria-label="Закрыть">✕</button>
        </div>
      </div>
      <div class="cheatsheet-modal-body">${bodyHtml}</div>
    </div>
  `;
  modal.classList.remove('hidden');

  modal.querySelector('#cheatsheet-modal-close')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal.querySelector('#cheatsheet-export-png-btn')?.addEventListener('click', () => {
    exportCheatSheetToPng();
  });
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  };
  modal.querySelectorAll('[data-cs-lecturer]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lec = btn.dataset.csLecturer;
      modal.classList.add('hidden');
      if (lec) selectScheduleEntity('lecturer', lec, { switchMobileToDetail: true });
    });
  });
}

function exportCheatSheetToPng() {
  if (!currentEntityData) return;
  const list = Array.isArray(currentEntityData.cheatSheet) ? currentEntityData.cheatSheet : [];
  if (!list.length) return;

  const bg = '#ffffff';
  const cardBg = '#f8fafc';
  const textMain = '#0f172a';
  const textMuted = '#64748b';
  const borderCol = '#e2e8f0';

  const W = 960;
  const subjColW = 230;
  const detColW = W - 48 - subjColW;
  const padX = 24;
  const tableTop = 58;
  const headerH = 40;

  // Pre-measure dynamic row heights using offscreen canvas context
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = '600 13px Onest, sans-serif';

  const rowHeights = list.map(item => {
    const subj = String(item.subject || item.headerLabel || '').replace(/:+$/, '');
    const subjLines = wrapCanvasLines(mctx, subj, subjColW - 28);
    const subjH = Math.max(24, subjLines.length * 18);

    mctx.font = '500 12.5px Onest, sans-serif';
    const rows = Array.isArray(item.rows) ? item.rows : [];
    let rowsTotalH = 0;
    rows.forEach(row => {
      const badgesCount = (row.types || []).length;
      const badgesWidth = badgesCount * 58;
      const textMaxW = Math.max(160, detColW - badgesWidth - 28);
      const textLines = wrapCanvasLines(mctx, row.text || '', textMaxW);
      const rowItemH = Math.max(24, textLines.length * 18 + 4);
      rowsTotalH += rowItemH + 6;
    });

    return Math.max(54, Math.max(subjH, rowsTotalH) + 18);
  });

  const totalTableH = headerH + rowHeights.reduce((a, b) => a + b, 0);
  const H = tableTop + totalTableH + 28;

  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Clean title without subtitle
  ctx.fillStyle = textMain;
  ctx.font = 'bold 22px Onest, sans-serif';
  ctx.fillText(`Группа ${currentEntityData.name}`, padX, 36);

  // Table header
  ctx.fillStyle = cardBg;
  ctx.fillRect(padX, tableTop, W - padX * 2, headerH);

  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;
  ctx.strokeRect(padX, tableTop, W - padX * 2, totalTableH);

  ctx.fillStyle = textMuted;
  ctx.font = 'bold 11.5px Onest, sans-serif';
  ctx.fillText('ДИСЦИПЛИНА', padX + 14, tableTop + 25);
  ctx.fillText('ВИД ЗАНЯТИЙ И ПРЕПОДАВАТЕЛИ', padX + subjColW + 14, tableTop + 25);

  // Vertical column divider
  ctx.beginPath();
  ctx.moveTo(padX + subjColW, tableTop);
  ctx.lineTo(padX + subjColW, tableTop + totalTableH);
  ctx.stroke();

  let curY = tableTop + headerH;
  list.forEach((item, idx) => {
    const rH = rowHeights[idx];
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, curY);
    ctx.lineTo(W - padX, curY);
    ctx.stroke();

    ctx.fillStyle = textMain;
    ctx.font = '600 13px Onest, sans-serif';
    const subj = String(item.subject || item.headerLabel || '').replace(/:+$/, '');
    const subjLines = wrapCanvasLines(ctx, subj, subjColW - 28);
    subjLines.forEach((ln, lIdx) => {
      ctx.fillText(ln, padX + 14, curY + 24 + lIdx * 18);
    });

    const rows = Array.isArray(item.rows) ? item.rows : [];
    let rowItemY = curY + 14;
    rows.forEach(row => {
      let bx = padX + subjColW + 14;
      (row.types || []).forEach(t => {
        const bw = drawCanvasBadge(ctx, t, bx, rowItemY);
        bx += bw + 6;
      });

      ctx.fillStyle = textMain;
      ctx.font = '500 12.5px Onest, sans-serif';
      const textMaxW = Math.max(160, detColW - (bx - (padX + subjColW)) - 14);
      const lecLines = wrapCanvasLines(ctx, row.text || '', textMaxW);
      lecLines.forEach((ln, lnIdx) => {
        ctx.fillText(ln, bx + 4, rowItemY + 14 + lnIdx * 18);
      });

      const itemTotalH = Math.max(24, lecLines.length * 18 + 4);
      rowItemY += itemTotalH + 6;
    });

    curY += rH;
  });

  saveCanvasPng(canvas, `cheatsheet-${currentEntityData.name}.png`, `Шпаргалка группы ${currentEntityData.name}`);
}

function exportScheduleToPng() {
  if (!currentEntityData) return;
  const days = currentEntityData.days || [];
  const slots = STANDARD_TIME_SLOTS;

  const bg = '#ffffff';
  const cardBg = '#f8fafc';
  const textMain = '#0f172a';
  const textMuted = '#64748b';
  const borderCol = '#e2e8f0';

  const timeColW = 120;
  const colW = 230;
  const padX = 20;
  const tableTop = 78;
  const headerH = 48;
  const W = timeColW + days.length * colW + padX * 2;

  // Pre-measure dynamic row heights for each slot
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');

  const slotHeights = slots.map(slot => {
    let maxSlotH = 76;
    days.forEach(d => {
      const matching = (d.lessons || []).filter(l => (l.time || '').replace('-', '–') === slot);
      if (matching.length === 0) return;

      const grouped = [];
      const map = new Map();
      matching.forEach(l => {
        const key = `${(l.subject || '').trim()}|${(l.type || '').trim()}`;
        if (!map.has(key)) {
          const entry = { subject: l.subject, type: l.type, items: [] };
          map.set(key, entry);
          grouped.push(entry);
        }
        map.get(key).items.push(l);
      });

      let cellH = 10;
      grouped.forEach(g => {
        mctx.font = '600 12px Onest, sans-serif';
        const subjLines = wrapCanvasLines(mctx, g.subject, colW - 74);
        cellH += Math.max(22, subjLines.length * 16) + 4;

        mctx.font = '500 11px Onest, sans-serif';
        g.items.forEach(it => {
          const cleanRoom = it.roomShort === '🏀' ? 'Спортзал' : (it.roomShort || '');
          const bld = it.building || 'С';
          const roomDisp = cleanRoom ? (/^(спортзал|зал)/i.test(cleanRoom) ? cleanRoom : (String(cleanRoom).endsWith(` ${bld}`) ? `ауд. ${cleanRoom}` : `ауд. ${cleanRoom} ${bld}`)) : '';
          const line = [formatSubgroupDisplay(it.subgroup), it.lecturer || it.group, roomDisp].filter(Boolean).join(', ');
          const detLines = wrapCanvasLines(mctx, line, colW - 20);
          cellH += Math.max(16, detLines.length * 15) + 3;
        });
        cellH += 4;
      });

      if (cellH > maxSlotH) maxSlotH = cellH;
    });

    return Math.max(92, maxSlotH + 16);
  });

  const totalTableH = headerH + slotHeights.reduce((a, b) => a + b, 0);
  const H = tableTop + totalTableH + 28;

  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Main title
  const title = currentEntityData.entityType === 'group'
    ? `Группа ${currentEntityData.name}`
    : (currentEntityData.entityType === 'classroom'
      ? (currentEntityData.fullName || `Аудитория ${currentEntityData.name}`)
      : (currentEntityData.fullName || currentEntityData.name));
  ctx.fillStyle = textMain;
  ctx.font = 'bold 22px Onest, sans-serif';
  ctx.fillText(title, padX, 36);

  // Subtitle in format: "Неделя 02.11.2026 · Знаменатель"
  ctx.fillStyle = textMuted;
  ctx.font = '500 13px Onest, sans-serif';
  ctx.fillText(formatSchedulePngSubtitle(getCurrentWeekTriggerLabel()), padX, 58);

  // Table header background
  ctx.fillStyle = cardBg;
  ctx.fillRect(padX, tableTop, W - padX * 2, headerH);

  // Table border
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;
  ctx.strokeRect(padX, tableTop, W - padX * 2, totalTableH);

  // Centered Time header
  ctx.fillStyle = textMuted;
  ctx.font = 'bold 12px Onest, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Время', padX + timeColW / 2, tableTop + 29);

  // Days headers (Weekday + Date, no "Сегодня"/"Завтра")
  days.forEach((d, idx) => {
    const x = padX + timeColW + idx * colW;
    ctx.beginPath();
    ctx.moveTo(x, tableTop);
    ctx.lineTo(x, tableTop + totalTableH);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = textMain;
    ctx.font = 'bold 13.5px Onest, sans-serif';
    ctx.fillText(d.dayName || '', x + 12, tableTop + 20);

    let dateText = d.dateText || d.dateLabel || '';
    if (!dateText && typeof d.date === 'string' && d.date.includes('-')) {
      const [, mStr, dStr] = d.date.split('-');
      if (dStr && mStr) dateText = `${parseInt(dStr, 10)} ${MONTH_NAMES[parseInt(mStr, 10) - 1] || ''}`;
    }
    ctx.fillStyle = textMuted;
    ctx.font = '500 11.5px Onest, sans-serif';
    ctx.fillText(dateText, x + 12, tableTop + 38);
  });

  let curY = tableTop + headerH;
  slots.forEach((slot, sIdx) => {
    const sH = slotHeights[sIdx];
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, curY);
    ctx.lineTo(W - padX, curY);
    ctx.stroke();

    // Centered Time column contents
    const mStart = slot.match(/^(\d{1,2}:\d{2})/);
    const breakRange = mStart && BREAKS[mStart[1]] ? BREAKS[mStart[1]] : '';
    ctx.textAlign = 'center';
    ctx.fillStyle = textMain;
    ctx.font = 'bold 12px Onest, sans-serif';
    ctx.fillText(`${sIdx + 1} пара`, padX + timeColW / 2, curY + 22);

    ctx.fillStyle = '#334155';
    ctx.font = '600 11.5px Onest, sans-serif';
    ctx.fillText(slot, padX + timeColW / 2, curY + 39);

    if (breakRange) {
      ctx.fillStyle = textMuted;
      ctx.font = '500 10px Onest, sans-serif';
      ctx.fillText(`перерыв ${breakRange}`, padX + timeColW / 2, curY + 54);
    }

    // Days cells
    days.forEach((d, dIdx) => {
      const x = padX + timeColW + dIdx * colW;
      const matching = (d.lessons || []).filter(l => (l.time || '').replace('-', '–') === slot);
      if (matching.length === 0) return;

      const grouped = [];
      const map = new Map();
      matching.forEach(l => {
        const key = `${(l.subject || '').trim()}|${(l.type || '').trim()}`;
        if (!map.has(key)) {
          const entry = { subject: l.subject, type: l.type, items: [] };
          map.set(key, entry);
          grouped.push(entry);
        }
        map.get(key).items.push(l);
      });

      let itemY = curY + 12;
      grouped.forEach(g => {
        let badgeW = 0;
        if (g.type) {
          badgeW = drawCanvasBadge(ctx, g.type, x + 10, itemY);
        }

        ctx.textAlign = 'left';
        ctx.fillStyle = textMain;
        ctx.font = '600 12px Onest, sans-serif';
        const subjX = x + 10 + (badgeW ? badgeW + 6 : 0);
        const subjMaxW = colW - 20 - (badgeW ? badgeW + 6 : 0);
        const subjLines = wrapCanvasLines(ctx, `${g.subject},`, subjMaxW);
        subjLines.forEach((ln, lnIdx) => {
          ctx.fillText(ln, subjX, itemY + 14 + lnIdx * 16);
        });

        itemY += Math.max(22, subjLines.length * 16) + 4;

        ctx.fillStyle = textMuted;
        ctx.font = '500 11px Onest, sans-serif';
        g.items.forEach(it => {
          const cleanRoom = it.roomShort === '🏀' ? 'Спортзал' : (it.roomShort || '');
          const bld = it.building || 'С';
          const roomDisp = cleanRoom ? (/^(спортзал|зал)/i.test(cleanRoom) ? cleanRoom : (String(cleanRoom).endsWith(` ${bld}`) ? `ауд. ${cleanRoom}` : `ауд. ${cleanRoom} ${bld}`)) : '';
          const line = [formatSubgroupDisplay(it.subgroup), it.lecturer || it.group, roomDisp].filter(Boolean).join(', ');
          const detLines = wrapCanvasLines(ctx, line, colW - 20);
          detLines.forEach((ln, lnIdx) => {
            ctx.fillText(ln, x + 10, itemY + 13 + lnIdx * 15);
          });
          itemY += Math.max(16, detLines.length * 15) + 3;
        });

        itemY += 4;
      });
    });

    curY += sH;
  });

  saveCanvasPng(canvas, `schedule-${currentEntityData.name}.png`, title);
}

function exportRoomScheduleToPng(title, data) {
  if (!data) return;
  const days = data.days || [];
  const slots = STANDARD_TIME_SLOTS;

  const bg = '#ffffff';
  const cardBg = '#f8fafc';
  const textMain = '#0f172a';
  const textMuted = '#64748b';
  const borderCol = '#e2e8f0';

  const timeColW = 120;
  const colW = 230;
  const padX = 20;
  const tableTop = 78;
  const headerH = 48;
  const W = timeColW + days.length * colW + padX * 2;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');

  const slotHeights = slots.map(slot => {
    let maxSlotH = 76;
    days.forEach(d => {
      const matching = (d.lessons || []).filter(l => (l.time || '').replace('-', '–') === slot);
      if (matching.length === 0) return;

      let cellH = 10;
      matching.forEach(l => {
        mctx.font = '600 12px Onest, sans-serif';
        const subjLines = wrapCanvasLines(mctx, l.subject, colW - 74);
        cellH += Math.max(22, subjLines.length * 16) + 4;

        mctx.font = '500 11px Onest, sans-serif';
        const line = [l.group ? `гр. ${l.group}` : '', l.lecturer].filter(Boolean).join(', ');
        const detLines = wrapCanvasLines(mctx, line, colW - 20);
        cellH += Math.max(16, detLines.length * 15) + 3;
      });

      if (cellH > maxSlotH) maxSlotH = cellH;
    });

    return Math.max(92, maxSlotH + 16);
  });

  const totalTableH = headerH + slotHeights.reduce((a, b) => a + b, 0);
  const H = tableTop + totalTableH + 28;

  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Main title
  ctx.fillStyle = textMain;
  ctx.font = 'bold 22px Onest, sans-serif';
  ctx.fillText(title, padX, 36);

  // Subtitle
  ctx.fillStyle = textMuted;
  ctx.font = '500 13px Onest, sans-serif';
  ctx.fillText(formatSchedulePngSubtitle(getRoomWeekTriggerLabel(data)), padX, 58);

  // Table header
  ctx.fillStyle = cardBg;
  ctx.fillRect(padX, tableTop, W - padX * 2, headerH);

  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;
  ctx.strokeRect(padX, tableTop, W - padX * 2, totalTableH);

  // Centered Time header
  ctx.fillStyle = textMuted;
  ctx.font = 'bold 12px Onest, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Время', padX + timeColW / 2, tableTop + 29);

  // Days headers
  days.forEach((d, idx) => {
    const x = padX + timeColW + idx * colW;
    ctx.beginPath();
    ctx.moveTo(x, tableTop);
    ctx.lineTo(x, tableTop + totalTableH);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = textMain;
    ctx.font = 'bold 13.5px Onest, sans-serif';
    ctx.fillText(d.dayName || '', x + 12, tableTop + 20);

    let dateText = d.dateText || d.dateLabel || '';
    if (!dateText && typeof d.date === 'string' && d.date.includes('-')) {
      const [, mStr, dStr] = d.date.split('-');
      if (dStr && mStr) dateText = `${parseInt(dStr, 10)} ${MONTH_NAMES[parseInt(mStr, 10) - 1] || ''}`;
    }
    ctx.fillStyle = textMuted;
    ctx.font = '500 11.5px Onest, sans-serif';
    ctx.fillText(dateText, x + 12, tableTop + 38);
  });

  let curY = tableTop + headerH;
  slots.forEach((slot, sIdx) => {
    const sH = slotHeights[sIdx];
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, curY);
    ctx.lineTo(W - padX, curY);
    ctx.stroke();

    // Centered Time column contents
    const mStart = slot.match(/^(\d{1,2}:\d{2})/);
    const breakRange = mStart && BREAKS[mStart[1]] ? BREAKS[mStart[1]] : '';
    ctx.textAlign = 'center';
    ctx.fillStyle = textMain;
    ctx.font = 'bold 12px Onest, sans-serif';
    ctx.fillText(`${sIdx + 1} пара`, padX + timeColW / 2, curY + 22);

    ctx.fillStyle = '#334155';
    ctx.font = '600 11.5px Onest, sans-serif';
    ctx.fillText(slot, padX + timeColW / 2, curY + 39);

    if (breakRange) {
      ctx.fillStyle = textMuted;
      ctx.font = '500 10px Onest, sans-serif';
      ctx.fillText(`перерыв ${breakRange}`, padX + timeColW / 2, curY + 54);
    }

    // Days cells
    days.forEach((d, dIdx) => {
      const x = padX + timeColW + dIdx * colW;
      const matching = (d.lessons || []).filter(l => (l.time || '').replace('-', '–') === slot);
      if (matching.length === 0) return;

      let itemY = curY + 12;
      matching.forEach(l => {
        let badgeW = 0;
        if (l.type) {
          badgeW = drawCanvasBadge(ctx, l.type, x + 10, itemY);
        }

        ctx.textAlign = 'left';
        ctx.fillStyle = textMain;
        ctx.font = '600 12px Onest, sans-serif';
        const subjX = x + 10 + (badgeW ? badgeW + 6 : 0);
        const subjMaxW = colW - 20 - (badgeW ? badgeW + 6 : 0);
        const subjLines = wrapCanvasLines(ctx, `${l.subject},`, subjMaxW);
        subjLines.forEach((ln, lnIdx) => {
          ctx.fillText(ln, subjX, itemY + 14 + lnIdx * 16);
        });

        itemY += Math.max(22, subjLines.length * 16) + 4;

        ctx.fillStyle = textMuted;
        ctx.font = '500 11px Onest, sans-serif';
        const line = [l.group ? `гр. ${l.group}` : '', l.lecturer].filter(Boolean).join(', ');
        const detLines = wrapCanvasLines(ctx, line, colW - 20);
        detLines.forEach((ln, lnIdx) => {
          ctx.fillText(ln, x + 10, itemY + 13 + lnIdx * 15);
        });
        itemY += Math.max(16, detLines.length * 15) + 3;
        itemY += 4;
      });
    });

    curY += sH;
  });

  saveCanvasPng(canvas, `schedule-${title.replace(/\s+/g, '-')}.png`, title);
}

function attachScheduleWorkspaceListeners(view) {
  const weekTrigger = view.querySelector('#schedule-week-trigger');
  const weekDropdown = view.querySelector('#schedule-week-dropdown');
  if (weekTrigger && weekDropdown) {
    weekTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      scheduleWeekDropdownOpen = !scheduleWeekDropdownOpen;
      weekTrigger.classList.toggle('open', scheduleWeekDropdownOpen);
      weekDropdown.classList.toggle('hidden', !scheduleWeekDropdownOpen);
    });
    view.querySelectorAll('.schedule-week-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextWeek = opt.dataset.weekVal || '';
        selectedScheduleWeekDate = nextWeek;
        scheduleWeekDropdownOpen = false;
        weekTrigger.classList.remove('open');
        weekDropdown.classList.add('hidden');
        if (currentEntitySchedule) {
          selectScheduleEntity(currentEntitySchedule.type, currentEntitySchedule.name, {
            switchMobileToDetail: false,
            weekDate: nextWeek
          });
        } else {
          renderScheduleWorkspace();
        }
      });
    });
  }

  const csBtn = view.querySelector('#schedule-cheatsheet-btn');
  if (csBtn) {
    csBtn.addEventListener('click', openCheatSheetModal);
  }

  const pngBtn = view.querySelector('#schedule-export-png-btn');
  if (pngBtn) {
    pngBtn.addEventListener('click', exportScheduleToPng);
  }

  const sidebarHandle = view.querySelector('#schedule-sidebar-handle');
  if (sidebarHandle) {
    sidebarHandle.addEventListener('click', () => {
      scheduleSidebarCollapsed = !scheduleSidebarCollapsed;
      const sidebar = view.querySelector('#schedule-sidebar');
      const workspace = view.querySelector('.schedule-workspace');
      if (sidebar) sidebar.classList.toggle('collapsed', scheduleSidebarCollapsed);
      if (workspace) workspace.classList.toggle('sidebar-collapsed', scheduleSidebarCollapsed);
      sidebarHandle.title = scheduleSidebarCollapsed
        ? 'Развернуть список групп и преподавателей'
        : 'Свернуть список групп и преподавателей';
      const icon = sidebarHandle.querySelector('i');
      if (icon) {
        icon.className = `mdi ${scheduleSidebarCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'}`;
      }
    });
  }

  const detailCloseBtn = view.querySelector('#sched-detail-close');
  if (detailCloseBtn) {
    detailCloseBtn.addEventListener('click', () => {
      scheduleWeekDropdownOpen = false;
      if (window.innerWidth <= 768) {
        scheduleMobileStep = 'list';
        view.dataset.mobileStep = 'list';
      } else {
        currentEntitySchedule = null;
        currentEntityData = null;
        scheduleSidebarCollapsed = false;
        updateScheduleURL({ push: false });
        renderScheduleWorkspace();
      }
    });
  }

  const mobileBackBtn = view.querySelector('#sched-mobile-back');
  if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        scheduleMobileStep = 'list';
        view.dataset.mobileStep = 'list';
      } else {
        currentEntitySchedule = null;
        currentEntityData = null;
        scheduleSidebarCollapsed = false;
        updateScheduleURL({ push: false });
        renderScheduleWorkspace();
      }
    });
  }

  const shareBtn = view.querySelector('#schedule-share-btn');
  if (shareBtn && currentEntitySchedule) {
    shareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cleanUrl = buildCleanShareUrl({
        view: 'schedule',
        type: currentEntitySchedule.type,
        name: currentEntitySchedule.name
      });
      const shareTitle = currentEntitySchedule.type === 'group'
        ? `Расписание группы ${currentEntitySchedule.name} · РГРТУ`
        : (currentEntitySchedule.type === 'classroom'
          ? `Расписание ауд. ${currentEntitySchedule.name} · РГРТУ`
          : `Расписание ${currentEntitySchedule.name} · РГРТУ`);
      await triggerSmartShare(cleanUrl, shareTitle);
    });
  }

  const searchInput = view.querySelector('#sched-view-search');
  const clearBtn = view.querySelector('#sched-view-clear');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      directoryFilterQuery = searchInput.value;
      updateScheduleSidebarListInPlace(view);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      directoryFilterQuery = '';
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      updateScheduleSidebarListInPlace(view);
    });
  }

  attachScheduleSidebarItemListeners(view);

  view.querySelectorAll('[data-room-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.entity-inline-link')) return;
      e.stopPropagation();
      const roomId = el.dataset.roomId;
      if (roomId) {
        navigateToRoom(roomId);
      }
    });
  });

  attachEntityInlineLinks(view);
  attachLessonNoteListeners(view);
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

function isOutdoorNode(node) {
  if (!node) return false;
  return Boolean(
    node.type === 'outdoor' ||
    node.isOutdoor === true ||
    node.outdoor === true ||
    node.building === 'outdoor' ||
    node.floor === 'outdoor' ||
    (typeof node.name === 'string' && /улиц|двор|outdoor/i.test(node.name)) ||
    (typeof node.id === 'string' && /outdoor|street|yard|двор/i.test(node.id))
  );
}

function isOutdoorEdge(edge) {
  if (!edge) return false;
  if (edge.type === 'outdoor' || edge.isOutdoor === true || edge.outdoor === true) return true;
  const fromNode = graph.nodes[edge.from];
  const toNode = graph.nodes[edge.to];
  if (isOutdoorNode(fromNode) || isOutdoorNode(toNode)) return true;
  return false;
}

function dijkstra(startId, endId) {
  if (!graph.nodes[startId] || !graph.nodes[endId]) return null;
  if (startId === endId) return [startId];

  const isAllowed = (id) => {
    const n = graph.nodes[id];
    if (!n) return false;
    if (!routeIncludeOutdoor && isOutdoorNode(n)) {
      if (id !== startId && id !== endId) return false;
    }
    return true;
  };

  const adj = {};
  for (const id of Object.keys(graph.nodes)) {
    if (isAllowed(id)) adj[id] = [];
  }
  for (const e of graph.edges) {
    if (!routeIncludeOutdoor && isOutdoorEdge(e)) continue;
    if (adj[e.from] && adj[e.to]) {
      const weight = Number(e.weight) || 1;
      adj[e.from].push({ to: e.to, weight });
      adj[e.to].push({ to: e.from, weight });
    }
  }

  const dist = {};
  const prev = {};
  const visited = new Set();
  for (const id of Object.keys(adj)) dist[id] = Infinity;
  dist[startId] = 0;

  while (true) {
    let u = null, minD = Infinity;
    for (const id of Object.keys(adj)) {
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
  if (roomSvgCentroids[id]) return roomSvgCentroids[id];
  const shapes = roomShapes[id];
  if (!shapes || !shapes.length) return null;
  const svgEl = currentOverlay ? currentOverlay.getElement() : null;
  const centroid = computeRoomCentroidInSvg(svgEl, shapes);
  if (centroid) {
    roomSvgCentroids[id] = centroid;
  }
  return centroid;
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
  if (roomId === '__GPS__') {
    if (gpsState.snapped && gpsState.snapped.nearestNodeId && graph.nodes[gpsState.snapped.nearestNodeId]) {
      return gpsState.snapped.nearestNodeId;
    }
    if (gpsState.lastSvgPos) {
      return findNearestNode(gpsState.lastSvgPos, gpsState.building || currentBuilding, gpsState.floor ?? currentFloor);
    }
    return null;
  }
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
    if (!routeIncludeOutdoor && isOutdoorNode(node)) continue;
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

  const fromMeta = routeState.fromRoomId === '__GPS__'
    ? { building: gpsState.building || currentBuilding, floor: gpsState.floor ?? currentFloor, isGps: true }
    : roomsMeta[routeState.fromRoomId];
  const toMeta = roomsMeta[routeState.toRoomId];

  if (fromMeta && fromMeta.building === currentBuilding && fromMeta.floor === currentFloor) {
    const startNode = graph.nodes[path[0]];
    if (startNode && startNode.building === currentBuilding && startNode.floor === currentFloor) {
      const centroid = fromMeta.isGps
        ? (gpsState.snapped || gpsState.lastSvgPos)
        : getShapeCentroidSvg(routeState.fromRoomId);
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

  panelMode = 'route';
  routePickSide = routeState.fromRoomId && !routeState.toRoomId ? 'to' : 'from';
  clearSelectedRoom();
  if (panel) panel.classList.add('mobile-compact');
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
  const panel = document.getElementById('panel');
  panelMode = 'route';
  clearSelectedRoom();
  routeState.toRoomId = toRoomId;
  routeState.path = null;
  if (routeLayer) routeLayer.clearLayers();
  routePickSide = routeState.fromRoomId ? 'to' : 'from';
  if (panel) panel.classList.add('mobile-compact');
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
  const panel = document.getElementById('panel');
  panelMode = 'route';
  clearSelectedRoom();
  routeState.fromRoomId = fromRoomId;
  routeState.path = null;
  if (routeLayer) routeLayer.clearLayers();
  routePickSide = 'to';
  if (panel) panel.classList.add('mobile-compact');
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
  const panel = document.getElementById('panel');
  panelMode = 'route';
  clearSelectedRoom();
  routeState.fromRoomId = fromRoomId;
  routeState.toRoomId = toRoomId;
  routeState.path = null;
  if (panel) panel.classList.add('mobile-compact');
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
  const panel = document.getElementById('panel');
  if (panel) panel.classList.remove('mobile-minimized');
  setRoutePoint(routePickSide, id, formatRoomName(meta.name));
  routePickSide = routePickSide === 'from' ? 'to' : 'from';
}

function renderRoutePanel() {
  const panel = document.getElementById('panel');

  const isGpsFrom = routeState.fromRoomId === '__GPS__';
  const fromMeta = (!isGpsFrom && routeState.fromRoomId) ? roomsMeta[routeState.fromRoomId] : null;
  const toMeta = routeState.toRoomId ? roomsMeta[routeState.toRoomId] : null;

  const fromValue = isGpsFrom ? '📍 Моё местоположение (GPS)' : (fromMeta ? formatRoomName(fromMeta.name) : '');
  const toValue = toMeta ? formatRoomName(toMeta.name) : '';

  const shareIconHtml = `<i class="mdi mdi-share share-icon" id="route-share-btn" title="Поделиться ссылкой на маршрут"></i>`;
  const header = `
    <div class="panel-header">
      <button class="close" onclick="closeRoutePanel()" title="Закрыть и сбросить маршрут">✕</button>
      <div class="panel-crumbs">${BUILDINGS[currentBuilding]?.name || ''} · ${currentFloor} этаж</div>
      <h2>Маршрут${shareIconHtml}</h2>
    </div>
  `;

  const fixed = `
    ${header}
    <div class="route-field">
      <label for="route-from">Откуда</label>
      <div class="route-input-wrap">
        <input class="route-input has-clear ${fromValue ? 'filled' : ''}" id="route-from" placeholder="Аудитория, вход или GPS…" value="${escapeHtml(fromValue)}" autocomplete="off">
        <button type="button" class="input-clear-btn ${fromValue ? '' : 'hidden'}" id="route-from-clear" title="Очистить" aria-label="Очистить поле Откуда">
          <i class="mdi mdi-close"></i>
        </button>
        <ul class="route-results" id="route-from-results"></ul>
      </div>
    </div>
    <div class="route-field">
      <label for="route-to">Куда</label>
      <div class="route-input-wrap">
        <input class="route-input has-clear ${toValue ? 'filled' : ''}" id="route-to" placeholder="Аудитория, вход…" value="${escapeHtml(toValue)}" autocomplete="off">
        <button type="button" class="input-clear-btn ${toValue ? '' : 'hidden'}" id="route-to-clear" title="Очистить" aria-label="Очистить поле Куда">
          <i class="mdi mdi-close"></i>
        </button>
        <ul class="route-results" id="route-to-results"></ul>
      </div>
    </div>
    <div class="route-options-row">
      <label class="route-outdoor-toggle" title="Разрешить построение маршрута через уличные переходы">
        <input type="checkbox" id="route-outdoor-check" ${routeIncludeOutdoor ? 'checked' : ''}>
        <span class="route-outdoor-check-ui" aria-hidden="true"><i class="mdi mdi-check"></i></span>
        <span class="route-outdoor-label-text">Также через улицу</span>
      </label>
    </div>
  `;

  const scroll = routeState.path ? renderRouteResult(routeState.path) : '';

  if (panel) {
    panel.classList.toggle('mobile-compact', !routeState.path);
  }
  panel.innerHTML = buildPanelLayout(fixed, scroll);

  setupRouteInput('from');
  setupRouteInput('to');

  const outdoorCheck = panel.querySelector('#route-outdoor-check');
  if (outdoorCheck) {
    outdoorCheck.addEventListener('change', () => {
      routeIncludeOutdoor = outdoorCheck.checked;
      if (routeState.fromRoomId && routeState.toRoomId) {
        onBuildRouteClick();
      }
    });
  }

  const shareRouteBtn = panel.querySelector('#route-share-btn');
  if (shareRouteBtn) {
    shareRouteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cleanUrl = buildCleanShareUrl({
        from: routeState.fromRoomId && routeState.fromRoomId !== '__GPS__' ? routeState.fromRoomId : undefined,
        to: routeState.toRoomId || undefined,
        outdoor: routeIncludeOutdoor ? '1' : undefined
      });
      await triggerSmartShare(cleanUrl, 'Маршрут по корпусу РГРТУ');
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

  applyMobileSheetSnapMeasurement(panel);
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
      refreshRoutePickHighlight();
      renderRoutePanel();
      const nextInput = document.getElementById(inputId);
      if (nextInput) nextInput.focus();
    });
  }

  const renderSuggestionsList = (q) => {
    results.innerHTML = '';
    if (side === 'from' && (!q || 'мое местоположение gps геопозиция'.includes(q.toLowerCase()))) {
      const gpsLi = document.createElement('li');
      gpsLi.innerHTML = `
        <div class="res-name" style="color:#2563eb;font-weight:700"><i class="mdi mdi-crosshairs-gps"></i> Моё местоположение (GPS)</div>
        <div class="res-meta">${gpsState.active && gpsState.snapped ? `Активно · ${gpsState.floor ?? currentFloor} этаж` : 'Включить отслеживание по коридорам'}</div>
      `;
      gpsLi.addEventListener('click', async () => {
        if (!gpsState.active || !gpsState.snapped) {
          await startGpsTracking({ useForRoute: true });
        }
        setRoutePoint('from', '__GPS__', '📍 Моё местоположение (GPS)');
      });
      results.appendChild(gpsLi);
    }

    if (!q) {
      if (results.children.length > 0) results.classList.add('open');
      else results.classList.remove('open');
      return;
    }

    const found = searchRooms(q, 40);
    if (!found.length && results.children.length === 0) {
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
  };

  input.addEventListener('focus', () => {
    routePickSide = side;
    const panel = document.getElementById('panel');
    if (panel) panel.classList.remove('mobile-minimized');
    const labelFrom = document.querySelector('#route-from')?.closest('.route-field')?.querySelector('.label-hint');
    const labelTo = document.querySelector('#route-to')?.closest('.route-field')?.querySelector('.label-hint');
    if (labelFrom) labelFrom.classList.toggle('active', side === 'from');
    if (labelTo) labelTo.classList.toggle('active', side === 'to');
    if (side === 'from' && !input.value.trim()) {
      renderSuggestionsList('');
    }
  });

  input.addEventListener('input', () => {
    syncClearVisibility();
    const q = input.value.trim();
    if (!q) {
      if (side === 'from') routeState.fromRoomId = null;
      else routeState.toRoomId = null;
      routeState.path = null;
      if (routeLayer) routeLayer.clearLayers();
      input.classList.remove('filled');
      refreshRoutePickHighlight();
      renderSuggestionsList('');
      return;
    }
    renderSuggestionsList(q);
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

  refreshRoutePickHighlight();

  // Автоматическое построение маршрута при выборе обеих точек
  if (routeState.fromRoomId && routeState.toRoomId) {
    onBuildRouteClick();
  }
}

async function onBuildRouteClick() {
  const panel = document.getElementById('panel');

  // Сразу очищаем предыдущий маршрут на карте, чтобы он не оставался при ошибке построения нового
  routeState.path = null;
  if (routeLayer) routeLayer.clearLayers();

  if (!routeState.fromRoomId || !routeState.toRoomId) {
    showToast('Выберите обе точки маршрута');
    return;
  }

  const scrollEl = panel.querySelector('.panel-scroll');
  if (scrollEl) scrollEl.innerHTML = '<p class="muted-text">Строим маршрут…</p>';

  const fromNode = await getRoomNode(routeState.fromRoomId);
  const toNode = await getRoomNode(routeState.toRoomId);

  if (!fromNode || !toNode) {
    routeState.path = null;
    if (routeLayer) routeLayer.clearLayers();
    if (scrollEl) {
      scrollEl.innerHTML = `
        <div class="route-warning">Не удалось определить положение выбранных помещений на графе этого этажа (сейчас граф проложен по 0 и 1 этажам Главного корпуса).</div>
      `;
    }
    return;
  }

  const path = dijkstra(fromNode, toNode);

  if (!path) {
    routeState.path = null;
    if (routeLayer) routeLayer.clearLayers();
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

  const isGpsFrom = routeState.fromRoomId === '__GPS__';
  const fromMeta = isGpsFrom ? null : roomsMeta[routeState.fromRoomId];
  const toMeta = roomsMeta[routeState.toRoomId];
  const fromTitle = isGpsFrom ? '📍 Моё местоположение (GPS)' : (fromMeta ? formatRoomName(fromMeta.name) : 'Начальная точка');
  const toTitle = toMeta ? formatRoomName(toMeta.name) : 'Конечная точка';
  const fromFloor = isGpsFrom ? (gpsState.floor ?? currentFloor) : (fromMeta?.floor ?? floorGroups[0]?.[0]?.node?.floor ?? currentFloor);
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
      const dropdown = document.getElementById('user-dropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        closeUserDropdown();
        return;
      }
      const wrap = document.getElementById('search-wrap');
      if (wrap && wrap.classList.contains('open')) {
        closeSearchDropdown();
        if (isInput) e.target.blur();
        return;
      }
      if (scheduleViewOpen) {
        closeScheduleView();
        return;
      }
      if (document.getElementById('panel').classList.contains('open')) {
        if (panelMode === 'room') closeRoomPanel();
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

// ================ ВРАЩЕНИЕ КАРТЫ И УМНАЯ ПОДСКАЗКА ================

function setMapBearing(deg, pivotContainerPt = null) {
  const oldBearing = mapBearingDeg;
  let nextBearing = ((deg % 360) + 360) % 360;
  if (nextBearing > 180) nextBearing -= 360;
  if (Math.abs(nextBearing) < 1.5) nextBearing = 0;

  if (map && nextBearing !== oldBearing) {
    const { W, H } = currentSvgViewBox;
    const cLayer = map.latLngToLayerPoint(L.latLng((H || 1000) / 2, (W || 1000) / 2));
    const size = map.getSize();
    const camContainer = pivotContainerPt || L.point(size.x / 2, size.y / 2);
    const sLayer = map.containerPointToLayerPoint(camContainer);
    const vx = sLayer.x - cLayer.x;
    const vy = sLayer.y - cLayer.y;
    const dRad = ((nextBearing - oldBearing) * Math.PI) / 180;
    const rvx = vx * Math.cos(dRad) - vy * Math.sin(dRad);
    const rvy = vx * Math.sin(dRad) + vy * Math.cos(dRad);
    const shiftX = rvx - vx;
    const shiftY = rvy - vy;
    mapBearingDeg = nextBearing;
    if (Math.abs(shiftX) > 0.05 || Math.abs(shiftY) > 0.05) {
      map.panBy([shiftX, shiftY], { animate: false, noMoveStart: true });
    }
  } else {
    mapBearingDeg = nextBearing;
  }

  syncMapRotationTransform();
  document.documentElement.style.setProperty('--map-counter-rotation', `${-mapBearingDeg}deg`);

  const compassBtn = document.getElementById('map-compass-btn');
  const compassIcon = document.getElementById('map-compass-icon');
  if (compassBtn) {
    compassBtn.classList.toggle('hidden', mapBearingDeg === 0);
  }
  if (compassIcon) {
    compassIcon.style.transform = `rotate(${mapBearingDeg}deg)`;
  }
}

function setupMapRotation() {
  const mapEl = document.getElementById('map');
  const compassBtn = document.getElementById('map-compass-btn');
  if (!mapEl) return;

  if (compassBtn) {
    compassBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMapBearing(0);
    });
  }

  // Десктоп: Ctrl + зажатая кнопка мыши (вращение вокруг центра камеры)
  let ctrlDrag = false;
  let startX = 0;
  let startBearing = 0;
  mapEl.addEventListener('mousedown', (e) => {
    if (!e.ctrlKey) return;
    ctrlDrag = true;
    startX = e.clientX;
    startBearing = mapBearingDeg;
    map.dragging.disable();
  });
  window.addEventListener('mousemove', (e) => {
    if (!ctrlDrag) return;
    const dx = e.clientX - startX;
    const size = map.getSize();
    setMapBearing(startBearing + dx * 0.45, L.point(size.x / 2, size.y / 2));
  });
  window.addEventListener('mouseup', () => {
    if (!ctrlDrag) return;
    ctrlDrag = false;
    map.dragging.enable();
  });

  // Мобильные: поворот двумя пальцами вокруг средней точки между пальцами (камеры)
  let touchStartAngle = null;
  let touchStartBearing = 0;
  mapEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchStartAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      touchStartBearing = mapBearingDeg;
    }
  }, { passive: true });
  mapEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && touchStartAngle !== null) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const delta = angle - touchStartAngle;
      if (Math.abs(delta) > 3) {
        const rect = mapEl.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        setMapBearing(touchStartBearing + delta, L.point(midX, midY));
      }
    }
  }, { passive: true });
  mapEl.addEventListener('touchend', () => {
    touchStartAngle = null;
  });
}

async function updateSmartNextClassPill() {
  const pill = document.getElementById('smart-next-class-pill');
  if (pill) pill.classList.add('hidden');
}

// ================ СООБЩЕСТВО, ЗАМЕТКИ К ПАРАМ, БУФЕТЫ, POI И ГИБРИДНЫЙ GPS ================

const POI_CATEGORY_META = {
  socket: { emoji: '🔌', label: 'Розетка / зарядка' },
  coffee: { emoji: '☕', label: 'Кофемашина / снэки' },
  wifi:   { emoji: '📶', label: 'Точка Wi-Fi' },
  blocked:{ emoji: '🚧', label: 'Перекрытый проход' },
  info:   { emoji: 'ℹ️', label: 'Полезное место' }
};

async function loadCommunityState() {
  try {
    const uid = currentUserId || (typeof ensureUserId === 'function' ? ensureUserId() : '');
    const url = uid ? `/api/community/state?userId=${encodeURIComponent(uid)}` : '/api/community/state';
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;
    communityState.markers = Array.isArray(data.markers) ? data.markers : [];
    communityState.reviews = Array.isArray(data.reviews) ? data.reviews : [];
    communityState.userReviews = Array.isArray(data.userReviews) ? data.userReviews : [];
    if (data.gpsConfig && typeof data.gpsConfig === 'object') {
      communityState.gpsConfig = data.gpsConfig;
    }
    renderCommunityPoiMarkers();
    updatePoiToggleBtnUI();
  } catch (e) {
    console.warn('[community] failed to load state:', e.message);
  }
}

function updatePoiToggleBtnUI() {
  const toggleBtn = document.getElementById('map-toggle-poi-btn');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', poiLayerVisible);
    toggleBtn.title = poiLayerVisible
      ? 'Слой полезных меток включён (нажмите, чтобы скрыть)'
      : 'Слой полезных меток выключен (нажмите, чтобы показать)';
  }
}

function togglePoiLayer(forcedState = null) {
  poiLayerVisible = forcedState !== null ? Boolean(forcedState) : !poiLayerVisible;
  try {
    localStorage.setItem('radikmap_poi_layer', poiLayerVisible ? 'true' : 'false');
  } catch (e) {}
  updatePoiToggleBtnUI();
  renderCommunityPoiMarkers();
  showToast(poiLayerVisible ? 'Слой полезных меток включён' : 'Слой полезных меток скрыт');
}

function renderCommunityPoiMarkers() {
  if (!poiLayer) return;
  poiLayer.clearLayers();
  if (!poiLayerVisible) return;

  const { H } = currentSvgViewBox;
  if (!H) return;

  const markers = (communityState.markers || []).filter(m =>
    m && m.building === currentBuilding && Number(m.floor) === Number(currentFloor)
  );

  markers.forEach(m => {
    const cat = POI_CATEGORY_META[m.category] || POI_CATEGORY_META.info;
    const latlng = L.latLng(H - Number(m.y || 0), Number(m.x || 0));
    const titleText = m.title || cat.label;
    const icon = L.divIcon({
      className: 'poi-marker-wrap',
      html: `<div class="poi-marker-badge" data-cat="${escapeHtml(m.category || 'info')}" title="${escapeHtml(titleText)}">${cat.emoji}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    const marker = L.marker(latlng, { pane: 'poiPane', icon });
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      showToast(`${cat.emoji} ${titleText}${m.description ? ' — ' + m.description : ''}`);
    });
    marker.addTo(poiLayer);
  });
}

function openCommunityModal(titleHtml, bodyHtml, onReady) {
  const backdrop = document.getElementById('community-modal-backdrop');
  if (!backdrop) return;
  let titleEl = document.getElementById('community-modal-title');
  let bodyEl = document.getElementById('community-modal-body');
  if (!titleEl || !bodyEl) {
    backdrop.innerHTML = `
      <div class="cheatsheet-modal-card community-modal-card">
        <div class="cheatsheet-modal-header">
          <div class="cheatsheet-modal-title" id="community-modal-title"></div>
          <div class="cheatsheet-modal-header-actions">
            <button type="button" class="cheatsheet-modal-close" id="community-modal-close" aria-label="Закрыть">✕</button>
          </div>
        </div>
        <div class="cheatsheet-modal-body community-modal-body" id="community-modal-body"></div>
      </div>
    `;
    titleEl = document.getElementById('community-modal-title');
    bodyEl = document.getElementById('community-modal-body');
  }
  titleEl.innerHTML = titleHtml;
  bodyEl.innerHTML = bodyHtml;
  backdrop.classList.remove('hidden');

  const close = () => backdrop.classList.add('hidden');
  const closeBtn = document.getElementById('community-modal-close');
  if (closeBtn) closeBtn.onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
  if (typeof onReady === 'function') onReady(bodyEl, close);
}

function requireTelegramAuthPrompt(featureName = 'этой функции') {
  if (userProfile.telegramLinked && currentUserId) return true;
  showToast(`Войдите через Telegram в профиле (справа сверху) для использования ${featureName}`);
  const btn = document.getElementById('user-menu-btn');
  if (btn) btn.click();
  return false;
}

function openLessonNoteModal(noteKey, noteLabel) {
  if (!requireTelegramAuthPrompt('личных заметок к парам')) return;
  const rawVal = userProfile.lessonNotes && userProfile.lessonNotes[noteKey];
  const currentText = rawVal ? (typeof rawVal === 'object' ? String(rawVal.text || '') : String(rawVal)) : '';
  openCommunityModal(
    `<i class="mdi mdi-note-edit-outline"></i><span>Личная заметка к паре</span>`,
    `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${escapeHtml(noteLabel)}</div>
      <div class="community-form-field">
        <label class="community-form-label">Текст заметки (виден только вам)</label>
        <textarea class="community-textarea" id="lesson-note-textarea" maxlength="400" placeholder="Например: Сдать лабу №3, принести зачётку, ссылка на задание…">${escapeHtml(currentText)}</textarea>
      </div>
      <div class="community-modal-actions">
        ${currentText ? `<button type="button" class="community-btn danger" id="lesson-note-delete-btn">Удалить</button>` : ''}
        <button type="button" class="community-btn" id="lesson-note-cancel-btn">Отмена</button>
        <button type="button" class="community-btn primary" id="lesson-note-save-btn">Сохранить</button>
      </div>
    `,
    (bodyEl, close) => {
      const ta = bodyEl.querySelector('#lesson-note-textarea');
      if (ta) setTimeout(() => ta.focus(), 40);

      const saveNote = async (textVal) => {
        try {
          const res = await fetch('/api/user/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUserId,
              lessonKey: noteKey,
              noteKey,
              noteText: textVal,
              text: textVal
            })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            showToast(data.error || 'Не удалось сохранить заметку');
            return;
          }
          userProfile.lessonNotes = data.lessonNotes || {};
          saveUserProfileLocalCache();
          close();
          if (scheduleViewOpen) renderScheduleWorkspace();
          if (panelMode === 'room' && currentRoomPanelId) {
            const rid = currentRoomPanelId;
            currentRoomPanelId = null;
            onRoomClick(rid, { pushHistory: false });
          }
          showToast(textVal ? 'Заметка сохранена' : 'Заметка удалена');
        } catch (e) {
          showToast('Ошибка сохранения заметки');
        }
      };

      bodyEl.querySelector('#lesson-note-cancel-btn')?.addEventListener('click', close);
      bodyEl.querySelector('#lesson-note-delete-btn')?.addEventListener('click', () => saveNote(''));
      bodyEl.querySelector('#lesson-note-save-btn')?.addEventListener('click', () => {
        saveNote(ta ? ta.value.trim() : '');
      });
    }
  );
}

function attachLessonNoteListeners(container) {
  if (!container) return;
  container.querySelectorAll('[data-note-key]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = el.dataset.noteKey;
      const label = el.dataset.noteLabel || '';
      if (key) openLessonNoteModal(key, label);
    });
  });
}

function openBuffetReviewModal(roomId) {
  if (!requireTelegramAuthPrompt('оценки буфетов и столовых')) return;
  const meta = roomsMeta[roomId];
  const roomName = formatRoomName(meta?.name || roomId);

  // Ищем существующий отзыв пользователя к этому буфету
  const existingReview = (communityState.userReviews || []).find(r => r && r.roomId === roomId) ||
    (communityState.reviews || []).find(r => r && r.roomId === roomId && r.authorId === currentUserId);

  const initialRating = existingReview ? (Number(existingReview.rating) || 5) : 5;
  const initialText = existingReview ? (existingReview.text || '') : '';
  const isEditing = Boolean(existingReview);

  openCommunityModal(
    `<i class="mdi ${isEditing ? 'mdi-comment-edit-outline' : 'mdi-star-outline'}"></i><span>${isEditing ? 'Редактировать отзыв' : 'Оценить'}: ${escapeHtml(roomName)}</span>`,
    `
      ${isEditing ? `<div style="font-size:12px;color:var(--text-accent);margin-bottom:8px;font-weight:600">Вы уже оставляли отзыв. Здесь вы можете изменить оценку и текст.</div>` : ''}
      <div class="community-form-field">
        <label class="community-form-label">Ваша оценка</label>
        <div class="star-picker-row" id="review-star-picker" role="radiogroup" aria-label="Оценка">
          ${[1, 2, 3, 4, 5].map(n => `
            <button type="button" class="star-picker-btn ${n <= initialRating ? 'active' : ''}" data-star="${n}" title="${n} из 5" aria-label="${n} звёзд">
              <svg viewBox="0 0 24 24" class="star-picker-svg">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="community-form-field">
        <label class="community-form-label">Отзыв (меню, цены, очереди)</label>
        <textarea class="community-textarea" id="review-text-input" maxlength="500" placeholder="Поделитесь впечатлением о буфете или столовой…">${escapeHtml(initialText)}</textarea>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted)">Отзыв появится в карточке буфета после быстрой проверки модератором.</div>
      <div class="community-modal-actions">
        <button type="button" class="community-btn" id="review-cancel-btn">Отмена</button>
        <button type="button" class="community-btn primary" id="review-submit-btn">${isEditing ? 'Сохранить изменения' : 'Отправить'}</button>
      </div>
    `,
    (bodyEl, close) => {
      let rating = initialRating;
      const starBtns = bodyEl.querySelectorAll('[data-star]');
      const updateStarDisplay = (val) => {
        starBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.star) <= val));
      };
      starBtns.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
          updateStarDisplay(Number(btn.dataset.star) || 5);
        });
        btn.addEventListener('mouseleave', () => {
          updateStarDisplay(rating);
        });
        btn.addEventListener('click', () => {
          rating = Number(btn.dataset.star) || 5;
          updateStarDisplay(rating);
        });
      });
      bodyEl.querySelector('#review-cancel-btn')?.addEventListener('click', close);
      bodyEl.querySelector('#review-submit-btn')?.addEventListener('click', async () => {
        const text = bodyEl.querySelector('#review-text-input')?.value.trim() || '';
        try {
          const res = await fetch('/api/community/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, roomId, rating, text })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            showToast(data.error || 'Не удалось сохранить отзыв');
            return;
          }
          if (data.review) {
            // Обновляем локальный список отзывов пользователя
            if (!Array.isArray(communityState.userReviews)) communityState.userReviews = [];
            const idx = communityState.userReviews.findIndex(r => r && r.roomId === roomId);
            if (idx !== -1) {
              communityState.userReviews[idx] = data.review;
            } else {
              communityState.userReviews.unshift(data.review);
            }
          }
          close();
          // Перезагружаем карточку помещения, чтобы отобразить обновлённый статус
          if (panelMode === 'room' && currentRoomPanelId === roomId) {
            currentRoomPanelId = null;
            onRoomClick(roomId, { pushHistory: false });
          }
          showToast(isEditing ? 'Отзыв обновлён!' : 'Спасибо! Отзыв отправлен на модерацию');
        } catch (e) {
          showToast('Ошибка отправки отзыва');
        }
      });
    }
  );
}

function openRoomDescriptionSuggestModal(roomId) {
  if (!requireTelegramAuthPrompt('предложения описаний кабинетов')) return;
  const meta = roomsMeta[roomId];
  const roomName = formatRoomName(meta?.name || roomId);
  openCommunityModal(
    `<i class="mdi mdi-pencil-plus-outline"></i><span>Описание: ${escapeHtml(roomName)}</span>`,
    `
      <div class="community-form-field">
        <label class="community-form-label">Предложите описание или ориентир для кабинета</label>
        <textarea class="community-textarea" id="desc-suggest-input" maxlength="600" placeholder="Например: Кафедра ЭВМ, вход через 336а, есть проектор и розетки у окна…">${escapeHtml(meta?.description || '')}</textarea>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted)">После проверки в админ-панели описание обновится на карте для всех студентов.</div>
      <div class="community-modal-actions">
        <button type="button" class="community-btn" id="desc-cancel-btn">Отмена</button>
        <button type="button" class="community-btn primary" id="desc-submit-btn">Отправить</button>
      </div>
    `,
    (bodyEl, close) => {
      bodyEl.querySelector('#desc-cancel-btn')?.addEventListener('click', close);
      bodyEl.querySelector('#desc-submit-btn')?.addEventListener('click', async () => {
        const description = bodyEl.querySelector('#desc-suggest-input')?.value.trim() || '';
        if (!description) {
          showToast('Введите текст описания');
          return;
        }
        try {
          const res = await fetch('/api/community/description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, roomId, description })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            showToast(data.error || 'Не удалось отправить предложение');
            return;
          }
          close();
          showToast('Описание отправлено на модерацию!');
        } catch (e) {
          showToast('Ошибка соединения с сервером');
        }
      });
    }
  );
}

function openAddPoiMarkerModal(svgX, svgY) {
  if (!requireTelegramAuthPrompt('добавления меток на карту')) return;
  openCommunityModal(
    `<i class="mdi mdi-map-marker-plus-outline"></i><span>Предложить метку на карте</span>`,
    `
      <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(BUILDINGS[currentBuilding]?.name || '')} · ${currentFloor} этаж (коорд. ${Math.round(svgX)}, ${Math.round(svgY)})</div>
      <div class="community-form-field">
        <label class="community-form-label">Категория метки</label>
        <select class="community-select" id="poi-category-select">
          <option value="socket">🔌 Розетка / зарядка</option>
          <option value="coffee">☕ Кофемашина / автомат с едой</option>
          <option value="wifi">📶 Точка Wi-Fi</option>
          <option value="blocked">🚧 Перекрытый проход</option>
          <option value="info">ℹ️ Полезное место / ориентир</option>
        </select>
      </div>
      <div class="community-form-field">
        <label class="community-form-label">Короткое название</label>
        <input type="text" class="community-input" id="poi-title-input" maxlength="60" placeholder="Например: Розетки у лавочки">
      </div>
      <div class="community-form-field">
        <label class="community-form-label">Подробности (необязательно)</label>
        <input type="text" class="community-input" id="poi-desc-input" maxlength="200" placeholder="Например: Работают 4 розетки 220В">
      </div>
      <div style="font-size:11.5px;color:var(--text-muted)">После одобрения в админке метка появится на карте этажа.</div>
      <div class="community-modal-actions">
        <button type="button" class="community-btn" id="poi-cancel-btn">Отмена</button>
        <button type="button" class="community-btn primary" id="poi-submit-btn">Отправить</button>
      </div>
    `,
    (bodyEl, close) => {
      bodyEl.querySelector('#poi-cancel-btn')?.addEventListener('click', close);
      bodyEl.querySelector('#poi-submit-btn')?.addEventListener('click', async () => {
        const category = bodyEl.querySelector('#poi-category-select')?.value || 'socket';
        const catMeta = POI_CATEGORY_META[category] || POI_CATEGORY_META.info;
        const title = bodyEl.querySelector('#poi-title-input')?.value.trim() || catMeta.label;
        const description = bodyEl.querySelector('#poi-desc-input')?.value.trim() || '';
        try {
          const res = await fetch('/api/community/marker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUserId,
              building: currentBuilding,
              floor: currentFloor,
              x: Math.round(svgX),
              y: Math.round(svgY),
              category,
              title,
              description
            })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            showToast(data.error || 'Не удалось отправить метку');
            return;
          }
          close();
          showToast('Метка отправлена на модерацию!');
        } catch (e) {
          showToast('Ошибка отправки метки');
        }
      });
    }
  );
}

// ================ ГИБРИДНЫЙ GPS + WI-FI / BLE FUSION + MAP-MATCHING ПО КОРИДОРАМ ================

function projectLatLonToSvgFloor(lat, lon, building = currentBuilding) {
  const cfg = communityState.gpsConfig || {};
  const bCfg = (cfg.buildings && cfg.buildings[building]) || {
    centerLat: 54.61435,
    centerLon: 39.70825,
    rotationDeg: -18,
    scaleMetersPerSvgUnit: 0.10,
    anchors: []
  };

  const anchors = Array.isArray(bCfg.anchors) ? bCfg.anchors.filter(a => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon))) : [];
  if (anchors.length >= 2) {
    // Используем ближайшие калибровочные опорные точки (реперы) для точной локальной интерполяции
    let bestA = anchors[0];
    let minD = Infinity;
    for (const a of anchors) {
      const d = Math.hypot((a.lat - lat) * 111320, (a.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180));
      if (d < minD) {
        minD = d;
        bestA = a;
      }
    }
    const latRef = Number(bestA.lat);
    const lonRef = Number(bestA.lon);
    const eastM = (lon - lonRef) * 111320 * Math.cos((latRef * Math.PI) / 180);
    const northM = (lat - latRef) * 111320;
    const rotRad = ((Number(bCfg.rotationDeg) || 0) * Math.PI) / 180;
    const localX = eastM * Math.cos(rotRad) - northM * Math.sin(rotRad);
    const localY = -(eastM * Math.sin(rotRad) + northM * Math.cos(rotRad));
    const scale = Math.max(0.01, Number(bCfg.scaleMetersPerSvgUnit) || 0.10);
    return {
      x: Number(bestA.x || 0) + localX / scale,
      y: Number(bestA.y || 0) + localY / scale
    };
  }

  const { W, H } = currentSvgViewBox;
  const latRef = Number(bCfg.centerLat) || 54.61435;
  const lonRef = Number(bCfg.centerLon) || 39.70825;
  const eastM = (lon - lonRef) * 111320 * Math.cos((latRef * Math.PI) / 180);
  const northM = (lat - latRef) * 111320;
  const rotRad = ((Number(bCfg.rotationDeg) || 0) * Math.PI) / 180;
  const localX = eastM * Math.cos(rotRad) - northM * Math.sin(rotRad);
  const localY = -(eastM * Math.sin(rotRad) + northM * Math.cos(rotRad));
  const scale = Math.max(0.01, Number(bCfg.scaleMetersPerSvgUnit) || 0.10);
  return {
    x: (W || 1200) / 2 + localX / scale,
    y: (H || 800) / 2 + localY / scale
  };
}

function snapSvgPointToCorridor(rawPt, building = currentBuilding, floor = currentFloor) {
  const nodes = graph.nodes || {};
  const edges = graph.edges || [];
  let bestX = rawPt.x;
  let bestY = rawPt.y;
  let bestDist = Infinity;
  let nearestNodeId = null;

  for (const [id, n] of Object.entries(nodes)) {
    if (n.building !== building || Number(n.floor) !== Number(floor)) continue;
    const d = Math.hypot(n.x - rawPt.x, n.y - rawPt.y);
    if (d < bestDist) {
      bestDist = d;
      bestX = n.x;
      bestY = n.y;
      nearestNodeId = id;
    }
  }

  for (const e of edges) {
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (!a || !b) continue;
    if (a.building !== building || b.building !== building) continue;
    if (Number(a.floor) !== Number(floor) || Number(b.floor) !== Number(floor)) continue;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    let t = 0;
    if (lenSq > 0) {
      t = ((rawPt.x - a.x) * abx + (rawPt.y - a.y) * aby) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const px = a.x + t * abx;
    const py = a.y + t * aby;
    const d = Math.hypot(rawPt.x - px, rawPt.y - py);
    if (d < bestDist) {
      bestDist = d;
      bestX = px;
      bestY = py;
      nearestNodeId = t < 0.5 ? e.from : e.to;
    }
  }

  return { x: bestX, y: bestY, nearestNodeId, distance: bestDist };
}

function updateGpsPositionFromSvg(svgPt, accuracyMeters = 12, sourceLabel = 'GPS + Wi-Fi/BLE') {
  gpsState.building = currentBuilding;
  gpsState.floor = currentFloor;
  gpsState.accuracy = accuracyMeters;

  // Экспоненциальное сглаживание скачков сигнала внутри здания
  if (gpsState.lastSvgPos) {
    svgPt = {
      x: gpsState.lastSvgPos.x * 0.35 + svgPt.x * 0.65,
      y: gpsState.lastSvgPos.y * 0.35 + svgPt.y * 0.65
    };
  }
  gpsState.lastSvgPos = svgPt;
  gpsState.snapped = snapSvgPointToCorridor(svgPt, currentBuilding, currentFloor);

  const banner = document.getElementById('map-gps-banner');
  const bannerText = document.getElementById('map-gps-banner-text');
  if (banner && bannerText && gpsState.active) {
    banner.classList.remove('hidden');
    const nearNode = gpsState.snapped?.nearestNodeId ? graph.nodes[gpsState.snapped.nearestNodeId] : null;
    const accStr = accuracyMeters ? `±${Math.round(accuracyMeters)} м` : '';
    bannerText.textContent = `${sourceLabel} ${accStr} · привязка к коридору ${currentFloor} эт.${nearNode ? '' : ''}`.trim();
  }

  renderGpsPositionOnMap();

  if (routeState.fromRoomId === '__GPS__' && routeState.toRoomId) {
    onBuildRouteClick();
  }
}

function renderGpsPositionOnMap() {
  if (!gpsLayer) return;
  gpsLayer.clearLayers();
  if (!gpsState.active || !gpsState.snapped) return;
  if (gpsState.building !== currentBuilding || Number(gpsState.floor) !== Number(currentFloor)) return;

  const { H } = currentSvgViewBox;
  if (!H) return;

  const pt = gpsState.snapped;
  const latlng = L.latLng(H - pt.y, pt.x);
  const icon = L.divIcon({
    className: 'gps-user-dot-wrap',
    html: `<div class="gps-user-pulse"></div><div class="gps-user-dot"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
  L.marker(latlng, { pane: 'gpsPane', icon, interactive: false }).addTo(gpsLayer);
}

async function startGpsTracking({ useForRoute = false } = {}) {
  const gpsBtn = document.getElementById('map-gps-btn');
  const banner = document.getElementById('map-gps-banner');
  const bannerText = document.getElementById('map-gps-banner-text');

  gpsState.active = true;
  if (gpsBtn) gpsBtn.classList.add('active');
  if (banner) banner.classList.remove('hidden');
  if (bannerText) {
    bannerText.textContent = 'Поиск сигнала (включите Wi-Fi и Bluetooth для точности внутри корпуса)…';
  }

  // Подключаем компас и шагомер (PDR Dead Reckoning) для плавного смещения по коридору при слабом спутниковом сигнале
  if (!gpsState.orientationHandler && typeof window.DeviceOrientationEvent !== 'undefined') {
    gpsState.orientationHandler = (ev) => {
      const heading = ev.webkitCompassHeading ?? (ev.alpha != null ? (360 - ev.alpha) % 360 : null);
      if (heading != null && Number.isFinite(heading)) {
        gpsState.headingDeg = heading;
      }
    };
    window.addEventListener('deviceorientation', gpsState.orientationHandler, true);
  }

  if (!gpsState.motionHandler && typeof window.DeviceMotionEvent !== 'undefined') {
    let lastStepTs = 0;
    gpsState.motionHandler = (ev) => {
      if (!gpsState.active || !gpsState.lastSvgPos) return;
      const acc = ev.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
      const now = Date.now();
      if (mag > 12.6 && now - lastStepTs > 460) {
        lastStepTs = now;
        const bCfg = communityState.gpsConfig?.buildings?.[currentBuilding] || {};
        const rotDeg = Number(bCfg.rotationDeg) || -18;
        const angleRad = (((gpsState.headingDeg - rotDeg) || 0) * Math.PI) / 180;
        const stepSvgUnits = 6.5; // ~0.65 м шаг
        const nextPt = {
          x: gpsState.lastSvgPos.x + Math.sin(angleRad) * stepSvgUnits,
          y: gpsState.lastSvgPos.y - Math.cos(angleRad) * stepSvgUnits
        };
        updateGpsPositionFromSvg(nextPt, gpsState.accuracy || 10, 'Инерциальный шаг + коридор');
      }
    };
    window.addEventListener('devicemotion', gpsState.motionHandler, true);
  }

  if ('geolocation' in navigator) {
    if (gpsState.watchId != null) {
      navigator.geolocation.clearWatch(gpsState.watchId);
    }
    gpsState.outOfBoundsNotified = false;
    gpsState.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const svgPt = projectLatLonToSvgFloor(latitude, longitude, currentBuilding);
        const { W, H } = currentSvgViewBox;
        // Проверяем, попадают ли координаты в пределы плана вуза
        const inBounds = svgPt.x >= -250 && svgPt.x <= (W || 1500) + 250 && svgPt.y >= -250 && svgPt.y <= (H || 1200) + 250;
        if (inBounds) {
          gpsState.outOfBoundsNotified = false;
          updateGpsPositionFromSvg(svgPt, accuracy, 'GPS + Wi-Fi/BLE');
        } else {
          // Если координаты вне плана РГРТУ — показываем уведомление и статус в плашке
          if (!gpsState.outOfBoundsNotified) {
            gpsState.outOfBoundsNotified = true;
            showToast('Вы не на территории РГРТУ');
          }
          const fallbackPt = gpsState.lastSvgPos || { x: (W || 1000) / 2, y: (H || 800) / 2 };
          updateGpsPositionFromSvg(fallbackPt, accuracy, 'Вы не на территории РГРТУ (нажмите «Уточнить»)');
        }
      },
      () => {
        const { W, H } = currentSvgViewBox;
        const fallbackPt = gpsState.lastSvgPos || { x: (W || 1000) / 2, y: (H || 800) / 2 };
        updateGpsPositionFromSvg(fallbackPt, 15, 'Ручной режим по коридорам');
        showToast('Спутниковый сигнал слабый — нажмите «Уточнить» и укажите точку на коридоре');
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 8000 }
    );
  } else {
    const { W, H } = currentSvgViewBox;
    updateGpsPositionFromSvg({ x: (W || 1000) / 2, y: (H || 800) / 2 }, 15, 'Ориентир по коридору');
  }

  if (useForRoute) {
    const { W, H } = currentSvgViewBox;
    if (!gpsState.snapped) {
      updateGpsPositionFromSvg({ x: (W || 1000) / 2, y: (H || 800) / 2 }, 12, 'Старт по коридору');
    }
  }
}

function stopGpsTracking() {
  gpsState.active = false;
  gpsState.calibratingClick = false;
  if (gpsState.watchId != null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(gpsState.watchId);
    gpsState.watchId = null;
  }
  const gpsBtn = document.getElementById('map-gps-btn');
  const banner = document.getElementById('map-gps-banner');
  if (gpsBtn) gpsBtn.classList.remove('active', 'calibrating');
  if (banner) banner.classList.add('hidden');
  if (gpsLayer) gpsLayer.clearLayers();
}

function setupHybridGpsTracking() {
  const togglePoiBtn = document.getElementById('map-toggle-poi-btn');
  const gpsBtn = document.getElementById('map-gps-btn');
  const refineBtn = document.getElementById('map-gps-refine-btn');
  const closeBtn = document.getElementById('map-gps-close-btn');
  const addPoiBtn = document.getElementById('map-add-poi-btn');

  updatePoiToggleBtnUI();

  if (togglePoiBtn) {
    togglePoiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePoiLayer();
    });
  }

  function centerMapOnUserPosition() {
    if (!gpsState.snapped || !map) return;
    const { H } = currentSvgViewBox;
    if (!H) return;
    const pt = gpsState.snapped;
    const targetLatLng = L.latLng(H - pt.y, pt.x);
    if (gpsState.building && gpsState.building !== currentBuilding) {
      currentBuilding = gpsState.building;
    }
    if (gpsState.floor != null && Number(gpsState.floor) !== Number(currentFloor)) {
      showFloor(currentBuilding, Number(gpsState.floor));
    }
    const currentZoom = map.getZoom();
    const targetZoom = Math.max(currentZoom, 1);
    map.flyTo(targetLatLng, targetZoom, {
      animate: true,
      duration: 0.85,
      easeLinearity: 0.25
    });
  }

  if (gpsBtn) {
    gpsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (gpsState.active) {
        if (gpsState.snapped) {
          centerMapOnUserPosition();
          showToast('Перемещение к вашему местоположению');
        } else {
          showToast('Определяем координаты...');
        }
      } else {
        startGpsTracking();
        showToast('Включите Wi-Fi и Bluetooth на телефоне — браузер использует их для точной привязки к коридорам');
      }
    });
  }

  if (refineBtn) {
    refineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      gpsState.calibratingClick = true;
      if (gpsBtn) gpsBtn.classList.add('calibrating');
      showToast('Коснитесь коридора на карте, где вы сейчас находитесь');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopGpsTracking();
    });
  }

  if (addPoiBtn) {
    addPoiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireTelegramAuthPrompt('добавления полезных меток на карту')) return;
      addingPoiMode = !addingPoiMode;
      addPoiBtn.classList.toggle('active', addingPoiMode);
      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.style.cursor = addingPoiMode ? 'crosshair' : '';
      if (addingPoiMode) {
        showToast('Нажмите на место на карте этажа, чтобы поставить метку (розетка, кофе, Wi-Fi)');
      } else {
        showToast('Режим добавления метки отменён');
      }
    });
  }

  map.on('click', (e) => {
    const { H } = currentSvgViewBox;
    if (!H || !e.latlng) return;
    const svgX = e.latlng.lng;
    const svgY = H - e.latlng.lat;

    if (addingPoiMode) {
      addingPoiMode = false;
      if (addPoiBtn) addPoiBtn.classList.remove('active');
      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.style.cursor = '';
      openAddPoiMarkerModal(svgX, svgY);
      return;
    }

    if (gpsState.active && gpsState.calibratingClick) {
      gpsState.calibratingClick = false;
      if (gpsBtn) gpsBtn.classList.remove('calibrating');
      gpsState.lastSvgPos = null;
      updateGpsPositionFromSvg({ x: svgX, y: svgY }, 3, 'Точка уточнена вручную');
      showToast('Местоположение привязано к выбранному коридору');
    }
  });
}

// ================ СТАРТ ================

(async function init() {
  initTelegram();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Сразу добавляем переключатель этажей на карту и инициализируем базовый UI без ожидания фоновых API
  createFloorSwitcher().addTo(map);
  updateFloorSwitcher();
  setupSearch();
  setupUserProfileAndTheme();
  setupPanelHandle();
  setupMobilePanelSheet();
  setupMapRotation();
  setupHybridGpsTracking();
  setupHotkeys();

  // Глобальный делегированный обработчик клика по кнопке/плашке заметки к паре
  document.addEventListener('click', (e) => {
    const noteEl = e.target.closest('[data-note-key]');
    if (noteEl) {
      e.preventDefault();
      e.stopPropagation();
      const key = noteEl.dataset.noteKey;
      const label = noteEl.dataset.noteLabel || '';
      if (key) openLessonNoteModal(key, label);
      return;
    }

    if (scheduleWeekDropdownOpen && !e.target.closest('#schedule-week-trigger') && !e.target.closest('#schedule-week-dropdown')) {
      scheduleWeekDropdownOpen = false;
      const dd = document.getElementById('schedule-week-dropdown');
      const tr = document.getElementById('schedule-week-trigger');
      if (dd) dd.classList.add('hidden');
      if (tr) tr.classList.remove('open');
    }
    if (roomWeekDropdownOpen && !e.target.closest('#room-week-trigger') && !e.target.closest('#room-week-dropdown')) {
      roomWeekDropdownOpen = false;
      const dd = document.getElementById('room-week-dropdown');
      const tr = document.getElementById('room-week-trigger');
      if (dd) dd.classList.add('hidden');
      if (tr) tr.classList.remove('open');
    }
  });

  const cornerTab = document.getElementById('schedule-corner-tab');
  if (cornerTab) {
    cornerTab.addEventListener('click', () => {
      if (scheduleViewOpen) {
        closeScheduleView();
      } else {
        openScheduleDirectory();
      }
    });
  }

  try {
    roomsMeta = await fetch('data/rooms.json').then(r => r.json());
  } catch (e) {
    console.warn('[init] Не удалось загрузить rooms.json:', e.message);
    roomsMeta = {};
  }

  await loadGraph().catch(() => {});

  // Фоновая загрузка справочника расписания и меток сообщества (не блокирует показ карты и переключателя этажей)
  const dirPromise = loadScheduleDirectory().catch(() => {});
  loadCommunityState().catch(() => {});

  syncModeUI();
  updateSmartNextClassPill();

  const params = new URLSearchParams(location.search);
  const viewParam = params.get('view');
  const entityTypeParam = params.get('type');
  const entityNameParam = params.get('name');
  const roomId = params.get('room');
  const buildingParam = params.get('building');
  const floorParam = params.get('floor');
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const outdoorParam = params.get('outdoor');

  if (outdoorParam === '1') routeIncludeOutdoor = true;

  if (fromParam && toParam && roomsMeta[fromParam] && roomsMeta[toParam]) {
    await showFloor(roomsMeta[fromParam].building || 'C', roomsMeta[fromParam].floor ?? 1);
    await executeRouteBetween(fromParam, toParam);
  } else if (roomId && roomsMeta[roomId]) {
    isPoppingState = true;
    await navigateToRoom(roomId);
    isPoppingState = false;
  } else {
    const startBld = (buildingParam && BUILDINGS[buildingParam]) ? buildingParam : 'C';
    const startFlr = (floorParam !== null && BUILDINGS[startBld]?.floors?.[Number(floorParam)])
      ? Number(floorParam)
      : 1;
    await showFloor(startBld, startFlr);
    if (viewParam === 'schedule') {
      await dirPromise;
      if (entityTypeParam && entityNameParam) {
        await openEntitySchedule(entityTypeParam, entityNameParam);
      } else {
        await openScheduleDirectory();
      }
    }
  }
})();