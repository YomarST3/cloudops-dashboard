import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatColorTheme = 'primary' | 'security' | 'costs' | 'alerts' | 'default';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  theme?: StatColorTheme;
  trend?: {
    text: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  theme = 'default',
  trend,
  onClick,
  className = ''
}) => {
  const themeStyles: Record<StatColorTheme, { iconBg: string; iconColor: string; borderHover: string; glow: string }> = {
    primary: {
      iconBg: 'bg-blue-50 dark:bg-blue-950/50',
      iconColor: 'text-[#2563EB]',
      borderHover: 'hover:border-blue-300 dark:hover:border-blue-700',
      glow: 'group-hover:shadow-blue-500/10'
    },
    security: {
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
      iconColor: 'text-[#16A34A]',
      borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700',
      glow: 'group-hover:shadow-emerald-500/10'
    },
    costs: {
      iconBg: 'bg-amber-50 dark:bg-amber-950/50',
      iconColor: 'text-[#F59E0B]',
      borderHover: 'hover:border-amber-300 dark:hover:border-amber-700',
      glow: 'group-hover:shadow-amber-500/10'
    },
    alerts: {
      iconBg: 'bg-rose-50 dark:bg-rose-950/50',
      iconColor: 'text-[#DC2626]',
      borderHover: 'hover:border-rose-300 dark:hover:border-rose-700',
      glow: 'group-hover:shadow-rose-500/10'
    },
    default: {
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-700 dark:text-slate-300',
      borderHover: 'hover:border-slate-300 dark:hover:border-slate-600',
      glow: 'group-hover:shadow-slate-500/10'
    }
  };

  const currentTheme = themeStyles[theme];

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-5 shadow-sm transition-all duration-200 hover:shadow-md ${currentTheme.glow} ${currentTheme.borderHover} ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wider text-[#64748B] dark:text-slate-400 uppercase">
            {title}
          </p>
          <div className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white tracking-tight">
            {value}
          </div>
        </div>
        <div
          className={`p-3 rounded-xl ${currentTheme.iconBg} ${currentTheme.iconColor} transition-transform duration-200 group-hover:scale-110 flex items-center justify-center`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(subtitle || trend) && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
          {subtitle && (
            <span className="text-[#64748B] dark:text-slate-400 font-medium truncate">
              {subtitle}
            </span>
          )}
          {trend && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                trend.isNeutral
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  : trend.isPositive
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400'
              }`}
            >
              {trend.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
