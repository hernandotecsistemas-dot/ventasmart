import {
  LayoutGrid,
  Users,
  Package,
  ShoppingCart,
  FileText,
  CreditCard,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { ModuleKey, User } from '../types';

interface Props {
  activeModule: ModuleKey;
  onSelectModule: (mod: ModuleKey) => void;
  user: User;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  key: ModuleKey;
  label: string;
  icon: typeof LayoutGrid;
  tag?: string;
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { key: 'clientes', label: 'Clientes', icon: Users },
  { key: 'productos', label: 'Productos', icon: Package },
  { key: 'pos', label: 'Registrar Venta', icon: ShoppingCart, tag: 'POS' },
  { key: 'detalle_ventas', label: 'Detalle de Ventas', icon: FileText },
  { key: 'pagos', label: 'Pagos', icon: CreditCard },
  { key: 'facturas', label: 'Historial de Facturas', icon: Receipt },
  { key: 'reportes', label: 'Reportes', icon: BarChart3 },
  { key: 'configuracion', label: 'Configuración', icon: Settings },
];

export function Sidebar({
  activeModule,
  onSelectModule,
  user,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const sidebarBody = (
    <div className="flex flex-col h-full bg-[#090E1A] border-r border-[#1E293B] w-64 select-none">
      {/* Brand Lockup */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-[#1E293B]/70 shrink-0">
        <button
          onClick={() => {
            onSelectModule('dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-3 text-left cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-[#2563EB] flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6L12 18L20 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 6L12 12L16 6" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <span className="block text-[15px] font-bold text-white leading-tight tracking-tight">
              VentaSmart
            </span>
            <span className="block text-[11px] font-medium text-[#60A5FA] leading-tight mt-0.5">
              Sistema Comercial
            </span>
          </div>
        </button>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/5"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Módulos principales">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                onSelectModule(item.key);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#131C2E]'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#64748B]'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.tag && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-[#1E293B] text-[#60A5FA]'
                  }`}
                >
                  {item.tag}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-[#1E293B]/70 space-y-2 shrink-0">
        <div className="px-3 py-2.5 rounded-lg bg-[#111A2C] border border-[#1E293B]">
          <p className="text-xs font-semibold text-white truncate">
            {user.nombre} {user.apellido}
          </p>
          <p className="text-[11px] text-[#94A3B8] truncate">{user.rol} · {user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-[#FCA5A5] hover:bg-[#DC2626]/10 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0 z-30">
        {sidebarBody}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
}
