import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Bell,
  Menu,
  Building2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Configuracion, ModuleKey, User } from '../types';
import { USER_AVATAR } from '../lib/productImages';
import { formatCurrency } from '../lib/format';

interface AlertItem {
  id: number;
  tipo: 'stock' | 'saldo';
  titulo: string;
  detalle: string;
}

interface Props {
  user: User;
  config: Configuracion | null;
  globalSearch: string;
  onGlobalSearchChange: (q: string) => void;
  onOpenMobileMenu: () => void;
  onNavigate: (mod: ModuleKey) => void;
  alerts: AlertItem[];
}

export function TopBar({
  user,
  config,
  globalSearch,
  onGlobalSearchChange,
  onOpenMobileMenu,
  onNavigate,
  alerts,
}: Props) {
  const [notifOpen, setNotifOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    // Route naturally depending on prefix or default to facturas/sales search
    const q = globalSearch.trim().toUpperCase();
    if (q.startsWith('VS-') || q.startsWith('COMP-')) {
      onNavigate('facturas');
    } else if (q.startsWith('SKU-')) {
      onNavigate('productos');
    }
  }

  return (
    <header className="h-16 bg-[#0B111E]/95 backdrop-blur-sm border-b border-[#1E293B] px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#131C2E]"
          aria-label="Abrir navegación"
        >
          <Menu className="w-5 h-5" />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder="Buscar clientes, productos, comprobantes..."
            className="w-full pl-9 pr-14 py-2 bg-[#111A2C] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB] transition-colors"
          />
          <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] font-mono text-[#64748B] bg-[#0B111E] border border-[#1E293B] rounded">
            ⌘K
          </kbd>
        </form>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111A2C] border border-[#1E293B] text-xs text-[#CBD5E1] whitespace-nowrap">
          <Building2 className="w-3.5 h-3.5 text-[#60A5FA]" />
          <span className="max-w-[200px] truncate">
            {config?.nombre_empresa || 'VentaSmart Comercial S.A.S.'}
          </span>
        </div>

        <button
          onClick={() => onNavigate('pos')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Venta</span>
        </button>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative p-2 rounded-lg bg-[#111A2C] border border-[#1E293B] text-[#CBD5E1] hover:text-white hover:border-[#334155] transition-colors cursor-pointer"
            aria-label="Notificaciones comerciales"
          >
            <Bell className="w-4 h-4" />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-[10px] font-bold text-white flex items-center justify-center">
                {alerts.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[#111A2C] border border-[#1E293B] rounded-xl shadow-2xl overflow-hidden z-40">
              <div className="px-4 py-3 border-b border-[#1E293B] flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Alertas Operativas</span>
                <span className="text-[11px] text-[#94A3B8]">{alerts.length} activas</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[#1E293B]">
                {alerts.length === 0 ? (
                  <p className="p-4 text-xs text-[#94A3B8] text-center">
                    No hay alertas de stock ni saldos pendientes.
                  </p>
                ) : (
                  alerts.map((a, i) => (
                    <button
                      key={`${a.tipo}-${a.id}-${i}`}
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate(a.tipo === 'stock' ? 'productos' : 'pagos');
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-[#162136] transition-colors flex items-start gap-3 cursor-pointer"
                    >
                      {a.tipo === 'stock' ? (
                        <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="w-4 h-4 text-[#60A5FA] shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{a.titulo}</p>
                        <p className="text-[11px] text-[#94A3B8] mt-0.5">{a.detalle}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-[#1E293B]">
          <img
            src={USER_AVATAR}
            alt={`${user.nombre} ${user.apellido}`}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full object-cover border border-[#334155]"
          />
          <div className="leading-tight">
            <p className="text-xs font-semibold text-white whitespace-nowrap">
              {user.nombre} {user.apellido}
            </p>
            <p className="text-[11px] text-[#60A5FA] whitespace-nowrap">{user.rol}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

export { formatCurrency };
