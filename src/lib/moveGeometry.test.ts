import { describe, it, expect } from 'vitest';
import {
  createInitialState, updateGame, MOVES, NEUTRAL_INPUT, FIGHTER_HALF_WIDTH,
  type FighterInput, type GameState, type MoveId,
} from './fistEngine';

const FLYING_KICK: FighterInput = { dir: { x: 0, y: -1 }, fire: true };
const ROUNDHOUSE: FighterInput = { dir: { x: -1, y: 0 }, fire: true }; // back + fire, facing right
const CROUCH: FighterInput = { dir: { x: 0, y: 1 }, fire: false };

function fighting(): GameState {
  const s = createInitialState({ seed: 1, twoPlayer: true });
  while (s.phase !== 'fighting') updateGame(s, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
  return s;
}

/** Player 1 holds `input` for a whole move against player 2 (holding `defence`) `gap` px away */
function throwAt(gap: number, input: FighterInput, move: MoveId, defence: FighterInput = NEUTRAL_INPUT) {
  const s = fighting();
  s.fighters[0].x = 100;
  s.fighters[1].x = 100 + gap;
  updateGame(s, [NEUTRAL_INPUT, defence]);
  updateGame(s, [NEUTRAL_INPUT, defence]);
  let hitFrame = -1;
  let hitAirY = 0;
  for (let t = 0; t < MOVES[move].frames + 2 && s.phase === 'fighting'; t++) {
    updateGame(s, [input, defence]);
    if ((s.phase as GameState['phase']) === 'point') { hitFrame = s.fighters[0].frame; hitAirY = s.fighters[0].airY; }
  }
  return { scored: s.fighters[0].points > 0, hitFrame, hitAirY };
}

/** The flying kick's height on each engine frame of the move */
function flyingKickArc(): number[] {
  const s = fighting();
  s.fighters[0].x = 60;
  s.fighters[1].x = 290;
  const arc: number[] = [];
  updateGame(s, [FLYING_KICK, NEUTRAL_INPUT]);
  while (s.fighters[0].move === 'flying_kick') {
    arc[s.fighters[0].frame] = s.fighters[0].airY;
    updateGame(s, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
  }
  return arc;
}

describe('flying kick geometry', () => {
  const def = MOVES.flying_kick;

  it('is only active while the fighter is in the air', () => {
    const arc = flyingKickArc();
    for (let f = def.activeFrom!; f <= def.activeTo!; f++) expect(arc[f]).toBeGreaterThan(0);
  });

  it('connects with a standing opponent while still airborne', () => {
    let hits = 0;
    for (let gap = 30; gap <= 110; gap += 4) {
      const r = throwAt(gap, FLYING_KICK, 'flying_kick');
      if (!r.scored) continue;
      hits++;
      expect(r.hitAirY).toBeGreaterThan(0);
    }
    expect(hits).toBeGreaterThan(5);
  });

  it('passes over a crouching opponent', () => {
    for (let gap = 30; gap <= 110; gap += 4) expect(throwAt(gap, FLYING_KICK, 'flying_kick', CROUCH).scored).toBe(false);
  });
});

describe('roundhouse geometry', () => {
  /** Farthest the roundhouse can connect, counting its step-in over the active frames */
  function farReach(move: MoveId) {
    const d = MOVES[move];
    return d.strike!.x + ((d.travel ?? 0) / d.frames) * d.activeTo! + FIGHTER_HALF_WIDTH + d.strike!.reach;
  }

  it('reaches no farther than the other forward leg techniques', () => {
    const legs = Math.max(farReach('mid_kick'), farReach('high_kick'), farReach('jab_kick'));
    expect(farReach('roundhouse')).toBeLessThanOrEqual(legs);
  });

  it('lands at kicking distance but not beyond a leg', () => {
    expect(throwAt(50, ROUNDHOUSE, 'roundhouse').scored).toBe(true);
    expect(throwAt(Math.ceil(farReach('roundhouse')) + 2, ROUNDHOUSE, 'roundhouse').scored).toBe(false);
  });
});
