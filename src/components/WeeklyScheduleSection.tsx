import React, { useState, useMemo } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { MemberWeeklySchedule, ScheduleDayEntry } from '../types/database';
import { Calendar, Users, MapPin, Clock, Save, Check, Coffee, UserCheck } from 'lucide-react';

const DAYS_OF_WEEK: ('Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado')[] = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const PRESET_LOCATIONS = [
  'Colón y Drago',
  'Shopping',
  'Plaza Rivadavia',
  'Villa Mitre',
  'Peatonal Drago',
  'Colón y Chiclana',
  'Bahía Blanca Centro',
];

const PRESET_SHIFTS = [
  '10:00 a 14:00 (Turno Mañana)',
  '16:00 a 20:00 (Turno Tarde / Shopping)',
  '10:00 a 13:00',
  '10:00 a 14:00 y 16:00 a 20:00 (Jornada Dividida)',
];

export const WeeklyScheduleSection: React.FC = () => {
  const { teamMembers, currentMember } = useAuth();
  const { weeklySchedules, saveMemberSchedule } = useWorkDay();

  const getISOWeek = (date: Date) => {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  };

  const currentYear = new Date().getFullYear();
  const [selectedWeek, setSelectedWeek] = useState<number>(getISOWeek(new Date()));
  const [selectedMemberId, setSelectedMemberId] = useState<string>(currentMember?.id || '');
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  const activeMembers = useMemo(() => {
    return teamMembers.filter((m) => m.is_active && m.display_name.toLowerCase() !== 'morena');
  }, [teamMembers]);

  const targetMember = useMemo(() => {
    return activeMembers.find((m) => m.id === selectedMemberId) || activeMembers[0];
  }, [activeMembers, selectedMemberId]);

  // Fechas de Lunes a Sábado de la semana ISO
  const weekDates = useMemo(() => {
    const jan4 = new Date(currentYear, 0, 4);
    const dayOfWeek = (jan4.getDay() + 6) % 7;
    const mondayFirstWeek = new Date(jan4);
    mondayFirstWeek.setDate(jan4.getDate() - dayOfWeek);

    const targetMonday = new Date(mondayFirstWeek);
    targetMonday.setDate(mondayFirstWeek.getDate() + (selectedWeek - 1) * 7);

    return DAYS_OF_WEEK.map((dayName, idx) => {
      const d = new Date(targetMonday);
      d.setDate(targetMonday.getDate() + idx);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return { dayName, dateStr };
    });
  }, [selectedWeek, currentYear]);

  // Cargar cronograma del miembro o inicializarlo
  const currentSchedule = useMemo(() => {
    const existing = weeklySchedules.find(
      (s) => s.member_id === targetMember?.id && s.week_number === selectedWeek && s.year === currentYear
    );
    if (existing) return existing;

    const defaultDays: ScheduleDayEntry[] = weekDates.map(({ dayName, dateStr }) => ({
      day_of_week: dayName,
      date: dateStr,
      is_day_off: dayName === 'Lunes', // Por defecto si trabaja sábado, lunes franco rotativo
      location: dayName === 'Viernes' ? 'Shopping' : 'Colón y Drago',
      shift_time: '10:00 a 14:00 (Turno Mañana)',
      partner_names: [],
    }));

    return {
      id: `sched-${currentYear}-w${selectedWeek}-${targetMember?.id}`,
      week_number: selectedWeek,
      year: currentYear,
      member_id: targetMember?.id || '',
      member_name: targetMember?.display_name || '',
      days: defaultDays,
      updated_at: new Date().toISOString(),
    };
  }, [weeklySchedules, targetMember?.id, selectedWeek, currentYear, weekDates]);

  const [daysState, setDaysState] = useState<ScheduleDayEntry[]>(currentSchedule.days);

  // Sincronizar estado cuando cambie currentSchedule
  React.useEffect(() => {
    setDaysState(currentSchedule.days);
  }, [currentSchedule]);

  const handleDayChange = (index: number, field: keyof ScheduleDayEntry, value: any) => {
    setDaysState((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const togglePartner = (dayIndex: number, partnerName: string) => {
    setDaysState((prev) => {
      const updated = [...prev];
      const curPartners = updated[dayIndex].partner_names || [];
      if (curPartners.includes(partnerName)) {
        updated[dayIndex] = {
          ...updated[dayIndex],
          partner_names: curPartners.filter((p) => p !== partnerName),
        };
      } else {
        if (curPartners.length >= 3) return prev; // Parejas o tríos máx
        updated[dayIndex] = {
          ...updated[dayIndex],
          partner_names: [...curPartners, partnerName],
        };
      }
      return updated;
    });
  };

  const handleSaveSchedule = () => {
    if (!targetMember) return;
    const scheduleToSave: MemberWeeklySchedule = {
      id: `sched-${currentYear}-w${selectedWeek}-${targetMember.id}`,
      week_number: selectedWeek,
      year: currentYear,
      member_id: targetMember.id,
      member_name: targetMember.display_name,
      days: daysState,
      updated_at: new Date().toISOString(),
    };

    saveMemberSchedule(scheduleToSave);
    setSavedSuccess(`¡Cronograma de la Semana ${selectedWeek} guardado para ${targetMember.display_name}!`);
    setTimeout(() => setSavedSuccess(null), 3000);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-6 shadow-sm mb-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#D6001C]" />
            CRONOGRAMA SEMANAL DE EQUIPO
          </h3>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            Organización de días de trabajo, francos rotativos (Sábados/Día de semana), zonas y grupos de 2 o 3
          </p>
        </div>

        {/* SELECTOR DE SEMANA Y CAPTADOR */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
            <Calendar className="w-4 h-4 text-neutral-500 ml-1" />
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value, 10))}
              className="text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Semana {w} ({currentYear})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#F7F3EE] p-1.5 rounded-xl border border-[#E2DBD0]">
            <UserCheck className="w-4 h-4 text-neutral-500 ml-1" />
            <select
              value={targetMember?.id || ''}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="text-xs font-black bg-white border border-[#E2DBD0] rounded-lg px-2.5 py-1 text-neutral-900 focus:outline-none cursor-pointer"
            >
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* TARJETA DE REGLA ROTATIVA */}
      <div className="mb-5 p-3.5 bg-[#F7F3EE] rounded-xl border border-[#E2DBD0] text-xs text-neutral-700 flex items-start gap-2.5">
        <Coffee className="w-4 h-4 text-[#D6001C] flex-shrink-0 mt-0.5" />
        <div>
          <strong>Regla de turnos y francos rotativos:</strong> Quien trabaja el <strong>Sábado</strong> se toma un día franco en la semana. Marcá la casilla <strong>"Franco Rotativo"</strong> en el día correspondiente. Podés armar el grupo de 2 o 3 integrantes seleccionando a tus compañeros.
        </div>
      </div>

      {/* DÍAS DE LUNES A SÁBADO */}
      <div className="space-y-3.5 mb-6">
        {daysState.map((day, idx) => {
          const otherMembers = activeMembers.filter(
            (m) => m.display_name.toLowerCase() !== targetMember?.display_name.toLowerCase()
          );

          return (
            <div
              key={day.day_of_week}
              className={`p-4 rounded-2xl border-2 transition-all ${
                day.is_day_off
                  ? 'border-neutral-300 bg-neutral-100/60 opacity-80'
                  : 'border-[#E2DBD0] bg-white hover:border-[#D6001C]/60 shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-neutral-900 uppercase">
                    {day.day_of_week} ({day.date})
                  </span>
                  {day.day_of_week === 'Sábado' && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Jornada Especial Sábado
                    </span>
                  )}
                  {day.day_of_week === 'Viernes' && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300">
                      Jornada Shopping / Dividida
                    </span>
                  )}
                </div>

                {/* BOTÓN TOGGLE FRANCO */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={day.is_day_off}
                    onChange={(e) => handleDayChange(idx, 'is_day_off', e.target.checked)}
                    className="w-4 h-4 text-[#D6001C] rounded focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs font-black text-neutral-700">
                    {day.is_day_off ? 'Día de Franco Rotativo (Descanso)' : 'Trabaja este día'}
                  </span>
                </label>
              </div>

              {!day.is_day_off && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-100">
                  {/* ZONA */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-500 uppercase flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3 text-[#D6001C]" /> Zona / Locación
                    </label>
                    <input
                      type="text"
                      list={`locations-${idx}`}
                      value={day.location}
                      onChange={(e) => handleDayChange(idx, 'location', e.target.value)}
                      placeholder="Ej: Colón y Drago"
                      className="w-full h-9 px-2.5 text-xs font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
                    />
                    <datalist id={`locations-${idx}`}>
                      {PRESET_LOCATIONS.map((loc) => (
                        <option key={loc} value={loc} />
                      ))}
                    </datalist>
                  </div>

                  {/* HORARIO / TURNO */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-500 uppercase flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-[#D6001C]" /> Horario / Turno
                    </label>
                    <input
                      type="text"
                      list={`shifts-${idx}`}
                      value={day.shift_time}
                      onChange={(e) => handleDayChange(idx, 'shift_time', e.target.value)}
                      placeholder="10:00 a 14:00"
                      className="w-full h-9 px-2.5 text-xs font-bold bg-[#F7F3EE] border border-neutral-300 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#D6001C]"
                    />
                    <datalist id={`shifts-${idx}`}>
                      {PRESET_SHIFTS.map((sh) => (
                        <option key={sh} value={sh} />
                      ))}
                    </datalist>
                  </div>

                  {/* COMPAÑEROS DEL GRUPO (PAREJA O TRÍO) */}
                  <div>
                    <label className="text-[10px] font-black text-neutral-500 uppercase flex items-center gap-1 mb-1">
                      <Users className="w-3 h-3 text-[#D6001C]" /> Grupo (Pareja o Trío)
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
                      {otherMembers.map((m) => {
                        const isChosen = (day.partner_names || []).includes(m.display_name);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => togglePartner(idx, m.display_name)}
                            className={`px-2 py-0.5 text-[11px] font-black rounded-lg transition-colors ${
                              isChosen
                                ? 'bg-[#D6001C] text-white shadow-xs'
                                : 'bg-[#F7F3EE] text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            {m.display_name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* BOTÓN GUARDAR CRONOGRAMA */}
      <button
        type="button"
        onClick={handleSaveSchedule}
        className="w-full h-12 bg-[#D6001C] hover:bg-[#b80017] text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        <span>GUARDAR CRONOGRAMA SEMANA {selectedWeek} ({targetMember?.display_name.toUpperCase()})</span>
      </button>
    </div>
  );
};
