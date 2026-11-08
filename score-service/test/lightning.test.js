import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createLightningService, createLightningRouter, createRateLimiter } from '../lightning.js';

// --- helpers ---------------------------------------------------------------

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function toWords(bytes) {
  const words = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  return words;
}

function bech32Encode(hrp, words) {
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const mod = polymod([...expanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((w) => CHARSET[w]).join('')}`;
}

// A structurally valid bolt11 (dummy signature; the decoder does not verify it).
function fakeInvoice(amountSats, hashHex) {
  const ts = [];
  let t = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 7; i++) {
    ts.unshift(t & 31);
    t = Math.floor(t / 32);
  }
  const hashWords = toWords(Buffer.from(hashHex, 'hex'));
  const words = [...ts, 1, hashWords.length >> 5, hashWords.length & 31, ...hashWords, ...toWords(Buffer.alloc(65, 1))];
  return bech32Encode(`lnbc${amountSats * 10}n`, words);
}

const HASH = 'ab'.repeat(32);
const ADDRESS = 'game@bank.example';
const KEY = 'test-invoice-key';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeLnbits({ lnurlp = 'ok', invoiceSats = 21, payment = { paid: false } } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {} });
    const u = new URL(url);
    if (u.pathname === '/.well-known/lnurlp/game') {
      if (lnurlp === 'down') throw new Error('ECONNREFUSED');
      if (lnurlp === '500') return jsonResponse(500, {});
      return jsonResponse(200, {
        tag: 'payRequest',
        callback: 'https://bank.example/lnurlp/api/v1/lnurl/cb/abc',
        minSendable: 1000,
        maxSendable: 1000000,
        metadata: '[]',
        commentAllowed: 10,
      });
    }
    if (u.pathname === '/lnurlp/api/v1/lnurl/cb/abc') {
      return jsonResponse(200, { pr: fakeInvoice(invoiceSats, HASH), routes: [] });
    }
    if (u.pathname.startsWith('/api/v1/payments/')) {
      if (payment === 404) return jsonResponse(404, { detail: 'Payment does not exist.' });
      if (payment === 500) return jsonResponse(500, {});
      return jsonResponse(200, payment);
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, calls };
}

function service(opts = {}, overrides = {}) {
  const lnbits = fakeLnbits(opts);
  return {
    lnbits,
    service: createLightningService({
      lightningAddress: ADDRESS,
      lnbitsUrl: 'https://bank.example',
      invoiceKey: KEY,
      fetchImpl: lnbits.fetchImpl,
      ...overrides,
    }),
  };
}

// --- service ---------------------------------------------------------------

test('createInvoice resolves the lightning address and returns invoice + hash', async () => {
  const { service: s, lnbits } = service();
  const result = await s.createInvoice(21);
  assert.equal(result.paymentHash, HASH);
  assert.match(result.invoice, /^lnbc210n1/);
  const cb = new URL(lnbits.calls[1].url);
  assert.equal(cb.searchParams.get('amount'), '21000');
  assert.equal(cb.searchParams.get('comment'), 'Exploding '); // fixed memo, trimmed to commentAllowed
  // The invoice key is never sent to the LNURL endpoints
  assert.ok(lnbits.calls.every((c) => !('X-Api-Key' in c.headers)));
});

test('createInvoice rejects an invoice whose amount does not match', async () => {
  const { service: s } = service({ invoiceSats: 1 });
  await assert.rejects(s.createInvoice(21), /amount does not match/);
});

test('createInvoice fails cleanly when LNbits is down', async () => {
  const { service: s } = service({ lnurlp: 'down' });
  await assert.rejects(s.createInvoice(21), /Request failed/);
});

test('isPaid sends the key server-side and maps LNbits responses', async () => {
  let { service: s, lnbits } = service({ payment: { paid: true } });
  assert.equal(await s.isPaid(HASH), true);
  assert.equal(lnbits.calls[0].url, `https://bank.example/api/v1/payments/${HASH}`);
  assert.equal(lnbits.calls[0].headers['X-Api-Key'], KEY);

  ({ service: s } = service({ payment: { paid: false, status: 'success' } }));
  assert.equal(await s.isPaid(HASH), true);
  ({ service: s } = service({ payment: { paid: false, status: 'pending' } }));
  assert.equal(await s.isPaid(HASH), false);
  ({ service: s } = service({ payment: 404 }));
  assert.equal(await s.isPaid(HASH), false);
  ({ service: s } = service({ payment: 500 }));
  await assert.rejects(s.isPaid(HASH));
});

test('health is ok when the lnurlp endpoint answers, unavailable otherwise', async () => {
  assert.equal(await service().service.health(), 'ok');
  assert.equal(await service({ lnurlp: 'down' }).service.health(), 'unavailable');
  assert.equal(await service({ lnurlp: '500' }).service.health(), 'unavailable');
  assert.equal(await service({}, { invoiceKey: '' }).service.health(), 'unavailable');
});

test('health is cached for 60 seconds', async () => {
  let t = 0;
  const { service: s, lnbits } = service({}, { now: () => t });
  await s.health();
  await s.health();
  assert.equal(lnbits.calls.length, 1);
  t = 61 * 1000;
  await s.health();
  assert.equal(lnbits.calls.length, 2);
});

test('rate limiter allows up to the limit per window, then returns seconds to wait', () => {
  let t = 0;
  const retryAfter = createRateLimiter({ now: () => t });
  assert.equal(retryAfter('a', 2), 0);
  assert.equal(retryAfter('a', 2), 0);
  t = 15 * 1000;
  assert.equal(retryAfter('a', 2), 45);
  assert.equal(retryAfter('b', 2), 0);
  t = 60 * 1000;
  assert.equal(retryAfter('a', 2), 0);
});

// --- HTTP router -----------------------------------------------------------

async function withServer(svc, fn) {
  const sendJson = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  const parseBody = (req) =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    });
  const handle = createLightningRouter({ service: svc, parseBody });
  const server = http.createServer(async (req, res) => {
    if (!(await handle(req, res, new URL(req.url, 'http://x').pathname))) sendJson(res, 404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('router validates input and returns only what the UI needs', async () => {
  await withServer(service({ payment: { paid: true, amount: 21000, wallet_id: 'secret' } }).service, async (base) => {
    const post = (body) =>
      fetch(`${base}/lightning/invoice`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

    let res = await post({ amountSats: 21 });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(await res.json()).sort(), ['invoice', 'paymentHash']);
    // Same-origin API: no CORS headers
    assert.equal(res.headers.get('access-control-allow-origin'), null);

    for (const bad of [{ amountSats: 20 }, { amountSats: 21.5 }, { amountSats: '21' }, { amountSats: 1000000 }, {}]) {
      res = await post(bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    assert.equal((await post('not json')).status, 400);

    res = await fetch(`${base}/lightning/payments/${HASH}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { paid: true });

    for (const bad of ['xyz', HASH.toUpperCase(), `${HASH}00`, '..%2F..%2Fwallet']) {
      res = await fetch(`${base}/lightning/payments/${bad}`);
      assert.equal(res.status, 400, bad);
    }

    res = await fetch(`${base}/lightning/health`);
    assert.deepEqual(await res.json(), { lightning: 'ok' });
  });
});

test('router answers 503 without leaking details when LNbits is down', async () => {
  await withServer(service({ lnurlp: 'down', payment: 500 }).service, async (base) => {
    let res = await fetch(`${base}/lightning/invoice`, { method: 'POST', body: JSON.stringify({ amountSats: 21 }) });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'Lightning payments are temporarily unavailable' });
    res = await fetch(`${base}/lightning/payments/${HASH}`);
    assert.equal(res.status, 503);
    res = await fetch(`${base}/lightning/health`);
    assert.deepEqual(await res.json(), { lightning: 'unavailable' });
  });
});

test('router ignores a client-supplied memo', async () => {
  const { service: s, lnbits } = service();
  await withServer(s, async (base) => {
    const res = await fetch(`${base}/lightning/invoice`, {
      method: 'POST',
      body: JSON.stringify({ amountSats: 21, memo: 'pwned by attacker' }),
    });
    assert.equal(res.status, 200);
  });
  const cb = new URL(lnbits.calls.find((c) => c.url.includes('/cb/')).url);
  assert.equal(cb.searchParams.get('comment'), 'Exploding ');
});

test('router limits status polling per IP + hash, with Retry-After', async () => {
  await withServer(service().service, async (base) => {
    const otherHash = 'cd'.repeat(32);
    for (let i = 0; i < 60; i++) {
      assert.equal((await fetch(`${base}/lightning/payments/${HASH}`)).status, 200);
    }
    const limited = await fetch(`${base}/lightning/payments/${HASH}`);
    assert.equal(limited.status, 429);
    const retryAfter = Number(limited.headers.get('retry-after'));
    assert.ok(retryAfter >= 1 && retryAfter <= 60, String(retryAfter));
    // Another payer behind the same IP (carrier NAT) can still poll their own invoice
    assert.equal((await fetch(`${base}/lightning/payments/${otherHash}`)).status, 200);
  });
});

test('router rate limits invoice creation per IP', async () => {
  await withServer(service().service, async (base) => {
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const res = await fetch(`${base}/lightning/invoice`, { method: 'POST', body: JSON.stringify({ amountSats: 21 }) });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429);
  });
});
