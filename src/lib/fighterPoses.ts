/**
 * Fighter poses for Way of the Exploding Sats.
 *
 * The original used ~600 hand-drawn sprite frames. We recreate the same large,
 * fluid karateka with an articulated skeleton: each move is a handful of key poses
 * that are interpolated per frame and drawn as thick pixel limbs. Angles are in
 * degrees with the fighter facing right: 0 = forward, 90 = up, -90 = down, 180 = back.
 */

import type { MoveId } from './fistEngine';

export interface Pose {
  /** hip position relative to the feet origin (x forward, y up) */
  hx: number;
  hy: number;
  /** torso angle (90 = upright, smaller = leaning forward) */
  torso: number;
  /** head tilt relative to torso */
  head: number;
  /** front arm: upper arm and forearm angles */
  uf: number;
  ff: number;
  /** back arm */
  ub: number;
  fb: number;
  /** front leg: thigh and shin */
  tf: number;
  sf: number;
  /** back leg */
  tb: number;
  sb: number;
  /** whole-body rotation (somersaults), positive = forward flip */
  rot: number;
}

export const LIMB = {
  torso: 17,
  upperArm: 9,
  forearm: 9,
  thigh: 13,
  shin: 13,
  headRadius: 4.5,
  neck: 2,
};

interface Keyframe {
  t: number;
  pose: Pose;
}

function P(
  hx: number, hy: number, torso: number, head: number,
  uf: number, ff: number, ub: number, fb: number,
  tf: number, sf: number, tb: number, sb: number,
  rot = 0,
): Pose {
  return { hx, hy, torso, head, uf, ff, ub, fb, tf, sf, tb, sb, rot };
}

// Reference poses
const STAND = P(0, 25, 88, 0, -35, 55, -60, 40, -62, -112, -118, -70);
const STAND_ALT = P(0, 24.5, 88, 0, -32, 58, -58, 42, -63, -111, -117, -71);
const CROUCH = P(2, 16.5, 78, 5, -25, 70, -45, 50, -40, -140, -140, -40);
const JUMP = P(0, 26, 92, 0, 50, 100, 40, 90, -60, -150, -55, -150);
const TUCK = P(0, 20, 55, -35, 20, -70, 25, -75, 15, -110, 20, -115);
const LYING = P(-18, 5, 178, -10, 165, 175, 175, 185, -5, 2, 5, -2);
const HALF_DOWN = P(-10, 14, 140, -15, 120, 150, 130, 160, -40, -60, -20, -70);
const BOW = P(0, 25, 88, 0, -80, -85, -100, -95, -75, -100, -105, -80);
const BOW_DEEP = P(2, 25, 40, -10, -60, -70, -90, -80, -75, -100, -105, -80);
const VICTORY = P(0, 26, 90, 0, 75, 100, 105, 80, -80, -95, -100, -85);
const VICTORY_HOP = P(0, 28, 90, 5, 80, 95, 100, 85, -70, -120, -110, -60);
const DEFEAT = P(0, 13, 65, -45, -70, -90, -110, -90, -30, -150, -150, -30);

// Attack poses
const CHAMBER = P(0, 26, 95, 0, -20, 60, -70, 30, -25, -115, -100, -82);
const MID_KICK = P(2, 26, 100, 0, -10, 40, -80, 20, 0, 0, -100, -82);
const HIGH_KICK = P(2, 26, 108, -5, -5, 30, -90, 10, 40, 30, -100, -82);
const JAB_KICK = P(1, 25, 95, 0, -20, 55, -70, 30, -8, -8, -100, -82);
const FLYING_WINDUP = P(0, 26, 100, 0, 30, 90, 20, 80, -40, -140, -50, -150);
const FLYING_KICK = P(0, 26, 115, -10, 5, 25, 150, 100, 22, 15, -70, -160);
const SWEEP_WIND = P(2, 14, 65, 10, -30, 60, -40, 40, -30, -145, -145, -35);
const SWEEP = P(4, 12, 60, 10, -60, 20, -40, 30, -15, -5, -140, -40);
const BACK_SWEEP_WIND = P(-2, 14, 110, -10, 200, 240, 210, 250, -150, -35, -30, -145);
const BACK_SWEEP = P(-4, 12, 120, -10, 240, 200, 220, 220, -165, -175, -40, -140);
const RH_WIND = P(-2, 26, 80, 10, -50, 40, -80, 30, -70, -105, -100, -85);
const RH_PIVOT = P(0, 27, 95, 0, -20, 80, -100, 0, -30, -100, -90, -90);
const RH_KICK = P(4, 27, 112, -5, 0, 40, -100, -10, 45, 35, -95, -85);
const RH_RECOVER = P(4, 26, 92, 0, -40, 50, -70, 30, -60, -110, -100, -85);
const BACK_KICK_WIND = P(0, 26, 75, 10, -30, 40, -60, 20, -60, -110, -120, -70);
const BACK_KICK = P(-2, 26, 60, 15, -10, 60, -40, 50, 145, 165, -95, -85);
const JAB_WIND = P(0, 26, 85, 0, -50, 70, -60, 40, -75, -100, -105, -82);
const JAB = P(3, 26, 82, 0, -18, -18, -70, 45, -75, -100, -105, -82);
const HIGH_PUNCH_WIND = P(0, 26, 85, 0, -40, 80, -60, 40, -75, -100, -105, -82);
const HIGH_PUNCH = P(3, 26, 80, 5, 12, 12, -75, 40, -70, -105, -105, -82);
const LOW_PUNCH_WIND = P(2, 16.5, 78, 5, -40, 80, -45, 50, -40, -140, -140, -40);
const LOW_PUNCH = P(4, 16.5, 70, 10, -28, -28, -50, 45, -40, -140, -140, -40);
const BLOCK_HIGH = P(0, 26, 88, 0, 70, 125, 40, 100, -75, -100, -105, -82);
const BLOCK_LOW = P(0, 22, 84, 5, -55, -15, -75, -30, -60, -120, -120, -60);
const HIT_LEAN = P(-3, 25, 110, -20, 60, 120, 30, 100, -70, -100, -110, -80);

const WALK_A = P(0, 26, 88, 0, -35, 55, -60, 40, -60, -108, -118, -70);
const WALK_B = P(0, 25, 88, 0, -30, 60, -65, 35, -90, -90, -90, -90);
const WALK_C = P(0, 26, 88, 0, -40, 50, -55, 45, -118, -70, -60, -108);

const ANIMATIONS: Record<MoveId, Keyframe[]> = {
  stand: [{ t: 0, pose: STAND }, { t: 0.5, pose: STAND_ALT }, { t: 1, pose: STAND }],
  walk_forward: [{ t: 0, pose: WALK_A }, { t: 0.25, pose: WALK_B }, { t: 0.5, pose: WALK_C }, { t: 0.75, pose: WALK_B }, { t: 1, pose: WALK_A }],
  walk_back: [{ t: 0, pose: WALK_C }, { t: 0.25, pose: WALK_B }, { t: 0.5, pose: WALK_A }, { t: 0.75, pose: WALK_B }, { t: 1, pose: WALK_C }],
  crouch: [{ t: 0, pose: CROUCH }, { t: 1, pose: CROUCH }],
  jump: [{ t: 0, pose: STAND }, { t: 0.2, pose: JUMP }, { t: 0.8, pose: JUMP }, { t: 1, pose: STAND }],
  somersault_forward: [
    { t: 0, pose: STAND }, { t: 0.15, pose: { ...TUCK, rot: 40 } }, { t: 0.85, pose: { ...TUCK, rot: 330 } }, { t: 1, pose: { ...STAND, rot: 360 } },
  ],
  somersault_back: [
    { t: 0, pose: STAND }, { t: 0.15, pose: { ...TUCK, rot: -40 } }, { t: 0.85, pose: { ...TUCK, rot: -330 } }, { t: 1, pose: { ...STAND, rot: -360 } },
  ],
  turn: [{ t: 0, pose: STAND }, { t: 0.5, pose: RH_PIVOT }, { t: 1, pose: STAND }],
  block_high: [{ t: 0, pose: STAND }, { t: 0.25, pose: BLOCK_HIGH }, { t: 0.75, pose: BLOCK_HIGH }, { t: 1, pose: STAND }],
  block_low: [{ t: 0, pose: STAND }, { t: 0.25, pose: BLOCK_LOW }, { t: 0.75, pose: BLOCK_LOW }, { t: 1, pose: STAND }],
  jab_punch: [{ t: 0, pose: JAB_WIND }, { t: 0.3, pose: JAB }, { t: 0.5, pose: JAB }, { t: 1, pose: STAND }],
  high_punch: [{ t: 0, pose: HIGH_PUNCH_WIND }, { t: 0.35, pose: HIGH_PUNCH }, { t: 0.55, pose: HIGH_PUNCH }, { t: 1, pose: STAND }],
  low_punch: [{ t: 0, pose: LOW_PUNCH_WIND }, { t: 0.35, pose: LOW_PUNCH }, { t: 0.55, pose: LOW_PUNCH }, { t: 1, pose: CROUCH }],
  flying_kick: [{ t: 0, pose: FLYING_WINDUP }, { t: 0.28, pose: FLYING_KICK }, { t: 0.72, pose: FLYING_KICK }, { t: 1, pose: STAND }],
  high_kick: [{ t: 0, pose: CHAMBER }, { t: 0.4, pose: HIGH_KICK }, { t: 0.58, pose: HIGH_KICK }, { t: 0.8, pose: CHAMBER }, { t: 1, pose: STAND }],
  mid_kick: [{ t: 0, pose: CHAMBER }, { t: 0.4, pose: MID_KICK }, { t: 0.58, pose: MID_KICK }, { t: 0.8, pose: CHAMBER }, { t: 1, pose: STAND }],
  jab_kick: [{ t: 0, pose: CHAMBER }, { t: 0.3, pose: JAB_KICK }, { t: 0.5, pose: JAB_KICK }, { t: 1, pose: STAND }],
  sweep: [{ t: 0, pose: SWEEP_WIND }, { t: 0.38, pose: SWEEP }, { t: 0.65, pose: SWEEP }, { t: 1, pose: CROUCH }],
  back_sweep: [{ t: 0, pose: BACK_SWEEP_WIND }, { t: 0.38, pose: BACK_SWEEP }, { t: 0.65, pose: BACK_SWEEP }, { t: 1, pose: CROUCH }],
  roundhouse: [{ t: 0, pose: RH_WIND }, { t: 0.25, pose: RH_PIVOT }, { t: 0.45, pose: RH_KICK }, { t: 0.62, pose: RH_KICK }, { t: 0.82, pose: RH_RECOVER }, { t: 1, pose: STAND }],
  high_back_kick: [{ t: 0, pose: BACK_KICK_WIND }, { t: 0.4, pose: BACK_KICK }, { t: 0.58, pose: BACK_KICK }, { t: 1, pose: STAND }],
  fall: [{ t: 0, pose: HIT_LEAN }, { t: 0.45, pose: HALF_DOWN }, { t: 0.8, pose: LYING }, { t: 1, pose: LYING }],
  lying: [{ t: 0, pose: LYING }, { t: 1, pose: LYING }],
  getup: [{ t: 0, pose: LYING }, { t: 0.5, pose: HALF_DOWN }, { t: 0.8, pose: CROUCH }, { t: 1, pose: STAND }],
  bow: [{ t: 0, pose: BOW }, { t: 0.3, pose: BOW_DEEP }, { t: 0.6, pose: BOW_DEEP }, { t: 0.9, pose: BOW }, { t: 1, pose: STAND }],
  victory: [{ t: 0, pose: VICTORY }, { t: 0.5, pose: VICTORY_HOP }, { t: 1, pose: VICTORY }],
  defeat: [{ t: 0, pose: DEFEAT }, { t: 1, pose: DEFEAT }],
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    hx: lerp(a.hx, b.hx, t),
    hy: lerp(a.hy, b.hy, t),
    torso: lerp(a.torso, b.torso, t),
    head: lerp(a.head, b.head, t),
    uf: lerp(a.uf, b.uf, t),
    ff: lerp(a.ff, b.ff, t),
    ub: lerp(a.ub, b.ub, t),
    fb: lerp(a.fb, b.fb, t),
    tf: lerp(a.tf, b.tf, t),
    sf: lerp(a.sf, b.sf, t),
    tb: lerp(a.tb, b.tb, t),
    sb: lerp(a.sb, b.sb, t),
    rot: lerp(a.rot, b.rot, t),
  };
}

/** Pose for a move at progress 0..1 */
export function poseFor(move: MoveId, progress: number): Pose {
  const frames = ANIMATIONS[move];
  const t = Math.max(0, Math.min(1, progress));
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      return lerpPose(a.pose, b.pose, (t - a.t) / span);
    }
  }
  return frames[frames.length - 1].pose;
}

export interface Point {
  x: number;
  y: number;
}

export interface Skeleton {
  hip: Point;
  neck: Point;
  headCentre: Point;
  shoulder: Point;
  elbowF: Point; handF: Point;
  elbowB: Point; handB: Point;
  kneeF: Point; footF: Point;
  kneeB: Point; footB: Point;
}

function polar(from: Point, angleDeg: number, length: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  return { x: from.x + Math.cos(a) * length, y: from.y + Math.sin(a) * length };
}

/**
 * Joint positions in fighter space (x forward, y up, origin at the feet).
 * Rotation for somersaults is applied around the body's centre of mass.
 */
export function buildSkeleton(pose: Pose): Skeleton {
  const hip = { x: pose.hx, y: pose.hy };
  const neck = polar(hip, pose.torso, LIMB.torso);
  const shoulder = polar(hip, pose.torso, LIMB.torso - 1);
  const headCentre = polar(neck, pose.torso + pose.head, LIMB.neck + LIMB.headRadius);
  const elbowF = polar(shoulder, pose.uf, LIMB.upperArm);
  const handF = polar(elbowF, pose.ff, LIMB.forearm);
  const elbowB = polar(shoulder, pose.ub, LIMB.upperArm);
  const handB = polar(elbowB, pose.fb, LIMB.forearm);
  const kneeF = polar(hip, pose.tf, LIMB.thigh);
  const footF = polar(kneeF, pose.sf, LIMB.shin);
  const kneeB = polar(hip, pose.tb, LIMB.thigh);
  const footB = polar(kneeB, pose.sb, LIMB.shin);

  const skeleton: Skeleton = { hip, neck, headCentre, shoulder, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB };

  if (pose.rot !== 0) {
    const centre = { x: pose.hx, y: 24 };
    const a = (-pose.rot * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (const key of Object.keys(skeleton) as (keyof Skeleton)[]) {
      const p = skeleton[key];
      const dx = p.x - centre.x;
      const dy = p.y - centre.y;
      skeleton[key] = { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
    }
  }
  return skeleton;
}
