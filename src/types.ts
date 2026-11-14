export type ModuleKey =
  | 'dashboard'
  | 'clientes'
  | 'productos'
  | 'pos'
  | 'detalle_ventas'
  | 'pagos'
  | 'facturas'
  | 'reportes'
  | 'configuracion';

export interface User {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: 'Administrador' | 'Vendedor' | 'Cajero' | string;
  activo: boolean;
  fecha_creacion?: string;
}

export interface Cliente {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  fecha_registro: string;
  total_ventas?: number;
  monto_comprado?: string;
  saldo_pendiente?: string;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio_compra: string | null;
  precio_venta: string;
  stock: number;
  stock_minimo: number;
  ubicacion: string;
  imagen_key: string;
  activo: boolean;
  fecha_registro: string;
}

export interface Venta {
  id: number;
  numero_venta: string;
  cliente_id: number;
  usuario_id: number;
  fecha_venta: string;
  subtotal: string;
  descuento: string;
  porcentaje_impuesto: string;
  valor_impuesto: string;
  total: string;
  estado_pago: 'Pendiente' | 'Parcialmente pagada' | 'Pagada' | string;
  observaciones: string;
  tipo_documento?: string;
  numero_documento?: string;
  cliente_nombres?: string;
  cliente_apellidos?: string;
  cliente_telefono?: string;
  cliente_email?: string;
  cliente_direccion?: string;
  cliente_ciudad?: string;
  vendedor_nombre?: string;
  total_pagado?: string;
  saldo_pendiente?: string;
  metodo_pago_principal?: string;
  total_items?: number;
}

export interface DetalleVenta {
  id: number;
  venta_id: number;
  producto_id: number;
  producto_codigo: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: string;
  descuento: string;
  subtotal: string;
}

export interface Pago {
  id: number;
  numero_recibo: string;
  venta_id: number;
  numero_venta?: string;
  venta_total?: string;
  venta_estado_pago?: string;
  fecha_pago: string;
  valor: string;
  metodo_pago: string;
  referencia: string;
  observaciones: string;
  usuario_id: number;
  usuario_nombre?: string;
  cliente_nombres?: string;
  cliente_apellidos?: string;
  cliente_documento?: string;
  saldo_restante_en_fecha?: string;
}

export interface Configuracion {
  id: number;
  nombre_empresa: string;
  nit_empresa: string;
  direccion_empresa: string;
  telefono_empresa: string;
  email_empresa: string;
  porcentaje_impuesto_default: string;
  prefijo_venta: string;
  moneda: string;
  nota_comprobante: string;
}

export interface FlashMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
}
