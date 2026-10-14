import React from 'react';
import { WORLD_PATHS } from '../data/worldPaths';
import { MAP_WIDTH, MAP_HEIGHT } from '../lib/geo';

interface CountryMapProps {
  /** ADM0_A3 de los países que tienen alguna región AWS. */
  highlighted: Set<string>;
  className?: string;
}

/**
 * Mapa mundial con geometría real de Natural Earth 110m (dominio público).
 * Los paths llegan ya proyectados desde scripts/gen-world-map.mjs, así que
 * este componente no hace ninguna conversión geométrica en runtime.
 */
export const CountryMap: React.FC<CountryMapProps> = ({ highlighted, className = '' }) => {
  return (
    <g className={className}>
      <defs>
        <linearGradient id="ocean-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="map-ocean-from" />
          <stop offset="100%" className="map-ocean-to" />
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#ocean-gradient)" />

      <g className="map-land-shadow">
        {WORLD_PATHS.map((country) => {
          const isHighlighted = highlighted.has(country.id);
          return (
            <path
              key={country.id}
              d={country.d}
              className={
                isHighlighted
                  ? 'fill-blue-500/30 dark:fill-blue-500/35 stroke-blue-400'
                  : 'fill-slate-200 dark:fill-slate-700 stroke-white/60 dark:stroke-slate-600/70'
              }
              strokeWidth={isHighlighted ? 0.7 : 0.4}
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'fill 300ms ease, stroke 300ms ease' }}
            />
          );
        })}
      </g>
    </g>
  );
};

export default CountryMap;