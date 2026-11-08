// Server-side Lightning payments for Exploding Sats.
//
// The browser never talks to LNbits directly: it asks this service for an
// invoice and polls it for payment status. The LNbits invoice key stays here,
// read from the runtime environment, and never ends up in the public bundle.
//
//   POST /lightning/invoice         { amountSats }       -> { invoice, paymentHash }
//   GET  /lightning/payments/:hash                         -> { paid }
//   GET  /lightning/health                                 -> { lightning: 'ok' | 'unavailable' }
//
// (nginx strips the leading /api, so the browser calls /api/lightning/...)
// The API is same-origin only, so these responses carry no CORS headers.

import { decode } from 'light-bolt11-decoder';

// The only prices the game charges. Anything else is rejected.
export const ALLOWED_AMOUNTS_SATS = [21];

// Fixed server-side memo: client-supplied memos are ignored.
export const INVOICE_MEMO = 'Exploding Sats - 21 sats to play';

const UPSTREAM_TIMEOUT_MS = 8000;
const HEALTH_CACHE_MS = 60 * 1000;
const PAYMENT_HASH_RE = /^[0-9a-f]{64}$/;

// Fixed one-minute windows. Status polling runs every 2s (30/min per invoice), so
// it is limited per IP + payment hash (players behind one carrier NAT don't starve
// each other), with a much higher per-IP ceiling to protect LNbits.
const RATE_LIMITS = {
  invoice: 10, // per IP
  payment: 60, // per IP + hash
  paymentsPerIp: 600, // per IP, all hashes
  health: 60, // per IP
};

export class UpstreamError extends Error {}

function parseLightningAddress(address) {
  const [user, domain, ...rest] = (address || '').trim().split('@');
  if (!user || !domain || rest.length > 0) return null;
  return { user, domain };
}

function decodeInvoice(bolt11) {
  const decoded = decode(bolt11);
  const section = (name) => decoded.sections.find((s) => s.name === name);
  return {
    paymentHash: section('payment_hash')?.value,
    amountMsat: section('amount')?.value,
  };
}

export function createLightningService({
  lightningAddress,
  lnbitsUrl,
  invoiceKey,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = UPSTREAM_TIMEOUT_MS,
} = {}) {
  const address = parseLightningAddress(lightningAddress);
  const baseUrl = (lnbitsUrl || (address ? `https://${address.domain}` : '')).replace(/\/+$/, '');
  const lnurlpUrl = address ? `https://${address.domain}/.well-known/lnurlp/${encodeURIComponent(address.user)}` : null;
  const configured = Boolean(address && baseUrl && invoiceKey);

  let healthCache = null; // { status, expires }
  let healthInFlight = null;

  async function fetchJson(url, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new UpstreamError(`Request failed: ${err.message}`);
    }
    if (!response.ok) {
      throw new UpstreamError(`HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new UpstreamError('Invalid JSON');
    }
  }

  async function resolvePayRequest() {
    const data = await fetchJson(lnurlpUrl);
    if (data?.tag !== 'payRequest' || typeof data.callback !== 'string') {
      throw new UpstreamError('Not an LNURL-pay response');
    }
    let callback;
    try {
      callback = new URL(data.callback);
    } catch {
      throw new UpstreamError('Invalid LNURL callback');
    }
    if (callback.protocol !== 'https:' && callback.protocol !== 'http:') {
      throw new UpstreamError('Invalid LNURL callback protocol');
    }
    return { ...data, callback };
  }

  async function probe() {
    if (!configured) return 'unavailable';
    try {
      await resolvePayRequest();
      return 'ok';
    } catch (err) {
      console.warn('[lightning] health probe failed:', err.message);
      return 'unavailable';
    }
  }

  async function health() {
    if (healthCache && healthCache.expires > now()) return healthCache.status;
    if (!healthInFlight) {
      healthInFlight = probe()
        .then((status) => {
          healthCache = { status, expires: now() + HEALTH_CACHE_MS };
          return status;
        })
        .finally(() => {
          healthInFlight = null;
        });
    }
    return healthInFlight;
  }

  async function createInvoice(amountSats) {
    if (!configured) throw new UpstreamError('Lightning is not configured');
    try {
      const payRequest = await resolvePayRequest();
      const amountMsat = amountSats * 1000;
      if (
        (typeof payRequest.minSendable === 'number' && amountMsat < payRequest.minSendable) ||
        (typeof payRequest.maxSendable === 'number' && amountMsat > payRequest.maxSendable)
      ) {
        throw new UpstreamError('Amount outside the wallet limits');
      }

      const callback = new URL(payRequest.callback);
      callback.searchParams.set('amount', String(amountMsat));
      if (payRequest.commentAllowed > 0) {
        callback.searchParams.set('comment', INVOICE_MEMO.slice(0, payRequest.commentAllowed));
      }

      const data = await fetchJson(callback.toString());
      if (typeof data?.pr !== 'string' || !data.pr) {
        throw new UpstreamError('No invoice returned');
      }

      let decoded;
      try {
        decoded = decodeInvoice(data.pr);
      } catch {
        throw new UpstreamError('Invalid invoice returned');
      }
      if (!decoded.paymentHash || !PAYMENT_HASH_RE.test(decoded.paymentHash)) {
        throw new UpstreamError('Invoice has no payment hash');
      }
      if (String(decoded.amountMsat) !== String(amountMsat)) {
        throw new UpstreamError('Invoice amount does not match');
      }

      return { invoice: data.pr, paymentHash: decoded.paymentHash };
    } catch (err) {
      // Re-probe on the next health check so the UI can show the banner quickly.
      healthCache = null;
      throw err;
    }
  }

  async function isPaid(paymentHash) {
    if (!configured) throw new UpstreamError('Lightning is not configured');
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/api/v1/payments/${paymentHash}`, {
        headers: { 'X-Api-Key': invoiceKey },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new UpstreamError(`Request failed: ${err.message}`);
    }
    // Unknown to this wallet: simply not paid.
    if (response.status === 404) return false;
    if (!response.ok) throw new UpstreamError(`HTTP ${response.status}`);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new UpstreamError('Invalid JSON');
    }
    // LNbits reports "paid": true, or "status": "success" in newer versions.
    return data?.paid === true || data?.status === 'success';
  }

  return { configured, health, createInvoice, isPaid };
}

// Fixed-window per-key counter. Small and in-memory: enough to stop a single
// client hammering LNbits through this service. Returns 0 if allowed, otherwise
// the number of seconds until the window resets (for Retry-After).
export function createRateLimiter({ now = () => Date.now(), windowMs = 60 * 1000 } = {}) {
  const buckets = new Map();
  let lastSweep = now();

  return function retryAfter(key, limit) {
    const t = now();
    if (t - lastSweep > windowMs) {
      for (const [k, b] of buckets) if (b.reset <= t) buckets.delete(k);
      lastSweep = t;
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= t) {
      bucket = { count: 0, reset: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit ? 0 : Math.max(1, Math.ceil((bucket.reset - t) / 1000));
  };
}

function clientIp(req) {
  // nginx (in the same container) sets X-Real-IP; only trust it from loopback.
  const remote = req.socket?.remoteAddress || '';
  const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const realIp = req.headers['x-real-ip'];
  return isLoopback && typeof realIp === 'string' && realIp ? realIp : remote;
}

const UNAVAILABLE = { error: 'Lightning payments are temporarily unavailable' };

// JSON response without CORS headers (same-origin API).
function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

// Returns true if the request was a /lightning/* route and has been answered.
export function createLightningRouter({ service, parseBody, rateLimiter = createRateLimiter() }) {
  return async function handle(req, res, pathname) {
    if (!pathname.startsWith('/lightning/')) return false;

    const ip = clientIp(req);
    // Every bucket is counted; the longest wait wins.
    const limited = (...buckets) => {
      const wait = Math.max(...buckets.map(([name, key]) => rateLimiter(`${name}:${key}`, RATE_LIMITS[name])));
      if (!wait) return false;
      sendJson(res, 429, { error: 'Too many requests' }, { 'Retry-After': String(wait) });
      return true;
    };

    if (req.method === 'GET' && pathname === '/lightning/health') {
      if (limited(['health', ip])) return true;
      sendJson(res, 200, { lightning: await service.health() });
      return true;
    }

    if (req.method === 'POST' && pathname === '/lightning/invoice') {
      if (limited(['invoice', ip])) return true;
      let body;
      try {
        body = await parseBody(req);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return true;
      }
      const amountSats = body?.amountSats;
      if (!Number.isInteger(amountSats) || !ALLOWED_AMOUNTS_SATS.includes(amountSats)) {
        sendJson(res, 400, { error: 'Invalid amount' });
        return true;
      }
      try {
        const { invoice, paymentHash } = await service.createInvoice(amountSats);
        sendJson(res, 200, { invoice, paymentHash });
      } catch (err) {
        console.warn('[lightning] invoice creation failed:', err.message);
        sendJson(res, 503, UNAVAILABLE);
      }
      return true;
    }

    const paymentMatch = pathname.match(/^\/lightning\/payments\/([^/]+)$/);
    if (req.method === 'GET' && paymentMatch) {
      const hash = paymentMatch[1];
      if (!PAYMENT_HASH_RE.test(hash)) {
        sendJson(res, 400, { error: 'Invalid payment hash' });
        return true;
      }
      if (limited(['payment', `${ip}:${hash}`], ['paymentsPerIp', ip])) return true;
      try {
        sendJson(res, 200, { paid: await service.isPaid(hash) });
      } catch (err) {
        console.warn('[lightning] payment status check failed:', err.message);
        sendJson(res, 503, UNAVAILABLE);
      }
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  };
}
