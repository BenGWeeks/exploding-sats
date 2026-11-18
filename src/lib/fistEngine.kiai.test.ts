import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  MOVES,
  NEUTRAL_INPUT,
  type FighterInput,
  type GameState,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];

function fightingState(): GameState {
  const state = createInitialState({ seed: 1, twoPlayer: true });
  while (state.phase === 'intro') updateGame(state, IDLE);
  state.fighters[0].x = 60; // nowhere near the opponent
  state.fighters[1].x = 260;
  return state;
}

describe('kiai shout', () => {
  it('comes on the first active frame of the move, once', () => {
    const state = fightingState();
    const kick: FighterInput = { dir: { x: 1, y: 0 }, fire: true };
    const shoutFrames: number[] = [];
    for (let i = 0; i < MOVES.mid_kick.frames; i++) {
      updateGame(state, i === 0 ? [kick, NEUTRAL_INPUT] : IDLE);
      if (state.events.some((e) => e.type === 'kiai' && e.who === 0)) shoutFrames.push(state.fighters[0].frame);
    }
    expect(shoutFrames).toEqual([MOVES.mid_kick.activeFrom]);
  });

  it('a roundhouse released early into an about-face does not shout', () => {
    const state = fightingState();
    const roundhouse: FighterInput = { dir: { x: -1, y: 0 }, fire: true };
    let shouts = 0;
    for (let i = 0; i < 40; i++) {
      updateGame(state, i < 3 ? [roundhouse, NEUTRAL_INPUT] : IDLE);
      shouts += state.events.filter((e) => e.type === 'kiai').length;
    }
    expect(state.fighters[0].facing).toBe(-1); // it did turn
    expect(shouts).toBe(0);
  });
});
