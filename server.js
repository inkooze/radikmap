const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // --- API-прокси к РГРТУ ---
  if (url.pathname === '/api/schedule') {
    const building = url.searchParams.get('building');
    const classroom = url.searchParams.get('classroom');
    const date = url.searchParams.get('date');
    if (!building || !classroom || !date) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing params: building, classroom, date');
      return;
    }
    const target = `https://rasp.rsreu.ru/schedule-frame/classroom?building=${encodeURIComponent(building)}&classroom=${encodeURIComponent(classroom)}&date=${encodeURIComponent(date)}`;
    console.log(`[proxy] ${target}`);

    try {
      const r = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CampusMap/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        }
      });
      const text = await r.text();
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(text);
    } catch (e) {
      console.error('[proxy error]', e.message);
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy error: ' + e.message);
    }
    return;
  }

  // --- Статические файлы ---
  let urlPath = decodeURIComponent(url.pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);

  // Защита от выхода за пределы папки
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✅  Сервер запущен');
  console.log('  🌐  Открой в браузере: http://localhost:' + PORT);
  console.log('  🛑  Остановить: Ctrl + C в этом терминале');
  console.log('');
});