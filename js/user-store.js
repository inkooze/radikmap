const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

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

class UserStore {
  constructor(filePath = DEFAULT_USERS_FILE) {
    this.filePath = filePath;
    this.data = {
      users: {},       // userId -> userRecord
      authCodes: {},   // 6-digit code -> { telegramId, firstName, username, expiresAt }
      authSessions: {} // sessionToken -> { status: 'pending'|'verified', userId, expiresAt }
    };
    this._saveTimer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          if (parsed.users || parsed.authCodes || parsed.authSessions) {
            this.data.users = parsed.users || {};
            this.data.authCodes = parsed.authCodes || {};
            this.data.authSessions = parsed.authSessions || {};
          } else {
            this.data.users = parsed;
          }
        }
      }
    } catch (e) {
      console.error('[users] Ошибка чтения базы пользователей:', e.message);
    }
  }

  save(immediate = false) {
    this.cleanupExpired();
    if (immediate) {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      this.flushSync();
      return;
    }
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flushAsync();
    }, 100);
  }

  flushSync() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmpFile = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.filePath);
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

  sanitizeUserInput(input = {}) {
    const role = input.role === 'lecturer' ? 'lecturer' : 'student';
    const targetName = String(input.targetName || '').trim().slice(0, 120);
    const theme = (input.theme === 'dark' || input.theme === 'light' || input.theme === 'system') ? input.theme : 'system';
    const notificationsEnabled = Boolean(input.notificationsEnabled);
    const firstName = String(input.firstName || '').trim().slice(0, 64);
    const username = String(input.username || '').replace(/^@/, '').trim().slice(0, 64);
    const favorites = Array.isArray(input.favorites)
      ? input.favorites.map(v => String(v || '').trim()).filter(Boolean).slice(0, 200)
      : undefined;
    const recentViews = (input.recentViews && typeof input.recentViews === 'object' && !Array.isArray(input.recentViews))
      ? input.recentViews
      : undefined;
    return { role, targetName, theme, notificationsEnabled, firstName, username, favorites, recentViews };
  }

  getUser(userId) {
    if (!userId) return null;
    return this.data.users[String(userId)] || null;
  }

  getUserByTelegramId(telegramId) {
    if (!telegramId) return null;
    return this.getUser(`tg_${telegramId}`) || this.getUser(String(telegramId));
  }

  findUserByUsername(username) {
    const clean = String(username || '').replace(/^@/, '').trim().toLowerCase();
    if (!clean) return null;
    for (const u of Object.values(this.data.users)) {
      if (u && String(u.username || '').toLowerCase() === clean) return u;
    }
    return null;
  }

  upsertUser(userId, patch = {}) {
    if (!userId) throw new Error('userId is required');
    const key = String(userId);
    const existing = this.data.users[key] || {
      id: key,
      telegramId: key.startsWith('tg_') ? Number(key.slice(3)) || null : (/^\d+$/.test(key) ? Number(key) : null),
      firstName: '',
      username: '',
      role: 'student',
      targetName: '',
      notificationsEnabled: false,
      theme: 'system',
      favorites: [],
      recentViews: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastNotifiedSlot: null
    };

    const updated = {
      ...existing,
      updatedAt: Date.now()
    };

    if (patch.telegramId !== undefined) updated.telegramId = patch.telegramId ? Number(patch.telegramId) : existing.telegramId;
    if (patch.firstName !== undefined && String(patch.firstName).trim()) updated.firstName = String(patch.firstName).trim().slice(0, 64);
    if (patch.username !== undefined && String(patch.username).trim()) updated.username = String(patch.username).replace(/^@/, '').trim().slice(0, 64);
    if (patch.role === 'student' || patch.role === 'lecturer') updated.role = patch.role;
    if (patch.targetName !== undefined) updated.targetName = String(patch.targetName).trim().slice(0, 120);
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
    if (patch.lastNotifiedSlot !== undefined) updated.lastNotifiedSlot = patch.lastNotifiedSlot;

    this.data.users[key] = updated;
    this.save(true);
    return this.toPublicUser(updated);
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
      notificationsEnabled: Boolean(u.notificationsEnabled),
      theme: u.theme || 'system',
      favorites: isTelegramLinked && Array.isArray(u.favorites) ? u.favorites : [],
      recentViews: isTelegramLinked && u.recentViews && typeof u.recentViews === 'object' ? u.recentViews : {},
      isTelegramLinked,
      updatedAt: u.updatedAt
    };
  }

  createAuthCodeForTelegramUser({ telegramId, firstName = '', username = '' }) {
    if (!telegramId) throw new Error('telegramId is required');
    this.upsertUser(`tg_${telegramId}`, { telegramId, firstName, username });

    const code = String(crypto.randomInt(100000, 999999));
    this.data.authCodes[code] = {
      telegramId: Number(telegramId),
      firstName: String(firstName || '').slice(0, 64),
      username: String(username || '').replace(/^@/, '').slice(0, 64),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    };
    this.save(true);
    return code;
  }

  consumeAuthCode(code, mergePreferences = {}) {
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
    this.save(true);
    return user;
  }

  createBrowserAuthSession() {
    this.load();
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
    this.load();
    this.cleanupExpired();
    const cleanToken = String(sessionToken || '').replace(/^(login_|webauth_)/i, '').trim();
    const sess = this.data.authSessions[cleanToken];
    if (!sess) return false;
    const user = this.upsertUser(`tg_${telegramId}`, { telegramId, firstName, username });
    sess.status = 'verified';
    sess.userId = user.id;
    this.save(true);
    return true;
  }

  checkBrowserAuthSession(sessionToken) {
    this.load();
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
    this.load();
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
  splitGroupAndLecturer,
  UserStore,
  defaultUserStore,
  verifyTelegramWebAppInitData
};
