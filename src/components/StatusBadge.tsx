import React from 'react';

export type BadgeVariant = 
  | 'success' 
  | 'warning' 
  | 'danger' 
  | 'info' 
  | 'neutral' 
  | 'online' 
  | 'review' 
  | 'critical' 
  | 'in-use' 
  | 'available' 
  | 'unused';

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  size = 'md',
  showDot = true,
  className = ''
}) => {
  // Infer variant if not provided directly
  const getComputedVariant = (): BadgeVariant => {
    if (variant) return variant;
    const lower = status.toLowerCase();

    if (
      lower.includes('online') ||
      lower.includes('operational') ||
      lower.includes('correcto') ||
      lower.includes('en uso') ||
      lower.includes('aprobada') ||
      lower.includes('correct') ||
      lower.includes('activo')
    ) {
      return 'success';
    }

    if (
      lower.includes('warning') ||
      lower.includes('revisión') ||
      lower.includes('review') ||
      lower.includes('alerta') ||
      lower.includes('media')
    ) {
      return 'warning';
    }

    if (
      lower.includes('offline') ||
      lower.includes('critical') ||
      lower.includes('problema') ||
      lower.includes('error') ||
      lower.includes('bloqueado')
    ) {
      return 'danger';
    }

    if (
      lower.includes('disponible') ||
      lower.includes('available') ||
      lower.includes('networking') ||
      lower.includes('compute')
    ) {
      return 'info';
    }

    return 'neutral';
  };

  const computed = getComputedVariant();

  const stylesByVariant: Record<BadgeVariant, { bg: string; text: string; dot: string; border: string }> = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      dot: 'bg-emerald-500',
      border: 'border-emerald-200 dark:border-emerald-800'
    },
    online: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      dot: 'bg-emerald-500 animate-pulse',
      border: 'border-emerald-200 dark:border-emerald-800'
    },
    'in-use': {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      dot: 'bg-emerald-500',
      border: 'border-emerald-200 dark:border-emerald-800'
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-400',
      dot: 'bg-amber-500',
      border: 'border-amber-200 dark:border-amber-800'
    },
    review: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-400',
      dot: 'bg-amber-500',
      border: 'border-amber-200 dark:border-amber-800'
    },
    danger: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-400',
      dot: 'bg-rose-500',
      border: 'border-rose-200 dark:border-rose-800'
    },
    critical: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-400',
      dot: 'bg-rose-500 animate-ping',
      border: 'border-rose-200 dark:border-rose-800'
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-400',
      dot: 'bg-blue-500',
      border: 'border-blue-200 dark:border-blue-800'
    },
    available: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-400',
      dot: 'bg-blue-500',
      border: 'border-blue-200 dark:border-blue-800'
    },
    neutral: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-600 dark:text-slate-400',
      dot: 'bg-slate-400',
      border: 'border-slate-200 dark:border-slate-700'
    },
    unused: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-600 dark:text-slate-400',
      dot: 'bg-slate-400',
      border: 'border-slate-200 dark:border-slate-700'
    }
  };

  const style = stylesByVariant[computed] || stylesByVariant.neutral;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3 py-1.5 gap-2 font-medium'
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border ${style.bg} ${style.text} ${style.border} ${sizeClasses[size]} transition-all duration-150 ${className}`}
    >
      {showDot && <span className={`w-2 h-2 rounded-full ${style.dot}`} />}
      <span className="capitalize">{status}</span>
    </span>
  );
};
