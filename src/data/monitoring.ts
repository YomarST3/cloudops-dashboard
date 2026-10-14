export interface MonitorPoint {
  time: string;
  cpu: number;
  memory: number;
  rps: number;
  errors: number;
}

export interface LiveService {
  id: string;
  name: string;
  type: string;
  status: string;
  usage: number;
  latencyMs: number;
}

export interface MonitorAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  time: string;
}

export const MONITOR_SERIES: MonitorPoint[] = [
  { time: '06h', cpu: 24, memory: 41, rps: 180, errors: 0.2 },
  { time: '07h', cpu: 33, memory: 44, rps: 240, errors: 0.3 },
  { time: '08h', cpu: 42, memory: 48, rps: 310, errors: 0.4 },
  { time: '09h', cpu: 55, memory: 54, rps: 420, errors: 0.5 },
  { time: '10h', cpu: 68, memory: 59, rps: 510, errors: 0.6 },
  { time: '11h', cpu: 72, memory: 62, rps: 560, errors: 0.5 },
  { time: '12h', cpu: 65, memory: 61, rps: 490, errors: 0.4 },
  { time: '13h', cpu: 58, memory: 58, rps: 430, errors: 0.4 },
  { time: '14h', cpu: 61, memory: 60, rps: 450, errors: 0.5 },
  { time: '15h', cpu: 70, memory: 63, rps: 520, errors: 0.6 },
  { time: '16h', cpu: 74, memory: 65, rps: 570, errors: 0.7 },
  { time: '17h', cpu: 66, memory: 63, rps: 500, errors: 0.5 },
  { time: '18h', cpu: 57, memory: 60, rps: 440, errors: 0.4 },
  { time: '19h', cpu: 52, memory: 57, rps: 380, errors: 0.4 },
  { time: '20h', cpu: 47, memory: 54, rps: 330, errors: 0.3 },
  { time: '21h', cpu: 41, memory: 51, rps: 280, errors: 0.3 },
  { time: '22h', cpu: 34, memory: 47, rps: 220, errors: 0.2 },
  { time: '23h', cpu: 29, memory: 44, rps: 180, errors: 0.2 },
  { time: '00h', cpu: 22, memory: 40, rps: 130, errors: 0.1 },
  { time: '01h', cpu: 18, memory: 38, rps: 100, errors: 0.1 },
  { time: '02h', cpu: 16, memory: 37, rps: 90, errors: 0.1 },
  { time: '03h', cpu: 15, memory: 36, rps: 80, errors: 0.1 },
  { time: '04h', cpu: 17, memory: 37, rps: 95, errors: 0.1 },
  { time: '05h', cpu: 21, memory: 39, rps: 120, errors: 0.2 }
];

export const LIVE_SERVICES: LiveService[] = [
  { id: 'ec2-web', name: 'EC2 · Frontend Web', type: 'EC2', status: 'Online', usage: 62, latencyMs: 34 },
  { id: 'ec2-bff', name: 'EC2 · Backend API', type: 'EC2', status: 'Online', usage: 55, latencyMs: 42 },
  { id: 'rds-pg', name: 'RDS · PostgreSQL', type: 'RDS', status: 'Online', usage: 48, latencyMs: 28 },
  { id: 'alb', name: 'ALB · Load Balancer', type: 'ALB', status: 'Online', usage: 41, latencyMs: 31 },
  { id: 'cf', name: 'CloudFront · CDN', type: 'CloudFront', status: 'Online', usage: 33, latencyMs: 26 },
  { id: 'lambda', name: 'Lambda · Workers', type: 'Lambda', status: 'En revisión', usage: 70, latencyMs: 72 },
  { id: 'elasticache', name: 'ElastiCache · Redis', type: 'ElastiCache', status: 'Problema', usage: 88, latencyMs: 89 },
  { id: 's3', name: 'S3 · Data Lake', type: 'S3', status: 'Online', usage: 20, latencyMs: 19 }
];

export const ALERT_FEED: MonitorAlert[] = [
  {
    id: 'alert-1',
    severity: 'critical',
    title: 'Uso de memoria elevado en ElastiCache',
    message: 'Ocupación de memoria en el clúster Redis supera el 85% durante los últimos 10 minutos.',
    time: 'Hace 2 min'
  },
  {
    id: 'alert-2',
    severity: 'warning',
    title: 'Latencia elevada en funciones Lambda',
    message: 'p95 de ejecución por encima del umbral en us-east-1, posible reutilización de contenedores en frío.',
    time: 'Hace 12 min'
  },
  {
    id: 'alert-3',
    severity: 'warning',
    title: 'CPU promedio > 70% en picos',
    message: 'Las instancias EC2 del backend registran sobrecarga durante las horas de mayor tráfico.',
    time: 'Hace 35 min'
  },
  {
    id: 'alert-4',
    severity: 'info',
    title: 'Backup nocturno de RDS completado',
    message: 'Snapshot automatizado replicado a sa-east-1 sin errores.',
    time: 'Hace 3 h'
  },
  {
    id: 'alert-5',
    severity: 'info',
    title: 'Certificado TLS ACM renovado',
    message: 'Renovación automática del certificado del dominio principal finalizada con éxito.',
    time: 'Hace 1 día'
  }
];