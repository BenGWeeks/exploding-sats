import type { JoystickDirection } from '@/lib/fistEngine';

/** Eight 45-degree sectors, starting at screen-right and going clockwise (screen y points down) */
const SECTORS: JoystickDirection[] = [
  { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
  { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
];

/**
 * Turn a touch-stick offset (px from the pad centre) into an 8-way direction.
 * Inside the radial dead zone the stick is centred; outside, each of the eight
 * directions owns an equal 45-degree slice, so cardinals are as easy to hit as diagonals.
 */
export function stickDirection(dx: number, dy: number, deadZone: number): JoystickDirection {
  if (Math.hypot(dx, dy) < deadZone) return { x: 0, y: 0 };
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return SECTORS[(sector + 8) % 8];
}
