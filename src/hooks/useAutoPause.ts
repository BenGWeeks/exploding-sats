import { useEffect } from 'react';

/**
 * While `active`, call `pause` when the window loses focus or the tab is hidden,
 * so the bout clock doesn't run on while the player is looking elsewhere.
 */
export function useAutoPause(active: boolean, pause: () => void) {
  useEffect(() => {
    if (!active) return;
    const onBlur = () => pause();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, pause]);
}
