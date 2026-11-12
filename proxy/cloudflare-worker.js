/**
 * Cloudflare Worker: Бесплатный Reverse-Proxy для обхода блокировки Google Cloud Run из РФ.
 * 
 * Инструкция по запуску за 2 минуты:
 * 1. Зайдите на https://dash.cloudflare.com (регистрация бесплатная, карта не требуется).
 * 2. Перейдите в раздел "Workers & Pages" -> "Create application" -> "Create Worker".
 * 3. Нажмите "Deploy", затем "Edit code".
 * 4. Замените весь код воркера на этот файл.
 * 5. Нажмите "Deploy". Вы получите бесплатный адрес вида: https://radikmap.<ваш-аккаунт>.workers.dev
 * 6. Этот адрес будет открываться из РФ на любом провайдере и в Telegram БЕЗ VPN!
 * 7. Укажите полученный адрес в .env как WEBAPP_URL=https://...
 */

const TARGET_HOST = 'ais-pre-irnfdqzemrx7nu7xzzdevi-814881682897.us-east1.run.app';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    url.hostname = TARGET_HOST;
    url.protocol = 'https:';
    url.port = '443';

    // Копируем заголовки, подменяя Host
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set('Host', TARGET_HOST);
    reqHeaders.set('X-Forwarded-Host', request.headers.get('Host') || url.hostname);
    reqHeaders.set('X-Forwarded-Proto', 'https');

    // Удаляем заголовки, которые могут вызывать сбои проксирования
    reqHeaders.delete('cf-connecting-ip');
    reqHeaders.delete('cf-ipcountry');
    reqHeaders.delete('cf-ray');
    reqHeaders.delete('cf-visitor');

    const newRequest = new Request(url.toString(), {
      method: request.method,
      headers: reqHeaders,
      body: (request.method !== 'GET' && request.method !== 'HEAD') ? request.body : undefined,
      redirect: 'follow'
    });

    try {
      const response = await fetch(newRequest);
      const resHeaders = new Headers(response.headers);

      // Обеспечиваем открытый CORS для Telegram WebApp и PWA
      resHeaders.set('Access-Control-Allow-Origin', '*');
      resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      resHeaders.set('Access-Control-Allow-Headers', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }
};
