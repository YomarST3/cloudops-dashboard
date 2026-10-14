import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSpreadsheet,
  DollarSign,
  Globe2,
  ShieldCheck,
  Network,
  Boxes,
  Gauge,
  FileText,
  X,
  Cloud,
  BrainCircuit
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { computeSecurityScore } from '../lib/liveMetrics';
import { WORKLOAD_PILLARS } from '../data/reports';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const {
    proposals,
    costItems,
    awsTotalRegions,
    awsTotalServices,
    awsRegionServices,
    healthServices,
    healthAlerts,
    currentRegion,
    projectAnalysis,
  } = useCloud();

  const securityScore = useMemo(() => {
    if (!currentRegion) return null;
    return computeSecurityScore({
      regionServices: awsRegionServices,
      healthServices,
      regionCode: currentRegion.code,
      alerts: healthAlerts
    });
  }, [awsRegionServices, healthServices, healthAlerts, currentRegion]);

  const reportGrade = useMemo(() => {
    const overall = Math.round(WORKLOAD_PILLARS.reduce((acc, p) => acc + p.score, 0) / WORKLOAD_PILLARS.length);
    return overall >= 90 ? 'A+' : overall >= 80 ? 'A' : overall >= 70 ? 'B' : overall >= 60 ? 'C' : 'D';
  }, []);

  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      name: 'Analizador IA',
      path: '/project-analyzer',
      icon: BrainCircuit,
      badge: projectAnalysis ? `${projectAnalysis.overallSecurityScore}%` : 'Nuevo',
    },
    {
      name: 'Planificación Cloud',
      path: '/planning',
      icon: FileSpreadsheet,
      badge: proposals.length > 0 ? `${proposals.length}` : null
    },
    {
      name: 'Costos',
      path: '/costs',
      icon: DollarSign,
      badge: costItems.length > 0 ? `${costItems.length}` : null
    },
    {
      name: 'Infraestructura Global',
      path: '/infrastructure',
      icon: Globe2,
      badge: awsTotalRegions > 0 ? `${awsTotalRegions} Reg.` : null
    },
    {
      name: 'Seguridad',
      path: '/security',
      icon: ShieldCheck,
      badge: securityScore ? `${securityScore.score}%` : null
    },
    {
      name: 'Arquitectura de Red',
      path: '/network',
      icon: Network,
      badge: 'VPC'
    },
    {
      name: 'Servicios AWS',
      path: '/services',
      icon: Boxes,
      badge: awsTotalServices > 0 ? `${awsTotalServices}` : null
    },
    {
      name: 'Monitoreo',
      path: '/monitoring',
      icon: Gauge,
      badge: 'Live'
    },
    {
      name: 'Reportes',
      path: '/reports',
      icon: FileText,
      badge: reportGrade
    }
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white text-slate-700 dark:bg-[#0F172A] dark:text-slate-300 flex flex-col border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Logo & Header */}
        <div className="p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">
                  CloudOps
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-600/30 dark:text-blue-400 dark:border-blue-500/30">
                  AWS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Soluciones Cloud Enterprise
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 py-5 px-3 overflow-y-auto space-y-1">
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Navegación Principal
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`group flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-md shadow-blue-600/20 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-blue-700/60 text-white'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-700 dark:group-hover:text-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Live Dashboard Banner & Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/60">
          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/70 mb-3 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Datos en Vivo · AWS APIs</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Estado de salud, precios, disponibilidad regional y rangos IP desde las APIs públicas de AWS.
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              APIs Públicas Conectadas
            </span>
            <span>v2.5.0</span>
          </div>
        </div>
      </aside>
    </>
  );
};
