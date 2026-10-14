import React, { useState, useMemo } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import type { Region, UserOrigin } from '../types/cloud';
import { MAP_WIDTH, MAP_HEIGHT, projectToXY, haversineKm, estimateLatencyMs, latencyBand, latencyToQuality, type Point } from '../lib/geo';
import { CountryMap } from './CountryMap';
import { LatencyArc } from './LatencyArc';
import { StatusBadge } from './StatusBadge';
import { RegionFlag } from './RegionFlag';

interface RegionMapProps {
  regions: Region[];
  selectedRegionCode: string;
  onSelectRegion: (code: string) => void;
  liveStatusOf: (code: string) => string;
  isDimmed: (code: string) => boolean;
  origin: UserOrigin;
}

const MARKER_COLOR: Record<string, string> = {
  online: '#10b981',
  warning: '#f59e0b',
  offline: '#ef4444'
};

export const RegionMap: React.FC<RegionMapProps> = ({
  regions,
  selectedRegionCode,
  onSelectRegion,
  liveStatusOf,
  isDimmed,
  origin
}) => {
  const [hovered, setHovered] = useState<string | null>(null);

  const highlightedCountries = useMemo(() => {
    const set = new Set<string>();
    for (const region of regions) {
      for (const countryId of region.countryIds || []) set.add(countryId);
    }
    return set;
  }, [regions]);

  const originPoint: Point = projectToXY(origin);
  const selected = regions.find((r) => r.code === selectedRegionCode);
  const hoveredRegion = regions.find((r) => r.code === hovered);

  // La latencia depende del origen elegido, no del catálogo estático: al
  // mover el punto de partida los arcos, colores y etiquetas se recalculan.
  const latencyFor = (region: Region) => estimateLatencyMs(origin, region);

  const tooltipRegion = hoveredRegion;
  const tooltipPoint = tooltipRegion ? projectToXY(tooltipRegion) : null;
  const tooltipLatency = tooltipRegion ? latencyFor(tooltipRegion) : null;

  const selectedBand = selected ? latencyBand(latencyFor(selected)) : null;
  const selectedLatency = selected ? latencyFor(selected) : null;
  const selectedDistance = selected ? haversineKm(origin, selected) : null;

  return (
    <div className="relative">
      <div className="bg-gradient-to-b from-slate-100/70 to-slate-50/40 dark:from-slate-800/40 dark:to-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="w-full h-auto block"
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Mapa global de regiones AWS con líneas de latencia desde tu ubicación"
        >
          <CountryMap highlighted={highlightedCountries} />

          <g opacity={0.35}>
            {[-60, -30, 0, 30, 60].map((lat) => (
              <line
                key={`lat-${lat}`}
                x1={0}
                x2={MAP_WIDTH}
                y1={((90 - lat) / 180) * MAP_HEIGHT}
                y2={((90 - lat) / 180) * MAP_HEIGHT}
                className="stroke-slate-400 dark:stroke-slate-500"
                strokeWidth={0.4}
                strokeDasharray={lat === 0 ? '0' : '3 7'}
              />
            ))}
            {[-120, -60, 0, 60, 120].map((lng) => (
              <line
                key={`lng-${lng}`}
                x1={((lng + 180) / 360) * MAP_WIDTH}
                x2={((lng + 180) / 360) * MAP_WIDTH}
                y1={0}
                y2={MAP_HEIGHT}
                className="stroke-slate-400 dark:stroke-slate-500"
                strokeWidth={0.4}
                strokeDasharray={lng === 0 ? '0' : '3 7'}
              />
            ))}
          </g>

          <g>
            {regions.map((region) => {
              const dimmed = isDimmed(region.code);
              // La region activa se dibuja aparte, debajo, con su etiqueta
              // completa. Aqui solo van las secundarias.
              if (region.code === selectedRegionCode) return null;
              return (
                <g
                  key={`arc-${region.code}`}
                  opacity={dimmed ? 0.15 : 1}
                  style={{ transition: 'opacity 300ms ease' }}
                >
                  <LatencyArc
                    from={originPoint}
                    to={projectToXY(region)}
                    latencyMs={latencyFor(region)}
                    showLabel
                    compactLabel
                  />
                </g>
              );
            })}
          </g>

          {selected && (
            <g key={`active-arc-${selected.code}`}>
              <LatencyArc from={originPoint} to={projectToXY(selected)} latencyMs={latencyFor(selected)} showLabel />
            </g>
          )}

          <g>
            <circle cx={originPoint.x} cy={originPoint.y} r={11} fill="#2563eb" opacity={0.22}>
              <animate attributeName="r" values="11;16;11" dur="2.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.04;0.3" dur="2.6s" repeatCount="indefinite" />
            </circle>
            <circle cx={originPoint.x} cy={originPoint.y} r={5} fill="#2563eb" stroke="#ffffff" strokeWidth={1.6} />
          </g>

          <g>
            {regions.map((region) => {
              const { x, y } = projectToXY(region);
              const isActive = region.code === selectedRegionCode;
              const dimmed = isDimmed(region.code);
              const status = liveStatusOf(region.code);
              const color = MARKER_COLOR[status] || MARKER_COLOR.online;
              const radius = isActive ? 8 : 5.5;

              const labelAnchor = x > MAP_WIDTH - 120 ? 'end' : x < 120 ? 'start' : 'middle';
              const labelOffset = labelAnchor === 'end' ? -14 : labelAnchor === 'start' ? 14 : 0;

              return (
                <g
                  key={region.code}
                  opacity={dimmed ? 0.25 : 1}
                  style={{ transition: 'opacity 300ms ease', cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(region.code)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(region.code)}
                  onBlur={() => setHovered(null)}
                  onClick={() => onSelectRegion(region.code)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectRegion(region.code);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Región ${region.name}, ${region.code}, ${latencyFor(region)} milisegundos de latencia desde tu ubicación, ${region.availabilityZones} zonas de disponibilidad`}
                  aria-pressed={isActive}
                >
                  <circle cx={x} cy={y} r={18} fill="transparent" />

                  {isActive && (
                    <circle cx={x} cy={y} r={13} fill="#2563eb" opacity={0.25}>
                      <animate attributeName="r" values="13;20;13" dur="2.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.35;0.02;0.35" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={isActive ? '#2563eb' : color}
                    stroke="#ffffff"
                    strokeWidth={isActive ? 2.4 : 1.8}
                  />

                  {(isActive || hovered === region.code) && (
                    <text
                      x={x + labelOffset}
                      y={y - 13}
                      textAnchor={labelAnchor}
                      className="font-sans font-bold"
                      style={{ fontSize: isActive ? 12 : 10, fill: isActive ? '#2563eb' : '#475569' }}
                    >
                      {region.code}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3 px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          Tu ubicación ({origin.label})
        </span>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          Online
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          Warning
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          Offline
        </span>
      </div>

      {tooltipRegion && tooltipPoint && (
        <div
          className="absolute z-10 w-60 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-3.5 pointer-events-none"
          style={{
            left: `${(tooltipPoint.x / MAP_WIDTH) * 100}%`,
            top: `${((tooltipPoint.y - 14) / MAP_HEIGHT) * 100}%`,
            transform: tooltipPoint.x > MAP_WIDTH - 200 ? 'translate(-100%, -100%)' : 'translate(0, -100%)'
          }}
        >
          <div className="flex items-start gap-2 mb-2">
            <RegionFlag countryCode={tooltipRegion.countryCode} size="sm" title={tooltipRegion.name} />
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 block">{tooltipRegion.code}</span>
              <span className="text-xs font-bold text-slate-800 dark:text-white leading-snug block truncate">{tooltipRegion.name}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <StatusBadge status={liveStatusOf(tooltipRegion.code) === 'problem' ? 'Offline' : liveStatusOf(tooltipRegion.code)} />
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-md"
              style={{ color: latencyBand(tooltipLatency ?? 0).color, backgroundColor: `${latencyBand(tooltipLatency ?? 0).color}1a` }}
            >
              {tooltipLatency} ms
            </span>
          </div>

          <dl className="text-[11px] space-y-1 text-slate-600 dark:text-slate-400">
            <div className="flex justify-between">
              <dt className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Ubicación
              </dt>
              <dd className="font-semibold text-slate-700 dark:text-slate-200 truncate ml-2">{tooltipRegion.location}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Distancia desde tu origen</dt>
              <dd className="font-semibold text-slate-700 dark:text-slate-200 ml-2">{haversineKm(origin, tooltipRegion).toLocaleString()} km</dd>
            </div>
            <div className="flex justify-between">
              <dt>Zonas de disponibilidad</dt>
              <dd className="font-semibold text-slate-700 dark:text-slate-200 ml-2">{tooltipRegion.availabilityZones} AZs</dd>
            </div>
            <div className="flex justify-between">
              <dt>Servicios</dt>
              <dd className="font-semibold text-slate-700 dark:text-slate-200 ml-2">{tooltipRegion.deployedServices.length}</dd>
            </div>
          </dl>

          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 leading-relaxed">
            {latencyToQuality(tooltipLatency ?? 0)}
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Región en el mapa</span>
          {selected ? (
            <>
              <span className="text-sm font-bold text-slate-800 dark:text-white block">{selected.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selectedLatency} ms · {selectedDistance?.toLocaleString()} km · {selected.availabilityZones} AZs
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">Selecciona una región en el mapa</span>
          )}
        </div>

        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Banda de latencia</span>
          {selectedBand && selected ? (
            <>
              <span className="text-sm font-bold block" style={{ color: selectedBand.color }}>
                {selectedBand.label}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{latencyToQuality(selectedLatency ?? 0)}</span>
            </>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
          )}
        </div>

        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Lectura del mapa</span>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-1.5">
            <Crosshair className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
            Cuanto más alto el arco y más gruesa la línea, mayor la latencia de referencia hacia esa región.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegionMap;