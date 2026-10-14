import React from 'react';
import {
  Server,
  HardDrive,
  Database,
  ShieldCheck,
  Network,
  Globe,
  Zap,
  Cpu,
  Layers,
  Activity,
  ArrowUpRight
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AWSService } from '../types/cloud';
import { StatusBadge } from './StatusBadge';

interface ServiceCardProps {
  service: AWSService;
  onViewDetails?: (service: AWSService) => void;
  className?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Server,
  HardDrive,
  Database,
  ShieldCheck,
  Network,
  Globe,
  Zap,
  Cpu,
  Layers,
  Activity
};

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onViewDetails,
  className = ''
}) => {
  const IconComponent = ICON_MAP[service.iconName] || Server;

  const usageStatusLabel = {
    'in-use': 'En uso',
    available: 'Disponible',
    unused: 'No utilizado'
  }[service.usageStatus];

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Compute':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'Storage':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'Database':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'Security':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      case 'Networking':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800';
      case 'Content Delivery':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div
      className={`group relative bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-600 ${className}`}
    >
      <div>
        {/* Top bar: icon, category & status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getCategoryColor(service.category)}`}>
                {service.category}
              </span>
              <h3 className="font-bold text-base text-[#1E293B] dark:text-white mt-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {service.code}
              </h3>
            </div>
          </div>
          <StatusBadge status={usageStatusLabel} />
        </div>

        {/* Full Name */}
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          {service.name}
        </p>

        {/* Description */}
        <p className="text-sm text-[#64748B] dark:text-slate-300 mb-4 line-clamp-2 leading-relaxed">
          {service.description}
        </p>

        {/* Main Function Callout */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-700/60 mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
            Función Principal
          </span>
          <p className="text-xs text-[#1E293B] dark:text-slate-200 leading-relaxed font-medium">
            {service.mainFunction}
          </p>
        </div>
      </div>

      {/* Footer info: cost & modal trigger */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
            Costo base AWS
          </span>
          <span className="text-sm font-bold text-[#F59E0B]">
            {service.monthlyBaseCost === 0 ? 'Sin costo adicional ($0)' : `$${service.monthlyBaseCost} / mes`}
          </span>
        </div>

        {onViewDetails && (
          <button
            onClick={() => onViewDetails(service)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-1 px-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
          >
            Detalles
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
