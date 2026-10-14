import React, { useState } from 'react';
import {
  Globe2,
  Activity,
  Compass,
  Radio,
  Layers
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { RegionCard } from '../components/RegionCard';
import { RegionMap } from '../components/RegionMap';
import { OriginPicker } from '../components/OriginPicker';
import { LATENCY_BANDS, estimateLatencyMs } from '../lib/geo';

export const Infrastructure: React.FC = () => {
  const { regions, selectedRegionCode, setSelectedRegionCode, currentRegion, healthRegionStatus, userOrigin, setUserOrigin, detectUserOrigin } = useCloud();
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'warning' | 'offline'>('all');

  const liveStatusOf = (code: string): 'online' | 'warning' | 'offline' => {
    const live = healthRegionStatus[code];
    if (live === 'problem') return 'offline';
    if (live === 'warning' || live === 'online') return live;
    const fallback = regions.find((r) => r.code === code)?.status || 'online';
    return fallback === 'warning' || fallback === 'offline' ? fallback : 'online';
  };

  const filteredRegions = regions.filter((r) => {
    if (filterStatus === 'all') return true;
    return liveStatusOf(r.code) === filterStatus;
  });

  // Calculate stats
  const totalAZs = regions.reduce((acc, curr) => acc + curr.availabilityZones, 0);
  const averageLatency = Math.round(
    regions.reduce((acc, curr) => acc + estimateLatencyMs(userOrigin, curr), 0) / regions.length
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Infraestructura Global AWS
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Topología multirregión con Zonas de Disponibilidad (AZs), latencias de red y servicios desplegados. Estado de cada región en tiempo real desde AWS Service Health Dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            AWS Service Health
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Región Activa: {currentRegion.name} ({currentRegion.code})
          </span>
        </div>
      </div>

      {/* Global Infrastructure Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Regiones Monitoreadas
            </span>
            <Globe2 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-[#1E293B] dark:text-white">
            {regions.length}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Centros de datos en 4 continentes
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Zonas de Disponibilidad
            </span>
            <Layers className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-3xl font-bold text-[#1E293B] dark:text-white">
            {totalAZs} AZs
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Aislamiento eléctrico y físico independiente
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Latencia Promedio
            </span>
            <Activity className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-3xl font-bold text-emerald-600">
            {averageLatency} ms
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Referencia estimada de red por región
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Puntos Edge (CloudFront)
            </span>
            <Radio className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-[#F59E0B]">
            400+ PoPs
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Caché perimetral global de baja latencia
          </p>
        </div>
      </div>

      {/* Global Map with Latency Arcs */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Mapa Global de Regiones
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
              Cada región está conectada al punto de origen mediante un arco cuya altura, grosor y color codifican su latencia de referencia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
            {LATENCY_BANDS.map((band) => (
              <span key={band.id} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
                  <path d="M1 9 Q 11 1 21 9" fill="none" stroke={band.color} strokeWidth={band.strokeWidth} strokeLinecap="round" />
                </svg>
                {band.label}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <OriginPicker
            origin={userOrigin}
            onSelectPreset={(next) => {
              setUserOrigin(next);
            }}
            onDetect={detectUserOrigin}
          />

          <RegionMap
            regions={regions}
            selectedRegionCode={selectedRegionCode}
            onSelectRegion={setSelectedRegionCode}
            liveStatusOf={liveStatusOf}
            isDimmed={(code) => filterStatus !== 'all' && liveStatusOf(code) !== filterStatus}
            origin={userOrigin}
          />

          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Las latencias se calculan a partir de la distancia geodésica entre el origen seleccionado y cada región, sobre una velocidad de fibra realista (~200.000 km/s con enrutamiento real). Cambia el origen para recalcular todo el mapa.
          </p>
        </div>
      </div>

      {/* Filter and Description Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
            Filtrar por Estado:
          </span>
          {(['all', 'online', 'warning', 'offline'] as const).map((st) => {
            const labels = { all: 'Todas', online: 'Online', warning: 'Warning', offline: 'Offline' };
            const isActive = filterStatus === st;
            return (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold capitalize transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {labels[st]}
              </button>
            );
          })}
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          Haz clic en cualquier región para establecerla como activa en todo el sistema.
        </span>
      </div>

      {/* Region Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRegions.map((region) => (
          <RegionCard
            key={region.id}
            region={region}
            isActive={region.code === selectedRegionCode}
            onSelectRegion={setSelectedRegionCode}
            liveStatus={liveStatusOf(region.code)}
          />
        ))}
      </div>

      {/* Educational Concept Callout: Regions vs Availability Zones */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/60 border border-blue-200 dark:border-slate-700 rounded-3xl p-6 sm:p-7">
        <h3 className="font-bold text-base text-blue-900 dark:text-blue-200 flex items-center gap-2 mb-2">
          <Compass className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Conceptos Fundamentales de la Infraestructura Global de AWS
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
          <div className="p-4 bg-white/80 dark:bg-slate-900/60 rounded-2xl border border-blue-100 dark:border-slate-700">
            <h4 className="font-bold text-slate-800 dark:text-white mb-1">
              1. Región Geográfica
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Área geográfica física en el mundo con múltiples zonas de disponibilidad aisladas y conectadas mediante redes privadas dedicadas de ultrabaja latencia.
            </p>
          </div>

          <div className="p-4 bg-white/80 dark:bg-slate-900/60 rounded-2xl border border-blue-100 dark:border-slate-700">
            <h4 className="font-bold text-slate-800 dark:text-white mb-1">
              2. Zonas de Disponibilidad (AZ)
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Uno o más centros de datos discretos con alimentación, refrigeración y seguridad física independientes. El despliegue Multi-AZ evita caídas totales.
            </p>
          </div>

          <div className="p-4 bg-white/80 dark:bg-slate-900/60 rounded-2xl border border-blue-100 dark:border-slate-700">
            <h4 className="font-bold text-slate-800 dark:text-white mb-1">
              3. Puntos de Presencia (Edge)
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Ubicaciones globales perimetrales donde opera CloudFront CDN y Route 53 para entregar contenido a los clientes con la menor latencia posible.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
