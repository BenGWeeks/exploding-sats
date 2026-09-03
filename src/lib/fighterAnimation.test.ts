import { describe, it, expect } from 'vitest';
import { ANIMATIONS, animationLength, movesWithShortAnimations, spriteFor } from './fighterAnimation';
import { MOVES, type MoveId } from './fistEngine';
import { SPRITES, SPRITE_WIDTH, SPRITE_HEIGHT } from './fighterSprites';

describe('fighter sprites', () => {
  it('ships all 44 poses from the original at 36x72', () => {
    const indices = Object.keys(SPRITES).map(Number);
    expect(indices.length).toBe(44);
    for (const index of indices) {
      const sprite = SPRITES[index];
      expect(sprite.top + sprite.rows.length).toBe(SPRITE_HEIGHT);
      for (const row of sprite.rows) {
        expect(row.length).toBe(SPRITE_WIDTH);
        expect(/^[0-3]+$/.test(row)).toBe(true);
      }
    }
    expect(SPRITES[0].name).toBe('STANDING');
    expect(SPRITES[0x11].name).toBe('FLYING_KICK');
    expect(SPRITES[0x2e].name).toBe('FALLEN_BACKWARDS');
  });

  it('has an animation for every move that lasts the whole move', () => {
    for (const move of Object.keys(MOVES) as MoveId[]) {
      expect(ANIMATIONS[move].length).toBeGreaterThan(0);
      expect(animationLength(move)).toBe(MOVES[move].frames);
      for (const step of ANIMATIONS[move]) expect(SPRITES[step.sprite]).toBeDefined();
    }
    expect(movesWithShortAnimations()).toEqual([]);
  });

  it('shows the striking pose during the attack window', () => {
    for (const move of Object.keys(MOVES) as MoveId[]) {
      const def = MOVES[move];
      if (!def.strike) continue;
      const atStart = spriteFor(move, def.activeFrom!).sprite;
      const atEnd = spriteFor(move, def.activeTo!).sprite;
      expect(atStart).toBe(atEnd);
      expect(atStart).not.toBe(0);
    }
  });
});
