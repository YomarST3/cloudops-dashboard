import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Wrench,
  ShieldCheck,
  RefreshCw,
  Zap,
  DollarSign,
  Leaf,
  Download,
  FileText,
  Printer,
  Award,
  TrendingUp,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { useCloud } from '../context/CloudContext';
import { StatusBadge } from '../components/StatusBadge';
import { computeSecurityScore } from '../lib/liveMetrics';
import { WORKLOAD_PILLARS, SCORE_HISTORY, COMPLIANCE_PERCENT, type WorkloadPillar } from '../data/reports';
import { COMPLIANCE_FRAMEWORKS } from '../data/security';

const TOOLTIP_STYLE = {
  backgroundColor: '#0F172A',
  borderColor: '#334155',
  borderRadius: '12px',
  color: '#F8FAFC',
  fontSize: '12px'
};

const pillarIcons: Record<string, LucideIcon> = {
  operational: Wrench,
  security: ShieldCheck,
  reliability: RefreshCw,
  performance: Zap,
  cost: DollarSign,
  sustainability: Leaf
};

const ScoreBar: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 90 ? 'bg-emerald-500' : score >= 80 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${score}%` }} />
    </div>
  );
};

export const Reports: React.FC = () => {
  const {
    currentRegion,
    showToast,
    awsPrices,
    awsPricingDate,
    awsPriceSource,
    healthServices,
    healthAlerts,
    healthUpdatedAt,
    awsRegionServices,
    awsTotalRegions,
    awsTotalServices,
    awsIpSummary,
    awsAvailabilityDate,
    isHealthLoading
  } = useCloud();

  const estadoSalud = (status?: string) =>
    status === 'online' || status === 'operational'
      ? 'operativo'
      : status === 'warning'
        ? 'degradado'
        : status === 'problem'
          ? 'incidente'
          : 'sin datos';

  const overall = Math.round(WORKLOAD_PILLARS.reduce((acc, p) => acc + p.score, 0) / WORKLOAD_PILLARS.length);
  const grade = overall >= 90 ? 'A+' : overall >= 80 ? 'A' : overall >= 70 ? 'B' : overall >= 60 ? 'C' : 'D';

  const posture = computeSecurityScore({
    regionServices: awsRegionServices,
    healthServices,
    regionCode: currentRegion.code,
    alerts: healthAlerts
  });

  const radarData = WORKLOAD_PILLARS.map((p) => ({ name: p.shortName, value: p.score, fullMark: 100 }));

  const liveDataPayload = () => ({
    region: currentRegion.code,
    posturaDerivada: {
      score: posture.score,
      estado: posture.status,
      coberturaSeguridad: `${posture.securityAvailable}/${posture.securityTotal}`,
      saludNucleo: `${posture.coreOnline}/${posture.coreTotal}`,
      penalizacionAlertas: posture.appliedPenalty
    },
    tarifasAzulesAWS: Object.entries(awsPrices).map(([id, unit]) => ({
      servicio: id,
      costoMensualUSD: unit,
      fuente: awsPriceSource(id) === 'live' ? 'cotización' : 'referencia (snapshot)'
    })),
    fechaPrecios: awsPricingDate,
    saludServicios: healthServices.map((s) => ({
      servicio: s.name,
      estado: estadoSalud(s.regions[currentRegion.code]),
      region: currentRegion.code
    })),
    actualizadoSalud: healthUpdatedAt,
    disponibilidadRegional: {
      serviciosEnRegion: awsRegionServices.length,
      serviciosGlobales: awsTotalServices,
      regionesGlobales: awsTotalRegions,
      fechaDisponibilidad: awsAvailabilityDate
    },
    rangosIP: awsIpSummary,
    alertas: healthAlerts.map((a) => ({
      titulo: a.title,
      severidad: a.severity,
      region: a.region,
      codigoRegion: a.regionCode,
      serviciosAfectados: a.impacted,
      mensaje: a.message,
      fecha: a.date
    }))
  });

  const download = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const live = liveDataPayload();
    const rows: string[][] = [['Pilar', 'Score', 'Estado', 'Recomendaciones']];
    for (const p of WORKLOAD_PILLARS) {
      rows.push([p.name, String(p.score), p.status, p.recommendations.join(' | ')]);
    }
    rows.push([]);
    rows.push(['= DATOS EN VIVO AWS =', '', '', '']);
    rows.push([
      'Postura derivada',
      `${live.posturaDerivada.score}/100`,
      live.posturaDerivada.estado,
      `Cobertura seguridad ${live.posturaDerivada.coberturaSeguridad} | Salud núcleo ${live.posturaDerivada.saludNucleo}`
    ]);
    rows.push(['Fecha precios', live.fechaPrecios || '', `Región ${currentRegion.code}`, '']);
    for (const t of live.tarifasAzulesAWS) {
      rows.push(['Tarifa', t.servicio, `$${t.costoMensualUSD}/mes`, t.fuente]);
    }
    rows.push(['Fecha salud', live.actualizadoSalud || '', '', '']);
    for (const s of live.saludServicios) {
      rows.push(['Salud', s.servicio, s.estado, s.region]);
    }
    rows.push([
      'Disponibilidad',
      `${live.disponibilidadRegional.serviciosEnRegion} servicios en región`,
      `${live.disponibilidadRegional.serviciosGlobales} globales`,
      `${live.disponibilidadRegional.regionesGlobales} regiones`
    ]);
    for (const a of live.alertas) {
      rows.push(['Alerta', a.titulo, `${a.severidad} · ${a.serviciosAfectados} servicio(s)`, `${a.region} (${a.codigoRegion})`]);
    }
    rows.push(['Rangos IP AWS', `${live.rangosIP.length} servicios`, `${live.rangosIP.reduce((acc, e) => acc + e.count, 0)} bloques`, 'ip-ranges.amazonaws.com']);
    for (const e of live.rangosIP) {
      rows.push(['Rango IP', e.service, String(e.count), 'bloques']);
    }
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    download(csv, `reporte-well-architected-${currentRegion.code}.csv`, 'text/csv;charset=utf-8;');
    showToast('success', 'Reporte CSV exportado incluyendo datos en vivo de AWS.', 'Reportes Well-Architected');
  };

  const exportJSON = () => {
    const payload = {
      titulo: 'Reporte Well-Architected Framework',
      fecha: new Date().toISOString().split('T')[0],
      region: currentRegion.code,
      puntajeGlobal: overall,
      grado: grade,
      pilares: WORKLOAD_PILLARS.map((p) => ({
        pilar: p.name,
        score: p.score,
        estado: p.status,
        recomendaciones: p.recommendations
      })),
      historial: SCORE_HISTORY,
      datosEnVivoAWS: liveDataPayload()
    };
    download(
      JSON.stringify(payload, null, 2),
      `reporte-well-architected-${currentRegion.code}.json`,
      'application/json'
    );
    showToast('success', 'Reporte JSON exportado incluyendo datos en vivo de AWS.', 'Reportes Well-Architected');
  };

  const exportPDF = () => {
    showToast('info', 'Abriendo vista de impresión para generar el PDF del reporte.', 'Exportar PDF');
    window.print();
  };

  const complianceLabel = (status: string) => {
    const labels: Record<string, string> = { correct: 'Correcto', review: 'En revisión', critical: 'Problema' };
    return labels[status] || status;
  };

  const renderPillarCard = (pillar: WorkloadPillar) => {
    const Icon = pillarIcons[pillar.id] || ShieldCheck;
    return (
      <div
        key={pillar.id}
        className="p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-[#1E293B] dark:text-white">{pillar.name}</span>
          </div>
          <StatusBadge status={pillar.status} size="sm" />
        </div>

        <div className="flex items-end justify-between mb-1.5">
          <p className="text-[11px] text-[#64748B] dark:text-slate-400 max-w-[140px] leading-snug">{pillar.description}</p>
          <span className="text-2xl font-extrabold text-[#1E293B] dark:text-white tracking-tight">
            {pillar.score}
            <span className="text-xs font-semibold text-[#64748B] dark:text-slate-400">/100</span>
          </span>
        </div>
        <ScoreBar score={pillar.score} />

        <ul className="space-y-1.5 mt-4 flex-1">
          {pillar.recommendations.map((rec, index) => (
            <li
              key={index}
              className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug"
            >
              {index === 0 ? (
                <Sparkles className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0" />
              )}
              <span>
                {index === 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-px rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wide mr-1.5 align-middle">
                    Principal
                  </span>
                )}
                {rec}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Reportes Well-Architected
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Evaluacion de los seis pilares del Framework en la region {currentRegion.code} ({currentRegion.flagEmoji} {currentRegion.name}) con recomendaciones accionables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-2">
            <Award className="w-4 h-4" />
            Grado {grade} · {overall}/100
          </span>

          <button
            onClick={exportCSV}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800/80 hover:bg-slate-700/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-2 transition-all"
          >
            <FileText className="w-4 h-4" />
            Exportar CSV
          </button>

          <button
            onClick={exportJSON}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800/80 hover:bg-slate-700/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4" />
            Exportar JSON
          </button>

          <button
            onClick={exportPDF}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 flex items-center gap-2 transition-all"
          >
            <Printer className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Overview Radar + Score History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Radar Chart */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Postura Well-Architected
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Distribucion del puntaje por pilar respecto al 100% ideal
              </p>
            </div>
            <StatusBadge status={`Grado ${grade}`} variant="success" />
          </div>

          <div className="h-64 sm:h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="#334155" strokeOpacity={0.4} />
                <PolarAngleAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Radar dataKey="value" stroke="#2563EB" fill="#2563EB" fillOpacity={0.35} strokeWidth={2} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Score History */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Evolucion del Puntaje
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Calificacion promedio de los ultimos 6 meses
              </p>
            </div>
            <StatusBadge status="Mejorando" />
          </div>

          <div className="h-64 sm:h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={SCORE_HISTORY} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[60, 100]}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Puntaje (%)"
                  stroke="#2563EB"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#2563EB', stroke: '#0F172A' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SCORE_HISTORY.slice(-3).map((point, idx, arr) => {
              const prev = arr[idx > 0 ? idx - 1 : 0];
              const diff = point.score - prev.score;
              const trend = arr.length === 1 ? 0 : diff;
              return (
                <div
                  key={point.month}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center"
                >
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">{point.month}</div>
                  <div className="text-xl font-extrabold text-[#1E293B] dark:text-white">{point.score}</div>
                  <div className={`text-[11px] font-semibold ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {trend >= 0 ? '+' : ''}{trend} pts
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live AWS data snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#F59E0B]" />
                Tarifas Reales AWS ({currentRegion.code})
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                {awsPricingDate
                  ? `On-demand consultado el ${new Date(awsPricingDate).toLocaleString('es-PE')}`
                  : 'Consultando AWS Pricing API...'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
            {Object.entries(awsPrices).map(([id, unit]) => (
              <div
                key={id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs"
              >
                <span className="font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{id}</span>
                <span className="flex items-center gap-1.5">
                  {awsPriceSource(id) === 'snapshot' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[9px] font-bold uppercase">
                      ref
                    </span>
                  )}
                  <span className="font-extrabold text-[#F59E0B]">${unit.toFixed(2)}/mes</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-400 leading-snug">
            Tarifas con etiqueta <span className="font-bold text-amber-500">ref</span> provienen del catálogo de la app (precios de referencia);
            el resto se cotizan en vivo contra la API regional de AWS para {currentRegion.code}.
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Postura Derivada y Salud AWS
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Índice calculado con datos públicos (región, salud, alertas)
              </p>
            </div>
            <div className="text-2xl font-extrabold text-emerald-600">
              {posture.score}
              <span className="text-xs font-semibold text-[#64748B] dark:text-slate-400">/100</span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {healthServices.map((svc) => {
                const status = svc.regions[currentRegion.code];
                const isUnknown = !status;
                const isOk = status === 'online' || status === 'operational';
                const isWarn = status === 'warning';
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
                    title={`${svc.name}: ${estadoSalud(status)}`}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${chipClass}`}
                  >
                    {svc.serviceId}
                  </span>
                );
              })}
              {isHealthLoading && <span className="text-[11px] text-slate-400">cargando...</span>}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <p className="flex justify-between">
                <span>Servicios de seguridad disponibles en la región</span>
                <strong className="text-slate-800 dark:text-white">{posture.securityAvailable}/{posture.securityTotal}</strong>
              </p>
              <p className="flex justify-between">
                <span>Servicios núcleo sin degradación</span>
                <strong className="text-slate-800 dark:text-white">{posture.coreOnline}/{posture.coreTotal}</strong>
              </p>
              <p className="flex justify-between">
                <span>Alertas activas / penalización ({currentRegion.code})</span>
                <strong className="text-slate-800 dark:text-white">{posture.activeAlerts} / {posture.appliedPenalty} pts</strong>
              </p>
              <p className="flex justify-between">
                <span>Disponibilidad regional / global</span>
                <strong className="text-slate-800 dark:text-white">
                  {awsRegionServices.length} / {awsTotalServices} servicios · {awsTotalRegions} regiones
                </strong>
              </p>
              {awsAvailabilityDate && (
                <p className="flex justify-between">
                  <span>Fecha disponibilidad</span>
                  <strong className="text-slate-800 dark:text-white">
                    {new Date(awsAvailabilityDate).toLocaleDateString('es-PE')}
                  </strong>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pillar Cards */}
      <div className="print-break-before grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {WORKLOAD_PILLARS.map(renderPillarCard)}
      </div>

      {/* Compliance Frameworks */}
      <div className="print-break-before bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Cumplimiento Normativo
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Grado de madurez frente a los marcos de certificacion adoptados
            </p>
          </div>
        </div>

        <div className="space-y-3 mt-4">
          {COMPLIANCE_FRAMEWORKS.map((framework) => {
            const percent = COMPLIANCE_PERCENT[framework.name] ?? 90;
            return (
              <div
                key={framework.name}
                className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/40"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{framework.name}</span>
                      <StatusBadge status={complianceLabel(framework.status)} size="sm" />
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mt-1 max-w-2xl">
                      {framework.description}
                    </p>
                  </div>
                  <div className="w-full sm:w-48 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Madurez</span>
                      <span className="text-xs font-extrabold text-[#1E293B] dark:text-white">{percent}%</span>
                    </div>
                    <ScoreBar score={percent} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};