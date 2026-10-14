import React from 'react';
import { X, CheckCircle, DollarSign, Layers, ShieldCheck } from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { StatusBadge } from './StatusBadge';

export const ServiceDetailModal: React.FC = () => {
  const { serviceDetailModal, setServiceDetailModal } = useCloud();

  if (!serviceDetailModal) return null;

  const service = serviceDetailModal;

  const usageStatusLabel = {
    'in-use': 'En uso',
    available: 'Disponible',
    unused: 'No utilizado'
  }[service.usageStatus];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                {service.category}
              </span>
              <StatusBadge status={usageStatusLabel} />
            </div>
            <h2 className="text-2xl font-bold text-[#1E293B] dark:text-white">
              {service.name}
            </h2>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Identificador: aws.{service.id}.service
            </p>
          </div>

          <button
            onClick={() => setServiceDetailModal(null)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Overview */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Descripción General
            </h4>
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
              {service.description}
            </p>
          </div>

          {/* Main Function */}
          <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl">
            <h4 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Función Principal en la Solución
            </h4>
            <p className="text-xs text-blue-950 dark:text-blue-200 leading-relaxed">
              {service.mainFunction}
            </p>
          </div>

          {/* Architecture Role */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Rol en la Arquitectura Cloud
            </h4>
            <p className="text-xs bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300">
              {service.architectureRole}
            </p>
          </div>

          {/* Key Features */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
              Capacidades y Características Clave
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {service.keyFeatures.map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 text-xs text-slate-700 dark:text-slate-300"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cost Model */}
          <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 flex items-start gap-3">
            <DollarSign className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 mb-0.5">
                Modelo de Costos y Facturación
              </h4>
              <p className="text-xs text-amber-950 dark:text-amber-200">
                {service.pricingDetails}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            Práctica académica AWS Well-Architected
          </span>
          <button
            onClick={() => setServiceDetailModal(null)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Cerrar Ficha Técnica
          </button>
        </div>
      </div>
    </div>
  );
};
