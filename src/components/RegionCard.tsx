import React from 'react';
import { MapPin, Activity, Check, Globe } from 'lucide-react';
import type { Region } from '../types/cloud';
import { StatusBadge } from './StatusBadge';
import { RegionFlag } from './RegionFlag';
import { useCloud } from '../context/CloudContext';
import { estimateLatencyMs } from '../lib/geo';

interface RegionCardProps {
  region: Region;
  isActive: boolean;
  onSelectRegion: (code: string) => void;
  liveStatus?: string;
  className?: string;
}

export const RegionCard: React.FC<RegionCardProps> = ({
  region,
  isActive,
  onSelectRegion,
  liveStatus,
  className = ''
}) => {
  const { userOrigin } = useCloud();
  const latencyMs = estimateLatencyMs(userOrigin, region);
  const effectiveStatus = liveStatus || region.status || 'online';
  const statusLabel = {
    online: 'Online',
    warning: 'Warning',
    offline: 'Offline',
    problem: 'Offline'
  }[effectiveStatus] || 'Online';

  return (
    <div
      className={`relative bg-white dark:bg-[#1E293B] border rounded-2xl p-5 shadow-sm transition-all duration-200 flex flex-col justify-between ${
        isActive
          ? 'border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-blue-500/5'
          : 'border-[#E2E8F0] dark:border-[#334155] hover:border-slate-300 dark:hover:border-slate-600'
      } ${className}`}
    >
      <div>
        {/* Top bar: Flag, Code & Status Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <RegionFlag countryCode={region.countryCode} size="md" title={region.name} />
            <div>
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 block">
                {region.code}
              </span>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white leading-snug">
                {region.name}
              </h3>
            </div>
          </div>
          <StatusBadge status={statusLabel} />
        </div>

        {/* Location & Latency */}
        <div className="grid grid-cols-2 gap-2 my-3 py-2.5 px-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
          <div className="flex items-center gap-1.5 text-[#64748B] dark:text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{region.location}</span>
          </div>
          <div className="flex items-center justify-end gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
            <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>{latencyMs} ms latencia</span>
          </div>
        </div>

        {/* Availability Zones */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3 px-1">
          <span>Zonas de Disponibilidad (AZs):</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {region.availabilityZones} AZs independientes
          </span>
        </div>

        {/* Deployed Services List */}
        <div className="mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
            Servicios Desplegados ({region.deployedServices.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {region.deployedServices.map((srv) => (
              <span
                key={srv}
                className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700"
              >
                {srv}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Select Region Button */}
      <button
        onClick={() => onSelectRegion(region.code)}
        disabled={isActive}
        className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 cursor-default'
            : 'bg-white dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-transparent shadow-sm'
        }`}
      >
        {isActive ? (
          <>
            <Check className="w-4 h-4" />
            <span>Región Activa en Dashboard</span>
          </>
        ) : (
          <>
            <Globe className="w-4 h-4" />
            <span>Fijar como Región de Trabajo</span>
          </>
        )}
      </button>
    </div>
  );
};
