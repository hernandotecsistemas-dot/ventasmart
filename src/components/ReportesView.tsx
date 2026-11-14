import { useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Download, Calendar, TrendingUp, Users, Package, Clock } from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile } from '../lib/api';
import { formatCurrency, formatDate, fullClientName } from '../lib/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

interface AnalyticsData {
  resumen: {
    facturacion_total: string;
    subtotal_total: string;
    impuestos_total: string;
    descuentos_total: string;
    total_ventas: number;
    ticket_promedio: string;
    ingresos_recibidos: string;
    saldos_pendientes: string;
  };
  serie_ventas: Array<{ periodo: string; total: string; cantidad: number }>;
  metodos_pago: Array<{ metodo_pago: string; total: string; transacciones: number }>;
  top_productos: Array<{
    producto_id: number;
    codigo: string;
    nombre: string;
    unidades: number;
    total_ventas: string;
    costo_estimado: string;
  }>;
  top_clientes: Array<{
    id: number;
    tipo_documento: string;
    numero_documento: string;
    nombres: string;
    apellidos: string;
    ciudad: string;
    ordenes: number;
    total_comprado: string;
    saldo_pendiente: string;
  }>;
  saldos_pendientes: Array<{
    id: number;
    numero_venta: string;
    fecha_venta: string;
    total: string;
    estado_pago: string;
    cliente_nombres: string;
    cliente_apellidos: string;
    numero_documento: string;
    pagado: string;
    saldo_pendiente: string;
  }>;
}

interface Props {
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
  onInspectSale: (ventaId: number) => void;
}

export function ReportesView({ onNotify, onInspectSale }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('month');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('granularity', granularity);
      const res = await apiFetch<AnalyticsData>(`/api/reportes/analytics?${params.toString()}`);
      setData(res);
    } catch (err: any) {
      onNotify('error', err.message || 'No se pudieron cargar los reportes.');
    } finally {
      setLoading(false);
    }
  }, [from, to, granularity, onNotify]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const resumen = data?.resumen;
  const totalFacturado = Number(resumen?.facturacion_total || 0);
  const totalIngresos = Number(resumen?.ingresos_recibidos || 0);
  const totalPendiente = Number(resumen?.saldos_pendientes || 0);

  const barData = {
    labels: (data?.serie_ventas || []).map((s) => s.periodo),
    datasets: [
      {
        label: 'Ventas (COP)',
        data: (data?.serie_ventas || []).map((s) => Number(s.total)),
        backgroundColor: '#2563EB',
        borderRadius: 6,
        maxBarThickness: 44,
      },
    ],
  };

  const doughnutColors = ['#2563EB', '#16A36A', '#F59E0B', '#60A5FA', '#94A3B8'];
  const doughnutData = {
    labels: (data?.metodos_pago || []).map((m) => m.metodo_pago),
    datasets: [
      {
        data: (data?.metodos_pago || []).map((m) => Number(m.total)),
        backgroundColor: doughnutColors,
        borderColor: '#111A2C',
        borderWidth: 2,
      },
    ],
  };

  async function handleExport(type: 'ventas' | 'productos' | 'pendientes') {
    const params = new URLSearchParams({ type });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      await downloadAuthenticatedFile(
        `/api/reportes/export?${params.toString()}`,
        `ventasmart_reporte_${type}.csv`
      );
      onNotify('success', 'Reporte exportado correctamente.');
    } catch (err: any) {
      onNotify('error', err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Reportes Comerciales y Analítica de Ventas
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Análisis diario, semanal y mensual de facturación, productos, clientes y cartera.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('ventas')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Ventas (CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport('pendientes')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111A2C] hover:bg-[#162136] border border-[#1E293B] text-[#CBD5E1] text-xs font-medium cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Saldos Pendientes</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport('productos')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111A2C] hover:bg-[#162136] border border-[#1E293B] text-[#CBD5E1] text-xs font-medium cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Top Productos</span>
          </button>
        </div>
      </div>

      {/* Date Range & Granularity Filter Bar */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-[#94A3B8] font-medium">
            <Calendar className="w-4 h-4 text-[#60A5FA]" />
            Rango de fechas:
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-1.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-white"
          />
          <span className="text-[#64748B]">a</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-1.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-white"
          />
          {(from || to) && (
            <button
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="text-xs text-[#60A5FA] hover:underline cursor-pointer"
            >
              Limpiar rango
            </button>
          )}
        </div>

        <div className="flex items-center p-1 bg-[#0B111E] border border-[#1E293B] rounded-lg w-fit">
          {(
            [
              { id: 'day', label: 'Diario' },
              { id: 'week', label: 'Semanal' },
              { id: 'month', label: 'Mensual' },
            ] as const
          ).map((g) => (
            <button
              key={g.id}
              onClick={() => setGranularity(g.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                granularity === g.id ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Facturación Bruta</span>
            <TrendingUp className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {formatCurrency(totalFacturado, true)}
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            {resumen?.total_ventas || 0} ventas · Impuestos: {formatCurrency(resumen?.impuestos_total)}
          </p>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Ingresos Efectivos Recibidos</span>
          </div>
          <p className="text-2xl font-bold text-[#34D399] font-mono tabular-nums mt-2">
            {formatCurrency(totalIngresos, true)}
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            Recaudación real aplicada
          </p>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Ticket Promedio</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {formatCurrency(resumen?.ticket_promedio, true)}
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            Descuentos otorgados: {formatCurrency(resumen?.descuentos_total)}
          </p>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Saldos Pendientes</span>
            <Clock className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <p className="text-2xl font-bold text-[#FBBF24] font-mono tabular-nums mt-2">
            {formatCurrency(totalPendiente, true)}
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            {data?.saldos_pendientes.length || 0} cuentas por cobrar
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5">
          <h2 className="text-base font-bold text-white mb-1">
            Facturación por Período ({granularity === 'day' ? 'Diario' : granularity === 'week' ? 'Semanal' : 'Mensual'})
          </h2>
          <p className="text-xs text-[#94A3B8] mb-4">Serie temporal generada desde PostgreSQL</p>
          <div className="h-64">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-[#94A3B8]">
                Cargando gráfico...
              </div>
            ) : (
              <Bar
                data={barData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 11 } } },
                    y: {
                      grid: { color: 'rgba(148, 163, 184, 0.1)' },
                      ticks: { color: '#94A3B8', font: { size: 11 } },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5 flex flex-col">
          <h2 className="text-base font-bold text-white mb-1">Métodos de Pago</h2>
          <p className="text-xs text-[#94A3B8] mb-4">Distribución del recaudo</p>
          <div className="h-52 flex items-center justify-center">
            {(data?.metodos_pago || []).length === 0 ? (
              <p className="text-xs text-[#94A3B8]">Sin pagos en el rango seleccionado.</p>
            ) : (
              <Doughnut
                data={doughnutData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '65%',
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { color: '#CBD5E1', boxWidth: 10, font: { size: 11 } },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Top Products & Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-[#60A5FA]" />
              <span>Productos Más Vendidos</span>
            </h2>
          </div>
          <div className="divide-y divide-[#1E293B]">
            {(data?.top_productos || []).length === 0 ? (
              <p className="p-6 text-center text-xs text-[#94A3B8]">Sin datos en el período.</p>
            ) : (
              (data?.top_productos || []).map((p, idx) => {
                const margin =
                  Number(p.total_ventas) > 0
                    ? Math.round(
                        ((Number(p.total_ventas) - Number(p.costo_estimado)) / Number(p.total_ventas)) *
                          100
                      )
                    : 0;
                return (
                  <div key={p.producto_id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">
                        <span className="font-mono text-[#60A5FA] mr-2">#{idx + 1}</span>
                        {p.nombre}
                      </p>
                      <p className="text-[11px] text-[#94A3B8]">
                        {p.codigo} · {p.unidades} unidades · Margen est. {margin}%
                      </p>
                    </div>
                    <span className="font-mono font-bold text-white shrink-0">
                      {formatCurrency(p.total_ventas, true)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#60A5FA]" />
              <span>Clientes con Mayores Compras</span>
            </h2>
          </div>
          <div className="divide-y divide-[#1E293B]">
            {(data?.top_clientes || []).length === 0 ? (
              <p className="p-6 text-center text-xs text-[#94A3B8]">Sin compras en el período.</p>
            ) : (
              (data?.top_clientes || []).map((c, idx) => (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      <span className="font-mono text-[#60A5FA] mr-2">#{idx + 1}</span>
                      {fullClientName(c.nombres, c.apellidos)}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {c.tipo_documento}: {c.numero_documento} · {c.ordenes} órdenes
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-white">
                      {formatCurrency(c.total_comprado)}
                    </p>
                    <p
                      className={`text-[11px] font-mono ${
                        Number(c.saldo_pendiente) > 0 ? 'text-[#FBBF24]' : 'text-[#34D399]'
                      }`}
                    >
                      Saldo: {formatCurrency(c.saldo_pendiente)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pending Balances Report Table */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Reporte de Saldos Pendientes</h2>
          <span className="text-xs font-mono text-[#FBBF24]">
            {data?.saldos_pendientes.length || 0} ventas por liquidar
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E293B] text-[#94A3B8]">
                <th className="py-3 px-4">Venta</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Pagado</th>
                <th className="py-3 px-4 text-right">Saldo Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {(data?.saldos_pendientes || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#94A3B8]">
                    No existen saldos pendientes por cobrar.
                  </td>
                </tr>
              ) : (
                (data?.saldos_pendientes || []).map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onInspectSale(s.id)}
                    className="hover:bg-[#162136] cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-[#60A5FA]">
                      {s.numero_venta}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#94A3B8]">{formatDate(s.fecha_venta)}</td>
                    <td className="py-3 px-4 text-white font-medium">
                      {fullClientName(s.cliente_nombres, s.cliente_apellidos)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-white">
                      {formatCurrency(s.total)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#34D399]">
                      {formatCurrency(s.pagado)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#FBBF24]">
                      {formatCurrency(s.saldo_pendiente)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
