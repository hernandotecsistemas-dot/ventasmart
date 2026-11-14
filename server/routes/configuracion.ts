import { Router } from 'express';
import { query } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';

export const configuracionRouter = Router();
configuracionRouter.use(requireAuth);

configuracionRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query('SELECT * FROM configuracion WHERE id = 1');
    res.json({ configuracion: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

configuracionRouter.put('/', requireRole('Administrador'), async (req, res, next) => {
  try {
    const {
      nombre_empresa,
      nit_empresa,
      direccion_empresa,
      telefono_empresa,
      email_empresa,
      porcentaje_impuesto_default,
      prefijo_venta,
      moneda,
      nota_comprobante,
    } = req.body as Record<string, unknown>;

    const taxPct = Number(porcentaje_impuesto_default ?? 19);
    if (Number.isNaN(taxPct) || taxPct < 0 || taxPct > 100) {
      return res.status(400).json({ error: 'El porcentaje de impuesto debe estar entre 0 y 100.' });
    }

    const updated = await query(
      `UPDATE configuracion
       SET nombre_empresa = $1, nit_empresa = $2, direccion_empresa = $3,
           telefono_empresa = $4, email_empresa = $5, porcentaje_impuesto_default = $6,
           prefijo_venta = $7, moneda = $8, nota_comprobante = $9
       WHERE id = 1
       RETURNING *`,
      [
        String(nombre_empresa || 'VentaSmart Comercial S.A.S.').trim(),
        String(nit_empresa || '901.456.789-1').trim(),
        String(direccion_empresa || '').trim(),
        String(telefono_empresa || '').trim(),
        String(email_empresa || '').trim(),
        taxPct,
        String(prefijo_venta || 'VS').trim().toUpperCase(),
        String(moneda || 'COP').trim().toUpperCase(),
        String(
          nota_comprobante ||
          'DOCUMENTO INTERNO DE SOPORTE COMERCIAL. NO ES UNA FACTURA ELECTRÓNICA VALIDADA POR LA DIAN.'
        ).trim(),
      ]
    );

    res.json({
      configuracion: updated.rows[0],
      message: 'Configuración comercial guardada correctamente.',
    });
  } catch (err) {
    next(err);
  }
});
