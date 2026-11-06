import React, { useState, useEffect } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { Clock, AlertTriangle, Check, Edit2 } from 'lucide-react';

export const MyHoursCard: React.FC = () => {
  const { myHours, updateMyHours, activeWorkDay, partners } = useWorkDay();
  const { currentMember } = useAuth();

  const [inputVal, setInputVal] = useState<string>(myHours.toString());
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setInputVal(myHours.toString());
  }, [myHours]);

  const myPartnersCount = partners.filter((p) => p.team_member_id === currentMember?.id).length;
  const hasZeroHoursWithPartners = myHours === 0 && myPartnersCount > 0;

  const handleSave = async (valToSave?: number) => {
    const hoursNum = valToSave !== undefined ? valToSave : parseFloat(inputVal.replace(',', '.'));
    if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
      setMsg({ text: 'Ingresá un número válido entre 0 y 24', type: 'error' });
      return;
    }

    setIsSaving(true);
    setMsg(null);
    const { error } = await updateMyHours(hoursNum);
    setIsSaving(false);

    if (error) {
      setMsg({ text: typeof error === 'string' ? error : error.message, type: 'error' });
    } else {
      setMsg({ text: 'Horas actualizadas correctamente', type: 'success' });
      setIsEditing(false);
      setTimeout(() => setMsg(null), 2500);
    }
  };

  const quickOptions = [0, 2, 2.5, 3, 4];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-neutral-100 rounded-lg text-neutral-800">
            <Clock className="w-5 h-5 text-[#D6001C]" />
          </div>
          <div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wider">
              MIS HORAS DE HOY
            </h3>
            <p className="text-xs text-neutral-500">
              Captador: <strong className="text-neutral-800">{currentMember?.display_name || 'Sin identificar'}</strong>
            </p>
          </div>
        </div>

        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs font-bold text-neutral-600 hover:text-[#D6001C] flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Modificar
          </button>
        )}
      </div>

      {hasZeroHoursWithPartners && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>¡Atención!</strong> Has registrado {myPartnersCount} socio(s) pero tus horas siguen en 0. 
            Ingresá las horas trabajadas hoy para que tus promedios individuales y los del equipo no se distorsionen.
          </div>
        </div>
      )}

      {msg && (
        <div
          className={`mb-3 p-2.5 text-xs rounded-lg font-bold flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.5"
              min={0}
              max={24}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="0.0"
              className="w-24 h-11 px-3 text-lg font-black text-center bg-neutral-50 border-2 border-[#D6001C] rounded-xl focus:outline-none focus:bg-white"
            />
            <span className="text-sm font-bold text-neutral-700">horas</span>

            <button
              onClick={() => handleSave()}
              disabled={isSaving}
              className="ml-auto h-11 px-4 bg-[#D6001C] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#b80017] transition-all flex items-center gap-1.5"
            >
              {isSaving ? 'Guardando...' : <><Check className="w-4 h-4" /> Guardar</>}
            </button>
            <button
              onClick={() => {
                setInputVal(myHours.toString());
                setIsEditing(false);
              }}
              className="h-11 px-3 bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl hover:bg-neutral-300 transition-colors"
            >
              Cancelar
            </button>
          </div>

          <div className="pt-2 border-t border-neutral-100 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-neutral-400 font-medium">Accesos rápidos:</span>
            {quickOptions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setInputVal(q.toString());
                  handleSave(q);
                }}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-neutral-100 hover:bg-red-50 hover:text-[#D6001C] text-neutral-700 transition-colors"
              >
                {q}h
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-baseline justify-between pt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900 tracking-tight">
              {myHours}
            </span>
            <span className="text-sm font-bold text-neutral-500 uppercase">
              {myHours === 1 ? 'hora declarada' : 'horas declaradas'}
            </span>
          </div>

          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              myHours > 0
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {myHours > 0 ? 'Activo en jornada' : 'Inicializado en 0'}
          </span>
        </div>
      )}
    </div>
  );
};

