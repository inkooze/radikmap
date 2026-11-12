const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const FIREBASE_CONFIG_FILE = path.join(__dirname, '..', 'firebase-applet-config.json');
const APP_STORAGE_KEY = 'radikmap-v1-store';

/**
 * Полный каталог шаблонов сообщений Telegram-бота с описанием переменных и дефолтным Markdown-текстом.
 */
const DEFAULT_BOT_TEMPLATES = {
  start_welcome: {
    id: 'start_welcome',
    title: 'Главное приветствие (/start)',
    category: 'Авторизация и старт',
    trigger: 'Команда /start',
    description: 'Первое приветственное сообщение при запуске бота вместе с 6-значным кодом быстрого входа.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'username', label: 'Telegram @username', sample: 'alex_rsreu' },
      { key: 'code', label: '6-значный код входа', sample: '482910' },
      { key: 'webappUrl', label: 'Ссылка на карту', sample: 'https://radikmap.ai.studio/' },
      { key: 'scheduleUrl', label: 'Ссылка на расписание', sample: 'https://radikmap.ai.studio/?view=schedule' }
    ],
    defaultText:
      'Привет, *{{name}}*! 👋\n\n' +
      'Это бот интерактивной карты и расписания РГРТУ:\n' +
      '• 🗺 интерактивная карта Главного корпуса\n' +
      '• 📅 расписание всех групп и преподавателей\n' +
      '• 🟢 свободные аудитории прямо сейчас\n' +
      '• 🔔 уведомления за 15 минут до начала твоих пар\n' +
      '• 🔑 код для быстрого входа на сайте: `{{code}}`\n\n' +
      'Кнопки *«🗺 Карта»* и *«📅 Расписание»* закреплены внизу чата.',
    defaultButtons: [
      { text: '🗺 Карта', type: 'webapp', value: '{{webappUrl}}' },
      { text: '📅 Расписание', type: 'webapp', value: '{{scheduleUrl}}' },
      { text: '👤 Мой профиль', type: 'reply', value: '👤 Мой профиль' }
    ]
  },
  start_menu_prompt: {
    id: 'start_menu_prompt',
    title: 'Меню действий под приветствием (/start)',
    category: 'Авторизация и старт',
    trigger: 'Второе сообщение при /start (с inline-кнопками)',
    description: 'Текст над inline-кнопками «Получить код входа», «Моё расписание» и «Свободные аудитории».',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' }
    ],
    defaultText: 'Выбери действие ниже или напиши любой вопрос *ИИ\'шке* прямо в чат:',
    defaultButtons: [
      { text: '🔑 Получить код входа для сайта', type: 'callback', value: 'get_login_code' },
      { text: '👤 Моё расписание и уведомления', type: 'callback', value: 'my_profile' },
      { text: '🟢 Свободные аудитории', type: 'callback', value: 'free_now' }
    ]
  },
  start_webauth_success: {
    id: 'start_webauth_success',
    title: 'Подтверждение входа на сайте (/start login_...)',
    category: 'Авторизация и старт',
    trigger: 'Переход по кнопке «Войти через Telegram» с сайта',
    description: 'Отправляется после успешного подтверждения браузерной сессии входа.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'username', label: 'Telegram @username', sample: 'alex_rsreu' },
      { key: 'webappUrl', label: 'Ссылка на карту', sample: 'https://radikmap.ai.studio/' },
      { key: 'scheduleUrl', label: 'Ссылка на расписание', sample: 'https://radikmap.ai.studio/?view=schedule' }
    ],
    defaultText:
      '✅ Привет, *{{name}}*! Вход на сайте Карты РГРТУ подтверждён.\n\n' +
      'Можешь вернуться в браузер — твой профиль и настройки расписания уже подключены автоматически.',
    defaultButtons: [
      { text: '🗺 Карта', type: 'webapp', value: '{{webappUrl}}' },
      { text: '📅 Расписание', type: 'webapp', value: '{{scheduleUrl}}' },
      { text: '👤 Мой профиль', type: 'reply', value: '👤 Мой профиль' }
    ]
  },
  start_webauth_manage_prompt: {
    id: 'start_webauth_manage_prompt',
    title: 'Подсказка профиля после входа',
    category: 'Авторизация и старт',
    trigger: 'Второе сообщение после авто-входа',
    description: 'Короткий заголовок над inline-кнопкой «👤 Мой профиль и уведомления».',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' }
    ],
    defaultText: 'Управление профилем:',
    defaultButtons: [
      { text: '👤 Мой профиль и уведомления', type: 'callback', value: 'my_profile' }
    ]
  },
  login_command: {
    id: 'login_command',
    title: 'Код входа по команде /login',
    category: 'Авторизация и старт',
    trigger: 'Команда /login',
    description: 'Отправляет пользователю новый 6-значный одноразовый код для входа на сайте.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'code', label: '6-значный код входа', sample: '482910' },
      { key: 'webappUrl', label: 'Ссылка на карту', sample: 'https://radikmap.ai.studio/' }
    ],
    defaultText:
      '🔑 *Твой одноразовый код для входа на сайте:*\n\n' +
      '`{{code}}`\n\n' +
      'Открой меню профиля (👤) в правом верхнем углу на сайте и введи этот код _(действует 10 минут)_.',
    defaultButtons: [
      { text: '🗺 Открыть сайт Карты РГРТУ', type: 'webapp', value: '{{webappUrl}}' }
    ]
  },
  login_callback: {
    id: 'login_callback',
    title: 'Код входа по inline-кнопке',
    category: 'Авторизация и старт',
    trigger: 'Кнопка «🔑 Получить код входа для сайта»',
    description: 'Ответ бота при нажатии inline-кнопки получения кода входа.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'code', label: '6-значный код входа', sample: '482910' }
    ],
    defaultText:
      '🔑 Одноразовый код для входа на сайте: `{{code}}`\n' +
      'Введи его в меню профиля (👤) на сайте Карты РГРТУ.',
    defaultButtons: []
  },
  profile_card: {
    id: 'profile_card',
    title: 'Карточка профиля и уведомлений (/my)',
    category: 'Профиль и уведомления',
    trigger: 'Команда /my и кнопка «Мой профиль»',
    description: 'Показывает статус пользователя (Студент/Преподаватель), его группу или ФИО и состояние уведомлений.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'username', label: 'Telegram @username', sample: 'alex_rsreu' },
      { key: 'role', label: 'Роль (Студент / Преподаватель)', sample: 'Студент' },
      { key: 'target', label: 'Выбранная группа или ФИО', sample: '546' },
      { key: 'notifStatus', label: 'Статус уведомлений', sample: 'Включены ✅' },
      { key: 'webappUrl', label: 'Ссылка на карту', sample: 'https://radikmap.ai.studio/' }
    ],
    defaultText:
      '👤 *Твой профиль Карты РГРТУ:*\n\n' +
      '• Статус: *{{role}}*\n' +
      '• Целевое расписание: *{{target}}*\n' +
      '• Уведомления за 15 мин до пары: *{{notifStatus}}*\n\n' +
      'Ты можешь выбрать свою группу или ФИО преподавателя на сайте в меню профиля (👤).',
    defaultButtons: [
      { text: '🔔 Уведомления о парах (Вкл/Выкл)', type: 'callback', value: 'toggle_notif' },
      { text: '📅 Настроить расписание на сайте', type: 'webapp', value: '{{webappUrl}}' }
    ]
  },
  lesson_reminder: {
    id: 'lesson_reminder',
    title: 'Уведомление за 15 минут до начала пары',
    category: 'Профиль и уведомления',
    trigger: 'Автоматическое напоминание за 15 мин до пары и тест из админки',
    description: 'Шаблон уведомления о предстоящем занятии. Если пара разделена на подгруппы или ведётся несколькими преподавателями, переменная {{lecturer}} автоматически объединяет всех преподавателей.',
    variables: [
      { key: 'minutesLeft', label: 'Точное число минут до начала пары в момент отправки', sample: '15' },
      { key: 'typeTagEmoji', label: 'Эмодзи типа пары (📖 / ✒️ / 🔬 / 💬 / ✅ / 🎓)', sample: '🔬' },
      { key: 'typeTag', label: 'Тип занятия без скобок (Лек. / Упр. / Лаб. / Конс. / Зач. / Экз.)', sample: 'Лаб.' },
      { key: 'type', label: 'Тип занятия (синоним typeTag)', sample: 'Лаб.' },
      { key: 'subject', label: 'Название дисциплины', sample: 'Базы данных' },
      { key: 'time', label: 'Время начала и конца пары', sample: '11:40–13:15' },
      { key: 'breakTime', label: 'Время 5-минутного перерыва внутри пары', sample: '12:25–12:30' },
      { key: 'room', label: 'Номер или название аудитории (отдельно)', sample: '210' },
      { key: 'building', label: 'Название корпуса (отдельно)', sample: 'Главный корпус' },
      { key: 'floor', label: 'Номер этажа (отдельно)', sample: '2' },
      { key: 'lecturer', label: 'ФИО преподавателя или нескольких преподавателей по подгруппам', sample: 'асс. Федосова Е.Б. (п.г. 1), доц. Гринченко Н.Н. (п.г. 2)' },
      { key: 'group', label: 'Номер учебной группы (чистый текст без подписи)', sample: '546' },
      { key: 'subgroup', label: 'Подгруппа (чистый текст без подписи)', sample: 'п.г. 1, п.г. 2' },
      { key: 'dayName', label: 'День недели занятия (чистый текст)', sample: 'Среда' },
      { key: 'dayNote', label: 'Пометка дня (чистый текст без скобок)', sample: 'Среда' },
      { key: 'locationLine', label: 'Составная локация (аудитория, корпус, этаж)', sample: '210, Главный корпус, 2 этаж' },
      { key: 'extraInfo', label: 'Составная строка (преподаватель, группа, подгруппа)', sample: 'асс. Федосова Е.Б. (п.г. 1), доц. Гринченко Н.Н. (п.г. 2), 546' },
      { key: 'name', label: 'Имя получателя', sample: 'Алексей' },
      { key: 'target', label: 'Целевая группа или ФИО профиля', sample: '546' },
      { key: 'roomUrl', label: 'Ссылка на аудиторию на карте', sample: 'https://radikmap.ai.studio/?room=c_f2_210' },
      { key: 'scheduleUrl', label: 'Ссылка на расписание', sample: 'https://radikmap.ai.studio/?view=schedule' }
    ],
    defaultText:
      '🔔 *Через {{minutesLeft}} мин начнётся пара!*\n\n' +
      '{{typeTagEmoji}} *{{typeTag}} {{subject}}*\n' +
      '📍 Аудитория: {{room}} ({{building}}, {{floor}} этаж)\n' +
      '🕒 Время: `{{time}}` (перерыв `{{breakTime}}`)\n' +
      '👤 Преподаватель: {{lecturer}}\n' +
      '👥 Группа: {{group}} {{subgroup}}',
    defaultButtons: [
      { text: '🗺 Показать ауд. {{room}} на карте', type: 'webapp', value: '{{roomUrl}}' },
      { text: '📅 Открыть расписание', type: 'webapp', value: '{{scheduleUrl}}' }
    ]
  },
  next_day_reminder: {
    id: 'next_day_reminder',
    title: 'Уведомление на завтра (за день до занятий)',
    category: 'Профиль и уведомления',
    trigger: 'Автоматическое вечернее уведомление за день до пар (после 18:00 МСК) и тест из админки',
    description: 'Отправляется вечером накануне учебного дня со сводкой всех занятий следующего дня.',
    variables: [
      { key: 'name', label: 'Имя получателя', sample: 'Алексей' },
      { key: 'target', label: 'Целевая группа или ФИО профиля', sample: '546' },
      { key: 'dayName', label: 'День недели завтра', sample: 'Четверг' },
      { key: 'date', label: 'Дата завтрашнего дня', sample: '13 ноября' },
      { key: 'lessonsCount', label: 'Количество пар завтра', sample: '3' },
      { key: 'firstLessonTime', label: 'Время начала первой пары', sample: '08:10' },
      {
        key: 'lessonsList',
        label: 'Полный список пар на завтра',
        sample:
          '1️⃣ `08:10–09:45` — ✒️ *Упр. Иностранный язык*\n' +
          '   📍 Ауд. 322 (Главный корпус, 3 этаж) • 👤 ст. преп. Конькова Д.П.\n' +
          '2️⃣ `09:55–11:30` — 📖 *Лек. Базы данных*\n' +
          '   📍 Ауд. 358 (Главный корпус, 3 этаж) • 👤 доц. Гринченко Н.Н.\n' +
          '3️⃣ `11:40–13:15` — 🔬 *Лаб. Базы данных*\n' +
          '   📍 Ауд. 210 (Главный корпус, 2 этаж) • 👤 асс. Федосова Е.Б. (п.г. 1), доц. Гринченко Н.Н. (п.г. 2)'
      },
      { key: 'scheduleUrl', label: 'Ссылка на расписание', sample: 'https://radikmap.ai.studio/?view=schedule' },
      { key: 'webappUrl', label: 'Ссылка на карту', sample: 'https://radikmap.ai.studio/' }
    ],
    defaultText:
      '🌙 *Расписание на завтра ({{dayName}}, {{date}})*\n' +
      '👥 Профиль: *{{target}}* • Всего пар: *{{lessonsCount}}* (к `{{firstLessonTime}}`)\n\n' +
      '{{lessonsList}}',
    defaultButtons: [
      { text: '📅 Открыть расписание на завтра', type: 'webapp', value: '{{scheduleUrl}}' },
      { text: '🗺 Открыть карту корпусов', type: 'webapp', value: '{{webappUrl}}' }
    ]
  },
  help_command: {
    id: 'help_command',
    title: 'Справка по командам (/help)',
    category: 'Команды и навигация',
    trigger: 'Команда /help',
    description: 'Список доступных команд Telegram-бота.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'webappUrl', label: 'Ссылка на карту', sample: 'https://radikmap.ai.studio/' }
    ],
    defaultText:
      '*Доступные команды:*\n' +
      '/start — главное меню\n' +
      '/login — получить 6-значный код для входа на сайте\n' +
      '/my — профиль и настройки уведомлений о парах\n' +
      '/map — открыть карту\n' +
      '/schedule — открыть расписание\n' +
      '/free — свободные аудитории сейчас\n' +
      '/help — список команд',
    defaultButtons: []
  },
  map_command: {
    id: 'map_command',
    title: 'Ответ на команду /map',
    category: 'Команды и навигация',
    trigger: 'Команда /map',
    description: 'Подсказка для открытия интерактивной карты.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'webappUrl', label: 'Ссылка на карту', sample: 'https://radikmap.ai.studio/' }
    ],
    defaultText: 'Открой карту по кнопке *«🗺 Карта»* внизу экрана:',
    defaultButtons: [
      { text: '🗺 Открыть карту', type: 'webapp', value: '{{webappUrl}}' }
    ]
  },
  schedule_command: {
    id: 'schedule_command',
    title: 'Ответ на команду /schedule',
    category: 'Команды и навигация',
    trigger: 'Команда /schedule',
    description: 'Подсказка для открытия расписания.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' },
      { key: 'scheduleUrl', label: 'Ссылка на расписание', sample: 'https://radikmap.ai.studio/?view=schedule' }
    ],
    defaultText: 'Открой расписание по кнопке *«📅 Расписание»* внизу экрана:',
    defaultButtons: [
      { text: '📅 Открыть расписание', type: 'webapp', value: '{{scheduleUrl}}' }
    ]
  },
  free_loading: {
    id: 'free_loading',
    title: 'Индикатор загрузки (/free)',
    category: 'Свободные аудитории',
    trigger: 'Команда /free (старт запроса)',
    description: 'Короткое сообщение пока бот запрашивает список свободных кабинетов.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' }
    ],
    defaultText: '⏳ Загружаю список…',
    defaultButtons: []
  },
  free_warming: {
    id: 'free_warming',
    title: 'Кэш расписания прогревается (/free)',
    category: 'Свободные аудитории',
    trigger: 'Команда /free (статус 503)',
    description: 'Отправляется, если сервер ещё загружает расписание с сайта РГРТУ.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' }
    ],
    defaultText: '⏳ Кэш ещё прогревается. Попробуй через 1–2 минуты.',
    defaultButtons: []
  },
  free_empty: {
    id: 'free_empty',
    title: 'Свободных аудиторий нет (/free)',
    category: 'Свободные аудитории',
    trigger: 'Команда /free (пустой список)',
    description: 'Показывается, если все аудитории Главного корпуса сейчас заняты.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' }
    ],
    defaultText:
      '😔 *Свободных аудиторий сейчас нет.*\n' +
      'Открой карту по кнопке «🗺 Карта» внизу экрана, чтобы увидеть занятые.',
    defaultButtons: []
  },
  free_list: {
    id: 'free_list',
    title: 'Список свободных аудиторий (/free)',
    category: 'Свободные аудитории',
    trigger: 'Команда /free (список найден)',
    description: 'Выводит количество и перечень свободных аудиторий Главного корпуса.',
    variables: [
      { key: 'totalCount', label: 'Всего свободных аудиторий', sample: '14' },
      { key: 'roomsList', label: 'Список аудиторий с временем (без лишних переносов)', sample: '• 100 — до конца дня\n• 214 — до 13:45\n• 337 — до 15:30' },
      { key: 'moreFooter', label: 'Приписка если аудиторий больше 20 (без ведущего \\n)', sample: '…и другие. Открой карту по кнопке «🗺 Карта» внизу экрана, чтобы увидеть все.' }
    ],
    defaultText:
      '🟢 *Свободно в Главном корпусе: {{totalCount}}*\n\n' +
      '{{roomsList}}\n\n{{moreFooter}}',
    defaultButtons: []
  },
  free_callback_hint: {
    id: 'free_callback_hint',
    title: 'Подсказка по кнопке «Свободные аудитории»',
    category: 'Свободные аудитории',
    trigger: 'Кнопка «🟢 Свободные аудитории»',
    description: 'Ответ при нажатии inline-кнопки под стартовым меню.',
    variables: [
      { key: 'name', label: 'Имя пользователя', sample: 'Алексей' }
    ],
    defaultText: 'Используй /free',
    defaultButtons: []
  }
};

function escapeTelegramHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SUBSCRIPT_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
};

const SUPERSCRIPT_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ'
};

function toUnicodeSubscript(text) {
  return String(text || '').split('').map(ch => SUBSCRIPT_MAP[ch] || SUBSCRIPT_MAP[ch.toLowerCase()] || ch).join('');
}

function toUnicodeSuperscript(text) {
  return String(text || '').split('').map(ch => SUPERSCRIPT_MAP[ch] || SUPERSCRIPT_MAP[ch.toLowerCase()] || ch).join('');
}

function cleanInterpolatedLines(str) {
  return String(str || '')
    .split('\n')
    .map(line => line
      .replace(/\(\s*перерыв\s*(?:<code><\/code>|``)?\s*\)/gi, '')
      .replace(/\s*\(\s*к\s*(?:<code><\/code>|``)?\s*\)/gi, '')
      .replace(/\(\s*,\s*(\d+\s*этаж)\)/gi, '($1)')
      .replace(/\(\s*([^,()]+),\s*этаж\)/gi, '($1)')
      .replace(/\(\s*,?\s*этаж\s*\)/gi, '')
      .replace(/[ \t]+$/g, '')
    )
    .filter(line => {
      const plain = line.replace(/<[^>]+>/g, '').trim();
      if (/^(?:👤|👥|📍|🕒)\s*[^:]+:\s*$/.test(plain)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatVariableTelegramMarkdown(escapedVal) {
  let v = String(escapedVal || '');
  if (!v) return '';
  const codes = [];
  v = v.replace(/`([^`\n]+)`/g, (_, c) => {
    const idx = codes.length;
    codes.push(`<code>${c}</code>`);
    return `ZXVVARCODE${idx}VXZ`;
  });
  v = v.replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>');
  v = v.replace(/__([^\n_]+)__/g, '<u>$1</u>');
  v = v.replace(/~~([^\n~]+)~~/g, '<s>$1</s>');
  v = v.replace(/\|\|([^\n|]+)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');
  v = v.replace(/(^|[\s(>«"'—–-])\*([^\n*]+)\*(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<b>$2</b>');
  v = v.replace(/(^|[\s(>«"'—–-])_([^\n_]+)_(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<i>$2</i>');
  v = v.replace(/ZXVVARCODE(\d+)VXZ/g, (_, idx) => codes[Number(idx)] || '');
  return v;
}

/**
 * Конвертирует расширенный Telegram Markdown (Заголовки H1–H6, цитаты >, выносные/сворачиваемые цитаты >> / **>,
 * жирный **текст** / *текст*, курсив _текст_, подчёркнутый __текст__, зачёркнутый ~~текст~~,
 * скрытый/спойлер ||текст||, выделенный ==текст==, подстрочный ~{текст}, надстрочный ^{текст},
 * мелкий шрифт <small>...</small>, разделитель ---, списки, чек-листы, сворачиваемые блоки и ссылки)
 * в безопасный Telegram HTML (parse_mode: 'HTML').
 */
function renderTelegramMarkdownToHtml(markdownText, variables = {}) {
  const raw = String(markdownText == null ? '' : markdownText);
  if (!raw) return '';

  const richMarkdownKeys = new Set(['lessonsList', 'roomsList']);

  // 1. Заменяем переменные {{key}} на уникальные токены до парсинга Markdown
  const varTokens = [];
  const withVarTokens = raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const val = Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key] == null ? '' : variables[key])
      : '';
    const idx = varTokens.length;
    const escaped = escapeTelegramHtml(val);
    varTokens.push(richMarkdownKeys.has(key) ? formatVariableTelegramMarkdown(escaped) : escaped);
    return `ZXVVARTOKEN${idx}VXZ`;
  });

  // 2. Экранируем HTML-символы в самом шаблоне
  let text = escapeTelegramHtml(withVarTokens);

  // 3. Защищаем блоки кода ```...``` и инлайн-код `...`
  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`);
    return `ZXVCODEBLOCK${idx}VXZ`;
  });

  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${code}</code>`);
    return `ZXVINLINECODE${idx}VXZ`;
  });

  // 4. Сворачиваемые блоки :::collapse ... ::: или [collapse]...[/collapse]
  text = text.replace(/:::collapse\s*\n?([\s\S]*?)\n?:::/gi, (_, inner) => {
    return `<blockquote expandable>${inner.trim()}</blockquote>`;
  });

  // 5. Ссылки [текст](https://...)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a href="${url}">${label}</a>`;
  });

  // 6. Построчная обработка: Заголовки H1-H6, Разделители, Чек-листы, Цитаты и Выносные/Сворачиваемые цитаты
  const lines = text.split('\n');
  const processedLines = [];
  let quoteBuffer = [];
  let expandableQuoteBuffer = [];

  const flushQuotes = () => {
    if (quoteBuffer.length > 0) {
      processedLines.push(`<blockquote>${quoteBuffer.join('\n')}</blockquote>`);
      quoteBuffer = [];
    }
    if (expandableQuoteBuffer.length > 0) {
      processedLines.push(`<blockquote expandable>${expandableQuoteBuffer.join('\n')}</blockquote>`);
      expandableQuoteBuffer = [];
    }
  };

  for (let line of lines) {
    // Выносная / сворачиваемая цитата (**> или >>)
    if (/^(?:\*\*&gt;|&gt;&gt;)\s?(.*)$/.test(line)) {
      if (quoteBuffer.length > 0) flushQuotes();
      expandableQuoteBuffer.push(line.replace(/^(?:\*\*&gt;|&gt;&gt;)\s?/, ''));
      continue;
    }
    // Обычная цитата (> )
    if (/^&gt;\s?(.*)$/.test(line)) {
      if (expandableQuoteBuffer.length > 0) flushQuotes();
      quoteBuffer.push(line.replace(/^&gt;\s?/, ''));
      continue;
    }

    flushQuotes();

    // Разделитель (--- или *** или ___)
    if (/^\s*(?:---+|───+|\*\*\*+)\s*$/.test(line)) {
      processedLines.push('──────────────────');
      continue;
    }

    // Заголовки H1..H6 (# .. ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      if (level <= 2) {
        processedLines.push(`<b>${content.toUpperCase()}</b>`);
      } else if (level <= 4) {
        processedLines.push(`<b>${content}</b>`);
      } else {
        processedLines.push(`<b><i>${content}</i></b>`);
      }
      continue;
    }

    // Контрольный список (чек-лист): - [x] или - [ ] или [x] / [ ]
    line = line
      .replace(/^(\s*(?:[-*•]\s+)?)\[\s*[xXхХ✓✔]\s*\]\s+/, '$1☑️ ')
      .replace(/^(\s*(?:[-*•]\s+)?)\[\s*\]\s+/, '$1⬜ ');

    // Маркированный список (- пункт -> • пункт)
    line = line.replace(/^(\s*)-\s+/, '$1• ');

    processedLines.push(line);
  }
  flushQuotes();
  text = processedLines.join('\n');

  // 7. Надстрочный ^{текст} и подстрочный ~{текст}
  text = text.replace(/\^\{([^}\n]+)\}/g, (_, inner) => toUnicodeSuperscript(inner));
  text = text.replace(/~\{([^}\n]+)\}/g, (_, inner) => toUnicodeSubscript(inner));

  // 8. Мелкий шрифт ~small~ или [--текст--]
  text = text.replace(/\[--([^\n\]]+)--\]/g, '<i>$1</i>');

  // 9. Выделенный текст ==текст== (в Telegram HTML рендерится плашкой <code>)
  text = text.replace(/==([^\n=]+)==/g, '<code>$1</code>');

  // 10. Спойлер ||текст||
  text = text.replace(/\|\|([^\n|]+)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');

  // 11. Зачёркнутый ~~текст~~
  text = text.replace(/~~([^\n~]+)~~/g, '<s>$1</s>');

  // 12. Жирный **текст** и подчёркнутый __текст__
  text = text.replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^\n_]+)__/g, '<u>$1</u>');

  // 13. Одинарный *жирный* и _курсив_
  text = text.replace(/(^|[\s(>«"'—–-])\*([^\n*]+)\*(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<b>$2</b>');
  text = text.replace(/(^|[\s(>«"'—–-])_([^\n_]+)_(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<i>$2</i>');

  // 14. Возвращаем инлайн-код, блоки кода и значения переменных
  text = text.replace(/ZXVINLINECODE(\d+)VXZ/g, (_, idx) => inlineCodes[Number(idx)] || '');
  text = text.replace(/ZXVCODEBLOCK(\d+)VXZ/g, (_, idx) => codeBlocks[Number(idx)] || '');
  text = text.replace(/ZXVVARTOKEN(\d+)VXZ/g, (_, idx) => varTokens[Number(idx)] || '');

  return cleanInterpolatedLines(text);
}

/**
 * Создаёт чистый plain-text вариант сообщения (для fallback, если Telegram отклонит HTML).
 */
function renderTelegramPlainText(markdownText, variables = {}) {
  const raw = String(markdownText == null ? '' : markdownText);
  if (!raw) return '';
  const interpolated = raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key] == null ? '' : variables[key])
      : '';
  });
  const plain = interpolated
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/:::collapse\s*\n?([\s\S]*?)\n?:::/gi, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/^\s*(?:---+|───+|\*\*\*+)\s*$/gm, '──────────────────')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(\s*(?:[-*•]\s+)?)\[\s*[xXхХ✓✔]\s*\]\s+/gm, '$1☑️ ')
    .replace(/^(\s*(?:[-*•]\s+)?)\[\s*\]\s+/gm, '$1⬜ ')
    .replace(/\^\{([^}\n]+)\}/g, (_, inner) => toUnicodeSuperscript(inner))
    .replace(/~\{([^}\n]+)\}/g, (_, inner) => toUnicodeSubscript(inner))
    .replace(/\[--([^\n\]]+)--\]/g, '$1')
    .replace(/==([^\n=]+)==/g, '$1')
    .replace(/\|\|([^\n|]+)\|\|/g, '$1')
    .replace(/~~([^\n~]+)~~/g, '$1')
    .replace(/\*\*([^\n*]+)\*\*/g, '$1')
    .replace(/__([^\n_]+)__/g, '$1')
    .replace(/(^|[\s(>«"'])\*([^\n*]+)\*(?=$|[\s).,!?:;»"'<])/gm, '$1$2')
    .replace(/(^|[\s(>«"'])_([^\n_]+)_(?=$|[\s).,!?:;»"'<])/gm, '$1$2')
    .replace(/^(?:\*\*>|>>|>)\s?/gm, '');
  return cleanInterpolatedLines(plain);
}

/**
 * Splits a raw group + lecturer string from rasp.rsreu.ru into normalized group codes and lecturer name.
 * Preserves Cyrillic suffixes in group names (e.g. "546М" vs "546", "441Маг") and subgroup tags.
 */
function splitGroupAndLecturer(groupStr, lecturerStr) {
  const combined = [groupStr, lecturerStr]
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .join(', ');
  if (!combined) return { group: '', groups: [], subgroup: '', lecturer: '' };

  const tokens = combined.split(',').map(t => t.trim()).filter(Boolean);
  const groupTokens = [];
  const lecturerTokens = [];
  let hitLecturer = false;

  const isGroupLike = (tok) => {
    if (/^(доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.|к\.т\.н\.|д\.т\.н\.|вакансия)/i.test(tok)) return false;
    if (/[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\./.test(tok)) return false;
    if (/^\d/.test(tok)) return true;
    if (/п\.?\s*г\.?/i.test(tok) || /подгр|сборная\s+группа|подготовительные\s+курсы/i.test(tok)) return true;
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

  let subgroup = '';
  const rawGroupJoined = groupTokens.join(', ');
  const subMatch = rawGroupJoined.match(/(?:п\.?\s*г\.?\s*(\d+)|(?:^|,\s*|\s+)([1-4])\s*п\.?\s*г\.?)/i);
  if (subMatch) {
    subgroup = `п.г. ${subMatch[1] || subMatch[2]}`;
  }

  // Извлекаем чистые номера групп с сохранением кириллических суффиксов (например "546М", "445")
  const cleanGroups = [];
  for (const gt of groupTokens) {
    const cleaned = gt
      .replace(/(?:^|[\s(])\d+\s*п\.?\s*г\.?(?=$|[\s),.])/gi, ' ')
      .replace(/(?:^|[\s(])п\.?\s*г\.?\s*\d+(?=$|[\s),.])/gi, ' ')
      .replace(/[()]/g, ' ')
      .trim();

    const matches = cleaned.match(/\d{2,5}[а-яёa-z]{0,4}/gi);
    if (matches) {
      matches.forEach(m => {
        const norm = m.trim().toUpperCase().replace(/Ё/g, 'Е');
        if (norm && !cleanGroups.includes(norm)) cleanGroups.push(norm);
      });
    }
  }

  const normalizedLecturer = lecturerTokens
    .join(', ')
    .replace(/^((?:доц\.|проф\.|ст\.\s*преп\.|преп\.|асс\.|зав\.\s*каф\.)\s+)ИнЯз\s+/i, '$1')
    .trim();

  return {
    group: rawGroupJoined,
    groups: cleanGroups,
    subgroup,
    lecturer: normalizedLecturer
  };
}

function loadFirebaseCloudConfig() {
  try {
    if (fs.existsSync(FIREBASE_CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_FILE, 'utf8'));
      if (cfg && cfg.projectId && cfg.apiKey) {
        return {
          projectId: String(cfg.projectId).trim(),
          databaseId: String(cfg.firestoreDatabaseId || '(default)').trim(),
          apiKey: String(cfg.apiKey).trim()
        };
      }
    }
  } catch (e) {}

  const envProject = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const envApiKey = String(process.env.FIREBASE_API_KEY || '').trim();
  if (envProject && envApiKey) {
    return {
      projectId: envProject,
      databaseId: String(process.env.FIREBASE_DATABASE_ID || '(default)').trim(),
      apiKey: envApiKey
    };
  }
  return null;
}

const DEFAULT_RSREU_ANCHORS = [
  { id: 'r_106a', label: 'Аудитория 106а (правое крыло, 1 эт.)', roomId: 'C_auditori_106a', building: 'C', floor: 1, lat: 54.614420, lon: 39.724645, lng: 39.724645, x: 2065, y: 599, svgX: 2065, svgY: 599 },
  { id: 'r_wardrobe_r', label: 'Вход и гардероб правого крыла', roomId: 'C_wardrobe_f1_r', building: 'C', floor: 1, lat: 54.614309, lon: 39.724223, lng: 39.724223, x: 1844, y: 683, svgX: 1844, svgY: 683 },
  { id: 'r_102m', label: 'Край правого крыла (лаб. 102м)', roomId: 'C_spec_iibmt_lab_102m', building: 'C', floor: 1, lat: 54.614678, lon: 39.724924, lng: 39.724924, x: 2371, y: 711, svgX: 2371, svgY: 711 },
  { id: 'c_main_entrance', label: 'Главный вход (центральный двор)', roomId: 'C_spec_ohrana', building: 'C', floor: 1, lat: 54.613595, lon: 39.723980, lng: 39.723980, x: 1229, y: 238, svgX: 1229, svgY: 238 },
  { id: 'l_wardrobe_l', label: 'Вход и гардероб левого крыла', roomId: 'C_wardrobe_f1_l', building: 'C', floor: 1, lat: 54.613639, lon: 39.722954, lng: 39.722954, x: 806, y: 657, svgX: 806, svgY: 657 },
  { id: 'l_130', label: 'Аудитория 130 (левое крыло, 1 эт.)', roomId: 'C_auditori_130', building: 'C', floor: 1, lat: 54.613410, lon: 39.722760, lng: 39.722760, x: 546, y: 583, svgX: 546, svgY: 583 },
  { id: 'l_gym', label: 'Край левого крыла (Спортзал)', roomId: 'C_gym_main', building: 'C', floor: 1, lat: 54.613136, lon: 39.722043, lng: 39.722043, x: 20, y: 634, svgX: 20, svgY: 634 },
  { id: 'b_sw_153b', label: 'Юго-восточный фасад (левая часть, 153б)', roomId: 'C_spec_153b', building: 'C', floor: 1, lat: 54.613074, lon: 39.723438, lng: 39.723438, x: 606, y: 12, svgX: 606, svgY: 12 },
  { id: 'b_ne_125a', label: 'Юго-восточный фасад (правая часть, 125а)', roomId: 'C_auditori_125a', building: 'C', floor: 1, lat: 54.613860, lon: 39.724908, lng: 39.724908, x: 1790, y: 12, svgX: 1790, svgY: 12 }
];

const DEFAULT_GPS_CONFIG = {
  version: 2,
  building: 'C',
  buildingName: 'Главный корпус РГРТУ (ул. Гагарина, 59/1)',
  centerLat: 54.613783,
  centerLon: 39.723850,
  centerLng: 39.723850,
  rotationDeg: 42.72,
  scaleMetersPerSvgUnit: 0.1065,
  metersPerSvgUnit: 0.1065,
  corridorSnapRadiusSvg: 85,
  campusRadiusMeters: 160,
  smoothingFactor: 0.35,
  enableStepDeadReckoning: true,
  enableWifiBleHint: true,
  anchors: DEFAULT_RSREU_ANCHORS,
  buildings: {
    C: {
      centerLat: 54.613783,
      centerLon: 39.723850,
      rotationDeg: 42.72,
      scaleMetersPerSvgUnit: 0.1065,
      anchors: DEFAULT_RSREU_ANCHORS
    }
  },
  wifiAnchors: [
    { id: 'wifi_main_1', ssid: 'RSREU-Free', bssid: '', building: 'C', floor: 1, svgX: 1229, svgY: 238, label: 'Холл 1 этажа (Главный вход)' },
    { id: 'wifi_main_2', ssid: 'RSREU-Staff', bssid: '', building: 'C', floor: 1, svgX: 2065, svgY: 599, label: 'Правое крыло 1 этажа (ауд. 106а)' },
    { id: 'wifi_main_3', ssid: 'RSREU-Student', bssid: '', building: 'C', floor: 2, svgX: 1200, svgY: 350, label: 'Центральный коридор 2 этажа' }
  ]
};

function normalizeGpsAnchor(a, idx = 0) {
  if (!a || typeof a !== 'object') return null;
  const lat = Number(a.lat);
  const lon = Number(a.lon ?? a.lng);
  const x = Number(a.x ?? a.svgX);
  const y = Number(a.y ?? a.svgY);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Отсеиваем старые ошибочные координаты (< 39.7210 — это на 300–1000 м западнее корпуса РГРТУ)
  if (lon < 39.7210 || lon > 39.7300 || lat < 54.6100 || lat > 54.6180) return null;
  return {
    id: String(a.id || `anchor_${idx + 1}`),
    label: String(a.label || `Репер ${idx + 1}`),
    roomId: String(a.roomId || ''),
    building: String(a.building || 'C'),
    floor: Number.isFinite(Number(a.floor)) ? Number(a.floor) : 1,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    lng: Number(lon.toFixed(6)),
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    svgX: Math.round(x * 10) / 10,
    svgY: Math.round(y * 10) / 10
  };
}

function normalizeGpsConfig(raw = {}) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const bC = (src.buildings && src.buildings.C && typeof src.buildings.C === 'object') ? src.buildings.C : {};

  let centerLat = Number(bC.centerLat ?? src.centerLat ?? DEFAULT_GPS_CONFIG.centerLat);
  let centerLon = Number(bC.centerLon ?? bC.centerLng ?? src.centerLon ?? src.centerLng ?? DEFAULT_GPS_CONFIG.centerLon);
  let rotationDeg = Number(bC.rotationDeg ?? src.rotationDeg ?? DEFAULT_GPS_CONFIG.rotationDeg);
  let scale = Number(bC.scaleMetersPerSvgUnit ?? src.scaleMetersPerSvgUnit ?? src.metersPerSvgUnit ?? DEFAULT_GPS_CONFIG.scaleMetersPerSvgUnit);

  // Автоматическая миграция старых ошибочных значений (version < 2, 39.70825 / 39.71925 или угол -18)
  const isLegacyConfig = Number(src.version) < 2 || Math.abs(centerLat - 54.61432) < 0.0001 || Math.abs(centerLat - 54.61435) < 0.0001;
  if (isLegacyConfig || !Number.isFinite(centerLat) || centerLat < 54.6110 || centerLat > 54.6170) {
    centerLat = DEFAULT_GPS_CONFIG.centerLat;
  }
  if (isLegacyConfig || !Number.isFinite(centerLon) || centerLon < 39.7215 || centerLon > 39.7275) {
    centerLon = DEFAULT_GPS_CONFIG.centerLon;
  }
  if (isLegacyConfig || !Number.isFinite(rotationDeg) || Math.abs(rotationDeg - (-18)) < 1) {
    rotationDeg = DEFAULT_GPS_CONFIG.rotationDeg;
  }
  if (isLegacyConfig || !Number.isFinite(scale) || scale < 0.02 || scale > 0.5) {
    scale = DEFAULT_GPS_CONFIG.scaleMetersPerSvgUnit;
  }

  const rawAnchors = [
    ...(Array.isArray(bC.anchors) ? bC.anchors : []),
    ...(Array.isArray(src.anchors) ? src.anchors : [])
  ];

  const validMap = new Map();
  // Сначала закладываем эталонные реперы корпуса РГРТУ
  if (!src.replaceDefaultAnchors) {
    for (const defA of DEFAULT_RSREU_ANCHORS) {
      validMap.set(defA.id, { ...defA });
    }
  }
  // Затем накладываем валидные пользовательские/админские реперы
  rawAnchors.forEach((item, idx) => {
    const norm = normalizeGpsAnchor(item, idx);
    if (!norm) return;
    validMap.set(norm.id, norm);
  });

  const anchors = Array.from(validMap.values());
  if (anchors.length === 0) {
    for (const defA of DEFAULT_RSREU_ANCHORS) {
      anchors.push({ ...defA });
    }
  }

  const normalized = {
    ...DEFAULT_GPS_CONFIG,
    ...src,
    version: 2,
    building: 'C',
    centerLat,
    centerLon,
    centerLng: centerLon,
    rotationDeg,
    scaleMetersPerSvgUnit: scale,
    metersPerSvgUnit: scale,
    anchors,
    buildings: {
      ...(src.buildings || {}),
      C: {
        centerLat,
        centerLon,
        centerLng: centerLon,
        rotationDeg,
        scaleMetersPerSvgUnit: scale,
        metersPerSvgUnit: scale,
        anchors
      }
    },
    wifiAnchors: Array.isArray(src.wifiAnchors) && src.wifiAnchors.length > 0
      ? src.wifiAnchors
      : DEFAULT_GPS_CONFIG.wifiAnchors,
    updatedAt: Number(src.updatedAt) || Date.now()
  };
  delete normalized.replaceDefaultAnchors;
  return normalized;
}

const DEFAULT_COMMUNITY_MARKERS = [
  {
    id: 'poi_seed_coffee_1',
    building: 'C',
    floor: 1,
    x: 495,
    y: 740,
    category: 'coffee',
    title: 'Кофе-аппарат у главного входа',
    description: 'Зерновой кофе и снеки на 1 этаже рядом с гардеробом, оплата картой и СБП.',
    status: 'approved',
    authorId: 'admin',
    authorName: 'Администрация',
    createdAt: 1756713600000,
    updatedAt: 1756713600000
  },
  {
    id: 'poi_seed_socket_2',
    building: 'C',
    floor: 2,
    x: 510,
    y: 485,
    category: 'socket',
    title: 'Розетки у лавочек в холле',
    description: 'Удобные рабочие места с розетками 220В для зарядки ноутбуков и телефонов.',
    status: 'approved',
    authorId: 'admin',
    authorName: 'Администрация',
    createdAt: 1756713600000,
    updatedAt: 1756713600000
  },
  {
    id: 'poi_seed_wifi_3',
    building: 'C',
    floor: 3,
    x: 480,
    y: 510,
    category: 'wifi',
    title: 'Точка доступа Wi-Fi РГРТУ',
    description: 'Стабильный сигнал студенческой сети Wi-Fi в центральном коридоре 3 этажа.',
    status: 'approved',
    authorId: 'admin',
    authorName: 'Администрация',
    createdAt: 1756713600000,
    updatedAt: 1756713600000
  }
];

function mergeUserRecords(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingTime = Number(existing.updatedAt) || 0;
  const incomingTime = Number(incoming.updatedAt) || 0;
  const newer = incomingTime >= existingTime ? incoming : existing;
  const older = incomingTime >= existingTime ? existing : incoming;

  const mergedNotified = Array.from(new Set([
    ...(Array.isArray(older.notifiedSlots) ? older.notifiedSlots : []),
    ...(Array.isArray(newer.notifiedSlots) ? newer.notifiedSlots : []),
    older.lastNotifiedSlot,
    newer.lastNotifiedSlot
  ].filter(Boolean))).slice(-80);

  const mergedFavorites = (Array.isArray(newer.favorites) && newer.favorites.length > 0)
    ? newer.favorites
    : (Array.isArray(older.favorites) ? older.favorites : []);

  const mergedRecentViews = {
    ...(older.recentViews && typeof older.recentViews === 'object' ? older.recentViews : {}),
    ...(newer.recentViews && typeof newer.recentViews === 'object' ? newer.recentViews : {})
  };

  const mergedLessonNotes = {
    ...(older.lessonNotes && typeof older.lessonNotes === 'object' ? older.lessonNotes : {}),
    ...(newer.lessonNotes && typeof newer.lessonNotes === 'object' ? newer.lessonNotes : {})
  };

  return {
    ...older,
    ...newer,
    telegramId: newer.telegramId || older.telegramId || null,
    firstName: newer.firstName || older.firstName || '',
    username: newer.username || older.username || '',
    role: newer.role || older.role || 'student',
    targetName: newer.targetName !== undefined && (newer.targetName || newer.explicitClear)
      ? newer.targetName
      : (older.targetName || ''),
    notificationsEnabled: newer.notificationsEnabled !== undefined
      ? Boolean(newer.notificationsEnabled)
      : (older.notificationsEnabled !== false),
    theme: newer.theme || older.theme || 'system',
    favorites: mergedFavorites,
    recentViews: mergedRecentViews,
    lessonNotes: mergedLessonNotes,
    lastNotifiedSlot: newer.lastNotifiedSlot || older.lastNotifiedSlot || null,
    notifiedSlots: mergedNotified,
    createdAt: Math.min(Number(older.createdAt) || Date.now(), Number(newer.createdAt) || Date.now()),
    updatedAt: Math.max(existingTime, incomingTime) || Date.now()
  };
}

function sanitizeTemplateButtons(buttons) {
  if (!Array.isArray(buttons)) return null;
  const cleaned = [];
  for (const b of buttons) {
    if (!b || typeof b !== 'object') continue;
    const text = String(b.text || '').trim().slice(0, 120);
    if (!text) continue;
    const rawType = String(b.type || 'webapp').trim().toLowerCase();
    const type = ['webapp', 'url', 'callback', 'reply'].includes(rawType) ? rawType : 'webapp';
    const value = String(b.value || '').trim().slice(0, 500);
    cleaned.push({ text, type, value });
  }
  return cleaned;
}

class UserStore {
  constructor(filePath = DEFAULT_USERS_FILE, options = {}) {
    this.filePath = filePath;
    this.data = {
      users: {},              // userId -> userRecord
      authCodes: {},          // 6-digit code -> { telegramId, firstName, username, expiresAt }
      authSessions: {},       // sessionToken -> { status: 'pending'|'verified', userId, expiresAt }
      botTemplates: {},       // templateId -> custom markdown string
      botTemplateConfigs: {}, // templateId -> { enabled?: boolean, buttons?: Array<{text, type, value}> }
      mapMarkers: [...DEFAULT_COMMUNITY_MARKERS],
      roomReviews: [],
      descriptionSuggestions: [],
      gpsConfig: JSON.parse(JSON.stringify(DEFAULT_GPS_CONFIG))
    };
    this._saveTimer = null;
    this._cloudPushTimer = null;
    this._pendingUserIds = new Set();
    this._lastMtime = 0;
    const isDefaultStore = path.resolve(filePath) === path.resolve(DEFAULT_USERS_FILE);
    const shouldUseCloud = options.enableCloud !== undefined ? Boolean(options.enableCloud) : isDefaultStore;
    this._cloudConfig = shouldUseCloud ? loadFirebaseCloudConfig() : null;
    this._cloudReady = false;
    this._cloudSyncing = false;
    this._lastPullAt = null;
    this._lastPushAt = null;
    this._lastError = null;
    this._initPromise = null;
    this.load();
  }

  getCloudStatus() {
    if (!this._cloudConfig) {
      return {
        enabled: false,
        ready: false,
        projectId: '',
        databaseId: '',
        lastPullAt: null,
        lastPushAt: null,
        lastError: null,
        firebaseConsoleUrl: '',
        gcpConsoleUrl: ''
      };
    }
    const { projectId, databaseId } = this._cloudConfig;
    return {
      enabled: true,
      ready: this._cloudReady,
      projectId,
      databaseId,
      lastPullAt: this._lastPullAt,
      lastPushAt: this._lastPushAt,
      lastError: this._lastError,
      firebaseConsoleUrl: `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/firestore/databases/${encodeURIComponent(databaseId)}/data`,
      gcpConsoleUrl: `https://console.cloud.google.com/firestore/databases/${encodeURIComponent(databaseId)}/data/panel?project=${encodeURIComponent(projectId)}`
    };
  }

  getFirestoreBaseUrl() {
    if (!this._cloudConfig) return null;
    const { projectId, databaseId } = this._cloudConfig;
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      this.load();
      if (!this._cloudConfig) {
        console.log('[users/db] Облачная конфигурация не найдена, используется локальный файл data/users.json');
        return false;
      }
      const ok = await this.pullFromCloud(true);
      if (ok) {
        this._cloudReady = true;
        console.log(`[users/db] Подключена облачная БД Firebase Firestore (${this._cloudConfig.projectId}). Пользователей в базе: ${Object.keys(this.data.users).length}`);
      }
      const syncTimer = setInterval(() => {
        this.pullFromCloud(false).catch(() => {});
      }, 25 * 1000);
      if (syncTimer && typeof syncTimer.unref === 'function') {
        syncTimer.unref();
      }
      return ok;
    })();
    return this._initPromise;
  }

  async pullFromCloud(pushBackIfLocalHasData = false) {
    if (!this._cloudConfig || this._cloudSyncing) return false;
    this._cloudSyncing = true;
    try {
      const baseUrl = this.getFirestoreBaseUrl();
      const apiKey = encodeURIComponent(this._cloudConfig.apiKey);
      const snapshotUrl = `${baseUrl}/radikmap_state/user_store?key=${apiKey}`;

      let cloudUsers = {};
      let cloudCodes = {};
      let cloudSessions = {};
      let cloudBotTemplates = null;
      let cloudBotTemplateConfigs = null;
      let cloudMapMarkers = null;
      let cloudRoomReviews = null;
      let cloudDescriptionSuggestions = null;
      let cloudGpsConfig = null;
      let snapshotExists = false;

      const resp = await fetch(snapshotUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });

      if (resp.ok) {
        snapshotExists = true;
        const doc = await resp.json();
        const f = (doc && doc.fields) || {};
        if (f.usersJson && f.usersJson.stringValue) {
          try { cloudUsers = JSON.parse(f.usersJson.stringValue) || {}; } catch (e) {}
        }
        if (f.authCodesJson && f.authCodesJson.stringValue) {
          try { cloudCodes = JSON.parse(f.authCodesJson.stringValue) || {}; } catch (e) {}
        }
        if (f.authSessionsJson && f.authSessionsJson.stringValue) {
          try { cloudSessions = JSON.parse(f.authSessionsJson.stringValue) || {}; } catch (e) {}
        }
        if (f.botTemplatesJson && f.botTemplatesJson.stringValue) {
          try { cloudBotTemplates = JSON.parse(f.botTemplatesJson.stringValue) || {}; } catch (e) {}
        }
        if (f.botTemplateConfigsJson && f.botTemplateConfigsJson.stringValue) {
          try { cloudBotTemplateConfigs = JSON.parse(f.botTemplateConfigsJson.stringValue) || {}; } catch (e) {}
        }
        if (f.mapMarkersJson && f.mapMarkersJson.stringValue) {
          try { cloudMapMarkers = JSON.parse(f.mapMarkersJson.stringValue); } catch (e) {}
        }
        if (f.roomReviewsJson && f.roomReviewsJson.stringValue) {
          try { cloudRoomReviews = JSON.parse(f.roomReviewsJson.stringValue); } catch (e) {}
        }
        if (f.descriptionSuggestionsJson && f.descriptionSuggestionsJson.stringValue) {
          try { cloudDescriptionSuggestions = JSON.parse(f.descriptionSuggestionsJson.stringValue); } catch (e) {}
        }
        if (f.gpsConfigJson && f.gpsConfigJson.stringValue) {
          try { cloudGpsConfig = JSON.parse(f.gpsConfigJson.stringValue); } catch (e) {}
        }
      } else if (resp.status !== 404) {
        const errText = await resp.text().catch(() => '');
        console.warn(`[users/db] Ошибка чтения snapshot (${resp.status}):`, errText.slice(0, 180));
        return false;
      }

      // Дополнительно читаем коллекцию radikmap_users (индивидуальные профили)
      try {
        const usersColUrl = `${baseUrl}/radikmap_users?pageSize=250&key=${apiKey}`;
        const colResp = await fetch(usersColUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000)
        });
        if (colResp.ok) {
          const colData = await colResp.json();
          const docs = Array.isArray(colData.documents) ? colData.documents : [];
          for (const d of docs) {
            const fields = d && d.fields;
            if (fields && fields.id && fields.id.stringValue && fields.payloadJson && fields.payloadJson.stringValue) {
              try {
                const parsedUser = JSON.parse(fields.payloadJson.stringValue);
                const uid = fields.id.stringValue;
                if (parsedUser && parsedUser.deleted === true) {
                  delete cloudUsers[uid];
                  continue;
                }
                if (parsedUser && uid && uid !== 'tg_777888999' && uid !== 'guest-123') {
                  cloudUsers[uid] = mergeUserRecords(cloudUsers[uid], parsedUser);
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}

      const localUserCountBefore = Object.keys(this.data.users).length;
      let changedLocally = false;

      for (const [uid, cloudU] of Object.entries(cloudUsers)) {
        if (!uid || !cloudU || typeof cloudU !== 'object') continue;
        const localU = this.data.users[uid];
        if (!localU || (Number(cloudU.updatedAt) || 0) > (Number(localU.updatedAt) || 0)) {
          changedLocally = true;
        }
        this.data.users[uid] = mergeUserRecords(localU, cloudU);
      }

      const now = Date.now();
      for (const [code, info] of Object.entries(cloudCodes)) {
        if (info && info.expiresAt > now && !this.data.authCodes[code]) {
          this.data.authCodes[code] = info;
          changedLocally = true;
        }
      }
      for (const [token, info] of Object.entries(cloudSessions)) {
        if (info && info.expiresAt > now) {
          const localSess = this.data.authSessions[token];
          if (!localSess || (info.status === 'verified' && localSess.status !== 'verified')) {
            this.data.authSessions[token] = info;
            changedLocally = true;
          }
        }
      }

      if (cloudBotTemplates && typeof cloudBotTemplates === 'object') {
        if (!this.data.botTemplates || typeof this.data.botTemplates !== 'object') {
          this.data.botTemplates = {};
        }
        for (const [tplId, tplVal] of Object.entries(cloudBotTemplates)) {
          if (DEFAULT_BOT_TEMPLATES[tplId] && typeof tplVal === 'string' && this.data.botTemplates[tplId] === undefined) {
            this.data.botTemplates[tplId] = tplVal;
            changedLocally = true;
          }
        }
      }

      if (cloudBotTemplateConfigs && typeof cloudBotTemplateConfigs === 'object') {
        if (!this.data.botTemplateConfigs || typeof this.data.botTemplateConfigs !== 'object') {
          this.data.botTemplateConfigs = {};
        }
        for (const [tplId, cfgVal] of Object.entries(cloudBotTemplateConfigs)) {
          if (DEFAULT_BOT_TEMPLATES[tplId] && cfgVal && typeof cfgVal === 'object' && this.data.botTemplateConfigs[tplId] === undefined) {
            this.data.botTemplateConfigs[tplId] = cfgVal;
            changedLocally = true;
          }
        }
      }

      if (Array.isArray(cloudMapMarkers) && cloudMapMarkers.length > 0) {
        this.data.mapMarkers = cloudMapMarkers;
        changedLocally = true;
      }
      if (Array.isArray(cloudRoomReviews) && cloudRoomReviews.length > 0) {
        this.data.roomReviews = cloudRoomReviews;
        changedLocally = true;
      }
      if (Array.isArray(cloudDescriptionSuggestions) && cloudDescriptionSuggestions.length > 0) {
        this.data.descriptionSuggestions = cloudDescriptionSuggestions;
        changedLocally = true;
      }
      if (cloudGpsConfig && typeof cloudGpsConfig === 'object') {
        this.data.gpsConfig = normalizeGpsConfig(cloudGpsConfig);
        changedLocally = true;
      }

      this.cleanupExpired();
      if (changedLocally) {
        this.flushSync();
      }

      if (pushBackIfLocalHasData && (!snapshotExists || localUserCountBefore > 0)) {
        await this.pushToCloud(Object.keys(this.data.users));
      }

      this._cloudReady = true;
      this._lastPullAt = Date.now();
      this._lastError = null;
      return true;
    } catch (e) {
      this._lastError = e.message;
      console.warn('[users/db] Не удалось синхронизировать с облачной БД:', e.message);
      return false;
    } finally {
      this._cloudSyncing = false;
    }
  }

  scheduleCloudPush(userId = null) {
    if (!this._cloudConfig) return;
    if (userId) this._pendingUserIds.add(String(userId));
    if (this._cloudPushTimer) clearTimeout(this._cloudPushTimer);
    this._cloudPushTimer = setTimeout(() => {
      this._cloudPushTimer = null;
      const uids = Array.from(this._pendingUserIds);
      this._pendingUserIds.clear();
      this.pushToCloud(uids).catch(() => {});
    }, 80);
  }

  async pushToCloud(userIds = []) {
    if (!this._cloudConfig) return false;
    try {
      this.cleanupExpired();
      const baseUrl = this.getFirestoreBaseUrl();
      const apiKey = encodeURIComponent(this._cloudConfig.apiKey);
      const snapshotUrl = `${baseUrl}/radikmap_state/user_store?key=${apiKey}`;
      const now = Date.now();

      const snapshotBody = {
        fields: {
          appKey: { stringValue: APP_STORAGE_KEY },
          usersJson: { stringValue: JSON.stringify(this.data.users || {}) },
          authCodesJson: { stringValue: JSON.stringify(this.data.authCodes || {}) },
          authSessionsJson: { stringValue: JSON.stringify(this.data.authSessions || {}) },
          botTemplatesJson: { stringValue: JSON.stringify(this.data.botTemplates || {}) },
          botTemplateConfigsJson: { stringValue: JSON.stringify(this.data.botTemplateConfigs || {}) },
          mapMarkersJson: { stringValue: JSON.stringify(this.data.mapMarkers || []) },
          roomReviewsJson: { stringValue: JSON.stringify(this.data.roomReviews || []) },
          descriptionSuggestionsJson: { stringValue: JSON.stringify(this.data.descriptionSuggestions || []) },
          gpsConfigJson: { stringValue: JSON.stringify(this.data.gpsConfig || DEFAULT_GPS_CONFIG) },
          updatedAt: { integerValue: String(now) }
        }
      };

      const resp = await fetch(snapshotUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshotBody),
        signal: AbortSignal.timeout(6000)
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.warn(`[users/db] Ошибка записи snapshot (${resp.status}):`, errText.slice(0, 180));
      }

      const uniqueUids = Array.from(new Set(userIds.filter(Boolean))).slice(0, 20);
      await Promise.all(uniqueUids.map(async (uid) => {
        const u = this.data.users[uid];
        if (!u) return;
        const safeDocId = encodeURIComponent(String(uid));
        const userUrl = `${baseUrl}/radikmap_users/${safeDocId}?key=${apiKey}`;
        const userBody = {
          fields: {
            appKey: { stringValue: APP_STORAGE_KEY },
            id: { stringValue: String(uid) },
            role: { stringValue: String(u.role || 'student') },
            targetName: { stringValue: String(u.targetName || '') },
            notificationsEnabled: { booleanValue: u.notificationsEnabled !== false },
            lastNotifiedSlot: { stringValue: String(u.lastNotifiedSlot || '') },
            payloadJson: { stringValue: JSON.stringify(u) },
            updatedAt: { integerValue: String(Number(u.updatedAt) || now) }
          }
        };
        try {
          await fetch(userUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userBody),
            signal: AbortSignal.timeout(5000)
          });
        } catch (e) {}
      }));

      if (resp.ok) {
        this._cloudReady = true;
        this._lastPushAt = Date.now();
        this._lastError = null;
      } else {
        this._lastError = `HTTP ${resp.status}`;
      }
      return resp.ok;
    } catch (e) {
      this._lastError = e.message;
      console.warn('[users/db] Ошибка отправки данных в облачную БД:', e.message);
      return false;
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const stat = fs.statSync(this.filePath);
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          const diskUsers = (parsed.users || parsed.authCodes || parsed.authSessions || parsed.botTemplates)
            ? (parsed.users || {})
            : parsed;
          const diskCodes = parsed.authCodes || {};
          const diskSessions = parsed.authSessions || {};
          const diskTemplates = parsed.botTemplates || {};
          const diskTemplateConfigs = parsed.botTemplateConfigs || {};

          for (const [uid, u] of Object.entries(diskUsers)) {
            if (!uid || !u || typeof u !== 'object') continue;
            this.data.users[uid] = mergeUserRecords(this.data.users[uid], u);
          }
          for (const [code, info] of Object.entries(diskCodes)) {
            if (info && !this.data.authCodes[code]) {
              this.data.authCodes[code] = info;
            }
          }
          for (const [token, info] of Object.entries(diskSessions)) {
            if (info) {
              const existing = this.data.authSessions[token];
              if (!existing || (info.status === 'verified' && existing.status !== 'verified')) {
                this.data.authSessions[token] = info;
              }
            }
          }
          if (!this.data.botTemplates || typeof this.data.botTemplates !== 'object') {
            this.data.botTemplates = {};
          }
          for (const [tplId, tplText] of Object.entries(diskTemplates)) {
            if (DEFAULT_BOT_TEMPLATES[tplId] && typeof tplText === 'string') {
              this.data.botTemplates[tplId] = tplText;
            }
          }
          if (!this.data.botTemplateConfigs || typeof this.data.botTemplateConfigs !== 'object') {
            this.data.botTemplateConfigs = {};
          }
          for (const [tplId, cfg] of Object.entries(diskTemplateConfigs)) {
            if (DEFAULT_BOT_TEMPLATES[tplId] && cfg && typeof cfg === 'object') {
              this.data.botTemplateConfigs[tplId] = {
                enabled: cfg.enabled !== false,
                buttons: Array.isArray(cfg.buttons) ? sanitizeTemplateButtons(cfg.buttons) : undefined
              };
            }
          }
          if (Array.isArray(parsed.mapMarkers)) {
            this.data.mapMarkers = parsed.mapMarkers;
          }
          if (Array.isArray(parsed.roomReviews)) {
            this.data.roomReviews = parsed.roomReviews;
          }
          if (Array.isArray(parsed.descriptionSuggestions)) {
            this.data.descriptionSuggestions = parsed.descriptionSuggestions;
          }
          if (parsed.gpsConfig && typeof parsed.gpsConfig === 'object') {
            this.data.gpsConfig = normalizeGpsConfig(parsed.gpsConfig);
          } else {
            this.data.gpsConfig = normalizeGpsConfig(DEFAULT_GPS_CONFIG);
          }
          this._lastMtime = stat.mtimeMs;
        }
      }
    } catch (e) {
      console.error('[users] Ошибка чтения базы пользователей:', e.message);
    }
  }

  reloadIfChanged() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const stat = fs.statSync(this.filePath);
      if (!this._lastMtime || stat.mtimeMs > this._lastMtime) {
        this.load();
      }
    } catch (e) {}
  }

  save(immediate = false, changedUserId = null) {
    this.cleanupExpired();
    if (immediate) {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      this.flushSync();
      this.scheduleCloudPush(changedUserId);
      return;
    }
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flushAsync();
    }, 100);
    this.scheduleCloudPush(changedUserId);
  }

  flushSync() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmpFile = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.filePath);
      try {
        this._lastMtime = fs.statSync(this.filePath).mtimeMs;
      } catch (e) {}
    } catch (e) {
      console.error('[users] Ошибка сохранения базы пользователей:', e.message);
    }
  }

  async flushAsync() {
    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmpFile = `${this.filePath}.tmp`;
      await fs.promises.writeFile(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      await fs.promises.rename(tmpFile, this.filePath);
      try {
        const stat = await fs.promises.stat(this.filePath);
        this._lastMtime = stat.mtimeMs;
      } catch (e) {}
    } catch (e) {
      console.error('[users] Ошибка асинхронного сохранения базы пользователей:', e.message);
    }
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [code, info] of Object.entries(this.data.authCodes)) {
      if (!info || info.expiresAt < now) delete this.data.authCodes[code];
    }
    for (const [token, info] of Object.entries(this.data.authSessions)) {
      if (!info || info.expiresAt < now) delete this.data.authSessions[token];
    }
  }

  // ================ ШАБЛОНЫ СООБЩЕНИЙ БОТА ================

  getBotTemplateRaw(templateId) {
    this.reloadIfChanged();
    const meta = DEFAULT_BOT_TEMPLATES[templateId];
    if (!meta) return '';
    const custom = this.data.botTemplates && this.data.botTemplates[templateId];
    return (typeof custom === 'string' && custom.trim()) ? custom : meta.defaultText;
  }

  isBotTemplateEnabled(templateId) {
    this.reloadIfChanged();
    if (!DEFAULT_BOT_TEMPLATES[templateId]) return false;
    const cfg = this.data.botTemplateConfigs && this.data.botTemplateConfigs[templateId];
    if (cfg && cfg.enabled === false) return false;
    return true;
  }

  getBotTemplateButtons(templateId) {
    this.reloadIfChanged();
    const meta = DEFAULT_BOT_TEMPLATES[templateId];
    if (!meta) return [];
    const cfg = this.data.botTemplateConfigs && this.data.botTemplateConfigs[templateId];
    if (cfg && Array.isArray(cfg.buttons)) {
      return cfg.buttons.map(b => ({ ...b }));
    }
    return Array.isArray(meta.defaultButtons) ? meta.defaultButtons.map(b => ({ ...b })) : [];
  }

  renderBotTemplateButtons(templateId, variables = {}) {
    const buttons = this.getBotTemplateButtons(templateId);
    const interpolate = (str) => String(str || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return Object.prototype.hasOwnProperty.call(variables, key)
        ? String(variables[key] == null ? '' : variables[key])
        : '';
    }).trim();

    return buttons
      .map(b => ({
        text: interpolate(b.text),
        type: b.type || 'webapp',
        value: interpolate(b.value)
      }))
      .filter(b => b.text && b.value);
  }

  renderBotMessage(templateId, variables = {}) {
    const rawTemplate = this.getBotTemplateRaw(templateId);
    const enabled = this.isBotTemplateEnabled(templateId);
    const buttons = this.renderBotTemplateButtons(templateId, variables);
    return {
      enabled,
      rawTemplate,
      buttons,
      html: renderTelegramMarkdownToHtml(rawTemplate, variables),
      text: renderTelegramPlainText(rawTemplate, variables)
    };
  }

  getBotTemplatesCatalog() {
    this.reloadIfChanged();
    const customMap = this.data.botTemplates || {};
    const cfgMap = this.data.botTemplateConfigs || {};
    return Object.values(DEFAULT_BOT_TEMPLATES).map(meta => {
      const hasCustomText = typeof customMap[meta.id] === 'string' && customMap[meta.id].trim().length > 0 && customMap[meta.id] !== meta.defaultText;
      const currentText = hasCustomText ? customMap[meta.id] : meta.defaultText;
      const cfg = cfgMap[meta.id] || {};
      const enabled = cfg.enabled !== false;
      const defaultButtons = Array.isArray(meta.defaultButtons) ? meta.defaultButtons : [];
      const currentButtons = Array.isArray(cfg.buttons) ? cfg.buttons : defaultButtons;
      const hasCustomButtons = Array.isArray(cfg.buttons) && JSON.stringify(cfg.buttons) !== JSON.stringify(defaultButtons);
      const isModified = hasCustomText || !enabled || hasCustomButtons;

      return {
        id: meta.id,
        title: meta.title,
        category: meta.category,
        trigger: meta.trigger,
        description: meta.description,
        variables: meta.variables,
        defaultText: meta.defaultText,
        text: currentText,
        enabled,
        defaultButtons,
        buttons: currentButtons,
        isModified
      };
    });
  }

  saveBotTemplate(templateId, text, options = {}) {
    if (!DEFAULT_BOT_TEMPLATES[templateId]) {
      throw new Error(`Неизвестный шаблон: ${templateId}`);
    }
    this.reloadIfChanged();
    if (!this.data.botTemplates || typeof this.data.botTemplates !== 'object') {
      this.data.botTemplates = {};
    }
    if (!this.data.botTemplateConfigs || typeof this.data.botTemplateConfigs !== 'object') {
      this.data.botTemplateConfigs = {};
    }

    const meta = DEFAULT_BOT_TEMPLATES[templateId];
    if (text !== undefined && text !== null) {
      const cleaned = String(text).replace(/\r\n/g, '\n').trim();
      if (!cleaned || cleaned === meta.defaultText) {
        delete this.data.botTemplates[templateId];
      } else {
        this.data.botTemplates[templateId] = cleaned.slice(0, 8000);
      }
    }

    if (options && typeof options === 'object') {
      const prevCfg = this.data.botTemplateConfigs[templateId] || {};
      const nextCfg = { ...prevCfg };

      if (options.enabled !== undefined) {
        nextCfg.enabled = Boolean(options.enabled);
      }
      if (Array.isArray(options.buttons)) {
        const cleanBtns = sanitizeTemplateButtons(options.buttons);
        const defaultBtns = Array.isArray(meta.defaultButtons) ? meta.defaultButtons : [];
        if (JSON.stringify(cleanBtns) === JSON.stringify(defaultBtns)) {
          delete nextCfg.buttons;
        } else {
          nextCfg.buttons = cleanBtns;
        }
      }

      if (nextCfg.enabled !== false && nextCfg.buttons === undefined) {
        delete this.data.botTemplateConfigs[templateId];
      } else {
        this.data.botTemplateConfigs[templateId] = nextCfg;
      }
    }

    this.save(true);
    return this.getBotTemplatesCatalog().find(t => t.id === templateId);
  }

  resetBotTemplate(templateId) {
    if (!DEFAULT_BOT_TEMPLATES[templateId]) {
      throw new Error(`Неизвестный шаблон: ${templateId}`);
    }
    this.reloadIfChanged();
    if (this.data.botTemplates) {
      delete this.data.botTemplates[templateId];
    }
    if (this.data.botTemplateConfigs) {
      delete this.data.botTemplateConfigs[templateId];
    }
    this.save(true);
    return this.getBotTemplatesCatalog().find(t => t.id === templateId);
  }

  resetAllBotTemplates() {
    this.reloadIfChanged();
    this.data.botTemplates = {};
    this.data.botTemplateConfigs = {};
    this.save(true);
    return this.getBotTemplatesCatalog();
  }

  // ================ ПОЛЬЗОВАТЕЛЬСКИЕ ЗАМЕТКИ К ПАРАМ ================

  saveUserLessonNote(userId, lessonKey, noteText) {
    if (!userId || !lessonKey) throw new Error('userId и lessonKey обязательны');
    this.reloadIfChanged();
    const key = String(userId);
    const existing = this.data.users[key];
    if (!existing) {
      this.upsertUser(key, {});
    }
    const u = this.data.users[key];
    if (!u.lessonNotes || typeof u.lessonNotes !== 'object' || Array.isArray(u.lessonNotes)) {
      u.lessonNotes = {};
    }
    const cleanKey = String(lessonKey).trim().slice(0, 180);
    const cleanText = String(noteText == null ? '' : noteText).trim().slice(0, 500);
    if (!cleanText) {
      delete u.lessonNotes[cleanKey];
    } else {
      u.lessonNotes[cleanKey] = cleanText;
    }
    u.updatedAt = Date.now();
    this.save(true, key);
    return u.lessonNotes;
  }

  // ================ ПОЛЬЗОВАТЕЛЬСКИЕ МЕТКИ, ОТЗЫВЫ, ОПИСАНИЯ И GPS ================

  getGpsConfig() {
    this.reloadIfChanged();
    this.data.gpsConfig = normalizeGpsConfig(this.data.gpsConfig);
    return this.data.gpsConfig;
  }

  saveGpsConfig(patch = {}) {
    this.reloadIfChanged();
    const cur = this.getGpsConfig();
    if (patch && patch.resetToDefault) {
      this.data.gpsConfig = normalizeGpsConfig(DEFAULT_GPS_CONFIG);
      this.save(true);
      return this.data.gpsConfig;
    }
    if (patch && patch.upsertAnchor && typeof patch.upsertAnchor === 'object') {
      const normA = normalizeGpsAnchor(patch.upsertAnchor, cur.anchors.length);
      if (normA) {
        const nextAnchors = cur.anchors.filter(a => a.id !== normA.id && (!normA.roomId || a.roomId !== normA.roomId));
        nextAnchors.push(normA);
        this.data.gpsConfig = normalizeGpsConfig({
          ...cur,
          anchors: nextAnchors,
          replaceDefaultAnchors: true,
          updatedAt: Date.now()
        });
        this.save(true);
      }
      return this.data.gpsConfig;
    }
    if (patch && patch.deleteAnchorId) {
      const delId = String(patch.deleteAnchorId);
      const nextAnchors = cur.anchors.filter(a => a.id !== delId);
      this.data.gpsConfig = normalizeGpsConfig({
        ...cur,
        anchors: nextAnchors,
        replaceDefaultAnchors: true,
        updatedAt: Date.now()
      });
      this.save(true);
      return this.data.gpsConfig;
    }
    const merged = {
      ...cur,
      ...patch,
      buildings: {
        ...(cur.buildings || {}),
        ...(patch.buildings || {})
      },
      updatedAt: Date.now()
    };
    this.data.gpsConfig = normalizeGpsConfig(merged);
    this.save(true);
    return this.data.gpsConfig;
  }

  getMapMarkers({ includeAll = false, onlyApproved = false } = {}) {
    this.reloadIfChanged();
    const list = Array.isArray(this.data.mapMarkers) ? this.data.mapMarkers : [];
    if (includeAll && !onlyApproved) return list;
    return list.filter(m => m && m.status === 'approved');
  }

  getApprovedMapMarkers() {
    return this.getMapMarkers({ includeAll: false });
  }

  getCommunityMarkers({ onlyApproved = false, includeAll = false } = {}) {
    return this.getMapMarkers({ includeAll: includeAll || !onlyApproved, onlyApproved });
  }

  addMapMarker(payload = {}, { isAdmin = false } = {}) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.mapMarkers)) this.data.mapMarkers = [];
    const now = Date.now();
    const validCategories = ['socket', 'coffee', 'wifi', 'blocked', 'info'];
    const category = validCategories.includes(payload.category) ? payload.category : 'info';
    const approvedByStatus = isAdmin || payload.status === 'approved';
    const item = {
      id: payload.id || `poi_${now}_${crypto.randomBytes(3).toString('hex')}`,
      building: String(payload.building || 'C'),
      floor: Number.isFinite(Number(payload.floor)) ? Number(payload.floor) : 1,
      x: Math.round(Number(payload.x) || 500),
      y: Math.round(Number(payload.y) || 500),
      category,
      title: String(payload.title || '').trim().slice(0, 120) || 'Метка на карте',
      description: String(payload.description || '').trim().slice(0, 400),
      status: approvedByStatus ? 'approved' : 'pending',
      authorId: String(payload.authorId || (approvedByStatus ? 'admin' : '')),
      authorName: String(payload.authorName || (approvedByStatus ? 'Администратор' : 'Студент')),
      createdAt: now,
      updatedAt: now
    };
    this.data.mapMarkers.unshift(item);
    this.save(true);
    return item;
  }

  addCommunityMarker(payload = {}, options = {}) {
    return this.addMapMarker(payload, options);
  }

  updateMapMarker(id, patch = {}) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.mapMarkers)) return null;
    const idx = this.data.mapMarkers.findIndex(m => m && m.id === id);
    if (idx === -1) return null;
    const cur = this.data.mapMarkers[idx];
    const updated = {
      ...cur,
      ...patch,
      id: cur.id,
      floor: patch.floor !== undefined ? Number(patch.floor) : cur.floor,
      x: patch.x !== undefined ? Math.round(Number(patch.x)) : cur.x,
      y: patch.y !== undefined ? Math.round(Number(patch.y)) : cur.y,
      updatedAt: Date.now()
    };
    this.data.mapMarkers[idx] = updated;
    this.save(true);
    return updated;
  }

  moderateCommunityMarker(id, statusOrAction, patch = {}) {
    const status = (statusOrAction === 'approve' || statusOrAction === 'approved') ? 'approved' : 'rejected';
    return this.updateMapMarker(id, { ...patch, status });
  }

  deleteMapMarker(id) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.mapMarkers)) return false;
    const prevLen = this.data.mapMarkers.length;
    this.data.mapMarkers = this.data.mapMarkers.filter(m => m && m.id !== id);
    if (this.data.mapMarkers.length !== prevLen) {
      this.save(true);
      return true;
    }
    return false;
  }

  deleteCommunityMarker(id) {
    return this.deleteMapMarker(id);
  }

  getRoomReviews({ roomId = null, includeAll = false, onlyApproved = false } = {}) {
    this.reloadIfChanged();
    const list = Array.isArray(this.data.roomReviews) ? this.data.roomReviews : [];
    const wantOnlyApproved = onlyApproved || !includeAll;
    return list.filter(r => {
      if (!r) return false;
      if (roomId && r.roomId !== roomId) return false;
      if (wantOnlyApproved && r.status !== 'approved') return false;
      return true;
    });
  }

  getApprovedRoomReviews(roomId = null) {
    return this.getRoomReviews({ roomId, includeAll: false, onlyApproved: true });
  }

  addRoomReview(payload = {}, { isAdmin = false } = {}) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.roomReviews)) this.data.roomReviews = [];
    const now = Date.now();
    const rating = Math.max(1, Math.min(5, Math.round(Number(payload.rating) || 5)));
    const roomId = String(payload.roomId || '').trim();
    const authorId = String(payload.authorId || '');

    // Если этот пользователь уже оставлял отзыв к этому помещению — обновляем его (1 пользователь = 1 отзыв)
    if (authorId && roomId) {
      const existingIdx = this.data.roomReviews.findIndex(r => r && r.roomId === roomId && r.authorId === authorId);
      if (existingIdx !== -1) {
        const cur = this.data.roomReviews[existingIdx];
        const updated = {
          ...cur,
          rating,
          text: String(payload.text || '').trim().slice(0, 600),
          authorName: String(payload.authorName || cur.authorName || 'Студент'),
          status: (isAdmin || cur.status === 'approved') ? 'approved' : 'pending',
          updatedAt: now
        };
        this.data.roomReviews[existingIdx] = updated;
        this.save(true);
        return updated;
      }
    }

    const review = {
      id: `rev_${now}_${crypto.randomBytes(3).toString('hex')}`,
      roomId,
      roomName: String(payload.roomName || payload.roomId || '').trim(),
      rating,
      text: String(payload.text || '').trim().slice(0, 600),
      status: (isAdmin || payload.status === 'approved') ? 'approved' : 'pending',
      authorId,
      authorName: String(payload.authorName || 'Студент'),
      createdAt: now,
      updatedAt: now
    };
    this.data.roomReviews.unshift(review);
    this.save(true);
    return review;
  }

  updateRoomReview(id, patch = {}) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.roomReviews)) return null;
    const idx = this.data.roomReviews.findIndex(r => r && r.id === id);
    if (idx === -1) return null;
    const cur = this.data.roomReviews[idx];
    const updated = {
      ...cur,
      ...patch,
      id: cur.id,
      rating: patch.rating !== undefined ? Math.max(1, Math.min(5, Math.round(Number(patch.rating) || 5))) : cur.rating,
      updatedAt: Date.now()
    };
    this.data.roomReviews[idx] = updated;
    this.save(true);
    return updated;
  }

  moderateRoomReview(id, statusOrAction, patch = {}) {
    const status = (statusOrAction === 'approve' || statusOrAction === 'approved') ? 'approved' : 'rejected';
    return this.updateRoomReview(id, { ...patch, status });
  }

  deleteRoomReview(id) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.roomReviews)) return false;
    const prevLen = this.data.roomReviews.length;
    this.data.roomReviews = this.data.roomReviews.filter(r => r && r.id !== id);
    if (this.data.roomReviews.length !== prevLen) {
      this.save(true);
      return true;
    }
    return false;
  }

  getDescriptionSuggestions({ roomId = null, includeAll = true } = {}) {
    this.reloadIfChanged();
    const list = Array.isArray(this.data.descriptionSuggestions) ? this.data.descriptionSuggestions : [];
    return list.filter(s => {
      if (!s) return false;
      if (roomId && s.roomId !== roomId) return false;
      if (!includeAll && s.status !== 'approved') return false;
      return true;
    });
  }

  addDescriptionSuggestion(payload = {}) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.descriptionSuggestions)) this.data.descriptionSuggestions = [];
    const now = Date.now();
    const descText = String(payload.suggestedDescription || payload.description || '').trim().slice(0, 600);
    const item = {
      id: `desc_${now}_${crypto.randomBytes(3).toString('hex')}`,
      roomId: String(payload.roomId || '').trim(),
      roomName: String(payload.roomName || payload.roomId || '').trim(),
      currentDescription: String(payload.currentDescription || '').trim(),
      suggestedDescription: descText,
      description: descText,
      status: 'pending',
      authorId: String(payload.authorId || ''),
      authorName: String(payload.authorName || 'Студент'),
      createdAt: now,
      updatedAt: now
    };
    this.data.descriptionSuggestions.unshift(item);
    this.save(true);
    return item;
  }

  updateDescriptionSuggestion(id, patch = {}) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.descriptionSuggestions)) return null;
    const idx = this.data.descriptionSuggestions.findIndex(s => s && s.id === id);
    if (idx === -1) return null;
    const cur = this.data.descriptionSuggestions[idx];
    const updated = {
      ...cur,
      ...patch,
      id: cur.id,
      updatedAt: Date.now()
    };
    this.data.descriptionSuggestions[idx] = updated;
    this.save(true);
    return updated;
  }

  moderateDescriptionSuggestion(id, statusOrAction, patch = {}) {
    const status = (statusOrAction === 'approve' || statusOrAction === 'approved') ? 'approved' : 'rejected';
    return this.updateDescriptionSuggestion(id, { ...patch, status });
  }

  deleteDescriptionSuggestion(id) {
    this.reloadIfChanged();
    if (!Array.isArray(this.data.descriptionSuggestions)) return false;
    const prevLen = this.data.descriptionSuggestions.length;
    this.data.descriptionSuggestions = this.data.descriptionSuggestions.filter(s => s && s.id !== id);
    if (this.data.descriptionSuggestions.length !== prevLen) {
      this.save(true);
      return true;
    }
    return false;
  }

  getModerationData() {
    return {
      markers: this.getMapMarkers({ includeAll: true }),
      reviews: this.getRoomReviews({ includeAll: true }),
      descriptions: this.getDescriptionSuggestions({ includeAll: true })
    };
  }

  // ================ ПОЛЬЗОВАТЕЛИ ================

  sanitizeUserInput(input = {}) {
    const role = input.role === 'lecturer' ? 'lecturer' : 'student';
    const targetName = String(input.targetName || '').trim().slice(0, 120);
    const theme = (input.theme === 'dark' || input.theme === 'light' || input.theme === 'system') ? input.theme : 'system';
    const notificationsEnabled = input.notificationsEnabled !== false;
    const firstName = String(input.firstName || '').trim().slice(0, 64);
    const username = String(input.username || '').replace(/^@/, '').trim().slice(0, 64);
    const favorites = Array.isArray(input.favorites)
      ? input.favorites.map(v => String(v || '').trim()).filter(Boolean).slice(0, 200)
      : undefined;
    const recentViews = (input.recentViews && typeof input.recentViews === 'object' && !Array.isArray(input.recentViews))
      ? input.recentViews
      : undefined;
    const lessonNotes = (input.lessonNotes && typeof input.lessonNotes === 'object' && !Array.isArray(input.lessonNotes))
      ? input.lessonNotes
      : undefined;
    return { role, targetName, theme, notificationsEnabled, firstName, username, favorites, recentViews, lessonNotes };
  }

  getUser(userId) {
    if (!userId) return null;
    this.reloadIfChanged();
    return this.data.users[String(userId)] || null;
  }

  getUserByTelegramId(telegramId) {
    if (!telegramId) return null;
    this.reloadIfChanged();
    return this.getUser(`tg_${telegramId}`) || this.getUser(String(telegramId));
  }

  findUserByUsername(username) {
    const clean = String(username || '').replace(/^@/, '').trim().toLowerCase();
    if (!clean) return null;
    this.reloadIfChanged();
    for (const u of Object.values(this.data.users)) {
      if (u && String(u.username || '').toLowerCase() === clean) return u;
    }
    return null;
  }

  upsertUser(userId, patch = {}) {
    if (!userId) throw new Error('userId is required');
    this.reloadIfChanged();
    const key = String(userId);
    const existing = this.data.users[key] || {
      id: key,
      telegramId: key.startsWith('tg_') ? Number(key.slice(3)) || null : (/^\d+$/.test(key) ? Number(key) : null),
      firstName: '',
      username: '',
      role: 'student',
      targetName: '',
      notificationsEnabled: true,
      theme: 'system',
      favorites: [],
      recentViews: {},
      lessonNotes: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastNotifiedSlot: null,
      notifiedSlots: []
    };

    const updated = {
      ...existing,
      updatedAt: Math.max(Date.now(), (Number(existing.updatedAt) || 0) + 1)
    };

    if (patch.telegramId !== undefined) updated.telegramId = patch.telegramId ? Number(patch.telegramId) : existing.telegramId;
    if (patch.firstName !== undefined && String(patch.firstName).trim()) updated.firstName = String(patch.firstName).trim().slice(0, 64);
    if (patch.username !== undefined && String(patch.username).trim()) updated.username = String(patch.username).replace(/^@/, '').trim().slice(0, 64);
    if (patch.role === 'student' || patch.role === 'lecturer') updated.role = patch.role;
    if (patch.targetName !== undefined) {
      const trimmedTarget = String(patch.targetName).trim().slice(0, 120);
      if (trimmedTarget || patch.explicitClear) updated.targetName = trimmedTarget;
    }
    if (patch.notificationsEnabled !== undefined) updated.notificationsEnabled = Boolean(patch.notificationsEnabled);
    if (patch.theme === 'light' || patch.theme === 'dark' || patch.theme === 'system') updated.theme = patch.theme;
    if (Array.isArray(patch.favorites)) {
      updated.favorites = Array.from(new Set(patch.favorites.map(v => String(v || '').trim()).filter(Boolean))).slice(0, 200);
    }
    if (patch.recentViews && typeof patch.recentViews === 'object' && !Array.isArray(patch.recentViews)) {
      const cleanedViews = {};
      for (const [k, v] of Object.entries(patch.recentViews)) {
        if (!k || !v || typeof v !== 'object') continue;
        cleanedViews[String(k).slice(0, 140)] = {
          count: Math.max(0, Number(v.count) || 0),
          lastViewedAt: Math.max(0, Number(v.lastViewedAt) || 0)
        };
      }
      updated.recentViews = cleanedViews;
    }
    if (patch.lessonNotes && typeof patch.lessonNotes === 'object' && !Array.isArray(patch.lessonNotes)) {
      updated.lessonNotes = { ...(updated.lessonNotes || {}), ...patch.lessonNotes };
    }
    if (patch.lastNotifiedSlot !== undefined) {
      updated.lastNotifiedSlot = patch.lastNotifiedSlot;
      if (patch.lastNotifiedSlot) {
        const prevList = Array.isArray(updated.notifiedSlots) ? updated.notifiedSlots : [];
        updated.notifiedSlots = Array.from(new Set([...prevList, patch.lastNotifiedSlot])).slice(-30);
      }
    }
    if (patch.resetNotifiedSlots) {
      updated.lastNotifiedSlot = null;
      updated.notifiedSlots = [];
    }

    this.data.users[key] = updated;
    this.save(true, key);
    return this.toPublicUser(updated);
  }

  async deleteUser(userId) {
    const key = String(userId || '').trim();
    if (!key) return false;
    this.reloadIfChanged();
    const existed = Boolean(this.data.users[key]);
    delete this.data.users[key];
    for (const [token, sess] of Object.entries(this.data.authSessions)) {
      if (sess && sess.userId === key) delete this.data.authSessions[token];
    }
    this.flushSync();

    if (this._cloudConfig) {
      try {
        const baseUrl = this.getFirestoreBaseUrl();
        const apiKey = encodeURIComponent(this._cloudConfig.apiKey);
        const safeDocId = encodeURIComponent(key);
        const userUrl = `${baseUrl}/radikmap_users/${safeDocId}?key=${apiKey}`;
        const now = Date.now();
        const tombstoneBody = {
          fields: {
            appKey: { stringValue: APP_STORAGE_KEY },
            id: { stringValue: key },
            payloadJson: { stringValue: JSON.stringify({ id: key, deleted: true, updatedAt: now }) },
            updatedAt: { integerValue: String(now) }
          }
        };
        await fetch(userUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tombstoneBody),
          signal: AbortSignal.timeout(5000)
        }).catch(() => {});
        await this.pushToCloud([]);
      } catch (e) {}
    }
    return existed;
  }

  deleteAuthCode(code) {
    const clean = String(code || '').trim();
    if (!clean || !this.data.authCodes[clean]) return false;
    delete this.data.authCodes[clean];
    this.save(true);
    return true;
  }

  clearAuthCodes() {
    this.data.authCodes = {};
    this.save(true);
  }

  deleteAuthSession(token) {
    const clean = String(token || '').trim();
    if (!clean || !this.data.authSessions[clean]) return false;
    delete this.data.authSessions[clean];
    this.save(true);
    return true;
  }

  clearAuthSessions() {
    this.data.authSessions = {};
    this.save(true);
  }

  async importBackupData(payload = {}, replaceAll = false) {
    if (!payload || typeof payload !== 'object') throw new Error('Некорректный формат JSON-бэкапа');
    const incomingUsers = (payload.users && typeof payload.users === 'object')
      ? payload.users
      : (!payload.authCodes && !payload.authSessions ? payload : {});

    if (replaceAll) {
      this.data.users = {};
      this.data.authCodes = {};
      this.data.authSessions = {};
      this.data.botTemplates = {};
    }

    let importedCount = 0;
    for (const [uid, u] of Object.entries(incomingUsers)) {
      if (!uid || !u || typeof u !== 'object') continue;
      this.data.users[uid] = replaceAll ? { ...u, id: uid, updatedAt: Date.now() } : mergeUserRecords(this.data.users[uid], u);
      importedCount++;
    }

    if (payload.authCodes && typeof payload.authCodes === 'object') {
      Object.assign(this.data.authCodes, payload.authCodes);
    }
    if (payload.authSessions && typeof payload.authSessions === 'object') {
      Object.assign(this.data.authSessions, payload.authSessions);
    }
    if (payload.botTemplates && typeof payload.botTemplates === 'object') {
      if (!this.data.botTemplates) this.data.botTemplates = {};
      for (const [tplId, tplText] of Object.entries(payload.botTemplates)) {
        if (DEFAULT_BOT_TEMPLATES[tplId] && typeof tplText === 'string') {
          this.data.botTemplates[tplId] = tplText;
        }
      }
    }
    if (Array.isArray(payload.mapMarkers)) {
      this.data.mapMarkers = payload.mapMarkers;
    }
    if (Array.isArray(payload.roomReviews)) {
      this.data.roomReviews = payload.roomReviews;
    }
    if (Array.isArray(payload.descriptionSuggestions)) {
      this.data.descriptionSuggestions = payload.descriptionSuggestions;
    }
    if (payload.gpsConfig && typeof payload.gpsConfig === 'object') {
      this.data.gpsConfig = normalizeGpsConfig(payload.gpsConfig);
    }

    this.cleanupExpired();
    this.flushSync();
    await this.pushToCloud(Object.keys(this.data.users));
    return importedCount;
  }

  toPublicUser(u) {
    if (!u) return null;
    const isTelegramLinked = Boolean(u.telegramId || u.username);
    return {
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
      lessonNotes: u.lessonNotes && typeof u.lessonNotes === 'object' ? u.lessonNotes : {},
      isTelegramLinked,
      updatedAt: u.updatedAt
    };
  }

  createAuthCodeForTelegramUser({ telegramId, firstName = '', username = '' }) {
    if (!telegramId) throw new Error('telegramId is required');
    this.reloadIfChanged();
    const userId = `tg_${telegramId}`;
    this.upsertUser(userId, { telegramId, firstName, username });

    const code = String(crypto.randomInt(100000, 999999));
    this.data.authCodes[code] = {
      telegramId: Number(telegramId),
      firstName: String(firstName || '').slice(0, 64),
      username: String(username || '').replace(/^@/, '').slice(0, 64),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    };
    this.save(true, userId);
    return code;
  }

  consumeAuthCode(code, mergePreferences = {}) {
    this.reloadIfChanged();
    this.cleanupExpired();
    const cleanCode = String(code || '').trim();
    const entry = this.data.authCodes[cleanCode];
    if (!entry) return null;
    delete this.data.authCodes[cleanCode];

    const userId = `tg_${entry.telegramId}`;
    const existing = this.data.users[userId];
    const patch = {
      telegramId: entry.telegramId,
      firstName: entry.firstName,
      username: entry.username
    };
    if ((!existing || !existing.targetName) && mergePreferences.targetName) {
      patch.role = mergePreferences.role || 'student';
      patch.targetName = mergePreferences.targetName;
    }
    if (mergePreferences.theme) patch.theme = mergePreferences.theme;

    const user = this.upsertUser(userId, patch);
    this.save(true, userId);
    return user;
  }

  createBrowserAuthSession() {
    this.reloadIfChanged();
    this.cleanupExpired();
    const sessionToken = crypto.randomBytes(16).toString('hex');
    this.data.authSessions[sessionToken] = {
      status: 'pending',
      userId: null,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    this.save(true);
    return sessionToken;
  }

  completeBrowserAuthSession(sessionToken, { telegramId, firstName = '', username = '' }) {
    this.reloadIfChanged();
    this.cleanupExpired();
    const cleanToken = String(sessionToken || '').replace(/^(login_|webauth_)/i, '').trim();
    const sess = this.data.authSessions[cleanToken];
    if (!sess) return false;
    const user = this.upsertUser(`tg_${telegramId}`, { telegramId, firstName, username });
    sess.status = 'verified';
    sess.userId = user.id;
    this.save(true, user.id);
    return true;
  }

  checkBrowserAuthSession(sessionToken) {
    this.reloadIfChanged();
    this.cleanupExpired();
    const cleanToken = String(sessionToken || '').replace(/^(login_|webauth_)/i, '').trim();
    const sess = this.data.authSessions[cleanToken];
    if (!sess) return { status: 'expired', user: null };
    if (sess.status === 'verified' && sess.userId) {
      const u = this.data.users[sess.userId];
      return { status: 'verified', user: this.toPublicUser(u) };
    }
    return { status: 'pending', user: null };
  }

  getUsersForNotifications() {
    this.reloadIfChanged();
    return Object.values(this.data.users).filter(
      u => u && u.telegramId && u.notificationsEnabled && u.targetName
    );
  }
}

const defaultUserStore = new UserStore(DEFAULT_USERS_FILE);

function verifyTelegramWebAppInitData(initDataRaw, botToken) {
  try {
    if (!initDataRaw || !botToken) return null;
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    const userJson = params.get('user');
    if (!hash || !userJson) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calculatedHash !== hash) return null;

    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
}

module.exports = {
  DEFAULT_BOT_TEMPLATES,
  DEFAULT_GPS_CONFIG,
  DEFAULT_COMMUNITY_MARKERS,
  escapeTelegramHtml,
  renderTelegramMarkdownToHtml,
  renderTelegramPlainText,
  splitGroupAndLecturer,
  UserStore,
  defaultUserStore,
  verifyTelegramWebAppInitData
};
