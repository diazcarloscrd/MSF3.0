import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { Clock, Users, AlertTriangle, Check, Edit2 } from 'lucide-react';

export const DayTopControls: React.FC = () => {
  const {
    myHours,
    updateMyHours,
    activeWorkDay,
    updateDeclaredCollectors,
    partners,
    shifts,
  } = useWorkDay();
  const { currentMember } = useAuth();

  // Estados de Horas
  const [hoursVal, setHoursVal] = useState<string>(myHours.toString());
  const [isEditingHours, setIsEditingHours] = useState<boolean>(false);
  const [isSavingHours, setIsSavingHours] = useState<boolean>(false);

  // Estados de Captadores (AHORA CUALQUIER CAPTADOR PUEDE MODIFICARLO)
  const declared = activeWorkDay?.declared_collectors_count || 0;
  const [collectorsVal, setCollectorsVal] = useState<string>(declared.toString());
  const [isEditingCollectors, setIsEditingCollectors] = useState<boolean>(false);
  const [isSavingCollectors, setIsSavingCollectors] = useState<boolean>(false);

  // Alertas
  const myPartnersCount = partners.filter(
    (p) => p.team_member_id === currentMember?.id || p.created_by_name?.toLowerCase() === currentMember?.display_name.toLowerCase()
  ).length;
  const hasZeroHoursWithPartners = myHours === 0 && myPartnersCount > 0;

  const membersWithHours = shifts.filter((s) => Number(s.hours_worked) > 0).length;

  const handleSaveHours = async () => {
    const num = parseFloat(hoursVal.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 24) return;
    setIsSavingHours(true);
    await updateMyHours(num);
    setIsSavingHours(false);
    setIsEditingHours(false);
  };

  const handleSaveCollectors = async () => {
    const count = parseInt(collectorsVal, 10);
    if (isNaN(count) || count < 0) return;
    setIsSavingCollectors(true);
    await updateDeclaredCollectors(count);
    setIsSavingCollectors(false);
    setIsEditingCollectors(false);
  };

  return (
    <div className="space-y-3 mb-6">
      {/* DOS RECUADROS UNO AL LADO DEL OTRO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* 1. RECUADRO MIS HORAS */}
        <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#F7F3EE] rounded-xl text-[#D6001C]">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
                  MIS HORAS DE HOY
                </h3>
                <span className="text-[11px] font-bold text-neutral-500">
                  {currentMember?.display_name || 'Sin identificar'}
                </span>
              </div>
            </div>

            {!isEditingHours && (
              <button
                type="button"
                onClick={() => {
                  setHoursVal(myHours.toString());
                  setIsEditingHours(true);
                }}
                className="text-xs font-bold text-neutral-500 hover:text-[#D6001C] flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar
              </button>
            )}
          </div>

          {isEditingHours ? (
            <div className="space-y-2 mt-1">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={24}
                  value={hoursVal}
                  onChange={(e) => setHoursVal(e.target.value)}
                  className="w-20 h-10 px-2 text-base font-black text-center bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                />
                <span className="text-xs font-bold text-neutral-600">horas</span>
                <button
                  type="button"
                  onClick={handleSaveHours}
                  disabled={isSavingHours}
                  className="ml-auto h-10 px-3 bg-[#D6001C] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#b80017] flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingHours(false)}
                  className="h-10 px-2.5 bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl"
                >
                  X
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-neutral-100">
                {[0, 2, 2.5, 3, 4].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setHoursVal(q.toString());
                      updateMyHours(q);
                      setIsEditingHours(false);
                    }}
                    className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-[#F7F3EE] hover:bg-red-50 hover:text-[#D6001C] text-neutral-700"
                  >
                    {q}h
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-baseline justify-between mt-2 pt-1 border-t border-neutral-100">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-neutral-900 tracking-tight">
                  {myHours}
                </span>
                <span className="text-xs font-bold text-neutral-500 uppercase">
                  {myHours === 1 ? 'hora declarada' : 'horas'}
                </span>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  myHours > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {myHours > 0 ? 'Activo' : 'Inicia en 0'}
              </span>
            </div>
          )}
        </div>

        {/* 2. RECUADRO CANTIDAD DE CAPTADORES (EDITABLE POR CUALQUIER INTEGRANTE) */}
        <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#F7F3EE] rounded-xl text-[#D6001C]">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
                  CAPTADORES PRESENTES
                </h3>
                <span className="text-[11px] font-bold text-neutral-500">
                  Modificable por el equipo
                </span>
              </div>
            </div>

            {!isEditingCollectors && (
              <button
                type="button"
                onClick={() => {
                  setCollectorsVal(declared.toString());
                  setIsEditingCollectors(true);
                }}
                className="text-xs font-bold text-neutral-500 hover:text-[#D6001C] flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Modificar
              </button>
            )}
          </div>

          {isEditingCollectors ? (
            <div className="flex items-center gap-2 mt-2 pt-1">
              <input
                type="number"
                min={0}
                max={50}
                value={collectorsVal}
                onChange={(e) => setCollectorsVal(e.target.value)}
                className="w-20 h-10 px-2 text-base font-black text-center bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
              <span className="text-xs font-bold text-neutral-600">captadores</span>
              <button
                type="button"
                onClick={handleSaveCollectors}
                disabled={isSavingCollectors}
                className="ml-auto h-10 px-3 bg-[#D6001C] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#b80017] flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setIsEditingCollectors(false)}
                className="h-10 px-2.5 bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl"
              >
                X
              </button>
            </div>
          ) : (
            <div className="flex items-baseline justify-between mt-2 pt-1 border-t border-neutral-100">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-neutral-900 tracking-tight">
                  {declared}
                </span>
                <span className="text-xs font-bold text-neutral-500 uppercase">
                  {declared === 1 ? 'captador' : 'presentes'}
                </span>
              </div>
              <div className="text-right text-[10px] text-neutral-500">
                Con horas: <strong className="text-neutral-800">{membersWithHours}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AVISO DE CEROHORAS CON SOCIOS */}
      {hasZeroHoursWithPartners && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>¡Atención {currentMember?.display_name}!</strong> Has registrado {myPartnersCount} socio(s) pero tus horas de hoy figuran en 0.
            Ingresá tus horas trabajadas para no perjudicar tus promedios individuales ni los del equipo.
          </div>
        </div>
      )}
    </div>
  );
};
