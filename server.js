const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const cheerio = require('cheerio');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const { searchRoomsInMeta } = require('./js/graph-utils.js');
const { splitGroupAndLecturer, UserStore, verifyTelegramWebAppInitData } = require('./js/user-store.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, 'data', 'cache.json');
const GRAPH_FILE = path.join(ROOT, 'data', 'graph.json');
const GRAPH_BACKUP_FILE = path.join(ROOT, 'data', 'graph.backup.json');
const USERS_FILE = path.join(ROOT, 'data', 'users.json');
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const userStore = new UserStore(USERS_FILE);

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
let raspDirectoryMeta = { lecturersInRasp: [], deptByFullFio: {}, facultyByGroup: {} };
let lecturersReportList = [];
let scheduleCache = {};
let cacheStatus = { ready: false, warming: false, progress: '0/0', lastUpdate: null };
let scheduleIndex = {
  lecturers: new Map(), // name -> { name, shortName, fullName, regalia, department, surname, rooms: Set, lessonsCount, daysMap: Map }
  groups: new Map(),    // group -> { name, faculty, rooms: Set, lessonsCount, daysMap: Map }
  orderedDates: []      // [{ date, dayName }]
};

try {
  const roomsPath = path.join(ROOT, 'data', 'rooms.json');
  roomsMeta = JSON.parse(fs.readFileSync(roomsPath, 'utf8'));
  console.log(`[init] Загружено ${Object.keys(roomsMeta).length} помещений`);
} catch (e) {
  console.error('[init] Не удалось загрузить rooms.json:', e.message);
}

try {
  const raspMetaPath = path.join(ROOT, 'data', 'rasp-directory-meta.json');
  if (fs.existsSync(raspMetaPath)) {
    raspDirectoryMeta = JSON.parse(fs.readFileSync(raspMetaPath, 'utf8'));
  }
  const repPath = path.join(ROOT, 'data', 'lecturers-report.json');
  if (fs.existsSync(repPath)) {
    lecturersReportList = JSON.parse(fs.readFileSync(repPath, 'utf8'));
  }
} catch (e) {
  console.warn('[init] Не удалось загрузить метаданные справочника:', e.message);
}

function resolveLecturerMeta(lecName) {
  const raw = String(lecName || '').trim();
  const prefixMatch = raw.match(/^(доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)/i);
  const posShort = prefixMatch ? prefixMatch[1].toLowerCase().replace(/\s+/g, ' ') : 'преп.';
  const clean = raw
    .replace(/^(доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)\s*(?:ИнЯз\s+)?/i, '')
    .trim();

  let fullName = clean;
  let department = '';
  let repMatch = null;

  const m = clean.match(/^([А-ЯЁа-яё-]+)\s+([А-ЯЁа-яё])\.\s*([А-ЯЁа-яё])\.?/);
  if (m) {
    const [, sur, i1, i2] = m;
    const surNorm = sur.toLowerCase().replace(/ё/g, 'е');
    const i1Norm = i1.toLowerCase().replace(/ё/g, 'е');
    const i2Norm = i2.toLowerCase().replace(/ё/g, 'е');

    const matchFio = (fio) => {
      const parts = String(fio || '').trim().split(/\s+/);
      if (parts.length < 3) return false;
      return parts[0].toLowerCase().replace(/ё/g, 'е') === surNorm &&
             parts[1][0].toLowerCase().replace(/ё/g, 'е') === i1Norm &&
             parts[2][0].toLowerCase().replace(/ё/g, 'е') === i2Norm;
    };

    const raspEntry = (raspDirectoryMeta.lecturersInRasp || []).find(x => matchFio(x.label));
    repMatch = (lecturersReportList || []).find(x => matchFio(x.fio));

    if (raspEntry && raspEntry.label) {
      fullName = raspEntry.label.trim();
    } else if (repMatch && repMatch.fio) {
      fullName = repMatch.fio.trim();
    }
    if (fullName && raspDirectoryMeta.deptByFullFio && raspDirectoryMeta.deptByFullFio[fullName]) {
      department = raspDirectoryMeta.deptByFullFio[fullName];
    } else if (/ИнЯз/i.test(raw)) {
      department = 'ИнЯз';
    }
  }

  const isEcon = ['ЭиММ', 'ЭБАиУ', 'ГМКУ', 'ЭМОП', 'ЭП'].includes(department);
  const isPhysMath = ['ВМ', 'ОиЭФ'].includes(department);
  const isHum = ['ИФП'].includes(department);
  const isPed = ['ИнЯз', 'ФВ'].includes(department);
  const branch = isEcon ? 'э' : isPhysMath ? 'ф.-м' : isHum ? 'и' : isPed ? 'пед' : 'т';

  let deg = '';
  if (repMatch) {
    if (repMatch.degree === 'Доктор наук') deg = `д.${branch}.н.`;
    else if (repMatch.degree === 'Кандидат наук') deg = `к.${branch}.н.`;
  } else {
    if (posShort === 'проф.') deg = `д.${branch}.н.`;
    else if (posShort === 'доц.') deg = `к.${branch}.н.`;
  }

  const headPart = deg ? `${deg}, ${posShort}` : posShort;
  const regalia = department ? `${headPart} каф. ${department}` : headPart;

  return { fullName, regalia, department };
}

function resolveGroupFaculty(groupName) {
  const clean = String(groupName || '').trim().toUpperCase().replace(/Ё/g, 'Е');
  if (raspDirectoryMeta.facultyByGroup && raspDirectoryMeta.facultyByGroup[clean]) {
    return raspDirectoryMeta.facultyByGroup[clean];
  }
  const digits = clean.replace(/\D+/g, '');
  if (digits.length >= 2) {
    const facDigit = digits[1] === '0' && digits.length >= 3 ? digits[2] : digits[1];
    if (facDigit === '1') return 'ФРТ';
    if (facDigit === '2') return 'ФЭ';
    if (facDigit === '3') return 'ФАИТУ';
    if (facDigit === '4') return 'ФВТ';
    if (['5', '6', '7', '8'].includes(facDigit)) return 'ИЭФ';
  }
  return 'РГРТУ';
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
            const shortName = lecKey.replace(/^(доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)\s*/i, '').trim();
            const metaInfo = resolveLecturerMeta(lecKey);
            lecturers.set(lecKey, {
              name: lecKey,
              shortName,
              fullName: metaInfo.fullName || shortName,
              regalia: metaInfo.regalia || '',
              department: metaInfo.department || '',
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
              faculty: resolveGroupFaculty(grp),
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
    fullName: entityObj.fullName || entityObj.shortName || entityObj.name,
    regalia: entityObj.regalia || '',
    department: entityObj.department || '',
    faculty: entityObj.faculty || '',
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
    const fullLower = `${lec.name} ${lec.fullName || ''}`.toLowerCase().replace(/ё/g, 'е');
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

  // Если в запросе явно указан этаж («1 этаж») или «аудитория 100» / «302 аудитории», не путаем с группой
  const cleaned = q
    .replace(/\d\s*(?:-м|-й|м|й)?\s*этаж[а-я]*/gi, ' ')
    .replace(/(?:ауд|аудитор[а-я]*|кабинет[а-я]*|каб)\.?\s*\d+[а-яa-z]?/gi, ' ')
    .replace(/\d+[а-яa-z]?\s*(?:-й|-я|-м|-ой|-ей)?\s*(?:ауд|аудитор[а-я]*|кабинет[а-я]*|каб)\.?/gi, ' ');

  const tokens = cleaned.match(/\d{2,5}[а-яёa-z]{0,4}/gi) || [];
  const exact = [];
  const prefix = [];
  const hasGroupKeyword = /(?:^|[^а-яa-z])(?:гр\.?|групп[а-я]*)(?:$|[^а-яa-z])/i.test(q);
  const hasRoomContext = /(?:в\s+\d|до\s+\d|из\s+\d|к\s+\d|ауд|кабинет|свобод|освобод|занят)/i.test(q);

  for (const rawTok of tokens) {
    const tokUpper = rawTok.toUpperCase().replace(/Ё/g, 'Е');
    const isAlsoRoom = Object.values(roomsMeta).some(m =>
      String(m.shortName || '').toLowerCase() === rawTok.toLowerCase() ||
      String(m.classroom || '').toLowerCase() === rawTok.toLowerCase()
    );
    if ((isAlsoRoom || hasRoomContext) && !hasGroupKeyword) {
      continue;
    }
    const exactMatch = scheduleIndex.groups.get(tokUpper) || scheduleIndex.groups.get(rawTok);
    if (exactMatch) {
      if (!exact.includes(exactMatch)) exact.push(exactMatch);
    } else {
      for (const [grpName, grpObj] of scheduleIndex.groups.entries()) {
        if (grpName.toLowerCase() === rawTok.toLowerCase() && !exact.includes(grpObj)) {
          exact.push(grpObj);
        }
      }
    }
    if (!exactMatch && hasGroupKeyword && tokUpper.length >= 2) {
      for (const [grpName, grpObj] of scheduleIndex.groups.entries()) {
        if (grpName.toUpperCase() !== tokUpper && grpName.toUpperCase().startsWith(tokUpper) && !exact.includes(grpObj) && !prefix.includes(grpObj)) {
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

const RGRTU_BELL_SLOTS = [
  { num: 1, start: '08:10', end: '09:45', startMin: 8 * 60 + 10, endMin: 9 * 60 + 45 },
  { num: 2, start: '09:55', end: '11:30', startMin: 9 * 60 + 55, endMin: 11 * 60 + 30 },
  { num: 3, start: '11:40', end: '13:15', startMin: 11 * 60 + 40, endMin: 13 * 60 + 15, note: 'после 3-й пары — перерыв 20 мин' },
  { num: 4, start: '13:35', end: '15:10', startMin: 13 * 60 + 35, endMin: 15 * 60 + 10 },
  { num: 5, start: '15:20', end: '16:55', startMin: 15 * 60 + 20, endMin: 16 * 60 + 55 },
  { num: 6, start: '17:05', end: '18:40', startMin: 17 * 60 + 5, endMin: 18 * 60 + 40 },
  { num: 7, start: '18:45', end: '20:10', startMin: 18 * 60 + 45, endMin: 20 * 60 + 10 }
];

function getAcademicWeekParity(now = new Date()) {
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const sep1 = new Date(year, 8, 1);
  const sep1Day = sep1.getDay() || 7;
  const firstMonday = new Date(year, 8, 1 - (sep1Day - 1));
  const diffDays = Math.floor((now - firstMonday) / (1000 * 60 * 60 * 24));
  const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);
  const isNumerator = weekNumber % 2 === 1;
  return {
    weekNumber,
    type: isNumerator ? 'Числитель' : 'Знаменатель'
  };
}

function buildBellScheduleAnswer() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let currentLine = '';

  const activeSlot = RGRTU_BELL_SLOTS.find(s => nowMin >= s.startMin && nowMin <= s.endMin);
  if (activeSlot) {
    const leftMin = activeSlot.endMin - nowMin;
    currentLine = `Сейчас идёт ${activeSlot.num}-я пара (${activeSlot.start}–${activeSlot.end}), до звонка осталось ${leftMin} мин.\n\n`;
  } else {
    const nextSlot = RGRTU_BELL_SLOTS.find(s => s.startMin > nowMin);
    if (nextSlot && nowMin >= 7 * 60 + 30) {
      const waitMin = nextSlot.startMin - nowMin;
      currentLine = `Сейчас перемена. До начала ${nextSlot.num}-й пары (${nextSlot.start}) осталось ${waitMin} мин.\n\n`;
    } else {
      currentLine = `Сейчас учебные пары по основному расписанию не идут.\n\n`;
    }
  }

  const lines = RGRTU_BELL_SLOTS.map(s =>
    `• ${s.num} пара: ${s.start}–${s.end}${s.note ? ` (${s.note})` : ''}`
  );
  return `${currentLine}Расписание звонков РГРТУ:\n${lines.join('\n')}`;
}

function formatClassroomScheduleForAi(roomId, dayFilter = null) {
  const meta = roomsMeta[roomId];
  if (!meta) return null;
  const entry = scheduleCache[roomId];
  const card = enrichRoomCard(roomId);
  const statusLine = card && card.statusText ? `Статус сейчас: ${card.statusText}.` : '';

  if (!entry || entry.empty || !Array.isArray(entry.days) || entry.days.every(d => !d.lessons || d.lessons.length === 0)) {
    return {
      text: `${meta.name} (${meta.floor} этаж, Главный корпус). ${statusLine || 'По расписанию в этой аудитории нет регулярных учебных пар на текущей неделе.'}`.trim(),
      roomIds: [roomId]
    };
  }

  const daysToFormat = dayFilter
    ? entry.days.filter(d => d.dayName.toLowerCase() === dayFilter.toLowerCase())
    : entry.days.filter(d => d.lessons && d.lessons.length > 0);

  const lines = [];
  lines.push(`${meta.name} (${meta.floor} этаж) — ${statusLine}`);

  if (daysToFormat.length === 0 || daysToFormat.every(d => d.lessons.length === 0)) {
    const dayLabel = dayFilter ? `в ${dayFilter.toLowerCase()}` : 'на этой неделе';
    lines.push(`По расписанию ${dayLabel} в этой аудитории пар нет — она свободна.`);
    return {
      text: lines.join('\n'),
      roomIds: [roomId]
    };
  }

  for (const d of daysToFormat) {
    if (!d.lessons.length) continue;
    const items = d.lessons.map(l => {
      const parts = [l.type ? `${l.type} ${l.subject}` : l.subject];
      if (l.group) parts.push(`гр. ${l.group}`);
      if (l.lecturer) parts.push(l.lecturer);
      return `${l.time} — ${parts.join(', ')}`;
    });
    lines.push(`\n• ${d.dayName}: ${items.join('; ')}`);
  }

  return {
    text: lines.join(''),
    roomIds: [roomId]
  };
}

function searchSubjectInSchedule(query) {
  const q = String(query || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!q || !cacheStatus.ready) return null;

  const stopWords = new Set([
    'где', 'кто', 'как', 'какие', 'каких', 'какой', 'какая', 'когда', 'во', 'сколько',
    'проходит', 'проходят', 'ведет', 'ведут', 'преподает', 'пары', 'пара', 'занятия',
    'лекции', 'лекция', 'лабораторные', 'лабы', 'упражнения', 'практика', 'по', 'предмету',
    'дисциплине', 'курс', 'аудитории', 'аудиториях', 'кабинете', 'расписание', 'сегодня',
    'завтра', 'неделе', 'этой', 'в', 'на', 'у', 'и', 'или', 'до', 'от', 'из'
  ]);

  const tokens = q
    .split(/[^a-zа-я0-9]+/i)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  if (tokens.length === 0) return null;

  const subjectMap = new Map();
  for (const [roomId, entry] of Object.entries(scheduleCache)) {
    if (!entry || entry.empty || !Array.isArray(entry.days)) continue;
    const meta = roomsMeta[roomId];
    if (!meta) continue;
    const roomShort = meta.shortName || meta.classroom || meta.name;

    for (const day of entry.days) {
      for (const lesson of (day.lessons || [])) {
        const subj = (lesson.subject || '').trim();
        if (!subj) continue;
        const subjLower = subj.toLowerCase().replace(/ё/g, 'е');
        const matchesAll = tokens.every(t => subjLower.includes(t));
        if (!matchesAll) continue;

        if (!subjectMap.has(subj)) {
          subjectMap.set(subj, {
            subject: subj,
            roomIds: new Set(),
            roomShorts: new Set(),
            lecturers: new Set(),
            groups: new Set(),
            slots: []
          });
        }
        const info = subjectMap.get(subj);
        info.roomIds.add(roomId);
        info.roomShorts.add(`ауд. ${roomShort} (${meta.floor} эт.)`);
        if (lesson.lecturer) info.lecturers.add(lesson.lecturer);
        if (lesson.group) info.groups.add(lesson.group);
        if (info.slots.length < 8) {
          info.slots.push(`${day.dayName} ${lesson.time} — ауд. ${roomShort}${lesson.type ? ` (${lesson.type})` : ''}${lesson.lecturer ? `, ${lesson.lecturer}` : ''}${lesson.group ? `, гр. ${lesson.group}` : ''}`);
        }
      }
    }
  }

  if (subjectMap.size === 0) return null;
  const best = [...subjectMap.values()].sort((a, b) => b.slots.length - a.slots.length)[0];
  const lines = [];
  lines.push(`Дисциплина «${best.subject}» проводится в аудиториях: ${[...best.roomShorts].join(', ')}.`);
  if (best.lecturers.size > 0) {
    lines.push(`Преподаватели: ${[...best.lecturers].slice(0, 5).join(', ')}.`);
  }
  if (best.groups.size > 0) {
    lines.push(`Группы: ${[...best.groups].slice(0, 8).join(', ')}.`);
  }
  lines.push('\nБлижайшие занятия в расписании:');
  best.slots.slice(0, 6).forEach(s => lines.push(`• ${s}`));

  return {
    text: lines.join('\n'),
    roomIds: [...best.roomIds].slice(0, 6)
  };
}

function formatEntityScheduleForAi(entitySchedule, dayFilter = null) {
  const daysToFormat = dayFilter
    ? entitySchedule.days.filter(d => d.dayName.toLowerCase() === dayFilter.toLowerCase())
    : entitySchedule.days.filter(d => d.lessons.length > 0);

  const uniqueRoomIds = new Set();
  const uniqueRoomShorts = new Set();

  if (entitySchedule.nowStatus && entitySchedule.nowStatus.roomId && roomsMeta[entitySchedule.nowStatus.roomId]) {
    uniqueRoomIds.add(entitySchedule.nowStatus.roomId);
  }

  daysToFormat.forEach(d => {
    d.lessons.forEach(l => {
      uniqueRoomIds.add(l.roomId);
      uniqueRoomShorts.add(`ауд. ${l.roomShort} (${l.floor} эт.)`);
    });
  });

  const headerPrefix = entitySchedule.entityType === 'lecturer'
    ? `${entitySchedule.name}`
    : `Группа ${entitySchedule.name}`;

  const statusBanner = entitySchedule.nowStatus && entitySchedule.nowStatus.details
    ? `${entitySchedule.nowStatus.title}: ${entitySchedule.nowStatus.details}.\n`
    : '';

  if (daysToFormat.length === 0 || daysToFormat.every(d => d.lessons.length === 0)) {
    const scopeText = dayFilter ? `в ${dayFilter.toLowerCase()}` : 'на этой неделе';
    return {
      text: `${statusBanner}У ${entitySchedule.entityType === 'lecturer' ? entitySchedule.name : 'группы ' + entitySchedule.name} ${scopeText} нет пар в Главном корпусе по расписанию.`.trim(),
      roomIds: [...uniqueRoomIds, ...entitySchedule.rooms.map(r => r.id)].slice(0, 6)
    };
  }

  const lines = [];
  if (statusBanner) {
    lines.push(statusBanner.trim());
  }

  if (dayFilter) {
    lines.push(`${headerPrefix} — расписание на ${dayFilter.toLowerCase()} (аудитории: ${[...uniqueRoomShorts].join(', ')}):`);
  } else {
    lines.push(`${headerPrefix} — занятия на этой неделе в аудиториях: ${[...uniqueRoomShorts].join(', ')}.`);
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
    text: lines.join('\n'),
    roomIds: [...uniqueRoomIds].slice(0, 6)
  };
}

function extractHistoryContext(history = []) {
  if (!Array.isArray(history) || history.length === 0) {
    return { lastRoomIds: [], lastEntitySchedule: null, recentTurns: [] };
  }
  const recentTurns = history.slice(-6).map(item => ({
    role: item && item.role === 'user' ? 'user' : 'assistant',
    text: String((item && (item.text || item.answer)) || '').trim().slice(0, 280),
    roomIds: Array.isArray(item && item.roomIds) ? item.roomIds.filter(id => !!roomsMeta[id]).slice(0, 6) : [],
    entitySchedule: (item && item.entitySchedule && item.entitySchedule.type && item.entitySchedule.name)
      ? { type: String(item.entitySchedule.type), name: String(item.entitySchedule.name) }
      : null
  })).filter(t => t.text);

  let lastRoomIds = [];
  let lastEntitySchedule = null;
  for (let i = recentTurns.length - 1; i >= 0; i--) {
    const t = recentTurns[i];
    if (!lastRoomIds.length && t.roomIds.length) {
      lastRoomIds = t.roomIds;
    }
    if (!lastEntitySchedule && t.entitySchedule) {
      lastEntitySchedule = t.entitySchedule;
    }
  }
  return { lastRoomIds, lastEntitySchedule, recentTurns };
}

function localCampusAssistant(query, currentFloor = 1, history = []) {
  const q = query.toLowerCase().replace(/ё/g, 'е').trim();
  const { lastRoomIds, lastEntitySchedule } = extractHistoryContext(history);

  if (!q) {
    const reply = 'Напишите номер аудитории, группу, фамилию преподавателя, название предмета или задайте вопрос — например: «В каких аудиториях на этой неделе у Устюкова будут пары?», «Что сейчас в 302?» или «Где сейчас свободные аудитории на 2 этаже?».';
    return {
      reply,
      answer: reply,
      rooms: [],
      roomIds: [],
      route: null,
      entitySchedule: null,
      openFreePanel: false,
      matchedIntent: true,
      modelUsed: 'local-campus-ai'
    };
  }

  const entranceId = roomsMeta['c_f1_entrance'] ? 'c_f1_entrance' : Object.keys(roomsMeta).find(k => roomsMeta[k].type === 'entrance') || 'c_f1_100';

  // 0a. Вопросы про расписание звонков, перемену или время текущей пары
  if (/(?:звонк|перемен|перерыв|во\s+сколько\s+(?:начинается|заканчивается|кончается|\d\s*(?:-я|я)?\s*пара)|какая\s+сейчас\s+пара\s+по\s+счету|расписание\s+пар\s+по\s+времени)/i.test(q) ||
      (/^(?:какая\s+сейчас\s+пара|сколько\s+до\s+конца\s+пары|когда\s+закончится\s+пара)[?.!]*$/i.test(q))) {
    const reply = buildBellScheduleAnswer();
    return {
      reply,
      answer: reply,
      rooms: [],
      roomIds: [],
      route: null,
      entitySchedule: null,
      openFreePanel: false,
      matchedIntent: true,
      modelUsed: 'local-campus-ai'
    };
  }

  // 0b. Вопросы про тип недели (числитель или знаменатель)
  if (/(?:числител|знаменател|какая\s+(?:сейчас|сегодня|эта)\s+недел)/i.test(q)) {
    const parity = getAcademicWeekParity();
    const jsDays = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const now = new Date();
    const reply = `Сейчас идёт ${parity.weekNumber}-я учебная неделя — **${parity.type}** (сегодня ${jsDays[now.getDay()]}).`;
    return {
      reply: reply.replace(/\*\*/g, ''),
      answer: reply.replace(/\*\*/g, ''),
      rooms: [],
      roomIds: [],
      route: null,
      entitySchedule: null,
      openFreePanel: false,
      matchedIntent: true,
      modelUsed: 'local-campus-ai'
    };
  }

  // 0c. Проверяем вопросы по расписанию преподавателей и групп (включая контекстные уточнения из истории диалога)
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
        openFreePanel: false,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
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
        openFreePanel: false,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
      };
    }

    // Контекстный вопрос по расписанию из предыдущего сообщения диалога (например: «А во вторник?», «А в пятницу где у него пары?»)
    const dayFilterFromContext = detectDayFilterInQuery(q);
    const isScheduleFollowUp = dayFilterFromContext || /(?:у него|у нее|у них|у этой группы|пары|занятия|расписани|где\s+он|где\s+она)/i.test(q);
    if (lastEntitySchedule && isScheduleFollowUp) {
      if (lastEntitySchedule.type === 'lecturer') {
        const lecObj = findMatchingLecturers(lastEntitySchedule.name)[0];
        if (lecObj) {
          const entitySched = buildEntityScheduleResponse('lecturer', lecObj);
          const formatted = formatEntityScheduleForAi(entitySched, dayFilterFromContext);
          const rooms = formatted.roomIds.map(enrichRoomCard).filter(Boolean);
          return {
            reply: formatted.text,
            answer: formatted.text,
            rooms,
            roomIds: rooms.map(r => r.id),
            route: null,
            entitySchedule: { type: 'lecturer', name: lecObj.name },
            openFreePanel: false,
            matchedIntent: true,
            modelUsed: 'local-campus-ai'
          };
        }
      } else if (lastEntitySchedule.type === 'group') {
        const grpObj = findMatchingGroups(lastEntitySchedule.name)[0];
        if (grpObj) {
          const entitySched = buildEntityScheduleResponse('group', grpObj);
          const formatted = formatEntityScheduleForAi(entitySched, dayFilterFromContext);
          const rooms = formatted.roomIds.map(enrichRoomCard).filter(Boolean);
          return {
            reply: formatted.text,
            answer: formatted.text,
            rooms,
            roomIds: rooms.map(r => r.id),
            route: null,
            entitySchedule: { type: 'group', name: grpObj.name },
            openFreePanel: false,
            matchedIntent: true,
            modelUsed: 'local-campus-ai'
          };
        }
      }
    }
  }

  // Вспомогательное разрешение контекстной ссылки на аудиторию из предыдущего сообщения
  const resolveContextRoom = (refText) => {
    if (!lastRoomIds.length) return null;
    const norm = String(refText || '').toLowerCase();
    if (/(?:втор|2-й|2ой)/i.test(norm) && lastRoomIds[1] && roomsMeta[lastRoomIds[1]]) {
      return { id: lastRoomIds[1], meta: roomsMeta[lastRoomIds[1]] };
    }
    if (/(?:трет|3-й|3ей)/i.test(norm) && lastRoomIds[2] && roomsMeta[lastRoomIds[2]]) {
      return { id: lastRoomIds[2], meta: roomsMeta[lastRoomIds[2]] };
    }
    if (/(?:туда|сюда|там|нее|него|ней|перв|1-й|этой|эту|этого|той|нужн)/i.test(norm) && roomsMeta[lastRoomIds[0]]) {
      return { id: lastRoomIds[0], meta: roomsMeta[lastRoomIds[0]] };
    }
    return null;
  };

  // 1. Проверка запроса на построение маршрута («от ... до ...», «из ... в ...», «как пройти до ...», «как туда дойти?»)
  const routeFromToMatch = q.match(/(?:от|из)\s+(.+?)\s+(?:до|в|к)\s+(.+?)(?:[?.!]|$)/i);
  if (routeFromToMatch) {
    const fromPart = routeFromToMatch[1].trim();
    const toPart = routeFromToMatch[2].trim();
    const fromHits = fromPart.includes('вход') ? [{ id: entranceId, meta: roomsMeta[entranceId] }] : searchRoomsInMeta(roomsMeta, fromPart, 3);
    const ctxTo = resolveContextRoom(toPart);
    const toHits = ctxTo ? [ctxTo] : searchRoomsInMeta(roomsMeta, toPart, 3);
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
        openFreePanel: false,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
      };
    }
  }

  const routeToOnlyMatch = q.match(/(?:как\s+(?:пройти|дойти|добраться|попасть)\s+(?:до|в|к)|маршрут\s+(?:до|в|к))\s+(.+?)(?:[?.!]|$)/i);
  if (routeToOnlyMatch) {
    const targetQuery = routeToOnlyMatch[1].trim();
    const ctxTo = resolveContextRoom(targetQuery);
    const toHits = ctxTo ? [ctxTo] : searchRoomsInMeta(roomsMeta, targetQuery, 3);
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
        openFreePanel: false,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
      };
    }
  }

  // Контекстный маршрут к ранее обсуждавшейся аудитории («а как туда пройти?», «маршрут туда», «построй маршрут»)
  if (lastRoomIds.length > 0 && /(?:как\s+(?:туда|сюда|до\s+нее|до\s+него|к\s+ней)\s+(?:пройти|дойти|добраться|попасть)|(?:пройти|дойти|добраться|маршрут)\s+(?:туда|сюда)|построй(?:ть)?\s+маршрут)/i.test(q)) {
    const ctxRoom = resolveContextRoom(q) || (roomsMeta[lastRoomIds[0]] ? { id: lastRoomIds[0], meta: roomsMeta[lastRoomIds[0]] } : null);
    if (ctxRoom && roomsMeta[entranceId]) {
      const reply = `Чтобы дойти до «${ctxRoom.meta.name}» (${ctxRoom.meta.floor} этаж), удобнее всего начать от Главного входа (1 этаж). Нажмите кнопку ниже, чтобы построить маршрут на карте:`;
      const rooms = [enrichRoomCard(ctxRoom.id), enrichRoomCard(entranceId)].filter(Boolean);
      return {
        reply,
        answer: reply,
        rooms,
        roomIds: rooms.map(r => r.id),
        route: { fromRoomId: entranceId, toRoomId: ctxRoom.id },
        entitySchedule: null,
        openFreePanel: false,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
      };
    }
  }

  // 1b. Вопросы про расписание или текущую пару в конкретной аудитории («что сейчас в 302?», «кто ведёт в 209?», «расписание 100 аудитории», «какие пары во вторник в 302?»)
  const isRoomScheduleQuestion = /(?:что\s+(?:сейчас|сегодня|завтра)\s+в|кто\s+(?:сейчас\s+)?(?:в|ведет)|какие\s+(?:там\s+|сегодня\s+|завтра\s+|во?\s+\S+\s+)?пары|пары\s+(?:в|во)\s+|расписание\s+(?:ауд|каб|\d)|когда\s+освободится|занята\s+ли)/i.test(q);
  if (cacheStatus.ready && isRoomScheduleQuestion) {
    const dayFilter = detectDayFilterInQuery(q);
    const cleanedForRoom = q
      .replace(/[?.!,;:]/g, ' ')
      .replace(/(?:^|\s)(?:что|кто|сейчас|сегодня|завтра|какие|какая|какой|пары|пара|занятия|лекции|расписание|когда|освободится|занята|свободна|ли|ведет|идет|проходит|будут|будет|там|ней|нем|во|в|на|у|по|к|от|до|из|понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|пн|вт|ср|чт|пт|сб|аудитории|аудитория|ауд|кабинете|кабинет|каб)(?=\s|$)/gi, ' ')
      .replace(/(?:^|\s)(?:что|кто|сейчас|сегодня|завтра|какие|какая|какой|пары|пара|занятия|лекции|расписание|когда|освободится|занята|свободна|ли|ведет|идет|проходит|будут|будет|там|ней|нем|во|в|на|у|по|к|от|до|из|понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|пн|вт|ср|чт|пт|сб|аудитории|аудитория|ауд|кабинете|кабинет|каб)(?=\s|$)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const roomHits = cleanedForRoom ? searchRoomsInMeta(roomsMeta, cleanedForRoom, 2).filter(r => r.meta && r.meta.classroom) : [];
    const targetRoomId = roomHits.length > 0
      ? roomHits[0].id
      : (lastRoomIds.find(id => roomsMeta[id] && roomsMeta[id].classroom) || null);

    if (targetRoomId) {
      const formatted = formatClassroomScheduleForAi(targetRoomId, dayFilter);
      if (formatted) {
        const rooms = formatted.roomIds.map(enrichRoomCard).filter(Boolean);
        return {
          reply: formatted.text,
          answer: formatted.text,
          rooms,
          roomIds: rooms.map(r => r.id),
          route: null,
          entitySchedule: null,
          openFreePanel: false,
          matchedIntent: true,
          modelUsed: 'local-campus-ai'
        };
      }
    }
  }

  // 2. Проверка запроса про свободные аудитории («свободн», «где посидеть», «пустые») с умным ранжированием по длительности
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
        openFreePanel: true,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
      };
    }

    const freeScored = [];
    for (const [id, meta] of Object.entries(roomsMeta)) {
      if (!meta.classroom) continue;
      if (targetFloor !== null && meta.floor !== targetFloor) continue;
      const st = computeFreeStatus(id);
      if (st && !st.noSchedule) {
        let priority = 500;
        if (st.untilText === 'до конца дня' || st.untilText === 'до конца недели' || st.untilText.startsWith('до ')) {
          const timeMatch = st.untilText.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            priority = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
          } else {
            priority = 24 * 60; // свободна весь оставшийся день
          }
        }
        freeScored.push({ id, priority, floorDiff: Math.abs((meta.floor || 1) - currentFloor) });
      }
    }

    freeScored.sort((a, b) => b.priority - a.priority || a.floorDiff - b.floorDiff);
    const picked = freeScored.slice(0, 6).map(item => enrichRoomCard(item.id)).filter(Boolean);
    const floorLabel = targetFloor !== null ? ` на ${targetFloor} этаже` : ' в Главном корпусе';
    const reply = freeScored.length > 0
      ? `Сейчас${floorLabel} свободно учебных аудиторий: ${freeScored.length}. Вот лучшие варианты (отсортированы по запасу свободного времени):`
      : `Сейчас${floorLabel} не найдено свободных учебных аудиторий по расписанию.`;
    return {
      reply,
      answer: reply,
      rooms: picked,
      roomIds: picked.map(r => r.id),
      route: null,
      entitySchedule: null,
      openFreePanel: true,
      matchedIntent: true,
      modelUsed: 'local-campus-ai'
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
        openFreePanel: false,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
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
      openFreePanel: false,
      matchedIntent: true,
      modelUsed: 'local-campus-ai'
    };
  }

  // 4. Поиск по названию учебной дисциплины («Архитектура ЭВМ», «Высшая математика», «Физика»)
  const subjectHit = searchSubjectInSchedule(query);
  if (subjectHit) {
    const rooms = subjectHit.roomIds.map(enrichRoomCard).filter(Boolean);
    return {
      reply: subjectHit.text,
      answer: subjectHit.text,
      rooms,
      roomIds: rooms.map(r => r.id),
      route: null,
      entitySchedule: null,
      openFreePanel: false,
      matchedIntent: true,
      modelUsed: 'local-campus-ai'
    };
  }

  const reply = 'Не удалось найти точное совпадение. Укажите номер аудитории («100», «302»), группу («445», «443»), фамилию преподавателя («Устюков», «Пржегорлинский»), предмет («Архитектура ЭВМ»), кафедру («АСУ», «ЭВМ») или спросите «Какие аудитории сейчас свободны?».';
  return {
    reply,
    answer: reply,
    rooms: [],
    roomIds: [],
    route: null,
    entitySchedule: null,
    openFreePanel: false,
    matchedIntent: false,
    modelUsed: 'local-campus-ai'
  };
}

const AI_HARD_TIMEOUT_MS = 4500;
const aiResponseCache = new Map();
const AI_CACHE_MAX_SIZE = 100;
const AI_CACHE_BUCKET_MS = 3 * 60 * 1000; // 3 минуты актуальности

let cachedGenAiClient = null;
let cachedGenAiKey = '';
let cachedGenAiType = null;

async function getGenAiClient(apiKey) {
  if (cachedGenAiClient && cachedGenAiKey === apiKey && cachedGenAiType) {
    return { ai: cachedGenAiClient, Type: cachedGenAiType };
  }
  const { GoogleGenAI, Type } = await import('@google/genai');
  cachedGenAiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
  cachedGenAiKey = apiKey;
  cachedGenAiType = Type;
  return { ai: cachedGenAiClient, Type: cachedGenAiType };
}

async function processAiAssistantQuery(query, currentFloor = 1, history = []) {
  // 1. Мгновенно (~2-5 мс) рассчитываем ответ встроенного локального ИИ кампуса
  const localResult = localCampusAssistant(query, currentFloor, history);

  // Если встроенный ИИ кампуса точно распознал намерение (расписание, маршрут, аудитория, предмет, звонки, свободные) —
  // отдаём ответ МГНОВЕННО без задержек на внешние запросы
  if (localResult.matchedIntent) {
    return localResult;
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || !query) {
    return localResult;
  }

  const { lastRoomIds, lastEntitySchedule, recentTurns } = extractHistoryContext(history);
  const contextSig = `${lastEntitySchedule ? `${lastEntitySchedule.type}:${lastEntitySchedule.name}` : ''}|${lastRoomIds.slice(0, 2).join(',')}`;
  const timeBucket = Math.floor(Date.now() / AI_CACHE_BUCKET_MS);
  const cacheKey = `${query.toLowerCase().trim()}|f:${currentFloor}|ctx:${contextSig}|t:${timeBucket}`;

  if (aiResponseCache.has(cacheKey)) {
    return aiResponseCache.get(cacheKey);
  }

  try {
    const { ai, Type } = await getGenAiClient(apiKey);

    const relevantSearch = searchRoomsInMeta(roomsMeta, query, 8);
    const specialIds = new Set(relevantSearch.map(r => r.id));
    lastRoomIds.slice(0, 4).forEach(id => specialIds.add(id));

    for (const [id, meta] of Object.entries(roomsMeta)) {
      if (['buffet', 'entrance', 'medical', 'wardrobe', 'gym'].includes(meta.type)) {
        specialIds.add(id);
      } else if ((meta.name || '').toLowerCase().includes('деканат')) {
        specialIds.add(id);
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
      const desc = meta.description ? ` (${meta.description.split('\n')[0]})` : '';
      catalogLines.push(`${id}: ${meta.name}${desc}, эт.${meta.floor}, тип:${meta.type}${statusInfo}`);
    }

    const dialogContextText = recentTurns.length > 0
      ? `Контекст текущего диалога:\n` + recentTurns.slice(-4).map(t => {
          const roleLabel = t.role === 'user' ? 'Пользователь' : 'ИИ';
          const extraRooms = t.roomIds.length ? ` [roomIds: ${t.roomIds.join(', ')}]` : '';
          const extraEntity = t.entitySchedule ? ` [entity: ${t.entitySchedule.type}=${t.entitySchedule.name}]` : '';
          return `${roleLabel}: ${t.text}${extraRooms}${extraEntity}`;
        }).join('\n') + '\n\n'
      : '';

    const systemInstruction =
      `Ты — быстрый и точный ИИ-навигатор карты и расписания РГРТУ (Главный корпус).\n` +
      `Этаж пользователя: ${currentFloor}. Отвечай кратко, по делу и дружелюбно на русском языке.\n` +
      `Никогда не путай столовую/буфет (c_f1_buffet_1, c_f1_buffet_2, c_f1_108a) с лабораториями кафедр.\n\n` +
      dialogContextText +
      `Каталог помещений:\n` +
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
              description: 'Лаконичный и точный ответ пользователю на русском языке.'
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

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`gemini-3.8-flash timeout (> ${AI_HARD_TIMEOUT_MS}ms)`)), AI_HARD_TIMEOUT_MS);
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutHandle);
    });

    const parsed = JSON.parse((response.text || '{}').trim());
    const validRoomIds = (parsed.matchedRoomIds || []).filter(id => !!roomsMeta[id]).slice(0, 6);
    const rooms = validRoomIds.length > 0
      ? validRoomIds.map(enrichRoomCard).filter(Boolean)
      : localResult.rooms;

    let route = null;
    if (parsed.routeFromId && parsed.routeToId && roomsMeta[parsed.routeFromId] && roomsMeta[parsed.routeToId]) {
      route = { fromRoomId: parsed.routeFromId, toRoomId: parsed.routeToId };
    }

    const finalReply = (parsed.reply || '').trim() || localResult.reply;
    const resultPayload = {
      reply: finalReply,
      answer: finalReply,
      rooms,
      roomIds: rooms.map(r => r.id),
      route,
      entitySchedule: lastEntitySchedule || null,
      openFreePanel: Boolean(parsed.openFreePanel),
      modelUsed: 'gemini-3.8-flash'
    };

    if (aiResponseCache.size >= AI_CACHE_MAX_SIZE) {
      const oldestKey = aiResponseCache.keys().next().value;
      if (oldestKey) aiResponseCache.delete(oldestKey);
    }
    aiResponseCache.set(cacheKey, resultPayload);

    return resultPayload;
  } catch (e) {
    return localResult;
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
      .filter(l => {
        if (!q) return true;
        const hay = `${l.name} ${l.shortName} ${l.fullName || ''} ${l.regalia || ''}`.toLowerCase().replace(/ё/g, 'е');
        return hay.includes(q) || l.surname.includes(q);
      })
      .map(l => ({
        name: l.name,
        shortName: l.shortName,
        fullName: l.fullName || l.shortName,
        regalia: l.regalia || '',
        department: l.department || '',
        roomsCount: l.rooms.size,
        lessonsCount: l.lessons.length
      }))
      .sort((a, b) => collator.compare(a.fullName, b.fullName));

    const groups = [...scheduleIndex.groups.values()]
      .filter(g => {
        if (!q) return true;
        const hay = `${g.name} ${g.faculty || ''}`.toLowerCase().replace(/ё/g, 'е');
        return hay.includes(q);
      })
      .map(g => ({
        name: g.name,
        faculty: g.faculty || '',
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
      const { query = '', currentFloor = 1, history = [] } = JSON.parse(rawBody || '{}');
      const result = await processAiAssistantQuery(
        String(query).trim(),
        Number(currentFloor) || 1,
        Array.isArray(history) ? history : []
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.error('[ai-assistant]', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- API: Профиль пользователя (статус студент/преподаватель, группа/ФИО, тема, уведомления) ---
  if (url.pathname === '/api/user/profile' && req.method === 'GET') {
    const userId = (url.searchParams.get('userId') || '').trim();
    const rawUser = userId ? userStore.getUser(userId) : null;
    const { getBotUsername } = (() => {
      try { return require('./bot.js'); } catch (e) { return {}; }
    })();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      user: userStore.toPublicUser(rawUser),
      botUsername: typeof getBotUsername === 'function' ? getBotUsername() : ''
    }));
    return;
  }

  if (url.pathname === '/api/user/profile' && req.method === 'POST') {
    try {
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody || '{}');
      const userId = String(body.userId || '').trim();
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Missing userId' }));
        return;
      }
      const user = userStore.upsertUser(userId, {
        role: body.role,
        targetName: body.targetName,
        theme: body.theme,
        notificationsEnabled: body.notificationsEnabled,
        firstName: body.firstName,
        username: body.username
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, user }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // --- API: Авторизация и привязка через Telegram ---
  if (url.pathname === '/api/user/auth-telegram' && req.method === 'POST') {
    try {
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody || '{}');
      const mode = String(body.mode || 'code').trim();
      const mergePrefs = {
        role: body.role,
        targetName: body.targetName,
        theme: body.theme
      };

      if (mode === 'webapp') {
        const botToken = (process.env.BOT_TOKEN || '').trim();
        let tgUser = verifyTelegramWebAppInitData(body.initData, botToken);
        if (!tgUser && body.unsafeUser && body.unsafeUser.id) {
          tgUser = body.unsafeUser;
        }
        if (!tgUser || !tgUser.id) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Не удалось подтвердить данные Telegram WebApp' }));
          return;
        }
        const userId = `tg_${tgUser.id}`;
        const existing = userStore.getUser(userId);
        const patch = {
          telegramId: tgUser.id,
          firstName: tgUser.first_name || tgUser.firstName || '',
          username: tgUser.username || ''
        };
        if ((!existing || !existing.targetName) && mergePrefs.targetName) {
          patch.role = mergePrefs.role;
          patch.targetName = mergePrefs.targetName;
        }
        const user = userStore.upsertUser(userId, patch);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, user }));
        return;
      }

      if (mode === 'session-start') {
        const sessionToken = userStore.createBrowserAuthSession();
        const { getBotUsername } = (() => {
          try { return require('./bot.js'); } catch (e) { return {}; }
        })();
        const botUsername = typeof getBotUsername === 'function' ? getBotUsername() : '';
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          sessionToken,
          botUsername,
          botLink: botUsername ? `https://t.me/${botUsername}?start=login_${sessionToken}` : ''
        }));
        return;
      }

      if (mode === 'session-check') {
        const result = userStore.checkBrowserAuthSession(body.sessionToken);
        if (result.status === 'verified' && result.user) {
          if (!result.user.targetName && mergePrefs.targetName) {
            result.user = userStore.upsertUser(result.user.id, {
              role: mergePrefs.role,
              targetName: mergePrefs.targetName
            });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, ...result }));
        return;
      }

      if (mode === 'code') {
        const user = userStore.consumeAuthCode(body.code, mergePrefs);
        if (!user) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Неверный или истёкший код. Отправьте /login боту в Telegram.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, user }));
        return;
      }

      if (mode === 'quick') {
        const ident = String(body.identifier || '').replace(/^@/, '').trim();
        if (!ident) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Укажите ваш Telegram @username или ID' }));
          return;
        }
        let user = null;
        if (/^\d{5,15}$/.test(ident)) {
          const existing = userStore.getUserByTelegramId(ident);
          user = userStore.upsertUser(`tg_${ident}`, {
            telegramId: Number(ident),
            firstName: body.firstName || (existing && existing.firstName) || `ID ${ident}`,
            role: (existing && existing.role) || mergePrefs.role || 'student',
            targetName: (existing && existing.targetName) || mergePrefs.targetName || ''
          });
        } else {
          const byUsername = userStore.findUserByUsername(ident);
          if (byUsername) {
            user = userStore.upsertUser(byUsername.id, {
              role: byUsername.role || mergePrefs.role || 'student',
              targetName: byUsername.targetName || mergePrefs.targetName || ''
            });
          } else {
            const safeKey = `tg_u_${ident.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
            const existing = userStore.getUser(safeKey);
            user = userStore.upsertUser(safeKey, {
              username: ident,
              firstName: body.firstName || (existing && existing.firstName) || `@${ident}`,
              role: (existing && existing.role) || mergePrefs.role || 'student',
              targetName: (existing && existing.targetName) || mergePrefs.targetName || ''
            });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, user }));
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Unsupported auth mode' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // --- API: Проверка приближающихся пар для рассылки уведомлений в Telegram ---
  if (url.pathname === '/api/internal/upcoming-notifications' && req.method === 'GET') {
    if (!cacheStatus.ready) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ notifications: [] }));
      return;
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayISO = `${yyyy}-${mm}-${dd}`;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const candidates = userStore.getUsersForNotifications();
    const notifications = [];

    for (const u of candidates) {
      const entityType = u.role === 'lecturer' ? 'lecturer' : 'group';
      let entityObj = null;
      if (entityType === 'lecturer') {
        entityObj = scheduleIndex.lecturers.get(u.targetName) || (findMatchingLecturers(u.targetName)[0] || null);
      } else {
        entityObj = scheduleIndex.groups.get(u.targetName.toUpperCase()) || scheduleIndex.groups.get(u.targetName) || null;
      }
      if (!entityObj) continue;

      const sched = buildEntityScheduleResponse(entityType, entityObj);
      if (!sched || !Array.isArray(sched.days)) continue;
      const todayDay = sched.days.find(d => d.date === todayISO);
      if (!todayDay || !Array.isArray(todayDay.lessons)) continue;

      for (const lesson of todayDay.lessons) {
        const parsedTime = parseLessonTime(lesson.time);
        if (!parsedTime) continue;
        const diffMin = parsedTime.start - nowMin;
        if (diffMin >= 1 && diffMin <= 16) {
          const slotKey = `${todayISO}|${lesson.time}|${lesson.roomId}`;
          if (u.lastNotifiedSlot === slotKey) continue;
          userStore.upsertUser(u.id, { lastNotifiedSlot: slotKey });
          notifications.push({
            userId: u.id,
            telegramId: u.telegramId,
            role: u.role,
            targetName: u.targetName,
            minutesLeft: diffMin,
            lesson: {
              time: lesson.time,
              type: lesson.type,
              subject: lesson.subject,
              roomShort: lesson.roomShort,
              floor: lesson.floor,
              group: lesson.group,
              lecturer: lesson.lecturer
            }
          });
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ notifications }));
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