import React from 'react';
import { DollarSign, TrendingUp, Calendar, ShieldAlert } from 'lucide-react';

interface CostCardProps {
  monthlyTotal: number;
  annualTotal: number;
  itemCount: number;
  onManageCosts?: () => void;
  className?: string;
}

export const CostCard: React.FC<CostCardProps> = ({
  monthlyTotal,
  annualTotal,
  itemCount,
  onManageCosts,
  className = ''
}) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const dailyEstimate = (monthlyTotal / 30).toFixed(1);

  return (
    <div
      className={`bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-6 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-[#F59E0B]">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-[#1E293B] dark:text-white text-base">
              Presupuesto y Economía Cloud
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              {itemCount} servicios activos en la estimación
            </p>
          </div>
        </div>

        {onManageCosts && (
          <button
            onClick={onManageCosts}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Ajustar recursos
          </button>
        )}
      </div>

      {/* Main Numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Costo Mensual Estimado</span>
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            {formatCurrency(monthlyTotal)}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            ~${dailyEstimate} USD / día (720 hrs/mes)
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Costo Anual Proyectado</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#F59E0B]">
            {formatCurrency(annualTotal)}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Fórmula: Costo Mensual × 12 meses
          </p>
        </div>
      </div>

      {/* Cloud Economics Optimization Tip */}
      <div className="flex items-start gap-3 p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/80 rounded-xl text-xs text-emerald-900 dark:text-emerald-300">
        <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5">Optimización de Economía Cloud:</span>
          <span>
            Adoptar AWS Savings Plans o Instancias Reservadas a 1 año puede reducir hasta un 35% el costo de EC2 y RDS frente al modelo bajo demanda (On-Demand).
          </span>
        </div>
      </div>
    </div>
  );
};
