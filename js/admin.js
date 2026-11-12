// ============ Админ-панель Карты РГРТУ (js/admin.js) ============

const EDITOR_TOKEN_KEY = 'radikmap_editor_token';

const state = {
  activeTab: 'users',
  users: [],
  authCodes: [],
  authSessions: [],
  botTemplates: [],
  mapMarkers: [],
  roomReviews: [],
  descriptionSuggestions: [],
  gpsConfig: {},
  selectedTemplateId: 'start_welcome',
  templateSearch: '',
  cloud: {},
  bot: {},
  cache: {},
  rooms: {},
  directory: { groups: [], lecturers: [] },
  userFilter: 'all',
  userSearch: '',
  moderationFilter: 'all',
  roomFloorFilter: 'all',
  roomTypeFilter: 'all',
  roomSearch: '',
  editingUserId: null,
  editingRoomId: null,
  editingTemplateButtons: [],
  loadedButtonsTplId: ''
};

const ROOM_TYPE_LABELS = {
  classroom: 'Учебная аудитория',
  department: 'Кафедра / преп.',
  lab: 'Лаборатория',
  deanery: 'Деканат / отдел',
  buffet: 'Буфет / столовая',
  wc: 'Туалет (WC)',
  gym: 'Спортзал',
  entrance: 'Вход',
  wardrobe: 'Гардероб',
  medical: 'Медпункт'
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SUBSCRIPT_MAP_PREVIEW = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
};

const SUPERSCRIPT_MAP_PREVIEW = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ'
};

function toSubscriptPreview(str) {
  return String(str || '').split('').map(ch => SUBSCRIPT_MAP_PREVIEW[ch] || SUBSCRIPT_MAP_PREVIEW[ch.toLowerCase()] || ch).join('');
}

function toSuperscriptPreview(str) {
  return String(str || '').split('').map(ch => SUPERSCRIPT_MAP_PREVIEW[ch] || SUPERSCRIPT_MAP_PREVIEW[ch.toLowerCase()] || ch).join('');
}

function formatVariablePreviewMarkdown(escapedVal) {
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
  v = v.replace(/\|\|([^\n|]+)\|\|/g, '<tg-spoiler title="Наведите курсор, чтобы раскрыть спойлер">$1</tg-spoiler>');
  v = v.replace(/(^|[\s(>«"'—–-])\*([^\n*]+)\*(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<b>$2</b>');
  v = v.replace(/(^|[\s(>«"'—–-])_([^\n_]+)_(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<i>$2</i>');
  v = v.replace(/ZXVVARCODE(\d+)VXZ/g, (_, idx) => codes[Number(idx)] || '');
  return v;
}

/**
 * Клиентский рендерер Markdown -> Telegram HTML для живого превью в админ-панели.
 */
function renderTelegramMarkdownPreview(markdownText, variables = {}) {
  const raw = String(markdownText == null ? '' : markdownText);
  if (!raw) return '<span style="color:var(--text-dim)">Пустой шаблон…</span>';

  const richMarkdownKeys = new Set(['lessonsList', 'roomsList']);
  const varTokens = [];
  const withVarTokens = raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key] == null ? '' : variables[key])
      : `{{${key}}}`;
    const idx = varTokens.length;
    const escaped = escapeHtml(val);
    varTokens.push(richMarkdownKeys.has(key) ? formatVariablePreviewMarkdown(escaped) : escaped);
    return `ZXVVARTOKEN${idx}VXZ`;
  });

  let text = escapeHtml(withVarTokens);

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

  // Сворачиваемые блоки :::collapse Заголовок\nТекст\n:::
  text = text.replace(/:::collapse(?:\s+([^\n]*))?\n([\s\S]*?):::/g, (_, title, body) => {
    const cleanBody = String(body || '').replace(/^\n+|\n+$/g, '');
    const header = title && title.trim() ? `<b>${title.trim()}</b>\n` : '';
    return `<blockquote expandable class="tg-expandable-quote">${header}${cleanBody}</blockquote>`;
  });

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
  });

  const lines = text.split('\n');
  const processedLines = [];
  let quoteBuffer = [];
  let expandableQuoteBuffer = [];

  const flushQuote = () => {
    if (quoteBuffer.length > 0) {
      processedLines.push(`<blockquote>${quoteBuffer.join('\n')}</blockquote>`);
      quoteBuffer = [];
    }
  };
  const flushExpandableQuote = () => {
    if (expandableQuoteBuffer.length > 0) {
      processedLines.push(`<blockquote expandable class="tg-expandable-quote">${expandableQuoteBuffer.join('\n')}</blockquote>`);
      expandableQuoteBuffer = [];
    }
  };

  for (const line of lines) {
    if (/^(?:\*\*&gt;|&gt;&gt;)\s?(.*)$/.test(line)) {
      flushQuote();
      expandableQuoteBuffer.push(line.replace(/^(?:\*\*&gt;|&gt;&gt;)\s?/, ''));
    } else if (/^&gt;\s?(.*)$/.test(line)) {
      flushExpandableQuote();
      quoteBuffer.push(line.replace(/^&gt;\s?/, ''));
    } else {
      flushQuote();
      flushExpandableQuote();
      if (/^\s*(?:---|___|\*\*\*)\s*$/.test(line)) {
        processedLines.push('<span class="tg-hr-line">────────────────────</span>');
      } else if (/^######\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^######\s+(.+)$/, '<b><i><u>$1</u></i></b>'));
      } else if (/^#####\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^#####\s+(.+)$/, '<b><i>$1</i></b>'));
      } else if (/^####\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^####\s+(.+)$/, '<b>$1</b>'));
      } else if (/^###\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^###\s+(.+)$/, '<span class="tg-h3"><b>$1</b></span>'));
      } else if (/^##\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^##\s+(.+)$/, '<span class="tg-h2"><b><u>$1</u></b></span>'));
      } else if (/^#\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^#\s+(.+)$/, '<span class="tg-h1"><b><u>$1</u></b></span>'));
      } else if (/^\s*[-*•]\s+\[(?:x|X|✓|✔)\]\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^\s*[-*•]\s+\[(?:x|X|✓|✔)\]\s+(.+)$/, '☑️ <s>$1</s>'));
      } else if (/^\s*[-*•]\s+\[\s?\]\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^\s*[-*•]\s+\[\s?\]\s+(.+)$/, '⬜ $1'));
      } else if (/^\s*[-*]\s+(.+)$/.test(line)) {
        processedLines.push(line.replace(/^\s*[-*]\s+(.+)$/, '• $1'));
      } else {
        processedLines.push(line);
      }
    }
  }
  flushQuote();
  flushExpandableQuote();
  text = processedLines.join('\n');

  text = text.replace(/~\{([^}\n]+)\}/g, (_, subText) => `<sub class="tg-sub">${toSubscriptPreview(subText)}</sub>`);
  text = text.replace(/\^\{([^}\n]+)\}/g, (_, supText) => `<sup class="tg-sup">${toSuperscriptPreview(supText)}</sup>`);
  text = text.replace(/\[--([^\]\n]+)--\]/g, '<span class="tg-small"><i>$1</i></span>');
  text = text.replace(/==([^\n=]+)==/g, '<mark class="tg-mark"><b><u>$1</u></b></mark>');
  text = text.replace(/\|\|([^\n|]+)\|\|/g, '<tg-spoiler title="Наведите курсор, чтобы раскрыть спойлер">$1</tg-spoiler>');
  text = text.replace(/~~([^\n~]+)~~/g, '<s>$1</s>');
  text = text.replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^\n_]+)__/g, '<u>$1</u>');
  text = text.replace(/(^|[\s(>«"'—–-])\*([^\n*]+)\*(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<b>$2</b>');
  text = text.replace(/(^|[\s(>«"'—–-])_([^\n_]+)_(?=$|[\s).,!?:;»"'<—–-])/gm, '$1<i>$2</i>');

  text = text.replace(/ZXVINLINECODE(\d+)VXZ/g, (_, idx) => inlineCodes[Number(idx)] || '');
  text = text.replace(/ZXVCODEBLOCK(\d+)VXZ/g, (_, idx) => codeBlocks[Number(idx)] || '');
  text = text.replace(/ZXVVARTOKEN(\d+)VXZ/g, (_, idx) => varTokens[Number(idx)] || '');

  return text;
}

function insertAtTextareaCursor(textarea, textToInsert) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = before + textToInsert + after;
  const nextPos = start + textToInsert.length;
  textarea.focus();
  textarea.setSelectionRange(nextPos, nextPos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyMarkdownActionToTextarea(textarea, action) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end);
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  const applyLinePrefix = (linePrefix, fallbackText) => {
    const content = selected || fallbackText;
    const formatted = content
      .split('\n')
      .map((line, idx) => {
        const prefixStr = typeof linePrefix === 'function' ? linePrefix(idx, line) : linePrefix;
        return line.startsWith(prefixStr) ? line : `${prefixStr}${line}`;
      })
      .join('\n');
    const needNewlineBefore = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const replacement = `${needNewlineBefore}${formatted}`;
    textarea.value = before + replacement + after;
    textarea.focus();
    textarea.setSelectionRange(start + needNewlineBefore.length, start + replacement.length);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  let prefix = '';
  let suffix = '';
  let fallback = 'текст';

  switch (action) {
    case 'h1':
      return applyLinePrefix('# ', 'Заголовок 1');
    case 'h2':
      return applyLinePrefix('## ', 'Заголовок 2');
    case 'h3':
      return applyLinePrefix('### ', 'Заголовок 3');
    case 'h4':
      return applyLinePrefix('#### ', 'Заголовок 4');
    case 'h5':
      return applyLinePrefix('##### ', 'Заголовок 5');
    case 'h6':
      return applyLinePrefix('###### ', 'Заголовок 6');
    case 'plain': {
      if (!selected) return;
      const cleaned = selected
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^(?:\*\*>|>>|>)\s?/gm, '')
        .replace(/(\*\*|\*|__|_|~~|\|\||==)/g, '')
        .replace(/\[--([^\]\n]+)--\]/g, '$1')
        .replace(/[~^]\{([^}\n]+)\}/g, '$1');
      textarea.value = before + cleaned + after;
      textarea.focus();
      textarea.setSelectionRange(start, start + cleaned.length);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    case 'bold':
      prefix = '*';
      suffix = '*';
      fallback = 'жирный текст';
      break;
    case 'italic':
      prefix = '_';
      suffix = '_';
      fallback = 'курсив';
      break;
    case 'underline':
      prefix = '__';
      suffix = '__';
      fallback = 'подчёркнутый';
      break;
    case 'strike':
      prefix = '~~';
      suffix = '~~';
      fallback = 'зачёркнутый';
      break;
    case 'code':
      prefix = '`';
      suffix = '`';
      fallback = 'код';
      break;
    case 'pre':
      prefix = '```\n';
      suffix = '\n```';
      fallback = 'блок кода';
      break;
    case 'spoiler':
      prefix = '||';
      suffix = '||';
      fallback = 'скрытый текст';
      break;
    case 'sub':
      prefix = '~{';
      suffix = '}';
      fallback = '2';
      break;
    case 'sup':
      prefix = '^{';
      suffix = '}';
      fallback = '2';
      break;
    case 'mark':
      prefix = '==';
      suffix = '==';
      fallback = 'выделенный текст';
      break;
    case 'small':
      prefix = '[--';
      suffix = '--]';
      fallback = 'мелкий шрифт';
      break;
    case 'quote':
      return applyLinePrefix('> ', 'текст цитаты');
    case 'pullquote':
      return applyLinePrefix('**> ', 'выносная (сворачиваемая) цитата');
    case 'ol':
      return applyLinePrefix((idx) => `${idx + 1}. `, 'Элемент списка');
    case 'ul':
      return applyLinePrefix('• ', 'Элемент списка');
    case 'checklist':
      return applyLinePrefix('- [ ] ', 'Пункт проверки');
    case 'collapse': {
      const innerText = selected || 'Скрытые подробности блока…';
      const needNL = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const replacement = `${needNL}:::collapse Подробнее\n${innerText}\n:::`;
      textarea.value = before + replacement + after;
      textarea.focus();
      textarea.setSelectionRange(start + needNL.length, start + replacement.length);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    case 'hr': {
      const needNL = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const replacement = `${needNL}---\n`;
      textarea.value = before + replacement + after;
      textarea.focus();
      const pos = start + replacement.length;
      textarea.setSelectionRange(pos, pos);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    case 'link': {
      const label = selected || 'Карта РГРТУ';
      const url = '{{webappUrl}}';
      const replacement = `[${label}](${url})`;
      textarea.value = before + replacement + after;
      textarea.focus();
      const urlStart = start + label.length + 3;
      textarea.setSelectionRange(urlStart, urlStart + url.length);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    default:
      return;
  }

  const inner = selected || fallback;
  const replacement = `${prefix}${inner}${suffix}`;
  textarea.value = before + replacement + after;
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, start + prefix.length + inner.length);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function formatDateTime(ts) {
  if (!ts || Number.isNaN(Number(ts))) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(Number(ts)));
  } catch (e) {
    return '—';
  }
}

function formatTimeLeft(expiresAt) {
  const diffSec = Math.max(0, Math.round(((Number(expiresAt) || 0) - Date.now()) / 1000));
  if (diffSec <= 0) return 'Истёк';
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  return `${min} мин ${String(sec).padStart(2, '0')} сек`;
}

function getStoredEditorToken() {
  try {
    return localStorage.getItem(EDITOR_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setStoredEditorToken(token) {
  try {
    if (token) localStorage.setItem(EDITOR_TOKEN_KEY, token);
    else localStorage.removeItem(EDITOR_TOKEN_KEY);
  } catch (e) {}
}

function showToast(text) {
  document.querySelectorAll('.toast').forEach(el => el.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2400);
}

async function adminFetch(url, options = {}) {
  const token = getStoredEditorToken();
  const headers = {
    ...(options.headers || {}),
    'X-Editor-Token': token
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    setStoredEditorToken('');
    showAuthGate('Сессия администратора истекла. Войдите снова.');
    throw new Error('Требуется авторизация');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Ошибка HTTP ${res.status}`);
  }
  return data;
}

// ================ ТЕМА И АВТОРИЗАЦИЯ ================

function setupTheme() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  const updateIcon = () => {
    const theme = document.documentElement.dataset.theme || 'dark';
    btn.innerHTML = theme === 'dark' ? '<i class="mdi mdi-weather-sunny"></i>' : '<i class="mdi mdi-weather-night"></i>';
  };
  updateIcon();
  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    updateIcon();
  });
}

function showAuthGate(message = '') {
  const gate = document.getElementById('editor-auth-gate');
  const errEl = document.getElementById('editor-auth-error');
  const passInput = document.getElementById('editor-auth-password');
  if (!gate) return;
  gate.classList.remove('hidden');
  if (errEl) {
    if (message) {
      errEl.textContent = message;
      errEl.classList.remove('hidden');
    } else {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
  }
  if (passInput) {
    passInput.value = '';
    setTimeout(() => passInput.focus(), 50);
  }
}

function hideAuthGate() {
  const gate = document.getElementById('editor-auth-gate');
  if (gate) gate.classList.add('hidden');
}

function setupAuthForm() {
  const form = document.getElementById('editor-auth-form');
  const passInput = document.getElementById('editor-auth-password');
  const errEl = document.getElementById('editor-auth-error');
  if (!form || !passInput) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passInput.value.trim();
    if (!password) return;
    try {
      const res = await fetch('/api/editor/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.token) {
        if (errEl) {
          errEl.textContent = data.error || 'Неверный пароль администратора';
          errEl.classList.remove('hidden');
        }
        return;
      }
      setStoredEditorToken(data.token);
      hideAuthGate();
      showToast('Вход выполнен');
      await loadAllAdminData();
    } catch (err) {
      if (errEl) {
        errEl.textContent = 'Ошибка соединения с сервером';
        errEl.classList.remove('hidden');
      }
    }
  });
}

// ================ НАВИГАЦИЯ ПО РАЗДЕЛАМ ================

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.admin-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

function setupNavigation() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// ================ ЗАГРУЗКА ДАННЫХ ================

async function loadAllAdminData() {
  try {
    const [overview, roomsResp, dirResp] = await Promise.all([
      adminFetch('/api/admin/overview'),
      adminFetch('/api/admin/rooms'),
      fetch('/api/schedule-directory').then(r => r.ok ? r.json() : { groups: [], lecturers: [] }).catch(() => ({ groups: [], lecturers: [] }))
    ]);

    state.users = Array.isArray(overview.users) ? overview.users : [];
    state.authCodes = Array.isArray(overview.authCodes) ? overview.authCodes : [];
    state.authSessions = Array.isArray(overview.authSessions) ? overview.authSessions : [];
    state.botTemplates = Array.isArray(overview.botTemplates) ? overview.botTemplates : [];
    state.mapMarkers = Array.isArray(overview.mapMarkers) ? overview.mapMarkers : [];
    state.roomReviews = Array.isArray(overview.roomReviews) ? overview.roomReviews : [];
    state.descriptionSuggestions = Array.isArray(overview.descriptionSuggestions) ? overview.descriptionSuggestions : [];
    state.gpsConfig = overview.gpsConfig || {};
    state.cloud = overview.cloud || {};
    state.bot = overview.bot || {};
    state.cache = overview.cache || {};
    state.rooms = (roomsResp && roomsResp.rooms) || {};
    state.directory = {
      groups: Array.isArray(dirResp.groups) ? dirResp.groups : [],
      lecturers: Array.isArray(dirResp.lecturers) ? dirResp.lecturers : []
    };

    if (state.botTemplates.length > 0 && !state.botTemplates.some(t => t.id === state.selectedTemplateId)) {
      state.selectedTemplateId = state.botTemplates[0].id;
    }

    renderUsersTab();
    renderBotTab();
    renderModerationTab();
    renderCloudTab();
    renderRoomsTab();
    renderCacheTab();
  } catch (e) {
    if (!String(e.message).includes('Требуется авторизация')) {
      showToast(e.message || 'Не удалось загрузить данные');
    }
  }
}

// ================ ВКЛАДКА 1: ПОЛЬЗОВАТЕЛИ ================

function renderUsersTab() {
  const total = state.users.length;
  const q = state.userSearch.toLowerCase().replace(/ё/g, 'е').trim();
  const filtered = state.users.filter(u => {
    if (state.userFilter === 'telegram' && !u.telegramId) return false;
    if (state.userFilter === 'student' && (u.role || 'student') !== 'student') return false;
    if (state.userFilter === 'lecturer' && u.role !== 'lecturer') return false;
    if (state.userFilter === 'notif' && !(u.telegramId && u.targetName && u.notificationsEnabled !== false)) return false;

    if (!q) return true;
    const hay = `${u.id} ${u.telegramId || ''} ${u.firstName || ''} ${u.username || ''} ${u.targetName || ''}`
      .toLowerCase()
      .replace(/ё/g, 'е');
    return hay.includes(q);
  });

  const countCaption = document.getElementById('users-count-caption');
  if (countCaption) {
    countCaption.textContent = filtered.length === total
      ? `Выведено записей: ${filtered.length}`
      : `Выведено записей: ${filtered.length} из ${total}`;
  }

  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    closeUserContextMenu();
    tbody.innerHTML = `<tr><td colspan="6" class="admin-empty-cell">Пользователи по выбранному фильтру не найдены</td></tr>`;
    return;
  }

  closeUserContextMenu();

  tbody.innerHTML = filtered.map(u => {
    const displayName = u.firstName || (u.username ? `@${u.username}` : 'Без имени');
    const tgMeta = [
      u.telegramId ? `ID ${u.telegramId}` : 'Не привязан',
      u.username ? `@${u.username}` : ''
    ].filter(Boolean).join(' · ');

    const roleLabel = u.role === 'lecturer' ? 'Преподаватель' : 'Студент';
    const targetLabel = u.targetName || 'не выбрано';
    const notifStatus = u.notificationsEnabled !== false
      ? (u.telegramId && u.targetName ? 'Включены · активны' : 'Включены (ждёт привязки)')
      : 'Выключены';
    const slotsCount = Array.isArray(u.notifiedSlots) ? u.notifiedSlots.length : (u.lastNotifiedSlot ? 1 : 0);
    const favCount = Array.isArray(u.favorites) ? u.favorites.length : 0;
    const recentCount = u.recentViews && typeof u.recentViews === 'object' ? Object.keys(u.recentViews).length : 0;

    return `
      <tr class="admin-user-row" data-uid="${escapeHtml(u.id)}" title="Нажмите правой кнопкой мыши для вызова меню действий">
        <td>
          <div class="admin-row-title">${escapeHtml(displayName)}</div>
          <div class="admin-row-sub tabular-nums">${escapeHtml(u.id)} · тема: ${escapeHtml(u.theme || 'system')}</div>
        </td>
        <td class="tabular-nums">${escapeHtml(tgMeta)}</td>
        <td>
          <div class="admin-row-title">${escapeHtml(roleLabel)}</div>
          <div class="admin-row-sub">${escapeHtml(targetLabel)}</div>
        </td>
        <td>
          <div>${escapeHtml(notifStatus)}</div>
          <div class="admin-row-sub tabular-nums">Отправлено слотов: ${slotsCount}</div>
        </td>
        <td class="tabular-nums">${favCount} избр. · ${recentCount} просм.</td>
        <td class="tabular-nums">${escapeHtml(formatDateTime(u.updatedAt))}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr.admin-user-row').forEach(row => {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const uid = row.dataset.uid;
      if (!uid) return;
      openUserContextMenu(uid, e.clientX, e.clientY, row);
    });
  });
}

function closeUserContextMenu() {
  const menu = document.getElementById('users-context-menu');
  if (menu) {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
  }
  document.querySelectorAll('tr.admin-user-row.context-active').forEach(r => r.classList.remove('context-active'));
}

function openUserContextMenu(userId, clientX, clientY, rowEl) {
  const menu = document.getElementById('users-context-menu');
  const u = state.users.find(x => x.id === userId);
  if (!menu || !u) return;

  document.querySelectorAll('tr.admin-user-row.context-active').forEach(r => r.classList.remove('context-active'));
  if (rowEl) rowEl.classList.add('context-active');

  const displayName = u.firstName || (u.username ? `@${u.username}` : u.id);

  menu.innerHTML = `
    <div class="admin-context-menu-header">${escapeHtml(displayName)}</div>
    ${u.telegramId ? `
      <button type="button" class="admin-context-item" role="menuitem" data-ctx-action="test-user-lesson" data-uid="${escapeHtml(u.id)}">Тест пары</button>
      <button type="button" class="admin-context-item" role="menuitem" data-ctx-action="msg-user-tg" data-uid="${escapeHtml(u.id)}">Сообщение</button>
    ` : ''}
    <button type="button" class="admin-context-item" role="menuitem" data-ctx-action="edit-user" data-uid="${escapeHtml(u.id)}">Изменить</button>
    <button type="button" class="admin-context-item danger" role="menuitem" data-ctx-action="delete-user" data-uid="${escapeHtml(u.id)}">Удалить</button>
  `;

  menu.classList.add('open');
  menu.setAttribute('aria-hidden', 'false');

  // Позиционирование в пределах вьюпорта
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;
  const rect = menu.getBoundingClientRect();
  const pad = 10;
  let nextLeft = clientX;
  let nextTop = clientY;
  if (clientX + rect.width + pad > window.innerWidth) {
    nextLeft = Math.max(pad, window.innerWidth - rect.width - pad);
  }
  if (clientY + rect.height + pad > window.innerHeight) {
    nextTop = Math.max(pad, window.innerHeight - rect.height - pad);
  }
  menu.style.left = `${nextLeft}px`;
  menu.style.top = `${nextTop}px`;

  menu.querySelectorAll('[data-ctx-action]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const action = btn.dataset.ctxAction;
      const uid = btn.dataset.uid;
      closeUserContextMenu();
      if (action === 'edit-user') {
        openUserModal(uid);
      } else if (action === 'delete-user') {
        confirmDeleteUser(uid);
      } else if (action === 'test-user-lesson') {
        sendTestLessonToUser(uid);
      } else if (action === 'msg-user-tg') {
        const targetUser = state.users.find(x => x.id === uid);
        if (!targetUser || !targetUser.telegramId) return;
        switchTab('bot');
        const sel = document.getElementById('bot-direct-user-select');
        if (sel) sel.value = targetUser.id;
        document.getElementById('bot-direct-text')?.focus();
      }
    });
  });
}

function openUserModal(userId = null) {
  const modal = document.getElementById('user-modal-backdrop');
  const titleEl = document.getElementById('user-modal-title');
  const idInput = document.getElementById('edit-user-id');
  const tgInput = document.getElementById('edit-user-tgid');
  const unInput = document.getElementById('edit-user-username');
  const roleSel = document.getElementById('edit-user-role');
  const notifCheck = document.getElementById('edit-user-notif');
  const deleteBtn = document.getElementById('btn-user-modal-delete');

  const existing = userId ? state.users.find(u => u.id === userId) : null;
  state.editingUserId = existing ? existing.id : null;

  titleEl.textContent = existing ? `Профиль: ${existing.firstName || existing.username || existing.id}` : 'Новый пользователь';
  if (idInput) idInput.value = existing ? existing.id : '';
  if (tgInput) tgInput.value = existing && existing.telegramId ? String(existing.telegramId) : '';
  if (unInput) unInput.value = existing ? (existing.username || '') : '';
  if (roleSel) roleSel.value = existing && existing.role === 'lecturer' ? 'lecturer' : 'student';
  if (notifCheck) notifCheck.checked = existing ? existing.notificationsEnabled !== false : true;

  if (deleteBtn) {
    deleteBtn.style.display = existing ? 'inline-flex' : 'none';
  }

  modal.classList.add('open');
}

function closeUserModal() {
  const modal = document.getElementById('user-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

async function saveUserFromModal() {
  const idVal = document.getElementById('edit-user-id')?.value.trim() || '';
  const tgVal = document.getElementById('edit-user-tgid')?.value.trim() || '';
  const unVal = (document.getElementById('edit-user-username')?.value || '').replace(/^@/, '').trim();
  const roleVal = document.getElementById('edit-user-role')?.value || 'student';
  const notifVal = Boolean(document.getElementById('edit-user-notif')?.checked);

  const existing = state.editingUserId ? state.users.find(u => u.id === state.editingUserId) : null;

  try {
    await adminFetch('/api/admin/user/save', {
      method: 'POST',
      body: JSON.stringify({
        userId: idVal || (tgVal ? `tg_${tgVal}` : ''),
        telegramId: tgVal ? Number(tgVal) : null,
        firstName: existing ? (existing.firstName || unVal || '') : (unVal || ''),
        username: unVal,
        role: roleVal,
        targetName: existing ? (existing.targetName || '') : '',
        theme: existing ? (existing.theme || 'system') : 'system',
        notificationsEnabled: notifVal,
        favorites: existing && Array.isArray(existing.favorites) ? existing.favorites : [],
        recentViews: existing && existing.recentViews ? existing.recentViews : {},
        resetNotifiedSlots: false
      })
    });
    closeUserModal();
    showToast('Профиль сохранён и синхронизирован с облачной БД');
    await loadAllAdminData();
  } catch (e) {
    showToast(e.message);
  }
}

async function confirmDeleteUser(userId) {
  if (!userId) return;
  try {
    await adminFetch('/api/admin/user/delete', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    closeUserModal();
    showToast(`Профиль ${userId} удалён`);
    await loadAllAdminData();
  } catch (e) {
    showToast(e.message);
  }
}

async function sendTestLessonToUser(userId, telegramId = null) {
  try {
    showToast('Отправляю тестовое уведомление о паре…');
    const res = await adminFetch('/api/admin/bot/send', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'test-lesson',
        userId,
        telegramId
      })
    });
    showToast('Тестовое уведомление доставлено в Telegram!');
    const box = document.getElementById('bot-direct-result');
    if (box && res.previewText) {
      box.textContent = `Успешно отправлено:\n\n${res.previewText}`;
      box.classList.remove('hidden');
    }
  } catch (e) {
    showToast(e.message);
  }
}

// ================ ВКЛАДКА 2: TELEGRAM-БОТ, ШАБЛОНЫ И РАССЫЛКИ ================

function renderBotTab() {
  const linkedUsers = state.users.filter(u => u.telegramId);
  const sel = document.getElementById('bot-direct-user-select');
  if (sel) {
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">— Выберите пользователя (${linkedUsers.length}) —</option>` +
      linkedUsers.map(u => {
        const name = u.firstName || (u.username ? `@${u.username}` : u.id);
        const target = u.targetName ? ` · ${u.targetName}` : '';
        return `<option value="${escapeHtml(u.id)}" data-tgid="${escapeHtml(u.telegramId)}">${escapeHtml(name)} (ID ${escapeHtml(u.telegramId)}${escapeHtml(target)})</option>`;
      }).join('');
    if (currentVal) sel.value = currentVal;
  }

  renderBotTemplateStudio();
}

function renderBotTemplateStudio() {
  const menuEl = document.getElementById('bot-tpl-dropdown-menu');
  if (menuEl) {
    const q = state.templateSearch.toLowerCase().replace(/ё/g, 'е').trim();
    const filtered = state.botTemplates.filter(tpl => {
      if (!q) return true;
      const hay = `${tpl.id} ${tpl.title} ${tpl.category} ${tpl.trigger} ${tpl.description}`
        .toLowerCase()
        .replace(/ё/g, 'е');
      return hay.includes(q);
    });

    if (filtered.length === 0) {
      menuEl.innerHTML = `<div class="admin-empty-cell" style="padding:14px">Шаблоны не найдены</div>`;
    } else {
      const byCategory = new Map();
      for (const tpl of filtered) {
        const cat = tpl.category || 'Сообщения';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(tpl);
      }

      let html = '';
      for (const [cat, items] of byCategory.entries()) {
        html += `<div class="admin-tpl-cat-header">${escapeHtml(cat)}</div>`;
        for (const tpl of items) {
          const isActive = tpl.id === state.selectedTemplateId;
          const isEnabled = tpl.enabled !== false;
          html += `
            <button type="button" class="admin-tpl-item ${isActive ? 'active' : ''} ${!isEnabled ? 'disabled-tpl' : ''}" data-tpl-id="${escapeHtml(tpl.id)}">
              <div class="admin-tpl-item-top">
                <span class="admin-tpl-item-title">${escapeHtml(tpl.title)}</span>
                ${!isEnabled ? '<span class="admin-tpl-item-badges"><span class="admin-tpl-item-off">Отключён</span></span>' : ''}
              </div>
              <div class="admin-tpl-item-sub">${escapeHtml(tpl.trigger)}</div>
            </button>
          `;
        }
      }
      menuEl.innerHTML = html;

      menuEl.querySelectorAll('[data-tpl-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.selectedTemplateId = btn.dataset.tplId;
          state.templateSearch = '';
          const searchInp = document.getElementById('bot-tpl-search');
          if (searchInp) searchInp.value = '';
          document.getElementById('bot-tpl-picker-wrap')?.classList.remove('open');
          renderBotTemplateStudio();
        });
      });
    }
  }

  renderSelectedTemplateEditor();
}

function getSelectedTemplateObject() {
  return state.botTemplates.find(t => t.id === state.selectedTemplateId) || state.botTemplates[0] || null;
}

function renderSelectedTemplateEditor() {
  const tpl = getSelectedTemplateObject();
  if (!tpl) return;

  const titleEl = document.getElementById('bot-tpl-title');
  const enabledToggle = document.getElementById('bot-tpl-enabled-toggle');
  const enabledLabel = document.getElementById('bot-tpl-enabled-label');
  const descEl = document.getElementById('bot-tpl-desc');
  const varsEl = document.getElementById('bot-tpl-vars');
  const textarea = document.getElementById('bot-tpl-textarea');
  const senderEl = document.getElementById('bot-tpl-preview-sender');

  const isEnabled = tpl.enabled !== false;
  if (titleEl) titleEl.textContent = tpl.title;
  if (enabledToggle) enabledToggle.checked = isEnabled;
  if (enabledLabel) {
    enabledLabel.textContent = isEnabled ? 'Включён' : 'Отключён';
    enabledLabel.classList.toggle('is-off', !isEnabled);
  }
  if (descEl) descEl.textContent = tpl.description || '';
  if (senderEl) {
    senderEl.textContent = state.bot.username ? `Карта РГРТУ (@${state.bot.username})` : 'Карта РГРТУ · Бот';
  }

  if (varsEl) {
    const vars = Array.isArray(tpl.variables) ? tpl.variables : [];
    const extraVars = [
      { key: 'webappUrl', label: 'Ссылка на Карту', sample: 'https://ais-pre-irnfdqzemrx7nu7xzzdevi-814881682897.us-east1.run.app/' },
      { key: 'scheduleUrl', label: 'Ссылка на Расписание', sample: 'https://ais-pre-irnfdqzemrx7nu7xzzdevi-814881682897.us-east1.run.app/?view=schedule' }
    ];
    const allVars = [...vars];
    for (const ev of extraVars) {
      if (!allVars.some(v => v.key === ev.key)) allVars.push(ev);
    }

    varsEl.innerHTML = `<div class="admin-md-dropdown-group-label">Переменные шаблона</div>` +
      allVars.map(v => `
        <button type="button" class="admin-md-menu-item admin-var-menu-item" data-var-insert="{{${escapeHtml(v.key)}}}" title="Пример: ${escapeHtml(v.sample || '')}">
          <code class="admin-var-code">{{${escapeHtml(v.key)}}}</code>
          <span class="admin-var-desc">${escapeHtml(v.label)}</span>
        </button>
      `).join('');

    varsEl.querySelectorAll('[data-var-insert]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertAtTextareaCursor(textarea, btn.dataset.varInsert);
        document.querySelectorAll('.admin-md-dropdown.open').forEach(d => d.classList.remove('open'));
      });
    });
  }

  if (textarea && textarea.dataset.loadedTplId !== tpl.id) {
    textarea.value = tpl.text || '';
    textarea.dataset.loadedTplId = tpl.id;
  }

  if (state.loadedButtonsTplId !== tpl.id) {
    const sourceButtons = Array.isArray(tpl.buttons) ? tpl.buttons : (Array.isArray(tpl.defaultButtons) ? tpl.defaultButtons : []);
    state.editingTemplateButtons = sourceButtons.map(b => ({
      text: String(b.text || ''),
      type: String(b.type || 'callback'),
      value: String(b.value || '')
    }));
    state.loadedButtonsTplId = tpl.id;
  }

  renderTemplateButtonsEditor();
  updateLiveTemplatePreview();
}

function renderTemplateButtonsEditor() {
  const listEl = document.getElementById('bot-tpl-buttons-list');
  if (!listEl) return;

  const buttons = Array.isArray(state.editingTemplateButtons) ? state.editingTemplateButtons : [];
  if (buttons.length === 0) {
    listEl.innerHTML = `<div class="admin-tpl-buttons-empty">У этого шаблона сейчас нет прикреплённых кнопок. Нажмите «Добавить кнопку», чтобы прикрепить WebApp, ссылку или команду.</div>`;
    return;
  }

  listEl.innerHTML = buttons.map((btn, idx) => `
    <div class="admin-tpl-button-row" data-btn-idx="${idx}">
      <input type="text" class="admin-input tpl-btn-text-input" data-btn-idx="${idx}" value="${escapeHtml(btn.text)}" placeholder="Текст на кнопке (напр. 🗺 Карта)">
      <select class="admin-select tpl-btn-type-select" data-btn-idx="${idx}">
        <option value="webapp" ${btn.type === 'webapp' ? 'selected' : ''}>WebApp (мини-приложение)</option>
        <option value="url" ${btn.type === 'url' ? 'selected' : ''}>URL (внешняя ссылка)</option>
        <option value="callback" ${btn.type === 'callback' ? 'selected' : ''}>Callback (команда боту)</option>
        <option value="reply" ${btn.type === 'reply' ? 'selected' : ''}>Reply (нижняя кнопка)</option>
      </select>
      <input type="text" class="admin-input tpl-btn-val-input tabular-nums" data-btn-idx="${idx}" value="${escapeHtml(btn.value)}" placeholder="URL или callback (напр. {{webappUrl}} или my_profile)">
      <button type="button" class="admin-icon-btn danger tpl-btn-remove" data-btn-idx="${idx}" title="Удалить кнопку">
        <i class="mdi mdi-delete-outline"></i>
      </button>
    </div>
  `).join('');

  listEl.querySelectorAll('.tpl-btn-text-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.btnIdx);
      if (state.editingTemplateButtons[idx]) {
        state.editingTemplateButtons[idx].text = inp.value;
        updateLiveTemplatePreview();
      }
    });
  });

  listEl.querySelectorAll('.tpl-btn-type-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.btnIdx);
      if (state.editingTemplateButtons[idx]) {
        state.editingTemplateButtons[idx].type = sel.value;
        updateLiveTemplatePreview();
      }
    });
  });

  listEl.querySelectorAll('.tpl-btn-val-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.btnIdx);
      if (state.editingTemplateButtons[idx]) {
        state.editingTemplateButtons[idx].value = inp.value;
        updateLiveTemplatePreview();
      }
    });
  });

  listEl.querySelectorAll('.tpl-btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.btnIdx);
      state.editingTemplateButtons.splice(idx, 1);
      renderTemplateButtonsEditor();
      updateLiveTemplatePreview();
    });
  });
}

function updateLiveTemplatePreview() {
  const tpl = getSelectedTemplateObject();
  const textarea = document.getElementById('bot-tpl-textarea');
  const previewBody = document.getElementById('bot-tpl-preview-body');
  const previewTime = document.getElementById('bot-tpl-preview-time');
  const previewBtns = document.getElementById('bot-tpl-preview-buttons');
  if (!tpl || !textarea || !previewBody) return;

  const sampleVars = {
    webappUrl: 'https://ais-pre-irnfdqzemrx7nu7xzzdevi-814881682897.us-east1.run.app/',
    scheduleUrl: 'https://ais-pre-irnfdqzemrx7nu7xzzdevi-814881682897.us-east1.run.app/?view=schedule',
    roomUrl: 'https://ais-pre-irnfdqzemrx7nu7xzzdevi-814881682897.us-east1.run.app/?room=322'
  };
  for (const v of (tpl.variables || [])) {
    sampleVars[v.key] = v.sample || '';
  }

  previewBody.innerHTML = renderTelegramMarkdownPreview(textarea.value, sampleVars);

  if (previewTime) {
    const now = new Date();
    const statusNote = tpl.enabled === false ? ' · ОТКЛЮЧЁН' : ' · HTML/Markdown';
    previewTime.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}${statusNote}`;
  }

  if (previewBtns) {
    const buttons = (state.editingTemplateButtons || []).filter(b => b && String(b.text || '').trim());
    if (buttons.length === 0) {
      previewBtns.innerHTML = '';
    } else {
      previewBtns.innerHTML = buttons.map(b => {
        const label = String(b.text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => sampleVars[k] || `{{${k}}}`);
        const badgeIcon = b.type === 'webapp' ? '🌐' : (b.type === 'url' ? '↗' : (b.type === 'reply' ? '⌨' : '⚡'));
        return `<div class="admin-tg-preview-btn ${b.type === 'reply' ? 'is-reply' : 'is-inline'}" title="${escapeHtml(b.type)}: ${escapeHtml(b.value)}"><span>${escapeHtml(label)}</span><small>${badgeIcon}</small></div>`;
      }).join('');
    }
  }
}

// ================ ВКЛАДКА 3: ОБЛАЧНАЯ БД, КОДЫ И СЕССИИ ================

function renderCloudTab() {
  const c = state.cloud || {};
  const statusLine = document.getElementById('cloud-status-line');
  if (statusLine) {
    statusLine.textContent = c.enabled
      ? `Управление синхронизацией с Google Cloud Firestore (${c.projectId}), резервными копиями JSON, 6-значными кодами входа и браузерными сессиями`
      : 'Локальный режим (users.json) — управление резервными копиями, 6-значными кодами входа и браузерными сессиями';
  }

  const fbLink = document.getElementById('link-firebase-console');
  const gcpLink = document.getElementById('link-gcp-console');
  if (fbLink && c.firebaseConsoleUrl) fbLink.href = c.firebaseConsoleUrl;
  if (gcpLink && c.gcpConsoleUrl) gcpLink.href = c.gcpConsoleUrl;

  const codesBody = document.getElementById('codes-table-body');
  if (codesBody) {
    if (state.authCodes.length === 0) {
      codesBody.innerHTML = `<tr><td colspan="4" class="admin-empty-cell">Активных 6-значных кодов нет</td></tr>`;
    } else {
      codesBody.innerHTML = state.authCodes.map(item => `
        <tr>
          <td><strong class="tabular-nums" style="font-size:15px">${escapeHtml(item.code)}</strong></td>
          <td class="tabular-nums">ID ${escapeHtml(item.telegramId)} · ${escapeHtml(item.firstName || item.username || '—')}</td>
          <td class="tabular-nums">${escapeHtml(formatTimeLeft(item.expiresAt))}</td>
          <td class="text-right">
            <button type="button" class="admin-icon-btn danger" data-del-code="${escapeHtml(item.code)}">Удалить</button>
          </td>
        </tr>
      `).join('');
      codesBody.querySelectorAll('[data-del-code]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await adminFetch('/api/admin/auth/action', {
            method: 'POST',
            body: JSON.stringify({ action: 'delete-code', code: btn.dataset.delCode })
          });
          await loadAllAdminData();
        });
      });
    }
  }

  const sessBody = document.getElementById('sessions-table-body');
  if (sessBody) {
    if (state.authSessions.length === 0) {
      sessBody.innerHTML = `<tr><td colspan="5" class="admin-empty-cell">Активных браузерных сессий нет</td></tr>`;
    } else {
      sessBody.innerHTML = state.authSessions.map(item => `
        <tr>
          <td class="tabular-nums">${escapeHtml(item.token.slice(0, 12))}…</td>
          <td>${item.status === 'verified' ? 'Подтверждена' : 'Ожидает в боте'}</td>
          <td class="tabular-nums">${escapeHtml(item.userId || '—')}</td>
          <td class="tabular-nums">${escapeHtml(formatTimeLeft(item.expiresAt))}</td>
          <td class="text-right">
            <button type="button" class="admin-icon-btn danger" data-del-sess="${escapeHtml(item.token)}">Удалить</button>
          </td>
        </tr>
      `).join('');
      sessBody.querySelectorAll('[data-del-sess]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await adminFetch('/api/admin/auth/action', {
            method: 'POST',
            body: JSON.stringify({ action: 'delete-session', token: btn.dataset.delSess })
          });
          await loadAllAdminData();
        });
      });
    }
  }
}

// ================ ВКЛАДКА 4: СПРАВОЧНИК АУДИТОРИЙ (rooms.json) ================

function classifyRoomFilterGroup(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'classroom' || t === 'auditorium' || t === 'lecture') return 'classroom';
  if (t === 'department' || t === 'chair' || t === 'teacher') return 'department';
  if (t === 'lab' || t === 'laboratory') return 'lab';
  if (t === 'deanery' || t === 'admin' || t === 'office') return 'deanery';
  if (t === 'buffet' || t === 'canteen' || t === 'cafe') return 'buffet';
  if (t === 'wc' || t === 'toilet' || t === 'restroom') return 'wc';
  if (t === 'gym' || t === 'sport') return 'gym';
  if (t === 'entrance' || t === 'wardrobe' || t === 'cloakroom') return 'entrance';
  return 'other';
}

function renderRoomsTab() {
  const entries = Object.entries(state.rooms || {});
  const q = state.roomSearch.toLowerCase().replace(/ё/g, 'е').trim();
  const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

  const filtered = entries
    .filter(([roomId, r]) => {
      if (!r) return false;
      if (state.roomFloorFilter !== 'all' && String(r.floor) !== state.roomFloorFilter) return false;
      if (state.roomTypeFilter !== 'all') {
        const group = classifyRoomFilterGroup(r.type);
        if (group !== state.roomTypeFilter && String(r.type || '') !== state.roomTypeFilter) return false;
      }
      if (!q) return true;
      const hay = `${roomId} ${r.shortName || ''} ${r.name || ''} ${r.classroom || ''} ${r.description || ''}`
        .toLowerCase()
        .replace(/ё/g, 'е');
      return hay.includes(q);
    })
    .sort((a, b) => {
      const fDiff = (Number(a[1].floor) || 0) - (Number(b[1].floor) || 0);
      if (fDiff !== 0) return fDiff;
      return collator.compare(a[1].shortName || a[1].name || a[0], b[1].shortName || b[1].name || b[0]);
    });

  const countEl = document.getElementById('rooms-count-caption');
  if (countEl) {
    countEl.textContent = filtered.length === entries.length
      ? `Выведено помещений: ${filtered.length}`
      : `Выведено помещений: ${filtered.length} из ${entries.length}`;
  }

  const tbody = document.getElementById('rooms-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="admin-empty-cell">Помещения по запросу не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(([roomId, r]) => {
    const typeLabel = ROOM_TYPE_LABELS[r.type] || r.type || '—';
    return `
      <tr>
        <td class="tabular-nums">${escapeHtml(roomId)}</td>
        <td><strong>${escapeHtml(r.shortName || '—')}</strong></td>
        <td>${escapeHtml(r.name || '—')}</td>
        <td class="tabular-nums">${escapeHtml(r.floor != null ? `${r.floor} эт.` : '—')}</td>
        <td>${escapeHtml(typeLabel)}</td>
        <td class="tabular-nums">${escapeHtml(r.classroom || '—')}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.description || '—')}</td>
        <td class="text-right">
          <div class="admin-row-actions">
            <button type="button" class="admin-icon-btn" data-edit-room="${escapeHtml(roomId)}">Изменить</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-edit-room]').forEach(btn => {
    btn.addEventListener('click', () => openRoomModal(btn.dataset.editRoom));
  });
}

function openRoomModal(roomId = null) {
  const modal = document.getElementById('room-modal-backdrop');
  const titleEl = document.getElementById('room-modal-title');
  const idInput = document.getElementById('edit-room-id');
  const shortInput = document.getElementById('edit-room-short');
  const nameInput = document.getElementById('edit-room-name');
  const floorSel = document.getElementById('edit-room-floor');
  const typeInput = document.getElementById('edit-room-type');
  const clsInput = document.getElementById('edit-room-classroom');
  const bldInput = document.getElementById('edit-room-building');
  const descInput = document.getElementById('edit-room-desc');
  const delBtn = document.getElementById('btn-room-modal-delete');

  const existing = roomId ? state.rooms[roomId] : null;
  state.editingRoomId = existing ? roomId : null;

  if (titleEl) titleEl.textContent = existing ? `Помещение: ${existing.name || roomId}` : 'Новое помещение';
  if (idInput) {
    idInput.value = existing ? roomId : 'C_auditori_';
    idInput.readOnly = Boolean(existing);
  }
  if (shortInput) shortInput.value = existing ? (existing.shortName || '') : '';
  if (nameInput) nameInput.value = existing ? (existing.name || '') : '';
  if (floorSel) floorSel.value = existing && existing.floor != null ? String(existing.floor) : '1';
  if (typeInput) typeInput.value = existing ? (existing.type || 'classroom') : 'classroom';
  if (clsInput) clsInput.value = existing ? (existing.classroom || '') : '';
  if (bldInput) bldInput.value = existing ? (existing.building || 'C') : 'C';
  if (descInput) descInput.value = existing ? (existing.description || '') : '';

  if (delBtn) delBtn.style.display = existing ? 'inline-flex' : 'none';
  if (modal) modal.classList.add('open');
}

function closeRoomModal() {
  const modal = document.getElementById('room-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

async function saveRoomFromModal() {
  const roomId = document.getElementById('edit-room-id')?.value.trim() || '';
  const room = {
    shortName: document.getElementById('edit-room-short')?.value.trim() || '',
    name: document.getElementById('edit-room-name')?.value.trim() || '',
    floor: Number(document.getElementById('edit-room-floor')?.value || 1),
    type: document.getElementById('edit-room-type')?.value.trim() || 'classroom',
    classroom: document.getElementById('edit-room-classroom')?.value.trim() || '',
    building: document.getElementById('edit-room-building')?.value.trim() || 'C',
    description: document.getElementById('edit-room-desc')?.value.trim() || ''
  };

  try {
    await adminFetch('/api/admin/rooms/save', {
      method: 'POST',
      body: JSON.stringify({ mode: 'upsert', roomId, room })
    });
    closeRoomModal();
    showToast(`Помещение ${room.name} сохранено в rooms.json`);
    await loadAllAdminData();
  } catch (e) {
    showToast(e.message);
  }
}

async function deleteRoomFromModal() {
  if (!state.editingRoomId) return;
  try {
    await adminFetch('/api/admin/rooms/save', {
      method: 'POST',
      body: JSON.stringify({ mode: 'delete', roomId: state.editingRoomId })
    });
    closeRoomModal();
    showToast(`Помещение ${state.editingRoomId} удалено`);
    await loadAllAdminData();
  } catch (e) {
    showToast(e.message);
  }
}

// ================ ВКЛАДКА 5: КЭШ РАСПИСАНИЯ И ИНСПЕКТОР ================

let initialInspectorLoaded = false;

function renderCacheTab() {
  const c = state.cache || {};
  const statusEl = document.getElementById('cache-status-line');
  if (statusEl) {
    const stText = c.warming ? `Прогрев (${c.progress || ''})` : (c.ready ? 'Актуален' : 'Ожидание');
    statusEl.textContent = `Статус кэша: ${stText} · Аудиторий в кэше: ${c.roomsCachedCount || 0} · Групп: ${c.groupsCount || 0} · Преподавателей: ${c.lecturersCount || 0} · Обновлён: ${formatDateTime(c.lastUpdate)}`;
  }
  if (!initialInspectorLoaded) {
    initialInspectorLoaded = true;
    runScheduleInspector();
  }
}

async function runScheduleInspector() {
  const type = document.getElementById('inspector-type').value;
  const name = document.getElementById('inspector-name').value.trim();
  const resultEl = document.getElementById('inspector-result');
  if (!name || !resultEl) return;

  resultEl.innerHTML = 'Загрузка расписания…';
  try {
    const res = await fetch(`/api/entity-schedule?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
    const data = await res.json();
    if (!res.ok || data.error) {
      resultEl.innerHTML = `<div style="color:#ef4444">${escapeHtml(data.error || 'Расписание не найдено')}</div>`;
      return;
    }

    const daysWithLessons = (data.days || []).filter(d => Array.isArray(d.lessons) && d.lessons.length > 0);
    const statusTitle = data.nowStatus ? data.nowStatus.title : '';
    const statusDetails = data.nowStatus ? data.nowStatus.details : '';

    const daysHtml = daysWithLessons.map(d => {
      const items = d.lessons.map(l => {
        const sub = l.subgroup ? ` · ${l.subgroup}` : '';
        const room = l.roomShort ? `ауд. ${l.roomShort}` : 'без ауд.';
        const who = type === 'lecturer' ? (l.group || '') : (l.lecturer || '');
        return `<div style="padding:4px 0;border-bottom:1px solid var(--panel-border)" class="tabular-nums"><strong>${escapeHtml(l.time)}</strong> · ${escapeHtml(l.type || '')} ${escapeHtml(l.subject)}${escapeHtml(sub)} · ${escapeHtml(room)} ${who ? `· ${escapeHtml(who)}` : ''}</div>`;
      }).join('');
      return `
        <div style="margin-top:12px">
          <div style="font-weight:700;color:var(--text-bright);margin-bottom:4px">${escapeHtml(d.dayName)} (${escapeHtml(d.date)})</div>
          ${items}
        </div>
      `;
    }).join('');

    resultEl.innerHTML = `
      <div style="padding:12px 14px;border-radius:9px;background:var(--btn-bg);border:1px solid var(--panel-border)">
        <div style="font-weight:700;font-size:15px;color:var(--text-bright)">${escapeHtml(data.fullName || data.name)} ${data.faculty ? `· ${escapeHtml(data.faculty)}` : ''} ${data.regalia ? `· ${escapeHtml(data.regalia)}` : ''}</div>
        <div style="margin-top:4px;color:var(--text-muted)">${escapeHtml(statusTitle)} — ${escapeHtml(statusDetails)}</div>
        <div style="margin-top:4px;font-size:12px;color:var(--text-dim)" class="tabular-nums">Учебная неделя: ${escapeHtml(data.selectedWeek ? data.selectedWeek.label : 'текущая')} · Всего пар на неделе: ${escapeHtml(data.lessonsCount)}</div>
      </div>
      ${daysHtml || '<div style="margin-top:12px;color:var(--text-muted)">На выбранной неделе нет пар</div>'}
    `;
  } catch (e) {
    resultEl.innerHTML = `<div style="color:#ef4444">${escapeHtml(e.message)}</div>`;
  }
}

// ================ ВКЛАДКА 6: МОДЕРАЦИЯ (POI, ОТЗЫВЫ, ОПИСАНИЯ) И GPS ================

function renderModerationTab() {
  const filterByStatus = (items) => {
    if (state.moderationFilter === 'all') return items;
    return items.filter(item => (item.status || 'pending') === state.moderationFilter);
  };

  const statusBadgeHtml = (st) => {
    if (st === 'approved') return `<span style="color:#16a34a;font-weight:700">Одобрено</span>`;
    if (st === 'rejected') return `<span style="color:#dc2626;font-weight:700">Отклонено</span>`;
    return `<span style="color:#d97706;font-weight:700">На модерации</span>`;
  };

  // 1. Описания кабинетов
  const descTbody = document.getElementById('mod-descriptions-tbody');
  if (descTbody) {
    const filteredDescs = filterByStatus(state.descriptionSuggestions);
    if (filteredDescs.length === 0) {
      descTbody.innerHTML = `<tr><td colspan="6" class="admin-empty-cell">Предложений описаний кабинетов нет</td></tr>`;
    } else {
      descTbody.innerHTML = filteredDescs.map(item => {
        const roomMeta = state.rooms[item.roomId];
        const roomTitle = roomMeta ? `${roomMeta.name || item.roomId} (${roomMeta.floor ?? ''} эт.)` : item.roomId;
        return `
          <tr>
            <td><strong>${escapeHtml(roomTitle)}</strong><div class="admin-row-sub tabular-nums">${escapeHtml(item.roomId)}</div></td>
            <td style="max-width:340px;white-space:pre-wrap">${escapeHtml(item.description)}</td>
            <td>${escapeHtml(item.authorName || 'Студент')}</td>
            <td>${statusBadgeHtml(item.status)}</td>
            <td class="tabular-nums">${escapeHtml(formatDateTime(item.createdAt))}</td>
            <td class="text-right">
              <div class="admin-row-actions">
                ${item.status !== 'approved' ? `<button type="button" class="admin-icon-btn" data-mod-type="description" data-mod-action="approve" data-mod-id="${escapeHtml(item.id)}">Одобрить и записать</button>` : ''}
                ${item.status !== 'rejected' ? `<button type="button" class="admin-icon-btn" data-mod-type="description" data-mod-action="reject" data-mod-id="${escapeHtml(item.id)}">Отклонить</button>` : ''}
                <button type="button" class="admin-icon-btn danger" data-mod-type="description" data-mod-action="delete" data-mod-id="${escapeHtml(item.id)}" title="Удалить">Удалить</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // 2. Отзывы о буфетах
  const revTbody = document.getElementById('mod-reviews-tbody');
  if (revTbody) {
    const filteredRevs = filterByStatus(state.roomReviews);
    if (filteredRevs.length === 0) {
      revTbody.innerHTML = `<tr><td colspan="6" class="admin-empty-cell">Отзывов о буфетах и столовых нет</td></tr>`;
    } else {
      revTbody.innerHTML = filteredRevs.map(item => {
        const roomMeta = state.rooms[item.roomId];
        const roomTitle = roomMeta ? (roomMeta.name || item.roomId) : item.roomId;
        return `
          <tr>
            <td><strong>${escapeHtml(roomTitle)}</strong><div class="admin-row-sub tabular-nums">${escapeHtml(item.roomId)}</div></td>
            <td style="color:#f59e0b;font-weight:700" class="tabular-nums">${'★'.repeat(Number(item.rating) || 5)} (${escapeHtml(item.rating)})</td>
            <td style="max-width:320px;white-space:pre-wrap">${escapeHtml(item.text || '—')}</td>
            <td>${escapeHtml(item.authorName || 'Студент')}</td>
            <td>${statusBadgeHtml(item.status)}</td>
            <td class="text-right">
              <div class="admin-row-actions">
                ${item.status !== 'approved' ? `<button type="button" class="admin-icon-btn" data-mod-type="review" data-mod-action="approve" data-mod-id="${escapeHtml(item.id)}">Опубликовать</button>` : ''}
                ${item.status !== 'rejected' ? `<button type="button" class="admin-icon-btn" data-mod-type="review" data-mod-action="reject" data-mod-id="${escapeHtml(item.id)}">Скрыть</button>` : ''}
                <button type="button" class="admin-icon-btn danger" data-mod-type="review" data-mod-action="delete" data-mod-id="${escapeHtml(item.id)}" title="Удалить">Удалить</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // 3. Метки POI
  const catNames = { socket: '🔌 Розетка', coffee: '☕ Кофе/еда', wifi: '📶 Wi-Fi', blocked: '🚧 Проход закрыт', info: 'ℹ️ Ориентир' };
  const markTbody = document.getElementById('mod-markers-tbody');
  if (markTbody) {
    const filteredMarkers = filterByStatus(state.mapMarkers);
    if (filteredMarkers.length === 0) {
      markTbody.innerHTML = `<tr><td colspan="6" class="admin-empty-cell">Пользовательских меток на карте нет</td></tr>`;
    } else {
      markTbody.innerHTML = filteredMarkers.map(item => `
        <tr>
          <td><strong>${escapeHtml(catNames[item.category] || item.category)} · ${escapeHtml(item.title)}</strong></td>
          <td class="tabular-nums">Корпус ${escapeHtml(item.building)} · ${escapeHtml(item.floor)} эт. (${escapeHtml(item.x)}, ${escapeHtml(item.y)})</td>
          <td style="max-width:260px">${escapeHtml(item.description || '—')}</td>
          <td>${escapeHtml(item.authorName || 'Администратор')}</td>
          <td>${statusBadgeHtml(item.status)}</td>
          <td class="text-right">
            <div class="admin-row-actions">
              ${item.status !== 'approved' ? `<button type="button" class="admin-icon-btn" data-mod-type="marker" data-mod-action="approve" data-mod-id="${escapeHtml(item.id)}">Одобрить</button>` : ''}
              ${item.status !== 'rejected' ? `<button type="button" class="admin-icon-btn" data-mod-type="marker" data-mod-action="reject" data-mod-id="${escapeHtml(item.id)}">Отклонить</button>` : ''}
              <button type="button" class="admin-icon-btn danger" data-mod-type="marker" data-mod-action="delete" data-mod-id="${escapeHtml(item.id)}" title="Удалить">Удалить</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  document.querySelectorAll('[data-mod-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await adminFetch('/api/admin/moderation/action', {
          method: 'POST',
          body: JSON.stringify({
            itemType: btn.dataset.modType,
            action: btn.dataset.modAction,
            id: btn.dataset.modId
          })
        });
        showToast('Статус обновлён');
        await loadAllAdminData();
      } catch (e) {
        showToast(e.message);
      }
    });
  });

  // 4. Настройки GPS и таблица опорных точек
  const bCfg = state.gpsConfig?.buildings?.C || state.gpsConfig || { centerLat: 54.613783, centerLon: 39.723850, rotationDeg: 42.72, scaleMetersPerSvgUnit: 0.1065, anchors: [] };
  const latIn = document.getElementById('gps-cfg-lat');
  const lonIn = document.getElementById('gps-cfg-lon');
  const rotIn = document.getElementById('gps-cfg-rot');
  const scaleIn = document.getElementById('gps-cfg-scale');
  if (latIn) latIn.value = String(bCfg.centerLat ?? 54.613783);
  if (lonIn) lonIn.value = String(bCfg.centerLon ?? bCfg.centerLng ?? 39.723850);
  if (rotIn) rotIn.value = String(bCfg.rotationDeg ?? 42.72);
  if (scaleIn) scaleIn.value = String(bCfg.scaleMetersPerSvgUnit ?? bCfg.metersPerSvgUnit ?? 0.1065);

  const anchors = Array.isArray(bCfg.anchors) ? bCfg.anchors : (Array.isArray(state.gpsConfig?.anchors) ? state.gpsConfig.anchors : []);
  const anchorsCap = document.getElementById('gps-anchors-caption');
  if (anchorsCap) anchorsCap.textContent = `Опорных точек (реперов): ${anchors.length}`;
  const anchorsTbody = document.getElementById('gps-anchors-tbody');
  if (anchorsTbody) {
    if (!anchors.length) {
      anchorsTbody.innerHTML = '<tr><td colspan="5" class="admin-empty-cell">Опорные точки не заданы</td></tr>';
    } else {
      anchorsTbody.innerHTML = anchors.map(a => {
        const ax = Math.round(Number(a.x ?? a.svgX ?? 0));
        const ay = Math.round(Number(a.y ?? a.svgY ?? 0));
        const alat = Number(a.lat || 0).toFixed(6);
        const alon = Number(a.lon ?? a.lng ?? 0).toFixed(6);
        return `
          <tr>
            <td><strong>${escapeHtml(a.label || a.id || 'Точка')}</strong></td>
            <td class="tabular-nums">${escapeHtml(String(a.floor ?? 1))} эт.</td>
            <td class="tabular-nums">X: ${ax}, Y: ${ay}</td>
            <td class="tabular-nums">${alat}, ${alon}</td>
            <td class="text-right">
              <button type="button" class="admin-icon-btn danger" data-del-gps-anchor="${escapeHtml(a.id || '')}">Удалить</button>
            </td>
          </tr>
        `;
      }).join('');

      anchorsTbody.querySelectorAll('[data-del-gps-anchor]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const anchorId = btn.dataset.delGpsAnchor;
          if (!anchorId) return;
          try {
            await adminFetch('/api/admin/gps/save', {
              method: 'POST',
              body: JSON.stringify({ gpsConfig: { deleteAnchorId: anchorId } })
            });
            showToast('Опорная точка удалена');
            await loadAllAdminData();
          } catch (e) {
            showToast(e.message);
          }
        });
      });
    }
  }
}

// ================ ОБРАБОТЧИКИ СОБЫТИЙ ================

function setupEventHandlers() {
  // Поиск и фильтры пользователей
  const userSearchInput = document.getElementById('users-search-input');
  if (userSearchInput) {
    userSearchInput.addEventListener('input', () => {
      state.userSearch = userSearchInput.value;
      renderUsersTab();
    });
  }

  document.querySelectorAll('#users-filter-bar .admin-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.userFilter = btn.dataset.filter;
      document.querySelectorAll('#users-filter-bar .admin-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderUsersTab();
    });
  });

  // Фильтр статусов в Модерации
  document.querySelectorAll('#moderation-filter-bar .admin-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.moderationFilter = btn.dataset.modFilter || 'all';
      document.querySelectorAll('#moderation-filter-bar .admin-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderModerationTab();
    });
  });

  document.getElementById('btn-add-user')?.addEventListener('click', () => openUserModal(null));
  document.getElementById('btn-users-sync-cloud')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/cloud/sync', { method: 'POST', body: JSON.stringify({ mode: 'push' }) });
    showToast('Данные синхронизированы с Firebase Firestore');
    await loadAllAdminData();
  });

  // Модальное окно пользователя
  document.getElementById('user-modal-close')?.addEventListener('click', closeUserModal);
  document.getElementById('btn-user-modal-cancel')?.addEventListener('click', closeUserModal);
  document.getElementById('btn-user-modal-save')?.addEventListener('click', saveUserFromModal);
  document.getElementById('btn-user-modal-delete')?.addEventListener('click', () => {
    if (state.editingUserId) confirmDeleteUser(state.editingUserId);
  });

  // Выпадающий список шаблонов поверх конструктора
  const tplPickerWrap = document.getElementById('bot-tpl-picker-wrap');
  const tplSearch = document.getElementById('bot-tpl-search');
  const tplPickerToggle = document.getElementById('btn-bot-tpl-picker-toggle');

  if (tplSearch && tplPickerWrap) {
    tplSearch.addEventListener('focus', () => {
      tplPickerWrap.classList.add('open');
      renderBotTemplateStudio();
    });
    tplSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      tplPickerWrap.classList.add('open');
    });
    tplSearch.addEventListener('input', () => {
      state.templateSearch = tplSearch.value;
      tplPickerWrap.classList.add('open');
      renderBotTemplateStudio();
    });
  }

  if (tplPickerToggle && tplPickerWrap) {
    tplPickerToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      tplPickerWrap.classList.toggle('open');
    });
  }

  const tplTextarea = document.getElementById('bot-tpl-textarea');
  if (tplTextarea) {
    tplTextarea.addEventListener('input', updateLiveTemplatePreview);
  }

  document.querySelectorAll('.admin-md-toolbar').forEach(toolbar => {
    const targetId = toolbar.dataset.targetTextarea;
    const targetTextarea = document.getElementById(targetId);
    if (!targetTextarea) return;

    toolbar.querySelectorAll('[data-md]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyMarkdownActionToTextarea(targetTextarea, btn.dataset.md);
        document.querySelectorAll('.admin-md-dropdown.open').forEach(d => d.classList.remove('open'));
      });
    });

    toolbar.querySelectorAll('[data-insert-var]').forEach(btn => {
      btn.addEventListener('click', () => {
        insertAtTextareaCursor(targetTextarea, btn.dataset.insertVar);
      });
    });
  });

  // Выпадающие меню панели инструментов Markdown ({{ }}, Aa, B, Списки)
  document.querySelectorAll('.admin-md-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = trigger.closest('.admin-md-dropdown');
      if (!parent) return;
      const wasOpen = parent.classList.contains('open');
      document.querySelectorAll('.admin-md-dropdown.open').forEach(d => d.classList.remove('open'));
      if (!wasOpen) parent.classList.add('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.admin-md-dropdown')) {
      document.querySelectorAll('.admin-md-dropdown.open').forEach(d => d.classList.remove('open'));
    }
    if (!e.target.closest('#bot-tpl-picker-wrap')) {
      document.getElementById('bot-tpl-picker-wrap')?.classList.remove('open');
    }
    if (!e.target.closest('#users-context-menu')) {
      closeUserContextMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUserContextMenu();
    }
  });

  document.querySelector('.admin-main')?.addEventListener('scroll', () => {
    closeUserContextMenu();
  }, { passive: true });

  // Добавление кнопки к шаблону
  document.getElementById('btn-bot-tpl-add-button')?.addEventListener('click', () => {
    if (!Array.isArray(state.editingTemplateButtons)) state.editingTemplateButtons = [];
    state.editingTemplateButtons.push({
      text: '🗺 Открыть карту',
      type: 'webapp',
      value: '{{webappUrl}}'
    });
    renderTemplateButtonsEditor();
    updateLiveTemplatePreview();
  });

  // Переключатель Включён / Отключён у шаблона
  document.getElementById('bot-tpl-enabled-toggle')?.addEventListener('change', async (e) => {
    const tpl = getSelectedTemplateObject();
    if (!tpl) return;
    const nextEnabled = Boolean(e.target.checked);
    try {
      const res = await adminFetch('/api/admin/bot/templates', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'toggle-enabled',
          templateId: tpl.id,
          enabled: nextEnabled
        })
      });
      state.botTemplates = Array.isArray(res.botTemplates) ? res.botTemplates : state.botTemplates;
      renderBotTab();
      showToast(nextEnabled ? `Шаблон «${tpl.title}» включён` : `Шаблон «${tpl.title}» отключён`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('btn-bot-tpl-save')?.addEventListener('click', async () => {
    const tpl = getSelectedTemplateObject();
    const textarea = document.getElementById('bot-tpl-textarea');
    const enabledToggle = document.getElementById('bot-tpl-enabled-toggle');
    if (!tpl || !textarea) return;
    try {
      const res = await adminFetch('/api/admin/bot/templates', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'save',
          templateId: tpl.id,
          text: textarea.value,
          enabled: enabledToggle ? enabledToggle.checked : true,
          buttons: state.editingTemplateButtons
        })
      });
      state.botTemplates = Array.isArray(res.botTemplates) ? res.botTemplates : state.botTemplates;
      textarea.dataset.loadedTplId = '';
      state.loadedButtonsTplId = '';
      renderBotTab();
      showToast(`Шаблон «${tpl.title}» сохранён`);
    } catch (e) {
      showToast(e.message);
    }
  });

  document.getElementById('btn-bot-tpl-reset')?.addEventListener('click', async () => {
    const tpl = getSelectedTemplateObject();
    const textarea = document.getElementById('bot-tpl-textarea');
    if (!tpl) return;
    try {
      const res = await adminFetch('/api/admin/bot/templates', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'reset',
          templateId: tpl.id
        })
      });
      state.botTemplates = Array.isArray(res.botTemplates) ? res.botTemplates : state.botTemplates;
      if (textarea) textarea.dataset.loadedTplId = '';
      state.loadedButtonsTplId = '';
      renderBotTab();
      showToast(`Шаблон «${tpl.title}» сброшен`);
    } catch (e) {
      showToast(e.message);
    }
  });

  // Вкладка Telegram-бота (личное сообщение и рассылка через выбор получателя из списка)
  document.getElementById('btn-bot-send-test-lesson')?.addEventListener('click', () => {
    const sel = document.getElementById('bot-direct-user-select');
    const userId = sel ? sel.value : '';
    const opt = sel && sel.selectedOptions ? sel.selectedOptions[0] : null;
    const tgId = opt ? (opt.getAttribute('data-tgid') || '') : '';
    if (!userId && !tgId) {
      showToast('Выберите получателя из выпадающего списка');
      return;
    }
    sendTestLessonToUser(userId, tgId);
  });

  document.getElementById('btn-bot-send-direct')?.addEventListener('click', async () => {
    const sel = document.getElementById('bot-direct-user-select');
    const opt = sel && sel.selectedOptions ? sel.selectedOptions[0] : null;
    const tgId = opt ? (opt.getAttribute('data-tgid') || '').trim() : '';
    const text = document.getElementById('bot-direct-text')?.value.trim() || '';
    const resBox = document.getElementById('bot-direct-result');
    if (!tgId) {
      showToast('Выберите получателя из выпадающего списка');
      return;
    }
    try {
      await adminFetch('/api/admin/bot/send', {
        method: 'POST',
        body: JSON.stringify({ mode: 'direct', telegramId: tgId, text })
      });
      showToast('Сообщение доставлено в Telegram');
      document.getElementById('bot-direct-text').value = '';
      if (resBox) {
        resBox.textContent = `Сообщение отправлено пользователю ID ${tgId}`;
        resBox.classList.remove('hidden');
      }
    } catch (e) {
      showToast(e.message);
    }
  });

  const audienceSel = document.getElementById('bot-broadcast-audience');
  const groupWrap = document.getElementById('bot-broadcast-group-wrap');
  if (audienceSel && groupWrap) {
    audienceSel.addEventListener('change', () => {
      groupWrap.classList.toggle('hidden', audienceSel.value !== 'group');
    });
  }

  document.getElementById('btn-bot-send-broadcast')?.addEventListener('click', async () => {
    const audience = document.getElementById('bot-broadcast-audience').value;
    const groupName = document.getElementById('bot-broadcast-group').value.trim();
    const text = document.getElementById('bot-broadcast-text').value.trim();
    const resBox = document.getElementById('bot-broadcast-result');
    try {
      const res = await adminFetch('/api/admin/bot/send', {
        method: 'POST',
        body: JSON.stringify({ mode: 'broadcast', audience, groupName, text })
      });
      showToast(`Рассылка завершена: доставлено ${res.sentCount} из ${res.totalRecipients}`);
      if (resBox) {
        resBox.textContent = `Итог рассылки: всего получателей ${res.totalRecipients}, доставлено успешно: ${res.sentCount}, ошибок: ${res.failedCount}`;
        resBox.classList.remove('hidden');
      }
    } catch (e) {
      showToast(e.message);
    }
  });

  // Вкладка Облачной БД и кодов
  document.getElementById('btn-cloud-push')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/cloud/sync', { method: 'POST', body: JSON.stringify({ mode: 'push' }) });
    showToast('Все данные выгружены в Firebase Firestore (Push)');
    await loadAllAdminData();
  });

  document.getElementById('btn-cloud-pull')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/cloud/sync', { method: 'POST', body: JSON.stringify({ mode: 'pull' }) });
    showToast('Данные загружены из Firebase Firestore (Pull)');
    await loadAllAdminData();
  });

  document.getElementById('btn-export-users-json')?.addEventListener('click', () => {
    const customTemplates = {};
    for (const tpl of state.botTemplates) {
      if (tpl.isModified) customTemplates[tpl.id] = tpl.text;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      users: Object.fromEntries(state.users.map(u => [u.id, u])),
      authCodes: Object.fromEntries(state.authCodes.map(c => [c.code, c])),
      authSessions: Object.fromEntries(state.authSessions.map(s => [s.token, s])),
      botTemplates: customTemplates
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `radikmap-users-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('input-import-users-json')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await adminFetch('/api/admin/cloud/sync', {
        method: 'POST',
        body: JSON.stringify({ mode: 'import', backupData: parsed, replaceAll: false })
      });
      showToast(`Импортировано профилей: ${res.importedCount}`);
      await loadAllAdminData();
    } catch (err) {
      showToast('Ошибка импорта JSON: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btn-generate-code')?.addEventListener('click', async () => {
    const tgId = document.getElementById('gen-code-tgid').value.trim();
    const firstName = document.getElementById('gen-code-name').value.trim();
    try {
      const res = await adminFetch('/api/admin/auth/action', {
        method: 'POST',
        body: JSON.stringify({ action: 'create-code', telegramId: tgId, firstName })
      });
      showToast(`Создан код входа: ${res.code}`);
      document.getElementById('gen-code-tgid').value = '';
      document.getElementById('gen-code-name').value = '';
      await loadAllAdminData();
    } catch (e) {
      showToast(e.message);
    }
  });

  document.getElementById('btn-clear-codes')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/auth/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear-codes' })
    });
    showToast('Все коды очищены');
    await loadAllAdminData();
  });

  document.getElementById('btn-clear-sessions')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/auth/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear-sessions' })
    });
    showToast('Все сессии очищены');
    await loadAllAdminData();
  });

  // Вкладка Справочника помещений (rooms.json)
  document.getElementById('rooms-search-input')?.addEventListener('input', (e) => {
    state.roomSearch = e.target.value;
    renderRoomsTab();
  });
  document.getElementById('rooms-floor-filter')?.addEventListener('change', (e) => {
    state.roomFloorFilter = e.target.value;
    renderRoomsTab();
  });
  document.getElementById('rooms-type-filter')?.addEventListener('change', (e) => {
    state.roomTypeFilter = e.target.value;
    renderRoomsTab();
  });
  document.getElementById('btn-add-room')?.addEventListener('click', () => openRoomModal(null));
  document.getElementById('room-modal-close')?.addEventListener('click', closeRoomModal);
  document.getElementById('btn-room-modal-cancel')?.addEventListener('click', closeRoomModal);
  document.getElementById('btn-room-modal-save')?.addEventListener('click', saveRoomFromModal);
  document.getElementById('btn-room-modal-delete')?.addEventListener('click', deleteRoomFromModal);

  document.getElementById('btn-export-rooms-json')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.rooms, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rooms.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Вкладка Кэша расписания и диагностики
  document.getElementById('btn-cache-warmup')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/cache/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'warmup-rooms' })
    });
    showToast('Запущено обновление кэша расписания аудиторий');
    setTimeout(loadAllAdminData, 1000);
  });

  document.getElementById('btn-cache-clear-entities')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/cache/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear-entities' })
    });
    showToast('Кэш расписания групп и преподавателей очищен');
    await loadAllAdminData();
  });

  document.getElementById('btn-cache-rebuild-index')?.addEventListener('click', async () => {
    await adminFetch('/api/admin/cache/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'rebuild-index' })
    });
    showToast('Поисковый индекс расписания пересобран');
    await loadAllAdminData();
  });

  document.getElementById('btn-inspector-load')?.addEventListener('click', runScheduleInspector);

  document.getElementById('btn-save-gps-cfg')?.addEventListener('click', async () => {
    const centerLat = parseFloat(document.getElementById('gps-cfg-lat')?.value || '54.613783');
    const centerLon = parseFloat(document.getElementById('gps-cfg-lon')?.value || '39.723850');
    const rotationDeg = parseFloat(document.getElementById('gps-cfg-rot')?.value || '42.72');
    const scaleMetersPerSvgUnit = parseFloat(document.getElementById('gps-cfg-scale')?.value || '0.1065');
    const prevAnchors = state.gpsConfig?.buildings?.C?.anchors || state.gpsConfig?.anchors || [];
    const nextCfg = {
      centerLat: Number.isFinite(centerLat) ? centerLat : 54.613783,
      centerLon: Number.isFinite(centerLon) ? centerLon : 39.723850,
      centerLng: Number.isFinite(centerLon) ? centerLon : 39.723850,
      rotationDeg: Number.isFinite(rotationDeg) ? rotationDeg : 42.72,
      scaleMetersPerSvgUnit: Number.isFinite(scaleMetersPerSvgUnit) ? scaleMetersPerSvgUnit : 0.1065,
      metersPerSvgUnit: Number.isFinite(scaleMetersPerSvgUnit) ? scaleMetersPerSvgUnit : 0.1065,
      anchors: prevAnchors,
      buildings: {
        ...(state.gpsConfig?.buildings || {}),
        C: {
          centerLat: Number.isFinite(centerLat) ? centerLat : 54.613783,
          centerLon: Number.isFinite(centerLon) ? centerLon : 39.723850,
          centerLng: Number.isFinite(centerLon) ? centerLon : 39.723850,
          rotationDeg: Number.isFinite(rotationDeg) ? rotationDeg : 42.72,
          scaleMetersPerSvgUnit: Number.isFinite(scaleMetersPerSvgUnit) ? scaleMetersPerSvgUnit : 0.1065,
          metersPerSvgUnit: Number.isFinite(scaleMetersPerSvgUnit) ? scaleMetersPerSvgUnit : 0.1065,
          anchors: prevAnchors
        }
      }
    };
    try {
      await adminFetch('/api/admin/gps/save', {
        method: 'POST',
        body: JSON.stringify({ gpsConfig: nextCfg })
      });
      showToast('Настройки калибровки GPS сохранены в БД');
      await loadAllAdminData();
    } catch (e) {
      showToast(e.message);
    }
  });

  document.getElementById('btn-reset-gps-cfg')?.addEventListener('click', async () => {
    try {
      await adminFetch('/api/admin/gps/save', {
        method: 'POST',
        body: JSON.stringify({ gpsConfig: { resetToDefault: true } })
      });
      showToast('Восстановлена эталонная сетка GPS Главного корпуса РГРТУ (9 реперов)');
      await loadAllAdminData();
    } catch (e) {
      showToast(e.message);
    }
  });
}

// ================ ИНИЦИАЛИЗАЦИЯ ================

(async function initAdmin() {
  setupTheme();
  setupNavigation();
  setupAuthForm();
  setupEventHandlers();

  const token = getStoredEditorToken();
  if (!token) {
    showAuthGate();
    return;
  }

  try {
    const checkRes = await fetch('/api/editor/check', {
      headers: { 'X-Editor-Token': token }
    });
    if (!checkRes.ok) {
      setStoredEditorToken('');
      showAuthGate();
      return;
    }
    hideAuthGate();
    await loadAllAdminData();
  } catch (e) {
    showAuthGate('Не удалось проверить авторизацию');
  }
})();
