import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { normalizeUsername } from '../lib/authUtils';
import { AdminTeamManagerRequest, AdminTeamManagerResponse, TeamMember } from '../types/database';
import {
  AlertCircle,
  Check,
  Edit3,
  KeyRound,
  Plus,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';

async function invokeAdminTeamManager(
  payload: AdminTeamManagerRequest
): Promise<{ data: AdminTeamManagerResponse | null; error: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      data: null,
      error: 'Tu sesión expiró. Volvé a iniciar sesión para continuar.',
    };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return {
      data: null,
      error: 'Configuración de Supabase incompleta en el cliente.',
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-team-manager`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json().catch(() => null)) as AdminTeamManagerResponse | null;
    if (!response.ok || (json && 'error' in json && json.error)) {
      const serverErr =
        json && 'error' in json && typeof json.error === 'string'
          ? json.error
          : `Error del servidor (${response.status}).`;
      return { data: null, error: serverErr };
    }

    return { data: json, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de conexión con el servidor.';
    return { data: null, error: msg };
  }
}

export function TeamManagementSection() {
  const { isAdmin, allProfiles, profile, refreshTeamMembers } = useAuth();

  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createUsername, setCreateUsername] = useState<string>('');
  const [createFullName, setCreateFullName] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [createRole, setCreateRole] = useState<'captador' | 'admin'>('captador');

  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editFullName, setEditFullName] = useState<string>('');
  const [editRole, setEditRole] = useState<'captador' | 'admin'>('captador');

  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);

  const sortedProfiles = useMemo(
    () =>
      [...allProfiles].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.display_name.localeCompare(b.display_name, 'es');
      }),
    [allProfiles]
  );

  const activeCount = useMemo(
    () => allProfiles.filter((m) => m.is_active).length,
    [allProfiles]
  );

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-[#E2DBD0] p-6 shadow-sm text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-[#D6001C] mx-auto" />
        <h3 className="text-sm font-black text-neutral-900 uppercase">
          Acceso restringido a administradores
        </h3>
        <p className="text-xs text-neutral-600">
          Solo los perfiles con rol Administrador pueden gestionar las cuentas del equipo.
        </p>
      </div>
    );
  }

  const openCreateForm = () => {
    setEditingMember(null);
    setResetTarget(null);
    setFormError(null);
    setFeedback(null);
    setCreateUsername('');
    setCreateFullName('');
    setCreatePassword('');
    setCreateRole('captador');
    setIsCreateOpen((prev) => !prev);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    setFeedback(null);

    const cleanFullName = createFullName.trim();
    const cleanUsername = normalizeUsername(createUsername);

    if (cleanUsername.length < 2) {
      setFormError('El nombre de usuario debe tener al menos 2 caracteres válidos.');
      return;
    }
    if (cleanFullName.length < 2) {
      setFormError('El nombre completo debe tener al menos 2 caracteres.');
      return;
    }
    if (createPassword.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await invokeAdminTeamManager({
      action: 'create_member',
      username: cleanUsername,
      full_name: cleanFullName,
      password: createPassword,
      role: createRole,
      is_active: true,
    });
    setIsSubmitting(false);

    if (error) {
      setFormError(error);
      return;
    }

    await refreshTeamMembers();
    setIsCreateOpen(false);
    setCreateUsername('');
    setCreateFullName('');
    setCreatePassword('');
    setFeedback({
      type: 'success',
      message: `Integrante ${cleanFullName} (@${cleanUsername}) creado correctamente.`,
    });
  };

  const openEditForm = (member: TeamMember) => {
    setIsCreateOpen(false);
    setResetTarget(null);
    setFormError(null);
    setFeedback(null);
    setEditingMember(member);
    setEditFullName(member.display_name);
    setEditRole(member.role === 'ADMIN' ? 'admin' : 'captador');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || isSubmitting) return;
    setFormError(null);
    setFeedback(null);

    const cleanFullName = editFullName.trim();
    if (cleanFullName.length < 2) {
      setFormError('El nombre completo debe tener al menos 2 caracteres.');
      return;
    }

    const isSelf = editingMember.id === profile?.id;
    if (isSelf && editRole !== 'admin') {
      setFormError('No podés quitar el rol de administrador a tu propia cuenta.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await invokeAdminTeamManager({
      action: 'update_member',
      user_id: editingMember.id,
      full_name: cleanFullName,
      role: editRole,
    });
    setIsSubmitting(false);

    if (error) {
      setFormError(error);
      return;
    }

    await refreshTeamMembers();
    setEditingMember(null);
    setFeedback({
      type: 'success',
      message: `Datos de ${cleanFullName} actualizados correctamente.`,
    });
  };

  const handleToggleActive = async (member: TeamMember) => {
    if (pendingUserId) return;
    setFeedback(null);

    const isSelf = member.id === profile?.id;
    if (isSelf && member.is_active) {
      setFeedback({
        type: 'error',
        message: 'No podés desactivar ni quitar el rol de administrador a tu propia cuenta.',
      });
      return;
    }

    setPendingUserId(member.id);
    const nextActive = !member.is_active;
    const { error } = await invokeAdminTeamManager({
      action: 'update_member',
      user_id: member.id,
      is_active: nextActive,
    });
    setPendingUserId(null);

    if (error) {
      setFeedback({ type: 'error', message: error });
      return;
    }

    await refreshTeamMembers();
    setFeedback({
      type: 'success',
      message: nextActive
        ? `Integrante ${member.display_name} reactivado.`
        : `Integrante ${member.display_name} desactivado.`,
    });
  };

  const openResetModal = (member: TeamMember) => {
    setIsCreateOpen(false);
    setEditingMember(null);
    setFormError(null);
    setFeedback(null);
    setResetTarget(member);
    setResetPasswordVal('');
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || isSubmitting) return;
    setFormError(null);

    if (resetPasswordVal.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await invokeAdminTeamManager({
      action: 'reset_password',
      user_id: resetTarget.id,
      password: resetPasswordVal,
    });
    setIsSubmitting(false);

    if (error) {
      setFormError(error);
      return;
    }

    const updatedName = resetTarget.display_name;
    setResetTarget(null);
    setResetPasswordVal('');
    await refreshTeamMembers();
    setFeedback({
      type: 'success',
      message: `Contraseña de ${updatedName} restablecida correctamente.`,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-6 shadow-sm mb-6 w-full min-w-0 space-y-4">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D6001C] shrink-0" />
            <span>Gestión de Equipo</span>
          </h3>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            {allProfiles.length} integrantes totales •{' '}
            <strong className="text-neutral-800">{activeCount} activos</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D6001C] hover:bg-[#b80017] text-white font-black text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
        >
          {isCreateOpen ? (
            <>
              <X className="w-4 h-4 shrink-0" />
              <span>Cerrar formulario</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 shrink-0" />
              <span>Nuevo integrante</span>
            </>
          )}
        </button>
      </div>

      {/* FEEDBACK GENERAL */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-xl border flex items-start gap-2 text-xs font-bold ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-300 text-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0 mt-0.5" />
          ) : (
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* FORMULARIO DE ALTA */}
      {isCreateOpen && (
        <form
          noValidate
          onSubmit={handleCreateSubmit}
          className="bg-[#F7F3EE]/80 border border-[#E2DBD0] rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#D6001C] shrink-0" />
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900">
              Alta de nuevo integrante
            </h4>
          </div>

          {formError && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="create-member-username"
                className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
              >
                Usuario
              </label>
              <input
                id="create-member-username"
                type="text"
                placeholder="Usuario (ej: juan.perez)"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
            </div>

            <div>
              <label
                htmlFor="create-member-fullname"
                className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
              >
                Nombre completo
              </label>
              <input
                id="create-member-fullname"
                type="text"
                placeholder="Nombre completo"
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
            </div>

            <div>
              <label
                htmlFor="create-member-password"
                className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
              >
                Contraseña inicial
              </label>
              <input
                id="create-member-password"
                type="password"
                placeholder="Contraseña (mín. 8 caracteres)"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
            </div>

            <div>
              <label
                htmlFor="create-member-role"
                className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
              >
                Rol
              </label>
              <select
                id="create-member-role"
                aria-label="Rol del nuevo integrante"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as 'captador' | 'admin')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C] cursor-pointer"
              >
                <option value="captador">Captador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsCreateOpen(false);
                setFormError(null);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#E2DBD0] text-xs font-bold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              {isSubmitting ? 'Creando...' : 'Crear integrante'}
            </button>
          </div>
        </form>
      )}

      {/* FORMULARIO DE EDICIÓN (ÚNICO ACTIVO A LA VEZ) */}
      {editingMember && (
        <form
          noValidate
          onSubmit={handleEditSubmit}
          className="bg-[#F7F3EE]/80 border-2 border-[#D6001C]/30 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900">
              Editar integrante: {editingMember.display_name} (@{editingMember.username})
            </h4>
          </div>

          {formError && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-member-role"
                className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
              >
                Rol
              </label>
              <select
                id="edit-member-role"
                aria-label="Rol del integrante"
                disabled={editingMember.id === profile?.id}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as 'captador' | 'admin')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white disabled:bg-neutral-100 text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C] cursor-pointer"
              >
                <option value="captador">Captador</option>
                <option value="admin">Administrador</option>
              </select>
              {editingMember.id === profile?.id && (
                <p className="text-[10px] text-neutral-500 mt-1">
                  No podés modificar tu propio rol de administrador.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-member-fullname"
                className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
              >
                Nombre completo
              </label>
              <input
                id="edit-member-fullname"
                type="text"
                placeholder="Nombre completo"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditingMember(null);
                setFormError(null);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#E2DBD0] text-xs font-bold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}

      {/* LISTA UNIFICADA DE INTEGRANTES (SIN DIVS ANIDADOS EN EL NOMBRE/USUARIO) */}
      <ul className="space-y-2.5">
        {sortedProfiles.map((member) => {
          const isSelf = member.id === profile?.id;
          const isBusy = pendingUserId === member.id;

          return (
            <li key={member.id}>
              <div
                className={`rounded-xl border p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                  member.is_active
                    ? 'bg-white border-[#E2DBD0]'
                    : 'bg-neutral-50 border-neutral-200 opacity-85'
                }`}
              >
                <p className="text-xs sm:text-sm text-neutral-900 flex flex-wrap items-center gap-2 min-w-0">
                  <strong className="font-black text-neutral-900">{member.display_name}</strong>
                  <span className="text-xs font-mono text-neutral-500">@{member.username}</span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                      member.role === 'ADMIN'
                        ? 'bg-[#D6001C]/10 text-[#D6001C] border border-[#D6001C]/20'
                        : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                    }`}
                  >
                    {member.role === 'ADMIN' ? 'Admin' : 'Captador'}
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                      member.is_active
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-neutral-200 text-neutral-700 border border-neutral-300'
                    }`}
                  >
                    {member.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                  {isSelf && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-neutral-900 text-white">
                      Tu cuenta
                    </span>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(member)}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/80 hover:bg-[#F7F3EE] text-xs font-bold text-neutral-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 shrink-0" />
                    <span>Editar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openResetModal(member)}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white hover:bg-neutral-50 text-xs font-bold text-neutral-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    <span>Restablecer clave</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || (isSelf && member.is_active)}
                    title={
                      isSelf && member.is_active
                        ? 'No podés desactivar tu propia cuenta'
                        : member.is_active
                          ? `Desactivar a ${member.display_name}`
                          : `Reactivar a ${member.display_name}`
                    }
                    onClick={() => handleToggleActive(member)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      member.is_active
                        ? 'border-red-200 bg-red-50 hover:bg-red-100 text-red-800'
                        : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {member.is_active ? (
                      <>
                        <UserX className="w-3.5 h-3.5 shrink-0" />
                        <span>Desactivar</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Reactivar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* MODAL RESTABLECER CONTRASEÑA (SIEMPRE AL FINAL DEL COMPONENTE) */}
      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-password-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            noValidate
            onSubmit={handleResetPasswordSubmit}
            className="bg-white rounded-2xl border border-[#E2DBD0] max-w-md w-full p-5 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h4
                id="reset-password-title"
                className="text-sm font-black text-neutral-900 uppercase tracking-wider"
              >
                Restablecer contraseña
              </h4>
              <button
                type="button"
                aria-label="Cerrar modal"
                onClick={() => {
                  setResetTarget(null);
                  setFormError(null);
                }}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-600">
              Definí una nueva contraseña para{' '}
              <strong className="text-neutral-900">{resetTarget.display_name}</strong> (@
              {resetTarget.username}).
            </p>

            {formError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="reset-password-input"
                className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
              >
                Nueva contraseña
              </label>
              <input
                id="reset-password-input"
                type="password"
                placeholder="Nueva contraseña (mín. 8 caracteres)"
                value={resetPasswordVal}
                onChange={(e) => setResetPasswordVal(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/60 text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setResetTarget(null);
                  setFormError(null);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#E2DBD0] text-xs font-bold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                {isSubmitting ? 'Guardando...' : 'Confirmar nueva contraseña'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default TeamManagementSection;
