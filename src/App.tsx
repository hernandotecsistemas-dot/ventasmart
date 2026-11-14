import { useCallback, useEffect, useState } from 'react';
import { apiFetch, clearSessionToken } from './lib/api';
import { googleSignOut } from './lib/firebaseAuth';
import { Configuracion, FlashMessage, ModuleKey, User } from './types';
import { LoginView } from './components/LoginView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ToastContainer } from './components/ToastContainer';
import { DashboardView } from './components/DashboardView';
import { ClientesView } from './components/ClientesView';
import { ProductosView } from './components/ProductosView';
import { PosView } from './components/PosView';
import { DetalleVentasView } from './components/DetalleVentasView';
import { PagosView } from './components/PagosView';
import { FacturasView } from './components/FacturasView';
import { ReportesView } from './components/ReportesView';
import { ConfiguracionView } from './components/ConfiguracionView';

interface AlertItem {
  id: number;
  tipo: 'stock' | 'saldo';
  titulo: string;
  detalle: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [config, setConfig] = useState<Configuracion | null>(null);

  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const [selectedVentaId, setSelectedVentaId] = useState<number | null>(null);
  const [preselectedPaySaleId, setPreselectedPaySaleId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const [toasts, setToasts] = useState<FlashMessage[]>([]);

  const notify = useCallback(
    (type: FlashMessage['type'], message: string, title?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, message, title }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadContextData = useCallback(async () => {
    try {
      const [cfgRes, dashRes] = await Promise.all([
        apiFetch<{ configuracion: Configuracion }>('/api/configuracion'),
        apiFetch<{
          stock_bajo: Array<{ id: number; nombre: string; stock: number; stock_minimo: number }>;
          ultimas_ventas: Array<{
            id: number;
            numero_venta: string;
            estado_pago: string;
            cliente_nombres: string;
          }>;
        }>('/api/reportes/dashboard?period=month'),
      ]);

      setConfig(cfgRes.configuracion);

      const newAlerts: AlertItem[] = [];
      dashRes.stock_bajo.forEach((p) => {
        newAlerts.push({
          id: p.id,
          tipo: 'stock',
          titulo: `Stock bajo: ${p.nombre}`,
          detalle: `Quedan ${p.stock} uds (mínimo ${p.stock_minimo})`,
        });
      });
      dashRes.ultimas_ventas
        .filter((v) => v.estado_pago !== 'Pagada')
        .slice(0, 3)
        .forEach((v) => {
          newAlerts.push({
            id: v.id,
            tipo: 'saldo',
            titulo: `Saldo pendiente: ${v.numero_venta}`,
            detalle: `${v.cliente_nombres} (${v.estado_pago})`,
          });
        });
      setAlerts(newAlerts);
    } catch {
      // Non-blocking background metadata refresh
    }
  }, []);

  useEffect(() => {
    apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
        loadContextData();
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, [loadContextData]);

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      notify('warning', 'Tu sesión expiró. Por favor inicia sesión nuevamente.');
    }
    window.addEventListener('ventasmart:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('ventasmart:unauthorized', handleUnauthorized);
  }, [notify]);

  async function handleLogout() {
    clearSessionToken();
    try {
      await Promise.all([
        apiFetch('/api/auth/logout', { method: 'POST' }),
        googleSignOut(),
      ]);
    } catch {
      // Proceed cleanly
    }
    setUser(null);
    setActiveModule('dashboard');
    notify('info', 'Sesión cerrada correctamente.');
  }

  function handleInspectSale(ventaId: number) {
    setSelectedVentaId(ventaId);
    setActiveModule('detalle_ventas');
  }

  function handleGoToPaySale(ventaId: number) {
    setPreselectedPaySaleId(ventaId);
    setActiveModule('pagos');
  }

  function handleDataChanged() {
    setRefreshTrigger((n) => n + 1);
    loadContextData();
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#2563EB] flex items-center justify-center mx-auto animate-pulse">
            <span className="text-white font-bold text-lg">V</span>
          </div>
          <p className="text-sm text-[#94A3B8]">Iniciando VentaSmart...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginView
          onLoginSuccess={(loggedUser, msg) => {
            setUser(loggedUser);
            loadContextData();
            notify('success', msg);
          }}
        />
        <ToastContainer messages={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B111E] text-[#F1F5F9] flex">
      <Sidebar
        activeModule={activeModule}
        onSelectModule={(mod) => {
          if (mod !== 'detalle_ventas') setSelectedVentaId(null);
          setActiveModule(mod);
        }}
        user={user}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          user={user}
          config={config}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={(mod) => {
            if (mod !== 'detalle_ventas') setSelectedVentaId(null);
            setActiveModule(mod);
          }}
          alerts={alerts}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {activeModule === 'dashboard' && (
            <DashboardView
              onNavigate={(mod) => setActiveModule(mod)}
              onInspectSale={handleInspectSale}
              onNotify={notify}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeModule === 'clientes' && (
            <ClientesView
              globalSearch={globalSearch}
              onNotify={notify}
              onInspectSale={handleInspectSale}
            />
          )}

          {activeModule === 'productos' && (
            <ProductosView
              globalSearch={globalSearch}
              onNotify={notify}
              onInventoryChanged={handleDataChanged}
            />
          )}

          {activeModule === 'pos' && (
            <PosView
              config={config}
              onNotify={notify}
              onSaleCompleted={handleDataChanged}
              onInspectSale={handleInspectSale}
            />
          )}

          {activeModule === 'detalle_ventas' && (
            <DetalleVentasView
              selectedVentaId={selectedVentaId}
              onSelectVentaId={setSelectedVentaId}
              globalSearch={globalSearch}
              onGoToPaySale={handleGoToPaySale}
              onNotify={notify}
            />
          )}

          {activeModule === 'pagos' && (
            <PagosView
              preselectedVentaId={preselectedPaySaleId}
              onClearPreselectedVenta={() => setPreselectedPaySaleId(null)}
              onNotify={notify}
              onPaymentRecorded={handleDataChanged}
              onInspectSale={handleInspectSale}
            />
          )}

          {activeModule === 'facturas' && (
            <FacturasView
              config={config}
              globalSearch={globalSearch}
              onNotify={notify}
              onInspectSale={handleInspectSale}
            />
          )}

          {activeModule === 'reportes' && (
            <ReportesView onNotify={notify} onInspectSale={handleInspectSale} />
          )}

          {activeModule === 'configuracion' && (
            <ConfiguracionView
              user={user}
              config={config}
              onConfigUpdated={(cfg) => setConfig(cfg)}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </div>
  );
}
