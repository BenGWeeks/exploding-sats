import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  MOVES,
  NEUTRAL_INPUT,
  JUDGE_POINT_FRAMES,
  type FighterInput,
  type GameState,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];

function fightingState(): GameState {
  const state = createInitialState({ seed: 1, twoPlayer: true });
  while (state.phase === 'intro') updateGame(state, IDLE);
  return state;
}

function strikeUntilPoint(state: GameState, inputs: [FighterInput, FighterInput]) {
  let guard = 0;
  while (state.phase === 'fighting' && guard++ < 60) updateGame(state, inputs);
  expect(state.phase).toBe('point');
}

describe('referee signal', () => {
  it('signals a full point for the scorer on a clean hit and holds it long enough to read', () => {
    const state = fightingState();
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
    strikeUntilPoint(state, [{ dir: { x: 1, y: 0 }, fire: true }, NEUTRAL_INPUT]);
    expect(state.fighters[0].points).toBe(1);
    expect(state.judgeCall).toBe('full');
    expect(state.judgeSignal).toBe(JUDGE_POINT_FRAMES);
    expect(state.lastPointWinner).toBe(0);
    expect(JUDGE_POINT_FRAMES).toBeGreaterThanOrEqual(45);
    for (let i = 0; i < JUDGE_POINT_FRAMES - 1; i++) updateGame(state, IDLE);
    expect(state.judgeCall).toBe('full');
    updateGame(state, IDLE);
    expect(state.judgeSignal).toBe(0);
    expect(state.judgeCall).toBeNull();
  });

  it('signals a half point for a poor hit, for player 2 as well', () => {
    const state = fightingState();
    state.fighters[1].x = 200;
    state.fighters[0].x = 200 - MOVES.mid_kick.strike!.x - 18; // at the edge of reach: half point
    strikeUntilPoint(state, [NEUTRAL_INPUT, { dir: { x: -1, y: 0 }, fire: true }]);
    expect(state.fighters[1].points).toBe(0.5);
    expect(state.judgeCall).toBe('half');
    expect(state.judgeSignal).toBeGreaterThan(0);
    expect(state.lastPointWinner).toBe(1);
  });

  it('still signals the bout winner at the end of the bout', () => {
    const state = fightingState();
    state.fighters[1].points = 1;
    state.timeLeft = 0.02;
    for (let i = 0; i < 3; i++) updateGame(state, IDLE);
    expect(state.phase).toBe('bout_over');
    expect(state.judgeCall).toBe('bout');
    expect(state.judgeSignal).toBeGreaterThan(0);
  });
});
