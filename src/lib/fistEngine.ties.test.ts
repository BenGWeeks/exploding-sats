import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  MOVES,
  NEUTRAL_INPUT,
  BOUT_SECONDS,
  type FighterInput,
  type GameEvent,
  type GameState,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];

function fightingState(): GameState {
  const state = createInitialState({ seed: 1, twoPlayer: true });
  while (state.phase === 'intro') updateGame(state, IDLE);
  return state;
}

function run(state: GameState, inputs: [FighterInput, FighterInput], frames: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    updateGame(state, inputs);
    events.push(...state.events);
  }
  return events;
}

/** Jab punch toward the other fighter: down + toward them on screen */
const jabToward = (facing: 1 | -1): FighterInput => ({ dir: { x: facing, y: 1 }, fire: false });

describe('same-frame trades', () => {
  function trade(leftIndex: 0 | 1) {
    const state = fightingState();
    const left = state.fighters[leftIndex];
    const right = state.fighters[1 - leftIndex];
    left.x = 147; left.facing = 1;
    right.x = 175; right.facing = -1;
    const inputs: [FighterInput, FighterInput] = leftIndex === 0
      ? [jabToward(1), jabToward(-1)]
      : [jabToward(-1), jabToward(1)];
    const events = run(state, inputs, MOVES.jab_punch.activeTo! + 1);
    return { state, events };
  }

  it('awards neither fighter a point and knocks both back to neutral', () => {
    const { state, events } = trade(0);
    expect(events.some((e) => e.type === 'clash')).toBe(true);
    expect(events.some((e) => e.type === 'point')).toBe(false);
    expect(state.phase).toBe('fighting');
    expect(state.fighters[0].points).toBe(0);
    expect(state.fighters[1].points).toBe(0);
    expect(state.fighters[0].score).toBe(0);
    expect(state.fighters[1].score).toBe(0);
    expect(state.fighters[0].attacks).toBe(1);
    expect(state.fighters[1].attacks).toBe(1);
  });

  it('is symmetric when the players swap sides', () => {
    const a = trade(0);
    const b = trade(1);
    expect(b.events.some((e) => e.type === 'clash')).toBe(true);
    expect(b.state.fighters.map((f) => f.points)).toEqual([0, 0]);
    // Mirror images: the fighter on the left ends where the other left fighter ended
    expect(b.state.fighters[1].x).toBeCloseTo(a.state.fighters[0].x);
    expect(b.state.fighters[0].x).toBeCloseTo(a.state.fighters[1].x);
  });

  it('a strike a frame earlier still wins the exchange', () => {
    const state = fightingState();
    state.fighters[0].x = 147;
    state.fighters[1].x = 175;
    run(state, [NEUTRAL_INPUT, jabToward(-1)], 1);
    run(state, [jabToward(1), jabToward(-1)], MOVES.jab_punch.activeTo! + 1);
    expect(state.fighters[1].points).toBeGreaterThan(0);
    expect(state.fighters[0].points).toBe(0);
  });
});

describe('time-out decisions', () => {
  it('a level bout with nothing landed is a draw and is fought again', () => {
    const state = fightingState();
    state.timeLeft = 0.02;
    const events = run(state, IDLE, 3);
    expect(events.some((e) => e.type === 'draw')).toBe(true);
    expect(state.boutWinner).toBeNull();
    expect(state.phase).toBe('intro');
    expect(state.bout).toBe(1);
    expect(state.timeLeft).toBe(BOUT_SECONDS);
  });

  it('whiffed attacks do not count towards the decision', () => {
    const state = fightingState();
    state.fighters[0].x = 60;
    state.fighters[1].x = 260;
    run(state, [{ dir: { x: 1, y: 0 }, fire: true }, NEUTRAL_INPUT], MOVES.mid_kick.frames + 2);
    expect(state.fighters[0].attacks).toBe(0);
    state.timeLeft = 0.02;
    const events = run(state, IDLE, 3);
    expect(events.some((e) => e.type === 'draw')).toBe(true);
    expect(state.boutWinner).toBeNull();
  });

  it('a blocked attack counts: the fighter who made contact wins a pointless bout', () => {
    const state = fightingState();
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
    const holdBack: FighterInput = { dir: { x: 1, y: 0 }, fire: false };
    run(state, [{ dir: { x: 1, y: 0 }, fire: true }, holdBack], MOVES.mid_kick.activeFrom! + 2);
    expect(state.fighters[1].move).toBe('block_high');
    expect(state.fighters[0].attacks).toBe(1);
    state.timeLeft = 0.02;
    run(state, IDLE, 3);
    expect(state.phase).toBe('bout_over');
    expect(state.boutWinner).toBe(0);
  });

  it('player 2 wins a level-points time-out on landed attacks too', () => {
    const state = fightingState();
    state.fighters[1].attacks = 2;
    state.fighters[0].attacks = 1;
    state.timeLeft = 0.02;
    run(state, IDLE, 3);
    expect(state.boutWinner).toBe(1);
  });
});
