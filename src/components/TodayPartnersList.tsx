import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHOD_CONFIG, Partner, PaymentMethodType } from '../types/database';
import { formatPesos, formatBuenosAiresDateTime } from '../lib/stats';
import { Trash2, UserPlus, Clock, Edit2, Check, X } from 'lucide-react';

export const TodayPartnersList: React.FC = () => {
  const { partners, updatePartner, deletePartner } = useWorkDay();
  const { currentMember, isAdmin } = useAuth();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Estados de edición inline
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [editAge, setEditAge] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editPaymentType, setEditPaymentType] = useState<PaymentMethodType>('credit_card');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const startEdit = (p: Partner) => {
    setEditingPartnerId(p.id);
    setEditAge(p.age.toString());
    setEditAmount((p.contribution_amount || p.amount || 0).toString());
    setEditPaymentType(p.payment_type);
  };

  const handleSaveEdit = async (partnerId: string) => {
    const ageNum = parseInt(editAge, 10);
    const amountNum = parseFloat(editAmount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(ageNum) || ageNum < 16 || ageNum > 99 || isNaN(amountNum) || amountNum <= 0) {
      return;
    }

    setIsSavingEdit(true);
    await updatePartner(partnerId, {
      age: ageNum,
      amount: amountNum,
      paymentType: editPaymentType,
    });
    setIsSavingEdit(false);
    setEditingPartnerId(null);
  };

  const handleDelete = async (partnerId: string) => {
    await deletePartner(partnerId);
    setConfirmDeleteId(null);
  };

  const totalPoints = Number(partners.reduce((sum, p) => sum + Number(p.points || 0), 0).toFixed(2));
  const totalAmount = Number(partners.reduce((sum, p) => sum + Number(p.contribution_amount || p.amount || 0), 0).toFixed(2));

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            SOCIOS CARGADOS HOY ({partners.length})
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Podés corregir o eliminar tus propios registros
          </p>
        </div>

        <div className="text-right flex items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] sm:text-xs font-black text-[#D6001C] bg-red-50 border border-red-200 px-2 sm:px-2.5 py-1 rounded-xl">
            {totalPoints} pts
          </span>
          <span className="text-[11px] sm:text-xs font-black text-neutral-800 bg-[#F7F3EE] px-2 sm:px-2.5 py-1 rounded-xl">
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

            const canManage =
              isAdmin ||
              p.team_member_id === currentMember?.id ||
              p.created_by_name?.toLowerCase() === currentMember?.display_name.toLowerCase();

            const isEditing = editingPartnerId === p.id;
            const isConfirming = confirmDeleteId === p.id;

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
                          className="w-full h-9 px-2 text-xs font-bold bg-[#F7F3EE] border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-neutral-500 uppercase">Monto Mensual</label>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full h-9 px-2 text-xs font-bold bg-[#F7F3EE] border rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-neutral-500 uppercase block mb-1">Medio de Pago</label>
                      <select
                        value={editPaymentType}
                        onChange={(e) => setEditPaymentType(e.target.value as any)}
                        className="w-full h-9 px-2 text-xs font-bold bg-[#F7F3EE] border rounded-lg"
                      >
                        <option value="credit_card">Tarjeta de Crédito (1,0 pt)</option>
                        <option value="debit_card">Tarjeta de Débito (0,7 pts)</option>
                        <option value="bank_cbu">CBU / CVU Bancario (0,6 pts)</option>
                        <option value="prepaid_wallet">Tarjeta Prepaga / Billetera (0,4 pts)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(p.id)}
                        disabled={isSavingEdit}
                        className="px-3 py-1.5 bg-[#D6001C] text-white text-xs font-bold rounded-lg flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPartnerId(null)}
                        className="px-2.5 py-1.5 bg-neutral-200 text-neutral-700 text-xs font-bold rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
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

                    <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#E2DBD0]/60">
                      <span className="text-xs sm:text-sm font-black text-neutral-900">
                        {formatPesos(p.contribution_amount || p.amount)}/mes
                      </span>

                      {canManage && (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => startEdit(p)}
                            title="Modificar socio"
                            className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

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
                              className="p-1.5 text-neutral-400 hover:text-[#D6001C] rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
    </div>
  );
};
