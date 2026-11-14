import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  UserPlus,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  Package,
  Barcode,
  Download,
  Eye,
  X,
} from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile } from '../lib/api';
import { Cliente, Configuracion, Producto, Venta } from '../types';
import { formatCurrency, fullClientName } from '../lib/format';
import { PRODUCT_IMAGE_MAP } from '../lib/productImages';

interface CartItem {
  producto: Producto;
  cantidad: number;
}

interface Props {
  config: Configuracion | null;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
  onSaleCompleted: () => void;
  onInspectSale: (ventaId: number) => void;
}

export function PosView({ config, onNotify, onSaleCompleted, onInspectSale }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [descuentoGlobal, setDescuentoGlobal] = useState<string>('0');
  const [taxPct, setTaxPct] = useState<string>(String(Number(config?.porcentaje_impuesto_default ?? 19)));
  const [metodoPago, setMetodoPago] = useState<'Efectivo' | 'Transferencia bancaria' | 'Tarjeta' | 'Otro'>('Efectivo');
  const [montoRecibido, setMontoRecibido] = useState<string>('');
  const [autoFullPayment, setAutoFullPayment] = useState(true);
  const [observaciones, setObservaciones] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // Quick New Client Modal inside POS
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState({
    tipo_documento: 'CC',
    numero_documento: '',
    nombres: '',
    apellidos: '',
    telefono: '',
    email: '',
  });

  // Post-Sale Modal
  const [completedSale, setCompletedSale] = useState<Venta | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadPosData = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        apiFetch<{ clientes: Cliente[] }>('/api/clientes'),
        apiFetch<{ productos: Producto[]; categorias: string[] }>('/api/productos'),
      ]);
      setClientes(cRes.clientes);
      setProductos(pRes.productos);
      setCategorias(pRes.categorias);
      setSelectedClientId((prev) => {
        if (prev && cRes.clientes.some((c) => c.id === prev)) return prev;
        return cRes.clientes[0]?.id || 0;
      });
    } catch (err: any) {
      onNotify('error', err.message || 'No se pudieron cargar los datos del POS.');
    }
  }, [onNotify]);

  useEffect(() => {
    loadPosData();
  }, [loadPosData]);

  useEffect(() => {
    if (config?.porcentaje_impuesto_default !== undefined) {
      setTaxPct(String(Number(config.porcentaje_impuesto_default)));
    }
  }, [config?.porcentaje_impuesto_default]);

  // Calculations (preview only; server re-calculates & enforces authoritatively)
  const subtotalBruto = cart.reduce(
    (sum, item) => sum + Number(item.producto.precio_venta) * item.cantidad,
    0
  );
  const descuentoVal = Math.min(subtotalBruto, Math.max(0, Number(descuentoGlobal) || 0));
  const baseImponible = Math.max(0, subtotalBruto - descuentoVal);
  const taxRate = Math.max(0, Math.min(100, Number(taxPct) || 0));
  const valorImpuesto = Math.round(baseImponible * (taxRate / 100) * 100) / 100;
  const totalNeto = Math.round((baseImponible + valorImpuesto) * 100) / 100;

  useEffect(() => {
    if (autoFullPayment) {
      setMontoRecibido(totalNeto > 0 ? String(Math.round(totalNeto)) : '0');
    }
  }, [totalNeto, autoFullPayment]);

  const receivedVal = Math.max(0, Number(montoRecibido) || 0);
  const pagoInicialAplicado = Math.min(totalNeto, receivedVal);
  const cambioVueltos = Math.max(0, receivedVal - totalNeto);
  const saldoPendiente = Math.max(0, totalNeto - pagoInicialAplicado);

  const addToCart = useCallback(
    (prod: Producto) => {
      if (prod.stock <= 0) {
        onNotify('error', 'No hay existencias suficientes');
        return;
      }
      setCart((prev) => {
        const existing = prev.find((i) => i.producto.id === prod.id);
        if (existing) {
          if (existing.cantidad >= prod.stock) {
            onNotify('error', `No hay existencias suficientes para "${prod.nombre}" (máx ${prod.stock}).`);
            return prev;
          }
          return prev.map((i) =>
            i.producto.id === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i
          );
        }
        return [...prev, { producto: prod, cantidad: 1 }];
      });
    },
    [onNotify]
  );

  function updateQuantity(prodId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.producto.id !== prodId) return item;
          const nextQty = item.cantidad + delta;
          if (nextQty <= 0) return null;
          if (nextQty > item.producto.stock) {
            onNotify('error', 'No hay existencias suficientes');
            return item;
          }
          return { ...item, cantidad: nextQty };
        })
        .filter(Boolean) as CartItem[]
    );
  }

  function removeFromCart(prodId: number) {
    setCart((prev) => prev.filter((i) => i.producto.id !== prodId));
  }

  const handleCheckout = useCallback(async () => {
    if (submitting) return;
    if (!selectedClientId) {
      onNotify('error', 'Debe seleccionar un cliente antes de registrar la venta.');
      return;
    }
    if (cart.length === 0) {
      onNotify('error', 'Agregue al menos un producto al carrito.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        venta: Venta;
        message: string;
        warnings?: string[];
      }>('/api/ventas', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: selectedClientId,
          items: cart.map((i) => ({
            producto_id: i.producto.id,
            cantidad: i.cantidad,
          })),
          descuento_global: descuentoVal,
          porcentaje_impuesto: taxRate,
          pago_inicial: pagoInicialAplicado,
          metodo_pago: metodoPago,
          observaciones,
          idempotency_key: idempotencyKey,
        }),
      });

      onNotify('success', res.message || 'Venta registrada exitosamente');
      if (res.warnings) {
        res.warnings.forEach((w) => onNotify('warning', w));
      }

      setCompletedSale(res.venta);
      setCart([]);
      setDescuentoGlobal('0');
      setObservaciones('');
      setAutoFullPayment(true);
      setIdempotencyKey(crypto.randomUUID());
      await loadPosData();
      onSaleCompleted();
    } catch (err: any) {
      onNotify('error', err.message || 'No se pudo registrar la venta');
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    selectedClientId,
    cart,
    descuentoVal,
    taxRate,
    pagoInicialAplicado,
    metodoPago,
    observaciones,
    idempotencyKey,
    onNotify,
    loadPosData,
    onSaleCompleted,
  ]);

  // Keyboard shortcuts F2 (scan/search) and F9 (checkout)
  useEffect(() => {
    function handleKeys(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleCheckout();
      }
    }
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [handleCheckout]);

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const exactMatch = productos.find(
      (p) => p.codigo.toLowerCase() === q || p.nombre.toLowerCase() === q
    );
    if (exactMatch) {
      addToCart(exactMatch);
      setSearchQuery('');
    }
  }

  async function handleQuickClientSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ cliente: Cliente; message: string }>('/api/clientes', {
        method: 'POST',
        body: JSON.stringify(quickClientForm),
      });
      onNotify('success', res.message);
      setClientes((prev) => [res.cliente, ...prev]);
      setSelectedClientId(res.cliente.id);
      setQuickClientOpen(false);
      setQuickClientForm({
        tipo_documento: 'CC',
        numero_documento: '',
        nombres: '',
        apellidos: '',
        telefono: '',
        email: '',
      });
    } catch (err: any) {
      onNotify('error', err.message);
    }
  }

  const filteredProducts = productos.filter((p) => {
    const matchesCat = selectedCategory === 'Todos' || p.categoria === selectedCategory;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.codigo.toLowerCase().includes(q) ||
      p.nombre.toLowerCase().includes(q) ||
      p.descripcion.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Terminal POS Express</h1>
          <p className="text-xs text-[#94A3B8]">
            Cálculo validado en servidor y descuento automático de inventario en PostgreSQL.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-[#94A3B8]">
          <span className="px-2.5 py-1 rounded-md bg-[#111A2C] border border-[#1E293B] font-mono">
            F2 Buscar/Escanear
          </span>
          <span className="px-2.5 py-1 rounded-md bg-[#111A2C] border border-[#1E293B] font-mono">
            F9 Finalizar Venta
          </span>
        </div>
      </div>

      {/* Main 2-Column POS Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left Catalog & Client Section */}
        <div className="xl:col-span-7 2xl:col-span-8 space-y-4">
          {/* Client Selection */}
          <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
            <label className="block text-xs font-medium text-[#94A3B8] mb-2">
              Cliente Asignado a la Operación
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(Number(e.target.value))}
                className="flex-1 px-3.5 py-2.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white focus:outline-none focus:border-[#2563EB]"
              >
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullClientName(c.nombres, c.apellidos)} ({c.tipo_documento}: {c.numero_documento})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setQuickClientOpen(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#162136] hover:bg-[#1E293B] border border-[#1E293B] rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4 text-[#60A5FA]" />
                <span>Nuevo Cliente</span>
              </button>
            </div>
          </div>

          {/* Product Search + Categories */}
          <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 space-y-3">
            <form onSubmit={handleBarcodeSubmit} className="relative">
              <Barcode className="w-4 h-4 text-[#60A5FA] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Escanear código SKU o buscar producto por nombre..."
                className="w-full pl-10 pr-10 py-2.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
              />
              <Search className="w-4 h-4 text-[#64748B] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </form>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {['Todos', ...categorias].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-[#0B111E] text-[#94A3B8] hover:text-white border border-[#1E293B]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredProducts.length === 0 ? (
              <div className="sm:col-span-2 lg:col-span-3 bg-[#111A2C] border border-[#1E293B] rounded-xl p-10 text-center text-sm text-[#94A3B8]">
                No hay productos que coincidan con tu búsqueda.
              </div>
            ) : (
              filteredProducts.map((prod) => {
                const thumb = prod.imagen_key ? PRODUCT_IMAGE_MAP[prod.imagen_key] : null;
                const outOfStock = prod.stock <= 0;
                const lowStock = prod.stock > 0 && prod.stock <= prod.stock_minimo;
                const inCartQty = cart.find((i) => i.producto.id === prod.id)?.cantidad || 0;

                return (
                  <div
                    key={prod.id}
                    className={`bg-[#111A2C] border rounded-xl p-3.5 flex flex-col justify-between transition-colors ${
                      inCartQty > 0
                        ? 'border-[#2563EB]'
                        : 'border-[#1E293B] hover:border-[#334155]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono mb-2.5">
                        <span className="text-[#60A5FA] font-semibold">{prod.codigo}</span>
                        <span
                          className={
                            outOfStock
                              ? 'text-[#F87171]'
                              : lowStock
                                ? 'text-[#FBBF24]'
                                : 'text-[#94A3B8]'
                          }
                        >
                          {outOfStock ? 'Agotado' : `${prod.stock} uds`}
                        </span>
                      </div>

                      {thumb ? (
                        <div className="h-28 w-full rounded-lg overflow-hidden bg-[#0B111E] border border-[#1E293B] mb-3">
                          <img
                            src={thumb}
                            alt={prod.nombre}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-28 w-full rounded-lg bg-[#0B111E] border border-[#1E293B] flex items-center justify-center mb-3">
                          <Package className="w-8 h-8 text-[#475569]" />
                        </div>
                      )}

                      <h3 className="text-sm font-semibold text-white leading-snug line-clamp-1">
                        {prod.nombre}
                      </h3>
                      <p className="text-xs text-[#94A3B8] mt-1 line-clamp-2 min-h-[32px]">
                        {prod.descripcion || prod.categoria}
                      </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-[#1E293B] flex items-center justify-between gap-2">
                      <span className="text-base font-bold text-white font-mono tabular-nums">
                        {formatCurrency(prod.precio_venta)}
                      </span>
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => addToCart(prod)}
                        className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#1E293B] disabled:text-[#64748B] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {outOfStock ? 'Sin stock' : inCartQty > 0 ? `+ Agregar (${inCartQty})` : '+ Agregar'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Checkout Cart Panel */}
        <div className="xl:col-span-5 2xl:col-span-4 bg-[#111A2C] border border-[#1E293B] rounded-xl overflow-hidden sticky top-20">
          <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Resumen de Venta</h2>
              <p className="text-xs text-[#94A3B8]">
                {cart.reduce((sum, i) => sum + i.cantidad, 0)} ítems seleccionados
              </p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-[#F87171] hover:underline cursor-pointer"
              >
                Vaciar carrito
              </button>
            )}
          </div>

          {/* Cart Items */}
          <div className="p-4 max-h-64 overflow-y-auto divide-y divide-[#1E293B]">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#94A3B8]">
                Selecciona productos del catálogo para iniciar la venta.
              </div>
            ) : (
              cart.map((item) => {
                const lineTotal = Number(item.producto.precio_venta) * item.cantidad;
                return (
                  <div key={item.producto.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {item.producto.nombre}
                      </p>
                      <p className="text-[11px] font-mono text-[#94A3B8]">
                        {formatCurrency(item.producto.precio_venta)} c/u
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[#0B111E] border border-[#1E293B] rounded-lg px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.producto.id, -1)}
                        className="p-0.5 text-[#94A3B8] hover:text-white cursor-pointer"
                        aria-label="Disminuir cantidad"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-mono font-bold text-white">
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.producto.id, 1)}
                        className="p-0.5 text-[#94A3B8] hover:text-white cursor-pointer"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right min-w-[78px]">
                      <p className="text-xs font-mono font-semibold text-white">
                        {formatCurrency(lineTotal)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.producto.id)}
                      className="p-1 text-[#64748B] hover:text-[#F87171] cursor-pointer"
                      aria-label="Eliminar ítem"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Financial Breakdown */}
          <div className="px-5 py-4 bg-[#0B111E]/70 border-y border-[#1E293B] space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-[#CBD5E1]">
              <span>Subtotal Bruto</span>
              <span className="font-mono tabular-nums font-medium">
                {formatCurrency(subtotalBruto, true)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="pos-discount" className="text-[#CBD5E1]">
                Descuento ($)
              </label>
              <input
                id="pos-discount"
                type="number"
                min="0"
                max={subtotalBruto}
                value={descuentoGlobal}
                onChange={(e) => setDescuentoGlobal(e.target.value)}
                className="w-28 px-2.5 py-1 bg-[#111A2C] border border-[#1E293B] rounded text-right font-mono text-white focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div className="flex items-center justify-between text-[#94A3B8]">
              <span>Base Imponible</span>
              <span className="font-mono tabular-nums">{formatCurrency(baseImponible, true)}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <label htmlFor="pos-tax" className="text-[#CBD5E1]">
                  Impuesto (%)
                </label>
                <input
                  id="pos-tax"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                  className="w-16 px-2 py-1 bg-[#111A2C] border border-[#1E293B] rounded text-right font-mono text-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <span className="font-mono tabular-nums text-[#CBD5E1]">
                +{formatCurrency(valorImpuesto, true)}
              </span>
            </div>

            <div className="pt-2.5 border-t border-[#1E293B] flex items-baseline justify-between">
              <span className="text-xs font-bold text-[#60A5FA]">TOTAL NETO A PAGAR</span>
              <span className="text-2xl font-bold text-white font-mono tabular-nums">
                {formatCurrency(totalNeto, true)}
              </span>
            </div>
          </div>

          {/* Payment Controls */}
          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs font-medium text-[#94A3B8] mb-2">Método de Pago Inicial</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-2">
                {(
                  [
                    { id: 'Efectivo', label: 'Efectivo', icon: Banknote },
                    { id: 'Tarjeta', label: 'Tarjeta', icon: CreditCard },
                    { id: 'Transferencia bancaria', label: 'Transferencia', icon: ArrowLeftRight },
                    { id: 'Otro', label: 'Otro / Mixto', icon: Clock },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = metodoPago === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMetodoPago(m.id)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#2563EB] border-[#2563EB] text-white'
                          : 'bg-[#0B111E] border-[#1E293B] text-[#CBD5E1] hover:border-[#334155]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#94A3B8]">
                  Monto Recibido / Abono Inicial
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoFullPayment(false);
                      setMontoRecibido('0');
                    }}
                    className="px-2 py-0.5 text-[11px] rounded bg-[#0B111E] border border-[#1E293B] text-[#94A3B8] hover:text-white cursor-pointer"
                  >
                    Crédito ($0)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoFullPayment(false);
                      setMontoRecibido(String(Math.round(totalNeto * 0.5)));
                    }}
                    className="px-2 py-0.5 text-[11px] rounded bg-[#0B111E] border border-[#1E293B] text-[#94A3B8] hover:text-white cursor-pointer"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoFullPayment(true)}
                    className="px-2 py-0.5 text-[11px] rounded bg-[#2563EB]/20 border border-[#2563EB]/40 text-[#60A5FA] cursor-pointer"
                  >
                    100%
                  </button>
                </div>
              </div>
              <input
                type="number"
                min="0"
                value={montoRecibido}
                onChange={(e) => {
                  setAutoFullPayment(false);
                  setMontoRecibido(e.target.value);
                }}
                className="w-full px-3.5 py-2.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-base font-mono font-bold text-white focus:outline-none focus:border-[#2563EB]"
              />
              <div className="flex items-center justify-between text-xs mt-2">
                {cambioVueltos > 0 ? (
                  <>
                    <span className="text-[#94A3B8]">Cambio / Vueltos:</span>
                    <span className="font-mono font-bold text-[#34D399]">
                      {formatCurrency(cambioVueltos, true)}
                    </span>
                  </>
                ) : saldoPendiente > 0 ? (
                  <>
                    <span className="text-[#FBBF24]">Saldo Pendiente por Cobrar:</span>
                    <span className="font-mono font-bold text-[#FBBF24]">
                      {formatCurrency(saldoPendiente, true)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[#94A3B8]">Estado proyectado:</span>
                    <span className="font-semibold text-[#34D399]">Pagada al 100%</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={submitting || cart.length === 0}
              onClick={handleCheckout}
              className="w-full py-3 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#1E293B] disabled:text-[#64748B] text-white font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#2563EB]/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Procesando Transacción...' : 'Finalizar Venta y Comprobante (F9)'}</span>
            </button>

            <p className="text-[11px] text-[#64748B] text-center leading-tight">
              Documento interno de soporte comercial · No es factura electrónica validada por la DIAN.
            </p>
          </div>
        </div>
      </div>

      {/* Quick New Client Modal */}
      {quickClientOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111A2C] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Registro Rápido de Cliente</h2>
              <button
                onClick={() => setQuickClientOpen(false)}
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickClientSave} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#CBD5E1] mb-1">Tipo Doc *</label>
                  <select
                    value={quickClientForm.tipo_documento}
                    onChange={(e) => setQuickClientForm({ ...quickClientForm, tipo_documento: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white"
                  >
                    <option value="CC">CC</option>
                    <option value="NIT">NIT</option>
                    <option value="CE">CE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#CBD5E1] mb-1">N° Documento *</label>
                  <input
                    type="text"
                    required
                    value={quickClientForm.numero_documento}
                    onChange={(e) => setQuickClientForm({ ...quickClientForm, numero_documento: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#CBD5E1] mb-1">Nombres / Razón Social *</label>
                <input
                  type="text"
                  required
                  value={quickClientForm.nombres}
                  onChange={(e) => setQuickClientForm({ ...quickClientForm, nombres: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#CBD5E1] mb-1">Apellidos</label>
                  <input
                    type="text"
                    value={quickClientForm.apellidos}
                    onChange={(e) => setQuickClientForm({ ...quickClientForm, apellidos: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#CBD5E1] mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={quickClientForm.telefono}
                    onChange={(e) => setQuickClientForm({ ...quickClientForm, telefono: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickClientOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#0B111E] border border-[#1E293B] text-xs text-[#CBD5E1] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#2563EB] text-xs font-semibold text-white cursor-pointer"
                >
                  Guardar y Seleccionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Confirmation Modal */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111A2C] border border-[#1E293B] rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#16A36A]/20 border border-[#16A36A]/40 text-[#34D399] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Venta Registrada Exitosamente</h2>
              <p className="text-sm font-mono font-semibold text-[#60A5FA] mt-1">
                {completedSale.numero_venta}
              </p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
                {formatCurrency(completedSale.total, true)}
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">
                Estado: <span className="text-white font-semibold">{completedSale.estado_pago}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadAuthenticatedFile(
                      `/api/facturas/${completedSale.id}/pdf`,
                      `${completedSale.numero_venta}.pdf`
                    );
                    onNotify('success', 'Comprobante generado correctamente');
                  } catch (err: any) {
                    onNotify('error', err.message);
                  }
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Descargar PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = completedSale.id;
                  setCompletedSale(null);
                  onInspectSale(id);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-[#0B111E] hover:bg-[#1E293B] border border-[#1E293B] text-white text-xs font-semibold cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Ver Detalle</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCompletedSale(null)}
              className="w-full py-2 text-xs text-[#94A3B8] hover:text-white cursor-pointer"
            >
              Continuar en el Terminal POS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
