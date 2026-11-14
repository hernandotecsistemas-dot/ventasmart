import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Download,
  Eye,
  X,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile } from '../lib/api';
import { Configuracion, DetalleVenta, Pago, Venta } from '../types';
import { formatCurrency, formatDateTime, fullClientName, getEstadoPagoStyle } from '../lib/format';

interface ComprobanteRow {
  id: number;
  numero_comprobante: string;
  numero_venta: string;
  fecha_venta: string;
  subtotal: string;
  descuento: string;
  porcentaje_impuesto: string;
  valor_impuesto: string;
  total: string;
  estado_pago: string;
  cliente_id: number;
  tipo_documento: string;
  numero_documento: string;
  cliente_nombres: string;
  cliente_apellidos: string;
  vendedor_nombre: string;
  total_pagado: string;
  saldo_pendiente: string;
  metodo_pago: string;
}

interface Props {
  config: Configuracion | null;
  globalSearch: string;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
  onInspectSale: (ventaId: number) => void;
}

export function FacturasView({ config, globalSearch, onNotify, onInspectSale }: Props) {
  const [rows, setRows] = useState<ComprobanteRow[]>([]);
  const [resumen, setResumen] = useState<{
    total_facturado: string;
    total_cobrado: string;
    cartera_pendiente: string;
    total_comprobantes: number;
    pagadas: number;
    parciales: number;
    pendientes: number;
  } | null>(null);

  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);

  // Preview Modal
  const [previewData, setPreviewData] = useState<{
    venta: Venta;
    detalles: DetalleVenta[];
    pagos: Pago[];
  } | null>(null);

  const effectiveSearch = search || globalSearch;

  const loadComprobantes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (effectiveSearch) params.set('q', effectiveSearch);
      if (estadoFilter !== 'Todos') params.set('estado', estadoFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await apiFetch<{ comprobantes: ComprobanteRow[]; resumen: any }>(
        `/api/facturas?${params.toString()}`
      );
      setRows(res.comprobantes);
      setResumen(res.resumen);
    } catch (err: any) {
      onNotify('error', err.message || 'Error al cargar comprobantes.');
    } finally {
      setLoading(false);
    }
  }, [effectiveSearch, estadoFilter, fromDate, toDate, onNotify]);

  useEffect(() => {
    loadComprobantes();
  }, [loadComprobantes]);

  async function openPreview(ventaId: number) {
    try {
      const res = await apiFetch<{ venta: Venta; detalles: DetalleVenta[]; pagos: Pago[] }>(
        `/api/ventas/${ventaId}`
      );
      setPreviewData(res);
    } catch (err: any) {
      onNotify('error', err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Historial de Facturas y Comprobantes Internos
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Consulta, previsualización y descarga en PDF de documentos internos de soporte comercial.
        </p>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <p className="text-xs text-[#94A3B8]">Volumen Total Emitido</p>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
            {formatCurrency(resumen?.total_facturado, true)}
          </p>
        </div>
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <p className="text-xs text-[#94A3B8]">Cobranza Efectiva</p>
          <p className="text-2xl font-bold text-[#34D399] font-mono tabular-nums mt-1">
            {formatCurrency(resumen?.total_cobrado, true)}
          </p>
        </div>
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <p className="text-xs text-[#94A3B8]">Saldo por Cobrar</p>
          <p className="text-2xl font-bold text-[#FBBF24] font-mono tabular-nums mt-1">
            {formatCurrency(resumen?.cartera_pendiente, true)}
          </p>
        </div>
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <p className="text-xs text-[#94A3B8]">Comprobantes Generados</p>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
            {resumen?.total_comprobantes || 0}
          </p>
        </div>
      </div>

      {/* Legal Clarity Banner */}
      <div className="px-4 py-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center gap-3 text-xs text-[#FDE68A]">
        <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
        <span>
          {config?.nota_comprobante ||
            'DOCUMENTO INTERNO DE SOPORTE COMERCIAL. NO ES UNA FACTURA ELECTRÓNICA VALIDADA POR LA DIAN.'}
        </span>
      </div>

      {/* Filters */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número de venta o cliente..."
              className="w-full pl-9 pr-4 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-[#94A3B8]">Desde:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-white"
            />
            <label className="text-[#94A3B8]">Hasta:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-white"
            />
            {(fromDate || toDate) && (
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="text-xs text-[#60A5FA] hover:underline cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B111E] border border-[#1E293B] rounded-lg w-fit">
          {[
            { id: 'Todos', label: `Todos (${resumen?.total_comprobantes || 0})` },
            { id: 'Pagada', label: `Pagadas (${resumen?.pagadas || 0})` },
            { id: 'Parcialmente pagada', label: `Parciales (${resumen?.parciales || 0})` },
            { id: 'Pendiente', label: `Pendientes (${resumen?.pendientes || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setEstadoFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                estadoFilter === tab.id ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-[#94A3B8]">
                <th className="py-3.5 px-4">N° Comprobante</th>
                <th className="py-3.5 px-4">N° Venta</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4">Método</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4">Estado Pago</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#94A3B8]">
                    Cargando historial de comprobantes...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#94A3B8]">
                    No se encontraron comprobantes para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const badge = getEstadoPagoStyle(r.estado_pago);
                  return (
                    <tr key={r.id} className="hover:bg-[#162136] transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-white whitespace-nowrap">
                        {r.numero_comprobante}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          onClick={() => onInspectSale(r.id)}
                          className="font-mono font-semibold text-[#60A5FA] hover:underline cursor-pointer"
                        >
                          {r.numero_venta}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-white">
                          {fullClientName(r.cliente_nombres, r.cliente_apellidos)}
                        </p>
                        <p className="text-[11px] font-mono text-[#64748B]">
                          {r.tipo_documento}: {r.numero_documento}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#94A3B8] whitespace-nowrap">
                        {formatDateTime(r.fecha_venta)}
                      </td>
                      <td className="py-3 px-4 text-[#CBD5E1] whitespace-nowrap">{r.metodo_pago}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                        {formatCurrency(r.total)}
                        {Number(r.saldo_pendiente) > 0 && (
                          <p className="text-[11px] text-[#FBBF24] font-normal">
                            Saldo: {formatCurrency(r.saldo_pendiente)}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {r.estado_pago}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => openPreview(r.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-white text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#60A5FA]" />
                            <span>Ver</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await downloadAuthenticatedFile(
                                  `/api/facturas/${r.id}/pdf`,
                                  `${r.numero_comprobante}_${r.numero_venta}.pdf`
                                );
                                onNotify('success', 'Comprobante generado correctamente');
                              } catch (err: any) {
                                onNotify('error', err.message);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
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

      {/* Receipt Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white text-[#172033] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[#173B70] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-6 h-6 text-[#93C5FD]" />
                <div>
                  <h2 className="text-base font-bold">
                    Comprobante Interno · {previewData.venta.numero_venta}
                  </h2>
                  <p className="text-xs text-[#CBD5E1]">
                    {config?.nombre_empresa || 'VentaSmart Comercial S.A.S.'} · NIT:{' '}
                    {config?.nit_empresa || '901.456.789-1'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewData(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="p-3 rounded-lg bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] font-bold text-center">
                {config?.nota_comprobante ||
                  'DOCUMENTO INTERNO DE SOPORTE COMERCIAL. NO ES UNA FACTURA ELECTRÓNICA VALIDADA POR LA DIAN.'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
                <div>
                  <p className="font-bold text-[#173B70] mb-1">CLIENTE</p>
                  <p className="font-bold text-sm">
                    {fullClientName(previewData.venta.cliente_nombres, previewData.venta.cliente_apellidos)}
                  </p>
                  <p>
                    {previewData.venta.tipo_documento}: {previewData.venta.numero_documento}
                  </p>
                  <p>{previewData.venta.cliente_direccion || 'Sin dirección'}</p>
                </div>
                <div className="sm:text-right">
                  <p className="font-bold text-[#173B70] mb-1">OPERACIÓN</p>
                  <p>Fecha: {formatDateTime(previewData.venta.fecha_venta)}</p>
                  <p>Vendedor: {previewData.venta.vendedor_nombre}</p>
                  <p className="font-bold">Estado: {previewData.venta.estado_pago}</p>
                </div>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#173B70] text-white">
                    <th className="py-2 px-3 text-left">Código</th>
                    <th className="py-2 px-3 text-left">Producto</th>
                    <th className="py-2 px-3 text-right">Cant.</th>
                    <th className="py-2 px-3 text-right">Precio Unit.</th>
                    <th className="py-2 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {previewData.detalles.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 px-3 font-mono">{d.producto_codigo}</td>
                      <td className="py-2 px-3 font-medium">{d.producto_nombre}</td>
                      <td className="py-2 px-3 text-right font-mono">{d.cantidad}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {formatCurrency(d.precio_unitario)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">
                        {formatCurrency(d.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <p className="font-bold text-[#173B70] mb-1.5">PAGOS RECIBIDOS</p>
                  {previewData.pagos.length === 0 ? (
                    <p className="text-[#64748B]">Sin pagos registrados.</p>
                  ) : (
                    previewData.pagos.map((p) => (
                      <div key={p.id} className="flex justify-between py-0.5">
                        <span>
                          {p.numero_recibo} ({p.metodo_pago})
                        </span>
                        <span className="font-mono font-semibold">{formatCurrency(p.valor)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-mono">{formatCurrency(previewData.venta.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento:</span>
                    <span className="font-mono">-{formatCurrency(previewData.venta.descuento)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Impuesto ({previewData.venta.porcentaje_impuesto}%):</span>
                    <span className="font-mono">
                      {formatCurrency(previewData.venta.valor_impuesto)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[#CBD5E1] font-bold text-sm text-[#173B70]">
                    <span>TOTAL:</span>
                    <span className="font-mono">{formatCurrency(previewData.venta.total, true)}</span>
                  </div>
                  <div className="flex justify-between text-[#16A36A] font-semibold">
                    <span>Pagado:</span>
                    <span className="font-mono">{formatCurrency(previewData.venta.total_pagado)}</span>
                  </div>
                  <div className="flex justify-between text-[#DC2626] font-semibold">
                    <span>Saldo Pendiente:</span>
                    <span className="font-mono">{formatCurrency(previewData.venta.saldo_pendiente)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setPreviewData(null)}
                className="px-4 py-2 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#334155] cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadAuthenticatedFile(
                      `/api/facturas/${previewData.venta.id}/pdf`,
                      `${previewData.venta.numero_venta}.pdf`
                    );
                    onNotify('success', 'Comprobante generado correctamente');
                  } catch (err: any) {
                    onNotify('error', err.message);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Descargar PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
