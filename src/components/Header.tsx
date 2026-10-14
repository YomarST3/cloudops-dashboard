import React, { useState } from 'react';
import {
  Menu,
  Moon,
  Sun,
  Bell,
  Check,
  ChevronDown
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { estimateLatencyMs } from '../lib/geo';
import { RegionFlag } from './RegionFlag';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  onOpenSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar }) => {
  const {
    selectedRegionCode,
    setSelectedRegionCode,
    regions,
    currentRegion,
    isDarkMode,
    toggleDarkMode,
    userOrigin
  } = useCloud();

  const latencyOf = (region: typeof currentRegion) => estimateLatencyMs(userOrigin, region);

  const [isRegionMenuOpen, setIsRegionMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const mockNotifications = [
    {
      id: 1,
      title: 'Auditoría IAM completada',
      desc: '100% de los usuarios cumplen con MFA obligatorio.',
      time: 'Hace 10 min'
    },
    {
      id: 2,
      title: 'Actualización de Presupuesto',
      desc: 'Costo proyectado se mantiene dentro del umbral mensual.',
      time: 'Hace 1 hora'
    },
    {
      id: 3,
      title: 'Verificación de Región',
      desc: 'Todas las zonas de us-east-1 operando con latencia óptima.',
      time: 'Hace 3 horas'
    }
  ];

  return (
    <header className="sticky top-0 z-30 h-16 bg-white dark:bg-[#1E293B] border-b border-[#E2E8F0] dark:border-[#334155] px-4 sm:px-6 flex items-center justify-between transition-colors">
      {/* Left side: Hamburger on mobile + environment badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden transition-colors"
          aria-label="Abrir Menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Ambiente de Datos en Vivo AWS
          </span>
          <span className="text-[10px] font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
            APIs Públicas
          </span>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Global Region Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsRegionMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <span className="hidden md:inline">{currentRegion.name}</span>
            <RegionFlag countryCode={currentRegion.countryCode} size="sm" title={`Bandera de ${currentRegion.name}`} />
            <span className="hidden lg:inline font-mono text-[10px] text-slate-500 dark:text-slate-400">
              {latencyOf(currentRegion)}ms
            </span>
            <span className="md:hidden font-mono">{currentRegion.code}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isRegionMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsRegionMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  Seleccionar Región AWS
                </div>
                <div className="space-y-1 mt-1">
                  {regions.map((reg) => {
                    const isSelected = reg.code === selectedRegionCode;
                    return (
                      <button
                        key={reg.code}
                        onClick={() => {
                          setSelectedRegionCode(reg.code);
                          setIsRegionMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <RegionFlag countryCode={reg.countryCode} size="sm" title={`Bandera de ${reg.name}`} />
                          <div>
                            <span className="block font-medium">{reg.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {reg.code} • {latencyOf(reg)}ms
                            </span>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
          title={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label="Alternar tema"
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Notificaciones"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />
          </button>

          {isNotificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsNotificationsOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 px-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Notificaciones de Eventos Cloud
                  </span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold cursor-pointer">
                    Marcar leídas
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-1">
                  {mockNotifications.map((notif) => (
                    <div key={notif.id} className="py-2.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-slate-400">{notif.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {notif.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile Avatar Pill */}
        <UserMenu />
      </div>
    </header>
  );
};
