// Pure graph, routing, smart search, schedule parsing, and AI tone utility functions for RadikMap (Карта РГРТУ)

function normalizeGraphNodes(graph) {
  const nodeMap = {};
  if (!graph || !graph.nodes) return nodeMap;
  if (Array.isArray(graph.nodes)) {
    for (const n of graph.nodes) {
      if (n && n.id) nodeMap[n.id] = n;
    }
  } else if (typeof graph.nodes === 'object') {
    for (const [id, n] of Object.entries(graph.nodes)) {
      if (n) nodeMap[id] = { id, ...n };
    }
  }
  return nodeMap;
}

/**
 * Generates the next smart gap-filling node ID for a given building and floor.
 */
function generateNextNodeId(nodes, building, floor) {
  const bCode = String(building || 'C').toLowerCase();
  const suffix = `_${bCode}_f${floor}`;
  const usedNumbers = new Set();

  const keys = Array.isArray(nodes) ? nodes.map(n => n.id) : Object.keys(nodes || {});
  keys.forEach(id => {
    if (id && id.endsWith(suffix)) {
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

function distanceBetween(a, b) {
  if (!a || !b) return 1;
  return Math.round(Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)));
}

/**
 * Finds the shortest path between startId and endId using Dijkstra's algorithm.
 * Supports options.includeOutdoor (default true).
 */
function dijkstra(graph, startId, endId, options = {}) {
  const includeOutdoor = options.includeOutdoor !== false;
  const nodeMap = normalizeGraphNodes(graph);
  if (!nodeMap[startId] || !nodeMap[endId]) return null;
  if (startId === endId) return [startId];

  const adj = {};
  Object.keys(nodeMap).forEach(id => { adj[id] = []; });

  (graph.edges || []).forEach(e => {
    if (!adj[e.from] || !adj[e.to]) return;
    const w = Number(e.weight) || distanceBetween(nodeMap[e.from], nodeMap[e.to]);
    adj[e.from].push({ to: e.to, weight: w });
    adj[e.to].push({ to: e.from, weight: w });
  });

  const dist = {};
  const prev = {};
  const visited = new Set();

  Object.keys(nodeMap).forEach(id => { dist[id] = Infinity; });
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
      if (!includeOutdoor && to !== startId && to !== endId) {
        const targetNode = nodeMap[to];
        if (targetNode && targetNode.type === 'outdoor') continue;
      }
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

function computeRouteLength(graph, path) {
  if (!path || path.length < 2) return 0;
  const nodeMap = normalizeGraphNodes(graph);
  let sum = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = nodeMap[path[i]];
    const b = nodeMap[path[i + 1]];
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
  const nodeMap = normalizeGraphNodes(graph);
  if (!path || path.length < 2 || Object.keys(nodeMap).length === 0) {
    return { meters: 0, seconds: 0, minutesText: '< 1 мин', floorChanges: 0, transitions: [] };
  }

  let flatPixels = 0;
  let floorChanges = 0;
  const transitions = [];

  for (let i = 0; i < path.length - 1; i++) {
    const a = nodeMap[path[i]];
    const b = nodeMap[path[i + 1]];
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
  const nodeMap = normalizeGraphNodes(graph);
  const p = nodeMap[prevId];
  const c = nodeMap[curId];
  const n = nodeMap[nextId];
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

  const queryTokens = tokenizeText(raw).filter(t => !['где', 'находится', 'как', 'найти'].includes(t));
  if (!queryTokens.length) return [];

  const matchedCategories = CATEGORY_RULES.filter(rule =>
    rule.triggers.some(tr => tr === raw || queryTokens.includes(tr))
  );

  const scored = [];

  for (const [id, meta] of Object.entries(roomsMeta || {})) {
    if (!meta || meta.type === 'stairs') continue;

    const nameNorm = String(meta.name || '').toLowerCase().replace(/ё/g, 'е');
    const shortNorm = String(meta.shortName || '').toLowerCase().replace(/ё/g, 'е');
    const descNorm = String(meta.description || '').toLowerCase().replace(/ё/g, 'е');
    const words = tokenizeText(`${nameNorm} ${shortNorm} ${descNorm}`);

    let score = 0;

    if (matchedCategories.length > 0) {
      let catHit = false;
      for (const cat of matchedCategories) {
        if (cat.types.includes(meta.type)) {
          score += 100;
          catHit = true;
        } else if (cat.wordPrefixes.some(pref => words.some(w => w.startsWith(pref)))) {
          if (cat.types.includes('buffet') && meta.type === 'lab') continue;
          score += 90;
          catHit = true;
        }
      }
      if (catHit) {
        scored.push({ id, meta, room: meta, score });
      }
      continue;
    }

    if (shortNorm && (shortNorm === raw || tokenizeText(shortNorm).includes(raw))) {
      score = 120;
      scored.push({ id, meta, room: meta, score });
      continue;
    }

    let allTokensMatched = true;
    let tokenScoreSum = 0;

    for (const qToken of queryTokens) {
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
      const typeBoost = meta.type === 'room' && meta.classroom ? 5 : 0;
      scored.push({ id, meta, room: meta, score: tokenScoreSum + typeBoost });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.meta.name || '').localeCompare(String(b.meta.name || ''), 'ru', { numeric: true });
  });

  return scored.slice(0, limit).map(({ id, meta }) => ({ id, meta, room: meta }));
}

function findBestRooms(query, rooms, limit = 5) {
  return searchRoomsInMeta(rooms, query, limit);
}

/**
 * Extracts normalized group names and optional subgroup tag from a raw group string.
 */
function extractGroupTokens(rawGroupStr) {
  if (!rawGroupStr || typeof rawGroupStr !== 'string') {
    return { groups: [], subgroup: '' };
  }
  const normalized = rawGroupStr.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  let subgroup = '';
  const subMatch = normalized.match(/(?:п\.?\s*г\.?\s*(\d+)|(?:^|,\s*)([1-4])\s*п\.?\s*г\.?)/i);
  if (subMatch) {
    const num = subMatch[1] || subMatch[2];
    subgroup = `п.г. ${num}`;
  }
  const withoutSub = normalized
    .replace(/,?\s*п\.?\s*г\.?\s*\d+/gi, '')
    .replace(/(?:^|,)\s*[1-4]\s*п\.?\s*г\.?/gi, '')
    .replace(/^гр\.?\s*/i, '')
    .trim();

  const parts = withoutSub.split(',').map(s => s.trim()).filter(Boolean);
  const groups = [];
  for (const part of parts) {
    const clean = part.replace(/^гр\.?\s*/i, '').trim();
    if (!clean) continue;
    if (/^(?:\d+\s*п\.?\s*г\.?|п\.?\s*г\.?\s*\d+|\d)$/i.test(clean)) continue;
    if (/^[\dА-Яа-яЁёA-Za-z-]+$/.test(clean)) {
      if (!groups.includes(clean)) groups.push(clean);
    } else {
      const leadMatch = clean.match(/^(\d{2,5}[А-Яа-яЁёA-Za-z]?)(?:[^0-9А-Яа-яЁёA-Za-z]|$)/);
      if (leadMatch && !groups.includes(leadMatch[1])) {
        groups.push(leadMatch[1]);
      }
    }
  }
  return { groups, subgroup };
}

/**
 * Formats an academic week date ("2026-11-02") and raw label ("02.11.2026, знам. (текущая)")
 * into a clean display label: "02.11.2026 · знаменатель"
 */
function formatWeekTriggerLabel(dateIso, rawLabel = '') {
  let ddmmyyyy = '';
  const isoMatch = String(dateIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    ddmmyyyy = `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  } else {
    const dMatch = String(rawLabel || '').match(/(\d{2}\.\d{2}\.\d{4})/);
    if (dMatch) ddmmyyyy = dMatch[1];
  }
  const lower = String(rawLabel || '').toLowerCase();
  let parity = '';
  if (lower.includes('числ')) parity = 'числитель';
  else if (lower.includes('знам')) parity = 'знаменатель';

  if (ddmmyyyy && parity) return `${ddmmyyyy} · ${parity}`;
  if (ddmmyyyy) return ddmmyyyy;
  return rawLabel || 'Текущая неделя';
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#039;/gi, "'");
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const RU_MONTHS_MAP = {
  'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
  'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
  'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'
};

/**
 * Parses a single schedule cell `<td>` from rasp.rsreu.ru (works for group, lecturer, or classroom tables).
 * Returns an array of lesson items in that cell (supporting multiple subgroups or multiple lessons in one slot).
 */
function parseScheduleCellHtml(tdHtml, timeRange, context = {}) {
  const { entityType = 'classroom', entityName = '', classroomToRoomMap = {} } = context;
  if (!tdHtml || !tdHtml.includes('schedule-lesson-type-badge')) return [];

  const parts = tdHtml.split(/<div(?:\s+class="schedule-cell-subgroup-item"|\s*)>/i)
    .filter(chunk => chunk.includes('schedule-lesson-type-badge'));

  const blocks = parts.length > 0 ? parts : [tdHtml];
  const results = [];

  for (const block of blocks) {
    const badgeMatch = block.match(/<span class="schedule-lesson-type-badge">[\s\S]*?<\/i>\s*([^<]+)<\/span>/i);
    const type = badgeMatch ? stripTags(badgeMatch[1]) : '';

    const lecturers = [];
    const lectRe = /<a[^>]*href="[^"]*\/schedule-frame\/lecturer\?[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm;
    while ((lm = lectRe.exec(block)) !== null) {
      const lName = stripTags(lm[1]).replace(/^((?:доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)\s+)ИнЯз\s+/i, '$1').trim();
      if (lName && !lecturers.includes(lName)) lecturers.push(lName);
    }

    const linkedGroups = [];
    const grpRe = /<a[^>]*href="[^"]*\/schedule-frame\/group\?[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let gm;
    while ((gm = grpRe.exec(block)) !== null) {
      const gName = stripTags(gm[1]);
      if (gName && !linkedGroups.includes(gName)) linkedGroups.push(gName);
    }

    const classrooms = [];
    const clsRe = /<a[^>]*href="[^"]*\/schedule-frame\/classroom\?([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let cm;
    while ((cm = clsRe.exec(block)) !== null) {
      const queryPart = decodeHtmlEntities(cm[1]);
      const idMatch = queryPart.match(/classroom=(\d+)/);
      const classroomId = idMatch ? idMatch[1] : null;
      const label = stripTags(cm[2]);
      classrooms.push({ classroomId, label });
    }

    const afterBadgeIdx = block.indexOf('</span>');
    let bodyAfterBadge = afterBadgeIdx >= 0 ? block.slice(afterBadgeIdx + 7) : block;
    let subjectArea = bodyAfterBadge.split(/<br\s*\/?>/i)[0] || '';
    subjectArea = subjectArea
      .replace(/,?\s*ауд\.?\s*<a[^>]*href="[^"]*classroom[^"]*"[\s\S]*$/i, '')
      .replace(/,?\s*<a[^>]*href="[^"]*classroom[^"]*"[\s\S]*$/i, '')
      .replace(/,?\s*<a[^>]*href="[^"]*lecturer[^"]*"[\s\S]*$/i, '');

    let rawSubject = stripTags(subjectArea).replace(/,+$/, '').trim();
    const subjParts = rawSubject.split(',').map(s => s.trim()).filter(Boolean);
    let subgroup = '';
    const filteredSubjParts = [];
    for (const sp of subjParts) {
      if (/^(?:п\.?\s*г\.?\s*\d+|\d+\s*п\.?\s*г\.?)$/i.test(sp)) {
        subgroup = sp.replace(/\s+/g, ' ');
      } else {
        filteredSubjParts.push(sp);
      }
    }
    const dedupedSubj = [];
    for (const p of filteredSubjParts) {
      if (dedupedSubj[dedupedSubj.length - 1] !== p) dedupedSubj.push(p);
    }
    const subject = dedupedSubj.join(', ') || rawSubject;

    let groupStr = '';
    let groups = [];
    if (entityType === 'group') {
      const baseGroup = entityName;
      groupStr = subgroup ? `${baseGroup} ${subgroup}` : baseGroup;
      groups = baseGroup ? [baseGroup] : [];
    } else if (linkedGroups.length > 0) {
      groupStr = subgroup ? `${linkedGroups.join(', ')} ${subgroup}` : linkedGroups.join(', ');
      const parsedTokens = extractGroupTokens(groupStr);
      groups = parsedTokens.groups.length > 0 ? parsedTokens.groups : linkedGroups;
      if (!subgroup && parsedTokens.subgroup) subgroup = parsedTokens.subgroup;
    }

    let lecturerStr = lecturers.join(', ');
    if (entityType === 'lecturer' && !lecturerStr && entityName) {
      lecturerStr = entityName;
    }

    let roomId = null;
    let roomShort = '';
    let roomFloor = null;
    let buildingName = '';

    if (classrooms.length > 0) {
      const firstCls = classrooms[0];
      const cleanLabel = firstCls.label ? firstCls.label.replace(/\s+[CBFLСВФЛ]$/i, '').trim() : '';
      const mapped = firstCls.classroomId ? classroomToRoomMap[String(firstCls.classroomId)] : null;
      if (mapped) {
        roomId = mapped.roomId;
        roomShort = (cleanLabel && cleanLabel !== '🏀') ? cleanLabel : mapped.roomShort;
        roomFloor = mapped.floor;
        buildingName = mapped.buildingName || 'Главный корпус';
      } else if (firstCls.label) {
        roomShort = cleanLabel || firstCls.label;
      }
    }

    results.push({
      time: timeRange,
      type,
      subject,
      subgroup,
      group: groupStr,
      groups,
      lecturer: lecturerStr,
      lecturers,
      roomId,
      roomShort,
      floor: roomFloor,
      buildingName
    });
  }

  return results;
}

/**
 * Parses a full rasp.rsreu.ru schedule-frame HTML page for a group, lecturer, or classroom.
 */
function parseRaspSchedulePageHtml(html, options = {}) {
  const { entityType = 'group', entityName = '', classroomToRoomMap = {}, fallbackYear = new Date().getFullYear() } = options;

  const availableWeeks = [];
  let selectedWeek = null;
  const dateSelectMatch = String(html || '').match(/<select[^>]*name="date"[^>]*>([\s\S]*?)<\/select>/i);
  if (dateSelectMatch) {
    const optRe = /<option\s+value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/gi;
    let om;
    while ((om = optRe.exec(dateSelectMatch[1])) !== null) {
      const val = om[1].trim();
      if (!val) continue;
      const rawLabel = stripTags(om[3]);
      const isSelected = /\bselected\b/i.test(om[2]);
      const isCurrent = /текущ/i.test(rawLabel);
      const weekObj = {
        value: val,
        rawLabel,
        label: formatWeekTriggerLabel(val, rawLabel),
        isSelected,
        isCurrent
      };
      availableWeeks.push(weekObj);
      if (isSelected) selectedWeek = weekObj;
    }
  }
  if (!selectedWeek && availableWeeks.length > 0) {
    selectedWeek = availableWeeks.find(w => w.isCurrent) || availableWeeks[0];
  }

  const baseYear = selectedWeek && selectedWeek.value
    ? Number(selectedWeek.value.slice(0, 4)) || fallbackYear
    : fallbackYear;

  if (!html || html.includes('Расписание не найдено') || html.includes('Для просмотра расписания выберите')) {
    return { empty: true, days: [], availableWeeks, selectedWeek };
  }

  const tableMatch = html.match(/<table class="table[^"]*">([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return { empty: true, days: [], availableWeeks, selectedWeek };
  }

  const tableHtml = tableMatch[1];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let m;
  while ((m = trRegex.exec(tableHtml)) !== null) rows.push(m[1]);
  if (rows.length < 2) {
    return { empty: true, days: [], availableWeeks, selectedWeek };
  }

  const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  const days = [];
  let thIdx = 0;
  while ((m = thRegex.exec(rows[0])) !== null) {
    if (thIdx > 0) {
      const raw = m[1];
      const dateSpan = raw.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
      const dateStr = dateSpan ? stripTags(dateSpan[1]) : '';
      const dayName = stripTags(raw.replace(/<span[^>]*>[\s\S]*?<\/span>/i, ''));

      let isoDate = '';
      const parts = dateStr.split(/\s+/);
      if (parts.length === 2 && RU_MONTHS_MAP[parts[1].toLowerCase()]) {
        const day = parts[0].padStart(2, '0');
        const month = RU_MONTHS_MAP[parts[1].toLowerCase()];
        isoDate = `${baseYear}-${month}-${day}`;
      }
      days.push({ date: isoDate, dateLabel: dateStr, dayName, lessons: [] });
    }
    thIdx++;
  }

  for (let r = 1; r < rows.length; r++) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    while ((m = tdRegex.exec(rows[r])) !== null) cells.push(m[1]);
    if (cells.length < 2) continue;

    const timeDivs = [];
    const divRe = /<div[^>]*>([\s\S]*?)<\/div>/gi;
    while ((m = divRe.exec(cells[0])) !== null) timeDivs.push(stripTags(m[1]));
    const timeRange = timeDivs.length >= 2 ? `${timeDivs[0]}–${timeDivs[1]}` : stripTags(cells[0]);

    for (let c = 1; c < cells.length && (c - 1) < days.length; c++) {
      const cellLessons = parseScheduleCellHtml(cells[c], timeRange, {
        entityType,
        entityName,
        classroomToRoomMap
      });
      for (const lesson of cellLessons) {
        days[c - 1].lessons.push(lesson);
      }
    }
  }

  return {
    empty: false,
    days,
    availableWeeks,
    selectedWeek
  };
}

const SUBJECT_SHORT_OVERRIDES = [
  { re: /^вычислительная\s+математика$/i, short: 'ВычМат' },
  { re: /^высшая\s+математика$/i, short: 'ВышМат' },
  { re: /^дискретная\s+математика$/i, short: 'ДискрМат' },
  { re: /^прикладная\s+математика$/i, short: 'ПриклМат' },
  { re: /^теория\s+вероятностей\s+и\s+математическая\s+статистика$/i, short: 'ТерВер' },
  { re: /^теория\s+вероятностей$/i, short: 'ТерВер' },
  { re: /^иностранный\s+язык$/i, short: 'ИнЯз' },
  { re: /^базы\s+данных$/i, short: 'БД' },
  { re: /^экономика\s+промышленности\s+и\s+управление\s+предприятием$/i, short: 'ЭПУП' },
  { re: /^интеллектуальные\s+методы\s+оптимизации$/i, short: 'ИМО' },
  { re: /^эвм\s+и\s+периферийные\s+устройства$/i, short: 'ЭВМиПУ' },
  { re: /^операционные\s+системы$/i, short: 'ОС' },
  { re: /^компьютерные\s+сети$/i, short: 'КС' },
  { re: /^сетевые\s+технологии$/i, short: 'СТ' },
  { re: /^физическая\s+культура\s+и\s+спорт$/i, short: 'Физкультура' },
  { re: /^элективные\s+дисциплины\s+по\s+физической\s+культуре\s+и\s+спорту$/i, short: 'Физкультура' },
  { re: /^безопасность\s+жизнедеятельности$/i, short: 'БЖД' },
  { re: /^учебная\s+практика$/i, short: 'УчПрак' },
  { re: /^производственная\s+практика$/i, short: 'ПроизвПрак' }
];

function normalizeSubjectNameForCheatSheet(rawSubject) {
  let s = String(rawSubject || 'Дисциплина').trim();
  const parts = s.split(/\s*(?:\/|,)\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const uniq = [];
    for (const p of parts) {
      if (!uniq.some(u => u.toLowerCase() === p.toLowerCase())) uniq.push(p);
    }
    if (uniq.length === 1) s = uniq[0];
  }
  return s;
}

function buildSubjectAbbreviation(subjectName) {
  const clean = normalizeSubjectNameForCheatSheet(subjectName);
  for (const item of SUBJECT_SHORT_OVERRIDES) {
    if (item.re.test(clean)) {
      return {
        shortName: item.short,
        fullName: clean,
        headerLabel: item.short.toLowerCase() === clean.toLowerCase()
          ? `${clean}:`
          : `${item.short} (${clean}):`
      };
    }
  }

  const stopWords = new Set(['и', 'в', 'на', 'по', 'для', 'с', 'со', 'к', 'от', 'из', 'о', 'об', 'при', 'или']);
  const words = clean.split(/[\s-]+/).map(w => w.replace(/[^А-Яа-яЁёA-Za-z0-9]/g, '')).filter(Boolean);
  const significant = words.filter(w => !stopWords.has(w.toLowerCase()));

  if (significant.length >= 2) {
    const abbr = words
      .map(w => {
        const lw = w.toLowerCase();
        if (lw === 'и') return 'и';
        if (stopWords.has(lw)) return '';
        if (w === w.toUpperCase() && w.length <= 5) return w;
        return w[0].toUpperCase();
      })
      .join('');
    if (abbr.length >= 2 && abbr.length <= 7) {
      return {
        shortName: abbr,
        fullName: clean,
        headerLabel: `${abbr} (${clean}):`
      };
    }
  }

  return {
    shortName: clean,
    fullName: clean,
    headerLabel: `${clean}:`
  };
}

function formatLecturerCheatSheetTitle(lectShort, meta = {}) {
  const fullFio = String(meta.fullFio || meta.fullName || '').trim();
  let pos = String(meta.positionShort || '').trim();
  let deg = String(meta.degreeShort || '').trim();

  if (!pos) {
    const prefixMatch = String(lectShort || '').match(/^(проф\.|доц\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)/i);
    if (prefixMatch) pos = prefixMatch[1].replace(/\s+/g, ' ').trim();
  }
  const regaliaSource = String(meta.metaLine || meta.regalia || '').trim();
  if (!deg && regaliaSource) {
    const degMatch = regaliaSource.match(/(?:^|[\s,;])((?:д|к)\.[а-яё.-]+н\.)/i);
    if (degMatch) deg = degMatch[1].trim();
  }
  if (!pos && regaliaSource) {
    const posMatch = regaliaSource.match(/(?:^|[\s,;])(проф\.|доц\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)/i);
    if (posMatch) pos = posMatch[1].replace(/\s+/g, ' ').trim();
  }

  const fioPart = fullFio || String(lectShort || '').replace(/^(проф\.|доц\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)\s*/i, '').trim();
  return [pos, deg, fioPart].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Builds a structured "Шпаргалка" (Cheat Sheet) grouped by discipline/subject.
 * Each subject entry contains its short abbreviation, full name, headerLabel,
 * and rows pairing lesson types (Лек., Упр., Лаб.) with full lecturer titles.
 */
function buildGroupCheatSheet(days, resolveLecturerMeta) {
  const bySubject = new Map();
  const TYPE_ORDER = ['Лек.', 'Упр.', 'Лаб.'];

  for (const day of (days || [])) {
    for (const lesson of (day.lessons || [])) {
      const rawLecturers = Array.isArray(lesson.lecturers) && lesson.lecturers.length > 0
        ? lesson.lecturers
        : (lesson.lecturer ? lesson.lecturer.split(',').map(s => s.trim()).filter(Boolean) : []);
      if (rawLecturers.length === 0) continue;

      const cleanSubj = normalizeSubjectNameForCheatSheet(lesson.subject || 'Дисциплина');
      const subjKey = cleanSubj.toLowerCase();
      if (!bySubject.has(subjKey)) {
        bySubject.set(subjKey, {
          subject: cleanSubj,
          shortSubject: cleanSubj,
          headerLabel: cleanSubj,
          typeToLecturers: new Map()
        });
      }

      const subjEntry = bySubject.get(subjKey);
      const lType = String(lesson.type || 'Занятие').trim();
      if (!subjEntry.typeToLecturers.has(lType)) {
        subjEntry.typeToLecturers.set(lType, new Map());
      }
      const lectMap = subjEntry.typeToLecturers.get(lType);

      for (const lectShort of rawLecturers) {
        if (!lectShort) continue;
        if (!lectMap.has(lectShort)) {
          const meta = typeof resolveLecturerMeta === 'function' ? (resolveLecturerMeta(lectShort) || {}) : {};
          const fullFio = meta.fullFio || meta.fullName || lectShort;
          const displayTitle = formatLecturerCheatSheetTitle(lectShort, meta);
          lectMap.set(lectShort, {
            shortName: lectShort,
            fullFio,
            displayTitle,
            metaLine: meta.metaLine || meta.regalia || '',
            department: meta.department || ''
          });
        }
      }
    }
  }

  const list = [];
  for (const subjEntry of bySubject.values()) {
    const orderedTypes = Array.from(subjEntry.typeToLecturers.keys()).sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a);
      const ib = TYPE_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b, 'ru');
    });

    // Merge lesson types that share the exact same set of lecturers for this subject
    const mergedRows = [];
    for (const lType of orderedTypes) {
      const lecturersArr = Array.from(subjEntry.typeToLecturers.get(lType).values());
      const sig = lecturersArr.map(l => l.shortName).sort().join('|');
      const existingRow = mergedRows.find(r => r._sig === sig);
      if (existingRow) {
        if (!existingRow.types.includes(lType)) existingRow.types.push(lType);
      } else {
        mergedRows.push({
          _sig: sig,
          types: [lType],
          lecturers: lecturersArr,
          text: lecturersArr.map(l => l.displayTitle).join(' и ')
        });
      }
    }

    const allLecturersMap = new Map();
    for (const r of mergedRows) {
      delete r._sig;
      for (const l of r.lecturers) {
        if (!allLecturersMap.has(l.shortName)) allLecturersMap.set(l.shortName, l);
      }
    }
    const allLecturers = Array.from(allLecturersMap.values());

    list.push({
      subject: subjEntry.subject,
      shortSubject: subjEntry.shortSubject,
      headerLabel: subjEntry.headerLabel,
      rows: mergedRows,
      lecturers: allLecturers,
      // Backward-compatible summary fields
      fullFio: allLecturers.map(l => l.fullFio).join(', '),
      shortName: allLecturers.map(l => l.shortName).join(', '),
      disciplines: [{
        subject: subjEntry.subject,
        types: orderedTypes
      }]
    });
  }

  list.sort((a, b) => a.subject.localeCompare(b.subject, 'ru'));
  return list;
}

/**
 * Computes the map pan delta (in layer pixels) required when changing rotation angle
 * from oldAngleDeg to newAngleDeg so that the map point currently under the camera pivot
 * (pivotX, pivotY) remains completely stationary on screen (Yandex Maps camera-axis style).
 */
function computeCameraPivotRotationOffset({ pivotX, pivotY, centerX, centerY, oldAngleDeg, newAngleDeg }) {
  const vx = (Number(pivotX) || 0) - (Number(centerX) || 0);
  const vy = (Number(pivotY) || 0) - (Number(centerY) || 0);
  const dRad = ((Number(newAngleDeg) || 0) - (Number(oldAngleDeg) || 0)) * (Math.PI / 180);
  if (Math.abs(dRad) < 1e-7) return { shiftX: 0, shiftY: 0 };
  const cos = Math.cos(dRad);
  const sin = Math.sin(dRad);
  const rvx = vx * cos - vy * sin;
  const rvy = vx * sin + vy * cos;
  return {
    shiftX: rvx - vx,
    shiftY: rvy - vy
  };
}

/**
 * Finds upcoming lessons starting within [minLead, maxLead] minutes (default 1..16 min)
 * for a Telegram-subscribed user, with fallback matching by weekday name if ISO date differs.
 */
function findUpcomingLessonRemindersForUser({
  user,
  days = [],
  todayISO = '',
  todayDayName = '',
  nowMin = 0,
  minLead = 1,
  maxLead = 16
}) {
  if (!user || !user.telegramId || !user.notificationsEnabled || !user.targetName) return [];
  if (!Array.isArray(days) || days.length === 0) return [];

  let todayDay = todayISO ? days.find(d => d && d.date === todayISO) : null;
  if (!todayDay && todayDayName) {
    const normTarget = String(todayDayName).trim().toLowerCase();
    todayDay = days.find(d => d && String(d.dayName || '').trim().toLowerCase() === normTarget);
  }
  if (!todayDay || !Array.isArray(todayDay.lessons) || todayDay.lessons.length === 0) return [];

  const results = [];
  for (const lesson of todayDay.lessons) {
    const m = String(lesson.time || '').match(/^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const diffMin = startMin - nowMin;
    if (diffMin >= minLead && diffMin <= maxLead) {
      const slotKey = `${todayISO || todayDay.date || todayDayName}|${lesson.time}|${lesson.subject}|${lesson.roomId || lesson.roomShort || ''}`;
      if (user.lastNotifiedSlot === slotKey) continue;
      results.push({
        slotKey,
        minutesLeft: diffMin,
        lesson: {
          time: lesson.time,
          type: lesson.type || '',
          subject: lesson.subject || '',
          roomShort: lesson.roomShort || '',
          floor: lesson.floor,
          group: lesson.group || '',
          lecturer: lesson.lecturer || (Array.isArray(lesson.lecturers) ? lesson.lecturers.join(', ') : '')
        }
      });
    }
  }
  return results;
}

/**
 * Detects user conversational tone for mood-aware "ИИ'шка" responses.
 * Returns 'rude' | 'friendly' | 'neutral'.
 */
function detectUserTone(message) {
  const q = String(message || '').toLowerCase().trim();
  if (!q) return 'neutral';

  const rudePatterns = [
    /(?:^|[^а-яёa-z0-9])(туп(ой|ая|ое|ые|ица)|идиот|дурак|дура|дебил|кретин|бесполезн|отстой|хрень|фигн|херн|говн|дерьм|урод|бесишь|достал|заткнись|тормоз|лох|чмо|мусор|помойк|кривой|убог)/i,
    /(ничего не (знаешь|умеешь|можешь)|толку от тебя|ты вообще работаешь|че за бред|что за бред|какого черта|какого фига)/i
  ];
  for (const re of rudePatterns) {
    if (re.test(q)) return 'rude';
  }

  const friendlyPatterns = [
    /(?:^|[^а-яёa-z0-9])(привет|здравствуй|добр(ый|ое|ого)|хай|хелло|салют|спасибо|благодарю|пасиб|сяп|пожалуйста|красавчик|молодец|супер|отлично|круто|лучший|умница|как дела|как жизнь|как ты)(?:$|[^а-яёa-z0-9])/i
  ];
  for (const re of friendlyPatterns) {
    if (re.test(q)) return 'friendly';
  }

  return 'neutral';
}

module.exports = {
  generateNextNodeId,
  dijkstra,
  distanceBetween,
  computeRouteLength,
  computeRouteMetrics,
  computeTurn,
  searchRoomsInMeta,
  findBestRooms,
  levenshtein,
  extractGroupTokens,
  formatWeekTriggerLabel,
  parseScheduleCellHtml,
  parseRaspSchedulePageHtml,
  buildGroupCheatSheet,
  computeCameraPivotRotationOffset,
  findUpcomingLessonRemindersForUser,
  detectUserTone
};
