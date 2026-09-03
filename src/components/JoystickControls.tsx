import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import type { JoystickDirection } from '@/lib/fistEngine';

interface JoystickControlsProps {
  onDirection: (direction: JoystickDirection) => void;
  onFire: (pressed: boolean) => void;
  onPause?: () => void;
  sideMargin?: number;
}

const DEAD_ZONE = 14; // px from centre before a direction registers

/**
 * Touch replacement for the original 8-way joystick + fire button.
 * Left thumb: virtual joystick (8 directions). Right thumb: FIRE.
 * Holding FIRE while pushing a direction performs an attack, exactly like the C64 joystick.
 */
export function JoystickControls({ onDirection, onFire, onPause, sideMargin = 0 }: JoystickControlsProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeTouch = useRef<number | null>(null);

  const leftPos = Math.max(8, (sideMargin - 140) / 2);
  const rightPos = Math.max(8, (sideMargin - (onPause ? 160 : 96)) / 2);

  const updateFromTouch = useCallback((clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width / 2 - 12;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });

    const direction: JoystickDirection = {
      x: Math.abs(dx) < DEAD_ZONE ? 0 : dx > 0 ? 1 : -1,
      y: Math.abs(dy) < DEAD_ZONE ? 0 : dy > 0 ? 1 : -1,
    };
    onDirection(direction);
  }, [onDirection]);

  const release = useCallback(() => {
    activeTouch.current = null;
    setKnob({ x: 0, y: 0 });
    onDirection({ x: 0, y: 0 });
  }, [onDirection]);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;

    const start = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      activeTouch.current = t.identifier;
      updateFromTouch(t.clientX, t.clientY);
    };
    const move = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === activeTouch.current) {
          updateFromTouch(t.clientX, t.clientY);
        }
      }
    };
    const end = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === activeTouch.current) release();
      }
    };

    pad.addEventListener('touchstart', start, { passive: false });
    pad.addEventListener('touchmove', move, { passive: false });
    pad.addEventListener('touchend', end, { passive: false });
    pad.addEventListener('touchcancel', end, { passive: false });
    return () => {
      pad.removeEventListener('touchstart', start);
      pad.removeEventListener('touchmove', move);
      pad.removeEventListener('touchend', end);
      pad.removeEventListener('touchcancel', end);
    };
  }, [updateFromTouch, release]);

  return (
    <>
      {/* Virtual joystick - left thumb */}
      <div className="fixed bottom-4 z-40 pointer-events-auto" style={{ left: `${leftPos}px` }}>
        <div
          ref={padRef}
          className="relative w-[140px] h-[140px] rounded-full border-2 border-amber-500 bg-amber-500/15 touch-none select-none"
        >
          {/* Direction hints */}
          <span className="absolute left-1/2 top-1 -translate-x-1/2 text-amber-400 text-xs">▲</span>
          <span className="absolute left-1/2 bottom-1 -translate-x-1/2 text-amber-400 text-xs">▼</span>
          <span className="absolute top-1/2 left-1 -translate-y-1/2 text-amber-400 text-xs">◀</span>
          <span className="absolute top-1/2 right-1 -translate-y-1/2 text-amber-400 text-xs">▶</span>
          <div
            className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 rounded-full bg-amber-400/70 border-2 border-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.6)]"
            style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
          />
        </div>
      </div>

      {/* Pause + Fire - right thumb */}
      <div className="fixed bottom-4 z-40 pointer-events-auto" style={{ right: `${rightPos}px` }}>
        <div className="flex gap-3 items-end">
          {onPause && (
            <button
              className="w-14 h-14 bg-yellow-500/30 border-2 border-yellow-500 rounded-xl flex items-center justify-center active:bg-yellow-500/60 touch-none select-none"
              onTouchStart={(e) => { e.preventDefault(); onPause(); }}
            >
              <Pause className="w-7 h-7 text-yellow-400" />
            </button>
          )}
          <button
            className="w-24 h-24 bg-red-600/40 border-2 border-red-500 rounded-full flex items-center justify-center active:bg-red-500/80 touch-none select-none text-red-200 font-bold text-2xl tracking-widest"
            onTouchStart={(e) => { e.preventDefault(); onFire(true); }}
            onTouchEnd={(e) => { e.preventDefault(); onFire(false); }}
            onTouchCancel={(e) => { e.preventDefault(); onFire(false); }}
          >
            FIRE
          </button>
        </div>
      </div>
    </>
  );
}
