/**
 * Renders a contact sheet of every fighter pose (white and red, facing right and left)
 * and a strip per move showing each animation step, so the art can be checked by eye.
 * Attack strips mark the engine's strike point (green) and the standing hurt-box (blue).
 *
 * Usage: npx vite-node scripts/fighter-contact-sheet.ts <out-dir>
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { POSE_IDS, spriteData, SPRITE_WIDTH, SPRITE_HEIGHT, SPRITE_ORIGIN, type PoseId } from '../src/lib/fighterSprites';
import { sequenceFor } from '../src/lib/fighterAnimation';
import { MOVES, FIGHTER_HALF_WIDTH, STAND_HEIGHT, type MoveId } from '../src/lib/fistEngine';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SCHEMES: Record<string, RGB[]> = {
  white: ['#f4f4f4', '#e6a985', '#000000', '#bdbdbd'].map(hex),
  red: ['#b93a2a', '#e6a985', '#000000', '#7e2519'].map(hex),
};
const SKY = hex('#70a4b2');
const FLOOR = hex('#b8c76f');

const SCALE = 3; // output pixels per world pixel
const CELL_W = SPRITE_WIDTH * 2; // world px
const CELL_H = SPRITE_HEIGHT;

class Image {
  data: Uint8Array;
  constructor(public w: number, public h: number) { this.data = new Uint8Array(w * h * 3); }
  set(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data.set(c, (y * this.w + x) * 3);
  }
  block(wx: number, wy: number, w: number, h: number, c: RGB) {
    for (let y = wy * SCALE; y < (wy + h) * SCALE; y++) for (let x = wx * SCALE; x < (wx + w) * SCALE; x++) this.set(x, y, c);
  }
  png(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      Buffer.from(this.data.buffer, y * this.w * 3, this.w * 3).copy(raw, y * (this.w * 3 + 1) + 1);
    }
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
      const tb = Buffer.concat([Buffer.from(type), body]);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb));
      return Buffer.concat([len, tb, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }
}

/** Draw one fighter cell with its feet at world (fx, fy) inside the image */
function drawPose(img: Image, pose: PoseId, fx: number, fy: number, scheme: string, facing: 1 | -1) {
  const rows = spriteData(pose).rows;
  const colours = SCHEMES[scheme];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < SPRITE_WIDTH; c++) {
      const v = rows[r].charCodeAt(c) - 48;
      if (!v) continue;
      const left = SPRITE_ORIGIN.x + c * 2; // world px, facing right
      const x = facing === 1 ? fx + left : fx - left - 2;
      img.block(x, fy + SPRITE_ORIGIN.y + r, 2, 1, colours[v - 1]);
    }
  }
}

function backdrop(img: Image, x: number, y: number, w: number, h: number, floorY: number) {
  img.block(x, y, w, floorY - y, SKY);
  img.block(x, floorY, w, y + h - floorY, FLOOR);
}

const out = process.argv[2];
if (!out) throw new Error('usage: fighter-contact-sheet.ts <out-dir>');
mkdirSync(out, { recursive: true });

// 1. Every pose: white right, red left
{
  const perRow = 8;
  const rows = Math.ceil(POSE_IDS.length / perRow);
  const cw = CELL_W * 2 + 4, ch = CELL_H + 6;
  const img = new Image(perRow * cw * SCALE, rows * ch * SCALE);
  POSE_IDS.forEach((pose, i) => {
    const x = (i % perRow) * cw, y = Math.floor(i / perRow) * ch;
    backdrop(img, x, y, cw - 4, ch - 2, y + ch - 6);
    drawPose(img, pose, x + CELL_W / 2, y + ch - 6, 'white', 1);
    drawPose(img, pose, x + CELL_W + CELL_W / 2, y + ch - 6, 'red', -1);
  });
  writeFileSync(join(out, 'poses.png'), img.png());
  console.log('poses.png order:', POSE_IDS.join(', '));
}

// 2. One strip per move: each animation step with its frame count
{
  const moves = Object.keys(MOVES) as MoveId[];
  const strips: { label: string; steps: { pose: PoseId; flip?: boolean }[]; move: MoveId }[] = [];
  for (const move of moves) strips.push({ label: move, steps: sequenceFor(move), move });
  strips.push({ label: 'fall (forward)', steps: sequenceFor('fall', 'forward'), move: 'fall' });
  strips.push({ label: 'getup (forward)', steps: sequenceFor('getup', 'forward'), move: 'getup' });
  const cw = CELL_W + 2, ch = CELL_H + 4;
  const maxSteps = Math.max(...strips.map((s) => s.steps.length));
  const img = new Image(maxSteps * cw * SCALE, strips.length * ch * SCALE);
  strips.forEach((strip, row) => {
    const def = MOVES[strip.move];
    strip.steps.forEach((step, i) => {
      const x = i * cw, y = row * ch;
      const fx = x + CELL_W / 2, fy = y + ch - 4;
      backdrop(img, x, y, cw - 2, ch - 2, fy);
      const facing = step.flip ? -1 : 1;
      drawPose(img, step.pose, fx, fy, row % 2 ? 'red' : 'white', facing as 1 | -1);
      // hurt-box sides (blue) and, on strike poses, the engine's strike point (green)
      for (let yy = fy - STAND_HEIGHT; yy < fy; yy += 3) { img.block(fx - FIGHTER_HALF_WIDTH, yy, 1, 1, [40, 40, 220]); img.block(fx + FIGHTER_HALF_WIDTH, yy, 1, 1, [40, 40, 220]); }
      if (def.strike) img.block(fx + def.strike.x - 1, fy + def.strike.y - 1, 3, 3, [0, 200, 0]);
    });
  });
  writeFileSync(join(out, 'moves.png'), img.png());
  console.log('moves.png rows:', strips.map((s) => `${s.label}[${sequenceFor(s.move, s.label.includes('forward') ? 'forward' : 'backward').map((f) => `${f.pose}${f.flip ? '~' : ''}:${f.frames}`).join(' ')}]`).join('\n'));
}
