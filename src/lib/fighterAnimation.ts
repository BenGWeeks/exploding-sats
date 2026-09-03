/**
 * Animation sequences for every move, following the frame tables of the original
 * (frames_sprite_table / frames_data_table in the BBC disassembly): which sprite is
 * shown, for how long, and whether it is drawn mirrored. Durations are in 60 Hz engine
 * frames and add up to the move's length in MOVES.
 */

import { MOVES, type MoveId } from './fistEngine';
import { S } from './fighterSprites';

export interface AnimFrame {
  sprite: number;
  frames: number;
  /** draw mirrored (the fighter has spun round mid-move) */
  flip?: boolean;
}

const A = (sprite: number, frames: number, flip = false): AnimFrame => ({ sprite, frames, flip });

export const ANIMATIONS: Record<MoveId, AnimFrame[]> = {
  stand: [A(S.STANDING, 48)],
  // Walk: sprites 1e, 1f, 20 with the standing frame between steps
  walk_forward: [A(S.WALKING_ONE, 6), A(S.WALKING_TWO, 6), A(S.WALKING_THREE, 6), A(S.STANDING, 6)],
  walk_back: [A(S.WALKING_THREE, 6), A(S.WALKING_TWO, 6), A(S.WALKING_ONE, 6), A(S.STANDING, 6)],
  crouch: [A(S.CROUCH, 20)],
  jump: [A(S.BENDING_KNEES, 6), A(S.JUMPING, 24), A(S.BENDING_KNEES, 6)],
  somersault_forward: [
    A(S.BENDING_KNEES, 4), A(S.SOMERSAULT_ONE, 6), A(S.SOMERSAULT_TWO, 6), A(S.SOMERSAULT_THREE, 6),
    A(S.SOMERSAULT_FOUR, 6), A(S.SOMERSAULT_FIVE, 6), A(S.BENDING_KNEES, 6),
  ],
  somersault_back: [
    A(S.BENDING_KNEES, 4), A(S.SOMERSAULT_FIVE, 6), A(S.SOMERSAULT_FOUR, 6), A(S.SOMERSAULT_THREE, 6),
    A(S.SOMERSAULT_TWO, 6), A(S.SOMERSAULT_ONE, 6), A(S.BENDING_KNEES, 6),
  ],
  // About-face uses the first two roundhouse frames, like the original's "roundhouse block"
  turn: [A(S.ROUNDHOUSE_ONE, 4), A(S.ROUNDHOUSE_TWO, 6)],
  block_high: [A(S.HIGH_BLOCK, 18)],
  block_low: [A(S.LOW_BLOCK, 18)],
  jab_punch: [A(S.PREPARING_TO_PUNCH, 4), A(S.STANDING_JAB, 10), A(S.PREPARING_TO_PUNCH, 2)],
  high_punch: [A(S.PREPARING_TO_PUNCH, 6), A(S.HIGH_PUNCH, 13), A(S.PREPARING_TO_PUNCH, 3)],
  low_punch: [A(S.CROUCH, 5), A(S.CROUCHING_JAB, 12), A(S.CROUCH, 3)],
  flying_kick: [A(S.BENDING_KNEES, 4), A(S.KICK_ONE, 4), A(S.JUMPING, 4), A(S.FLYING_KICK, 26), A(S.JUMPING, 4), A(S.KICK_ONE, 4)],
  high_kick: [A(S.KICK_ONE, 5), A(S.KICK_TWO, 5), A(S.HIGH_KICK, 12), A(S.KICK_TWO, 4), A(S.KICK_ONE, 4)],
  mid_kick: [A(S.KICK_ONE, 5), A(S.KICK_TWO, 5), A(S.MID_KICK, 12), A(S.KICK_TWO, 3), A(S.KICK_ONE, 3)],
  jab_kick: [A(S.KICK_ONE, 5), A(S.SHORT_JAB_KICK, 9), A(S.KICK_ONE, 4)],
  sweep: [A(S.CROUCH, 4), A(S.SWEEP_ONE, 7), A(S.SWEEP_TWO, 15), A(S.SWEEP_ONE, 6)],
  // Backward sweep: the fighter spins to sweep the leg behind, so the sweep is drawn mirrored
  back_sweep: [A(S.CROUCH, 4), A(S.SWEEP_ONE, 7, true), A(S.SWEEP_TWO, 16, true), A(S.SWEEP_ONE, 7, true)],
  // Roundhouse spins right round: the last frames face the other way, and the move ends about-face
  roundhouse: [A(S.ROUNDHOUSE_ONE, 8), A(S.ROUNDHOUSE_TWO, 8), A(S.ROUNDHOUSE_THREE, 12, true), A(S.ROUNDHOUSE_FOUR, 8, true), A(S.REACHING_KICK, 8, true)],
  high_back_kick: [A(S.HIGH_BACK_KICK_ONE, 9), A(S.HIGH_BACK_KICK_TWO, 12), A(S.HIGH_BACK_KICK_ONE, 9)],
  fall: [A(S.FALLING_BACKWARDS_ONE, 12), A(S.FALLING_BACKWARDS_TWO, 16), A(S.FALLEN_BACKWARDS, 16)],
  lying: [A(S.FALLEN_BACKWARDS, 50)],
  getup: [A(S.FALLING_BACKWARDS_TWO, 10), A(S.FALLING_BACKWARDS_ONE, 10), A(S.STANDING, 10)],
  // Both fighters turn to the camera and bow before every bout, as in the original
  bow: [A(S.STANDING, 10), A(S.FACE_FORWARDS, 20), A(S.BOW_FORWARDS, 30), A(S.FACE_FORWARDS, 10), A(S.STANDING, 10)],
  victory: [A(S.FACE_FORWARDS, 60), A(S.BOW_FORWARDS, 30), A(S.FACE_FORWARDS, 30)],
  defeat: [A(S.FALLEN_INWARDS, 120)],
};

/** Which sprite to show for a move at a given engine frame */
export function spriteFor(move: MoveId, frame: number): AnimFrame {
  const seq = ANIMATIONS[move];
  let t = Math.max(0, frame);
  for (const step of seq) {
    if (t < step.frames) return step;
    t -= step.frames;
  }
  return seq[seq.length - 1];
}

/** Sanity check used by tests: every sequence covers its move's duration */
export function animationLength(move: MoveId): number {
  return ANIMATIONS[move].reduce((sum, s) => sum + s.frames, 0);
}

export function movesWithShortAnimations(): MoveId[] {
  return (Object.keys(MOVES) as MoveId[]).filter((m) => animationLength(m) < MOVES[m].frames && !MOVES[m].loop);
}
