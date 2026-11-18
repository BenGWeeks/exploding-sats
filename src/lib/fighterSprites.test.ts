import { describe, it, expect } from 'vitest';
import { POSES, POSE_IDS, spriteData, SPRITE_WIDTH, SPRITE_HEIGHT } from './fighterSprites';
import { skeleton, drawPose, poseBounds, MAX_STRETCH, type Pose, type Vec } from './fighterRig';
import { ATTACK_TIMING } from './fighterAnimation';
import { MOVES, STAND_HEIGHT, CROUCH_HEIGHT, type MoveId } from './fistEngine';

/** The points that can strike: both fists and the toe tips */
function strikingTips(p: Pose): Vec[] {
  const s = skeleton(p);
  const toe = (foot: Vec, dir: Vec = { x: 1, y: 0 }) => {
    const l = Math.hypot(dir.x, dir.y) || 1;
    return { x: foot.x + (dir.x / l) * 3.6, y: foot.y + (dir.y / l) * 3.6 };
  };
  return [s.nearHand, s.farHand, toe(s.nearFoot, p.nearToe), toe(s.farFoot, p.farToe)];
}

describe('fighter poses', () => {
  it('rasterises every pose to the fighter grid', () => {
    for (const id of POSE_IDS) {
      const { rows } = spriteData(id);
      expect(rows.length).toBe(SPRITE_HEIGHT);
      for (const row of rows) {
        expect(row.length).toBe(SPRITE_WIDTH);
        expect(/^[0-4]+$/.test(row)).toBe(true);
      }
      expect(rows.join('')).toMatch(/[1-4]/);
    }
  });

  it('keeps limbs close to their natural length', () => {
    for (const id of POSE_IDS) expect(skeleton(POSES[id]).stretch, id).toBeLessThanOrEqual(MAX_STRETCH);
  });

  it('puts a fist or foot on the engine strike point during each attack', () => {
    for (const [move, timing] of Object.entries(ATTACK_TIMING)) {
      const strike = MOVES[move as MoveId].strike!;
      const sign = timing!.strike.flip ? -1 : 1;
      const best = Math.min(...strikingTips(POSES[timing!.strike.pose]).map((t) => Math.hypot(t.x * sign - strike.x, t.y - strike.y)));
      expect(best, move).toBeLessThanOrEqual(strike.reach);
    }
  });

  it('fits the standing and crouching poses inside the hurt-box height', () => {
    const standing = ['stance', 'stance_breathe', 'walk_1', 'walk_2', 'walk_3', 'turn', 'punch_chamber', 'jab', 'high_punch', 'block_low', 'attention'] as const;
    for (const id of standing) {
      const b = poseBounds(drawPose(POSES[id]))!;
      expect(b.top, id).toBeGreaterThanOrEqual(-STAND_HEIGHT - 1);
      expect(b.bottom, id).toBeLessThanOrEqual(1);
    }
    for (const id of ['crouch', 'sweep', 'sweep_low', 'low_punch'] as const) {
      expect(poseBounds(drawPose(POSES[id]))!.top, id).toBeGreaterThanOrEqual(-CROUCH_HEIGHT - 2);
    }
  });
});
