import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { query } from '../db.ts';
import { requireAuth } from '../auth.ts';

export const facturasRouter = Router();
facturasRouter.use(requireAuth);

function formatCurrency(value: number | string, currency = 'COP'): string {
  const num = Number(value || 0);
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

facturasRouter.get('/', async (req, res, next) => {
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

    const rowsRes = await query(
      `SELECT
         v.id,
         'COMP-' || SUBSTRING(v.numero_venta FROM 4) AS numero_comprobante,
         v.numero_venta,
         v.fecha_venta,
         v.subtotal,
         v.descuento,
         v.porcentaje_impuesto,
         v.valor_impuesto,
         v.total,
         v.estado_pago,
         c.id AS cliente_id,
         c.tipo_documento,
         c.numero_documento,
         c.nombres AS cliente_nombres,
         c.apellidos AS cliente_apellidos,
         u.nombre || ' ' || u.apellido AS vendedor_nombre,
         COALESCE(p_agg.total_pagado, 0)::numeric(14,2) AS total_pagado,
         (v.total - COALESCE(p_agg.total_pagado, 0))::numeric(14,2) AS saldo_pendiente,
         COALESCE(p_agg.ultimo_metodo, 'Sin pago inicial') AS metodo_pago
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
       ${whereClause}
       ORDER BY v.fecha_venta DESC, v.id DESC`,
      params
    );

    const kpiRes = await query<{
      total_facturado: string;
      total_cobrado: string;
      cartera_pendiente: string;
      total_comprobantes: number;
      pagadas: number;
      parciales: number;
      pendientes: number;
    }>(`
      SELECT
        COALESCE(SUM(v.total), 0)::numeric(14,2) AS total_facturado,
        COALESCE(SUM(COALESCE(p_agg.total_pagado, 0)), 0)::numeric(14,2) AS total_cobrado,
        COALESCE(SUM(v.total - COALESCE(p_agg.total_pagado, 0)), 0)::numeric(14,2) AS cartera_pendiente,
        COUNT(*)::int AS total_comprobantes,
        COUNT(*) FILTER (WHERE v.estado_pago = 'Pagada')::int AS pagadas,
        COUNT(*) FILTER (WHERE v.estado_pago = 'Parcialmente pagada')::int AS parciales,
        COUNT(*) FILTER (WHERE v.estado_pago = 'Pendiente')::int AS pendientes
      FROM ventas v
      LEFT JOIN (
        SELECT venta_id, SUM(valor) AS total_pagado FROM pagos GROUP BY venta_id
      ) p_agg ON p_agg.venta_id = v.id
    `);

    res.json({
      comprobantes: rowsRes.rows,
      resumen: kpiRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

facturasRouter.get('/:id/pdf', async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

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
         u.nombre || ' ' || u.apellido AS vendedor_nombre
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       JOIN usuarios u ON u.id = v.usuario_id
       WHERE v.id = $1`,
      [id]
    );

    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Comprobante no encontrado.' });
    }

    const venta = saleRes.rows[0];
    const itemsRes = await query('SELECT * FROM detalle_ventas WHERE venta_id = $1 ORDER BY id ASC', [id]);
    const paymentsRes = await query('SELECT * FROM pagos WHERE venta_id = $1 ORDER BY fecha_pago ASC', [id]);
    const configRes = await query('SELECT * FROM configuracion WHERE id = 1');
    const cfg = configRes.rows[0] || {
      nombre_empresa: 'VentaSmart Comercial S.A.S.',
      nit_empresa: '901.456.789-1',
      direccion_empresa: 'Calle 100 # 19A-45, Bogotá D.C.',
      telefono_empresa: '+57 601 745 8900',
      email_empresa: 'contacto@ventasmart.co',
      moneda: 'COP',
      nota_comprobante: 'DOCUMENTO INTERNO DE SOPORTE COMERCIAL. NO ES UNA FACTURA ELECTRÓNICA VALIDADA POR LA DIAN.',
    };

    const totalPagado = paymentsRes.rows.reduce((sum, p) => sum + Number(p.valor), 0);
    const saldoPendiente = Math.max(0, Number(venta.total) - totalPagado);
    const metodoPrincipal = paymentsRes.rows.length > 0
      ? paymentsRes.rows.map((p) => p.metodo_pago).join(', ')
      : 'Crédito / Pendiente de pago';

    const compNum = `COMP-${String(venta.numero_venta).replace(/^[A-Z]+-/, '')}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${compNum}_${venta.numero_venta}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    doc.pipe(res);

    // Header band
    doc.rect(0, 0, doc.page.width, 98).fill('#173B70');

    // Brand mark
    doc.roundedRect(42, 24, 38, 38, 6).fill('#2563EB');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('V', 54, 34);

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('VentaSmart', 92, 24);
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(9)
      .text(String(cfg.nombre_empresa), 92, 46)
      .text(`NIT / ID: ${cfg.nit_empresa} · ${cfg.telefono_empresa}`, 92, 58)
      .text(`${cfg.direccion_empresa} · ${cfg.email_empresa}`, 92, 70);

    // Document number box right
    doc.fillColor('#93C5FD').font('Helvetica-Bold').fontSize(9).text('COMPROBANTE INTERNO', 360, 24, { align: 'right', width: 192 });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14).text(compNum, 360, 38, { align: 'right', width: 192 });
    doc.fillColor('#E2E8F0').font('Helvetica').fontSize(9)
      .text(`Venta Consecutivo: ${venta.numero_venta}`, 360, 56, { align: 'right', width: 192 })
      .text(`Emisión: ${new Date(venta.fecha_venta).toLocaleString('es-CO')}`, 360, 69, { align: 'right', width: 192 });

    // Mandatory disclaimer banner
    doc.rect(42, 112, 510, 28).fill('#FEF3C7').stroke('#F59E0B');
    doc.fillColor('#92400E').font('Helvetica-Bold').fontSize(8)
      .text(
        String(cfg.nota_comprobante || 'DOCUMENTO INTERNO DE SOPORTE COMERCIAL. NO ES UNA FACTURA ELECTRÓNICA VALIDADA POR LA DIAN.'),
        50,
        122,
        { width: 494, align: 'center' }
      );

    // Client & Operation Info
    const infoTop = 154;
    doc.roundedRect(42, infoTop, 250, 88, 4).fill('#F8FAFC').stroke('#E2E8F0');
    doc.fillColor('#173B70').font('Helvetica-Bold').fontSize(9).text('DATOS DEL CLIENTE', 52, infoTop + 10);
    const clientFullName = `${venta.cliente_nombres} ${venta.cliente_apellidos || ''}`.trim();
    doc.fillColor('#172033').font('Helvetica-Bold').fontSize(10).text(clientFullName, 52, infoTop + 25, { width: 230 });
    doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
      .text(`${venta.tipo_documento}: ${venta.numero_documento}`, 52, infoTop + 40)
      .text(`Tel: ${venta.cliente_telefono || 'N/A'} · Email: ${venta.cliente_email || 'N/A'}`, 52, infoTop + 53, { width: 230 })
      .text(`Dirección: ${venta.cliente_direccion || 'N/A'} ${venta.cliente_ciudad ? `(${venta.cliente_ciudad})` : ''}`, 52, infoTop + 66, { width: 230 });

    doc.roundedRect(302, infoTop, 250, 88, 4).fill('#F8FAFC').stroke('#E2E8F0');
    doc.fillColor('#173B70').font('Helvetica-Bold').fontSize(9).text('INFORMACIÓN COMERCIAL', 312, infoTop + 10);
    doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
      .text(`Estado de Pago: ${venta.estado_pago}`, 312, infoTop + 26)
      .text(`Método de Pago: ${metodoPrincipal}`, 312, infoTop + 40, { width: 230 })
      .text(`Atendido por: ${venta.vendedor_nombre}`, 312, infoTop + 54)
      .text(`Moneda Operación: ${cfg.moneda || 'COP'}`, 312, infoTop + 68);

    // Items Table Header
    let y = 258;
    doc.rect(42, y, 510, 22).fill('#173B70');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5)
      .text('CÓDIGO', 50, y + 7, { width: 65 })
      .text('PRODUCTO / DESCRIPCIÓN', 118, y + 7, { width: 195 })
      .text('CANT.', 315, y + 7, { width: 42, align: 'right' })
      .text('P. UNITARIO', 362, y + 7, { width: 88, align: 'right' })
      .text('SUBTOTAL', 455, y + 7, { width: 90, align: 'right' });

    y += 22;
    itemsRes.rows.forEach((item, idx) => {
      if (y > 680) {
        doc.addPage();
        y = 50;
      }
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(42, y, 510, 22).fill(bg).stroke('#E2E8F0');
      doc.fillColor('#172033').font('Helvetica').fontSize(8.5)
        .text(String(item.producto_codigo), 50, y + 7, { width: 65 })
        .text(String(item.producto_nombre), 118, y + 7, { width: 195, ellipsis: true })
        .text(String(item.cantidad), 315, y + 7, { width: 42, align: 'right' })
        .text(formatCurrency(item.precio_unitario, ''), 362, y + 7, { width: 88, align: 'right' })
        .text(formatCurrency(item.subtotal, ''), 455, y + 7, { width: 90, align: 'right' });
      y += 22;
    });

    // Totals & Payment Summary
    y += 16;
    if (y > 620) {
      doc.addPage();
      y = 50;
    }

    // Left: Payment history
    doc.roundedRect(42, y, 270, 112, 4).fill('#F8FAFC').stroke('#E2E8F0');
    doc.fillColor('#173B70').font('Helvetica-Bold').fontSize(9).text('DETALLE DE PAGOS RECIBIDOS', 52, y + 10);
    if (paymentsRes.rows.length === 0) {
      doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text('No se registran abonos aplicados a esta venta.', 52, y + 30);
    } else {
      let py = y + 28;
      paymentsRes.rows.slice(0, 4).forEach((pay) => {
        doc.fillColor('#172033').font('Helvetica').fontSize(8)
          .text(
            `${pay.numero_recibo} · ${pay.metodo_pago} (${new Date(pay.fecha_pago).toLocaleDateString('es-CO')})`,
            52,
            py,
            { width: 175 }
          )
          .text(formatCurrency(pay.valor, ''), 225, py, { width: 78, align: 'right' });
        py += 16;
      });
    }

    // Right: Financial Summary
    doc.roundedRect(324, y, 228, 112, 4).fill('#F8FAFC').stroke('#E2E8F0');
    const sx = 334;
    const vx = 434;
    doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
      .text('Subtotal:', sx, y + 12)
      .text(formatCurrency(venta.subtotal, cfg.moneda), vx, y + 12, { width: 108, align: 'right' })
      .text('Descuento:', sx, y + 26)
      .text(`-${formatCurrency(venta.descuento, cfg.moneda)}`, vx, y + 26, { width: 108, align: 'right' })
      .text(`Impuesto (${venta.porcentaje_impuesto}%):`, sx, y + 40)
      .text(formatCurrency(venta.valor_impuesto, cfg.moneda), vx, y + 40, { width: 108, align: 'right' });

    doc.moveTo(sx, y + 56).lineTo(542, y + 56).stroke('#CBD5E1');

    doc.fillColor('#173B70').font('Helvetica-Bold').fontSize(10.5)
      .text('TOTAL VENTA:', sx, y + 62)
      .text(formatCurrency(venta.total, cfg.moneda), vx, y + 62, { width: 108, align: 'right' });

    doc.fillColor('#16A36A').font('Helvetica-Bold').fontSize(8.5)
      .text('Pagos Recibidos:', sx, y + 80)
      .text(formatCurrency(totalPagado, cfg.moneda), vx, y + 80, { width: 108, align: 'right' });

    doc.fillColor(saldoPendiente > 0 ? '#DC2626' : '#475569').font('Helvetica-Bold').fontSize(8.5)
      .text('Saldo Pendiente:', sx, y + 95)
      .text(formatCurrency(saldoPendiente, cfg.moneda), vx, y + 95, { width: 108, align: 'right' });

    // Footer legal note
    doc.fillColor('#64748B').font('Helvetica').fontSize(7.5)
      .text(
        `${cfg.nota_comprobante} · Generado por VentaSmart ERP el ${new Date().toLocaleString('es-CO')}.`,
        42,
        doc.page.height - 54,
        { width: 510, align: 'center' }
      );

    doc.end();
  } catch (err) {
    next(err);
  }
});
