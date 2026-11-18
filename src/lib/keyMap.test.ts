import { describe, it, expect } from 'vitest';
import { P1_KEYS, P2_KEYS } from './keyMap';

describe('keyboard map', () => {
  it('player 1 fires with left Shift or Space', () => {
    expect(P1_KEYS.ShiftLeft).toBe('fire');
    expect(P1_KEYS.Space).toBe('fire');
  });

  it('Ctrl is not a fire key (Ctrl+W would close the tab mid-match)', () => {
    const codes = [...Object.keys(P1_KEYS), ...Object.keys(P2_KEYS)];
    expect(codes.filter((code) => code.startsWith('Control'))).toEqual([]);
  });
});
