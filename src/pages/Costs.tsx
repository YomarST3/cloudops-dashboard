import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  PlusCircle,
  Trash2,
  Calendar,
  PieChart as PieIcon,
  BarChart3,
  RotateCcw,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { useCloud } from '../context/CloudContext';
import { AWS_SERVICES } from '../data/awsServices';

const COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B', '#F97316'];

export const Costs: React.FC = () => {
  const {
    costItems,
    addCostItem,
    deleteCostItem,
    updateCostQuantity,
    resetCosts,
    totalMonthlyCost,
    totalAnnualCost,
    currentRegion,
    awsPricingDate,
    isPricingLoading,
    refreshAwsData,
    defaultUnitCost,
    awsPriceSource
  } = useCloud();

  // New item form state
  const [selectedServiceId, setSelectedServiceId] = useState(AWS_SERVICES[0].id);
  const [quantity, setQuantity] = useState<number>(1);
  const [estimatedHours, setEstimatedHours] = useState<number>(720);
  const [customUnitCost, setCustomUnitCost] = useState<number>(
    defaultUnitCost(AWS_SERVICES[0].id) ?? AWS_SERVICES[0].monthlyBaseCost
  );
  const [unitCostDirty, setUnitCostDirty] = useState(false);
  const [notes, setNotes] = useState<string>('');

  // Keep the "Costo Unitario" field aligned with the real AWS price once it loads,
  // unless the user has manually edited the value.
  useEffect(() => {
    if (unitCostDirty) return;
    const real = defaultUnitCost(selectedServiceId);
    if (real !== undefined) {
      setCustomUnitCost(real);
    }
  }, [selectedServiceId, defaultUnitCost, unitCostDirty]);

  const handleServiceChange = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setUnitCostDirty(false);
    const srv = AWS_SERVICES.find((s) => s.id === serviceId);
    if (srv) {
      setCustomUnitCost(defaultUnitCost(srv.id) ?? srv.monthlyBaseCost);
    }
  };

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    const service = AWS_SERVICES.find((s) => s.id === selectedServiceId);
    if (!service) return;

    addCostItem({
      serviceId: service.id,
      serviceName: `${service.name} (${service.code})`,
      category: service.category,
      quantity: Math.max(1, quantity),
      estimatedHours: Number(estimatedHours) || 720,
      unitCost: Number(customUnitCost) >= 0 ? Number(customUnitCost) : 0,
      notes: notes.trim() || `Configuración estándar ${defaultUnitCost(service.id) ? 'con precio real de AWS' : 'de referencia'} para ${service.code}`
    });

    setNotes('');
  };

  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);

  // Chart data
  const chartData = costItems.map((item) => ({
    name: item.serviceName.split('(')[0].trim().replace('Amazon ', '').replace('AWS ', ''),
    mensual: item.monthlyCost,
    anual: item.annualCost,
    categoria: item.category
  }));

  // Category aggregate for bar chart
  const categoryAggregate = costItems.reduce<Record<string, number>>((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.monthlyCost;
    return acc;
  }, {});

  const barData = Object.entries(categoryAggregate).map(([cat, total]) => ({
    categoria: cat,
    costo: total
  }));

  const selectedService = AWS_SERVICES.find((s) => s.id === selectedServiceId);

  // Servicios de Red y Seguridad (VPC/IAM parten en $0; crecen con Route53, CloudFront, etc.)
  const redSeguridadCategories = ['Networking', 'Security', 'Content Delivery'];
  const redSeguridadItems = costItems.filter((i) => redSeguridadCategories.includes(i.category));
  const redSeguridadMonthly = redSeguridadItems.reduce((acc, i) => acc + i.monthlyCost, 0);

  // Vista previa en vivo del formulario
  const previewQty = Math.max(1, Number(quantity) || 1);
  const previewUnit = Number.isFinite(customUnitCost) ? customUnitCost : 0;
  const previewMonthly = previewQty * previewUnit;
  const previewNewTotal = totalMonthlyCost + previewMonthly;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Costos y Economía Cloud
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Calculadora y estimador de costos operativos en AWS con proyección mensual y anual (mensual × 12).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={refreshAwsData}
            title="Actualizar precios desde AWS Pricing API"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPricingLoading ? 'animate-spin' : ''}`} />
            <span>
              Precios reales{awsPricingDate ? ` · ${new Date(awsPricingDate).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} UTC` : ''}
            </span>
          </button>

          <button
            onClick={resetCosts}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer Valores Iniciales</span>
          </button>
        </div>
      </div>

      {/* Top Total Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            <span>Costo Total Mensual</span>
            <DollarSign className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-[#1E293B] dark:text-white">
            {formatUSD(totalMonthlyCost)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {awsPricingDate ? 'Unitarios reales desde AWS Pricing API' : 'Basado en ' + costItems.length + ' servicios registrados en catálogo'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            <span>Costo Total Anual</span>
            <Calendar className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-[#F59E0B]">
            {formatUSD(totalAnnualCost)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Fórmula requerida: <span className="font-mono font-semibold">Costo Mensual × 12</span>
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            <span>Servicios de Red y Seguridad</span>
            <Sparkles className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-blue-600 dark:text-blue-400">
            {formatUSD(redSeguridadMonthly)} / mes
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {redSeguridadItems.length > 0
              ? `${redSeguridadItems.length} servicios de red y seguridad presupuestados`
              : 'VPC e IAM no generan costo base de infraestructura'}
          </p>
        </div>
      </div>

      {/* Add / Register Service Cost Form */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-[#F59E0B]">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1E293B] dark:text-white">
              Registrar o Estimar Servicio Cloud
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Selecciona un servicio AWS, asigna cantidad, horas estimadas y calcula su impacto financiero.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddService} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Service selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Servicio Cloud
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {AWS_SERVICES.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} ({srv.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Cantidad de Recursos
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Hours */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Horas Estimadas / Mes
              </label>
              <input
                type="number"
                min={1}
                max={744}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                720 hrs = 24/7 mes continuo
              </span>
            </div>

            {/* Unit cost */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Costo Unitario ($/mes)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={customUnitCost}
                onChange={(e) => {
                  setCustomUnitCost(Number(e.target.value));
                  setUnitCostDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {defaultUnitCost(selectedServiceId) !== undefined && (() => {
                const src = awsPriceSource(selectedServiceId);
                return (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 block">
                    Precio AWS {src === 'snapshot' ? `(referencia · ${currentRegion.code})` : `real (${currentRegion.code})`}:{' '}
                    {formatUSD(defaultUnitCost(selectedServiceId) as number)}/mes
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-4 py-3 text-xs text-blue-800 dark:text-blue-200">
            Vas a añadir: <strong>{previewQty} × {selectedService?.name} ({selectedService?.code} @ {formatUSD(previewUnit)}/mes)</strong> → Costo mensual{' '}
            <strong>{formatUSD(previewMonthly)}</strong>. El total pasaría de {formatUSD(totalMonthlyCost)} a{' '}
            <strong>{formatUSD(previewNewTotal)} / mes</strong>.
          </div>

          {/* Notes and Submit */}
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Notas y Especificaciones de Configuración (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Instancias con autoscaling, volumen gp3 de 100GB, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Añadir a la Tabla</span>
            </button>
          </div>
        </form>
      </div>

      {/* Tabla de Costos Detallada */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-4 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div>
            <h2 className="text-base font-bold text-[#1E293B] dark:text-white">
              Tabla de Presupuesto y Estimación Detallada
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Desglose servicio por servicio con cálculo mensual y anual automatizado
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {costItems.length} componentes presupuestados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700/80 text-slate-400 uppercase font-bold tracking-wider">
                <th className="pb-3 px-3">Servicio Cloud</th>
                <th className="pb-3 px-3">Categoría</th>
                <th className="pb-3 px-3 text-center">Cantidad</th>
                <th className="pb-3 px-3 text-right">Horas/mes</th>
                <th className="pb-3 px-3 text-right">Unitario</th>
                <th className="pb-3 px-3 text-right">Costo Mensual</th>
                <th className="pb-3 px-3 text-right">Costo Anual</th>
                <th className="pb-3 px-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {costItems.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                    <div>
                      <span>{item.serviceName}</span>
                      {item.notes && (
                        <p className="text-[11px] text-slate-400 font-normal mt-0.5 line-clamp-1">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                      {item.category}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-center">
                    <div className="inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-0.5">
                      <button
                        onClick={() => updateCostQuantity(item.id, item.quantity - 1)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold px-1"
                      >
                        -
                      </button>
                      <span className="font-bold text-slate-800 dark:text-white px-1">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateCostQuantity(item.id, item.quantity + 1)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold px-1"
                      >
                        +
                      </button>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                    {item.estimatedHours} hrs
                  </td>

                  <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                    {formatUSD(item.unitCost)}
                  </td>

                  <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-white">
                    {formatUSD(item.monthlyCost)}
                  </td>

                  <td className="py-3 px-3 text-right font-bold text-[#F59E0B]">
                    {formatUSD(item.annualCost)}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => deleteCostItem(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Eliminar de la estimación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold text-sm bg-slate-50/60 dark:bg-slate-800/40">
                <td colSpan={5} className="py-4 px-3 text-slate-800 dark:text-white uppercase tracking-wider text-xs">
                  Totales Consolidados (Mensual y Anual = mensual × 12)
                </td>
                <td className="py-4 px-3 text-right text-base text-blue-600 dark:text-blue-400">
                  {formatUSD(totalMonthlyCost)}
                </td>
                <td className="py-4 px-3 text-right text-base text-[#F59E0B]">
                  {formatUSD(totalAnnualCost)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Gráficos Interactivos de Distribución de Costos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pie Chart: Por Servicio */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2 pb-4 mb-2 border-b border-slate-100 dark:border-slate-800">
            <PieIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-base text-[#1E293B] dark:text-white">
              Distribución Porcentual por Servicio
            </h3>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.filter((d) => d.mensual > 0)}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={3}
                  dataKey="mensual"
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(val: any) => [formatUSD(Number(val || 0)), 'Costo Mensual']}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#F8FAFC',
                    fontSize: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: Por Categoría */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2 pb-4 mb-2 border-b border-slate-100 dark:border-slate-800">
            <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-base text-[#1E293B] dark:text-white">
              Costo Mensual por Categoría AWS ($ USD)
            </h3>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  formatter={(val: any) => [formatUSD(Number(val || 0)), 'Gasto Mensual']}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#F8FAFC',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="costo" fill="#2563EB" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
