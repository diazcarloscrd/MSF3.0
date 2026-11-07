import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHOD_CONFIG } from '../types/database';
import { formatPesos, formatBuenosAiresDateTime } from '../lib/stats';
import { Trash2, UserPlus, Clock, Award } from 'lucide-react';

export const TodayPartnersList: React.FC = () => {
  const { partners, deletePartner, activeWorkDay } = useWorkDay();
  const { currentMember, isAdmin } = useAuth();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (partnerId: string) => {
    await deletePartner(partnerId);
    setConfirmDeleteId(null);
  };

  const totalPoints = Number(partners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2));
  const totalAmount = Number(partners.reduce((sum, p) => sum + Number(p.contribution_amount || p.amount || 0), 0).toFixed(2));

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            SOCIOS CARGADOS HOY ({partners.length})
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Registros ingresados en la jornada en curso
          </p>
        </div>

        <div className="text-right flex items-center gap-2">
          <span className="text-xs font-black text-[#D6001C] bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl">
            {totalPoints} pts
          </span>
          <span className="text-xs font-black text-neutral-800 bg-[#F7F3EE] px-2.5 py-1 rounded-xl hidden sm:inline">
            {formatPesos(totalAmount)}
          </span>
        </div>
      </div>

      {partners.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-[#E2DBD0] rounded-xl bg-[#F7F3EE]/30">
          <UserPlus className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-xs font-black text-neutral-600">
            Todavía no se cargaron socios hoy.
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Completá el formulario de arriba y presioná <strong>+ AGREGAR SOCIO</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {partners.map((p) => {
            const config = PAYMENT_METHOD_CONFIG[p.payment_type] || {
              label: p.payment_type,
              points: p.points,
              badgeColor: 'bg-neutral-100 text-neutral-800',
            };

            const canDelete =
              isAdmin ||
              p.team_member_id === currentMember?.id ||
              p.created_by_name?.toLowerCase() === currentMember?.display_name.toLowerCase();

            const isConfirming = confirmDeleteId === p.id;

            return (
              <div
                key={p.id}
                className="p-3 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/40 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-neutral-200 text-neutral-800 font-black text-xs flex items-center justify-center">
                    #{p.sequence_number}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-neutral-900">
                        {p.created_by_name || p.team_member?.display_name || 'Captador'}
                      </span>
                      <span className="text-[10px] font-bold text-neutral-600 bg-white px-1.5 py-0.5 rounded border border-[#E2DBD0]">
                        {p.age} años
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${config.badgeColor}`}>
                        {config.label} ({p.points} pt{p.points === 1 ? '' : 's'})
                      </span>
                    </div>

                    <div className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatBuenosAiresDateTime(p.captured_at || p.created_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#E2DBD0]/60">
                  <span className="text-xs sm:text-sm font-black text-neutral-900">
                    {formatPesos(p.contribution_amount || p.amount)}/mes
                  </span>

                  {canDelete && (
                    <div>
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="px-2 py-0.5 text-[10px] font-black bg-[#D6001C] text-white rounded-lg hover:bg-red-700"
                          >
                            Eliminar
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 text-[10px] font-bold bg-neutral-200 text-neutral-700 rounded-lg"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          title="Eliminar socio"
                          className="p-1 text-neutral-400 hover:text-[#D6001C] rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
