import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  UserPlus,
  Edit2,
  Trash2,
  History,
  X,
  Check,
  Users,
  FileText,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Cliente, Venta } from '../types';
import { formatCurrency, formatDate, fullClientName, getEstadoPagoStyle } from '../lib/format';

interface Props {
  globalSearch: string;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
  onInspectSale: (ventaId: number) => void;
}

const EMPTY_FORM = {
  tipo_documento: 'CC',
  numero_documento: '',
  nombres: '',
  apellidos: '',
  telefono: '',
  email: '',
  direccion: '',
  ciudad: '',
};

export function ClientesView({ globalSearch, onNotify, onInspectSale }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [historyClient, setHistoryClient] = useState<Cliente | null>(null);
  const [historySales, setHistorySales] = useState<Venta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const effectiveSearch = search || globalSearch;

  const loadClientes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (effectiveSearch) params.set('q', effectiveSearch);
      if (tipoFilter !== 'Todos') params.set('tipo', tipoFilter);
      const res = await apiFetch<{ clientes: Cliente[] }>(`/api/clientes?${params.toString()}`);
      setClientes(res.clientes);
    } catch (err: any) {
      onNotify('error', err.message || 'Error al cargar clientes.');
    } finally {
      setLoading(false);
    }
  }, [effectiveSearch, tipoFilter, onNotify]);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  function openNewModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditModal(c: Cliente) {
    setEditingId(c.id);
    setForm({
      tipo_documento: c.tipo_documento,
      numero_documento: c.numero_documento,
      nombres: c.nombres,
      apellidos: c.apellidos || '',
      telefono: c.telefono || '',
      email: c.email || '',
      direccion: c.direccion || '',
      ciudad: c.ciudad || '',
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const res = await apiFetch<{ message: string }>(`/api/clientes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onNotify('success', res.message);
      } else {
        const res = await apiFetch<{ message: string }>('/api/clientes', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('success', res.message);
      }
      setModalOpen(false);
      loadClientes();
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Cliente) {
    try {
      const res = await apiFetch<{ message: string }>(`/api/clientes/${c.id}`, {
        method: 'DELETE',
      });
      onNotify('success', res.message);
      loadClientes();
    } catch (err: any) {
      onNotify('error', err.message);
    }
  }

  async function openHistory(c: Cliente) {
    setHistoryClient(c);
    setHistoryLoading(true);
    try {
      const res = await apiFetch<{ cliente: Cliente; ventas: Venta[] }>(`/api/clientes/${c.id}/ventas`);
      setHistorySales(res.ventas);
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  const totalClientes = clientes.length;
  const conSaldos = clientes.filter((c) => Number(c.saldo_pendiente || 0) > 0).length;
  const totalCartera = clientes.reduce((acc, c) => acc + Math.max(0, Number(c.saldo_pendiente || 0)), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Gestión de Clientes</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Directorio comercial, validación de documentos únicos e historial de compras.
          </p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Clientes Registrados</p>
            <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">{totalClientes}</p>
          </div>
          <Users className="w-5 h-5 text-[#60A5FA]" />
        </div>
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Clientes con Saldo Pendiente</p>
            <p className="text-2xl font-bold text-[#FBBF24] font-mono tabular-nums mt-1">{conSaldos}</p>
          </div>
          <FileText className="w-5 h-5 text-[#F59E0B]" />
        </div>
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Cartera Total por Cobrar</p>
            <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
              {formatCurrency(totalCartera, true)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por documento, nombre, teléfono o correo..."
            className="w-full pl-9 pr-4 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B111E] border border-[#1E293B] rounded-lg overflow-x-auto">
          {['Todos', 'CC', 'NIT', 'CE', 'Pasaporte'].map((tipo) => (
            <button
              key={tipo}
              onClick={() => setTipoFilter(tipo)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tipoFilter === tipo ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {tipo}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-[#94A3B8]">
                <th className="py-3.5 px-4">ID</th>
                <th className="py-3.5 px-4">Documento</th>
                <th className="py-3.5 px-4">Cliente / Razón Social</th>
                <th className="py-3.5 px-4">Contacto</th>
                <th className="py-3.5 px-4">Ciudad / Dirección</th>
                <th className="py-3.5 px-4 text-right">Compras</th>
                <th className="py-3.5 px-4 text-right">Saldo Pendiente</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#94A3B8]">
                    Cargando directorio de clientes...
                  </td>
                </tr>
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#94A3B8]">
                    No se encontraron clientes con los filtros actuales.
                  </td>
                </tr>
              ) : (
                clientes.map((c) => {
                  const saldo = Math.max(0, Number(c.saldo_pendiente || 0));
                  return (
                    <tr key={c.id} className="hover:bg-[#162136] transition-colors">
                      <td className="py-3 px-4 font-mono text-[#64748B]">#{c.id}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono font-semibold text-[#60A5FA]">
                          {c.tipo_documento} {c.numero_documento}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-white">
                          {fullClientName(c.nombres, c.apellidos)}
                        </p>
                        <p className="text-[11px] text-[#64748B]">
                          Registro: {formatDate(c.fecha_registro)}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-[#CBD5E1]">{c.telefono || '—'}</p>
                        <p className="text-[11px] text-[#94A3B8]">{c.email || 'Sin correo'}</p>
                      </td>
                      <td className="py-3 px-4 max-w-[200px] truncate text-[#94A3B8]">
                        {c.direccion || '—'} {c.ciudad ? `· ${c.ciudad}` : ''}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-white whitespace-nowrap">
                        <div>{formatCurrency(c.monto_comprado)}</div>
                        <div className="text-[11px] text-[#94A3B8]">{c.total_ventas || 0} órdenes</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className={saldo > 0 ? 'text-[#FBBF24] font-semibold' : 'text-[#34D399]'}>
                          {formatCurrency(saldo)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => openHistory(c)}
                            title="Historial de compras"
                            className="p-1.5 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-[#60A5FA] cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditModal(c)}
                            title="Editar cliente"
                            className="p-1.5 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-[#CBD5E1] cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            title="Eliminar cliente"
                            className="p-1.5 rounded-lg bg-[#0B111E] hover:bg-[#DC2626]/20 border border-[#1E293B] text-[#F87171] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#111A2C] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1E293B] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#2563EB]/20 border border-[#2563EB]/40 flex items-center justify-center text-[#60A5FA]">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {editingId ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
                  </h2>
                  <p className="text-xs text-[#60A5FA]">Directorio Comercial · VentaSmart</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div>
                <p className="text-xs font-semibold text-[#60A5FA] mb-3">
                  1. Datos de Identificación
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Tipo de Documento *
                    </label>
                    <select
                      value={form.tipo_documento}
                      onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="CC">Cédula de Ciudadanía (CC)</option>
                      <option value="NIT">NIT (Persona Jurídica)</option>
                      <option value="CE">Cédula de Extranjería (CE)</option>
                      <option value="TI">Tarjeta de Identidad (TI)</option>
                      <option value="Pasaporte">Pasaporte</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Número de Documento *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.numero_documento}
                      onChange={(e) => setForm({ ...form, numero_documento: e.target.value })}
                      placeholder="Ej. 901432890-1"
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Nombres o Razón Social *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.nombres}
                      onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                      placeholder="Ej. Soluciones Logísticas Andinas S.A.S."
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Apellidos / Sucursal
                    </label>
                    <input
                      type="text"
                      value={form.apellidos}
                      onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
                      placeholder="Opcional para empresas"
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#60A5FA] mb-3">
                  2. Canales de Contacto y Ubicación
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="facturacion@empresa.com"
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Teléfono / Celular
                    </label>
                    <input
                      type="text"
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      placeholder="+57 310 458 9210"
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Dirección Comercial
                    </label>
                    <input
                      type="text"
                      value={form.direccion}
                      onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                      placeholder="Calle 100 # 19A - 45 Of. 502"
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={form.ciudad}
                      onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                      placeholder="Bogotá D.C."
                      className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#1E293B] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-sm font-medium text-[#CBD5E1] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-sm font-semibold text-white cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : 'Guardar Cliente'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Purchase History Modal */}
      {historyClient && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#111A2C] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1E293B] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  Historial de Compras · {fullClientName(historyClient.nombres, historyClient.apellidos)}
                </h2>
                <p className="text-xs text-[#94A3B8] font-mono">
                  {historyClient.tipo_documento} {historyClient.numero_documento}
                </p>
              </div>
              <button
                onClick={() => setHistoryClient(null)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {historyLoading ? (
                <p className="text-center text-sm text-[#94A3B8] py-8">Cargando historial...</p>
              ) : historySales.length === 0 ? (
                <p className="text-center text-sm text-[#94A3B8] py-8">
                  Este cliente aún no registra compras.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[#94A3B8]">
                      <th className="py-2.5 px-3">Venta</th>
                      <th className="py-2.5 px-3">Fecha</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Pagado</th>
                      <th className="py-2.5 px-3 text-right">Saldo</th>
                      <th className="py-2.5 px-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {historySales.map((s) => {
                      const badge = getEstadoPagoStyle(s.estado_pago);
                      return (
                        <tr
                          key={s.id}
                          onClick={() => {
                            setHistoryClient(null);
                            onInspectSale(s.id);
                          }}
                          className="hover:bg-[#162136] cursor-pointer"
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#60A5FA]">
                            {s.numero_venta}
                          </td>
                          <td className="py-2.5 px-3 text-[#94A3B8]">{formatDate(s.fecha_venta)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-white">
                            {formatCurrency(s.total)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#34D399]">
                            {formatCurrency(s.total_pagado)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#FBBF24]">
                            {formatCurrency(s.saldo_pendiente)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {s.estado_pago}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
