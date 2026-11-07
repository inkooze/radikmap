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
  roomFloorFilter: 'all',
  roomTypeFilter: 'all',
  roomSearch: '',
  editingUserId: null,
  editingUserRecentViews: {},
  editingRoomId: null
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

/**
 * Клиентский рендерер Markdown -> Telegram HTML для живого превью в админ-панели.
 */
function renderTelegramMarkdownPreview(markdownText, variables = {}) {
  const raw = String(markdownText == null ? '' : markdownText);
  if (!raw) return '<span style="color:var(--text-dim)">Пустой шаблон…</span>';

  const varTokens = [];
  const withVarTokens = raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key] == null ? '' : variables[key])
      : `{{${key}}}`;
    const idx = varTokens.length;
    varTokens.push(escapeHtml(val));
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

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
  });

  const lines = text.split('\n');
  const processedLines = [];
  let quoteBuffer = [];
  const flushQuote = () => {
    if (quoteBuffer.length > 0) {
      processedLines.push(`<blockquote>${quoteBuffer.join('\n')}</blockquote>`);
      quoteBuffer = [];
    }
  };
  for (const line of lines) {
    if (/^&gt;\s?(.*)$/.test(line)) {
      quoteBuffer.push(line.replace(/^&gt;\s?/, ''));
    } else {
      flushQuote();
      processedLines.push(line);
    }
  }
  flushQuote();
  text = processedLines.join('\n');

  text = text.replace(/\|\|([^\n|]+)\|\|/g, '<tg-spoiler title="Наведите курсор, чтобы раскрыть спойлер">$1</tg-spoiler>');
  text = text.replace(/~~([^\n~]+)~~/g, '<s>$1</s>');
  text = text.replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^\n_]+)__/g, '<u>$1</u>');
  text = text.replace(/(^|[\s(>«"'])\*([^\n*]+)\*(?=$|[\s).,!?:;»"'<])/gm, '$1<b>$2</b>');
  text = text.replace(/(^|[\s(>«"'])_([^\n_]+)_(?=$|[\s).,!?:;»"'<])/gm, '$1<i>$2</i>');

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

  let prefix = '';
  let suffix = '';
  let fallback = 'текст';

  switch (action) {
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
      fallback = 'блок текста';
      break;
    case 'spoiler':
      prefix = '||';
      suffix = '||';
      fallback = 'скрытый текст';
      break;
    case 'quote': {
      const content = selected || 'текст цитаты';
      const quoted = content
        .split('\n')
        .map(line => (line.startsWith('> ') ? line : `> ${line}`))
        .join('\n');
      const needNewlineBefore = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const replacement = `${needNewlineBefore}${quoted}`;
      textarea.value = before + replacement + after;
      textarea.focus();
      textarea.setSelectionRange(start + needNewlineBefore.length, start + replacement.length);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    case 'link': {
      const label = selected || 'Карта РГРТУ';
      const url = 'https://radikmap.ai.studio/';
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

  const logoutBtn = document.getElementById('btn-admin-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      setStoredEditorToken('');
      showAuthGate('Вы вышли из админ-сессии');
    });
  }
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

  const refreshBtn = document.getElementById('btn-admin-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await loadAllAdminData();
      showToast('Данные обновлены');
    });
  }
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

    renderSidebarCounters();
    renderUsersTab();
    renderBotTab();
    renderModerationTab();
    renderCloudTab();
    renderRoomsTab();
    renderCacheTab();
    updateTargetDatalist();
  } catch (e) {
    if (!String(e.message).includes('Требуется авторизация')) {
      showToast(e.message || 'Не удалось загрузить данные');
    }
  }
}

function renderSidebarCounters() {
  const elUsers = document.getElementById('nav-count-users');
  const elCodes = document.getElementById('nav-count-codes');
  const elRooms = document.getElementById('nav-count-rooms');
  const elMod = document.getElementById('nav-count-moderation');
  const elCloudSub = document.getElementById('sidebar-cloud-status');

  const pendingModCount =
    state.mapMarkers.filter(m => m.status === 'pending').length +
    state.roomReviews.filter(r => r.status === 'pending').length +
    state.descriptionSuggestions.filter(d => d.status === 'pending').length;

  if (elUsers) elUsers.textContent = String(state.users.length);
  if (elCodes) elCodes.textContent = String(state.authCodes.length + state.authSessions.length);
  if (elRooms) elRooms.textContent = String(Object.keys(state.rooms).length);
  if (elMod) elMod.textContent = String(pendingModCount);
  if (elCloudSub) {
    if (state.cloud.enabled) {
      elCloudSub.textContent = `Активна · ${state.cloud.projectId}`;
    } else {
      elCloudSub.textContent = 'Локальный режим (users.json)';
    }
  }
}

// ================ ВКЛАДКА 1: ПОЛЬЗОВАТЕЛИ ================

function renderUsersTab() {
  const total = state.users.length;
  const tgLinked = state.users.filter(u => u.telegramId).length;
  const students = state.users.filter(u => (u.role || 'student') === 'student').length;
  const lecturers = state.users.filter(u => u.role === 'lecturer').length;
  const withTarget = state.users.filter(u => u.targetName).length;
  const notifActive = state.users.filter(u => u.telegramId && u.targetName && u.notificationsEnabled !== false).length;

  document.getElementById('kpi-users-total').textContent = String(total);
  document.getElementById('kpi-users-tg').textContent = String(tgLinked);
  document.getElementById('kpi-users-roles').textContent = `${students} / ${lecturers}`;
  document.getElementById('kpi-users-with-target').textContent = String(withTarget);
  document.getElementById('kpi-users-notif').textContent = String(notifActive);
  document.getElementById('kpi-users-cloud-meta').textContent = state.cloud.enabled
    ? `Firestore (${state.cloud.projectId})`
    : 'Локальный файл users.json';

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

  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-empty-cell">Пользователи по выбранному фильтру не найдены</td></tr>`;
    return;
  }

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
      <tr>
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
        <td class="text-right">
          <div class="admin-row-actions">
            ${u.telegramId ? `
              <button type="button" class="admin-icon-btn" data-action="test-user-lesson" data-uid="${escapeHtml(u.id)}" title="Отправить тест уведомления о паре в Telegram">
                <i class="mdi mdi-bell-ring-outline"></i> Тест пары
              </button>
              <button type="button" class="admin-icon-btn" data-action="msg-user-tg" data-uid="${escapeHtml(u.id)}" title="Написать сообщение в Telegram">
                <i class="mdi mdi-send-outline"></i>
              </button>
            ` : ''}
            <button type="button" class="admin-icon-btn" data-action="edit-user" data-uid="${escapeHtml(u.id)}">
              <i class="mdi mdi-pencil-outline"></i> Изменить
            </button>
            <button type="button" class="admin-icon-btn danger" data-action="delete-user" data-uid="${escapeHtml(u.id)}" title="Удалить профиль">
              <i class="mdi mdi-delete-outline"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="edit-user"]').forEach(btn => {
    btn.addEventListener('click', () => openUserModal(btn.dataset.uid));
  });

  tbody.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.uid));
  });

  tbody.querySelectorAll('[data-action="test-user-lesson"]').forEach(btn => {
    btn.addEventListener('click', () => sendTestLessonToUser(btn.dataset.uid));
  });

  tbody.querySelectorAll('[data-action="msg-user-tg"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = state.users.find(x => x.id === btn.dataset.uid);
      if (!u || !u.telegramId) return;
      switchTab('bot');
      const sel = document.getElementById('bot-direct-user-select');
      const tgInput = document.getElementById('bot-direct-tgid');
      if (sel) sel.value = u.id;
      if (tgInput) tgInput.value = String(u.telegramId);
      document.getElementById('bot-direct-text')?.focus();
    });
  });
}

function updateTargetDatalist() {
  const roleSel = document.getElementById('edit-user-role');
  const datalist = document.getElementById('admin-target-datalist');
  if (!datalist || !roleSel) return;
  const role = roleSel.value;
  if (role === 'lecturer') {
    datalist.innerHTML = state.directory.lecturers
      .map(l => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.fullName || l.name)}</option>`)
      .join('');
  } else {
    datalist.innerHTML = state.directory.groups
      .map(g => `<option value="${escapeHtml(g.name)}">${escapeHtml(g.faculty || '')}</option>`)
      .join('');
  }
}

function openUserModal(userId = null) {
  const modal = document.getElementById('user-modal-backdrop');
  const titleEl = document.getElementById('user-modal-title');
  const idInput = document.getElementById('edit-user-id');
  const tgInput = document.getElementById('edit-user-tgid');
  const fnInput = document.getElementById('edit-user-firstname');
  const unInput = document.getElementById('edit-user-username');
  const roleSel = document.getElementById('edit-user-role');
  const targetInput = document.getElementById('edit-user-target');
  const themeSel = document.getElementById('edit-user-theme');
  const notifCheck = document.getElementById('edit-user-notif');
  const favInput = document.getElementById('edit-user-favorites');
  const resetSlotsCheck = document.getElementById('edit-user-reset-slots');
  const slotsInfo = document.getElementById('edit-user-slots-info');
  const recentInfo = document.getElementById('edit-user-recent-info');
  const deleteBtn = document.getElementById('btn-user-modal-delete');

  const existing = userId ? state.users.find(u => u.id === userId) : null;
  state.editingUserId = existing ? existing.id : null;
  state.editingUserRecentViews = existing && existing.recentViews ? { ...existing.recentViews } : {};

  titleEl.textContent = existing ? `Профиль: ${existing.firstName || existing.id}` : 'Новый пользователь';
  idInput.value = existing ? existing.id : '';
  idInput.readOnly = Boolean(existing);
  tgInput.value = existing && existing.telegramId ? String(existing.telegramId) : '';
  fnInput.value = existing ? (existing.firstName || '') : '';
  unInput.value = existing ? (existing.username || '') : '';
  roleSel.value = existing && existing.role === 'lecturer' ? 'lecturer' : 'student';
  updateTargetDatalist();
  targetInput.value = existing ? (existing.targetName || '') : '';
  themeSel.value = existing ? (existing.theme || 'system') : 'system';
  notifCheck.checked = existing ? existing.notificationsEnabled !== false : true;
  favInput.value = existing && Array.isArray(existing.favorites) ? existing.favorites.join(', ') : '';
  resetSlotsCheck.checked = false;

  const slots = existing && Array.isArray(existing.notifiedSlots) ? existing.notifiedSlots : [];
  if (slots.length > 0 || (existing && existing.lastNotifiedSlot)) {
    const list = slots.length > 0 ? slots : [existing.lastNotifiedSlot];
    slotsInfo.textContent = list.join('\n');
  } else {
    slotsInfo.textContent = 'Нет отправленных уведомлений';
  }

  renderEditingUserRecentInfo(recentInfo);

  if (deleteBtn) {
    deleteBtn.style.display = existing ? 'inline-flex' : 'none';
  }

  modal.classList.add('open');
}

function renderEditingUserRecentInfo(container) {
  if (!container) return;
  const entries = Object.entries(state.editingUserRecentViews || {});
  if (entries.length === 0) {
    container.textContent = 'Пусто';
    return;
  }
  container.textContent = entries
    .map(([key, val]) => `${key} — просмотров: ${val.count || 1} (${formatDateTime(val.lastViewedAt)})`)
    .join('\n');
}

function closeUserModal() {
  const modal = document.getElementById('user-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

async function saveUserFromModal() {
  const idVal = document.getElementById('edit-user-id').value.trim();
  const tgVal = document.getElementById('edit-user-tgid').value.trim();
  const fnVal = document.getElementById('edit-user-firstname').value.trim();
  const unVal = document.getElementById('edit-user-username').value.replace(/^@/, '').trim();
  const roleVal = document.getElementById('edit-user-role').value;
  const targetVal = document.getElementById('edit-user-target').value.trim();
  const themeVal = document.getElementById('edit-user-theme').value;
  const notifVal = document.getElementById('edit-user-notif').checked;
  const favRaw = document.getElementById('edit-user-favorites').value;
  const resetSlots = document.getElementById('edit-user-reset-slots').checked;

  const favorites = favRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  try {
    await adminFetch('/api/admin/user/save', {
      method: 'POST',
      body: JSON.stringify({
        userId: idVal || (tgVal ? `tg_${tgVal}` : ''),
        telegramId: tgVal ? Number(tgVal) : null,
        firstName: fnVal,
        username: unVal,
        role: roleVal,
        targetName: targetVal,
        theme: themeVal,
        notificationsEnabled: notifVal,
        favorites,
        recentViews: state.editingUserRecentViews,
        resetNotifiedSlots: resetSlots
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
  const statusEl = document.getElementById('bot-kpi-status');
  const unameEl = document.getElementById('bot-kpi-username');
  const tplCountEl = document.getElementById('bot-kpi-templates');
  const tplModEl = document.getElementById('bot-kpi-templates-modified');
  const linkedEl = document.getElementById('bot-kpi-linked');
  const notifEl = document.getElementById('bot-kpi-notif-active');
  const weekEl = document.getElementById('bot-kpi-week');
  const clockEl = document.getElementById('bot-kpi-clock');

  const linkedUsers = state.users.filter(u => u.telegramId);
  const activeNotifUsers = linkedUsers.filter(u => u.targetName && u.notificationsEnabled !== false);
  const modifiedTemplatesCount = state.botTemplates.filter(t => t.isModified).length;

  if (statusEl) statusEl.textContent = state.bot.configured ? 'Активен' : 'Токен не задан';
  if (unameEl) unameEl.textContent = state.bot.username ? `@${state.bot.username}` : '@rgrtu_map_bot';
  if (tplCountEl) tplCountEl.textContent = String(state.botTemplates.length || 16);
  if (tplModEl) tplModEl.textContent = `Изменено пользователем: ${modifiedTemplatesCount}`;
  if (linkedEl) linkedEl.textContent = String(linkedUsers.length);
  if (notifEl) notifEl.textContent = String(activeNotifUsers.length);
  if (weekEl) weekEl.textContent = state.cache.defaultWeek || 'Текущая';
  if (clockEl && state.cache.moscowClock) {
    const mc = state.cache.moscowClock;
    const hh = String(Math.floor((mc.nowMin || 0) / 60)).padStart(2, '0');
    const mm = String((mc.nowMin || 0) % 60).padStart(2, '0');
    clockEl.textContent = `${mc.todayDayName || ''} · ${mc.todayISO || ''} · ${hh}:${mm} МСК`;
  }

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
  const listEl = document.getElementById('bot-tpl-list');
  if (!listEl) return;

  const q = state.templateSearch.toLowerCase().replace(/ё/g, 'е').trim();
  const filtered = state.botTemplates.filter(tpl => {
    if (!q) return true;
    const hay = `${tpl.id} ${tpl.title} ${tpl.category} ${tpl.trigger} ${tpl.description}`
      .toLowerCase()
      .replace(/ё/g, 'е');
    return hay.includes(q);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="admin-empty-cell">Шаблоны не найдены</div>`;
    return;
  }

  // Группируем по категориям
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
      html += `
        <button type="button" class="admin-tpl-item ${isActive ? 'active' : ''}" data-tpl-id="${escapeHtml(tpl.id)}">
          <div class="admin-tpl-item-top">
            <span class="admin-tpl-item-title">${escapeHtml(tpl.title)}</span>
            ${tpl.isModified ? '<span class="admin-tpl-item-mod">Изменён</span>' : ''}
          </div>
          <div class="admin-tpl-item-sub">${escapeHtml(tpl.trigger)}</div>
        </button>
      `;
    }
  }
  listEl.innerHTML = html;

  listEl.querySelectorAll('[data-tpl-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedTemplateId = btn.dataset.tplId;
      renderBotTemplateStudio();
    });
  });

  renderSelectedTemplateEditor();
}

function getSelectedTemplateObject() {
  return state.botTemplates.find(t => t.id === state.selectedTemplateId) || state.botTemplates[0] || null;
}

function renderSelectedTemplateEditor() {
  const tpl = getSelectedTemplateObject();
  if (!tpl) return;

  const titleEl = document.getElementById('bot-tpl-title');
  const triggerEl = document.getElementById('bot-tpl-trigger');
  const badgeEl = document.getElementById('bot-tpl-state-badge');
  const descEl = document.getElementById('bot-tpl-desc');
  const varsEl = document.getElementById('bot-tpl-vars');
  const textarea = document.getElementById('bot-tpl-textarea');
  const senderEl = document.getElementById('bot-tpl-preview-sender');

  if (titleEl) titleEl.textContent = tpl.title;
  if (triggerEl) triggerEl.textContent = `Триггер: ${tpl.trigger} · ID: ${tpl.id}`;
  if (badgeEl) {
    badgeEl.textContent = tpl.isModified ? 'Пользовательский шаблон' : 'Стандартный шаблон';
    badgeEl.classList.toggle('modified', Boolean(tpl.isModified));
  }
  if (descEl) descEl.textContent = tpl.description || '';
  if (senderEl) {
    senderEl.textContent = state.bot.username ? `Карта РГРТУ (@${state.bot.username})` : 'Карта РГРТУ · Бот';
  }

  if (varsEl) {
    const vars = Array.isArray(tpl.variables) ? tpl.variables : [];
    if (vars.length === 0) {
      varsEl.innerHTML = `<span style="font-size:12px;color:var(--text-dim)">В этом сообщении нет динамических переменных</span>`;
    } else {
      varsEl.innerHTML = vars.map(v => `
        <button type="button" class="admin-var-btn" data-var-insert="{{${escapeHtml(v.key)}}}" title="Пример значения: ${escapeHtml(v.sample || '')}">
          <code>{{${escapeHtml(v.key)}}}</code>
          <span>${escapeHtml(v.label)}</span>
        </button>
      `).join('');

      varsEl.querySelectorAll('[data-var-insert]').forEach(btn => {
        btn.addEventListener('click', () => {
          insertAtTextareaCursor(textarea, btn.dataset.varInsert);
        });
      });
    }
  }

  if (textarea && textarea.dataset.loadedTplId !== tpl.id) {
    textarea.value = tpl.text || '';
    textarea.dataset.loadedTplId = tpl.id;
  }

  updateLiveTemplatePreview();
}

function updateLiveTemplatePreview() {
  const tpl = getSelectedTemplateObject();
  const textarea = document.getElementById('bot-tpl-textarea');
  const previewBody = document.getElementById('bot-tpl-preview-body');
  const previewTime = document.getElementById('bot-tpl-preview-time');
  if (!tpl || !textarea || !previewBody) return;

  const sampleVars = {};
  for (const v of (tpl.variables || [])) {
    sampleVars[v.key] = v.sample || '';
  }

  previewBody.innerHTML = renderTelegramMarkdownPreview(textarea.value, sampleVars);

  if (previewTime) {
    const now = new Date();
    previewTime.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · HTML/Markdown`;
  }
}

// ================ ВКЛАДКА 3: ОБЛАЧНАЯ БД, КОДЫ И СЕССИИ ================

function renderCloudTab() {
  const c = state.cloud || {};
  document.getElementById('cloud-project-id').textContent = c.projectId || 'Не подключено';
  document.getElementById('cloud-db-id').textContent = c.databaseId || 'Локальный режим';
  document.getElementById('cloud-last-pull').textContent = formatDateTime(c.lastPullAt);
  document.getElementById('cloud-last-push').textContent = formatDateTime(c.lastPushAt);
  document.getElementById('cloud-last-error').textContent = c.lastError ? `Ошибка: ${c.lastError}` : 'Синхронизация без ошибок';
  document.getElementById('cloud-status-line').textContent = c.enabled
    ? `База данных: ${c.databaseId} · Проект: ${c.projectId}`
    : 'Облачная база не подключена';

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
            <button type="button" class="admin-icon-btn" data-edit-room="${escapeHtml(roomId)}">
              <i class="mdi mdi-pencil-outline"></i> Изменить
            </button>
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

  titleEl.textContent = existing ? `Помещение: ${existing.name || roomId}` : 'Новое помещение';
  idInput.value = existing ? roomId : 'C_auditori_';
  idInput.readOnly = Boolean(existing);
  shortInput.value = existing ? (existing.shortName || '') : '';
  nameInput.value = existing ? (existing.name || '') : '';
  floorSel.value = existing && existing.floor != null ? String(existing.floor) : '1';
  typeInput.value = existing ? (existing.type || 'classroom') : 'classroom';
  clsInput.value = existing ? (existing.classroom || '') : '';
  bldInput.value = existing ? (existing.building || 'C') : 'C';
  descInput.value = existing ? (existing.description || '') : '';

  if (delBtn) delBtn.style.display = existing ? 'inline-flex' : 'none';
  modal.classList.add('open');
}

function closeRoomModal() {
  const modal = document.getElementById('room-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

async function saveRoomFromModal() {
  const roomId = document.getElementById('edit-room-id').value.trim();
  const room = {
    shortName: document.getElementById('edit-room-short').value.trim(),
    name: document.getElementById('edit-room-name').value.trim(),
    floor: Number(document.getElementById('edit-room-floor').value),
    type: document.getElementById('edit-room-type').value.trim() || 'classroom',
    classroom: document.getElementById('edit-room-classroom').value.trim(),
    building: document.getElementById('edit-room-building').value.trim() || 'C',
    description: document.getElementById('edit-room-desc').value.trim()
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

function renderCacheTab() {
  const c = state.cache || {};
  document.getElementById('cache-kpi-status').textContent = c.warming
    ? `Прогрев (${c.progress || ''})`
    : (c.ready ? 'Актуален' : 'Ожидание');
  document.getElementById('cache-kpi-updated').textContent = `Обновлён: ${formatDateTime(c.lastUpdate)}`;
  document.getElementById('cache-kpi-rooms').textContent = String(c.roomsCachedCount || 0);
  document.getElementById('cache-kpi-entities').textContent = String(c.entityCachedCount || 0);
  document.getElementById('cache-kpi-groups').textContent = String(c.groupsCount || 0);
  document.getElementById('cache-kpi-depts').textContent = String(c.departmentsCount || 0);
  document.getElementById('cache-kpi-lecturers').textContent = String(c.lecturersCount || 0);
  document.getElementById('cache-kpi-weeks').textContent = String(Array.isArray(c.availableWeeks) ? c.availableWeeks.length : 0);
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
  const pendingCount =
    state.mapMarkers.filter(m => m.status === 'pending').length +
    state.roomReviews.filter(r => r.status === 'pending').length +
    state.descriptionSuggestions.filter(d => d.status === 'pending').length;

  const approvedMarkers = state.mapMarkers.filter(m => m.status === 'approved').length;
  const approvedReviews = state.roomReviews.filter(r => r.status === 'approved').length;

  const elPending = document.getElementById('mod-kpi-pending');
  const elMarkers = document.getElementById('mod-kpi-markers');
  const elReviews = document.getElementById('mod-kpi-reviews');
  const elDescs = document.getElementById('mod-kpi-descriptions');
  if (elPending) elPending.textContent = String(pendingCount);
  if (elMarkers) elMarkers.textContent = `${approvedMarkers} / ${state.mapMarkers.length}`;
  if (elReviews) elReviews.textContent = `${approvedReviews} / ${state.roomReviews.length}`;
  if (elDescs) elDescs.textContent = String(state.descriptionSuggestions.length);

  const statusBadgeHtml = (st) => {
    if (st === 'approved') return `<span style="color:#16a34a;font-weight:700">Одобрено</span>`;
    if (st === 'rejected') return `<span style="color:#dc2626;font-weight:700">Отклонено</span>`;
    return `<span style="color:#d97706;font-weight:700">На модерации</span>`;
  };

  // 1. Описания кабинетов
  const descTbody = document.getElementById('mod-descriptions-tbody');
  if (descTbody) {
    if (state.descriptionSuggestions.length === 0) {
      descTbody.innerHTML = `<tr><td colspan="6" class="admin-empty-cell">Предложений описаний кабинетов пока нет</td></tr>`;
    } else {
      descTbody.innerHTML = state.descriptionSuggestions.map(item => {
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
                ${item.status !== 'approved' ? `<button type="button" class="admin-icon-btn" data-mod-type="description" data-mod-action="approve" data-mod-id="${escapeHtml(item.id)}"><i class="mdi mdi-check"></i> Одобрить и записать</button>` : ''}
                ${item.status !== 'rejected' ? `<button type="button" class="admin-icon-btn" data-mod-type="description" data-mod-action="reject" data-mod-id="${escapeHtml(item.id)}">Отклонить</button>` : ''}
                <button type="button" class="admin-icon-btn danger" data-mod-type="description" data-mod-action="delete" data-mod-id="${escapeHtml(item.id)}"><i class="mdi mdi-delete-outline"></i></button>
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
    if (state.roomReviews.length === 0) {
      revTbody.innerHTML = `<tr><td colspan="6" class="admin-empty-cell">Отзывов о буфетах и столовых пока нет</td></tr>`;
    } else {
      revTbody.innerHTML = state.roomReviews.map(item => {
        const roomMeta = state.rooms[item.roomId];
        const roomTitle = roomMeta ? (roomMeta.name || item.roomId) : item.roomId;
        return `
          <tr>
            <td><strong>${escapeHtml(roomTitle)}</strong><div class="admin-row-sub tabular-nums">${escapeHtml(item.roomId)}</div></td>
            <td style="color:#f59e0b;font-weight:700">${'★'.repeat(Number(item.rating) || 5)} (${escapeHtml(item.rating)})</td>
            <td style="max-width:320px;white-space:pre-wrap">${escapeHtml(item.text || '—')}</td>
            <td>${escapeHtml(item.authorName || 'Студент')}</td>
            <td>${statusBadgeHtml(item.status)}</td>
            <td class="text-right">
              <div class="admin-row-actions">
                ${item.status !== 'approved' ? `<button type="button" class="admin-icon-btn" data-mod-type="review" data-mod-action="approve" data-mod-id="${escapeHtml(item.id)}"><i class="mdi mdi-check"></i> Опубликовать</button>` : ''}
                ${item.status !== 'rejected' ? `<button type="button" class="admin-icon-btn" data-mod-type="review" data-mod-action="reject" data-mod-id="${escapeHtml(item.id)}">Скрыть</button>` : ''}
                <button type="button" class="admin-icon-btn danger" data-mod-type="review" data-mod-action="delete" data-mod-id="${escapeHtml(item.id)}"><i class="mdi mdi-delete-outline"></i></button>
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
    if (state.mapMarkers.length === 0) {
      markTbody.innerHTML = `<tr><td colspan="6" class="admin-empty-cell">Пользовательских меток на карте нет</td></tr>`;
    } else {
      markTbody.innerHTML = state.mapMarkers.map(item => `
        <tr>
          <td><strong>${escapeHtml(catNames[item.category] || item.category)} · ${escapeHtml(item.title)}</strong></td>
          <td class="tabular-nums">Корпус ${escapeHtml(item.building)} · ${escapeHtml(item.floor)} эт. (${escapeHtml(item.x)}, ${escapeHtml(item.y)})</td>
          <td style="max-width:260px">${escapeHtml(item.description || '—')}</td>
          <td>${escapeHtml(item.authorName || 'Администратор')}</td>
          <td>${statusBadgeHtml(item.status)}</td>
          <td class="text-right">
            <div class="admin-row-actions">
              ${item.status !== 'approved' ? `<button type="button" class="admin-icon-btn" data-mod-type="marker" data-mod-action="approve" data-mod-id="${escapeHtml(item.id)}"><i class="mdi mdi-check"></i> Одобрить</button>` : ''}
              ${item.status !== 'rejected' ? `<button type="button" class="admin-icon-btn" data-mod-type="marker" data-mod-action="reject" data-mod-id="${escapeHtml(item.id)}">Отклонить</button>` : ''}
              <button type="button" class="admin-icon-btn danger" data-mod-type="marker" data-mod-action="delete" data-mod-id="${escapeHtml(item.id)}"><i class="mdi mdi-delete-outline"></i></button>
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

  // 4. Настройки GPS
  const bCfg = state.gpsConfig?.buildings?.C || { centerLat: 54.61435, centerLon: 39.70825, rotationDeg: -18, scaleMetersPerSvgUnit: 0.10 };
  const latIn = document.getElementById('gps-cfg-lat');
  const lonIn = document.getElementById('gps-cfg-lon');
  const rotIn = document.getElementById('gps-cfg-rot');
  const scaleIn = document.getElementById('gps-cfg-scale');
  if (latIn) latIn.value = String(bCfg.centerLat ?? 54.61435);
  if (lonIn) lonIn.value = String(bCfg.centerLon ?? 39.70825);
  if (rotIn) rotIn.value = String(bCfg.rotationDeg ?? -18);
  if (scaleIn) scaleIn.value = String(bCfg.scaleMetersPerSvgUnit ?? 0.10);
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
  document.getElementById('edit-user-role')?.addEventListener('change', updateTargetDatalist);
  document.getElementById('btn-edit-user-clear-recent')?.addEventListener('click', () => {
    state.editingUserRecentViews = {};
    renderEditingUserRecentInfo(document.getElementById('edit-user-recent-info'));
  });

  // Конструктор шаблонов сообщений бота и панели инструментов Markdown
  const tplSearch = document.getElementById('bot-tpl-search');
  if (tplSearch) {
    tplSearch.addEventListener('input', () => {
      state.templateSearch = tplSearch.value;
      renderBotTemplateStudio();
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
      btn.addEventListener('click', () => {
        applyMarkdownActionToTextarea(targetTextarea, btn.dataset.md);
      });
    });

    toolbar.querySelectorAll('[data-insert-var]').forEach(btn => {
      btn.addEventListener('click', () => {
        insertAtTextareaCursor(targetTextarea, btn.dataset.insertVar);
      });
    });
  });

  document.getElementById('btn-bot-tpl-save')?.addEventListener('click', async () => {
    const tpl = getSelectedTemplateObject();
    const textarea = document.getElementById('bot-tpl-textarea');
    if (!tpl || !textarea) return;
    try {
      const res = await adminFetch('/api/admin/bot/templates', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'save',
          templateId: tpl.id,
          text: textarea.value
        })
      });
      state.botTemplates = Array.isArray(res.botTemplates) ? res.botTemplates : state.botTemplates;
      textarea.dataset.loadedTplId = '';
      renderBotTab();
      showToast(`Шаблон «${tpl.title}» сохранён в БД`);
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
      renderBotTab();
      showToast(`Шаблон «${tpl.title}» сброшен к стандартному`);
    } catch (e) {
      showToast(e.message);
    }
  });

  document.getElementById('btn-bot-reset-all-templates')?.addEventListener('click', async () => {
    const textarea = document.getElementById('bot-tpl-textarea');
    try {
      const res = await adminFetch('/api/admin/bot/templates', {
        method: 'POST',
        body: JSON.stringify({ mode: 'reset-all' })
      });
      state.botTemplates = Array.isArray(res.botTemplates) ? res.botTemplates : state.botTemplates;
      if (textarea) textarea.dataset.loadedTplId = '';
      renderBotTab();
      showToast('Все шаблоны бота сброшены к заводским');
    } catch (e) {
      showToast(e.message);
    }
  });

  document.getElementById('btn-bot-tpl-test-send')?.addEventListener('click', async () => {
    const tpl = getSelectedTemplateObject();
    const textarea = document.getElementById('bot-tpl-textarea');
    const userId = document.getElementById('bot-direct-user-select')?.value || '';
    const telegramId = document.getElementById('bot-direct-tgid')?.value.trim() || '';
    if (!tpl || !textarea) return;
    try {
      const res = await adminFetch('/api/admin/bot/templates', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'test-send',
          templateId: tpl.id,
          text: textarea.value,
          userId,
          telegramId
        })
      });
      showToast(`Тест шаблона отправлен в Telegram (ID ${res.telegramId})`);
    } catch (e) {
      showToast(e.message);
    }
  });

  // Вкладка Telegram-бота (личное сообщение и рассылка)
  const botUserSelect = document.getElementById('bot-direct-user-select');
  if (botUserSelect) {
    botUserSelect.addEventListener('change', () => {
      const opt = botUserSelect.selectedOptions[0];
      const tgid = opt ? opt.getAttribute('data-tgid') : '';
      if (tgid) document.getElementById('bot-direct-tgid').value = tgid;
    });
  }

  document.getElementById('btn-bot-check-now')?.addEventListener('click', async () => {
    const res = await adminFetch('/api/admin/bot/send', {
      method: 'POST',
      body: JSON.stringify({ mode: 'run-check-now' })
    });
    showToast(`Проверка расписания выполнена (активных подписок: ${res.candidatesCount || 0})`);
    await loadAllAdminData();
  });

  document.getElementById('btn-bot-send-test-lesson')?.addEventListener('click', () => {
    const userId = document.getElementById('bot-direct-user-select').value;
    const tgId = document.getElementById('bot-direct-tgid').value.trim();
    sendTestLessonToUser(userId, tgId);
  });

  document.getElementById('btn-bot-send-direct')?.addEventListener('click', async () => {
    const tgId = document.getElementById('bot-direct-tgid').value.trim();
    const text = document.getElementById('bot-direct-text').value.trim();
    const resBox = document.getElementById('bot-direct-result');
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
    const centerLat = parseFloat(document.getElementById('gps-cfg-lat')?.value || '54.61435');
    const centerLon = parseFloat(document.getElementById('gps-cfg-lon')?.value || '39.70825');
    const rotationDeg = parseFloat(document.getElementById('gps-cfg-rot')?.value || '-18');
    const scaleMetersPerSvgUnit = parseFloat(document.getElementById('gps-cfg-scale')?.value || '0.10');
    const prevAnchors = state.gpsConfig?.buildings?.C?.anchors || [];
    const nextCfg = {
      buildings: {
        ...(state.gpsConfig?.buildings || {}),
        C: {
          centerLat: Number.isFinite(centerLat) ? centerLat : 54.61435,
          centerLon: Number.isFinite(centerLon) ? centerLon : 39.70825,
          rotationDeg: Number.isFinite(rotationDeg) ? rotationDeg : -18,
          scaleMetersPerSvgUnit: Number.isFinite(scaleMetersPerSvgUnit) ? scaleMetersPerSvgUnit : 0.10,
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
