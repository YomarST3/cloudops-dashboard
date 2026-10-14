import React, { useState, useEffect } from 'react';
import {
  Network as NetworkIcon,
  Globe,
  Radio,
  Zap,
  Server,
  Database,
  Lock,
  ArrowDown,
  Shield,
  Layers,
  Info,
  CheckCircle2,
  Play,
  Pause,
  RefreshCw,
  Wifi
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { StatusBadge } from '../components/StatusBadge';
import { getAwsIpRanges } from '../lib/awsApi';
import type { AwsIpPrefix } from '../lib/awsApi';
import { NETWORK_NODES, NETWORK_LEGEND } from '../data/networkTopology';
import type { NetworkNode } from '../types/cloud';

export const Network: React.FC = () => {
  const { setNetworkNodeModal, currentRegion, awsIpSummary } = useCloud();
  const [isTrafficSimulated, setIsTrafficSimulated] = useState(true);
  const [ipSource, setIpSource] = useState('AMAZON');
  const [ipPrefixes, setIpPrefixes] = useState<AwsIpPrefix[]>([]);
  const [ipCount, setIpCount] = useState(0);
  const [ipDate, setIpDate] = useState<string | null>(null);
  const [ipSyncToken, setIpSyncToken] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIpLoading(true);
    setIpError(null);
    getAwsIpRanges(ipSource, currentRegion.code)
      .then((data) => {
        if (cancelled) return;
        setIpPrefixes(data.prefixes || []);
        setIpCount(data.count || 0);
        setIpDate(data.createDate || null);
        setIpSyncToken(data.syncToken || null);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setIpError(error.message);
        setIpPrefixes([]);
        setIpCount(0);
      })
      .finally(() => {
        if (!cancelled) setIpLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ipSource, currentRegion.code, reloadKey]);

  const getNode = (code: string) =>
    NETWORK_NODES.find((n) => n.code === code) || NETWORK_NODES[0];

  const internetNode = getNode('INTERNET');
  const route53Node = getNode('ROUTE53');
  const cloudfrontNode = getNode('CLOUDFRONT');
  const igwNode = getNode('IGW');
  const ec2Node = getNode('EC2_NODES');
  const natNode = getNode('NAT_GW');
  const rdsNode = getNode('RDS_DB');

  const handleNodeClick = (node: NetworkNode) => {
    setNetworkNodeModal(node);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Arquitectura de Red y Topología VPC
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Diagrama visual interactivo construido mediante componentes React: Internet → Route 53 → CloudFront → VPC → Subredes Pública y Privada.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTrafficSimulated((prev) => !prev)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isTrafficSimulated
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {isTrafficSimulated ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar Simulación de Flujo</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Simular Tráfico de Red</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Architecture Interactive Canvas */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Diagrama Topológico Activo en Tiempo Real
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Haz clic en cualquier nodo para inspeccionar sus puertos, CIDR y reglas
          </span>
        </div>

        {/* Vertical and Hierarchical React Visual Diagram */}
        <div className="max-w-4xl mx-auto space-y-6">
          {/* LEVEL 1: INTERNET */}
          <div className="flex flex-col items-center">
            <div
              onClick={() => handleNodeClick(internetNode)}
              className="cursor-pointer group w-full max-w-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/80 border-2 border-blue-300 dark:border-blue-700 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {internetNode.name}
                      </span>
                      <StatusBadge status="Online" size="sm" />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {internetNode.label} • {internetNode.cidrOrIp}
                    </span>
                  </div>
                </div>
                <Info className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </div>
            </div>

            {/* Connector Arrow 1 */}
            <div className="my-2 flex flex-col items-center">
              <div
                className={`h-8 w-0.5 ${
                  isTrafficSimulated ? 'bg-gradient-to-b from-blue-500 to-indigo-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              />
              <div className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700">
                Petición DNS (Puerto 53 UDP)
              </div>
              <ArrowDown className="w-4 h-4 text-blue-500" />
            </div>
          </div>

          {/* LEVEL 2: ROUTE 53 */}
          <div className="flex flex-col items-center">
            <div
              onClick={() => handleNodeClick(route53Node)}
              className="cursor-pointer group w-full max-w-md bg-gradient-to-r from-purple-50 to-pink-50 dark:from-slate-800 dark:to-slate-800/80 border-2 border-purple-300 dark:border-purple-700 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {route53Node.name}
                      </span>
                      <StatusBadge status="Correcto" size="sm" />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {route53Node.label} • Anycast Routing
                    </span>
                  </div>
                </div>
                <Info className="w-4 h-4 text-slate-400 group-hover:text-purple-600" />
              </div>
            </div>

            {/* Connector Arrow 2 */}
            <div className="my-2 flex flex-col items-center">
              <div
                className={`h-8 w-0.5 ${
                  isTrafficSimulated ? 'bg-gradient-to-b from-purple-500 to-cyan-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              />
              <div className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-slate-800 border border-cyan-200 dark:border-slate-700">
                Alias Record → Edge Resolution
              </div>
              <ArrowDown className="w-4 h-4 text-cyan-500" />
            </div>
          </div>

          {/* LEVEL 3: CLOUDFRONT */}
          <div className="flex flex-col items-center">
            <div
              onClick={() => handleNodeClick(cloudfrontNode)}
              className="cursor-pointer group w-full max-w-md bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-slate-800 dark:to-slate-800/80 border-2 border-cyan-300 dark:border-cyan-700 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {cloudfrontNode.name}
                      </span>
                      <StatusBadge status="Online" size="sm" />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {cloudfrontNode.label} • WAF & Caché SSL/TLS
                    </span>
                  </div>
                </div>
                <Info className="w-4 h-4 text-slate-400 group-hover:text-cyan-600" />
              </div>
            </div>

            {/* Connector Arrow 3 */}
            <div className="my-2 flex flex-col items-center">
              <div
                className={`h-8 w-0.5 ${
                  isTrafficSimulated ? 'bg-gradient-to-b from-cyan-500 to-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              />
              <div className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-slate-700">
                HTTPS Port 443 hacia Origen VPC
              </div>
              <ArrowDown className="w-4 h-4 text-emerald-500" />
            </div>
          </div>

          {/* LEVEL 4: AMAZON VPC CONTAINER */}
          <div className="border-2 border-emerald-400 dark:border-emerald-600 bg-emerald-50/20 dark:bg-slate-900/60 rounded-3xl p-6 sm:p-8 relative shadow-sm">
            {/* VPC Header Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-6 border-b border-emerald-200 dark:border-emerald-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <NetworkIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    Amazon Virtual Private Cloud (VPC-01)
                  </h3>
                  <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                    CIDR Bloque: 10.0.0.0/16 • Región: {currentRegion.code}
                  </span>
                </div>
              </div>

              {/* Internet Gateway Attached */}
              <div
                onClick={() => handleNodeClick(igwNode)}
                className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:shadow-xs"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>Internet Gateway (IGW)</span>
                <StatusBadge status="Online" size="sm" />
              </div>
            </div>

            {/* Subnets Inside the VPC */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SUBRED PÚBLICA */}
              <div className="border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-blue-200 dark:border-blue-800/60">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 block">
                        Zona de Disponibilidad: us-east-1a
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        Public Subnet (10.0.1.0/24)
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
                      Ruta 0.0.0.0/0 → IGW
                    </span>
                  </div>

                  {/* EC2 Node */}
                  <div
                    onClick={() => handleNodeClick(ec2Node)}
                    className="cursor-pointer group bg-white dark:bg-[#1E293B] border border-blue-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-all hover:border-blue-500 mb-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                          <Server className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-900 dark:text-white block">
                            Amazon EC2 (Auto Scaling Group)
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            IPs: 10.0.1.50 / 10.0.1.51
                          </span>
                        </div>
                      </div>
                      <StatusBadge status="Online" size="sm" />
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                        <Shield className="w-3 h-3" />
                        Security Group: Web-SG (Port 443)
                      </span>
                    </div>
                  </div>

                  {/* NAT Gateway Node */}
                  <div
                    onClick={() => handleNodeClick(natNode)}
                    className="cursor-pointer group bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xs hover:border-blue-400 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-amber-500" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-800 dark:text-white block">
                            NAT Gateway (Salida a Internet)
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            10.0.1.250 (EIP)
                          </span>
                        </div>
                      </div>
                      <StatusBadge status="Online" size="sm" />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Acceso público directo a través del Internet Gateway</span>
                </div>
              </div>

              {/* SUBRED PRIVADA */}
              <div className="border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-200 dark:border-amber-800/60">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400 block">
                        Zona de Disponibilidad: us-east-1b (Multi-AZ)
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        Private Subnet (10.0.2.0/24)
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                      Ruta 0.0.0.0/0 → NAT Gateway
                    </span>
                  </div>

                  {/* RDS Database Node */}
                  <div
                    onClick={() => handleNodeClick(rdsNode)}
                    className="cursor-pointer group bg-white dark:bg-[#1E293B] border border-amber-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-all hover:border-amber-500 mb-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-900 dark:text-white block">
                            Amazon RDS PostgreSQL Multi-AZ
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            IP Privada: 10.0.2.100 (Sin IP Pública)
                          </span>
                        </div>
                      </div>
                      <StatusBadge status="Online" size="sm" />
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                        <Lock className="w-3 h-3" />
                        Security Group: DB-SG (Port 5432 desde Web-SG)
                      </span>
                    </div>
                  </div>

                  {/* Multi-AZ Standby Replica Note */}
                  <div className="p-3 bg-white dark:bg-[#1E293B] rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-800 dark:text-white block mb-0.5">
                      Réplica Standby Síncrona:
                    </span>
                    <span>
                      En caso de falla de la instancia primaria, AWS realiza una conmutación automática de DNS hacia el nodo en espera sin pérdida de datos.
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1 font-medium">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Aislamiento estricto: cero exposición a direcciones públicas</span>
                </div>
              </div>
            </div>

            {/* Inter-Subnet Connector */}
            <div className="mt-5 p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between text-xs">
              <span className="font-mono text-emerald-400">
                Subred Pública (EC2) ──[ Puerto 5432 TCP / Cifrado TLS ]──▶ Subred Privada (RDS)
              </span>
              <span className="text-[10px] text-slate-400">
                Firewall Stateful (Security Groups)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real AWS Public IP Ranges Explorer */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white flex items-center gap-2">
                Rangos de IP Públicos de AWS en {currentRegion.code}
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Datos reales de ip-ranges.amazonaws.com · createDate:
                {ipDate ? ` ${ipDate}` : ipLoading ? ' cargando...' : ' -'} · syncToken:
                {ipSyncToken ? ` ${ipSyncToken}` : ' -'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={ipSource}
              onChange={(e) => setIpSource(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold"
            >
              {(awsIpSummary.length > 0
                ? awsIpSummary
                : [
                    { service: 'AMAZON', count: 0 },
                    { service: 'EC2', count: 0 },
                    { service: 'S3', count: 0 },
                    { service: 'CLOUDFRONT', count: 0 },
                    { service: 'ROUTE53', count: 0 },
                    { service: 'LAMBDA', count: 0 }
                  ]
              ).map((svc) => (
                <option key={svc.service} value={svc.service}>
                  {svc.service} · {svc.count.toLocaleString()} bloques
                </option>
              ))}
            </select>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all inline-flex items-center gap-1.5"
              disabled={ipLoading}
              title="Consultar de nuevo en AWS"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ipLoading ? 'animate-spin' : ''}`} />
              Recargar
            </button>
          </div>
        </div>

        {ipError && (
          <p className="mb-3 text-xs text-rose-600 dark:text-rose-400 font-medium">
            No se pudo consultar los rangos IP: {ipError}. Intenta de nuevo.
          </p>
        )}

        <div className="mb-3 flex items-center gap-2 text-xs">
          <StatusBadge status={ipCount > 0 ? 'Online' : ipLoading ? 'En revisión' : 'Problema'} size="sm" />
          <span className="text-slate-500 dark:text-slate-400">
            <strong className="text-slate-800 dark:text-white">{ipCount.toLocaleString()}</strong> bloques para {ipSource} en la región {currentRegion.code}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
          {ipPrefixes.map((p, idx) => (
            <div
              key={`${p.prefix}-${idx}`}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60"
            >
              <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                {p.prefix}
              </span>
              <span
                className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  p.ipv6
                    ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                    : 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300'
                }`}
              >
                {p.ipv6 ? 'IPv6' : 'IPv4'}
              </span>
            </div>
          ))}
          {!ipLoading && ipPrefixes.length === 0 && !ipError && (
            <p className="md:col-span-2 xl:col-span-3 py-4 text-center text-xs text-slate-400">
              No hay bloques publicados de {ipSource} para la región {currentRegion.code}
              (puede tratarse de un servicio global con rangos sin región específica).
            </p>
          )}
        </div>
      </div>

      {/* Leyenda Explicativa de Arquitectura de Red */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <h3 className="font-bold text-base text-[#1E293B] dark:text-white mb-2 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Leyenda y Explicación de Componentes de Red
        </h3>
        <p className="text-xs text-[#64748B] dark:text-slate-400 mb-5">
          Guía técnica para comprender el flujo de paquetes y las barreras de aislamiento en la arquitectura AWS.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {NETWORK_LEGEND.map((item, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60"
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className={`w-3.5 h-3.5 rounded-full ${item.color}`} />
                <h4 className="font-bold text-slate-800 dark:text-white text-xs">
                  {item.category}
                </h4>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
