#!/usr/bin/env node
/**
 * Capture gameplay screenshots of Way of the Exploding Sats with Playwright.
 *
 * Starts a free-play match against the CPU, performs a scripted sequence of moves and
 * saves a screenshot after each one, plus console errors, so animation and rendering
 * can be checked without a real browser session.
 *
 * Usage: node scripts/capture-gameplay.js [baseUrl] [outDir]
 *   baseUrl defaults to http://localhost:8088, outDir to ./screenshots
 * Playwright is resolved from this project, or from $PLAYWRIGHT_DIR/node_modules.
 * Set BROWSER_PATH to a Chromium/Edge binary if Playwright's browsers are not downloaded.
 */

import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core'];
  if (process.env.PLAYWRIGHT_DIR) {
    candidates.unshift(path.join(process.env.PLAYWRIGHT_DIR, 'node_modules', 'playwright'));
  }
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_DIR to a project that has it installed.');
}

const baseUrl = process.argv[2] || 'http://localhost:8088';
const outDir = process.argv[3] || 'screenshots';
mkdirSync(outDir, { recursive: true });

// Moves to demonstrate: [label, keys held, hold ms]. Space = fire.
const MOVES = [
  ['walk-forward', ['ArrowRight'], 700],
  ['jab-punch', ['ArrowDown', 'ArrowRight'], 120],
  ['high-punch', ['ArrowUp', 'ArrowRight'], 180],
  ['mid-kick', ['Space', 'ArrowRight'], 220],
  ['high-kick', ['Space', 'ArrowUp', 'ArrowRight'], 220],
  ['sweep', ['Space', 'ArrowDown'], 240],
  ['roundhouse', ['Space', 'ArrowLeft'], 320],
  ['flying-kick', ['Space', 'ArrowUp'], 260],
  ['crouch', ['ArrowDown'], 300],
  ['jump', ['ArrowUp'], 260],
  ['somersault-forward', ['ArrowUp', 'ArrowLeft'], 300],
  ['back-sweep', ['Space', 'ArrowDown', 'ArrowLeft'], 260],
];

async function main() {
  const { chromium } = loadPlaywright();
  // Use a locally installed Chromium/Edge when Playwright's own browser download is missing
  const executablePath = process.env.BROWSER_PATH || ['/opt/microsoft/msedge/msedge', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => existsSync(p));
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  console.log(`[info] opening ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.screenshot({ path: path.join(outDir, '00-attract.png') });

  // Attract demo: let it run and grab a couple of frames
  await page.goto(`${baseUrl}/?showcase`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, '01-demo-a.png') });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '02-demo-b.png') });

  // Start a free game
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /TRY FREE/i }).click();
  await page.waitForTimeout(1800); // bow
  await page.screenshot({ path: path.join(outDir, '03-fight-start.png') });

  let i = 4;
  for (const [label, keys, hold] of MOVES) {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(hold);
    await page.screenshot({ path: path.join(outDir, `${String(i).padStart(2, '0')}-${label}.png`) });
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(700);
    i++;
  }

  // Let the bout run for a bit to catch knockdowns
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(outDir, `${String(i).padStart(2, '0')}-later.png`) });

  await browser.close();

  if (errors.length) {
    console.error(`[error] ${errors.length} console error(s):`);
    for (const e of errors) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    console.log('[info] no console errors');
  }
  console.log(`[info] screenshots written to ${outDir}`);
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
