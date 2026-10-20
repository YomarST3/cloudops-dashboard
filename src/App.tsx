import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Cloud, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { CloudProvider } from './context/CloudContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ToastContainer } from './components/ToastContainer';
import { ServiceDetailModal } from './components/ServiceDetailModal';
import { NetworkNodeModal } from './components/NetworkNodeModal';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Planning } from './pages/Planning';
import { Costs } from './pages/Costs';
import { Infrastructure } from './pages/Infrastructure';
import { Security } from './pages/Security';
import { Network } from './pages/Network';
import { Services } from './pages/Services';
import { Monitoring } from './pages/Monitoring';
import { Reports } from './pages/Reports';
import { ProjectAnalyzer } from './pages/ProjectAnalyzer';
import { AdminUsers } from './pages/AdminUsers';

const FullScreenLoader: React.FC = () => (
  <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-col items-center justify-center gap-4 text-[#64748B] dark:text-slate-400 font-sans">
    <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
      <Cloud className="w-6 h-6 text-white" />
    </div>
    <div className="flex items-center gap-2 text-sm font-semibold">
      <Loader2 className="w-4 h-4 animate-spin" />
      Cargando dashboard...
    </div>
  </div>
);

const AppLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { session, isLoading, isSupabaseConfigured } = useAuth();

  if (isLoading) return <FullScreenLoader />;

  // Sin sesión, todo va a /login. Si Supabase no está configurado no hay forma
  // de iniciar sesión, así que dejamos pasar al dashboard en modo local.
  if (isSupabaseConfigured && !session) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-[#1E293B] dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area (Offset by sidebar width on large screens) */}
      <div className="lg:pl-72 flex flex-col flex-1 min-h-screen">
        {/* Header */}
        <Header onOpenSidebar={() => setIsSidebarOpen(true)} />

        {/* Dynamic Route Pages */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/costs" element={<Costs />} />
            <Route path="/infrastructure" element={<Infrastructure />} />
            <Route path="/security" element={<Security />} />
            <Route path="/network" element={<Network />} />
            <Route path="/services" element={<Services />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/project-analyzer" element={<ProjectAnalyzer />} />
            <Route path="/admin" element={<AdminUsers />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>

      {/* Global Modals & Toast Alerts */}
      <ServiceDetailModal />
      <NetworkNodeModal />
      <ToastContainer />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* CloudProvider solo envuelve al dashboard: en /login no hay sesión
              y no tiene sentido pedir precios ni datos de AWS a AWS. */}
          <Route
            path="*"
            element={
              <CloudProvider>
                <AppLayout />
              </CloudProvider>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;