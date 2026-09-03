/**
 * Way of the Exploding Sats - game engine
 *
 * A faithful recreation of the 1985 C64 karate classic "The Way of the Exploding Fist"
 * (Melbourne House / Beam Software). The world is 320x200 (C64 resolution). Fighters
 * stand on one floor line and are controlled with an 8-way joystick plus a single fire
 * button, exactly like the original control chart: direction alone = movement, punches
 * and somersaults; direction + fire = kicks. All directions are facing-relative.
 *
 * Scoring follows the original: every landed blow knocks the opponent down and earns a
 * full yin-yang (clean hit) or half a yin-yang (poor hit). First to two full points wins
 * the bout. Each grade (Novice, 1st Dan ... 10th Dan) is fought over two bouts; win both
 * to be promoted to a new backdrop and a tougher opponent. Lose a single bout and the
 * match is over. The clock runs from 30 seconds; remaining time pays 100 points a second.
 */

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 200;
export const GROUND_Y = 172; // y of the fighters' feet
export const HUD_HEIGHT = 50;
export const ARENA_LEFT = 26;
export const ARENA_RIGHT = WORLD_WIDTH - 26;
export const START_X_P1 = 100;
export const START_X_P2 = 220;

export const BOUT_SECONDS = 30;
export const POINTS_TO_WIN = 2; // full yin-yangs
export const BOUTS_PER_GRADE = 2;
export const SCENE_COUNT = 4;
export const TWO_PLAYER_BOUTS = 4;
export const FRAME_RATE = 60;

export const SCORE_TIME_BONUS_PER_SECOND = 100;
export const SCORE_BULL_BONUS = 2000;
export const SCORE_BULL_LOW_PUNCH_BONUS = 3000;

export const FIGHTER_HALF_WIDTH = 14;
export const STAND_HEIGHT = 52;
export const CROUCH_HEIGHT = 38;
export const WALK_SPEED = 1.1;
export const GRAVITY = 0.30;
export const JUMP_VELOCITY = 5.2;

export const GRADES = [
  'NOVICE', '1ST DAN', '2ND DAN', '3RD DAN', '4TH DAN', '5TH DAN',
  '6TH DAN', '7TH DAN', '8TH DAN', '9TH DAN', '10TH DAN',
];

export interface JoystickDirection {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1; // -1 = up, 1 = down (screen coordinates)
}

export interface FighterInput {
  dir: JoystickDirection;
  fire: boolean;
}

export const NEUTRAL_INPUT: FighterInput = { dir: { x: 0, y: 0 }, fire: false };

export type MoveId =
  | 'stand'
  | 'walk_forward'
  | 'walk_back'
  | 'crouch'
  | 'jump'
  | 'somersault_forward'
  | 'somersault_back'
  | 'turn'
  | 'block_high'
  | 'block_low'
  | 'jab_punch'
  | 'high_punch'
  | 'low_punch'
  | 'flying_kick'
  | 'high_kick'
  | 'mid_kick'
  | 'jab_kick'
  | 'sweep'
  | 'back_sweep'
  | 'roundhouse'
  | 'high_back_kick'
  | 'fall'
  | 'lying'
  | 'getup'
  | 'bow'
  | 'victory'
  | 'defeat';

export type StrikeHeight = 'high' | 'mid' | 'low';

export interface MoveDef {
  id: MoveId;
  /** total frames for the move (loops for stand/walk/crouch) */
  frames: number;
  loop?: boolean;
  /** attack window, inclusive frame indices */
  activeFrom?: number;
  activeTo?: number;
  /** strike point relative to the fighter's feet, facing right (+x forward, y up is negative) */
  strike?: { x: number; y: number; reach: number };
  height?: StrikeHeight;
  /** score for a full-point (clean) hit; a half point scores half this */
  value?: number;
  /** sweeps cannot be blocked */
  unblockable?: boolean;
  /** total horizontal movement over the move (facing-relative) */
  travel?: number;
  /** vertical launch velocity for airborne moves */
  launch?: number;
  /** may be interrupted by new input */
  cancelable?: boolean;
  /** cannot be hit */
  invulnerable?: boolean;
  /** flips facing when finished */
  flips?: boolean;
  /** shouts kiai on start */
  kiai?: boolean;
  /** frames within which releasing fire aborts a roundhouse into an about-face */
  abortToTurnBefore?: number;
}

export const MOVES: Record<MoveId, MoveDef> = {
  stand: { id: 'stand', frames: 48, loop: true, cancelable: true },
  walk_forward: { id: 'walk_forward', frames: 24, loop: true, travel: WALK_SPEED * 24, cancelable: true },
  walk_back: { id: 'walk_back', frames: 24, loop: true, travel: -WALK_SPEED * 24, cancelable: true },
  crouch: { id: 'crouch', frames: 20, loop: true, cancelable: true },
  jump: { id: 'jump', frames: 36, launch: JUMP_VELOCITY },
  somersault_forward: { id: 'somersault_forward', frames: 40, travel: 64, launch: 4.4, invulnerable: true },
  somersault_back: { id: 'somersault_back', frames: 40, travel: -64, launch: 4.4, invulnerable: true },
  turn: { id: 'turn', frames: 10, flips: true },
  block_high: { id: 'block_high', frames: 18, invulnerable: true },
  block_low: { id: 'block_low', frames: 18, invulnerable: true },
  // Punches (no fire) - jab is the fastest move in the game
  jab_punch: { id: 'jab_punch', frames: 16, activeFrom: 4, activeTo: 7, strike: { x: 22, y: -37, reach: 6 }, height: 'mid', value: 200, kiai: true },
  high_punch: { id: 'high_punch', frames: 22, activeFrom: 7, activeTo: 11, strike: { x: 22, y: -43, reach: 6 }, height: 'high', value: 300, kiai: true },
  low_punch: { id: 'low_punch', frames: 20, activeFrom: 6, activeTo: 10, strike: { x: 37, y: -22, reach: 6 }, height: 'low', value: 200, kiai: true },
  // Kicks (fire held)
  flying_kick: { id: 'flying_kick', frames: 46, activeFrom: 12, activeTo: 32, strike: { x: 45, y: -44, reach: 8 }, height: 'high', value: 800, travel: 64, launch: 3.4, kiai: true },
  high_kick: { id: 'high_kick', frames: 30, activeFrom: 11, activeTo: 16, strike: { x: 41, y: -48, reach: 7 }, height: 'high', value: 600, kiai: true },
  mid_kick: { id: 'mid_kick', frames: 28, activeFrom: 10, activeTo: 15, strike: { x: 47, y: -31, reach: 7 }, height: 'mid', value: 500, kiai: true },
  jab_kick: { id: 'jab_kick', frames: 18, activeFrom: 5, activeTo: 8, strike: { x: 37, y: -14, reach: 6 }, height: 'mid', value: 300, kiai: true },
  sweep: { id: 'sweep', frames: 32, activeFrom: 11, activeTo: 19, strike: { x: 45, y: -4, reach: 9 }, height: 'low', value: 400, unblockable: true, travel: 6, kiai: true },
  back_sweep: { id: 'back_sweep', frames: 34, activeFrom: 12, activeTo: 20, strike: { x: -45, y: -4, reach: 9 }, height: 'low', value: 400, unblockable: true, kiai: true },
  roundhouse: { id: 'roundhouse', frames: 44, activeFrom: 18, activeTo: 26, strike: { x: 47, y: -30, reach: 10 }, height: 'high', value: 800, travel: 10, flips: true, kiai: true, abortToTurnBefore: 8 },
  high_back_kick: { id: 'high_back_kick', frames: 30, activeFrom: 11, activeTo: 16, strike: { x: -26, y: -44, reach: 8 }, height: 'high', value: 600, kiai: true },
  // Reactions
  fall: { id: 'fall', frames: 44, travel: -36, invulnerable: true },
  lying: { id: 'lying', frames: 50, invulnerable: true },
  getup: { id: 'getup', frames: 30, invulnerable: true },
  bow: { id: 'bow', frames: 80, invulnerable: true },
  victory: { id: 'victory', frames: 120, loop: true, invulnerable: true },
  defeat: { id: 'defeat', frames: 120, loop: true, invulnerable: true },
};

/**
 * The original C64 control chart, facing-relative.
 * dx: 1 = forward, -1 = back. dy: -1 = up, 1 = down.
 */
export function moveForInput(dx: -1 | 0 | 1, dy: -1 | 0 | 1, fire: boolean, crouching: boolean): MoveId | null {
  if (!fire) {
    if (dy === -1 && dx === 0) return 'jump';
    if (dy === -1 && dx === 1) return 'high_punch';
    if (dy === -1 && dx === -1) return 'somersault_forward';
    if (dy === 1 && dx === -1) return 'somersault_back';
    if (dy === 1 && dx === 1) return crouching ? 'low_punch' : 'jab_punch';
    if (dy === 1) return 'crouch';
    if (dx === 1) return crouching ? 'low_punch' : 'walk_forward';
    if (dx === -1) return 'walk_back';
    return null;
  }
  if (dy === -1 && dx === 0) return 'flying_kick';
  if (dy === -1 && dx === 1) return 'high_kick';
  if (dy === -1 && dx === -1) return 'high_back_kick';
  if (dy === 1 && dx === 0) return 'sweep';
  if (dy === 1 && dx === 1) return 'jab_kick';
  if (dy === 1 && dx === -1) return 'back_sweep';
  if (dx === 1) return 'mid_kick';
  if (dx === -1) return 'roundhouse';
  return 'turn';
}

export interface Fighter {
  x: number;
  /** height above the ground (0 = feet on the floor) */
  airY: number;
  vy: number;
  facing: 1 | -1;
  move: MoveId;
  frame: number;
  /** yin-yangs scored in the current bout (0.5 steps) */
  points: number;
  /** attacks thrown this bout - the judge uses it to settle a draw */
  attacks: number;
  /** total score (P1 in one-player mode; both in two-player mode) */
  score: number;
  /** current move has already connected */
  hitLanded: boolean;
  isCpu: boolean;
  colour: 'white' | 'red';
  /** frames left holding back for the automatic block */
  guard: number;
}

export type Phase =
  | 'intro'      // bow before the bout
  | 'fighting'
  | 'point'      // knockdown after a scored point, then reset and bow
  | 'bout_over'  // judge announces the result; time bonus counts down
  | 'bull'       // bonus round
  | 'bull_over'
  | 'game_over';

export interface Bull {
  x: number;
  speed: number;
  frame: number;
  state: 'charging' | 'down' | 'trampled' | 'gone';
}

export type GameEventType =
  | 'kiai' | 'crack' | 'thud' | 'block' | 'whoosh' | 'point'
  | 'bout_won' | 'bout_lost' | 'draw' | 'promotion' | 'tick' | 'time_bonus'
  | 'gallop' | 'bull_down' | 'bull_bonus' | 'game_over';

export interface GameEvent {
  type: GameEventType;
  who?: 0 | 1;
  full?: boolean;
  amount?: number;
}

export interface GameState {
  fighters: [Fighter, Fighter];
  phase: Phase;
  phaseTimer: number;
  /** bout number within the current grade (1 or 2) or within the 2P match (1-4) */
  bout: number;
  /** index into GRADES */
  grade: number;
  boutsWon: number;
  timeLeft: number; // seconds, fractional
  /** time bonus still to be paid out during bout_over */
  bonusSecondsLeft: number;
  twoPlayer: boolean;
  demo: boolean;
  scene: number;
  lastPointWinner: 0 | 1 | null;
  boutWinner: 0 | 1 | null;
  bull: Bull | null;
  /** frames remaining of the judge raising the winner's paddle */
  judgeSignal: number;
  gameOver: boolean;
  isPaused: boolean;
  events: GameEvent[];
  frameCount: number;
  rng: () => number;
  /** the input each CPU fighter keeps holding between decisions, and until which frame */
  cpuHold: [FighterInput, FighterInput];
  cpuHoldUntil: [number, number];
}

function createFighter(x: number, facing: 1 | -1, isCpu: boolean, colour: 'white' | 'red'): Fighter {
  return {
    x, airY: 0, vy: 0, facing, move: 'bow', frame: 0, points: 0, attacks: 0, score: 0,
    hitLanded: false, isCpu, colour, guard: 0,
  };
}

/** Small deterministic RNG so tests are repeatable */
export function makeRng(seed = 1234567): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface GameOptions {
  twoPlayer?: boolean;
  demo?: boolean;
  seed?: number;
}

export function createInitialState(options: GameOptions = {}): GameState {
  const demo = !!options.demo;
  return {
    fighters: [
      createFighter(START_X_P1, 1, demo, 'white'),
      createFighter(START_X_P2, -1, demo || !options.twoPlayer, 'red'),
    ],
    phase: 'intro',
    phaseTimer: MOVES.bow.frames,
    bout: 1,
    grade: 0,
    boutsWon: 0,
    timeLeft: BOUT_SECONDS,
    bonusSecondsLeft: 0,
    twoPlayer: !!options.twoPlayer,
    demo,
    scene: 0,
    lastPointWinner: null,
    boutWinner: null,
    bull: null,
    judgeSignal: 0,
    gameOver: false,
    isPaused: false,
    events: [],
    frameCount: 0,
    rng: makeRng(options.seed),
    cpuHold: [NEUTRAL_INPUT, NEUTRAL_INPUT],
    cpuHoldUntil: [0, 0],
  };
}

export function gradeName(grade: number): string {
  return GRADES[Math.min(grade, GRADES.length - 1)];
}

/** The score shown on the leaderboard: player 1's total */
export function playerScore(state: GameState): number {
  return state.fighters[0].score;
}

export function isAttack(move: MoveId): boolean {
  return !!MOVES[move].strike;
}

export function isDown(move: MoveId): boolean {
  return move === 'fall' || move === 'lying' || move === 'getup';
}

function setMove(f: Fighter, move: MoveId, events: GameEvent[], who: 0 | 1) {
  f.move = move;
  f.frame = 0;
  f.hitLanded = false;
  const def = MOVES[move];
  if (def.launch) {
    f.vy = def.launch;
    f.airY = Math.max(f.airY, 0.01);
  }
  if (def.strike) f.attacks++;
  if (def.kiai) events.push({ type: 'kiai', who });
}

function isBusy(f: Fighter): boolean {
  const def = MOVES[f.move];
  return (!def.cancelable && !def.loop) || f.airY > 0;
}

function hurtRange(f: Fighter): { top: number; bottom: number } | null {
  const def = MOVES[f.move];
  if (def.invulnerable) return null;
  const crouched = f.move === 'crouch' || f.move === 'sweep' || f.move === 'back_sweep' || f.move === 'low_punch';
  const height = crouched ? CROUCH_HEIGHT : STAND_HEIGHT;
  return { top: -(height + f.airY), bottom: -f.airY };
}

function resetPositions(state: GameState) {
  const [a, b] = state.fighters;
  a.x = START_X_P1; b.x = START_X_P2;
  a.facing = 1; b.facing = -1;
  a.airY = b.airY = 0;
  a.vy = b.vy = 0;
}

function bowBoth(state: GameState) {
  const [a, b] = state.fighters;
  resetPositions(state);
  a.move = b.move = 'bow';
  a.frame = b.frame = 0;
  a.hitLanded = b.hitLanded = false;
  state.phase = 'intro';
  state.phaseTimer = MOVES.bow.frames;
}

function startBout(state: GameState) {
  const [a, b] = state.fighters;
  a.points = b.points = 0;
  a.attacks = b.attacks = 0;
  state.timeLeft = BOUT_SECONDS;
  state.boutWinner = null;
  state.lastPointWinner = null;
  state.judgeSignal = 0;
  bowBoth(state);
}

function beginFighting(state: GameState) {
  const [a, b] = state.fighters;
  a.move = b.move = 'stand';
  a.frame = b.frame = 0;
  state.phase = 'fighting';
}

// ---------------------------------------------------------------------------
// CPU opponent - reacts to distance and to the player's move, favouring flying
// kicks and sweeps like the original. Gets sharper with every Dan.
// ---------------------------------------------------------------------------

export interface AiProfile {
  reaction: number;    // frames between decisions
  aggression: number;  // probability to attack when in range
  evade: number;       // probability to counter an incoming attack
  advance: number;     // probability to close distance
}

export function aiProfile(grade: number): AiProfile {
  const g = Math.min(grade, 10) / 10;
  return {
    reaction: Math.round(24 - g * 16),
    aggression: 0.42 + g * 0.45,
    evade: 0.12 + g * 0.65,
    advance: 0.55 + g * 0.3,
  };
}

/** Movement inputs (walk, crouch, block) are held until the next decision. */
function isMovementInput(input: FighterInput): boolean {
  return !input.fire && input.dir.y !== -1 && !(input.dir.y === 1 && input.dir.x !== 0);
}

/** Frames a CPU keeps the stick held after choosing an attack, so kicks commit (a roundhouse needs fire held). */
const CPU_ATTACK_HOLD = 9; // shorter than the 10-frame about-face so a turn never re-triggers

function cpuInput(state: GameState, index: 0 | 1, me: Fighter, foe: Fighter): FighterInput {
  // Decide every N frames; in between keep the joystick where it was, like a human would
  const profile = aiProfile(state.demo ? 4 : state.grade);
  if ((state.frameCount + index * 7) % profile.reaction !== 0) {
    return state.frameCount < state.cpuHoldUntil[index] ? state.cpuHold[index] : NEUTRAL_INPUT;
  }
  // Decisions are facing-relative (forward/back); convert to joystick (screen) directions
  const relative = cpuDecision(state, me, foe, profile);
  const decision: FighterInput = { dir: { x: (relative.dir.x * me.facing) as -1 | 0 | 1, y: relative.dir.y }, fire: relative.fire };
  state.cpuHold[index] = decision;
  state.cpuHoldUntil[index] = state.frameCount + (isMovementInput(decision) ? profile.reaction : CPU_ATTACK_HOLD);
  return decision;
}

function cpuDecision(state: GameState, me: Fighter, foe: Fighter, profile: AiProfile): FighterInput {
  const dist = (foe.x - me.x) * me.facing; // positive = foe in front
  const absDist = Math.abs(dist);
  const rng = state.rng;

  // Foe is behind us: about-face (or a high back kick if close)
  if (dist < -6) {
    if (absDist < 30 && rng() < profile.aggression) return { dir: { x: -1, y: -1 }, fire: true };
    return { dir: { x: 0, y: 0 }, fire: true };
  }

  // Counter an incoming attack
  const foeDef = MOVES[foe.move];
  if (foeDef.strike && foe.frame < (foeDef.activeFrom ?? 0) && absDist < 44 && rng() < profile.evade) {
    if (foeDef.height === 'low') return { dir: { x: 0, y: -1 }, fire: false };   // jump the sweep
    if (foe.move === 'flying_kick') return { dir: { x: 0, y: 1 }, fire: false };  // duck the flying kick
    if (foeDef.height === 'high') return rng() < 0.5 ? { dir: { x: 0, y: 1 }, fire: false } : { dir: { x: -1, y: 0 }, fire: false };
    return rng() < 0.5 ? { dir: { x: -1, y: 0 }, fire: false } : { dir: { x: -1, y: 1 }, fire: false }; // block or flip away
  }

  if (absDist < 24) {
    if (rng() < profile.aggression) {
      const r = rng();
      if (r < 0.3) return { dir: { x: 1, y: 1 }, fire: false };   // jab punch
      if (r < 0.55) return { dir: { x: 0, y: 1 }, fire: true };   // sweep
      if (r < 0.75) return { dir: { x: 1, y: 1 }, fire: true };   // jab kick
      return { dir: { x: 1, y: -1 }, fire: false };               // high punch
    }
    const r = rng();
    if (r < 0.4) return { dir: { x: -1, y: 0 }, fire: false };    // step back / block
    if (r < 0.6) return { dir: { x: 0, y: 1 }, fire: false };     // crouch
    return NEUTRAL_INPUT;
  }
  if (absDist < 38) {
    if (rng() < profile.aggression) {
      const r = rng();
      if (r < 0.3) return { dir: { x: 1, y: 0 }, fire: true };    // mid kick
      if (r < 0.55) return { dir: { x: 1, y: -1 }, fire: true };  // high kick
      if (r < 0.75) return { dir: { x: 0, y: 1 }, fire: true };   // sweep
      return { dir: { x: -1, y: 0 }, fire: true };                // roundhouse
    }
    return rng() < 0.6 ? { dir: { x: 1, y: 0 }, fire: false } : NEUTRAL_INPUT;
  }
  if (absDist < 80 && rng() < profile.aggression * 0.4) {
    return { dir: { x: 0, y: -1 }, fire: true }; // flying kick
  }
  if (rng() < profile.advance) {
    return rng() < 0.1 ? { dir: { x: -1, y: -1 }, fire: false } /* forward somersault */ : { dir: { x: 1, y: 0 }, fire: false };
  }
  return NEUTRAL_INPUT;
}

// ---------------------------------------------------------------------------
// Fighter update
// ---------------------------------------------------------------------------

function applyInput(state: GameState, index: 0 | 1, input: FighterInput) {
  const f = state.fighters[index];
  if (state.phase !== 'fighting' && state.phase !== 'bull') return;

  const dx = (input.dir.x * f.facing) as -1 | 0 | 1;
  const dy = input.dir.y;

  // Roundhouse: release fire early and it becomes a quick about-face
  if (f.move === 'roundhouse' && !input.fire && f.frame < (MOVES.roundhouse.abortToTurnBefore ?? 0)) {
    setMove(f, 'turn', state.events, index);
    return;
  }

  // Holding back keeps the guard up (automatic high/low block)
  f.guard = !input.fire && dx === -1 && dy === 0 ? 12 : Math.max(0, f.guard - 1);

  if (isBusy(f)) return;

  const wanted = moveForInput(dx, dy, input.fire, f.move === 'crouch');
  if (wanted === null) {
    if (f.move !== 'stand') setMove(f, 'stand', state.events, index);
    return;
  }
  if (wanted === f.move && MOVES[wanted].loop) return;
  setMove(f, wanted, state.events, index);
}

function advanceFighter(state: GameState, index: 0 | 1) {
  const f = state.fighters[index];
  const def = MOVES[f.move];

  if (def.travel) {
    f.x += (def.travel / def.frames) * f.facing;
  }

  if (f.airY > 0 || f.vy > 0) {
    f.airY += f.vy;
    f.vy -= GRAVITY;
    if (f.airY <= 0) {
      f.airY = 0;
      f.vy = 0;
    }
  }

  f.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, f.x));
  f.frame++;

  if (f.frame >= def.frames) {
    if (def.loop) {
      f.frame = 0;
    } else if (f.move === 'fall') {
      setMove(f, 'lying', state.events, index);
    } else if (f.move === 'lying') {
      setMove(f, 'getup', state.events, index);
    } else if (f.airY > 0) {
      f.frame = def.frames - 1; // hold the final frame until landing
    } else {
      if (def.strike && !f.hitLanded) state.events.push({ type: 'whoosh', who: index });
      if (def.flips) f.facing = f.facing === 1 ? -1 : 1;
      setMove(f, 'stand', state.events, index);
    }
  }
}

/**
 * Judge the quality of a landed blow. A strike that connects near the centre of
 * the target during the sharpest part of the move is a clean full point; anything
 * that merely clips the opponent is a half point. Catching an opponent mid-attack
 * or in the air is always decisive.
 */
function judgeHit(attacker: Fighter, defender: Fighter, def: MoveDef, strikeX: number): boolean {
  if (isAttack(defender.move) || defender.airY > 0) return true;
  const horizontalError = Math.abs(strikeX - defender.x);
  const window = (def.activeTo ?? 0) - (def.activeFrom ?? 0);
  const timing = (attacker.frame - (def.activeFrom ?? 0)) / Math.max(1, window);
  return horizontalError <= FIGHTER_HALF_WIDTH - 1 && timing <= 0.6;
}

function resolveHit(state: GameState, attackerIndex: 0 | 1): boolean {
  const attacker = state.fighters[attackerIndex];
  const defenderIndex = (1 - attackerIndex) as 0 | 1;
  const defender = state.fighters[defenderIndex];
  const def = MOVES[attacker.move];
  if (!def.strike || attacker.hitLanded) return false;
  if (attacker.frame < (def.activeFrom ?? 0) || attacker.frame > (def.activeTo ?? 0)) return false;

  const hurt = hurtRange(defender);
  if (!hurt) return false;

  const strikeX = attacker.x + def.strike.x * attacker.facing;
  const strikeY = def.strike.y - attacker.airY;
  const horizontal = Math.abs(strikeX - defender.x) <= FIGHTER_HALF_WIDTH + def.strike.reach;
  const vertical = strikeY >= hurt.top - 2 && strikeY <= hurt.bottom + 2;
  if (!horizontal || !vertical) return false;

  attacker.hitLanded = true;

  // Automatic block: holding back while facing the attack stops anything but a sweep
  const facingAttacker = (attacker.x - defender.x) * defender.facing > 0;
  if (defender.guard > 0 && facingAttacker && !def.unblockable && defender.airY === 0 && !isAttack(defender.move)) {
    setMove(defender, def.height === 'low' ? 'block_low' : 'block_high', state.events, defenderIndex);
    state.events.push({ type: 'block', who: defenderIndex });
    return false;
  }

  const full = judgeHit(attacker, defender, def, strikeX);
  const points = full ? 1 : 0.5;
  attacker.points = Math.min(POINTS_TO_WIN, attacker.points + points);
  attacker.score += full ? (def.value ?? 200) : (def.value ?? 200) / 2;

  // Every landed blow knocks the opponent down
  defender.facing = attacker.x > defender.x ? 1 : -1;
  defender.airY = 0;
  defender.vy = 0;
  setMove(defender, 'fall', state.events, defenderIndex);

  state.events.push({ type: 'crack', who: attackerIndex, full });
  state.events.push({ type: 'point', who: attackerIndex, full });
  state.lastPointWinner = attackerIndex;
  state.phase = 'point';
  state.phaseTimer = 30;
  return true;
}

function endBout(state: GameState, winner: 0 | 1) {
  const [a, b] = state.fighters;
  state.boutWinner = winner;
  state.phase = 'bout_over';
  state.phaseTimer = 170;
  state.judgeSignal = 170;

  setMove(a, winner === 0 ? 'victory' : 'defeat', state.events, 0);
  setMove(b, winner === 1 ? 'victory' : 'defeat', state.events, 1);

  // Remaining time pays out 100 points a second while the clock runs down
  state.bonusSecondsLeft = Math.ceil(state.timeLeft);
  state.timeLeft = state.bonusSecondsLeft;

  if (winner === 0 || state.twoPlayer) {
    state.events.push({ type: 'bout_won', who: winner });
  }
  if (winner === 1 && !state.twoPlayer) {
    state.events.push({ type: 'bout_lost' });
  }
}

/** The clock has run out: the judge decides on points, then on who fought harder. */
function judgeDecision(state: GameState): 0 | 1 {
  const [a, b] = state.fighters;
  if (a.points !== b.points) return a.points > b.points ? 0 : 1;
  if (a.attacks !== b.attacks) return a.attacks > b.attacks ? 0 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Bull bonus round (C64 version): after every fourth backdrop a bull charges in
// from the right. Somersault over it, or stop it with a well-timed low punch to
// the nose for a bigger bonus. Failing costs nothing but pride.
// ---------------------------------------------------------------------------

function startBull(state: GameState) {
  const [a, b] = state.fighters;
  a.x = 90; a.facing = 1; a.airY = 0; a.vy = 0;
  setMove(a, 'stand', state.events, 0);
  b.x = -200; // opponent leaves the arena for the bonus round
  setMove(b, 'stand', state.events, 1);
  state.bull = { x: WORLD_WIDTH + 60, speed: 1.5 + Math.min(state.grade, 10) * 0.12, frame: 0, state: 'charging' };
  state.phase = 'bull';
  state.phaseTimer = 0;
}

function updateBull(state: GameState) {
  const bull = state.bull;
  const player = state.fighters[0];
  if (!bull) return;
  bull.frame++;

  if (bull.state === 'charging') {
    bull.x -= bull.speed;
    if (bull.frame % 12 === 0) state.events.push({ type: 'gallop' });

    const noseX = bull.x - 26; // bull faces left; nose at its left end
    const def = MOVES[player.move];
    if (def.strike && !player.hitLanded && player.frame >= (def.activeFrom ?? 0) && player.frame <= (def.activeTo ?? 0)) {
      const strikeX = player.x + def.strike.x * player.facing;
      const strikeY = def.strike.y - player.airY;
      if (Math.abs(strikeX - noseX) <= 10 && strikeY <= -14 && strikeY >= -34) {
        player.hitLanded = true;
        bull.state = 'down';
        bull.frame = 0;
        const bonus = player.move === 'low_punch' ? SCORE_BULL_LOW_PUNCH_BONUS : SCORE_BULL_BONUS;
        player.score += bonus;
        state.events.push({ type: 'bull_down' });
        state.events.push({ type: 'bull_bonus', amount: bonus });
        state.judgeSignal = 60;
      }
    }

    if (bull.state === 'charging' && noseX <= player.x + 4 && bull.x + 26 >= player.x - 4) {
      const cleared = player.airY > 26 || MOVES[player.move].invulnerable;
      if (!cleared) {
        bull.state = 'trampled';
        bull.frame = 0;
        player.airY = 0; player.vy = 0;
        setMove(player, 'fall', state.events, 0);
      }
    }
    if (bull.state === 'charging' && bull.x + 40 < player.x - 20) {
      // Cleared it with a somersault or jump
      bull.state = 'trampled'; // keeps running off screen
      bull.frame = 0;
      player.score += SCORE_BULL_BONUS;
      state.events.push({ type: 'bull_bonus', amount: SCORE_BULL_BONUS });
    }
  } else if (bull.state === 'trampled') {
    bull.x -= bull.speed * 1.4;
    if (bull.x < -90) bull.state = 'gone';
  } else if (bull.state === 'down') {
    if (bull.frame > 110) bull.state = 'gone';
  }

  if (bull.state === 'gone') {
    state.phase = 'bull_over';
    state.phaseTimer = 60;
  }
}

// ---------------------------------------------------------------------------
// Main update - one fixed 60 Hz step
// ---------------------------------------------------------------------------

export function updateGame(state: GameState, inputs: [FighterInput, FighterInput]): GameState {
  if (state.isPaused || state.gameOver) return state;
  state.events = [];
  state.frameCount++;
  if (state.judgeSignal > 0) state.judgeSignal--;

  const [p1, p2] = state.fighters;

  switch (state.phase) {
    case 'intro': {
      p1.frame++; p2.frame++;
      state.phaseTimer--;
      if (state.phaseTimer <= 0) beginFighting(state);
      break;
    }

    case 'fighting': {
      const in1 = p1.isCpu ? cpuInput(state, 0, p1, p2) : inputs[0];
      const in2 = p2.isCpu ? cpuInput(state, 1, p2, p1) : inputs[1];
      applyInput(state, 0, in1);
      applyInput(state, 1, in2);
      advanceFighter(state, 0);
      advanceFighter(state, 1);

      // Fighters cannot pass through each other while both are on the ground
      if (Math.abs(p1.x - p2.x) < FIGHTER_HALF_WIDTH * 2 && p1.airY === 0 && p2.airY === 0) {
        const mid = (p1.x + p2.x) / 2;
        const dir = p1.x <= p2.x ? 1 : -1;
        p1.x = mid - dir * FIGHTER_HALF_WIDTH;
        p2.x = mid + dir * FIGHTER_HALF_WIDTH;
      }

      // Only one point per exchange
      if (!resolveHit(state, 0)) resolveHit(state, 1);

      const before = Math.ceil(state.timeLeft);
      state.timeLeft = Math.max(0, state.timeLeft - 1 / FRAME_RATE);
      const after = Math.ceil(state.timeLeft);
      if (after !== before && after <= 5 && after > 0) state.events.push({ type: 'tick' });

      if (state.phase === 'fighting' && state.timeLeft <= 0) {
        endBout(state, judgeDecision(state));
      }
      break;
    }

    case 'point': {
      advanceFighter(state, 0);
      advanceFighter(state, 1);
      if (p1.move === 'lying' && p1.frame === 1 || p2.move === 'lying' && p2.frame === 1) {
        state.events.push({ type: 'thud' });
      }
      state.phaseTimer--;
      if (state.phaseTimer <= 0 && p1.airY === 0 && p2.airY === 0 && !isDown(p1.move) && !isDown(p2.move)) {
        if (p1.points >= POINTS_TO_WIN) endBout(state, 0);
        else if (p2.points >= POINTS_TO_WIN) endBout(state, 1);
        else bowBoth(state); // back to the marks, bow, fight on
      }
      break;
    }

    case 'bout_over': {
      p1.frame = (p1.frame + 1) % MOVES[p1.move].frames;
      p2.frame = (p2.frame + 1) % MOVES[p2.move].frames;
      state.phaseTimer--;

      // Time bonus ticks down one second every 6 frames
      if (state.bonusSecondsLeft > 0 && state.phaseTimer % 6 === 0) {
        state.bonusSecondsLeft--;
        state.timeLeft = state.bonusSecondsLeft;
        const winner = state.boutWinner ?? 0;
        if (winner === 0 || state.twoPlayer) {
          state.fighters[winner].score += SCORE_TIME_BONUS_PER_SECOND;
          state.events.push({ type: 'time_bonus', who: winner, amount: SCORE_TIME_BONUS_PER_SECOND });
        }
      }

      if (state.phaseTimer <= 0 && state.bonusSecondsLeft <= 0) {
        if (state.demo) {
          state.bout++;
          state.scene = (state.scene + 1) % SCENE_COUNT;
          startBout(state);
        } else if (state.twoPlayer) {
          if (state.bout >= TWO_PLAYER_BOUTS) {
            state.phase = 'game_over';
            state.gameOver = true;
            state.events.push({ type: 'game_over' });
          } else {
            state.bout++;
            state.scene = (state.scene + 1) % SCENE_COUNT;
            startBout(state);
          }
        } else if (state.boutWinner === 1) {
          state.phase = 'game_over';
          state.gameOver = true;
          state.events.push({ type: 'game_over' });
        } else {
          state.boutsWon++;
          if (state.bout >= BOUTS_PER_GRADE) {
            // Promoted: new grade, new backdrop
            state.bout = 1;
            if (state.grade < GRADES.length - 1) state.grade++;
            state.events.push({ type: 'promotion' });
            const finishedScene = state.scene;
            state.scene = (state.scene + 1) % SCENE_COUNT;
            if (finishedScene === SCENE_COUNT - 1) {
              startBull(state);
              break;
            }
          } else {
            state.bout++;
          }
          startBout(state);
        }
      }
      break;
    }

    case 'bull': {
      applyInput(state, 0, inputs[0]);
      advanceFighter(state, 0);
      updateBull(state);
      break;
    }

    case 'bull_over': {
      advanceFighter(state, 0);
      if (p1.move === 'lying' && p1.frame === 1) state.events.push({ type: 'thud' });
      state.phaseTimer--;
      if (state.phaseTimer <= 0 && !isDown(p1.move)) {
        state.bull = null;
        startBout(state);
      }
      break;
    }

    case 'game_over':
      break;
  }

  return state;
}
