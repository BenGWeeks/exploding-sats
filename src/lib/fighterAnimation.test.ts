import { describe, it, expect } from 'vitest';
import { ANIMATIONS, ATTACK_TIMING, animationLength, poseFor, sequenceFor, fallStyleFor } from './fighterAnimation';
import { MOVES, type MoveId } from './fistEngine';
import { POSES } from './fighterSprites';

const moves = Object.keys(MOVES) as MoveId[];

describe('fighter animation', () => {
  it('has an animation for every move that lasts the whole move', () => {
    for (const move of moves) {
      expect(ANIMATIONS[move].length).toBeGreaterThan(0);
      expect(animationLength(move)).toBe(MOVES[move].frames);
      expect(animationLength(move, 'forward')).toBe(MOVES[move].frames);
      for (const step of sequenceFor(move, 'forward').concat(ANIMATIONS[move])) {
        expect(POSES[step.pose]).toBeDefined();
        expect(step.frames).toBeGreaterThan(0);
      }
    }
  });

  it('holds the striking pose for exactly the engine\'s active frames', () => {
    for (const move of moves) {
      const def = MOVES[move];
      if (!def.strike) continue;
      const timing = ATTACK_TIMING[move];
      expect(timing, move).toBeDefined();
      for (let f = 0; f < def.frames; f++) {
        const active = f >= def.activeFrom! && f <= def.activeTo!;
        expect(poseFor(move, f).pose === timing!.strike.pose, `${move} frame ${f}`).toBe(active);
      }
    }
  });

  it('shows the landing pose once an airborne move is back on the floor', () => {
    expect(poseFor('flying_kick', MOVES.flying_kick.activeFrom!, { airY: 20 }).pose).toBe('flying_kick');
    expect(poseFor('flying_kick', MOVES.flying_kick.activeFrom!, { airY: 0 }).pose).toBe('land');
    expect(poseFor('jump', 0, { airY: 0 }).pose).toBe('jump_prep');
  });

  it('knocks fighters forwards after a low blow and backwards otherwise', () => {
    expect(fallStyleFor('low')).toBe('forward');
    expect(fallStyleFor('high')).toBe('backward');
    expect(fallStyleFor('mid')).toBe('backward');
    expect(poseFor('lying', 0, { fall: 'forward' }).pose).toBe('fallen_front');
    expect(poseFor('lying', 0, { fall: 'backward' }).pose).toBe('fallen_back');
  });
});
