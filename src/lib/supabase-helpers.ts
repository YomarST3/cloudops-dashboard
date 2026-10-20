import type { Database } from '../integrations/supabase/types';
import type {
  AvailabilityLevel,
  CloudProposal,
  CostItem,
  ProjectAnalysisResult,
  ServiceCategory,
  UserOrigin,
} from '../types/cloud';

/**
 * Alias de las filas de Supabase.
 *
 * El resto de la app nunca importa `Database` directamente: usa estos alias
 * desde `src/types/cloud.ts` (dominio) y los mappers de abajo hacen la
 * traduccion en los bordes.
 */
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ProposalRow = Database['public']['Tables']['proposals']['Row'];
export type ProposalInsert = Database['public']['Tables']['proposals']['Insert'];
export type CostItemRow = Database['public']['Tables']['cost_items']['Row'];
export type CostItemInsert = Database['public']['Tables']['cost_items']['Insert'];
export type ProjectAnalysisRow = Database['public']['Tables']['project_analyses']['Row'];
export type ProjectAnalysisInsert = Database['public']['Tables']['project_analyses']['Insert'];
export type UserPreferencesRow = Database['public']['Tables']['user_preferences']['Row'];

export type ServiceCategoryRow = Database['public']['Enums']['service_category'];
export type AvailabilityLevelRow = Database['public']['Enums']['availability_level'];
export type ProposalStatusRow = Database['public']['Enums']['proposal_status'];
export type ThemeRow = Database['public']['Enums']['theme_preference'];

// ─── Mappers: BD -> dominio ──────────────────────────────────────────────────

/**
 * PostgREST puede devolver `numeric` como string segun la version, y `created_at`
 * (DATE) como "YYYY-MM-DD". Coercionamos a numero para no arrastrar strings en
 * los calculos de costos.
 */
const num = (value: number | string | null | undefined): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
};

export const toCostItem = (row: CostItemRow): CostItem => ({
  id: row.id,
  serviceId: row.service_id,
  serviceName: row.service_name,
  category: row.category as ServiceCategory,
  quantity: row.quantity,
  estimatedHours: row.estimated_hours,
  unitCost: num(row.unit_cost),
  monthlyCost: num(row.monthly_cost),
  annualCost: num(row.annual_cost),
  notes: row.notes ?? undefined,
});

export const toProposal = (row: ProposalRow): CloudProposal => ({
  id: row.id,
  solutionName: row.solution_name,
  appType: row.app_type,
  description: row.description,
  selectedRegion: row.selected_region,
  estimatedUsers: row.estimated_users,
  availability: row.availability as AvailabilityLevel,
  selectedServices: row.selected_services,
  migrationGoal: row.migration_goal,
  createdAt: row.created_at,
  status: row.status as CloudProposal['status'],
});

export const toProjectAnalysis = (row: ProjectAnalysisRow): ProjectAnalysisResult =>
  row.payload as unknown as ProjectAnalysisResult;

export interface ProfileSummary {
  id: string;
  displayName: string | null;
  email: string | null;
  role: 'user' | 'superadmin';
  isActive: boolean;
  createdAt: string;
}

export const toProfileSummary = (row: ProfileRow): ProfileSummary => ({
  id: row.id,
  displayName: row.display_name,
  email: row.email,
  role: row.role === 'superadmin' ? 'superadmin' : 'user',
  isActive: row.is_active,
  createdAt: row.created_at,
});

export const toUserOrigin = (origin: unknown): UserOrigin | null => {
  if (!origin || typeof origin !== 'object') return null;
  const candidate = origin as Partial<UserOrigin>;
  if (typeof candidate.lat !== 'number' || typeof candidate.lng !== 'number') return null;
  return {
    lat: candidate.lat,
    lng: candidate.lng,
    label: typeof candidate.label === 'string' ? candidate.label : 'Origen',
    source: candidate.source ?? 'manual',
    group: typeof candidate.group === 'string' ? candidate.group : undefined,
  };
};

// ─── Mappers: dominio -> BD ──────────────────────────────────────────────────

export const toCostItemInsert = (item: CostItem, userId: string): CostItemInsert => ({
  id: item.id,
  user_id: userId,
  service_id: item.serviceId,
  service_name: item.serviceName,
  category: item.category as ServiceCategoryRow,
  quantity: item.quantity,
  estimated_hours: item.estimatedHours,
  unit_cost: item.unitCost,
  monthly_cost: item.monthlyCost,
  annual_cost: item.annualCost,
  notes: item.notes ?? null,
});

export const toProposalInsert = (proposal: CloudProposal, userId: string): ProposalInsert => ({
  id: proposal.id,
  user_id: userId,
  solution_name: proposal.solutionName,
  app_type: proposal.appType,
  description: proposal.description,
  selected_region: proposal.selectedRegion,
  estimated_users: proposal.estimatedUsers,
  availability: proposal.availability as AvailabilityLevelRow,
  selected_services: proposal.selectedServices,
  migration_goal: proposal.migrationGoal,
  created_at: proposal.createdAt,
  status: proposal.status as ProposalStatusRow,
});

export const toProjectAnalysisInsert = (
  result: ProjectAnalysisResult,
  userId: string
): ProjectAnalysisInsert => ({
  id: result.id,
  user_id: userId,
  project_name: result.projectName,
  analyzed_at: result.analyzedAt,
  overall_security_score: result.overallSecurityScore,
  total_findings: result.totalFindings,
  payload: result as unknown as Database['public']['Tables']['project_analyses']['Insert']['payload'],
});

/**
 * Actualiza la fila ya insertada cuando la segunda fase (Gemini) cambia el
 * resultado. No lleva `id` ni `user_id`: la fila se localiza por su `id`, que el
 * analisis guarda como clave primaria. Insertar de nuevo crearia un segundo
 * registro del mismo analisis en vez de corregir el primero.
 */
export const toProjectAnalysisUpdate = (result: ProjectAnalysisResult) => ({
  analyzed_at: result.analyzedAt,
  overall_security_score: result.overallSecurityScore,
  total_findings: result.totalFindings,
  payload: result as unknown as Database['public']['Tables']['project_analyses']['Insert']['payload'],
});

export const toOriginJson = (origin: UserOrigin | null) =>
  (origin ?? null) as unknown as Database['public']['Tables']['user_preferences']['Insert']['origin'];