// ================ КОНФИГ ================

const BUILDINGS = {
  C: {
    name: 'Основной',
    floors: {
      0: 'data/floor0.svg',
      1: 'data/floor1.svg'
    }
  },
  L: { name: 'Лабораторный', floors: {} },
  B: { name: 'БИ',           floors: {} },
  F: { name: 'ВУЦ',          floors: {} }
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

// ================ СОСТОЯНИЕ ================

let currentBuilding = 'C';
let currentFloor = 1;
let currentOverlay = null;
let currentLabels = null;
let labelTimer = null;
let roomsMeta = {};
let roomShapes = {};
let pendingHighlight = null;
let selectedRoomId = null;      // id выбранной аудитории (для пульсации)
let selectedShapes = [];         // ссылки на SVG-элементы выбранной аудитории

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

// ================ ПАНЕЛЬ: ОТКРЫТЬ / ЗАКРЫТЬ ================

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
}

function closePanel() {
  document.getElementById('panel').classList.remove('open');
  clearSelectedRoom();
  updateURL(null);
  smoothInvalidateSize(260);
}

// ================ ВЫДЕЛЕНИЕ ВЫБРАННОЙ АУДИТОРИИ ================

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

// ================ ОБНОВЛЕНИЕ URL ================

function updateURL(id) {
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
  history.replaceState(null, '', url);
}

// ================ UI: ЗДАНИЯ ================

let closeDropdownTimer = null;

function scheduleCloseDropdown() {
  clearTimeout(closeDropdownTimer);
  closeDropdownTimer = setTimeout(() => closeFloorsDropdown(), 200);
}

function cancelCloseDropdown() {
  clearTimeout(closeDropdownTimer);
}

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

    tab.addEventListener('mouseenter', () => {
      cancelCloseDropdown();
      onTabHover(code);
    });
    tab.addEventListener('mouseleave', () => {
      scheduleCloseDropdown();
    });

    tabs.appendChild(tab);
  });

  const underline = document.createElement('div');
  underline.className = 'tab-underline';
  tabs.appendChild(underline);

  container.appendChild(tabs);

  // Dropdown этажей
  const dropdown = document.createElement('div');
  dropdown.className = 'floors-dropdown';
  dropdown.id = 'floors-dropdown';
  dropdown.addEventListener('mouseenter', cancelCloseDropdown);
  dropdown.addEventListener('mouseleave', scheduleCloseDropdown);
  container.appendChild(dropdown);

  // Первичное положение подчёркивания — без анимации
  requestAnimationFrame(() => {
    updateTabActive();
    requestAnimationFrame(() => {
      underline.style.transition = '';
    });
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closeFloorsDropdown();
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
  const b = BUILDINGS[code];
  if (!b) return;

  const floors = Object.keys(b.floors).map(Number).sort((a, b) => a - b);

  // Если у корпуса нет этажей — не переключаем, показываем сообщение
  if (floors.length === 0) {
    showFloorsDropdown(code, []);
    return;
  }

  // Уже на этом корпусе — ничего не делаем
  if (code === currentBuilding) {
    return;
  }

  // Переключаем корпус
  currentBuilding = code;
  updateTabActive();
  showFloor(code, floors[0]);
  showFloorsDropdown(code, floors);
}

function onTabHover(code) {
  const b = BUILDINGS[code];
  if (!b) return;
  const floors = Object.keys(b.floors).map(Number).sort((a, b) => a - b);
  showFloorsDropdown(code, floors);
}

function showFloorsDropdown(code, floors) {
  const dd = document.getElementById('floors-dropdown');
  const container = document.getElementById('buildings');
  const tab = document.querySelector(`.tab[data-code="${code}"]`);

  // Позиционируем dropdown под нужной вкладкой
  if (tab) {
    const tabRect = tab.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    dd.style.left = (tabRect.left - containerRect.left) + 'px';
  }

  dd.innerHTML = '';
  if (floors.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'floor-item disabled';
    empty.textContent = 'этажи ещё не добавлены';
    dd.appendChild(empty);
  } else {
    floors.forEach(f => {
      const item = document.createElement('button');
      item.className = 'floor-item';
      item.textContent = `${f} этаж`;
      if (code === currentBuilding && f === currentFloor) item.classList.add('active');
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        currentBuilding = code;
        updateTabActive();
        showFloor(code, f);
        // Dropdown оставляем открытым, пока курсор над ним
      });
      dd.appendChild(item);
    });
  }

  dd.classList.add('open');
}

function closeFloorsDropdown() {
  const dd = document.getElementById('floors-dropdown');
  if (dd) dd.classList.remove('open');
}

// ================ ПОИСК ================

function setupSearch() {
  const wrap    = document.querySelector('.search-wrap');
  const toggle  = document.getElementById('search-toggle');
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  let savedValue = '';

  function renderResults() {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) return;

    const found = [];
    for (const [id, meta] of Object.entries(roomsMeta)) {
      const haystack = (meta.name + ' ' + id).toLowerCase();
      if (haystack.includes(q)) found.push({ id, meta });
      if (found.length >= 20) break;
    }

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
        <div class="res-name">${meta.name}</div>
        <div class="res-meta">${bName}${meta.floor != null ? ' · ' + meta.floor + ' этаж' : ''}</div>
      `;
      li.addEventListener('click', () => {
        savedValue = input.value;
        navigateToRoom(id);
        wrap.classList.remove('open');
      });
      results.appendChild(li);
    });
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.toggle('open');
    if (isOpen) {
      input.value = savedValue;
      input.focus();
      renderResults();
    }
  });

  input.addEventListener('input', () => {
    savedValue = input.value;
    renderResults();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
}

// ================ ПЕРЕКЛЮЧАТЕЛЬ ТЕМЫ ================

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

// ================ КНОПКА СБРОСА ВИДА ================

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

  // Сбрасываем выделение (оно было привязано к предыдущему SVG)
  clearSelectedRoom();

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
  const registerShape = (shape, id) => {
    if (!roomShapes[id]) roomShapes[id] = [];
    roomShapes[id].push(shape);

    shape.style.pointerEvents = 'auto';
    shape.style.cursor = 'pointer';
    shape.style.transition = 'opacity 0.15s';
    shape.addEventListener('mouseenter', () => { shape.style.opacity = '0.65'; });
    shape.addEventListener('mouseleave', () => { shape.style.opacity = ''; });
    shape.addEventListener('click', (e) => {
      e.stopPropagation();
      onRoomClick(id);
    });
  };

  svgEl.querySelectorAll('rect[id], path[id], polygon[id], circle[id], ellipse[id]').forEach(shape => {
    const id = shape.getAttribute('id');
    if (!roomsMeta[id]) return;
    registerShape(shape, id);
  });
  svgEl.querySelectorAll('g[id]').forEach(g => {
    const id = g.getAttribute('id');
    if (!roomsMeta[id]) return;
    g.querySelectorAll('rect, path, polygon, circle, ellipse').forEach(shape => {
      if (shape.hasAttribute('id')) return;
      registerShape(shape, id);
    });
  });

  updateTabActive();
  closeFloorsDropdown();
  scheduleLabelRefresh();

  // Если открыта панель с расписанием и выбранная аудитория на этом этаже — восстановим пульсацию
  if (selectedRoomId && roomShapes[selectedRoomId]) {
    selectRoom(selectedRoomId);
  }

  if (pendingHighlight && roomShapes[pendingHighlight]) {
    const shapes = roomShapes[pendingHighlight];
    shapes.forEach(s => s.style.opacity = '0.65');
    setTimeout(() => shapes.forEach(s => s.style.opacity = ''), 1500);
    pendingHighlight = null;
  }
}

// ================ ПОДПИСИ ================

function scheduleLabelRefresh() {
  if (labelTimer) clearTimeout(labelTimer);
  labelTimer = setTimeout(() => {
    labelTimer = null;
    placeLabels();
  }, 400);
}

function placeLabels() {
  if (currentLabels) map.removeLayer(currentLabels);
  currentLabels = L.layerGroup().addTo(map);

  const mapRect = map.getContainer().getBoundingClientRect();

  for (const [id, shapes] of Object.entries(roomShapes)) {
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

    const meta = roomsMeta[id];
    const labelText = (meta?.name || id).replace(/^Аудитория\s+/i, '').trim();
    if (!labelText) continue;

    const icon = L.divIcon({
      className: 'room-label-wrap',
      html: `<span class="room-label">${labelText}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    L.marker(latlng, { icon, interactive: false, keyboard: false })
      .addTo(currentLabels);
  }
}

window.addEventListener('resize', scheduleLabelRefresh);

// ================ СТАТУС «СЕЙЧАС В АУДИТОРИИ» ================

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

  const todayIdx = data.days.findIndex(
    d => d.date && d.date.d === todayD && d.date.m === todayM
  );

  if (todayIdx !== -1) {
    const todayLessons = data.days[todayIdx].lessons;

    // Идёт ли пара сейчас
    const current = todayLessons.find(l => {
      const s = parseStart(l.time);
      const e = parseEnd(l.time);
      return s !== null && e !== null && nowMin >= s && nowMin <= e;
    });

    if (current) {
      const endMatch = current.time.match(/[–-](\d{1,2}:\d{2})/);
      return {
        type: 'busy',
        subject: current.subject,
        untilText: endMatch ? `до ${endMatch[1]}` : ''
      };
    }

    // Следующая пара сегодня
    const next = todayLessons.find(l => {
      const s = parseStart(l.time);
      return s !== null && s > nowMin;
    });

    if (next) {
      const startMatch = next.time.match(/^(\d{1,2}:\d{2})/);
      return {
        type: 'free',
        untilText: startMatch ? `до ${startMatch[1]}` : ''
      };
    }
  }

  // Смотрим вперёд — следующий день с парами
  const startIdx = todayIdx === -1 ? 0 : todayIdx + 1;
  for (let i = startIdx; i < data.days.length; i++) {
    if (data.days[i].lessons.length > 0) {
      const dayName = data.days[i].dayName;
      const firstLesson = data.days[i].lessons[0];
      const startMatch = firstLesson.time.match(/^(\d{1,2}:\d{2})/);
      return {
        type: 'free',
        untilText: `до ${dayName.toLowerCase()}` + (startMatch ? ` (${startMatch[1]})` : '')
      };
    }
  }

  return { type: 'free', untilText: 'до конца недели' };
}

function renderNowStatus(status) {
  if (status.type === 'none') {
    return `<div class="now-status none">
      <i class="mdi mdi-calendar-remove-outline"></i>
      <div>
        <div class="now-title">Пар на этой неделе нет</div>
      </div>
    </div>`;
  }
  if (status.type === 'busy') {
    return `<div class="now-status busy">
      <i class="mdi mdi-record-circle"></i>
      <div>
        <div class="now-title">Сейчас идёт пара</div>
        <div class="now-details">${status.subject} · ${status.untilText}</div>
      </div>
    </div>`;
  }
  return `<div class="now-status free">
    <i class="mdi mdi-check-circle"></i>
    <div>
      <div class="now-title">Аудитория свободна</div>
      <div class="now-details">${status.untilText}</div>
    </div>
  </div>`;
}

// ================ КЛИК ПО АУДИТОРИИ ================

async function onRoomClick(id) {
  const meta = roomsMeta[id];
  const panel = document.getElementById('panel');
  openPanel();

  selectRoom(id);
  updateURL(id);

  const title = meta?.name || id;
  const b = meta ? BUILDINGS[meta.building] : null;

  const crumbs = b
    ? `${b.name}${meta.floor != null ? ' · ' + meta.floor + ' этаж' : ''}`
    : '';
  const shareIcon = `<i class="mdi mdi-link-variant share-icon" title="Скопировать ссылку"></i>`;
  const closeBtn = `<button class="close" onclick="closePanel()">✕</button>`;
  const header = `
    <div class="panel-header">
      ${closeBtn}
      ${crumbs ? `<div class="panel-crumbs">${crumbs}</div>` : ''}
      <h2>${title} ${shareIcon}</h2>
    </div>
  `;

  if (!meta || !meta.building || !meta.classroom) {
    panel.innerHTML = `${header}
      <p class="muted-text">Для этой комнаты расписание не настроено.</p>`;
    attachShareListener(panel, id);
    return;
  }

  panel.innerHTML = `${header}
    <p class="muted-text">Загрузка расписания…</p>`;
  attachShareListener(panel, id);

  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7));
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  const isoDate = `${yyyy}-${mm}-${dd}`;

  const url = `/api/schedule?building=${encodeURIComponent(meta.building)}&classroom=${encodeURIComponent(meta.classroom)}&date=${isoDate}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const data = parseSchedule(html);

    if (data.empty) {
      panel.innerHTML = `${header}
        <div class="no-schedule-msg">У этой аудитории нет расписания занятий</div>`;
      attachShareListener(panel, id);
      return;
    }
    renderSchedule(panel, title, data, header);
    attachShareListener(panel, id);
  } catch (err) {
    panel.innerHTML = `${header}
      <p style="color:#f87171">Ошибка загрузки: ${err.message}</p>`;
    attachShareListener(panel, id);
    console.error('[onRoomClick]', err);
  }
}

// ================ ПОДЕЛИТЬСЯ ССЫЛКОЙ ================

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
      // Фоллбэк для старых браузеров
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
  document.body.appendChild(t);
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

  days.forEach(day => day.lessons.sort((a, b) => a.time.localeCompare(b.time)));
  return { empty: false, days };
}

// ================ РЕНДЕР ПАНЕЛИ ================

function renderSchedule(panel, title, data, header) {
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
            breakText = `<span class="break">(Перерыв: ${BREAKS[mStart[1]]})</span>`;
          }

          return `
            <div class="${cls}">
              <div class="time">${l.time}${breakText}</div>
              <div class="subject">${badgeHtml}${l.subject}</div>
              <div class="meta">${l.group ? 'гр. ' + l.group : ''}${l.group && l.lecturer ? ' · ' : ''}${l.lecturer || ''}</div>
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

  panel.innerHTML = `${header}${renderNowStatus(nowStatus)}${daysHtml}`;
}

// ================ ГОРЯЧИЕ КЛАВИШИ ================

function setupHotkeys() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea';

    // Esc: закрыть поиск/панель
    if (e.key === 'Escape') {
      const wrap = document.querySelector('.search-wrap');
      if (wrap.classList.contains('open')) {
        wrap.classList.remove('open');
        if (isInput) e.target.blur();
        return;
      }
      if (document.getElementById('panel').classList.contains('open')) {
        closePanel();
      }
      return;
    }

    if (isInput) return;

    // / : открыть поиск / фокус в поле
    if (e.key === '/') {
      e.preventDefault();
      const wrap = document.querySelector('.search-wrap');
      const toggle = document.getElementById('search-toggle');
      const input = document.getElementById('search-input');
      if (!wrap.classList.contains('open')) {
        toggle.click();
      } else {
        input.focus();
      }
      return;
    }

    // +/- : зум карты
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      map.zoomIn();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      map.zoomOut();
      return;
    }
  });
}

// ================ СТАРТ ================

(async function init() {
  roomsMeta = await fetch('data/rooms.json').then(r => r.json());
  buildBuildingsUI();
  setupSearch();
  setupThemeToggle();
  setupResetControl().addTo(map);
  setupHotkeys();

  // Открытие по ссылке: ?room=...
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (roomId && roomsMeta[roomId]) {
    navigateToRoom(roomId);
  } else {
    showFloor('C', 1);
  }
})();