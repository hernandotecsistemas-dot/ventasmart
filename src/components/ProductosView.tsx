import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Edit2,
  SlidersHorizontal,
  Package,
  AlertTriangle,
  XCircle,
  Boxes,
  X,
  Check,
  Download,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Producto } from '../types';
import { formatCurrency } from '../lib/format';
import { PRODUCT_IMAGE_MAP, PRODUCT_IMAGE_OPTIONS } from '../lib/productImages';

interface Props {
  globalSearch: string;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
  onInventoryChanged: () => void;
}

const EMPTY_PRODUCT_FORM = {
  codigo: '',
  nombre: '',
  descripcion: '',
  categoria: 'Equipos POS',
  precio_compra: '',
  precio_venta: '',
  stock: '0',
  stock_minimo: '5',
  ubicacion: 'Bodega Principal',
  imagen_key: '',
  activo: true,
};

export function ProductosView({ globalSearch, onNotify, onInventoryChanged }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('Todas');
  const [stockFilter, setStockFilter] = useState<'all' | 'disponible' | 'bajo' | 'agotado'>('all');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_PRODUCT_FORM);
  const [saving, setSaving] = useState(false);

  const [stockModalProd, setStockModalProd] = useState<Producto | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState('10');

  const effectiveSearch = search || globalSearch;

  const loadProductos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('incluir_inactivos', 'true');
      if (effectiveSearch) params.set('q', effectiveSearch);
      if (catFilter !== 'Todas') params.set('categoria', catFilter);
      if (stockFilter !== 'all') params.set('stock_filter', stockFilter);

      const res = await apiFetch<{ productos: Producto[]; categorias: string[] }>(
        `/api/productos?${params.toString()}`
      );
      setProductos(res.productos);
      setCategorias(res.categorias);
    } catch (err: any) {
      onNotify('error', err.message || 'Error al cargar productos.');
    } finally {
      setLoading(false);
    }
  }, [effectiveSearch, catFilter, stockFilter, onNotify]);

  useEffect(() => {
    loadProductos();
  }, [loadProductos]);

  function openNewModal() {
    setEditingId(null);
    setForm(EMPTY_PRODUCT_FORM);
    setModalOpen(true);
  }

  function openEditModal(p: Producto) {
    setEditingId(p.id);
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      categoria: p.categoria || 'General',
      precio_compra: p.precio_compra !== null ? String(Number(p.precio_compra)) : '',
      precio_venta: String(Number(p.precio_venta)),
      stock: String(p.stock),
      stock_minimo: String(p.stock_minimo),
      ubicacion: p.ubicacion || 'Bodega Principal',
      imagen_key: p.imagen_key || '',
      activo: p.activo,
    });
    setModalOpen(true);
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        precio_compra: form.precio_compra === '' ? null : Number(form.precio_compra),
        precio_venta: Number(form.precio_venta),
        stock: parseInt(form.stock, 10),
        stock_minimo: parseInt(form.stock_minimo, 10),
      };

      if (editingId) {
        const res = await apiFetch<{ message: string; warning?: string }>(`/api/productos/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotify('success', res.message);
        if (res.warning) onNotify('warning', res.warning);
      } else {
        const res = await apiFetch<{ message: string; warning?: string }>('/api/productos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('success', res.message);
        if (res.warning) onNotify('warning', res.warning);
      }
      setModalOpen(false);
      loadProductos();
      onInventoryChanged();
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyStockAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!stockModalProd) return;
    const delta = parseInt(stockAdjustment, 10);
    if (Number.isNaN(delta) || delta === 0) {
      onNotify('error', 'Ingrese una cantidad de ajuste distinta de cero.');
      return;
    }

    try {
      const res = await apiFetch<{ message: string; warning?: string }>(
        `/api/productos/${stockModalProd.id}/stock`,
        {
          method: 'PATCH',
          body: JSON.stringify({ ajuste: delta }),
        }
      );
      onNotify('success', res.message);
      if (res.warning) onNotify('warning', res.warning);
      setStockModalProd(null);
      loadProductos();
      onInventoryChanged();
    } catch (err: any) {
      onNotify('error', err.message);
    }
  }

  function exportCatalogCsv() {
    const header = 'Codigo,Nombre,Categoria,Precio Compra,Precio Venta,Stock,Stock Minimo,Estado\n';
    const body = productos
      .map(
        (p) =>
          `"${p.codigo}","${p.nombre}","${p.categoria}",${p.precio_compra || 0},${p.precio_venta},${p.stock},${p.stock_minimo},"${p.activo ? 'Activo' : 'Inactivo'}"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ventasmart_catalogo_productos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalProductos = productos.length;
  const valoracionTotal = productos.reduce((sum, p) => sum + Number(p.precio_venta) * p.stock, 0);
  const bajosCount = productos.filter((p) => p.stock > 0 && p.stock <= p.stock_minimo).length;
  const agotadosCount = productos.filter((p) => p.stock === 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Inventario de Productos y Catálogo
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Control de existencias, precios de venta, categorías y alertas de stock mínimo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={exportCatalogCsv}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#111A2C] hover:bg-[#162136] border border-[#1E293B] text-[#CBD5E1] text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
          <button
            onClick={openNewModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Total de Productos</p>
            <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
              {totalProductos} <span className="text-xs font-normal text-[#94A3B8]">referencias</span>
            </p>
          </div>
          <Boxes className="w-5 h-5 text-[#60A5FA]" />
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Valoración Total Stock</p>
            <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
              {formatCurrency(valoracionTotal, true)}
            </p>
          </div>
          <Package className="w-5 h-5 text-[#34D399]" />
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Inventario Bajo / Riesgo</p>
            <p className="text-2xl font-bold text-[#FBBF24] font-mono tabular-nums mt-1">
              {bajosCount} <span className="text-xs font-normal text-[#94A3B8]">ítems</span>
            </p>
          </div>
          <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
        </div>

        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94A3B8]">Agotados Críticos</p>
            <p className="text-2xl font-bold text-[#F87171] font-mono tabular-nums mt-1">
              {agotadosCount} <span className="text-xs font-normal text-[#94A3B8]">ítems</span>
            </p>
          </div>
          <XCircle className="w-5 h-5 text-[#DC2626]" />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código SKU o nombre de producto..."
              className="w-full pl-9 pr-4 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
          >
            <option value="Todas">Todas las Categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center p-1 bg-[#0B111E] border border-[#1E293B] rounded-lg overflow-x-auto">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'disponible', label: 'En Stock' },
              { id: 'bajo', label: 'Stock Bajo' },
              { id: 'agotado', label: 'Agotados' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStockFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                stockFilter === tab.id ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-[#94A3B8]">
                <th className="py-3.5 px-4">Código / SKU</th>
                <th className="py-3.5 px-4">Producto y Especificaciones</th>
                <th className="py-3.5 px-4">Categoría</th>
                <th className="py-3.5 px-4 text-right">Precio Compra / Venta</th>
                <th className="py-3.5 px-4 text-right">Existencias</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#94A3B8]">
                    Cargando catálogo de productos...
                  </td>
                </tr>
              ) : productos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#94A3B8]">
                    No se encontraron productos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                productos.map((p) => {
                  const thumb = p.imagen_key ? PRODUCT_IMAGE_MAP[p.imagen_key] : null;
                  const isOut = p.stock === 0;
                  const isLow = p.stock > 0 && p.stock <= p.stock_minimo;

                  return (
                    <tr key={p.id} className="hover:bg-[#162136] transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#60A5FA] whitespace-nowrap">
                        {p.codigo}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={p.nombre}
                              referrerPolicy="no-referrer"
                              className="w-11 h-9 rounded-lg object-cover border border-[#1E293B] shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-9 rounded-lg bg-[#0B111E] border border-[#1E293B] flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-[#64748B]" />
                            </div>
                          )}
                          <div className="min-w-0 max-w-xs">
                            <p className="font-semibold text-white truncate">{p.nombre}</p>
                            <p className="text-[11px] text-[#94A3B8] truncate">
                              {p.descripcion || p.ubicacion}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#CBD5E1] whitespace-nowrap">{p.categoria}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <p className="font-semibold text-white">{formatCurrency(p.precio_venta)}</p>
                        {p.precio_compra && (
                          <p className="text-[11px] text-[#64748B]">
                            Costo: {formatCurrency(p.precio_compra)}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <p
                          className={`text-sm font-bold ${
                            isOut ? 'text-[#F87171]' : isLow ? 'text-[#FBBF24]' : 'text-white'
                          }`}
                        >
                          {p.stock} uds
                        </p>
                        <p className="text-[11px] text-[#64748B]">Mín: {p.stock_minimo}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {!p.activo ? (
                          <span className="px-2 py-0.5 rounded border border-[#334155] bg-[#1E293B]/60 text-[#94A3B8] text-[11px]">
                            Inactivo
                          </span>
                        ) : isOut ? (
                          <span className="px-2 py-0.5 rounded border border-[#DC2626]/35 bg-[#DC2626]/12 text-[#F87171] text-[11px]">
                            Agotado
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-0.5 rounded border border-[#F59E0B]/35 bg-[#F59E0B]/12 text-[#FBBF24] text-[11px]">
                            Stock Bajo
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded border border-[#16A36A]/35 bg-[#16A36A]/12 text-[#34D399] text-[11px]">
                            Disponible
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setStockModalProd(p);
                              setStockAdjustment('10');
                            }}
                            title="Ajustar existencias"
                            className="px-2.5 py-1.5 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-[#60A5FA] text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Stock</span>
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            title="Editar producto"
                            className="p-1.5 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-[#CBD5E1] cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
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

      {/* Create / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#111A2C] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1E293B] flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                {editingId ? 'Editar Producto' : 'Registrar Nuevo Producto'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Código del Producto (SKU) *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder="Ej. SKU-9010"
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Categoría *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    placeholder="Equipos POS, Cómputo, Periféricos..."
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Nombre del Producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej. Terminal Táctil POS 15.6"
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Descripción / Especificaciones
                  </label>
                  <textarea
                    rows={2}
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    placeholder="Detalles técnicos del producto..."
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Precio de Compra (Opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.precio_compra}
                    onChange={(e) => setForm({ ...form, precio_compra: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Precio de Venta *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.precio_venta}
                    onChange={(e) => setForm({ ...form, precio_venta: e.target.value })}
                    placeholder="340000"
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Cantidad Disponible (Stock) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Stock Mínimo *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={form.stock_minimo}
                    onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Ubicación en Bodega
                  </label>
                  <input
                    type="text"
                    value={form.ubicacion}
                    onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Imagen de Catálogo
                  </label>
                  <select
                    value={form.imagen_key}
                    onChange={(e) => setForm({ ...form, imagen_key: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  >
                    {PRODUCT_IMAGE_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                  <input
                    id="prod-activo"
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                    className="w-4 h-4 rounded border-[#1E293B] bg-[#0B111E] accent-[#2563EB]"
                  />
                  <label htmlFor="prod-activo" className="text-xs text-[#CBD5E1]">
                    Producto activo y disponible para la venta en POS
                  </label>
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
                  <span>{saving ? 'Guardando...' : 'Guardar Producto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {stockModalProd && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111A2C] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1E293B] flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Ajustar Inventario</h2>
              <button
                onClick={() => setStockModalProd(null)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyStockAdjustment} className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-[#0B111E] border border-[#1E293B]">
                <p className="text-xs font-mono text-[#60A5FA]">{stockModalProd.codigo}</p>
                <p className="text-sm font-semibold text-white mt-0.5">{stockModalProd.nombre}</p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Existencias actuales:{' '}
                  <span className="font-mono font-bold text-white">{stockModalProd.stock} uds</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Cantidad de Ajuste (positivo para entrada, negativo para salida)
                </label>
                <input
                  type="number"
                  required
                  value={stockAdjustment}
                  onChange={(e) => setStockAdjustment(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono focus:outline-none focus:border-[#2563EB]"
                />
                <p className="text-[11px] text-[#94A3B8] mt-1.5">
                  Nuevo stock proyectado:{' '}
                  <span className="font-mono font-semibold text-white">
                    {stockModalProd.stock + (parseInt(stockAdjustment, 10) || 0)} uds
                  </span>
                </p>
              </div>

              <div className="pt-3 border-t border-[#1E293B] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStockModalProd(null)}
                  className="px-4 py-2 rounded-lg bg-[#0B111E] border border-[#1E293B] text-xs font-medium text-[#CBD5E1] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-semibold text-white cursor-pointer"
                >
                  Aplicar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
