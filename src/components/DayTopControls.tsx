import React, { useState, useEffect } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { Clock, Users, AlertTriangle, Check, Edit2, X } from 'lucide-react';

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

  // Estados de Captadores
  const declared = activeWorkDay?.declared_collectors_count || 0;
  const [collectorsVal, setCollectorsVal] = useState<string>(declared.toString());
  const [isEditingCollectors, setIsEditingCollectors] = useState<boolean>(false);
  const [isSavingCollectors, setIsSavingCollectors] = useState<boolean>(false);
  const [controlError, setControlError] = useState<string | null>(null);

  // Sincronizar cuando cambie el usuario, la fecha o los datos
  useEffect(() => {
    setHoursVal(myHours.toString());
  }, [myHours]);

  useEffect(() => {
    setCollectorsVal(declared.toString());
  }, [declared]);

  // Alertas
  const myPartnersCount = partners.filter(
    (p) =>
      p.team_member_id === currentMember?.id ||
      p.created_by_name?.toLowerCase() === currentMember?.display_name.toLowerCase()
  ).length;
  const hasZeroHoursWithPartners = myHours === 0 && myPartnersCount > 0;

  const membersWithHours = shifts.filter((s) => Number(s.hours_worked) > 0).length;

  const handleSaveHours = async () => {
    const num = parseFloat(hoursVal.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 24) return;
    setControlError(null);
    setIsSavingHours(true);
    const { error } = await updateMyHours(num);
    setIsSavingHours(false);
    if (error) {
      setControlError(typeof error === 'string' ? error : 'Error al guardar horas.');
      return;
    }
    setIsEditingHours(false);
  };

  const handleSaveCollectors = async () => {
    const count = parseInt(collectorsVal, 10);
    if (isNaN(count) || count < 0) return;
    setControlError(null);
    setIsSavingCollectors(true);
    const { error } = await updateDeclaredCollectors(count);
    setIsSavingCollectors(false);
    if (error) {
      setControlError(typeof error === 'string' ? error : 'Error al actualizar captadores.');
      return;
    }
    setIsEditingCollectors(false);
  };

  return (
    <div className="space-y-3 mb-4 sm:mb-5">
      {/* DOS RECUADROS UNO AL LADO DEL OTRO EN TABLET/PC, APILADOS EN MÓVIL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. RECUADRO MIS HORAS */}
        <div className="bg-white rounded-2xl border border-[#E2DBD0] p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-[#F7F3EE] rounded-xl text-[#D6001C] shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] sm:text-xs font-black text-neutral-900 uppercase tracking-wider truncate">
                  MIS HORAS DE HOY
                </h3>
                <span className="text-[11px] font-bold text-neutral-500 block truncate">
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
                className="text-[11px] sm:text-xs font-bold text-neutral-600 hover:text-[#D6001C] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F7F3EE]/80 hover:bg-neutral-100 border border-[#E2DBD0] transition-colors shrink-0 cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
                <span>Editar</span>
              </button>
            )}
          </div>

          {isEditingHours ? (
            <div className="space-y-2 mt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={24}
                  value={hoursVal}
                  onChange={(e) => setHoursVal(e.target.value)}
                  className="w-16 h-9 px-2 text-sm font-black text-center bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
                />
                <span className="text-xs font-bold text-neutral-600">hs</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSaveHours}
                    disabled={isSavingHours}
                    className="h-9 px-3 bg-[#D6001C] text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-[#b80017] flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingHours(false)}
                    className="h-9 w-9 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer"
                    title="Cancelar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setHoursVal('4');
                    updateMyHours(4);
                    setIsEditingHours(false);
                  }}
                  className="px-2 py-1 text-[11px] font-black rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                >
                  4h (Jornada)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHoursVal('3');
                    updateMyHours(3);
                    setIsEditingHours(false);
                  }}
                  className="px-2 py-1 text-[11px] font-bold rounded-lg bg-[#F7F3EE] hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
                >
                  3h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHoursVal('2');
                    updateMyHours(2);
                    setIsEditingHours(false);
                  }}
                  className="px-2 py-1 text-[11px] font-bold rounded-lg bg-[#F7F3EE] hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
                >
                  2h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHoursVal('0');
                    updateMyHours(0);
                    setIsEditingHours(false);
                  }}
                  className="px-2 py-1 text-[11px] font-black rounded-lg bg-neutral-100 hover:bg-amber-50 hover:text-amber-800 text-neutral-600 border border-neutral-300 transition-colors cursor-pointer"
                  title="Marcar franco rotativo o día no trabajado"
                >
                  0h (Franco)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-2 mt-1.5 pt-1.5 border-t border-neutral-100 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
                  {myHours}
                </span>
                <span className="text-[11px] font-bold text-neutral-500 uppercase">
                  {myHours === 1 ? 'hora' : 'horas'}
                </span>
              </div>
              <span
                className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  myHours > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {myHours > 0 ? `${myHours}h activa` : '0h (Franco / Sin turno)'}
              </span>
            </div>
          )}
        </div>

        {/* 2. RECUADRO CANTIDAD DE CAPTADORES */}
        <div className="bg-white rounded-2xl border border-[#E2DBD0] p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-[#F7F3EE] rounded-xl text-[#D6001C] shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] sm:text-xs font-black text-neutral-900 uppercase tracking-wider truncate">
                  CAPTADORES PRESENTES
                </h3>
                <span className="text-[11px] font-bold text-neutral-500 block truncate">
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
                className="text-[11px] sm:text-xs font-bold text-neutral-600 hover:text-[#D6001C] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F7F3EE]/80 hover:bg-neutral-100 border border-[#E2DBD0] transition-colors shrink-0 cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
                <span>Modificar</span>
              </button>
            )}
          </div>

          {isEditingCollectors ? (
            <div className="flex items-center gap-1.5 flex-wrap mt-1 pt-1">
              <input
                type="number"
                min={0}
                max={50}
                value={collectorsVal}
                onChange={(e) => setCollectorsVal(e.target.value)}
                className="w-16 h-9 px-2 text-sm font-black text-center bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D6001C]"
              />
              <span className="text-xs font-bold text-neutral-600">pers.</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSaveCollectors}
                  disabled={isSavingCollectors}
                  className="h-9 px-3 bg-[#D6001C] text-white font-bold text-[11px] uppercase tracking-wider rounded-xl hover:bg-[#b80017] flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingCollectors(false)}
                  className="h-9 w-9 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer"
                  title="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-2 mt-1.5 pt-1.5 border-t border-neutral-100 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
                  {declared}
                </span>
                <span className="text-[11px] font-bold text-neutral-500 uppercase">
                  {declared === 1 ? 'captador' : 'presentes'}
                </span>
              </div>
              <div className="text-right text-[11px] text-neutral-500">
                Con horas: <strong className="text-neutral-800">{membersWithHours}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {controlError && (
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
          {controlError}
        </div>
      )}

      {/* AVISO DE CERO HORAS CON SOCIOS */}
      {hasZeroHoursWithPartners && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>¡Atención {currentMember?.display_name}!</strong> Has registrado {myPartnersCount} socio(s) pero tus horas de hoy figuran en 0.
            Tocá <strong>Editar</strong> arriba para ingresar tus horas trabajadas y calcular bien tus promedios.
          </div>
        </div>
      )}
    </div>
  );
};
