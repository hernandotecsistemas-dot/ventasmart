import { Router } from 'express';
import { query, withTransaction } from '../db.ts';
import { requireAuth } from '../auth.ts';

export const ventasRouter = Router();
ventasRouter.use(requireAuth);

interface SaleItemInput {
  producto_id: number;
  cantidad: number;
  descuento?: number;
}

ventasRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const estado = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
    const clienteId = typeof req.query.cliente_id === 'string' ? parseInt(req.query.cliente_id, 10) : NaN;
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(
        `(v.numero_venta ILIKE $${idx} OR c.nombres ILIKE $${idx} OR c.apellidos ILIKE $${idx} OR c.numero_documento ILIKE $${idx})`
      );
    }

    if (estado && estado !== 'Todos') {
      params.push(estado);
      conditions.push(`v.estado_pago = $${params.length}`);
    }

    if (!Number.isNaN(clienteId)) {
      params.push(clienteId);
      conditions.push(`v.cliente_id = $${params.length}`);
    }

    if (from) {
      params.push(from);
      conditions.push(`v.fecha_venta::date >= $${params.length}::date`);
    }

    if (to) {
      params.push(to);
      conditions.push(`v.fecha_venta::date <= $${params.length}::date`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT
         v.*,
         c.tipo_documento,
         c.numero_documento,
         c.nombres AS cliente_nombres,
         c.apellidos AS cliente_apellidos,
         u.nombre || ' ' || u.apellido AS vendedor_nombre,
         COALESCE(p_agg.total_pagado, 0)::numeric(14,2) AS total_pagado,
         (v.total - COALESCE(p_agg.total_pagado, 0))::numeric(14,2) AS saldo_pendiente,
         COALESCE(p_agg.ultimo_metodo, 'Crédito / Pendiente') AS metodo_pago_principal,
         COALESCE(d_agg.total_items, 0)::int AS total_items
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN (
         SELECT
           venta_id,
           SUM(valor) AS total_pagado,
           (ARRAY_AGG(metodo_pago ORDER BY fecha_pago DESC))[1] AS ultimo_metodo
         FROM pagos
         GROUP BY venta_id
       ) p_agg ON p_agg.venta_id = v.id
       LEFT JOIN (
         SELECT venta_id, SUM(cantidad) AS total_items
         FROM detalle_ventas
         GROUP BY venta_id
       ) d_agg ON d_agg.venta_id = v.id
       ${whereClause}
       ORDER BY v.fecha_venta DESC, v.id DESC`,
      params
    );

    res.json({ ventas: result.rows });
  } catch (err) {
    next(err);
  }
});

ventasRouter.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID de venta inválido.' });

    const saleRes = await query(
      `SELECT
         v.*,
         c.tipo_documento,
         c.numero_documento,
         c.nombres AS cliente_nombres,
         c.apellidos AS cliente_apellidos,
         c.telefono AS cliente_telefono,
         c.email AS cliente_email,
         c.direccion AS cliente_direccion,
         c.ciudad AS cliente_ciudad,
         u.nombre || ' ' || u.apellido AS vendedor_nombre,
         u.email AS vendedor_email
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       JOIN usuarios u ON u.id = v.usuario_id
       WHERE v.id = $1`,
      [id]
    );

    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada.' });
    }

    const itemsRes = await query(
      `SELECT * FROM detalle_ventas WHERE venta_id = $1 ORDER BY id ASC`,
      [id]
    );

    const paymentsRes = await query(
      `SELECT p.*, u.nombre || ' ' || u.apellido AS usuario_nombre
       FROM pagos p
       JOIN usuarios u ON u.id = p.usuario_id
       WHERE p.venta_id = $1
       ORDER BY p.fecha_pago DESC, p.id DESC`,
      [id]
    );

    const venta = saleRes.rows[0];
    const totalPagado = paymentsRes.rows.reduce((sum, p) => sum + Number(p.valor), 0);
    const saldoPendiente = Math.max(0, Math.round((Number(venta.total) - totalPagado) * 100) / 100);

    res.json({
      venta: {
        ...venta,
        total_pagado: totalPagado.toFixed(2),
        saldo_pendiente: saldoPendiente.toFixed(2),
      },
      detalles: itemsRes.rows,
      pagos: paymentsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

ventasRouter.post('/', async (req, res, next) => {
  try {
    const {
      cliente_id,
      items,
      descuento_global = 0,
      porcentaje_impuesto,
      pago_inicial = 0,
      metodo_pago = 'Efectivo',
      referencia_pago = '',
      observaciones = '',
      idempotency_key,
    } = req.body as {
      cliente_id?: number;
      items?: SaleItemInput[];
      descuento_global?: number;
      porcentaje_impuesto?: number;
      pago_inicial?: number;
      metodo_pago?: string;
      referencia_pago?: string;
      observaciones?: string;
      idempotency_key?: string;
    };

    if (!cliente_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar un cliente y al menos un producto.' });
    }

    // Check idempotency key to prevent duplicate submissions
    if (idempotency_key) {
      const existingSale = await query('SELECT * FROM ventas WHERE idempotency_key = $1', [idempotency_key]);
      if (existingSale.rows.length > 0) {
        return res.status(200).json({
          venta: existingSale.rows[0],
          message: 'Venta registrada exitosamente',
          duplicatePrevented: true,
        });
      }
    }

    const result = await withTransaction(async (client) => {
      // 1. Validate client exists
      const clientCheck = await client.query('SELECT id FROM clientes WHERE id = $1', [cliente_id]);
      if (clientCheck.rows.length === 0) {
        throw { status: 404, message: 'El cliente seleccionado no existe.' };
      }

      // 2. Load system configuration
      const configRes = await client.query<{
        porcentaje_impuesto_default: string;
        prefijo_venta: string;
      }>('SELECT porcentaje_impuesto_default, prefijo_venta FROM configuracion WHERE id = 1');
      const config = configRes.rows[0];
      const taxPct = porcentaje_impuesto !== undefined && porcentaje_impuesto !== null
        ? Number(porcentaje_impuesto)
        : Number(config?.porcentaje_impuesto_default ?? 19);

      if (Number.isNaN(taxPct) || taxPct < 0 || taxPct > 100) {
        throw { status: 400, message: 'El porcentaje de impuesto debe estar entre 0% y 100%.' };
      }

      // 3. Aggregate items by producto_id and lock rows FOR UPDATE
      const mergedItems = new Map<number, { cantidad: number; descuento: number }>();
      for (const rawItem of items) {
        const pid = Number(rawItem.producto_id);
        const qty = parseInt(String(rawItem.cantidad), 10);
        const itemDesc = Number(rawItem.descuento || 0);
        if (!pid || Number.isNaN(qty) || qty <= 0) {
          throw { status: 400, message: 'Las cantidades de productos deben ser mayores a 0.' };
        }
        if (Number.isNaN(itemDesc) || itemDesc < 0) {
          throw { status: 400, message: 'El descuento por ítem no puede ser negativo.' };
        }
        const prev = mergedItems.get(pid) || { cantidad: 0, descuento: 0 };
        mergedItems.set(pid, {
          cantidad: prev.cantidad + qty,
          descuento: prev.descuento + itemDesc,
        });
      }

      const lineDetails: Array<{
        producto_id: number;
        codigo: string;
        nombre: string;
        cantidad: number;
        precio_unitario: number;
        descuento: number;
        subtotal: number;
        remaining_stock: number;
        stock_minimo: number;
      }> = [];

      let subtotalBruto = 0;

      for (const [productoId, itemData] of mergedItems.entries()) {
        const prodRes = await client.query<{
          id: number;
          codigo: string;
          nombre: string;
          precio_venta: string;
          stock: number;
          stock_minimo: number;
          activo: boolean;
        }>(
          'SELECT id, codigo, nombre, precio_venta, stock, stock_minimo, activo FROM productos WHERE id = $1 FOR UPDATE',
          [productoId]
        );

        if (prodRes.rows.length === 0) {
          throw { status: 404, message: 'El producto no existe' };
        }

        const prod = prodRes.rows[0];
        if (!prod.activo) {
          throw { status: 400, message: `El producto "${prod.nombre}" se encuentra inactivo.` };
        }
        if (prod.stock < itemData.cantidad) {
          throw {
            status: 400,
            message: `No hay existencias suficientes para "${prod.nombre}" (disponible: ${prod.stock})`,
          };
        }

        const unitPrice = Number(prod.precio_venta);
        const rawLine = unitPrice * itemData.cantidad;
        const lineDiscount = Math.min(rawLine, itemData.descuento);
        const lineSubtotal = Math.round((rawLine - lineDiscount) * 100) / 100;

        subtotalBruto += lineSubtotal;

        const remainingStock = prod.stock - itemData.cantidad;
        await client.query('UPDATE productos SET stock = $1 WHERE id = $2', [remainingStock, prod.id]);

        lineDetails.push({
          producto_id: prod.id,
          codigo: prod.codigo,
          nombre: prod.nombre,
          cantidad: itemData.cantidad,
          precio_unitario: unitPrice,
          descuento: lineDiscount,
          subtotal: lineSubtotal,
          remaining_stock: remainingStock,
          stock_minimo: prod.stock_minimo,
        });
      }

      // 4. Compute authoritative server-side totals
      subtotalBruto = Math.round(subtotalBruto * 100) / 100;
      const globalDisc = Number(descuento_global || 0);
      if (Number.isNaN(globalDisc) || globalDisc < 0) {
        throw { status: 400, message: 'El descuento no puede ser negativo.' };
      }
      if (globalDisc > subtotalBruto) {
        throw { status: 400, message: 'El descuento no puede superar el subtotal de la venta.' };
      }

      const baseGravable = Math.round((subtotalBruto - globalDisc) * 100) / 100;
      const valorImpuesto = Math.round(baseGravable * (taxPct / 100) * 100) / 100;
      const total = Math.round((baseGravable + valorImpuesto) * 100) / 100;

      // 5. Validate initial payment
      const pagoVal = Number(pago_inicial || 0);
      if (Number.isNaN(pagoVal) || pagoVal < 0) {
        throw { status: 400, message: 'El monto del pago inicial no puede ser negativo.' };
      }
      if (pagoVal > total + 0.01) {
        throw { status: 400, message: 'El valor del pago supera el saldo pendiente' };
      }

      let estadoPago = 'Pendiente';
      if (pagoVal >= total - 0.01 && total > 0) {
        estadoPago = 'Pagada';
      } else if (total === 0) {
        estadoPago = 'Pagada';
      } else if (pagoVal > 0) {
        estadoPago = 'Parcialmente pagada';
      }

      // 6. Generate unique consecutive number atomically using advisory lock
      await client.query('SELECT pg_advisory_xact_lock(2026001)');
      const year = new Date().getFullYear();
      const prefix = `${config?.prefijo_venta || 'VS'}-${year}-`;
      const lastSaleRes = await client.query<{ numero_venta: string }>(
        `SELECT numero_venta FROM ventas WHERE numero_venta LIKE $1 ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextSeq = 1;
      if (lastSaleRes.rows.length > 0) {
        const lastNum = lastSaleRes.rows[0].numero_venta;
        const parts = lastNum.split('-');
        const parsedSeq = parseInt(parts[parts.length - 1], 10);
        if (!Number.isNaN(parsedSeq)) nextSeq = parsedSeq + 1;
      }
      const numeroVenta = `${prefix}${String(nextSeq).padStart(6, '0')}`;

      // 7. Insert venta
      const saleInsert = await client.query(
        `INSERT INTO ventas (
           numero_venta, cliente_id, usuario_id, subtotal, descuento,
           porcentaje_impuesto, valor_impuesto, total, estado_pago, observaciones, idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          numeroVenta,
          cliente_id,
          req.user!.id,
          subtotalBruto,
          globalDisc,
          taxPct,
          valorImpuesto,
          total,
          estadoPago,
          observaciones.trim(),
          idempotency_key || null,
        ]
      );
      const venta = saleInsert.rows[0];

      // 8. Insert detalle_ventas
      for (const item of lineDetails) {
        await client.query(
          `INSERT INTO detalle_ventas (
             venta_id, producto_id, producto_codigo, producto_nombre,
             cantidad, precio_unitario, descuento, subtotal
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            venta.id,
            item.producto_id,
            item.codigo,
            item.nombre,
            item.cantidad,
            item.precio_unitario,
            item.descuento,
            item.subtotal,
          ]
        );
      }

      // 9. Insert initial pago if > 0
      if (pagoVal > 0) {
        await client.query('SELECT pg_advisory_xact_lock(2026002)');
        const recPrefix = `REC-${year}-`;
        const lastRecRes = await client.query<{ numero_recibo: string }>(
          `SELECT numero_recibo FROM pagos WHERE numero_recibo LIKE $1 ORDER BY id DESC LIMIT 1`,
          [`${recPrefix}%`]
        );
        let nextRec = 1;
        if (lastRecRes.rows.length > 0) {
          const parts = lastRecRes.rows[0].numero_recibo.split('-');
          const parsedRec = parseInt(parts[parts.length - 1], 10);
          if (!Number.isNaN(parsedRec)) nextRec = parsedRec + 1;
        }
        const numeroRecibo = `${recPrefix}${String(nextRec).padStart(6, '0')}`;

        const validMethods = ['Efectivo', 'Transferencia bancaria', 'Tarjeta', 'Otro'];
        const safeMethod = validMethods.includes(metodo_pago) ? metodo_pago : 'Efectivo';

        await client.query(
          `INSERT INTO pagos (numero_recibo, venta_id, valor, metodo_pago, referencia, observaciones, usuario_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            numeroRecibo,
            venta.id,
            Math.min(pagoVal, total),
            safeMethod,
            referencia_pago.trim(),
            pagoVal < total ? 'Abono inicial registrado en POS' : 'Pago completo en POS',
            req.user!.id,
          ]
        );
      }

      const lowStockProducts = lineDetails
        .filter((i) => i.remaining_stock <= i.stock_minimo)
        .map((i) => i.nombre);

      return {
        venta,
        lowStockProducts,
        hasPendingBalance: estadoPago !== 'Pagada',
      };
    });

    const warnings: string[] = [];
    if (result.lowStockProducts.length > 0) {
      warnings.push(`Producto con inventario bajo: ${result.lowStockProducts.join(', ')}`);
    }
    if (result.hasPendingBalance) {
      warnings.push('La venta tiene un saldo pendiente');
    }

    res.status(201).json({
      venta: result.venta,
      message: 'Venta registrada exitosamente',
      warnings,
    });
  } catch (err: any) {
    if (err?.status && err?.message) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Venta Error]', err);
    return res.status(500).json({ error: 'No se pudo registrar la venta' });
  }
});
