export type ServiceCategory = 
  | 'Compute' 
  | 'Storage' 
  | 'Database' 
  | 'Security' 
  | 'Networking' 
  | 'Content Delivery' 
  | 'Monitoring';

export type ServiceUsageStatus = 'in-use' | 'available' | 'unused';

export interface AWSService {
  id: string;
  name: string;
  code: string;
  category: ServiceCategory;
  description: string;
  mainFunction: string;
  usageStatus: ServiceUsageStatus;
  monthlyBaseCost: number;
  iconName: string;
  keyFeatures: string[];
  pricingDetails: string;
  architectureRole: string;
}

export type RegionStatus = 'online' | 'warning' | 'offline';

export interface Region {
  id: string;
  code: string;
  name: string;
  location: string;
  latencyMs: number;
  deployedServices: string[];
  status: RegionStatus;
  availabilityZones: number;
  flagEmoji: string;
  countryCode: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alfa-3 (ADM0_A3 de Natural Earth) para resaltar el país en el mapa. */
  countryIds: string[];
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface UserOrigin extends GeoPoint {
  label: string;
  source: 'geolocation' | 'default' | 'manual';
  /** Continente, usado solo para agrupar el desplegable de capitales. */
  group?: string;
}

export interface CostItem {
  id: string;
  serviceId: string;
  serviceName: string;
  category: ServiceCategory;
  quantity: number;
  estimatedHours: number;
  unitCost: number;
  monthlyCost: number;
  annualCost: number;
  notes?: string;
}

export type AvailabilityLevel = 'Básica' | 'Media' | 'Alta';

export interface CloudProposal {
  id: string;
  solutionName: string;
  appType: string;
  description: string;
  selectedRegion: string;
  estimatedUsers: number;
  availability: AvailabilityLevel;
  selectedServices: string[];
  migrationGoal: string;
  createdAt: string;
  status: 'Aprobada' | 'En revisión' | 'Borrador';
}

export type StatusLevel = 'correct' | 'review' | 'critical';

export interface SecurityMetric {
  id: string;
  title: string;
  status: StatusLevel;
  score: number;
  description: string;
  recommendation?: string;
}

export interface SharedResponsibilityItem {
  pillar: string;
  awsResponsibilities: string[];
  customerResponsibilities: string[];
}

export interface IAMSummary {
  totalUsers: number;
  mfaActiveCount: number;
  rolesCount: number;
  policiesCount: number;
  rootMfaActive: boolean;
  status: StatusLevel;
}

export interface ProtectionItem {
  name: string;
  category: 'account' | 'data' | 'compliance';
  status: StatusLevel;
  description: string;
  details: string;
}

// ─── AI Project Security Analysis ────────────────────────────────────────────

export type SecurityFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SecurityFinding {
  id: string;
  severity: SecurityFindingSeverity;
  category: string;
  title: string;
  description: string;
  affectedModule: string;
  lineHint?: string;
  recommendation: string;
  cweId?: string;
}

export interface ModuleAnalysis {
  /** Ruta de la carpeta agrupada, p. ej. "src/routes". */
  moduleName: string;
  language: string;
  /** Detectado por imports: "React", "Node.js/Express"... Opcional por retrocompatibilidad. */
  framework?: string;
  /** Archivos agregados en este modulo. */
  fileCount?: number;
  linesAnalyzed: number;
  securityScore: number;
  findings: SecurityFinding[];
  status: 'secure' | 'warning' | 'critical';
}

export type InfrastructureSize = 'small' | 'medium' | 'large' | 'enterprise';

export interface AwsRecommendedService {
  serviceId: string;
  serviceName: string;
  awsService: string;
  reason: string;
  estimatedMonthlyCost: number;
  priority: 'required' | 'recommended' | 'optional';
  category: string;
}

export interface ProjectAnalysisResult {
  id: string;
  projectName: string;
  analyzedAt: string;
  overallSecurityScore: number;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  modules: ModuleAnalysis[];
  summary: string;
  infrastructureSize: InfrastructureSize;
  recommendedServices: AwsRecommendedService[];
  estimatedTotalMonthlyCost: number;
  estimatedTotalAnnualCost: number;
  complianceScore: number;
  inputType: 'code' | 'description';
  /** Resumen deduplicado. Opcionales: los analisis anteriores no los traen. */
  languages?: string[];
  frameworks?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

export interface NetworkNode {
  id: string;
  name: string;
  code: string;
  type: 'internet' | 'route53' | 'cloudfront' | 'igw' | 'public_subnet' | 'ec2' | 'private_subnet' | 'rds' | 'nat';
  label: string;
  description: string;
  status: 'online' | 'warning' | 'offline';
  cidrOrIp?: string;
  ports?: string;
  protocol?: string;
  role: string;
}
