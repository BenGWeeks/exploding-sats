import http from 'node:http';
import WebSocket from 'ws';
import { nip19, finalizeEvent, SimplePool } from 'nostr-tools';
import { createLightningService, createLightningRouter } from './lightning.js';

// Polyfill WebSocket for Node.js
globalThis.WebSocket = WebSocket;

const PORT = process.env.PORT || 3002;
const GAME_NSEC = process.env.GAME_NSEC;
const GAME_ID = 'exploding-sats';
const GRADES = ['NOVICE', '1ST DAN', '2ND DAN', '3RD DAN', '4TH DAN', '5TH DAN', '6TH DAN', '7TH DAN', '8TH DAN', '9TH DAN', '10TH DAN'];
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
];

// Without GAME_NSEC score publishing is disabled, but the service keeps running
// because it also serves the Lightning payment API.
let privateKey;
let gamePubkey;
if (!GAME_NSEC) {
  console.error('GAME_NSEC is not set - score publishing is disabled');
} else {
  try {
    const decoded = nip19.decode(GAME_NSEC);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec format');
    }
    privateKey = decoded.data;
    // Get pubkey from private key
    const { getPublicKey } = await import('nostr-tools/pure');
    gamePubkey = getPublicKey(privateKey);
    console.log('Game pubkey:', gamePubkey);
  } catch (err) {
    console.error('Failed to decode GAME_NSEC - score publishing is disabled:', err.message);
    privateKey = undefined;
  }
}

const pool = new SimplePool();

const MAX_BODY_BYTES = 16 * 1024;

// Parse JSON body from request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// Publish score to Nostr (kind 30762)
async function publishScore({ playerPubkey, score, level, difficulty, duration }) {
  const timestamp = Math.floor(Date.now() / 1000);

  // Create the event per Gamestr spec
  const event = {
    kind: 30762,
    created_at: timestamp,
    content: `Way of the Exploding Sats: ${score} points, graded ${GRADES[Math.min(Math.max(level, 0), GRADES.length - 1)]}`,
    tags: [
      ['d', `${GAME_ID}:${playerPubkey}:${level}`],
      ['game', GAME_ID],
      ['score', score.toString()],
      ['p', playerPubkey],
      ['state', 'active'],
      ['level', level.toString()],
      ['t', 'arcade'],
      ['t', 'retro'],
      ['t', 'karate'],
      ['t', 'fighting'],
    ],
  };

  // Add optional tags
  if (difficulty) event.tags.push(['difficulty', difficulty]);
  if (duration) event.tags.push(['duration', duration.toString()]);

  // Sign the event with game's private key
  const signedEvent = finalizeEvent(event, privateKey);

  console.log('Publishing score event:', signedEvent.id);

  // Publish to relays with timeout
  let successful = 0;
  try {
    console.log('Connecting to relays...');
    const publishPromises = pool.publish(RELAYS, signedEvent);

    // Add timeout for each relay connection
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Publish timeout after 10s')), 10000)
    );

    const results = await Promise.race([
      Promise.allSettled(publishPromises),
      timeoutPromise.then(() => [])
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successful++;
        console.log('Relay accepted:', result.value);
      } else {
        console.log('Relay rejected:', result.reason?.message || result.reason);
      }
    }
  } catch (err) {
    console.error('Publish error:', err.message);
  }

  console.log(`Published to ${successful}/${RELAYS.length} relays`);

  return {
    eventId: signedEvent.id,
    pubkey: signedEvent.pubkey,
    relays: successful,
  };
}

// Lightning payments: the LNbits invoice key is read at runtime and never sent to the browser
const lightning = createLightningService({
  lightningAddress: process.env.LIGHTNING_ADDRESS,
  lnbitsUrl: process.env.LNBITS_URL,
  invoiceKey: process.env.LNBITS_INVOICE_KEY,
});
if (!lightning.configured) {
  console.error('LIGHTNING_ADDRESS / LNBITS_INVOICE_KEY not set - Lightning payments will report unavailable');
}
const handleLightning = createLightningRouter({ service: lightning, sendJson, parseBody });

// HTTP server
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    sendJson(res, 400, { error: 'Bad request' });
    return;
  }

  // Health check
  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', gamePubkey });
    return;
  }

  try {
    if (await handleLightning(req, res, pathname)) return;
  } catch (err) {
    console.error('Lightning API error:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal error' });
    return;
  }

  // Publish score endpoint
  if (req.method === 'POST' && pathname === '/publish-score') {
    if (!privateKey) {
      sendJson(res, 503, { error: 'Score publishing is not configured' });
      return;
    }
    try {
      const body = await parseBody(req);

      // Validate required fields
      if (!body.playerPubkey || typeof body.score !== 'number' || typeof body.level !== 'number') {
        sendJson(res, 400, { error: 'Missing required fields: playerPubkey, score, level' });
        return;
      }

      // Validate playerPubkey is a valid 64-char hex string
      if (!/^[0-9a-f]{64}$/i.test(body.playerPubkey)) {
        sendJson(res, 400, { error: 'Invalid playerPubkey: must be 64-character hex string' });
        return;
      }

      // Validate score is reasonable (anti-cheat basic check)
      if (body.score < 0 || body.score > 10000000) {
        sendJson(res, 400, { error: 'Invalid score value' });
        return;
      }

      const result = await publishScore(body);
      sendJson(res, 200, { success: true, ...result });

    } catch (err) {
      console.error('Error publishing score:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // 404 for other routes
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Score service listening on port ${PORT}`);
  console.log(`Game ID: ${GAME_ID}`);
  console.log(`Relays: ${RELAYS.join(', ')}`);
});
