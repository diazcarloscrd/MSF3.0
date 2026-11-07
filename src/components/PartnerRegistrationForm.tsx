import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHOD_CONFIG, PaymentMethodType } from '../types/database';
import { CheckCircle2, AlertCircle, Plus, CreditCard, Landmark, Wallet } from 'lucide-react';

export const PartnerRegistrationForm: React.FC = () => {
  const { addPartner, isViewingHistory, activeWorkDay } = useWorkDay();
  const { currentMember } = useAuth();

  const [age, setAge] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentMethodType | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
      points: '1,0 pt',
      icon: <CreditCard className="w-4 h-4 shrink-0" />,
    },
    {
      type: 'debit_card',
      label: 'Tarjeta de Débito',
      shortDesc: 'Visa Débito, Maestro, Cabal',
      points: '0,7 pts',
      icon: <CreditCard className="w-4 h-4 shrink-0" />,
    },
    {
      type: 'bank_cbu',
      label: 'CBU Bancario',
      shortDesc: 'Cuenta bancaria tradicional',
      points: '0,6 pts',
      icon: <Landmark className="w-4 h-4 shrink-0" />,
    },
    {
      type: 'prepaid_wallet',
      label: 'Prepaga / Billetera',
      shortDesc: 'MercadoPago, Ualá, NaranjaX',
      points: '0,4 pts',
      icon: <Wallet className="w-4 h-4 shrink-0" />,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (isViewingHistory || activeWorkDay?.status === 'CLOSED') {
      setErrorMsg('No se pueden registrar socios en una jornada cerrada o histórica.');
      return;
    }

    if (!currentMember) {
      setErrorMsg('Debes iniciar sesión como captador antes de cargar un socio.');
      return;
    }

    const numAge = parseInt(age, 10);
    if (isNaN(numAge) || numAge < 16 || numAge > 99) {
      setErrorMsg('Por favor ingresá una edad válida (entre 16 y 99 años).');
      return;
    }

    const numAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Por favor ingresá un monto mensual válido.');
      return;
    }

    if (!selectedPaymentType) {
      setErrorMsg('Seleccioná uno de los 4 medios de captación.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await addPartner({
        age: numAge,
        amount: numAmount,
        paymentType: selectedPaymentType,
      });

      if (error) {
        setErrorMsg(typeof error === 'string' ? error : error.message || 'Error al guardar el socio');
      } else {
        setSuccessMsg(`¡Socio registrado a nombre de ${currentMember.display_name}! (+${data?.points || PAYMENT_METHOD_CONFIG[selectedPaymentType].points} pts)`);
        setAge('');
        setAmount('');
        setSelectedPaymentType(null);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar socio');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-[#E2DBD0] p-4 sm:p-5 mb-5">
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div>
          <h2 className="text-sm sm:text-base font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D6001C] inline-block animate-pulse"></span>
            REGISTRAR NUEVO SOCIO
          </h2>
          <p className="text-[11px] sm:text-xs text-neutral-500 font-medium mt-0.5">
            Captador activo: <strong className="text-neutral-900">{currentMember?.display_name}</strong>
          </p>
        </div>
        {selectedPaymentType && (
          <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-red-50 text-[#D6001C] border border-red-200 shrink-0">
            +{PAYMENT_METHOD_CONFIG[selectedPaymentType].points} pts
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="mb-3.5 p-3 bg-red-50 border-l-4 border-[#D6001C] rounded-r-lg flex items-center gap-2 text-xs text-red-700 font-semibold">
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

      <form onSubmit={handleSubmit} className="space-y-3.5">
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
              required
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
              required
            />
          </div>
        </div>

        {/* 4 BOTONES COMPACTOS, PROPORCIONADOS Y SIN SOLAPAMIENTOS EN NINGÚN MÓVIL */}
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
                  className={`p-2.5 sm:p-3 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer active:scale-[0.98] ${
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

        {/* BOTÓN PRINCIPAL DE ALTURA EQUILIBRADA (h-11) */}
        <button
          type="submit"
          disabled={isSubmitting || !selectedPaymentType || !age || !amount}
          className="w-full h-11 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-[0.99] cursor-pointer"
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
