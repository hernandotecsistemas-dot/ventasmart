import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './server/db.ts';
import { authRouter } from './server/auth.ts';
import { clientesRouter } from './server/routes/clientes.ts';
import { productosRouter } from './server/routes/productos.ts';
import { ventasRouter } from './server/routes/ventas.ts';
import { pagosRouter } from './server/routes/pagos.ts';
import { facturasRouter } from './server/routes/facturas.ts';
import { reportesRouter } from './server/routes/reportes.ts';
import { configuracionRouter } from './server/routes/configuracion.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Initialize Neon PostgreSQL schema & initial seed if needed
  try {
    await initDatabase();
    console.log('[VentaSmart] Base de datos Neon PostgreSQL verificada y lista.');
  } catch (err) {
    console.error('[VentaSmart] Error al inicializar Neon PostgreSQL:', err);
  }

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/clientes', clientesRouter);
  app.use('/api/productos', productosRouter);
  app.use('/api/ventas', ventasRouter);
  app.use('/api/pagos', pagosRouter);
  app.use('/api/facturas', facturasRouter);
  app.use('/api/reportes', reportesRouter);
  app.use('/api/configuracion', configuracionRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'VentaSmart ERP' });
  });

  // Global API error handler
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API Error]', err);
    res.status(err?.status || 500).json({
      error: err?.message || 'Error interno en el servidor.',
    });
  });

  // Vite middleware for dev or static dist for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VentaSmart] Servidor ejecutándose en http://0.0.0.0:${PORT}`);
  });
}

startServer();
