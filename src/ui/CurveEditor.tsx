import { useEffect, useRef } from 'react';
import { sampleCurve, type Curve, type CurvePoint } from '../core/curve';

interface CurveEditorProps {
  curve: Curve;
  onChange: (curve: Curve) => void;
}

const CANVAS = 400;
const HIT = 0.06;
const MAX_POINTS = 12;

const toCanvas = (x: number, y: number): [number, number] => [x * CANVAS, (1 - y) * CANVAS];

/**
 * Drag a control point, click empty space to add one, double-click a point to
 * remove it. End points keep their x so the curve always covers the full range.
 */
export function CurveEditor({ curve, onChange }: CurveEditorProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, CANVAS, CANVAS);

    // The straight line is the reference, not decoration.
    ctx.strokeStyle = '#2f2f2f';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(0, CANVAS);
    ctx.lineTo(CANVAS, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const x = i / 96;
      const [px, py] = toCanvas(x, sampleCurve(curve, x));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    for (const point of curve) {
      const [px, py] = toCanvas(point.x, point.y);
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [curve]);

  const normalise = (event: {
    clientX: number;
    clientY: number;
    currentTarget: HTMLCanvasElement;
  }): CurvePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)),
    };
  };

  const nearest = (point: CurvePoint): number => {
    let best = -1;
    let bestDistance = HIT;
    curve.forEach((candidate, index) => {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  };

  const move = (index: number, point: CurvePoint): void => {
    const next = curve.map((p) => ({ ...p }));
    const target = next[index];
    if (!target) return;
    const lower = index === 0 ? 0 : next[index - 1]!.x + 0.01;
    const upper = index === next.length - 1 ? 1 : next[index + 1]!.x - 0.01;
    target.x = index === 0 ? 0 : index === next.length - 1 ? 1 : Math.min(upper, Math.max(lower, point.x));
    target.y = point.y;
    onChange(next);
  };

  return (
    <canvas
      ref={canvasRef}
      className="curve"
      width={CANVAS}
      height={CANVAS}
      role="application"
      aria-label="曲线编辑器"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = normalise(event);
        const index = nearest(point);
        if (index >= 0) {
          dragging.current = index;
          return;
        }
        if (curve.length >= MAX_POINTS) return;
        const next = [...curve, point].sort((a, b) => a.x - b.x);
        dragging.current = next.findIndex((p) => p.x === point.x && p.y === point.y);
        onChange(next);
      }}
      onPointerMove={(event) => {
        if (dragging.current === null) return;
        move(dragging.current, normalise(event));
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      onPointerCancel={() => {
        dragging.current = null;
      }}
      onDoubleClick={(event) => {
        const point = normalise(event);
        const index = nearest(point);
        if (index <= 0 || index >= curve.length - 1) return;
        onChange(curve.filter((_, i) => i !== index));
      }}
    />
  );
}
