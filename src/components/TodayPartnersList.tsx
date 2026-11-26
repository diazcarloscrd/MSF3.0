import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import {
  MovePartnersResult,
  PAYMENT_METHOD_CONFIG,
  Partner,
  PaymentMethodType,
} from '../types/database';
import { formatPesos, formatBuenosAiresDateTime, formatPoints } from '../lib/stats';
import { formatShortDate } from '../lib/dateUtils';
import { MoveDateModal } from './MoveDateModal';
import {
  Trash2,
  UserPlus,
  Clock,
  Edit2,
  Check,
  CalendarArrowUp,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';

function parseAmountInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  return parseFloat(normalized);
}

export const TodayPartnersList: React.FC = () => {
  const {
    partners,
    updatePartner,
    deletePartner,
    updateMemberHours,
    todayStr,
    selectedDate,
  } = useWorkDay();
  const { currentMember, isAdmin } = useAuth();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Estados de edición inline
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [editAge, setEditAge] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editPaymentType, setEditPaymentType] = useState<PaymentMethodType>('credit_card');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Estados de selección múltiple y movimiento de fecha
  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [partnersToMove, setPartnersToMove] = useState<Partner[]>([]);
  const [moveFeedback, setMoveFeedback] = useState<{
    movedCount: number;
    targetDate: string;
    ownersMissingHours: { userId: string; name: string }[];
  } | null>(null);
  const [isFixingMissingHours, setIsFixingMissingHours] = useState<boolean>(false);

  const canManagePartner = (p: Partner): boolean =>
    Boolean(currentMember && (isAdmin || p.created_by === currentMember.id));

  const manageablePartners = partners.filter(canManagePartner);
  const activeSelectedIds = selectedIds.filter((id) =>
    manageablePartners.some((p) => p.id === id)
  );

  const startEdit = (p: Partner) => {
    setActionError(null);
    setConfirmDeleteId(null);
    setEditingPartnerId(p.id);
    setEditAge(p.age.toString());
    setEditAmount((p.contribution_amount || p.amount || 0).toString());
    setEditPaymentType(p.payment_type);
  };

  const handleSaveEdit = async (partnerId: string) => {
    const ageNum = parseInt(editAge, 10);
    const amountNum = parseAmountInput(editAmount);
    if (isNaN(ageNum) || ageNum < 16 || ageNum > 99 || isNaN(amountNum) || amountNum <= 0) {
      setActionError('Verificá que la edad esté entre 16 y 99 años y el monto sea mayor a 0.');
      return;
    }

    setActionError(null);
    setIsSavingEdit(true);
    const { error } = await updatePartner(partnerId, {
      age: ageNum,
      amount: amountNum,
      paymentType: editPaymentType,
    });
    setIsSavingEdit(false);
    if (error) {
      setActionError(typeof error === 'string' ? error : 'No se pudo actualizar el socio.');
      return;
    }
    setEditingPartnerId(null);
  };

  const handleDelete = async (partnerId: string) => {
    setActionError(null);
    const { error } = await deletePartner(partnerId);
    setConfirmDeleteId(null);
    if (error) {
      setActionError(typeof error === 'string' ? error : 'No se pudo eliminar el socio.');
    }
  };

  const togglePartnerSelection = (partnerId: string) => {
    setSelectedIds((prev) =>
      prev.includes(partnerId)
        ? prev.filter((id) => id !== partnerId)
        : [...prev, partnerId]
    );
  };

  const handleMoveSuccess = (result: MovePartnersResult, targetDate: string) => {
    setSelectionMode(false);
    setSelectedIds([]);
    setPartnersToMove([]);
    setMoveFeedback({
      movedCount: result.movedCount,
      targetDate,
      ownersMissingHours: result.ownersMissingHours,
    });
  };

  const handleQuickLoadOwnerHours = async (ownerId: string) => {
    if (!moveFeedback) return;
    setIsFixingMissingHours(true);
    setActionError(null);
    const { error } = await updateMemberHours(ownerId, 4, moveFeedback.targetDate);
    setIsFixingMissingHours(false);
    if (error) {
      setActionError(typeof error === 'string' ? error : 'No se pudieron cargar las horas.');
      return;
    }
    setMoveFeedback((prev) =>
      prev
        ? {
            ...prev,
            ownersMissingHours: prev.ownersMissingHours.filter((o) => o.userId !== ownerId),
          }
        : null
    );
  };

  const totalPoints = Number(partners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2));
  const totalAmount = Number(
    partners.reduce((sum, p) => sum + Number(p.contribution_amount || p.amount || 0), 0).toFixed(2)
  );

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>SOCIOS CARGADOS HOY ({partners.length})</span>
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            {isAdmin
              ? 'Como administrador podés editar, mover o eliminar cualquier registro del equipo'
              : 'Podés corregir, mover o eliminar tus propios registros'}
          </p>
        </div>

        <div className="text-right flex items-center gap-2 flex-wrap">
          <span className="text-[11px] sm:text-xs font-black text-[#D6001C] bg-red-50 border border-red-200 px-2.5 py-1 rounded-xl">
            {formatPoints(totalPoints)}
          </span>
          <span className="text-[11px] sm:text-xs font-black text-neutral-800 bg-[#F7F3EE] px-2.5 py-1 rounded-xl">
            {formatPesos(totalAmount)}
          </span>
        </div>
      </div>

      {/* CONTROLES DE SELECCIÓN MÚLTIPLE PARA MOVER DE FECHA */}
      {manageablePartners.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectionMode((prev) => !prev);
              setSelectedIds([]);
            }}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border flex items-center gap-1.5 cursor-pointer transition-colors ${
              selectionMode
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-[#F7F3EE] hover:bg-neutral-200 text-neutral-800 border-[#E2DBD0]'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            <span>{selectionMode ? 'Cancelar selección' : 'Selección múltiple'}</span>
          </button>

          {selectionMode && (
            <button
              type="button"
              disabled={activeSelectedIds.length === 0}
              onClick={() =>
                setPartnersToMove(
                  manageablePartners.filter((p) => activeSelectedIds.includes(p.id))
                )
              }
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-black bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 disabled:text-neutral-500 text-white flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              <CalendarArrowUp className="w-3.5 h-3.5 shrink-0" />
              <span>Mover seleccionados ({activeSelectedIds.length})</span>
            </button>
          )}
        </div>
      )}

      {/* AVISO POST-MOVIMIENTO (INCLUYENDO ALERTA 0 H EN DESTINO) */}
      {moveFeedback && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2 text-xs text-amber-950">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <div className="font-black">
                  Se {moveFeedback.movedCount === 1 ? 'movió 1 socio' : `movieron ${moveFeedback.movedCount} socios`} al{' '}
                  {formatShortDate(moveFeedback.targetDate)}.
                </div>
                {moveFeedback.ownersMissingHours.length > 0 && (
                  <div className="mt-0.5 font-semibold text-amber-900">
                    Atención: {moveFeedback.ownersMissingHours.map((o) => o.name).join(', ')}{' '}
                    tiene 0 h cargadas en esa fecha destino.
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMoveFeedback(null)}
              className="min-h-[44px] px-3 py-2 text-xs font-bold bg-white hover:bg-neutral-100 border border-amber-300 rounded-xl cursor-pointer shrink-0"
            >
              Entendido
            </button>
          </div>

          {moveFeedback.ownersMissingHours.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {moveFeedback.ownersMissingHours
                .filter((o) => isAdmin || o.userId === currentMember?.id)
                .map((owner) => (
                  <button
                    key={owner.userId}
                    type="button"
                    disabled={isFixingMissingHours}
                    onClick={() => handleQuickLoadOwnerHours(owner.userId)}
                    className="min-h-[44px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-60"
                  >
                    Cargar 4 h a {owner.name} ({formatShortDate(moveFeedback.targetDate)})
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700"
        >
          {actionError}
        </div>
      )}

      {partners.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-[#E2DBD0] rounded-xl bg-[#F7F3EE]/30">
          <UserPlus className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-xs font-black text-neutral-600">
            Todavía no se cargaron socios hoy.
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Completá el formulario de arriba y presioná <strong>Agregar Socio</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {partners.map((p) => {
            const config = PAYMENT_METHOD_CONFIG[p.payment_type] || {
              label: p.payment_type,
              points: p.points,
              badgeColor: 'bg-neutral-100 text-neutral-800',
            };

            const canManage = canManagePartner(p);
            const isEditing = editingPartnerId === p.id;
            const isConfirming = confirmDeleteId === p.id;
            const isChecked = activeSelectedIds.includes(p.id);

            return (
              <div
                key={p.id}
                className="p-3.5 rounded-xl border border-[#E2DBD0] bg-[#F7F3EE]/40 hover:bg-white transition-all flex flex-col gap-2.5"
              >
                {isEditing ? (
                  <div className="space-y-3 bg-white p-3 rounded-xl border border-[#D6001C]">
                    <div className="text-xs font-black text-neutral-800">
                      Editando Socio #{p.sequence_number} ({p.created_by_name})
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-black text-neutral-500 uppercase">Edad</label>
                        <input
                          type="number"
                          min={16}
                          max={99}
                          value={editAge}
                          onChange={(e) => setEditAge(e.target.value)}
                          className="w-full h-11 px-2.5 text-base sm:text-sm font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-neutral-500 uppercase">Monto Mensual</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full h-11 px-2.5 text-base sm:text-sm font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-neutral-500 uppercase block mb-1">Medio de Pago</label>
                      <select
                        value={editPaymentType}
                        onChange={(e) => setEditPaymentType(e.target.value as PaymentMethodType)}
                        className="w-full h-11 px-2.5 text-base sm:text-sm font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl"
                      >
                        <option value="credit_card">Tarjeta de Crédito (1,0 pt)</option>
                        <option value="debit_card">Tarjeta de Débito (0,7 pts)</option>
                        <option value="bank_cbu">CBU / CVU Bancario (0,6 pts)</option>
                        <option value="prepaid_wallet">Tarjeta Prepaga / Billetera (0,4 pts)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(p.id)}
                        disabled={isSavingEdit}
                        className="min-h-[44px] px-3.5 py-2 bg-[#D6001C] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Guardar cambios</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPartnerId(null)}
                        className="min-h-[44px] px-3.5 py-2 bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {selectionMode && canManage && (
                        <label className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white border border-[#E2DBD0] cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePartnerSelection(p.id)}
                            aria-label={`Seleccionar socio #${p.sequence_number}`}
                            className="w-5 h-5 accent-[#D6001C] cursor-pointer"
                          />
                        </label>
                      )}

                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-neutral-200 text-neutral-800 font-black text-xs flex items-center justify-center">
                        #{p.sequence_number}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-neutral-900">
                            {p.created_by_name || p.team_member?.display_name || 'Captador'}
                          </span>
                          <span className="text-[10px] font-bold text-neutral-600 bg-white px-1.5 py-0.5 rounded border border-[#E2DBD0]">
                            {p.age} años
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${config.badgeColor}`}>
                            {config.label} ({formatPoints(p.points)})
                          </span>
                        </div>

                        <div className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          <span>{formatBuenosAiresDateTime(p.captured_at || p.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E2DBD0]/60">
                      <span className="text-xs sm:text-sm font-black text-neutral-900">
                        {formatPesos(p.contribution_amount || p.amount)}/mes
                      </span>

                      {canManage && (
                        <div className="flex items-center flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            title="Editar socio"
                            aria-label="Editar socio"
                            className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-bold text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-[#E2DBD0] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPartnersToMove([p])}
                            title="Mover fecha"
                            aria-label="Mover fecha"
                            className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-bold text-neutral-700 hover:text-[#D6001C] bg-white hover:bg-red-50 border border-[#E2DBD0] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <CalendarArrowUp className="w-3.5 h-3.5 shrink-0" />
                            <span>Mover fecha</span>
                          </button>

                          {isConfirming ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDelete(p.id)}
                                className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-black bg-[#D6001C] text-white rounded-xl hover:bg-red-700 cursor-pointer"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-bold bg-neutral-200 text-neutral-700 rounded-xl cursor-pointer"
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              title="Eliminar socio"
                              aria-label="Eliminar socio"
                              className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-bold text-neutral-600 hover:text-[#D6001C] bg-white hover:bg-red-50 border border-[#E2DBD0] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Eliminar</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MoveDateModal
        isOpen={partnersToMove.length > 0}
        partnersToMove={partnersToMove}
        todayStr={todayStr}
        currentDate={selectedDate}
        onClose={() => setPartnersToMove([])}
        onSuccess={handleMoveSuccess}
      />
    </div>
  );
};
