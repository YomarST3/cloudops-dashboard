import React from 'react';
import { X, Network, Shield } from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { StatusBadge } from './StatusBadge';

export const NetworkNodeModal: React.FC = () => {
  const { networkNodeModal, setNetworkNodeModal } = useCloud();

  if (!networkNodeModal) return null;

  const node = networkNodeModal;

  const statusLabel = {
    online: 'Online',
    warning: 'Warning',
    offline: 'Offline'
  }[node.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/60 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                  {node.code}
                </span>
                <StatusBadge status={statusLabel} size="sm" />
              </div>
              <h3 className="text-lg font-bold text-[#1E293B] dark:text-white">
                {node.name}
              </h3>
            </div>
          </div>

          <button
            onClick={() => setNetworkNodeModal(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Descripción y Función de Red
            </h4>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {node.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">
                Dirección / Rango CIDR
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {node.cidrOrIp || 'N/A'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">
                Puertos y Protocolo
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {node.ports || 'Enrutamiento L3/L4'}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1 mb-1">
              <Shield className="w-3.5 h-3.5" />
              Regla de Seguridad / Tráfico Permitido
            </span>
            <p className="text-blue-950 dark:text-blue-200">
              {node.role}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 flex justify-end">
          <button
            onClick={() => setNetworkNodeModal(null)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
