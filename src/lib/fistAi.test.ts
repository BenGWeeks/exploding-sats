import { describe, it, expect } from 'vitest';
import {
  createInitialState, updateGame, moveForInput, MOVES, NEUTRAL_INPUT, FIGHTER_HALF_WIDTH,
  type FighterInput, type GameState, type MoveId,
} from './fistEngine';
import { aiProfile, lookAhead, moveReach, type Body } from './fistAi';

type Rel = { fx: -1 | 0 | 1; y: -1 | 0 | 1; fire: boolean };
type Policy = (s: GameState) => Rel;

const rel = (fx: -1 | 0 | 1, y: -1 | 0 | 1, fire: boolean): Rel => ({ fx, y, fire });
const dist = (s: GameState) => (s.fighters[1].x - s.fighters[0].x) * s.fighters[0].facing;
const turning = (r: Rel): Policy => (s) => (dist(s) < -6 ? rel(0, 0, true) : r);

function toInput(s: GameState, r: Rel): FighterInput {
  return { dir: { x: (r.fx * s.fighters[0].facing) as -1 | 0 | 1, y: r.y }, fire: r.fire };
}

/** One bout of a scripted player (fighter 0) against the CPU; true if the player wins */
function playerWins(grade: number, policy: Policy, seed: number): boolean {
  const s = createInitialState({ seed });
  s.grade = grade;
  for (let f = 0; s.phase !== 'bout_over' && f < 60 * 120; f++) updateGame(s, [toInput(s, policy(s)), NEUTRAL_INPUT]);
  return s.boutWinner === 0;
}

function fighting(seed = 1): GameState {
  const s = createInitialState({ seed, twoPlayer: true });
  while (s.phase !== 'fighting') updateGame(s, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
  return s;
}

describe('CPU reach comes from the move table', () => {
  it('derives each attack band from strike point, reach and travel', () => {
    const mid = MOVES.mid_kick.strike!;
    expect(moveReach('mid_kick')).toEqual({ near: mid.x - FIGHTER_HALF_WIDTH - mid.reach, far: mid.x + FIGHTER_HALF_WIDTH + mid.reach });
    expect(moveReach('stand')).toBeNull();
    // Back attacks reach behind
    expect(moveReach('back_sweep')!.far).toBeLessThan(0);
  });

  it('every close-range move can connect at the closest two grounded fighters can stand', () => {
    for (const m of ['jab_punch', 'jab_kick', 'high_punch'] as MoveId[]) {
      const r = moveReach(m)!;
      expect(r.near).toBeLessThanOrEqual(FIGHTER_HALF_WIDTH * 2);
      expect(r.far).toBeGreaterThanOrEqual(FIGHTER_HALF_WIDTH * 2);
    }
  });
});

describe('CPU look-ahead agrees with the engine', () => {
  const attacks = (Object.keys(MOVES) as MoveId[]).filter((m) => MOVES[m].strike && m !== 'low_punch');
  const body = (x: number, facing: 1 | -1): Body => ({ x, airY: 0, vy: 0, facing, move: 'stand', frame: 0, guard: 0, hitLanded: false });

  it.each(attacks)('predicts when (and whether) %s lands', (move) => {
    for (const gap of [30, 40, 50, 60, 70]) {
      const s = fighting();
      s.fighters[0].x = 120;
      s.fighters[1].x = 120 + gap;
      const press = (() => {
        for (const fire of [false, true]) for (const y of [0, 1, -1] as const) for (const x of [1, 0, -1] as const) {
          const input = { dir: { x, y }, fire };
          if (moveForInput(x, y, fire, false) === move) return input;
        }
        throw new Error(move);
      })();
      let engineT = Infinity;
      for (let t = 1; t <= 60 && s.phase === 'fighting'; t++) {
        updateGame(s, [t <= 9 ? press : NEUTRAL_INPUT, NEUTRAL_INPUT]);
        if ((s.phase as GameState['phase']) === 'point') engineT = t;
      }
      const o = lookAhead(1, body(120 + gap, -1), body(120, 1),
        () => ({ want: null, back: false }),
        (_b, t) => ({ want: t === 1 ? move : null, back: false }), 60);
      expect(o.t).toBe(engineT);
    }
  });
});

describe('CPU behaviour', () => {
  it('throws close-range moves when the player is close', () => {
    const thrown = new Set<MoveId>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = createInitialState({ seed });
      s.grade = 10;
      while (s.phase !== 'fighting') updateGame(s, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
      s.fighters[0].x = 150;
      s.fighters[1].x = 150 + FIGHTER_HALF_WIDTH * 2 + 2;
      for (let f = 0; f < 40 && !MOVES[s.fighters[1].move].strike; f++) updateGame(s, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
      thrown.add(s.fighters[1].move);
    }
    const close = [...thrown].filter((m) => ['jab_punch', 'jab_kick', 'high_punch', 'low_punch'].includes(m));
    expect(close.length).toBeGreaterThan(0);
  });

  it('never flies or somersaults through a standing player', () => {
    let travelling = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createInitialState({ seed: seed * 101 });
      s.grade = 10;
      let prev: MoveId = 'bow';
      for (let f = 0; s.phase !== 'bout_over' && f < 60 * 60; f++) {
        updateGame(s, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
        const cpu = s.fighters[1];
        const wasTravelling = prev === 'flying_kick' || prev === 'somersault_forward';
        if (wasTravelling && cpu.move !== prev && s.phase === 'fighting') {
          travelling++;
          // still facing the player, who is still in front
          expect((s.fighters[0].x - cpu.x) * cpu.facing).toBeGreaterThan(0);
        }
        prev = cpu.move;
      }
    }
    expect(travelling).toBeGreaterThan(0);
  });

  it('runs CPU against CPU without about-face loops or bouts with no attacks', () => {
    for (const grade of [0, 10]) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = createInitialState({ seed });
        s.grade = grade;
        s.fighters[0].isCpu = true;
        let turns = 0;
        let prev: MoveId = 'bow';
        for (let f = 0; s.phase !== 'bout_over' && f < 60 * 60; f++) {
          updateGame(s, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
          if (s.fighters[1].move === 'turn' && prev !== 'turn') turns++;
          prev = s.fighters[1].move;
        }
        expect(s.phase).toBe('bout_over');
        expect(s.fighters[0].attacks + s.fighters[1].attacks).toBeGreaterThan(0);
        expect(turns).toBeLessThan(10);
      }
    }
  });

  it('keeps a reaction delay and makes mistakes even at 10th Dan', () => {
    const master = aiProfile(10);
    expect(master.reaction).toBeGreaterThanOrEqual(6);
    expect(master.evade).toBeLessThan(1);
    expect(master.noise).toBeGreaterThan(0);
  });
});

describe('no single held input beats a 10th Dan', () => {
  // Every joystick position (facing-relative), with and without turning to face the CPU
  const held: Record<string, Rel> = {
    jump: rel(0, -1, false), high_punch: rel(1, -1, false), somersault_forward: rel(-1, -1, false),
    somersault_back: rel(-1, 1, false), jab_punch: rel(1, 1, false), crouch: rel(0, 1, false),
    walk_forward: rel(1, 0, false), back_block: rel(-1, 0, false), flying_kick: rel(0, -1, true),
    high_kick: rel(1, -1, true), high_back_kick: rel(-1, -1, true), sweep: rel(0, 1, true),
    jab_kick: rel(1, 1, true), back_sweep: rel(-1, 1, true), mid_kick: rel(1, 0, true),
    roundhouse: rel(-1, 0, true), turn: rel(0, 0, true),
  };
  const policies: Record<string, Policy> = {
    low_punch_loop: (s) => (s.fighters[0].move === 'crouch' ? rel(1, 1, false) : rel(0, 1, false)),
    lead_then_turtle: (s) => (s.fighters[0].points > s.fighters[1].points ? rel(-1, 0, false) : turning(rel(0, 1, true))(s)),
  };
  for (const [name, r] of Object.entries(held)) policies[name] = turning(r);

  const BOUTS = 10;
  const MAX_WINS = 3;
  it.each(Object.keys(policies))('holding %s', (name) => {
    let wins = 0;
    for (let i = 0; i < BOUTS; i++) if (playerWins(10, policies[name], 1000 + i * 7919)) wins++;
    expect(wins).toBeLessThanOrEqual(MAX_WINS);
  });
});
