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
let selectedEdgeIndex = null;

let hasUnsavedChanges = false;

const nodeCirclePts = {};
const edgeLines = [];

let currentSvg = null;
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

// ================ ЗАГРУЗКА ГРАФА ================

async function loadGraph() {
  try {
    const res = await fetch('data/graph.json');
    if (!res.ok) throw new Error('Файл не найден');
    graph = await res.json();
    if (!graph.nodes) graph.nodes = {};
    if (!graph.edges) graph.edges = [];
    console.log('[editor] graph загружен:', Object.keys(graph.nodes).length, 'узлов');
  } catch (e) {
    console.log('[editor] graph.json ещё не создан, начинаю с пустого графа');
    graph = { nodes: {}, edges: [] };
  }
  updateStats();
}

// ================ ЭТАЖИ ================

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
  currentSvg = svgEl;
  currentSvgViewBox = { W, H };

  if (currentOverlay) map.removeLayer(currentOverlay);
  if (currentFloorGroup) map.removeLayer(currentFloorGroup);

  const bounds = [[0, 0], [H, W]];
  currentOverlay = L.svgOverlay(svgEl, bounds).addTo(map);
  map.fitBounds(bounds);

  svgEl.style.pointerEvents = 'none';

  currentFloorGroup = L.layerGroup().addTo(map);
  drawGraphForCurrentFloor();

  updateTabActive();
  updateFloorSwitcher();
}

function updateFloorSwitcher() {
  let w = document.querySelector('.floor-switcher-wrap');
  if (!w) {
    const ctl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const el = L.DomUtil.create('div', 'floor-switcher-wrap');
        L.DomEvent.disableClickPropagation(el);
        return el;
      }
    });
    new ctl().addTo(map);
    w = document.querySelector('.floor-switcher-wrap');
  }
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

// ================ РИСОВАНИЕ ГРАФА ================

function drawGraphForCurrentFloor() {
  if (!currentFloorGroup) return;
  currentFloorGroup.clearLayers();

  Object.keys(nodeCirclePts).forEach(id => delete nodeCirclePts[id]);
  edgeLines.length = 0;

  const { H } = currentSvgViewBox;

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.building !== currentBuilding) continue;
    if (node.floor !== currentFloor) continue;

    const latlng = [H - node.y, node.x];

    const isStairs = node.type === 'stairs';
    const isEntrance = node.type === 'entrance';
    const isSelected = id === selectedNodeId;

    const pt = L.circleMarker(latlng, {
      radius: 7,
      color: isSelected ? '#f59e0b' : '#ffffff',
      weight: isSelected ? 4 : 2,
      fillColor: isStairs ? '#a855f7' : (isEntrance ? '#22c55e' : '#3b82f6'),
      fillOpacity: 1,
      className: 'graph-node-marker'
    });

    pt.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      handleNodeClick(id);
    });

    pt.on('mouseover', () => {
      if (id === selectedNodeId) return;
      pt.setStyle({ weight: 4, color: '#fde047' });
    });
    pt.on('mouseout', () => {
      if (id === selectedNodeId) return;
      pt.setStyle({ weight: 2, color: '#ffffff' });
    });

    currentFloorGroup.addLayer(pt);
    nodeCirclePts[id] = pt;
  }

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const a = graph.nodes[edge.from];
    const b = graph.nodes[edge.to];
    if (!a || !b) continue;
    if (a.building !== currentBuilding || b.building !== currentBuilding) continue;
    if (a.floor !== currentFloor || b.floor !== currentFloor) continue;

    const isSelected = i === selectedEdgeIndex;

    const line = L.polyline(
      [[H - a.y, a.x], [H - b.y, b.x]],
      {
        color: isSelected ? '#f59e0b' : '#3b82f6',
        weight: isSelected ? 4 : 2,
        opacity: isSelected ? 1 : 0.7
      }
    );
    line.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      handleEdgeClick(i);
    });
    currentFloorGroup.addLayer(line);
    edgeLines.push({ index: i, line });
  }
}

// ================ КЛИКИ ================

function handleMapClick(e) {
  const { H } = currentSvgViewBox;
  const x = Math.round(e.latlng.lng);
  const y = Math.round(H - e.latlng.lat);

  if (currentTool === 'add-node') {
    addNodeAt(x, y);
  } else {
    if (selectedNodeId) {
      selectedNodeId = null;
      refreshGraphView();
      clearNodeInfo();
    } else if (selectedEdgeIndex !== null) {
      selectedEdgeIndex = null;
      refreshGraphView();
      clearNodeInfo();
    }
  }
}

// Автогенерация свободного ID вида n1_c_f1, n2_c_f1, ...
function generateFreeId() {
  const suffix = '_' + currentBuilding.toLowerCase() + '_f' + currentFloor;
  let n = 1;
  while (graph.nodes[`n${n}${suffix}`]) n++;
  return `n${n}${suffix}`;
}

// Ищет свободный ID на основе желаемого: "n5_c_f1" → "n5_c_f1", "n5_c_f1_2", ...
function findFreeIdVariants(baseId) {
  const candidates = [baseId];
  for (let i = 2; i <= 50; i++) candidates.push(`${baseId}_${i}`);
  return candidates.find(id => !graph.nodes[id]);
}

function addNodeAt(x, y) {
  const auto = generateFreeId();
  const raw = prompt('ID узла (Enter — оставить автогенерацию):', auto);
  if (raw === null) return; // пользователь нажал Cancel

  let id = (raw && raw.trim()) ? raw.trim() : auto;

  // Если ID занят — предлагаем следующий свободный
  if (graph.nodes[id]) {
    const free = findFreeIdVariants(id);
    if (!free) {
      alert(`Слишком много похожих ID для «${id}». Введи другой.`);
      return;
    }
    const answer = confirm(`ID «${id}» уже занят. Использовать «${free}»?`);
    if (!answer) return;
    id = free;
  }

  const type = promptNodeType();
  if (type === null) return; // пользователь отменил

  const node = {
    x, y,
    building: currentBuilding,
    floor: currentFloor,
    type: type || 'corridor'
  };

  if (type === 'stairs') {
    const grp = prompt('Группа лестницы (общая для всех этажей, например stairs_main):', 'stairs_main');
    node.group = grp && grp.trim() ? grp.trim() : 'stairs_default';
  }

  graph.nodes[id] = node;

  markDirty();
  updateStats();
  refreshGraphView();
  showToast(`Узел «${id}» добавлен`);
}

function promptNodeType() {
  const t = prompt(
    'Тип узла:\n' +
    '1 — corridor (коридор)\n' +
    '2 — stairs (лестница)\n' +
    '3 — entrance (вход)\n\n' +
    'Enter — corridor',
    '1'
  );
  if (t === null) return null;
  if (t === '2') return 'stairs';
  if (t === '3') return 'entrance';
  return 'corridor';
}

function handleNodeClick(id) {
  if (currentTool === 'select') {
    selectedNodeId = id;
    selectedEdgeIndex = null;
    refreshGraphView();
    showNodeInfo(id);
    return;
  }

  if (currentTool === 'add-edge') {
    if (!selectedNodeId) {
      selectedNodeId = id;
      refreshGraphView();
      showToast(`Первый узел: ${id}. Кликни второй.`);
      return;
    }
    if (selectedNodeId === id) {
      showToast('Нельзя соединить узел сам с собой');
      return;
    }
    addEdge(selectedNodeId, id);
    selectedNodeId = null;
    refreshGraphView();
    return;
  }
}

function addEdge(fromId, toId) {
  const exists = graph.edges.some(e =>
    (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
  );
  if (exists) {
    showToast('Такое ребро уже есть');
    return;
  }

  const a = graph.nodes[fromId];
  const b = graph.nodes[toId];

  let weight;
  if (a.floor !== b.floor || a.building !== b.building) {
    const w = prompt('Вес межэтажного перехода (условные единицы, например 40):', '40');
    weight = w ? Number(w) : 40;
  } else {
    weight = Math.round(Math.hypot(a.x - b.x, a.y - b.y));
  }

  graph.edges.push({ from: fromId, to: toId, weight });
  markDirty();
  updateStats();
  showToast(`Ребро ${fromId} → ${toId} (${weight})`);
}

function handleEdgeClick(index) {
  if (currentTool !== 'select') return;
  selectedEdgeIndex = index;
  selectedNodeId = null;
  refreshGraphView();
  const e = graph.edges[index];
  showEdgeInfo(e, index);
}

function refreshGraphView() {
  drawGraphForCurrentFloor();
}

// ================ ПАНЕЛЬ СПРАВА ================

function showNodeInfo(id) {
  const node = graph.nodes[id];
  if (!node) return;
  const el = document.getElementById('node-info');
  el.innerHTML = `
    <p><strong>${id}</strong></p>
    <p>Тип: <code>${node.type}</code></p>
    <p>Корпус: <code>${node.building}</code>, этаж: <code>${node.floor}</code></p>
    <p>Координаты: <code>${node.x}, ${node.y}</code></p>
    ${node.group ? `<p>Группа: <code>${node.group}</code></p>` : ''}
    <button class="tool-btn" onclick="deleteSelectedNode()" style="margin-top:8px">
      <i class="mdi mdi-delete"></i> Удалить узел
    </button>
  `;
}

function showEdgeInfo(edge, index) {
  const el = document.getElementById('node-info');
  el.innerHTML = `
    <p><strong>Ребро #${index}</strong></p>
    <p>${edge.from} → ${edge.to}</p>
    <p>Вес: <code>${edge.weight}</code></p>
    <button class="tool-btn" onclick="deleteSelectedEdge()" style="margin-top:8px">
      <i class="mdi mdi-delete"></i> Удалить ребро
    </button>
  `;
}

function deleteSelectedNode() {
  if (!selectedNodeId) return;
  const id = selectedNodeId;
  if (!confirm(`Удалить узел «${id}» и все его рёбра?`)) return;

  delete graph.nodes[id];
  graph.edges = graph.edges.filter(e => e.from !== id && e.to !== id);
  selectedNodeId = null;
  markDirty();
  updateStats();
  refreshGraphView();
  clearNodeInfo();
  showToast(`Узел «${id}» удалён`);
}

function deleteSelectedEdge() {
  if (selectedEdgeIndex === null) return;
  const e = graph.edges[selectedEdgeIndex];
  if (!confirm(`Удалить ребро ${e.from} → ${e.to}?`)) return;
  graph.edges.splice(selectedEdgeIndex, 1);
  selectedEdgeIndex = null;
  markDirty();
  updateStats();
  refreshGraphView();
  clearNodeInfo();
}

function clearNodeInfo() {
  document.getElementById('node-info').innerHTML = '<p class="muted">Кликните по узлу для выбора</p>';
}

function updateStats() {
  document.getElementById('stat-nodes').textContent = Object.keys(graph.nodes).length;
  document.getElementById('stat-edges').textContent = graph.edges.length;
}

function markDirty() {
  hasUnsavedChanges = true;
  document.getElementById('editor-save').classList.add('dirty');
}

function markClean() {
  hasUnsavedChanges = false;
  document.getElementById('editor-save').classList.remove('dirty');
}

// ================ ИНСТРУМЕНТЫ ================

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
    selectedNodeId = null;
    selectedEdgeIndex = null;
    refreshGraphView();
    clearNodeInfo();
  });
});

document.getElementById('editor-save').addEventListener('click', saveGraph);
document.getElementById('editor-clear').addEventListener('click', () => {
  if (!confirm('Удалить ВСЕ узлы и рёбра? Это действие необратимо.')) return;
  graph = { nodes: {}, edges: [] };
  selectedNodeId = null;
  selectedEdgeIndex = null;
  markDirty();
  updateStats();
  refreshGraphView();
  clearNodeInfo();
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === '1') document.querySelector('[data-tool="add-node"]').click();
  if (e.key === '2') document.querySelector('[data-tool="add-edge"]').click();
  if (e.key === '3') document.querySelector('[data-tool="select"]').click();

  if (e.key === 'Escape') {
    selectedNodeId = null;
    selectedEdgeIndex = null;
    refreshGraphView();
    clearNodeInfo();
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedNodeId) deleteSelectedNode();
    else if (selectedEdgeIndex !== null) deleteSelectedEdge();
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
  await loadGraph();
  buildBuildingsUI();
  showFloor('C', 1);
})();