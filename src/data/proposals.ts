import type { CloudProposal } from '../types/cloud';

export const INITIAL_PROPOSALS: CloudProposal[] = [
  {
    id: 'prop-1',
    solutionName: 'Plataforma E-Commerce Omnicanal',
    appType: 'E-commerce',
    description: 'Solución web escalable para comercio electrónico con procesamiento transaccional, catálogo de productos con CDN y base de datos relacional Multi-AZ.',
    selectedRegion: 'us-east-1',
    estimatedUsers: 150000,
    availability: 'Alta',
    selectedServices: ['EC2', 'S3', 'RDS', 'IAM', 'VPC', 'Route 53', 'CloudFront'],
    migrationGoal: 'Modernizar la infraestructura on-premise hacia arquitectura cloud elástica, reduciendo tiempo de respuesta a nivel global y garantizando 99.99% de SLA.',
    createdAt: '2026-09-15',
    status: 'Aprobada'
  },
  {
    id: 'prop-2',
    solutionName: 'Portal Corporativo y Gestión de Clientes (CRM)',
    appType: 'Sistema empresarial',
    description: 'Sistema empresarial de gestión comercial y reportes analíticos con autenticación federada, almacenamiento seguro de contratos y aislamiento en subred privada.',
    selectedRegion: 'us-west-2',
    estimatedUsers: 25000,
    availability: 'Media',
    selectedServices: ['EC2', 'RDS', 'S3', 'IAM', 'VPC'],
    migrationGoal: 'Consolidar servidores locales heredados, optimizar costos operativos y asegurar cumplimiento normativo SOC 2.',
    createdAt: '2026-09-18',
    status: 'En revisión'
  }
];
