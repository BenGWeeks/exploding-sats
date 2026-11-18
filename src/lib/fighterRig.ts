/**
 * Skeletal rig for the karateka.
 *
 * A pose is a handful of joint positions (hip, neck, hands, feet) in world pixels,
 * relative to the fighter's feet and facing right (+x forward, -y up). Elbows and knees
 * are solved with two-bone IK, then every body part is drawn as a capsule straight onto
 * the sprite grid. The grid uses the game's fighter pixel, which is two world pixels wide
 * and one tall, so the result is pixel-snapped with no anti-aliasing. Both fighters share
 * the rig; the renderer recolours the sprite per fighter.
 *
 * Sprite cell values: 0 = transparent, 1 = gi, 2 = skin, 3 = hair/belt/edge, 4 = gi in shade.
 */

export interface Vec { x: number; y: number }

export interface Pose {
  hip: Vec;
  neck: Vec;
  /** head centre; defaults to 5 px beyond the neck along the spine */
  head?: Vec;
  /** the limbs on the camera side (drawn in front) */
  nearHand: Vec;
  nearFoot: Vec;
  /** the limbs on the far side (drawn behind the body, in shade) */
  farHand: Vec;
  farFoot: Vec;
  /** IK bend side: +1 / -1 (defaults: elbows down/back, knees forward) */
  nearElbow?: 1 | -1;
  farElbow?: 1 | -1;
  nearKnee?: 1 | -1;
  farKnee?: 1 | -1;
  /** toe direction (unit-ish vector); defaults to flat on the floor, pointing forward */
  nearToe?: Vec;
  farToe?: Vec;
  /** facing the camera: hair on top only, no gi skirt */
  front?: boolean;
}

export const SPRITE_COLS = 48;
export const SPRITE_ROWS = 80;
/** world x of the sprite's left edge, relative to the fighter's x */
export const SPRITE_LEFT = -48;
/** world y of the sprite's top edge, relative to the fighter's feet */
export const SPRITE_TOP = -78;
/** a fighter pixel is two world pixels wide */
export const CELL_W = 2;

export const LIMBS = { thigh: 12.5, shin: 12.5, upperArm: 9, forearm: 8.5 };
/** how far a limb may stretch past its length in a pose (kicks reach a little) */
export const MAX_STRETCH = 1.3;

export const Ink = { None: 0, Gi: 1, Skin: 2, Dark: 3, Shade: 4 } as const;

const v = (x: number, y: number): Vec => ({ x, y });
const add = (a: Vec, b: Vec) => v(a.x + b.x, a.y + b.y);
const sub = (a: Vec, b: Vec) => v(a.x - b.x, a.y - b.y);
const mul = (a: Vec, k: number) => v(a.x * k, a.y * k);
const len = (a: Vec) => Math.hypot(a.x, a.y);
const norm = (a: Vec) => { const l = len(a) || 1; return v(a.x / l, a.y / l); };
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

/** Two-bone IK: the middle joint for a limb from root to tip */
export function solveJoint(root: Vec, tip: Vec, a: number, b: number, bend: number): { joint: Vec; stretch: number } {
  const d = sub(tip, root);
  const dist = len(d);
  if (dist >= a + b - 0.01) {
    return { joint: add(root, mul(d, a / (a + b))), stretch: dist / (a + b) };
  }
  const dir = norm(d);
  const along = (a * a - b * b + dist * dist) / (2 * Math.max(dist, 0.01));
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const n = v(-dir.y, dir.x);
  return { joint: add(add(root, mul(dir, along)), mul(n, h * bend)), stretch: 1 };
}

export interface Skeleton {
  hip: Vec; neck: Vec; head: Vec; shoulder: Vec;
  nearElbow: Vec; farElbow: Vec; nearKnee: Vec; farKnee: Vec;
  nearHand: Vec; farHand: Vec; nearFoot: Vec; farFoot: Vec;
  /** largest limb stretch in the pose (1 = natural length) */
  stretch: number;
}

export function skeleton(p: Pose): Skeleton {
  const spine = norm(sub(p.neck, p.hip));
  const head = p.head ?? add(p.neck, mul(spine, 5));
  const shoulder = add(p.neck, mul(spine, -1.5));
  const ne = solveJoint(shoulder, p.nearHand, LIMBS.upperArm, LIMBS.forearm, p.nearElbow ?? 1);
  const fe = solveJoint(shoulder, p.farHand, LIMBS.upperArm, LIMBS.forearm, p.farElbow ?? 1);
  const nk = solveJoint(p.hip, p.nearFoot, LIMBS.thigh, LIMBS.shin, p.nearKnee ?? -1);
  const fk = solveJoint(p.hip, p.farFoot, LIMBS.thigh, LIMBS.shin, p.farKnee ?? -1);
  return {
    hip: p.hip, neck: p.neck, head, shoulder,
    nearElbow: ne.joint, farElbow: fe.joint, nearKnee: nk.joint, farKnee: fk.joint,
    nearHand: p.nearHand, farHand: p.farHand, nearFoot: p.nearFoot, farFoot: p.farFoot,
    stretch: Math.max(ne.stretch, fe.stretch, nk.stretch, fk.stretch),
  };
}

/** Mirror a pose front-to-back (x -> -x) */
export function mirrorPose(p: Pose): Pose {
  const m = (a?: Vec) => (a ? v(-a.x, a.y) : undefined);
  return {
    ...p,
    hip: m(p.hip)!, neck: m(p.neck)!, head: m(p.head),
    nearHand: m(p.nearHand)!, farHand: m(p.farHand)!, nearFoot: m(p.nearFoot)!, farFoot: m(p.farFoot)!,
    nearToe: m(p.nearToe), farToe: m(p.farToe),
    nearElbow: p.nearElbow ? (-p.nearElbow as 1 | -1) : -1, farElbow: p.farElbow ? (-p.farElbow as 1 | -1) : -1,
    nearKnee: p.nearKnee ? (-p.nearKnee as 1 | -1) : 1, farKnee: p.farKnee ? (-p.farKnee as 1 | -1) : 1,
  };
}

/** Rotate a pose (clockwise on screen, degrees) about a pivot - used for somersaults */
export function rotatePose(p: Pose, degrees: number, pivot: Vec): Pose {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const rot = (a: Vec) => { const d = sub(a, pivot); return v(pivot.x + d.x * c - d.y * s, pivot.y + d.x * s + d.y * c); };
  const rotDir = (a?: Vec) => (a ? v(a.x * c - a.y * s, a.x * s + a.y * c) : undefined);
  const sk = skeleton(p);
  return {
    ...p,
    hip: rot(p.hip), neck: rot(p.neck), head: rot(sk.head),
    nearHand: rot(p.nearHand), farHand: rot(p.farHand), nearFoot: rot(p.nearFoot), farFoot: rot(p.farFoot),
    nearToe: rotDir(p.nearToe ?? toeDefault()), farToe: rotDir(p.farToe ?? toeDefault()),
  };
}

const toeDefault = () => v(1, 0);

// ---------------------------------------------------------------------------
// Rasteriser
// ---------------------------------------------------------------------------

export class SpriteGrid {
  readonly cells = new Uint8Array(SPRITE_COLS * SPRITE_ROWS);

  get(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= SPRITE_COLS || row >= SPRITE_ROWS) return 0;
    return this.cells[row * SPRITE_COLS + col];
  }

  /** Paint every cell whose centre lies inside the shape test */
  paint(minX: number, maxX: number, minY: number, maxY: number, ink: number, inside: (p: Vec) => boolean) {
    const c0 = Math.max(0, Math.floor((minX - SPRITE_LEFT) / CELL_W));
    const c1 = Math.min(SPRITE_COLS - 1, Math.floor((maxX - SPRITE_LEFT) / CELL_W));
    const r0 = Math.max(0, Math.floor(minY - SPRITE_TOP));
    const r1 = Math.min(SPRITE_ROWS - 1, Math.floor(maxY - SPRITE_TOP));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (inside(v(SPRITE_LEFT + c * CELL_W + CELL_W / 2, SPRITE_TOP + r + 0.5))) this.cells[r * SPRITE_COLS + c] = ink;
      }
    }
  }

  /** A tapered capsule from a (radius ra) to b (radius rb) */
  capsule(a: Vec, b: Vec, ra: number, rb: number, ink: number) {
    const ab = sub(b, a);
    const l2 = Math.max(dot(ab, ab), 1e-6);
    const pad = Math.max(ra, rb) + 1;
    this.paint(Math.min(a.x, b.x) - pad, Math.max(a.x, b.x) + pad, Math.min(a.y, b.y) - pad, Math.max(a.y, b.y) + pad, ink, (p) => {
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
      const q = add(a, mul(ab, t));
      return len(sub(p, q)) <= ra + (rb - ra) * t;
    });
  }

  disc(c: Vec, r: number, ink: number) { this.capsule(c, c, r, r, ink); }

  /** Rows of digits, as stored in SpriteData */
  rows(): string[] {
    const out: string[] = [];
    for (let r = 0; r < SPRITE_ROWS; r++) {
      let s = '';
      for (let c = 0; c < SPRITE_COLS; c++) s += String(this.cells[r * SPRITE_COLS + c]);
      out.push(s);
    }
    return out;
  }
}

/** Radii of each part in world pixels */
const R = { thigh: 2.9, shin: 2.4, cuff: 2.6, upperArm: 2.2, forearm: 1.9, hand: 1.9, foot: 1.3, head: 4.6, chest: 5.0, waist: 4.2 };

function drawLeg(g: SpriteGrid, hip: Vec, knee: Vec, foot: Vec, toe: Vec, gi: number) {
  const ankle = foot;
  const toeTip = add(ankle, mul(norm(toe), 3.6));
  g.capsule(ankle, toeTip, R.foot, R.foot, Ink.Skin);
  g.capsule(hip, knee, R.thigh, R.thigh, gi);
  // trousers flare a touch at the cuff and stop just above the ankle
  const cuff = add(ankle, mul(norm(sub(knee, ankle)), 1.6));
  g.capsule(knee, cuff, R.shin, R.cuff, gi);
}

function drawArm(g: SpriteGrid, shoulder: Vec, elbow: Vec, hand: Vec, gi: number) {
  const wrist = add(hand, mul(norm(sub(elbow, hand)), 1.8));
  g.capsule(shoulder, elbow, R.upperArm, R.upperArm, gi);
  g.capsule(elbow, wrist, R.forearm, R.forearm, gi);
  g.disc(hand, R.hand, Ink.Skin);
}

function drawHead(g: SpriteGrid, head: Vec, neck: Vec, front: boolean) {
  const up = norm(sub(head, neck));
  const fwd = v(-up.y, up.x);
  g.capsule(neck, head, 1.6, 1.6, Ink.Skin);
  g.paint(head.x - R.head - 1, head.x + R.head + 1, head.y - R.head - 1, head.y + R.head + 1, Ink.Skin, (p) => len(sub(p, head)) <= R.head);
  // short dark hair: crown and back of the head (front view: crown only)
  g.paint(head.x - R.head - 1, head.x + R.head + 1, head.y - R.head - 1, head.y + R.head + 1, Ink.Dark, (p) => {
    const d = sub(p, head);
    if (len(d) > R.head + 0.3) return false;
    const u = dot(d, up), f = dot(d, fwd);
    return front ? u > 2.0 : u > 1.6 || (f < -1.2 && u > -2.5);
  });
}

function drawTorso(g: SpriteGrid, hip: Vec, neck: Vec, front: boolean) {
  const spine = norm(sub(neck, hip));
  const fwd = v(-spine.y, spine.x);
  const chest = add(neck, mul(spine, -3.5));
  // jacket skirt hangs a little below the belt
  const skirt = add(hip, mul(spine, front ? -1 : -3));
  g.capsule(skirt, chest, R.waist, R.chest, Ink.Gi);
  // belt across the waist, knot tails hanging at the front
  const belt = add(hip, mul(spine, 1.2));
  g.paint(hip.x - 8, hip.x + 8, hip.y - 8, hip.y + 8, Ink.Dark, (p) => {
    const d = sub(p, belt);
    return Math.abs(dot(d, spine)) <= 0.9 && Math.abs(dot(d, fwd)) <= R.waist + 0.4;
  });
  if (!front) {
    const knot = add(belt, mul(fwd, R.waist - 0.5));
    g.capsule(knot, add(knot, add(mul(spine, -3.5), mul(fwd, 1))), 0.6, 0.6, Ink.Dark);
  } else {
    g.capsule(belt, add(belt, mul(spine, -3)), 0.7, 0.7, Ink.Dark);
  }
  // the gi opens in a V at the throat
  g.capsule(add(neck, mul(spine, -1)), add(add(neck, mul(spine, -3.2)), mul(fwd, front ? 0 : 1.6)), 0.8, 0.5, Ink.Skin);
}

/**
 * Draw a near limb on its own layer and lay it over the body. Where it crosses the
 * body it gets a one-pixel dark edge, so a white arm still reads against a white gi;
 * against the backdrop it has no outline.
 */
function overlay(g: SpriteGrid, draw: (layer: SpriteGrid) => void, edge: boolean) {
  const layer = new SpriteGrid();
  draw(layer);
  const W = SPRITE_COLS;
  if (edge) {
    const marks: number[] = [];
    for (let r = 0; r < SPRITE_ROWS; r++) {
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        if (layer.cells[i] || !g.cells[i]) continue;
        if (layer.get(c - 1, r) || layer.get(c + 1, r) || layer.get(c, r - 1) || layer.get(c, r + 1)) marks.push(i);
      }
    }
    for (const i of marks) g.cells[i] = Ink.Dark;
  }
  for (let i = 0; i < layer.cells.length; i++) if (layer.cells[i]) g.cells[i] = layer.cells[i];
}

/** Draw a pose into a sprite grid */
export function drawPose(p: Pose): SpriteGrid {
  const g = new SpriteGrid();
  const s = skeleton(p);
  const front = !!p.front;
  // far side first, in shade (except facing the camera)
  const far = front ? Ink.Gi : Ink.Shade;
  drawArm(g, s.shoulder, s.farElbow, s.farHand, far);
  drawLeg(g, s.hip, s.farKnee, s.farFoot, p.farToe ?? toeDefault(), far);
  drawTorso(g, s.hip, s.neck, front);
  overlay(g, (l) => drawLeg(l, s.hip, s.nearKnee, s.nearFoot, p.nearToe ?? toeDefault(), Ink.Gi), !front);
  drawHead(g, s.head, s.neck, front);
  overlay(g, (l) => drawArm(l, s.shoulder, s.nearElbow, s.nearHand, Ink.Gi), !front);
  return g;
}

/** Bounding box of a drawn pose in world pixels (relative to the feet, facing right) */
export function poseBounds(g: SpriteGrid): { left: number; right: number; top: number; bottom: number } | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let r = 0; r < SPRITE_ROWS; r++) {
    for (let c = 0; c < SPRITE_COLS; c++) {
      if (!g.get(c, r)) continue;
      left = Math.min(left, SPRITE_LEFT + c * CELL_W);
      right = Math.max(right, SPRITE_LEFT + (c + 1) * CELL_W);
      top = Math.min(top, SPRITE_TOP + r);
      bottom = Math.max(bottom, SPRITE_TOP + r + 1);
    }
  }
  return left === Infinity ? null : { left, right, top, bottom };
}
