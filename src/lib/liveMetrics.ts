import type { AwsHealthAlert, AwsHealthService, AwsServiceEntry } from './awsApi';

export const SECURITY_SERVICE_TERMS = [
  'Identity and Access Management',
  'Key Management Service',
  'CloudTrail',
  'GuardDuty',
  'Shield',
  'AWS WAF',
  'Secrets Manager'
];

export const CORE_SERVICE_IDS = ['ec2', 'rds', 's3', 'cloudfront', 'lambda', 'alb'];

export function countMatchingServices(list: AwsServiceEntry[], terms: string[]): number {
  if (list.length === 0) return 0;
  const haystack = list.map((s) => s.name.toLowerCase());
  return terms.filter((term) => {
    const t = term.toLowerCase();
    return haystack.some((name) => name.includes(t) || t.includes(name));
  }).length;
}

export interface SecurityComputation {
  score: number;
  status: 'Correcto' | 'Requiere revisión' | 'Problema';
  securityAvailable: number;
  securityTotal: number;
  coreOnline: number;
  coreTotal: number;
  activeAlerts: number;
  alertPenalty: number;
  appliedPenalty: number;
  alertsOtherRegions: number;
}

export function computeSecurityScore(opts: {
  regionServices: AwsServiceEntry[];
  healthServices: AwsHealthService[];
  regionCode: string;
  alerts: AwsHealthAlert[];
}): SecurityComputation {
  const securityTotal = SECURITY_SERVICE_TERMS.length;
  const securityAvailable = countMatchingServices(opts.regionServices, SECURITY_SERVICE_TERMS);
  const coverageRatio = opts.regionServices.length > 0 ? securityAvailable / securityTotal : 0;

  const present = opts.healthServices.filter((s) => CORE_SERVICE_IDS.includes(s.serviceId));
  const coreTotal = CORE_SERVICE_IDS.length;
  const coreOnline = present.filter((s) => {
    const status = s.regions[opts.regionCode];
    if (!status) return false;
    return status === 'online' || status === 'operational';
  }).length;
  const healthRatio = coreTotal > 0 ? coreOnline / coreTotal : 1;

  const regionAlerts = opts.alerts.filter(
    (a) => a.regionCode === opts.regionCode || a.regionCode === 'Global'
  );
  const critical = regionAlerts.filter((a) => a.severity === 'critical').length;
  const warning = regionAlerts.filter((a) => a.severity === 'warning').length;
  const info = regionAlerts.filter((a) => a.severity === 'info').length;
  const alertPenalty = Math.min(25, critical * 9 + warning * 4 + info * 1);
  const appliedPenalty = Math.min(alertPenalty, 20);
  const alertsOtherRegions = opts.alerts.length - regionAlerts.length;

  const score = Math.max(
    0,
    Math.min(100, Math.round(coverageRatio * 45 + healthRatio * 35 + Math.max(0, 20 - alertPenalty)))
  );

  const status = score >= 90 ? 'Correcto' : score >= 70 ? 'Requiere revisión' : 'Problema';
  return {
    score,
    status,
    securityAvailable,
    securityTotal,
    coreOnline,
    coreTotal,
    activeAlerts: regionAlerts.length,
    alertPenalty,
    appliedPenalty,
    alertsOtherRegions
  };
}