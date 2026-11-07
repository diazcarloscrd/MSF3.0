import React from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { formatPesos, formatNumber } from '../lib/stats';
import { CreditCard, Wallet, Landmark, Award, Clock, DollarSign, Target, UserCheck, Calendar } from 'lucide-react';

export const StatsDashboard: React.FC = () => {
  const { stats, selectedDate } = useWorkDay();

  if (!stats) return null;

  return (
    <div className="space-y-4 sm:space-y-5 mb-5">
      {/* TARJETA HERO MSF RED - TOTAL DE PUNTOS */}
      <div className="rounded-2xl bg-gradient-to-br from-[#D6001C] via-[#c40019] to-[#990013] text-white p-4 sm:p-6 shadow-md shadow-red-500/15">
        <div className="flex items-center justify-between gap-2 opacity-90 mb-1 flex-wrap">
          <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-4 h-4 shrink-0" /> TOTAL PUNTOS JORNADA
          </span>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {selectedDate}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2 mt-2">
          <div>
            <div className="text-4xl sm:text-5xl font-black tracking-tight leading-none">
              {stats.total_points}
            </div>
            <p className="text-xs opacity-90 mt-2 font-medium">
              {stats.total_partners} {stats.total_partners === 1 ? 'socio' : 'socios'} • {formatPesos(stats.total_amount)}
            </p>
          </div>

          <div className="text-right">
            <div className="text-xl sm:text-2xl font-black">{formatNumber(stats.averages.points_per_hour)}</div>
            <div className="text-[10px] sm:text-[11px] uppercase tracking-wider opacity-85 font-bold">pts / hora</div>
          </div>
        </div>
      </div>

      {/* MÉTRICAS CLAVE EN CUADRÍCULA */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Socios Totales
          </div>
          <div className="text-xl sm:text-2xl font-black text-neutral-900">{stats.total_partners}</div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            {formatNumber(stats.averages.partners_per_collector)} por captador
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Dinero Total
          </div>
          <div className="text-base sm:text-xl font-black text-neutral-900 truncate">
            {formatPesos(stats.total_amount)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            Prom: {stats.averages.amount_per_partner !== null ? formatPesos(stats.averages.amount_per_partner) : 'N/D'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Horas Totales
          </div>
          <div className="text-xl sm:text-2xl font-black text-neutral-900">{stats.total_hours}h</div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            Prom: {formatNumber(stats.averages.hours_per_collector)}h/captador
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E2DBD0] p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Captadores
          </div>
          <div className="text-xl sm:text-2xl font-black text-neutral-900">{stats.declared_collectors}</div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">
            {formatNumber(stats.averages.points_per_collector)} pts/captador
          </div>
        </div>
      </div>

      {/* PROMEDIOS POR HORA Y EDAD PROMEDIO DE SOCIOS */}
      <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-2xs">
        <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-3">
          PROMEDIOS Y EDAD DE LA JORNADA
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-sm">
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">Edad Promedio:</span>
            <strong className="text-base sm:text-lg font-black text-neutral-900">
              {stats.average_age !== null ? `${stats.average_age} años` : 'N/D'}
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">Socios / Hora:</span>
            <strong className="text-base sm:text-lg font-black text-neutral-900">
              {formatNumber(stats.averages.partners_per_hour)}
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">Puntos / Hora:</span>
            <strong className="text-base sm:text-lg font-black text-neutral-900">
              {formatNumber(stats.averages.points_per_hour)}
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 bg-[#F7F3EE] rounded-xl">
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold block uppercase">Dinero / Hora:</span>
            <strong className="text-base sm:text-lg font-black text-neutral-900 truncate block">
              {stats.averages.amount_per_hour !== null ? formatPesos(stats.averages.amount_per_hour) : 'N/D'}
            </strong>
          </div>
        </div>
      </div>

      {/* DESGLOSE POR MEDIO DE CAPTACIÓN */}
      <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-2xs">
        <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-3">
          DESGLOSE POR MEDIO DE CAPTACIÓN
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Tarjeta de Crédito</h4>
                <p className="text-[10px] text-neutral-500 font-medium">1,0 pt c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {stats.breakdown.credit_card.count} socios
              </div>
              <div className="text-[11px] font-extrabold text-emerald-700">
                {stats.breakdown.credit_card.points} pts
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Tarjeta de Débito</h4>
                <p className="text-[10px] text-neutral-500 font-medium">0,7 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {stats.breakdown.debit_card.count} socios
              </div>
              <div className="text-[11px] font-extrabold text-blue-700">
                {stats.breakdown.debit_card.points} pts
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-purple-200 bg-purple-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-100 text-purple-800 rounded-lg">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">CBU / CVU Bancario</h4>
                <p className="text-[10px] text-neutral-500 font-medium">0,6 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {stats.breakdown.bank_cbu.count} socios
              </div>
              <div className="text-[11px] font-extrabold text-purple-700">
                {stats.breakdown.bank_cbu.points} pts
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Prepaga / Billetera</h4>
                <p className="text-[10px] text-neutral-500 font-medium">0,4 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-neutral-900">
                {stats.breakdown.prepaid_wallet.count} socios
              </div>
              <div className="text-[11px] font-extrabold text-amber-700">
                {stats.breakdown.prepaid_wallet.points} pts
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
