const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  generateNextNodeId,
  dijkstra,
  computeRouteLength,
  computeRouteMetrics,
  computeTurn,
  searchRoomsInMeta
} = require('./graph-utils.js');

describe('RadikMap Graph, Editor & Smart Search Logic', () => {
  it('generateNextNodeId fills gaps and scopes by building and floor', () => {
    const nodes = {
      n1_c_f1: { x: 10, y: 10, building: 'C', floor: 1, type: 'hallway' },
      n3_c_f1: { x: 20, y: 20, building: 'C', floor: 1, type: 'hallway' },
      n1_c_f2: { x: 10, y: 10, building: 'C', floor: 2, type: 'hallway' }
    };
    assert.equal(generateNextNodeId(nodes, 'C', 1), 'n2_c_f1');
    nodes.n2_c_f1 = { x: 15, y: 15, building: 'C', floor: 1, type: 'hallway' };
    assert.equal(generateNextNodeId(nodes, 'C', 1), 'n4_c_f1');
    assert.equal(generateNextNodeId(nodes, 'C', 2), 'n2_c_f2');
    assert.equal(generateNextNodeId(nodes, 'C', 3), 'n1_c_f3');
  });

  it('dijkstra finds shortest path across hallways and cross-floor stairs and computes meters & time', () => {
    const sampleGraph = {
      nodes: {
        n1_c_f1: { x: 0, y: 0, building: 'C', floor: 1, type: 'entrance' },
        n2_c_f1: { x: 100, y: 0, building: 'C', floor: 1, type: 'hallway' },
        s1_c_f1: { x: 200, y: 0, building: 'C', floor: 1, type: 'stairs', group: 'stairs_left' },
        s1_c_f2: { x: 200, y: 0, building: 'C', floor: 2, type: 'stairs', group: 'stairs_left' },
        n1_c_f2: { x: 300, y: 0, building: 'C', floor: 2, type: 'hallway' }
      },
      edges: [
        { from: 'n1_c_f1', to: 'n2_c_f1', weight: 100 },
        { from: 'n2_c_f1', to: 's1_c_f1', weight: 100 },
        { from: 's1_c_f1', to: 's1_c_f2', weight: 40 },
        { from: 's1_c_f2', to: 'n1_c_f2', weight: 100 }
      ]
    };

    const route = dijkstra(sampleGraph, 'n1_c_f1', 'n1_c_f2');
    assert.deepEqual(route, ['n1_c_f1', 'n2_c_f1', 's1_c_f1', 's1_c_f2', 'n1_c_f2']);
    assert.equal(computeRouteLength(sampleGraph, route), 300);

    // 300 px = 30m flat + 8m stairs = 38m, 24s flat + 22s stairs = 46s (~1 мин)
    const metrics = computeRouteMetrics(sampleGraph, route);
    assert.equal(metrics.meters, 38);
    assert.equal(metrics.floorChanges, 1);
    assert.equal(metrics.minutesText, '~1 мин');
    assert.equal(metrics.transitions.length, 1);
    assert.equal(metrics.transitions[0].direction, 'up');
  });

  it('computeTurn accurately classifies straight, left, right, and u-turn movements', () => {
    const g = {
      nodes: {
        a: { x: 0, y: 0, floor: 1, building: 'C' },
        b: { x: 100, y: 0, floor: 1, building: 'C' },
        straight: { x: 200, y: 0, floor: 1, building: 'C' },
        left: { x: 100, y: 100, floor: 1, building: 'C' },
        right: { x: 100, y: -100, floor: 1, building: 'C' },
        uturn: { x: 0, y: 5, floor: 1, building: 'C' }
      }
    };

    assert.equal(computeTurn(g, 'a', 'b', 'straight'), 'прямо');
    assert.equal(computeTurn(g, 'a', 'b', 'left'), 'поверните налево');
    assert.equal(computeTurn(g, 'a', 'b', 'right'), 'поверните направо');
    assert.equal(computeTurn(g, 'a', 'b', 'uturn'), 'разворот');
  });

  it('validates real data/graph.json integrity and cross-floor routing', () => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'graph.json'), 'utf8');
    const realGraph = JSON.parse(raw);
    assert.ok(Object.keys(realGraph.nodes).length > 50, 'graph.json should contain campus nodes');
    assert.ok(realGraph.edges.length > 50, 'graph.json should contain campus edges');

    for (const edge of realGraph.edges) {
      assert.ok(realGraph.nodes[edge.from], `Missing from node: ${edge.from}`);
      assert.ok(realGraph.nodes[edge.to], `Missing to node: ${edge.to}`);
      assert.ok(typeof edge.weight === 'number' && edge.weight > 0, `Invalid weight on ${edge.from}->${edge.to}`);
    }

    const path1to0 = dijkstra(realGraph, 'n1_c_f1', 'n228_c_f0');
    assert.ok(Array.isArray(path1to0) && path1to0.length > 3, 'Should find valid multi-floor route from n1_c_f1 to n228_c_f0');
    assert.equal(path1to0[0], 'n1_c_f1');
    assert.equal(path1to0[path1to0.length - 1], 'n228_c_f0');
  });

  it('searchRoomsInMeta returns only real buffets/cafeterias for "столовая" and never department labs', () => {
    const rawRooms = fs.readFileSync(path.join(__dirname, '..', 'data', 'rooms.json'), 'utf8');
    const roomsMeta = JSON.parse(rawRooms);

    const results = searchRoomsInMeta(roomsMeta, 'столовая', 20);
    assert.ok(results.length >= 3, 'Should find campus cafeterias and buffets');
    for (const item of results) {
      assert.equal(item.meta.type, 'buffet', `Expected buffet type for "столовая", got ${item.id} (${item.meta.name})`);
      assert.ok(!item.meta.name.toLowerCase().includes('кафедр'), `Should NEVER return department labs for "столовая": ${item.meta.name}`);
    }

    // Also test searching by slang/description ("клоповник", "копицентр") and exact room number ("110")
    const klop = searchRoomsInMeta(roomsMeta, 'клоповник', 5);
    assert.equal(klop.length, 1);
    assert.equal(klop[0].id, 'C_hall_f1_main');

    const copy = searchRoomsInMeta(roomsMeta, 'копицентр', 5);
    assert.equal(copy.length, 1);
    assert.equal(copy[0].id, 'C_spec_prep_courses');

    const r110 = searchRoomsInMeta(roomsMeta, '110', 5);
    assert.ok(r110.length >= 1);
    assert.equal(r110[0].id, 'C_auditori_110');
  });

  it('splitGroupAndLecturer preserves Cyrillic suffixes like 546М and separates 546 from 546М in real cache', () => {
    const { splitGroupAndLecturer } = require('./user-store.js');
    const parsedM = splitGroupAndLecturer('546М', 'проф. Скворцов С.В.');
    assert.deepEqual(parsedM.groups, ['546М']);
    assert.equal(parsedM.lecturer, 'проф. Скворцов С.В.');

    const parsedSubgroup = splitGroupAndLecturer('546, 1 п.г., 546М, 2 п.г.', 'проф. Пржегорлинский В.Н.');
    assert.deepEqual(parsedSubgroup.groups, ['546', '546М']);
    assert.equal(parsedSubgroup.lecturer, 'проф. Пржегорлинский В.Н.');

    const cachePath = path.join(__dirname, '..', 'data', 'cache.json');
    if (fs.existsSync(cachePath)) {
      const rawCache = JSON.parse(fs.readFileSync(cachePath, 'utf8')).cache || {};
      const groupsMap = new Map();
      for (const entry of Object.values(rawCache)) {
        if (!entry || !Array.isArray(entry.days)) continue;
        for (const d of entry.days) {
          for (const l of (d.lessons || [])) {
            const fixed = splitGroupAndLecturer(l.group, l.lecturer);
            for (const g of fixed.groups) {
              groupsMap.set(g, (groupsMap.get(g) || 0) + 1);
            }
          }
        }
      }
      assert.ok(groupsMap.has('546'), 'Real schedule cache should contain group 546');
      assert.ok(groupsMap.has('546М'), 'Real schedule cache should contain group 546М as a separate group');
      assert.ok(!groupsMap.has('1'), 'Real schedule cache should NEVER contain phantom group "1"');
      assert.ok(!groupsMap.has('2'), 'Real schedule cache should NEVER contain phantom group "2"');
    }
  });

  it('UserStore persists student/lecturer profile, theme, notifications, and 6-digit Telegram auth codes', () => {
    const os = require('node:os');
    const { UserStore } = require('./user-store.js');
    const tmpFile = path.join(os.tmpdir(), `radikmap-users-test-${Date.now()}.json`);
    try {
      const store = new UserStore(tmpFile);
      const code = store.createAuthCodeForTelegramUser({
        telegramId: 777888999,
        firstName: 'Иван',
        username: 'ivan_rgrtu'
      });
      assert.match(code, /^\d{6}$/);

      const authed = store.consumeAuthCode(code, {
        role: 'student',
        targetName: '546М',
        theme: 'dark'
      });
      assert.ok(authed);
      assert.equal(authed.telegramId, 777888999);
      assert.equal(authed.role, 'student');
      assert.equal(authed.targetName, '546М');
      assert.equal(authed.theme, 'dark');
      assert.equal(authed.isTelegramLinked, true);

      store.upsertUser(authed.id, { notificationsEnabled: true });
      const notifyList = store.getUsersForNotifications();
      assert.equal(notifyList.length, 1);
      assert.equal(notifyList[0].targetName, '546М');

      const guest = store.upsertUser('guest-123', {});
      assert.equal(guest.theme, 'system');

      // Проверка конструктора шаблонов сообщений бота и Markdown-рендерера
      const catalog = store.getBotTemplatesCatalog();
      assert.ok(catalog.length >= 16);
      store.saveBotTemplate('login_command', 'Привет, *{{name}}* (@{{username}})!\nКод: `{{code}}`\n||секрет||');
      const rendered = store.renderBotMessage('login_command', {
        name: 'Иван <1>',
        username: 'ivan_rgrtu_test',
        code: '123456'
      });
      assert.ok(rendered.html.includes('<b>Иван &lt;1&gt;</b>'));
      assert.ok(rendered.html.includes('@ivan_rgrtu_test'));
      assert.ok(rendered.html.includes('<code>123456</code>'));
      assert.ok(rendered.html.includes('<tg-spoiler>секрет</tg-spoiler>'));

      store.resetBotTemplate('login_command');
      const afterReset = store.getBotTemplatesCatalog().find(t => t.id === 'login_command');
      assert.equal(afterReset.isModified, false);

      // Проверка чистых переменных в шаблонах напоминания о паре (без скобок, без \n и без зашитых префиксов)
      const reminderTpl = store.getBotTemplatesCatalog().find(t => t.id === 'lesson_reminder');
      assert.ok(reminderTpl);
      const varKeys = reminderTpl.variables.map(v => v.key);
      for (const reqKey of ['minutesLeft', 'typeTagEmoji', 'typeTag', 'breakTime', 'room', 'building', 'floor', 'lecturer', 'group', 'subgroup', 'extraInfo', 'locationLine']) {
        assert.ok(varKeys.includes(reqKey), `Missing variable ${reqKey} in lesson_reminder`);
      }
      for (const v of reminderTpl.variables) {
        assert.ok(!String(v.sample || '').startsWith('\n'), `Variable ${v.key} should not start with newline`);
        assert.ok(!String(v.sample || '').includes('👤 Преподаватель'), `Variable ${v.key} should not contain static label "👤 Преподаватель"`);
      }
      const typeTagVar = reminderTpl.variables.find(v => v.key === 'typeTag');
      assert.equal(typeTagVar.sample, 'Лек.');

      // Проверка личных заметок к парам и очередей премодерации
      const notes = store.saveUserLessonNote(authed.id, 'Понедельник|08:10–09:45|Физика', 'Принести лабу №2');
      assert.equal(notes['Понедельник|08:10–09:45|Физика'], 'Принести лабу №2');

      const marker = store.addCommunityMarker({
        building: 'C',
        floor: 1,
        x: 320,
        y: 450,
        category: 'socket',
        title: 'Розетка у деканата',
        authorId: authed.id
      });
      assert.equal(marker.status, 'pending');
      store.moderateCommunityMarker(marker.id, 'approve');
      assert.equal(store.getApprovedMapMarkers().some(m => m.id === marker.id), true);

      const review = store.addRoomReview({
        roomId: 'C_buffet_1',
        rating: 5,
        text: 'Отличная выпечка!',
        authorId: authed.id
      });
      assert.equal(review.status, 'pending');
      store.moderateRoomReview(review.id, 'approve');
      assert.equal(store.getApprovedRoomReviews('C_buffet_1').length, 1);
      assert.ok(store.getModerationData().markers.length >= 1);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('normalizeLessonType and snapPointToGraphCorridor handle exam/credit/consultation types and corridor map-matching', () => {
    const { normalizeLessonType, snapPointToGraphCorridor } = require('./graph-utils.js');
    assert.equal(normalizeLessonType('Консультация'), 'Конс.');
    assert.equal(normalizeLessonType('Зачёт'), 'Зач.');
    assert.equal(normalizeLessonType('Дифференцированный зачет'), 'Зач.');
    assert.equal(normalizeLessonType('Экзамен'), 'Экз.');
    assert.equal(normalizeLessonType('Лекция'), 'Лек.');

    const sampleGraph = {
      nodes: {
        a: { x: 100, y: 100, building: 'C', floor: 1 },
        b: { x: 300, y: 100, building: 'C', floor: 1 }
      },
      edges: [{ from: 'a', to: 'b', weight: 200 }]
    };
    const snapped = snapPointToGraphCorridor(sampleGraph, 'C', 1, 185, 142);
    assert.equal(snapped.x, 185);
    assert.equal(snapped.y, 100);
    assert.equal(snapped.nearestNodeId, 'a');
  });
});



