const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const rawWebAppUrl = (process.env.WEBAPP_URL || '').trim();
const WEBAPP_URL = (!rawWebAppUrl || rawWebAppUrl.includes('ngrok'))
  ? 'https://radikmap.ai.studio/'
  : rawWebAppUrl;
const API_BASE = `http://localhost:${process.env.PORT || 3000}`;

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
  console.log('[bot] update:', ctx.updateType, ctx.message?.text || ctx.callbackQuery?.data || '');
  return next();
});

bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  console.log('[bot] /start от', ctx.from.id, name);
  return ctx.reply(
    `Привет, ${name}! 👋\n\n` +
    `Это бот карты РГРТУ. Здесь можно:\n` +
    `• 🗺 открыть интерактивную карту корпусов\n` +
    `• 🟢 узнать свободные аудитории прямо сейчас\n` +
    `• 📅 посмотреть расписание конкретной аудитории\n\n` +
    `Выбери действие ниже:`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('🗺 Открыть карту', WEBAPP_URL)],
      [Markup.button.callback('🟢 Свободные аудитории', 'free_now')],
      [Markup.button.callback('📅 Расписание аудитории', 'schedule_help')]
    ])
  );
});

bot.help((ctx) => ctx.reply(
  'Доступные команды:\n' +
  '/start — главное меню\n' +
  '/map — открыть карту\n' +
  '/free — свободные аудитории сейчас\n' +
  '/schedule — расписание аудитории\n'
));

bot.command('map', (ctx) => {
  console.log('[bot] /map');
  return ctx.reply(
    'Открываю карту:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('🗺 Открыть карту', WEBAPP_URL)]
    ])
  );
});

bot.command('free', async (ctx) => {
  console.log('[bot] /free');
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
        '😔 Свободных аудиторий сейчас нет.\nОткрой карту, чтобы увидеть занятые.',
        Markup.inlineKeyboard([
          [Markup.button.webApp('🗺 Открыть карту', WEBAPP_URL)]
        ])
      );
      return;
    }

    const lines = mainRooms.map(r => `• ${r.name} — ${r.untilText}`);
    const header = `🟢 Свободно в Главном корпусе: ${totalC}\n\n`;
    const footer = totalC > 20 ? '\n\n…и другие. Открой карту, чтобы увидеть все.' : '';

    await ctx.telegram.editMessageText(
      ctx.chat.id, loading.message_id, null,
      header + lines.join('\n') + footer,
      Markup.inlineKeyboard([
        [Markup.button.webApp('🗺 Показать на карте', WEBAPP_URL)]
      ])
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
  return ctx.reply('Используй /free');
});

bot.action('schedule_help', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(
    'Чтобы посмотреть расписание:\n\n' +
    '1. Открой карту\n' +
    '2. Нажми на аудиторию\n' +
    '3. В правой панели появится расписание на неделю\n\n' +
    'Или отправь команду /schedule с номером аудитории: /schedule 227'
  );
});

bot.command('schedule', async (ctx) => {
  const text = ctx.message.text.replace('/schedule', '').trim();
  if (!text) {
    return ctx.reply('Укажи номер аудитории: /schedule 227');
  }
  return ctx.reply(
    `Открываю карту и ищу аудиторию «${text}»:`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('🗺 Открыть', `${WEBAPP_URL}?search=${encodeURIComponent(text)}`)]
    ])
  );
});

bot.catch((err, ctx) => {
  console.error('[bot] error для', ctx?.updateType, err);
});
}

let botLaunched = false;

function startBot(retryCount = 0) {
  if (!bot || botLaunched) return;
  botLaunched = true;
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

module.exports = { bot, startBot };