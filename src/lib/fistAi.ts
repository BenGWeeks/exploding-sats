/**
 * CPU opponent.
 *
 * The CPU is a short-horizon planner. When it is free to act it looks at the
 * opponent as it was a few frames ago (its reaction delay), predicts what the
 * opponent will do next, and plays each candidate plan forward with a light
 * copy of the engine's movement and hit rules: "walk in for 6 frames, then mid
 * kick", "hold back to block", "jump", "sweep now" and so on. It keeps the plan
 * that scores soonest without being hit first, or the safest place to stand.
 *
 * Nothing about distance is hard-coded: reach comes from each move's strike
 * point, reach and travel in MOVES, so the plans stay right if moves change.
 *
 * Difficulty comes from human-like limits that shrink with grade rather than
 * from extra rules: a longer reaction delay, misjudged distance, slower
 * thinking, a poorer memory for the opponent's habits, and a chance on every
 * decision of simply doing something unwise. Even 10th Dan keeps some of each.
 */

import {
  MOVES, ARENA_LEFT, ARENA_RIGHT, FIGHTER_HALF_WIDTH, GRAVITY, STAND_HEIGHT, CROUCH_HEIGHT,
  NEUTRAL_INPUT, moveForInput,
  type Fighter, type FighterInput, type GameState, type MoveId,
} from './fistEngine';

export interface AiProfile {
  /** frames before the CPU sees what the opponent has just started */
  reaction: number;
  /** frames the CPU idles between finishing one plan and choosing the next */
  think: number;
  /** 0..1: how hard it presses forward to attacking distance */
  aggression: number;
  /** 0..1: chance a decision is the considered one rather than a blunder */
  evade: number;
  /** 0..1: how much it trusts that an opponent who repeats a move will repeat it again */
  read: number;
  /** pixels of distance misjudgement */
  noise: number;
}

export function aiProfile(grade: number): AiProfile {
  const g = Math.min(Math.max(grade, 0), 10) / 10;
  return {
    reaction: Math.round(20 - g * 12),   // 20 -> 8 frames
    think: Math.round(14 - g * 11),      // 14 -> 3 frames
    aggression: 0.35 + g * 0.5,
    evade: 0.78 + g * 0.18,              // blunders on 22% -> 4% of decisions
    read: 0.65 + g * 0.3,
    noise: 8 - g * 6,                    // 8 -> 2 px
  };
}

/** What a CPU fighter remembers between frames */
export interface CpuBrain {
  /** the opponent as seen on each recent frame, oldest first */
  seen: Body[];
  seenAt: number;
  /** the opponent's recent actions (moves it started), oldest first */
  habits: MoveId[];
  /** running share of frames the opponent spends attacking (0..1) */
  attackRate: number;
  /** the frame on which the most recently perceived opponent action started */
  perceivedStart: number;
  /** the current plan: hold `prefix` until `prefixUntil`, then start `then` */
  prefix: MoveId;
  prefixUntil: number;
  then: MoveId | null;
  /** the action input being held, and until which frame */
  pressing: MoveId | null;
  pressUntil: number;
  /** the perceived opponent action the current plan already accounts for */
  reactedTo: number;
  /** no new plan before this frame */
  idleUntil: number;
}

export function createCpuBrain(): CpuBrain {
  return {
    seen: [], seenAt: -2, habits: [], attackRate: 0, perceivedStart: -1,
    prefix: 'stand', prefixUntil: 0, then: null, pressing: null, pressUntil: 0, reactedTo: -1, idleUntil: 0,
  };
}

// ---------------------------------------------------------------------------
// Reach, derived from the move table
// ---------------------------------------------------------------------------

/**
 * The distances (foe x minus own x, facing-relative, + = in front) at which a
 * move's strike can connect with a stationary grounded opponent, over its
 * active frames and including its travel. Vertical reach is not considered.
 */
export function moveReach(id: MoveId): { near: number; far: number } | null {
  const def = MOVES[id];
  if (!def.strike || def.activeFrom === undefined || def.activeTo === undefined) return null;
  const perFrame = (def.travel ?? 0) / def.frames;
  const span = FIGHTER_HALF_WIDTH + def.strike.reach;
  let near = Infinity;
  let far = -Infinity;
  for (let f = def.activeFrom; f <= def.activeTo; f++) {
    const offset = def.strike.x + perFrame * f;
    near = Math.min(near, offset - span);
    far = Math.max(far, offset + span);
  }
  return { near, far };
}

const ATTACKS = (): MoveId[] => (Object.keys(MOVES) as MoveId[]).filter((m) => !!MOVES[m].strike);
let reachCache: Map<MoveId, { near: number; far: number }> | null = null;
function reachOf(id: MoveId) {
  if (!reachCache) {
    reachCache = new Map();
    for (const m of ATTACKS()) reachCache.set(m, moveReach(m)!);
  }
  return reachCache.get(id)!;
}

/** The distance the CPU likes to wait at: the typical far reach of its grounded forward attacks */
function engageDistance(): number {
  const fars = ATTACKS()
    .filter((m) => !MOVES[m].launch && MOVES[m].strike!.x > 0)
    .map((m) => reachOf(m).far)
    .sort((a, b) => a - b);
  return fars[Math.floor(fars.length / 2)] - 6;
}

/** The longest reach of any grounded forward attack: how close an unknown opponent can hit from */
function longestReach(): number {
  return Math.max(...ATTACKS().filter((m) => !MOVES[m].launch && MOVES[m].strike!.x > 0).map((m) => reachOf(m).far));
}

/** The joystick input (facing-relative) that starts a move, found from the control chart */
const inputCache = new Map<string, FighterInput>();
function inputFor(move: MoveId, crouching: boolean): FighterInput {
  const key = `${move}:${crouching}`;
  const hit = inputCache.get(key);
  if (hit) return hit;
  if (move === 'stand') return NEUTRAL_INPUT;
  for (const fire of [false, true]) {
    for (const dy of [0, 1, -1] as const) {
      for (const dx of [1, 0, -1] as const) {
        if (moveForInput(dx, dy, fire, crouching) === move) {
          const input: FighterInput = { dir: { x: dx, y: dy }, fire };
          inputCache.set(key, input);
          return input;
        }
      }
    }
  }
  return NEUTRAL_INPUT;
}

// ---------------------------------------------------------------------------
// A light copy of the engine's movement and hit rules, used for look-ahead
// (fistAi.test.ts checks it agrees with the engine)
// ---------------------------------------------------------------------------

export interface Body {
  x: number;
  airY: number;
  vy: number;
  facing: 1 | -1;
  move: MoveId;
  frame: number;
  guard: number;
  hitLanded: boolean;
}

function bodyOf(f: Fighter): Body {
  return { x: f.x, airY: f.airY, vy: f.vy, facing: f.facing, move: f.move, frame: f.frame, guard: f.guard, hitLanded: f.hitLanded };
}

const copy = (b: Body): Body => ({ ...b });

function busy(b: Body): boolean {
  const def = MOVES[b.move];
  return (!def.cancelable && !def.loop) || b.airY > 0;
}

function startMove(b: Body, move: MoveId) {
  b.move = move;
  b.frame = 0;
  b.hitLanded = false;
  const def = MOVES[move];
  if (def.launch) {
    b.vy = def.launch;
    b.airY = Math.max(b.airY, 0.01);
  }
}

/** One frame of input: `want` is the move asked for (null = stand), `back` = holding back */
function control(b: Body, want: MoveId | null, back: boolean) {
  b.guard = back ? 12 : Math.max(0, b.guard - 1);
  if (busy(b)) return;
  if (want === null) {
    if (b.move !== 'stand') startMove(b, 'stand');
    return;
  }
  if (want === b.move && MOVES[want].loop) return;
  startMove(b, want);
}

function advance(b: Body) {
  const def = MOVES[b.move];
  if (def.travel) b.x += (def.travel / def.frames) * b.facing;
  if (b.airY > 0 || b.vy > 0) {
    b.airY += b.vy;
    b.vy -= GRAVITY;
    if (b.airY <= 0) { b.airY = 0; b.vy = 0; }
  }
  b.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, b.x));
  b.frame++;
  if (b.frame >= def.frames) {
    if (def.loop) b.frame = 0;
    else if (b.airY > 0) b.frame = def.frames - 1;
    else {
      if (def.flips) b.facing = b.facing === 1 ? -1 : 1;
      startMove(b, 'stand');
    }
  }
}

function pushApart(p1: Body, p2: Body) {
  if (Math.abs(p1.x - p2.x) < FIGHTER_HALF_WIDTH * 2 && p1.airY === 0 && p2.airY === 0) {
    const mid = (p1.x + p2.x) / 2;
    const dir = p1.x <= p2.x ? 1 : -1;
    p1.x = mid - dir * FIGHTER_HALF_WIDTH;
    p2.x = mid + dir * FIGHTER_HALF_WIDTH;
  }
}

const CROUCHED = new Set<MoveId>(['crouch', 'sweep', 'back_sweep', 'low_punch']);

/** 'hit' scores, 'block' is stopped by the guard, null misses */
function strike(a: Body, d: Body): 'hit' | 'block' | null {
  const def = MOVES[a.move];
  if (!def.strike || a.hitLanded) return null;
  if (a.frame < (def.activeFrom ?? 0) || a.frame > (def.activeTo ?? 0)) return null;
  if (MOVES[d.move].invulnerable) return null;
  const height = CROUCHED.has(d.move) ? CROUCH_HEIGHT : STAND_HEIGHT;
  const top = -(height + d.airY);
  const bottom = -d.airY;
  const strikeX = a.x + def.strike.x * a.facing;
  const strikeY = def.strike.y - a.airY;
  if (Math.abs(strikeX - d.x) > FIGHTER_HALF_WIDTH + def.strike.reach) return null;
  if (strikeY < top - 2 || strikeY > bottom + 2) return null;
  a.hitLanded = true;
  const facingAttacker = (a.x - d.x) * d.facing > 0;
  if (d.guard > 0 && facingAttacker && !def.unblockable && d.airY === 0 && !MOVES[d.move].strike) {
    startMove(d, def.height === 'low' ? 'block_low' : 'block_high');
    return 'block';
  }
  return 'hit';
}

/** A fighter's behaviour during look-ahead: the move it asks for on frame t, and whether it holds back */
type Controller = (b: Body, t: number, other: Body) => { want: MoveId | null; back: boolean };

export interface Outcome {
  /** frame on which someone scored, or Infinity */
  t: number;
  /** who scored: 0/1 (engine index) or null */
  scorer: 0 | 1 | null;
  /** the CPU's attack was blocked */
  blocked: boolean;
  /** the CPU threw an attack that did not connect */
  whiffed: boolean;
  /** frames the CPU spent stuck in a move, within reach, while the opponent was free to punish it */
  exposed: number;
  /** the bodies at the end of the look-ahead */
  me: Body;
  foe: Body;
}

/** Play two bodies forward with the engine's update order and hit priority */
export function lookAhead(cpuIndex: 0 | 1, me: Body, foe: Body, meCtl: Controller, foeCtl: Controller, frames: number): Outcome {
  const m = copy(me);
  const f = copy(foe);
  const bodies: [Body, Body] = cpuIndex === 0 ? [m, f] : [f, m];
  const ctls: [Controller, Controller] = cpuIndex === 0 ? [meCtl, foeCtl] : [foeCtl, meCtl];
  let blocked = false;
  let attacked = false;
  let exposed = 0;
  const reach = longestReach();
  for (let t = 1; t <= frames; t++) {
    for (let i = 0; i < 2; i++) {
      const c = ctls[i](bodies[i], t, bodies[1 - i]);
      control(bodies[i], c.want, c.back);
    }
    if (MOVES[m.move].strike && m.frame === 0) attacked = true;
    advance(bodies[0]);
    advance(bodies[1]);
    pushApart(bodies[0], bodies[1]);
    if (busy(m) && !MOVES[m.move].invulnerable && !busy(f) && Math.abs(f.x - m.x) <= reach) exposed++;
    for (let j = 0; j < 2; j++) {
      const i = j as 0 | 1;
      // The single standing frame between two moves is too fine a gap to plan a hit on
      const gap = i === cpuIndex && f.move === 'stand' && f.frame === 0;
      const r = strike(bodies[i], bodies[1 - i]);
      if (r === 'hit' && gap) return { t: Infinity, scorer: null, blocked, whiffed: true, exposed, me: m, foe: f };
      if (r === 'hit') return { t, scorer: i, blocked, whiffed: false, exposed, me: m, foe: f };
      if (r === 'block' && i === cpuIndex) blocked = true;
    }
  }
  return { t: Infinity, scorer: null, blocked, whiffed: attacked && !blocked, exposed, me: m, foe: f };
}

// ---------------------------------------------------------------------------
// Perception and memory
// ---------------------------------------------------------------------------

const SEEN_MAX = 40;
const HABITS_MAX = 6;

function observe(brain: CpuBrain, foe: Fighter, now: number, delay: number) {
  // A gap means a point or bout was settled: take in what had not yet been perceived
  // (such as the move that just scored), then forget the old positions
  if (brain.seenAt !== now - 1) {
    const last = brain.seen.length - 1;
    for (let age = Math.min(delay, last) - 1; age >= 0; age--) remember(brain, brain.seen[last - age], brain.seenAt - age);
    brain.seen = [];
  }
  brain.seenAt = now;
  brain.seen.push(bodyOf(foe));
  if (brain.seen.length > SEEN_MAX) brain.seen.shift();
}

/** The opponent as the CPU perceives it now: `delay` frames old */
function perceive(brain: CpuBrain, delay: number): { body: Body; age: number } {
  const idx = Math.max(0, brain.seen.length - 1 - delay);
  return { body: brain.seen[idx], age: brain.seen.length - 1 - idx };
}

/** Track how much the perceived opponent attacks, and record each new action it starts as a habit */
function remember(brain: CpuBrain, body: Body, perceivedFrame: number) {
  const def = MOVES[body.move];
  brain.attackRate = brain.attackRate * 0.96 + (def.strike ? 0.04 : 0);
  if (def.loop || body.frame !== 1) return;
  if (body.move === 'fall' || body.move === 'lying' || body.move === 'getup' || body.move === 'block_high' || body.move === 'block_low') return;
  if (perceivedFrame <= brain.perceivedStart) return;
  brain.perceivedStart = perceivedFrame;
  brain.habits.push(body.move);
  if (brain.habits.length > HABITS_MAX) brain.habits.shift();
}

/**
 * The opponent's habits: its last few distinct actions (most recent first) and
 * how strongly it repeats one of them (0..1, a small sample counts for less).
 */
function habitsOf(brain: CpuBrain): { moves: MoveId[]; repeat: number } {
  if (brain.habits.length === 0) return { moves: [], repeat: 0 };
  const counts = new Map<MoveId, number>();
  for (const m of brain.habits) counts.set(m, (counts.get(m) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const moves: MoveId[] = [];
  for (let i = brain.habits.length - 1; i >= 0 && moves.length < 3; i--) {
    if (!moves.includes(brain.habits[i])) moves.push(brain.habits[i]);
  }
  return { moves, repeat: top / (brain.habits.length + 1) };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

interface Plan {
  prefix: MoveId;
  k: number;
  then: MoveId | null;
  value: number;
}

const PREFIXES: MoveId[] = ['stand', 'walk_forward', 'walk_back'];
const WAITS = [4, 9, 15];
const ESCAPES: MoveId[] = ['jump', 'somersault_back', 'somersault_forward', 'turn', 'crouch'];

function holdsBack(move: MoveId) {
  return move === 'walk_back';
}

/** The CPU's own behaviour for a plan: hold the prefix for k frames, then the action, then stand */
function planController(plan: { prefix: MoveId; k: number; then: MoveId | null }): Controller {
  let started = false;
  return (b, t) => {
    if (t <= plan.k) return { want: plan.prefix === 'stand' ? null : plan.prefix, back: holdsBack(plan.prefix) };
    if (plan.then && !started) {
      if (!busy(b)) started = true;
      if (plan.then === 'crouch') return { want: 'crouch', back: false };
      return { want: plan.then, back: false };
    }
    if (plan.then === 'crouch') return { want: 'crouch', back: false };
    return { want: null, back: false };
  };
}

/** Frames a player is assumed to need to see an attack coming and hold back to block it */
const PLAYER_REACTION = 10;

/**
 * The opponent's predicted behaviour: carry on, then either repeat its habit at
 * once (`next`) or stay calm. A calm opponent still blocks an attack it has
 * had time to see.
 */
function foeController(foe: Body, next: MoveId | null): Controller {
  const def = MOVES[foe.move];
  const loopMove = def.loop ? foe.move : null;
  let finishedCurrent = !!def.loop || foe.move === 'stand';
  return (b, _t, other) => {
    if (!finishedCurrent && b.move === 'stand' && b.frame === 0) finishedCurrent = true;
    if (next && finishedCurrent) return { want: next, back: false };
    const seesAttack = !!MOVES[other.move].strike && other.frame >= PLAYER_REACTION;
    if (seesAttack) return { want: 'walk_back', back: true };
    const back = holdsBack(loopMove ?? 'stand');
    if (loopMove && loopMove !== 'stand') return { want: loopMove, back };
    return { want: null, back };
  };
}

function signedDistance(me: Body, foe: Body) {
  return (foe.x - me.x) * me.facing;
}

function score(cpuIndex: 0 | 1, o: Outcome, then: MoveId | null, committed: number, ctx: PlanContext): number {
  if (o.scorer === cpuIndex) return 1 - o.t * 0.004;
  // Hit after the plan is over: it might still have got out of the way
  if (o.scorer !== null) return o.t > committed ? -0.5 : -1 + o.t * 0.002;
  const d = signedDistance(o.me, o.foe);
  let v = 0;
  if (d < 0) v -= 0.25; // ended with the opponent behind
  v -= (ctx.drive * Math.abs(d - ctx.engage)) / 120;
  // Loitering inside the reach of an attack-happy opponent
  if (d > 0 && d <= ctx.foeFar) v -= ctx.threat * 0.35;
  if (o.blocked) v -= 0.12;
  if (o.whiffed) v -= ctx.whiffCost;
  // Stuck in a move in front of a free opponent: a gift to anyone paying attention
  v -= o.exposed * 0.02;
  // Travelling moves must land somewhere useful: not past them, not inside their reach
  if (then && Math.abs(MOVES[then].travel ?? 0) > 20) {
    if (d < 0) v -= 0.3;
    else if (d <= (ctx.foeFar || longestReach())) v -= 0.8;
  }
  return v;
}

interface PlanContext {
  engage: number;
  foeFar: number;
  threat: number;
  drive: number;
  whiffCost: number;
}

/** Frames the look-ahead runs on after a plan ends, standing, to see what it walked into */
const SETTLE = 10;

function choosePlan(state: GameState, cpuIndex: 0 | 1, me: Fighter, foeNow: Body, foeNext: MoveId[], threat: number, profile: AiProfile): Plan {
  const rng = state.rng;
  const meBody = bodyOf(me);
  const foeFighter = state.fighters[1 - cpuIndex];
  const pointsBehind = foeFighter.points - me.points;
  const late = state.timeLeft < 10;
  // Press harder when behind, or level late on: a lead cannot be sat on
  const drive = profile.aggression * (pointsBehind > 0 ? 1.8 : pointsBehind === 0 && late ? 1.4 : 1);
  const needAttacks = pointsBehind === 0 && late && me.attacks <= foeFighter.attacks;
  // The opponent's reach with its recent attacks; against a busy attacker, wait just outside it
  const foeAttacks = foeNext.filter((m) => !!MOVES[m].strike && reachOf(m).far > 0);
  const foeFar = foeAttacks.length ? Math.max(...foeAttacks.map((m) => reachOf(m).far)) : 0;
  const engage = threat > 0.3 && foeFar > 0 ? Math.max(engageDistance(), foeFar + 4) : engageDistance();
  const ctx: PlanContext = { engage, foeFar, threat, drive, whiffCost: needAttacks ? 0 : 0.15 };

  const d = signedDistance(meBody, foeNow);
  const crouching = me.move === 'crouch';
  const plans: Plan[] = [];
  const evaluate = (prefix: MoveId, k: number, then: MoveId | null, committed: number) => {
    const plan = { prefix, k, then };
    const horizon = committed + SETTLE;
    // Guesses at the opponent: it calms down after its current move, or it goes
    // straight into one of its recent moves (the worst of them for this plan)
    const calm = lookAhead(cpuIndex, meBody, foeNow, planController(plan), foeController(foeNow, null), horizon);
    let value = score(cpuIndex, calm, then, committed, ctx);
    if (foeNext.length && threat > 0) {
      let worst = Infinity;
      for (const next of foeNext) {
        const o = lookAhead(cpuIndex, meBody, foeNow, planController(plan), foeController(foeNow, next), horizon);
        worst = Math.min(worst, score(cpuIndex, o, then, committed, ctx));
      }
      value = value * (1 - threat) + worst * threat;
    }
    return value;
  };
  const add = (prefix: MoveId, k: number, then: MoveId | null, committed: number) => {
    plans.push({ prefix, k, then, value: evaluate(prefix, k, then, committed) });
  };

  const attacks = ATTACKS().filter((m) => m !== 'low_punch' || crouching);
  for (const prefix of PREFIXES) {
    for (const k of prefix === 'stand' ? [0, ...WAITS] : WAITS) {
      const shift = prefix === 'walk_forward' ? k * 1.1 : prefix === 'walk_back' ? -k * 1.1 : 0;
      for (const a of attacks) {
        const r = reachOf(a);
        const dd = d - shift;
        if (dd < r.near - 8 || dd > r.far + 8) continue;
        add(prefix, k, a, k + MOVES[a].frames);
      }
      if (k <= 4) for (const e of ESCAPES) {
        if (e === 'turn' && d > 0) continue;
        add(prefix, k, e, k + (e === 'crouch' ? 12 : MOVES[e].frames));
      }
      if (k > 0) add(prefix, k, null, k);
    }
  }
  add('crouch', 9, null, 9);

  // The most promising attacks must still work if they go off a couple of frames
  // late, so the CPU does not bank on hitting a one-frame gap
  const promising = plans.filter((p) => p.value > 0.2 && p.then && MOVES[p.then].strike).sort((a, b) => b.value - a.value).slice(0, 4);
  for (const p of promising) {
    p.value = Math.min(p.value, evaluate(p.k > 0 ? p.prefix : 'stand', p.k + 2, p.then, p.k + 2 + MOVES[p.then!].frames));
  }
  // A blunder: any plan at all
  if (rng() > profile.evade) return plans[Math.floor(rng() * plans.length)];
  let best = plans[0];
  let bestV = -Infinity;
  for (const p of plans) {
    const v = p.value + rng() * 0.06;
    if (v > bestV) { bestV = v; best = p; }
  }
  return best;
}

/** Predict the perceived opponent forward to the present, assuming it carries on as seen */
function presentFoe(perceived: Body, frames: number, next: MoveId | null): Body {
  const b = copy(perceived);
  const ctl = foeController(perceived, next);
  for (let t = 1; t <= frames; t++) {
    const c = ctl(b, t, b);
    control(b, c.want, c.back);
    advance(b);
  }
  return b;
}

/** The CPU's joystick for this frame */
export function cpuInput(state: GameState, index: 0 | 1, me: Fighter, foe: Fighter): FighterInput {
  const brain = state.cpu[index];
  const profile = aiProfile(state.demo ? 4 : state.grade);
  const now = state.frameCount;
  observe(brain, foe, now, profile.reaction);
  const seen = perceive(brain, profile.reaction);
  remember(brain, seen.body, now - seen.age);

  const toJoystick = (move: MoveId): FighterInput => {
    const rel = inputFor(move, me.move === 'crouch');
    return { dir: { x: (rel.dir.x * me.facing) as -1 | 0 | 1, y: rel.dir.y }, fire: rel.fire };
  };
  const press = (move: MoveId): FighterInput => {
    brain.pressing = move;
    // Keep the stick there long enough to commit (a roundhouse needs fire held), or hold a stance a while
    brain.pressUntil = now + (MOVES[move].loop ? profile.think + 6 : (MOVES[move].abortToTurnBefore ?? 0) + 2);
    return toJoystick(move);
  };

  if (brain.pressing && now < brain.pressUntil) return toJoystick(brain.pressing);
  brain.pressing = null;
  // Busy in a move: nothing to do but wait; the next plan is made the moment it ends
  if (busy(bodyOf(me))) return NEUTRAL_INPUT;

  // A newly perceived action from the opponent cuts the current plan short
  const surprised = brain.perceivedStart > brain.reactedTo;
  if (!surprised) {
    if (now < brain.prefixUntil) return toJoystick(brain.prefix);
    if (brain.then) {
      const then = brain.then;
      brain.then = null;
      return press(then);
    }
    if (now < brain.idleUntil) return NEUTRAL_INPUT;
  }

  // Plan afresh
  brain.reactedTo = brain.perceivedStart;
  // Expect the opponent's recent moves again, weighted by how attack-happy and repetitive it has been
  const habits = habitsOf(brain);
  const threat = Math.min(1, profile.read * Math.max(habits.repeat, brain.attackRate));
  const foeNow = presentFoe(seen.body, seen.age, threat > 0.5 ? habits.moves[0] ?? null : null);
  foeNow.x += (state.rng() - 0.5) * 2 * profile.noise;

  // Only moves that can hurt are worth playing out (at most two, to keep each frame cheap)
  const dangerous = habits.moves.filter((m) => !!MOVES[m].strike).slice(0, 2);
  const plan = choosePlan(state, index, me, foeNow, dangerous, threat, profile);
  brain.prefix = plan.prefix;
  brain.prefixUntil = now + plan.k;
  brain.then = plan.then;
  brain.idleUntil = now + plan.k + 1 + profile.think;
  if (plan.k > 0) return toJoystick(plan.prefix);
  brain.then = null;
  return plan.then ? press(plan.then) : NEUTRAL_INPUT;
}
