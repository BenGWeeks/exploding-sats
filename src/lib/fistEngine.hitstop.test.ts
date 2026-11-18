import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  MOVES,
  NEUTRAL_INPUT,
  HIT_STOP_FRAMES,
  type FighterInput,
  type GameState,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];
const MID_KICK: FighterInput = { dir: { x: 1, y: 0 }, fire: true };

function landMidKick(): GameState {
  const state = createInitialState({ seed: 1, twoPlayer: true });
  while (state.phase === 'intro') updateGame(state, IDLE);
  state.fighters[0].x = 150;
  state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
  let guard = 0;
  while (state.phase === 'fighting' && guard++ < 60) updateGame(state, [MID_KICK, NEUTRAL_INPUT]);
  expect(state.phase).toBe('point');
  return state;
}

const pose = (state: GameState) => state.fighters.map((f) => ({ move: f.move, frame: f.frame, x: f.x, airY: f.airY }));

describe('hit-stop', () => {
  it('is between 8 and 12 frames', () => {
    expect(HIT_STOP_FRAMES).toBeGreaterThanOrEqual(8);
    expect(HIT_STOP_FRAMES).toBeLessThanOrEqual(12);
  });

  it('freezes both fighters for HIT_STOP_FRAMES after a scoring hit, then plays the fall', () => {
    const state = landMidKick();
    const atImpact = pose(state);
    expect(atImpact[0].move).toBe('mid_kick');
    expect(atImpact[1].move).toBe('fall');
    for (let i = 0; i < HIT_STOP_FRAMES; i++) {
      updateGame(state, IDLE);
      expect(pose(state)).toEqual(atImpact);
    }
    updateGame(state, IDLE);
    expect(state.fighters[1].frame).toBe(atImpact[1].frame + 1);
    expect(state.fighters[0].frame).toBe(atImpact[0].frame + 1);
  });

  it('the bout still resets after the knockdown', () => {
    const state = landMidKick();
    let guard = 0;
    while (state.phase === 'point' && guard++ < 400) updateGame(state, IDLE);
    expect(state.phase).toBe('intro');
  });
});
