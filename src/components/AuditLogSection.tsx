import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatBuenosAiresDateTime } from '../lib/dateUtils';
import { AuditLogEntry } from '../types/database';
import {
  AlertCircle,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ShieldAlert,
} from 'lucide-react';

const ACTION_BADGE_CLASSES: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-800 border-blue-200',
  MOVE_DATE: 'bg-amber-100 text-amber-900 border-amber-300',
  DELETE: 'bg-red-100 text-red-800 border-red-200',
  USER_ADMIN: 'bg-purple-100 text-purple-800 border-purple-200',
};

export function AuditLogSection() {
  const { isAdmin, allProfiles } = useAuth();

  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [reloadTick, setReloadTick] = useState<number>(0);

  const [queryState, setQueryState] = useState<{
    key: string;
    rows: AuditLogEntry[];
    error: string | null;
  } | null>(null);

  const currentQueryKey = `${actionFilter}::${actorFilter}::${reloadTick}`;

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    void (async () => {
      try {
        let query = supabase
          .from('audit_log')
          .select(
            'id, created_at, actor_id, actor_name, entity_type, entity_id, action, old_data, new_data, summary'
          )
          .order('created_at', { ascending: false })
          .limit(100);

        if (actionFilter !== 'ALL') {
          query = query.eq('action', actionFilter);
        }
        if (actorFilter !== 'ALL') {
          query = query.eq('actor_id', actorFilter);
        }

        const { data, error } = await query;
        if (cancelled) return;

        if (error) {
          setQueryState({
            key: currentQueryKey,
            rows: [],
            error: error.message || 'No se pudo cargar el registro de auditoría.',
          });
          return;
        }

        setQueryState({
          key: currentQueryKey,
          rows: (data || []) as AuditLogEntry[],
          error: null,
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Error de conexión al cargar auditoría.';
        setQueryState({
          key: currentQueryKey,
          rows: [],
          error: msg,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, actionFilter, actorFilter, currentQueryKey]);

  const sortedActors = useMemo(
    () =>
      [...allProfiles].sort((a, b) => a.display_name.localeCompare(b.display_name, 'es')),
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
          Solo los perfiles con rol Administrador pueden consultar el registro de auditoría.
        </p>
      </div>
    );
  }

  const isLoading = queryState?.key !== currentQueryKey;
  const entries = queryState?.key === currentQueryKey ? queryState.rows : [];
  const loadError = queryState?.key === currentQueryKey ? queryState.error : null;

  const handleResetFilters = () => {
    setActionFilter('ALL');
    setActorFilter('ALL');
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-6 shadow-sm mb-6 w-full min-w-0 space-y-4">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-[#D6001C] shrink-0" />
            <span>Auditoría del Sistema</span>
          </h3>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            Últimos 100 eventos registrados en servidor (socios, horas, cierres y equipo)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setReloadTick((prev) => prev + 1)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#F7F3EE] hover:bg-neutral-100 border border-[#E2DBD0] text-xs font-black text-neutral-900 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#D6001C] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleResetFilters}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-neutral-50 border border-[#E2DBD0] text-xs font-bold text-neutral-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpiar filtros</span>
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-[#F7F3EE]/60 border border-[#E2DBD0] rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="audit-action-filter"
            className="block text-[11px] font-black uppercase text-neutral-600 mb-1 flex items-center gap-1"
          >
            <Filter className="w-3 h-3 text-[#D6001C]" />
            <span>Acción</span>
          </label>
          <select
            id="audit-action-filter"
            aria-label="Filtrar por acción"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C] cursor-pointer"
          >
            <option value="ALL">Todas las acciones</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="MOVE_DATE">MOVE_DATE</option>
            <option value="DELETE">DELETE</option>
            <option value="USER_ADMIN">USER_ADMIN</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="audit-actor-filter"
            className="block text-[11px] font-black uppercase text-neutral-600 mb-1"
          >
            Usuario / Actor
          </label>
          <select
            id="audit-actor-filter"
            aria-label="Filtrar por usuario"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E2DBD0] bg-white text-base sm:text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D6001C] cursor-pointer"
          >
            <option value="ALL">Todos los usuarios</option>
            {sortedActors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.is_active ? '' : ' (Inactivo)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#D6001C] shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-6 text-center text-xs font-bold text-neutral-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#D6001C]" />
          <span>Cargando registros de auditoría...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-center text-xs font-medium text-neutral-500 bg-[#F7F3EE]/50 rounded-xl border border-[#E2DBD0]">
          No se encontraron registros de auditoría para los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => {
            const badgeClass =
              ACTION_BADGE_CLASSES[entry.action] ||
              'bg-neutral-100 text-neutral-800 border-neutral-200';

            return (
              <article
                key={entry.id}
                data-audit-row={entry.id}
                className="rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/35 p-3.5 space-y-2 min-w-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${badgeClass}`}
                    >
                      {entry.action}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-[#E2DBD0] text-neutral-700">
                      {entry.entity_type}
                    </span>
                    <span className="text-xs font-bold text-neutral-800">
                      {entry.actor_name}
                    </span>
                  </div>

                  <span className="text-[11px] font-bold text-neutral-500">
                    {formatBuenosAiresDateTime(entry.created_at)}
                  </span>
                </div>

                <p className="text-xs font-semibold text-neutral-900 break-words">
                  {entry.summary}
                </p>

                {(entry.old_data || entry.new_data) && (
                  <details className="text-[11px] text-neutral-600">
                    <summary className="cursor-pointer font-bold hover:text-[#D6001C] select-none py-1">
                      Ver detalle técnico
                    </summary>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {entry.old_data && (
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase text-neutral-500 block mb-1">
                            Valor anterior
                          </span>
                          <pre className="overflow-x-auto text-[11px] max-w-full bg-neutral-900 text-neutral-100 p-2.5 rounded-lg">
                            {JSON.stringify(entry.old_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {entry.new_data && (
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase text-neutral-500 block mb-1">
                            Valor nuevo
                          </span>
                          <pre className="overflow-x-auto text-[11px] max-w-full bg-neutral-900 text-neutral-100 p-2.5 rounded-lg">
                            {JSON.stringify(entry.new_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AuditLogSection;
