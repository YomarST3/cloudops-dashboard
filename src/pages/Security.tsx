import React from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Database,
  CheckCircle2,
  Building,
  UserCheck,
  Sparkles,
  Activity,
  Radio
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { useCloud } from '../context/CloudContext';
import { computeSecurityScore } from '../lib/liveMetrics';
import {
  IAM_SUMMARY_DATA,
  ACCOUNT_PROTECTION_ITEMS,
  DATA_PROTECTION_ITEMS,
  COMPLIANCE_FRAMEWORKS
} from '../data/security';

export const Security: React.FC = () => {
  const {
    currentRegion,
    awsRegionServices,
    healthServices,
    healthAlerts,
    isHealthLoading,
    awsIpSummary,
    isAvailabilityLoading
  } = useCloud();

  const posture = computeSecurityScore({
    regionServices: awsRegionServices,
    healthServices,
    regionCode: currentRegion.code,
    alerts: healthAlerts
  });

  const totalIpBlocks = awsIpSummary.reduce((acc, e) => acc + e.count, 0);
  const deriving = isHealthLoading || isAvailabilityLoading;
  const postureColor =
    posture.score >= 90
      ? 'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60'
      : posture.score >= 70
        ? 'text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60'
        : 'text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Seguridad y Gobernanza Cloud
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Postura derivada de datos públicos de AWS (tabla regional, Service Health e IP Ranges), modelo de responsabilidad compartida y gobernanza IAM.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${postureColor}`}>
            <ShieldCheck className="w-4 h-4" />
            Postura General: {deriving ? '—' : `${posture.score}%`} · {deriving ? 'Cargando…' : posture.status}
          </span>
        </div>
      </div>

      {/* Live-derived Security KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Servicios de Seguridad
            </span>
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-[#1E293B] dark:text-white">
            {deriving ? '—' : posture.securityAvailable}<span className="text-base text-slate-400">/{posture.securityTotal}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            IAM, KMS, CloudTrail, GuardDuty, Shield, WAF y Secrets Manager en {currentRegion.code}
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Servicios Núcleo Saludables
            </span>
            <Activity className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-3xl font-bold text-emerald-600">
            {deriving ? '—' : posture.coreOnline}<span className="text-base text-slate-400">/{posture.coreTotal}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            EC2, RDS, S3, CloudFront, Lambda y ALB online en AWS Service Health
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Rangos IP Públicos
            </span>
            <Radio className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-[#1E293B] dark:text-white">
            {totalIpBlocks.toLocaleString()}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Bloques IPv4/IPv6 publicados por {awsIpSummary.length} servicios en ip-ranges.amazonaws.com
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Alertas de Health en {currentRegion.code}
            </span>
            <ShieldAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div className={`text-3xl font-bold ${posture.activeAlerts > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {deriving ? '—' : posture.activeAlerts}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {posture.appliedPenalty} pts de penalización en {currentRegion.code}
            {posture.alertsOtherRegions > 0 && <> · +{posture.alertsOtherRegions} en otras regiones (sin efecto)</>}
          </p>
        </div>
      </div>

      {/* Methodology callout */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 text-xs">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          <strong className="text-slate-900 dark:text-white">Metodología del índice (0-100):</strong>{' '}
          45 pts por cobertura de servicios de seguridad en la región, 35 pts por salud de servicios núcleo y hasta 20 pts por estabilidad
          (deducción de {posture.appliedPenalty} pts por alertas activas en {currentRegion.code};{' '}
          {posture.alertsOtherRegions > 0 ? `${posture.alertsOtherRegions} alerta(s) de otras regiones quedan fuera del índice.` : 'todas las alertas publicadas corresponden a esta región o son globales.'}). Fuentes:{' '}
          <span className="font-mono">api.regional-table.region-services.aws.a2z.com</span>,{' '}
          <span className="font-mono">status.aws.amazon.com</span> e{' '}
          <span className="font-mono">ip-ranges.amazonaws.com</span>.
          {deriving && <span className="text-slate-400"> Cargando datos de disponibilidad...</span>}
        </p>
      </div>

      {/* 1. MODELO DE RESPONSABILIDAD COMPARTIDA (Sección destacada) */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fundamento Arquitectónico AWS</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#1E293B] dark:text-white">
            Modelo de Responsabilidad Compartida
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400 mt-1">
            AWS es responsable de la <strong className="text-slate-800 dark:text-white">seguridad DE la nube</strong>, mientras que el cliente es responsable de la <strong className="text-slate-800 dark:text-white">seguridad EN la nube</strong>.
          </p>
        </div>

        {/* Dos bloques lado a lado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bloque AWS */}
          <div className="p-6 rounded-2xl bg-gradient-to-b from-blue-50/70 to-blue-50/20 dark:from-blue-950/30 dark:to-slate-800/50 border border-blue-200 dark:border-blue-900/60 shadow-xs">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-blue-200/80 dark:border-blue-900/50">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                  Seguridad DE la Nube
                </span>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  AWS se encarga de:
                </h3>
              </div>
            </div>

            <ul className="space-y-3 text-xs">
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span><strong>Seguridad de la infraestructura física:</strong> Centros de datos biométricos, guardias 24/7 y control de accesos.</span>
              </li>
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span><strong>Hardware:</strong> Servidores de rack, procesadores Nitro, discos NVMe y reemplazo por fallas.</span>
              </li>
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span><strong>Red física:</strong> Cableado de fibra global submarina y mitigación masiva de ataques DDoS (Shield).</span>
              </li>
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span><strong>Regiones y zonas:</strong> Aislamiento de instalaciones, redundancia de energía (UPS y generadores diésel).</span>
              </li>
            </ul>
          </div>

          {/* Bloque Cliente */}
          <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-50/70 to-emerald-50/20 dark:from-emerald-950/30 dark:to-slate-800/50 border border-emerald-200 dark:border-emerald-900/60 shadow-xs">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-emerald-200/80 dark:border-emerald-900/50">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  Seguridad EN la Nube
                </span>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  El Cliente se encarga de:
                </h3>
              </div>
            </div>

            <ul className="space-y-3 text-xs">
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Datos del cliente:</strong> Clasificación confidencial, borrado lógico, cifrado KMS y políticas de retención.</span>
              </li>
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Identidades y Accesos (IAM):</strong> Creación de usuarios, activación de MFA y control de contraseñas.</span>
              </li>
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Permisos IAM:</strong> Políticas de menor privilegio sin privilegios comodín (*) en producción.</span>
              </li>
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Configuración de recursos:</strong> Reglas de firewall en Security Groups, Network ACLs y parches en EC2.</span>
              </li>
              <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Protección de cuentas:</strong> Bloqueo de credenciales de usuario root y alertas de CloudTrail/GuardDuty.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 2. IAM (Identity and Access Management) */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-6 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1E293B] dark:text-white">
                Gobernanza IAM (Identity and Access Management)
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Control de identidades, roles de aplicaciones, políticas JSON y estado de configuración
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={posture.status} />
            <span className="text-[10px] text-slate-400">
              Conteos de referencia del piloto académico (sin credenciales AWS reales)
            </span>
          </div>
        </div>

        {/* IAM 4 Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Usuarios IAM
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {IAM_SUMMARY_DATA.totalUsers}
            </span>
            <span className="text-[11px] text-emerald-600 block mt-0.5 font-medium">
              100% MFA Activo
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Roles IAM
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {IAM_SUMMARY_DATA.rolesCount}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              EC2 & RDS Instance Profiles
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Políticas JSON
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {IAM_SUMMARY_DATA.policiesCount}
            </span>
            <span className="text-[11px] text-blue-600 block mt-0.5 font-medium">
              Menor Privilegio
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Cuenta Root
            </span>
            <span className="text-2xl font-bold text-emerald-600">
              Bloqueada
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Sin Claves de Acceso API
            </span>
          </div>
        </div>

        {/* IAM Best Practices Checklist */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              1. Principio de Menor Privilegio (Least Privilege)
            </span>
            <StatusBadge status="Correcto" size="sm" />
          </div>
          <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              2. Roles IAM temporales para instancias EC2 (No credenciales fijas)
            </span>
            <StatusBadge status="Correcto" size="sm" />
          </div>
          <div className="flex items-center justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              3. Rotación programada de claves de acceso API (90 días)
            </span>
            <StatusBadge status="Requiere revisión" size="sm" />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              4. Deshabilitación de acceso directo root con auditoría en CloudTrail
            </span>
            <StatusBadge status="Correcto" size="sm" />
          </div>
        </div>
      </div>

      {/* 3 & 4: PROTECCIÓN DE CUENTA & PROTECCIÓN DE DATOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Protección de Cuenta */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white">
                Protección de Cuenta
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                MFA, contraseñas, roles y control administrativo
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {ACCOUNT_PROTECTION_ITEMS.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800 dark:text-white">
                    {item.name}
                  </span>
                  <StatusBadge status={item.status === 'correct' ? 'Correcto' : 'Requiere revisión'} size="sm" />
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-1">
                  {item.description}
                </p>
                <span className="text-[11px] text-slate-400 font-mono">
                  {item.details}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Protección de Datos */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-[#16A34A]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white">
                Protección de Datos
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Cifrado en reposo/tránsito, backups y control de acceso
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {DATA_PROTECTION_ITEMS.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800 dark:text-white">
                    {item.name}
                  </span>
                  <StatusBadge status="Correcto" size="sm" />
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-1">
                  {item.description}
                </p>
                <span className="text-[11px] text-slate-400 font-mono">
                  {item.details}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. CUMPLIMIENTO (SOC 2, ISO 27001, HIPAA) */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Certificaciones y Marcos de Cumplimiento Normativo
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Monitoreo continuo de adherencia a estándares globales de seguridad de la información
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Auditado por AWS Artifact
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COMPLIANCE_FRAMEWORKS.map((comp, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {comp.name}
                  </span>
                  <StatusBadge
                    status={comp.status === 'correct' ? 'Correcto' : 'Requiere revisión'}
                    size="sm"
                  />
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                  {comp.description}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500">
                {comp.details}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
