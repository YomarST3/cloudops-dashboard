import React from 'react';
import { buildArcPath, arcMidpoint, arcLength, latencyBand, type Point } from '../lib/geo';

// Velocidad del brillo que recorre el arco, por banda de latencia: el verde
// (baja latencia) va rapido, el amarillo intermedio y el rojo (alta latencia)
// lento. Antes la velocidad salia de los ms, asi que el color y el ritmo no
// se correspondian.
const SWEEP_DUR: Record<'low' | 'mid' | 'high', number> = {
  low: 0.9,
  mid: 1.6,
  high: 3.0,
};

interface LatencyArcProps {
  from: Point;
  to: Point;
  latencyMs: number;
  showLabel?: boolean;
  /** Etiqueta compacta para arcos secundarios (todos a la vez). */
  compactLabel?: boolean;
}

export const LatencyArc: React.FC<LatencyArcProps> = ({
  from,
  to,
  latencyMs,
  showLabel = true,
  compactLabel = false
}) => {
  const band = latencyBand(latencyMs);
  const d = buildArcPath(from, to, band.curvature);
  const midpoint = arcMidpoint(from, to, band.curvature);
  const length = arcLength(from, to, band.curvature);

  if (!d) return null;

  const isHigh = band.id === 'high';

  return (
    <g pointerEvents="none">
      <path d={d} fill="none" stroke={band.color} strokeOpacity={0.25} strokeWidth={band.strokeWidth * 2.6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={band.color} strokeWidth={band.strokeWidth} strokeLinecap="round" strokeOpacity={0.85} />
      <path
        d={d}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.9}
        strokeWidth={Math.max(1.4, band.strokeWidth * 0.7)}
        strokeLinecap="round"
        strokeDasharray={`${length} ${length}`}
      >
        <animate attributeName="stroke-dashoffset" from={length} to={0} dur={`${SWEEP_DUR[band.id]}s`} repeatCount="indefinite" />
      </path>
      <circle cx={to.x} cy={to.y} r={6 + Math.min(5, latencyMs / 40)} fill={band.color} opacity={0.25}>
        <animate attributeName="r" values={`${6 + Math.min(5, latencyMs / 40)};${9 + Math.min(5, latencyMs / 40)};${6 + Math.min(5, latencyMs / 40)}`} dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.4s" repeatCount="indefinite" />
      </circle>

      {showLabel && (
        <g opacity={compactLabel ? 0.85 : 1}>
          <rect
            x={midpoint.x - (compactLabel ? 26 : 34)}
            y={midpoint.y - (compactLabel ? 18 : 22)}
            width={compactLabel ? 52 : 68}
            height={compactLabel ? 16 : 20}
            rx={compactLabel ? 6 : 8}
            className="fill-white dark:fill-slate-900"
            fillOpacity={compactLabel ? 0.9 : 0.94}
            stroke={band.color}
            strokeOpacity={compactLabel ? 0.4 : 0.5}
            strokeWidth={0.8}
          />
          <text
            x={midpoint.x}
            y={midpoint.y - (compactLabel ? 6 : 8)}
            textAnchor="middle"
            className="font-sans font-bold"
            style={{ fontSize: compactLabel ? 9.5 : 11, fill: band.color }}
          >
            {latencyMs} ms
          </text>
          {isHigh && !compactLabel && (
            <text x={midpoint.x} y={midpoint.y + 12} textAnchor="middle" className="font-sans" style={{ fontSize: 8, fill: band.color, opacity: 0.75 }}>
              alta latencia
            </text>
          )}
        </g>
      )}
    </g>
  );
};

export default LatencyArc;