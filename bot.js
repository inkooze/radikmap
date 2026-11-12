const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const { Telegraf, Markup } = require('telegraf');
const {
  defaultUserStore,
  renderTelegramMarkdownToHtml,
  renderTelegramPlainText
} = require('./js/user-store.js');

const BOT_TOKEN = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
let rawWebAppUrl = (process.env.WEBAPP_PROXY_URL || process.env.WEBAPP_URL || '').trim();
if (rawWebAppUrl.includes('ais-dev-')) {
  rawWebAppUrl = rawWebAppUrl.replace('ais-dev-', 'ais-pre-');
}
const DEFAULT_DEPLOYED_URL = 'https://ais-pre-irnfdqzemrx7nu7xzzdevi-814881682897.us-east1.run.app/';
const WEBAPP_URL = (!rawWebAppUrl || rawWebAppUrl.includes('ngrok') || rawWebAppUrl.includes('radikmap.ai.studio'))
  ? DEFAULT_DEPLOYED_URL
  : rawWebAppUrl.replace(/\/+$/, '') + '/';
const SCHEDULE_WEBAPP_URL = `${WEBAPP_URL}?view=schedule`;
const API_BASE = `http://localhost:${process.env.PORT || 3000}`;

const mainReplyKeyboard = Markup.keyboard([
  [
    Markup.button.webApp('🗺 Карта', WEBAPP_URL),
    Markup.button.webApp('📅 Расписание', SCHEDULE_WEBAPP_URL)
  ]
]).resize().persistent();

const userStore = defaultUserStore;
let cachedBotUsername = (process.env.BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'rgrtu_map_bot').replace(/^@/, '').trim();

function getBotUsername() {
  return cachedBotUsername;
}

console.log('[bot] BOT_TOKEN:', BOT_TOKEN ? `установлен (${BOT_TOKEN.slice(0, 10)}...)` : 'НЕ УСТАНОВЛЕН');
console.log('[bot] WEBAPP_URL:', WEBAPP_URL);
console.log('[bot] API_BASE:', API_BASE);

if (!BOT_TOKEN && require.main === module) {
  console.error('❌ BOT_TOKEN не задан. Заполни BOT_TOKEN в .env или .env.example');
  process.exit(1);
}

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN, { handlerTimeout: 15000 }) : null;

/**
 * Преобразует массив кнопок шаблона в объект reply_markup для Telegram Bot API.
 */
function buildTelegramMarkupFromTemplateButtons(buttons, fallbackExtraMarkup = {}) {
  if (!Array.isArray(buttons)) {
    return fallbackExtraMarkup || {};
  }
  if (buttons.length === 0) {
    return {};
  }

  const inlineRows = [];
  const replyRows = [];

  for (const btn of buttons) {
    if (!btn || !String(btn.text || '').trim()) continue;
    const text = String(btn.text).trim();
    const type = String(btn.type || 'callback').trim().toLowerCase();
    const val = String(btn.value || '').trim();

    if (type === 'reply') {
      if (val && (val.startsWith('http://') || val.startsWith('https://'))) {
        replyRows.push(Markup.button.webApp(text, val));
      } else {
        replyRows.push(text);
      }
    } else if (type === 'webapp') {
      const targetUrl = val || WEBAPP_URL;
      inlineRows.push([Markup.button.webApp(text, targetUrl)]);
    } else if (type === 'url') {
      const targetUrl = val || WEBAPP_URL;
      inlineRows.push([Markup.button.url(text, targetUrl)]);
    } else {
      inlineRows.push([Markup.button.callback(text, val || 'noop')]);
    }
  }

  if (inlineRows.length > 0) {
    return Markup.inlineKeyboard(inlineRows);
  }
  if (replyRows.length > 0) {
    const grouped = [];
    for (let i = 0; i < replyRows.length; i += 2) {
      grouped.push(replyRows.slice(i, i + 2));
    }
    return Markup.keyboard(grouped).resize().persistent();
  }
  return fallbackExtraMarkup || {};
}

/**
 * Безопасная отправка ответа в контексте Telegraf с поддержкой HTML-разметки (сконвертированной из Markdown),
 * проверкой включения шаблона, кастомными кнопками и автоматическим откатом на plain-text.
 */
async function replyWithRenderedTemplate(ctx, templateId, variables = {}, extraMarkup = {}) {
  if (!userStore.isBotTemplateEnabled(templateId)) {
    return null;
  }
  const fullVars = {
    webappUrl: WEBAPP_URL,
    scheduleUrl: SCHEDULE_WEBAPP_URL,
    ...variables
  };
  const rendered = userStore.renderBotMessage(templateId, fullVars);
  const hasExplicitMarkup = extraMarkup && extraMarkup.reply_markup;
  const resolvedMarkup = Array.isArray(rendered.buttons) && rendered.buttons.length > 0
    ? buildTelegramMarkupFromTemplateButtons(rendered.buttons, extraMarkup)
    : (hasExplicitMarkup ? extraMarkup : {});

  const extra = { ...(resolvedMarkup || {}), parse_mode: 'HTML', disable_web_page_preview: true };
  try {
    return await ctx.reply(rendered.html, extra);
  } catch (e) {
    const fallbackExtra = { ...(resolvedMarkup || {}) };
    delete fallbackExtra.parse_mode;
    return await ctx.reply(rendered.text, fallbackExtra);
  }
}

async function editMessageWithRenderedTemplate(ctx, chatId, messageId, templateId, variables = {}) {
  if (!userStore.isBotTemplateEnabled(templateId)) {
    return null;
  }
  if (!messageId) return null;
  const fullVars = {
    webappUrl: WEBAPP_URL,
    scheduleUrl: SCHEDULE_WEBAPP_URL,
    ...variables
  };
  const rendered = userStore.renderBotMessage(templateId, fullVars);
  const resolvedMarkup = Array.isArray(rendered.buttons) && rendered.buttons.length > 0
    ? buildTelegramMarkupFromTemplateButtons(rendered.buttons, {})
    : {};
  try {
    return await ctx.telegram.editMessageText(chatId, messageId, null, rendered.html, {
      ...(resolvedMarkup.reply_markup ? { reply_markup: resolvedMarkup.reply_markup } : {}),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  } catch (e) {
    return await ctx.telegram.editMessageText(chatId, messageId, null, rendered.text);
  }
}

const LESSON_BREAKS = {
  '08:10': '08:55–09:00',
  '09:55': '10:40–10:45',
  '11:40': '12:25–12:30',
  '13:35': '14:20–14:25',
  '15:20': '16:05–16:10',
  '17:05': '17:50–17:55',
  '18:45': '19:30–19:35',
  '18:50': '19:35–19:40',
  '20:25': '21:10–21:15'
};

const BUILDING_TITLES = {
  C: 'Главный корпус',
  С: 'Главный корпус',
  L: 'Лабораторный корпус',
  B: 'Бизнес-инкубатор',
  F: 'Первый корпус'
};

function getTypeTagEmoji(typeRaw) {
  const t = String(typeRaw || '').replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (!t) return '📚';
  if (t.startsWith('лек')) return '📖';
  if (t.startsWith('упр') || t.startsWith('пр')) return '✒️';
  if (t.startsWith('лаб')) return '🔬';
  if (t.startsWith('конс')) return '💬';
  if (t.startsWith('зач')) return '✅';
  if (t.startsWith('экз')) return '🎓';
  return '📚';
}

function getExactMoscowMinutesNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const h = parseInt(map.hour || '0', 10);
  const m = parseInt(map.minute || '0', 10);
  const s = parseInt(map.second || '0', 10);
  return h * 60 + m + s / 60;
}

function computeDynamicMinutesLeft(lessonTimeStr, fallbackMinutesLeft = 15, isLiveNotification = false) {
  const m = String(lessonTimeStr || '').match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const nowMin = getExactMoscowMinutesNow();
    const diff = Math.round(startMin - nowMin);
    if (isLiveNotification || (diff >= 1 && diff <= 30)) {
      return Math.max(1, diff);
    }
  }
  const fb = Number(fallbackMinutesLeft);
  return Number.isFinite(fb) && fb > 0 ? Math.round(fb) : 15;
}

function buildLessonReminderVariables(item = {}, { recalculateLive = false } = {}) {
  const l = item.lesson || {};
  const cleanType = String(l.type || '').replace(/^\[|\]$/g, '').trim();
  const typeEmoji = getTypeTagEmoji(cleanType);

  const timeStr = String(l.time || '').trim();
  const startMatch = timeStr.match(/^(\d{1,2}:\d{2})/);
  const startKey = startMatch ? startMatch[1].padStart(5, '0') : '';
  const breakTime = l.breakTime || (startKey && LESSON_BREAKS[startKey]) || '';

  const roomClean = String(l.roomShort || l.room || '')
    .replace(/^Ауд\.?\s*/i, '')
    .trim();
  const bCode = String(l.building || '').trim().toUpperCase();
  const buildingClean = l.buildingName || BUILDING_TITLES[bCode] ||
    ((!bCode || bCode === 'C' || bCode === 'С') ? 'Главный корпус' : bCode);
  const floorClean = (l.floor !== undefined && l.floor !== null && l.floor !== '')
    ? String(l.floor).trim()
    : '';

  const locationLine = [
    roomClean,
    buildingClean,
    floorClean ? `${floorClean} этаж` : ''
  ].filter(Boolean).join(', ');

  const lecturerClean = String(
    l.lecturer ||
    (Array.isArray(l.lecturers) ? l.lecturers.join(', ') : '') ||
    (item.role === 'lecturer' ? (item.targetName || '') : '')
  ).trim();

  const groupClean = String(
    l.group ||
    (item.role !== 'lecturer' ? (item.targetName || '') : '')
  ).trim();

  const subgroupClean = String(l.subgroup || '').trim();

  const extraParts = [];
  if (item.role === 'lecturer') {
    if (groupClean) extraParts.push(groupClean);
    if (subgroupClean) extraParts.push(subgroupClean);
    if (lecturerClean && lecturerClean !== item.targetName) extraParts.push(lecturerClean);
  } else {
    if (lecturerClean) extraParts.push(lecturerClean);
    if (groupClean) extraParts.push(groupClean);
    if (subgroupClean) extraParts.push(subgroupClean);
  }
  const extraInfo = extraParts.join(', ');

  const cleanDayNote = String(item.dayName || item.dayNote || '')
    .replace(/^\s*\(|\)\s*$/g, '')
    .trim();

  const dynamicMinutesLeft = computeDynamicMinutesLeft(
    timeStr,
    item.minutesLeft != null ? item.minutesLeft : 15,
    recalculateLive
  );

  return {
    webappUrl: WEBAPP_URL,
    scheduleUrl: SCHEDULE_WEBAPP_URL,
    roomUrl: roomClean ? `${WEBAPP_URL}?room=${encodeURIComponent(roomClean)}` : WEBAPP_URL,
    minutesLeft: String(dynamicMinutesLeft),
    dayName: cleanDayNote,
    dayNote: cleanDayNote,
    type: cleanType,
    typeTag: cleanType,
    typeTagEmoji: typeEmoji,
    subject: String(l.subject || 'Учебное занятие').trim(),
    time: timeStr,
    breakTime,
    room: roomClean,
    building: buildingClean,
    floor: floorClean,
    locationLine,
    group: groupClean,
    subgroup: subgroupClean,
    lecturer: lecturerClean,
    extraInfo,
    name: String(item.firstName || 'друг').trim(),
    target: String(item.targetName || '').trim()
  };
}

function buildNextDayReminderVariables(item = {}) {
  const lessons = Array.isArray(item.lessons) ? item.lessons : [];
  let firstLessonTime = '';
  if (lessons.length > 0 && lessons[0].time) {
    const m = String(lessons[0].time).trim().match(/^(\d{1,2}:\d{2})/);
    firstLessonTime = m ? m[1] : String(lessons[0].time).trim().split(/[–-]/)[0].trim();
  }

  const lines = lessons.map((l, idx) => {
    const num = l.pairNumber || (idx + 1);
    const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'][num - 1] || `${num}.`;
    const timeStr = String(l.time || '').trim();
    const typeStr = String(l.type || '').replace(/^\[|\]$/g, '').replace(/\.+$/, '').trim();
    const subjStr = String(l.subject || 'Занятие').trim();
    const roomClean = String(l.roomShort || l.room || '').replace(/^Ауд\.?\s*/i, '').trim();
    const bCode = String(l.building || 'C').trim().toUpperCase();
    const isNamedPlace = /^(спортзал|актовый|зал|библиотека|буфет|столовая|каф\.|кафедра)/i.test(roomClean);
    const roomWithBuilding = roomClean
      ? (isNamedPlace
        ? roomClean
        : (bCode && bCode !== 'C' && bCode !== 'С' && !roomClean.toUpperCase().startsWith(bCode)
          ? `ауд. ${bCode}-${roomClean}`
          : `ауд. ${roomClean}`))
      : '';
    const whoStr = item.role === 'lecturer'
      ? (l.group ? `гр. ${l.group}` : '')
      : (l.lecturer || '');
    const details = [roomWithBuilding, whoStr].filter(Boolean).join(', ');
    return `${numEmoji} \`${timeStr}\` — *${typeStr ? typeStr + '. ' : ''}${subjStr}*${details ? ` _(${details})_` : ''}`;
  });

  return {
    webappUrl: WEBAPP_URL,
    scheduleUrl: SCHEDULE_WEBAPP_URL,
    dayName: String(item.dayName || 'Завтра').trim(),
    date: String(item.date || '').trim(),
    target: String(item.targetName || '').trim(),
    lessonsCount: String(item.lessonsCount || lessons.length || 0),
    firstLessonTime,
    lessonsList: lines.join('\n'),
    name: String(item.firstName || 'друг').trim()
  };
}

// Очередь с защитой от рейтлимитов Telegram (~26 сообщений/сек + обработка 429 retry_after)
let lastTelegramSendAt = 0;
const MIN_TELEGRAM_SEND_INTERVAL_MS = 38;

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function paceTelegramSend() {
  const now = Date.now();
  const elapsed = now - lastTelegramSendAt;
  if (elapsed < MIN_TELEGRAM_SEND_INTERVAL_MS) {
    await sleepMs(MIN_TELEGRAM_SEND_INTERVAL_MS - elapsed);
  }
  lastTelegramSendAt = Date.now();
}

if (bot) {
  bot.use((ctx, next) => {
    if (ctx.from && ctx.from.id) {
      try {
        userStore.upsertUser(`tg_${ctx.from.id}`, {
          telegramId: ctx.from.id,
          firstName: ctx.from.first_name || '',
          username: ctx.from.username || ''
        });
      } catch (e) {}
    }
    return next();
  });

  bot.start(async (ctx) => {
    const name = ctx.from.first_name || 'друг';
    const username = ctx.from.username || '';
    const payload = String(ctx.startPayload || '').trim();
    console.log('[bot] /start от', ctx.from.id, name, payload);

    if (payload.startsWith('login_') || payload.startsWith('webauth_')) {
      const sessionToken = payload.replace(/^(login_|webauth_)/i, '');
      const ok = userStore.completeBrowserAuthSession(sessionToken, {
        telegramId: ctx.from.id,
        firstName: ctx.from.first_name || '',
        username: ctx.from.username || ''
      });
      if (ok) {
        await replyWithRenderedTemplate(
          ctx,
          'start_webauth_success',
          { name, username },
          mainReplyKeyboard
        );
        return replyWithRenderedTemplate(
          ctx,
          'start_webauth_manage_prompt',
          { name, username },
          Markup.inlineKeyboard([
            [Markup.button.callback('👤 Мой профиль и уведомления', 'my_profile')]
          ])
        );
      }
    }

    const code = userStore.createAuthCodeForTelegramUser({
      telegramId: ctx.from.id,
      firstName: ctx.from.first_name || '',
      username: ctx.from.username || ''
    });

    await replyWithRenderedTemplate(
      ctx,
      'start_welcome',
      { name, username, code },
      mainReplyKeyboard
    );

    return replyWithRenderedTemplate(
      ctx,
      'start_menu_prompt',
      { name, username },
      Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Получить код входа для сайта', 'login_code')],
        [Markup.button.callback('👤 Моё расписание и уведомления', 'my_profile')],
        [Markup.button.callback('🟢 Свободные аудитории', 'free_now')]
      ])
    );
  });

  bot.command('login', (ctx) => {
    const name = ctx.from.first_name || 'друг';
    const code = userStore.createAuthCodeForTelegramUser({
      telegramId: ctx.from.id,
      firstName: ctx.from.first_name || '',
      username: ctx.from.username || ''
    });
    return replyWithRenderedTemplate(ctx, 'login_command', { name, code }, mainReplyKeyboard);
  });

  bot.action('login_code', async (ctx) => {
    await ctx.answerCbQuery();
    const name = ctx.from.first_name || 'друг';
    const code = userStore.createAuthCodeForTelegramUser({
      telegramId: ctx.from.id,
      firstName: ctx.from.first_name || '',
      username: ctx.from.username || ''
    });
    return replyWithRenderedTemplate(ctx, 'login_callback', { name, code });
  });

  async function replyWithProfile(ctx) {
    const u = userStore.getUserByTelegramId(ctx.from.id);
    const name = (u && u.firstName) || ctx.from.first_name || 'друг';
    const username = (u && u.username) || ctx.from.username || '';
    const roleLabel = u && u.role === 'lecturer' ? 'Преподаватель' : 'Студент';
    const targetLabel = u && u.targetName ? u.targetName : 'не выбрано (укажи на сайте в меню 👤)';
    const notifLabel = u && u.notificationsEnabled ? 'Включены ✅' : 'Выключены 🔕';
    const toggleText = u && u.notificationsEnabled ? '🔕 Выключить уведомления' : '🔔 Включить уведомления о парах';

    return replyWithRenderedTemplate(
      ctx,
      'profile_card',
      {
        name,
        username,
        role: roleLabel,
        target: targetLabel,
        notifStatus: notifLabel
      },
      Markup.inlineKeyboard([
        [Markup.button.callback(toggleText, 'toggle_notif')]
      ])
    );
  }

  bot.command('my', (ctx) => replyWithProfile(ctx));

  bot.action('my_profile', async (ctx) => {
    await ctx.answerCbQuery();
    return replyWithProfile(ctx);
  });

  bot.action('toggle_notif', async (ctx) => {
    const existing = userStore.getUserByTelegramId(ctx.from.id);
    const nextState = !(existing && existing.notificationsEnabled);
    userStore.upsertUser(`tg_${ctx.from.id}`, {
      telegramId: ctx.from.id,
      notificationsEnabled: nextState
    });
    await ctx.answerCbQuery(nextState ? 'Уведомления включены!' : 'Уведомления выключены');
    if (nextState) {
      setTimeout(checkUpcomingLessonNotifications, 500);
    }
    return replyWithProfile(ctx);
  });

  bot.help((ctx) => {
    const name = ctx.from?.first_name || 'друг';
    return replyWithRenderedTemplate(ctx, 'help_command', { name }, mainReplyKeyboard);
  });

  bot.command('map', (ctx) => {
    const name = ctx.from?.first_name || 'друг';
    return replyWithRenderedTemplate(ctx, 'map_command', { name }, mainReplyKeyboard);
  });

  bot.command('schedule', async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    const arg = text.replace(/^\/schedule\s*/i, '').trim();
    const u = userStore.getUserByTelegramId(ctx.from.id);
    const target = arg || (u && u.targetName) || '';

    if (target) {
      try {
        const type = (u && u.role === 'lecturer') ? 'lecturer' : 'group';
        const res = await fetch(`${API_BASE}/api/entity-schedule?type=${type}&name=${encodeURIComponent(target)}`);
        if (res.ok) {
          const data = await res.json();
          const days = data.days || [];
          if (days.length > 0) {
            let msg = `📅 *Расписание для ${data.fullName || target}:*\n`;
            let hasLessons = false;
            days.slice(0, 3).forEach(d => {
              if (d.lessons && d.lessons.length > 0) {
                hasLessons = true;
                msg += `\n*${d.dayName} (${d.date}):*\n`;
                d.lessons.forEach(l => {
                  const roomStr = l.roomShort || l.room || '';
                  msg += `• \`${l.time || ''}\` ${l.subject || ''} _(${l.type || ''})_ ${roomStr ? 'ауд. ' + roomStr : ''}\n`;
                });
              }
            });
            if (hasLessons) {
              return ctx.replyWithMarkdown(msg, mainReplyKeyboard);
            }
          }
        }
      } catch (e) {}
    }

    const name = ctx.from?.first_name || 'друг';
    return replyWithRenderedTemplate(ctx, 'schedule_command', { name }, mainReplyKeyboard);
  });

  bot.command('free', async (ctx) => {
    const name = ctx.from?.first_name || 'друг';
    const loading = await replyWithRenderedTemplate(ctx, 'free_loading', { name });
    try {
      const res = await fetch(`${API_BASE}/api/free-now`);
      if (res.status === 503) {
        await editMessageWithRenderedTemplate(ctx, ctx.chat.id, loading.message_id, 'free_warming', { name });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const mainRooms = data.free
        .filter(r => r.building === 'C')
        .sort((a, b) => {
          const collator = new Intl.Collator('ru', { numeric: true });
          return collator.compare(a.name, b.name);
        })
        .slice(0, 20);

      const totalC = data.free.filter(r => r.building === 'C').length;

      if (mainRooms.length === 0) {
        await editMessageWithRenderedTemplate(ctx, ctx.chat.id, loading.message_id, 'free_empty', { name });
        return;
      }

      const lines = mainRooms.map(r => `• ${r.name} — ${r.untilText}`);
      const footer = totalC > 20 ? '…и другие. Открой карту по кнопке «🗺 Карта» внизу экрана, чтобы увидеть все.' : '';

      await editMessageWithRenderedTemplate(ctx, ctx.chat.id, loading.message_id, 'free_list', {
        name,
        totalCount: String(totalC),
        roomsList: lines.join('\n'),
        moreFooter: footer
      });
    } catch (e) {
      console.error('[bot/free]', e);
      await ctx.telegram.editMessageText(
        ctx.chat.id, loading.message_id, null,
        '⚠️ Не удалось получить список. Попробуй позже.\n\n' + e.message
      );
    }
  });

  bot.action('free_now', async (ctx) => {
    await ctx.answerCbQuery();
    const name = ctx.from?.first_name || 'друг';
    return replyWithRenderedTemplate(ctx, 'free_callback_hint', { name }, mainReplyKeyboard);
  });

  bot.on('text', async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    if (!text || text.startsWith('/')) return;
    try {
      const res = await fetch(`${API_BASE}/api/ai-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text })
      });
      if (!res.ok) return;
      const data = await res.json();
      const answer = data.answer || data.reply;
      if (answer) {
        await ctx.reply(answer, mainReplyKeyboard);
      }
    } catch (e) {}
  });

  bot.catch((err, ctx) => {
    console.error('[bot] error для', ctx?.updateType, err);
  });
}

async function sendPngToTelegramUser(telegramId, pngBuffer, filename = 'schedule.png') {
  if (!bot || !telegramId || !pngBuffer) return false;
  try {
    await paceTelegramSend();
    // Отправляем только сам файл изображения без лишнего текстового сообщения (без caption)
    await bot.telegram.sendPhoto(
      telegramId,
      { source: pngBuffer, filename }
    );
    return true;
  } catch (e) {
    try {
      await paceTelegramSend();
      await bot.telegram.sendDocument(
        telegramId,
        { source: pngBuffer, filename }
      );
      return true;
    } catch (e2) {
      console.warn('[bot/sendPng]', e2.message);
      return false;
    }
  }
}

async function sendAdminTelegramMessage(telegramId, markdownText, variables = {}, customButtons = null) {
  if (!bot) return { ok: false, error: 'BOT_TOKEN не настроен на сервере' };
  const raw = String(markdownText || '').trim();
  if (!telegramId || !raw) {
    return { ok: false, error: 'Не указан Telegram ID или текст сообщения' };
  }
  const fullVars = {
    webappUrl: WEBAPP_URL,
    scheduleUrl: SCHEDULE_WEBAPP_URL,
    ...variables
  };
  const html = renderTelegramMarkdownToHtml(raw, fullVars);
  const plain = renderTelegramPlainText(raw, fullVars);

  let resolvedMarkup = mainReplyKeyboard;
  if (Array.isArray(customButtons)) {
    const renderedBtns = customButtons.map(b => ({
      text: renderTelegramPlainText(b.text || '', fullVars),
      type: b.type || 'callback',
      value: renderTelegramPlainText(b.value || '', fullVars)
    })).filter(b => b.text);
    if (renderedBtns.length > 0) {
      resolvedMarkup = buildTelegramMarkupFromTemplateButtons(renderedBtns, mainReplyKeyboard);
    } else {
      resolvedMarkup = {};
    }
  }

  try {
    await paceTelegramSend();
    await bot.telegram.sendMessage(telegramId, html, {
      ...(resolvedMarkup || {}),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    return { ok: true, renderedHtml: html, renderedText: plain };
  } catch (e) {
    const retryAfter = e?.response?.parameters?.retry_after || e?.parameters?.retry_after;
    if (retryAfter) {
      await sleepMs((Number(retryAfter) + 1) * 1000);
    }
    try {
      await paceTelegramSend();
      await bot.telegram.sendMessage(telegramId, plain, resolvedMarkup || mainReplyKeyboard);
      return { ok: true, renderedHtml: html, renderedText: plain, fallbackPlain: true };
    } catch (e2) {
      return { ok: false, error: e2.message || 'Ошибка отправки в Telegram' };
    }
  }
}

let isSendingNotificationBatch = false;

async function checkUpcomingLessonNotifications() {
  if (!bot || isSendingNotificationBatch) return;
  isSendingNotificationBatch = true;
  try {
    await userStore.init().catch(() => {});
    const res = await fetch(`${API_BASE}/api/internal/upcoming-notifications?markSent=0`);
    if (!res.ok) return;
    const data = await res.json();

    // 1. Уведомления за 15 минут до начала пары
    if (Array.isArray(data.notifications) && data.notifications.length > 0 && userStore.isBotTemplateEnabled('lesson_reminder')) {
      for (const item of data.notifications) {
        if (!item.telegramId || !item.lesson) continue;
        const u = item.userId ? userStore.getUser(item.userId) : userStore.getUserByTelegramId(item.telegramId);
        if (u && item.slotKey && Array.isArray(u.notifiedSlots)) {
          if (u.notifiedSlots.some(s => s === item.slotKey || String(s).startsWith(item.slotKey + '|'))) {
            continue;
          }
        }

        await paceTelegramSend();

        let vars = buildLessonReminderVariables(
          {
            ...item,
            firstName: (u && u.firstName) || '',
            targetName: (u && u.targetName) || item.targetName || ''
          },
          { recalculateLive: true }
        );
        let rendered = userStore.renderBotMessage('lesson_reminder', vars);
        const markup = Array.isArray(rendered.buttons) && rendered.buttons.length > 0
          ? buildTelegramMarkupFromTemplateButtons(rendered.buttons, mainReplyKeyboard)
          : mainReplyKeyboard;

        try {
          try {
            await bot.telegram.sendMessage(item.telegramId, rendered.html, {
              ...(markup || {}),
              parse_mode: 'HTML',
              disable_web_page_preview: true
            });
          } catch (err) {
            const retryAfter = err?.response?.parameters?.retry_after || err?.parameters?.retry_after;
            if (retryAfter) {
              await sleepMs((Number(retryAfter) + 1) * 1000);
              await paceTelegramSend();
              vars = buildLessonReminderVariables(
                {
                  ...item,
                  firstName: (u && u.firstName) || '',
                  targetName: (u && u.targetName) || item.targetName || ''
                },
                { recalculateLive: true }
              );
              rendered = userStore.renderBotMessage('lesson_reminder', vars);
              await bot.telegram.sendMessage(item.telegramId, rendered.html, {
                ...(markup || {}),
                parse_mode: 'HTML',
                disable_web_page_preview: true
              });
            } else {
              await bot.telegram.sendMessage(item.telegramId, rendered.text, markup || mainReplyKeyboard);
            }
          }
          if (item.userId && item.slotKey) {
            userStore.upsertUser(item.userId, { lastNotifiedSlot: item.slotKey });
          }
        } catch (sendErr) {
          console.warn(`[bot/notify] Не удалось отправить уведомление ${item.telegramId}:`, sendErr.message);
        }
      }
    }

    // 2. Вечерние уведомления о занятиях следующего дня
    if (Array.isArray(data.nextDayNotifications) && data.nextDayNotifications.length > 0 && userStore.isBotTemplateEnabled('next_day_reminder')) {
      for (const item of data.nextDayNotifications) {
        if (!item.telegramId || !Array.isArray(item.lessons) || !item.lessons.length) continue;
        const u = item.userId ? userStore.getUser(item.userId) : userStore.getUserByTelegramId(item.telegramId);
        if (u && item.slotKey && Array.isArray(u.notifiedSlots) && u.notifiedSlots.includes(item.slotKey)) {
          continue;
        }

        await paceTelegramSend();

        const vars = buildNextDayReminderVariables({
          ...item,
          firstName: (u && u.firstName) || '',
          targetName: (u && u.targetName) || item.targetName || ''
        });
        const rendered = userStore.renderBotMessage('next_day_reminder', vars);
        const markup = Array.isArray(rendered.buttons) && rendered.buttons.length > 0
          ? buildTelegramMarkupFromTemplateButtons(rendered.buttons, mainReplyKeyboard)
          : mainReplyKeyboard;

        try {
          try {
            await bot.telegram.sendMessage(item.telegramId, rendered.html, {
              ...(markup || {}),
              parse_mode: 'HTML',
              disable_web_page_preview: true
            });
          } catch (err) {
            const retryAfter = err?.response?.parameters?.retry_after || err?.parameters?.retry_after;
            if (retryAfter) {
              await sleepMs((Number(retryAfter) + 1) * 1000);
              await paceTelegramSend();
            }
            await bot.telegram.sendMessage(item.telegramId, rendered.text, markup || mainReplyKeyboard);
          }
          if (item.userId && item.slotKey) {
            userStore.upsertUser(item.userId, { lastNotifiedSlot: item.slotKey });
          }
        } catch (sendErr) {
          console.warn(`[bot/next-day] Не удалось отправить вечернее уведомление ${item.telegramId}:`, sendErr.message);
        }
      }
    }
  } catch (e) {
  } finally {
    isSendingNotificationBatch = false;
  }
}

let botLaunched = false;
let notifyTimer = null;

function startBot(retryCount = 0) {
  if (!bot || botLaunched) return;
  botLaunched = true;

  userStore.init().catch(() => {});

  bot.telegram.getMe()
    .then((me) => {
      if (me && me.username) {
        cachedBotUsername = me.username;
        console.log(`[bot] Аккаунт бота: @${cachedBotUsername}`);
      }
    })
    .catch(() => {});

  bot.telegram.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'login', description: 'Код входа на сайте' },
    { command: 'my', description: 'Мой профиль и уведомления' },
    { command: 'map', description: 'Интерактивная карта' },
    { command: 'schedule', description: 'Расписание занятий' },
    { command: 'free', description: 'Свободные аудитории' },
    { command: 'help', description: 'Помощь и команды' }
  ]).catch(err => {
    console.warn('[bot] Не удалось установить команды бота:', err.message);
  });

  bot.telegram.setChatMenuButton({
    menuButton: { type: 'commands' }
  }).catch(() => {});

  if (!notifyTimer) {
    setTimeout(checkUpcomingLessonNotifications, 4000);
    notifyTimer = setInterval(checkUpcomingLessonNotifications, 30 * 1000);
  }

  bot.launch()
    .then(() => {
      console.log('🤖 Telegram-бот запущен и слушает команды');
    })
    .catch((err) => {
      botLaunched = false;
      console.error('❌ Ошибка запуска Telegram-бота:', err.message);
      if (String(err.message).includes('409') && retryCount < 3) {
        console.log('[bot] Повторная попытка подключения через 3 сек...');
        setTimeout(() => startBot(retryCount + 1), 3000);
      }
    });

  process.once('SIGINT', () => { try { bot.stop('SIGINT'); } catch (e) {} });
  process.once('SIGTERM', () => { try { bot.stop('SIGTERM'); } catch (e) {} });
}

if (require.main === module) {
  startBot();
}

module.exports = {
  bot,
  startBot,
  getBotUsername,
  buildLessonReminderVariables,
  buildNextDayReminderVariables,
  checkUpcomingLessonNotifications,
  sendPngToTelegramUser,
  sendAdminTelegramMessage
};