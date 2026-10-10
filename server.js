const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const cheerio = require('cheerio');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, 'data', 'cache.json');
const GRAPH_FILE = path.join(ROOT, 'data', 'graph.json');
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const DAY_NAMES_GENITIVE = {
  'понедельник': 'понедельника',
  'вторник':     'вторника',
  'среда':       'среды',
  'четверг':     'четверга',
  'пятница':     'пятницы',
  'суббота':     'субботы',
  'воскресенье': 'воскресенья'
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2'
};

let roomsMeta = {};
let scheduleCache = {};
let cacheStatus = { ready: false, warming: false, progress: '0/0', lastUpdate: null };

try {
  const roomsPath = path.join(ROOT, 'data', 'rooms.json');
  roomsMeta = JSON.parse(fs.readFileSync(roomsPath, 'utf8'));
  console.log(`[init] Загружено ${Object.keys(roomsMeta).length} помещений`);
} catch (e) {
  console.error('[init] Не удалось загрузить rooms.json:', e.message);
}

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      scheduleCache = data.cache || {};
      cacheStatus.lastUpdate = data.lastUpdate || null;
      cacheStatus.ready = Object.keys(scheduleCache).length > 0;
      console.log(`[cache] Загружено из файла: ${Object.keys(scheduleCache).length} записей`);
      return true;
    }
  } catch (e) {
    console.error('[cache] Ошибка загрузки файла:', e.message);
  }
  return false;
}

function saveCacheToDisk() {
  try {
    const payload = { lastUpdate: cacheStatus.lastUpdate, cache: scheduleCache };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
  } catch (e) {
    console.error('[cache] Ошибка сохранения файла:', e.message);
  }
}

async function fetchScheduleHtml(building, classroom, date) {
  const url = `https://rasp.rsreu.ru/schedule-frame/classroom?building=${encodeURIComponent(building)}&classroom=${encodeURIComponent(classroom)}&date=${encodeURIComponent(date)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CampusMap/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ru-RU,ru;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseScheduleWithCheerio(html, mondayISO) {
  const $ = cheerio.load(html);

  const dateSelect = $('select[name="date"]');
  const dateOptions = dateSelect.find('option').filter((_, el) => $(el).attr('value')).length;
  if (dateOptions === 0) return { empty: true, days: [] };

  const table = $('table.table').first();
  if (!table.length) return { empty: true, days: [] };

  const rows = table.find('tr').toArray();
  if (rows.length < 2) return { empty: false, days: [] };

  const headerCells = $(rows[0]).find('th').toArray().slice(1);
  const monday = new Date(mondayISO);

  const days = headerCells.map((th, i) => {
    const $th = $(th);
    const fullTitle = $th.text().replace(/\s+/g, ' ').trim();
    const dayName = fullTitle.split(' ').pop();
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, dayName, lessons: [] };
  });

  for (let i = 1; i < rows.length; i++) {
    const cells = $(rows[i]).find('td').toArray();
    if (cells.length < 2) continue;
    const timeDivs = $(cells[0]).find('div').toArray();
    const start = timeDivs[0] ? $(timeDivs[0]).text().trim() : '';
    const end   = timeDivs[1] ? $(timeDivs[1]).text().trim() : '';
    if (!start || !end) continue;
    const time = `${start}–${end}`;
    for (let d = 0; d < days.length; d++) {
      const cell = cells[d + 1];
      if (!cell) continue;
      const $cell = $(cell);
      if (!$cell.hasClass('schedule-cell')) continue;
      $cell.children('div').each((_, el) => {
        const $div = $(el);
        const badge = $div.find('.schedule-lesson-type-badge');
        const type = badge.length ? badge.text().trim() : '';
        const clone = $div.clone();
        clone.find('.schedule-lesson-type-badge').remove();
        const text = clone.text().replace(/\s+/g, ' ').trim();
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

function getCurrentMondayISO() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const shift = today.getDay() === 0 ? 1 : 1 - today.getDay();
  monday.setDate(today.getDate() + shift);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

let warmUpRunning = false;

async function warmUpCache() {
  if (warmUpRunning) return;
  warmUpRunning = true;

  const entries = Object.entries(roomsMeta).filter(([, meta]) => !!meta.classroom);
  const total = entries.length;
  let done = 0;

  cacheStatus.warming = true;
  cacheStatus.progress = `0/${total}`;
  console.log(`[warm-up] Начинаю прогрев ${total} аудиторий…`);

  const mondayISO = getCurrentMondayISO();
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 200;
  const newCache = {};
  const startedAt = Date.now();

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async ([id, meta]) => {
      try {
        const html = await fetchScheduleHtml(meta.building, meta.classroom, mondayISO);
        const parsed = parseScheduleWithCheerio(html, mondayISO);
        newCache[id] = { empty: parsed.empty, days: parsed.days, fetchedAt: Date.now() };
      } catch (e) {
        if (scheduleCache[id]) {
          newCache[id] = scheduleCache[id];
        } else {
          newCache[id] = { empty: true, days: [], error: e.message, fetchedAt: Date.now() };
        }
        console.error(`[warm-up] ${id}: ${e.message}`);
      }
      done++;
    }));
    cacheStatus.progress = `${done}/${total}`;
    if (i + BATCH_SIZE < entries.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  scheduleCache = newCache;
  cacheStatus.ready = true;
  cacheStatus.warming = false;
  cacheStatus.lastUpdate = Date.now();

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`[warm-up] Готово за ${elapsed} с. Аудиторий: ${Object.keys(newCache).length}`);
  saveCacheToDisk();
  warmUpRunning = false;
}

function parseLessonTime(time) {
  const m = time.match(/(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] };
}

function computeFreeStatus(roomId) {
  const entry = scheduleCache[roomId];
  if (!entry) return { status: 'free', untilText: 'нет пар', noSchedule: true };

  const hasAnyLesson = !entry.empty &&
                       Array.isArray(entry.days) &&
                       entry.days.some(d => d.lessons.length > 0);

  if (!hasAnyLesson) return { status: 'free', untilText: 'нет пар', noSchedule: true };

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const today = entry.days.find(d => d.date === todayISO);

  if (!today || today.lessons.length === 0) {
    const upcoming = entry.days
      .filter(d => d.date > todayISO && d.lessons.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length) {
      const name = upcoming[0].dayName.toLowerCase();
      const genitive = DAY_NAMES_GENITIVE[name] || name;
      return { status: 'free', untilText: `до ${genitive}` };
    }
    return { status: 'free', untilText: 'до конца недели' };
  }

  const lessons = today.lessons.map(l => {
    const t = parseLessonTime(l.time);
    if (!t) return null;
    return { ...t, raw: l };
  }).filter(Boolean).sort((a, b) => a.start - b.start);

  const current = lessons.find(l => nowMin >= l.start && nowMin <= l.end);
  if (current) return null;

  const next = lessons.find(l => l.start > nowMin);
  if (next) {
    const startTime = next.raw.time.match(/^(\d{1,2}:\d{2})/)[1];
    return { status: 'free', untilText: `до ${startTime}` };
  }
  return { status: 'free', untilText: 'до конца дня' };
}

function computeBusyStatus(roomId) {
  const entry = scheduleCache[roomId];
  if (!entry || entry.empty) return null;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const today = entry.days.find(d => d.date === todayISO);
  if (!today) return null;

  const current = today.lessons.find(l => {
    const t = parseLessonTime(l.time);
    if (!t) return false;
    return nowMin >= t.start && nowMin <= t.end;
  });
  if (!current) return null;

  const endMatch = current.time.match(/[–-](\d{1,2}:\d{2})/);
  return { subject: current.subject, untilText: endMatch ? endMatch[1] : '' };
}

// ============ HTTP-СЕРВЕР ============

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10_000_000) reject(new Error('too big')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // --- API: сохранение graph.json ---
  if (url.pathname === '/api/graph/save' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      if (!parsed.nodes || !parsed.edges) throw new Error('invalid graph structure');
      fs.writeFileSync(GRAPH_FILE, JSON.stringify(parsed, null, 2));
      console.log(`[graph] сохранён: ${Object.keys(parsed.nodes).length} узлов, ${parsed.edges.length} рёбер`);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error('[graph/save]', e.message);
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Save error: ' + e.message);
    }
    return;
  }

  if (url.pathname === '/api/schedule') {
    const building = url.searchParams.get('building');
    const classroom = url.searchParams.get('classroom');
    const date = url.searchParams.get('date');
    if (!building || !classroom || !date) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing params');
      return;
    }
    try {
      const html = await fetchScheduleHtml(building, classroom, date);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(html);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy error: ' + e.message);
    }
    return;
  }

  if (url.pathname === '/api/cache-status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(cacheStatus));
    return;
  }

  if (url.pathname === '/api/free-now') {
    if (!cacheStatus.ready) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'warming', progress: cacheStatus.progress }));
      return;
    }
    const buildingFilter = url.searchParams.get('building');
    const free = [];
    const busy = [];
    for (const [id, meta] of Object.entries(roomsMeta)) {
      if (buildingFilter && meta.building !== buildingFilter) continue;
      if (!meta.classroom) continue;
      const st = computeFreeStatus(id);
      if (st) {
        free.push({
          id, name: meta.name, building: meta.building, floor: meta.floor,
          untilText: st.untilText,
          noSchedule: !!st.noSchedule
        });
      } else {
        const bs = computeBusyStatus(id);
        if (bs) {
          busy.push({
            id, name: meta.name, building: meta.building, floor: meta.floor,
            subject: bs.subject,
            untilText: bs.untilText
          });
        }
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      updatedAt: cacheStatus.lastUpdate,
      total: free.length,
      busyTotal: busy.length,
      free,
      busy
    }));
    return;
  }

  if (url.pathname === '/api/warm-up') {
    warmUpCache();
    res.writeHead(202, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Warm-up triggered');
    return;
  }

  let urlPath = decodeURIComponent(url.pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✅  Сервер запущен');
  console.log('  🌐  http://localhost:' + PORT);
  console.log('  🛠  Редактор графа: http://localhost:' + PORT + '/editor.html');
  console.log('  🛑  Остановить: Ctrl + C');
  console.log('');

  loadCacheFromDisk();
  if (cacheStatus.ready && cacheStatus.lastUpdate && Date.now() - cacheStatus.lastUpdate < REFRESH_INTERVAL_MS) {
    console.log(`[cache] Кэш актуален`);
  } else {
    console.log('[cache] Запускаю прогрев…');
    warmUpCache();
  }
  setInterval(() => { console.log('[cache] Плановое обновление…'); warmUpCache(); }, REFRESH_INTERVAL_MS);
});