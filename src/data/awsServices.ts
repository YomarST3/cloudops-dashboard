import type { AWSService } from '../types/cloud';

export const AWS_SERVICES: AWSService[] = [
  {
    id: 'ec2',
    name: 'Amazon Elastic Compute Cloud (EC2)',
    code: 'EC2',
    category: 'Compute',
    description: 'Capacidad informática escalable en la nube para ejecutar aplicaciones y cargas de trabajo.',
    mainFunction: 'Ejecutar máquinas virtuales (instancias) y cargas de trabajo de aplicaciones con balanceo de carga y auto-scaling.',
    usageStatus: 'in-use',
    monthlyBaseCost: 120,
    iconName: 'Server',
    keyFeatures: [
      'Tipos de instancias optimizadas para cómputo, memoria y almacenamiento',
      'Auto Scaling Groups (ASG) según demanda de tráfico',
      'Elastic Load Balancing (ALB/NLB) para alta disponibilidad',
      'Compatibilidad con Linux, Windows Server y contenedores Docker'
    ],
    pricingDetails: '$59.90 / mes (precio real AWS Pricing · t3.large Linux on-demand × 720 h)',
    architectureRole: 'Capa de computación / API backend y microservicios en Subred Pública/Privada'
  },
  {
    id: 's3',
    name: 'Amazon Simple Storage Service (S3)',
    code: 'S3',
    category: 'Storage',
    description: 'Servicio de almacenamiento de objetos líder en la industria con 99.999999999% (11 9s) de durabilidad.',
    mainFunction: 'Almacenamiento de objetos, archivos estáticos, backups, logs y data lakes corporativos.',
    usageStatus: 'in-use',
    monthlyBaseCost: 25,
    iconName: 'HardDrive',
    keyFeatures: [
      'Almacenamiento ilimitado en buckets con políticas granulares',
      'Cifrado del lado del servidor automático (SSE-S3 o SSE-KMS)',
      'Clases de almacenamiento: S3 Standard, S3 Intelligent-Tiering, Glacier',
      'Control de versiones y ciclo de vida de objetos'
    ],
    pricingDetails: '$25.00 / mes (estimado para 1 TB de almacenamiento estándar + transferencias)',
    architectureRole: 'Almacenamiento de activos estáticos del frontend, logs de auditoría y copias de seguridad'
  },
  {
    id: 'rds',
    name: 'Amazon Relational Database Service (RDS)',
    code: 'RDS',
    category: 'Database',
    description: 'Servicio gestionado para configurar, operar y escalar bases de datos relacionales en la nube.',
    mainFunction: 'Administrar bases de datos relacionales (PostgreSQL, MySQL, Aurora) con aprovisionamiento y backups automáticos.',
    usageStatus: 'in-use',
    monthlyBaseCost: 80,
    iconName: 'Database',
    keyFeatures: [
      'Despliegue Multi-AZ para conmutación por error automatizada en segundos',
      'Backups automáticos y recuperación a un punto en el tiempo (PITR)',
      'Read Replicas para escalar cargas de lectura intensivas',
      'Aislamiento de red estricto dentro de subredes privadas sin IP pública'
    ],
    pricingDetails: '$92.88 / mes (precio real AWS Pricing · db.t4g.medium PostgreSQL Multi-AZ × 720 h)',
    architectureRole: 'Capa de persistencia relacional aislada en la Subred Privada'
  },
  {
    id: 'iam',
    name: 'AWS Identity and Access Management (IAM)',
    code: 'IAM',
    category: 'Security',
    description: 'Control de acceso seguro y granular a todos los recursos y servicios de AWS.',
    mainFunction: 'Administrar identidades de usuarios, grupos, roles de aplicación y políticas de permisos basadas en JSON con principio de menor privilegio.',
    usageStatus: 'in-use',
    monthlyBaseCost: 0,
    iconName: 'ShieldCheck',
    keyFeatures: [
      'Autenticación multifactor (MFA) obligatoria para usuarios y root',
      'Roles de IAM para instancias EC2 sin almacenamiento de credenciales estáticas',
      'Políticas basadas en identidad y basadas en recursos en formato JSON',
      'IAM Access Analyzer para verificar acceso externo imprevisto'
    ],
    pricingDetails: '$0.00 / mes (Servicio sin costo adicional incluido en AWS)',
    architectureRole: 'Gobernanza de acceso y credenciales de seguridad en todo el entorno Cloud'
  },
  {
    id: 'vpc',
    name: 'Amazon Virtual Private Cloud (VPC)',
    code: 'VPC',
    category: 'Networking',
    description: 'Red virtual aislada lógicamente donde aprovisionar y estructurar recursos de AWS con topología personalizada.',
    mainFunction: 'Crear una red virtual aislada, definir rangos CIDR, subredes públicas y privadas, tablas de ruteo e Internet Gateway.',
    usageStatus: 'in-use',
    monthlyBaseCost: 0,
    iconName: 'Network',
    keyFeatures: [
      'Aislamiento lógico de red con control total sobre bloques CIDR (10.0.0.0/16)',
      'Subredes públicas conectadas a Internet Gateway (IGW)',
      'Subredes privadas protegidas conectadas mediante NAT Gateway',
      'Security Groups (Stateful) y Network ACLs (Stateless) como cortafuegos'
    ],
    pricingDetails: '$0.00 / mes (VPC base gratuita; gateways y transferencia según uso)',
    architectureRole: 'Perímetro fundamental de red y seguridad para todos los componentes de cómputo y datos'
  },
  {
    id: 'route53',
    name: 'Amazon Route 53',
    code: 'Route 53',
    category: 'Networking',
    description: 'Servicio web de DNS en la nube altamente disponible y escalable con verificación de estado.',
    mainFunction: 'Gestión DNS, enrutamiento global de tráfico con baja latencia, conmutación por error y resolución de nombres.',
    usageStatus: 'in-use',
    monthlyBaseCost: 10,
    iconName: 'Globe',
    keyFeatures: [
      'Enrutamiento ponderado, por latencia, geolocalización y conmutación por error (Failover)',
      'Health Checks automatizados para redirigir tráfico ante fallos',
      'Registros Alias integrados directamente con CloudFront, ALB y S3',
      'SLA del 100% de disponibilidad global'
    ],
    pricingDetails: '$4.50 / mes (precio real AWS Pricing · 1 Hosted Zone + 10M consultas)',
    architectureRole: 'Punto de entrada DNS inicial que resuelve el tráfico de los usuarios hacia CloudFront'
  },
  {
    id: 'cloudfront',
    name: 'Amazon CloudFront',
    code: 'CloudFront',
    category: 'Content Delivery',
    description: 'Red de entrega de contenido (CDN) segura y de alta velocidad con puntos de presencia globales.',
    mainFunction: 'Distribución de contenido estático y dinámico mediante CDN edge locations con mitigación DDoS integrada vía AWS Shield.',
    usageStatus: 'in-use',
    monthlyBaseCost: 20,
    iconName: 'Zap',
    keyFeatures: [
      'Más de 400 puntos de presencia (PoPs) globales con baja latencia',
      'Caché perimetral de contenido estático desde S3 y aceleración de API dinámicas',
      'Terminación TLS/SSL en el borde y compatibilidad con HTTP/3',
      'Integración con AWS WAF para protección contra inyecciones SQL y ataques web'
    ],
    pricingDetails: '$20.00 / mes (Transferencia de datos saliente y solicitudes Edge)',
    architectureRole: 'Caché perimetral y capa de seguridad exterior antes de llegar a la VPC'
  },
  {
    id: 'lambda',
    name: 'AWS Lambda',
    code: 'Lambda',
    category: 'Compute',
    description: 'Ejecución de código serverless sin aprovisionar ni administrar servidores físicos ni virtuales.',
    mainFunction: 'Procesamiento serverless orientado a eventos, desencadenado por cambios en S3, DynamoDB o solicitudes API Gateway.',
    usageStatus: 'available',
    monthlyBaseCost: 15,
    iconName: 'Cpu',
    keyFeatures: [
      'Escalabilidad automática de cero a miles de ejecuciones simultáneas',
      'Facturación por milisegundo de ejecución efectiva',
      'Compatibilidad con Node.js, Python, Java, Go y contenedores',
      'Cero mantenimiento de sistema operativo'
    ],
    pricingDetails: '$15.00 / mes (Estimación para 3 millones de invocaciones/mes)',
    architectureRole: 'Microservicios serverless y procesamiento asíncrono de eventos'
  },
  {
    id: 'dynamodb',
    name: 'Amazon DynamoDB',
    code: 'DynamoDB',
    category: 'Database',
    description: 'Base de datos NoSQL de clave-valor y documentos totalmente gestionada con latencia de milisegundos de un solo dígito.',
    mainFunction: 'Almacenar datos semiestructurados con escalabilidad masiva sin servidores para sesiones y carritos de compra.',
    usageStatus: 'available',
    monthlyBaseCost: 20,
    iconName: 'Layers',
    keyFeatures: [
      'Rendimiento consistente a cualquier escala con latencias sub-10ms',
      'Capacidad On-Demand o Aprovisionada con auto-scaling',
      'Cifrado automático en reposo y tablas globales multirregión',
      'Time-to-Live (TTL) para expiración automática de registros'
    ],
    pricingDetails: '$20.00 / mes (transferencia Edge estimada de referencia)',
    architectureRole: 'Caché de sesión, tokens de autenticación y catálogo de productos'
  },
  {
    id: 'cloudwatch',
    name: 'Amazon CloudWatch',
    code: 'CloudWatch',
    category: 'Monitoring',
    description: 'Servicio de observabilidad integral para recursos de AWS y aplicaciones híbridas en tiempo real.',
    mainFunction: 'Recopilar métricas, registros (logs), trazas de eventos y disparar alarmas automatizadas de escalado o notificación.',
    usageStatus: 'available',
    monthlyBaseCost: 12,
    iconName: 'Activity',
    keyFeatures: [
      'Paneles de telemetría y monitoreo de CPU, memoria, IOPS y red en tiempo real',
      'Alarmas que disparan acciones automáticas en EC2 y notificaciones SNS',
      'CloudWatch Logs Insights para consultas interactivas de registros',
      'Detección de anomalías basada en machine learning'
    ],
    pricingDetails: '$12.00 / mes (Métricas personalizadas y retención de logs)',
    architectureRole: 'Supervisión operativa, alertas de salud del sistema y auditoría'
  }
];
