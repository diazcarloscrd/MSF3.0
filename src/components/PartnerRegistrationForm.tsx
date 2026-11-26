import React, { useState, useEffect, useRef } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { PAYMENT_METHOD_CONFIG, PaymentMethodType } from '../types/database';
import { formatBuenosAiresDate, formatPoints } from '../lib/stats';
import {
  formatShortDate,
  getYesterdayDateString,
  isValidPastOrTodayDate,
} from '../lib/dateUtils';
import {
  clearPartnerDraft,
  generateClientRequestId,
  loadPartnerDraft,
  savePartnerDraft,
} from '../lib/offlineQueue';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  CreditCard,
  Landmark,
  Wallet,
  Calendar,
  WifiOff,
  RefreshCw,
  Clock,
} from 'lucide-react';

type DateMode = 'today' | 'yesterday' | 'custom';

export interface HoursSyncSignal {
  bump: number;
  date?: string;
  userId?: string;
  hours?: number;
}

export interface PartnerRegistrationFormProps {
  onTargetDateChange?: (targetDate: string) => void;
  hoursSync?: HoursSyncSignal;
  onHoursChanged?: (date: string, hours: number) => void;
}

interface PartnerRegistrationFormInnerProps {
  memberId: string;
  memberName: string;
  todayStr: string;
  onTargetDateChange?: (targetDate: string) => void;
  hoursSync?: HoursSyncSignal;
  onHoursChanged?: (date: string, hours: number) => void;
}

function parseAmountInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  return parseFloat(normalized);
}

const PartnerRegistrationFormInner: React.FC<PartnerRegistrationFormInnerProps> = ({
  memberId,
  memberName,
  todayStr,
  onTargetDateChange,
  hoursSync,
  onHoursChanged,
}) => {
  const {
    addPartner,
    retryOfflineQueue,
    updateMyHours,
    pendingOfflinePartners,
  } = useWorkDay();

  const yesterdayStr = getYesterdayDateString(todayStr);

  // Inicializar borrador desde localStorage para el captador activo
  const [initialDraft] = useState(() => loadPartnerDraft(memberId));

  const [age, setAge] = useState<string>(() => initialDraft?.age || '');
  const [amount, setAmount] = useState<string>(() => initialDraft?.amount || '');
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentMethodType | null>(
    () => initialDraft?.paymentType || null
  );

  const [dateMode, setDateMode] = useState<DateMode>(() => {
    const savedDate = initialDraft?.targetDate;
    if (savedDate && isValidPastOrTodayDate(savedDate, todayStr)) {
      if (savedDate === todayStr) return 'today';
      if (savedDate === yesterdayStr) return 'yesterday';
      return 'custom';
    }
    return 'today';
  });

  const [customDate, setCustomDate] = useState<string>(() => {
    const savedDate = initialDraft?.targetDate;
    if (
      savedDate &&
      isValidPastOrTodayDate(savedDate, todayStr) &&
      savedDate !== todayStr &&
      savedDate !== yesterdayStr
    ) {
      return savedDate;
    }
    return yesterdayStr;
  });

  const targetDate =
    dateMode === 'today'
      ? todayStr
      : dateMode === 'yesterday'
        ? yesterdayStr
        : customDate || todayStr;

  const clientRequestIdRef = useRef<string>(generateClientRequestId());

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRetryingQueue, setIsRetryingQueue] = useState<boolean>(false);
  const [isSavingPastHours, setIsSavingPastHours] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);

  // Horas trabajadas del captador para fechas pasadas (para alertar si figuran en 0 h)
  const [pastDateHoursInfo, setPastDateHoursInfo] = useState<{
    date: string;
    hours: number;
    bump: number;
  } | null>(null);

  const syncBump = hoursSync?.bump ?? 0;

  useEffect(() => {
    onTargetDateChange?.(targetDate);
  }, [targetDate, onTargetDateChange]);

  useEffect(() => {
    if (targetDate >= todayStr || !isValidPastOrTodayDate(targetDate, todayStr)) {
      return;
    }

    let cancelled = false;
    supabase
      .from('captor_daily_hours')
      .select('hours_worked')
      .eq('operational_date', targetDate)
      .eq('user_id', memberId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) {
          setPastDateHoursInfo({
            date: targetDate,
            hours: data ? Number(data.hours_worked || 0) : 0,
            bump: syncBump,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetDate, todayStr, memberId, syncBump]);

  // Guardar borrador automático en localStorage mientras el formulario tenga datos de socio
  useEffect(() => {
    const hasValues =
      age.trim() !== '' ||
      amount.trim() !== '' ||
      selectedPaymentType !== null;

    if (!hasValues) {
      clearPartnerDraft();
      return;
    }

    savePartnerDraft({
      age,
      amount,
      paymentType: selectedPaymentType,
      targetDate,
      userId: memberId,
    });
  }, [age, amount, selectedPaymentType, targetDate, memberId]);

  const hasSyncedPastOverride =
    targetDate < todayStr &&
    hoursSync !== undefined &&
    hoursSync.date === targetDate &&
    hoursSync.userId === memberId &&
    hoursSync.hours !== undefined &&
    (!pastDateHoursInfo ||
      pastDateHoursInfo.date !== targetDate ||
      pastDateHoursInfo.bump < hoursSync.bump);

  const effectivePastDateHours =
    targetDate >= todayStr
      ? null
      : hasSyncedPastOverride
        ? hoursSync!.hours!
        : pastDateHoursInfo && pastDateHoursInfo.date === targetDate
          ? pastDateHoursInfo.hours
          : null;

  const showPastZeroHoursAlert =
    dateMode !== 'today' &&
    targetDate < todayStr &&
    effectivePastDateHours !== null &&
    effectivePastDateHours === 0;

  const paymentButtons: {
    type: PaymentMethodType;
    label: string;
    shortDesc: string;
    points: string;
    icon: React.ReactNode;
  }[] = [
    {
      type: 'credit_card',
      label: 'Tarjeta de Crédito',
      shortDesc: 'Visa, Master, Amex, etc.',
      points: formatPoints(1, 1),
      icon: <CreditCard className="w-4 h-4 shrink-0" />,
    },
    {
      type: 'debit_card',
      label: 'Tarjeta de Débito',
      shortDesc: 'Visa Débito, Maestro, Cabal',
      points: formatPoints(0.7, 1),
      icon: <CreditCard className="w-4 h-4 shrink-0" />,
    },
    {
      type: 'bank_cbu',
      label: 'CBU Bancario',
      shortDesc: 'Cuenta bancaria tradicional',
      points: formatPoints(0.6, 1),
      icon: <Landmark className="w-4 h-4 shrink-0" />,
    },
    {
      type: 'prepaid_wallet',
      label: 'Prepaga / Billetera',
      shortDesc: 'MercadoPago, Ualá, NaranjaX',
      points: formatPoints(0.4, 1),
      icon: <Wallet className="w-4 h-4 shrink-0" />,
    },
  ];

  const handleQuickLoadPastHours = async (hours: number) => {
    setIsSavingPastHours(true);
    setErrorMsg(null);
    const { error } = await updateMyHours(hours, targetDate);
    setIsSavingPastHours(false);
    if (error) {
      setErrorMsg(typeof error === 'string' ? error : 'No se pudieron guardar las horas.');
      return;
    }
    setPastDateHoursInfo({ date: targetDate, hours, bump: syncBump + 1 });
    onHoursChanged?.(targetDate, hours);
    setSuccessMsg(`Se cargaron ${hours} h para el ${formatShortDate(targetDate)}.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleRetryQueue = async () => {
    setIsRetryingQueue(true);
    setErrorMsg(null);
    const result = await retryOfflineQueue();
    setIsRetryingQueue(false);

    if (result.sent + result.deduplicated > 0 && result.failed === 0) {
      setQueuedNotice(null);
      setSuccessMsg(
        `Cola offline sincronizada (${result.sent + result.deduplicated} socio${result.sent + result.deduplicated === 1 ? '' : 's'}).`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    } else if (result.failed > 0) {
      setErrorMsg(
        'Algunos envíos pendientes fallaron al sincronizar. Revisá el detalle debajo o tu conexión.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setQueuedNotice(null);

    if (!isValidPastOrTodayDate(targetDate, todayStr)) {
      setErrorMsg('No podés registrar socios en una fecha futura.');
      return;
    }

    const numAge = parseInt(age, 10);
    if (isNaN(numAge) || numAge < 16 || numAge > 99) {
      setErrorMsg('Por favor ingresá una edad válida (entre 16 y 99 años).');
      return;
    }

    const numAmount = parseAmountInput(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Por favor ingresá un monto mensual mayor a 0.');
      return;
    }

    if (!selectedPaymentType) {
      setErrorMsg('Completá y seleccioná uno de los 4 medios de captación.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addPartner(
        {
          age: numAge,
          amount: numAmount,
          paymentType: selectedPaymentType,
        },
        targetDate,
        clientRequestIdRef.current
      );

      if (result.queued) {
        setQueuedNotice(
          result.error ||
            'Sin conexión. El socio quedó guardado localmente en pendientes de envío (cola offline).'
        );
        clearPartnerDraft();
        setAge('');
        setAmount('');
        setSelectedPaymentType(null);
        clientRequestIdRef.current = generateClientRequestId();
      } else if (result.error) {
        setErrorMsg(
          typeof result.error === 'string'
            ? result.error
            : result.error?.message || 'Error al guardar el socio.'
        );
      } else {
        const pts = result.data?.points ?? PAYMENT_METHOD_CONFIG[selectedPaymentType].points;
        const dateSuffix =
          targetDate !== todayStr ? ` en fecha ${formatShortDate(targetDate)}` : '';
        setSuccessMsg(
          `¡Socio registrado a nombre de ${memberName}${dateSuffix}! (+${formatPoints(pts)})`
        );
        clearPartnerDraft();
        setAge('');
        setAmount('');
        setSelectedPaymentType(null);
        clientRequestIdRef.current = generateClientRequestId();
        setTimeout(() => setSuccessMsg(null), 3500);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al registrar socio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const queueErrors = pendingOfflinePartners
    .map((item) => item.lastError)
    .filter((msg): msg is string => Boolean(msg));

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-[#E2DBD0] p-4 sm:p-5 mb-5">
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D6001C] inline-block animate-pulse shrink-0" />
            <span>REGISTRAR NUEVO SOCIO</span>
          </h2>
          <p className="text-[11px] sm:text-xs text-neutral-500 font-medium mt-0.5 truncate">
            Captador activo: <strong className="text-neutral-900">{memberName}</strong>
          </p>
        </div>
        {selectedPaymentType && (
          <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-red-50 text-[#D6001C] border border-red-200 shrink-0">
            +{formatPoints(PAYMENT_METHOD_CONFIG[selectedPaymentType].points)}
          </span>
        )}
      </div>

      {/* BANNER DE COLA OFFLINE / PENDIENTES DE ENVÍO */}
      {pendingOfflinePartners.length > 0 && (
        <div className="mb-3.5 p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-start gap-2 text-xs text-amber-950 font-bold min-w-0">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <div>
                  {pendingOfflinePartners.length}{' '}
                  {pendingOfflinePartners.length === 1
                    ? 'socio pendiente de envío'
                    : 'socios pendientes de envío'}{' '}
                  (cola offline)
                </div>
                <div className="text-[11px] font-medium text-amber-800">
                  Se enviarán automáticamente cuando vuelva la conexión o podés reintentar ahora.
                </div>
                {queueErrors.length > 0 && (
                  <div className="text-[11px] font-bold text-red-700 mt-1">
                    No se pudo enviar: {queueErrors[0]}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRetryQueue}
              disabled={isRetryingQueue}
              className="min-h-[44px] px-3.5 py-2 bg-amber-900 hover:bg-black text-white text-xs font-black rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingQueue ? 'animate-spin' : ''}`} />
              <span>Reintentar ahora</span>
            </button>
          </div>
        </div>
      )}

      {queuedNotice && pendingOfflinePartners.length > 0 && (
        <div className="mb-3.5 p-3 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg flex items-center gap-2 text-xs text-amber-900 font-semibold">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-700" />
          <span>{queuedNotice}</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mb-3.5 p-3 bg-red-50 border-l-4 border-[#D6001C] rounded-r-lg flex items-center gap-2 text-xs text-red-700 font-semibold"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-[#D6001C]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-3.5 p-3 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg flex items-center gap-2 text-xs text-emerald-800 font-semibold">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        {/* SELECTOR DE FECHA OPERATIVA (HOY / AYER / OTRA FECHA) */}
        <div>
          <label className="block text-[10px] sm:text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1.5">
            FECHA DE CAPTACIÓN
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDateMode('today');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center gap-1.5 ${
                dateMode === 'today'
                  ? 'bg-[#D6001C] text-white border-[#D6001C] shadow-xs'
                  : 'bg-[#F7F3EE] text-neutral-700 border-[#E2DBD0] hover:bg-neutral-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Hoy ({formatShortDate(todayStr)})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDateMode('yesterday');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                dateMode === 'yesterday'
                  ? 'bg-[#D6001C] text-white border-[#D6001C] shadow-xs'
                  : 'bg-[#F7F3EE] text-neutral-700 border-[#E2DBD0] hover:bg-neutral-200'
              }`}
            >
              Ayer ({formatShortDate(yesterdayStr)})
            </button>

            <button
              type="button"
              onClick={() => {
                setDateMode('custom');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                dateMode === 'custom'
                  ? 'bg-[#D6001C] text-white border-[#D6001C] shadow-xs'
                  : 'bg-[#F7F3EE] text-neutral-700 border-[#E2DBD0] hover:bg-neutral-200'
              }`}
            >
              Otra fecha...
            </button>
          </div>

          {dateMode === 'custom' && (
            <div className="mt-2">
              <input
                type="date"
                max={todayStr}
                value={customDate}
                onChange={(e) => {
                  if (e.target.value) setCustomDate(e.target.value);
                }}
                aria-label="Seleccionar otra fecha de captación"
                className="w-full sm:w-auto min-h-[44px] h-11 px-3 text-base sm:text-sm font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
            </div>
          )}
        </div>

        {/* BANNER ÁMBAR PREVENTIVO EN FECHAS ANTERIORES */}
        {dateMode !== 'today' && targetDate < todayStr && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <strong>Carga en fecha anterior ({formatShortDate(targetDate)}):</strong>{' '}
              este socio se guardará en la jornada del{' '}
              <strong>{formatBuenosAiresDate(targetDate)}</strong>, no en la jornada de hoy.
            </div>
          </div>
        )}

        {/* ALERTA DE 0 HORAS EN FECHA ANTERIOR + ACCESO RÁPIDO */}
        {showPastZeroHoursAlert && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-xs text-amber-950">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <strong>¡Atención {memberName}!</strong> Tus horas del{' '}
                <strong>{formatShortDate(targetDate)}</strong> figuran en{' '}
                <strong>0 h</strong>. Cargalas para que tus promedios de esa jornada se calculen bien.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSavingPastHours}
                onClick={() => handleQuickLoadPastHours(4)}
                className="min-h-[44px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-60"
              >
                Cargar 4 h ({formatShortDate(targetDate)})
              </button>
              <button
                type="button"
                disabled={isSavingPastHours}
                onClick={() => handleQuickLoadPastHours(3)}
                className="min-h-[44px] px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-[#E2DBD0] text-xs font-bold rounded-xl cursor-pointer disabled:opacity-60"
              >
                Cargar 3 h
              </button>
              <button
                type="button"
                disabled={isSavingPastHours}
                onClick={() => handleQuickLoadPastHours(2)}
                className="min-h-[44px] px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-[#E2DBD0] text-xs font-bold rounded-xl cursor-pointer disabled:opacity-60"
              >
                Cargar 2 h
              </button>
            </div>
          </div>
        )}

        {/* FILA DE EDAD Y MONTO PERFECTAMENTE ALINEADA */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 items-start">
          <div className="flex flex-col">
            <label className="text-[10px] sm:text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1 h-4 flex items-center">
              EDAD (AÑOS) *
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={16}
              max={99}
              placeholder="Ej: 32"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full h-11 px-3 text-base font-black text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] sm:text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1 h-4 flex items-center">
              MONTO MENSUAL ($) *
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="Ej: 15000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-11 px-3 text-base font-black text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
            />
          </div>
        </div>

        {/* 4 BOTONES COMPACTOS, PROPORCIONADOS Y CON ALTURA TÁCTIL >= 44px */}
        <div>
          <label className="block text-[10px] sm:text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1.5">
            MEDIO DE CAPTACIÓN *
          </label>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            {paymentButtons.map((btn) => {
              const isSelected = selectedPaymentType === btn.type;
              return (
                <button
                  key={btn.type}
                  type="button"
                  onClick={() => setSelectedPaymentType(btn.type)}
                  className={`min-h-[44px] p-2.5 sm:p-3 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                    isSelected
                      ? 'border-[#D6001C] bg-red-50/70 shadow-2xs ring-1 ring-[#D6001C]'
                      : 'border-[#E2DBD0] bg-[#F7F3EE]/70 hover:bg-[#F7F3EE] hover:border-neutral-300 text-neutral-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5 w-full">
                    <span
                      className={`text-xs sm:text-[13px] font-black leading-tight ${
                        isSelected ? 'text-[#D6001C]' : 'text-neutral-900'
                      }`}
                    >
                      {btn.label}
                    </span>
                    <span className={isSelected ? 'text-[#D6001C]' : 'text-neutral-400'}>
                      {btn.icon}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-2 pt-1.5 border-t border-neutral-200/60 w-full">
                    <span className="text-[10px] text-neutral-500 font-medium truncate hidden sm:inline">
                      {btn.shortDesc}
                    </span>
                    <span
                      className={`text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-md ${
                        isSelected
                          ? 'bg-[#D6001C] text-white'
                          : 'bg-white text-neutral-600 border border-[#E2DBD0]'
                      }`}
                    >
                      {btn.points}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTÓN PRINCIPAL DE ALTURA EQUILIBRADA (min-h-[44px]) */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[44px] h-11 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-[0.99] cursor-pointer"
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Agregar Socio</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export const PartnerRegistrationForm: React.FC<PartnerRegistrationFormProps> = ({
  onTargetDateChange,
  hoursSync,
  onHoursChanged,
}) => {
  const { todayStr } = useWorkDay();
  const { currentMember } = useAuth();

  if (!currentMember) {
    return null;
  }

  return (
    <PartnerRegistrationFormInner
      key={currentMember.id}
      memberId={currentMember.id}
      memberName={currentMember.display_name}
      todayStr={todayStr}
      onTargetDateChange={onTargetDateChange}
      hoursSync={hoursSync}
      onHoursChanged={onHoursChanged}
    />
  );
};
