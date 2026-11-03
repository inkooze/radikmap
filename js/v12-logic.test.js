const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dijkstra,
  extractGroupTokens,
  formatWeekTriggerLabel,
  parseScheduleCellHtml,
  parseRaspSchedulePageHtml,
  buildGroupCheatSheet,
  computeCameraPivotRotationOffset,
  findUpcomingLessonRemindersForUser,
  detectUserTone
} = require('./graph-utils');

test('dijkstra respects includeOutdoor option', () => {
  const graph = {
    nodes: [
      { id: 'A', type: 'corridor' },
      { id: 'OUT', type: 'outdoor' },
      { id: 'IN1', type: 'corridor' },
      { id: 'IN2', type: 'corridor' },
      { id: 'B', type: 'corridor' }
    ],
    edges: [
      // Short path through outdoor courtyard (weight 10)
      { from: 'A', to: 'OUT', weight: 5 },
      { from: 'OUT', to: 'B', weight: 5 },
      // Longer path strictly indoors (weight 30)
      { from: 'A', to: 'IN1', weight: 10 },
      { from: 'IN1', to: 'IN2', weight: 10 },
      { from: 'IN2', to: 'B', weight: 10 }
    ]
  };

  const outdoorAllowed = dijkstra(graph, 'A', 'B', { includeOutdoor: true });
  assert.deepEqual(outdoorAllowed, ['A', 'OUT', 'B']);

  const indoorOnly = dijkstra(graph, 'A', 'B', { includeOutdoor: false });
  assert.deepEqual(indoorOnly, ['A', 'IN1', 'IN2', 'B']);
});

test('extractGroupTokens extracts group numbers even when subgroup is attached', () => {
  assert.deepEqual(extractGroupTokens('546 п.г. 1'), {
    groups: ['546'],
    subgroup: 'п.г. 1'
  });
  assert.deepEqual(extractGroupTokens('5415, 5425, 545, 546'), {
    groups: ['5415', '5425', '545', '546'],
    subgroup: ''
  });
  assert.deepEqual(extractGroupTokens('3035 п.г. 2'), {
    groups: ['3035'],
    subgroup: 'п.г. 2'
  });
});

test('formatWeekTriggerLabel formats date and parity into DD.MM.YYYY · числитель/знаменатель', () => {
  assert.equal(
    formatWeekTriggerLabel('2026-11-02', '02.11.2026, знам. (текущая)'),
    '02.11.2026 · знаменатель'
  );
  assert.equal(
    formatWeekTriggerLabel('2026-11-09', '09.11.2026, числ.'),
    '09.11.2026 · числитель'
  );
});

test('parseScheduleCellHtml handles missing lecturer, missing classroom, multiple subgroups, and multiple lecturers', () => {
  const classroomToRoomMap = {
    '430': { roomId: 'C_gym_main', roomShort: '🏀', floor: 1, buildingName: 'Центральный корпус' },
    '190': { roomId: 'C_auditori_50', roomShort: '50', floor: 0, buildingName: 'Центральный корпус' }
  };

  // 1. Lesson without lecturer (PE in Sportzal C)
  const peHtml = `
    <div>
      <span class="schedule-lesson-type-badge"><i class="mdi"></i>Упр.</span>
      Элективные дисциплины по физической культуре и спорту, <a href="/schedule-frame/classroom?classroom=430&amp;date=2026-11-02">Спортзал&nbsp;C</a>
    </div>
  `;
  const peParsed = parseScheduleCellHtml(peHtml, '08:10–09:45', {
    entityType: 'group',
    entityName: '546',
    classroomToRoomMap
  });
  assert.equal(peParsed.length, 1);
  assert.equal(peParsed[0].type, 'Упр.');
  assert.equal(peParsed[0].subject, 'Элективные дисциплины по физической культуре и спорту');
  assert.equal(peParsed[0].lecturer, '');
  assert.equal(peParsed[0].roomId, 'C_gym_main');

  // 2. Lesson with two subgroups in the same cell (Group 546 Thursday Labs)
  const subHtml = `
    <div>
      <span class="schedule-lesson-type-badge"><i class="mdi"></i>Лаб.</span>Вычислительная математика, п.г.&nbsp;1,<br>
      <a href="/schedule-frame/lecturer?lecturer=1509&amp;date=2026-11-02">асс. Анисимов К.В.</a>, ауд. <a href="/schedule-frame/classroom?classroom=190&amp;date=2026-11-02">50&nbsp;C</a>
    </div>
    <div class="schedule-cell-subgroup-item">
      <span class="schedule-lesson-type-badge"><i class="mdi"></i>Лаб.</span>Вычислительная математика, п.г.&nbsp;2,<br>
      <a href="/schedule-frame/lecturer?lecturer=1510&amp;date=2026-11-02">доц. Горин В.С.</a>, ауд. <a href="/schedule-frame/classroom?classroom=190&amp;date=2026-11-02">50&nbsp;C</a>
    </div>
  `;
  const subParsed = parseScheduleCellHtml(subHtml, '08:10–09:45', {
    entityType: 'group',
    entityName: '546',
    classroomToRoomMap
  });
  assert.equal(subParsed.length, 2);
  assert.equal(subParsed[0].subgroup, 'п.г. 1');
  assert.equal(subParsed[0].lecturer, 'асс. Анисимов К.В.');
  assert.equal(subParsed[0].roomId, 'C_auditori_50');
  assert.equal(subParsed[1].subgroup, 'п.г. 2');
  assert.equal(subParsed[1].lecturer, 'доц. Горин В.С.');

  // 3. Lesson without classroom (Saturday Practice)
  const noRoomHtml = `
    <div>
      <span class="schedule-lesson-type-badge"><i class="mdi"></i>Упр.</span>Учебная практика/Учебная практика,<br>
      <a href="/schedule-frame/lecturer?lecturer=1506&amp;date=2026-11-02">доц. Гостин А.М.</a>
    </div>
  `;
  const noRoomParsed = parseScheduleCellHtml(noRoomHtml, '08:10–09:45', {
    entityType: 'group',
    entityName: '546',
    classroomToRoomMap
  });
  assert.equal(noRoomParsed.length, 1);
  assert.equal(noRoomParsed[0].subject, 'Учебная практика/Учебная практика');
  assert.equal(noRoomParsed[0].lecturer, 'доц. Гостин А.М.');
  assert.equal(noRoomParsed[0].roomId, null);
  assert.equal(noRoomParsed[0].roomShort, '');
});

test('buildGroupCheatSheet groups by full discipline name (without abbreviations) and full lecturer regalia + FIO', () => {
  const days = [
    {
      date: '2026-11-02',
      dayName: 'Понедельник',
      lessons: [
        { type: 'Лек.', subject: 'Вычислительная математика', lecturer: 'проф. Скворцов С.В.', lecturers: ['проф. Скворцов С.В.'] },
        { type: 'Лаб.', subject: 'Вычислительная математика', lecturer: 'асс. Анисимов К.В.', lecturers: ['асс. Анисимов К.В.'] }
      ]
    },
    {
      date: '2026-11-06',
      dayName: 'Пятница',
      lessons: [
        { type: 'Лек.', subject: 'Интеллектуальные методы оптимизации', lecturer: 'проф. Скворцов С.В.', lecturers: ['проф. Скворцов С.В.'] }
      ]
    }
  ];

  const sheet = buildGroupCheatSheet(days, (shortName) => {
    if (shortName.includes('Скворцов')) {
      return { fullFio: 'Скворцов Сергей Владимирович', metaLine: 'д.т.н., проф. каф. САПР ВС', department: 'САПР ВС' };
    }
    return { fullFio: 'Анисимов Кирилл Витальевич', metaLine: 'асс. каф. САПР ВС', department: 'САПР ВС' };
  });

  assert.equal(sheet.length, 2);
  assert.equal(sheet[0].subject, 'Вычислительная математика');
  assert.equal(sheet[0].headerLabel, 'Вычислительная математика');
  assert.equal(sheet[0].rows.length, 2);
  assert.deepEqual(sheet[0].rows[0].types, ['Лек.']);
  assert.equal(sheet[0].rows[0].text, 'проф. д.т.н. Скворцов Сергей Владимирович');
  assert.equal(sheet[1].subject, 'Интеллектуальные методы оптимизации');
  assert.equal(sheet[1].headerLabel, 'Интеллектуальные методы оптимизации');
});

test('computeCameraPivotRotationOffset keeps camera pivot stationary during rotation', () => {
  // If pivot equals center, no pan shift is needed
  const zeroShift = computeCameraPivotRotationOffset({
    pivotX: 500,
    pivotY: 500,
    centerX: 500,
    centerY: 500,
    oldAngleDeg: 0,
    newAngleDeg: 90
  });
  assert.equal(Math.round(zeroShift.shiftX), 0);
  assert.equal(Math.round(zeroShift.shiftY), 0);

  // If camera is at (600, 500) relative to center (500, 500) and rotates +90 deg,
  // vector (100, 0) rotates to (0, 100), so shift is (-100, +100)
  const shift90 = computeCameraPivotRotationOffset({
    pivotX: 600,
    pivotY: 500,
    centerX: 500,
    centerY: 500,
    oldAngleDeg: 0,
    newAngleDeg: 90
  });
  assert.equal(Math.round(shift90.shiftX), -100);
  assert.equal(Math.round(shift90.shiftY), 100);
});

test('findUpcomingLessonRemindersForUser triggers 1..16 min before class and deduplicates by slotKey', () => {
  const user = {
    id: 'tg_12345',
    telegramId: 12345,
    role: 'student',
    targetName: '546',
    notificationsEnabled: true,
    lastNotifiedSlot: null
  };
  const days = [
    {
      date: '2026-11-02',
      dayName: 'Понедельник',
      lessons: [
        { time: '08:10–09:45', type: 'Лек.', subject: 'Вычислительная математика', roomShort: '337', floor: 3, lecturer: 'проф. Скворцов С.В.' }
      ]
    }
  ];

  // 15 minutes before 08:10 (07:55 = 475 min)
  const reminders = findUpcomingLessonRemindersForUser({
    user,
    days,
    todayISO: '2026-11-02',
    todayDayName: 'Понедельник',
    nowMin: 7 * 60 + 55
  });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].minutesLeft, 15);
  assert.equal(reminders[0].lesson.subject, 'Вычислительная математика');

  // Fallback by weekday name when cached ISO date differs
  const fallbackReminders = findUpcomingLessonRemindersForUser({
    user,
    days,
    todayISO: '2026-11-09',
    todayDayName: 'Понедельник',
    nowMin: 7 * 60 + 55
  });
  assert.equal(fallbackReminders.length, 1);
});

test('detectUserTone classifies rude, friendly, and neutral messages', () => {
  assert.equal(detectUserTone('Ты тупой бот, ничего не знаешь'), 'rude');
  assert.equal(detectUserTone('Привет! Спасибо за помощь, как дела?'), 'friendly');
  assert.equal(detectUserTone('Где находится 337 аудитория?'), 'neutral');
});
