import React from 'react';
import { US, BR, IE, SG } from 'country-flag-icons/react/3x2';

type FlagIcon = React.ComponentType<{ className?: string; title?: string }>;

const FLAGS: Record<string, FlagIcon> = {
  US,
  BR,
  IE,
  SG
};

const SIZE_CLASSES = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-10 h-10'
} as const;

interface RegionFlagProps {
  countryCode: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  title?: string;
}

export const RegionFlag: React.FC<RegionFlagProps> = ({
  countryCode,
  size = 'sm',
  className = '',
  title
}) => {
  const Flag = FLAGS[countryCode.toUpperCase()];
  if (!Flag) return null;

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700/70 shrink-0 ${SIZE_CLASSES[size]} ${className}`}
    >
      <Flag className="w-[150%] h-full max-w-none" title={title} />
    </span>
  );
};