import React from 'react';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import type { SecurityMetric } from '../types/cloud';
import { StatusBadge } from './StatusBadge';

interface SecurityCardProps {
  metrics: SecurityMetric[];
  overallScore?: number;
  onViewSecurity?: () => void;
  className?: string;
}

export const SecurityCard: React.FC<SecurityCardProps> = ({
  metrics,
  overallScore = 94,
  onViewSecurity,
  className = ''
}) => {
  return (
    <div
      className={`bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-6 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-[#16A34A]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-[#1E293B] dark:text-white text-base">
              Postura de Seguridad y Cumplimiento
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Evaluación continua de Well-Architected Security Pillar
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-2xl font-extrabold text-[#16A34A]">
            {overallScore}%
          </span>
          <span className="text-[11px] block text-slate-400 dark:text-slate-500 font-medium">
            Score Global
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mb-6">
        <div
          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
          style={{ width: `${overallScore}%` }}
        />
      </div>

      {/* Metrics list */}
      <div className="space-y-3 mb-5">
        {metrics.map((metric) => {
          const statusIcon = {
            correct: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
            review: <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />,
            critical: <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          }[metric.status];

          const statusText = {
            correct: 'Correcto',
            review: 'Requiere revisión',
            critical: 'Problema'
          }[metric.status];

          return (
            <div
              key={metric.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                {statusIcon}
                <div className="truncate">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    {metric.title}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate block">
                    {metric.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {metric.score}%
                </span>
                <StatusBadge status={statusText} size="sm" />
              </div>
            </div>
          );
        })}
      </div>

      {onViewSecurity && (
        <button
          onClick={onViewSecurity}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>Auditar Modelo de Responsabilidad e IAM</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
