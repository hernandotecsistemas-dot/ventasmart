import { Router } from 'express';
import { query } from '../db.ts';
import { requireAuth } from '../auth.ts';

export const reportesRouter = Router();
reportesRouter.use(requireAuth);

reportesRouter.get('/dashboard', async (req, res, next) => {
  try {
    const period = typeof req.query.period === 'string' ? req.query.period : 'month';
    let dateFilter = "fecha_venta >= date_trunc('month', NOW())";
    if (period === 'today') dateFilter = 'fecha_venta::date = CURRENT_DATE';
    else if (period === 'week') dateFilter = "fecha_venta >= NOW() - INTERVAL '7 days'";
    else if (period === 'year') dateFilter = "fecha_venta >= date_trunc('year', NOW())";
    else if (period === 'all') dateFilter = 'TRUE';

    const kpiRes = await query<{
      ventas_totales: string;
      ventas_hoy: string;
      num_ventas: number;
      clientes_registrados: number;
      productos_registrados: number;
      productos_stock_bajo: number;
      total_ingresos: string;
      total_saldos_pendientes: string;
      ventas_mes_anterior: string;
    }>(`
      SELECT
        COALESCE((SELECT SUM(total) FROM ventas WHERE ${dateFilter}), 0)::numeric(14,2) AS ventas_totales,
        COALESCE((SELECT SUM(total) FROM ventas WHERE fecha_venta::date = CURRENT_DATE), 0)::numeric(14,2) AS ventas_hoy,
        COALESCE((SELECT COUNT(*)::int FROM ventas WHERE ${dateFilter}), 0) AS num_ventas,
        COALESCE((SELECT COUNT(*)::int FROM clientes), 0) AS clientes_registrados,
        COALESCE((SELECT COUNT(*)::int FROM productos WHERE activo = TRUE), 0) AS productos_registrados,
        COALESCE((SELECT COUNT(*)::int FROM productos WHERE activo = TRUE AND stock <= stock_minimo), 0) AS productos_stock_bajo,
        COALESCE((SELECT SUM(valor) FROM pagos), 0)::numeric(14,2) AS total_ingresos,
        COALESCE((
          SELECT SUM(v.total - COALESCE(p_sum.pagado, 0))
          FROM ventas v
          LEFT JOIN (SELECT venta_id, SUM(valor) AS pagado FROM pagos GROUP BY venta_id) p_sum ON p_sum.venta_id = v.id
          WHERE v.estado_pago <> 'Pagada'
        ), 0)::numeric(14,2) AS total_saldos_pendientes,
        COALESCE((
          SELECT SUM(total) FROM ventas
          WHERE fecha_venta >= date_trunc('month', NOW() - INTERVAL '1 month')
            AND fecha_venta < date_trunc('month', NOW())
        ), 0)::numeric(14,2) AS ventas_mes_anterior
    `);

    const monthlySalesRes = await query<{ mes: string; total: string; transacciones: number }>(`
      SELECT
        TO_CHAR(date_trunc('month', fecha_venta), 'YYYY-MM') AS mes,
        COALESCE(SUM(total), 0)::numeric(14,2) AS total,
        COUNT(*)::int AS transacciones
      FROM ventas
      WHERE fecha_venta >= NOW() - INTERVAL '12 months'
      GROUP BY date_trunc('month', fecha_venta)
      ORDER BY date_trunc('month', fecha_venta) ASC
    `);

    const dailySalesRes = await query<{ dia: string; total: string; transacciones: number }>(`
      SELECT
        TO_CHAR(fecha_venta::date, 'YYYY-MM-DD') AS dia,
        COALESCE(SUM(total), 0)::numeric(14,2) AS total,
        COUNT(*)::int AS transacciones
      FROM ventas
      WHERE fecha_venta >= NOW() - INTERVAL '14 days'
      GROUP BY fecha_venta::date
      ORDER BY fecha_venta::date ASC
    `);

    const topProductsRes = await query<{
      producto_id: number;
      codigo: string;
      nombre: string;
      unidades_vendidas: number;
      ingresos: string;
      stock: number;
      stock_minimo: number;
    }>(`
      SELECT
        d.producto_id,
        MAX(d.producto_codigo) AS codigo,
        MAX(d.producto_nombre) AS nombre,
        SUM(d.cantidad)::int AS unidades_vendidas,
        SUM(d.subtotal)::numeric(14,2) AS ingresos,
        COALESCE(MAX(p.stock), 0)::int AS stock,
        COALESCE(MAX(p.stock_minimo), 5)::int AS stock_minimo
      FROM detalle_ventas d
      LEFT JOIN productos p ON p.id = d.producto_id
      GROUP BY d.producto_id
      ORDER BY ingresos DESC
      LIMIT 5
    `);

    const recentSalesRes = await query(`
      SELECT
        v.id, v.numero_venta, v.fecha_venta, v.total, v.estado_pago,
        c.nombres AS cliente_nombres, c.apellidos AS cliente_apellidos,
        COALESCE(p_agg.ultimo_metodo, 'Pendiente') AS metodo_pago
      FROM ventas v
      JOIN clientes c ON c.id = v.cliente_id
      LEFT JOIN (
        SELECT venta_id, (ARRAY_AGG(metodo_pago ORDER BY fecha_pago DESC))[1] AS ultimo_metodo
        FROM pagos GROUP BY venta_id
      ) p_agg ON p_agg.venta_id = v.id
      ORDER BY v.fecha_venta DESC, v.id DESC
      LIMIT 6
    `);

    const lowStockRes = await query(`
      SELECT id, codigo, nombre, categoria, stock, stock_minimo, precio_venta
      FROM productos
      WHERE activo = TRUE AND stock <= stock_minimo
      ORDER BY stock ASC, id ASC
      LIMIT 6
    `);

    res.json({
      kpis: kpiRes.rows[0],
      ventas_mensuales: monthlySalesRes.rows,
      ventas_diarias: dailySalesRes.rows,
      productos_mas_vendidos: topProductsRes.rows,
      ultimas_ventas: recentSalesRes.rows,
      stock_bajo: lowStockRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

reportesRouter.get('/analytics', async (req, res, next) => {
  try {
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : '';
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : '';
    const granularity = typeof req.query.granularity === 'string' ? req.query.granularity : 'month';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (from) {
      params.push(from);
      conditions.push(`v.fecha_venta::date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`v.fecha_venta::date <= $${params.length}::date`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const summaryRes = await query(
      `SELECT
         COALESCE(SUM(v.total), 0)::numeric(14,2) AS facturacion_total,
         COALESCE(SUM(v.subtotal), 0)::numeric(14,2) AS subtotal_total,
         COALESCE(SUM(v.valor_impuesto), 0)::numeric(14,2) AS impuestos_total,
         COALESCE(SUM(v.descuento), 0)::numeric(14,2) AS descuentos_total,
         COUNT(v.id)::int AS total_ventas,
         COALESCE(AVG(v.total), 0)::numeric(14,2) AS ticket_promedio,
         COALESCE(SUM(COALESCE(p_agg.pagado, 0)), 0)::numeric(14,2) AS ingresos_recibidos,
         COALESCE(SUM(v.total - COALESCE(p_agg.pagado, 0)), 0)::numeric(14,2) AS saldos_pendientes
       FROM ventas v
       LEFT JOIN (SELECT venta_id, SUM(valor) AS pagado FROM pagos GROUP BY venta_id) p_agg ON p_agg.venta_id = v.id
       ${whereClause}`,
      params
    );

    const truncUnit = granularity === 'day' ? 'day' : granularity === 'week' ? 'week' : 'month';
    const formatStr = granularity === 'day' ? 'YYYY-MM-DD' : granularity === 'week' ? 'IYYY-"S"IW' : 'YYYY-MM';

    const seriesRes = await query(
      `SELECT
         TO_CHAR(date_trunc('${truncUnit}', v.fecha_venta), '${formatStr}') AS periodo,
         COALESCE(SUM(v.total), 0)::numeric(14,2) AS total,
         COUNT(*)::int AS cantidad
       FROM ventas v
       ${whereClause}
       GROUP BY date_trunc('${truncUnit}', v.fecha_venta)
       ORDER BY date_trunc('${truncUnit}', v.fecha_venta) ASC`,
      params
    );

    const payWhere = conditions.length > 0
      ? `WHERE ${conditions.map((c) => c.replace('v.fecha_venta', 'p.fecha_pago')).join(' AND ')}`
      : '';

    const paymentMethodsRes = await query(
      `SELECT p.metodo_pago, COALESCE(SUM(p.valor), 0)::numeric(14,2) AS total, COUNT(*)::int AS transacciones
       FROM pagos p
       ${payWhere}
       GROUP BY p.metodo_pago
       ORDER BY total DESC`,
      params
    );

    const topProductsRes = await query(
      `SELECT
         d.producto_id,
         MAX(d.producto_codigo) AS codigo,
         MAX(d.producto_nombre) AS nombre,
         SUM(d.cantidad)::int AS unidades,
         SUM(d.subtotal)::numeric(14,2) AS total_ventas,
         COALESCE(SUM(d.cantidad * COALESCE(pr.precio_compra, d.precio_unitario * 0.65)), 0)::numeric(14,2) AS costo_estimado
       FROM detalle_ventas d
       JOIN ventas v ON v.id = d.venta_id
       LEFT JOIN productos pr ON pr.id = d.producto_id
       ${whereClause}
       GROUP BY d.producto_id
       ORDER BY total_ventas DESC
       LIMIT 8`,
      params
    );

    const topClientsRes = await query(
      `SELECT
         c.id,
         c.tipo_documento,
         c.numero_documento,
         c.nombres,
         c.apellidos,
         c.ciudad,
         COUNT(v.id)::int AS ordenes,
         COALESCE(SUM(v.total), 0)::numeric(14,2) AS total_comprado,
         COALESCE(SUM(v.total - COALESCE(p_agg.pagado, 0)), 0)::numeric(14,2) AS saldo_pendiente
       FROM clientes c
       JOIN ventas v ON v.cliente_id = c.id
       LEFT JOIN (SELECT venta_id, SUM(valor) AS pagado FROM pagos GROUP BY venta_id) p_agg ON p_agg.venta_id = v.id
       ${whereClause}
       GROUP BY c.id
       ORDER BY total_comprado DESC
       LIMIT 8`,
      params
    );

    const pendingBalancesRes = await query(
      `SELECT
         v.id, v.numero_venta, v.fecha_venta, v.total, v.estado_pago,
         c.nombres AS cliente_nombres, c.apellidos AS cliente_apellidos, c.numero_documento,
         COALESCE(p_agg.pagado, 0)::numeric(14,2) AS pagado,
         (v.total - COALESCE(p_agg.pagado, 0))::numeric(14,2) AS saldo_pendiente
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN (SELECT venta_id, SUM(valor) AS pagado FROM pagos GROUP BY venta_id) p_agg ON p_agg.venta_id = v.id
       WHERE v.estado_pago <> 'Pagada'
       ORDER BY saldo_pendiente DESC`
    );

    res.json({
      resumen: summaryRes.rows[0],
      serie_ventas: seriesRes.rows,
      metodos_pago: paymentMethodsRes.rows,
      top_productos: topProductsRes.rows,
      top_clientes: topClientsRes.rows,
      saldos_pendientes: pendingBalancesRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

reportesRouter.get('/export', async (req, res, next) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : 'ventas';
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (from) {
      params.push(from);
      conditions.push(`v.fecha_venta::date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`v.fecha_venta::date <= $${params.length}::date`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let csv = '';
    if (type === 'pendientes') {
      const rows = await query(
        `SELECT v.numero_venta, v.fecha_venta, c.numero_documento, c.nombres || ' ' || c.apellidos AS cliente,
                v.total, COALESCE(p_agg.pagado, 0)::numeric(14,2) AS pagado,
                (v.total - COALESCE(p_agg.pagado, 0))::numeric(14,2) AS saldo_pendiente, v.estado_pago
         FROM ventas v
         JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN (SELECT venta_id, SUM(valor) AS pagado FROM pagos GROUP BY venta_id) p_agg ON p_agg.venta_id = v.id
         WHERE v.estado_pago <> 'Pagada'
         ORDER BY saldo_pendiente DESC`
      );
      csv = 'Numero Venta,Fecha,Documento,Cliente,Total,Pagado,Saldo Pendiente,Estado\n' +
        rows.rows.map((r) => `"${r.numero_venta}","${new Date(r.fecha_venta).toISOString()}","${r.numero_documento}","${String(r.cliente).trim()}",${r.total},${r.pagado},${r.saldo_pendiente},"${r.estado_pago}"`).join('\n');
    } else if (type === 'productos') {
      const rows = await query(
        `SELECT d.producto_codigo, MAX(d.producto_nombre) AS nombre, SUM(d.cantidad)::int AS unidades, SUM(d.subtotal)::numeric(14,2) AS ingresos
         FROM detalle_ventas d
         JOIN ventas v ON v.id = d.venta_id
         ${whereClause}
         GROUP BY d.producto_codigo
         ORDER BY ingresos DESC`,
        params
      );
      csv = 'Codigo SKU,Producto,Unidades Vendidas,Ingresos\n' +
        rows.rows.map((r) => `"${r.producto_codigo}","${r.nombre}",${r.unidades},${r.ingresos}`).join('\n');
    } else {
      const rows = await query(
        `SELECT v.numero_venta, v.fecha_venta, c.numero_documento, c.nombres || ' ' || c.apellidos AS cliente,
                v.subtotal, v.descuento, v.valor_impuesto, v.total, v.estado_pago
         FROM ventas v
         JOIN clientes c ON c.id = v.cliente_id
         ${whereClause}
         ORDER BY v.fecha_venta DESC`,
        params
      );
      csv = 'Numero Venta,Fecha,Documento,Cliente,Subtotal,Descuento,Impuesto,Total,Estado Pago\n' +
        rows.rows.map((r) => `"${r.numero_venta}","${new Date(r.fecha_venta).toISOString()}","${r.numero_documento}","${String(r.cliente).trim()}",${r.subtotal},${r.descuento},${r.valor_impuesto},${r.total},"${r.estado_pago}"`).join('\n');
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ventasmart_reporte_${type}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    next(err);
  }
});
