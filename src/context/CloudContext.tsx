import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { CloudProposal, CostItem, Region, AWSService, NetworkNode, UserOrigin, ProjectAnalysisResult } from '../types/cloud';
import { DEFAULT_ORIGIN, readStoredOrigin, writeStoredOrigin, requestBrowserOrigin } from '../data/userOrigin';
import { INITIAL_PROPOSALS } from '../data/proposals';
import { INITIAL_COST_ITEMS } from '../data/costs';
import { AWS_REGIONS } from '../data/regions';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../hooks/useAuth';
import {
  toCostItem,
  toCostItemInsert,
  toOriginJson,
  toProjectAnalysis,
  toProjectAnalysisInsert,
  toProposal,
  toProposalInsert,
  toUserOrigin,
  type CostItemRow,
  type ProposalRow,
  type ProjectAnalysisRow,
} from '../lib/supabase-helpers';
import { resolveAnalysisPricing } from '../lib/analysis-pricing';
import {
  getAwsPricing,
  getAwsHealth,
  getAwsServices,
  getAwsIpRanges,
  analyzeProject,
  type AwsHealthAlert,
  type AwsHealthService,
  type AwsServiceEntry,
  type AwsIpSummaryEntry
} from '../lib/awsApi';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title?: string;
  message: string;
}

interface CloudContextType {
  // Region
  selectedRegionCode: string;
  setSelectedRegionCode: (code: string) => void;
  currentRegion: Region;
  regions: Region[];

  // Map origin
  userOrigin: UserOrigin;
  setUserOrigin: (origin: UserOrigin) => void;
  detectUserOrigin: () => Promise<UserOrigin>;

  // Proposals
  proposals: CloudProposal[];
  addProposal: (proposal: Omit<CloudProposal, 'id' | 'createdAt' | 'status'>) => void;
  deleteProposal: (id: string) => void;

  // Costs
  costItems: CostItem[];
  addCostItem: (item: Omit<CostItem, 'id' | 'monthlyCost' | 'annualCost'>) => void;
  deleteCostItem: (id: string) => void;
  updateCostQuantity: (id: string, newQuantity: number) => void;
  resetCosts: () => void;
  totalMonthlyCost: number;
  totalAnnualCost: number;

  // Dark mode
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Modals
  serviceDetailModal: AWSService | null;
  setServiceDetailModal: (service: AWSService | null) => void;
  networkNodeModal: NetworkNode | null;
  setNetworkNodeModal: (node: NetworkNode | null) => void;

  // Toasts
  toasts: ToastMessage[];
  showToast: (type: ToastMessage['type'], message: string, title?: string) => void;
  removeToast: (id: string) => void;

  // AWS live data
  awsPrices: Record<string, number>;
  awsPriceSources: Record<string, 'live' | 'snapshot'>;
  awsPriceSource: (serviceId: string) => 'live' | 'snapshot' | undefined;
  awsPricingDate: string | null;
  isPricingLoading: boolean;
  healthByService: Record<string, string>;
  healthRegionStatus: Record<string, string>;
  healthAlerts: AwsHealthAlert[];
  healthServices: AwsHealthService[];
  healthUpdatedAt: string | null;
  isHealthLoading: boolean;
  awsRegionServices: AwsServiceEntry[];
  awsTotalRegions: number;
  awsTotalServices: number;
  awsIpSummary: AwsIpSummaryEntry[];
  awsAvailabilityDate: string | null;
  isAvailabilityLoading: boolean;
  serviceAvailableInRegion: (name: string) => boolean | undefined;
  refreshAwsData: () => Promise<void>;
  defaultUnitCost: (serviceId: string) => number | undefined;

  // AI Project Analysis
  projectAnalysis: ProjectAnalysisResult | null;
  isAnalyzing: boolean;
  analyzeError: string | null;
  runProjectAnalysis: (
    projectName: string,
    code: string,
    description: string,
    language?: string
  ) => Promise<void>;
  clearProjectAnalysis: () => void;
  importAnalysisRecommendations: () => void;

  // Persistence
  /** false si faltan las variables de entorno: se guarda solo en localStorage. */
  isRemoteEnabled: boolean;
  isSyncing: boolean;
}

const CloudContext = createContext<CloudContextType | undefined>(undefined);

const LOCAL_STORAGE_PROPOSALS_KEY = 'cloudops_proposals_v1';
const LOCAL_STORAGE_COSTS_KEY = 'cloudops_costs_v1';
const LOCAL_STORAGE_REGION_KEY = 'cloudops_region_v1';
const LOCAL_STORAGE_THEME_KEY = 'cloudops_theme_v1';
const LOCAL_STORAGE_ANALYSIS_KEY = 'cloudops_ai_analysis_v1';

/** Los ids deben ser UUID: las columnas PK de Supabase los rechazan si no. */
const newId = (): string => crypto.randomUUID();

const DEBOUNCE_MS = 500;

function readJsonCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const CloudProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isSupabaseConfigured } = useAuth();
  const userId = user?.id ?? null;

  /** Con sesion y Supabase configurado, la BD es la fuente de verdad. */
  const isRemoteEnabled = isSupabaseConfigured && Boolean(userId);

  /**
   * La cache local se namespacea por usuario: si dos cuentas comparten
   * navegador, una no debe ver el borrador cacheado de la otra.
   */
  const cacheKey = useCallback(
    (base: string) => (userId ? `${base}:${userId}` : base),
    [userId]
  );

  // Region State
  const [selectedRegionCode, setSelectedRegionCodeState] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_REGION_KEY) || 'us-east-1';
  });

  // Map origin (user location used as the source of latency arcs)
  const [userOrigin, setUserOriginState] = useState<UserOrigin>(() => readStoredOrigin() || DEFAULT_ORIGIN);

  const setUserOrigin = useCallback((origin: UserOrigin) => {
    setUserOriginState(origin);
    writeStoredOrigin(origin);
  }, []);

  const detectUserOrigin = useCallback(async () => {
    const detected = await requestBrowserOrigin();
    setUserOriginState(detected);
    writeStoredOrigin(detected);
    return detected;
  }, []);

  const geolocationRequested = useRef(false);
  useEffect(() => {
    if (geolocationRequested.current) return;
    geolocationRequested.current = true;
    if (readStoredOrigin()) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    detectUserOrigin();
  }, [detectUserOrigin]);

  // Proposals State
  const [proposals, setProposals] = useState<CloudProposal[]>(() =>
    readJsonCache(LOCAL_STORAGE_PROPOSALS_KEY, INITIAL_PROPOSALS)
  );

  // Costs State
  const [costItems, setCostItems] = useState<CostItem[]>(() =>
    readJsonCache(LOCAL_STORAGE_COSTS_KEY, INITIAL_COST_ITEMS)
  );

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    if (saved !== null) {
      return saved === 'dark';
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Modals
  const [serviceDetailModal, setServiceDetailModal] = useState<AWSService | null>(null);
  const [networkNodeModal, setNetworkNodeModal] = useState<NetworkNode | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // AWS live data
  const [awsPrices, setAwsPrices] = useState<Record<string, number>>({});
  const [awsPriceSources, setAwsPriceSources] = useState<Record<string, 'live' | 'snapshot'>>({});
  const [pricingMeta, setPricingMeta] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; fetchedAt: string | null }>({
    status: 'idle',
    fetchedAt: null
  });
  const [healthServices, setHealthServices] = useState<AwsHealthService[]>([]);
  const [healthRegionStatus, setHealthRegionStatus] = useState<Record<string, string>>({});
  const [healthAlerts, setHealthAlerts] = useState<AwsHealthAlert[]>([]);
  const [healthMeta, setHealthMeta] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; updatedAt: string | null }>({
    status: 'idle',
    updatedAt: null
  });
  const pricedAtRegionRef = useRef<string | null>(null);
  const refreshSeq = useRef(0);

  // AWS live data: regional services + IP ranges
  const [awsRegionServices, setAwsRegionServices] = useState<AwsServiceEntry[]>([]);
  const [awsIpSummary, setAwsIpSummary] = useState<AwsIpSummaryEntry[]>([]);
  const [availabilityCounts, setAvailabilityCounts] = useState({ regions: 0, services: 0 });
  const [availabilityMeta, setAvailabilityMeta] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; fetchedAt: string | null }>({
    status: 'idle',
    fetchedAt: null
  });

  // AI Analysis state
  const [projectAnalysis, setProjectAnalysis] = useState<ProjectAnalysisResult | null>(() =>
    readJsonCache<ProjectAnalysisResult | null>(LOCAL_STORAGE_ANALYSIS_KEY, null)
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Persistence state
  const [isSyncing, setIsSyncing] = useState(false);

  // Refs para que los callbacks async lean el estado actual sin recrearse.
  const userIdRef = useRef<string | null>(userId);
  const isRemoteRef = useRef<boolean>(isRemoteEnabled);
  const costItemsRef = useRef<CostItem[]>(costItems);
  /** Evita escribir preferencias antes de haber leido las de la BD. */
  const prefsReadyRef = useRef(false);
  useEffect(() => {
    costItemsRef.current = costItems;
  }, [costItems]);

  useEffect(() => {
    userIdRef.current = userId;
    isRemoteRef.current = isRemoteEnabled;
    // Cambiar de cuenta: la carga vuelve a empezar y hay que esperar a que
    // termine antes de escribir preferencias.
    prefsReadyRef.current = false;
  }, [userId, isRemoteEnabled]);

  // Apply dark mode class to html element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, 'light');
    }
  }, [isDarkMode]);

  // ─── Toasts ────────────────────────────────────────────────────────────────

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastMessage['type'], message: string, title?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    const newToast: ToastMessage = { id, type, message, title };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, [removeToast]);

  // ─── Siembra inicial ───────────────────────────────────────────────────────

  /** Siembra costos y propuestas de arranque, y marca `seeded_at`. */
  const seedInitialData = async (uid: string) => {
    const seededCosts: CostItem[] = INITIAL_COST_ITEMS.map((item) => ({ ...item, id: newId() }));
    const seededProposals: CloudProposal[] = INITIAL_PROPOSALS.map((prop) => ({ ...prop, id: newId() }));

    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: uid, seeded_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);

    if (seededProposals.length > 0) {
      const { error: propError } = await supabase
        .from('proposals')
        .insert(seededProposals.map((prop) => toProposalInsert(prop, uid)));
      if (propError) throw new Error(propError.message);
    }
    if (seededCosts.length > 0) {
      const { error: costError } = await supabase
        .from('cost_items')
        .insert(seededCosts.map((item) => toCostItemInsert(item, uid)));
      if (costError) throw new Error(costError.message);
    }
  };

  // ─── Carga inicial: cache local + Supabase ─────────────────────────────────

  useEffect(() => {
    if (!isRemoteEnabled || !userId) return;
    let cancelled = false;

    const load = async () => {
      setIsSyncing(true);
      try {
        const [proposalsRes, costsRes, analysisRes, prefsRes] = await Promise.all([
          supabase.from('proposals').select('*').order('inserted_at', { ascending: false }),
          supabase.from('cost_items').select('*').order('inserted_at', { ascending: true }),
          supabase.from('project_analyses').select('*').order('analyzed_at', { ascending: false }).limit(1),
          supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
        ]);

        if (cancelled) return;

        const failure = proposalsRes.error ?? costsRes.error ?? analysisRes.error ?? prefsRes.error;
        if (failure) {
          // La cache local ya esta pintada: seguimos en modo lectura con aviso.
          showToast('warning', `No se pudo sincronizar con Supabase: ${failure.message}`, 'Modo Offline');
          return;
        }

        const nextProposals = (proposalsRes.data as ProposalRow[] | null)?.map(toProposal) ?? [];
        const nextCosts = (costsRes.data as CostItemRow[] | null)?.map(toCostItem) ?? [];
        const nextAnalysis = (analysisRes.data as ProjectAnalysisRow[] | null)?.[0];

        // Primer ingreso: sembramos los datos de arranque desde src/data/*.ts.
        // `seeded_at` evita reinsertarlos si el usuario los borra a proposito.
        const prefs = prefsRes.data;
        if (!prefs?.seeded_at && nextCosts.length === 0 && nextProposals.length === 0) {
          if (cancelled) return;
          await seedInitialData(userId);
          if (cancelled) return;
        }

        setProposals(nextProposals.length > 0 ? nextProposals : INITIAL_PROPOSALS);
        setCostItems(nextCosts.length > 0 ? nextCosts : INITIAL_COST_ITEMS);
        setProjectAnalysis(nextAnalysis ? toProjectAnalysis(nextAnalysis) : null);

        if (prefs) {
          if (prefs.region_code) setSelectedRegionCodeState(prefs.region_code);
          if (prefs.theme) setIsDarkMode(prefs.theme === 'dark');
          const storedOrigin = toUserOrigin(prefs.origin);
          if (storedOrigin) {
            setUserOriginState(storedOrigin);
            writeStoredOrigin(storedOrigin);
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          showToast('warning', `No se pudo sincronizar con Supabase: ${message}`, 'Modo Offline');
        }
      } finally {
        // Pase lo que pase, dejamos guardar preferencias: si Supabase no
        // responde trabajamos con los valores locales.
        prefsReadyRef.current = true;
        if (!cancelled) setIsSyncing(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, isRemoteEnabled, showToast]);

  // ─── Cache local (offline) ──────────────────────────────────────────────────

  useEffect(() => {
    try {
      localStorage.setItem(cacheKey(LOCAL_STORAGE_PROPOSALS_KEY), JSON.stringify(proposals));
    } catch {
      // Modo privado o cuota llena: la BD sigue siendo la fuente de verdad.
    }
  }, [proposals, cacheKey]);

  useEffect(() => {
    try {
      localStorage.setItem(cacheKey(LOCAL_STORAGE_COSTS_KEY), JSON.stringify(costItems));
    } catch {
      // idem
    }
  }, [costItems, cacheKey]);

  useEffect(() => {
    try {
      if (projectAnalysis) {
        localStorage.setItem(cacheKey(LOCAL_STORAGE_ANALYSIS_KEY), JSON.stringify(projectAnalysis));
      } else {
        localStorage.removeItem(cacheKey(LOCAL_STORAGE_ANALYSIS_KEY));
      }
    } catch {
      // idem
    }
  }, [projectAnalysis, cacheKey]);

  // ─── Preferencias: region, tema y origen ────────────────────────────────────

  const setSelectedRegionCode = useCallback(
    (code: string) => {
      setSelectedRegionCodeState(code);
      localStorage.setItem(LOCAL_STORAGE_REGION_KEY, code);
      const regionObj = AWS_REGIONS.find((r) => r.code === code);
      showToast('info', `Región activa cambiada a ${regionObj?.name || code}`, 'Infraestructura Global');
    },
    [showToast]
  );

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Un solo upsert con los tres campos, agrupado por debounce: cada clic en el
  // selector de region no puede generar un PUT por separado.
  useEffect(() => {
    if (!isRemoteEnabled || !userId) return;
    // Hasta que termine la carga inicial, estos valores son los del seed local.
    // Escribirlos aqui pisaria la region y el tema que acabamos de leer.
    if (!prefsReadyRef.current) return;

    const timer = setTimeout(() => {
      void supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: userId,
            region_code: selectedRegionCode,
            theme: isDarkMode ? 'dark' : 'light',
            origin: toOriginJson(userOrigin),
          },
          { onConflict: 'user_id' }
        );
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isRemoteEnabled, userId, selectedRegionCode, isDarkMode, userOrigin]);

  // ─── AWS live data ─────────────────────────────────────────────────────────

  const refreshAwsData = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setPricingMeta((prev) => ({ ...prev, status: 'loading' }));
    setHealthMeta((prev) => ({ ...prev, status: 'loading' }));
    setAvailabilityMeta((prev) => ({ ...prev, status: 'loading' }));

    const pricesPromise = getAwsPricing(selectedRegionCode);
    const healthPromise = getAwsHealth();
    const servicesPromise = getAwsServices(selectedRegionCode);
    const iprangesPromise = getAwsIpRanges();

    const pricesResult = await pricesPromise
      .then((data) => ({ ok: true as const, data }))
      .catch((error: Error) => ({ ok: false as const, error }));
    if (seq !== refreshSeq.current) return;

    if (pricesResult.ok) {
      const prices = pricesResult.data.items || {};
      setAwsPrices(Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v.unitMonthly])));
      setAwsPriceSources(Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v.source])));
      if (pricedAtRegionRef.current !== selectedRegionCode) {
        setCostItems((prev) =>
          prev.map((item) => {
            const real = prices[item.serviceId];
            if (!real || typeof real !== 'number') return item;
            const monthly = item.quantity * real;
            return { ...item, unitCost: real, monthlyCost: monthly, annualCost: monthly * 12 };
          })
        );
        pricedAtRegionRef.current = selectedRegionCode;
      }
      setPricingMeta({ status: 'ready', fetchedAt: pricesResult.data.fetchedAt });
    } else {
      setPricingMeta((prev) => ({ ...prev, status: 'error' }));
      showToast('error', `No se pudo consultar AWS Pricing API: ${pricesResult.error.message}`, 'Datos en Vivo');
    }

    const healthResult = await healthPromise
      .then((data) => ({ ok: true as const, data }))
      .catch((error: Error) => ({ ok: false as const, error }));
    if (seq !== refreshSeq.current) return;

    if (healthResult.ok) {
      setHealthServices(healthResult.data.services);
      setHealthRegionStatus(healthResult.data.regionStatus);
      setHealthAlerts(healthResult.data.alerts);
      setHealthMeta({ status: 'ready', updatedAt: healthResult.data.updatedAt });
    } else {
      setHealthMeta((prev) => ({ ...prev, status: 'error' }));
      showToast('error', `No se pudo consultar AWS Service Health: ${healthResult.error.message}`, 'Datos en Vivo');
    }

    const servicesResult = await servicesPromise
      .then((data) => ({ ok: true as const, data }))
      .catch((error: Error) => ({ ok: false as const, error }));
    if (seq !== refreshSeq.current) return;

    if (servicesResult.ok) {
      setAwsRegionServices(servicesResult.data.services);
      setAvailabilityCounts({ regions: servicesResult.data.regionCount, services: servicesResult.data.serviceCount });
      setAvailabilityMeta({ status: 'ready', fetchedAt: servicesResult.data.updatedAt });
    } else {
      setAvailabilityMeta((prev) => ({ ...prev, status: 'error' }));
      showToast('error', `No se pudo consultar la tabla regional AWS: ${servicesResult.error.message}`, 'Datos en Vivo');
    }

    const ipResult = await iprangesPromise
      .then((data) => ({ ok: true as const, data }))
      .catch((error: Error) => ({ ok: false as const, error }));
    if (seq !== refreshSeq.current) return;

    if (ipResult.ok && ipResult.data.services) {
      setAwsIpSummary(ipResult.data.services);
    }
  }, [selectedRegionCode, showToast]);

  // ─── Propuestas ─────────────────────────────────────────────────────────────

  const addProposal = (newProp: Omit<CloudProposal, 'id' | 'createdAt' | 'status'>) => {
    const proposal: CloudProposal = {
      ...newProp,
      id: newId(),
      createdAt: new Date().toISOString().split('T')[0],
      status: 'En revisión'
    };
    setProposals((prev) => [proposal, ...prev]);
    showToast('success', `Propuesta "${proposal.solutionName}" guardada con éxito.`, 'Planificación Cloud');

    const uid = userIdRef.current;
    if (!isRemoteRef.current || !uid) return;
    void supabase
      .from('proposals')
      .insert(toProposalInsert(proposal, uid))
      .then(({ error }) => {
        if (error) {
          setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
          showToast('error', `No se pudo guardar la propuesta: ${error.message}`, 'Planificación Cloud');
        }
      });
  };

  const deleteProposal = (id: string) => {
    const previous = proposals;
    setProposals((prev) => prev.filter((p) => p.id !== id));
    showToast('warning', 'Propuesta eliminada correctamente.', 'Planificación Cloud');

    const uid = userIdRef.current;
    if (!isRemoteRef.current || !uid) return;
    void supabase.from('proposals').delete().eq('id', id).eq('user_id', uid).then(({ error }) => {
      if (error) {
        setProposals(previous);
        showToast('error', `No se pudo eliminar la propuesta: ${error.message}`, 'Planificación Cloud');
      }
    });
  };

  // ─── Costos ────────────────────────────────────────────────────────────────

  const addCostItem = (item: Omit<CostItem, 'id' | 'monthlyCost' | 'annualCost'>) => {
    const monthlyCost = item.quantity * item.unitCost;
    const annualCost = monthlyCost * 12;
    const newItem: CostItem = {
      ...item,
      id: newId(),
      monthlyCost,
      annualCost
    };
    setCostItems((prev) => [...prev, newItem]);
    showToast('success', `Servicio ${item.serviceName} añadido a la estimación.`, 'Gestión de Costos');

    const uid = userIdRef.current;
    if (!isRemoteRef.current || !uid) return;
    void supabase
      .from('cost_items')
      .insert(toCostItemInsert(newItem, uid))
      .then(({ error }) => {
        if (error) {
          setCostItems((prev) => prev.filter((i) => i.id !== newItem.id));
          showToast('error', `No se pudo guardar el servicio: ${error.message}`, 'Gestión de Costos');
        }
      });
  };

  /**
   * Los botones +/- de Costs.tsx disparan esto en cada clic. Sin debounce cada
   * pulsacion generaria un UPDATE contra Supabase.
   */
  const quantityTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => {
    Object.values(quantityTimers.current).forEach(clearTimeout);
  }, []);

  const persistCostItem = useCallback((item: CostItem) => {
    const uid = userIdRef.current;
    if (!isRemoteRef.current || !uid) return;
    void supabase
      .from('cost_items')
      .update({
        quantity: item.quantity,
        monthly_cost: item.monthlyCost,
        annual_cost: item.annualCost,
      })
      .eq('id', item.id)
      .eq('user_id', uid)
      .then(({ error }) => {
        if (error) {
          showToast('error', `No se pudo guardar el cambio de cantidad: ${error.message}`, 'Gestión de Costos');
        }
      });
  }, [showToast]);

  const updateCostQuantity = (id: string, newQuantity: number) => {
    setCostItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const qty = Math.max(1, newQuantity);
          const monthly = qty * item.unitCost;
          return {
            ...item,
            quantity: qty,
            monthlyCost: monthly,
            annualCost: monthly * 12
          };
        }
        return item;
      })
    );

    const pending = quantityTimers.current[id];
    if (pending) clearTimeout(pending);
    quantityTimers.current[id] = setTimeout(() => {
      delete quantityTimers.current[id];
      const current = costItemsRef.current.find((i) => i.id === id);
      if (current) persistCostItem(current);
    }, DEBOUNCE_MS);
  };

  const deleteCostItem = (id: string) => {
    const previous = costItems;
    setCostItems((prev) => prev.filter((i) => i.id !== id));
    showToast('warning', 'Servicio eliminado de la estimación de costos.', 'Costos Cloud');

    const uid = userIdRef.current;
    if (!isRemoteRef.current || !uid) return;
    void supabase.from('cost_items').delete().eq('id', id).eq('user_id', uid).then(({ error }) => {
      if (error) {
        setCostItems(previous);
        showToast('error', `No se pudo eliminar el servicio: ${error.message}`, 'Costos Cloud');
      }
    });
  };

  /** Reemplaza toda la lista de costos: borra lo que habia e inserta lo nuevo. */
  const replaceCostItems = useCallback(
    async (items: CostItem[], successMessage?: string) => {
      const uid = userIdRef.current;
      if (!isRemoteRef.current || !uid) {
        if (successMessage) showToast('success', successMessage, 'Gestión de Costos');
        return;
      }
      const { error } = await supabase.from('cost_items').delete().eq('user_id', uid).select('id');
      if (error) {
        showToast('error', `No se pudo limpiar la estimación: ${error.message}`, 'Costos Cloud');
        return;
      }
      if (items.length > 0) {
        const { error: insertError } = await supabase
          .from('cost_items')
          .insert(items.map((item) => toCostItemInsert(item, uid)));
        if (insertError) {
          showToast('error', `No se pudo guardar la estimación: ${insertError.message}`, 'Costos Cloud');
          return;
        }
      }
      if (successMessage) showToast('success', successMessage, 'Gestión de Costos');
    },
    [showToast]
  );

  const applyLivePrices = useCallback((items: CostItem[]): CostItem[] => {
    if (Object.keys(awsPrices).length === 0) return items;
    return items.map((item) => {
      const real = awsPrices[item.serviceId];
      if (!real || typeof real !== 'number') return item;
      const monthly = item.quantity * real;
      return { ...item, unitCost: real, monthlyCost: monthly, annualCost: monthly * 12 };
    });
  }, [awsPrices]);

  const resetCosts = () => {
    const nextItems = applyLivePrices(INITIAL_COST_ITEMS.map((item) => ({ ...item, id: newId() })));
    setCostItems(nextItems);
    // Los precios reales ya quedaron aplicados: no recalcular al cambiar de region.
    pricedAtRegionRef.current = Object.keys(awsPrices).length > 0 ? selectedRegionCode : null;
    void replaceCostItems(nextItems);
    showToast('info', 'Costos restablecidos y recalculados con los precios reales de AWS.', 'Gestión de Costos');
  };

  // ─── AI Project Analysis ────────────────────────────────────────────────────

  const runProjectAnalysis = useCallback(
    async (projectName: string, code: string, description: string, language?: string) => {
      setIsAnalyzing(true);
      setAnalyzeError(null);
      try {
        const result = await analyzeProject({
          projectName,
          code,
          description,
          language,
          region: selectedRegionCode,
        });
        // El analizador devuelve `analysis-${Date.now()}`, que no es un UUID.
        const persisted: ProjectAnalysisResult = { ...result, id: newId() };
        setProjectAnalysis(persisted);

        const uid = userIdRef.current;
        if (isRemoteRef.current && uid) {
          const { error } = await supabase
            .from('project_analyses')
            .insert(toProjectAnalysisInsert(persisted, uid));
          if (error) {
            showToast('warning', `Análisis guardado solo en local: ${error.message}`, 'Analizador IA');
          }
        }

        showToast(
          'success',
          `Análisis completado: ${persisted.overallSecurityScore}/100 de seguridad — ${persisted.totalFindings} hallazgos.`,
          'Analizador IA'
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido al analizar el proyecto.';
        setAnalyzeError(message);
        showToast('error', message, 'Analizador IA');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [selectedRegionCode, showToast]
  );

  const clearProjectAnalysis = useCallback(() => {
    setProjectAnalysis(null);
    setAnalyzeError(null);
    showToast('info', 'Análisis de proyecto borrado.', 'Analizador IA');

    const uid = userIdRef.current;
    if (!isRemoteRef.current || !uid) return;
    void supabase.from('project_analyses').delete().eq('user_id', uid).then(({ error }) => {
      if (error) {
        showToast('error', `No se pudo borrar el análisis: ${error.message}`, 'Analizador IA');
      }
    });
  }, [showToast]);

  // Maps AI-recommended service IDs to the categories used by CostItem
  const AI_SERVICE_CATEGORY_MAP: Record<string, CostItem['category']> = {
    lambda:        'Compute',
    ec2:           'Compute',
    apigateway:    'Networking',
    rds:           'Database',
    dynamodb:      'Database',
    s3:            'Storage',
    cloudfront:    'Content Delivery',
    cognito:       'Security',
    secretsmanager:'Security',
    waf:           'Security',
    elasticache:   'Database',
    sqs:           'Compute',
    cloudwatch:    'Monitoring',
    iam:           'Security',
    vpc:           'Networking',
  };

  const importAnalysisRecommendations = useCallback(() => {
    if (!projectAnalysis || projectAnalysis.recommendedServices.length === 0) {
      showToast('warning', 'No hay servicios recomendados para importar.', 'Analizador IA');
      return;
    }

    const pricing = resolveAnalysisPricing(projectAnalysis.recommendedServices, awsPrices, awsPriceSources);

    const newItems: CostItem[] = pricing.services.map((svc) => {
      const monthlyCost = svc.monthly;
      const category = AI_SERVICE_CATEGORY_MAP[svc.serviceId] ?? 'Compute';

      return {
        id: newId(),
        serviceId: svc.serviceId,
        serviceName: svc.serviceName,
        category,
        quantity: 1,
        estimatedHours: 720,
        unitCost: monthlyCost,
        monthlyCost,
        annualCost: monthlyCost * 12,
        notes: `Importado desde análisis IA · ${svc.priority === 'required' ? 'Requerido' : 'Recomendado'} · ${svc.source === 'live' ? 'Precio AWS en vivo' : 'Estimado del analizador'} · ${svc.reason.slice(0, 60)}`,
      };
    });

    setCostItems(newItems);
    void replaceCostItems(
      newItems,
      `${newItems.length} servicios importados desde el análisis de "${projectAnalysis.projectName}".`
    );
  }, [projectAnalysis, awsPrices, awsPriceSources, replaceCostItems, showToast]);

  // ─── Calculations ───────────────────────────────────────────────────────────

  const totalMonthlyCost = costItems.reduce((acc, curr) => acc + curr.monthlyCost, 0);
  const totalAnnualCost = totalMonthlyCost * 12;

  const currentRegion = AWS_REGIONS.find((r) => r.code === selectedRegionCode) || AWS_REGIONS[0];

  // Refetch live AWS data on mount and when the active region changes
  useEffect(() => {
    refreshAwsData();
  }, [selectedRegionCode, refreshAwsData]);

  const healthByService = useMemo(() => {
    const map: Record<string, string> = {};
    for (const svc of healthServices) {
      map[svc.serviceId] = svc.regions[currentRegion.code] || 'online';
    }
    return map;
  }, [healthServices, currentRegion.code]);

  const defaultUnitCost = useCallback(
    (serviceId: string) => {
      const value = awsPrices[serviceId];
      return typeof value === 'number' ? value : undefined;
    },
    [awsPrices]
  );

  const awsPriceSource = useCallback(
    (serviceId: string): 'live' | 'snapshot' | undefined => awsPriceSources[serviceId],
    [awsPriceSources]
  );

  const serviceAvailableInRegion = useCallback(
    (name: string) => {
      if (!name || availabilityMeta.status !== 'ready' || awsRegionServices.length === 0) return undefined;
      const term = name.toLowerCase();
      return awsRegionServices.some((s) => s.name.toLowerCase().includes(term) || term.includes(s.name.toLowerCase()));
    },
    [awsRegionServices, availabilityMeta.status]
  );

  return (
    <CloudContext.Provider
      value={{
        selectedRegionCode,
        setSelectedRegionCode,
        currentRegion,
        regions: AWS_REGIONS,
        userOrigin,
        setUserOrigin,
        detectUserOrigin,
        proposals,
        addProposal,
        deleteProposal,
        costItems,
        addCostItem,
        deleteCostItem,
        updateCostQuantity,
        resetCosts,
        totalMonthlyCost,
        totalAnnualCost,
        isDarkMode,
        toggleDarkMode,
        serviceDetailModal,
        setServiceDetailModal,
        networkNodeModal,
        setNetworkNodeModal,
        toasts,
        showToast,
        removeToast,
        awsPrices,
        awsPriceSources,
        awsPricingDate: pricingMeta.fetchedAt,
        isPricingLoading: pricingMeta.status === 'loading',
        healthByService,
        healthRegionStatus,
        healthAlerts,
        healthServices,
        healthUpdatedAt: healthMeta.updatedAt,
        isHealthLoading: healthMeta.status === 'loading',
        awsRegionServices,
        awsTotalRegions: availabilityCounts.regions,
        awsTotalServices: availabilityCounts.services,
        awsIpSummary,
        awsAvailabilityDate: availabilityMeta.fetchedAt,
        isAvailabilityLoading: availabilityMeta.status === 'loading',
        serviceAvailableInRegion,
        refreshAwsData,
        defaultUnitCost,
        awsPriceSource,
        // AI Analysis
        projectAnalysis,
        isAnalyzing,
        analyzeError,
        runProjectAnalysis,
        clearProjectAnalysis,
        importAnalysisRecommendations,
        // Persistence
        isRemoteEnabled,
        isSyncing,
      }}
    >
      {children}
    </CloudContext.Provider>
  );
};

export const useCloud = () => {
  const context = useContext(CloudContext);
  if (!context) {
    throw new Error('useCloud debe ser utilizado dentro de un CloudProvider');
  }
  return context;
};