import React, { useState, useEffect, useMemo } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { MovePartnersResult, Partner } from '../types/database';
import {
  formatBuenosAiresDate,
  formatShortDate,
  getYesterdayDateString,
  isValidPastOrTodayDate,
  shiftBuenosAiresDate,
} from '../lib/dateUtils';
import { AlertTriangle, Calendar, Check, Clock, X } from 'lucide-react';

export interface MoveDateModalProps {
  isOpen: boolean;
  partnersToMove: Partner[];
  todayStr: string;
  currentDate: string;
  onClose: () => void;
  onSuccess?: (result: MovePartnersResult, targetDate: string) => void;
}

export const MoveDateModal: React.FC<MoveDateModalProps> = ({
  isOpen,
  partnersToMove,
  todayStr,
  currentDate,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || partnersToMove.length === 0) {
    return null;
  }

  return (
    <MoveDateModalContent
      key={`${currentDate}-${partnersToMove.map((p) => p.id).join(',')}`}
      partnersToMove={partnersToMove}
      todayStr={todayStr}
      currentDate={currentDate}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
};

interface MoveDateModalContentProps {
  partnersToMove: Partner[];
  todayStr: string;
  currentDate: string;
  onClose: () => void;
  onSuccess?: (result: MovePartnersResult, targetDate: string) => void;
}

const MoveDateModalContent: React.FC<MoveDateModalContentProps> = ({
  partnersToMove,
  todayStr,
  currentDate,
  onClose,
  onSuccess,
}) => {
  const { movePartnersToDate, updateMemberHours } = useWorkDay();
  const { teamMembers, currentMember, isAdmin } = useAuth();

  const yesterdayStr = getYesterdayDateString(todayStr);
  const defaultTargetDate =
    currentDate === yesterdayStr
      ? shiftBuenosAiresDate(yesterdayStr, -1)
      : yesterdayStr;

  const [targetDate, setTargetDate] = useState<string>(defaultTargetDate);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingHours, setIsLoadingHours] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [destHoursByUser, setDestHoursByUser] = useState<Record<string, number>>({});

  const affectedOwners = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partnersToMove) {
      const uid = p.created_by || p.team_member_id;
      if (uid && !map.has(uid)) {
        const matched = teamMembers.find((m) => m.id === uid);
        map.set(uid, matched?.display_name || p.created_by_name || 'Captador');
      }
    }
    return Array.from(map.entries()).map(([userId, name]) => ({ userId, name }));
  }, [partnersToMove, teamMembers]);

  const ownerIdsKey = useMemo(
    () => affectedOwners.map((o) => o.userId).sort().join(','),
    [affectedOwners]
  );

  const isValidTarget =
    isValidPastOrTodayDate(targetDate, todayStr) && targetDate !== currentDate;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  useEffect(() => {
    if (!isValidTarget || !ownerIdsKey) {
      return;
    }

    let cancelled = false;
    const ownerIds = ownerIdsKey.split(',').filter(Boolean);

    supabase
      .from('captor_daily_hours')
      .select('user_id, hours_worked')
      .eq('operational_date', targetDate)
      .in('user_id', ownerIds)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          const next: Record<string, number> = {};
          for (const row of data) {
            next[row.user_id] = Number(row.hours_worked || 0);
          }
          setDestHoursByUser(next);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetDate, isValidTarget, ownerIdsKey]);

  const ownersWithZeroHours = useMemo(() => {
    if (!isValidTarget) return [];
    return affectedOwners.filter((o) => (destHoursByUser[o.userId] ?? 0) <= 0);
  }, [affectedOwners, destHoursByUser, isValidTarget]);

  const handleQuickHours = async (ownerId: string, hours: number) => {
    if (!isValidTarget) return;
    setIsLoadingHours(true);
    setErrorMsg(null);
    const { error } = await updateMemberHours(ownerId, hours, targetDate);
    setIsLoadingHours(false);
    if (error) {
      setErrorMsg(typeof error === 'string' ? error : 'No se pudieron cargar las horas.');
      return;
    }
    setDestHoursByUser((prev) => ({ ...prev, [ownerId]: hours }));
  };

  const handleConfirm = async () => {
    setErrorMsg(null);

    if (!targetDate || !isValidPastOrTodayDate(targetDate, todayStr)) {
      setErrorMsg('No podés mover socios a una fecha futura o inválida.');
      return;
    }

    if (targetDate === currentDate) {
      setErrorMsg('Elegí una fecha diferente a la fecha actual del registro.');
      return;
    }

    setIsSubmitting(true);
    const result = await movePartnersToDate(
      partnersToMove.map((p) => p.id),
      targetDate
    );
    setIsSubmitting(false);

    if (result.error) {
      setErrorMsg(result.error);
      return;
    }

    onSuccess?.(result, targetDate);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-date-modal-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white w-full max-w-md rounded-2xl border border-[#E2DBD0] shadow-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-red-50 text-[#D6001C] shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="move-date-modal-title"
                className="text-sm font-black text-neutral-900 uppercase tracking-tight"
              >
                Mover fecha ({partnersToMove.length}{' '}
                {partnersToMove.length === 1 ? 'socio' : 'socios'})
              </h3>
              <p className="text-[11px] text-neutral-500 font-medium">
                Origen: {formatBuenosAiresDate(currentDate)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#F7F3EE] hover:bg-neutral-200 text-neutral-600 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PRESETS RÁPIDOS + INPUT DATE */}
        <div className="space-y-2">
          <label className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider">
            Fecha destino (hasta hoy)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTargetDate(todayStr);
                setErrorMsg(null);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border cursor-pointer ${
                targetDate === todayStr
                  ? 'bg-[#D6001C] text-white border-[#D6001C]'
                  : 'bg-[#F7F3EE] text-neutral-700 border-[#E2DBD0] hover:bg-neutral-200'
              }`}
            >
              Hoy ({formatShortDate(todayStr)})
            </button>

            <button
              type="button"
              onClick={() => {
                setTargetDate(yesterdayStr);
                setErrorMsg(null);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border cursor-pointer ${
                targetDate === yesterdayStr
                  ? 'bg-[#D6001C] text-white border-[#D6001C]'
                  : 'bg-[#F7F3EE] text-neutral-700 border-[#E2DBD0] hover:bg-neutral-200'
              }`}
            >
              Ayer ({formatShortDate(yesterdayStr)})
            </button>
          </div>

          <input
            type="date"
            max={todayStr}
            value={targetDate}
            onChange={(e) => {
              setTargetDate(e.target.value);
              setErrorMsg(null);
            }}
            aria-label="Fecha destino"
            className="w-full min-h-[44px] h-11 px-3 text-base sm:text-sm font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
          />
        </div>

        {/* ADVERTENCIA DE MISMA FECHA O FECHA FUTURA */}
        {targetDate === currentDate && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900">
            Elegí una fecha distinta a la actual ({formatShortDate(currentDate)}).
          </div>
        )}

        {targetDate && targetDate > todayStr && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
            No podés mover socios a una fecha futura.
          </div>
        )}

        {/* AVISO SI EL DUEÑO TIENE 0 H EN LA FECHA DESTINO */}
        {ownersWithZeroHours.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2 text-xs text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong>Horas en 0 h en destino ({formatShortDate(targetDate)}):</strong>{' '}
                {ownersWithZeroHours.map((o) => o.name).join(', ')}{' '}
                {ownersWithZeroHours.length === 1 ? 'no tiene horas' : 'no tienen horas'} cargadas en esa fecha.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ownersWithZeroHours
                .filter((o) => isAdmin || o.userId === currentMember?.id)
                .map((o) => (
                  <button
                    key={o.userId}
                    type="button"
                    disabled={isLoadingHours}
                    onClick={() => handleQuickHours(o.userId, 4)}
                    className="min-h-[44px] px-3 py-2 bg-white hover:bg-neutral-100 text-amber-950 border border-amber-300 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Cargar 4 h a {o.name}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-black rounded-xl cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !isValidTarget}
            className="min-h-[44px] px-4 py-2 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 disabled:text-neutral-500 text-white text-xs font-black rounded-xl flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{isSubmitting ? 'Moviendo...' : 'Confirmar movimiento'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
