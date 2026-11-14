import { Router } from 'express';
import { query } from '../db.ts';
import { requireAuth } from '../auth.ts';

export const clientesRouter = Router();
clientesRouter.use(requireAuth);

clientesRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(
        `(c.numero_documento ILIKE $${idx} OR c.nombres ILIKE $${idx} OR c.apellidos ILIKE $${idx} OR c.email ILIKE $${idx} OR c.telefono ILIKE $${idx})`
      );
    }

    if (tipo && tipo !== 'Todos') {
      params.push(tipo);
      conditions.push(`c.tipo_documento = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT
         c.*,
         COUNT(v.id)::int AS total_ventas,
         COALESCE(SUM(v.total), 0)::numeric(14,2) AS monto_comprado,
         COALESCE(SUM(v.total), 0)::numeric(14,2) - COALESCE(SUM(p_sum.pagado), 0)::numeric(14,2) AS saldo_pendiente
       FROM clientes c
       LEFT JOIN ventas v ON v.cliente_id = c.id
       LEFT JOIN (
         SELECT venta_id, SUM(valor) AS pagado
         FROM pagos
         GROUP BY venta_id
       ) p_sum ON p_sum.venta_id = v.id
       ${whereClause}
       GROUP BY c.id
       ORDER BY c.id DESC`,
      params
    );

    res.json({ clientes: result.rows });
  } catch (err) {
    next(err);
  }
});

clientesRouter.get('/:id/ventas', async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID de cliente inválido.' });

    const clientRes = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    const salesRes = await query(
      `SELECT
         v.id, v.numero_venta, v.fecha_venta, v.subtotal, v.descuento,
         v.valor_impuesto, v.total, v.estado_pago,
         COALESCE(SUM(p.valor), 0)::numeric(14,2) AS total_pagado,
         (v.total - COALESCE(SUM(p.valor), 0))::numeric(14,2) AS saldo_pendiente
       FROM ventas v
       LEFT JOIN pagos p ON p.venta_id = v.id
       WHERE v.cliente_id = $1
       GROUP BY v.id
       ORDER BY v.fecha_venta DESC`,
      [id]
    );

    res.json({ cliente: clientRes.rows[0], ventas: salesRes.rows });
  } catch (err) {
    next(err);
  }
});

clientesRouter.post('/', async (req, res, next) => {
  try {
    const {
      tipo_documento,
      numero_documento,
      nombres,
      apellidos = '',
      telefono = '',
      email = '',
      direccion = '',
      ciudad = '',
    } = req.body as Record<string, string>;

    if (!tipo_documento?.trim() || !numero_documento?.trim() || !nombres?.trim()) {
      return res.status(400).json({ error: 'Tipo de documento, número de documento y nombres son obligatorios.' });
    }

    const dup = await query(
      'SELECT id FROM clientes WHERE tipo_documento = $1 AND numero_documento = $2',
      [tipo_documento.trim(), numero_documento.trim()]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'El cliente ya se encuentra registrado' });
    }

    const inserted = await query(
      `INSERT INTO clientes (tipo_documento, numero_documento, nombres, apellidos, telefono, email, direccion, ciudad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tipo_documento.trim(),
        numero_documento.trim(),
        nombres.trim(),
        apellidos.trim(),
        telefono.trim(),
        email.trim(),
        direccion.trim(),
        ciudad.trim(),
      ]
    );

    res.status(201).json({
      cliente: inserted.rows[0],
      message: 'Cliente agregado correctamente',
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'El cliente ya se encuentra registrado' });
    }
    next(err);
  }
});

clientesRouter.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID de cliente inválido.' });

    const {
      tipo_documento,
      numero_documento,
      nombres,
      apellidos = '',
      telefono = '',
      email = '',
      direccion = '',
      ciudad = '',
    } = req.body as Record<string, string>;

    if (!tipo_documento?.trim() || !numero_documento?.trim() || !nombres?.trim()) {
      return res.status(400).json({ error: 'Tipo de documento, número de documento y nombres son obligatorios.' });
    }

    const dup = await query(
      'SELECT id FROM clientes WHERE tipo_documento = $1 AND numero_documento = $2 AND id <> $3',
      [tipo_documento.trim(), numero_documento.trim(), id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'El cliente ya se encuentra registrado' });
    }

    const updated = await query(
      `UPDATE clientes
       SET tipo_documento = $1, numero_documento = $2, nombres = $3, apellidos = $4,
           telefono = $5, email = $6, direccion = $7, ciudad = $8
       WHERE id = $9
       RETURNING *`,
      [
        tipo_documento.trim(),
        numero_documento.trim(),
        nombres.trim(),
        apellidos.trim(),
        telefono.trim(),
        email.trim(),
        direccion.trim(),
        ciudad.trim(),
        id,
      ]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    res.json({ cliente: updated.rows[0], message: 'Cliente actualizado correctamente' });
  } catch (err) {
    next(err);
  }
});

clientesRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID de cliente inválido.' });

    const salesCheck = await query('SELECT COUNT(*)::int AS count FROM ventas WHERE cliente_id = $1', [id]);
    if ((salesCheck.rows[0]?.count || 0) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar un cliente con historial de ventas registrado.',
      });
    }

    const deleted = await query('DELETE FROM clientes WHERE id = $1 RETURNING id', [id]);
    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }

    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (err) {
    next(err);
  }
});
