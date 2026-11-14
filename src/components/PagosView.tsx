import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Pago } from '../types';
import { formatCurrency, formatDateTime, fullClientName, getEstadoPagoStyle } from '../lib/format';

interface PendingSale {
  id: number;
  numero_venta: string;
  fecha_venta: string;
  total: string;
  estado_pago: string;
  cliente_id: number;
  tipo_documento: string;
  numero_documento: string;
  cliente_nombres: string;
  cliente_apellidos: string;
  total_pagado: string;
  saldo_pendiente: string;
}

interface Props {
  preselectedVentaId: number | null;
  onClearPreselectedVenta: () => void;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
  onPaymentRecorded: () => void;
  onInspectSale: (ventaId: number) => void;
}

export function PagosView({
  preselectedVentaId,
  onClearPreselectedVenta,
  onNotify,
  onPaymentRecorded,
  onInspectSale,
}: Props) {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [pendientes, setPendientes] = useState<PendingSale[]>([]);
  const [resumen, setResumen] = useState<{
    recaudado_mes: string;
    pagos_hoy_count: number;
    pagos_hoy_valor: string;
    cartera_pendiente: string;
    ventas_pendientes_count: number;
  } | null>(null);
  const [porMetodo, setPorMetodo] = useState<Array<{ metodo_pago: string; total: string; recibos: number }>>([]);

  const [search, setSearch] = useState('');
  const [metodoFilter, setMetodoFilter] = useState('Todos');
  const [loading, setLoading] = useState(true);

  // Payment Form
  const [selectedSaleId, setSelectedSaleId] = useState<number>(0);
  const [valor, setValor] = useState('');
  const [metodoPago, setMetodoPago] = useState<'Efectivo' | 'Transferencia bancaria' | 'Tarjeta' | 'Otro'>('Transferencia bancaria');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPagos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (metodoFilter !== 'Todos') params.set('metodo', metodoFilter);

      const res = await apiFetch<{
        pagos: Pago[];
        ventas_pendientes: PendingSale[];
        resumen: any;
        por_metodo: Array<{ metodo_pago: string; total: string; recibos: number }>;
      }>(`/api/pagos?${params.toString()}`);

      setPagos(res.pagos);
      setPendientes(res.ventas_pendientes);
      setResumen(res.resumen);
      setPorMetodo(res.por_metodo);

      if (preselectedVentaId && res.ventas_pendientes.some((s) => s.id === preselectedVentaId)) {
        const target = res.ventas_pendientes.find((s) => s.id === preselectedVentaId)!;
        setSelectedSaleId(target.id);
        setValor(String(Math.round(Number(target.saldo_pendiente))));
        onClearPreselectedVenta();
      } else if (res.ventas_pendientes.length > 0) {
        setSelectedSaleId((prev) => {
          if (prev && res.ventas_pendientes.some((s) => s.id === prev)) return prev;
          const first = res.ventas_pendientes[0];
          setValor(String(Math.round(Number(first.saldo_pendiente))));
          return first.id;
        });
      } else {
        setSelectedSaleId(0);
        setValor('');
      }
    } catch (err: any) {
      onNotify('error', err.message || 'Error al cargar módulo de pagos.');
    } finally {
      setLoading(false);
    }
  }, [search, metodoFilter, preselectedVentaId, onClearPreselectedVenta, onNotify]);

  useEffect(() => {
    loadPagos();
  }, [loadPagos]);

  const currentSale = pendientes.find((s) => s.id === selectedSaleId) || null;
  const currentPending = Number(currentSale?.saldo_pendiente || 0);

  function selectSale(sale: PendingSale) {
    setSelectedSaleId(sale.id);
    setValor(String(Math.round(Number(sale.saldo_pendiente))));
  }

  async function handleRegisterPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSaleId) {
      onNotify('error', 'No hay una venta con saldo pendiente seleccionada.');
      return;
    }

    const amount = Number(valor);
    if (Number.isNaN(amount) || amount <= 0) {
      onNotify('error', 'El valor del pago debe ser mayor a cero.');
      return;
    }
    if (amount > currentPending + 0.01) {
      onNotify('error', 'El valor del pago supera el saldo pendiente');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string; warning?: string }>('/api/pagos', {
        method: 'POST',
        body: JSON.stringify({
          venta_id: selectedSaleId,
          valor: amount,
          metodo_pago: metodoPago,
          referencia,
          observaciones,
        }),
      });
      onNotify('success', res.message || 'Pago registrado');
      if (res.warning) onNotify('warning', res.warning);
      setReferencia('');
      setObservaciones('');
      await loadPagos();
      onPaymentRecorded();
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalByAllMethods = porMetodo.reduce((acc, m) => acc + Number(m.total), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Gestión y Registro de Pagos</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Registro de abonos parciales o totales, control de cartera y actualización automática de estados.
        </p>
      </div>

      {/* 4 KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#94A3B8]">Recaudado (Mes Actual)</span>
            <Wallet className="w-4 h-4 text-[#34D399]" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {formatCurrency(resumen?.recaudado_mes, true)}
          </p>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#94A3B8]">Cartera por Cobrar</span>
            <Clock className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <p className="text-2xl font-bold text-[#FBBF24] font-mono tabular-nums mt-2">
            {formatCurrency(resumen?.cartera_pendiente, true)}
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            {resumen?.ventas_pendientes_count || 0} ventas con saldo pendiente
          </p>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#94A3B8]">Pagos Registrados Hoy</span>
            <CheckCircle2 className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {resumen?.pagos_hoy_count || 0}{' '}
            <span className="text-xs font-normal text-[#94A3B8]">transacciones</span>
          </p>
          <p className="text-[11px] text-[#34D399] font-mono mt-1">
            {formatCurrency(resumen?.pagos_hoy_valor, true)} recaudados
          </p>
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#94A3B8]">Histórico de Recibos</span>
            <ShieldCheck className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {pagos.length} <span className="text-xs font-normal text-[#94A3B8]">abonos</span>
          </p>
        </div>
      </div>

      {/* Form + Channel Breakdown & Pending Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Register Payment Form */}
        <div className="lg:col-span-5 bg-[#111A2C] border border-[#1E293B] rounded-xl p-5">
          <h2 className="text-base font-bold text-white mb-4">Registro de Abono a Venta</h2>

          {pendientes.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#34D399] mx-auto" />
              <p className="text-sm font-semibold text-white">Cartera al día</p>
              <p className="text-xs text-[#94A3B8]">
                No existen ventas con saldo pendiente por recaudar en este momento.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRegisterPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  1. Venta Relacionada *
                </label>
                <select
                  value={selectedSaleId}
                  onChange={(e) => {
                    const sale = pendientes.find((s) => s.id === Number(e.target.value));
                    if (sale) selectSale(sale);
                  }}
                  className="w-full px-3 py-2.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                >
                  {pendientes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.numero_venta} — {fullClientName(s.cliente_nombres, s.cliente_apellidos)} (Saldo:{' '}
                      {formatCurrency(s.saldo_pendiente)})
                    </option>
                  ))}
                </select>
              </div>

              {currentSale && (
                <div className="p-3.5 rounded-lg bg-[#0B111E] border border-[#1E293B] space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {fullClientName(currentSale.cliente_nombres, currentSale.cliente_apellidos)}
                    </p>
                    <p className="text-[11px] font-mono text-[#94A3B8]">
                      {currentSale.tipo_documento}: {currentSale.numero_documento}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1E293B] text-center">
                    <div>
                      <p className="text-[10px] text-[#94A3B8]">Total Venta</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5">
                        {formatCurrency(currentSale.total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#94A3B8]">Ya Pagado</p>
                      <p className="text-xs font-mono font-bold text-[#34D399] mt-0.5">
                        {formatCurrency(currentSale.total_pagado)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#94A3B8]">Saldo Pendiente</p>
                      <p className="text-xs font-mono font-bold text-[#FBBF24] mt-0.5">
                        {formatCurrency(currentSale.saldo_pendiente)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#CBD5E1]">
                    2. Valor Recibido *
                  </label>
                  <div className="flex items-center gap-1">
                    {[
                      { label: '25%', mult: 0.25 },
                      { label: '50%', mult: 0.5 },
                      { label: '100% Saldo', mult: 1 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setValor(String(Math.round(currentPending * preset.mult)))}
                        className="px-2 py-0.5 rounded bg-[#0B111E] border border-[#1E293B] hover:border-[#2563EB] text-[11px] text-[#CBD5E1] cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max={currentPending}
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-lg font-mono font-bold text-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  3. Método de Pago *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'Transferencia bancaria', label: 'Transferencia', icon: ArrowLeftRight },
                      { id: 'Efectivo', label: 'Efectivo', icon: Banknote },
                      { id: 'Tarjeta', label: 'Tarjeta', icon: CreditCard },
                      { id: 'Otro', label: 'Otro', icon: Clock },
                    ] as const
                  ).map((m) => {
                    const Icon = m.icon;
                    const active = metodoPago === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMetodoPago(m.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#2563EB] border-[#2563EB] text-white'
                            : 'bg-[#0B111E] border-[#1E293B] text-[#CBD5E1]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    N° Referencia / Comprobante
                  </label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="Ej. TRANSF-09412"
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-xs text-white font-mono focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Observaciones
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Detalle del abono..."
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-xs text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {submitting ? 'Registrando pago...' : 'Confirmar y Aplicar Pago a la Venta'}
              </button>
            </form>
          )}
        </div>

        {/* Right: Payment Channels Breakdown + Pending Sales Quick Queue */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-5">
            <h2 className="text-base font-bold text-white mb-4">Recaudo por Método de Pago</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {porMetodo.length === 0 ? (
                <p className="text-xs text-[#94A3B8]">Sin recaudos registrados aún.</p>
              ) : (
                porMetodo.map((m) => {
                  const pct =
                    totalByAllMethods > 0
                      ? Math.round((Number(m.total) / totalByAllMethods) * 1000) / 10
                      : 0;
                  return (
                    <div
                      key={m.metodo_pago}
                      className="p-3.5 rounded-lg bg-[#0B111E] border border-[#1E293B]"
                    >
                      <p className="text-xs text-[#94A3B8]">{m.metodo_pago}</p>
                      <p className="text-lg font-bold font-mono text-white mt-1">
                        {formatCurrency(m.total, true)}
                      </p>
                      <p className="text-[11px] text-[#60A5FA] mt-1">
                        {pct}% del total · {m.recibos} recibos
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Ventas con Saldo Pendiente</h2>
              <span className="text-xs text-[#FBBF24] font-mono">{pendientes.length} pendientes</span>
            </div>
            <div className="divide-y divide-[#1E293B] max-h-64 overflow-y-auto">
              {pendientes.length === 0 ? (
                <p className="p-6 text-center text-xs text-[#94A3B8]">
                  Todas las ventas han sido canceladas en su totalidad.
                </p>
              ) : (
                pendientes.map((s) => (
                  <div
                    key={s.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#162136] transition-colors text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onInspectSale(s.id)}
                          className="font-mono font-semibold text-[#60A5FA] hover:underline cursor-pointer"
                        >
                          {s.numero_venta}
                        </button>
                        <span className="text-[#64748B]">·</span>
                        <span className="text-white font-medium truncate">
                          {fullClientName(s.cliente_nombres, s.cliente_apellidos)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        Total: {formatCurrency(s.total)} · Pagado: {formatCurrency(s.total_pagado)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-bold text-[#FBBF24]">
                        {formatCurrency(s.saldo_pendiente)}
                      </span>
                      <button
                        type="button"
                        onClick={() => selectSale(s)}
                        className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                      >
                        Abonar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payments History Table */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Historial de Pagos y Recaudos</h2>
            <p className="text-xs text-[#94A3B8]">Registro cronológico de abonos aplicados</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar recibo, venta o cliente..."
                className="pl-8 pr-3 py-1.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <select
              value={metodoFilter}
              onChange={(e) => setMetodoFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-xs text-white focus:outline-none focus:border-[#2563EB]"
            >
              <option value="Todos">Todos los métodos</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia bancaria">Transferencia bancaria</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-[#94A3B8]">
                <th className="py-3 px-4">N° Recibo</th>
                <th className="py-3 px-4">Venta Asociada</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Fecha y Hora</th>
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4 text-right">Valor Recibido</th>
                <th className="py-3 px-4 text-right">Saldo Restante</th>
                <th className="py-3 px-4">Estado Venta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#94A3B8]">
                    Cargando historial de pagos...
                  </td>
                </tr>
              ) : pagos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#94A3B8]">
                    No se encontraron pagos registrados.
                  </td>
                </tr>
              ) : (
                pagos.map((p) => {
                  const badge = getEstadoPagoStyle(p.venta_estado_pago || 'Pendiente');
                  const rest = Math.max(0, Number(p.saldo_restante_en_fecha || 0));
                  return (
                    <tr key={p.id} className="hover:bg-[#162136] transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#60A5FA] whitespace-nowrap">
                        {p.numero_recibo}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          onClick={() => onInspectSale(p.venta_id)}
                          className="font-mono font-semibold text-white hover:text-[#60A5FA] hover:underline cursor-pointer"
                        >
                          {p.numero_venta}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-white">
                          {fullClientName(p.cliente_nombres, p.cliente_apellidos)}
                        </p>
                        <p className="text-[11px] font-mono text-[#64748B]">{p.cliente_documento}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#94A3B8] whitespace-nowrap">
                        {formatDateTime(p.fecha_pago)}
                      </td>
                      <td className="py-3 px-4 text-[#CBD5E1] whitespace-nowrap">{p.metodo_pago}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#34D399] whitespace-nowrap">
                        +{formatCurrency(p.valor)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#CBD5E1] whitespace-nowrap">
                        {formatCurrency(rest)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {p.venta_estado_pago}
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
    </div>
  );
}
