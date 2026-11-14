import React, { useEffect, useState } from 'react';
import { Building2, Save, UserPlus, Shield, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Configuracion, User } from '../types';

interface Props {
  user: User;
  config: Configuracion | null;
  onConfigUpdated: (cfg: Configuracion) => void;
  onNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
}

export function ConfiguracionView({ user, config, onConfigUpdated, onNotify }: Props) {
  const isAdmin = user.rol === 'Administrador';

  const [form, setForm] = useState({
    nombre_empresa: config?.nombre_empresa || '',
    nit_empresa: config?.nit_empresa || '',
    direccion_empresa: config?.direccion_empresa || '',
    telefono_empresa: config?.telefono_empresa || '',
    email_empresa: config?.email_empresa || '',
    porcentaje_impuesto_default: String(Number(config?.porcentaje_impuesto_default ?? 19)),
    prefijo_venta: config?.prefijo_venta || 'VS',
    moneda: config?.moneda || 'COP',
    nota_comprobante: config?.nota_comprobante || '',
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    rol: 'Vendedor',
  });
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        nombre_empresa: config.nombre_empresa,
        nit_empresa: config.nit_empresa,
        direccion_empresa: config.direccion_empresa,
        telefono_empresa: config.telefono_empresa,
        email_empresa: config.email_empresa,
        porcentaje_impuesto_default: String(Number(config.porcentaje_impuesto_default)),
        prefijo_venta: config.prefijo_venta,
        moneda: config.moneda,
        nota_comprobante: config.nota_comprobante,
      });
    }
  }, [config]);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch<{ users: User[] }>('/api/auth/users')
      .then((res) => setUsers(res.users))
      .catch(() => {});
  }, [isAdmin]);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await apiFetch<{ configuracion: Configuracion; message: string }>(
        '/api/configuracion',
        {
          method: 'PUT',
          body: JSON.stringify({
            ...form,
            porcentaje_impuesto_default: Number(form.porcentaje_impuesto_default),
          }),
        }
      );
      onConfigUpdated(res.configuracion);
      onNotify('success', res.message);
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreatingUser(true);
    try {
      const res = await apiFetch<{ user: User; message: string }>('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setUsers((prev) => [...prev, res.user]);
      setNewUser({ nombre: '', apellido: '', email: '', password: '', rol: 'Vendedor' });
      onNotify('success', res.message);
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleToggleUser(u: User) {
    try {
      const res = await apiFetch<{ user: User; message: string }>(`/api/auth/users/${u.id}/toggle`, {
        method: 'PATCH',
      });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? res.user : x)));
      onNotify('success', res.message);
    } catch (err: any) {
      onNotify('error', err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Configuración del Sistema</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Parámetros del negocio para comprobantes PDF, impuestos predeterminados y control de usuarios.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Business Settings */}
        <div className="lg:col-span-7 bg-[#111A2C] border border-[#1E293B] rounded-xl p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Building2 className="w-5 h-5 text-[#60A5FA]" />
            <h2 className="text-base font-bold text-white">Información Comercial y Comprobantes</h2>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Razón Social / Nombre Empresa
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={form.nombre_empresa}
                  onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  NIT / Identificación Fiscal
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={form.nit_empresa}
                  onChange={(e) => setForm({ ...form, nit_empresa: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Teléfono
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={form.telefono_empresa}
                  onChange={(e) => setForm({ ...form, telefono_empresa: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Correo Corporativo
                </label>
                <input
                  type="email"
                  disabled={!isAdmin}
                  value={form.email_empresa}
                  onChange={(e) => setForm({ ...form, email_empresa: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white disabled:opacity-60"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Dirección Comercial
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={form.direccion_empresa}
                  onChange={(e) => setForm({ ...form, direccion_empresa: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Impuesto Predeterminado (% IVA)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  disabled={!isAdmin}
                  value={form.porcentaje_impuesto_default}
                  onChange={(e) => setForm({ ...form, porcentaje_impuesto_default: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Prefijo Consecutivo de Venta
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={form.prefijo_venta}
                  onChange={(e) => setForm({ ...form, prefijo_venta: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-sm text-white font-mono disabled:opacity-60"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Nota Legal del Comprobante Interno
                </label>
                <textarea
                  rows={2}
                  disabled={!isAdmin}
                  value={form.nota_comprobante}
                  onChange={(e) => setForm({ ...form, nota_comprobante: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B111E] border border-[#1E293B] rounded-lg text-xs text-white disabled:opacity-60"
                />
              </div>
            </div>

            {isAdmin ? (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingConfig ? 'Guardando...' : 'Guardar Configuración'}</span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#FBBF24]">
                Solo usuarios con rol Administrador pueden modificar la configuración comercial.
              </p>
            )}
          </form>
        </div>

        {/* User & Role Management (Admin Only) */}
        <div className="lg:col-span-5 bg-[#111A2C] border border-[#1E293B] rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#60A5FA]" />
            <h2 className="text-base font-bold text-white">Usuarios y Roles</h2>
          </div>

          {!isAdmin ? (
            <p className="text-xs text-[#94A3B8]">
              Tu sesión actual tiene rol <strong className="text-white">{user.rol}</strong>. Contacta
              a un administrador para gestionar cuentas de equipo.
            </p>
          ) : (
            <>
              <form onSubmit={handleCreateUser} className="space-y-3 p-4 rounded-xl bg-[#0B111E] border border-[#1E293B]">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>Crear Nuevo Usuario</span>
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Nombre"
                    value={newUser.nombre}
                    onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                    className="px-3 py-2 bg-[#111A2C] border border-[#1E293B] rounded-lg text-xs text-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Apellido"
                    value={newUser.apellido}
                    onChange={(e) => setNewUser({ ...newUser, apellido: e.target.value })}
                    className="px-3 py-2 bg-[#111A2C] border border-[#1E293B] rounded-lg text-xs text-white"
                  />
                </div>
                <input
                  type="email"
                  required
                  placeholder="correo@empresa.co"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#111A2C] border border-[#1E293B] rounded-lg text-xs text-white"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Contraseña (mín 6)"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="px-3 py-2 bg-[#111A2C] border border-[#1E293B] rounded-lg text-xs text-white"
                  />
                  <select
                    value={newUser.rol}
                    onChange={(e) => setNewUser({ ...newUser, rol: e.target.value })}
                    className="px-3 py-2 bg-[#111A2C] border border-[#1E293B] rounded-lg text-xs text-white"
                  >
                    <option value="Vendedor">Vendedor</option>
                    <option value="Cajero">Cajero</option>
                    <option value="Administrador">Administrador</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="w-full py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-semibold text-white cursor-pointer"
                >
                  {creatingUser ? 'Creando...' : 'Agregar Usuario'}
                </button>
              </form>

              <div className="divide-y divide-[#1E293B]">
                {users.map((u) => (
                  <div key={u.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate flex items-center gap-1.5">
                        <span>
                          {u.nombre} {u.apellido}
                        </span>
                        {u.activo && <CheckCircle2 className="w-3 h-3 text-[#34D399]" />}
                      </p>
                      <p className="text-[11px] text-[#94A3B8] truncate">
                        {u.email} · {u.rol}
                      </p>
                    </div>
                    {u.id !== user.id && (
                      <button
                        onClick={() => handleToggleUser(u)}
                        className={`px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                          u.activo
                            ? 'border-[#DC2626]/30 text-[#F87171] hover:bg-[#DC2626]/10'
                            : 'border-[#16A36A]/30 text-[#34D399] hover:bg-[#16A36A]/10'
                        }`}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
