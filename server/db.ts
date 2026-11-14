import { Pool, PoolClient, QueryResultRow } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[VentaSmart DB] DATABASE_URL no está configurada en el entorno (.env).');
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('sslmode=require') || connectionString?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : undefined,
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function initDatabase(): Promise<void> {
  if (!connectionString) return;

  await query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol VARCHAR(30) NOT NULL DEFAULT 'Vendedor',
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      tipo_documento VARCHAR(30) NOT NULL,
      numero_documento VARCHAR(40) NOT NULL,
      nombres VARCHAR(120) NOT NULL,
      apellidos VARCHAR(120) NOT NULL DEFAULT '',
      telefono VARCHAR(40) NOT NULL DEFAULT '',
      email VARCHAR(150) NOT NULL DEFAULT '',
      direccion VARCHAR(255) NOT NULL DEFAULT '',
      ciudad VARCHAR(100) NOT NULL DEFAULT '',
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_cliente_documento UNIQUE (tipo_documento, numero_documento)
    );
    CREATE INDEX IF NOT EXISTS idx_clientes_doc ON clientes (numero_documento);
    CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes (nombres, apellidos);

    CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(50) UNIQUE NOT NULL,
      nombre VARCHAR(180) NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      categoria VARCHAR(80) NOT NULL DEFAULT 'General',
      precio_compra NUMERIC(14, 2),
      precio_venta NUMERIC(14, 2) NOT NULL CHECK (precio_venta >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      stock_minimo INTEGER NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
      ubicacion VARCHAR(80) NOT NULL DEFAULT 'Bodega Principal',
      imagen_key VARCHAR(80) NOT NULL DEFAULT '',
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos (codigo);
    CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos (categoria);

    CREATE TABLE IF NOT EXISTS ventas (
      id SERIAL PRIMARY KEY,
      numero_venta VARCHAR(30) UNIQUE NOT NULL,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      fecha_venta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
      descuento NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
      porcentaje_impuesto NUMERIC(5, 2) NOT NULL DEFAULT 19.00 CHECK (porcentaje_impuesto >= 0),
      valor_impuesto NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor_impuesto >= 0),
      total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
      estado_pago VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
      observaciones TEXT NOT NULL DEFAULT '',
      idempotency_key VARCHAR(100) UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas (fecha_venta DESC);
    CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas (estado_pago);

    CREATE TABLE IF NOT EXISTS detalle_ventas (
      id SERIAL PRIMARY KEY,
      venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
      producto_codigo VARCHAR(50) NOT NULL,
      producto_nombre VARCHAR(180) NOT NULL,
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      precio_unitario NUMERIC(14, 2) NOT NULL CHECK (precio_unitario >= 0),
      descuento NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
      subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_detalle_venta_id ON detalle_ventas (venta_id);

    CREATE TABLE IF NOT EXISTS pagos (
      id SERIAL PRIMARY KEY,
      numero_recibo VARCHAR(30) UNIQUE NOT NULL,
      venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
      fecha_pago TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      valor NUMERIC(14, 2) NOT NULL CHECK (valor > 0),
      metodo_pago VARCHAR(40) NOT NULL,
      referencia VARCHAR(80) NOT NULL DEFAULT '',
      observaciones TEXT NOT NULL DEFAULT '',
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_pagos_venta_id ON pagos (venta_id);
    CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos (fecha_pago DESC);

    CREATE TABLE IF NOT EXISTS configuracion (
      id INTEGER PRIMARY KEY DEFAULT 1,
      nombre_empresa VARCHAR(180) NOT NULL DEFAULT 'VentaSmart Comercial S.A.S.',
      nit_empresa VARCHAR(50) NOT NULL DEFAULT '901.456.789-1',
      direccion_empresa VARCHAR(255) NOT NULL DEFAULT 'Calle 100 # 19A-45 Of. 502, Bogotá D.C.',
      telefono_empresa VARCHAR(50) NOT NULL DEFAULT '+57 601 745 8900',
      email_empresa VARCHAR(150) NOT NULL DEFAULT 'contacto@ventasmart.co',
      porcentaje_impuesto_default NUMERIC(5, 2) NOT NULL DEFAULT 19.00,
      prefijo_venta VARCHAR(15) NOT NULL DEFAULT 'VS',
      moneda VARCHAR(10) NOT NULL DEFAULT 'COP',
      nota_comprobante TEXT NOT NULL DEFAULT 'DOCUMENTO INTERNO DE SOPORTE COMERCIAL. NO ES UNA FACTURA ELECTRÓNICA VALIDADA POR LA DIAN.'
    );
  `);

  await seedInitialData();
}

async function seedInitialData(): Promise<void> {
  await query(`
    INSERT INTO configuracion (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;
  `);

  const userCountRes = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM usuarios');
  const userCount = parseInt(userCountRes.rows[0]?.count || '0', 10);

  if (userCount === 0) {
    const adminHash = await bcrypt.hash('Admin2026*', 10);
    const cajeroHash = await bcrypt.hash('Cajero2026*', 10);

    await query(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol, activo)
       VALUES
         ('Carlos', 'Mendoza', 'admin@ventasmart.co', $1, 'Administrador', TRUE),
         ('Ana', 'Rodríguez', 'cajero@ventasmart.co', $2, 'Vendedor', TRUE)`,
      [adminHash, cajeroHash]
    );
  }

  const clientCountRes = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM clientes');
  const clientCount = parseInt(clientCountRes.rows[0]?.count || '0', 10);

  if (clientCount === 0) {
    await query(`
      INSERT INTO clientes (tipo_documento, numero_documento, nombres, apellidos, telefono, email, direccion, ciudad)
      VALUES
        ('CC', '222222222', 'Consumidor Final', 'Cliente General', '3000000000', 'ventas@ventasmart.co', 'Mostrador Principal', 'Bogotá D.C.'),
        ('NIT', '901432890-1', 'Soluciones Logísticas Andinas S.A.S.', '', '+57 310 458 9210', 'facturacion@andinasas.com', 'Calle 100 # 19A - 45 Of. 502', 'Bogotá D.C.'),
        ('NIT', '901442819-2', 'Distribuidora Caribe', 'Sucursal Norte', '+57 301 662 4190', 'caribe@distribuidoracaribe.co', 'Vía 40 # 73-120', 'Barranquilla'),
        ('CC', '1020789451', 'Mariana', 'Gómez López', '+57 315 884 1120', 'mariana.gomez@logisticaexpress.co', 'Av. El Dorado # 68C-61', 'Bogotá D.C.'),
        ('NIT', '900871222-6', 'Clínica OdontoSmart', 'Regional', '+57 312 940 3311', 'compras@odontosmart.co', 'Carrera 43A # 14-57', 'Medellín'),
        ('NIT', '830091765-4', 'Supermercados Del Centro E.U.', '', '+57 318 441 7800', 'pagos@supercentro.co', 'Av. 6N # 24-18', 'Cali');
    `);
  }

  const prodCountRes = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM productos');
  const prodCount = parseInt(prodCountRes.rows[0]?.count || '0', 10);

  if (prodCount === 0) {
    await query(`
      INSERT INTO productos (codigo, nombre, descripcion, categoria, precio_compra, precio_venta, stock, stock_minimo, ubicacion, imagen_key, activo)
      VALUES
        ('SKU-8092', 'Impresora Térmica 80mm USB/LAN', 'Periférico POS autocorte 260mm/s, interfaz Ethernet + USB + Serial', 'Equipos POS', 215000.00, 340000.00, 42, 10, 'Estante A-02', 'thermal_printer', TRUE),
        ('SKU-1049', 'Lector Código 2D Omnidireccional', 'Escáner de mesa manos libres QR / PDF417 / códigos 1D alta velocidad', 'Periféricos', 175000.00, 280000.00, 18, 8, 'Estante C-01', 'barcode_scanner', TRUE),
        ('SKU-4411', 'Cajón Monedero Eléctrico 41x41', '5 compartimentos billetes / 8 monedas, acero reforzado RJ11', 'Equipos POS', 115000.00, 195000.00, 29, 8, 'Estante B-01', 'cash_drawer', TRUE),
        ('SKU-9902', 'Terminal Touch All-in-One 15.6"', 'Procesador Intel i5, 8GB RAM, SSD 256GB, pantalla táctil capacitiva', 'Equipos POS', 1180000.00, 1890000.00, 9, 5, 'Estante A-12', 'pos_terminal', TRUE),
        ('SKU-3120', 'Licencia Anual VentaSmart Multi-Caja', 'Suscripción anual soporte comercial, inventario y hasta 5 terminales', 'Licencias', 120000.00, 450000.00, 95, 10, 'Digital', '', TRUE),
        ('SKU-7703', 'Caja Rollos Papel Térmico 80x65mm', 'Paquete por 25 rollos libre de BPA, alto contraste 55g', 'Consumibles', 26000.00, 45000.00, 120, 20, 'Pallet-03', '', TRUE),
        ('SKU-5501', 'Monitor Cliente Secundario LCD 10.1"', 'Conexión USB-C, soporte articulado metálico Full HD', 'Cómputo', 290000.00, 460000.00, 3, 6, 'Estante B-04', '', TRUE),
        ('SKU-6210', 'Teclado POS Programable 66 Teclas', 'Lector de banda magnética integrado, interfaz USB resistente a derrames', 'Periféricos', 165000.00, 265000.00, 4, 8, 'Estante C-04', '', TRUE);
    `);
  }

  const salesCountRes = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM ventas');
  const salesCount = parseInt(salesCountRes.rows[0]?.count || '0', 10);

  if (salesCount === 0) {
    // Seed 5 realistic historical sales with line items and payments inside a transaction
    await withTransaction(async (client) => {
      const adminRes = await client.query<{ id: number }>("SELECT id FROM usuarios ORDER BY id ASC LIMIT 1");
      const adminId = adminRes.rows[0].id;
      const clientsRes = await client.query<{ id: number; nombres: string }>("SELECT id, nombres FROM clientes ORDER BY id ASC");
      const prodsRes = await client.query<{ id: number; codigo: string; nombre: string; precio_venta: string }>("SELECT id, codigo, nombre, precio_venta FROM productos ORDER BY id ASC");

      if (clientsRes.rows.length < 5 || prodsRes.rows.length < 6) return;

      const c = clientsRes.rows;
      const p = prodsRes.rows;

      const seedSales = [
        {
          numero: 'VS-2026-000001',
          cliente_id: c[1].id,
          daysAgo: 18,
          descuento: 100000,
          taxPct: 19,
          items: [
            { prod: p[3], qty: 2 }, // Terminal Touch x2
            { prod: p[0], qty: 2 }, // Impresora x2
          ],
          payments: [
            { recibo: 'REC-2026-000001', valor: 5188400, metodo: 'Transferencia bancaria', ref: 'TRANSF-88401', obs: 'Pago total orden de compra #OC-104' }
          ]
        },
        {
          numero: 'VS-2026-000002',
          cliente_id: c[2].id,
          daysAgo: 10,
          descuento: 0,
          taxPct: 19,
          items: [
            { prod: p[0], qty: 3 },
            { prod: p[1], qty: 3 },
            { prod: p[2], qty: 2 },
          ],
          payments: [
            { recibo: 'REC-2026-000002', valor: 1500000, metodo: 'Transferencia bancaria', ref: 'PSE-44920', obs: 'Abono inicial 50%' }
          ]
        },
        {
          numero: 'VS-2026-000003',
          cliente_id: c[3].id,
          daysAgo: 4,
          descuento: 20000,
          taxPct: 19,
          items: [
            { prod: p[1], qty: 2 },
            { prod: p[5], qty: 4 },
          ],
          payments: [
            { recibo: 'REC-2026-000003', valor: 856800, metodo: 'Tarjeta', ref: 'AUTH-99312', obs: 'Pago con datáfono Redeban' }
          ]
        },
        {
          numero: 'VS-2026-000004',
          cliente_id: c[4].id,
          daysAgo: 1,
          descuento: 0,
          taxPct: 19,
          items: [
            { prod: p[3], qty: 1 },
            { prod: p[4], qty: 2 },
          ],
          payments: [] // Pendiente
        },
        {
          numero: 'VS-2026-000005',
          cliente_id: c[0].id,
          daysAgo: 0,
          descuento: 0,
          taxPct: 19,
          items: [
            { prod: p[0], qty: 1 },
            { prod: p[5], qty: 2 },
          ],
          payments: [
            { recibo: 'REC-2026-000004', valor: 511700, metodo: 'Efectivo', ref: 'CAJA-01', obs: 'Pago en efectivo mostrador' }
          ]
        }
      ];

      for (const s of seedSales) {
        let subtotal = 0;
        for (const item of s.items) {
          subtotal += Number(item.prod.precio_venta) * item.qty;
        }
        const base = Math.max(0, subtotal - s.descuento);
        const valorImpuesto = Math.round((base * (s.taxPct / 100)) * 100) / 100;
        const total = Math.round((base + valorImpuesto) * 100) / 100;

        const paidTotal = s.payments.reduce((acc, pay) => acc + pay.valor, 0);
        let estadoPago = 'Pendiente';
        if (paidTotal >= total - 0.01) estadoPago = 'Pagada';
        else if (paidTotal > 0) estadoPago = 'Parcialmente pagada';

        const saleRes = await client.query<{ id: number }>(
          `INSERT INTO ventas (numero_venta, cliente_id, usuario_id, fecha_venta, subtotal, descuento, porcentaje_impuesto, valor_impuesto, total, estado_pago, observaciones)
           VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [s.numero, s.cliente_id, adminId, String(s.daysAgo), subtotal, s.descuento, s.taxPct, valorImpuesto, total, estadoPago, 'Operación comercial registrada en VentaSmart']
        );
        const ventaId = saleRes.rows[0].id;

        for (const item of s.items) {
          const unitPrice = Number(item.prod.precio_venta);
          const lineSub = unitPrice * item.qty;
          await client.query(
            `INSERT INTO detalle_ventas (venta_id, producto_id, producto_codigo, producto_nombre, cantidad, precio_unitario, descuento, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
            [ventaId, item.prod.id, item.prod.codigo, item.prod.nombre, item.qty, unitPrice, lineSub]
          );
        }

        for (const pay of s.payments) {
          await client.query(
            `INSERT INTO pagos (numero_recibo, venta_id, fecha_pago, valor, metodo_pago, referencia, observaciones, usuario_id)
             VALUES ($1, $2, NOW() - ($3 || ' days')::interval, $4, $5, $6, $7, $8)`,
            [pay.recibo, ventaId, String(s.daysAgo), pay.valor, pay.metodo, pay.ref, pay.obs, adminId]
          );
        }
      }
    });
  }
}
