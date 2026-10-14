import type { RowInput } from 'jspdf-autotable';
import type { AnalysisPricing } from './analysis-pricing';
import type {
  AwsRecommendedService,
  ModuleAnalysis,
  ProjectAnalysisResult,
  SecurityFinding,
  SecurityFindingSeverity,
} from '../types/cloud';

/**
 * Reporte PDF del Analizador de Proyectos.
 *
 * jsPDF y jspdf-autotable se cargan con `import()` dinamico para que salgan en
 * un chunk aparte: importarlos arriba anadiria ~350 kB al bundle inicial por
 * una funcionalidad que el usuario quiza no usa nunca.
 */

const BRAND: [number, number, number] = [37, 99, 235]; // blue-600
const BRAND_DARK: [number, number, number] = [30, 64, 175]; // blue-800
const INK: [number, number, number] = [15, 23, 42]; // slate-900
const BODY: [number, number, number] = [30, 41, 59]; // slate-800
const MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const HAIRLINE: [number, number, number] = [226, 232, 240]; // slate-200
const PANEL: [number, number, number] = [248, 250, 252]; // slate-50

const PAGE = { width: 210, height: 297 };
const MARGIN = 14;
const CONTENT_W = PAGE.width - MARGIN * 2; // 182
const CONTENT_TOP = 20;
const CONTENT_BOTTOM = 278;
const FOOTER_Y = 286;

const SEVERITY: Record<SecurityFindingSeverity, { label: string; rgb: [number, number, number] }> = {
  critical: { label: 'Critico', rgb: [225, 29, 72] },
  high: { label: 'Alto', rgb: [234, 88, 12] },
  medium: { label: 'Medio', rgb: [217, 119, 6] },
  low: { label: 'Bajo', rgb: [37, 99, 235] },
  info: { label: 'Info', rgb: [100, 116, 139] },
};

const INFRA_LABEL: Record<string, string> = {
  small: 'Pequeña',
  medium: 'Mediana',
  large: 'Grande',
  enterprise: 'Enterprise',
};

const PRIORITY_LABEL: Record<AwsRecommendedService['priority'], string> = {
  required: 'Requerido',
  recommended: 'Recomendado',
  optional: 'Opcional',
};

const PRIORITY_RGB: Record<AwsRecommendedService['priority'], [number, number, number]> = {
  required: [225, 29, 72],
  recommended: [217, 119, 6],
  optional: [100, 116, 139],
};

const MODULE_STATUS: Record<ModuleAnalysis['status'], { label: string; rgb: [number, number, number] }> = {
  secure: { label: 'Seguro', rgb: [22, 163, 74] },
  warning: { label: 'Con advertencias', rgb: [217, 119, 6] },
  critical: { label: 'Critico', rgb: [225, 29, 72] },
};

/**
 * El resultado viene de una funcion serverless: si el payload llega incompleto,
 * un `undefined.toLocaleString()` tumbaria todo el reporte. Todos los campos
 * numericos pasan por aqui.
 */
const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
};

const usd = (value: unknown): string =>
  `$${num(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: unknown): string => {
  const date = new Date(typeof value === 'string' || typeof value === 'number' ? value : NaN);
  return Number.isNaN(date.getTime()) ? 'No disponible' : date.toLocaleString('es-ES');
};

const slug = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40) || 'proyecto';

/**
 * `getLastAutoTable` vive en DocHandler, no en la instancia de jsPDF: llamarlo
 * con `?.()` devuelve undefined en silencio y el flujo creia estar avanzando el
 * cursor cuando no lo hacia, dibujando cada seccion encima de la anterior. La
 * via soportada es la propiedad `lastAutoTable`, que autotable deja en el doc.
 */
type DocWithTable = { lastAutoTable?: { finalY?: number } | false };

const tableEndY = (doc: object, fallback: number): number => {
  const last = (doc as DocWithTable).lastAutoTable;
  if (last && typeof last === 'object' && typeof last.finalY === 'number') return last.finalY;
  return fallback;
};

type Doc = {
  getTextDimensions: (text: string | string[]) => { w: number; h: number };
  getStringUnitWidth: (text: string) => number;
  getFontSize: () => number;
  getLineHeightFactor: () => number;
  splitTextToSize: (text: string, width: number) => string[];
  setLineHeightFactor: (factor: number) => void;
  setFont: (name: string, style: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: string }) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, r1: number, r2: number, style?: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  setLineWidth: (w: number) => void;
  addPage: () => unknown;
  setPage: (n: number) => unknown;
  getNumberOfPages: () => number;
  output: (type: 'blob') => Blob;
};

const mm2pt = 25.4 / 72;

/** Alto real de un texto, en las unidades del documento (mm). */
const measure = (doc: Doc, text: string | string[]): number => doc.getTextDimensions(text).h;

/**
 * Escribe un parrafo y devuelve el `y` real justo debajo de el.
 *
 * jsPDF no avanza el cursor: el interlineado lo fija `TL = fontSize * 1.15` y
 * el hay que calcularlo a mano. Medir con getTextDimensions evita adivinar y
 * que dos bloques se pisen. Si no cabe en la pagina actual, salta antes de
 * escribir para partirlo entre paginas.
 */
const paragraph = (
  doc: Doc,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { gap?: number; topMargin?: number } = {}
): number => {
  const gap = options.gap ?? 0;
  const lines = doc.splitTextToSize(text, maxWidth);
  const height = measure(doc, lines);

  let cursor = y;
  if (cursor + height > CONTENT_BOTTOM) {
    doc.addPage();
    cursor = CONTENT_TOP;
  }

  doc.text(lines, x, cursor);
  return cursor + height + gap;
};

/** Recorta con puntos suspensivos para no rebasar `maxWidth`. */
const ellipsize = (doc: Doc, text: string, maxWidth: number): string => {
  const fontSize = doc.getFontSize();
  if (doc.getStringUnitWidth(text) * fontSize * mm2pt <= maxWidth) return text;
  let candidate = text;
  while (candidate.length > 1) {
    candidate = candidate.slice(0, -1);
    const withDots = `${candidate.trimEnd()}...`;
    if (doc.getStringUnitWidth(withDots) * fontSize * mm2pt <= maxWidth) return withDots;
  }
  return '...';
};

function scoreColor(score: number): [number, number, number] {
  if (score >= 85) return [22, 163, 74];
  if (score >= 60) return [217, 119, 6];
  return [225, 29, 72];
}

export async function generateAnalysisReportPdf(
  result: ProjectAnalysisResult,
  pricing: AnalysisPricing,
  regionCode: string,
  authorEmail: string | null
): Promise<{ blob: Blob; filename: string }> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const autoTable = autoTableModule.default;
  const { applyPlugin } = autoTableModule;
  applyPlugin(jsPDF);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdf = doc as unknown as Doc;
  pdf.setLineHeightFactor(1.25);

  const modules = result.modules ?? [];
  const services = pricing.services ?? [];
  const totalRecommended = services.length;
  const allFindings = modules.flatMap((m) => m.findings ?? []);
  const infoCount = allFindings.filter((f) => f.severity === 'info').length;

  // Los arrays del resultado son opcionales: si el analisis es anterior al
  // cambio, los derivamos de los modulos.
  const languages = result.languages?.length
    ? result.languages
    : Array.from(new Set(modules.map((m) => m.language).filter(Boolean)));
  const frameworks = result.frameworks?.length
    ? result.frameworks
    : Array.from(new Set(modules.map((m) => m.framework).filter((f): f is string => Boolean(f))));

  const totalLines = modules.reduce((acc, m) => acc + num(m.linesAnalyzed), 0);

  const buckets: { severity: SecurityFindingSeverity; count: number }[] = [
    { severity: 'critical', count: result.criticalFindings },
    { severity: 'high', count: result.highFindings },
    { severity: 'medium', count: result.mediumFindings },
    { severity: 'low', count: result.lowFindings + infoCount },
  ];

  // ── 1. Portada ────────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE.width, 38, 'F');

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, 8, 18, 18, 4, 4, 'F');
  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CO', MARGIN + 9, 20, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text('CLOUDOPS DASHBOARD', MARGIN + 24, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(219, 234, 254);
  doc.text('Reporte de Analisis de Seguridad de Aplicaciones', MARGIN + 24, 23);

  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `Emitido: ${new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}`,
    PAGE.width - MARGIN,
    23,
    { align: 'right' }
  );

  const metaRows = [
    ['Proyecto', result.projectName || 'Proyecto sin nombre'],
    ['Fecha de analisis', formatDate(result.analyzedAt)],
    ['Tipo de analisis', result.inputType === 'code' ? 'Codigo fuente' : 'Descripcion funcional'],
    ['Lenguajes detectados', languages.length > 0 ? languages.join(', ') : 'No aplica'],
    ['Frameworks detectados', frameworks.length > 0 ? frameworks.join(', ') : 'No aplica'],
    ['Modulos analizados', `${modules.length}`],
    ['Lineas revisadas', `${totalLines}`],
    ['Region de precios', regionCode || 'No aplica'],
    ['Precios aplicados', `${pricing.liveCount} en vivo de AWS · ${pricing.estimateCount} estimados`],
    ['Generado por', authorEmail ?? 'Sesion local'],
  ];

  const metaBody: RowInput[] = metaRows.map(([key, value]) => [
    { content: key, styles: { textColor: MUTED, fontStyle: 'bold' } },
    { content: value, styles: { textColor: BODY } },
  ]);

  let y = 46;
  autoTable(doc, {
    startY: y,
    body: metaBody,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 },
      lineColor: HAIRLINE,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 46, fillColor: PANEL },
      1: {},
    },
    margin: { left: MARGIN, right: MARGIN },
    alternateRowStyles: { fillColor: [255, 255, 255] },
  });
  y = tableEndY(doc, y) + 10;

  // ── 2. Resumen ejecutivo ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text('1. RESUMEN EJECUTIVO', MARGIN, y);
  y += 7;

  const cards = [
    { label: 'Puntaje de seguridad', value: `${num(result.overallSecurityScore)}/100`, rgb: scoreColor(num(result.overallSecurityScore)) },
    { label: 'Cumplimiento estimado', value: `${num(result.complianceScore)}%`, rgb: scoreColor(num(result.complianceScore)) },
    { label: 'Hallazgos totales', value: `${num(result.totalFindings)}`, rgb: BODY as [number, number, number] },
  ];

  const cardW = (CONTENT_W - 8) / 3;
  cards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 4);
    doc.setFillColor(...PANEL);
    doc.setDrawColor(...HAIRLINE);
    doc.roundedRect(cx, y, cardW, 24, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...card.rgb);
    doc.text(card.value, cx + cardW / 2, y + 12, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(card.label, cx + cardW / 2, y + 19, { align: 'center' });
  });
  y += 30;

  // Fila de infraestructura y costos como tabla: con x fijos el texto del
  // costo mensual se pisaba con el anual.
  autoTable(doc, {
    startY: y,
    body: [[
      { content: 'Infraestructura recomendada', styles: { fontStyle: 'bold' } },
      { content: 'Costo mensual', styles: { fontStyle: 'bold' } },
      { content: 'Costo anual', styles: { fontStyle: 'bold' } },
    ], [
      {
        content: INFRA_LABEL[result.infrastructureSize] ?? String(result.infrastructureSize ?? 'n/d'),
        styles: { fillColor: [255, 255, 255] },
      },
      { content: usd(pricing.totalMonthly), styles: { fillColor: [255, 255, 255] } },
      { content: usd(pricing.totalAnnual), styles: { fillColor: [255, 255, 255] } },
    ]],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.4, bottom: 2.4, left: 4, right: 4 },
      textColor: BODY,
      lineColor: HAIRLINE,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 80, fillColor: PANEL, textColor: MUTED, fontSize: 8.5 },
      1: { cellWidth: 52 },
      2: { cellWidth: 50 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = tableEndY(doc, y) + 10;

  if (result.summary) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BODY);
    y = paragraph(pdf, result.summary, MARGIN, y, CONTENT_W, { gap: 4, topMargin: 2 });
  }

  // ── 3. Distribucion por severidad ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text('2. DISTRIBUCION DE HALLAZGOS POR SEVERIDAD', MARGIN, y);
  y += 7;

  const total = result.totalFindings || 1;
  autoTable(doc, {
    startY: y,
    head: [['Severidad', 'Cantidad', '% del total']],
    body: buckets.map<RowInput>((b) => {
      const pct = ((b.count / total) * 100).toFixed(1);
      return [
        { content: SEVERITY[b.severity].label, styles: { textColor: SEVERITY[b.severity].rgb, fontStyle: 'bold' } },
        String(b.count),
        `${pct}%`,
      ];
    }),
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 9, cellPadding: 2.2, textColor: BODY, halign: 'center' },
    columnStyles: { 0: { halign: 'left', cellWidth: 50 } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = tableEndY(doc, y) + 10;

  // ── 4. Tabla de hallazgos ─────────────────────────────────────────────────
  if (y > CONTENT_BOTTOM - 40) {
    doc.addPage();
    y = CONTENT_TOP;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text('3. INVENTARIO DE HALLAZGOS', MARGIN, y);
  y += 7;

  const findingsBody: RowInput[] = allFindings
    .slice()
    .sort((a, b) => {
      const order: SecurityFindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    })
    .map((f) => {
      const tint = SEVERITY[f.severity].rgb;
      return [
        { content: SEVERITY[f.severity].label, styles: { textColor: tint, fontStyle: 'bold' } },
        f.category,
        f.title,
        f.affectedModule,
        f.lineHint ?? '-',
        f.cweId ?? '-',
      ];
    });

  if (findingsBody.length === 0) {
    autoTable(doc, {
      startY: y,
      body: [['No se detectaron hallazgos en el material analizado.']],
      theme: 'plain',
      styles: { fontSize: 9, textColor: MUTED, fontStyle: 'italic' },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = tableEndY(doc, y) + 10;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Severidad', 'Categoria', 'Hallazgo', 'Modulo', 'Linea', 'CWE']],
      body: findingsBody,
      theme: 'grid',
      headStyles: { fillColor: BRAND_DARK, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7.6, cellPadding: 1.8, textColor: BODY, lineColor: HAIRLINE, overflow: 'ellipsize' },
      columnStyles: {
        0: { cellWidth: 20, halign: 'left' },
        1: { cellWidth: 24 },
        2: { cellWidth: 66 },
        3: { cellWidth: 34 },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 22, halign: 'center' },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = tableEndY(doc, y) + 10;
  }

  // ── 5. Detalle por modulo ─────────────────────────────────────────────────
  doc.addPage();
  y = CONTENT_TOP;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text('4. DETALLE POR MODULO Y REMEDIACION', MARGIN, y);
  y += 7;

  const FINDING_INDENT = MARGIN + 5;
  const FINDING_W = CONTENT_W - 12;

  const drawFinding = (f: SecurityFinding, top: number): number => {
    const severity = SEVERITY[f.severity];
    const meta = [f.affectedModule, f.lineHint ? `linea ${f.lineHint}` : null, f.cweId]
      .filter(Boolean)
      .join('  ·  ');

    // Medimos todo el bloque antes de escribirlo: si no cabe entero, pasa a la
    // pagina siguiente en vez de partirlo a la mitad.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    const titleLines = doc.splitTextToSize(f.title, FINDING_W);
    const titleH = measure(pdf, titleLines);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    const metaH = measure(pdf, meta);

    doc.setFontSize(8.4);
    const descLines = doc.splitTextToSize(f.description, FINDING_W);
    const descH = measure(pdf, descLines);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    const labelH = measure(pdf, 'Recomendacion:');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    const recLines = doc.splitTextToSize(f.recommendation, FINDING_W);
    const recH = measure(pdf, recLines);

    const gap = 1.6;
    const total =
      titleH + gap + metaH + gap + descH + gap * 1.5 + labelH + gap + recH + 5;

    let cursor = top;
    if (cursor + total > CONTENT_BOTTOM) {
      doc.addPage();
      cursor = CONTENT_TOP;
    }

    doc.setFillColor(...severity.rgb);
    doc.rect(MARGIN, cursor - titleH + 0.8, 2, titleH - 0.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...INK);
    doc.text(titleLines, FINDING_INDENT, cursor);
    cursor += titleH + gap;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...MUTED);
    doc.text(ellipsize(pdf, `${severity.label}  ·  ${f.category}  ·  ${meta}`, FINDING_W), FINDING_INDENT, cursor);
    cursor += metaH + gap;

    doc.setFontSize(8.4);
    doc.setTextColor(...BODY);
    doc.text(descLines, FINDING_INDENT, cursor);
    cursor += descH + gap * 1.5;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_DARK);
    doc.text('Recomendacion:', FINDING_INDENT, cursor);
    cursor += labelH + gap;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BODY);
    doc.text(recLines, FINDING_INDENT, cursor);
    return cursor + recH + 5;
  };

  for (const module of modules) {
    const findings = module.findings ?? [];
    const status = MODULE_STATUS[module.status] ?? MODULE_STATUS.warning;
    const headerH = 14;
    if (y + headerH > CONTENT_BOTTOM) {
      doc.addPage();
      y = CONTENT_TOP;
    }

    doc.setFillColor(...PANEL);
    doc.setDrawColor(...HAIRLINE);
    doc.roundedRect(MARGIN, y, CONTENT_W, headerH, 3, 3, 'FD');
    doc.setFillColor(...status.rgb);
    doc.rect(MARGIN, y, 1.8, headerH, 'F');

    // El estado se dibuja pegado a la derecha: reservamos su ancho para que un
    // nombre de modulo largo no termine encima.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const statusText = `${status.label}  ${num(module.securityScore)}/100`;
    const statusW = pdf.getStringUnitWidth(statusText) * 8 * mm2pt;

    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(ellipsize(pdf, module.moduleName, CONTENT_W - statusW - 14), MARGIN + 5, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...MUTED);
    const moduleMeta = [
      module.language,
      module.framework ?? null,
      module.fileCount && module.fileCount > 1 ? `${module.fileCount} archivos` : null,
      `${num(module.linesAnalyzed)} lineas`,
      `${findings.length} hallazgos`,
    ]
      .filter(Boolean)
      .join('  ·  ');
    doc.text(ellipsize(pdf, moduleMeta, CONTENT_W - statusW - 14), MARGIN + 5, y + 10.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...status.rgb);
    doc.text(statusText, MARGIN + CONTENT_W - 4, y + 8, { align: 'right' });

    y += headerH + 5;

    if (findings.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.4);
      doc.setTextColor(...MUTED);
      doc.text('Sin hallazgos de seguridad en este modulo.', MARGIN + 5, y);
      y += 8;
    } else {
      for (const finding of findings) {
        y = drawFinding(finding, y);
      }
    }
  }

  // ── 6. Servicios AWS recomendados ─────────────────────────────────────────
  if (y > CONTENT_BOTTOM - 60) {
    doc.addPage();
    y = CONTENT_TOP;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text('5. INFRAESTRUCTURA AWS RECOMENDADA', MARGIN, y);
  y += 7;

  const servicesBody: RowInput[] = services.map((s) => [
    { content: s.serviceName, styles: { fontStyle: 'bold' } },
    s.awsService,
    { content: PRIORITY_LABEL[s.priority] ?? s.priority, styles: { textColor: PRIORITY_RGB[s.priority] ?? MUTED, fontStyle: 'bold' } },
    {
      content: s.source === 'live' ? 'AWS live' : 'Estimado',
      styles: { textColor: s.source === 'live' ? [22, 163, 74] : MUTED, fontSize: 7 },
    },
    { content: usd(s.monthly), halign: 'right' },
    s.reason,
  ]);

  const servicesFoot: RowInput[] = [
    [
      { content: 'TOTAL', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: usd(pricing.totalMonthly), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: `${usd(pricing.totalAnnual)} / ano`, styles: { fontSize: 7.4, textColor: MUTED } },
    ],
  ];

  if (totalRecommended === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('No se recomendaron servicios AWS para este analisis.', MARGIN, y);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Servicio', 'AWS', 'Prioridad', 'Origen', 'Costo mensual', 'Motivo']],
      body: servicesBody,
      foot: servicesFoot,
      theme: 'striped',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: [226, 232, 240], fontSize: 8.5 },
      styles: { fontSize: 7.8, cellPadding: 2, textColor: BODY, overflow: 'ellipsize' },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 26 },
        2: { cellWidth: 23, halign: 'left' },
        3: { cellWidth: 19, halign: 'left' },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 56 },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = tableEndY(doc, y) + 6;
  }

  // Nota de procedencia: deja claro que el PDF y Costos usan la misma cifra.
  if (y + 8 < CONTENT_BOTTOM) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.4);
    doc.setTextColor(...MUTED);
    doc.text(
      `Los mismos importes se aplican en la calculadora de Costos al importar este analisis (region ${regionCode}).`,
      MARGIN,
      y
    );
  }

  // ── 7. Footer ─────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, FOOTER_Y, PAGE.width - MARGIN, FOOTER_Y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      'CloudOps Dashboard · Analisis estatico por patrones y CWE. No es un modelo de lenguaje.',
      MARGIN,
      FOOTER_Y + 5
    );
    doc.text(`Pagina ${page} de ${pageCount}`, PAGE.width - MARGIN, FOOTER_Y + 5, { align: 'right' });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `analisis_seguridad_${slug(result.projectName || '')}_${dateStamp}.pdf`;

  return { blob: doc.output('blob'), filename };
}
