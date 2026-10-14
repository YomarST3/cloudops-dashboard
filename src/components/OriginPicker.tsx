import React, { useState } from 'react';
import { Crosshair, Loader2, ChevronDown, MapPin } from 'lucide-react';
import { ORIGIN_PRESETS } from '../data/userOrigin';
import type { UserOrigin } from '../types/cloud';

interface OriginPickerProps {
  origin: UserOrigin;
  onSelectPreset: (origin: UserOrigin) => void;
  onDetect: () => Promise<UserOrigin>;
}

function presetKey(preset: UserOrigin): string {
  return `${preset.lat},${preset.lng}`;
}

export const OriginPicker: React.FC<OriginPickerProps> = ({ origin, onSelectPreset, onDetect }) => {
  const [detecting, setDetecting] = useState(false);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      await onDetect();
    } finally {
      setDetecting(false);
    }
  };

  // Si el origen actual no viene de un preset (geolocalizacion real), el
  // select no debe fingir que hay una opcion seleccionada.
  const currentKey = presetKey(origin);
  const isPreset = ORIGIN_PRESETS.some((p) => presetKey(p) === currentKey);

  const groups = ORIGIN_PRESETS.reduce<Record<string, UserOrigin[]>>((acc, preset) => {
    const key = preset.group || 'Otros';
    (acc[key] ||= []).push(preset);
    return acc;
  }, {});

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl">
      <div className="flex items-center gap-2 min-w-0">
        <Crosshair className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
          Origen
        </span>
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">
          {origin.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={isPreset ? currentKey : ''}
            onChange={(event) => {
              const found = ORIGIN_PRESETS.find((p) => presetKey(p) === event.target.value);
              if (found) onSelectPreset(found);
            }}
            aria-label="Seleccionar capital de origen"
            className="appearance-none w-full sm:w-56 pl-8 pr-8 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
          >
            {!isPreset && <option value="">Tu ubicación detectada</option>}
            {Object.entries(groups).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((preset) => (
                  <option key={presetKey(preset)} value={presetKey(preset)}>
                    {preset.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <button
          onClick={handleDetect}
          disabled={detecting}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
        >
          {detecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
          Mi ubicación
        </button>
      </div>
    </div>
  );
};

export default OriginPicker;