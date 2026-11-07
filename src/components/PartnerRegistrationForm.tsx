import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHOD_CONFIG, PaymentMethodType } from '../types/database';
import { CheckCircle2, AlertCircle, Plus } from 'lucide-react';

export const PartnerRegistrationForm: React.FC = () => {
  const { addPartner, isViewingHistory, activeWorkDay } = useWorkDay();
  const { currentMember } = useAuth();

  const [age, setAge] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentMethodType | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const paymentButtons: { type: PaymentMethodType; label: string; points: string }[] = [
    { type: 'credit_card', label: 'TARJETA DE CRÉDITO', points: '1,0 PUNTO' },
    { type: 'debit_card', label: 'TARJETA DE DÉBITO', points: '0,7 PUNTOS' },
    { type: 'bank_cbu', label: 'CBU / CVU BANCARIO', points: '0,6 PUNTOS' },
    { type: 'prepaid_wallet', label: 'PREPAGA / BILLETERA', points: '0,4 PUNTOS' },
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
      setErrorMsg('Debes identificarte como captador antes de cargar un socio.');
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
      setErrorMsg('Debes seleccionar obligatoriamente uno de los 4 medios de captación.');
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
        setSuccessMsg(`¡Socio registrado con éxito! (+${data?.points || PAYMENT_METHOD_CONFIG[selectedPaymentType].points} pts)`);
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
    <div className="bg-white rounded-2xl shadow-sm border border-[#E2DBD0] p-4 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D6001C] inline-block animate-pulse"></span>
            REGISTRAR SOCIO
          </h2>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            Responsable: <strong className="text-neutral-800">{currentMember?.display_name || 'Sin identificar'}</strong>
          </p>
        </div>
        {selectedPaymentType && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-[#D6001C] border border-red-200">
            {PAYMENT_METHOD_CONFIG[selectedPaymentType].points} pts
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-[#D6001C] rounded-r-lg flex items-center gap-2 text-xs sm:text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#D6001C]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg flex items-center gap-2 text-xs sm:text-sm text-emerald-800 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* FILA DE EDAD Y MONTO PERFECTAMENTE ALINEADA (MISMA ALTURA DE ETIQUETA) */}
        <div className="grid grid-cols-2 gap-3 items-start">
          <div className="flex flex-col">
            <label className="text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1 h-5 flex items-center">
              EDAD (AÑOS) *
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={16}
              max={99}
              placeholder="16 a 99"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full h-12 px-3 text-base font-black text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
              required
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-1 h-5 flex items-center">
              MONTO MENSUAL *
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="Ej. 15000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-12 px-3 text-base font-black text-neutral-900 bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D6001C] transition-all"
              required
            />
          </div>
        </div>

        {/* 4 BOTONES VISIBLES DE MEDIOS DE CAPTACIÓN */}
        <div>
          <label className="block text-[11px] font-black text-neutral-600 uppercase tracking-wider mb-2">
            MEDIO DE CAPTACIÓN *
          </label>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {paymentButtons.map((btn) => {
              const isSelected = selectedPaymentType === btn.type;
              return (
                <button
                  key={btn.type}
                  type="button"
                  onClick={() => setSelectedPaymentType(btn.type)}
                  className={`p-3 rounded-xl border-2 text-left flex flex-col justify-between transition-all duration-150 min-h-[76px] active:scale-[0.98] ${
                    isSelected
                      ? 'border-[#D6001C] bg-red-50/70 shadow-sm ring-1 ring-[#D6001C]'
                      : 'border-neutral-200 bg-[#F7F3EE]/80 hover:bg-[#F7F3EE] hover:border-neutral-300 text-neutral-800'
                  }`}
                >
                  <span
                    className={`text-xs sm:text-sm font-black leading-snug ${
                      isSelected ? 'text-[#D6001C]' : 'text-neutral-800'
                    }`}
                  >
                    {btn.label}
                  </span>
                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-neutral-200/50">
                    <span
                      className={`text-[11px] font-black tracking-wide ${
                        isSelected ? 'text-[#D6001C]' : 'text-neutral-500'
                      }`}
                    >
                      {btn.points}
                    </span>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-[#D6001C]"></span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTÓN PRINCIPAL + AGREGAR SOCIO */}
        <button
          type="submit"
          disabled={isSubmitting || !selectedPaymentType || !age || !amount}
          className="w-full h-14 bg-[#D6001C] hover:bg-[#b80017] disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-black text-sm sm:text-base tracking-wide rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <Plus className="w-6 h-6 stroke-[3]" />
              <span>+ AGREGAR SOCIO</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
