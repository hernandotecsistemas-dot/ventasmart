import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiFetch, setSessionToken } from '../lib/api';
import { signInWithGooglePopup } from '../lib/firebaseAuth';
import { User } from '../types';

interface Props {
  onLoginSuccess: (user: User, message: string) => void;
}

export function LoginView({ onLoginSuccess }: Props) {
  const [email, setEmail] = useState('admin@ventasmart.co');
  const [password, setPassword] = useState('Admin2026*');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ user: User; token?: string; message: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.token) setSessionToken(res.token);
      onLoginSuccess(res.user, res.message);
    } catch (err: any) {
      setError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setGoogleLoading(true);
    try {
      const { accessToken } = await signInWithGooglePopup();
      const res = await apiFetch<{ user: User; token?: string; message: string }>('/api/auth/google', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      if (res.token) setSessionToken(res.token);
      onLoginSuccess(res.user, res.message);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Se cerró la ventana de selección de cuenta de Google.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('El navegador bloqueó la ventana emergente de Google. Permite ventanas emergentes e intenta de nuevo.');
      } else {
        setError(err.message || 'No se pudo completar el inicio de sesión con Google.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  function fillCredentials(role: 'admin' | 'cajero') {
    if (role === 'admin') {
      setEmail('admin@ventasmart.co');
      setPassword('Admin2026*');
    } else {
      setEmail('cajero@ventasmart.co');
      setPassword('Cajero2026*');
    }
    setError('');
  }

  return (
    <div className="min-h-screen bg-[#0B111E] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#111A2C] border border-[#1E293B] rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-11 h-11 rounded-xl bg-[#2563EB] flex items-center justify-center shadow-lg shadow-[#2563EB]/25">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6L12 18L20 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 6L12 12L16 6" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">VentaSmart</h1>
            <p className="text-xs font-medium text-[#60A5FA]">Sistema Empresarial de Ventas</p>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">Iniciar Sesión</h2>
          <p className="text-sm text-[#94A3B8] mt-1">
            Accede con tu cuenta de Google (Gmail) o tus credenciales corporativas.
          </p>
        </div>

        {error && (
          <div className="mb-5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#DC2626]/12 border border-[#DC2626]/35 text-[#FCA5A5] text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#EF4444]" />
            <span>{error}</span>
          </div>
        )}

        {/* Official Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-[#F8FAFC] disabled:opacity-60 text-[#1F2937] text-sm font-semibold rounded-lg border border-[#E2E8F0] shadow-sm transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
          <span>{googleLoading ? 'Conectando con Google...' : 'Iniciar sesión con Google'}</span>
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#1E293B]" />
          <span className="text-xs text-[#64748B]">o ingresa con correo y contraseña</span>
          <div className="flex-1 h-px bg-[#1E293B]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
              Correo Electrónico Corporativo
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.co"
                className="w-full pl-10 pr-4 py-2.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <span>{loading ? 'Verificando credenciales...' : 'Ingresar a VentaSmart'}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#1E293B]">
          <p className="text-xs text-[#94A3B8] mb-2.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>Accesos de prueba configurados en PostgreSQL:</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillCredentials('admin')}
              className="text-left px-3 py-2 rounded-lg bg-[#0B111E] border border-[#1E293B] hover:border-[#2563EB]/60 transition-colors cursor-pointer"
            >
              <span className="block text-xs font-semibold text-white">Administrador</span>
              <span className="block text-[11px] text-[#64748B] truncate">admin@ventasmart.co</span>
            </button>
            <button
              type="button"
              onClick={() => fillCredentials('cajero')}
              className="text-left px-3 py-2 rounded-lg bg-[#0B111E] border border-[#1E293B] hover:border-[#2563EB]/60 transition-colors cursor-pointer"
            >
              <span className="block text-xs font-semibold text-white">Vendedor / Caja</span>
              <span className="block text-[11px] text-[#64748B] truncate">cajero@ventasmart.co</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
