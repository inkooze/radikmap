const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { URL } = require('url');
const cheerio = require('cheerio');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const {
  searchRoomsInMeta,
  formatWeekTriggerLabel,
  normalizeLessonType,
  parseRaspSchedulePageHtml,
  buildGroupCheatSheet,
  findUpcomingLessonRemindersForUser,
  detectUserTone
} = require('./js/graph-utils.js');
const { splitGroupAndLecturer, defaultUserStore, verifyTelegramWebAppInitData } = require('./js/user-store.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, 'data', 'cache.json');
const ENTITY_CACHE_FILE = path.join(ROOT, 'data', 'entity-schedule-cache.json');
const GRAPH_FILE = path.join(ROOT, 'data', 'graph.json');
const GRAPH_BACKUP_FILE = path.join(ROOT, 'data', 'graph.backup.json');
const USERS_FILE = path.join(ROOT, 'data', 'users.json');
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

const userStore = defaultUserStore;

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

const FACULTY_FULL_NAMES = {
  'ФРТ': 'Факультет радиотехники и телекоммуникаций',
  'ФЭ': 'Факультет электроники',
  'ФАИТУ': 'Факультет автоматики и информационных технологий в управлении',
  'ФВТ': 'Факультет вычислительной техники',
  'ИЭФ': 'Инженерно-экономический факультет',
  'ОА': 'Отдел аспирантуры',
  'ИДО': 'Институт дополнительного образования'
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
  '.ttf':  'font/ttf',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.css', '.js', '.json', '.svg', '.webmanifest']);

let roomsMeta = {};
let classroomToRoomMap = {};
let raspDirectoryMeta = {
  departments: [],
  lecturersInRasp: [],
  groupsInRasp: [],
  groupIdByName: {},
  deptByFullFio: {},
  facultyByGroup: {},
  availableWeeks: []
};
let lecturersReportList = [];
let scheduleCache = {};
let entityScheduleCache = {};
let cacheStatus = { ready: false, warming: false, progress: '0/0', lastUpdate: null };
let scheduleIndex = {
  lecturers: new Map(), // name -> { name, shortName, fullName, regalia, department, surname, rooms: Set, lessons: [] }
  groups: new Map(),    // group -> { name, faculty, facultyCode, rooms: Set, lessons: [] }
  orderedDates: [],     // [{ date, dayName }]
  departmentRoomsIndex: {} // deptUpper -> { deptName, ownedRooms: [], frequentRooms: [] }
};

function getRoomScheduleShortName(meta) {
  if (!meta) return '';
  const rawShort = String(meta.shortName || '').trim();
  if (rawShort && /[0-9А-Яа-яЁёA-Za-z]/.test(rawShort)) {
    return rawShort;
  }
  return String(meta.name || '').replace(/^Аудитория\s+/i, '').trim() || rawShort || String(meta.classroom || '');
}

function rebuildClassroomMap() {
  classroomToRoomMap = {};
  for (const [roomId, meta] of Object.entries(roomsMeta)) {
    if (meta && meta.classroom) {
      classroomToRoomMap[String(meta.classroom)] = {
        roomId,
        roomShort: getRoomScheduleShortName(meta),
        roomName: meta.name,
        floor: meta.floor,
        building: meta.building || 'C',
        buildingName: 'Главный корпус'
      };
    }
  }
}

try {
  const roomsPath = path.join(ROOT, 'data', 'rooms.json');
  roomsMeta = JSON.parse(fs.readFileSync(roomsPath, 'utf8'));
  rebuildClassroomMap();
  console.log(`[init] Загружено ${Object.keys(roomsMeta).length} помещений`);
} catch (e) {
  console.error('[init] Не удалось загрузить rooms.json:', e.message);
}

try {
  const raspMetaPath = path.join(ROOT, 'data', 'rasp-directory-meta.json');
  if (fs.existsSync(raspMetaPath)) {
    raspDirectoryMeta = {
      ...raspDirectoryMeta,
      ...JSON.parse(fs.readFileSync(raspMetaPath, 'utf8'))
    };
  }
  const repPath = path.join(ROOT, 'data', 'lecturers-report.json');
  if (fs.existsSync(repPath)) {
    lecturersReportList = JSON.parse(fs.readFileSync(repPath, 'utf8'));
  }
} catch (e) {
  console.warn('[init] Не удалось загрузить метаданные справочника:', e.message);
}

function sanitizeEntityCacheRoomShorts(cacheObj) {
  if (!cacheObj || typeof cacheObj !== 'object') return;
  for (const entry of Object.values(cacheObj)) {
    if (!entry || !Array.isArray(entry.days)) continue;
    for (const day of entry.days) {
      for (const lesson of (day.lessons || [])) {
        if (lesson.roomShort === '🏀' || lesson.roomId === 'C_gym_main') {
          lesson.roomShort = 'Спортзал';
        } else if (lesson.roomId === 'C_auditori_50c' && /оптимизац/i.test(lesson.subject || '')) {
          lesson.roomShort = '50а';
        } else if (!lesson.roomShort && lesson.roomId && roomsMeta[lesson.roomId]) {
          lesson.roomShort = getRoomScheduleShortName(roomsMeta[lesson.roomId]);
        }
      }
    }
  }
}

try {
  if (fs.existsSync(ENTITY_CACHE_FILE)) {
    entityScheduleCache = JSON.parse(fs.readFileSync(ENTITY_CACHE_FILE, 'utf8'));
    sanitizeEntityCacheRoomShorts(entityScheduleCache);
  }
} catch (e) {
  entityScheduleCache = {};
}

let _entityCacheTimer = null;
function saveEntityCacheToDisk() {
  if (_entityCacheTimer) clearTimeout(_entityCacheTimer);
  _entityCacheTimer = setTimeout(async () => {
    _entityCacheTimer = null;
    try {
      const tmp = `${ENTITY_CACHE_FILE}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(entityScheduleCache), 'utf8');
      await fs.promises.rename(tmp, ENTITY_CACHE_FILE);
    } catch (e) {}
  }, 400);
}

function getCurrentMoscowMondayISO() {
  try {
    const { todayISO } = getMoscowClockNow();
    if (!todayISO) return '';
    const d = new Date(`${todayISO}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diffToMonday = dow === 0 ? -6 : (1 - dow);
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diffToMonday);
    return mon.toISOString().slice(0, 10);
  } catch (e) {
    return '';
  }
}

function getFormattedAvailableWeeks() {
  const rawWeeks = Array.isArray(raspDirectoryMeta.availableWeeks) ? raspDirectoryMeta.availableWeeks : [];
  const currentMondayISO = getCurrentMoscowMondayISO();
  const hasExactMondayMatch = Boolean(currentMondayISO && rawWeeks.some(w => w && w.value === currentMondayISO));
  return rawWeeks.map(w => ({
    value: w.value,
    rawLabel: w.label || w.rawLabel || '',
    label: formatWeekTriggerLabel(w.value, w.label || w.rawLabel || ''),
    isDefault: hasExactMondayMatch
      ? w.value === currentMondayISO
      : Boolean(w.isDefault || w.isCurrent || /текущ/i.test(w.label || w.rawLabel || ''))
  }));
}

function getDefaultWeekValue() {
  const weeks = getFormattedAvailableWeeks();
  const def = weeks.find(w => w.isDefault) || weeks[0];
  return def ? def.value : '';
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
  let raspId = null;

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
      raspId = raspEntry.value || null;
    } else if (repMatch && repMatch.fio) {
      fullName = repMatch.fio.trim();
    }
    if (fullName && raspDirectoryMeta.deptByFullFio && raspDirectoryMeta.deptByFullFio[fullName]) {
      department = raspDirectoryMeta.deptByFullFio[fullName];
    } else if (/ИнЯз/i.test(raw)) {
      department = 'ИнЯз';
    }
  } else {
    const raspByFull = (raspDirectoryMeta.lecturersInRasp || []).find(
      x => String(x.label || '').toLowerCase().replace(/ё/g, 'е') === clean.toLowerCase().replace(/ё/g, 'е')
    );
    if (raspByFull) {
      fullName = raspByFull.label.trim();
      raspId = raspByFull.value || null;
      if (raspDirectoryMeta.deptByFullFio && raspDirectoryMeta.deptByFullFio[fullName]) {
        department = raspDirectoryMeta.deptByFullFio[fullName];
      }
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

  return {
    fullName,
    fullFio: fullName,
    positionShort: posShort,
    degreeShort: deg,
    regalia,
    metaLine: regalia,
    department,
    raspId
  };
}

function resolveGroupFacultyCode(groupName) {
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

function resolveGroupFaculty(groupName) {
  const code = resolveGroupFacultyCode(groupName);
  return FACULTY_FULL_NAMES[code] || code;
}

function resolveGroupRaspId(groupName) {
  const clean = String(groupName || '').trim();
  if (raspDirectoryMeta.groupIdByName && raspDirectoryMeta.groupIdByName[clean]) {
    return raspDirectoryMeta.groupIdByName[clean];
  }
  const upper = clean.toUpperCase().replace(/Ё/g, 'Е');
  if (raspDirectoryMeta.groupIdByName && raspDirectoryMeta.groupIdByName[upper]) {
    return raspDirectoryMeta.groupIdByName[upper];
  }
  return null;
}

function parseLessonText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.*?),?\s*гр\.\s*(.+)$/);
  if (!m) {
    return { subject: clean, group: '', groups: [], subgroup: '', lecturer: '' };
  }
  const subject = m[1].replace(/,\s*$/, '').trim();
  const { group, groups, subgroup, lecturer } = splitGroupAndLecturer(m[2], '');
  return { subject, group, groups, subgroup: subgroup || '', lecturer };
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
        if (fixed.subgroup && !l.subgroup) l.subgroup = fixed.subgroup;
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
  const deptRoomCounts = {}; // deptUpper -> Map(roomId -> count)

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
          subgroup: lesson.subgroup || fixed.subgroup || '',
          group: fixed.group,
          groups: fixed.groups,
          lecturer: fixed.lecturer,
          roomId,
          roomName: meta.name,
          roomShort: getRoomScheduleShortName(meta),
          floor: meta.floor,
          building: meta.building
        };

        // Индексируем преподавателя (включая случай нескольких преподавателей через запятую)
        const rawLecturers = fixed.lecturer
          ? fixed.lecturer.split(',').map(s => s.trim()).filter(Boolean)
          : [];

        for (const lecKey of rawLecturers) {
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

          if (lecObj.department) {
            const deptKey = lecObj.department.toUpperCase();
            if (!deptRoomCounts[deptKey]) deptRoomCounts[deptKey] = new Map();
            deptRoomCounts[deptKey].set(roomId, (deptRoomCounts[deptKey].get(roomId) || 0) + 1);
          }
        }

        // Индексируем каждую группу
        for (const grp of fixed.groups) {
          if (!groups.has(grp)) {
            groups.set(grp, {
              name: grp,
              facultyCode: resolveGroupFacultyCode(grp),
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

  // Также добавляем все группы из rasp-directory-meta.json, чтобы список групп был 100% полным
  for (const gItem of (raspDirectoryMeta.groupsInRasp || [])) {
    const gName = String(gItem.label || '').trim().toUpperCase().replace(/Ё/g, 'Е');
    if (gName && !groups.has(gName)) {
      groups.set(gName, {
        name: gName,
        facultyCode: resolveGroupFacultyCode(gName),
        faculty: resolveGroupFaculty(gName),
        rooms: new Set(),
        lessons: []
      });
    }
  }

  // Индекс помещений кафедр (O(1) поиск по названию кафедры)
  const departmentRoomsIndex = {};
  const allDeptLabels = new Set(
    (raspDirectoryMeta.departments || []).map(d => String(d.label || '').trim()).filter(Boolean)
  );
  for (const r of Object.values(roomsMeta)) {
    const m = String(r?.name || '').match(/кафедр[аы]\s+([А-ЯЁA-Za-z\s.]+?)(?:\s*\(|$)/i);
    if (m && m[1]) allDeptLabels.add(m[1].trim());
  }

  const DEPT_ALIASES = {
    'ИНЯЗ': ['ин. яз', 'иностранного языка', 'ин.яз', 'иняз'],
    'ФВ': ['физвоспитания', 'физвосп', 'физического воспитания'],
    'РУС': ['русского языка'],
    'САПР ВС': ['сапр вс', 'сапр']
  };

  for (const deptLabel of allDeptLabels) {
    const deptUpper = deptLabel.toUpperCase();
    const aliases = [deptLabel.toLowerCase(), ...(DEPT_ALIASES[deptUpper] || [])];
    const ownedRooms = [];

    for (const [roomId, r] of Object.entries(roomsMeta)) {
      if (!r || r.type === 'stairs') continue;
      const nameLow = (r.name || '').toLowerCase();
      const matched = aliases.some(alias => {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:кафедр[аы]|каф\\.?|лаборатор[ияная]+|преподавательская|мастерская|кладовая|помещение)\\s+(?:кафедры\\s+)?${escaped}(?:[^а-яёa-z]|$)`, 'i');
        return re.test(nameLow);
      });
      if (matched) {
        ownedRooms.push({
          roomId,
          name: r.name,
          shortName: r.shortName || r.name,
          floor: r.floor,
          type: r.type
        });
      }
    }

    const ownedIds = new Set(ownedRooms.map(o => o.roomId));
    const freqMap = deptRoomCounts[deptUpper] || new Map();
    const frequentRooms = Array.from(freqMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([roomId, count]) => {
        const r = roomsMeta[roomId] || {};
        return {
          roomId,
          name: r.name || roomId,
          shortName: r.shortName || r.name || roomId,
          floor: r.floor,
          lessonsCount: count,
          isOwned: ownedIds.has(roomId)
        };
      });

    departmentRoomsIndex[deptUpper] = {
      deptName: deptLabel,
      ownedRooms,
      frequentRooms
    };
  }

  const orderedDates = [...datesMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayName]) => ({ date, dayName }));

  scheduleIndex = { lecturers, groups, orderedDates, departmentRoomsIndex };
  console.log(`[index] Проиндексировано преподавателей: ${lecturers.size}, групп: ${groups.size}`);
}

function getMoscowClockNow() {
  const now = new Date();
  const dayNamesByDow = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(now);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const yyyy = map.year || String(now.getFullYear());
    const mm = map.month || String(now.getMonth() + 1).padStart(2, '0');
    const dd = map.day || String(now.getDate()).padStart(2, '0');
    const hh = Number(map.hour === '24' ? 0 : map.hour);
    const min = Number(map.minute || 0);
    const moscowDate = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
    const todayDayName = dayNamesByDow[moscowDate.getUTCDay()] || dayNamesByDow[now.getDay()];
    return {
      todayISO: `${yyyy}-${mm}-${dd}`,
      todayDayName,
      nowMin: hh * 60 + min
    };
  } catch (e) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return {
      todayISO: `${yyyy}-${mm}-${dd}`,
      todayDayName: dayNamesByDow[now.getDay()],
      nowMin: now.getHours() * 60 + now.getMinutes()
    };
  }
}

function computeEntityNowStatusFromDays(days) {
  const { todayISO, nowMin } = getMoscowClockNow();

  let nowStatus = { type: 'free', title: 'Сейчас пар нет', details: 'На этой неделе больше нет пар по расписанию' };
  const todayDay = (days || []).find(d => d.date === todayISO);

  if (todayDay && todayDay.lessons && todayDay.lessons.length > 0) {
    const current = todayDay.lessons.find(l => {
      const t = parseLessonTime(l.time);
      return t && nowMin >= t.start && nowMin <= t.end;
    });
    if (current) {
      const endMatch = current.time.match(/[–-](\d{1,2}:\d{2})/);
      const leftMin = parseLessonTime(current.time) ? Math.max(1, parseLessonTime(current.time).end - nowMin) : null;
      const roomPart = current.roomShort ? ` · ауд. ${current.roomShort}` : '';
      nowStatus = {
        type: 'busy',
        title: `Сейчас идёт пара${roomPart}`,
        details: `${current.subject}${endMatch ? ' · до ' + endMatch[1] : ''}${leftMin ? ` (осталось ${leftMin} мин)` : ''}`,
        roomId: current.roomId || null
      };
      return nowStatus;
    }

    const next = todayDay.lessons.find(l => {
      const t = parseLessonTime(l.time);
      return t && t.start > nowMin;
    });
    if (next) {
      const startMatch = next.time.match(/^(\d{1,2}:\d{2})/);
      const waitMin = parseLessonTime(next.time) ? Math.max(1, parseLessonTime(next.time).start - nowMin) : null;
      const roomPart = next.roomShort ? ` · ауд. ${next.roomShort}` : '';
      nowStatus = {
        type: 'free',
        title: 'Сейчас свободно',
        details: `Следующая пара сегодня в ${startMatch ? startMatch[1] : next.time}${waitMin && waitMin <= 180 ? ` (через ${waitMin} мин)` : ''}${roomPart} (${next.subject})`,
        roomId: next.roomId || null
      };
      return nowStatus;
    }
  }

  const upcomingDay = (days || []).find(d => d.date > todayISO && d.lessons && d.lessons.length > 0);
  if (upcomingDay && upcomingDay.lessons.length > 0) {
    const first = upcomingDay.lessons[0];
    const startMatch = first.time.match(/^(\d{1,2}:\d{2})/);
    const roomPart = first.roomShort ? ` · ауд. ${first.roomShort}` : '';
    nowStatus = {
      type: 'free',
      title: 'Сейчас пар нет',
      details: `Ближайшая пара: ${upcomingDay.dayName}${startMatch ? ' в ' + startMatch[1] : ''}${roomPart} (${first.subject})`,
      roomId: first.roomId || null
    };
  }

  return nowStatus;
}

function buildDefaultDaysFromEntityObj(entityObj) {
  const orderedDates = scheduleIndex.orderedDates.length > 0
    ? scheduleIndex.orderedDates
    : [];
  return orderedDates.map(({ date, dayName }) => {
    const dayLessonsRaw = (entityObj.lessons || []).filter(l => l.date === date);
    const dedupMap = new Map();
    for (const l of dayLessonsRaw) {
      const key = `${l.time}|${l.type}|${l.subject}|${l.subgroup || ''}|${l.roomId || l.roomShort}|${l.group}|${l.lecturer}`;
      if (!dedupMap.has(key)) dedupMap.set(key, l);
    }
    const lessons = [...dedupMap.values()].sort((a, b) => a.time.localeCompare(b.time));
    return { date, dayName, lessons };
  });
}

function getAllCachedDaysForGroup(groupName, fallbackDays = [], entityObj = null) {
  const prefix = `group:${groupName}:`;
  const combinedDays = [];
  const seenCacheKeys = new Set();

  for (const [k, v] of Object.entries(entityScheduleCache)) {
    if (k.startsWith(prefix) && v && Array.isArray(v.days)) {
      seenCacheKeys.add(k);
      combinedDays.push(...v.days);
    }
  }
  if (Array.isArray(fallbackDays) && fallbackDays.length > 0) {
    combinedDays.push(...fallbackDays);
  }
  if (entityObj && Array.isArray(entityObj.lessons) && entityObj.lessons.length > 0) {
    combinedDays.push({ date: 'index', dayName: '', lessons: entityObj.lessons });
  }
  return combinedDays;
}

function selectFourCycleWeekValues(availableWeeks = [], anchorDate = '') {
  const valid = (availableWeeks || []).map(w => w.value).filter(Boolean);
  if (valid.length === 0) return anchorDate ? [anchorDate] : [];
  if (valid.length <= 4) return valid;

  let startIdx = valid.indexOf(anchorDate);
  if (startIdx === -1) {
    const defIdx = (availableWeeks || []).findIndex(w => w.isDefault || w.isCurrent);
    startIdx = defIdx >= 0 ? defIdx : 0;
  }
  if (startIdx + 4 <= valid.length) {
    return valid.slice(startIdx, startIdx + 4);
  }
  return valid.slice(Math.max(0, valid.length - 4), valid.length);
}

function buildEntityScheduleResponse(entityType, entityObj, customDays = null, weekData = {}) {
  if (!entityObj) return null;

  const defaultDays = buildDefaultDaysFromEntityObj(entityObj);
  const days = (Array.isArray(customDays) && customDays.length > 0) ? customDays : defaultDays;

  const statusSourceDays = (Array.isArray(weekData.currentWeekDays) && weekData.currentWeekDays.length > 0)
    ? weekData.currentWeekDays
    : (weekData.isCurrentWeek !== false ? days : defaultDays);

  const nowStatus = computeEntityNowStatusFromDays(statusSourceDays);

  const roomIdsSet = new Set(entityObj.rooms || []);
  for (const d of days) {
    for (const l of (d.lessons || [])) {
      if (l.roomId) roomIdsSet.add(l.roomId);
    }
  }

  const roomsList = [...roomIdsSet]
    .map(id => {
      const m = roomsMeta[id];
      if (!m) return null;
      return { id, name: m.name, shortName: getRoomScheduleShortName(m), floor: m.floor, building: m.building };
    })
    .filter(Boolean);

  const availableWeeks = weekData.availableWeeks && weekData.availableWeeks.length > 0
    ? weekData.availableWeeks
    : getFormattedAvailableWeeks();

  const selectedWeek = weekData.selectedWeek
    || availableWeeks.find(w => w.isDefault)
    || availableWeeks[0]
    || null;

  const cheatSheetDays = entityType === 'group'
    ? (Array.isArray(weekData.cheatSheetDays) && weekData.cheatSheetDays.length > 0
        ? weekData.cheatSheetDays
        : getAllCachedDaysForGroup(entityObj.name, days, entityObj))
    : [];

  const cheatSheet = entityType === 'group'
    ? buildGroupCheatSheet(cheatSheetDays, resolveLecturerMeta)
    : undefined;

  return {
    entityType,
    name: entityObj.name,
    shortName: entityObj.shortName || entityObj.name,
    fullName: entityObj.fullName || entityObj.shortName || entityObj.name,
    regalia: entityObj.regalia || '',
    department: entityObj.department || '',
    faculty: entityObj.faculty || '',
    facultyCode: entityObj.facultyCode || '',
    rooms: roomsList,
    lessonsCount: days.reduce((acc, d) => acc + (d.lessons ? d.lessons.length : 0), 0),
    nowStatus,
    days,
    isCurrentWeek: weekData.isCurrentWeek !== false,
    currentWeekDays: statusSourceDays,
    availableWeeks,
    selectedWeek,
    cheatSheet
  };
}

async function ensureFourWeekGroupCache(groupName, raspId, availableWeeks, anchorDate) {
  if (!raspId) return;
  const weekValues = selectFourCycleWeekValues(availableWeeks, anchorDate);
  const missingWeeks = weekValues.filter(wVal => {
    const k = `group:${groupName}:${wVal}`;
    const entry = entityScheduleCache[k];
    return !(entry && (Date.now() - entry.fetchedAt < ENTITY_CACHE_TTL_MS) && Array.isArray(entry.days) && entry.days.length > 0);
  });
  if (missingWeeks.length === 0) return;

  await Promise.all(missingWeeks.map(async (wVal) => {
    try {
      const url = `https://rasp.rsreu.ru/schedule-frame/group?group=${encodeURIComponent(raspId)}&date=${encodeURIComponent(wVal)}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSREUMap/1.2)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        signal: AbortSignal.timeout(5500)
      });
      if (!resp.ok) return;
      const html = await resp.text();
      const parsed = parseRaspSchedulePageHtml(html, {
        entityType: 'group',
        entityName: groupName,
        classroomToRoomMap
      });
      if (!parsed.empty && Array.isArray(parsed.days) && parsed.days.length > 0) {
        entityScheduleCache[`group:${groupName}:${wVal}`] = {
          days: parsed.days,
          availableWeeks: parsed.availableWeeks,
          selectedWeek: parsed.selectedWeek,
          fetchedAt: Date.now()
        };
      }
    } catch (e) {
      // Ignore individual week fetch error
    }
  }));
  saveEntityCacheToDisk();
}

/**
 * Fetches complete group or lecturer schedule directly from rasp.rsreu.ru (supporting week date parameter)
 * and falls back cleanly to local scheduleIndex when offline.
 */
async function fetchCompleteEntitySchedule(type, entityObj, dateParam = '') {
  if (!entityObj) return null;
  const defaultWeek = getDefaultWeekValue();
  const effectiveDate = String(dateParam || '').trim() || defaultWeek;
  const isCurrentWeek = !effectiveDate || !defaultWeek || effectiveDate === defaultWeek;
  const cacheKey = `${type}:${entityObj.name}:${effectiveDate || 'current'}`;
  const currentWeekCacheKey = `${type}:${entityObj.name}:${defaultWeek || 'current'}`;
  const currentWeekCachedDays = entityScheduleCache[currentWeekCacheKey]?.days || null;

  const groupRaspId = type === 'group' ? resolveGroupRaspId(entityObj.name) : null;

  const cached = entityScheduleCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt < ENTITY_CACHE_TTL_MS) && Array.isArray(cached.days) && cached.days.length > 0) {
    if (type === 'group' && groupRaspId) {
      await ensureFourWeekGroupCache(
        entityObj.name,
        groupRaspId,
        cached.availableWeeks || getFormattedAvailableWeeks(),
        defaultWeek || effectiveDate
      );
    }
    return buildEntityScheduleResponse(type, entityObj, cached.days, {
      availableWeeks: cached.availableWeeks,
      selectedWeek: cached.selectedWeek,
      isCurrentWeek,
      currentWeekDays: isCurrentWeek ? cached.days : currentWeekCachedDays,
      cheatSheetDays: type === 'group' ? getAllCachedDaysForGroup(entityObj.name, cached.days, entityObj) : undefined
    });
  }

  let raspUrl = null;
  if (type === 'group') {
    if (groupRaspId) {
      const dateQuery = effectiveDate ? `&date=${encodeURIComponent(effectiveDate)}` : '';
      raspUrl = `https://rasp.rsreu.ru/schedule-frame/group?group=${encodeURIComponent(groupRaspId)}${dateQuery}`;
    }
  } else if (type === 'lecturer') {
    const lMeta = resolveLecturerMeta(entityObj.name);
    if (lMeta.raspId) {
      const dateQuery = effectiveDate ? `&date=${encodeURIComponent(effectiveDate)}` : '';
      raspUrl = `https://rasp.rsreu.ru/schedule-frame/lecturer?lecturer=${encodeURIComponent(lMeta.raspId)}${dateQuery}`;
    }
  } else if (type === 'classroom') {
    if (entityObj.building && entityObj.classroom) {
      const dateQuery = effectiveDate ? `&date=${encodeURIComponent(effectiveDate)}` : '';
      raspUrl = `https://rasp.rsreu.ru/schedule-frame/classroom?building=${encodeURIComponent(entityObj.building)}&classroom=${encodeURIComponent(entityObj.classroom)}${dateQuery}`;
    }
  }

  if (raspUrl) {
    try {
      const resp = await fetch(raspUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSREUMap/1.2)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        signal: AbortSignal.timeout(7500)
      });
      if (resp.ok) {
        const html = await resp.text();
        const parsed = parseRaspSchedulePageHtml(html, {
          entityType: type,
          entityName: entityObj.name,
          classroomToRoomMap
        });
        if (parsed.availableWeeks && parsed.availableWeeks.length > 0) {
          raspDirectoryMeta.availableWeeks = parsed.availableWeeks.map(w => ({
            value: w.value,
            label: w.rawLabel || w.label,
            isDefault: Boolean(w.isCurrent)
          }));
        }
        if (!parsed.empty && Array.isArray(parsed.days) && parsed.days.length > 0) {
          entityScheduleCache[cacheKey] = {
            days: parsed.days,
            availableWeeks: parsed.availableWeeks,
            selectedWeek: parsed.selectedWeek,
            fetchedAt: Date.now()
          };
          saveEntityCacheToDisk();
          if (type === 'group' && groupRaspId) {
            await ensureFourWeekGroupCache(
              entityObj.name,
              groupRaspId,
              parsed.availableWeeks || getFormattedAvailableWeeks(),
              defaultWeek || effectiveDate
            );
          }
          return buildEntityScheduleResponse(type, entityObj, parsed.days, {
            availableWeeks: parsed.availableWeeks,
            selectedWeek: parsed.selectedWeek,
            isCurrentWeek,
            currentWeekDays: isCurrentWeek ? parsed.days : currentWeekCachedDays,
            cheatSheetDays: type === 'group' ? getAllCachedDaysForGroup(entityObj.name, parsed.days, entityObj) : undefined
          });
        }
      }
    } catch (e) {
      // Fall back to local scheduleIndex
    }
  }

  const availableWeeks = getFormattedAvailableWeeks();
  const selectedWeek = availableWeeks.find(w => w.value === effectiveDate)
    || availableWeeks.find(w => w.isDefault)
    || availableWeeks[0]
    || null;

  return buildEntityScheduleResponse(type, entityObj, null, {
    availableWeeks,
    selectedWeek,
    isCurrentWeek,
    currentWeekDays: currentWeekCachedDays
  });
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

    if (fullLower.includes(q) || q.includes(surname)) {
      matches.push({ lec, score: 100 });
      continue;
    }

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
    },
    signal: AbortSignal.timeout(7500)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function buildSyntheticScheduleHtmlFromCachedEntry(entry, requestedDate = '') {
  if (!entry || entry.empty || !Array.isArray(entry.days) || entry.days.length === 0) {
    return `<select name="date"></select>`;
  }
  const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const ths = entry.days.map(d => {
    const [, mStr, dStr] = String(d.date || '').split('-');
    const dateSpan = dStr && mStr ? `${parseInt(dStr, 10)} ${MONTH_NAMES[parseInt(mStr, 10) - 1] || ''}` : '';
    return `<th><span>${dateSpan}</span> ${d.dayName || ''}</th>`;
  }).join('');

  const slotSet = new Set(['08:10–09:45', '09:55–11:30', '11:40–13:15', '13:35–15:10', '15:20–16:55', '17:05–18:40']);
  entry.days.forEach(d => (d.lessons || []).forEach(l => { if (l.time) slotSet.add(l.time.replace('-', '–')); }));
  const slots = [...slotSet].sort((a, b) => a.localeCompare(b));

  const trs = slots.map(slot => {
    const [start, end] = slot.split(/[–-]/);
    const tds = entry.days.map(d => {
      const matching = (d.lessons || []).filter(l => (l.time || '').replace('-', '–') === slot);
      const inner = matching.map(l => {
        const badge = l.type ? `<span class="schedule-lesson-type-badge">${l.type}</span>` : '';
        const grpWithSub = [l.group, l.subgroup].filter(Boolean).join(', ');
        const tail = [grpWithSub, l.lecturer].filter(Boolean).join(', ');
        return `<div>${badge} ${l.subject}${tail ? `, гр. ${tail}` : ''}</div>`;
      }).join('');
      return `<td class="schedule-cell">${inner}</td>`;
    }).join('');
    return `<tr><td><div>${start || ''}</div><div>${end || ''}</div></td>${tds}</tr>`;
  }).join('');

  const weeks = getFormattedAvailableWeeks();
  const optionsHtml = weeks.length > 0
    ? weeks.map(w => {
        const isSel = requestedDate ? (w.value === requestedDate) : Boolean(w.isDefault);
        return `<option value="${w.value}"${isSel ? ' selected' : ''}>${w.rawLabel || w.label}</option>`;
      }).join('')
    : `<option value="2026-11-02" selected>02.11.2026, знам.</option>`;

  return `<select name="date">${optionsHtml}</select><table class="table"><tr><th>Время</th>${ths}</tr>${trs}</table>`;
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
        const type = normalizeLessonType(badge.length ? badge.text().trim() : '');
        const clone = $div.clone();
        clone.find('.schedule-lesson-type-badge').remove();
        const text = clone.text().replace(/\s+/g, ' ').trim();
        const { subject, group, groups, subgroup, lecturer } = parseLessonText(text);
        days[d].lessons.push({ time, type, subject, subgroup, group, groups, lecturer });
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
  const m = String(time || '').match(/(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] };
}

function computeFreeStatus(roomId, customDayName = null, customMin = null) {
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
  const nowMin = customMin !== null ? customMin : (now.getHours() * 60 + now.getMinutes());

  const today = customDayName
    ? entry.days.find(d => String(d.dayName || '').toLowerCase() === customDayName.toLowerCase())
    : entry.days.find(d => d.date === todayISO);

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

// ============ ИИ-НАВИГАТОР РГРТУ ============

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
    const roomShort = getRoomScheduleShortName(meta);

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
      if (l.roomId) uniqueRoomIds.add(l.roomId);
      if (l.roomShort) uniqueRoomShorts.add(`ауд. ${l.roomShort}${l.floor != null ? ` (${l.floor} эт.)` : ''}`);
    });
  });

  const headerPrefix = entitySchedule.entityType === 'lecturer'
    ? `${entitySchedule.fullName || entitySchedule.name}${entitySchedule.regalia ? ` (${entitySchedule.regalia})` : ''}`
    : `Группа ${entitySchedule.name}`;

  const statusBanner = entitySchedule.nowStatus && entitySchedule.nowStatus.details
    ? `${entitySchedule.nowStatus.title}: ${entitySchedule.nowStatus.details}.\n`
    : '';

  if (daysToFormat.length === 0 || daysToFormat.every(d => d.lessons.length === 0)) {
    const scopeText = dayFilter ? `в ${dayFilter.toLowerCase()}` : 'на этой неделе';
    return {
      text: `${statusBanner}У ${entitySchedule.entityType === 'lecturer' ? entitySchedule.name : 'группы ' + entitySchedule.name} ${scopeText} нет пар в Главном корпусе по расписанию.`.trim(),
      roomIds: [...uniqueRoomIds, ...(entitySchedule.rooms || []).map(r => r.id)].slice(0, 6)
    };
  }

  const lines = [];
  if (statusBanner) {
    lines.push(statusBanner.trim());
  }

  if (dayFilter) {
    lines.push(`${headerPrefix} — расписание на ${dayFilter.toLowerCase()}${uniqueRoomShorts.size ? ` (аудитории: ${[...uniqueRoomShorts].join(', ')})` : ''}:`);
  } else {
    lines.push(`${headerPrefix} — занятия на этой неделе${uniqueRoomShorts.size ? ` в аудиториях: ${[...uniqueRoomShorts].join(', ')}` : ''}.`);
  }

  for (const d of daysToFormat) {
    if (!d.lessons.length) continue;
    const items = d.lessons.map(l => {
      const extra = entitySchedule.entityType === 'lecturer'
        ? (l.group ? `, гр. ${l.group}` : '')
        : (l.lecturer ? `, ${l.lecturer}` : '');
      const roomLabel = l.roomShort ? `ауд. ${l.roomShort}` : 'без ауд.';
      return `${l.time} — ${roomLabel} (${l.type ? l.type + ' ' : ''}${l.subject}${l.subgroup ? `, ${l.subgroup}` : ''}${extra})`;
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

function buildTonePrefix(tone) {
  if (tone === 'rude') {
    const snarkyPrefixes = [
      'Ого, сколько эмоций на ровном месте! Выдохни, а я пока дам точный ответ по факту:\n\n',
      'Полегче на поворотах — я тебе не расписание в деканате в 8 утра ставил. Держи информацию:\n\n',
      'Критика принята (нет). Но раз уж я профессионал, вот точные данные:\n\n'
    ];
    return snarkyPrefixes[Math.floor(Math.random() * snarkyPrefixes.length)];
  }
  return '';
}

function localCampusAssistant(query, currentFloor = 1, history = []) {
  const qRaw = String(query || '').trim();
  const q = qRaw.toLowerCase().replace(/ё/g, 'е').trim();
  const { lastRoomIds, lastEntitySchedule } = extractHistoryContext(history);
  const tone = detectUserTone(qRaw);
  const tonePrefix = buildTonePrefix(tone);

  if (!q) {
    const reply = 'Напишите номер аудитории, группу, фамилию преподавателя, название предмета, кафедру или задайте вопрос — например: «Помещения кафедры САПР ВС», «Кто ведёт у группы 546?» или «Какие аудитории сейчас свободны?».';
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

  // 0. Живое общение (приветствия, благодарности, грубость без предметного вопроса)
  const hasCampusKeyword = /(\d{2,4}|ауд|кафедр|каф\b|групп|гр\b|преп|доц|проф|ст\.\s*преп|асс|свободн|пуст|столов|буфет|туалет|wc|спортзал|деканат|маршрут|пройти|дойти|расписан|пар[аыуе]|лекц|лаб|окн[оа]|кто ведет|дисциплин|предмет|шпаргалк|звонк|перерыв|перемен|недел|числ|знам)/i.test(q);
  if (!hasCampusKeyword && !findMatchingLecturers(qRaw).length && !searchRoomsInMeta(roomsMeta, qRaw, 2).length) {
    if (tone === 'rude') {
      const reply = 'Самоутверждаться за счёт ИИ-помощника — это, конечно, сильный ход. Когда захочешь узнать что-то полезное — например, где сейчас пара у твоей группы, какие аудитории свободны или как пройти к кафедре — пиши по делу.';
      return { reply, answer: reply, rooms: [], roomIds: [], route: null, entitySchedule: null, openFreePanel: false, matchedIntent: true, modelUsed: 'local-campus-ai' };
    }
    if (/(привет|здравствуй|добрый|доброе|хай|салют|хелло)/i.test(q)) {
      const reply = 'Привет! Я ИИ\'шка РГРТУ — твой умный проводник по Главном корпусу и расписанию. Подскажу помещения любой кафедры, расписание групп и преподавателей, свободные аудитории и построю маршрут. О чём спросишь?';
      return { reply, answer: reply, rooms: [], roomIds: [], route: null, entitySchedule: null, openFreePanel: false, matchedIntent: true, modelUsed: 'local-campus-ai' };
    }
    if (/(как дела|как ты|как жизнь|че как)/i.test(q)) {
      const reply = `Отлично — держу в памяти расписание ${scheduleIndex.groups.size} групп и ${scheduleIndex.lecturers.size} преподавателей РГРТУ! Чем помочь?`;
      return { reply, answer: reply, rooms: [], roomIds: [], route: null, entitySchedule: null, openFreePanel: false, matchedIntent: true, modelUsed: 'local-campus-ai' };
    }
    if (/(спасибо|благодарю|пасиб|сяп|красавчик|молодец|супер|круто|лучший)/i.test(q)) {
      const reply = 'Всегда пожалуйста! Обращайся в любой момент — удачных пар и лёгкой сессии!';
      return { reply, answer: reply, rooms: [], roomIds: [], route: null, entitySchedule: null, openFreePanel: false, matchedIntent: true, modelUsed: 'local-campus-ai' };
    }
  }

  const entranceId = roomsMeta['C_entrance_c'] ? 'C_entrance_c' : Object.keys(roomsMeta).find(k => roomsMeta[k].type === 'entrance') || 'c_f1_100';

  // 0a. Помещения и аудитории конкретной кафедры («помещения кафедры САПР ВС», «аудитории кафедры ЭВМ»)
  const deptMatch = qRaw.match(/(?:помещени[яе]|аудитори[ия]|кабинеты|лаборатори[ия]|где\s+находится\s+кафедра|кафедр[аыуе]|каф\.?)\s+([А-ЯЁA-Za-z\s.]{2,18})/i);
  if (deptMatch) {
    const rawDeptQuery = deptMatch[1].replace(/[?.,!]/g, '').trim().toUpperCase();
    let matchedDept = scheduleIndex.departmentRoomsIndex[rawDeptQuery];
    if (!matchedDept) {
      for (const [k, val] of Object.entries(scheduleIndex.departmentRoomsIndex || {})) {
        if (k === rawDeptQuery || rawDeptQuery.includes(k) || k.includes(rawDeptQuery)) {
          matchedDept = val;
          break;
        }
      }
    }
    if (matchedDept && (matchedDept.ownedRooms.length > 0 || matchedDept.frequentRooms.length > 0)) {
      const roomIds = [];
      const lines = [`${tonePrefix}Кафедра ${matchedDept.deptName}:`];
      if (matchedDept.ownedRooms.length > 0) {
        lines.push('\nЗакреплённые помещения кафедры:');
        matchedDept.ownedRooms.forEach(r => {
          lines.push(`• ${r.name} (${r.floor} этаж)`);
          if (roomIds.length < 6) roomIds.push(r.roomId);
        });
      }
      if (matchedDept.frequentRooms.length > 0) {
        lines.push(`\nАудитории, где чаще всего ведёт занятия каф. ${matchedDept.deptName}:`);
        matchedDept.frequentRooms.slice(0, 6).forEach(r => {
          lines.push(`• ауд. ${r.shortName} (${r.floor} этаж — ${r.lessonsCount} пар/нед.)`);
          if (!roomIds.includes(r.roomId) && roomIds.length < 6) roomIds.push(r.roomId);
        });
      }
      const rooms = roomIds.map(enrichRoomCard).filter(Boolean);
      const reply = lines.join('\n');
      return {
        reply,
        answer: reply,
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

  // 0b. «Кто ведёт <предмет> у группы <N>?» / «Преподаватели и дисциплины группы <N>»
  const whoTeachesMatch = q.match(/(?:кто\s+ведет|кто\s+преподает|преподавател[иь]|шпаргалк[ау]|дисциплины|предметы)\s+(?:(.*?)\s+)?(?:у\s+группы|групп[ыеу]|гр\.?)\s*(\d{2,5}[а-яa-z]?)/i)
    || q.match(/(?:у\s+группы|групп[аые])\s*(\d{2,5}[а-яa-z]?)\s+(?:кто\s+ведет|преподавател[иь]|дисциплины|предметы)\s*(.*)?/i);
  if (whoTeachesMatch && cacheStatus.ready) {
    const grpCandidates = findMatchingGroups(qRaw);
    if (grpCandidates.length > 0) {
      const topGrp = grpCandidates[0];
      const entitySched = buildEntityScheduleResponse('group', topGrp);
      const sheet = buildGroupCheatSheet(entitySched.days, resolveLecturerMeta);
      if (sheet.length > 0) {
        const lines = sheet.map(item => {
          const rowsStr = (item.rows || []).map(r => `${r.types.join(', ')}: ${r.text}`).join('; ');
          return `• ${item.headerLabel} ${rowsStr}`;
        });
        const reply = `${tonePrefix}Преподаватели и дисциплины группы ${topGrp.name}:\n\n${lines.join('\n')}`;
        return {
          reply,
          answer: reply,
          rooms: [],
          roomIds: [],
          route: null,
          entitySchedule: { type: 'group', name: topGrp.name },
          openFreePanel: false,
          matchedIntent: true,
          modelUsed: 'local-campus-ai'
        };
      }
    }
  }

  // 0c. Вопросы про расписание звонков, перемену или время текущей пары
  if (/(?:звонк|перемен|перерыв|во\s+сколько\s+(?:начинается|заканчивается|кончается|\d\s*(?:-я|я)?\s*пара)|какая\s+сейчас\s+пара\s+по\s+счету|расписание\s+пар\s+по\s+времени)/i.test(q) ||
      (/^(?:какая\s+сейчас\s+пара|сколько\s+до\s+конца\s+пары|когда\s+закончится\s+пара)[?.!]*$/i.test(q))) {
    const reply = `${tonePrefix}${buildBellScheduleAnswer()}`;
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

  // 0d. Вопросы про тип недели (числитель или знаменатель)
  if (/(?:числител|знаменател|какая\s+(?:сейчас|сегодня|эта)\s+недел)/i.test(q)) {
    const parity = getAcademicWeekParity();
    const jsDays = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const now = new Date();
    const reply = `${tonePrefix}Сейчас идёт ${parity.weekNumber}-я учебная неделя — ${parity.type} (сегодня ${jsDays[now.getDay()]}).`;
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

  // 0e. Проверяем вопросы по расписанию преподавателей и групп
  if (cacheStatus.ready) {
    const matchedLecturers = findMatchingLecturers(query);
    if (matchedLecturers.length > 0) {
      const topLec = matchedLecturers[0];
      const entitySched = buildEntityScheduleResponse('lecturer', topLec);
      const dayFilter = detectDayFilterInQuery(q);
      const formatted = formatEntityScheduleForAi(entitySched, dayFilter);
      const rooms = formatted.roomIds.map(enrichRoomCard).filter(Boolean);
      const reply = `${tonePrefix}${formatted.text}`;
      return {
        reply,
        answer: reply,
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
      const reply = `${tonePrefix}${formatted.text}`;
      return {
        reply,
        answer: reply,
        rooms,
        roomIds: rooms.map(r => r.id),
        route: null,
        entitySchedule: { type: 'group', name: topGrp.name },
        openFreePanel: false,
        matchedIntent: true,
        modelUsed: 'local-campus-ai'
      };
    }

    const dayFilterFromContext = detectDayFilterInQuery(q);
    const isScheduleFollowUp = dayFilterFromContext || /(?:у него|у нее|у них|у этой группы|пары|занятия|расписани|где\s+он|где\s+она)/i.test(q);
    if (lastEntitySchedule && isScheduleFollowUp) {
      if (lastEntitySchedule.type === 'lecturer') {
        const lecObj = findMatchingLecturers(lastEntitySchedule.name)[0];
        if (lecObj) {
          const entitySched = buildEntityScheduleResponse('lecturer', lecObj);
          const formatted = formatEntityScheduleForAi(entitySched, dayFilterFromContext);
          const rooms = formatted.roomIds.map(enrichRoomCard).filter(Boolean);
          const reply = `${tonePrefix}${formatted.text}`;
          return {
            reply,
            answer: reply,
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
          const reply = `${tonePrefix}${formatted.text}`;
          return {
            reply,
            answer: reply,
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

  // 1. Проверка запроса на построение маршрута
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
      const reply = `${tonePrefix}Маршрут от «${fromRoom.meta.name}» (${fromRoom.meta.floor} эт.) до «${toRoom.meta.name}» (${toRoom.meta.floor} эт.) готов. Нажмите кнопку ниже, чтобы показать путь на карте.`;
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
      const reply = `${tonePrefix}Чтобы дойти до «${toRoom.meta.name}» (${toRoom.meta.floor} этаж), удобнее всего начать от Главного входа (1 этаж). Нажмите кнопку ниже, чтобы построить пошаговый маршрут на карте:`;
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

  if (lastRoomIds.length > 0 && /(?:как\s+(?:туда|сюда|до\s+нее|до\s+него|к\s+ней)\s+(?:пройти|дойти|добраться|попасть)|(?:пройти|дойти|добраться|маршрут)\s+(?:туда|сюда)|построй(?:ть)?\s+маршрут)/i.test(q)) {
    const ctxRoom = resolveContextRoom(q) || (roomsMeta[lastRoomIds[0]] ? { id: lastRoomIds[0], meta: roomsMeta[lastRoomIds[0]] } : null);
    if (ctxRoom && roomsMeta[entranceId]) {
      const reply = `${tonePrefix}Чтобы дойти до «${ctxRoom.meta.name}» (${ctxRoom.meta.floor} этаж), удобнее всего начать от Главного входа (1 этаж). Нажмите кнопку ниже, чтобы построить маршрут на карте:`;
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

  // 1b. Вопросы про расписание или текущую пару в конкретной аудитории
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
        const reply = `${tonePrefix}${formatted.text}`;
        return {
          reply,
          answer: reply,
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

  // 2. Свободные аудитории (с поддержкой этажа, дня недели и номера пары!)
  if (q.includes('свободн') || q.includes('посидеть') || q.includes('пуст')) {
    const floorMatch = q.match(/([0-4])\s*(?:-м|-й|м|й)?\s*этаж/);
    const targetFloor = floorMatch ? parseInt(floorMatch[1], 10) : null;
    const customDay = detectDayFilterInQuery(q);
    let customMin = null;
    let slotDesc = '';
    const pairMatch = q.match(/([1-7])\s*(?:-й|-я|й|я|ой)?\s*пар[еуа]/);
    if (pairMatch) {
      const slotObj = RGRTU_BELL_SLOTS.find(s => s.num === parseInt(pairMatch[1], 10));
      if (slotObj) {
        customMin = slotObj.startMin + 5;
        slotDesc = ` на ${slotObj.num}-й паре (${slotObj.start}–${slotObj.end})`;
      }
    }

    if (!cacheStatus.ready) {
      const reply = `${tonePrefix}Кэш расписания сейчас прогревается (${cacheStatus.progress}). Подождите пару секунд или откройте режим «Свободные».`;
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
      const st = computeFreeStatus(id, customDay, customMin);
      if (st && !st.noSchedule) {
        let priority = 500;
        if (st.untilText === 'до конца дня' || st.untilText === 'до конца недели' || st.untilText.startsWith('до ')) {
          const timeMatch = st.untilText.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            priority = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
          } else {
            priority = 24 * 60;
          }
        }
        freeScored.push({ id, priority, floorDiff: Math.abs((meta.floor || 1) - currentFloor) });
      }
    }

    freeScored.sort((a, b) => b.priority - a.priority || a.floorDiff - b.floorDiff);
    const picked = freeScored.slice(0, 6).map(item => enrichRoomCard(item.id)).filter(Boolean);
    const floorLabel = targetFloor !== null ? ` на ${targetFloor} этаже` : ' в Главном корпусе';
    const whenLabel = customDay ? ` (${customDay.toLowerCase()}${slotDesc})` : (slotDesc ? ` (${slotDesc.trim()})` : ' сейчас');
    const reply = freeScored.length > 0
      ? `${tonePrefix}Свободно учебных аудиторий${floorLabel}${whenLabel}: ${freeScored.length}. Вот лучшие варианты:`
      : `${tonePrefix}Не найдено свободных учебных аудиторий${floorLabel}${whenLabel} по расписанию.`;
    return {
      reply,
      answer: reply,
      rooms: picked,
      roomIds: picked.map(r => r.id),
      route: null,
      entitySchedule: null,
      openFreePanel: !customDay && customMin === null,
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
      const reply = `${tonePrefix}${top.name}${descPart} находится в Главном корпусе на ${top.floor} этаже.${statusPart}`;
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
    const reply = `${tonePrefix}Нашёл ${cards.length} подходящих мест в Главном корпусе. Выберите нужное, чтобы показать его на карте или построить маршрут:`;
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

  // 4. Поиск по названию учебной дисциплины
  const subjectHit = searchSubjectInSchedule(query);
  if (subjectHit) {
    const rooms = subjectHit.roomIds.map(enrichRoomCard).filter(Boolean);
    const reply = `${tonePrefix}${subjectHit.text}`;
    return {
      reply,
      answer: reply,
      rooms,
      roomIds: rooms.map(r => r.id),
      route: null,
      entitySchedule: null,
      openFreePanel: false,
      matchedIntent: true,
      modelUsed: 'local-campus-ai'
    };
  }

  const reply = `${tonePrefix}Не удалось найти точное совпадение. Укажите номер аудитории («100», «302»), группу («546», «445»), фамилию преподавателя («Скворцов», «Нелюхин»), предмет («Вычислительная математика»), кафедру («помещения кафедры САПР ВС») или спросите «Какие аудитории сейчас свободны?».`;
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
const AI_CACHE_BUCKET_MS = 3 * 60 * 1000;

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
  const localResult = localCampusAssistant(query, currentFloor, history);
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
    const tone = detectUserTone(query);
    const toneRule = tone === 'rude'
      ? 'Пользователь написал грубо или с наездом — ответь с остроумным сарказмом и чувством собственного достоинства (без мата), но дай точный ответ по делу.'
      : 'Отвечай кратко, по делу и дружелюбно на русском языке.';

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
      `Ты — "ИИ'шка", быстрый и точный ИИ-навигатор карты и расписания РГРТУ (Главный корпус).\n` +
      `Этаж пользователя: ${currentFloor}. ${toneRule}\n` +
      `Никогда не путай столовую/буфет с лабораториями кафедр.\n\n` +
      dialogContextText +
      `Каталог помещений:\n` +
      catalogLines.join('\n');

    const geminiPromise = ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
      timeoutHandle = setTimeout(() => reject(new Error(`gemini timeout (> ${AI_HARD_TIMEOUT_MS}ms)`)), AI_HARD_TIMEOUT_MS);
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
      modelUsed: 'gemini-2.5-flash'
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

function sendJsonCompressed(req, res, statusCode, payloadObj, cacheControl = 'no-cache') {
  const raw = JSON.stringify(payloadObj);
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl
  };
  if (raw.length > 1024 && acceptEncoding.includes('gzip')) {
    zlib.gzip(Buffer.from(raw, 'utf8'), (err, compressed) => {
      if (err) {
        res.writeHead(statusCode, headers);
        res.end(raw);
        return;
      }
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(statusCode, headers);
      res.end(compressed);
    });
  } else {
    res.writeHead(statusCode, headers);
    res.end(raw);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

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
        sendJsonCompressed(req, res, 401, { ok: false, error: 'Неверный пароль администратора' });
        return;
      }
      sendJsonCompressed(req, res, 200, { ok: true, token: getValidEditorToken() });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (url.pathname === '/api/editor/check' && req.method === 'GET') {
    const authorized = isEditorAuthorized(req);
    sendJsonCompressed(req, res, authorized ? 200 : 401, { ok: authorized });
    return;
  }

  // --- API: Админ-панель управления базой данных, пользователями, ботом, аудиториями и кэшем ---
  if (url.pathname.startsWith('/api/admin/')) {
    if (!isEditorAuthorized(req)) {
      sendJsonCompressed(req, res, 401, { ok: false, error: 'Требуется авторизация администратора' });
      return;
    }

    await userStore.init().catch(() => {});

    if (url.pathname === '/api/admin/overview' && req.method === 'GET') {
      userStore.cleanupExpired();
      const usersList = Object.values(userStore.data.users || {})
        .filter(Boolean)
        .map(u => ({
          id: u.id,
          telegramId: u.telegramId || null,
          firstName: u.firstName || '',
          username: u.username || '',
          role: u.role || 'student',
          targetName: u.targetName || '',
          notificationsEnabled: u.notificationsEnabled !== false,
          theme: u.theme || 'system',
          favorites: Array.isArray(u.favorites) ? u.favorites : [],
          recentViews: u.recentViews && typeof u.recentViews === 'object' ? u.recentViews : {},
          lastNotifiedSlot: u.lastNotifiedSlot || null,
          notifiedSlots: Array.isArray(u.notifiedSlots) ? u.notifiedSlots : [],
          lessonNotes: (u.lessonNotes && typeof u.lessonNotes === 'object') ? u.lessonNotes : {},
          createdAt: u.createdAt || null,
          updatedAt: u.updatedAt || null,
          isTelegramLinked: Boolean(u.telegramId || u.username)
        }))
        .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));

      const authCodesList = Object.entries(userStore.data.authCodes || {}).map(([code, info]) => ({
        code,
        telegramId: info.telegramId || null,
        firstName: info.firstName || '',
        username: info.username || '',
        expiresAt: info.expiresAt || 0
      }));

      const authSessionsList = Object.entries(userStore.data.authSessions || {}).map(([token, info]) => ({
        token,
        status: info.status || 'pending',
        userId: info.userId || null,
        expiresAt: info.expiresAt || 0
      }));

      const { getBotUsername } = (() => {
        try { return require('./bot.js'); } catch (e) { return {}; }
      })();

      const modData = userStore.getModerationData();
      sendJsonCompressed(req, res, 200, {
        ok: true,
        users: usersList,
        authCodes: authCodesList,
        authSessions: authSessionsList,
        botTemplates: userStore.getBotTemplatesCatalog(),
        moderation: modData,
        mapMarkers: modData.markers,
        roomReviews: modData.reviews,
        descriptionSuggestions: modData.descriptions,
        gpsConfig: userStore.getGpsConfig(),
        cloud: userStore.getCloudStatus(),
        bot: {
          configured: Boolean((process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim()),
          username: typeof getBotUsername === 'function' ? getBotUsername() : ''
        },
        cache: {
          ready: cacheStatus.ready,
          warming: cacheStatus.warming,
          progress: cacheStatus.progress,
          lastUpdate: cacheStatus.lastUpdate,
          roomsCachedCount: Object.keys(scheduleCache || {}).length,
          entityCachedCount: Object.keys(entityScheduleCache || {}).length,
          groupsCount: scheduleIndex.groups.size,
          lecturersCount: scheduleIndex.lecturers.size,
          departmentsCount: Object.keys(scheduleIndex.departmentRoomsIndex || {}).length,
          availableWeeks: getFormattedAvailableWeeks(),
          defaultWeek: getDefaultWeekValue(),
          moscowClock: getMoscowClockNow()
        },
        roomsCount: Object.keys(roomsMeta || {}).length
      });
      return;
    }

    if (url.pathname === '/api/admin/bot/templates' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const mode = String(body.mode || 'save').trim();
        const templateId = String(body.templateId || '').trim();

        if (mode === 'save') {
          const updatedTpl = userStore.saveBotTemplate(templateId, body.text || '');
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, {
            ok: true,
            template: updatedTpl,
            botTemplates: userStore.getBotTemplatesCatalog()
          });
          return;
        }

        if (mode === 'reset') {
          const updatedTpl = userStore.resetBotTemplate(templateId);
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, {
            ok: true,
            template: updatedTpl,
            botTemplates: userStore.getBotTemplatesCatalog()
          });
          return;
        }

        if (mode === 'reset-all') {
          const catalog = userStore.resetAllBotTemplates();
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, {
            ok: true,
            botTemplates: catalog
          });
          return;
        }

        if (mode === 'test-send') {
          const { sendAdminTelegramMessage } = require('./bot.js');
          const catalog = userStore.getBotTemplatesCatalog();
          const tplMeta = catalog.find(t => t.id === templateId);
          if (!tplMeta) throw new Error('Шаблон не найден');

          const u = (body.userId && userStore.getUser(body.userId))
            || (body.telegramId && userStore.getUserByTelegramId(body.telegramId))
            || Object.values(userStore.data.users || {}).find(x => x && x.telegramId)
            || null;
          const tgId = Number(body.telegramId) || (u && u.telegramId) || null;
          if (!tgId) {
            throw new Error('Выберите получателя с Telegram ID во вкладке «Telegram-бот»');
          }

          const sampleVars = {};
          for (const v of (tplMeta.variables || [])) {
            sampleVars[v.key] = v.sample || '';
          }
          if (u) {
            if (u.firstName) sampleVars.name = u.firstName;
            if (u.username) sampleVars.username = u.username;
            sampleVars.role = u.role === 'lecturer' ? 'Преподаватель' : 'Студент';
            if (u.targetName) sampleVars.target = u.targetName;
            sampleVars.notifStatus = u.notificationsEnabled !== false ? 'Включены ✅' : 'Выключены 🔕';
          }

          const rawToTest = typeof body.text === 'string' && body.text.trim() ? body.text : tplMeta.text;
          const result = await sendAdminTelegramMessage(tgId, rawToTest, sampleVars);
          sendJsonCompressed(req, res, result.ok ? 200 : 400, {
            ...result,
            telegramId: tgId
          });
          return;
        }

        sendJsonCompressed(req, res, 400, { ok: false, error: 'Неизвестное действие с шаблонами' });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/user/save' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        let userId = String(body.userId || body.id || '').trim();
        const tgIdNum = body.telegramId ? Number(body.telegramId) : null;
        if (!userId && tgIdNum) {
          userId = `tg_${tgIdNum}`;
        }
        if (!userId) {
          sendJsonCompressed(req, res, 400, { ok: false, error: 'Укажите ID пользователя или Telegram ID' });
          return;
        }
        const patch = {
          telegramId: tgIdNum,
          firstName: body.firstName !== undefined ? String(body.firstName).trim() : undefined,
          username: body.username !== undefined ? String(body.username).replace(/^@/, '').trim() : undefined,
          role: body.role === 'lecturer' ? 'lecturer' : 'student',
          targetName: body.targetName !== undefined ? String(body.targetName).trim() : undefined,
          explicitClear: body.targetName === '',
          notificationsEnabled: body.notificationsEnabled !== false,
          theme: (body.theme === 'dark' || body.theme === 'light' || body.theme === 'system') ? body.theme : 'system',
          favorites: Array.isArray(body.favorites) ? body.favorites : undefined,
          recentViews: (body.recentViews && typeof body.recentViews === 'object' && !Array.isArray(body.recentViews)) ? body.recentViews : undefined,
          resetNotifiedSlots: Boolean(body.resetNotifiedSlots)
        };
        if (body.firstName === '' && userStore.data.users[userId]) {
          userStore.data.users[userId].firstName = '';
        }
        if (body.username === '' && userStore.data.users[userId]) {
          userStore.data.users[userId].username = '';
        }
        userStore.upsertUser(userId, patch);
        await userStore.pushToCloud([userId]).catch(() => {});
        sendJsonCompressed(req, res, 200, { ok: true, user: userStore.data.users[userId] });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/user/delete' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const userId = String(body.userId || body.id || '').trim();
        if (!userId) {
          sendJsonCompressed(req, res, 400, { ok: false, error: 'Не указан userId' });
          return;
        }
        await userStore.deleteUser(userId);
        sendJsonCompressed(req, res, 200, { ok: true, deletedId: userId });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/auth/action' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const action = String(body.action || '').trim();
        if (action === 'create-code') {
          const telegramId = Number(body.telegramId);
          if (!telegramId) throw new Error('Укажите числовой Telegram ID');
          const code = userStore.createAuthCodeForTelegramUser({
            telegramId,
            firstName: body.firstName || '',
            username: body.username || ''
          });
          await userStore.pushToCloud([`tg_${telegramId}`]).catch(() => {});
          sendJsonCompressed(req, res, 200, { ok: true, code });
          return;
        }
        if (action === 'delete-code') {
          userStore.deleteAuthCode(body.code);
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, { ok: true });
          return;
        }
        if (action === 'clear-codes') {
          userStore.clearAuthCodes();
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, { ok: true });
          return;
        }
        if (action === 'delete-session') {
          userStore.deleteAuthSession(body.token);
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, { ok: true });
          return;
        }
        if (action === 'clear-sessions') {
          userStore.clearAuthSessions();
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, { ok: true });
          return;
        }
        sendJsonCompressed(req, res, 400, { ok: false, error: 'Неизвестное действие' });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/cloud/sync' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const mode = String(body.mode || 'push').trim();
        if (mode === 'push') {
          const ok = await userStore.pushToCloud(Object.keys(userStore.data.users || {}));
          sendJsonCompressed(req, res, 200, {
            ok,
            cloud: userStore.getCloudStatus(),
            usersCount: Object.keys(userStore.data.users || {}).length
          });
          return;
        }
        if (mode === 'pull') {
          const ok = await userStore.pullFromCloud(false);
          sendJsonCompressed(req, res, 200, {
            ok,
            cloud: userStore.getCloudStatus(),
            usersCount: Object.keys(userStore.data.users || {}).length
          });
          return;
        }
        if (mode === 'import') {
          const importedCount = await userStore.importBackupData(body.backupData || {}, Boolean(body.replaceAll));
          sendJsonCompressed(req, res, 200, {
            ok: true,
            importedCount,
            cloud: userStore.getCloudStatus(),
            usersCount: Object.keys(userStore.data.users || {}).length
          });
          return;
        }
        sendJsonCompressed(req, res, 400, { ok: false, error: 'Неизвестный режим синхронизации' });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/bot/send' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const mode = String(body.mode || 'direct').trim();
        const {
          sendAdminTelegramMessage,
          checkUpcomingLessonNotifications,
          buildLessonReminderVariables
        } = require('./bot.js');

        if (mode === 'run-check-now') {
          await checkUpcomingLessonNotifications();
          sendJsonCompressed(req, res, 200, {
            ok: true,
            candidatesCount: userStore.getUsersForNotifications().length
          });
          return;
        }

        if (mode === 'test-lesson') {
          const userId = String(body.userId || '').trim();
          const u = userStore.getUser(userId) || (body.telegramId ? userStore.getUserByTelegramId(body.telegramId) : null);
          const tgId = (u && u.telegramId) || Number(body.telegramId) || null;
          if (!tgId) {
            sendJsonCompressed(req, res, 400, { ok: false, error: 'У пользователя не привязан числовой Telegram ID' });
            return;
          }

          const role = (u && u.role) || 'student';
          const targetName = String((u && u.targetName) || body.targetName || '546М').trim();
          let sampleLesson = null;
          let sampleDayName = '';

          if (targetName) {
            const entityType = role === 'lecturer' ? 'lecturer' : 'group';
            let entityObj = entityType === 'lecturer'
              ? (scheduleIndex.lecturers.get(targetName) || findMatchingLecturers(targetName)[0] || null)
              : (scheduleIndex.groups.get(targetName.toUpperCase()) || scheduleIndex.groups.get(targetName) || null);
            if (entityObj) {
              const sched = await fetchCompleteEntitySchedule(entityType, entityObj).catch(() => null);
              if (sched && Array.isArray(sched.days)) {
                const { todayISO } = getMoscowClockNow();
                const dayWithLessons = sched.days.find(d => d.date >= todayISO && d.lessons && d.lessons.length > 0)
                  || sched.days.find(d => d.lessons && d.lessons.length > 0);
                if (dayWithLessons && dayWithLessons.lessons.length > 0) {
                  sampleLesson = dayWithLessons.lessons[0];
                  sampleDayName = dayWithLessons.dayName || '';
                }
              }
            }
          }

          if (!sampleLesson) {
            sampleLesson = {
              time: '09:55–11:30',
              type: 'Лек.',
              subject: 'Интеллектуальные информационные системы',
              subgroup: '',
              roomShort: '337',
              floor: 3,
              group: role === 'lecturer' ? '546М' : targetName,
              lecturer: role === 'lecturer' ? targetName : 'проф. Скворцов С.В.'
            };
          }

          const dayNote = sampleDayName ? ` (${sampleDayName})` : '';
          const vars = buildLessonReminderVariables({
            minutesLeft: 15,
            dayNote,
            role,
            firstName: (u && u.firstName) || 'друг',
            targetName,
            lesson: sampleLesson
          });

          const rawTemplate = userStore.getBotTemplateRaw('lesson_reminder');
          const result = await sendAdminTelegramMessage(tgId, rawTemplate, vars);
          sendJsonCompressed(req, res, result.ok ? 200 : 400, {
            ...result,
            previewText: result.renderedText || rawTemplate
          });
          return;
        }

        if (mode === 'direct') {
          const tgId = Number(body.telegramId);
          const text = String(body.text || '').trim();
          const u = userStore.getUserByTelegramId(tgId);
          const userVars = {
            name: (u && u.firstName) || 'друг',
            username: (u && u.username) || '',
            role: u && u.role === 'lecturer' ? 'Преподаватель' : 'Студент',
            target: (u && u.targetName) || 'не выбрано',
            notifStatus: u && u.notificationsEnabled !== false ? 'Включены ✅' : 'Выключены 🔕'
          };
          const result = await sendAdminTelegramMessage(tgId, text, userVars);
          sendJsonCompressed(req, res, result.ok ? 200 : 400, result);
          return;
        }

        if (mode === 'broadcast') {
          const text = String(body.text || '').trim();
          const audience = String(body.audience || 'all').trim(); // 'all' | 'student' | 'lecturer' | 'group'
          const groupFilter = String(body.groupName || '').trim().toUpperCase();
          if (!text) {
            sendJsonCompressed(req, res, 400, { ok: false, error: 'Введите текст рассылки' });
            return;
          }

          const allLinked = Object.values(userStore.data.users || {}).filter(u => u && u.telegramId);
          const recipients = allLinked.filter(u => {
            if (audience === 'student') return (u.role || 'student') === 'student';
            if (audience === 'lecturer') return u.role === 'lecturer';
            if (audience === 'group') return String(u.targetName || '').trim().toUpperCase() === groupFilter;
            return true;
          });

          let sentCount = 0;
          let failedCount = 0;
          const errors = [];

          for (const rec of recipients) {
            const userVars = {
              name: rec.firstName || 'друг',
              username: rec.username || '',
              role: rec.role === 'lecturer' ? 'Преподаватель' : 'Студент',
              target: rec.targetName || 'не выбрано',
              notifStatus: rec.notificationsEnabled !== false ? 'Включены ✅' : 'Выключены 🔕'
            };
            const r = await sendAdminTelegramMessage(rec.telegramId, text, userVars);
            if (r.ok) sentCount++;
            else {
              failedCount++;
              errors.push({ telegramId: rec.telegramId, error: r.error });
            }
          }

          sendJsonCompressed(req, res, 200, {
            ok: true,
            totalRecipients: recipients.length,
            sentCount,
            failedCount,
            errors: errors.slice(0, 10)
          });
          return;
        }

        sendJsonCompressed(req, res, 400, { ok: false, error: 'Неизвестный режим отправки' });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/rooms' && req.method === 'GET') {
      sendJsonCompressed(req, res, 200, { ok: true, rooms: roomsMeta });
      return;
    }

    if (url.pathname === '/api/admin/rooms/save' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const mode = String(body.mode || 'upsert').trim();
        const roomsPath = path.join(ROOT, 'data', 'rooms.json');
        const roomsBackupPath = path.join(ROOT, 'data', 'rooms.backup.json');

        if (fs.existsSync(roomsPath)) {
          try { fs.copyFileSync(roomsPath, roomsBackupPath); } catch (e) {}
        }

        if (mode === 'upsert') {
          const roomId = String(body.roomId || '').trim();
          const roomData = body.room || {};
          if (!roomId || !roomData.name) {
            throw new Error('Укажите ID и название помещения');
          }
          const existing = roomsMeta[roomId] || {};
          const updatedRoom = {
            ...existing,
            name: String(roomData.name || '').trim(),
            shortName: String(roomData.shortName || '').trim(),
            building: String(roomData.building || existing.building || 'C').trim(),
            floor: Number(roomData.floor !== undefined ? roomData.floor : (existing.floor ?? 1)),
            type: String(roomData.type || existing.type || 'classroom').trim(),
            description: String(roomData.description !== undefined ? roomData.description : (existing.description || '')).trim()
          };
          const clsVal = String(roomData.classroom !== undefined ? roomData.classroom : (existing.classroom || '')).trim();
          if (clsVal) {
            updatedRoom.classroom = clsVal;
          } else {
            delete updatedRoom.classroom;
          }
          roomsMeta[roomId] = updatedRoom;
        } else if (mode === 'delete') {
          const roomId = String(body.roomId || '').trim();
          if (!roomId || !roomsMeta[roomId]) {
            throw new Error('Помещение не найдено');
          }
          delete roomsMeta[roomId];
        } else if (mode === 'bulk') {
          if (!body.rooms || typeof body.rooms !== 'object' || Object.keys(body.rooms).length < 10) {
            throw new Error('Некорректный объект rooms.json');
          }
          roomsMeta = body.rooms;
        } else {
          throw new Error('Неизвестный режим сохранения rooms.json');
        }

        fs.writeFileSync(roomsPath, JSON.stringify(roomsMeta, null, 2), 'utf8');
        rebuildClassroomMap();
        rebuildScheduleIndex();

        sendJsonCompressed(req, res, 200, {
          ok: true,
          roomsCount: Object.keys(roomsMeta).length
        });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/cache/action' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const action = String(body.action || '').trim();
        if (action === 'warmup-rooms') {
          warmUpCache();
          sendJsonCompressed(req, res, 200, { ok: true, status: cacheStatus });
          return;
        }
        if (action === 'clear-entities') {
          entityScheduleCache = {};
          try {
            if (fs.existsSync(ENTITY_CACHE_FILE)) fs.unlinkSync(ENTITY_CACHE_FILE);
          } catch (e) {}
          sendJsonCompressed(req, res, 200, { ok: true, entityCachedCount: 0 });
          return;
        }
        if (action === 'rebuild-index') {
          normalizeScheduleCache();
          rebuildScheduleIndex();
          sendJsonCompressed(req, res, 200, {
            ok: true,
            groupsCount: scheduleIndex.groups.size,
            lecturersCount: scheduleIndex.lecturers.size
          });
          return;
        }
        sendJsonCompressed(req, res, 400, { ok: false, error: 'Неизвестное действие с кэшем' });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/moderation/action' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const category = String(body.category || body.itemType || '').trim(); // 'marker' | 'review' | 'description'
        const action = String(body.action || '').trim(); // 'approve' | 'reject' | 'delete' | 'create'
        const id = String(body.id || '').trim();

        if (category === 'marker') {
          if (action === 'create') {
            const marker = userStore.addCommunityMarker({
              ...body.marker,
              status: 'approved',
              authorName: 'Администратор'
            });
            await userStore.pushToCloud([]).catch(() => {});
            sendJsonCompressed(req, res, 200, { ok: true, marker, moderation: userStore.getModerationData() });
            return;
          }
          if (action === 'delete') {
            userStore.deleteCommunityMarker(id);
            await userStore.pushToCloud([]).catch(() => {});
            sendJsonCompressed(req, res, 200, { ok: true, moderation: userStore.getModerationData() });
            return;
          }
          const status = action === 'approve' ? 'approved' : 'rejected';
          const updated = userStore.moderateCommunityMarker(id, status, body.patch || {});
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, { ok: true, item: updated, moderation: userStore.getModerationData() });
          return;
        }

        if (category === 'review') {
          if (action === 'delete') {
            userStore.deleteRoomReview(id);
            await userStore.pushToCloud([]).catch(() => {});
            sendJsonCompressed(req, res, 200, { ok: true, moderation: userStore.getModerationData() });
            return;
          }
          const status = action === 'approve' ? 'approved' : 'rejected';
          const updated = userStore.moderateRoomReview(id, status, body.patch || {});
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, { ok: true, item: updated, moderation: userStore.getModerationData() });
          return;
        }

        if (category === 'description') {
          if (action === 'delete') {
            userStore.deleteDescriptionSuggestion(id);
            await userStore.pushToCloud([]).catch(() => {});
            sendJsonCompressed(req, res, 200, { ok: true, moderation: userStore.getModerationData() });
            return;
          }
          const status = action === 'approve' ? 'approved' : 'rejected';
          const updated = userStore.moderateDescriptionSuggestion(id, status, body.patch || {});
          if (status === 'approved' && updated && updated.roomId && roomsMeta[updated.roomId]) {
            roomsMeta[updated.roomId].description = String(updated.suggestedDescription || '').trim();
            const roomsPath = path.join(ROOT, 'data', 'rooms.json');
            try {
              fs.writeFileSync(roomsPath, JSON.stringify(roomsMeta, null, 2), 'utf8');
            } catch (e) {}
          }
          await userStore.pushToCloud([]).catch(() => {});
          sendJsonCompressed(req, res, 200, {
            ok: true,
            item: updated,
            moderation: userStore.getModerationData(),
            roomUpdated: Boolean(status === 'approved' && updated && roomsMeta[updated.roomId])
          });
          return;
        }

        sendJsonCompressed(req, res, 400, { ok: false, error: 'Неизвестная категория модерации' });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (url.pathname === '/api/admin/gps/save' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const gpsConfig = userStore.saveGpsConfig(body.gpsConfig || body || {});
        await userStore.pushToCloud([]).catch(() => {});
        sendJsonCompressed(req, res, 200, { ok: true, gpsConfig });
      } catch (e) {
        sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
      }
      return;
    }

    sendJsonCompressed(req, res, 404, { ok: false, error: 'Admin endpoint not found' });
    return;
  }

  // --- API: сохранение graph.json (защищено токеном администратора) ---
  if ((url.pathname === '/api/graph/save' || url.pathname === '/api/save-graph') && req.method === 'POST') {
    if (url.pathname === '/api/graph/save' && !isEditorAuthorized(req)) {
      sendJsonCompressed(req, res, 401, { ok: false, error: 'Требуется авторизация администратора' });
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
      sendJsonCompressed(req, res, 200, { ok: true, nodes: nodeCount, edges: parsed.edges.length });
    } catch (e) {
      console.error('[graph/save]', e.message);
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
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
        const hay = `${g.name} ${g.faculty || ''} ${g.facultyCode || ''}`.toLowerCase().replace(/ё/g, 'е');
        return hay.includes(q);
      })
      .map(g => ({
        name: g.name,
        faculty: g.faculty || '',
        facultyCode: g.facultyCode || '',
        roomsCount: g.rooms.size,
        lessonsCount: g.lessons.length
      }))
      .sort((a, b) => collator.compare(a.name, b.name));

    const classrooms = Object.entries(roomsMeta)
      .filter(([, meta]) => Boolean(meta && meta.classroom))
      .map(([roomId, meta]) => {
        const shortName = getRoomScheduleShortName(meta);
        const cachedEntry = scheduleCache[roomId];
        const lessonsCount = cachedEntry && Array.isArray(cachedEntry.days)
          ? cachedEntry.days.reduce((acc, d) => acc + (d.lessons ? d.lessons.length : 0), 0)
          : 0;
        return {
          roomId,
          name: shortName || meta.name,
          shortName,
          fullName: meta.name || `Аудитория ${shortName}`,
          floor: meta.floor,
          building: meta.building || 'C',
          classroom: String(meta.classroom),
          lessonsCount
        };
      })
      .filter(c => {
        if (!q) return true;
        const hay = `${c.name} ${c.shortName} ${c.fullName} ауд аудитория ${c.floor} этаж`.toLowerCase().replace(/ё/g, 'е');
        return hay.includes(q);
      })
      .sort((a, b) => collator.compare(a.shortName, b.shortName));

    sendJsonCompressed(req, res, 200, {
      ready: cacheStatus.ready,
      lecturers,
      groups,
      classrooms,
      availableWeeks: getFormattedAvailableWeeks(),
      defaultWeek: getDefaultWeekValue()
    }, 'public, max-age=30');
    return;
  }

  // --- API: полное расписание группы, преподавателя или аудитории (с поддержкой выбора недели date) ---
  if (url.pathname === '/api/entity-schedule') {
    const type = url.searchParams.get('type'); // 'lecturer' | 'group' | 'classroom'
    const name = (url.searchParams.get('name') || '').trim();
    const dateParam = (url.searchParams.get('date') || '').trim();
    if (!type || !name) {
      sendJsonCompressed(req, res, 400, { error: 'Missing type or name' });
      return;
    }

    let entityObj = null;
    if (type === 'lecturer') {
      entityObj = scheduleIndex.lecturers.get(name);
      if (!entityObj) {
        const found = findMatchingLecturers(name);
        if (found.length) entityObj = found[0];
      }
      if (!entityObj) {
        const metaInfo = resolveLecturerMeta(name);
        if (metaInfo && metaInfo.raspId) {
          entityObj = {
            name,
            shortName: name,
            fullName: metaInfo.fullName || name,
            regalia: metaInfo.regalia || '',
            department: metaInfo.department || '',
            rooms: new Set(),
            lessons: []
          };
        }
      }
    } else if (type === 'group') {
      entityObj = scheduleIndex.groups.get(name);
      if (!entityObj) {
        for (const [k, v] of scheduleIndex.groups.entries()) {
          if (k.toLowerCase() === name.toLowerCase()) { entityObj = v; break; }
        }
      }
      if (!entityObj && resolveGroupRaspId(name)) {
        const norm = name.toUpperCase().replace(/Ё/g, 'Е');
        entityObj = {
          name: norm,
          facultyCode: resolveGroupFacultyCode(norm),
          faculty: resolveGroupFaculty(norm),
          rooms: new Set(),
          lessons: []
        };
      }
    } else if (type === 'classroom') {
      const cleanTarget = name.replace(/^(?:ауд\.?|аудитория)\s*/i, '').trim().toLowerCase();
      let matchedRoomId = null;
      let matchedMeta = null;
      if (roomsMeta[name]) {
        matchedRoomId = name;
        matchedMeta = roomsMeta[name];
      } else {
        for (const [rId, m] of Object.entries(roomsMeta)) {
          if (!m || !m.classroom) continue;
          const sName = getRoomScheduleShortName(m).toLowerCase();
          const fName = String(m.name || '').toLowerCase();
          if (sName === cleanTarget || fName === cleanTarget || String(m.classroom) === cleanTarget) {
            matchedRoomId = rId;
            matchedMeta = m;
            break;
          }
        }
      }
      if (matchedRoomId && matchedMeta) {
        const shortName = getRoomScheduleShortName(matchedMeta);
        const cachedRoom = scheduleCache[matchedRoomId];
        const fallbackLessons = [];
        if (cachedRoom && Array.isArray(cachedRoom.days)) {
          for (const d of cachedRoom.days) {
            for (const l of (d.lessons || [])) {
              fallbackLessons.push({
                ...l,
                date: d.date,
                dayName: d.dayName,
                roomId: matchedRoomId,
                roomShort: shortName,
                floor: matchedMeta.floor,
                building: matchedMeta.building || 'C'
              });
            }
          }
        }
        entityObj = {
          roomId: matchedRoomId,
          name: shortName,
          shortName,
          fullName: matchedMeta.name || `Аудитория ${shortName}`,
          regalia: `${matchedMeta.floor} этаж · Главный корпус`,
          building: matchedMeta.building || 'C',
          classroom: matchedMeta.classroom,
          floor: matchedMeta.floor,
          rooms: new Set([matchedRoomId]),
          lessons: fallbackLessons
        };
      }
    }

    if (!entityObj) {
      sendJsonCompressed(req, res, 404, { error: 'Расписание не найдено' });
      return;
    }

    const payload = await fetchCompleteEntitySchedule(type, entityObj, dateParam);
    sendJsonCompressed(req, res, 200, payload);
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
      // Fallback to cached room schedule if rasp.rsreu.ru is slow/offline
      const mapped = classroomToRoomMap[String(classroom)];
      if (mapped && scheduleCache[mapped.roomId]) {
        const fallbackHtml = buildSyntheticScheduleHtmlFromCachedEntry(scheduleCache[mapped.roomId], date);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(fallbackHtml);
        return;
      }
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy error: ' + e.message);
    }
    return;
  }

  if (url.pathname === '/api/cache-status') {
    sendJsonCompressed(req, res, 200, cacheStatus);
    return;
  }

  if (url.pathname === '/api/free-now') {
    if (!cacheStatus.ready) {
      sendJsonCompressed(req, res, 503, { status: 'warming', progress: cacheStatus.progress });
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
    sendJsonCompressed(req, res, 200, {
      status: 'ok',
      updatedAt: cacheStatus.lastUpdate,
      total: free.length,
      busyTotal: busy.length,
      free,
      busy
    });
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
      const parsedBody = JSON.parse(rawBody || '{}');
      const query = String(parsedBody.query || parsedBody.message || '').trim();
      const currentFloor = Number(parsedBody.currentFloor) || 1;
      const history = Array.isArray(parsedBody.history) ? parsedBody.history : [];
      const result = await processAiAssistantQuery(query, currentFloor, history);
      sendJsonCompressed(req, res, 200, result);
    } catch (e) {
      console.error('[ai-assistant]', e.message);
      sendJsonCompressed(req, res, 500, { error: e.message });
    }
    return;
  }

  // --- API: Профиль пользователя ---
  if (url.pathname === '/api/user/profile' && req.method === 'GET') {
    await userStore.init().catch(() => {});
    const userId = (url.searchParams.get('userId') || '').trim();
    const rawUser = userId ? userStore.getUser(userId) : null;
    const { getBotUsername } = (() => {
      try { return require('./bot.js'); } catch (e) { return {}; }
    })();
    sendJsonCompressed(req, res, 200, {
      ok: true,
      user: userStore.toPublicUser(rawUser),
      botUsername: typeof getBotUsername === 'function' ? getBotUsername() : ''
    });
    return;
  }

  if (url.pathname === '/api/user/profile' && req.method === 'POST') {
    try {
      await userStore.init().catch(() => {});
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody || '{}');
      const userId = String(body.userId || '').trim();
      if (!userId) {
        sendJsonCompressed(req, res, 400, { ok: false, error: 'Missing userId' });
        return;
      }
      const patch = {};
      if (body.role !== undefined) patch.role = body.role;
      if (body.targetName !== undefined) {
        patch.targetName = body.targetName;
        patch.explicitClear = body.targetName === '';
      }
      if (body.theme !== undefined) patch.theme = body.theme;
      if (body.notificationsEnabled !== undefined) patch.notificationsEnabled = body.notificationsEnabled;
      if (body.firstName !== undefined) patch.firstName = body.firstName;
      if (body.username !== undefined) patch.username = body.username;
      if (body.favorites !== undefined) patch.favorites = body.favorites;
      if (body.recentViews !== undefined) patch.recentViews = body.recentViews;

      const user = userStore.upsertUser(userId, patch);
      await userStore.pushToCloud([userId]).catch(() => {});
      if (patch.notificationsEnabled === true || patch.targetName) {
        try {
          const { checkUpcomingLessonNotifications } = require('./bot.js');
          if (typeof checkUpcomingLessonNotifications === 'function') {
            setTimeout(checkUpcomingLessonNotifications, 300);
          }
        } catch (e) {}
      }
      sendJsonCompressed(req, res, 200, { ok: true, user });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // --- API: Авторизация и привязка через Telegram ---
  if (url.pathname === '/api/user/auth-telegram' && req.method === 'POST') {
    try {
      await userStore.init().catch(() => {});
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody || '{}');
      const mode = String(body.mode || 'code').trim();
      const mergePrefs = {
        role: body.role,
        targetName: body.targetName,
        theme: body.theme,
        targetUpdatedAt: Number(body.targetUpdatedAt) || 0
      };

      if (mode === 'webapp') {
        const botToken = (process.env.BOT_TOKEN || '').trim();
        let tgUser = verifyTelegramWebAppInitData(body.initData, botToken);
        if (!tgUser && body.unsafeUser && body.unsafeUser.id) {
          tgUser = body.unsafeUser;
        }
        if (!tgUser || !tgUser.id) {
          sendJsonCompressed(req, res, 401, { ok: false, error: 'Не удалось подтвердить данные Telegram WebApp' });
          return;
        }
        const userId = `tg_${tgUser.id}`;
        const existing = userStore.getUser(userId);
        const patch = {
          telegramId: tgUser.id,
          firstName: tgUser.first_name || tgUser.firstName || '',
          username: tgUser.username || ''
        };
        const isClientTargetNewer = mergePrefs.targetUpdatedAt > (Number(existing && existing.updatedAt) || 0);
        if (((!existing || !existing.targetName) || isClientTargetNewer) && mergePrefs.targetName !== undefined) {
          if (mergePrefs.targetName || isClientTargetNewer) {
            patch.role = mergePrefs.role;
            patch.targetName = mergePrefs.targetName;
            patch.explicitClear = mergePrefs.targetName === '';
          }
        }
        const user = userStore.upsertUser(userId, patch);
        if (isClientTargetNewer) {
          await userStore.pushToCloud([userId]).catch(() => {});
        }
        sendJsonCompressed(req, res, 200, { ok: true, user });
        return;
      }

      if (mode === 'session-start') {
        const sessionToken = userStore.createBrowserAuthSession();
        const { getBotUsername } = (() => {
          try { return require('./bot.js'); } catch (e) { return {}; }
        })();
        const botUsername = (typeof getBotUsername === 'function' && getBotUsername()) || 'rgrtu_map_bot';
        sendJsonCompressed(req, res, 200, {
          ok: true,
          sessionToken,
          botUsername,
          botLink: `https://t.me/${botUsername}?start=login_${sessionToken}`
        });
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
        sendJsonCompressed(req, res, 200, { ok: true, ...result });
        return;
      }

      if (mode === 'code') {
        const user = userStore.consumeAuthCode(body.code, mergePrefs);
        if (!user) {
          sendJsonCompressed(req, res, 401, { ok: false, error: 'Неверный или истёкший код. Отправьте /login боту в Telegram.' });
          return;
        }
        sendJsonCompressed(req, res, 200, { ok: true, user });
        return;
      }

      if (mode === 'quick') {
        const ident = String(body.identifier || '').replace(/^@/, '').trim();
        if (!ident) {
          sendJsonCompressed(req, res, 400, { ok: false, error: 'Укажите ваш Telegram @username или ID' });
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
        sendJsonCompressed(req, res, 200, { ok: true, user });
        return;
      }

      sendJsonCompressed(req, res, 400, { ok: false, error: 'Unsupported auth mode' });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // --- API: Личные заметки к парам (только для авторизованных через Telegram пользователей) ---
  if (url.pathname === '/api/user/notes' && req.method === 'POST') {
    try {
      await userStore.init().catch(() => {});
      const body = JSON.parse((await readBody(req)) || '{}');
      const userId = String(body.userId || '').trim();
      const lessonKey = String(body.lessonKey || body.noteKey || '').trim();
      const noteText = String(body.noteText !== undefined ? body.noteText : (body.text || ''));
      if (!userId || !lessonKey) {
        sendJsonCompressed(req, res, 400, { ok: false, error: 'Укажите userId и lessonKey' });
        return;
      }
      const existing = userStore.getUser(userId);
      if (!existing || (!existing.telegramId && !existing.username)) {
        sendJsonCompressed(req, res, 403, { ok: false, error: 'Личные заметки доступны только после входа через Telegram' });
        return;
      }
      const lessonNotes = userStore.saveUserLessonNote(userId, lessonKey, noteText);
      sendJsonCompressed(req, res, 200, { ok: true, lessonNotes });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // --- API: Пользовательские метки на карте, отзывы о буфетах/столовых, предложка описаний и настройки GPS ---
  if (url.pathname === '/api/community/state' && req.method === 'GET') {
    await userStore.init().catch(() => {});
    const reqUserId = String(url.searchParams.get('userId') || '').trim();
    let userReviews = [];
    if (reqUserId) {
      userReviews = userStore.getRoomReviews({ includeAll: true }).filter(r => r && r.authorId === reqUserId);
    }
    sendJsonCompressed(req, res, 200, {
      ok: true,
      markers: userStore.getApprovedMapMarkers(),
      reviews: userStore.getApprovedRoomReviews(),
      userReviews,
      gpsConfig: userStore.getGpsConfig()
    });
    return;
  }

  if (url.pathname === '/api/community/marker' && req.method === 'POST') {
    try {
      await userStore.init().catch(() => {});
      const body = JSON.parse((await readBody(req)) || '{}');
      const isAdmin = isEditorAuthorized(req);
      const userId = String(body.userId || '').trim();
      const u = userId ? userStore.getUser(userId) : null;
      if (!isAdmin && (!u || (!u.telegramId && !u.username))) {
        sendJsonCompressed(req, res, 403, { ok: false, error: 'Предлагать метки могут только авторизованные через Telegram пользователи' });
        return;
      }
      const marker = userStore.addCommunityMarker({
        building: body.building || 'C',
        floor: Number(body.floor ?? 1),
        x: Number(body.x || 0),
        y: Number(body.y || 0),
        category: body.category || 'socket',
        title: body.title || '',
        description: body.description || '',
        status: isAdmin ? 'approved' : 'pending',
        authorId: isAdmin ? 'admin' : u.id,
        authorName: isAdmin ? 'Администратор' : (u.firstName || (u.username ? `@${u.username}` : 'Студент'))
      });
      await userStore.pushToCloud([]).catch(() => {});
      sendJsonCompressed(req, res, 200, {
        ok: true,
        marker,
        approved: marker.status === 'approved'
      });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (url.pathname === '/api/community/review' && req.method === 'POST') {
    try {
      await userStore.init().catch(() => {});
      const body = JSON.parse((await readBody(req)) || '{}');
      const userId = String(body.userId || '').trim();
      const roomId = String(body.roomId || '').trim();
      const u = userId ? userStore.getUser(userId) : null;
      if (!u || (!u.telegramId && !u.username)) {
        sendJsonCompressed(req, res, 403, { ok: false, error: 'Оставлять оценки и отзывы могут только авторизованные через Telegram пользователи' });
        return;
      }
      const meta = roomsMeta[roomId];
      if (!meta || meta.type !== 'buffet') {
        sendJsonCompressed(req, res, 400, { ok: false, error: 'Оценки и отзывы доступны только для столовых и буфетов' });
        return;
      }
      const review = userStore.addRoomReview({
        roomId,
        roomName: meta.name || roomId,
        rating: Number(body.rating || 5),
        text: body.text || '',
        status: 'pending',
        authorId: u.id,
        authorName: u.firstName || (u.username ? `@${u.username}` : 'Студент')
      });
      await userStore.pushToCloud([]).catch(() => {});
      sendJsonCompressed(req, res, 200, { ok: true, review });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (url.pathname === '/api/community/description' && req.method === 'POST') {
    try {
      await userStore.init().catch(() => {});
      const body = JSON.parse((await readBody(req)) || '{}');
      const userId = String(body.userId || '').trim();
      const roomId = String(body.roomId || '').trim();
      const u = userId ? userStore.getUser(userId) : null;
      if (!u || (!u.telegramId && !u.username)) {
        sendJsonCompressed(req, res, 403, { ok: false, error: 'Предлагать описание кабинета могут только авторизованные через Telegram пользователи' });
        return;
      }
      const meta = roomsMeta[roomId];
      if (!meta) {
        sendJsonCompressed(req, res, 404, { ok: false, error: 'Кабинет не найден' });
        return;
      }
      const suggestion = userStore.addDescriptionSuggestion({
        roomId,
        roomName: meta.name || roomId,
        suggestedDescription: body.description || '',
        status: 'pending',
        authorId: u.id,
        authorName: u.firstName || (u.username ? `@${u.username}` : 'Студент')
      });
      await userStore.pushToCloud([]).catch(() => {});
      sendJsonCompressed(req, res, 200, { ok: true, suggestion });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // --- API: Экспорт PNG (мгновенное сохранение без блокировки и без лишней подписи в Telegram) ---
  if (url.pathname === '/api/export-png' && req.method === 'POST') {
    try {
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody || '{}');
      const dataUrl = String(body.dataUrl || '');
      const filename = String(body.filename || 'schedule.png').replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, '_');
      const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!m) {
        sendJsonCompressed(req, res, 400, { ok: false, error: 'Invalid PNG dataUrl' });
        return;
      }
      const buf = Buffer.from(m[1], 'base64');
      if (!global.__exportedPngStore) global.__exportedPngStore = new Map();
      const now = Date.now();
      for (const [k, v] of global.__exportedPngStore.entries()) {
        if (now - v.createdAt > 10 * 60 * 1000) global.__exportedPngStore.delete(k);
      }
      const id = Math.random().toString(36).slice(2, 12) + now.toString(36);
      global.__exportedPngStore.set(id, { buf, filename, createdAt: now });

      const queuedToTelegram = Boolean(body.sendToTelegram && body.telegramId);
      if (queuedToTelegram) {
        setImmediate(async () => {
          try {
            const { sendPngToTelegramUser } = require('./bot.js');
            if (typeof sendPngToTelegramUser === 'function') {
              await sendPngToTelegramUser(body.telegramId, buf, filename);
            }
          } catch (e) {}
        });
      }

      sendJsonCompressed(req, res, 200, {
        ok: true,
        id,
        url: `/api/export-png/${id}/${encodeURIComponent(filename)}`,
        sentToTelegram: queuedToTelegram
      });
    } catch (e) {
      sendJsonCompressed(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (url.pathname.startsWith('/api/export-png/') && req.method === 'GET') {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', 'export-png', id, filename?]
    const id = parts[2] || '';
    const entry = global.__exportedPngStore && global.__exportedPngStore.get(id);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Expired or not found');
      return;
    }
    const safeAscii = entry.filename.replace(/[^\x20-\x7E]/g, '_') || 'schedule.png';
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': entry.buf.length,
      'Content-Disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(entry.filename)}`,
      'Cache-Control': 'no-store'
    });
    res.end(entry.buf);
    return;
  }

  // --- API: Проверка приближающихся пар для рассылки уведомлений в Telegram ---
  if (url.pathname === '/api/internal/upcoming-notifications' && req.method === 'GET') {
    await userStore.init().catch(() => {});
    const { todayISO, todayDayName, nowMin } = getMoscowClockNow();
    const markSentImmediately = url.searchParams.get('markSent') !== '0';

    const candidates = userStore.getUsersForNotifications();
    const notifications = [];

    for (const u of candidates) {
      const entityType = u.role === 'lecturer' ? 'lecturer' : 'group';
      const targetName = String(u.targetName || '').trim();
      if (!targetName) continue;

      let entityObj = null;
      if (entityType === 'lecturer') {
        entityObj = scheduleIndex.lecturers.get(targetName) || (findMatchingLecturers(targetName)[0] || null);
        if (!entityObj) {
          const metaInfo = resolveLecturerMeta(targetName);
          if (metaInfo && metaInfo.raspId) {
            entityObj = {
              name: targetName,
              shortName: targetName,
              fullName: metaInfo.fullName || targetName,
              regalia: metaInfo.regalia || '',
              department: metaInfo.department || '',
              rooms: new Set(),
              lessons: []
            };
          }
        }
      } else {
        entityObj = scheduleIndex.groups.get(targetName.toUpperCase()) || scheduleIndex.groups.get(targetName) || null;
        if (!entityObj) {
          for (const [k, v] of scheduleIndex.groups.entries()) {
            if (k.toLowerCase() === targetName.toLowerCase()) { entityObj = v; break; }
          }
        }
        if (!entityObj && resolveGroupRaspId(targetName)) {
          const norm = targetName.toUpperCase().replace(/Ё/g, 'Е');
          entityObj = {
            name: norm,
            facultyCode: resolveGroupFacultyCode(norm),
            faculty: resolveGroupFaculty(norm),
            rooms: new Set(),
            lessons: []
          };
        }
      }
      if (!entityObj) continue;

      const sched = await fetchCompleteEntitySchedule(entityType, entityObj);
      if (!sched || !Array.isArray(sched.days)) continue;

      const upcomingItems = findUpcomingLessonRemindersForUser({
        user: u,
        days: sched.days,
        todayISO,
        todayDayName,
        nowMin
      });

      for (const item of upcomingItems) {
        if (markSentImmediately) {
          userStore.upsertUser(u.id, { lastNotifiedSlot: item.slotKey });
        }
        notifications.push({
          userId: u.id,
          telegramId: u.telegramId,
          role: u.role,
          targetName: u.targetName,
          slotKey: item.slotKey,
          minutesLeft: item.minutesLeft,
          lesson: item.lesson
        });
      }
    }

    sendJsonCompressed(req, res, 200, { notifications });
    return;
  }

  let urlPath = decodeURIComponent(url.pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + urlPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const cacheControl = (ext === '.svg' || ext === '.png' || ext === '.jpg')
      ? 'public, max-age=3600'
      : 'no-cache, no-store, must-revalidate';

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
      res.end();
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found: ' + urlPath);
        return;
      }

      const headers = {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        ETag: etag
      };

      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (COMPRESSIBLE_EXTS.has(ext) && data.length > 1024 && acceptEncoding.includes('gzip')) {
        zlib.gzip(data, (gzErr, compressed) => {
          if (gzErr) {
            res.writeHead(200, headers);
            res.end(data);
            return;
          }
          headers['Content-Encoding'] = 'gzip';
          res.writeHead(200, headers);
          res.end(compressed);
        });
      } else {
        res.writeHead(200, headers);
        res.end(data);
      }
    });
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

  userStore.init().catch(e => {
    console.warn('[users/db] Ошибка инициализации облачной базы:', e.message);
  });

  try {
    const { startBot } = require('./bot.js');
    startBot();
  } catch (e) {
    console.error('[bot] Не удалось инициализировать бота:', e.message);
  }
});