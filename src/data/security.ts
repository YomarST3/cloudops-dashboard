import type { SharedResponsibilityItem, IAMSummary, ProtectionItem, SecurityMetric } from '../types/cloud';

export const SHARED_RESPONSIBILITY_DATA: SharedResponsibilityItem[] = [
  {
    pillar: 'Infraestructura Física y Hardware',
    awsResponsibilities: [
      'Seguridad perimetral y guardias en centros de datos biométricos',
      'Mantenimiento físico de servidores, racks y unidades de almacenamiento',
      'Destrucción segura de discos duros según estándar DoD 5220.22-M',
      'Climatización, alimentación eléctrica ininterrumpida (UPS) y generadores diesel'
    ],
    customerResponsibilities: [
      'Ninguna responsabilidad directa sobre el hardware o data center físico'
    ]
  },
  {
    pillar: 'Red y Conectividad',
    awsResponsibilities: [
      'Cables de fibra óptica suboceánica y backbones globales propietarios',
      'Protección de capa de red contra ataques volumétricos DDoS (AWS Shield Standard)',
      'Aislamiento hipervisor de paquetes entre diferentes clientes (Multi-tenant)'
    ],
    customerResponsibilities: [
      'Configuración de subredes, tablas de enrutamiento y Security Groups en la VPC',
      'Definición de reglas de firewall de entrada (Inbound) y salida (Outbound)',
      'Establecimiento de túneles VPN o Direct Connect hacia instalaciones locales'
    ]
  },
  {
    pillar: 'Sistemas Operativos y Parcheo',
    awsResponsibilities: [
      'Actualizaciones y parches del hipervisor de virtualización Nitro/Xen',
      'Mantenimiento y parches de sistemas operativos en servicios gestionados (RDS, Lambda)'
    ],
    customerResponsibilities: [
      'Parcheo y actualización regular del sistema operativo en instancias EC2',
      'Gestión de vulnerabilidades y hardening de imágenes AMI utilizadas'
    ]
  },
  {
    pillar: 'Datos, Identidades y Criptografía',
    awsResponsibilities: [
      'Módulos de seguridad de hardware (HSM) certificados FIPS 140-2 en AWS KMS',
      'Facilidad de cifrado nativo en reposo y en tránsito en toda la nube'
    ],
    customerResponsibilities: [
      'Clasificación de datos y habilitación de cifrado (KMS / TLS)',
      'Gestión del ciclo de vida de usuarios, credenciales y MFA en AWS IAM',
      'Políticas de menor privilegio y gobernanza de claves de acceso API'
    ]
  }
];

export const IAM_SUMMARY_DATA: IAMSummary = {
  totalUsers: 8,
  mfaActiveCount: 8,
  rolesCount: 14,
  policiesCount: 22,
  rootMfaActive: true,
  status: 'correct'
};

export const ACCOUNT_PROTECTION_ITEMS: ProtectionItem[] = [
  {
    name: 'Autenticación Multifactor (MFA)',
    category: 'account',
    status: 'correct',
    description: '100% de los usuarios y la cuenta raíz tienen activado token de seguridad virtual o hardware.',
    details: '8 de 8 usuarios con MFA obligatorio aplicado mediante directiva SCP de AWS Organizations.'
  },
  {
    name: 'Política de Complejidad de Contraseñas',
    category: 'account',
    status: 'correct',
    description: 'Mínimo 14 caracteres, caracteres especiales, números y rotación forzada cada 90 días.',
    details: 'Se prohíbe la reutilización de las últimas 12 contraseñas utilizadas.'
  },
  {
    name: 'Acceso Administrativo y Cuenta Root',
    category: 'account',
    status: 'correct',
    description: 'La cuenta raíz de AWS no cuenta con claves de acceso activas y está bajo estricta auditoría.',
    details: 'Las tareas administrativas se ejecutan mediante roles IAM temporales asumidos vía SSO.'
  },
  {
    name: 'Revisión Periódica de Credenciales',
    category: 'account',
    status: 'review',
    description: 'Existe 1 clave de acceso antigua (mayor a 90 días) asignada a un servicio de integración continua.',
    details: 'Se recomienda reemplazarla por roles OIDC con GitHub Actions sin secretos estáticos.'
  }
];

export const DATA_PROTECTION_ITEMS: ProtectionItem[] = [
  {
    name: 'Cifrado en Reposo (Encryption at Rest)',
    category: 'data',
    status: 'correct',
    description: 'Todos los volúmenes EBS, buckets S3 y bases de datos RDS están cifrados con claves KMS gestionadas.',
    details: 'Algoritmo AES-256 aplicado automáticamente por directiva en toda la organización.'
  },
  {
    name: 'Cifrado en Tránsito (Encryption in Transit)',
    category: 'data',
    status: 'correct',
    description: 'Certificados TLS 1.3 gestionados por AWS Certificate Manager (ACM) en CloudFront y ALB.',
    details: 'Redirección forzada de HTTP a HTTPS activada en toda la infraestructura.'
  },
  {
    name: 'Copias de Seguridad Automatizadas (Backups)',
    category: 'data',
    status: 'correct',
    description: 'Snapshots diarios de RDS con retención de 30 días y replicación cruzada entre regiones.',
    details: 'AWS Backup orquesta la captura nocturna de instancias EC2 y volúmenes EBS.'
  },
  {
    name: 'Control de Acceso Público en S3 (Block Public Access)',
    category: 'data',
    status: 'correct',
    description: 'Activada la protección a nivel de cuenta completa para impedir cualquier bucket público accidental.',
    details: 'Cero buckets S3 expuestos directamente a internet.'
  }
];

export const COMPLIANCE_FRAMEWORKS: ProtectionItem[] = [
  {
    name: 'SOC 2 Type II',
    category: 'compliance',
    status: 'correct',
    description: 'Alineado con los principios de confianza de seguridad, disponibilidad e integridad confidencial.',
    details: 'Auditoría anual validada. Controles implementados con AWS Security Hub y Config.'
  },
  {
    name: 'ISO / IEC 27001:2022',
    category: 'compliance',
    status: 'correct',
    description: 'Sistema de Gestión de Seguridad de la Información (SGSI) plenamente documentado y auditado.',
    details: 'Controles criptográficos y segmentación de redes validados.'
  },
  {
    name: 'HIPAA & GDPR / LGPD Readiness',
    category: 'compliance',
    status: 'review',
    description: 'Tratamiento de datos personales con anonimización y registros de auditoría detallados.',
    details: 'Se requiere completar la formalización del Business Associate Agreement (BAA) en la región de São Paulo.'
  }
];

export const SECURITY_METRICS: SecurityMetric[] = [
  {
    id: 'iam',
    title: 'Gobernanza IAM',
    status: 'correct',
    score: 98,
    description: 'Políticas de mínimo privilegio y MFA en todas las cuentas operativas.',
    recommendation: 'Rotar clave de API de CI/CD hacia autenticación por token OIDC.'
  },
  {
    id: 'account',
    title: 'Protección de Cuentas',
    status: 'correct',
    score: 95,
    description: 'Acceso raíz bloqueado, monitoreo de sesiones anómalas con GuardDuty.',
    recommendation: 'Mantener revisión trimestral de directivas de Service Control Policies.'
  },
  {
    id: 'data',
    title: 'Protección de Datos',
    status: 'correct',
    score: 100,
    description: 'Cifrado AES-256 en reposo (KMS) y TLS 1.3 en tránsito.',
    recommendation: 'Verificación de backups automatizada periódica.'
  },
  {
    id: 'compliance',
    title: 'Cumplimiento Normativo',
    status: 'review',
    score: 88,
    description: 'SOC 2 e ISO 27001 conformes. Pendiente firma de BAA para GDPR regional.',
    recommendation: 'Cerrar revisión de cumplimiento en la región sa-east-1.'
  },
  {
    id: 'shared',
    title: 'Modelo Responsabilidad',
    status: 'correct',
    score: 96,
    description: 'Límites operativos claros entre la infraestructura de AWS y la configuración del cliente.',
    recommendation: 'Documentar matriz de asignación de roles técnicos.'
  }
];
