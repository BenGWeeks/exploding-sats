import { describe, it, expect } from 'vitest';
import { stickDirection } from './joystick';

const DEAD = 14;
const at = (degrees: number, radius = 50) => {
  const r = (degrees * Math.PI) / 180;
  return stickDirection(Math.cos(r) * radius, Math.sin(r) * radius, DEAD);
};

describe('touch stick', () => {
  it('is centred inside the radial dead zone, including on the diagonal', () => {
    expect(stickDirection(0, 0, DEAD)).toEqual({ x: 0, y: 0 });
    expect(stickDirection(9, 9, DEAD)).toEqual({ x: 0, y: 0 }); // 12.7 px out
    expect(stickDirection(13, 0, DEAD)).toEqual({ x: 0, y: 0 });
  });

  it('gives each of the eight directions an equal 45-degree sector', () => {
    // screen angles: 0 = right, 90 = down, -90 = up
    expect(at(0)).toEqual({ x: 1, y: 0 });
    expect(at(45)).toEqual({ x: 1, y: 1 });
    expect(at(90)).toEqual({ x: 0, y: 1 });
    expect(at(135)).toEqual({ x: -1, y: 1 });
    expect(at(180)).toEqual({ x: -1, y: 0 });
    expect(at(-135)).toEqual({ x: -1, y: -1 });
    expect(at(-90)).toEqual({ x: 0, y: -1 });
    expect(at(-45)).toEqual({ x: 1, y: -1 });
    // Cardinals own +/-22.5 degrees, not a 28 px strip
    expect(at(-90 + 20)).toEqual({ x: 0, y: -1 });
    expect(at(-90 + 25)).toEqual({ x: 1, y: -1 });
    expect(at(20)).toEqual({ x: 1, y: 0 });
    expect(at(25)).toEqual({ x: 1, y: 1 });
  });

  it('a push well off the axis toward a cardinal still reads as that cardinal', () => {
    // The old per-axis 14 px dead zone read (20, -50) as up-forward
    expect(stickDirection(20, -50, DEAD)).toEqual({ x: 0, y: -1 });
    expect(stickDirection(50, 20, DEAD)).toEqual({ x: 1, y: 0 });
  });
});
