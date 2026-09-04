#!/usr/bin/env node
/**
 * Render the branding assets with Playwright:
 *   docs/screenshot.png      - a real mid-fight frame from the running game
 *   docs/logo.png            - docs/branding/logo.html (transparent background)
 *   docs/social-preview.png  - docs/branding/social-preview.html (1200x630) using the screenshot
 *   public/og-image.png      - copy of the social preview for Open Graph / Twitter cards
 *
 * Usage: node scripts/render-branding.js [baseUrl]
 *   baseUrl defaults to http://localhost:8088 (the dev server must be running).
 * Playwright is resolved from this project or $PLAYWRIGHT_DIR/node_modules; set BROWSER_PATH
 * to a Chromium/Edge binary if Playwright's browsers are not downloaded.
 */

import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core'];
  if (process.env.PLAYWRIGHT_DIR) candidates.unshift(path.join(process.env.PLAYWRIGHT_DIR, 'node_modules', 'playwright'));
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_DIR to a project that has it installed.');
}

const baseUrl = process.argv[2] || 'http://localhost:8088';
const docs = path.join(root, 'docs');
mkdirSync(docs, { recursive: true });

async function main() {
  const { chromium } = loadPlaywright();
  const executablePath = process.env.BROWSER_PATH || ['/opt/microsoft/msedge/msedge', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => existsSync(p));
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  // 1. Gameplay screenshot: start a free game and catch a high kick landing
  const game = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  console.log(`[info] opening ${baseUrl}`);
  await game.goto(baseUrl, { waitUntil: 'networkidle' });
  await game.getByRole('button', { name: /TRY FREE/i }).click();
  await game.waitForTimeout(1900); // bow
  await game.keyboard.down('ArrowRight'); await game.waitForTimeout(900); await game.keyboard.up('ArrowRight');
  await game.waitForTimeout(150);
  await game.keyboard.down('Space'); await game.keyboard.down('ArrowUp'); await game.keyboard.down('ArrowRight');
  await game.waitForTimeout(230);
  const canvas = game.locator('canvas');
  const shotPath = path.join(docs, 'screenshot.png');
  await canvas.screenshot({ path: shotPath });
  await game.keyboard.up('ArrowRight'); await game.keyboard.up('ArrowUp'); await game.keyboard.up('Space');
  console.log(`[info] wrote ${shotPath}`);
  await game.close();

  // 2. Logo
  const logo = await browser.newPage({ viewport: { width: 1200, height: 420 } });
  await logo.goto('file://' + path.join(docs, 'branding', 'logo.html'));
  await logo.evaluate(() => document.fonts.ready);
  await logo.waitForTimeout(200);
  await logo.screenshot({ path: path.join(docs, 'logo.png'), omitBackground: true });
  console.log(`[info] wrote ${path.join(docs, 'logo.png')}`);
  await logo.close();

  // 3. Social preview with the screenshot embedded
  const social = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await social.goto('file://' + path.join(docs, 'branding', 'social-preview.html'));
  const dataUri = 'data:image/png;base64,' + readFileSync(shotPath).toString('base64');
  await social.evaluate((uri) => { document.getElementById('shot').style.backgroundImage = `url(${uri})`; }, dataUri);
  await social.evaluate(() => document.fonts.ready);
  await social.waitForTimeout(300);
  const socialPath = path.join(docs, 'social-preview.png');
  await social.screenshot({ path: socialPath });
  copyFileSync(socialPath, path.join(root, 'public', 'og-image.png'));
  console.log(`[info] wrote ${socialPath} and public/og-image.png`);
  await social.close();

  await browser.close();
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
