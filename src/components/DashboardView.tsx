import { useEffect, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Package,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  DollarSign,
  Clock,
  Plus,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatCurrency, formatDateTime, fullClientName, getEstadoPagoStyle } from '../lib/format';
import { ModuleKey } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

interface DashboardData {
  kpis: {
    ventas_totales: string;
    ventas_hoy: string;
    num_ventas: number;
    clientes_registrados: number;
    productos_registrados: number;
    productos_stock_bajo: number;
    total_ingresos: string;
    total_saldos_pendientes: string;
    ventas_mes_anterior: string;
  };
  ventas_mensuales: Array<{ mes: string; total: string; transacciones: number }>;
  ventas_diarias: Array<{ dia: string; total: string; transacciones: number }>;
  productos_mas_vendidos: Array<{
    producto_id: number;
    codigo: string;
    nombre: string;
    unidades_vendidas: number;
    ingresos: string;
    stock: number;
    stock_minimo: number;
  }>;
  ultimas_ventas: Array<{
    id: number;
    numero_venta: string;
    fecha_venta: string;
    total: string;
    estado_pago: string;
    cliente_nombres: string;
    cliente_apellidos: string;
    metodo_pago: string;
  }>;
  stock_bajo: Array<{
    id: number;
    codigo: string;
    nombre: string;
    categoria: string;
    stock: number;
    stock_minimo: number;
    precio_venta: string;
  }>;
}

interface Props {
  onNavigate: (mod: ModuleKey) => void;
  onInspectSale: (ventaId: number) => void;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
  refreshTrigger: number;
}

export function DashboardView({ onNavigate, onInspectSale, onNotify, refreshTrigger }: Props) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('month');
  const [chartMode, setChartMode] = useState<'monthly' | 'daily'>('monthly');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [restockingId, setRestockingId] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<DashboardData>(`/api/reportes/dashboard?period=${period}`);
      setData(res);
    } catch (err: any) {
      onNotify('error', err.message || 'No se pudo cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  }, [period, onNotify]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshTrigger]);

  async function handleQuickRestock(prodId: number, nombre: string) {
    setRestockingId(prodId);
    try {
      await apiFetch(`/api/productos/${prodId}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ ajuste: 10 }),
      });
      onNotify('success', `Se agregaron +10 unidades a "${nombre}".`);
      loadDashboard();
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setRestockingId(null);
    }
  }

  const kpis = data?.kpis;
  const currentTotal = Number(kpis?.ventas_totales || 0);
  const prevTotal = Number(kpis?.ventas_mes_anterior || 0);
  const growthPct = prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 1000) / 10 : null;
  const avgTicket = kpis && kpis.num_ventas > 0 ? currentTotal / kpis.num_ventas : 0;

  const chartLabels =
    chartMode === 'monthly'
      ? (data?.ventas_mensuales || []).map((m) => m.mes)
      : (data?.ventas_diarias || []).map((d) => d.dia);

  const chartValues =
    chartMode === 'monthly'
      ? (data?.ventas_mensuales || []).map((m) => Number(m.total))
      : (data?.ventas_diarias || []).map((d) => Number(d.total));

  const chartData = {
    labels: chartLabels.length > 0 ? chartLabels : ['Sin datos'],
    datasets: [
      {
        label: 'Facturación (COP)',
        data: chartValues.length > 0 ? chartValues : [0],
        backgroundColor: '#2563EB',
        hoverBackgroundColor: '#3B82F6',
        borderRadius: 6,
        maxBarThickness: 42,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#F8FAFC',
        bodyColor: '#93C5FD',
        padding: 10,
        callbacks: {
          label: (ctx: any) => ` ${formatCurrency(ctx.parsed.y, true)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94A3B8', font: { size: 11 } },
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: {
          color: '#94A3B8',
          font: { size: 11 },
          callback: (val: any) => {
            const num = Number(val);
            if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
            if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
            return `$${num}`;
          },
        },
      },
    },
  };

  const maxTopIncome = Math.max(
    1,
    ...(data?.productos_mas_vendidos || []).map((p) => Number(p.ingresos))
  );

  return (
    <div className="space-y-6">
      {/* Header & Period Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight text-balance">
            Panel de Control y Dashboard Comercial
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Indicadores calculados en tiempo real desde la base de datos PostgreSQL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-[#111A2C] border border-[#1E293B] rounded-lg">
            {(
              [
                { id: 'today', label: 'Hoy' },
                { id: 'week', label: '7 Días' },
                { id: 'month', label: 'Este Mes' },
                { id: 'year', label: 'Año' },
                { id: 'all', label: 'Histórico' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  period === p.id
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={loadDashboard}
            className="p-2 rounded-lg bg-[#111A2C] border border-[#1E293B] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            title="Actualizar indicadores"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (8 Core Indicators across 4+4 clean cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#94A3B8]">Ventas Totales del Período</span>
            <TrendingUp className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {formatCurrency(kpis?.ventas_totales, true)}
          </p>
          <div className="flex items-center justify-between mt-3 text-xs text-[#94A3B8]">
            <span>Hoy: {formatCurrency(kpis?.ventas_hoy)}</span>
            {growthPct !== null && (
              <span className={growthPct >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'}>
                {growthPct >= 0 ? `+${growthPct}%` : `${growthPct}%`} vs mes ant.
              </span>
            )}
          </div>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#94A3B8]">Transacciones Realizadas</span>
            <ShoppingBag className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {kpis?.num_ventas ?? 0} <span className="text-sm font-normal text-[#94A3B8]">ventas</span>
          </p>
          <div className="flex items-center justify-between mt-3 text-xs text-[#94A3B8]">
            <span>Ticket promedio</span>
            <span className="font-mono tabular-nums text-white">{formatCurrency(avgTicket)}</span>
          </div>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#94A3B8]">Recaudo vs Saldos Pendientes</span>
            <DollarSign className="w-4 h-4 text-[#16A36A]" />
          </div>
          <p className="text-2xl font-bold text-[#34D399] font-mono tabular-nums mt-2">
            {formatCurrency(kpis?.total_ingresos, true)}
          </p>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[#94A3B8] flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#F59E0B]" /> Por cobrar:
            </span>
            <span className="font-mono tabular-nums text-[#FBBF24]">
              {formatCurrency(kpis?.total_saldos_pendientes)}
            </span>
          </div>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#94A3B8]">Clientes e Inventario</span>
            <Package className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div className="flex items-baseline gap-4 mt-2">
            <p className="text-2xl font-bold text-white font-mono tabular-nums">
              {kpis?.productos_registrados ?? 0}{' '}
              <span className="text-xs font-normal text-[#94A3B8]">SKUs</span>
            </p>
            <p className="text-lg font-semibold text-[#CBD5E1] font-mono tabular-nums flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#64748B]" />
              {kpis?.clientes_registrados ?? 0}
            </p>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-[#94A3B8]">Alertas stock bajo</span>
            <button
              onClick={() => onNavigate('productos')}
              className={`font-semibold cursor-pointer ${
                (kpis?.productos_stock_bajo || 0) > 0 ? 'text-[#FBBF24]' : 'text-[#34D399]'
              }`}
            >
              {kpis?.productos_stock_bajo ?? 0} ítems en riesgo
            </button>
          </div>
        </div>
      </div>

      {/* Middle Section: Chart + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                {chartMode === 'monthly' ? 'Evolución de Ventas por Mes' : 'Ventas Diarias (Últimos 14 Días)'}
              </h2>
              <p className="text-xs text-[#94A3B8]">Consolidado real de comprobantes emitidos</p>
            </div>
            <div className="flex items-center p-1 bg-[#0B111E] border border-[#1E293B] rounded-lg">
              <button
                onClick={() => setChartMode('daily')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  chartMode === 'daily' ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                Diario
              </button>
              <button
                onClick={() => setChartMode('monthly')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  chartMode === 'monthly' ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                Mensual
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        <div className="lg:col-span-4 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Productos Más Vendidos</h2>
            <button
              onClick={() => onNavigate('productos')}
              className="text-xs text-[#60A5FA] hover:text-[#93C5FD] flex items-center gap-1 cursor-pointer"
            >
              <span>Catálogo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4 flex-1">
            {(data?.productos_mas_vendidos || []).length === 0 ? (
              <p className="text-xs text-[#94A3B8] py-8 text-center">
                Aún no hay productos vendidos registrados.
              </p>
            ) : (
              (data?.productos_mas_vendidos || []).map((prod, idx) => {
                const pct = Math.max(8, Math.round((Number(prod.ingresos) / maxTopIncome) * 100));
                const lowStock = prod.stock <= prod.stock_minimo;
                return (
                  <div key={prod.producto_id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-white truncate">
                        <span className="font-mono text-[#60A5FA] mr-1.5">0{idx + 1}</span>
                        {prod.nombre}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-white shrink-0">
                        {formatCurrency(prod.ingresos)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#0B111E] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2563EB] rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                      <span>{prod.unidades_vendidas} uds vendidas</span>
                      <span className={lowStock ? 'text-[#FBBF24]' : ''}>
                        Stock actual: {prod.stock} uds
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Sales Table + Critical Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Últimas Ventas Registradas</h2>
              <p className="text-xs text-[#94A3B8]">Haz clic en cualquier operación para consultar su detalle</p>
            </div>
            <button
              onClick={() => onNavigate('detalle_ventas')}
              className="text-xs text-[#60A5FA] hover:text-[#93C5FD] flex items-center gap-1 cursor-pointer"
            >
              <span>Ver todas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-[#94A3B8]">
                  <th className="py-3 px-4">Consecutivo</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Fecha y Hora</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-xs">
                {(data?.ultimas_ventas || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#94A3B8]">
                      No hay ventas registradas todavía.
                    </td>
                  </tr>
                ) : (
                  (data?.ultimas_ventas || []).map((sale) => {
                    const badge = getEstadoPagoStyle(sale.estado_pago);
                    return (
                      <tr
                        key={sale.id}
                        onClick={() => onInspectSale(sale.id)}
                        className="hover:bg-[#162136] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[#60A5FA] whitespace-nowrap">
                          {sale.numero_venta}
                        </td>
                        <td className="py-3 px-4 text-white font-medium max-w-[180px] truncate">
                          {fullClientName(sale.cliente_nombres, sale.cliente_apellidos)}
                        </td>
                        <td className="py-3 px-4 text-[#94A3B8] whitespace-nowrap font-mono">
                          {formatDateTime(sale.fecha_venta)}
                        </td>
                        <td className="py-3 px-4 text-[#CBD5E1] whitespace-nowrap">
                          {sale.metodo_pago}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-white whitespace-nowrap">
                          {formatCurrency(sale.total)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {sale.estado_pago}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
              <span>Alertas de Stock Bajo</span>
            </h2>
            <span className="text-xs font-mono text-[#FBBF24]">
              {data?.stock_bajo.length ?? 0} SKUs
            </span>
          </div>

          <div className="space-y-2.5 flex-1">
            {(data?.stock_bajo || []).length === 0 ? (
              <div className="py-8 text-center text-xs text-[#94A3B8]">
                Todo el inventario se encuentra sobre el umbral mínimo.
              </div>
            ) : (
              (data?.stock_bajo || []).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-[#0B111E] border border-[#1E293B] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{item.nombre}</p>
                    <p className="text-[11px] text-[#FBBF24] font-mono mt-0.5">
                      Quedan {item.stock} uds (Mín: {item.stock_minimo})
                    </p>
                  </div>
                  <button
                    onClick={() => handleQuickRestock(item.id, item.nombre)}
                    disabled={restockingId === item.id}
                    className="px-2.5 py-1.5 rounded-md bg-[#162136] hover:bg-[#2563EB] border border-[#1E293B] text-xs font-medium text-white transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+10</span>
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => onNavigate('productos')}
            className="mt-4 w-full py-2 px-3 rounded-lg bg-[#0B111E] hover:bg-[#162136] border border-[#1E293B] text-xs font-medium text-[#CBD5E1] transition-colors cursor-pointer"
          >
            Gestionar Inventario Completo
          </button>
        </div>
      </div>
    </div>
  );
}
