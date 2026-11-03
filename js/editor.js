// ================ КОНФИГ ================

const BUILDINGS = {
  C: { name: 'Главный',    floors: { 0: 'data/floor0.svg', 1: 'data/floor1.svg', 2: 'data/floor2.svg', 3: 'data/floor3.svg', 4: 'data/floor4.svg' } },
  L: { name: 'Лабок',      floors: {} },
  B: { name: 'Инкубатор',  floors: {} },
  F: { name: 'Военка',     floors: {} }
};

// ================ СОСТОЯНИЕ ================

let currentBuilding = 'C';
let currentFloor = 1;
let currentOverlay = null;
let currentFloorGroup = null;

let graph = { nodes: {}, edges: [] };

let currentTool = null; // По умолчанию режим не выбран
let selectedNodeId = null;
let hasUnsavedChanges = false;

const nodeCirclePts = {};
const edgeLines = [];

let currentSvgViewBox = { W: 1000, H: 1000 };

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

// Создаем кастомные панели для правильного наложения слоев
map.createPane('svgPane');
map.getPane('svgPane').style.zIndex = 400; // План этажа

map.createPane('graphPane');
map.getPane('graphPane').style.zIndex = 450; // Граф (узлы и ребра)

// ================ ЗАГРУЗКА ГРАФА ================

async function loadGraph() {
  try {
    const res = await fetch('data/graph.json');
    if (!res.ok) throw new Error('Файл не найден');
    graph = await res.json();
    if (!graph.nodes) graph.nodes = {};
    if (!graph.edges) graph.edges = [];
  } catch (e) {
    graph = { nodes: {}, edges: [] };
  }
}

// ================ ТЕМА ================

function setupTheme() {
  const btn = document.getElementById('btn-theme-toggle');
  const updateIcon = () => {
    const theme = document.documentElement.dataset.theme || 'dark';
    btn.innerHTML = theme === 'dark' ? '<i class="mdi mdi-weather-sunny"></i>' : '<i class="mdi mdi-weather-night"></i>';
  };
  updateIcon();
  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    updateIcon();
  });
}

// ================ СВОРАЧИВАНИЕ ПАНЕЛИ ================

function setupSidebar() {
  const handle = document.getElementById('sidebar-handle');
  handle.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
    setTimeout(() => map.invalidateSize(), 260);
  });
}

// ================ КОНТРОЛЫ КАРТЫ ================

function setupResetControl() {
  const ResetControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'leaflet-control-reset');
      const btn = L.DomUtil.create('button', 'reset-view-btn', wrap);
      btn.title = 'Сбросить вид';
      btn.innerHTML = '<i class="mdi mdi-image-filter-center-focus"></i>';
      L.DomEvent.disableClickPropagation(wrap);
      btn.addEventListener('click', () => {
        if (currentOverlay) map.fitBounds(currentOverlay.getBounds());
      });
      return wrap;
    }
  });
  return new ResetControl();
}

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
  let w = document.querySelector('.floor-switcher-wrap');
  if (!w) return;
  w.innerHTML = '';
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
  w.appendChild(sw);
}

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
    tab.addEventListener('click', () => {
      if (code === currentBuilding) return;
      const floors = Object.keys(b.floors).map(Number).sort((a, b) => a - b);
      if (floors.length === 0) {
        showToast(`Этажи корпуса «${b.name}» ещё не добавлены`);
        return;
      }
      currentBuilding = code;
      updateTabActive();
      showFloor(code, floors[0]);
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

// ================ ОТРИСОВКА ЭТАЖА ================

async function showFloor(buildingCode, floorNum) {
  const b = BUILDINGS[buildingCode];
  const svgUrl = b?.floors?.[floorNum];
  if (!svgUrl) return;

  currentBuilding = buildingCode;
  currentFloor = floorNum;

  const svgText = await fetch(svgUrl).then(r => r.text());
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return;

  const vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
  const W = vb[2], H = vb[3];
  currentSvgViewBox = { W, H };

  if (currentOverlay) map.removeLayer(currentOverlay);
  if (currentFloorGroup) map.removeLayer(currentFloorGroup);

  const bounds = [[0, 0], [H, W]];
  
  currentOverlay = L.svgOverlay(svgEl, bounds, { pane: 'svgPane' }).addTo(map);
  map.fitBounds(bounds);

  svgEl.style.pointerEvents = 'none';

  currentFloorGroup = L.layerGroup().addTo(map);
  drawGraphForCurrentFloor();

  updateTabActive();
  updateFloorSwitcher();
}

// ================ РИСОВАНИЕ ГРАФА ================

function drawGraphForCurrentFloor() {
  if (!currentFloorGroup) return;
  currentFloorGroup.clearLayers();

  Object.keys(nodeCirclePts).forEach(id => delete nodeCirclePts[id]);
  edgeLines.length = 0;

  const { H } = currentSvgViewBox;

  // Рёбра
  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const a = graph.nodes[edge.from];
    const b = graph.nodes[edge.to];
    if (!a || !b) continue;
    if (a.building !== currentBuilding || b.building !== currentBuilding) continue;
    if (a.floor !== currentFloor || b.floor !== currentFloor) continue;

    const line = L.polyline([[H - a.y, a.x], [H - b.y, b.x]], {
      pane: 'graphPane',
      color: '#3b82f6', weight: 2, opacity: 0.7,
      interactive: false
    });

    // Хитбокс для ребра
    const hitbox = L.polyline([[H - a.y, a.x], [H - b.y, b.x]], {
      pane: 'graphPane',
      color: 'transparent', weight: 15, opacity: 0,
      interactive: true
    });

    hitbox.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (currentTool === 'delete') {
        graph.edges.splice(i, 1);
        markDirty();
        drawGraphForCurrentFloor();
        clearNodeInfo();
        showToast('Ребро удалено');
      } else if (currentTool === null) {
        selectedNodeId = null;
        drawGraphForCurrentFloor();
        showEdgeInfo(edge);
      }
    });

    currentFloorGroup.addLayer(line);
    currentFloorGroup.addLayer(hitbox);
    edgeLines.push({ index: i, line, hitbox });
  }

  // Узлы
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.building !== currentBuilding) continue;
    if (node.floor !== currentFloor) continue;

    const latlng = [H - node.y, node.x];
    const isStairs = node.type === 'stairs';
    const isEntrance = node.type === 'entrance';
    const isOutdoor = node.type === 'outdoor';
    const isSelected = id === selectedNodeId;

    // Визуальный маркер
    const visualPt = L.circleMarker(latlng, {
      pane: 'graphPane',
      radius: 4,
      color: isSelected ? '#f59e0b' : '#ffffff',
      weight: isSelected ? 3 : 1.5,
      fillColor: isStairs ? '#a855f7' : (isEntrance ? '#22c55e' : (isOutdoor ? '#06b6d4' : '#3b82f6')),
      fillOpacity: 1,
      className: 'graph-node-marker',
      interactive: false
    });
    
    // Невидимый маркер для хитбокса
    const hitbox = L.circleMarker(latlng, {
      pane: 'graphPane',
      radius: 12,
      fillColor: 'transparent',
      fillOpacity: 1,
      stroke: false,
      interactive: true
    });

    hitbox.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      handleNodeClick(id);
    });
    
    hitbox.on('mouseover', () => {
      if (isSelected) return;
      visualPt.setStyle({ weight: 3, color: '#fde047' });
    });
    hitbox.on('mouseout', () => {
      if (isSelected) return;
      visualPt.setStyle({ weight: 1.5, color: '#ffffff' });
    });

    currentFloorGroup.addLayer(visualPt);
    currentFloorGroup.addLayer(hitbox);
    nodeCirclePts[id] = { visual: visualPt, hitbox: hitbox };
  }
}

// ================ МОДАЛЬНОЕ ОКНО ================

function openModal({ title, bodyHtml, onConfirm }) {
  const backdrop = document.getElementById('modal-backdrop');
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');
  body.innerHTML = bodyHtml;
  backdrop.classList.add('open');

  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');

  const close = () => {
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', handleKeyDown, true);
  };

  const newConfirmBtn = confirmBtn.cloneNode(true);
  const newCancelBtn = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirmBtn);
  cancelBtn.replaceWith(newCancelBtn);

  newCancelBtn.addEventListener('click', close);
  newConfirmBtn.addEventListener('click', () => {
    const result = onConfirm(body);
    if (result !== false) close();
  });

  const handleKeyDown = (e) => {
    if (!backdrop.classList.contains('open')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      newConfirmBtn.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', handleKeyDown, true);

  requestAnimationFrame(() => {
    const firstInput = body.querySelector('input[type="text"]');
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
    }
  });
}

// ================ КЛИКИ ================

function handleMapClick(e) {
  const { H } = currentSvgViewBox;
  const x = Math.round(e.latlng.lng);
  const y = Math.round(H - e.latlng.lat);

  if (currentTool === 'add') {
    if (!selectedNodeId) {
      showAddNodeModal(x, y);
    } else {
      selectedNodeId = null;
      drawGraphForCurrentFloor();
    }
  } else {
    selectedNodeId = null;
    drawGraphForCurrentFloor();
    clearNodeInfo();
  }
}

function showAddNodeModal(x, y) {
  // Умная авто-нумерация: ищем минимальный свободный номер
  const usedNumbers = new Set();
  Object.keys(graph.nodes).forEach(id => {
    const match = id.match(/^n(\d+)_/);
    if (match) usedNumbers.add(parseInt(match[1], 10));
  });
  
  let proposedNum = 1;
  while (usedNumbers.has(proposedNum)) {
    proposedNum++;
  }
  const autoId = `n${proposedNum}_${currentBuilding.toLowerCase()}_f${currentFloor}`;
  
  const html = `
    <div class="form-group">
      <label for="modal-node-id">ID узла</label>
      <input type="text" id="modal-node-id" value="${autoId}">
    </div>
    <div class="form-group">
      <label>Тип узла</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" name="node-type" value="corridor" checked>
          Коридор
        </label>
        <label class="radio-label">
          <input type="radio" name="node-type" value="stairs">
          Лестница
        </label>
        <label class="radio-label">
          <input type="radio" name="node-type" value="entrance">
          Вход
        </label>
        <label class="radio-label">
          <input type="radio" name="node-type" value="outdoor">
          Улица
        </label>
      </div>
    </div>
    <div class="form-group" id="modal-group-wrap" style="display:none">
      <label for="modal-node-group">Группа лестницы (например, stairs_main)</label>
      <input type="text" id="modal-node-group" value="stairs_main">
    </div>
  `;

  openModal({
    title: 'Добавить узел',
    bodyHtml: html,
    onConfirm: (body) => {
      const id = body.querySelector('#modal-node-id').value.trim();
      const type = body.querySelector('input[name="node-type"]:checked').value;
      const group = body.querySelector('#modal-node-group').value.trim();

      if (!id) { showToast('Введите ID узла'); return false; }
      if (graph.nodes[id]) { showToast('Узел с таким ID уже существует'); return false; }

      const node = { x, y, building: currentBuilding, floor: currentFloor, type };
      if (type === 'stairs') node.group = group || 'stairs_default';

      graph.nodes[id] = node;
      markDirty();
      drawGraphForCurrentFloor();
      showNodeInfo(id);
      showToast('Узел добавлен');
    }
  });

  const radios = document.querySelectorAll('input[name="node-type"]');
  const groupWrap = document.getElementById('modal-group-wrap');
  radios.forEach(r => {
    r.addEventListener('change', () => {
      groupWrap.style.display = r.value === 'stairs' && r.checked ? 'flex' : 'none';
    });
  });
}

function handleNodeClick(id) {
  const node = graph.nodes[id];

  // Режим удаления
  if (currentTool === 'delete') {
    delete graph.nodes[id];
    graph.edges = graph.edges.filter(e => e.from !== id && e.to !== id);
    selectedNodeId = null;
    markDirty();
    drawGraphForCurrentFloor();
    clearNodeInfo();
    showToast('Узел удалён');
    return;
  }

  // Режим добавления (связывание любых узлов, включая лестницы)
  if (currentTool === 'add') {
    if (!selectedNodeId) {
      selectedNodeId = id;
      showNodeInfo(id);
      if (node.type === 'stairs') {
        showToast('Лестница выбрана. Кликните другой узел или лестницу для связывания.');
      } else {
        showToast('Первый узел выбран. Кликните второй для создания ребра.');
      }
      drawGraphForCurrentFloor();
      return;
    }

    if (selectedNodeId === id) {
      selectedNodeId = null;
      drawGraphForCurrentFloor();
      return;
    }

    const a = graph.nodes[selectedNodeId];
    const b = node;
    
    // Проверка на существующее ребро
    const exists = graph.edges.some(e => 
      (e.from === selectedNodeId && e.to === id) || (e.from === id && e.to === selectedNodeId)
    );
    
    if (exists) {
      showToast('Такое ребро уже есть');
      selectedNodeId = null;
      drawGraphForCurrentFloor();
      return;
    }

    // Если узлы на разных этажах/корпусах, вес по умолчанию 40. Иначе — расстояние.
    let weight = (a.floor !== b.floor || a.building !== b.building) 
      ? 40 
      : Math.round(Math.hypot(a.x - b.x, a.y - b.y));
      
    graph.edges.push({ from: selectedNodeId, to: id, weight });
    
    // Если связываем две лестницы, объединяем их группы
    const bothStairs = a.type === 'stairs' && b.type === 'stairs';
    if (bothStairs) {
      if (a.group && !b.group) b.group = a.group;
      if (b.group && !a.group) a.group = b.group;
      if (!a.group && !b.group) { a.group = 'stairs_main'; b.group = 'stairs_main'; }
    }

    selectedNodeId = null;
    markDirty();
    drawGraphForCurrentFloor();
    showNodeInfo(id);
    showToast(bothStairs ? 'Лестницы связаны' : 'Ребро добавлено');
    return;
  }

  // Если режим не выбран
  if (currentTool === null) {
    selectedNodeId = id;
    drawGraphForCurrentFloor();
    showNodeInfo(id);
    return;
  }
}

// ================ ПАНЕЛЬ ИНФОРМАЦИИ ================

function showEdgeInfo(edge) {
  if (!edge) return;
  const el = document.getElementById('node-info');
  el.innerHTML = `
    <p><strong>Ребро</strong></p>
    <p>От: <code>${edge.from}</code></p>
    <p>До: <code>${edge.to}</code></p>
    <div class="stair-link-row" data-edge-from="${edge.from}" data-edge-to="${edge.to}" style="margin-top: 8px;">
      <span>Вес ребра</span>
      <input type="number" class="weight-input" value="${edge.weight}" min="1" step="1" aria-label="Вес ребра" />
    </div>
  `;
  bindWeightInputs(el);
}

function showNodeInfo(id) {
  const node = graph.nodes[id];
  if (!node) return;
  const el = document.getElementById('node-info');

  let html = `
    <p><strong>${id}</strong></p>
    <div class="stair-link-row" style="margin: 6px 0;">
      <span>Тип узла</span>
      <select id="node-info-type-select" class="node-type-select" aria-label="Тип узла">
        <option value="corridor" ${node.type === 'corridor' ? 'selected' : ''}>Коридор</option>
        <option value="stairs" ${node.type === 'stairs' ? 'selected' : ''}>Лестница</option>
        <option value="entrance" ${node.type === 'entrance' ? 'selected' : ''}>Вход</option>
        <option value="outdoor" ${node.type === 'outdoor' ? 'selected' : ''}>Улица</option>
      </select>
    </div>
    <p>Корпус: <code>${node.building}</code>, этаж: <code>${node.floor}</code></p>
    <p>Координаты: <code>${node.x}, ${node.y}</code></p>
    ${node.group ? `<p>Группа лестницы: <code style="color:var(--btn-flr-active)">${node.group}</code></p>` : ''}
  `;

  // При нажатии на узел лестницы выводим связанные узлы и веса с возможностью редактирования
  if (node.type === 'stairs') {
    const connectedEdges = graph.edges.filter(e => e.from === id || e.to === id);

    if (connectedEdges.length > 0) {
      html += `<p style="margin-top: 12px;"><strong>Связанные узлы (веса):</strong></p>`;
      connectedEdges.forEach(edge => {
        const otherId = edge.from === id ? edge.to : edge.from;
        const otherNode = graph.nodes[otherId];
        if (!otherNode) return;
        const typeLabel = otherNode.type === 'stairs' ? 'лестн.' : otherNode.type;
        
        html += `
          <div class="stair-link-row" data-edge-from="${edge.from}" data-edge-to="${edge.to}">
            <span>${otherId} (${typeLabel}, эт. ${otherNode.floor})</span>
            <input type="number" class="weight-input" value="${edge.weight}" min="1" step="1" aria-label="Вес связи с ${otherId}" />
          </div>
        `;
      });
    } else {
      html += `<p class="muted" style="margin-top: 12px;">Нет связанных узлов</p>`;
    }
  }

  el.innerHTML = html;

  const typeSelect = el.querySelector('#node-info-type-select');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      const nextType = typeSelect.value;
      node.type = nextType;
      if (nextType === 'stairs' && !node.group) {
        node.group = 'stairs_main';
      } else if (nextType !== 'stairs') {
        delete node.group;
      }
      markDirty();
      drawGraphForCurrentFloor();
      showNodeInfo(id);
      showToast('Тип узла обновлён');
    });
  }

  bindWeightInputs(el);
}

function bindWeightInputs(container) {
  container.querySelectorAll('.weight-input').forEach(input => {
    const updateWeight = (e) => {
      const row = e.target.closest('.stair-link-row');
      const from = row.dataset.edgeFrom;
      const to = row.dataset.edgeTo;
      const edge = graph.edges.find(ed => (ed.from === from && ed.to === to) || (ed.from === to && ed.to === from));
      
      if (edge) {
        const val = parseInt(e.target.value, 10);
        if (val > 0) {
          edge.weight = val;
          markDirty();
          showToast('Вес обновлён');
        } else {
          e.target.value = edge.weight;
        }
      }
    };
    input.addEventListener('change', updateWeight);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    });
  });
}

function clearNodeInfo() {
  document.getElementById('node-info').innerHTML = '<p class="muted">Кликните по узлу или ребру для выбора</p>';
}

function markDirty() {
  hasUnsavedChanges = true;
  document.getElementById('editor-save').classList.add('dirty');
}

function markClean() {
  hasUnsavedChanges = false;
  document.getElementById('editor-save').classList.remove('dirty');
}

window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ================ ИНСТРУМЕНТЫ ================

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    
    if (currentTool === tool) {
      currentTool = null;
      btn.classList.remove('active');
    } else {
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = tool;
    }

    selectedNodeId = null;
    drawGraphForCurrentFloor();
    clearNodeInfo();
  });
});

document.addEventListener('keydown', (e) => {
  if (document.getElementById('modal-backdrop')?.classList.contains('open')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === '1') document.querySelector('[data-tool="add"]').click();
  if (e.key === '2') document.querySelector('[data-tool="delete"]').click();

  if (e.key === 'Escape') {
    currentTool = null;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    selectedNodeId = null;
    drawGraphForCurrentFloor();
    clearNodeInfo();
  }
});

// ================ АВТОРИЗАЦИЯ И СОХРАНЕНИЕ ================

const EDITOR_TOKEN_KEY = 'radikmap_editor_token';

function getStoredEditorToken() {
  try {
    return localStorage.getItem(EDITOR_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setStoredEditorToken(token) {
  try {
    if (token) localStorage.setItem(EDITOR_TOKEN_KEY, token);
    else localStorage.removeItem(EDITOR_TOKEN_KEY);
  } catch (e) {}
}

async function verifyEditorSession() {
  const token = getStoredEditorToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/editor/check', {
      headers: { 'X-Editor-Token': token }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

function showEditorAuthGate(message = '') {
  const gate = document.getElementById('editor-auth-gate');
  const errEl = document.getElementById('editor-auth-error');
  const passInput = document.getElementById('editor-auth-password');
  if (!gate) return;
  gate.classList.remove('hidden');
  if (errEl) {
    if (message) {
      errEl.textContent = message;
      errEl.classList.remove('hidden');
    } else {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
  }
  if (passInput) {
    passInput.value = '';
    setTimeout(() => passInput.focus(), 50);
  }
}

function hideEditorAuthGate() {
  const gate = document.getElementById('editor-auth-gate');
  if (gate) gate.classList.add('hidden');
}

function setupEditorAuthForm() {
  const form = document.getElementById('editor-auth-form');
  const passInput = document.getElementById('editor-auth-password');
  const errEl = document.getElementById('editor-auth-error');
  if (!form || !passInput) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passInput.value.trim();
    if (!password) return;
    try {
      const res = await fetch('/api/editor/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.token) {
        if (errEl) {
          errEl.textContent = data.error || 'Неверный пароль администратора';
          errEl.classList.remove('hidden');
        }
        return;
      }
      setStoredEditorToken(data.token);
      hideEditorAuthGate();
      showToast('Доступ к редактору открыт');
    } catch (err) {
      if (errEl) {
        errEl.textContent = 'Ошибка соединения с сервером';
        errEl.classList.remove('hidden');
      }
    }
  });
}

async function saveGraph() {
  const token = getStoredEditorToken();
  if (!token) {
    showEditorAuthGate('Введите пароль администратора для сохранения');
    return;
  }
  try {
    const res = await fetch('/api/graph/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Editor-Token': token
      },
      body: JSON.stringify(graph)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setStoredEditorToken('');
      showEditorAuthGate('Сессия истекла. Введите пароль администратора');
      return;
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    markClean();
    showToast('graph.json сохранён');
  } catch (e) {
    showToast('Не удалось сохранить: ' + e.message);
  }
}

document.getElementById('editor-save').addEventListener('click', saveGraph);

// ================ TOAST ================

function showToast(text) {
  document.querySelectorAll('.toast').forEach(el => el.remove());
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

// ================ СТАРТ ================

map.on('click', handleMapClick);

(async function init() {
  setupTheme();
  setupSidebar();
  setupEditorAuthForm();

  const authorized = await verifyEditorSession();
  if (authorized) {
    hideEditorAuthGate();
  } else {
    showEditorAuthGate();
  }

  await loadGraph();
  buildBuildingsUI();
  setupResetControl().addTo(map);
  createFloorSwitcher().addTo(map);
  
  await showFloor('C', 1); 
  updateFloorSwitcher();
})();