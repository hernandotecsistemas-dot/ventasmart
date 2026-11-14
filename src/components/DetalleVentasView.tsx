import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Eye,
  Download,
  CreditCard,
  ArrowLeft,
  User as UserIcon,
  Calendar,
  Receipt,
} from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile } from '../lib/api';
import { DetalleVenta, Pago, Venta } from '../types';
import { formatCurrency, formatDateTime, fullClientName, getEstadoPagoStyle } from '../lib/format';

interface Props {
  selectedVentaId: number | null;
  onSelectVentaId: (id: number | null) => void;
  globalSearch: string;
  onGoToPaySale: (ventaId: number) => void;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
}

export function DetalleVentasView({
  selectedVentaId,
  onSelectVentaId,
  globalSearch,
  onGoToPaySale,
  onNotify,
}: Props) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [loadingList, setLoadingList] = useState(true);

  const [detailSale, setDetailSale] = useState<Venta | null>(null);
  const [detailItems, setDetailItems] = useState<DetalleVenta[]>([]);
  const [detailPayments, setDetailPayments] = useState<Pago[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const effectiveSearch = search || globalSearch;

  const loadSales = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (effectiveSearch) params.set('q', effectiveSearch);
      if (estadoFilter !== 'Todos') params.set('estado', estadoFilter);
      const res = await apiFetch<{ ventas: Venta[] }>(`/api/ventas?${params.toString()}`);
      setVentas(res.ventas);
    } catch (err: any) {
      onNotify('error', err.message || 'Error al cargar ventas.');
    } finally {
      setLoadingList(false);
    }
  }, [effectiveSearch, estadoFilter, onNotify]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!selectedVentaId) {
      setDetailSale(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    apiFetch<{ venta: Venta; detalles: DetalleVenta[]; pagos: Pago[] }>(
      `/api/ventas/${selectedVentaId}`
    )
      .then((res) => {
        if (cancelled) return;
        setDetailSale(res.venta);
        setDetailItems(res.detalles);
        setDetailPayments(res.pagos);
      })
      .catch((err: any) => {
        if (!cancelled) onNotify('error', err.message || 'No se pudo cargar el detalle de la venta.');
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVentaId, onNotify]);

  if (selectedVentaId && (loadingDetail || detailSale)) {
    const sale = detailSale;
    const badge = sale ? getEstadoPagoStyle(sale.estado_pago) : null;
    const saldoPendiente = Number(sale?.saldo_pendiente || 0);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => onSelectVentaId(null)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#111A2C] hover:bg-[#162136] border border-[#1E293B] text-xs font-semibold text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al listado de ventas</span>
          </button>

          {sale && (
            <div className="flex flex-wrap items-center gap-2">
              {saldoPendiente > 0 && (
                <button
                  onClick={() => onGoToPaySale(sale.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#16A36A] hover:bg-[#15803D] text-white text-xs font-semibold cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Registrar Pago ({formatCurrency(saldoPendiente)})</span>
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadAuthenticatedFile(`/api/facturas/${sale.id}/pdf`, `${sale.numero_venta}.pdf`);
                    onNotify('success', 'Comprobante generado correctamente');
                  } catch (err: any) {
                    onNotify('error', err.message);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Descargar Comprobante PDF</span>
              </button>
            </div>
          )}
        </div>

        {loadingDetail || !sale ? (
          <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-12 text-center text-sm text-[#94A3B8]">
            Cargando detalle completo de la operación...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header Summary Card */}
            <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold font-mono text-white">{sale.numero_venta}</h1>
                  {badge && (
                    <span
                      className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {sale.estado_pago}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#94A3B8] mt-2">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDateTime(sale.fecha_venta)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5" />
                    Vendedor: {sale.vendedor_nombre}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 md:text-right">
                <div>
                  <p className="text-xs text-[#94A3B8]">Total Venta</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-white">
                    {formatCurrency(sale.total, true)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8]">Total Pagado</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-[#34D399]">
                    {formatCurrency(sale.total_pagado, true)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8]">Saldo Pendiente</p>
                  <p
                    className={`text-xl font-bold font-mono tabular-nums ${
                      saldoPendiente > 0 ? 'text-[#FBBF24]' : 'text-[#94A3B8]'
                    }`}
                  >
                    {formatCurrency(saldoPendiente, true)}
                  </p>
                </div>
              </div>
            </div>

            {/* Client Info + Financial Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white border-b border-[#1E293B] pb-2.5">
                  Información del Cliente
                </h2>
                <div className="text-xs space-y-2">
                  <p className="text-base font-bold text-white">
                    {fullClientName(sale.cliente_nombres, sale.cliente_apellidos)}
                  </p>
                  <p className="font-mono text-[#60A5FA]">
                    {sale.tipo_documento}: {sale.numero_documento}
                  </p>
                  <p className="text-[#CBD5E1]">Teléfono: {sale.cliente_telefono || 'N/A'}</p>
                  <p className="text-[#CBD5E1]">Correo: {sale.cliente_email || 'N/A'}</p>
                  <p className="text-[#94A3B8]">
                    Dirección: {sale.cliente_direccion || 'N/A'}{' '}
                    {sale.cliente_ciudad ? `· ${sale.cliente_ciudad}` : ''}
                  </p>
                </div>
              </div>

              <div className="lg:col-span-7 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white border-b border-[#1E293B] pb-2.5">
                  Resumen Tributario y Comercial
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
                  <div>
                    <p className="text-[#94A3B8]">Subtotal Bruto</p>
                    <p className="text-sm font-mono font-semibold text-white mt-1">
                      {formatCurrency(sale.subtotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#94A3B8]">Descuento</p>
                    <p className="text-sm font-mono font-semibold text-[#60A5FA] mt-1">
                      -{formatCurrency(sale.descuento)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#94A3B8]">Impuesto ({sale.porcentaje_impuesto}%)</p>
                    <p className="text-sm font-mono font-semibold text-white mt-1">
                      +{formatCurrency(sale.valor_impuesto)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#94A3B8]">Total Neto</p>
                    <p className="text-sm font-mono font-bold text-[#34D399] mt-1">
                      {formatCurrency(sale.total)}
                    </p>
                  </div>
                </div>
                {sale.observaciones && (
                  <p className="text-xs text-[#94A3B8] pt-2 border-t border-[#1E293B]">
                    Observaciones: {sale.observaciones}
                  </p>
                )}
              </div>
            </div>

            {/* Historical Items Table */}
            <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1E293B]">
                <h2 className="text-sm font-semibold text-white">
                  Productos Vendidos (Precios Históricos Conservados)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[#94A3B8]">
                      <th className="py-3 px-4">Código SKU</th>
                      <th className="py-3 px-4">Producto</th>
                      <th className="py-3 px-4 text-right">Cantidad</th>
                      <th className="py-3 px-4 text-right">Precio Unitario</th>
                      <th className="py-3 px-4 text-right">Descuento</th>
                      <th className="py-3 px-4 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {detailItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-4 font-mono text-[#60A5FA]">{item.producto_codigo}</td>
                        <td className="py-3 px-4 font-medium text-white">{item.producto_nombre}</td>
                        <td className="py-3 px-4 text-right font-mono text-white">{item.cantidad}</td>
                        <td className="py-3 px-4 text-right font-mono text-[#CBD5E1]">
                          {formatCurrency(item.precio_unitario)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#94A3B8]">
                          {formatCurrency(item.descuento)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payments History for this Sale */}
            <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Pagos Aplicados a esta Venta</h2>
                <span className="text-xs text-[#94A3B8]">{detailPayments.length} recibos</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[#94A3B8]">
                      <th className="py-3 px-4">N° Recibo</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Método de Pago</th>
                      <th className="py-3 px-4">Referencia / Notas</th>
                      <th className="py-3 px-4">Registrado por</th>
                      <th className="py-3 px-4 text-right">Valor Recibido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {detailPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[#94A3B8]">
                          Esta venta aún no registra pagos aplicados.
                        </td>
                      </tr>
                    ) : (
                      detailPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-3 px-4 font-mono text-[#60A5FA]">{p.numero_recibo}</td>
                          <td className="py-3 px-4 font-mono text-[#94A3B8]">
                            {formatDateTime(p.fecha_pago)}
                          </td>
                          <td className="py-3 px-4 text-white">{p.metodo_pago}</td>
                          <td className="py-3 px-4 text-[#94A3B8]">
                            {p.referencia ? `${p.referencia} · ` : ''}
                            {p.observaciones || '—'}
                          </td>
                          <td className="py-3 px-4 text-[#CBD5E1]">{p.usuario_nombre}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-[#34D399]">
                            {formatCurrency(p.valor)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Detalle de Ventas</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Consulta histórica de operaciones, ítems vendidos, saldos y estado de pago.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por consecutivo (VS-2026-...) o cliente..."
            className="w-full pl-9 pr-4 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="flex items-center p-1 bg-[#0B111E] border border-[#1E293B] rounded-lg overflow-x-auto">
          {['Todos', 'Pagada', 'Parcialmente pagada', 'Pendiente'].map((est) => (
            <button
              key={est}
              onClick={() => setEstadoFilter(est)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                estadoFilter === est ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {est}
            </button>
          ))}
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-[#94A3B8]">
                <th className="py-3.5 px-4">Consecutivo</th>
                <th className="py-3.5 px-4">Fecha y Hora</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4 text-right">Ítems</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4 text-right">Pagado</th>
                <th className="py-3.5 px-4 text-right">Saldo Pendiente</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {loadingList ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#94A3B8]">
                    Cargando operaciones de venta...
                  </td>
                </tr>
              ) : ventas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#94A3B8]">
                    No se encontraron ventas con los filtros actuales.
                  </td>
                </tr>
              ) : (
                ventas.map((v) => {
                  const badge = getEstadoPagoStyle(v.estado_pago);
                  const saldo = Number(v.saldo_pendiente || 0);
                  return (
                    <tr key={v.id} className="hover:bg-[#162136] transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#60A5FA] whitespace-nowrap">
                        {v.numero_venta}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#94A3B8] whitespace-nowrap">
                        {formatDateTime(v.fecha_venta)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-white">
                          {fullClientName(v.cliente_nombres, v.cliente_apellidos)}
                        </p>
                        <p className="text-[11px] font-mono text-[#64748B]">
                          {v.tipo_documento}: {v.numero_documento}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#CBD5E1]">
                        {v.total_items || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-white whitespace-nowrap">
                        {formatCurrency(v.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#34D399] whitespace-nowrap">
                        {formatCurrency(v.total_pagado)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                        <span className={saldo > 0 ? 'text-[#FBBF24]' : 'text-[#64748B]'}>
                          {formatCurrency(saldo)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {v.estado_pago}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => onSelectVentaId(v.id)}
                            title="Consultar detalle completo"
                            className="px-2.5 py-1.5 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-white text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#60A5FA]" />
                            <span>Detalle</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await downloadAuthenticatedFile(`/api/facturas/${v.id}/pdf`, `${v.numero_venta}.pdf`);
                                onNotify('success', 'Comprobante generado correctamente');
                              } catch (err: any) {
                                onNotify('error', err.message);
                              }
                            }}
                            title="Descargar comprobante PDF"
                            className="p-1.5 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-[#CBD5E1] cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
