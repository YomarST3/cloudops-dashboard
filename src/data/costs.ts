import type { CostItem } from '../types/cloud';

export const INITIAL_COST_ITEMS: CostItem[] = [
  {
    id: 'cost-1',
    serviceId: 'ec2',
    serviceName: 'Amazon EC2 (2x t3.large App Servers)',
    category: 'Compute',
    quantity: 2,
    estimatedHours: 720,
    unitCost: 60,
    monthlyCost: 120,
    annualCost: 120 * 12,
    notes: 'Instancias web/app en autoscaling group dentro de la subred pública/privada.'
  },
  {
    id: 'cost-2',
    serviceId: 'rds',
    serviceName: 'Amazon RDS PostgreSQL Multi-AZ (db.t4g.medium)',
    category: 'Database',
    quantity: 1,
    estimatedHours: 720,
    unitCost: 80,
    monthlyCost: 80,
    annualCost: 80 * 12,
    notes: 'Base de datos primaria con réplica síncrona en otra zona de disponibilidad.'
  },
  {
    id: 'cost-3',
    serviceId: 's3',
    serviceName: 'Amazon S3 Standard Storage (1 TB)',
    category: 'Storage',
    quantity: 1,
    estimatedHours: 720,
    unitCost: 25,
    monthlyCost: 25,
    annualCost: 25 * 12,
    notes: 'Almacenamiento de archivos multimedia, backups automáticos y artefactos estáticos.'
  },
  {
    id: 'cost-4',
    serviceId: 'cloudfront',
    serviceName: 'Amazon CloudFront CDN (Transferencia Edge)',
    category: 'Content Delivery',
    quantity: 1,
    estimatedHours: 720,
    unitCost: 20,
    monthlyCost: 20,
    annualCost: 20 * 12,
    notes: 'Distribución global de contenidos con caché perimetral y mitigación DDoS.'
  },
  {
    id: 'cost-5',
    serviceId: 'route53',
    serviceName: 'Amazon Route 53 (DNS Hosted Zones & Health Checks)',
    category: 'Networking',
    quantity: 1,
    estimatedHours: 720,
    unitCost: 10,
    monthlyCost: 10,
    annualCost: 10 * 12,
    notes: 'Enrutamiento de nombres de dominio con comprobación de estado continua.'
  },
  {
    id: 'cost-6',
    serviceId: 'vpc',
    serviceName: 'Amazon Virtual Private Cloud (VPC Networking)',
    category: 'Networking',
    quantity: 1,
    estimatedHours: 720,
    unitCost: 0,
    monthlyCost: 0,
    annualCost: 0,
    notes: 'Topología de red con subredes públicas y privadas, tablas de ruteo e IGW (Capa base).'
  },
  {
    id: 'cost-7',
    serviceId: 'iam',
    serviceName: 'AWS Identity and Access Management (IAM)',
    category: 'Security',
    quantity: 1,
    estimatedHours: 720,
    unitCost: 0,
    monthlyCost: 0,
    annualCost: 0,
    notes: 'Control de identidades, roles de instancias, MFA y políticas JSON sin coste extra.'
  }
];
