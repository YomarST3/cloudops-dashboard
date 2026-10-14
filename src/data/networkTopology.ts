import type { NetworkNode } from '../types/cloud';

export const NETWORK_NODES: NetworkNode[] = [
  {
    id: 'node-internet',
    name: 'Internet / Tráfico Global',
    code: 'INTERNET',
    type: 'internet',
    label: 'Clientes y Usuarios Globales',
    description: 'Tráfico público entrante originado desde navegadores web, dispositivos móviles y sistemas externos.',
    status: 'online',
    cidrOrIp: '0.0.0.0/0',
    ports: '80 (HTTP) / 443 (HTTPS)',
    protocol: 'TCP / TLS 1.3',
    role: 'Punto de origen de los usuarios finales a nivel mundial.'
  },
  {
    id: 'node-route53',
    name: 'Amazon Route 53',
    code: 'ROUTE53',
    type: 'route53',
    label: 'Servicio de Nombres DNS',
    description: 'Servicio DNS de alta disponibilidad. Resuelve el dominio corporativo hacia los edge points de CloudFront mediante registros de tipo Alias (A/AAAA).',
    status: 'online',
    cidrOrIp: 'Anycast DNS IPs',
    ports: '53 (DNS UDP/TCP)',
    protocol: 'DNS',
    role: 'Resolución DNS y enrutamiento inteligente por latencia y estado de salud.'
  },
  {
    id: 'node-cloudfront',
    name: 'Amazon CloudFront CDN',
    code: 'CLOUDFRONT',
    type: 'cloudfront',
    label: 'Red de Distribución perimetral',
    description: 'Puntos de presencia globales (Edge Locations) con caché perimetral, terminación SSL y protección WAF contra ataques DDoS y bots maliciosos.',
    status: 'online',
    cidrOrIp: 'CloudFront Edge Network',
    ports: '443 (HTTPS)',
    protocol: 'HTTPS / HTTP/3',
    role: 'Aceleración de entrega estática/dinámica y primera línea de defensa perimetral.'
  },
  {
    id: 'node-igw',
    name: 'Internet Gateway (IGW)',
    code: 'IGW',
    type: 'igw',
    label: 'Puerta de Enlace a Internet',
    description: 'Componente de VPC escalable y redundante que habilita la comunicación bidireccional entre las instancias de la subred pública e Internet.',
    status: 'online',
    cidrOrIp: '10.0.0.0/16 ↔ Internet',
    ports: 'Todos los puertos enrutados',
    protocol: 'IP Router',
    role: 'Traducción de direcciones de red (NAT 1:1) para instancias con IP pública.'
  },
  {
    id: 'node-ec2',
    name: 'Amazon EC2 Instances',
    code: 'EC2_NODES',
    type: 'ec2',
    label: 'Capa Web & Aplicación (ASG)',
    description: 'Grupo de Auto-Scaling con instancias t3.large ejecutando los microservicios backend y API REST dentro de la Subred Pública con balanceador de carga.',
    status: 'online',
    cidrOrIp: '10.0.1.50, 10.0.1.51',
    ports: '8080, 443',
    protocol: 'TCP / HTTP REST',
    role: 'Procesamiento de lógica de negocio y ejecución de contenedores Docker.'
  },
  {
    id: 'node-nat',
    name: 'NAT Gateway',
    code: 'NAT_GW',
    type: 'nat',
    label: 'Traducción de Red para Subred Privada',
    description: 'Permite a los recursos en subredes privadas conectarse a Internet para actualizaciones de software o parches de seguridad, impidiendo conexiones entrantes no solicitadas.',
    status: 'online',
    cidrOrIp: '10.0.1.250 (IP Elástica asignada)',
    ports: 'Salida hacia 80/443',
    protocol: 'TCP Outbound Only',
    role: 'Acceso seguro a repositorios externos sin exponer servidores privados.'
  },
  {
    id: 'node-rds',
    name: 'Amazon RDS Multi-AZ',
    code: 'RDS_DB',
    type: 'rds',
    label: 'Base de Datos Relacional PostgreSQL',
    description: 'Instancia primaria de base de datos relacional con réplica en espera síncrona en otra zona de disponibilidad para recuperación automática ante desastres.',
    status: 'online',
    cidrOrIp: '10.0.2.100 (Privada estricta, sin IP pública)',
    ports: '5432 (PostgreSQL)',
    protocol: 'TCP / TLS Cifrado',
    role: 'Persistencia transaccional de datos de alta integridad y ACID compliance.'
  }
];

export const NETWORK_LEGEND = [
  {
    category: 'Acceso Público',
    color: 'bg-blue-500',
    description: 'Tráfico de usuarios externos y resolución de nombres vía Route 53 y CloudFront CDN.'
  },
  {
    category: 'Perímetro VPC',
    color: 'bg-indigo-600',
    description: 'Red Virtual Privada aislada con rango de red CIDR 10.0.0.0/16.'
  },
  {
    category: 'Subred Pública',
    color: 'bg-emerald-500',
    description: 'Subred 10.0.1.0/24 con tabla de enrutamiento hacia Internet Gateway para servidores Web/App.'
  },
  {
    category: 'Subred Privada',
    color: 'bg-amber-500',
    description: 'Subred 10.0.2.0/24 aislada sin acceso público directo, reservada para bases de datos RDS y datos críticos.'
  },
  {
    category: 'Seguridad y Filtrado',
    color: 'bg-rose-500',
    description: 'Security Groups con reglas Inbound/Outbound y Network ACLs a nivel de subred.'
  }
];
