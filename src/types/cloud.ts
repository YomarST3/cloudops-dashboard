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
  /**
   * Que capa detecto el hallazgo: los regex de siempre (`ai-analyze`) o la
   * revision con Gemini (`ai-review`). Opcional porque los analisis guardados
   * antes de la IA no lo traen, y en la interfaz se tratan como `regex`.
   */
  source?: 'regex' | 'ai';
  /**
   * Ruta real del archivo donde esta el problema, p. ej. "src/routes/auth.js".
   * Antes el modulo se resolvia por carpeta y el archivo se perdia al agrupar,
   * asi que un hallazgo no se podia señalar en el codigo. Opcional: los
   * analisis antiguos no lo traen, y tampoco lo traen los hallazgos de la IA si
   * el modelo no sabe decir el archivo.
   */
  file?: string;
  /** Linea real dentro de `file`. */
  line?: number;
  /**
   * Cuantas veces aparece el problema en el modulo. Antes el motor solo
   * registraba UN hallazgo por patron y modulo, asi que 5 inyecciones SQL y una
   * inyeccion daban el mismo resultado, y el analisis no podia distinguir un
   * problema aislado de un problema generalizado.
   */
  occurrences?: number;
  /** Hasta las primeras localizaciones, para poder abrir varias de un vistazo. */
  locations?: { file: string; line: number }[];
  /**
   * Consejo de endurecimiento que NO es una vulnerabilidad, del tipo "tienes
   * imports" o "no validas el env". Esas categorias salían en casi cualquier
   * proyecto real, asi que penalizarlas hacia que el score fuera bajo sin que
   * hubiera un solo fallo. Se muestran aparte y no suman al score. Opcional por
   * compatibilidad con los analisis ya guardados.
   */
  advisory?: boolean;
}

/**
 * Un control de cumplimiento con aprobado/fallo. Sustituye al porcentaje que
 * antes salia de "100 menos diez por cada categoria de vulnerabilidad", que
 * no significaba nada explicable.
 */
export interface ComplianceControl {
  id: string;
  label: string;
  passed: boolean;
  /** Por que pasa o por que falla, en una frase. Es lo que lo hace defendible. */
  detail: string;
}

/** Una resta del score, para poder mostrar la cuenta completa. */
export interface ScoreLine {
  /** Texto del hallazgo, con su localizacion: "Inyeccion SQL - src/db.ts:12". */
  label: string;
  severity: SecurityFindingSeverity;
  penalty: number;
  /** Cuantas veces se repite el problema en ese modulo. */
  occurrences?: number;
}

/**
 * Metricas de cobertura, que son las que dicen de verdad cuanto del proyecto
 * esta afectado. El indice 0-100 no sirve para eso: 100 puntos solo significan
 * "ninguno de mis 15 patrones disparo en este modulo".
 *
 * Son las cifras que publican las herramientas de verdad (SonarQube habla de
 * "% de archivos con problemas"), y las que caen en rangos razonables: un
 * proyecto pequeño y bien construido se situa en el 1-5%, no en el 95%.
 */
export interface CoverageMetrics {
  /** Archivos de codigo que se llegaron a analizar. */
  filesAnalyzed: number;
  /** Archivos con al menos una observacion (vulnerabilidad o recomendacion). */
  filesWithFindings: number;
  /** Archivos con al menos una vulnerabilidad real. */
  filesWithVulnerabilities: number;
  /** % de archivos con alguna observacion, con un decimal. */
  fileIssueRate: number;
  /** % de archivos con una vulnerabilidad real, con un decimal. */
  vulnerabilityFileRate: number;
  /** Observaciones por cada 1000 lineas de codigo, con dos decimales. */
  findingsPerThousandLines: number;
  /** Cuantas reglas se aplicaron. Sirve para decir el alcance del analisis. */
  rulesApplied: number;
  /**
   * Hallazgos que no se pudieron atribuir a un archivo concreto. Suelen ser de
   * la IA: el modelo detecta algo pero su texto no trae una ruta legible.
   *
   * Se cuentan aparte a proposito. Si no, el porcentaje de archivos saldria en
   * 0% mientras el total de hallazgos es 1, que es justo la contradiccion que
   * hace que una pantalla parezca no cuadrar.
   */
  unattributedFindings?: number;
  /** Que se reviso en cada lenguaje: archivos, reglas aplicadas y detecciones. */
  perLanguage?: {
    language: string;
    files: number;
    rules: number;
    detections: number;
    vulnerabilities: number;
  }[];
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
  // ─── Revision con IA (Gemini) ────────────────────────────────────────────
  // Opcionales por el mismo motivo: un analisis hecho solo con regex es valido
  // y es lo que se obtiene cuando no hay GEMINI_API_KEY configurada.

  /** Si el analisis llego a consultar a Gemini (no basta con tener la clave). */
  aiEnabled?: boolean;
  /** Modelo que respondio, para mostrarlo en la interfaz. */
  aiModel?: string;
  /** Cuantos de los hallazgos totales los aporto la IA. */
  aiFindingCount?: number;
  /** Por que no se pudo completar la revision, si fallo. La IA nunca es bloqueante. */
  aiError?: string;
  /**
   * Los controles de cumplimiento con su aprobado/fallo y el motivo. Es la
   * version explicable del porcentaje: seis preguntas con nombre en vez de un
   * numero del que no se sabe de donde sale.
   */
  complianceControls?: ComplianceControl[];
  /** La cuenta del score, resta a resta, para poder mostrarla y justificarla. */
  scoreBreakdown?: ScoreLine[];
  /** Cuantos hallazgos son recomendaciones y no vulnerabilidades. */
  advisoryCount?: number;
  /**
   * Hallazgos que la IA detecto pero sin decir en que archivo estan. Se
   * muestran aparte y NO suman al score ni a los contadores: no hay forma de
   * comprobarlos. Si entran dentro del titular, el usuario ve una nota baja
   * por algo que no puede abrir, y eso es justo lo que hace que un informe
   * parezca poco creible.
   */
  unattributedFindingsDetail?: SecurityFinding[];
  /**
   * Las cifras de cobertura. Opcionales: los analisis anteriores no las traen,
   * y sin ellas la interfaz cae a mostrar solo el indice 0-100.
   */
  coverage?: CoverageMetrics;
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
