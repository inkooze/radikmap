const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const cheerio = require('cheerio');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const { searchRoomsInMeta } = require('./js/graph-utils.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, 'data', 'cache.json');
const GRAPH_FILE = path.join(ROOT, 'data', 'graph.json');
const GRAPH_BACKUP_FILE = path.join(ROOT, 'data', 'graph.backup.json');
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function getEditorPassword() {
  return String(process.env.EDITOR_PASSWORD || process.env.ADMIN_TOKEN || 'radik-admin-2026').trim();
}

function getValidEditorToken() {
  return crypto
    .createHmac('sha256', getEditorPassword())
    .update('radikmap-editor-auth-v1')
    .digest('hex');
}

function isEditorAuthorized(req) {
  const headerToken = String(req.headers['x-editor-token'] || '').trim();
  const validToken = getValidEditorToken();
  if (!headerToken || headerToken.length !== validToken.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(validToken));
  } catch (e) {
    return false;
  }
}

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
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf'
};

let roomsMeta = {};
let scheduleCache = {};
let cacheStatus = { ready: false, warming: false, progress: '0/0', lastUpdate: null };
let scheduleIndex = {
  lecturers: new Map(), // name -> { name, shortName, surname, rooms: Set, lessonsCount, daysMap: Map }
  groups: new Map(),    // group -> { name, rooms: Set, lessonsCount, daysMap: Map }
  orderedDates: []      // [{ date, dayName }]
};

try {
  const roomsPath = path.join(ROOT, 'data', 'rooms.json');
  roomsMeta = JSON.parse(fs.readFileSync(roomsPath, 'utf8'));
  console.log(`[init] Загружено ${Object.keys(roomsMeta).length} помещений`);
} catch (e) {
  console.error('[init] Не удалось загрузить rooms.json:', e.message);
}

// Разделение строки после "гр." на список групп и ФИО преподавателя
function splitGroupAndLecturer(groupStr, lecturerStr) {
  const combined = [groupStr, lecturerStr]
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .join(', ');
  if (!combined) return { group: '', groups: [], lecturer: '' };

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

  // Извлекаем чистые номера групп (например из "445 1 п.г." -> "445")
  const cleanGroups = [];
  for (const gt of groupTokens) {
    const cleaned = gt
      .replace(/\b\d+\s*п\.?\s*г\.?\b/gi, '')
      .replace(/\bп\.?\s*г\.?\s*\d+\b/gi, '')
      .replace(/[()]/g, ' ')
      .trim();
    const matches = cleaned.match(/\b\d{2,5}[а-яa-z]?\b/gi);
    if (matches) {
      matches.forEach(m => {
        if (!cleanGroups.includes(m)) cleanGroups.push(m);
      });
    } else if (cleaned && !cleanGroups.includes(cleaned)) {
      cleanGroups.push(cleaned);
    }
  }

  return {
    group: groupTokens.join(', '),
    groups: cleanGroups,
    lecturer: lecturerTokens.join(', ')
  };
}

function parseLessonText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.*?),?\s*гр\.\s*(.+)$/);
  if (!m) {
    return { subject: clean, group: '', groups: [], lecturer: '' };
  }
  const subject = m[1].replace(/,\s*$/, '').trim();
  const { group, groups, lecturer } = splitGroupAndLecturer(m[2], '');
  return { subject, group, groups, lecturer };
}

function normalizeScheduleCache() {
  for (const entry of Object.values(scheduleCache)) {
    if (!entry || !Array.isArray(entry.days)) continue;
    for (const day of entry.days) {
      if (!Array.isArray(day.lessons)) continue;
      for (const l of day.lessons) {
        const fixed = splitGroupAndLecturer(l.group, l.lecturer);
        l.group = fixed.group;
        l.groups = fixed.groups;
        l.lecturer = fixed.lecturer;
      }
    }
  }
}

function extractLecturerSurname(lecturerName) {
  const clean = String(lecturerName || '')
    .replace(/^(доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)\s*/gi, '')
    .trim();
  const m = clean.match(/^([А-ЯЁа-яё-]+)/);
  return m ? m[1].toLowerCase().replace(/ё/g, 'е') : clean.toLowerCase().replace(/ё/g, 'е');
}

function rebuildScheduleIndex() {
  const lecturers = new Map();
  const groups = new Map();
  const datesMap = new Map();

  for (const [roomId, entry] of Object.entries(scheduleCache)) {
    if (!entry || entry.empty || !Array.isArray(entry.days)) continue;
    const meta = roomsMeta[roomId];
    if (!meta) continue;

    for (const day of entry.days) {
      if (!day.date) continue;
      if (!datesMap.has(day.date)) {
        datesMap.set(day.date, day.dayName || '');
      }
      for (const lesson of (day.lessons || [])) {
        const fixed = splitGroupAndLecturer(lesson.group, lesson.lecturer);
        const lessonRecord = {
          date: day.date,
          dayName: day.dayName,
          time: lesson.time,
          type: lesson.type || '',
          subject: lesson.subject || '',
          group: fixed.group,
          groups: fixed.groups,
          lecturer: fixed.lecturer,
          roomId,
          roomName: meta.name,
          roomShort: meta.shortName || meta.classroom || meta.name,
          floor: meta.floor,
          building: meta.building
        };

        // Индексируем преподавателя
        if (fixed.lecturer) {
          const lecKey = fixed.lecturer;
          if (!lecturers.has(lecKey)) {
            const shortName = lecKey.replace(/^(доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.)\s*/i, '').trim();
            lecturers.set(lecKey, {
              name: lecKey,
              shortName,
              surname: extractLecturerSurname(lecKey),
              rooms: new Set(),
              lessons: []
            });
          }
          const lecObj = lecturers.get(lecKey);
          lecObj.rooms.add(roomId);
          lecObj.lessons.push(lessonRecord);
        }

        // Индексируем каждую группу
        for (const grp of fixed.groups) {
          if (!groups.has(grp)) {
            groups.set(grp, {
              name: grp,
              rooms: new Set(),
              lessons: []
            });
          }
          const grpObj = groups.get(grp);
          grpObj.rooms.add(roomId);
          grpObj.lessons.push(lessonRecord);
        }
      }
    }
  }

  const orderedDates = [...datesMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayName]) => ({ date, dayName }));

  scheduleIndex = { lecturers, groups, orderedDates };
  console.log(`[index] Проиндексировано преподавателей: ${lecturers.size}, групп: ${groups.size}`);
}

function buildEntityScheduleResponse(entityType, entityObj) {
  if (!entityObj) return null;
  const orderedDates = scheduleIndex.orderedDates.length > 0
    ? scheduleIndex.orderedDates
    : [];

  // Группируем уроки по дате и времени (чтобы не дублировать одинаковые слоты)
  const days = orderedDates.map(({ date, dayName }) => {
    const dayLessonsRaw = entityObj.lessons.filter(l => l.date === date);
    const dedupMap = new Map();
    for (const l of dayLessonsRaw) {
      const key = `${l.time}|${l.type}|${l.subject}|${l.roomId}|${l.group}|${l.lecturer}`;
      if (!dedupMap.has(key)) dedupMap.set(key, l);
    }
    const lessons = [...dedupMap.values()].sort((a, b) => a.time.localeCompare(b.time));
    return { date, dayName, lessons };
  });

  // Вычисляем статус «Сейчас у группы / преподавателя»
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayISO = `${yyyy}-${mm}-${dd}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let nowStatus = { type: 'free', title: 'Сейчас пар нет', details: 'На этой неделе больше нет пар по расписанию' };
  const todayDay = days.find(d => d.date === todayISO);

  if (todayDay && todayDay.lessons.length > 0) {
    const current = todayDay.lessons.find(l => {
      const t = parseLessonTime(l.time);
      return t && nowMin >= t.start && nowMin <= t.end;
    });
    if (current) {
      const endMatch = current.time.match(/[–-](\d{1,2}:\d{2})/);
      nowStatus = {
        type: 'busy',
        title: `Сейчас идёт пара · ауд. ${current.roomShort}`,
        details: `${current.subject}${endMatch ? ' · до ' + endMatch[1] : ''}`,
        roomId: current.roomId
      };
    } else {
      const next = todayDay.lessons.find(l => {
        const t = parseLessonTime(l.time);
        return t && t.start > nowMin;
      });
      if (next) {
        const startMatch = next.time.match(/^(\d{1,2}:\d{2})/);
        nowStatus = {
          type: 'free',
          title: 'Сейчас свободно',
          details: `Следующая пара сегодня в ${startMatch ? startMatch[1] : next.time} · ауд. ${next.roomShort} (${next.subject})`,
          roomId: next.roomId
        };
      }
    }
  }

  if (nowStatus.type === 'free' && !nowStatus.roomId) {
    const upcomingDay = days.find(d => d.date > todayISO && d.lessons.length > 0) || days.find(d => d.lessons.length > 0);
    if (upcomingDay && upcomingDay.lessons.length > 0) {
      const first = upcomingDay.lessons[0];
      const startMatch = first.time.match(/^(\d{1,2}:\d{2})/);
      nowStatus = {
        type: 'free',
        title: 'Сейчас пар нет',
        details: `Ближайшая пара: ${upcomingDay.dayName}${startMatch ? ' в ' + startMatch[1] : ''} · ауд. ${first.roomShort} (${first.subject})`,
        roomId: first.roomId
      };
    }
  }

  const roomsList = [...entityObj.rooms]
    .map(id => {
      const m = roomsMeta[id];
      if (!m) return null;
      return { id, name: m.name, shortName: m.shortName || m.classroom || m.name, floor: m.floor, building: m.building };
    })
    .filter(Boolean);

  return {
    entityType,
    name: entityObj.name,
    shortName: entityObj.shortName || entityObj.name,
    rooms: roomsList,
    lessonsCount: days.reduce((acc, d) => acc + d.lessons.length, 0),
    nowStatus,
    days
  };
}

function findMatchingLecturers(query) {
  const q = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!q) return [];
  const words = q
    .split(/[^a-zа-я0-9-]+/i)
    .filter(w => w.length >= 3 && !['как', 'где', 'какие', 'каких', 'какое', 'расписание', 'пары', 'пара', 'будут', 'будет', 'этой', 'неделе', 'аудиториях', 'аудитории', 'преподавателя', 'преподаватель', 'доцент', 'профессор', 'сегодня', 'завтра', 'понедельник', 'вторник', 'среду', 'среда', 'четверг', 'пятницу', 'пятница', 'субботу', 'суббота'].includes(w));

  const matches = [];
  for (const lec of scheduleIndex.lecturers.values()) {
    const fullLower = lec.name.toLowerCase().replace(/ё/g, 'е');
    const surname = lec.surname;
    if (!surname || surname.length < 3) continue;

    // 1. Прямое вхождение фамилии или ФИО
    if (fullLower.includes(q) || q.includes(surname)) {
      matches.push({ lec, score: 100 });
      continue;
    }

    // 2. Сравнение по основе фамилии с учётом падежей (Устюков -> устюкова / устюкову / устюковым)
    const stem = surname.length >= 5 ? surname.slice(0, -1) : surname;
    for (const w of words) {
      if (w === surname || w.startsWith(surname) || (stem.length >= 4 && w.startsWith(stem) && Math.abs(w.length - surname.length) <= 3)) {
        matches.push({ lec, score: 90 });
        break;
      }
    }
  }
  return matches.sort((a, b) => b.score - a.score || b.lec.lessons.length - a.lec.lessons.length).map(m => m.lec);
}

function findMatchingGroups(query) {
  const q = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!q) return [];

  // Если в запросе явно указан этаж («1 этаж») или «аудитория 100», не путаем с группой
  const cleaned = q
    .replace(/\b\d\s*(?:-м|-й|м|й)?\s*этаж[а-я]*/gi, '')
    .replace(/\b(?:ауд|аудитория|аудитории|кабинет|каб)\.?\s*\d+[а-яa-z]?\b/gi, '');

  const tokens = cleaned.match(/\b\d{2,5}[а-яa-z]?\b/gi) || [];
  const exact = [];
  const prefix = [];

  for (const tok of tokens) {
    // Если это просто число без слова «группа» / «гр», проверим, есть ли такая группа в индексе
    if (scheduleIndex.groups.has(tok)) {
      const g = scheduleIndex.groups.get(tok);
      // Если пользователь просто ввёл номер, который также является аудиторией (например "210"),
      // считаем группой только если есть слово "гр"/"группа" или такой аудитории нет
      const isAlsoRoom = Object.values(roomsMeta).some(m => String(m.classroom || '').toLowerCase() === tok.toLowerCase());
      const hasGroupKeyword = /(?:гр\.?|групп[а-я]*)/i.test(q);
      if (!isAlsoRoom || hasGroupKeyword) {
        if (!exact.includes(g)) exact.push(g);
      }
    }
    if (tok.length >= 2) {
      for (const [grpName, grpObj] of scheduleIndex.groups.entries()) {
        if (grpName !== tok && grpName.startsWith(tok) && !exact.includes(grpObj) && !prefix.includes(grpObj)) {
          prefix.push(grpObj);
        }
      }
    }
  }
  return [...exact, ...prefix];
}

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      scheduleCache = data.cache || {};
      cacheStatus.lastUpdate = data.lastUpdate || null;
      cacheStatus.ready = Object.keys(scheduleCache).length > 0;
      normalizeScheduleCache();
      rebuildScheduleIndex();
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
        const { subject, group, groups, lecturer } = parseLessonText(text);
        days[d].lessons.push({ time, type, subject, group, groups, lecturer });
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
  normalizeScheduleCache();
  rebuildScheduleIndex();
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

// ============ ИИ-НАВИГАТОР КАМПУСА ============

function enrichRoomCard(id) {
  const meta = roomsMeta[id];
  if (!meta) return null;
  let statusType = null;
  let statusText = '';
  if (meta.classroom && cacheStatus.ready) {
    const freeSt = computeFreeStatus(id);
    if (freeSt) {
      statusType = 'free';
      statusText = `Свободна (${freeSt.untilText})`;
    } else {
      const busySt = computeBusyStatus(id);
      if (busySt) {
        statusType = 'busy';
        statusText = `Занята до ${busySt.untilText} · ${busySt.subject}`;
      }
    }
  }
  return {
    id,
    name: meta.name,
    shortName: meta.shortName,
    floor: meta.floor,
    building: meta.building,
    type: meta.type,
    description: meta.description || null,
    statusType,
    statusText
  };
}

function detectDayFilterInQuery(q) {
  const dayMatchers = [
    { rx: /понедельник|пн\b/i, dayName: 'Понедельник' },
    { rx: /вторник|вт\b/i,     dayName: 'Вторник' },
    { rx: /сред[ауе]|ср\b/i,   dayName: 'Среда' },
    { rx: /четверг|чт\b/i,     dayName: 'Четверг' },
    { rx: /пятниц[ауе]|пт\b/i, dayName: 'Пятница' },
    { rx: /суббот[ауе]|сб\b/i, dayName: 'Суббота' }
  ];
  for (const m of dayMatchers) {
    if (m.rx.test(q)) return m.dayName;
  }
  const now = new Date();
  const jsDayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  if (/сегодня/i.test(q)) {
    return jsDayNames[now.getDay()];
  }
  if (/завтра/i.test(q)) {
    return jsDayNames[(now.getDay() + 1) % 7];
  }
  return null;
}

function formatEntityScheduleForAi(entitySchedule, dayFilter = null) {
  const daysToFormat = dayFilter
    ? entitySchedule.days.filter(d => d.dayName.toLowerCase() === dayFilter.toLowerCase())
    : entitySchedule.days.filter(d => d.lessons.length > 0);

  const uniqueRoomIds = new Set();
  const uniqueRoomShorts = new Set();

  daysToFormat.forEach(d => {
    d.lessons.forEach(l => {
      uniqueRoomIds.add(l.roomId);
      uniqueRoomShorts.add(`ауд. ${l.roomShort} (${l.floor} эт.)`);
    });
  });

  if (daysToFormat.length === 0 || daysToFormat.every(d => d.lessons.length === 0)) {
    const scopeText = dayFilter ? `в ${dayFilter.toLowerCase()}` : 'на этой неделе';
    return {
      text: `У ${entitySchedule.entityType === 'lecturer' ? entitySchedule.name : 'группы ' + entitySchedule.name} ${scopeText} нет пар в Главном корпусе по расписанию.`,
      roomIds: [...entitySchedule.rooms.map(r => r.id)].slice(0, 6)
    };
  }

  const lines = [];
  const headerPrefix = entitySchedule.entityType === 'lecturer'
    ? `${entitySchedule.name}`
    : `Группа ${entitySchedule.name}`;

  if (dayFilter) {
    lines.push(`${headerPrefix} — расписание на ${dayFilter.toLowerCase()} (аудитории: ${[...uniqueRoomShorts].join(', ')}):`);
  } else {
    lines.push(`${headerPrefix} на этой неделе ведёт занятия в аудиториях: ${[...uniqueRoomShorts].join(', ')}.`);
  }

  for (const d of daysToFormat) {
    if (!d.lessons.length) continue;
    const items = d.lessons.map(l => {
      const extra = entitySchedule.entityType === 'lecturer'
        ? (l.group ? `, гр. ${l.group}` : '')
        : (l.lecturer ? `, ${l.lecturer}` : '');
      return `${l.time} — ауд. ${l.roomShort} (${l.type ? l.type + ' ' : ''}${l.subject}${extra})`;
    });
    lines.push(`\n• ${d.dayName}: ${items.join('; ')}`);
  }

  return {
    text: lines.join(''),
    roomIds: [...uniqueRoomIds].slice(0, 6)
  };
}

function localCampusAssistant(query, currentFloor = 1) {
  const q = query.toLowerCase().replace(/ё/g, 'е').trim();
  if (!q) {
    const reply = 'Напишите номер аудитории, группу, фамилию преподавателя или задайте вопрос — например: «В каких аудиториях на этой неделе у Устюкова будут пары?» или «Где сейчас свободные аудитории на 1 этаже?».';
    return {
      reply,
      answer: reply,
      rooms: [],
      roomIds: [],
      route: null,
      entitySchedule: null,
      openFreePanel: false
    };
  }

  const entranceId = roomsMeta['c_f1_entrance'] ? 'c_f1_entrance' : Object.keys(roomsMeta).find(k => roomsMeta[k].type === 'entrance') || 'c_f1_100';

  // 0. Проверяем вопросы по расписанию преподавателей и групп
  if (cacheStatus.ready) {
    const matchedLecturers = findMatchingLecturers(query);
    if (matchedLecturers.length > 0) {
      const topLec = matchedLecturers[0];
      const entitySched = buildEntityScheduleResponse('lecturer', topLec);
      const dayFilter = detectDayFilterInQuery(q);
      const formatted = formatEntityScheduleForAi(entitySched, dayFilter);
      const rooms = formatted.roomIds.map(enrichRoomCard).filter(Boolean);
      return {
        reply: formatted.text,
        answer: formatted.text,
        rooms,
        roomIds: rooms.map(r => r.id),
        route: null,
        entitySchedule: { type: 'lecturer', name: topLec.name },
        openFreePanel: false
      };
    }

    const matchedGroups = findMatchingGroups(query);
    if (matchedGroups.length > 0) {
      const topGrp = matchedGroups[0];
      const entitySched = buildEntityScheduleResponse('group', topGrp);
      const dayFilter = detectDayFilterInQuery(q);
      const formatted = formatEntityScheduleForAi(entitySched, dayFilter);
      const rooms = formatted.roomIds.map(enrichRoomCard).filter(Boolean);
      return {
        reply: formatted.text,
        answer: formatted.text,
        rooms,
        roomIds: rooms.map(r => r.id),
        route: null,
        entitySchedule: { type: 'group', name: topGrp.name },
        openFreePanel: false
      };
    }
  }

  // 1. Проверка запроса на построение маршрута («от ... до ...», «из ... в ...», «как пройти до ...»)
  const routeFromToMatch = q.match(/(?:от|из)\s+(.+?)\s+(?:до|в|к)\s+(.+?)(?:[?.!]|$)/i);
  if (routeFromToMatch) {
    const fromPart = routeFromToMatch[1].trim();
    const toPart = routeFromToMatch[2].trim();
    const fromHits = fromPart.includes('вход') ? [{ id: entranceId, meta: roomsMeta[entranceId] }] : searchRoomsInMeta(roomsMeta, fromPart, 3);
    const toHits = searchRoomsInMeta(roomsMeta, toPart, 3);
    if (fromHits.length && toHits.length && fromHits[0].meta && toHits[0].meta) {
      const fromRoom = fromHits[0];
      const toRoom = toHits[0];
      const reply = `Маршрут от «${fromRoom.meta.name}» (${fromRoom.meta.floor} эт.) до «${toRoom.meta.name}» (${toRoom.meta.floor} эт.) готов. Нажмите кнопку ниже, чтобы показать путь на карте.`;
      const rooms = [enrichRoomCard(fromRoom.id), enrichRoomCard(toRoom.id)].filter(Boolean);
      return {
        reply,
        answer: reply,
        rooms,
        roomIds: rooms.map(r => r.id),
        route: { fromRoomId: fromRoom.id, toRoomId: toRoom.id },
        entitySchedule: null,
        openFreePanel: false
      };
    }
  }

  const routeToOnlyMatch = q.match(/(?:как\s+(?:пройти|дойти|добраться|попасть)\s+(?:до|в|к)|маршрут\s+(?:до|в|к))\s+(.+?)(?:[?.!]|$)/i);
  if (routeToOnlyMatch) {
    const targetQuery = routeToOnlyMatch[1].trim();
    const toHits = searchRoomsInMeta(roomsMeta, targetQuery, 3);
    if (toHits.length && roomsMeta[entranceId]) {
      const toRoom = toHits[0];
      const reply = `Чтобы дойти до «${toRoom.meta.name}» (${toRoom.meta.floor} этаж), удобнее всего начать от Главного входа (1 этаж). Нажмите кнопку ниже, чтобы построить пошаговый маршрут на карте:`;
      const rooms = [enrichRoomCard(toRoom.id), enrichRoomCard(entranceId)].filter(Boolean);
      return {
        reply,
        answer: reply,
        rooms,
        roomIds: rooms.map(r => r.id),
        route: { fromRoomId: entranceId, toRoomId: toRoom.id },
        entitySchedule: null,
        openFreePanel: false
      };
    }
  }

  // 2. Проверка запроса про свободные аудитории («свободн», «где посидеть», «пустые»)
  if (q.includes('свободн') || q.includes('посидеть') || q.includes('пуст')) {
    const floorMatch = q.match(/([0-4])\s*(?:-м|-й|м|й)?\s*этаж/);
    const targetFloor = floorMatch ? parseInt(floorMatch[1], 10) : null;

    if (!cacheStatus.ready) {
      const reply = `Кэш расписания сейчас прогревается (${cacheStatus.progress}). Подождите пару секунд или откройте режим «Свободные».`;
      return {
        reply,
        answer: reply,
        rooms: [],
        roomIds: [],
        route: null,
        entitySchedule: null,
        openFreePanel: true
      };
    }

    const freeIds = [];
    for (const [id, meta] of Object.entries(roomsMeta)) {
      if (!meta.classroom) continue;
      if (targetFloor !== null && meta.floor !== targetFloor) continue;
      const st = computeFreeStatus(id);
      if (st && !st.noSchedule) freeIds.push(id);
    }

    const picked = freeIds.slice(0, 6).map(enrichRoomCard).filter(Boolean);
    const floorLabel = targetFloor !== null ? ` на ${targetFloor} этаже` : ' в Главном корпусе';
    const reply = freeIds.length > 0
      ? `Сейчас${floorLabel} свободно учебных аудиторий: ${freeIds.length}. Вот ближайшие свободные аудитории с актуальным временем до следующей пары:`
      : `Сейчас${floorLabel} не найдено свободных учебных аудиторий по расписанию.`;
    return {
      reply,
      answer: reply,
      rooms: picked,
      roomIds: picked.map(r => r.id),
      route: null,
      entitySchedule: null,
      openFreePanel: true
    };
  }

  // 3. Поиск по аудиториям, категориям, кафедрам и сленгу
  const found = searchRoomsInMeta(roomsMeta, query, 6);
  if (found.length > 0) {
    const cards = found.map(f => enrichRoomCard(f.id)).filter(Boolean);
    const top = cards[0];
    if (cards.length === 1) {
      const descPart = top.description ? ` (${top.description})` : '';
      const statusPart = top.statusText ? ` Статус сейчас: ${top.statusText}.` : '';
      const reply = `${top.name}${descPart} находится в Главном корпусе на ${top.floor} этаже.${statusPart}`;
      return {
        reply,
        answer: reply,
        rooms: cards,
        roomIds: cards.map(r => r.id),
        route: null,
        entitySchedule: null,
        openFreePanel: false
      };
    }
    const reply = `Нашёл ${cards.length} подходящих мест в Главном корпусе. Выберите нужное, чтобы показать его на карте или построить маршрут:`;
    return {
      reply,
      answer: reply,
      rooms: cards,
      roomIds: cards.map(r => r.id),
      route: null,
      entitySchedule: null,
      openFreePanel: false
    };
  }

  const reply = 'Не удалось найти точное совпадение. Укажите номер аудитории («100», «214»), группу («445», «443»), фамилию преподавателя («Устюков», «Пржегорлинский»), кафедру («АСУ», «ЭВМ») или спросите «Какие аудитории сейчас свободны?».';
  return {
    reply,
    answer: reply,
    rooms: [],
    roomIds: [],
    route: null,
    entitySchedule: null,
    openFreePanel: false
  };
}

async function processAiAssistantQuery(query, currentFloor = 1) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const localFallback = localCampusAssistant(query, currentFloor);

  if (!apiKey) {
    return localFallback;
  }

  try {
    const { GoogleGenAI, Type } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const relevantSearch = searchRoomsInMeta(roomsMeta, query, 12);
    const specialIds = new Set(relevantSearch.map(r => r.id));

    for (const [id, meta] of Object.entries(roomsMeta)) {
      if (['buffet', 'entrance', 'medical', 'wardrobe', 'gym', 'museum'].includes(meta.type)) {
        specialIds.add(id);
      } else if ((meta.name || '').toLowerCase().includes('деканат')) {
        specialIds.add(id);
      }
    }

    // Если в вопросе упоминается преподаватель или группа — добавляем их полное расписание и их аудитории в контекст LLM
    const scheduleContextLines = [];
    if (cacheStatus.ready) {
      const matchedLecs = findMatchingLecturers(query).slice(0, 2);
      for (const lec of matchedLecs) {
        const sched = buildEntityScheduleResponse('lecturer', lec);
        const formatted = formatEntityScheduleForAi(sched, null);
        scheduleContextLines.push(formatted.text);
        formatted.roomIds.forEach(id => specialIds.add(id));
      }
      const matchedGrps = findMatchingGroups(query).slice(0, 2);
      for (const grp of matchedGrps) {
        const sched = buildEntityScheduleResponse('group', grp);
        const formatted = formatEntityScheduleForAi(sched, null);
        scheduleContextLines.push(formatted.text);
        formatted.roomIds.forEach(id => specialIds.add(id));
      }

      let addedFree = 0;
      for (const [id, meta] of Object.entries(roomsMeta)) {
        if (meta.classroom && meta.floor === currentFloor && addedFree < 8) {
          const st = computeFreeStatus(id);
          if (st && !st.noSchedule) {
            specialIds.add(id);
            addedFree++;
          }
        }
      }
    }

    const catalogLines = [];
    for (const id of specialIds) {
      const meta = roomsMeta[id];
      if (!meta) continue;
      let statusInfo = '';
      if (meta.classroom && cacheStatus.ready) {
        const freeSt = computeFreeStatus(id);
        if (freeSt) statusInfo = ` [СВОБОДНА ${freeSt.untilText}]`;
        else {
          const busySt = computeBusyStatus(id);
          if (busySt) statusInfo = ` [ЗАНЯТА до ${busySt.untilText}: ${busySt.subject}]`;
        }
      }
      const desc = meta.description ? ` (${meta.description})` : '';
      catalogLines.push(`${id}: ${meta.name}${desc}, эт.${meta.floor}, тип:${meta.type}${statusInfo}`);
    }

    const systemInstruction =
      `Ты — умный ИИ-навигатор интерактивной карты и расписания РГРТУ (Главный корпус).\n` +
      `Текущий этаж пользователя: ${currentFloor}.\n` +
      `Отвечай чётко, дружелюбно и по делу на русском языке.\n` +
      `ВАЖНО: Никогда не путай столовую/буфет (тип buffet: c_f1_buffet_1, c_f1_buffet_2, c_f1_108a) с лабораториями кафедр!\n` +
      `Если вопрос касается расписания преподавателя или группы, дай точный ответ с перечислением дней, времени, предметов и номеров аудиторий из блока "Расписание по запросу", а в matchedRoomIds укажи ID всех этих аудиторий.\n` +
      `Если пользователь просит построить маршрут или спрашивает как пройти из А в Б, укажи их ID в routeFromId и routeToId (если начальная точка не названа, используй c_f1_entrance — Главный вход).\n` +
      `В поле matchedRoomIds возвращай массив точных ID помещений из каталога (до 6 штук).\n\n` +
      (scheduleContextLines.length ? `Расписание по запросу:\n${scheduleContextLines.join('\n\n')}\n\n` : '') +
      `Релевантные помещения Главного корпуса РГРТУ:\n` +
      catalogLines.join('\n');

    const geminiPromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: query,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: 'Подробный и полезный ответ пользователю на русском языке.'
            },
            matchedRoomIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Массив точных ID подходящих помещений из каталога (до 6 шт).'
            },
            routeFromId: {
              type: Type.STRING,
              description: 'ID начального помещения для маршрута или пустая строка.'
            },
            routeToId: {
              type: Type.STRING,
              description: 'ID конечного помещения для маршрута или пустая строка.'
            },
            openFreePanel: {
              type: Type.BOOLEAN,
              description: 'true, если пользователь спрашивает про свободные аудитории сейчас.'
            }
          },
          required: ['reply', 'matchedRoomIds']
        }
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 5000)
    );

    const response = await Promise.race([geminiPromise, timeoutPromise]);

    const parsed = JSON.parse((response.text || '{}').trim());
    const validRoomIds = (parsed.matchedRoomIds || []).filter(id => !!roomsMeta[id]).slice(0, 6);
    const rooms = validRoomIds.length > 0
      ? validRoomIds.map(enrichRoomCard).filter(Boolean)
      : localFallback.rooms;

    let route = null;
    if (parsed.routeFromId && parsed.routeToId && roomsMeta[parsed.routeFromId] && roomsMeta[parsed.routeToId]) {
      route = { fromRoomId: parsed.routeFromId, toRoomId: parsed.routeToId };
    } else if (localFallback.route) {
      route = localFallback.route;
    }

    const finalReply = parsed.reply || localFallback.reply;
    return {
      reply: finalReply,
      answer: finalReply,
      rooms,
      roomIds: rooms.map(r => r.id),
      route,
      entitySchedule: localFallback.entitySchedule || null,
      openFreePanel: Boolean(parsed.openFreePanel || localFallback.openFreePanel)
    };
  } catch (e) {
    console.warn('[ai-assistant] Gemini fallback to local NLU:', e.message);
    return localFallback;
  }
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

  // --- API: авторизация в редакторе графа ---
  if (url.pathname === '/api/editor/auth' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { password = '' } = JSON.parse(body || '{}');
      const expected = getEditorPassword();
      const given = String(password || '').trim();
      const isMatch = given.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
      if (!isMatch) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Неверный пароль администратора' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, token: getValidEditorToken() }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/editor/check' && req.method === 'GET') {
    const authorized = isEditorAuthorized(req);
    res.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: authorized }));
    return;
  }

  // --- API: сохранение graph.json (защищено токеном администратора) ---
  if (url.pathname === '/api/graph/save' && req.method === 'POST') {
    if (!isEditorAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Требуется авторизация администратора' }));
      return;
    }
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed.nodes !== 'object' || !Array.isArray(parsed.edges)) {
        throw new Error('Некорректная структура графа');
      }
      const nodeCount = Object.keys(parsed.nodes).length;
      if (nodeCount < 5) {
        throw new Error('Защита от случайного стирания: граф содержит слишком мало узлов');
      }
      if (fs.existsSync(GRAPH_FILE)) {
        try {
          fs.copyFileSync(GRAPH_FILE, GRAPH_BACKUP_FILE);
        } catch (backupErr) {
          console.warn('[graph/backup]', backupErr.message);
        }
      }
      fs.writeFileSync(GRAPH_FILE, JSON.stringify(parsed, null, 2));
      console.log(`[graph] сохранён: ${nodeCount} узлов, ${parsed.edges.length} рёбер`);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, nodes: nodeCount, edges: parsed.edges.length }));
    } catch (e) {
      console.error('[graph/save]', e.message);
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // --- API: справочник групп и преподавателей ---
  if (url.pathname === '/api/schedule-directory') {
    const q = (url.searchParams.get('q') || '').toLowerCase().replace(/ё/g, 'е').trim();
    const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

    const lecturers = [...scheduleIndex.lecturers.values()]
      .filter(l => !q || l.name.toLowerCase().replace(/ё/g, 'е').includes(q) || l.surname.includes(q))
      .map(l => ({
        name: l.name,
        shortName: l.shortName,
        roomsCount: l.rooms.size,
        lessonsCount: l.lessons.length
      }))
      .sort((a, b) => collator.compare(a.shortName, b.shortName));

    const groups = [...scheduleIndex.groups.values()]
      .filter(g => !q || g.name.toLowerCase().replace(/ё/g, 'е').includes(q))
      .map(g => ({
        name: g.name,
        roomsCount: g.rooms.size,
        lessonsCount: g.lessons.length
      }))
      .sort((a, b) => collator.compare(a.name, b.name));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ready: cacheStatus.ready,
      lecturers,
      groups
    }));
    return;
  }

  // --- API: полное расписание группы или преподавателя ---
  if (url.pathname === '/api/entity-schedule') {
    const type = url.searchParams.get('type'); // 'lecturer' | 'group'
    const name = (url.searchParams.get('name') || '').trim();
    if (!type || !name) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Missing type or name' }));
      return;
    }

    let entityObj = null;
    if (type === 'lecturer') {
      entityObj = scheduleIndex.lecturers.get(name);
      if (!entityObj) {
        const found = findMatchingLecturers(name);
        if (found.length) entityObj = found[0];
      }
    } else if (type === 'group') {
      entityObj = scheduleIndex.groups.get(name);
      if (!entityObj) {
        for (const [k, v] of scheduleIndex.groups.entries()) {
          if (k.toLowerCase() === name.toLowerCase()) { entityObj = v; break; }
        }
      }
    }

    if (!entityObj) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Расписание не найдено' }));
      return;
    }

    const payload = buildEntityScheduleResponse(type, entityObj);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
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

  if (url.pathname === '/api/ai-assistant' && req.method === 'POST') {
    try {
      const rawBody = await readBody(req);
      const { query = '', currentFloor = 1 } = JSON.parse(rawBody || '{}');
      const result = await processAiAssistantQuery(String(query).trim(), Number(currentFloor) || 1);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.error('[ai-assistant]', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
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

server.listen(PORT, '0.0.0.0', () => {
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

  try {
    const { startBot } = require('./bot.js');
    startBot();
  } catch (e) {
    console.error('[bot] Не удалось инициализировать бота:', e.message);
  }
});