import { Router } from 'express';
import { query } from '../db.ts';
import { requireAuth } from '../auth.ts';

export const productosRouter = Router();
productosRouter.use(requireAuth);

productosRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const categoria = typeof req.query.categoria === 'string' ? req.query.categoria.trim() : '';
    const estadoStock = typeof req.query.stock_filter === 'string' ? req.query.stock_filter.trim() : '';
    const includeInactive = req.query.incluir_inactivos === 'true';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!includeInactive) {
      conditions.push('activo = TRUE');
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(codigo ILIKE $${idx} OR nombre ILIKE $${idx} OR descripcion ILIKE $${idx})`);
    }

    if (categoria && categoria !== 'Todas') {
      params.push(categoria);
      conditions.push(`categoria = $${params.length}`);
    }

    if (estadoStock === 'bajo') {
      conditions.push('stock > 0 AND stock <= stock_minimo');
    } else if (estadoStock === 'agotado') {
      conditions.push('stock = 0');
    } else if (estadoStock === 'disponible') {
      conditions.push('stock > stock_minimo');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`SELECT * FROM productos ${whereClause} ORDER BY id DESC`, params);

    const catsRes = await query<{ categoria: string }>(
      'SELECT DISTINCT categoria FROM productos WHERE activo = TRUE ORDER BY categoria ASC'
    );

    res.json({
      productos: result.rows,
      categorias: catsRes.rows.map((r) => r.categoria),
    });
  } catch (err) {
    next(err);
  }
});

productosRouter.post('/', async (req, res, next) => {
  try {
    const {
      codigo,
      nombre,
      descripcion = '',
      categoria = 'General',
      precio_compra,
      precio_venta,
      stock = 0,
      stock_minimo = 5,
      ubicacion = 'Bodega Principal',
      imagen_key = '',
      activo = true,
    } = req.body as Record<string, unknown>;

    if (!String(codigo || '').trim() || !String(nombre || '').trim()) {
      return res.status(400).json({ error: 'Código y nombre del producto son obligatorios.' });
    }

    const pVenta = Number(precio_venta);
    const pCompra = precio_compra !== null && precio_compra !== undefined && precio_compra !== ''
      ? Number(precio_compra)
      : null;
    const stockInt = parseInt(String(stock), 10);
    const stockMinInt = parseInt(String(stock_minimo), 10);

    if (Number.isNaN(pVenta) || pVenta < 0) {
      return res.status(400).json({ error: 'El precio de venta debe ser un valor válido mayor o igual a 0.' });
    }
    if (pCompra !== null && (Number.isNaN(pCompra) || pCompra < 0)) {
      return res.status(400).json({ error: 'El precio de compra no puede ser negativo.' });
    }
    if (Number.isNaN(stockInt) || stockInt < 0) {
      return res.status(400).json({ error: 'La cantidad disponible no puede ser negativa.' });
    }
    if (Number.isNaN(stockMinInt) || stockMinInt < 0) {
      return res.status(400).json({ error: 'El stock mínimo no puede ser negativo.' });
    }

    const dup = await query('SELECT id FROM productos WHERE LOWER(codigo) = LOWER($1)', [String(codigo).trim()]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un producto con ese código SKU.' });
    }

    const inserted = await query(
      `INSERT INTO productos (codigo, nombre, descripcion, categoria, precio_compra, precio_venta, stock, stock_minimo, ubicacion, imagen_key, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        String(codigo).trim().toUpperCase(),
        String(nombre).trim(),
        String(descripcion).trim(),
        String(categoria).trim() || 'General',
        pCompra,
        pVenta,
        stockInt,
        stockMinInt,
        String(ubicacion).trim() || 'Bodega Principal',
        String(imagen_key).trim(),
        Boolean(activo),
      ]
    );

    const prod = inserted.rows[0];
    const warning = prod.stock <= prod.stock_minimo ? 'Producto con inventario bajo' : undefined;

    res.status(201).json({
      producto: prod,
      message: 'Producto agregado correctamente',
      warning,
    });
  } catch (err) {
    next(err);
  }
});

productosRouter.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID de producto inválido.' });

    const {
      codigo,
      nombre,
      descripcion = '',
      categoria = 'General',
      precio_compra,
      precio_venta,
      stock,
      stock_minimo = 5,
      ubicacion = 'Bodega Principal',
      imagen_key = '',
      activo = true,
    } = req.body as Record<string, unknown>;

    if (!String(codigo || '').trim() || !String(nombre || '').trim()) {
      return res.status(400).json({ error: 'Código y nombre del producto son obligatorios.' });
    }

    const pVenta = Number(precio_venta);
    const pCompra = precio_compra !== null && precio_compra !== undefined && precio_compra !== ''
      ? Number(precio_compra)
      : null;
    const stockInt = parseInt(String(stock), 10);
    const stockMinInt = parseInt(String(stock_minimo), 10);

    if (Number.isNaN(pVenta) || pVenta < 0 || Number.isNaN(stockInt) || stockInt < 0 || Number.isNaN(stockMinInt) || stockMinInt < 0) {
      return res.status(400).json({ error: 'Verifique que los precios y cantidades no sean negativos.' });
    }

    const dup = await query(
      'SELECT id FROM productos WHERE LOWER(codigo) = LOWER($1) AND id <> $2',
      [String(codigo).trim(), id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe otro producto con ese código SKU.' });
    }

    const updated = await query(
      `UPDATE productos
       SET codigo = $1, nombre = $2, descripcion = $3, categoria = $4, precio_compra = $5,
           precio_venta = $6, stock = $7, stock_minimo = $8, ubicacion = $9, imagen_key = $10, activo = $11
       WHERE id = $12
       RETURNING *`,
      [
        String(codigo).trim().toUpperCase(),
        String(nombre).trim(),
        String(descripcion).trim(),
        String(categoria).trim() || 'General',
        pCompra,
        pVenta,
        stockInt,
        stockMinInt,
        String(ubicacion).trim() || 'Bodega Principal',
        String(imagen_key).trim(),
        Boolean(activo),
        id,
      ]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'El producto no existe' });
    }

    const prod = updated.rows[0];
    const warning = prod.stock <= prod.stock_minimo ? 'Producto con inventario bajo' : undefined;

    res.json({
      producto: prod,
      message: 'Producto actualizado correctamente',
      warning,
    });
  } catch (err) {
    next(err);
  }
});

productosRouter.patch('/:id/stock', async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const { ajuste, nuevo_stock } = req.body as { ajuste?: number; nuevo_stock?: number };

    const existing = await query<{ id: number; stock: number; stock_minimo: number }>(
      'SELECT id, stock, stock_minimo FROM productos WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'El producto no existe' });
    }

    const currentStock = existing.rows[0].stock;
    let targetStock = currentStock;

    if (nuevo_stock !== undefined) {
      targetStock = parseInt(String(nuevo_stock), 10);
    } else if (ajuste !== undefined) {
      targetStock = currentStock + parseInt(String(ajuste), 10);
    }

    if (Number.isNaN(targetStock) || targetStock < 0) {
      return res.status(400).json({ error: 'El inventario resultante no puede ser negativo.' });
    }

    const updated = await query(
      'UPDATE productos SET stock = $1 WHERE id = $2 RETURNING *',
      [targetStock, id]
    );

    const prod = updated.rows[0];
    const warning = prod.stock <= prod.stock_minimo ? 'Producto con inventario bajo' : undefined;

    res.json({
      producto: prod,
      message: 'Existencias actualizadas correctamente',
      warning,
    });
  } catch (err) {
    next(err);
  }
});
