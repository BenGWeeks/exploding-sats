import { useEffect, useRef, type MutableRefObject } from 'react';
import { WORLD_WIDTH, WORLD_HEIGHT, type GameState } from '@/lib/fistEngine';
import { renderWorld, hudTexts, C64 } from '@/lib/fistRenderer';

export const CANVAS_SCALE = 3;
export const CANVAS_WIDTH = WORLD_WIDTH * CANVAS_SCALE;   // 960
export const CANVAS_HEIGHT = WORLD_HEIGHT * CANVAS_SCALE; // 600

interface FistCanvasProps {
  /** Engine state lives in a ref so the canvas can redraw every frame without React re-renders */
  stateRef: MutableRefObject<GameState>;
  highScoreRef: MutableRefObject<number>;
  flashRef: MutableRefObject<{ who: 0 | 1 | null; until: number }>;
  running: boolean;
}

/**
 * Renders the 320x200 world to an offscreen canvas and scales it 3x with pixel
 * snapping, then draws the HUD text crisply on top in the original layout.
 */
export function FistCanvas({ stateRef, highScoreRef, flashRef, running }: FistCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!offscreenRef.current) {
      const off = document.createElement('canvas');
      off.width = WORLD_WIDTH;
      off.height = WORLD_HEIGHT;
      offscreenRef.current = off;
    }
    const off = offscreenRef.current;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;

    let raf = 0;
    const draw = () => {
      const state = stateRef.current;
      const flash = flashRef.current.until > performance.now() ? flashRef.current.who : null;
      renderWorld(offCtx, state, flash);

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(off, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (const t of hudTexts(state, highScoreRef.current)) {
        const size = (t.size ?? 9) * CANVAS_SCALE;
        ctx.font = `${size}px "VT323", monospace`;
        ctx.textAlign = t.align;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = t.colour ?? C64.blue;
        if (t.colour) {
          ctx.fillStyle = C64.black;
          ctx.fillText(t.text, t.x * CANVAS_SCALE + 2, t.y * CANVAS_SCALE + 2);
          ctx.fillStyle = t.colour;
        }
        ctx.fillText(t.text, t.x * CANVAS_SCALE, t.y * CANVAS_SCALE);
      }

      if (running) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [stateRef, highScoreRef, flashRef, running]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="border-4 border-amber-500 rounded-lg shadow-[0_0_30px_rgba(245,158,11,0.35)]"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
