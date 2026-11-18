/**
 * Fighter poses for Way of the Exploding Sats, drawn with the skeletal rig in
 * fighterRig.ts. Each pose is a few joint positions in world pixels relative to the
 * fighter's feet, facing right; the rig solves elbows and knees and draws the body
 * onto the 2x1 fighter-pixel grid. Tune a pose by moving its joints and checking the
 * contact sheet (scripts/fighter-contact-sheet.ts).
 *
 * Attack poses put the striking hand or foot on the engine's strike point for that
 * move (MOVES[move].strike in fistEngine.ts); see fighterSprites.test.ts.
 */

import { drawPose, rotatePose, SPRITE_COLS, SPRITE_ROWS, SPRITE_LEFT, SPRITE_TOP, type Pose, type Vec } from './fighterRig';

const v = (x: number, y: number): Vec => ({ x, y });

/** Fighting stance: lead (near) side forward, guard up */
const stance: Pose = {
  hip: v(-1, -24), neck: v(1, -41),
  nearHand: v(12, -35), farHand: v(7, -31),
  nearFoot: v(9, -2), farFoot: v(-9, -2),
};

const crouch: Pose = {
  hip: v(-1, -14), neck: v(5, -30),
  nearHand: v(14, -24), farHand: v(10, -20),
  nearFoot: v(10, -2), farFoot: v(-9, -2), farKnee: -1,
};

const tuck: Pose = {
  hip: v(-2, -30), neck: v(5, -42), head: v(8, -46),
  nearHand: v(8, -30), farHand: v(6, -28),
  nearFoot: v(4, -22), farFoot: v(1, -21), nearToe: v(0, 1), farToe: v(0, 1),
};
const SPIN_PIVOT = v(2, -32);

const fallenBack: Pose = {
  hip: v(-12, -4), neck: v(-28, -5), head: v(-33, -5),
  nearHand: v(-22, -2), farHand: v(-34, -3),
  nearFoot: v(6, -2), farFoot: v(10, -3), nearKnee: 1, farKnee: 1, nearToe: v(0.3, -1), farToe: v(0.3, -1),
};

const fallenFront: Pose = {
  hip: v(6, -4), neck: v(22, -5), head: v(27, -5),
  nearHand: v(30, -2), farHand: v(20, -2),
  nearFoot: v(-18, -2), farFoot: v(-16, -3), nearToe: v(0, 1), farToe: v(0, 1),
};

export const POSES = {
  stance,
  stance_breathe: { ...stance, hip: v(-1, -23), neck: v(1, -40), nearHand: v(12, -34), farHand: v(7, -30) },
  walk_1: { ...stance, hip: v(1, -25), neck: v(3, -42), nearFoot: v(6, -2), farFoot: v(-4, -6), farToe: v(0.6, 0.6) },
  walk_2: { ...stance, hip: v(2, -25), neck: v(4, -42), nearFoot: v(4, -2), farFoot: v(3, -5), farToe: v(0.7, 0.5) },
  walk_3: { ...stance, hip: v(1, -24), neck: v(3, -41), nearFoot: v(12, -3), farFoot: v(-6, -2), nearToe: v(0.8, -0.3) },
  crouch,
  turn: {
    hip: v(0, -25), neck: v(0, -42),
    nearHand: v(7, -27), farHand: v(-7, -27), nearElbow: -1,
    nearFoot: v(6, -2), farFoot: v(-6, -2), farKnee: 1, farToe: v(-1, 0),
    front: true,
  } as Pose,
  jump_prep: { ...crouch, hip: v(0, -17), neck: v(3, -33), nearHand: v(10, -26), farHand: v(-6, -22) },
  jump_air: {
    hip: v(0, -28), neck: v(2, -45),
    nearHand: v(12, -40), farHand: v(-8, -38),
    nearFoot: v(6, -12), farFoot: v(-6, -10), nearToe: v(0.6, 0.8), farToe: v(0.4, 0.9),
  },
  land: { ...crouch, hip: v(0, -17), neck: v(4, -33), nearHand: v(13, -26), farHand: v(-4, -26) },
  tuck,
  tuck_90: rotatePose(tuck, 90, SPIN_PIVOT),
  tuck_180: rotatePose(tuck, 180, SPIN_PIVOT),
  tuck_270: rotatePose(tuck, 270, SPIN_PIVOT),
  block_high: { ...stance, nearHand: v(13, -52), nearElbow: -1, farHand: v(7, -33) },
  block_low: { ...stance, hip: v(-2, -22), neck: v(1, -39), nearHand: v(13, -22), farHand: v(5, -33) },
  // Punches: the chamber pulls the fist back to the hip
  punch_chamber: { ...stance, hip: v(0, -24), neck: v(1, -41), nearHand: v(-1, -28), farHand: v(12, -35) },
  jab: { ...stance, hip: v(3, -24), neck: v(7, -40), nearFoot: v(12, -2), nearHand: v(22, -37), farHand: v(3, -29) },
  high_punch: { ...stance, hip: v(3, -25), neck: v(7, -42), nearFoot: v(12, -2), nearHand: v(22, -43), farHand: v(3, -30) },
  low_punch: {
    hip: v(9, -13), neck: v(19, -27),
    nearHand: v(37, -22), farHand: v(10, -18),
    nearFoot: v(25, -2), farFoot: v(-9, -2), farKnee: -1, farToe: v(1, 0.3),
  },
  // Kicks: knee chambers up, then the leg snaps out to the strike point
  kick_chamber: {
    hip: v(1, -26), neck: v(-1, -43),
    nearHand: v(9, -36), farHand: v(-4, -32),
    nearFoot: v(13, -20), nearKnee: -1, nearToe: v(0.8, 0.6),
    farFoot: v(-3, -2),
  },
  high_kick: {
    hip: v(10, -28), neck: v(-1, -42), head: v(-3, -47),
    nearHand: v(3, -34), farHand: v(-10, -32),
    nearFoot: v(37, -45), nearKnee: -1, nearToe: v(0.6, -0.8),
    farFoot: v(5, -2),
  },
  mid_kick: {
    hip: v(14, -27), neck: v(2, -40), head: v(0, -45),
    nearHand: v(6, -34), farHand: v(-6, -30),
    nearFoot: v(44, -30), nearKnee: -1, nearToe: v(0.3, -1),
    farFoot: v(4, -2),
  },
  jab_kick: {
    hip: v(5, -25), neck: v(2, -42),
    nearHand: v(10, -36), farHand: v(-2, -31),
    nearFoot: v(34, -14), nearKnee: -1, nearToe: v(1, -0.2),
    farFoot: v(-4, -2),
  },
  sweep_low: {
    hip: v(6, -12), neck: v(9, -29),
    nearHand: v(14, -20), farHand: v(6, -12),
    nearFoot: v(22, -3), farFoot: v(2, -2), farKnee: -1, nearKnee: -1,
  },
  sweep: {
    hip: v(14, -12), neck: v(4, -27), head: v(2, -32),
    nearHand: v(10, -8), farHand: v(-2, -22),
    nearFoot: v(42, -3), nearKnee: -1, nearToe: v(1, 0),
    farFoot: v(10, -2), farKnee: -1,
  },
  // Spinning kicks are drawn as a kick behind the body; the animation mirrors them
  spin_kick: {
    hip: v(-15, -27), neck: v(1, -36), head: v(5, -40),
    nearHand: v(8, -30), farHand: v(-6, -36),
    nearFoot: v(-43, -32), nearKnee: 1, nearToe: v(-0.3, -1),
    farFoot: v(-8, -2),
  },
  back_kick_chamber: {
    hip: v(-2, -26), neck: v(6, -41),
    nearHand: v(12, -34), farHand: v(4, -30),
    nearFoot: v(-12, -18), nearKnee: 1,
    farFoot: v(2, -2),
  },
  high_back_kick: {
    hip: v(-5, -27), neck: v(9, -37), head: v(13, -41),
    nearHand: v(15, -30), farHand: v(3, -26),
    nearFoot: v(-22, -41), nearKnee: 1, nearToe: v(-0.5, -0.9),
    farFoot: v(4, -2),
  },
  flying_kick: {
    hip: v(16, -36), neck: v(5, -50), head: v(3, -55),
    nearHand: v(13, -48), farHand: v(-4, -46),
    nearFoot: v(42, -42), nearKnee: -1, nearToe: v(0.3, -1),
    farFoot: v(10, -24), farKnee: -1, farToe: v(0, 1),
  },
  // Knocked down: snapped backwards by a high or mid blow...
  hit_back: {
    hip: v(-4, -24), neck: v(-11, -40), head: v(-14, -44),
    nearHand: v(-12, -50), farHand: v(-20, -42), nearElbow: -1, farElbow: -1,
    nearFoot: v(8, -2), farFoot: v(-8, -2),
  },
  falling_back: {
    hip: v(-8, -13), neck: v(-23, -24), head: v(-27, -27),
    nearHand: v(-18, -36), farHand: v(-30, -30), nearElbow: -1, farElbow: -1,
    nearFoot: v(8, -10), farFoot: v(6, -4), nearKnee: 1, farKnee: 1, nearToe: v(0.4, -1),
  },
  fallen_back: fallenBack,
  sit_up: {
    hip: v(-8, -5), neck: v(-4, -21),
    nearHand: v(4, -10), farHand: v(-14, -2),
    nearFoot: v(9, -2), farFoot: v(10, -3), nearKnee: 1, farKnee: 1,
  },
  // ...or toppled forwards when the legs are swept
  hit_front: {
    hip: v(-3, -22), neck: v(8, -36), head: v(11, -40),
    nearHand: v(14, -24), farHand: v(4, -22),
    nearFoot: v(-12, -6), farFoot: v(-6, -2), nearToe: v(0.5, 0.8),
  },
  falling_front: {
    hip: v(2, -12), neck: v(16, -21), head: v(20, -23),
    nearHand: v(24, -10), farHand: v(18, -8),
    nearFoot: v(-16, -12), farFoot: v(-14, -6), nearToe: v(0, 1), farToe: v(0, 1),
  },
  fallen_front: fallenFront,
  push_up: {
    hip: v(-2, -12), neck: v(12, -20), head: v(16, -23),
    nearHand: v(16, -2), farHand: v(13, -2),
    nearFoot: v(-14, -2), farFoot: v(-4, -2), nearKnee: 1, farKnee: 1,
  },
  // Ceremony
  attention: {
    hip: v(0, -25), neck: v(1, -42),
    nearHand: v(3, -26), farHand: v(-1, -26),
    nearFoot: v(3, -2), farFoot: v(-2, -2),
  },
  bow: {
    hip: v(-2, -25), neck: v(10, -38), head: v(13, -42),
    nearHand: v(7, -23), farHand: v(5, -23),
    nearFoot: v(3, -2), farFoot: v(-2, -2),
  },
  victory: {
    hip: v(0, -25), neck: v(1, -42),
    nearHand: v(3, -58), nearElbow: -1, farHand: v(-2, -27),
    nearFoot: v(7, -2), farFoot: v(-7, -2),
  },
  kneel: {
    hip: v(-3, -13), neck: v(4, -28), head: v(8, -31),
    nearHand: v(8, -15), farHand: v(5, -13),
    nearFoot: v(-12, -2), nearToe: v(-1, 0), nearKnee: 1,
    farFoot: v(7, -2),
  },
} satisfies Record<string, Pose>;

export type PoseId = keyof typeof POSES;
export const POSE_IDS = Object.keys(POSES) as PoseId[];

export const SPRITE_WIDTH = SPRITE_COLS;
export const SPRITE_HEIGHT = SPRITE_ROWS;
/** world offsets of the sprite's top-left corner relative to the fighter's feet */
export const SPRITE_ORIGIN = { x: SPRITE_LEFT, y: SPRITE_TOP };

export interface SpriteData {
  name: PoseId;
  /** rows of SPRITE_WIDTH digits: 0 clear, 1 gi, 2 skin, 3 hair/belt/edge, 4 gi in shade */
  rows: string[];
}

const cache = new Map<PoseId, SpriteData>();

/** The rasterised sprite for a pose (built on first use) */
export function spriteData(id: PoseId): SpriteData {
  let data = cache.get(id);
  if (!data) {
    data = { name: id, rows: drawPose(POSES[id]).rows() };
    cache.set(id, data);
  }
  return data;
}

