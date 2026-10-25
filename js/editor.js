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

let currentTool = 'add-node';
let selectedNodeId = null;
let linkStairsSourceId = null;
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

// ВАЖНО: Создаем кастомные панели для правильного наложения слоев
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
    const theme = document.documentElement.dataset.theme || 'light';
    btn.innerHTML = theme === 'dark' ? '<i class="mdi mdi-weather-sunny"></i>' : '<i class="mdi mdi-weather-night"></i>';
  };
  updateIcon();
  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
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
      if (floors.length === 0) return alert(`Этажи корпуса «${b.name}» не добавлены`);
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
  
  // Добавляем SVG в нашу кастомную панель (слой ниже)
  currentOverlay = L.svgOverlay(svgEl, bounds, { pane: 'svgPane' }).addTo(map);
  map.fitBounds(bounds);

  svgEl.style.pointerEvents = 'none';

  // Граф добавляем в панель выше
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
      color: '#3b82f6', weight: 2, opacity: 0.7
    });
    line.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (currentTool === 'select') {
        if (confirm(`Удалить ребро ${edge.from} → ${edge.to}?`)) {
          graph.edges.splice(i, 1);
          markDirty();
          drawGraphForCurrentFloor();
          clearNodeInfo();
        }
      }
    });
    currentFloorGroup.addLayer(line);
    edgeLines.push({ index: i, line });
  }

  // Узлы
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.building !== currentBuilding) continue;
    if (node.floor !== currentFloor) continue;

    const latlng = [H - node.y, node.x];
    const isStairs = node.type === 'stairs';
    const isEntrance = node.type === 'entrance';
    const isSelected = id === selectedNodeId || id === linkStairsSourceId;

    // Визуальный маркер (маленький)
    const visualPt = L.circleMarker(latlng, {
      pane: 'graphPane',
      radius: 4,
      color: isSelected ? '#f59e0b' : '#ffffff',
      weight: isSelected ? 3 : 1.5,
      fillColor: isStairs ? '#a855f7' : (isEntrance ? '#22c55e' : '#3b82f6'),
      fillOpacity: 1,
      className: 'graph-node-marker',
      interactive: false // Отключаем клики на визуальном маркере, чтобы не мешал
    });
    
    // Невидимый маркер для хитбокса (большой)
    const hitbox = L.circleMarker(latlng, {
      pane: 'graphPane',
      radius: 12, // Большой радиус для удобного клика
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

  const close = () => backdrop.classList.remove('open');

  const newConfirmBtn = confirmBtn.cloneNode(true);
  const newCancelBtn = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirmBtn);
  cancelBtn.replaceWith(newCancelBtn);

  newCancelBtn.addEventListener('click', close);
  newConfirmBtn.addEventListener('click', () => {
    const result = onConfirm(body);
    if (result !== false) close();
  });
}

// ================ КЛИКИ ================

function handleMapClick(e) {
  const { H } = currentSvgViewBox;
  const x = Math.round(e.latlng.lng);
  const y = Math.round(H - e.latlng.lat);

  if (currentTool === 'add-node') {
    showAddNodeModal(x, y);
  } else {
    selectedNodeId = null;
    linkStairsSourceId = null;
    drawGraphForCurrentFloor();
    clearNodeInfo();
  }
}

function showAddNodeModal(x, y) {
  const autoId = `n${Object.keys(graph.nodes).length + 1}_${currentBuilding.toLowerCase()}_f${currentFloor}`;
  
  const html = `
    <div class="form-group">
      <label>ID узла</label>
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
      </div>
    </div>
    <div class="form-group" id="modal-group-wrap" style="display:none">
      <label>Группа лестницы (например, stairs_main)</label>
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

      if (!id) { alert('Введите ID'); return false; }
      if (graph.nodes[id]) { alert('Узел с таким ID уже существует'); return false; }

      const node = { x, y, building: currentBuilding, floor: currentFloor, type };
      if (type === 'stairs') node.group = group || 'stairs_default';

      graph.nodes[id] = node;
      markDirty();
      drawGraphForCurrentFloor();
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

  if (currentTool === 'link-stairs') {
    if (node.type !== 'stairs') { alert('Этот узел не является лестницей'); return; }

    if (!linkStairsSourceId) {
      linkStairsSourceId = id;
      showToast('Лестница выбрана. Переключите этаж и кликните вторую.');
      drawGraphForCurrentFloor();
      return;
    }

    if (linkStairsSourceId === id) {
      linkStairsSourceId = null;
      drawGraphForCurrentFloor();
      return;
    }

    const a = graph.nodes[linkStairsSourceId];
    const b = node;
    
    const exists = graph.edges.some(e => 
      (e.from === linkStairsSourceId && e.to === id) || (e.from === id && e.to === linkStairsSourceId)
    );

    if (exists) {
      alert('Эти лестницы уже связаны');
      linkStairsSourceId = null;
      drawGraphForCurrentFloor();
      return;
    }

    graph.edges.push({ from: linkStairsSourceId, to: id, weight: 40 });
    
    if (a.group && !b.group) b.group = a.group;
    if (b.group && !a.group) a.group = b.group;
    if (!a.group && !b.group) { a.group = 'stairs_main'; b.group = 'stairs_main'; }
    
    markDirty();
    linkStairsSourceId = null;
    drawGraphForCurrentFloor();
    showToast('Лестницы связаны');
    return;
  }

  if (currentTool === 'add-edge') {
    if (!selectedNodeId) {
      selectedNodeId = id;
      drawGraphForCurrentFloor();
      showToast('Первый узел выбран. Кликните второй.');
      return;
    }
    if (selectedNodeId === id) { showToast('Нельзя соединить узел сам с собой'); return; }
    
    const a = graph.nodes[selectedNodeId];
    const b = node;
    const exists = graph.edges.some(e => 
      (e.from === selectedNodeId && e.to === id) || (e.from === id && e.to === selectedNodeId)
    );
    if (exists) { alert('Такое ребро уже есть'); selectedNodeId = null; drawGraphForCurrentFloor(); return; }

    let weight = (a.floor !== b.floor || a.building !== b.building) ? 40 : Math.round(Math.hypot(a.x - b.x, a.y - b.y));

    graph.edges.push({ from: selectedNodeId, to: id, weight });
    selectedNodeId = null;
    markDirty();
    drawGraphForCurrentFloor();
    showToast('Ребро добавлено');
    return;
  }

  if (currentTool === 'select') {
    selectedNodeId = id;
    linkStairsSourceId = null;
    drawGraphForCurrentFloor();
    showNodeInfo(id);
    return;
  }
}

// ================ ПАНЕЛЬ ИНФОРМАЦИИ ================

function showNodeInfo(id) {
  const node = graph.nodes[id];
  if (!node) return;
  const el = document.getElementById('node-info');
  el.innerHTML = `
    <p><strong>${id}</strong></p>
    <p>Тип: <code>${node.type}</code></p>
    <p>Корпус: <code>${node.building}</code>, этаж: <code>${node.floor}</code></p>
    <p>Координаты: <code>${node.x}, ${node.y}</code></p>
    ${node.group ? `<p>Группа лестницы: <code style="color:var(--btn-flr-active)">${node.group}</code></p>` : ''}
    <button class="tool-btn" onclick="deleteSelectedNode()" style="margin-top:8px; background:rgba(239,68,68,0.1); color:#ef4444; border-color:rgba(239,68,68,0.2)">
      <i class="mdi mdi-delete"></i> Удалить узел
    </button>
  `;
}

function clearNodeInfo() {
  document.getElementById('node-info').innerHTML = '<p class="muted">Кликните по узлу или ребру для выбора</p>';
}

function deleteSelectedNode() {
  if (!selectedNodeId) return;
  const id = selectedNodeId;
  if (!confirm(`Удалить узел «${id}» и все его рёбра?`)) return;

  delete graph.nodes[id];
  graph.edges = graph.edges.filter(e => e.from !== id && e.to !== id);
  selectedNodeId = null;
  markDirty();
  drawGraphForCurrentFloor();
  clearNodeInfo();
}

function markDirty() {
  hasUnsavedChanges = true;
  document.getElementById('editor-save').classList.add('dirty');
}

function markClean() {
  hasUnsavedChanges = false;
  document.getElementById('editor-save').classList.remove('dirty');
}

// Защита от закрытия вкладки с несохранёнными изменениями
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ================ ИНСТРУМЕНТЫ ================

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
    selectedNodeId = null;
    linkStairsSourceId = null;
    drawGraphForCurrentFloor();
    clearNodeInfo();
  });
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === '1') document.querySelector('[data-tool="add-node"]').click();
  if (e.key === '2') document.querySelector('[data-tool="add-edge"]').click();
  if (e.key === '3') document.querySelector('[data-tool="link-stairs"]').click();
  if (e.key === '4') document.querySelector('[data-tool="select"]').click();

  if (e.key === 'Escape') {
    selectedNodeId = null;
    linkStairsSourceId = null;
    drawGraphForCurrentFloor();
    clearNodeInfo();
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
    deleteSelectedNode();
  }
});

// ================ СОХРАНЕНИЕ ================

async function saveGraph() {
  try {
    const res = await fetch('/api/graph/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    markClean();
    showToast('graph.json сохранён');
  } catch (e) {
    alert('Не удалось сохранить: ' + e.message);
  }
}

document.getElementById('editor-save').addEventListener('click', saveGraph);

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

// ================ СТАРТ ================

map.on('click', handleMapClick);

(async function init() {
  setupTheme();
  setupSidebar();
  await loadGraph();
  buildBuildingsUI();
  setupResetControl().addTo(map);
  createFloorSwitcher().addTo(map);
  
  await showFloor('C', 1); 
  updateFloorSwitcher();
})();