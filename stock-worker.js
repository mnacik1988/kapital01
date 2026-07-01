const ALLOWED_ORIGINS = new Set([
  'https://mnacik1988.github.io',
  'null'
]);

const TICKER_RE = /^[A-Z0-9.\-]{1,15}$/;
const COIN_RE = /^[A-Z0-9\-]{1,20}$/;
const MEMORY_CACHE = new Map();
const RATE_BUCKETS = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_LIMIT = 60;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin)) return json({ error: 'Origin not allowed' }, 403, origin);

    if (request.method === 'OPTIONS') return corsPreflight(origin);

    const url = new URL(request.url);

    // AI proxy — POST only, handled before GET-only guard
    if (url.pathname === '/ai') return handleAI(request, origin, env);

    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await allowRequest(env, ip))) return json({ error: 'Too many requests' }, 429, origin, 30);

    try {
      if (url.pathname === '/') {
        return json({ status: 'ok', service: 'InveStory market data proxy', version: '2.0' }, 200, origin, 60);
      }
      if (url.pathname === '/price') return handlePrice(url, env, origin);
      if (url.pathname === '/multi') return handleMulti(url, env, origin);
      if (url.pathname === '/rates') return handleRates(origin);
      if (url.pathname === '/crypto') return handleCrypto(url, origin);
      return json({ error: 'Not found' }, 404, origin);
    } catch (error) {
      console.error('Worker request failed', error);
      return json({ error: 'Market data is temporarily unavailable' }, 502, origin);
    }
  }
};

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

async function allowRequest(env, ip) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    const result = await env.RATE_LIMITER.limit({ key: ip });
    return result.success;
  }

  const now = Date.now();
  const windowMs = 60 * 1000;
  const bucket = RATE_BUCKETS.get(ip);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    RATE_BUCKETS.set(ip, { startedAt: now, count: 1 });
    pruneRateBuckets(now, windowMs);
    return true;
  }
  bucket.count += 1;
  return bucket.count <= FALLBACK_LIMIT;
}

function pruneRateBuckets(now, windowMs) {
  if (RATE_BUCKETS.size < 500) return;
  for (const [key, bucket] of RATE_BUCKETS) {
    if (now - bucket.startedAt >= windowMs) RATE_BUCKETS.delete(key);
  }
}

async function handlePrice(url, env, origin) {
  const ticker = normalizeTicker(url.searchParams.get('ticker'));
  if (!ticker) return json({ error: 'Valid ticker required' }, 400, origin);
  const data = await getStock(ticker, env);
  return json({ ...data, usdUah: await getUsdUah() }, 200, origin, 300);
}

async function handleMulti(url, env, origin) {
  const raw = (url.searchParams.get('tickers') || '').split(',');
  const tickers = [...new Set(raw.map(normalizeTicker).filter(Boolean))].slice(0, 10);
  if (!tickers.length) return json({ error: 'Valid tickers required' }, 400, origin);

  const settled = await Promise.allSettled(tickers.map(ticker => getStock(ticker, env)));
  const stocks = {};
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') stocks[tickers[index]] = result.value;
  });
  return json({ usdUah: await getUsdUah(), stocks, updated: new Date().toISOString() }, 200, origin, 300);
}

async function getStock(ticker, env) {
  if (!env.FINNHUB_KEY) throw new Error('FINNHUB_KEY secret is missing');
  return memoize('stock:' + ticker, async () => {
    const base = 'https://finnhub.io/api/v1/';
    const token = encodeURIComponent(env.FINNHUB_KEY);
    const symbol = encodeURIComponent(ticker);
    const [quoteRes, profileRes, metricsRes] = await Promise.all([
      providerFetch(base + 'quote?symbol=' + symbol + '&token=' + token),
      providerFetch(base + 'stock/profile2?symbol=' + symbol + '&token=' + token),
      providerFetch(base + 'stock/metric?symbol=' + symbol + '&metric=all&token=' + token)
    ]);
    const [quote, profile, metrics] = await Promise.all([
      quoteRes.json(), profileRes.json(), metricsRes.json()
    ]);
    if (!Number(quote?.c)) throw new Error('Ticker not found');

    const price = Number(quote.c);
    const previous = Number(quote.pc) || price;
    const change = price - previous;

    // Fetch dividend events from Yahoo Finance chart (range=1y includes announced future dates)
    let exDate = '', payDate = '', divIsFuture = false;
    try {
      const yahooResp = await fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) +
        '?range=1y&interval=1mo&events=div',
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
      );
      if (yahooResp.ok) {
        const yahooData = await yahooResp.json().catch(() => null);
        const divEvents = yahooData?.chart?.result?.[0]?.events?.dividends || {};
        const todayTs = Math.floor(Date.now() / 1000);
        const tsToIso = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '';
        // Find nearest upcoming ex-date, fallback to most recent past ex-date
        const tsList = Object.keys(divEvents).map(Number).sort((a, b) => a - b);
        const future = tsList.filter(ts => ts >= todayTs);
        const past = tsList.filter(ts => ts < todayTs);
        const pick = future.length ? future[0] : (past.length ? past[past.length - 1] : 0);
        if (pick) {
          exDate = tsToIso(pick);
          payDate = tsToIso(divEvents[String(pick)]?.date);
          divIsFuture = pick >= todayTs;
        }
      }
    } catch(_) {}

    return {
      ticker,
      name: profile?.name || ticker,
      price,
      change: round(change, 4),
      changePct: round(previous ? change / previous * 100 : 0, 4),
      divYield: round(Number(metrics?.metric?.dividendYieldIndicatedAnnual) || 0, 4),
      divAbs: round(Number(metrics?.metric?.dividendsPerShareAnnual) || 0, 4),
      currency: profile?.currency || 'USD',
      exDate,
      payDate,
      divIsFuture
    };
  });
}

async function handleAI(request, origin, env) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405, origin);
  const apiKey = env.CLAUDE_KEY || '';
  if (!apiKey) return json({ error: 'AI not configured' }, 503, origin);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body' }, 400, origin); }

  if (!Array.isArray(body.messages) || !body.messages.length) {
    return json({ error: 'messages required' }, 400, origin);
  }

  const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: Math.min(Number(body.max_tokens) || 1024, 2048),
      system: String(body.system || ''),
      messages: body.messages.slice(-20)
    })
  }).catch(e => { throw new Error('Anthropic unreachable: ' + e.message); });

  const data = await claudeResp.json().catch(() => ({}));
  if (!claudeResp.ok) {
    return json({ error: data?.error?.message || 'Claude API error ' + claudeResp.status }, claudeResp.status, origin);
  }
  const content = data?.content?.[0]?.text || '';
  return json({ content }, 200, origin, 0);
}

async function handleRates(origin) {
  const rates = await memoize('rates:uah', async () => {
    const response = await providerFetch('https://open.er-api.com/v6/latest/UAH');
    const data = await response.json();
    if (!data?.rates) throw new Error('Rates unavailable');
    const result = { UAH: 1 };
    for (const [currency, value] of Object.entries(data.rates)) {
      const rate = Number(value);
      if (rate > 0) result[currency.toUpperCase()] = round(1 / rate, 6);
    }
    return result;
  });
  return json(rates, 200, origin, 900);
}

async function handleCrypto(url, origin) {
  const coin = String(url.searchParams.get('coin') || '').trim().toUpperCase();
  if (!COIN_RE.test(coin)) return json({ error: 'Valid coin required' }, 400, origin);

  const data = await memoize('crypto:' + coin, async () => {
    const search = await providerFetch('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(coin));
    const found = await search.json();
    const match = found?.coins?.find(item => String(item.symbol || '').toUpperCase() === coin);
    if (!match?.id) throw new Error('Coin not found');
    const priceRes = await providerFetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(match.id) +
      '&vs_currencies=usd&include_24hr_change=true'
    );
    const priceData = await priceRes.json();
    const item = priceData?.[match.id];
    if (!Number(item?.usd)) throw new Error('Coin price unavailable');
    return { price: Number(item.usd), change24h: Number(item.usd_24h_change) || 0 };
  });
  return json(data, 200, origin, 300);
}

async function getUsdUah() {
  return memoize('rate:usd-uah', async () => {
    const response = await providerFetch(
      'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json'
    );
    const data = await response.json();
    const rate = Number(data?.[0]?.rate);
    if (!rate) throw new Error('USD/UAH unavailable');
    return round(rate, 4);
  });
}

async function providerFetch(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'InveStory-Worker/2.0' },
    cf: { cacheEverything: true, cacheTtl: 300 }
  });
  if (!response.ok) throw new Error('Provider HTTP ' + response.status);
  return response;
}

async function memoize(key, loader) {
  const now = Date.now();
  const cached = MEMORY_CACHE.get(key);
  if (cached && now - cached.savedAt < CACHE_TTL_MS) return cached.value;
  const value = await loader();
  MEMORY_CACHE.set(key, { savedAt: now, value });
  if (MEMORY_CACHE.size > 500) {
    for (const [cacheKey, entry] of MEMORY_CACHE) {
      if (now - entry.savedAt >= CACHE_TTL_MS) MEMORY_CACHE.delete(cacheKey);
    }
  }
  return value;
}

function normalizeTicker(value) {
  const ticker = String(value || '').trim().toUpperCase();
  return TICKER_RE.test(ticker) ? ticker : '';
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function corsPreflight(origin) {
  return new Response(null, {
    status: 204,
    headers: responseHeaders(origin, 0)
  });
}

function json(body, status, origin, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin, maxAge)
  });
}

function responseHeaders(origin, maxAge) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': maxAge ? 'public, max-age=' + maxAge : 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
}
