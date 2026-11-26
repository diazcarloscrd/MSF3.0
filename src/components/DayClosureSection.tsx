import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  formatBuenosAiresDate,
  formatBuenosAiresDateTime,
  formatNumber,
  generateWhatsAppReport,
} from '../lib/stats';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  RefreshCw,
  Save,
  Share2,
  Users,
} from 'lucide-react';

export const DayClosureSection: React.FC = () => {
  const {
    stats,
    selectedDate,
    isViewingHistory,
    shifts,
    partners,
    dailyAttendance,
    dailyClosure,
    isDailyClosureOutdated,
    dailySettingsNotes,
    declaredCollectorsCount,
    setAttendance,
    syncAttendanceFromActivity,
    updateDeclaredCollectors,
    saveDailyNotes,
    closeCurrentDay,
  } = useWorkDay();
  const { teamMembers } = useAuth();

  const [copied, setCopied] = useState<boolean>(false);
  const [isSavingClosure, setIsSavingClosure] = useState<boolean>(false);
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);
  const [isSyncingDeclared, setIsSyncingDeclared] = useState<boolean>(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ date: string; value: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const inFlightAttendanceRef = useRef<Set<Promise<unknown>>>(new Set());

  const effectiveNotes =
    notesDraft?.date === selectedDate
      ? notesDraft.value
      : dailySettingsNotes || dailyClosure?.notes || '';

  const attendanceItems = useMemo(() => {
    const sociosCountByUser = new Map<string, number>();
    partners.forEach((p) => {
      const ownerId = p.created_by || p.team_member_id;
      if (ownerId) {
        sociosCountByUser.set(ownerId, (sociosCountByUser.get(ownerId) || 0) + 1);
      } else if (p.created_by_name) {
        const matched = teamMembers.find(
          (m) => m.display_name.toLowerCase() === p.created_by_name.toLowerCase()
        );
        if (matched) {
          sociosCountByUser.set(matched.id, (sociosCountByUser.get(matched.id) || 0) + 1);
        }
      }
    });

    const shiftByUser = new Map(shifts.map((s) => [s.team_member_id, s]));
    const dbAttendanceByUser = new Map(dailyAttendance.map((a) => [a.user_id, a]));

    return teamMembers
      .filter((m) => m.is_active)
      .map((member) => {
        const shift = shiftByUser.get(member.id);
        const dbAtt = dbAttendanceByUser.get(member.id);
        const sociosCount = sociosCountByUser.get(member.id) || 0;
        const hoursWorked = Number(shift?.hours_worked || 0);
        const hasSocios = sociosCount > 0;
        const hasHours = hoursWorked > 0;
        const isLocked = hasSocios || hasHours;
        const isPresent = shift
          ? Boolean(shift.is_present)
          : dbAtt
            ? Boolean(dbAtt.is_present)
            : isLocked;

        return {
          id: member.id,
          name: member.display_name,
          role: member.role,
          isPresent,
          sociosCount,
          hoursWorked,
          hasSocios,
          hasHours,
          isLocked,
        };
      });
  }, [teamMembers, shifts, partners, dailyAttendance]);

  const presentUserIds = useMemo(
    () => attendanceItems.filter((item) => item.isPresent).map((item) => item.id),
    [attendanceItems]
  );

  const activityByUser = useMemo(() => {
    const map = new Map<string, { hasSocios: boolean; hasHours: boolean }>();
    attendanceItems.forEach((item) => {
      map.set(item.id, { hasSocios: item.hasSocios, hasHours: item.hasHours });
    });
    return map;
  }, [attendanceItems]);

  const latestPresentCountRef = useRef<number>(presentUserIds.length);
  const latestActivityByUserRef = useRef<Map<string, { hasSocios: boolean; hasHours: boolean }>>(
    activityByUser
  );

  useEffect(() => {
    latestPresentCountRef.current = presentUserIds.length;
    latestActivityByUserRef.current = activityByUser;
  }, [presentUserIds.length, activityByUser]);

  if (!stats) return null;

  const waText = generateWhatsAppReport(stats, {
    presentMemberIds: presentUserIds,
    notes: effectiveNotes,
  });

  const handleToggleAttendance = async (item: (typeof attendanceItems)[number]) => {
    if (pendingMemberId) return;

    if (item.isPresent && item.isLocked) {
      setFeedback({
        type: 'error',
        message: `No podés marcar como ausente a ${item.name} porque tiene socios u horas cargadas en esa fecha.`,
      });
      return;
    }

    setFeedback(null);
    setPendingMemberId(item.id);
    const attendancePromise = setAttendance(item.id, !item.isPresent);
    inFlightAttendanceRef.current.add(attendancePromise);

    try {
      const { error } = await attendancePromise;
      if (error) {
        setFeedback({
          type: 'error',
          message: error,
        });
      }
    } finally {
      inFlightAttendanceRef.current.delete(attendancePromise);
      setPendingMemberId(null);
    }
  };

  const handleSyncDeclaredCollectors = async () => {
    if (isSyncingDeclared) return;
    setFeedback(null);
    setIsSyncingDeclared(true);

    try {
      while (inFlightAttendanceRef.current.size > 0) {
        await Promise.all(Array.from(inFlightAttendanceRef.current));
      }

      const syncRes = await syncAttendanceFromActivity();
      if (syncRes.error) {
        setFeedback({ type: 'error', message: syncRes.error });
        return;
      }

      let freshPresentCount = latestPresentCountRef.current;
      try {
        const { data: attRows, error: attError } = await supabase
          .from('daily_attendance')
          .select('user_id, is_present')
          .eq('operational_date', selectedDate);

        if (!attError && Array.isArray(attRows)) {
          const attMap = new Map<string, boolean>();
          attRows.forEach((row) => {
            attMap.set(row.user_id, Boolean(row.is_present));
          });

          const currentActivity = latestActivityByUserRef.current;
          freshPresentCount = teamMembers
            .filter((m) => m.is_active)
            .reduce((count, m) => {
              if (attMap.has(m.id)) {
                return count + (attMap.get(m.id) ? 1 : 0);
              }
              const activity = currentActivity.get(m.id);
              return count + (activity && (activity.hasSocios || activity.hasHours) ? 1 : 0);
            }, 0);
        }
      } catch {
        // Fallback to latestPresentCountRef.current when DB query fails
      }

      const { error } = await updateDeclaredCollectors(freshPresentCount);
      if (error) {
        setFeedback({
          type: 'error',
          message: typeof error === 'string' ? error : 'No se pudo sincronizar el conteo.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Captadores presentes sincronizados en ${freshPresentCount}.`,
      });
    } finally {
      setIsSyncingDeclared(false);
    }
  };

  const handleSaveNotesOnly = async () => {
    if (isSavingNotes) return;
    setFeedback(null);
    setIsSavingNotes(true);
    try {
      const { error } = await saveDailyNotes(effectiveNotes);
      if (error) {
        setFeedback({
          type: 'error',
          message: typeof error === 'string' ? error : 'No se pudieron guardar las observaciones.',
        });
        return;
      }
      setNotesDraft(null);
      setFeedback({
        type: 'success',
        message: 'Observaciones de la jornada guardadas.',
      });
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveOfficialClosure = async () => {
    if (isSavingClosure) return;
    setFeedback(null);
    setIsSavingClosure(true);

    try {
      const { error } = await closeCurrentDay(presentUserIds, effectiveNotes);
      if (error) {
        setFeedback({
          type: 'error',
          message: typeof error === 'string' ? error : 'No se pudo guardar el cierre oficial.',
        });
        return;
      }
      setNotesDraft(null);
      setFeedback({
        type: 'success',
        message: 'Cierre oficial guardado y sincronizado.',
      });
    } finally {
      setIsSavingClosure(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFeedback({
        type: 'error',
        message: 'No se pudo copiar al portapapeles automáticamente.',
      });
    }
  };

  const handleWhatsAppShare = () => {
    const encoded = encodeURIComponent(waText);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6 space-y-4 w-full min-w-0">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2 flex-wrap">
            <span>CIERRE DE JORNADA Y WHATSAPP</span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                isViewingHistory ? 'bg-neutral-800 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isViewingHistory
                ? `JORNADA HISTÓRICA (${formatBuenosAiresDate(selectedDate)})`
                : 'JORNADA EN CURSO'}
            </span>
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
            Formato oficial con asistencia real, observaciones y resumen para WhatsApp
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-600 bg-[#F7F3EE] px-3 py-1.5 rounded-xl border border-[#E2DBD0] shrink-0">
          <Clock className="w-3.5 h-3.5 text-[#D6001C] shrink-0" />
          <span>Cierre y reinicio automático: 00:00 hs</span>
        </div>
      </div>

      {/* ESTADO DEL CIERRE OFICIAL */}
      {dailyClosure && (
        <div
          className={`rounded-xl border p-3.5 text-xs space-y-1.5 ${
            isDailyClosureOutdated
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-emerald-50 border-emerald-300 text-emerald-950'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div className="flex items-center gap-2 font-black uppercase tracking-wide">
              {isDailyClosureOutdated ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Cierre desactualizado — hubo cambios posteriores en socios, horas, asistencia u
                    observaciones. Recalculá y actualizá el cierre oficial.
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>CIERRE GUARDADO — CONFIRMADA</span>
                </>
              )}
            </div>
            {dailyClosure.closed_at && (
              <span className="text-[11px] font-bold opacity-80 shrink-0">
                Guardado: {formatBuenosAiresDateTime(dailyClosure.closed_at)}
              </span>
            )}
          </div>

          {dailyClosure.notes && dailyClosure.notes.trim().length > 0 && (
            <p className="text-xs font-medium text-neutral-800 pt-1 border-t border-black/10 break-words">
              <strong className="font-black">Observaciones guardadas:</strong>{' '}
              <span>{dailyClosure.notes}</span>
            </p>
          )}
        </div>
      )}

      {/* MENSAJES DE FEEDBACK */}
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
          <span className="break-words">{feedback.message}</span>
        </div>
      )}

      {/* SECCIÓN 1: ASISTENCIA DEL DÍA */}
      <section className="bg-[#F7F3EE]/60 border border-[#E2DBD0] rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#D6001C] shrink-0" />
              <span>¿Quiénes trabajaron hoy?</span>
            </h4>
            <p className="text-[11px] text-neutral-600 font-medium mt-0.5">
              <strong className="text-neutral-900">
                {presentUserIds.length} {presentUserIds.length === 1 ? 'presente' : 'presentes'}
              </strong>{' '}
              • Captadores presentes declarados:{' '}
              <strong className="text-neutral-900">{declaredCollectorsCount}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={handleSyncDeclaredCollectors}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-neutral-50 border border-[#E2DBD0] text-xs font-black text-neutral-800 flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#D6001C] ${isSyncingDeclared ? 'animate-spin' : ''}`} />
            <span>Sincronizar captadores presentes</span>
          </button>
        </div>

        <p className="text-[11px] text-neutral-500">
          Solo los integrantes seleccionados aparecen en{' '}
          <strong className="text-neutral-700">RENDIMIENTO INDIVIDUAL</strong>. Quienes tengan socios
          u horas cargadas en la fecha no pueden marcarse como ausentes.
        </p>

        <div className="flex flex-wrap gap-2.5">
          {attendanceItems.map((item) => {
            const isPending = pendingMemberId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.isPresent}
                aria-label={`${item.name}: ${item.isPresent ? 'Presente' : 'Ausente'}${
                  item.isLocked ? ' (con actividad registrada)' : ''
                }`}
                title={
                  item.isLocked
                    ? `${item.name} tiene socios u horas cargadas en esta fecha`
                    : `Marcar a ${item.name} como ${item.isPresent ? 'ausente' : 'presente'}`
                }
                onClick={() => handleToggleAttendance(item)}
                className={`min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  item.isPresent
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-2xs'
                    : 'bg-white border-[#E2DBD0] text-neutral-600 hover:border-neutral-400'
                } ${isPending ? 'opacity-70' : ''}`}
              >
                <span
                  className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                    item.isPresent
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-neutral-100 border-neutral-300 text-transparent'
                  }`}
                >
                  <Check className="w-3 h-3" />
                </span>
                <span>{item.name}</span>
                {item.isLocked && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <Lock className="w-2.5 h-2.5 shrink-0" />
                    <span>
                      {item.sociosCount > 0 ? `${item.sociosCount} soc` : ''}
                      {item.sociosCount > 0 && item.hoursWorked > 0 ? ' · ' : ''}
                      {item.hoursWorked > 0 ? `${formatNumber(item.hoursWorked)}h` : ''}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* SECCIÓN 2: OBSERVACIONES Y GUARDADO OFICIAL */}
      <section className="bg-[#F7F3EE]/60 border border-[#E2DBD0] rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div>
          <label
            htmlFor="daily-closure-notes"
            className="block text-xs font-black text-neutral-900 uppercase tracking-wider mb-1.5"
          >
            Observaciones de la jornada
          </label>
          <textarea
            id="daily-closure-notes"
            rows={2}
            value={effectiveNotes}
            onChange={(e) => setNotesDraft({ date: selectedDate, value: e.target.value })}
            placeholder="Ej: Lluvia a la tarde, zona centro, observaciones del día..."
            className="w-full p-3 text-base sm:text-xs font-medium text-neutral-900 bg-white rounded-xl border border-[#E2DBD0] focus:outline-none focus:ring-2 focus:ring-[#D6001C] resize-y"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleSaveOfficialClosure}
            className="min-h-[44px] h-11 px-4 rounded-xl bg-[#D6001C] hover:bg-[#b80017] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer flex-1"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span>
              {isSavingClosure
                ? 'Guardando Cierre Oficial...'
                : dailyClosure
                  ? 'Actualizar Cierre Oficial'
                  : 'Guardar Cierre Oficial'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSaveNotesOnly}
            className="min-h-[44px] h-11 px-4 rounded-xl bg-white hover:bg-neutral-50 border border-[#E2DBD0] text-neutral-800 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>{isSavingNotes ? 'Guardando...' : 'Guardar solo observaciones'}</span>
          </button>
        </div>
      </section>

      {/* SECCIÓN 3: TEXTO FORMATEADO PARA WHATSAPP */}
      <div className="relative">
        <label htmlFor="whatsapp-closure-preview" className="sr-only">
          Vista previa de cierre para WhatsApp
        </label>
        <textarea
          id="whatsapp-closure-preview"
          readOnly
          value={waText}
          rows={12}
          className="w-full p-3.5 sm:p-4 font-mono text-xs text-neutral-800 bg-neutral-50 rounded-xl border border-[#E2DBD0] focus:outline-none resize-none leading-relaxed"
        />
      </div>

      {/* BOTONES DE ACCIÓN WHATSAPP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="min-h-[44px] h-11 px-4 rounded-xl border border-[#E2DBD0] hover:border-neutral-400 bg-[#F7F3EE]/80 hover:bg-[#F7F3EE] text-neutral-900 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-emerald-700">¡Texto Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 shrink-0" />
              <span>Copiar Resumen</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleWhatsAppShare}
          className="min-h-[44px] h-11 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
        >
          <Share2 className="w-4 h-4 stroke-[2.5] shrink-0" />
          <span>Compartir por WhatsApp</span>
        </button>
      </div>
    </div>
  );
};

export default DayClosureSection;
