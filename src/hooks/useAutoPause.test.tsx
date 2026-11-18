import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoPause } from './useAutoPause';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('useAutoPause', () => {
  afterEach(() => setVisibility('visible'));

  it('pauses when the window loses focus', () => {
    const pause = vi.fn();
    renderHook(() => useAutoPause(true, pause));
    window.dispatchEvent(new Event('blur'));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('pauses when the tab is hidden, not when it becomes visible', () => {
    const pause = vi.fn();
    renderHook(() => useAutoPause(true, pause));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pause).not.toHaveBeenCalled();
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('does nothing while inactive (no match running, or already paused)', () => {
    const pause = vi.fn();
    const { rerender, unmount } = renderHook(({ active }) => useAutoPause(active, pause), { initialProps: { active: false } });
    window.dispatchEvent(new Event('blur'));
    expect(pause).not.toHaveBeenCalled();
    rerender({ active: true });
    window.dispatchEvent(new Event('blur'));
    expect(pause).toHaveBeenCalledTimes(1);
    unmount();
    window.dispatchEvent(new Event('blur'));
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
