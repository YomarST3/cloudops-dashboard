import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Server,
  Timer,
  AlertTriangle,
  RefreshCw,
  Pause,
  Play,
  Gauge,
  Cpu,
  Database,
  Network,
  Zap,
  Layers,
  Archive,
  Clock,
  Info,
  Radio
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip
} from 'recharts';
import { useCloud } from '../context/CloudContext';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import {
  MONITOR_SERIES,
  LIVE_SERVICES,
  type MonitorPoint,
  type LiveService
} from '../data/monitoring';

const TOOLTIP_STYLE = {
  backgroundColor: '#0F172A',
  borderColor: '#334155',
  borderRadius: '12px',
  color: '#F8FAFC',
  fontSize: '12px'
};

const serviceIcons: Record<string, LucideIcon> = {
  EC2: Server,
  RDS: Database,
  ALB: Network,
  CloudFront: Zap,
  Lambda: Layers,
  ElastiCache: Cpu,
  S3: Archive
};

const healthServiceByType: Record<string, string> = {
  EC2: 'ec2',
  RDS: 'rds',
  ALB: 'alb',
  CloudFront: 'cloudfront',
  Lambda: 'lambda',
  ElastiCache: 'elasticache',
  S3: 's3'
};

const statusLabel: Record<string, string> = {
  online: 'En Vivo',
  warning: 'En Revisión',
  problem: 'Problema',
  unknown: 'Sin datos'
};

const severityLabel: Record<string, string> = {
  critical: 'Crítica',
  warning: 'Advertencia',
  info: 'Informativa'
};

const severityStyles = {
  critical: {
    border: 'border-l-4 border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20',
    iconColor: 'text-rose-600 dark:text-rose-400'
  },
  warning: {
    border: 'border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
    iconColor: 'text-amber-600 dark:text-amber-400'
  },
  info: {
    border: 'border-l-4 border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20',
    iconColor: 'text-blue-600 dark:text-blue-400'
  }
};

export const Monitoring: React.FC = () => {
  const { currentRegion, showToast, isDarkMode, healthByService, healthAlerts, isHealthLoading, healthUpdatedAt, refreshAwsData } = useCloud();
  const [series, setSeries] = useState<MonitorPoint[]>(MONITOR_SERIES);
  const [isLive, setIsLive] = useState(true);

  const liveStatusOf = (service: LiveService): string =>
    healthByService[healthServiceByType[service.type]] || 'unknown';

  const onlined = (service: LiveService) => liveStatusOf(service) === 'online';

  const alertsInRegion = healthAlerts.filter(
    (a) => a.regionCode === currentRegion.code || a.regionCode === 'Global'
  );
  const outsideAlerts = healthAlerts.length - alertsInRegion.length;

  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => {
      setSeries((prev) => {
        const last = prev[prev.length - 1];
        const drift = (value: number, delta: number) =>
          Math.round(Math.max(0, Math.min(100, value + (Math.random() * 2 - 1) * delta)) * 10) / 10;
        const next: MonitorPoint = {
          ...last,
          cpu: drift(last.cpu, 6),
          memory: drift(last.memory, 3),
          rps: Math.max(40, Math.round(last.rps + (Math.random() * 2 - 1) * 10)),
          errors: Math.max(0.1, Math.round((last.errors + (Math.random() * 2 - 1) * 0.4) * 10) / 10)
        };
        return [...prev.slice(1), next];
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [isLive]);

  const refresh = () => {
    setSeries(MONITOR_SERIES);
    refreshAwsData();
    showToast('info', 'Estado de servicios y precios actualizados desde las APIs públicas de AWS.', 'Datos en Vivo');
  };

  const toggleLive = () => {
    setIsLive((prev) => {
      showToast(prev ? 'info' : 'success', prev ? 'Serie de telemetría en pausa.' : 'Serie de telemetría en vivo reanudada.', 'Monitoreo');
      return !prev;
    });
  };

  const avgErrors = series.reduce((acc, p) => acc + p.errors, 0) / series.length;
  const availability = (100 - avgErrors).toFixed(2);
  const avgLatency = Math.round(LIVE_SERVICES.reduce((acc, s) => acc + s.latencyMs, 0) / LIVE_SERVICES.length);
  const onlineCount = LIVE_SERVICES.filter(onlined).length;
  const activeAlerts = alertsInRegion.filter((a) => a.severity !== 'info').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Monitoreo y Telemetría
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Estado de servicios y eventos reales de AWS para {currentRegion.code} ({currentRegion.flagEmoji} {currentRegion.name}). La serie de CPU/memoria es telemetría de referencia (CloudWatch simulado).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 dark:border dark:border-slate-700 text-xs font-bold text-[#64748B] dark:text-slate-300 flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Intervalo 5s
          </span>

          <span
            className="px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2"
            title={healthUpdatedAt ? `Actualizado: ${new Date(healthUpdatedAt).toLocaleString('es-PE')}` : 'Consultando estado real...'}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            AWS Service Health
          </span>

          <StatusBadge status={isLive ? 'En Vivo' : 'En Pausa'} variant={isLive ? 'online' : 'neutral'} />

          <button
            onClick={toggleLive}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              isLive
                ? 'bg-slate-800/80 hover:bg-slate-700/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 text-slate-200'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
            }`}
          >
            {isLive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isLive ? 'Pausar' : 'Reanudar'}
          </button>

          <button
            onClick={refresh}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 flex items-center gap-2 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refrescar
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title="Disponibilidad"
          value={`${availability}%`}
          subtitle="Basada en telemetría de referencia (serie simulada)"
          icon={Activity}
          theme="security"
          trend={{ text: 'Telemetría de referencia', isNeutral: true }}
        />

        <StatCard
          title="Latencia Promedio"
          value={`${avgLatency} ms`}
          subtitle={`Promedio de latencias de referencia en ${currentRegion.code}`}
          icon={Timer}
          theme="primary"
          trend={{ text: 'Valores de referencia', isNeutral: true }}
        />

        <StatCard
          title="Recursos en Línea"
          value={`${onlineCount}/${LIVE_SERVICES.length}`}
          subtitle={`Estado real de AWS Service Health en ${currentRegion.code}`}
          icon={Server}
          theme="default"
          trend={{ text: 'Con datos reales', isNeutral: true }}
        />

        <StatCard
          title="Alertas Activas"
          value={activeAlerts}
          subtitle={`Incidentes publicados para ${currentRegion.code}`}
          icon={AlertTriangle}
          theme="alerts"
          trend={{
            text: activeAlerts > 0 ? 'Requiere atención' : 'Sin novedades',
            isPositive: activeAlerts === 0
          }}
        />
      </div>

      {/* Resource Usage Area Chart */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Uso de Recursos en Tiempo Real
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              CPU y memoria promedio del clúster (%) · últimas 24 horas
            </p>
          </div>
          <span className="hidden sm:inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            Serie de Referencia
          </span>
        </div>

        <div className="h-64 sm:h-80 w-full mt-5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
              <XAxis
                dataKey="time"
                tick={{ fill: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                interval={3}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="cpu"
                name="CPU (%)"
                stroke="#2563EB"
                strokeWidth={2}
                fill="url(#cpuGradient)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="memory"
                name="Memoria (%)"
                stroke="#8B5CF6"
                strokeWidth={2}
                fill="url(#memoryGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap gap-4 pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-[#64748B] dark:text-slate-400">
            <span className="w-3 h-3 rounded-full bg-[#2563EB]" /> CPU Promedio
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#64748B] dark:text-slate-400">
            <span className="w-3 h-3 rounded-full bg-[#8B5CF6]" /> Memoria Promedio
          </span>
        </div>
      </div>

      {/* Network Traffic + Live Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Traffic Chart */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                  <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  Tráfico de Red
                </h3>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Solicitudes por segundo y tasa de error
                </p>
              </div>
              <StatusBadge status="Operacional" />
            </div>

            <div className="h-56 sm:h-64 w-full mt-5">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rpsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                    interval={3}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="rps"
                    name="RPS"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    fill="url(#rpsGradient)"
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="errors"
                    name="Errores (%)"
                    stroke="#F43F5E"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Live Services */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Servicios en Producción
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Estado por componente y latencia de salud
              </p>
            </div>
            <StatusBadge status={activeAlerts > 0 ? 'Con alertas' : 'Estable'} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {LIVE_SERVICES.map((service) => {
              const Icon = serviceIcons[service.type] || Server;
              const status = liveStatusOf(service);
              return (
                <div
                  key={service.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {service.name}
                      </span>
                    </div>
                    <StatusBadge
                      status={statusLabel[status] || 'Sin datos'}
                      variant={status === 'online' ? 'online' : status === 'warning' ? 'review' : status === 'problem' ? 'danger' : 'neutral'}
                      size="sm"
                      showDot={false}
                    />
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${service.usage > 80 ? 'bg-rose-500' : service.usage > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${service.usage}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                      {service.usage}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="uppercase text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
                      {service.type}
                    </span>
                    <span className="font-mono">{service.latencyMs} ms</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Alertas y Eventos Reales de AWS
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Incidentes activos publicados por AWS Service Health Dashboard
            </p>
          </div>
          <StatusBadge status={`${activeAlerts} activas`} variant="danger" showDot={false} />
        </div>

        <div className="space-y-3 mt-4">
          {isHealthLoading && alertsInRegion.length === 0 ? (
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-500 dark:text-slate-400">
              Consultando estado real de servicios de AWS...
            </div>
          ) : alertsInRegion.length === 0 ? (
            <div className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              AWS no reporta incidentes activos para {currentRegion.code} en este momento.
              {outsideAlerts > 0 && ` ${outsideAlerts} alerta(s) de otras regiones quedan fuera de esta vista.`}
            </div>
          ) : (
            alertsInRegion.map((alert) => {
              const styles = severityStyles[alert.severity];
              const timeLabel = alert.date ? new Date(alert.date).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Ahora';
              return (
                <div key={alert.id} className={`p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 ${styles.border}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {alert.severity === 'critical' ? (
                        <AlertTriangle className={`w-4 h-4 mt-0.5 ${styles.iconColor}`} />
                      ) : alert.severity === 'warning' ? (
                        <Clock className={`w-4 h-4 mt-0.5 ${styles.iconColor}`} />
                      ) : (
                        <Info className={`w-4 h-4 mt-0.5 ${styles.iconColor}`} />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {alert.title}
                          </span>
                          <StatusBadge status={severityLabel[alert.severity] || alert.severity} variant={alert.severity} size="sm" showDot={false} />
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mt-0.5">
                          {alert.message} {alert.region}
                          {alert.impacted > 0 ? ` · ${alert.impacted} servicios afectados` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">{timeLabel}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};