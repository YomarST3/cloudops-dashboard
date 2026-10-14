import React, { useState } from 'react';
import {
  FileSpreadsheet,
  CheckCircle,
  PlusCircle,
  Trash2,
  AlertCircle,
  Clock,
  Compass
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import type { AvailabilityLevel } from '../types/cloud';
import { StatusBadge } from '../components/StatusBadge';

const APP_TYPES = [
  'Aplicación web',
  'Sistema empresarial',
  'API',
  'E-commerce',
  'Aplicación móvil',
  'Sistema de gestión'
];

const AVAILABLE_SERVICES = [
  { id: 'EC2', name: 'EC2 (Cómputo Elástico)' },
  { id: 'S3', name: 'S3 (Almacenamiento de Objetos)' },
  { id: 'RDS', name: 'RDS (Bases de Datos Relacionales)' },
  { id: 'IAM', name: 'IAM (Gestión de Identidades)' },
  { id: 'VPC', name: 'VPC (Red Privada Aislada)' },
  { id: 'Route 53', name: 'Route 53 (DNS y Enrutamiento)' },
  { id: 'CloudFront', name: 'CloudFront (CDN Perimetral)' }
];

const SERVICE_AVAILABILITY_TERMS: Record<string, string> = {
  EC2: 'Amazon Elastic Compute Cloud',
  S3: 'Amazon Simple Storage Service',
  RDS: 'Amazon Relational Database Service',
  IAM: 'AWS Identity and Access Management',
  VPC: 'Amazon Virtual Private Cloud',
  'Route 53': 'Amazon Route 53',
  CloudFront: 'Amazon CloudFront'
};

const SERVICE_PRICING_KEY: Record<string, string> = {
  EC2: 'ec2',
  S3: 's3',
  RDS: 'rds',
  'Route 53': 'route53',
  CloudFront: 'cloudfront'
};

export const Planning: React.FC = () => {
  const {
    proposals,
    addProposal,
    deleteProposal,
    regions,
    defaultUnitCost,
    serviceAvailableInRegion,
    isPricingLoading,
    selectedRegionCode,
    setSelectedRegionCode,
    currentRegion
  } = useCloud();

  // Form State
  const [solutionName, setSolutionName] = useState('');
  const [appType, setAppType] = useState('Aplicación web');
  const [description, setDescription] = useState('');
  const [estimatedUsers, setEstimatedUsers] = useState<number>(50000);
  const [availability, setAvailability] = useState<AvailabilityLevel>('Alta');
  const [selectedServices, setSelectedServices] = useState<string[]>([
    'EC2',
    'S3',
    'RDS',
    'IAM',
    'VPC'
  ]);
  const [migrationGoal, setMigrationGoal] = useState('');

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleService = (srvId: string) => {
    setSelectedServices((prev) =>
      prev.includes(srvId) ? prev.filter((s) => s !== srvId) : [...prev, srvId]
    );
  };

  const handleSelectAllServices = () => {
    if (selectedServices.length === AVAILABLE_SERVICES.length) {
      setSelectedServices([]);
    } else {
      setSelectedServices(AVAILABLE_SERVICES.map((s) => s.id));
    }
  };

  const estimateProposalCost = (services: string[]) =>
    services.reduce((acc, id) => {
      const key = SERVICE_PRICING_KEY[id];
      const unit = key ? defaultUnitCost(key) : undefined;
      return acc + (typeof unit === 'number' ? unit : 0);
    }, 0);

  const isServiceAvailable = (id: string) => {
    const term = SERVICE_AVAILABILITY_TERMS[id];
    return term ? serviceAvailableInRegion(term) : undefined;
  };

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!solutionName.trim()) {
      errs.solutionName = 'El nombre de la solución es obligatorio.';
    } else if (solutionName.trim().length < 4) {
      errs.solutionName = 'El nombre debe tener al menos 4 caracteres.';
    }

    if (!description.trim()) {
      errs.description = 'La descripción de la solución es obligatoria.';
    } else if (description.trim().length < 15) {
      errs.description = 'Proporciona una descripción más detallada (mínimo 15 caracteres).';
    }

    if (!migrationGoal.trim()) {
      errs.migrationGoal = 'El objetivo de migración es obligatorio.';
    }

    if (estimatedUsers <= 0 || isNaN(estimatedUsers)) {
      errs.estimatedUsers = 'Ingresa un número estimado de usuarios válido.';
    }

    if (selectedServices.length === 0) {
      errs.selectedServices = 'Selecciona al menos un servicio de AWS para la arquitectura.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    setTimeout(() => {
      addProposal({
        solutionName: solutionName.trim(),
        appType,
        description: description.trim(),
        selectedRegion: selectedRegionCode,
        estimatedUsers: Number(estimatedUsers),
        availability,
        selectedServices,
        migrationGoal: migrationGoal.trim()
      });

      // Reset form
      setSolutionName('');
      setDescription('');
      setMigrationGoal('');
      setEstimatedUsers(50000);
      setSelectedServices(['EC2', 'S3', 'RDS', 'IAM', 'VPC']);
      setErrors({});
      setIsSubmitting(false);
    }, 300);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
            Planificación Cloud
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">
            Diseña, estructura y registra propuestas de soluciones en la nube basadas en las mejores prácticas de AWS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-semibold">
            {proposals.length} Propuestas Registradas
          </span>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 pb-5 mb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1E293B] dark:text-white">
              Formulario de Propuesta de Arquitectura Cloud
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Completa los requerimientos técnicos y de negocio para registrar una nueva solución.
            </p>
          </div>

          <span className="ml-auto px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isPricingLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
            {isPricingLoading ? 'Consultando tarifas AWS...' : 'Tarifas AWS reales activadas'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Row 1: Nombre de la solución & Tipo de aplicación */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Nombre de la Solución <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ej. Plataforma E-Commerce B2B Global"
                value={solutionName}
                onChange={(e) => setSolutionName(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 transition-all ${
                  errors.solutionName
                    ? 'border-rose-400 focus:ring-rose-400'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
              {errors.solutionName && (
                <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.solutionName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Tipo de Aplicación <span className="text-rose-500">*</span>
              </label>
              <select
                value={appType}
                onChange={(e) => setAppType(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                {APP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Descripción */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Descripción de la Solución <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Describe el alcance de la aplicación, el propósito general y el flujo funcional esperado..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 transition-all ${
                errors.description
                  ? 'border-rose-400 focus:ring-rose-400'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
            {errors.description && (
              <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.description}
              </p>
            )}
          </div>

          {/* Row 3: Región seleccionada, Usuarios estimados, Disponibilidad */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Región de la Propuesta
              </label>
              <select
                value={selectedRegionCode}
                onChange={(e) => setSelectedRegionCode(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {regions.map((reg) => (
                  <option key={reg.code} value={reg.code}>
                    {reg.name} ({reg.code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Es la región activa del dashboard ({currentRegion.flagEmoji} {selectedRegionCode}); las tarifas y la disponibilidad se consultan para ella en tiempo real.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Número Estimado de Usuarios
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={100}
                  step={1000}
                  value={estimatedUsers}
                  onChange={(e) => setEstimatedUsers(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                  usuarios
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Nivel de Disponibilidad
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Básica', 'Media', 'Alta'] as AvailabilityLevel[]).map((level) => {
                  const isSelected = availability === level;
                  return (
                    <button
                      type="button"
                      key={level}
                      onClick={() => setAvailability(level)}
                      className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 4: Servicios Cloud Seleccionables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Servicios Cloud Seleccionados <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAllServices}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                {selectedServices.length === AVAILABLE_SERVICES.length
                  ? 'Deseleccionar todos'
                  : 'Seleccionar todos'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {AVAILABLE_SERVICES.map((srv) => {
                const isChecked = selectedServices.includes(srv.id);
                return (
                  <button
                    type="button"
                    key={srv.id}
                    onClick={() => toggleService(srv.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs transition-all ${
                      isChecked
                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-200 font-semibold shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                        isChecked
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                      }`}
                    >
                      {isChecked && <CheckCircle className="w-3.5 h-3.5" />}
                    </div>
                    <span>{srv.name}</span>
                  </button>
                );
              })}
            </div>
            {errors.selectedServices && (
              <p className="text-xs text-rose-500 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.selectedServices}
              </p>
            )}
          </div>

          {/* Row 5: Objetivo de Migración */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Objetivo de Migración y Adopción Cloud <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej. Reducir costos operativos on-premise un 30% y lograr alta disponibilidad Multi-AZ con recuperación de desastres (DR)."
              value={migrationGoal}
              onChange={(e) => setMigrationGoal(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-white focus:outline-none focus:ring-2 transition-all ${
                errors.migrationGoal
                  ? 'border-rose-400 focus:ring-rose-400'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
            {errors.migrationGoal && (
              <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.migrationGoal}
              </p>
            )}
          </div>

          {/* Submit button */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-600/30 hover:shadow-lg transition-all flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : 'Guardar propuesta'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Propuestas Registradas Section (Cards / Tabla profesional) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1E293B] dark:text-white">
              Propuestas de Solución Registradas
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Historial de arquitecturas planificadas y almacenadas en el sistema
            </p>
          </div>
          <span className="text-xs text-slate-400">
            Persistencia activa (Supabase)
          </span>
        </div>

        {proposals.length === 0 ? (
          <div className="bg-white dark:bg-[#1E293B] border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-12 text-center">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300 text-base">
              No hay propuestas registradas aún
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Utiliza el formulario superior para crear y registrar tu primera solución de arquitectura en la nube.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {proposals.map((prop) => (
              <div
                key={prop.id}
                className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {prop.appType}
                        </span>
                        <StatusBadge status={prop.status} size="sm" />
                      </div>
                      <h3 className="font-bold text-lg text-[#1E293B] dark:text-white leading-tight">
                        {prop.solutionName}
                      </h3>
                    </div>

                    <button
                      onClick={() => deleteProposal(prop.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                      title="Eliminar propuesta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[#64748B] dark:text-slate-300 leading-relaxed mb-4">
                    {prop.description}
                  </p>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-700/60 text-xs mb-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">
                        Región
                      </span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        {prop.selectedRegion}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">
                        Usuarios
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {prop.estimatedUsers.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">
                        Disponibilidad
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {prop.availability}
                      </span>
                    </div>
                  </div>

                  {/* Live cost estimate */}
                  <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/60 text-xs flex items-center justify-between mb-4">
                    <div>
                      <span className="text-emerald-800 dark:text-emerald-300 font-semibold block">
                        Coste mensual estimado
                      </span>
                      <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                        Tarifas AWS · región activa ({currentRegion.code})
                        {prop.selectedRegion !== currentRegion.code && ` · creada para ${prop.selectedRegion}`}
                      </span>
                    </div>
                    <span className="text-emerald-800 dark:text-emerald-300 font-extrabold text-sm shrink-0">
                      ${estimateProposalCost(prop.selectedServices).toFixed(2)}/mes
                    </span>
                  </div>

                  {/* Selected services list */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Servicios AWS Seleccionados ({prop.selectedServices.length})
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          prop.selectedServices.every((id) => isServiceAvailable(id) !== false)
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                        }`}
                        title={`Disponibilidad consultada en la tabla regional de AWS para ${currentRegion.code}`}
                      >
                        {prop.selectedServices.filter((id) => isServiceAvailable(id) !== false).length}/
                        {prop.selectedServices.length} en {currentRegion.code}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {prop.selectedServices.map((srv) => {
                        const available = isServiceAvailable(srv);
                        const isUnknown = available === undefined;
                        return (
                          <span
                            key={srv}
                            title={
                              isUnknown
                                ? 'Verificando disponibilidad en AWS...'
                                : available
                                  ? `${srv} disponible en ${currentRegion.code}`
                                  : `${srv} sin presencia publicada en ${currentRegion.code}`
                            }
                            className={`px-2.5 py-0.5 text-xs font-semibold rounded-lg border ${
                              isUnknown
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/80'
                                : available
                                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/80'
                                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/80'
                            }`}
                          >
                            {srv}
                            {!isUnknown && (available ? ' ✓' : ' · no presente')}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Migration Goal */}
                  <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/80 rounded-xl text-xs">
                    <span className="font-bold text-amber-900 dark:text-amber-300 block mb-0.5">
                      Objetivo de Migración:
                    </span>
                    <p className="text-amber-950 dark:text-amber-200">
                      {prop.migrationGoal}
                    </p>
                  </div>
                </div>

                {/* Footer date */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Registrado el {prop.createdAt}
                  </span>
                  <span className="font-mono text-slate-500">ID: {prop.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
