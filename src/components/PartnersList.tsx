import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHOD_CONFIG, Partner } from '../types/database';
import { formatPesos, formatBuenosAiresDateTime } from '../lib/stats';
import { Trash2, AlertCircle, Search, Filter } from 'lucide-react';

export const PartnersList: React.FC = () => {
  const { partners, deletePartner, isViewingHistory, activeWorkDay } = useWorkDay();
  const { currentMember, isAdmin } = useAuth();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterMemberId, setFilterMemberId] = useState<string>('ALL');

  const filtered = partners.filter((p) => {
    if (filterMemberId !== 'ALL' && p.team_member_id !== filterMemberId) {
      return false;
    }
    return true;
  });

  const handleDelete = async (partnerId: string) => {
    await deletePartner(partnerId);
    setConfirmDeleteId(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            LISTADO DE SOCIOS DE LA JORNADA
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-bold">
              {partners.length}
            </span>
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Numeración secuencial asignada automáticamente
          </p>
        </div>

        {/* Filtro por captador */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <select
            value={filterMemberId}
            onChange={(e) => setFilterMemberId(e.target.value)}
            className="text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
          >
            <option value="ALL">Todos los captadores</option>
            {Array.from(
              new Set(partners.map((p) => JSON.stringify({ id: p.team_member_id, name: p.team_member?.display_name })))
            ).map((jsonStr) => {
              const item = JSON.parse(jsonStr);
              return (
                <option key={item.id} value={item.id}>
                  {item.name || 'Captador'}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-neutral-200 rounded-xl">
          <p className="text-sm font-bold text-neutral-400">
            {partners.length === 0
              ? 'Aún no se han registrado socios en esta jornada.'
              : 'No hay socios para el filtro seleccionado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => {
            const config = PAYMENT_METHOD_CONFIG[p.payment_type] || {
              label: p.payment_type,
              points: p.points,
              badgeColor: 'bg-neutral-100 text-neutral-800',
            };

            const canDelete = isAdmin || p.team_member_id === currentMember?.id;
            const isConfirming = confirmDeleteId === p.id;

            return (
              <div
                key={p.id}
                className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-neutral-200 text-neutral-800 font-black text-xs flex items-center justify-center">
                    #{p.sequence_number}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-neutral-900">
                        {p.team_member?.display_name || 'Captador'}
                      </span>
                      <span className="text-[11px] font-bold text-neutral-500">
                        • {p.age} años
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${config.badgeColor}`}>
                        {config.label} ({p.points} pt{p.points === 1 ? '' : 's'})
                      </span>
                    </div>

                    <div className="text-[11px] text-neutral-400 mt-1">
                      {formatBuenosAiresDateTime(p.captured_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200/60">
                  <span className="text-sm font-black text-neutral-900">
                    {formatPesos(p.contribution_amount)}/mes
                  </span>

                  {canDelete && !isViewingHistory && activeWorkDay?.status === 'OPEN' && (
                    <div>
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="px-2 py-1 text-[11px] font-black bg-[#D6001C] text-white rounded-lg hover:bg-red-700"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[11px] font-bold bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          title="Eliminar socio"
                          className="p-1.5 text-neutral-400 hover:text-[#D6001C] rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

