import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  Globe,
  DollarSign,
  Calendar,
  ShieldCheck,
  Server,
  ArrowRight,
  Activity,
  Zap,
  Lock,
  Layers,
  Sparkles,
  Radio,
  Bell,
  BrainCircuit,
  ShieldAlert,
  ShieldX,
  AlertTriangle
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip
} from 'recharts';
import { useCloud } from '../context/CloudContext';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { computeSecurityScore } from '../lib/liveMetrics';
import { estimateLatencyMs } from '../lib/geo';
import { SECURITY_METRICS } from '../data/security';

const COST_COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

const LIVE_SERVICES: Array<{ serviceId: string; label: string }> = [
  { serviceId: 'ec2', label: 'Amazon EC2' },
  { serviceId: 'rds', label: 'Amazon RDS' },
  { serviceId: 's3', label: 'Amazon S3' },
  { serviceId: 'cloudfront', label: 'Amazon CloudFront' },
  { serviceId: 'lambda', label: 'AWS Lambda' },
  { serviceId: 'alb', label: 'Elastic Load Balancing' },
  { serviceId: 'elasticache', label: 'Amazon ElastiCache' }
];

const CHIP_STYLES: Record<string, { chip: string; dot: string }> = {
  online: {
    chip: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300',
    dot: 'bg-emerald-500'
  },
  warning: {
    chip: 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300',
    dot: 'bg-amber-500'
  },
  problem: {
    chip: 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-300',
    dot: 'bg-rose-500 animate-pulse'
  },
  unknown: {
    chip: 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-300 dark:bg-slate-600'
  }
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentRegion,
    costItems,
    totalMonthlyCost,
    totalAnnualCost,
    healthServices,
    healthAlerts,
    healthUpdatedAt,
    isHealthLoading,
    awsRegionServices,
    awsTotalRegions,
    awsTotalServices,
    refreshAwsData,
    userOrigin,
    projectAnalysis,
  } = useCloud();

  // Live derived security posture
  const securityPosture = computeSecurityScore({
    regionServices: awsRegionServices,
    healthServices,
    regionCode: currentRegion.code,
    alerts: healthAlerts
  });

  const alertsInRegion = healthAlerts.filter(
    (a) => a.regionCode === currentRegion.code || a.regionCode === 'Global'
  );
  const outsideAlerts = healthAlerts.length - alertsInRegion.length;
  const criticalAlerts = alertsInRegion.filter((a) => a.severity === 'critical').length;
  const warningAlerts = alertsInRegion.filter((a) => a.severity === 'warning').length;
  const architectureStatus =
    criticalAlerts > 0 ? 'Atención' : warningAlerts > 0 ? 'Degradado' : 'Operacional';

  // Distinct services count
  const servicesUsedCount = costItems.filter((item) => item.monthlyCost > 0).length;
  // Estimated resources from planned quantities
  const totalCloudResources = costItems.reduce((acc, curr) => acc + curr.quantity, 0);

  // Chart data prepared from cost items
  const pieChartData = costItems
    .filter((item) => item.monthlyCost > 0)
    .map((item) => ({
      name: item.serviceName.split('(')[0].trim(),
      value: item.monthlyCost,
      annual: item.annualCost,
      category: item.category
    }));

  const formatUSD = (val: number) => `$${val.toLocaleString()}`;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner / Welcome */}
      <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#2563EB]/80 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400/20 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-200">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Arquitectura Cloud Basada en AWS</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            CloudOps Dashboard
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Plataforma integral de planificación, modelado económico, topología de red y monitoreo de seguridad para arquitecturas escalables en la nube.
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/planning')}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2"
            >
              <span>Nueva Planificación Cloud</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/network')}
              className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-all flex items-center gap-2"
            >
              <span>Ver Topología de Red VPC</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards Grid (Reutilizables según especificación) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          title="Servicios Utilizados"
          value={servicesUsedCount}
          subtitle={`${awsTotalServices} servicios disponibles en AWS`}
          icon={Boxes}
          theme="primary"
          trend={{ text: 'Con costo mensual > $0', isNeutral: true }}
          onClick={() => navigate('/services')}
        />

        <StatCard
          title="Región Seleccionada"
          value={currentRegion.code}
          subtitle={`${currentRegion.name} (latencia ${estimateLatencyMs(userOrigin, currentRegion)}ms) • ${awsRegionServices.length} servicios`}
          icon={Globe}
          theme="primary"
          trend={{ text: `${currentRegion.flagEmoji} Activa`, isPositive: true }}
          onClick={() => navigate('/infrastructure')}
        />

        <StatCard
          title="Costo Mensual Estimado"
          value={formatUSD(totalMonthlyCost)}
          subtitle={`Anual: ${formatUSD(totalAnnualCost)}`}
          icon={DollarSign}
          theme="costs"
          trend={{ text: 'On-demand real', isPositive: true }}
          onClick={() => navigate('/costs')}
        />

        <StatCard
          title="Postura de Seguridad"
          value={`${securityPosture.score}%`}
          subtitle="Índice derivado de datos públicos AWS"
          icon={ShieldCheck}
          theme="security"
          trend={{ text: securityPosture.status, isPositive: securityPosture.score >= 90 }}
          onClick={() => navigate('/security')}
        />
      </div>

      {/* Second Row KPIs: Cloud Resources & Architecture Health */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <StatCard
          title="Recursos Estimados"
          value={totalCloudResources}
          subtitle="Suma de cantidades planificadas (instancias, DBs, buckets)"
          icon={Server}
          theme="default"
          trend={{ text: 'Estimación', isNeutral: true }}
        />

        <StatCard
          title="Costo Anual Proyectado"
          value={formatUSD(totalAnnualCost)}
          subtitle="Fórmula: Costo Mensual × 12 meses"
          icon={Calendar}
          theme="costs"
          trend={{ text: 'Estimación', isNeutral: true }}
          onClick={() => navigate('/costs')}
        />

        <StatCard
          title="Estado de la Arquitectura"
          value={architectureStatus}
          subtitle={
            criticalAlerts + warningAlerts > 0
              ? `AWS Health: ${criticalAlerts + warningAlerts} alerta(s) en ${currentRegion.code}`
              : `AWS Health: sin incidentes en ${currentRegion.code}`
          }
          icon={Activity}
          theme="security"
          trend={{ text: `Actualizado ${healthUpdatedAt ? new Date(healthUpdatedAt).toLocaleTimeString('es-PE') : '...'}`, isPositive: criticalAlerts === 0 }}
          onClick={() => navigate('/network')}
        />
      </div>

      {/* AI Project Analysis Widget */}
      {projectAnalysis ? (
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                  Análisis IA · {projectAnalysis.projectName}
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Analizado el {new Date(projectAnalysis.analyzedAt).toLocaleString('es-PE')} · {projectAnalysis.totalFindings} hallazgos de seguridad
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/project-analyzer')}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              Ver análisis completo
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* Security Score */}
            <div className={`col-span-2 rounded-2xl p-4 flex items-center gap-4 ${
              projectAnalysis.overallSecurityScore >= 85
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                : projectAnalysis.overallSecurityScore >= 65
                  ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                  : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800'
            }`}>
              <div className={`text-4xl font-extrabold ${
                projectAnalysis.overallSecurityScore >= 85 ? 'text-emerald-600 dark:text-emerald-400'
                  : projectAnalysis.overallSecurityScore >= 65 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {projectAnalysis.overallSecurityScore}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Score de Seguridad</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{projectAnalysis.modules.length} módulo(s) analizados</p>
              </div>
            </div>

            {/* Findings breakdown */}
            {[
              { label: 'Críticos', count: projectAnalysis.criticalFindings, icon: ShieldX, color: 'text-rose-600 dark:text-rose-400' },
              { label: 'Altos', count: projectAnalysis.highFindings, icon: ShieldAlert, color: 'text-orange-600 dark:text-orange-400' },
              { label: 'Medios', count: projectAnalysis.mediumFindings, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Costo AWS est.', count: null, cost: projectAnalysis.estimatedTotalMonthlyCost, icon: DollarSign, color: 'text-blue-600 dark:text-blue-400' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                <item.icon className={`w-4 h-4 mb-1 ${item.color}`} />
                <span className={`text-xl font-extrabold ${item.color}`}>
                  {item.count !== null && item.count !== undefined ? item.count : `$${item.cost?.toFixed(0)}`}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          onClick={() => navigate('/project-analyzer')}
          className="cursor-pointer group bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/20 border border-indigo-200 dark:border-indigo-800 rounded-3xl p-5 flex items-center gap-4 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <BrainCircuit className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white mb-0.5">
              Analizador IA de Proyectos — sin análisis activo
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Conecta tu proyecto, evalúa el score de seguridad módulo por módulo y obtén recomendaciones de infraestructura AWS con costos estimados.
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform shrink-0" />
        </div>
      )}

      {/* Live AWS Services Status Strip */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <Radio className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
                Estado de Servicios en Tiempo Real
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                AWS Service Health Dashboard en {currentRegion.code} · actualizado:{' '}
                {healthUpdatedAt ? new Date(healthUpdatedAt).toLocaleString('es-PE') : isHealthLoading ? 'cargando...' : 'pendiente'}
              </p>
            </div>
          </div>
          <button
            onClick={() => refreshAwsData()}
            className="self-end sm:self-auto px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            Actualizar Datos en Vivo
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Per-service health chips */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-2.5">
              {LIVE_SERVICES.map(({ serviceId, label }) => {
                const svc = healthServices.find((s) => s.serviceId === serviceId);
                const status = svc ? svc.regions[currentRegion.code] : undefined;
                const isUnknown = isHealthLoading || !status;
                const style = CHIP_STYLES[status && CHIP_STYLES[status] ? status : 'unknown'];
                return (
                  <div
                    key={serviceId}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${style.chip}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    {label}
                    {isUnknown && <span className="text-[10px] font-medium opacity-80">—</span>}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 text-xs flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Boxes className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <strong className="text-slate-800 dark:text-white">{awsRegionServices.length}</strong> servicios operativos en {currentRegion.code}
              </span>
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <strong className="text-slate-800 dark:text-white">{awsTotalRegions}</strong> regiones en la tabla regional de AWS
              </span>
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <strong className="text-slate-800 dark:text-white">{securityPosture.coreOnline}/{securityPosture.coreTotal}</strong> servicios núcleo sin degradación
              </span>
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <ShieldCheck className="w-4 h-4 text-[#F59E0B]" />
                <strong className="text-slate-800 dark:text-white">{securityPosture.securityAvailable}/{securityPosture.securityTotal}</strong> servicios de seguridad en la región
              </span>
            </div>
          </div>

          {/* Active alerts */}
          <div className="p-4 rounded-2xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-800/60">
            <div className="flex items-center gap-2 pb-2 mb-3 border-b border-rose-200/60 dark:border-rose-800/40">
              <Bell className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                Alertas de AWS Health en {currentRegion.code}
              </span>
            </div>
            {alertsInRegion.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {isHealthLoading
                  ? 'Consultando AWS Service Health...'
                  : outsideAlerts > 0
                    ? `Sin incidentes en ${currentRegion.code}. ${outsideAlerts} alerta(s) en otras regiones (no afectan esta región).`
                    : 'Sin alertas registradas. Todos los servicios operan con normalidad en AWS.'}
              </p>
            ) : (
              <ul className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                {alertsInRegion.slice(0, 6).map((alert) => (
                  <li key={alert.id} className="text-[11px] leading-snug">
                    <span className="flex items-center gap-1.5 font-bold text-rose-800 dark:text-rose-200">
                      <StatusBadge
                        status={alert.severity === 'critical' ? 'Problema' : alert.severity === 'warning' ? 'Requiere revisión' : 'Online'}
                        size="sm"
                      />
                      {alert.title}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 block mt-0.5">
                      {alert.region} · {alert.impacted} servicio(s) · {alert.date ? new Date(alert.date).toLocaleDateString('es-PE') : 'fecha pendiente'}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 block mt-0.5">{alert.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Mini Architecture Flow Visualizer (Internet → Route 53 → CloudFront → VPC → EC2/RDS) */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#1E293B] dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Flujo de la Arquitectura Cloud
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Resumen visual del recorrido del tráfico: Internet → Route 53 → CloudFront → VPC → EC2 / RDS
            </p>
          </div>
          <button
            onClick={() => navigate('/network')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <span>Ver diagrama de red detallado</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Visual Pipeline Nodes */}
        <div className="pt-6 overflow-x-auto pb-2">
          <div className="flex items-center justify-between min-w-[720px] gap-2">
            {/* Step 1: Internet */}
            <div className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center hover:border-blue-400 transition-all">
              <div className="w-10 h-10 mx-auto rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-white block">
                Internet
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Clientes Globales
              </span>
              <div className="mt-2">
                <StatusBadge status="Online" size="sm" />
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center px-1 text-slate-300 dark:text-slate-600">
              <span className="text-[10px] font-mono font-bold text-blue-500 mb-1">DNS</span>
              <ArrowRight className="w-5 h-5 text-blue-500 animate-pulse" />
            </div>

            {/* Step 2: Route 53 */}
            <div className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center hover:border-blue-400 transition-all">
              <div className="w-10 h-10 mx-auto rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2 font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-white block">
                Route 53
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                DNS & Enrutamiento
              </span>
              <div className="mt-2">
                <StatusBadge status="Correcto" size="sm" />
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center px-1 text-slate-300 dark:text-slate-600">
              <span className="text-[10px] font-mono font-bold text-indigo-500 mb-1">HTTPS</span>
              <ArrowRight className="w-5 h-5 text-indigo-500 animate-pulse" />
            </div>

            {/* Step 3: CloudFront */}
            <div className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center hover:border-blue-400 transition-all">
              <div className="w-10 h-10 mx-auto rounded-xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-2 font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-white block">
                CloudFront
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                CDN + WAF Edge
              </span>
              <div className="mt-2">
                <StatusBadge status="Online" size="sm" />
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center px-1 text-slate-300 dark:text-slate-600">
              <span className="text-[10px] font-mono font-bold text-emerald-500 mb-1">IGW</span>
              <ArrowRight className="w-5 h-5 text-emerald-500 animate-pulse" />
            </div>

            {/* Step 4: VPC Perimeter */}
            <div className="flex-[1.5] bg-emerald-50/50 dark:bg-emerald-950/20 border-2 border-dashed border-emerald-400/60 dark:border-emerald-700/60 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  VPC (10.0.0.0/16)
                </span>
                <StatusBadge status="Correcto" size="sm" />
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                {/* Public Subnet: EC2 */}
                <div className="bg-white dark:bg-[#1E293B] p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 shadow-xs">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Subred Pública
                  </div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1">
                    <Server className="w-3.5 h-3.5" />
                    EC2 (App)
                  </span>
                </div>

                {/* Private Subnet: RDS */}
                <div className="bg-white dark:bg-[#1E293B] p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/80 shadow-xs">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Subred Privada
                  </div>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    RDS (DB)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Columns: Cost Distribution Chart & Security Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cost Distribution Chart */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#F59E0B]" />
                  Distribución de Costos por Servicio
                </h3>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Porcentaje de consumo mensual en {currentRegion.code}
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-[#F59E0B] border border-amber-200 dark:border-amber-800">
                Total: {formatUSD(totalMonthlyCost)}/mes
              </span>
            </div>

            {/* Recharts Pie Chart */}
            <div className="h-64 sm:h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieChartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COST_COLORS[index % COST_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(val: any) => [
                      formatUSD(Number(val || 0)),
                      'Costo Mensual'
                    ]}
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

            {/* Breakdown Legend List */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
              {pieChartData.map((item, idx) => {
                const percent = ((item.value / totalMonthlyCost) * 100).toFixed(0);
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: COST_COLORS[idx % COST_COLORS.length] }}
                    />
                    <div className="truncate">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatUSD(item.value)} ({percent}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              onClick={() => navigate('/costs')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>Gestionar y registrar costos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Security Readiness Summary */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#16A34A]" />
                  Resumen de Seguridad Cloud
                </h3>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Resumen de la postura derivado de datos públicos de AWS
                </p>
              </div>
              <StatusBadge status={securityPosture.status} />
            </div>

            {/* Security Checklist with Indicators */}
            <div className="space-y-3 mt-4">
              {SECURITY_METRICS.map((metric) => {
                const statusColor = {
                  correct: 'border-l-4 border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20',
                  review: 'border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
                  critical: 'border-l-4 border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20'
                }[metric.status];

                const statusLabel = {
                  correct: 'Correcto',
                  review: 'Requiere revisión',
                  critical: 'Problema'
                }[metric.status];

                return (
                  <div
                    key={metric.id}
                    className={`p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 ${statusColor} transition-all`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        {metric.title}
                      </span>
                      <StatusBadge status={statusLabel} size="sm" />
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {metric.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              onClick={() => navigate('/security')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>Ver auditoría completa de seguridad e IAM</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
