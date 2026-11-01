// Pure graph, routing, and smart search utility functions for RadikMap (Карта РГРТУ)

/**
 * Generates the next smart gap-filling node ID for a given building and floor.
 */
function generateNextNodeId(nodes, building, floor) {
  const bCode = String(building).toLowerCase();
  const suffix = `_${bCode}_f${floor}`;
  const usedNumbers = new Set();

  Object.keys(nodes || {}).forEach(id => {
    if (id.endsWith(suffix)) {
      const match = id.match(/^n(\d+)_/);
      if (match) {
        usedNumbers.add(parseInt(match[1], 10));
      }
    }
  });

  let nextNum = 1;
  while (usedNumbers.has(nextNum)) {
    nextNum++;
  }
  return `n${nextNum}${suffix}`;
}

/**
 * Finds the shortest path between startId and endId using Dijkstra's algorithm.
 */
function dijkstra(graph, startId, endId) {
  if (!graph || !graph.nodes || !graph.nodes[startId] || !graph.nodes[endId]) return null;
  if (startId === endId) return [startId];

  const adj = {};
  Object.keys(graph.nodes).forEach(id => { adj[id] = []; });

  (graph.edges || []).forEach(e => {
    if (!adj[e.from] || !adj[e.to]) return;
    const w = Number(e.weight) || distanceBetween(graph.nodes[e.from], graph.nodes[e.to]);
    adj[e.from].push({ to: e.to, weight: w });
    adj[e.to].push({ to: e.from, weight: w });
  });

  const dist = {};
  const prev = {};
  const visited = new Set();

  Object.keys(graph.nodes).forEach(id => { dist[id] = Infinity; });
  dist[startId] = 0;

  while (true) {
    let u = null;
    let best = Infinity;
    for (const id in dist) {
      if (!visited.has(id) && dist[id] < best) {
        best = dist[id];
        u = id;
      }
    }
    if (u === null || u === endId) break;
    visited.add(u);

    for (const { to, weight } of adj[u]) {
      if (visited.has(to)) continue;
      const alt = dist[u] + weight;
      if (alt < dist[to]) {
        dist[to] = alt;
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

function distanceBetween(a, b) {
  if (!a || !b) return 1;
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
}

function computeRouteLength(graph, path) {
  if (!path || path.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = graph.nodes[path[i]];
    const b = graph.nodes[path[i + 1]];
    if (a && b && a.floor === b.floor && a.building === b.building) {
      sum += distanceBetween(a, b);
    }
  }
  return Math.round(sum);
}

/**
 * Computes human-friendly route metrics:
 * - 10 SVG pixels ≈ 1 meter on floor plan
 * - Each floor change via stairs adds ~8m of stairs and ~22s of vertical traversal time
 * - Flat walking speed ≈ 1.25 m/s (~75 m/min)
 */
function computeRouteMetrics(graph, path) {
  if (!graph || !graph.nodes || !path || path.length < 2) {
    return { meters: 0, seconds: 0, minutesText: '< 1 мин', floorChanges: 0, transitions: [] };
  }

  let flatPixels = 0;
  let floorChanges = 0;
  const transitions = [];

  for (let i = 0; i < path.length - 1; i++) {
    const a = graph.nodes[path[i]];
    const b = graph.nodes[path[i + 1]];
    if (!a || !b) continue;

    if (a.floor === b.floor && a.building === b.building) {
      flatPixels += Math.hypot(a.x - b.x, a.y - b.y);
    } else if (a.floor !== b.floor) {
      const diff = Math.abs(b.floor - a.floor);
      floorChanges += diff;
      transitions.push({
        fromFloor: a.floor,
        toFloor: b.floor,
        building: b.building,
        direction: b.floor > a.floor ? 'up' : 'down'
      });
    }
  }

  const flatMeters = flatPixels / 10;
  const stairMeters = floorChanges * 8;
  const meters = Math.max(1, Math.round(flatMeters + stairMeters));

  const flatSeconds = flatMeters / 1.25;
  const stairSeconds = floorChanges * 22;
  const seconds = Math.max(5, Math.round(flatSeconds + stairSeconds));

  let minutesText = '< 1 мин';
  if (seconds >= 45) {
    const mins = Math.max(1, Math.round(seconds / 60));
    minutesText = `~${mins} мин`;
  }

  return {
    meters,
    seconds,
    minutesText,
    floorChanges,
    transitions
  };
}

function computeTurn(graph, prevId, curId, nextId) {
  if (!nextId || !graph || !graph.nodes) return null;
  const p = graph.nodes[prevId];
  const c = graph.nodes[curId];
  const n = graph.nodes[nextId];
  if (!p || !c || !n) return null;
  if (p.floor !== c.floor || c.floor !== n.floor) return null;

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

const CATEGORY_RULES = [
  {
    triggers: ['столовая', 'столовка', 'буфет', 'поесть', 'еда', 'перекус', 'кафе', 'кофейня', 'обед'],
    types: ['buffet'],
    wordPrefixes: ['столов', 'буфет']
  },
  {
    triggers: ['спорт', 'спортзал', 'спортивный', 'тренажерный', 'тренажёрный', 'тренажерка', 'фитнес', 'физра', 'физкультура'],
    types: ['gym'],
    wordPrefixes: ['спорт', 'тренаж', 'фитнес', 'физвосп']
  },
  {
    triggers: ['туалет', 'wc', 'санузел', 'уборная', 'туалеты'],
    types: ['wc'],
    wordPrefixes: ['туалет', 'санузел']
  },
  {
    triggers: ['гардероб', 'раздевалка', 'вешалка', 'верхняя одежда', 'душ'],
    types: ['wardrobe'],
    wordPrefixes: ['гардероб', 'раздевалк', 'душ']
  },
  {
    triggers: ['медпункт', 'врач', 'медик', 'медкaбинет', 'аптечка'],
    types: ['medical'],
    wordPrefixes: ['медпункт', 'медиц']
  },
  {
    triggers: ['деканат', 'деканаты'],
    types: ['dekanat'],
    wordPrefixes: ['деканат']
  },
  {
    triggers: ['вход', 'выход', 'вахта'],
    types: ['entrance'],
    wordPrefixes: ['вход', 'выход', 'переход']
  },
  {
    triggers: ['музей'],
    types: ['museum'],
    wordPrefixes: ['музей']
  }
];

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

function tokenizeText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .match(/[а-яa-z0-9-]+/g) || [];
}

/**
 * Smart room search that avoids substring false positives (like "кафе" matching "кафедра").
 */
function searchRoomsInMeta(roomsMeta, query, limit = 20) {
  const raw = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!raw) return [];

  // Strip common filler words like "аудитория", "кабинет", "где"
  const queryTokens = tokenizeText(raw).filter(t => !['где', 'находится', 'как', 'найти'].includes(t));
  if (!queryTokens.length) return [];

  // Check if query triggers a known semantic category (e.g. столовая / буфет / туалет / спортзал)
  const matchedCategories = CATEGORY_RULES.filter(rule =>
    rule.triggers.some(tr => tr === raw || queryTokens.includes(tr))
  );

  const scored = [];

  for (const [id, meta] of Object.entries(roomsMeta || {})) {
    if (meta.type === 'stairs') continue; // Don't clutter room search with raw stairs

    const nameNorm = String(meta.name || '').toLowerCase().replace(/ё/g, 'е');
    const shortNorm = String(meta.shortName || '').toLowerCase().replace(/ё/g, 'е');
    const descNorm = String(meta.description || '').toLowerCase().replace(/ё/g, 'е');
    const words = tokenizeText(`${nameNorm} ${shortNorm} ${descNorm}`);

    let score = 0;

    // 1. Category match (if the query is a category trigger like "столовая", "буфет", "туалет")
    if (matchedCategories.length > 0) {
      let catHit = false;
      for (const cat of matchedCategories) {
        if (cat.types.includes(meta.type)) {
          score += 100;
          catHit = true;
        } else if (cat.wordPrefixes.some(pref => words.some(w => w.startsWith(pref)))) {
          score += 90;
          catHit = true;
        }
      }
      if (catHit) {
        scored.push({ id, meta, score });
      }
      continue;
    }

    // 2. Exact shortName or room number match (e.g. "110", "125а", "фвт")
    if (shortNorm && (shortNorm === raw || tokenizeText(shortNorm).includes(raw))) {
      score = 120;
      scored.push({ id, meta, score });
      continue;
    }

    // 3. Multi-token word-boundary matching
    let allTokensMatched = true;
    let tokenScoreSum = 0;

    for (const qToken of queryTokens) {
      // Guard against "кафе" matching "кафедра"/"кафедры"
      const isCafeQuery = qToken === 'кафе';

      let bestTokenScore = 0;
      for (const w of words) {
        if (isCafeQuery && w.startsWith('кафедр')) continue;

        if (w === qToken) {
          bestTokenScore = Math.max(bestTokenScore, 80);
        } else if (w.startsWith(qToken) && qToken.length >= 2) {
          bestTokenScore = Math.max(bestTokenScore, 60);
        } else if (
          qToken.length >= 5 &&
          w.length >= 5 &&
          Math.abs(qToken.length - w.length) <= 1 &&
          levenshtein(qToken, w) <= 1
        ) {
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
      // Boost primary teaching classrooms slightly over utility rooms when numbers match
      const typeBoost = meta.type === 'room' && meta.classroom ? 5 : 0;
      scored.push({ id, meta, score: tokenScoreSum + typeBoost });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.meta.name || '').localeCompare(String(b.meta.name || ''), 'ru', { numeric: true });
  });

  return scored.slice(0, limit).map(({ id, meta }) => ({ id, meta }));
}

module.exports = {
  generateNextNodeId,
  dijkstra,
  distanceBetween,
  computeRouteLength,
  computeRouteMetrics,
  computeTurn,
  searchRoomsInMeta
};
