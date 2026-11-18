import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  MOVES,
  NEUTRAL_INPUT,
  FRAME_RATE,
  START_X_P1,
  START_X_P2,
  type FighterInput,
  type GameEvent,
  type GameState,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];

function scoreHalfPoint(): GameState {
  const state = createInitialState({ seed: 1, twoPlayer: true });
  while (state.phase === 'intro') updateGame(state, IDLE);
  state.fighters[0].x = 150;
  state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
  let guard = 0;
  while (state.phase === 'fighting' && guard++ < 60) updateGame(state, [{ dir: { x: 1, y: 0 }, fire: true }, NEUTRAL_INPUT]);
  expect(state.phase).toBe('point');
  expect(state.fighters[0].points).toBeLessThan(2);
  return state;
}

describe('reset between points', () => {
  it('fighting resumes within 2 s of the hit (about 1.7 s), on the marks, with no bow', () => {
    const state = scoreHalfPoint();
    const events: GameEvent[] = [];
    let frames = 0;
    let bowed = false;
    while (state.phase === 'point' && frames < 400) {
      updateGame(state, IDLE);
      events.push(...state.events);
      if (state.fighters.some((f) => f.move === 'bow')) bowed = true;
      frames++;
    }
    expect(state.phase).toBe('fighting');
    expect(frames).toBeLessThanOrEqual(2 * FRAME_RATE); // was ~3.4 s; leaves room for a hit-stop
    expect(bowed).toBe(false);
    expect(state.fighters[0].x).toBe(START_X_P1);
    expect(state.fighters[1].x).toBe(START_X_P2);
    expect(state.fighters[0].facing).toBe(1);
    expect(state.fighters[1].facing).toBe(-1);
    // The knockdown still plays in full: fall, thud on the floor, get up
    expect(events.some((e) => e.type === 'thud')).toBe(true);
  });

  it('walks back rather than snapping to the marks', () => {
    const state = scoreHalfPoint();
    let guard = 0;
    while (state.phase === 'point' && !state.fighters.some((f) => f.move === 'walk_forward' || f.move === 'walk_back') && guard++ < 400) {
      updateGame(state, IDLE);
    }
    const p2 = state.fighters[1];
    const startDistance = Math.abs(p2.x - START_X_P2);
    expect(startDistance).toBeGreaterThan(10);
    updateGame(state, IDLE);
    const moved = startDistance - Math.abs(p2.x - START_X_P2);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(startDistance);
  });

  it('a new bout still opens with the bow', () => {
    const state = createInitialState({ seed: 1, twoPlayer: true });
    expect(state.phase).toBe('intro');
    expect(state.fighters[0].move).toBe('bow');
  });
});
