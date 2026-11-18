import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  canBeHit,
  MOVES,
  NEUTRAL_INPUT,
  ARENA_LEFT,
  ARENA_RIGHT,
  FIGHTER_HALF_WIDTH,
  SOMERSAULT_RECOVERY_FRAMES,
  type FighterInput,
  type GameState,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];

function fightingState(): GameState {
  const state = createInitialState({ seed: 1, twoPlayer: true });
  while (state.phase === 'intro') updateGame(state, IDLE);
  return state;
}

/** Player 1 back-flip input (down-back while facing right), repeated */
const SOMERSAULT_BACK: FighterInput = { dir: { x: -1, y: 1 }, fire: false };

describe('somersault', () => {
  it('is untouchable in the air but can be hit on the landing', () => {
    const state = fightingState();
    const f = state.fighters[0];
    f.x = 200;
    let sawAir = false;
    let sawLanding = false;
    let guard = 0;
    updateGame(state, [SOMERSAULT_BACK, NEUTRAL_INPUT]);
    while (f.move === 'somersault_back' && guard++ < 100) {
      if (f.airY > 0) { sawAir = true; expect(canBeHit(f)).toBe(false); }
      else { sawLanding = true; expect(canBeHit(f)).toBe(true); }
      updateGame(state, IDLE);
    }
    expect(sawAir).toBe(true);
    expect(sawLanding).toBe(true);
  });

  it('a strike that meets the landing scores', () => {
    const state = fightingState();
    const [p1, p2] = state.fighters;
    p1.x = 150;
    p2.x = 150 + MOVES.mid_kick.strike!.x;
    p2.move = 'somersault_back'; p2.frame = MOVES.somersault_back.frames - 6; p2.airY = 0; p2.vy = 0;
    p1.move = 'mid_kick'; p1.frame = MOVES.mid_kick.activeFrom! - 1;
    updateGame(state, IDLE);
    expect(state.phase).toBe('point');
    expect(p1.points).toBeGreaterThan(0);
  });

  it('chained somersaults leave a vulnerable recovery after every landing', () => {
    const state = fightingState();
    const f = state.fighters[0];
    f.x = 200;
    let hittable = 0;
    const frames = 400;
    for (let i = 0; i < frames; i++) {
      // keep flipping back and forth in the middle of the arena
      const back = f.x > 100;
      updateGame(state, [back ? SOMERSAULT_BACK : { dir: { x: -1, y: -1 }, fire: false }, NEUTRAL_INPUT]);
      if (canBeHit(f)) hittable++;
    }
    // Used to be 1 frame in 41; now the landing and recovery are open
    expect(hittable / frames).toBeGreaterThan(0.25);
  });

  it('ignores input and drops the guard during the landing recovery', () => {
    const state = fightingState();
    const f = state.fighters[0];
    f.x = 200;
    updateGame(state, [SOMERSAULT_BACK, NEUTRAL_INPUT]);
    let guard = 0;
    while (f.move === 'somersault_back' && guard++ < 100) updateGame(state, IDLE);
    const holdBack: FighterInput = { dir: { x: -1, y: 0 }, fire: false };
    for (let i = 0; i < SOMERSAULT_RECOVERY_FRAMES - 1; i++) {
      updateGame(state, [holdBack, NEUTRAL_INPUT]);
      expect(f.move).toBe('stand');
      expect(f.guard).toBe(0);
    }
    updateGame(state, [holdBack, NEUTRAL_INPUT]);
    updateGame(state, [holdBack, NEUTRAL_INPUT]);
    expect(f.move).toBe('walk_back');
  });
});

describe('arena bounds', () => {
  for (const wall of ['left', 'right'] as const) {
    it(`a fighter cornered against the ${wall} wall is never pushed outside the arena`, () => {
      const state = fightingState();
      const [p1, p2] = state.fighters;
      // the cornered fighter backs into the wall; the other walks into them
      const cornered = wall === 'left' ? p1 : p2;
      const presser = wall === 'left' ? p2 : p1;
      cornered.x = wall === 'left' ? ARENA_LEFT + 2 : ARENA_RIGHT - 2;
      presser.x = wall === 'left' ? ARENA_LEFT + 20 : ARENA_RIGHT - 20;
      const towardWall: FighterInput = { dir: { x: wall === 'left' ? -1 : 1, y: 0 }, fire: false };
      for (let i = 0; i < 90; i++) {
        updateGame(state, [towardWall, towardWall]);
        for (const f of state.fighters) {
          expect(f.x).toBeGreaterThanOrEqual(ARENA_LEFT);
          expect(f.x).toBeLessThanOrEqual(ARENA_RIGHT);
        }
        expect(Math.abs(p1.x - p2.x)).toBeGreaterThanOrEqual(FIGHTER_HALF_WIDTH * 2 - 1e-9);
      }
    });
  }
});

describe('airborne knockdown', () => {
  it('a fighter hit in the air falls from that height instead of snapping to the floor', () => {
    const state = fightingState();
    const [p1, p2] = state.fighters;
    p1.x = 150;
    p2.x = 150 + MOVES.high_kick.strike!.x;
    p2.move = 'jump'; p2.frame = 12; p2.airY = 20; p2.vy = 0;
    p1.move = 'high_kick'; p1.frame = MOVES.high_kick.activeFrom! - 1;
    updateGame(state, IDLE);
    expect(state.phase).toBe('point');
    expect(p2.move).toBe('fall');
    expect(p2.airY).toBeGreaterThan(15);
    let last = p2.airY;
    let guard = 0;
    while (p2.airY > 0 && guard++ < 60) {
      updateGame(state, IDLE);
      expect(p2.airY).toBeLessThanOrEqual(last);
      last = p2.airY;
    }
    expect(p2.airY).toBe(0);
    expect(guard).toBeGreaterThan(3); // took several frames to come down
  });
});
