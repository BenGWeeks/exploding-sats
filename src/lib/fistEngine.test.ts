import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  moveForInput,
  aiProfile,
  gradeName,
  MOVES,
  NEUTRAL_INPUT,
  BOUT_SECONDS,
  POINTS_TO_WIN,
  START_X_P1,
  START_X_P2,
  type FighterInput,
  type GameState,
} from './fistEngine';

const IDLE: [FighterInput, FighterInput] = [NEUTRAL_INPUT, NEUTRAL_INPUT];

function step(state: GameState, inputs: [FighterInput, FighterInput], frames: number) {
  for (let i = 0; i < frames; i++) updateGame(state, inputs);
  return state;
}

function skipIntro(state: GameState) {
  while (state.phase === 'intro') updateGame(state, IDLE);
  return state;
}

describe('control chart', () => {
  it('maps the original joystick moves (no fire)', () => {
    expect(moveForInput(0, -1, false, false)).toBe('jump');
    expect(moveForInput(0, 1, false, false)).toBe('crouch');
    expect(moveForInput(1, 0, false, false)).toBe('walk_forward');
    expect(moveForInput(-1, 0, false, false)).toBe('walk_back');
    expect(moveForInput(1, -1, false, false)).toBe('high_punch');
    expect(moveForInput(1, 1, false, false)).toBe('jab_punch');
    expect(moveForInput(1, 1, false, true)).toBe('low_punch');
    expect(moveForInput(-1, -1, false, false)).toBe('somersault_forward');
    expect(moveForInput(-1, 1, false, false)).toBe('somersault_back');
    expect(moveForInput(0, 0, false, false)).toBeNull();
  });

  it('maps the original joystick kicks (fire held)', () => {
    expect(moveForInput(0, -1, true, false)).toBe('flying_kick');
    expect(moveForInput(1, -1, true, false)).toBe('high_kick');
    expect(moveForInput(1, 0, true, false)).toBe('mid_kick');
    expect(moveForInput(1, 1, true, false)).toBe('jab_kick');
    expect(moveForInput(0, 1, true, false)).toBe('sweep');
    expect(moveForInput(-1, 1, true, false)).toBe('back_sweep');
    expect(moveForInput(-1, 0, true, false)).toBe('roundhouse');
    expect(moveForInput(-1, -1, true, false)).toBe('high_back_kick');
    expect(moveForInput(0, 0, true, false)).toBe('turn');
  });

  it('every attack has a strike window inside its duration', () => {
    for (const def of Object.values(MOVES)) {
      if (!def.strike) continue;
      expect(def.activeFrom).toBeLessThan(def.activeTo!);
      expect(def.activeTo).toBeLessThan(def.frames);
      expect(def.value).toBeGreaterThan(0);
    }
  });
});

describe('bout flow', () => {
  it('starts with both fighters bowing on their marks and a 30 second clock', () => {
    const state = createInitialState({ seed: 1 });
    expect(state.phase).toBe('intro');
    expect(state.fighters[0].move).toBe('bow');
    expect(state.fighters[1].move).toBe('bow');
    expect(state.fighters[0].x).toBe(START_X_P1);
    expect(state.fighters[1].x).toBe(START_X_P2);
    expect(state.timeLeft).toBe(BOUT_SECONDS);
    expect(gradeName(state.grade)).toBe('NOVICE');
  });

  it('walks forward when the stick is pushed forward', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    const before = state.fighters[0].x;
    step(state, [{ dir: { x: 1, y: 0 }, fire: false }, NEUTRAL_INPUT], 20);
    expect(state.fighters[0].move).toBe('walk_forward');
    expect(state.fighters[0].x).toBeGreaterThan(before);
  });

  it('lands a mid kick, knocks the opponent down and awards a point', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    // Stand toe to toe
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
    step(state, [{ dir: { x: 1, y: 0 }, fire: true }, NEUTRAL_INPUT], 1);
    expect(state.fighters[0].move).toBe('mid_kick');
    step(state, [{ dir: { x: 1, y: 0 }, fire: true }, NEUTRAL_INPUT], MOVES.mid_kick.activeFrom! + 1);
    expect(state.fighters[0].points).toBeGreaterThanOrEqual(0.5);
    expect(state.fighters[1].move).toBe('fall');
    expect(state.phase).toBe('point');
    expect(state.fighters[0].score).toBeGreaterThan(0);
  });

  it('a clean hit on a standing opponent is a full point', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
    step(state, [{ dir: { x: 1, y: 0 }, fire: true }, NEUTRAL_INPUT], MOVES.mid_kick.activeFrom! + 2);
    expect(state.fighters[0].points).toBe(1);
    expect(state.fighters[0].score).toBe(MOVES.mid_kick.value);
  });

  it('a sweep is jumped over', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.sweep.strike!.x;
    // P2 jumps first, P1 sweeps
    step(state, [NEUTRAL_INPUT, { dir: { x: 0, y: -1 }, fire: false }], 6);
    expect(state.fighters[1].airY).toBeGreaterThan(0);
    step(state, [{ dir: { x: 0, y: 1 }, fire: true }, NEUTRAL_INPUT], MOVES.sweep.activeFrom! + 3);
    expect(state.fighters[0].points).toBe(0);
  });

  it('a high kick passes over a crouching opponent', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.high_kick.strike!.x;
    const crouch: FighterInput = { dir: { x: 0, y: 1 }, fire: false };
    step(state, [NEUTRAL_INPUT, crouch], 2);
    expect(state.fighters[1].move).toBe('crouch');
    step(state, [{ dir: { x: 1, y: -1 }, fire: true }, crouch], MOVES.high_kick.activeTo! + 1);
    expect(state.fighters[0].points).toBe(0);
  });

  it('holding back blocks a kick but not a sweep', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
    // P2 faces left, so "back" for P2 is screen-right (x: 1)
    const holdBack: FighterInput = { dir: { x: 1, y: 0 }, fire: false };
    step(state, [{ dir: { x: 1, y: 0 }, fire: true }, holdBack], MOVES.mid_kick.activeFrom! + 2);
    expect(state.fighters[0].points).toBe(0);
    expect(state.fighters[1].move).toBe('block_high');

    const sweepState = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    sweepState.fighters[0].x = 150;
    sweepState.fighters[1].x = 150 + MOVES.sweep.strike!.x;
    step(sweepState, [{ dir: { x: 0, y: 1 }, fire: true }, holdBack], MOVES.sweep.activeFrom! + 2);
    expect(sweepState.fighters[0].points).toBeGreaterThan(0);
  });

  it('after a knockdown both fighters return to their marks and bow', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    state.fighters[0].x = 150;
    state.fighters[1].x = 150 + MOVES.jab_punch.strike!.x + 4; // slightly off centre: half point
    step(state, [{ dir: { x: 1, y: 1 }, fire: false }, NEUTRAL_INPUT], MOVES.jab_punch.activeTo! + 1);
    expect(state.phase).toBe('point');
    let guard = 0;
    while (state.phase === 'point' && guard++ < 400) updateGame(state, IDLE);
    expect(state.phase).toBe('intro');
    expect(state.fighters[0].x).toBe(START_X_P1);
    expect(state.fighters[1].x).toBe(START_X_P2);
    expect(state.fighters[0].move).toBe('bow');
  });

  it('two full points win the bout and the time bonus pays 100 a second', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    for (let hit = 0; hit < POINTS_TO_WIN; hit++) {
      state.fighters[0].x = 150;
      state.fighters[1].x = 150 + MOVES.mid_kick.strike!.x;
      state.fighters[0].move = 'stand'; state.fighters[1].move = 'stand';
      state.fighters[0].frame = 0; state.fighters[1].frame = 0;
      state.phase = 'fighting';
      step(state, [{ dir: { x: 1, y: 0 }, fire: true }, NEUTRAL_INPUT], MOVES.mid_kick.activeFrom! + 2);
      step(state, IDLE, 130);
    }
    expect(state.phase).toBe('bout_over');
    expect(state.boutWinner).toBe(0);
    const scoreAtWin = state.fighters[0].score;
    const secondsLeft = state.bonusSecondsLeft;
    step(state, IDLE, 170);
    expect(state.fighters[0].score).toBe(scoreAtWin + secondsLeft * 100);
  });

  it('when the clock runs out the judge awards the bout on points', () => {
    const state = skipIntro(createInitialState({ seed: 1, twoPlayer: true }));
    state.fighters[1].points = 0.5;
    state.timeLeft = 0.02;
    step(state, IDLE, 3);
    expect(state.phase).toBe('bout_over');
    expect(state.boutWinner).toBe(1);
  });

  it('losing a bout in one-player mode ends the game', () => {
    const state = skipIntro(createInitialState({ seed: 1 }));
    state.fighters[1].points = 1;
    state.timeLeft = 0.02;
    step(state, IDLE, 3);
    expect(state.boutWinner).toBe(1);
    step(state, IDLE, 400);
    expect(state.gameOver).toBe(true);
    expect(state.phase).toBe('game_over');
  });

  it('winning two bouts promotes to 1st Dan and changes the backdrop', () => {
    const state = skipIntro(createInitialState({ seed: 1 }));
    for (let bout = 0; bout < 2; bout++) {
      state.phase = 'fighting';
      state.fighters[0].points = 1;
      state.fighters[1].points = 0;
      state.timeLeft = 0.02;
      step(state, IDLE, 3);
      expect(state.boutWinner).toBe(0);
      step(state, IDLE, 400);
      skipIntro(state);
    }
    expect(state.grade).toBe(1);
    expect(gradeName(state.grade)).toBe('1ST DAN');
    expect(state.scene).toBe(1);
    expect(state.bout).toBe(1);
  });

  it('the bull charges after the fourth backdrop is cleared', () => {
    const state = skipIntro(createInitialState({ seed: 1 }));
    state.scene = 3;
    state.grade = 3;
    state.bout = 2;
    state.phase = 'fighting';
    state.fighters[0].points = 2;
    state.timeLeft = 0.02;
    step(state, IDLE, 3);
    const phase = () => state.phase as GameState['phase'];
    let guard = 0;
    while (phase() === 'bout_over' && guard++ < 600) updateGame(state, IDLE);
    expect(state.phase).toBe('bull');
    expect(state.bull).not.toBeNull();
    expect(state.grade).toBe(4);
    // The bull always resolves and the match carries on
    guard = 0;
    while ((phase() === 'bull' || phase() === 'bull_over') && guard++ < 2000) updateGame(state, IDLE);
    expect(state.phase).toBe('intro');
    expect(state.bull).toBeNull();
  });

  it('the CPU gets sharper with every Dan', () => {
    const novice = aiProfile(0);
    const master = aiProfile(10);
    expect(master.reaction).toBeLessThan(novice.reaction);
    expect(master.aggression).toBeGreaterThan(novice.aggression);
    expect(master.evade).toBeGreaterThan(novice.evade);
  });

  it('runs a full CPU vs CPU demo without leaving the arena', () => {
    const state = createInitialState({ seed: 42, demo: true });
    step(state, IDLE, 60 * 90);
    for (const f of state.fighters) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(320);
      expect(Number.isFinite(f.x)).toBe(true);
    }
    expect(state.gameOver).toBe(false);
  });
});
