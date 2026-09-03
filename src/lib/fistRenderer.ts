/**
 * Renderer for Way of the Exploding Sats.
 *
 * Draws the 320x200 world (four C64 backdrops, the seated sensei, both fighters and
 * the bonus bull) onto a low-resolution canvas, and the HUD in the original layout:
 * yin-yang point markers, scores, the 30 second clock, grade, high score and mode.
 */

import {
  GROUND_Y, HUD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, gradeName, isAttack,
  type GameState, type Fighter,
} from './fistEngine';

import { SPRITES, SPRITE_WIDTH, SPRITE_HEIGHT } from './fighterSprites';
import { spriteFor } from './fighterAnimation';

interface Point { x: number; y: number }

// C64 palette (Pepto)
export const C64 = {
  black: '#000000',
  white: '#ffffff',
  red: '#68372b',
  cyan: '#70a4b2',
  purple: '#6f3d86',
  green: '#588d43',
  blue: '#352879',
  yellow: '#b8c76f',
  orange: '#6f4f25',
  brown: '#433900',
  lightRed: '#9a6759',
  darkGrey: '#444444',
  grey: '#6c6c6c',
  lightGreen: '#9ad284',
  lightBlue: '#6c5eb5',
  lightGrey: '#959595',
};

const SKIN = '#e6a985';
const SKIN_SHADE = '#c98a66';

// ---------------------------------------------------------------------------
// Backgrounds - cached per scene
// ---------------------------------------------------------------------------

const backgroundCache = new Map<number, HTMLCanvasElement>();

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function tri(ctx: CanvasRenderingContext2D, points: Point[], colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
}

function mountain(ctx: CanvasRenderingContext2D, cx: number, base: number, half: number, height: number, colour: string, snow?: string) {
  tri(ctx, [{ x: cx - half, y: base }, { x: cx, y: base - height }, { x: cx + half, y: base }], colour);
  if (snow) {
    const cap = height * 0.32;
    const capHalf = (half * cap) / height;
    tri(ctx, [{ x: cx - capHalf, y: base - height + cap }, { x: cx, y: base - height }, { x: cx + capHalf, y: base - height + cap }], snow);
    // jagged snow line
    for (let i = -2; i <= 2; i++) rect(ctx, cx + i * capHalf * 0.4 - 1, base - height + cap - (i % 2 === 0 ? 0 : 2), 2, 3, snow);
  }
}

function pagoda(ctx: CanvasRenderingContext2D, x: number, base: number, width: number, storeys: number) {
  let w = width;
  let y = base;
  for (let s = 0; s < storeys; s++) {
    const h = 12;
    rect(ctx, x - w / 2 + 3, y - h, w - 6, h, C64.red);
    rect(ctx, x - w / 2 + 5, y - h + 3, w - 10, 3, C64.black);
    // roof
    tri(ctx, [{ x: x - w / 2 - 4, y: y - h }, { x: x, y: y - h - 8 }, { x: x + w / 2 + 4, y: y - h }], C64.darkGrey);
    rect(ctx, x - w / 2 - 4, y - h - 1, w + 8, 2, C64.black);
    y -= h + 6;
    w -= 6;
  }
  rect(ctx, x - 1, y - 6, 2, 8, C64.yellow);
}

function torii(ctx: CanvasRenderingContext2D, x: number, base: number, colour: string) {
  rect(ctx, x - 14, base - 34, 3, 34, colour);
  rect(ctx, x + 11, base - 34, 3, 34, colour);
  rect(ctx, x - 20, base - 38, 40, 4, colour);
  rect(ctx, x - 22, base - 40, 44, 2, C64.black);
  rect(ctx, x - 15, base - 30, 30, 2, colour);
}

function tree(ctx: CanvasRenderingContext2D, x: number, base: number, size: number, leaf: string) {
  rect(ctx, x - 1, base - size, 3, size, C64.brown);
  rect(ctx, x - size * 0.6, base - size - 6, size * 1.2, 8, leaf);
  rect(ctx, x - size * 0.4, base - size - 10, size * 0.8, 6, leaf);
  rect(ctx, x - size * 0.5, base - size + 2, size, 4, leaf);
}

function drawScene(ctx: CanvasRenderingContext2D, scene: number) {
  const horizon = 130;
  const floorTop = GROUND_Y - 6;

  // Sky
  rect(ctx, 0, HUD_HEIGHT, WORLD_WIDTH, horizon - HUD_HEIGHT, C64.cyan);

  switch (scene % 4) {
    case 0: {
      // Pagoda, Fuji, torii gate and the red arched bridge
      mountain(ctx, 175, horizon, 70, 60, C64.purple, C64.white);
      mountain(ctx, 250, horizon, 45, 30, C64.blue);
      mountain(ctx, 95, horizon, 40, 26, C64.blue);
      rect(ctx, 0, horizon, WORLD_WIDTH, floorTop - horizon, C64.yellow);
      // pond
      rect(ctx, 200, horizon + 10, 80, 14, C64.lightBlue);
      // bridge
      ctx.fillStyle = C64.red;
      ctx.beginPath();
      ctx.moveTo(204, horizon + 22);
      ctx.quadraticCurveTo(240, horizon - 12, 276, horizon + 22);
      ctx.lineTo(276, horizon + 26);
      ctx.quadraticCurveTo(240, horizon - 4, 204, horizon + 26);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 6; i++) rect(ctx, 208 + i * 12, horizon + 4 + Math.abs(i - 2.5) * 3, 2, 8, C64.red);
      pagoda(ctx, 48, horizon + 8, 40, 3);
      torii(ctx, 160, horizon + 14, C64.grey);
      tree(ctx, 120, horizon + 6, 14, C64.lightRed);
      break;
    }
    case 1: {
      // Seaside: beach, sea, island, snowy range, gulls
      mountain(ctx, 60, horizon - 14, 60, 34, C64.purple, C64.white);
      mountain(ctx, 130, horizon - 14, 50, 42, C64.purple, C64.white);
      mountain(ctx, 200, horizon - 14, 55, 30, C64.blue, C64.white);
      mountain(ctx, 275, horizon - 14, 60, 36, C64.purple, C64.white);
      rect(ctx, 0, horizon - 14, WORLD_WIDTH, 22, C64.blue); // sea
      for (let i = 0; i < 16; i++) rect(ctx, i * 20 + (i % 2) * 6, horizon - 8 + (i % 3) * 4, 8, 1, C64.lightBlue);
      // island rock
      tri(ctx, [{ x: 236, y: horizon + 2 }, { x: 250, y: horizon - 18 }, { x: 268, y: horizon + 2 }], C64.darkGrey);
      tree(ctx, 252, horizon - 16, 6, C64.green);
      rect(ctx, 0, horizon + 8, WORLD_WIDTH, floorTop - horizon - 8, C64.yellow); // beach
      // gulls
      for (const [gx, gy] of [[60, 70], [78, 64], [230, 76]]) {
        rect(ctx, gx, gy, 3, 1, C64.white); rect(ctx, gx + 4, gy + 1, 1, 1, C64.white); rect(ctx, gx + 5, gy, 3, 1, C64.white);
      }
      // grass tufts
      for (let i = 0; i < 9; i++) {
        const gx = 12 + i * 36;
        rect(ctx, gx, horizon + 12, 1, 4, C64.green); rect(ctx, gx + 2, horizon + 10, 1, 6, C64.green); rect(ctx, gx + 4, horizon + 12, 1, 4, C64.green);
      }
      break;
    }
    case 2: {
      // Dojo interior: grey wall, round window, lantern, banners, blue mats
      rect(ctx, 0, HUD_HEIGHT, WORLD_WIDTH, horizon + 8 - HUD_HEIGHT, C64.lightGrey);
      rect(ctx, 0, HUD_HEIGHT, WORLD_WIDTH, 3, C64.darkGrey);
      // banners
      for (let i = 0; i < 5; i++) {
        const bx = 28 + i * 60;
        rect(ctx, bx, HUD_HEIGHT + 4, 14, 34, C64.white);
        rect(ctx, bx, HUD_HEIGHT + 4, 14, 1, C64.black);
        for (let j = 0; j < 4; j++) rect(ctx, bx + 4, HUD_HEIGHT + 8 + j * 7, 6, 3, C64.black);
      }
      // round shoji window
      ctx.fillStyle = C64.cyan;
      ctx.beginPath(); ctx.arc(52, 96, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C64.darkGrey; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(52, 96, 16, 0, Math.PI * 2); ctx.stroke();
      rect(ctx, 51, 80, 2, 32, C64.darkGrey); rect(ctx, 36, 95, 32, 2, C64.darkGrey);
      // lantern
      rect(ctx, 159, HUD_HEIGHT + 3, 2, 14, C64.black);
      rect(ctx, 150, HUD_HEIGHT + 17, 20, 22, C64.white);
      rect(ctx, 148, HUD_HEIGHT + 20, 24, 16, C64.white);
      for (let j = 0; j < 4; j++) rect(ctx, 148, HUD_HEIGHT + 20 + j * 4, 24, 1, C64.red);
      rect(ctx, 154, HUD_HEIGHT + 24, 12, 8, C64.red);
      // floor with mats
      rect(ctx, 0, horizon + 8, WORLD_WIDTH, floorTop - horizon - 8, C64.yellow);
      for (let i = 0; i < 8; i++) {
        rect(ctx, i * 40 + 2, horizon + 10, 36, 10, C64.blue);
        rect(ctx, i * 40 + 22, horizon + 22, 36, 10, C64.blue);
      }
      break;
    }
    default: {
      // Great Buddha: statue on a plinth, temple, stone lantern and blossom
      mountain(ctx, 70, horizon, 60, 36, C64.purple);
      mountain(ctx, 250, horizon, 70, 44, C64.purple, C64.white);
      rect(ctx, 0, horizon, WORLD_WIDTH, floorTop - horizon, C64.yellow);
      // temple
      rect(ctx, 30, horizon - 18, 50, 20, C64.grey);
      tri(ctx, [{ x: 22, y: horizon - 18 }, { x: 55, y: horizon - 34 }, { x: 88, y: horizon - 18 }], C64.red);
      for (let i = 0; i < 4; i++) rect(ctx, 36 + i * 12, horizon - 14, 3, 16, C64.darkGrey);
      // plinth + Buddha
      rect(ctx, 132, horizon + 2, 56, 10, C64.blue);
      rect(ctx, 140, horizon - 8, 40, 12, C64.grey);   // crossed legs
      rect(ctx, 148, horizon - 30, 24, 24, C64.grey);  // body
      rect(ctx, 154, horizon - 42, 12, 13, C64.grey);  // head
      rect(ctx, 154, horizon - 44, 12, 3, C64.darkGrey); // hair
      rect(ctx, 144, horizon - 26, 6, 14, C64.grey); rect(ctx, 170, horizon - 26, 6, 14, C64.grey); // arms
      rect(ctx, 157, horizon - 36, 2, 1, C64.black); rect(ctx, 161, horizon - 36, 2, 1, C64.black);
      // stone lantern
      rect(ctx, 236, horizon - 6, 4, 18, C64.grey);
      rect(ctx, 231, horizon - 14, 14, 8, C64.grey);
      tri(ctx, [{ x: 228, y: horizon - 14 }, { x: 238, y: horizon - 22 }, { x: 248, y: horizon - 14 }], C64.darkGrey);
      tree(ctx, 285, horizon + 4, 16, C64.lightRed);
      break;
    }
  }

  // Floor line and ground
  rect(ctx, 0, floorTop, WORLD_WIDTH, WORLD_HEIGHT - floorTop, scene % 4 === 2 ? C64.orange : C64.brown);
  rect(ctx, 0, floorTop, WORLD_WIDTH, 1, C64.black);
}

function getBackground(scene: number): HTMLCanvasElement {
  const cached = backgroundCache.get(scene % 4);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_WIDTH;
  canvas.height = WORLD_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  drawScene(ctx, scene);
  backgroundCache.set(scene % 4, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Sensei (the judge)
// ---------------------------------------------------------------------------

function drawSensei(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, signal: 0 | 1 | null, bowing: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // crossed legs (robe)
  rect(ctx, -20, -8, 40, 8, C64.grey);
  rect(ctx, -22, -4, 44, 4, C64.darkGrey);
  // body
  rect(ctx, -10, bowing ? -22 : -26, 20, bowing ? 14 : 18, C64.grey);
  rect(ctx, -9, bowing ? -22 : -26, 18, 2, C64.lightGrey);
  // arms resting on knees
  rect(ctx, -16, -14, 6, 4, C64.grey); rect(ctx, 10, -14, 6, 4, C64.grey);
  rect(ctx, -18, -12, 4, 3, SKIN); rect(ctx, 14, -12, 4, 3, SKIN);
  // head (bald) with moustache
  const hy = bowing ? -30 : -36;
  rect(ctx, -5, hy, 10, 10, SKIN);
  rect(ctx, -4, hy - 1, 8, 1, SKIN_SHADE);
  rect(ctx, -3, hy + 4, 2, 1, C64.black); rect(ctx, 1, hy + 4, 2, 1, C64.black);
  rect(ctx, -5, hy + 7, 10, 2, C64.black); // moustache
  rect(ctx, -6, hy + 8, 2, 2, C64.black); rect(ctx, 4, hy + 8, 2, 2, C64.black);
  // paddle raised for the winner
  if (signal !== null) {
    const px = signal === 0 ? -14 : 14;
    rect(ctx, px - 1, -46, 2, 34, C64.brown);
    rect(ctx, px - 6, -54, 12, 10, signal === 0 ? C64.white : C64.red);
    rect(ctx, px - 6, -54, 12, 1, C64.black);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fighters - the original BBC Micro sprites, recoloured to the C64 gis
// ---------------------------------------------------------------------------

/** A MODE 5 pixel is twice as wide as it is tall */
const SPRITE_PX_W = 2;
/** Horizontal centre of the standing body within the 36-pixel sprite, in world px */
const SPRITE_ANCHOR_X = 24;
/** The shadow row sits just below the ground line */
const SPRITE_BOTTOM_OFFSET = 2;

type Scheme = 'white' | 'red' | 'flash';

const SCHEMES: Record<Scheme, [string, string, string]> = {
  // gi, skin, hair/shadow
  white: ['#f4f4f4', SKIN, C64.black],
  red: ['#b93a2a', SKIN, C64.black],
  flash: [C64.yellow, C64.white, C64.black],
};

const spriteCache = new Map<string, HTMLCanvasElement>();

function spriteCanvas(index: number, scheme: Scheme): HTMLCanvasElement {
  const key = `${index}:${scheme}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const data = SPRITES[index] ?? SPRITES[0];
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_WIDTH * SPRITE_PX_W;
  canvas.height = SPRITE_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const colours = SCHEMES[scheme];
  for (let r = 0; r < data.rows.length; r++) {
    const row = data.rows[r];
    const y = data.top + r;
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const v = row.charCodeAt(x) - 48;
      if (v === 0) continue;
      ctx.fillStyle = colours[v - 1];
      ctx.fillRect(x * SPRITE_PX_W, y, SPRITE_PX_W, 1);
    }
  }
  spriteCache.set(key, canvas);
  return canvas;
}

/** Draw a fighter with feet at (x, GROUND_Y - airY) */
export function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, flash = false) {
  const anim = spriteFor(f.move, f.frame);
  const scheme: Scheme = flash ? 'flash' : f.colour;
  const image = spriteCanvas(anim.sprite, scheme);
  const facing = anim.flip ? -f.facing : f.facing;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(f.x), Math.round(GROUND_Y - f.airY + SPRITE_BOTTOM_OFFSET - SPRITE_HEIGHT));
  ctx.scale(facing, 1);
  ctx.drawImage(image, -SPRITE_ANCHOR_X, 0);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Bull
// ---------------------------------------------------------------------------

function drawBull(ctx: CanvasRenderingContext2D, state: GameState) {
  const bull = state.bull;
  if (!bull) return;
  const x = Math.round(bull.x);
  const y = GROUND_Y;
  const gallop = Math.floor(bull.frame / 6) % 2;
  ctx.save();
  if (bull.state === 'down') {
    // collapsed on its side
    rect(ctx, x - 30, y - 14, 56, 12, C64.brown);
    rect(ctx, x - 40, y - 12, 12, 8, C64.brown);
    rect(ctx, x - 44, y - 16, 6, 3, C64.lightGrey); rect(ctx, x - 44, y - 6, 6, 3, C64.lightGrey);
    rect(ctx, x - 36, y - 10, 1, 1, C64.black);
    for (let i = 0; i < 4; i++) rect(ctx, x - 20 + i * 12, y - 3, 4, 3, C64.brown);
    ctx.restore();
    return;
  }
  // body
  rect(ctx, x - 26, y - 30, 52, 18, C64.brown);
  rect(ctx, x - 22, y - 34, 40, 6, C64.brown);
  // head (facing left)
  rect(ctx, x - 40, y - 34, 16, 14, C64.brown);
  rect(ctx, x - 44, y - 26, 6, 6, C64.orange); // snout
  rect(ctx, x - 43, y - 24, 1, 1, C64.black);
  rect(ctx, x - 36, y - 31, 2, 2, C64.white); rect(ctx, x - 35, y - 31, 1, 1, C64.black);
  // horns
  rect(ctx, x - 42, y - 38, 6, 2, C64.lightGrey); rect(ctx, x - 42, y - 40, 2, 3, C64.lightGrey);
  rect(ctx, x - 28, y - 38, 6, 2, C64.lightGrey); rect(ctx, x - 24, y - 40, 2, 3, C64.lightGrey);
  // legs
  const legs = gallop === 0 ? [[-22, -4], [-12, 2], [10, -3], [20, 3]] : [[-20, 3], [-14, -4], [12, 3], [18, -4]];
  for (const [lx, sway] of legs) {
    rect(ctx, x + lx + sway, y - 12, 5, 12, C64.brown);
    rect(ctx, x + lx + sway, y - 2, 5, 2, C64.black);
  }
  // tail
  rect(ctx, x + 26, y - 30, 6, 2, C64.brown); rect(ctx, x + 30, y - 28 + gallop * 2, 2, 6, C64.brown);
  // dust
  if (bull.state === 'charging') {
    for (let i = 0; i < 4; i++) rect(ctx, x + 30 + i * 8 + gallop * 3, y - 4 - (i % 2) * 4, 4, 3, C64.yellow);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// HUD (drawn on the low-res canvas: icons and bars) + text via drawHudText
// ---------------------------------------------------------------------------

function yinYang(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, half: boolean) {
  ctx.fillStyle = C64.white;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C64.black;
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); ctx.fill();
  if (half) {
    // only the black half is shown for a half point
    ctx.fillStyle = C64.cyan;
    ctx.beginPath(); ctx.arc(cx, cy, r + 0.5, Math.PI / 2, (3 * Math.PI) / 2); ctx.fill();
    ctx.fillStyle = C64.black;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = C64.white;
    ctx.beginPath(); ctx.arc(cx, cy - r / 2, r / 4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.fillStyle = C64.black;
  ctx.beginPath(); ctx.arc(cx, cy - r / 2, r / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C64.white;
  ctx.beginPath(); ctx.arc(cx, cy + r / 2, r / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C64.white;
  ctx.beginPath(); ctx.arc(cx, cy - r / 2, r / 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C64.black;
  ctx.beginPath(); ctx.arc(cx, cy + r / 2, r / 5, 0, Math.PI * 2); ctx.fill();
}

function drawPoints(ctx: CanvasRenderingContext2D, points: number, x: number, y: number) {
  const full = Math.floor(points);
  const half = points - full >= 0.5;
  for (let i = 0; i < 2; i++) {
    const cx = x + i * 16;
    if (i < full) yinYang(ctx, cx, y, 6, false);
    else if (i === full && half) yinYang(ctx, cx, y, 6, true);
    else {
      ctx.strokeStyle = C64.lightBlue; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, y, 6, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

/** Everything except HUD text: world + icons, to the 320x200 canvas */
export function renderWorld(ctx: CanvasRenderingContext2D, state: GameState, flashWho: 0 | 1 | null = null) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getBackground(state.scene), 0, 0);

  // HUD panel (same cyan as the sky)
  rect(ctx, 0, 0, WORLD_WIDTH, HUD_HEIGHT, C64.cyan);
  rect(ctx, 0, HUD_HEIGHT - 1, WORLD_WIDTH, 1, C64.blue);
  drawPoints(ctx, state.fighters[0].points, 46, 12);
  drawPoints(ctx, state.fighters[1].points, WORLD_WIDTH - 46 - 16, 12);

  // Sensei: far right and small in scenes 1-2, close and large on the left in 3-4
  const scene = state.scene % 4;
  const signal: 0 | 1 | null = state.judgeSignal > 0 ? (state.boutWinner ?? (state.bull ? 0 : null)) : null;
  const bowing = state.phase === 'intro' && state.phaseTimer > 30;
  if (scene < 2) drawSensei(ctx, 298, GROUND_Y - 28, 0.8, signal, bowing);
  else drawSensei(ctx, 34, GROUND_Y - 6, 1.05, signal, bowing);

  drawBull(ctx, state);

  // Draw the fighter further from the camera first (the one lying down goes behind)
  const [a, b] = state.fighters;
  const order: Fighter[] = a.move === 'lying' || a.move === 'fall' ? [a, b] : b.move === 'lying' || b.move === 'fall' ? [b, a] : a.x <= b.x ? [b, a] : [a, b];
  for (const f of order) {
    if (f.x < -50) continue;
    const idx = f === a ? 0 : 1;
    drawFighter(ctx, f, flashWho === idx);
  }
}

export interface HudText {
  text: string;
  x: number; // in world units (0..320)
  y: number;
  align: 'left' | 'center' | 'right';
  colour?: string;
  size?: number; // in world units
}

/** Text layout matching the original HUD (row 1: scores/timer, row 2: grade/high score/mode) */
export function hudTexts(state: GameState, highScore: number): HudText[] {
  const [a, b] = state.fighters;
  const texts: HudText[] = [];
  const timer = Math.ceil(state.timeLeft).toString();

  texts.push({ text: a.score.toString(), x: 118, y: 18, align: 'right' });
  texts.push({ text: timer, x: WORLD_WIDTH / 2, y: 18, align: 'center' });
  if (state.twoPlayer || state.demo) {
    texts.push({ text: b.score.toString(), x: 202, y: 18, align: 'left' });
  }

  texts.push({ text: state.demo ? 'DEMO' : gradeName(state.grade), x: 20, y: 40, align: 'left' });
  texts.push({ text: highScore.toString(), x: 175, y: 40, align: 'center' });
  texts.push({ text: state.twoPlayer ? '2 PLAYER' : '1 PLAYER', x: WORLD_WIDTH - 20, y: 40, align: 'right' });

  // Centre message during breaks
  if (state.phase === 'bout_over' && state.boutWinner !== null) {
    const who = state.twoPlayer || state.demo ? `PLAYER ${state.boutWinner + 1} WINS` : state.boutWinner === 0 ? 'YOU WIN' : 'YOU LOSE';
    texts.push({ text: who, x: WORLD_WIDTH / 2, y: 100, align: 'center', colour: C64.white, size: 14 });
  } else if (state.phase === 'bull') {
    texts.push({ text: 'BONUS', x: WORLD_WIDTH / 2, y: 70, align: 'center', colour: C64.white, size: 12 });
  } else if (state.phase === 'intro' && state.phaseTimer > 20 && !state.demo) {
    texts.push({ text: `BOUT ${state.bout}`, x: WORLD_WIDTH / 2, y: 70, align: 'center', colour: C64.white, size: 12 });
  }

  return texts;
}

/** Utility used by tests/overlays: is either fighter currently attacking */
export function anyoneAttacking(state: GameState): boolean {
  return isAttack(state.fighters[0].move) || isAttack(state.fighters[1].move);
}
