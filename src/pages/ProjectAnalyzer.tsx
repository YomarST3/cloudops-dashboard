import React, { useState, useRef, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Upload,
  FileCode2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  Calculator,
  Lightbulb,
  CheckCircle2,
  Server,
  DollarSign,
  Sparkles,
  Trash2,
  ArrowRight,
  Lock,
  Zap,
  Cloud,
  Database,
  Network,
  Eye,
  BarChart3,
  FolderArchive,
  FileType2,
  X,
  PackageOpen,
  FileDown,
  Loader2
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { useAuth } from '../hooks/useAuth';
import { generateAnalysisReportPdf } from '../lib/pdf-report';
import { resolveAnalysisPricing, type ResolvedService } from '../lib/analysis-pricing';
import type { SecurityFinding, ModuleAnalysis } from '../types/cloud';

// ─── Constants ────────────────────────────────────────────────────────────────

// Extensiones de código que se analizan
const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'java', 'cs', 'go', 'php', 'rb',
  'cpp', 'c', 'h', 'rs', 'swift', 'kt',
  'vue', 'svelte', 'html', 'sql',
]);

// Rutas que se ignoran al extraer ZIPs. `.output` y `.wrangler` son artefactos
// de build: cientos de bundles minificados que solo generan falsos positivos.
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'vendor', 'target',
  '.idea', '.vscode', 'coverage', '.cache',
  '.output', '.wrangler', '.svelte-kit', '.astro', '.turbo', '.vercel',
]);

const MAX_FILE_BYTES = 200 * 1024; // 200 KB por archivo
const MAX_TOTAL_CHARS = 400_000;   // límite de texto al API

const SEVERITY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.FC<{ className?: string }> }
> = {
  critical: {
    label: 'Crítico',
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-200 dark:border-rose-800',
    icon: ShieldX,
  },
  high: {
    label: 'Alto',
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    border: 'border-orange-200 dark:border-orange-800',
    icon: ShieldAlert,
  },
  medium: {
    label: 'Medio',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
  },
  low: {
    label: 'Bajo',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800',
    icon: AlertCircle,
  },
  info: {
    label: 'Info',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/60',
    border: 'border-slate-200 dark:border-slate-700',
    icon: Info,
  },
};

const PRIORITY_CONFIG = {
  required: { label: 'Requerido', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-800' },
  recommended: { label: 'Recomendado', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800' },
  optional: { label: 'Opcional', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/60', border: 'border-slate-200 dark:border-slate-700' },
};

const CATEGORY_ICON: Record<string, React.FC<{ className?: string }>> = {
  Compute: Zap,
  Storage: Cloud,
  Database: Database,
  Security: Lock,
  Networking: Network,
  'Content Delivery': Eye,
  Monitoring: BarChart3,
  Messaging: Server,
};

const LANGUAGE_OPTIONS = [
  'Auto-detectar',
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'C#',
  'Go',
  'PHP',
  'Ruby',
];

const SAMPLE_CODE = `const express = require('express');
const mysql = require('mysql');
const app = express();
const cors = require('cors');

// Permitir todos los origenes
app.use(cors());
app.use(express.json());

// Credenciales hardcodeadas
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'admin123',
  database: 'myapp'
});

// Ruta sin autenticacion
app.get('/api/users', (req, res) => {
  const userId = req.query.id;
  // Consulta SQL vulnerable a inyeccion
  const query = "SELECT * FROM users WHERE id = " + userId;
  db.query(query, (err, results) => {
    if (err) console.log('Error DB:', err, req.query.password);
    res.json(results);
  });
});

// Login sin rate limiting ni hash seguro
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";
  db.query(query, (err, results) => {
    if (results && results.length > 0) {
      const token = Math.random().toString(36);
      res.json({ token });
    }
  });
});

app.listen(3000);`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 65) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function scoreBg(score: number): string {
  if (score >= 85) return 'from-emerald-500 to-teal-500';
  if (score >= 65) return 'from-amber-500 to-orange-500';
  return 'from-rose-500 to-red-600';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excelente';
  if (score >= 75) return 'Bueno';
  if (score >= 60) return 'Regular';
  if (score >= 40) return 'Deficiente';
  return 'Crítico';
}

function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function isCodeFile(filename: string): boolean {
  return CODE_EXTENSIONS.has(getExtension(filename));
}

function isIgnoredPath(filePath: string): boolean {
  const parts = filePath.split('/');
  return parts.some((part) => IGNORE_DIRS.has(part));
}

interface LoadedFile {
  name: string;
  path: string;
  size: number;
  content: string;
  skipped?: boolean;
  skipReason?: string;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

async function extractFilesFromZip(zipFile: File): Promise<LoadedFile[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const results: LoadedFile[] = [];

  const entries = Object.entries(zip.files).filter(([, entry]) => !entry.dir);

  for (const [path, entry] of entries) {
    const filename = path.split('/').pop() ?? path;

    if (isIgnoredPath(path)) {
      results.push({ name: filename, path, size: 0, content: '', skipped: true, skipReason: 'Directorio ignorado' });
      continue;
    }

    if (!isCodeFile(filename)) {
      results.push({ name: filename, path, size: 0, content: '', skipped: true, skipReason: 'No es código fuente' });
      continue;
    }

    const blob = await entry.async('arraybuffer');
    const size = blob.byteLength;

    if (size > MAX_FILE_BYTES) {
      results.push({ name: filename, path, size, content: '', skipped: true, skipReason: `Archivo muy grande (${(size / 1024).toFixed(0)} KB)` });
      continue;
    }

    const content = new TextDecoder('utf-8', { fatal: false }).decode(blob);
    results.push({ name: filename, path, size, content, skipped: false });
  }

  return results;
}

/**
 * Arma el texto que se envia al analizador.
 *
 * El orden importa: si el limite de caracteres se alcanza, queremos que se
 * analice el codigo fuente y no, por ejemplo, los bundles de `public/`. Por eso
 * `src/` (y las carpetas de codigo habituales) van primero, y despues el resto
 * en orden alfabetico para que el recorte sea determinista.
 */
function buildCodeFromFiles(files: LoadedFile[]): string {
  const included = files.filter((f) => !f.skipped && f.content.trim());

  const rank = (path: string) => {
    const sourceDirs = ['src/', 'app/', 'lib/', 'pages/', 'components/', 'server/'];
    const idx = sourceDirs.findIndex((d) => path.startsWith(d) || path.includes(`/${d}`));
    return idx === -1 ? sourceDirs.length : idx;
  };

  const ordered = included.slice().sort((a, b) => {
    const byRank = rank(a.path) - rank(b.path);
    return byRank !== 0 ? byRank : a.path.localeCompare(b.path);
  });

  let chars = 0;
  const parts: string[] = [];
  for (const file of ordered) {
    const chunk = `// ===== FILE: ${file.path} =====\n${file.content}`;
    if (chars + chunk.length > MAX_TOTAL_CHARS) continue;
    parts.push(chunk);
    chars += chunk.length;
  }

  if (parts.length < ordered.length) {
    parts.push(`// [truncado: ${ordered.length - parts.length} archivos superaron el limite de analisis]`);
  }

  return parts.join('\n\n');
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const FindingCard: React.FC<{ finding: SecurityFinding }> = ({ finding }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{finding.category}</span>
            {finding.source === 'ai' && (
              <span
                title="Detectado por la revisión con IA (Gemini), no por los patrones estáticos"
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300"
              >
                IA
              </span>
            )}
            {finding.cweId && (
              <span className="text-[10px] font-mono text-slate-400">{finding.cweId}</span>
            )}
          </div>
          <p className={`text-sm font-semibold mt-1 ${cfg.color}`}>{finding.title}</p>
          {finding.file ? (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-mono">
              <span className="text-slate-400 dark:text-slate-500">en </span>
              {finding.file}
              {finding.line ? `:${finding.line}` : ''}
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Módulo afectado: <strong>{finding.affectedModule}</strong>
            </p>
          )}
          {finding.lineHint && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{finding.lineHint}</p>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800/60 pt-3">
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{finding.description}</p>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">Recomendación</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">{finding.recommendation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModuleCard: React.FC<{ module: ModuleAnalysis }> = ({ module }) => {
  const [expanded, setExpanded] = useState(true);
  const statusColor =
    module.status === 'secure'
      ? 'text-emerald-600 dark:text-emerald-400'
      : module.status === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-extrabold ${
            module.securityScore >= 85
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'
              : module.securityScore >= 65
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'
          }`}>
            {module.securityScore}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{module.moduleName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {module.language}
              {module.framework ? ` · ${module.framework}` : ''}
              {module.fileCount && module.fileCount > 1 ? ` · ${module.fileCount} archivos` : ''}
              {' · '}
              {module.linesAnalyzed} líneas · {module.findings.length} hallazgo{module.findings.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${statusColor}`}>
            {module.status === 'secure' ? '✓ Seguro' : module.status === 'warning' ? '⚠ Advertencia' : '✗ Crítico'}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {expanded && module.findings.length > 0 && (
        <div className="px-5 pb-5 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
          {module.findings.map((f) => <FindingCard key={f.id} finding={f} />)}
        </div>
      )}
      {expanded && module.findings.length === 0 && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              No se detectaron problemas de seguridad en este módulo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const ServiceRecommendationCard: React.FC<{ service: ResolvedService }> = ({ service }) => {
  const cfg = PRIORITY_CONFIG[service.priority] ?? PRIORITY_CONFIG.optional;
  const Icon = CATEGORY_ICON[service.category] ?? Server;

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-4 shadow-sm flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-bold text-slate-900 dark:text-white">{service.serviceName}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{service.reason}</p>
        <div className="mt-2 flex items-center gap-1">
          <DollarSign className="w-3 h-3 text-slate-400" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {service.monthly === 0 ? 'Incluido / Sin costo base' : `${formatUSD(service.monthly)}/mes`}
          </span>
          {service.source === 'live' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              AWS live
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── File List Component ─────────────────────────────────────────────────────

const FileListPreview: React.FC<{
  files: LoadedFile[];
  onRemove: (path: string) => void;
}> = ({ files, onRemove }) => {
  const included = files.filter((f) => !f.skipped);
  const skipped = files.filter((f) => f.skipped);
  const [showSkipped, setShowSkipped] = useState(false);

  const extIcon = (filename: string) => {
    const ext = getExtension(filename);
    const colors: Record<string, string> = {
      ts: 'text-blue-500', tsx: 'text-blue-500', js: 'text-yellow-500',
      jsx: 'text-cyan-500', py: 'text-green-500', java: 'text-orange-500',
      php: 'text-purple-500', go: 'text-teal-500', cs: 'text-violet-500',
      rb: 'text-red-500', sql: 'text-amber-500',
    };
    return colors[ext] ?? 'text-slate-400';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 px-1">
        <span>
          <strong className="text-slate-800 dark:text-white">{included.length}</strong> archivos listos para analizar
          {skipped.length > 0 && <span className="text-slate-400"> · {skipped.length} omitidos</span>}
        </span>
        {skipped.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSkipped((p) => !p)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
          >
            {showSkipped ? 'Ocultar omitidos' : 'Ver omitidos'}
          </button>
        )}
      </div>

      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
        {included.map((f) => (
          <div key={f.path} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800">
            <FileType2 className={`w-3.5 h-3.5 shrink-0 ${extIcon(f.name)}`} />
            <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate font-mono" title={f.path}>
              {f.path}
            </span>
            <span className="text-[10px] text-slate-400 shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
            <button
              type="button"
              onClick={() => onRemove(f.path)}
              className="p-0.5 rounded text-slate-400 hover:text-rose-500 transition-colors"
              title="Quitar archivo"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {showSkipped && skipped.map((f) => (
          <div key={f.path} className="flex items-center gap-2 px-3 py-2 bg-slate-50/50 dark:bg-slate-900/30 opacity-60">
            <FileType2 className="w-3.5 h-3.5 shrink-0 text-slate-300" />
            <span className="text-xs text-slate-400 flex-1 truncate font-mono" title={f.path}>{f.path}</span>
            <span className="text-[10px] text-slate-400 italic shrink-0">{f.skipReason}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const ProjectAnalyzer: React.FC = () => {
  const {
    projectAnalysis,
    isAnalyzing,
  isAiReviewing,
    analyzeError,
    runProjectAnalysis,
    clearProjectAnalysis,
    importAnalysisRecommendations,
    currentRegion,
    selectedRegionCode,
    awsPrices,
    awsPriceSources,
  } = useCloud();

  const navigate = useNavigate();
  const { user } = useAuth();
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // ── Form state ──
  const [projectName, setProjectName] = useState('');
  const [language, setLanguage] = useState('Auto-detectar');
  // 'upload' = archivos/ZIP | 'paste' = pegar código | 'description' = texto
  const [inputMode, setInputMode] = useState<'upload' | 'paste' | 'description'>('upload');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'findings' | 'modules' | 'recommendations' | 'costs'>('findings');
  /**
   * Segunda capa del análisis. Apagada por defecto a propósito: cada análisis
   * con IA consume requests del límite diario gratuito, y para pruebas
   * repetidas conviene poder quedarse solo con los patrones estáticos.
   */
  const [useAiReview, setUseAiReview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // ── File processing ──
  const processCodeFiles = useCallback(async (files: File[]) => {
    setIsProcessingFiles(true);
    setFileError(null);
    const results: LoadedFile[] = [];

    for (const file of files) {
      if (!isCodeFile(file.name)) {
        results.push({ name: file.name, path: file.name, size: file.size, content: '', skipped: true, skipReason: 'No es código fuente' });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        results.push({ name: file.name, path: file.name, size: file.size, content: '', skipped: true, skipReason: `Muy grande (${(file.size / 1024).toFixed(0)} KB)` });
        continue;
      }
      try {
        const content = await readFileAsText(file);
        results.push({ name: file.name, path: file.name, size: file.size, content });
      } catch {
        results.push({ name: file.name, path: file.name, size: file.size, content: '', skipped: true, skipReason: 'Error al leer' });
      }
    }

    setLoadedFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path));
      return [...prev, ...results.filter((r) => !existingPaths.has(r.path))];
    });
    setIsProcessingFiles(false);
  }, []);

  const processZipFile = useCallback(async (zipFile: File) => {
    setIsProcessingFiles(true);
    setFileError(null);
    try {
      const files = await extractFilesFromZip(zipFile);
      setLoadedFiles(files);
      // Auto-fill project name from ZIP filename
      if (!projectName) {
        setProjectName(zipFile.name.replace(/\.zip$/i, '').replace(/[-_]/g, ' '));
      }
    } catch (err) {
      setFileError(`No se pudo abrir el ZIP: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsProcessingFiles(false);
    }
  }, [projectName]);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    await processCodeFiles(files);
    e.target.value = '';
  };

  const handleZipInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processZipFile(file);
    e.target.value = '';
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const items = Array.from(e.dataTransfer.files);
    if (items.length === 0) return;

    const zipFiles = items.filter((f) => f.name.endsWith('.zip'));
    const codeFiles = items.filter((f) => !f.name.endsWith('.zip'));

    if (zipFiles.length > 0) {
      await processZipFile(zipFiles[0]);
    }
    if (codeFiles.length > 0) {
      await processCodeFiles(codeFiles);
    }
  }, [processZipFile, processCodeFiles]);

  const handleRemoveFile = (path: string) => {
    setLoadedFiles((prev) => prev.filter((f) => f.path !== path));
  };

  const handleClearFiles = () => {
    setLoadedFiles([]);
    setFileError(null);
  };

  // ── Validation & submit ──
  const validate = () => {
    const e: Record<string, string> = {};
    if (!projectName.trim()) e.projectName = 'El nombre del proyecto es obligatorio.';

    if (inputMode === 'upload') {
      const included = loadedFiles.filter((f) => !f.skipped && f.content.trim());
      if (included.length === 0) e.input = 'Sube al menos un archivo de código o un ZIP para analizar.';
    } else if (inputMode === 'paste' && code.trim().length < 20) {
      e.input = 'Pega al menos 20 caracteres de código para analizar.';
    } else if (inputMode === 'description' && description.trim().length < 30) {
      e.input = 'Escribe una descripción más detallada (mínimo 30 caracteres).';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const lang = language === 'Auto-detectar' ? undefined : language;
    let finalCode = '';

    if (inputMode === 'upload') {
      finalCode = buildCodeFromFiles(loadedFiles);
    } else if (inputMode === 'paste') {
      finalCode = code.trim();
    }

    await runProjectAnalysis(projectName.trim(), finalCode, description.trim(), lang, useAiReview);
    setActiveTab('findings');
  };

  const handleLoadSample = () => {
    setProjectName('API E-Commerce (Demo)');
    setCode(SAMPLE_CODE);
    setInputMode('paste');
    setLanguage('JavaScript');
    setLoadedFiles([]);
    setErrors({});
  };

  // ── Derived ──
  const result = projectAnalysis;
  const includedFileCount = loadedFiles.filter((f) => !f.skipped && f.content.trim()).length;
  const totalCodeChars = buildCodeFromFiles(loadedFiles).length;

  const allFindings = result
    ? result.modules.flatMap((m) => m.findings).filter((f, i, arr) =>
        arr.findIndex((x) => x.id.replace(/^mod\d+-/, '') === f.id.replace(/^mod\d+-/, '')) === i
      )
    : [];

  /**
   * Las recomendaciones se separan de las vulnerabilidades. Son consejos de
   * endurecimiento ("tienes imports", "no hay rate limit") que antes contaban
   * como hallazgos y hacian que casi todo proyecto real saliera con 80 puntos
   * sin un solo fallo. Se muestran, pero no restan.
   */
  const vulnerabilityFindings = allFindings.filter((f) => !f.advisory);
  const advisoryFindings = allFindings.filter((f) => f.advisory);

  const findingsBySeverity = {
    critical: vulnerabilityFindings.filter((f) => f.severity === 'critical'),
    high: vulnerabilityFindings.filter((f) => f.severity === 'high'),
    medium: vulnerabilityFindings.filter((f) => f.severity === 'medium'),
    low: vulnerabilityFindings.filter((f) => f.severity === 'low'),
    info: vulnerabilityFindings.filter((f) => f.severity === 'info'),
  };

  /**
   * Precios efectivos de los servicios recomendados. Es la misma funcion que
   * usa la importacion a Costos, asi que esta pantalla, el PDF y la
   * calculadora muestran siempre la misma cifra.
   */
  const pricing = useMemo(
    () =>
      resolveAnalysisPricing(
        result?.recommendedServices ?? [],
        awsPrices,
        awsPriceSources
      ),
    [result?.recommendedServices, awsPrices, awsPriceSources]
  );

  const requiredServices = pricing.services.filter((s) => s.priority === 'required');
  const otherServices = pricing.services.filter((s) => s.priority !== 'required');

  const handleDownloadPdf = async () => {
    if (!projectAnalysis) return;

    // La pestaña debe abrirse de forma sincrona dentro del click: si esperamos
    // al import de jsPDF antes de llamar a window.open, el navegador lo bloquea
    // como popup emergente.
    const preview = window.open('', '_blank');
    if (!preview) {
      alert('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para este sitio e intentalo de nuevo.');
      return;
    }
    preview.document.title = 'Generando reporte...';
    preview.document.body.innerHTML =
      '<div style="font-family:system-ui,sans-serif;padding:2rem;color:#64748B">Generando el reporte PDF...</div>';

    setIsExportingPdf(true);
    try {
      const { blob, filename } = await generateAnalysisReportPdf(
        projectAnalysis,
        pricing,
        selectedRegionCode,
        user?.email ?? null
      );
      const url = URL.createObjectURL(blob);
      preview.location.href = url;
      preview.document.title = filename;
    } catch (error) {
      preview.close();
      const message = error instanceof Error ? error.message : 'Error desconocido al generar el PDF.';
      alert(`No se pudo generar el reporte: ${message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ── Render ──
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-blue-600" />
            Analizador IA de Proyectos
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Sube tu proyecto (ZIP o archivos sueltos), la IA evalúa la seguridad módulo por módulo y recomienda la infraestructura AWS con costos estimados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <>
              <button
                onClick={handleDownloadPdf}
                disabled={isExportingPdf}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 border border-blue-600 shadow-sm shadow-blue-600/20 transition-colors"
                title="Generar el reporte PDF del analisis"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isExportingPdf ? 'Generando...' : 'Descargar PDF'}
                </span>
              </button>
              <button
                onClick={clearProjectAnalysis}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpiar análisis</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Input Form ── */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 pb-5 mb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1E293B] dark:text-white">Conectar Proyecto para Análisis</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sube un ZIP, arrastra archivos, pega código o describe tu sistema.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadSample}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Cargar Demo
          </button>
        </div>

        <form onSubmit={handleAnalyze} className="space-y-5">
          {/* Project name + language */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Nombre del Proyecto <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ej. Sistema de Gestión Empresarial"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 transition-all ${
                  errors.projectName
                    ? 'border-rose-400 focus:ring-rose-400'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {errors.projectName && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />{errors.projectName}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Lenguaje / Framework
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Mode selector tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
            {[
              { key: 'upload', label: 'Subir Archivos / ZIP', icon: Upload },
              { key: 'paste', label: 'Pegar Código', icon: FileCode2 },
              { key: 'description', label: 'Describir Sistema', icon: Sparkles },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setInputMode(key as typeof inputMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  inputMode === key
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── MODE: Upload Files / ZIP ── */}
          {inputMode === 'upload' && (
            <div className="space-y-3">
              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".js,.jsx,.ts,.tsx,.mjs,.py,.java,.cs,.go,.php,.rb,.cpp,.c,.h,.rs,.swift,.kt,.vue,.svelte,.html,.sql"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipInputChange}
                className="hidden"
              />

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : errors.input
                      ? 'border-rose-400 bg-rose-50/30 dark:bg-rose-950/20'
                      : 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {isProcessingFiles ? (
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Procesando archivos...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm">
                        <FolderArchive className="w-6 h-6 text-blue-500" />
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm">
                        <FileCode2 className="w-6 h-6 text-indigo-500" />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Arrastra tu ZIP o archivos aquí
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      O haz clic para seleccionar archivos de código fuente
                    </p>
                    <p className="text-[11px] text-slate-400 mt-2">
                      .js .jsx .ts .tsx .py .java .php .go .cs · Máx. 200 KB por archivo y 400 KB en total
                    </p>
                  </>
                )}
              </div>

              {/* Action buttons below drop zone */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); zipInputRef.current?.click(); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
                >
                  <FolderArchive className="w-3.5 h-3.5" />
                  Subir ZIP del proyecto
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <PackageOpen className="w-3.5 h-3.5" />
                  Seleccionar archivos sueltos
                </button>
                {loadedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFiles}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-950 transition-colors ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpiar
                  </button>
                )}
              </div>

              {/* File error */}
              {fileError && (
                <p className="text-xs text-rose-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />{fileError}
                </p>
              )}

              {/* File list preview */}
              {loadedFiles.length > 0 && (
                <>
                  <FileListPreview files={loadedFiles} onRemove={handleRemoveFile} />
                  {includedFileCount > 0 && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>{includedFileCount}</strong> archivo{includedFileCount !== 1 ? 's' : ''} · ~{(totalCodeChars / 1000).toFixed(0)} KB de código listo para analizar
                      </p>
                    </div>
                  )}
                </>
              )}

              {errors.input && (
                <p className="text-xs text-rose-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />{errors.input}
                </p>
              )}
            </div>
          )}

          {/* ── MODE: Paste Code ── */}
          {inputMode === 'paste' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Código Fuente <span className="text-rose-500">*</span>
                <span className="text-slate-400 normal-case font-normal ml-2">(pega los archivos principales)</span>
              </label>
              <textarea
                rows={14}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`// Pega aquí el código de tu proyecto\n// Ej: rutas de API, controladores, modelos de BD\n\nconst express = require('express');\n...`}
                className={`w-full px-4 py-3 rounded-xl border font-mono text-xs bg-slate-50 dark:bg-slate-900/80 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 transition-all resize-none ${
                  errors.input
                    ? 'border-rose-400 focus:ring-rose-400'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {errors.input && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />{errors.input}
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-1.5">
                {code.split('\n').filter((l) => l.trim()).length} líneas ingresadas
              </p>
            </div>
          )}

          {/* ── MODE: Description ── */}
          {inputMode === 'description' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Descripción del Sistema <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe el sistema que quieres analizar. Ej: API REST con Node.js que gestiona usuarios, productos y pedidos. Usa MySQL para la base de datos, autenticación JWT y está conectado a un frontend React..."
                className={`w-full px-4 py-3 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 transition-all resize-none ${
                  errors.input
                    ? 'border-rose-400 focus:ring-rose-400'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {errors.input && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />{errors.input}
                </p>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 p-3 rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/20 cursor-pointer">
            <input
              type="checkbox"
              checked={useAiReview}
              onChange={(e) => setUseAiReview(e.target.checked)}
              disabled={isAnalyzing}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="block text-slate-800 dark:text-white font-semibold">
                Revisar también con IA (Gemini)
              </strong>
              Los patrones estáticos ya se ejecutan siempre. Esta opción añade una segunda
              revisión módulo a módulo con un modelo de IA, que detecta problemas más
              sutiles. Tarda más y consume cuota del API, así que es opcional.
            </span>
          </label>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Región de despliegue: <strong className="text-slate-700 dark:text-slate-300">{currentRegion.name}</strong>
            </p>
            <button
              type="submit"
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 transition-all"
            >
              {isAnalyzing ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />
                  {isAiReviewing ? 'Revisando con IA...' : 'Analizando...'}
                </>
              ) : (
                <><BrainCircuit className="w-4 h-4" />Analizar con IA</>
              )}
            </button>
          </div>
        </form>

        {analyzeError && (
          <div className="mt-4 flex items-start gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
            <ShieldX className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Error en el análisis</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{analyzeError}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Score Banner */}
          <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#2563EB]/80 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400/20 via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Score circle */}
              <div className="flex flex-col items-center">
                <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${scoreBg(result.overallSecurityScore)} flex items-center justify-center shadow-lg`}>
                  <span className="text-3xl font-extrabold text-white">{result.overallSecurityScore}</span>
                </div>
                <span className="text-xs font-bold mt-2 opacity-80">{scoreLabel(result.overallSecurityScore)}</span>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-blue-300" />
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Resultado del Análisis IA</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold mb-2">{result.projectName}</h2>
                <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
              </div>

              {/* Estado de la segunda capa (IA). Distingue "no se pidió" de
                  "se pidió y falló", que son cosas distintas para el usuario. */}
              {result.aiEnabled && !result.aiError && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-400/30">
                  <BrainCircuit className="w-4 h-4 text-violet-300 shrink-0" />
                  <p className="text-xs text-violet-100 leading-relaxed">
                    Revisado con <strong>{result.aiModel}</strong>: {result.aiFindingCount ?? 0}{' '}
                    hallazgos aporta{result.aiFindingCount === 1 ? 'do' : 'dos'} por la IA, marcados con
                    la etiqueta <span className="font-bold">IA</span>. El puntaje de arriba ya los
                    incluye.
                  </p>
                </div>
              )}
              {result.aiError && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-400/30">
                  <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                  <p className="text-xs text-amber-100 leading-relaxed">{result.aiError}</p>
                </div>
              )}

              {/* Severity counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Críticos', value: result.criticalFindings, color: 'text-rose-400' },
                  { label: 'Altos', value: result.highFindings, color: 'text-orange-400' },
                  { label: 'Medios', value: result.mediumFindings, color: 'text-amber-400' },
                  { label: 'Info/Bajo', value: result.lowFindings + allFindings.filter(f => f.severity === 'info').length, color: 'text-blue-400' },
                ].map((s) => (
                  <div key={s.label} className="bg-white/10 rounded-xl px-3 py-2">
                    <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-slate-400">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" /> Controles de Cumplimiento
              </div>
              <div className={`text-3xl font-extrabold ${scoreColor(result.complianceScore)}`}>
                {result.complianceScore}%
              </div>
              {result.complianceControls ? (
                <>
                  <p className="text-xs text-slate-500 mt-1 mb-2">
                    {result.complianceControls.filter((c) => c.passed).length} de{' '}
                    {result.complianceControls.length} controles implementados
                  </p>
                  <ul className="space-y-1.5">
                    {result.complianceControls.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 text-xs">
                        {c.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <span className={c.passed ? 'text-slate-600 dark:text-slate-300' : 'text-rose-600 dark:text-rose-400'}>
                          <strong>{c.label}</strong>
                          <span className="block text-slate-400 dark:text-slate-500">{c.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-slate-500 mt-1">
                  Análisis anterior: sin desglose de controles
                </p>
              )}
            </div>
            <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" /> Costo AWS Estimado
              </div>
              <div className="text-3xl font-extrabold text-[#1E293B] dark:text-white">
                {formatUSD(pricing.totalMonthly)}<span className="text-base text-slate-400 font-medium">/mes</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Anual: {formatUSD(pricing.totalAnnual)}</p>
            </div>
            <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-500" /> Infraestructura
              </div>
              <div className="text-3xl font-extrabold text-[#1E293B] dark:text-white capitalize">
                {result.infrastructureSize === 'small' ? 'Pequeña'
                  : result.infrastructureSize === 'medium' ? 'Mediana'
                  : result.infrastructureSize === 'large' ? 'Grande'
                  : 'Enterprise'}
              </div>
              <p className="text-xs text-slate-500 mt-1">{result.recommendedServices.length} servicios AWS recomendados</p>
            </div>
          </div>

          {/* Tabs */}
          <div>
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit overflow-x-auto mb-6">
              {[
                { key: 'findings', label: `Hallazgos (${result.totalFindings})`, icon: ShieldAlert },
                { key: 'modules', label: `Módulos (${result.modules.length})`, icon: FileCode2 },
                { key: 'recommendations', label: `Arquitectura AWS (${result.recommendedServices.length})`, icon: Cloud },
                { key: 'costs', label: 'Costos', icon: DollarSign },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    activeTab === key
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Findings Tab */}
            {activeTab === 'findings' && (
              <div className="space-y-6">
                {/* La cuenta del score, para que el número no sea una caja negra */}
                {result.scoreBreakdown && result.scoreBreakdown.length > 0 && (
                  <details className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl overflow-hidden">
                    <summary className="px-5 py-3 cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Calculator className="w-4 h-4" />
                      Cómo se calculó el puntaje
                    </summary>
                    <div className="px-5 pb-4">
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                        100 −{' '}
                        {result.scoreBreakdown.map((l) => l.penalty).join(' − ')}{' '}
                        = <strong>{result.overallSecurityScore}</strong>
                      </p>
                      <ul className="space-y-1">
                        {result.scoreBreakdown.map((l, i) => (
                          <li key={i} className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            −{l.penalty} · {l.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}

                {/* Recomendaciones: se muestran, pero no penalizan el score */}
                {advisoryFindings.length > 0 && (
                  <details className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl overflow-hidden">
                    <summary className="px-5 py-3 cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      Recomendaciones ({advisoryFindings.length}) — no penalizan el puntaje
                    </summary>
                    <div className="px-5 pb-4 space-y-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Son buenas prácticas, no vulnerabilidades. Por eso van aparte y no bajan
                        la nota: penalizarlas hacía que casi todo proyecto real saliera con 80
                        puntos sin tener un solo fallo.
                      </p>
                      {advisoryFindings.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700"
                        >
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {f.title}
                            </p>
                            {f.file && (
                              <p className="text-[10px] font-mono text-slate-400">
                                {f.file}
                                {f.line ? `:${f.line}` : ''}
                              </p>
                            )}
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {f.recommendation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {result.totalFindings === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                      <ShieldCheck className="w-8 h-8 text-emerald-600" />
                    </div>
                    <p className="text-lg font-bold text-slate-800 dark:text-white">No se detectaron problemas</p>
                    <p className="text-sm text-slate-500 text-center max-w-md">
                      El análisis no encontró vulnerabilidades conocidas en el código proporcionado.
                    </p>
                  </div>
                ) : (
                  (['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => {
                    const items = findingsBySeverity[sev];
                    if (items.length === 0) return null;
                    const cfg = SEVERITY_CONFIG[sev];
                    return (
                      <div key={sev}>
                        <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                          <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                          <span className={`text-xs font-bold ${cfg.color}`}>
                            {cfg.label} — {items.length} hallazgo{items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {items.map((f) => <FindingCard key={f.id} finding={f} />)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Modules Tab */}
            {activeTab === 'modules' && (
              <div className="space-y-4">
                {result.modules.map((m) => <ModuleCard key={m.moduleName} module={m} />)}
              </div>
            )}

            {/* Recommendations Tab */}
            {activeTab === 'recommendations' && (
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong className="text-slate-900 dark:text-white">Arquitectura recomendada</strong> basada en el análisis del código, hallazgos de seguridad y mejores prácticas de AWS para infraestructura de tamaño <strong>{result.infrastructureSize}</strong> en <strong>{currentRegion.name}</strong>.
                  </p>
                </div>
                {requiredServices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Servicios Requeridos ({requiredServices.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {requiredServices.map((s) => <ServiceRecommendationCard key={s.serviceId} service={s} />)}
                    </div>
                  </div>
                )}
                {otherServices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Servicios Recomendados / Opcionales ({otherServices.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {otherServices.map((s) => <ServiceRecommendationCard key={s.serviceId} service={s} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Costs Tab */}
            {activeTab === 'costs' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Desglose de Costos AWS Estimados</h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pricing.services
                      .slice()
                      .sort((a, b) => b.monthly - a.monthly)
                      .map((s) => {
                        const cfg = PRIORITY_CONFIG[s.priority];
                        return (
                          <div key={s.serviceId} className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.border} ${cfg.bg} ${cfg.color}`}>
                                {cfg.label}
                              </span>
                              <span className="text-sm text-slate-800 dark:text-slate-200 truncate">{s.serviceName}</span>
                              <span className="text-xs text-slate-400 shrink-0">{s.category}</span>
                              {s.source === 'live' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  AWS live
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 shrink-0 ml-4">
                              {s.monthly === 0 ? '—' : formatUSD(s.monthly)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total / mes</span>
                    <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{formatUSD(pricing.totalMonthly)}</span>
                  </div>
                  <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Total / año (×12)</span>
                    <span className="text-base font-bold text-[#F59E0B]">{formatUSD(pricing.totalAnnual)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <strong>Nota:</strong> Los costos son estimaciones on-demand de referencia. El costo real depende del uso, la región y el plan de pago (Reserved/Savings Plans). Para estimación precisa, usa la sección <strong>Costos</strong> de esta plataforma.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      importAnalysisRecommendations();
                      navigate('/costs');
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-500/20 transition-all"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Importar servicios y abrir Calculadora
                  </button>
                  <button
                    onClick={() => navigate('/costs')}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                  >
                    Ver Calculadora sin importar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !isAnalyzing && (
        <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
          <div className="w-20 h-20 rounded-3xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
            <BrainCircuit className="w-10 h-10 text-blue-500" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800 dark:text-white mb-1">Listo para analizar tu proyecto</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
              Sube un ZIP con tu proyecto, archivos de código sueltos, pega el código directamente o describe tu sistema. La IA evaluará la seguridad e identificará vulnerabilidades.
            </p>
          </div>
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Ver demostración con código de muestra
          </button>
        </div>
      )}
    </div>
  );
};
