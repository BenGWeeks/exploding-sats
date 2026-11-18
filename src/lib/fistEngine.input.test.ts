import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  NEUTRAL_INPUT,
  INPUT_SETTLE_FRAMES,
  type FighterInput,
  type GameState,
  type MoveId,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];
const FIRE: FighterInput = { dir: { x: 0, y: 0 }, fire: true };
const UP: FighterInput = { dir: { x: 0, y: -1 }, fire: false };

function fightingState(): GameState {
  const state = createInitialState({ seed: 1, twoPlayer: true });
  while (state.phase === 'intro') updateGame(state, IDLE);
  state.fighters[0].x = 80; // well apart, so nothing connects
  state.fighters[1].x = 240;
  return state;
}

/** Feed player 1 a sequence of inputs, one per frame; returns the moves player 1 started */
function play(state: GameState, sequence: FighterInput[]): MoveId[] {
  const started: MoveId[] = [];
  for (const input of sequence) {
    const before = state.fighters[0].move;
    const beforeFrame = state.fighters[0].frame;
    updateGame(state, [input, NEUTRAL_INPUT]);
    const f = state.fighters[0];
    if (f.move !== before || (f.frame <= 1 && beforeFrame > 1)) started.push(f.move);
  }
  return started;
}

const repeat = (input: FighterInput, n: number) => Array.from({ length: n }, () => input);

describe('input settle window', () => {
  it('fire pressed a frame or two before the direction gives the kick, not an about-face', () => {
    for (let lead = 1; lead < INPUT_SETTLE_FRAMES; lead++) {
      const state = fightingState();
      const started = play(state, [...repeat(FIRE, lead), ...repeat({ dir: { x: 1, y: 0 }, fire: true }, 3)]);
      expect(started).toEqual(['mid_kick']);
      expect(state.fighters[0].facing).toBe(1);
    }
  });

  it('up pressed a frame before forward gives the high punch, not a jump', () => {
    const state = fightingState();
    const started = play(state, [UP, ...repeat({ dir: { x: 1, y: -1 }, fire: false }, 3)]);
    expect(started).toEqual(['high_punch']);
    expect(state.fighters[0].airY).toBe(0);
  });

  it('up pressed a frame before back gives the forward somersault', () => {
    const state = fightingState();
    const started = play(state, [UP, ...repeat({ dir: { x: -1, y: -1 }, fire: false }, INPUT_SETTLE_FRAMES)]);
    expect(started).toEqual(['somersault_forward']);
  });

  it('up held alone jumps once the window has passed', () => {
    const state = fightingState();
    play(state, repeat(UP, INPUT_SETTLE_FRAMES - 1));
    expect(state.fighters[0].move).not.toBe('jump');
    play(state, [UP]);
    expect(state.fighters[0].move).toBe('jump');
  });

  it('holding fire alone turns once, not forever', () => {
    const state = fightingState();
    const started = play(state, repeat(FIRE, 120));
    expect(started.filter((m) => m === 'turn')).toHaveLength(1);
    expect(state.fighters[0].facing).toBe(-1);
    expect(state.fighters[0].move).toBe('stand');
  });

  it('releasing fire and pressing it again turns again', () => {
    const state = fightingState();
    play(state, [...repeat(FIRE, 30), NEUTRAL_INPUT, ...repeat(FIRE, 30)]);
    expect(state.fighters[0].facing).toBe(1);
  });
});
