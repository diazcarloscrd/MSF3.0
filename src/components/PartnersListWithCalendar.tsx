import React, { useState, useMemo } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import {
  MovePartnersResult,
  PAYMENT_METHOD_CONFIG,
  Partner,
  PaymentMethodType,
  TeamMember,
} from '../types/database';
import {
  downloadCsv,
  exportPartnersToCsv,
  formatBuenosAiresDate,
  formatBuenosAiresDateTime,
  formatPesos,
  formatPoints,
} from '../lib/stats';
import { formatShortDate } from '../lib/dateUtils';
import { MoveDateModal } from './MoveDateModal';
import {
  Trash2,
  Calendar as CalendarIcon,
  Filter,
  Clock,
  Edit2,
  Check,
  Download,
  CalendarArrowUp,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';

interface MemberFilterOption {
  id: string;
  display_name: string;
  count: number;
}

function partnerMatchesMember(p: Partner, memberId: string, memberName: string): boolean {
  if (p.created_by) {
    return p.created_by === memberId;
  }
  if (p.team_member_id) {
    return p.team_member_id === memberId;
  }
  return p.created_by_name?.toLowerCase() === memberName.toLowerCase();
}

function parseAmountInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  return parseFloat(normalized);
}

export const PartnersListWithCalendar: React.FC = () => {
  const {
    partners,
    updatePartner,
    deletePartner,
    updateMemberHours,
    isViewingHistory,
    selectedDate,
    todayStr,
    setSelectedDate,
    availableDates,
    exitHistoricalView,
  } = useWorkDay();
  const { currentMember, isAdmin, teamMembers, allProfiles } = useAuth();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterMemberId, setFilterMemberId] = useState<string>('ALL');
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

  const filterOptions = useMemo<MemberFilterOption[]>(() => {
    const activeSorted = [...teamMembers]
      .filter((m) => m.is_active)
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'es'));

    const options: MemberFilterOption[] = activeSorted.map((m) => ({
      id: m.id,
      display_name: m.display_name,
      count: partners.filter((p) => partnerMatchesMember(p, m.id, m.display_name)).length,
    }));

    const knownIds = new Set(options.map((o) => o.id));
    const inactiveWithPartners: MemberFilterOption[] = [];

    const checkExtraMember = (m: TeamMember) => {
      if (knownIds.has(m.id)) return;
      const count = partners.filter((p) => partnerMatchesMember(p, m.id, m.display_name)).length;
      if (count > 0) {
        knownIds.add(m.id);
        inactiveWithPartners.push({
          id: m.id,
          display_name: m.display_name,
          count,
        });
      }
    };

    allProfiles.forEach(checkExtraMember);

    partners.forEach((p) => {
      const uid = p.created_by || p.team_member_id;
      if (uid && !knownIds.has(uid)) {
        const name = p.created_by_name || 'Captador';
        const count = partners.filter((item) => partnerMatchesMember(item, uid, name)).length;
        knownIds.add(uid);
        inactiveWithPartners.push({ id: uid, display_name: name, count });
      }
    });

    inactiveWithPartners.sort((a, b) => a.display_name.localeCompare(b.display_name, 'es'));
    return [...options, ...inactiveWithPartners];
  }, [teamMembers, allProfiles, partners]);

  const effectiveFilterId =
    filterMemberId === 'ALL' || filterOptions.some((o) => o.id === filterMemberId)
      ? filterMemberId
      : 'ALL';

  const selectedMemberOption = filterOptions.find((o) => o.id === effectiveFilterId) || null;

  const filtered = partners.filter((p) => {
    if (effectiveFilterId === 'ALL' || !selectedMemberOption) return true;
    return partnerMatchesMember(p, selectedMemberOption.id, selectedMemberOption.display_name);
  });

  const canManagePartner = (p: Partner): boolean =>
    Boolean(currentMember && (isAdmin || p.created_by === currentMember.id));

  const manageableFiltered = filtered.filter(canManagePartner);
  const activeSelectedIds = selectedIds.filter((id) =>
    manageableFiltered.some((p) => p.id === id)
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

  const resetDateSwitchState = () => {
    setFilterMemberId('ALL');
    setSelectionMode(false);
    setSelectedIds([]);
    setEditingPartnerId(null);
    setConfirmDeleteId(null);
  };

  const handleExportCsv = () => {
    const csv = exportPartnersToCsv(filtered);
    const suffix = selectedMemberOption ? `-${selectedMemberOption.display_name.toLowerCase().replace(/\s+/g, '-')}` : '';
    downloadCsv(`msf-socios-${selectedDate}${suffix}.csv`, csv);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6">
      {/* SELECTOR DE CALENDARIO / HISTORIAL */}
      <div className="p-3.5 bg-[#F7F3EE] rounded-xl border border-[#E2DBD0] mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-white rounded-lg text-[#D6001C] shadow-xs shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
              CONSULTAR POR FECHA / CALENDARIO
            </h4>
            <p className="text-[11px] text-neutral-500 font-medium">
              Viendo socios de: <strong className="text-neutral-800">{formatBuenosAiresDate(selectedDate)}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            max={todayStr}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedDate(e.target.value);
                resetDateSwitchState();
              }
            }}
            aria-label="Fecha a consultar"
            className="min-h-[44px] h-11 px-3 text-base sm:text-xs font-black bg-white border border-[#E2DBD0] rounded-xl text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#D6001C] cursor-pointer"
          />

          {isViewingHistory && (
            <button
              type="button"
              onClick={() => {
                exitHistoricalView();
                resetDateSwitchState();
              }}
              className="min-h-[44px] px-3.5 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-black rounded-xl whitespace-nowrap transition-all cursor-pointer"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* FECHAS DISPONIBLES RÁPIDAS */}
      {availableDates.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] font-black uppercase text-neutral-400 whitespace-nowrap mr-1">
            Días con actividad:
          </span>
          {availableDates.slice(0, 7).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setSelectedDate(d);
                resetDateSwitchState();
              }}
              className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                selectedDate === d
                  ? 'bg-[#D6001C] text-white shadow-xs'
                  : 'bg-[#F7F3EE] text-neutral-700 hover:bg-neutral-200 border border-[#E2DBD0]'
              }`}
            >
              {formatBuenosAiresDate(d)}
            </button>
          ))}
        </div>
      )}

      {/* CABECERA, FILTRO POR CAPTADOR Y EXPORTAR CSV */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pt-3 border-t border-neutral-100">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            HISTORIAL DE SOCIOS ({filtered.length})
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Registros ordenados cronológicamente
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <select
              value={effectiveFilterId}
              onChange={(e) => {
                setFilterMemberId(e.target.value);
                setSelectedIds([]);
              }}
              aria-label="Filtrar por captador"
              className="min-h-[44px] h-11 text-base sm:text-xs font-bold bg-[#F7F3EE] border border-[#E2DBD0] rounded-xl px-3 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
            >
              <option value="ALL">Todos los captadores</option>
              {filterOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.count})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="min-h-[44px] px-3.5 py-2 bg-neutral-900 hover:bg-black disabled:bg-neutral-300 disabled:text-neutral-500 text-white text-xs font-black rounded-xl flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* BARRA DE CHIPS RÁPIDOS DE CAPTADORES ACTIVOS (INCLUYE QUIENES TIENEN 0 SOCIOS) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setFilterMemberId('ALL');
            setSelectedIds([]);
          }}
          className={`min-h-[44px] px-3 py-2 text-xs font-black rounded-xl border transition-colors cursor-pointer ${
            effectiveFilterId === 'ALL'
              ? 'bg-[#D6001C] text-white border-[#D6001C] shadow-xs'
              : 'bg-[#F7F3EE] text-neutral-700 border-[#E2DBD0] hover:bg-neutral-200'
          }`}
        >
          Todos ({partners.length})
        </button>

        {filterOptions.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setFilterMemberId(m.id);
              setSelectedIds([]);
            }}
            className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
              effectiveFilterId === m.id
                ? 'bg-[#D6001C] text-white border-[#D6001C] shadow-xs'
                : 'bg-[#F7F3EE] text-neutral-700 border-[#E2DBD0] hover:bg-neutral-200'
            }`}
          >
            {m.display_name} ({m.count})
          </button>
        ))}
      </div>

      {/* CONTROLES DE SELECCIÓN MÚLTIPLE PARA MOVER DE FECHA */}
      {manageableFiltered.length > 0 && (
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
                  manageableFiltered.filter((p) => activeSelectedIds.includes(p.id))
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

      {/* AVISO POST-MOVIMIENTO */}
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

      {/* LISTADO */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-[#E2DBD0] rounded-xl">
          <p className="text-sm font-bold text-neutral-400">
            No se encontraron socios registrados para el {formatBuenosAiresDate(selectedDate)}.
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
                      Modificando Socio #{p.sequence_number} ({p.created_by_name})
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
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

                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-neutral-200 text-neutral-800 font-black text-xs flex items-center justify-center">
                        #{p.sequence_number}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-neutral-900">
                            {p.created_by_name || p.team_member?.display_name || 'Captador'}
                          </span>
                          <span className="text-[11px] font-bold text-neutral-600 bg-white px-2 py-0.5 rounded-md border border-[#E2DBD0]">
                            {p.age} años
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${config.badgeColor}`}>
                            {config.label} ({formatPoints(p.points)})
                          </span>
                        </div>

                        <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{formatBuenosAiresDateTime(p.captured_at || p.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E2DBD0]/60">
                      <span className="text-sm font-black text-neutral-900">
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
