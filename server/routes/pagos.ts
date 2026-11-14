import { Router } from 'express';
import { query, withTransaction } from '../db.ts';
import { requireAuth } from '../auth.ts';

export const pagosRouter = Router();
pagosRouter.use(requireAuth);

pagosRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const metodo = typeof req.query.metodo === 'string' ? req.query.metodo.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(
        `(p.numero_recibo ILIKE $${idx} OR v.numero_venta ILIKE $${idx} OR c.nombres ILIKE $${idx} OR c.apellidos ILIKE $${idx} OR c.numero_documento ILIKE $${idx})`
      );
    }

    if (metodo && metodo !== 'Todos') {
      params.push(metodo);
      conditions.push(`p.metodo_pago = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const paymentsRes = await query(
      `SELECT
         p.*,
         v.numero_venta,
         v.total AS venta_total,
         v.estado_pago AS venta_estado_pago,
         c.nombres AS cliente_nombres,
         c.apellidos AS cliente_apellidos,
         c.numero_documento AS cliente_documento,
         u.nombre || ' ' || u.apellido AS usuario_nombre,
         (
           v.total - COALESCE(
             (SELECT SUM(p2.valor) FROM pagos p2 WHERE p2.venta_id = v.id AND p2.id <= p.id),
             0
           )
         )::numeric(14,2) AS saldo_restante_en_fecha
       FROM pagos p
       JOIN ventas v ON v.id = p.venta_id
       JOIN clientes c ON c.id = v.cliente_id
       JOIN usuarios u ON u.id = p.usuario_id
       ${whereClause}
       ORDER BY p.fecha_pago DESC, p.id DESC`,
      params
    );

    const pendingSalesRes = await query(
      `SELECT
         v.id,
         v.numero_venta,
         v.fecha_venta,
         v.total,
         v.estado_pago,
         c.id AS cliente_id,
         c.tipo_documento,
         c.numero_documento,
         c.nombres AS cliente_nombres,
         c.apellidos AS cliente_apellidos,
         COALESCE(SUM(p.valor), 0)::numeric(14,2) AS total_pagado,
         (v.total - COALESCE(SUM(p.valor), 0))::numeric(14,2) AS saldo_pendiente
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN pagos p ON p.venta_id = v.id
       WHERE v.estado_pago <> 'Pagada'
       GROUP BY v.id, c.id
       HAVING (v.total - COALESCE(SUM(p.valor), 0)) > 0.01
       ORDER BY v.fecha_venta DESC`
    );

    const statsRes = await query<{
      recaudado_mes: string;
      pagos_hoy_count: number;
      pagos_hoy_valor: string;
      cartera_pendiente: string;
      ventas_pendientes_count: number;
    }>(`
      SELECT
        COALESCE((SELECT SUM(valor) FROM pagos WHERE date_trunc('month', fecha_pago) = date_trunc('month', NOW())), 0)::numeric(14,2) AS recaudado_mes,
        COALESCE((SELECT COUNT(*)::int FROM pagos WHERE fecha_pago::date = CURRENT_DATE), 0) AS pagos_hoy_count,
        COALESCE((SELECT SUM(valor) FROM pagos WHERE fecha_pago::date = CURRENT_DATE), 0)::numeric(14,2) AS pagos_hoy_valor,
        COALESCE((
          SELECT SUM(v.total - COALESCE(p_sum.pagado, 0))
          FROM ventas v
          LEFT JOIN (SELECT venta_id, SUM(valor) AS pagado FROM pagos GROUP BY venta_id) p_sum ON p_sum.venta_id = v.id
          WHERE v.estado_pago <> 'Pagada'
        ), 0)::numeric(14,2) AS cartera_pendiente,
        COALESCE((SELECT COUNT(*)::int FROM ventas WHERE estado_pago <> 'Pagada'), 0) AS ventas_pendientes_count
    `);

    const byMethodRes = await query<{ metodo_pago: string; total: string; recibos: number }>(`
      SELECT metodo_pago, COALESCE(SUM(valor), 0)::numeric(14,2) AS total, COUNT(*)::int AS recibos
      FROM pagos
      GROUP BY metodo_pago
      ORDER BY total DESC
    `);

    res.json({
      pagos: paymentsRes.rows,
      ventas_pendientes: pendingSalesRes.rows,
      resumen: statsRes.rows[0],
      por_metodo: byMethodRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

pagosRouter.post('/', async (req, res, next) => {
  try {
    const {
      venta_id,
      valor,
      metodo_pago,
      referencia = '',
      observaciones = '',
      fecha_pago,
    } = req.body as {
      venta_id?: number;
      valor?: number;
      metodo_pago?: string;
      referencia?: string;
      observaciones?: string;
      fecha_pago?: string;
    };

    const ventaId = parseInt(String(venta_id), 10);
    const amount = Math.round(Number(valor) * 100) / 100;

    if (Number.isNaN(ventaId)) {
      return res.status(400).json({ error: 'Debe seleccionar una venta válida.' });
    }
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'El valor del pago debe ser mayor a cero.' });
    }

    const validMethods = ['Efectivo', 'Transferencia bancaria', 'Tarjeta', 'Otro'];
    if (!metodo_pago || !validMethods.includes(metodo_pago)) {
      return res.status(400).json({ error: 'Seleccione un método de pago válido.' });
    }

    const result = await withTransaction(async (client) => {
      const saleRes = await client.query<{ id: number; numero_venta: string; total: string; estado_pago: string }>(
        'SELECT id, numero_venta, total, estado_pago FROM ventas WHERE id = $1 FOR UPDATE',
        [ventaId]
      );
      if (saleRes.rows.length === 0) {
        throw { status: 404, message: 'La venta seleccionada no existe.' };
      }

      const sale = saleRes.rows[0];
      const saleTotal = Number(sale.total);

      const paidRes = await client.query<{ total_pagado: string }>(
        'SELECT COALESCE(SUM(valor), 0)::numeric(14,2) AS total_pagado FROM pagos WHERE venta_id = $1',
        [ventaId]
      );
      const alreadyPaid = Number(paidRes.rows[0]?.total_pagado || 0);
      const pendingBalance = Math.round((saleTotal - alreadyPaid) * 100) / 100;

      if (pendingBalance <= 0) {
        throw { status: 400, message: 'Esta venta ya se encuentra pagada en su totalidad.' };
      }

      if (amount > pendingBalance + 0.01) {
        throw { status: 400, message: 'El valor del pago supera el saldo pendiente' };
      }

      const appliedAmount = Math.min(amount, pendingBalance);
      const newPaidTotal = Math.round((alreadyPaid + appliedAmount) * 100) / 100;
      const newPending = Math.max(0, Math.round((saleTotal - newPaidTotal) * 100) / 100);
      const newStatus = newPending <= 0.01 ? 'Pagada' : 'Parcialmente pagada';

      await client.query('SELECT pg_advisory_xact_lock(2026002)');
      const year = new Date().getFullYear();
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

      const payInsert = await client.query(
        `INSERT INTO pagos (numero_recibo, venta_id, fecha_pago, valor, metodo_pago, referencia, observaciones, usuario_id)
         VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          numeroRecibo,
          ventaId,
          fecha_pago || null,
          appliedAmount,
          metodo_pago,
          referencia.trim(),
          observaciones.trim(),
          req.user!.id,
        ]
      );

      await client.query('UPDATE ventas SET estado_pago = $1 WHERE id = $2', [newStatus, ventaId]);

      return {
        pago: payInsert.rows[0],
        nuevo_estado: newStatus,
        saldo_pendiente: newPending,
      };
    });

    res.status(201).json({
      ...result,
      message: 'Pago registrado',
      warning: result.saldo_pendiente > 0 ? 'La venta tiene un saldo pendiente' : undefined,
    });
  } catch (err: any) {
    if (err?.status && err?.message) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});
