const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const { Telegraf, Markup } = require('telegraf');
const { defaultUserStore } = require('./js/user-store.js');

const BOT_TOKEN = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
const rawWebAppUrl = (process.env.WEBAPP_URL || '').trim();
const WEBAPP_URL = (!rawWebAppUrl || rawWebAppUrl.includes('ngrok'))
  ? 'https://radikmap.ai.studio/'
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
        await ctx.reply(
          `✅ Привет, ${name}! Вход на сайте Карты РГРТУ подтверждён.\n\n` +
          `Можешь вернуться в браузер — твой профиль и настройки расписания уже подключены автоматически.`,
          mainReplyKeyboard
        );
        return ctx.reply(
          'Управление профилем:',
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

    await ctx.reply(
      `Привет, ${name}! 👋\n\n` +
      `Это бот интерактивной карты и расписания РГРТУ:\n` +
      `• 🗺 интерактивная карта Главного корпуса\n` +
      `• 📅 расписание всех групп и преподавателей\n` +
      `• 🟢 свободные аудитории прямо сейчас\n` +
      `• 🔔 уведомления за 15 минут до начала твоих пар\n` +
      `• 🔑 код для быстрого входа на сайте: ${code}\n\n` +
      `Кнопки «🗺 Карта» и «📅 Расписание» закреплены внизу чата.`,
      mainReplyKeyboard
    );

    return ctx.reply(
      'Выбери действие ниже или напиши любой вопрос ИИ\'шке прямо в чат:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Получить код входа для сайта', 'login_code')],
        [Markup.button.callback('👤 Моё расписание и уведомления', 'my_profile')],
        [Markup.button.callback('🟢 Свободные аудитории', 'free_now')]
      ])
    );
  });

  bot.command('login', (ctx) => {
    const code = userStore.createAuthCodeForTelegramUser({
      telegramId: ctx.from.id,
      firstName: ctx.from.first_name || '',
      username: ctx.from.username || ''
    });
    return ctx.reply(
      `🔑 Твой одноразовый код для входа на сайте:\n\n` +
      `${code}\n\n` +
      `Открой меню профиля (👤) в правом верхнем углу на сайте и введи этот код (действует 10 минут).`,
      mainReplyKeyboard
    );
  });

  bot.action('login_code', async (ctx) => {
    await ctx.answerCbQuery();
    const code = userStore.createAuthCodeForTelegramUser({
      telegramId: ctx.from.id,
      firstName: ctx.from.first_name || '',
      username: ctx.from.username || ''
    });
    return ctx.reply(
      `🔑 Одноразовый код для входа на сайте: ${code}\n` +
      `Введи его в меню профиля (👤) на сайте Карты РГРТУ.`
    );
  });

  async function replyWithProfile(ctx) {
    const u = userStore.getUserByTelegramId(ctx.from.id);
    const roleLabel = u && u.role === 'lecturer' ? 'Преподаватель' : 'Студент';
    const targetLabel = u && u.targetName ? u.targetName : 'не выбрано (укажи на сайте в меню 👤)';
    const notifLabel = u && u.notificationsEnabled ? 'Включены ✅' : 'Выключены 🔕';
    const toggleText = u && u.notificationsEnabled ? '🔕 Выключить уведомления' : '🔔 Включить уведомления о парах';

    return ctx.reply(
      `👤 Твой профиль Карты РГРТУ:\n\n` +
      `• Статус: ${roleLabel}\n` +
      `• Целевое расписание: ${targetLabel}\n` +
      `• Уведомления за 15 мин до пары: ${notifLabel}\n\n` +
      `Ты можешь выбрать свою группу или ФИО преподавателя на сайте в меню профиля (👤).`,
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

  bot.help((ctx) => ctx.reply(
    'Доступные команды:\n' +
    '/start — главное меню\n' +
    '/login — получить 6-значный код для входа на сайте\n' +
    '/my — профиль и настройки уведомлений о парах\n' +
    '/map — открыть карту\n' +
    '/schedule — открыть расписание\n' +
    '/free — свободные аудитории сейчас\n' +
    '/help — список команд',
    mainReplyKeyboard
  ));

  bot.command('map', (ctx) => {
    return ctx.reply('Открой карту по кнопке «🗺 Карта» внизу экрана:', mainReplyKeyboard);
  });

  bot.command('schedule', (ctx) => {
    return ctx.reply('Открой расписание по кнопке «📅 Расписание» внизу экрана:', mainReplyKeyboard);
  });

  bot.command('free', async (ctx) => {
    const loading = await ctx.reply('⏳ Загружаю список…');
    try {
      const res = await fetch(`${API_BASE}/api/free-now`);
      if (res.status === 503) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, loading.message_id, null,
          '⏳ Кэш ещё прогревается. Попробуй через 1–2 минуты.'
        );
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
        await ctx.telegram.editMessageText(
          ctx.chat.id, loading.message_id, null,
          '😔 Свободных аудиторий сейчас нет.\nОткрой карту по кнопке «🗺 Карта» внизу экрана, чтобы увидеть занятые.'
        );
        return;
      }

      const lines = mainRooms.map(r => `• ${r.name} — ${r.untilText}`);
      const header = `🟢 Свободно в Главном корпусе: ${totalC}\n\n`;
      const footer = totalC > 20 ? '\n\n…и другие. Открой карту по кнопке «🗺 Карта» внизу экрана, чтобы увидеть все.' : '';

      await ctx.telegram.editMessageText(
        ctx.chat.id, loading.message_id, null,
        header + lines.join('\n') + footer
      );
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
    return ctx.reply('Используй /free', mainReplyKeyboard);
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

async function sendPngToTelegramUser(telegramId, pngBuffer, filename = 'schedule.png', caption = '') {
  if (!bot || !telegramId || !pngBuffer) return false;
  try {
    await bot.telegram.sendDocument(
      telegramId,
      { source: pngBuffer, filename },
      caption ? { caption } : undefined
    );
    return true;
  } catch (e) {
    try {
      await bot.telegram.sendPhoto(
        telegramId,
        { source: pngBuffer, filename },
        caption ? { caption } : undefined
      );
      return true;
    } catch (e2) {
      console.warn('[bot/sendPng]', e2.message);
      return false;
    }
  }
}

async function checkUpcomingLessonNotifications() {
  if (!bot) return;
  try {
    const res = await fetch(`${API_BASE}/api/internal/upcoming-notifications`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data.notifications) || !data.notifications.length) return;

    for (const item of data.notifications) {
      if (!item.telegramId || !item.lesson) continue;
      const l = item.lesson;
      const extraInfo = item.role === 'lecturer'
        ? (l.group ? `\n👥 Группа: ${l.group}` : '')
        : (l.lecturer ? `\n👤 Преподаватель: ${l.lecturer}` : '');
      const floorText = l.floor != null ? `${l.floor} этаж, ` : '';
      const text =
        `🔔 Через ${item.minutesLeft} мин начнётся пара!\n\n` +
        `📚 ${l.type ? `[${l.type}] ` : ''}${l.subject}\n` +
        `📍 ${l.roomShort ? `Ауд. ${l.roomShort} (${floorText}Главный корпус)` : 'Главный корпус'}\n` +
        `🕒 Время: ${l.time}` +
        extraInfo;
      try {
        await bot.telegram.sendMessage(item.telegramId, text, mainReplyKeyboard);
      } catch (sendErr) {
        console.warn(`[bot/notify] Не удалось отправить уведомление ${item.telegramId}:`, sendErr.message);
      }
    }
  } catch (e) {}
}

let botLaunched = false;
let notifyTimer = null;

function startBot(retryCount = 0) {
  if (!bot || botLaunched) return;
  botLaunched = true;

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
    setTimeout(checkUpcomingLessonNotifications, 5000);
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

module.exports = { bot, startBot, getBotUsername, checkUpcomingLessonNotifications, sendPngToTelegramUser };