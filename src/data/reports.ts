export interface WorkloadPillar {
  id: string;
  name: string;
  shortName: string;
  score: number;
  status: string;
  description: string;
  recommendations: string[];
}

export interface ScorePoint {
  month: string;
  score: number;
}

export const WORKLOAD_PILLARS: WorkloadPillar[] = [
  {
    id: 'operational',
    name: 'Excelencia Operativa',
    shortName: 'Operativa',
    score: 90,
    status: 'Correcto',
    description: 'Automatización de despliegues, observabilidad y gestión de cambios con DevOps e IaC.',
    recommendations: [
      'Implementar enrutamiento de caos escalonado (canary) para todos los despliegues críticos',
      'Documentar manuales de ejecución (runbooks) para incidentes de disponibilidad',
      'Centralizar logs en CloudWatch Logs Insights con alertas basadas en anomalías'
    ]
  },
  {
    id: 'security',
    name: 'Seguridad',
    shortName: 'Seguridad',
    score: 94,
    status: 'Correcto',
    description: 'IAM con menor privilegio, MFA obligatorio, cifrado KMS en reposo y TLS 1.3 en tránsito.',
    recommendations: [
      'Rotar la clave de API del CI/CD hacia autenticación OIDC sin secretos estáticos',
      'Ampliar detección de GuardDuty a malwares y tráfico DNS anómalo',
      'Revisión trimestral de las directivas de Service Control Policies de la organización'
    ]
  },
  {
    id: 'reliability',
    name: 'Fiabilidad',
    shortName: 'Fiabilidad',
    score: 96,
    status: 'Correcto',
    description: 'ARQUITECTURA multi-AZ con auto-scaling, RDS multizona y plan de recuperación ante desastres.',
    recommendations: [
      'Ejercitar trimestralmente el plan de conmutación por error (DR) hacia la región secundaria',
      'Reducir el RTO probado de 45 a 20 minutos mediante procesos de restauración guiados',
      'Añadir controles de débito de datos (Rate Limiting) en el API Gateway'
    ]
  },
  {
    id: 'performance',
    name: 'Performance Eficiente',
    shortName: 'Performance',
    score: 89,
    status: 'En revisión',
    description: 'Caché con ElastiCache, CDN con CloudFront y perfiles de instancias ACU basados en carga.',
    recommendations: [
      'Activar compaction automática en el clúster Redis y supervisar el ratio de acierto de caché',
      'Evaluar ALB ponderado en el warm-up para reducir arranques en frío de Lambda',
      'Migrar consultas pesadas a Aurora Serverless v2 o a materialized views en PostgreSQL'
    ]
  },
  {
    id: 'cost',
    name: 'Optimización de Costos',
    shortName: 'Costos',
    score: 93,
    status: 'Correcto',
    description: 'Instancias reservadas y Savings Plans de cobertura del 70% del consumo base.',
    recommendations: [
      'Suscribir Savings Plans adicionales para el workload no elástico del backend',
      'Programar apagado automático de entornos de desarrollo fuera del horario laboral',
      'Configurar presupuestos de Cost Explorer con alertas del 80% y 100%'
    ]
  },
  {
    id: 'sustainability',
    name: 'Sostenibilidad',
    shortName: 'Sostenibilidad',
    score: 84,
    status: 'En revisión',
    description: 'Aprovechamiento eficiente de recursos y cambio a gravitón en servicios de cómputo.',
    recommendations: [
      'Migrar las instancias web de x86 a Arm-based Graviton para reducir el consumo energético',
      'Ajustar retención de logs y snapshots antiguos para liberar almacenamiento en frio',
      'Publicar un reporte trimestral de huella de carbono calculado con Customer Carbon Footprint'
    ]
  }
];

export const SCORE_HISTORY: ScorePoint[] = [
  { month: 'Abr', score: 78 },
  { month: 'May', score: 81 },
  { month: 'Jun', score: 85 },
  { month: 'Jul', score: 84 },
  { month: 'Ago', score: 88 },
  { month: 'Sep', score: 91 }
];

export const COMPLIANCE_PERCENT: Record<string, number> = {
  'SOC 2 Type II': 100,
  'ISO / IEC 27001:2022': 96,
  'HIPAA & GDPR / LGPD Readiness': 82
};