import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { Users, AlertCircle, Check, Edit2 } from 'lucide-react';

export const CollectorsCountAdmin: React.FC = () => {
  const { activeWorkDay, updateDeclaredCollectors, shifts, partners } = useWorkDay();
  const { isAdmin } = useAuth();

  const declared = activeWorkDay?.declared_collectors_count || 0;
  const [inputVal, setInputVal] = useState<string>(declared.toString());
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Stats for consistency check
  const membersWithHours = shifts.filter((s) => Number(s.hours_worked) > 0).length;
  const activeMembersWithPartners = new Set(partners.map((p) => p.team_member_id)).size;

  const hasInconsistency =
    declared > 0 &&
    (declared !== membersWithHours || declared !== activeMembersWithPartners);

  const handleSave = async () => {
    const count = parseInt(inputVal, 10);
    if (isNaN(count) || count < 0) return;

    setIsSaving(true);
    await updateDeclaredCollectors(count);
    setIsSaving(false);
    setIsEditing(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-neutral-100 rounded-lg text-neutral-800">
            <Users className="w-5 h-5 text-[#D6001C]" />
          </div>
          <div>
            <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
              CANTIDAD DE CAPTADORES PRESENTES
            </h3>
            <p className="text-[11px] text-neutral-500 font-medium">
              Base oficial para los promedios por captador
            </p>
          </div>
        </div>

        {isAdmin && !isEditing && (
          <button
            onClick={() => {
              setInputVal(declared.toString());
              setIsEditing(true);
            }}
            className="text-xs font-bold text-neutral-600 hover:text-[#D6001C] flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Editar
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            max={50}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="w-20 h-11 px-3 text-lg font-black text-center bg-neutral-50 border-2 border-[#D6001C] rounded-xl focus:outline-none focus:bg-white"
          />
          <span className="text-xs font-bold text-neutral-600">captadores</span>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="ml-auto h-11 px-4 bg-[#D6001C] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#b80017] transition-all flex items-center gap-1.5"
          >
            {isSaving ? 'Guardando...' : <><Check className="w-4 h-4" /> Guardar</>}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="h-11 px-3 bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl hover:bg-neutral-300"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex items-baseline justify-between mt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-neutral-900 tracking-tight">
              {declared}
            </span>
            <span className="text-xs font-bold text-neutral-500 uppercase">
              {declared === 1 ? 'captador declarado' : 'captadores declarados'}
            </span>
          </div>

          <div className="text-right text-[11px] text-neutral-500">
            <div>Con horas cargadas: <strong className="text-neutral-800">{membersWithHours}</strong></div>
            <div>Con socios cargados: <strong className="text-neutral-800">{activeMembersWithPartners}</strong></div>
          </div>
        </div>
      )}

      {hasInconsistency && (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-[11px] text-amber-900">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
          <span>
            <strong>Advertencia:</strong> Existen diferencias entre los captadores declarados ({declared}), 
            los que registraron horas ({membersWithHours}) y los que cargaron socios ({activeMembersWithPartners}).
            Revisá si falta declarar horas de algún compañero.
          </span>
        </div>
      )}
    </div>
  );
};

