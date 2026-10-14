import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Search,
  CheckCircle2,
  SlidersHorizontal,
  Radio,
  Bell,
  Activity
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { AWS_SERVICES } from '../data/awsServices';
import { ServiceCard } from '../components/ServiceCard';
import { StatusBadge } from '../components/StatusBadge';
import type { ServiceCategory, ServiceUsageStatus } from '../types/cloud';

const CATEGORIES: ('All' | ServiceCategory)[] = [
  'All',
  'Compute',
  'Storage',
  'Database',
  'Security',
  'Networking',
  'Content Delivery',
  'Monitoring'
];

export const Services: React.FC = () => {
  const {
    setServiceDetailModal,
    currentRegion,
    awsRegionServices,
    awsTotalServices,
    awsAvailabilityDate,
    healthServices,
    healthAlerts,
    isHealthLoading,
    isAvailabilityLoading
  } = useCloud();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | ServiceCategory>('All');
  const [selectedStatus, setSelectedStatus] = useState<'all' | ServiceUsageStatus>('all');

  const filteredServices = useMemo(() => {
    return AWS_SERVICES.filter((srv) => {
      const matchesSearch =
        srv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        srv.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        srv.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        srv.mainFunction.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'All' || srv.category === selectedCategory;

      const matchesStatus =
        selectedStatus === 'all' || srv.usageStatus === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [searchQuery, selectedCategory, selectedStatus]);

  const activeServicesCount = AWS_SERVICES.filter((s) => s.usageStatus === 'in-use').length;

  const alertsInRegion = healthAlerts.filter(
    (a) => a.regionCode === currentRegion.code || a.regionCode === 'Global'
  );
  const outsideAlerts = healthAlerts.length - alertsInRegion.length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Catálogo de Servicios AWS
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Explora las capacidades técnicas, funciones operativas y modelos de facturación de la arquitectura Cloud.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{activeServicesCount} de {AWS_SERVICES.length} en Producción</span>
          </span>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar servicio por nombre, sigla o función (ej. EC2, RDS, VPC, base de datos...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Usage Status Filter */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="all">Todos los Estados</option>
              <option value="in-use">En uso</option>
              <option value="available">Disponible</option>
              <option value="unused">No utilizado</option>
            </select>
          </div>
        </div>

        {/* Category Pills Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat === 'All' ? 'Todas las Categorías' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live AWS Data Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
              <Radio className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[#1E293B] dark:text-white">
              Disponibilidad Regional (AWS Regional Table)
            </h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-extrabold text-[#1E293B] dark:text-white">
              {isAvailabilityLoading ? '—' : awsRegionServices.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              servicios presentes en {currentRegion.code}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 leading-snug">
            {awsTotalServices} servicios catalogados globalmente en {awsTotalServices > 0 ? 'la tabla regional de AWS' : 'AWS'}.
            {awsAvailabilityDate
              ? ` Datos consultados el ${new Date(awsAvailabilityDate).toLocaleDateString('es-PE')}.`
              : ''}
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[#1E293B] dark:text-white">
              Salud en Tiempo Real ({currentRegion.code})
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {healthServices.map((svc) => {
              const status = svc.regions[currentRegion.code];
              const isOk = status === 'online' || status === 'operational';
              const isWarn = status === 'warning';
              const isUnknown = !status;
              const chipClass = isUnknown
                ? 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                : isOk
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                  : isWarn
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70'
                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/70';
              return (
                <span
                  key={svc.serviceId}
                  title={`${svc.name}: ${isUnknown ? 'sin datos para esta región' : status}`}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${chipClass}`}
                >
                  {svc.name}
                </span>
              );
            })}
            {isHealthLoading && (
              <span className="text-[11px] text-slate-400">cargando status...</span>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-800">
              <Bell className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[#1E293B] dark:text-white">
              Alertas de AWS Health en {currentRegion.code}
            </h3>
          </div>
          {alertsInRegion.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isHealthLoading
                ? 'Consultando AWS Service Health...'
                : outsideAlerts > 0
                  ? `Sin incidentes en ${currentRegion.code}. ${outsideAlerts} alerta(s) en otras regiones quedan fuera de esta vista.`
                  : 'Sin alertas activas en AWS en este momento.'}
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {alertsInRegion.slice(0, 4).map((alert) => (
                <li key={alert.id} className="text-[11px] flex items-start gap-1.5">
                  <StatusBadge
                    status={alert.severity === 'critical' ? 'Problema' : alert.severity === 'warning' ? 'Requiere revisión' : 'Online'}
                    size="sm"
                  />
                  <span className="text-slate-700 dark:text-slate-300 leading-snug">
                    {alert.title} · <span className="text-slate-400">{alert.region}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Services Grid */}
      {filteredServices.length === 0 ? (
        <div className="bg-white dark:bg-[#1E293B] border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-12 text-center">
          <Boxes className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="font-bold text-slate-700 dark:text-slate-300 text-base">
            No se encontraron servicios
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Intenta ajustar tu búsqueda o restablecer los filtros de categoría.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSelectedStatus('all');
            }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl"
          >
            Limpiar Filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onViewDetails={(s) => setServiceDetailModal(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
