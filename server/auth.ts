import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction, Router } from 'express';
import { query } from './db.ts';

const SESSION_COOKIE = 'vs_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ventasmart-dev-fallback-secret-change-in-env';

export interface AuthUser {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  activo: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function signToken(payload: { uid: number; exp: number }): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): { uid: number; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const token = bearerToken || req.cookies?.[SESSION_COOKIE] || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Sesión no iniciada. Por favor inicie sesión.' });
  }
  const verified = verifyToken(token);
  if (!verified) {
    return res.status(401).json({ error: 'Sesión expirada o inválida.' });
  }

  try {
    const result = await query<AuthUser>(
      'SELECT id, nombre, apellido, email, rol, activo FROM usuarios WHERE id = $1',
      [verified.uid]
    );
    const user = result.rows[0];
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado.' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tiene permisos suficientes para realizar esta acción.' });
    }
    next();
  };
}

export const authRouter = Router();

function setSessionCookie(req: Request, res: Response, token: string) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Debe ingresar correo electrónico y contraseña.' });
    }

    const result = await query<AuthUser & { password_hash: string }>(
      'SELECT id, nombre, apellido, email, password_hash, rol, activo FROM usuarios WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    if (!user.activo) {
      return res.status(403).json({ error: 'El usuario se encuentra desactivado.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = signToken({ uid: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    setSessionCookie(req, res, token);

    const { password_hash: _, ...safeUser } = user;
    res.json({ user: safeUser, token, message: `Bienvenido a VentaSmart, ${safeUser.nombre}` });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/google', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearerToken || (typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '');

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación de Google requerido.' });
    }

    // Verify access token directly with Google UserInfo API
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!googleRes.ok) {
      return res.status(401).json({ error: 'El token de Google es inválido o ha expirado.' });
    }

    const profile = (await googleRes.json()) as {
      email?: string;
      email_verified?: boolean;
      given_name?: string;
      family_name?: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email || profile.email_verified === false) {
      return res.status(401).json({ error: 'La cuenta de Google no tiene un correo verificado.' });
    }

    const emailNormalized = profile.email.trim().toLowerCase();
    const existingRes = await query<AuthUser>(
      'SELECT id, nombre, apellido, email, rol, activo FROM usuarios WHERE LOWER(email) = $1',
      [emailNormalized]
    );

    let user = existingRes.rows[0];

    if (user) {
      if (!user.activo) {
        return res.status(403).json({ error: 'Tu usuario se encuentra desactivado en VentaSmart.' });
      }
    } else {
      // Provision new user in Neon PostgreSQL for first-time Google login
      const nombre = (profile.given_name || profile.name?.split(' ')[0] || 'Usuario').trim().slice(0, 100);
      const apellido = (
        profile.family_name ||
        profile.name?.split(' ').slice(1).join(' ') ||
        'Google'
      ).trim().slice(0, 100);

      // Grant Administrador to the first Google-authenticated workspace user, Vendedor to subsequent users
      const googleCountRes = await query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM usuarios WHERE email LIKE '%@gmail.com'"
      );
      const isFirstGmailUser = parseInt(googleCountRes.rows[0]?.count || '0', 10) === 0;
      const assignedRole = isFirstGmailUser ? 'Administrador' : 'Vendedor';

      const randomSecret = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomSecret, 10);

      const created = await query<AuthUser>(
        `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol, activo)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, nombre, apellido, email, rol, activo`,
        [nombre, apellido, emailNormalized, passwordHash, assignedRole]
      );
      user = created.rows[0];
    }

    const sessionToken = signToken({ uid: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    setSessionCookie(req, res, sessionToken);

    res.json({
      user,
      token: sessionToken,
      message: `Sesión iniciada con Google: ${user.nombre} ${user.apellido}`,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE, {
    path: '/',
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
  res.json({ message: 'Sesión cerrada correctamente.' });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.get('/users', requireAuth, requireRole('Administrador'), async (_req, res, next) => {
  try {
    const result = await query<AuthUser & { fecha_creacion: string }>(
      'SELECT id, nombre, apellido, email, rol, activo, fecha_creacion FROM usuarios ORDER BY id ASC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/users', requireAuth, requireRole('Administrador'), async (req, res, next) => {
  try {
    const { nombre, apellido, email, password, rol } = req.body as {
      nombre?: string;
      apellido?: string;
      email?: string;
      password?: string;
      rol?: string;
    };

    if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password || password.length < 6) {
      return res.status(400).json({ error: 'Complete todos los campos obligatorios (contraseña mínimo 6 caracteres).' });
    }

    const allowedRoles = ['Administrador', 'Vendedor', 'Cajero'];
    const safeRole = rol && allowedRoles.includes(rol) ? rol : 'Vendedor';

    const exists = await query('SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const created = await query<AuthUser>(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, nombre, apellido, email, rol, activo`,
      [nombre.trim(), apellido.trim(), email.trim().toLowerCase(), hash, safeRole]
    );

    res.status(201).json({ user: created.rows[0], message: 'Usuario creado correctamente.' });
  } catch (err) {
    next(err);
  }
});

authRouter.patch('/users/:id/toggle', requireAuth, requireRole('Administrador'), async (req, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });
    if (req.user && req.user.id === id) {
      return res.status(400).json({ error: 'No puede desactivar su propia cuenta activa.' });
    }
    const updated = await query<AuthUser>(
      'UPDATE usuarios SET activo = NOT activo WHERE id = $1 RETURNING id, nombre, apellido, email, rol, activo',
      [id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ user: updated.rows[0], message: 'Estado del usuario actualizado.' });
  } catch (err) {
    next(err);
  }
});
