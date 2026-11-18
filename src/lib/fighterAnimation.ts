/**
 * Animation timing for every move: which pose is shown, for how long, and whether it
 * is drawn mirrored. Timings are relative weights, not frame counts, and are fitted to
 * the engine at load time:
 *
 * - attacks have a wind-up spread over the frames before MOVES[move].activeFrom, one
 *   strike pose held for the whole active window, and a recovery after activeTo;
 * - everything else spreads its steps over MOVES[move].frames.
 *
 * So if the engine re-times a move, the striking pose still lines up with the frames
 * that can hit. A few key poses with holds keep the deliberate, slightly choppy feel.
 */

import { MOVES, type MoveId, type StrikeHeight } from './fistEngine';
import type { PoseId } from './fighterSprites';

export interface AnimFrame {
  pose: PoseId;
  frames: number;
  /** draw mirrored (the fighter has spun round mid-move) */
  flip?: boolean;
}

interface Step { pose: PoseId; weight: number; flip?: boolean }
const s = (pose: PoseId, weight: number, flip = false): Step => ({ pose, weight, flip });

interface AttackTiming { windup: Step[]; strike: Step; recover: Step[] }

/** Wind-up and recovery for each attack; the strike pose fills the active window */
export const ATTACK_TIMING: Partial<Record<MoveId, AttackTiming>> = {
  jab_punch: { windup: [s('punch_chamber', 1)], strike: s('jab', 1), recover: [s('punch_chamber', 1)] },
  high_punch: { windup: [s('punch_chamber', 1)], strike: s('high_punch', 1), recover: [s('punch_chamber', 1), s('stance', 1)] },
  low_punch: { windup: [s('crouch', 1)], strike: s('low_punch', 1), recover: [s('crouch', 1)] },
  jab_kick: { windup: [s('kick_chamber', 1)], strike: s('jab_kick', 1), recover: [s('kick_chamber', 1)] },
  mid_kick: { windup: [s('stance', 1), s('kick_chamber', 2)], strike: s('mid_kick', 1), recover: [s('kick_chamber', 2), s('stance', 1)] },
  high_kick: { windup: [s('stance', 1), s('kick_chamber', 2)], strike: s('high_kick', 1), recover: [s('kick_chamber', 2), s('stance', 1)] },
  sweep: { windup: [s('crouch', 1), s('sweep_low', 2)], strike: s('sweep', 1), recover: [s('sweep_low', 2), s('crouch', 1)] },
  // spins round to sweep the leg behind it
  back_sweep: { windup: [s('crouch', 1), s('sweep_low', 2, true)], strike: s('sweep', 1, true), recover: [s('sweep_low', 2, true), s('crouch', 1)] },
  // a spinning kick: turn side-on, kick out behind (mirrored = towards the foe), finish facing the other way
  roundhouse: { windup: [s('stance', 1), s('turn', 2), s('back_kick_chamber', 2, true)], strike: s('spin_kick', 1, true), recover: [s('back_kick_chamber', 2, true), s('stance', 1, true)] },
  high_back_kick: { windup: [s('back_kick_chamber', 1)], strike: s('high_back_kick', 1), recover: [s('back_kick_chamber', 1)] },
  flying_kick: { windup: [s('jump_prep', 1), s('jump_air', 2)], strike: s('flying_kick', 1), recover: [s('jump_air', 1), s('land', 2)] },
};

/** Weighted steps for the moves that do not strike */
export const MOVE_TIMING: Partial<Record<MoveId, Step[]>> = {
  stand: [s('stance', 1), s('stance_breathe', 1)],
  walk_forward: [s('walk_1', 1), s('walk_2', 1), s('walk_3', 1), s('stance', 1)],
  walk_back: [s('walk_3', 1), s('walk_2', 1), s('walk_1', 1), s('stance', 1)],
  crouch: [s('crouch', 1)],
  jump: [s('jump_prep', 1), s('jump_air', 5), s('land', 1)],
  somersault_forward: [s('jump_prep', 2), s('tuck', 3), s('tuck_90', 3), s('tuck_180', 3), s('tuck_270', 3), s('land', 4)],
  somersault_back: [s('jump_prep', 2), s('tuck', 3), s('tuck_270', 3), s('tuck_180', 3), s('tuck_90', 3), s('land', 4)],
  turn: [s('turn', 1), s('stance', 1, true)],
  block_high: [s('block_high', 1)],
  block_low: [s('block_low', 1)],
  bow: [s('stance', 2), s('attention', 3), s('bow', 6), s('attention', 3), s('stance', 2)],
  victory: [s('attention', 1), s('victory', 3)],
  defeat: [s('kneel', 1)],
  getup: [s('sit_up', 1), s('crouch', 1), s('stance', 1)],
};

/** How a knockdown plays out, by the height of the blow that caused it */
export type FallStyle = 'backward' | 'forward';

export const FALL_TIMING: Record<FallStyle, { fall: Step[]; lying: Step[]; getup: Step[] }> = {
  backward: {
    fall: [s('hit_back', 3), s('falling_back', 3), s('fallen_back', 5)],
    lying: [s('fallen_back', 1)],
    getup: [s('sit_up', 1), s('crouch', 1), s('stance', 1)],
  },
  forward: {
    fall: [s('hit_front', 3), s('falling_front', 3), s('fallen_front', 5)],
    lying: [s('fallen_front', 1)],
    getup: [s('push_up', 1), s('crouch', 1), s('stance', 1)],
  },
};

/** Sweeps and other low blows topple the fighter forwards; anything higher knocks them back */
export function fallStyleFor(height: StrikeHeight | undefined): FallStyle {
  return height === 'low' ? 'forward' : 'backward';
}

/** Split `total` frames between steps by weight (largest remainder, at least 1 each when possible) */
function fit(steps: Step[], total: number): AnimFrame[] {
  if (total <= 0) return [];
  const sum = steps.reduce((a, st) => a + st.weight, 0);
  const exact = steps.map((st) => (st.weight / sum) * total);
  const frames = exact.map((x) => Math.floor(x));
  let left = total - frames.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) frames[order[k].i]++;
  // steal from the longest step so no step is skipped
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] > 0 || total < steps.length) continue;
    const longest = frames.indexOf(Math.max(...frames));
    frames[longest]--;
    frames[i]++;
  }
  return steps.map((st, i) => ({ pose: st.pose, frames: frames[i], flip: st.flip })).filter((f) => f.frames > 0);
}

function buildAttack(move: MoveId, t: AttackTiming): AnimFrame[] {
  const def = MOVES[move];
  const from = def.activeFrom ?? 0;
  const to = def.activeTo ?? from;
  return [
    ...fit(t.windup, from),
    { pose: t.strike.pose, frames: to - from + 1, flip: t.strike.flip },
    ...fit(t.recover, def.frames - to - 1),
  ];
}

function build(): Record<MoveId, AnimFrame[]> {
  const out = {} as Record<MoveId, AnimFrame[]>;
  for (const move of Object.keys(MOVES) as MoveId[]) {
    const attack = ATTACK_TIMING[move];
    if (attack) out[move] = buildAttack(move, attack);
    else if (move === 'fall' || move === 'lying' || move === 'getup') out[move] = fit(FALL_TIMING.backward[move], MOVES[move].frames);
    else out[move] = fit(MOVE_TIMING[move] ?? [s('stance', 1)], MOVES[move].frames);
  }
  return out;
}

export const ANIMATIONS: Record<MoveId, AnimFrame[]> = build();

const FALL_ANIMATIONS: Record<FallStyle, Record<'fall' | 'lying' | 'getup', AnimFrame[]>> = {
  backward: { fall: ANIMATIONS.fall, lying: ANIMATIONS.lying, getup: ANIMATIONS.getup },
  forward: {
    fall: fit(FALL_TIMING.forward.fall, MOVES.fall.frames),
    lying: fit(FALL_TIMING.forward.lying, MOVES.lying.frames),
    getup: fit(FALL_TIMING.forward.getup, MOVES.getup.frames),
  },
};

/** Moves drawn from the airborne poses; on the ground they show the landing pose instead */
const AIRBORNE: Partial<Record<MoveId, true>> = { jump: true, flying_kick: true, somersault_forward: true, somersault_back: true };

export function sequenceFor(move: MoveId, fall: FallStyle = 'backward'): AnimFrame[] {
  if (move === 'fall' || move === 'lying' || move === 'getup') return FALL_ANIMATIONS[fall][move];
  return ANIMATIONS[move];
}

/** Which pose to show for a move at a given engine frame */
export function poseFor(move: MoveId, frame: number, opts: { fall?: FallStyle; airY?: number } = {}): AnimFrame {
  const seq = sequenceFor(move, opts.fall);
  let t = Math.max(0, frame);
  let step = seq[seq.length - 1];
  for (let i = 0; i < seq.length; i++) {
    if (t < seq[i].frames) { step = seq[i]; break; }
    t -= seq[i].frames;
  }
  // Already back on the floor before the move's airborne poses are done: land
  if (AIRBORNE[move] && opts.airY === 0 && frame > (seq[0]?.frames ?? 0) && step.pose !== 'land' && step.pose !== 'jump_prep') {
    return { pose: 'land', frames: 1 };
  }
  return step;
}

/** Sanity check used by tests: every sequence covers its move's duration */
export function animationLength(move: MoveId, fall: FallStyle = 'backward'): number {
  return sequenceFor(move, fall).reduce((sum, st) => sum + st.frames, 0);
}
