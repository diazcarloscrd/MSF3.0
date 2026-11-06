import React from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { formatPesos, formatNumber } from '../lib/stats';
import { CreditCard, Wallet, Landmark, Award, Clock, DollarSign, Target, UserCheck } from 'lucide-react';

export const StatsDashboard: React.FC = () => {
  const { stats } = useWorkDay();

  if (!stats) return null;

  return (
    <div className="space-y-6 mb-6">
      {/* TARJETA HERO MSF RED - TOTAL DE PUNTOS */}
      <div className="rounded-2xl bg-gradient-to-br from-[#D6001C] via-[#c40019] to-[#990013] text-white p-6 shadow-lg shadow-red-500/20">
        <div className="flex items-center justify-between opacity-90 mb-1">
          <span className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-4 h-4" /> TOTAL DE PUNTOS JORNADA
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm">
            {stats.work_date}
          </span>
        </div>

        <div className="flex items-baseline justify-between mt-2">
          <div>
            <div className="text-5xl md:text-6xl font-black tracking-tight leading-none">
              {stats.total_points}
            </div>
            <p className="text-xs opacity-85 mt-2 font-medium">
              {stats.total_partners} socios registrados • {formatPesos(stats.total_amount)}
            </p>
          </div>

          <div className="text-right">
            <div className="text-2xl font-black">{formatNumber(stats.averages.points_per_hour)}</div>
            <div className="text-[11px] uppercase tracking-wider opacity-80 font-bold">pts / hora</div>
          </div>
        </div>
      </div>

      {/* MÉTRICAS CLAVE EN CUADRÍCULA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-neutral-400" /> Socios Totales
          </div>
          <div className="text-2xl font-black text-neutral-900">{stats.total_partners}</div>
          <div className="text-[11px] text-neutral-500 mt-1">
            {formatNumber(stats.averages.partners_per_collector)} por captador
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-neutral-400" /> Dinero Total
          </div>
          <div className="text-xl font-black text-neutral-900 truncate">
            {formatPesos(stats.total_amount)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Prom: {stats.averages.amount_per_partner !== null ? formatPesos(stats.averages.amount_per_partner) : 'N/D'}/socio
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-neutral-400" /> Horas Totales
          </div>
          <div className="text-2xl font-black text-neutral-900">{stats.total_hours}h</div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Prom: {formatNumber(stats.averages.hours_per_collector)}h/captador
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-neutral-400" /> Captadores
          </div>
          <div className="text-2xl font-black text-neutral-900">{stats.declared_collectors}</div>
          <div className="text-[11px] text-neutral-500 mt-1">
            {formatNumber(stats.averages.points_per_collector)} pts/captador
          </div>
        </div>
      </div>

      {/* PROMEDIOS POR HORA Y POR CAPTADOR */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
        <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-3">
          RENDIMIENTO POR HORA Y POR CAPTADOR
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-neutral-50 rounded-xl">
            <span className="text-xs text-neutral-500 font-medium block">Socios / Hora:</span>
            <strong className="text-base font-extrabold text-neutral-900">
              {formatNumber(stats.averages.partners_per_hour)}
            </strong>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl">
            <span className="text-xs text-neutral-500 font-medium block">Puntos / Hora:</span>
            <strong className="text-base font-extrabold text-neutral-900">
              {formatNumber(stats.averages.points_per_hour)}
            </strong>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl">
            <span className="text-xs text-neutral-500 font-medium block">Dinero / Hora:</span>
            <strong className="text-base font-extrabold text-neutral-900">
              {stats.averages.amount_per_hour !== null ? formatPesos(stats.averages.amount_per_hour) : 'N/D'}
            </strong>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl">
            <span className="text-xs text-neutral-500 font-medium block">Dinero / Captador:</span>
            <strong className="text-base font-extrabold text-neutral-900">
              {stats.averages.amount_per_collector !== null ? formatPesos(stats.averages.amount_per_collector) : 'N/D'}
            </strong>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl">
            <span className="text-xs text-neutral-500 font-medium block">Puntos / Socio:</span>
            <strong className="text-base font-extrabold text-neutral-900">
              {formatNumber(stats.averages.points_per_partner)}
            </strong>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl">
            <span className="text-xs text-neutral-500 font-medium block">Horas / Captador:</span>
            <strong className="text-base font-extrabold text-neutral-900">
              {formatNumber(stats.averages.hours_per_collector)}h
            </strong>
          </div>
        </div>
      </div>

      {/* DESGLOSE POR MEDIO DE CAPTACIÓN */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
        <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-4">
          DESGLOSE POR MEDIO DE CAPTACIÓN
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Tarjeta de Crédito</h4>
                <p className="text-[11px] text-neutral-500 font-medium">1,0 pt c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-black text-neutral-900">
                {stats.breakdown.credit_card.count}
              </div>
              <div className="text-xs font-extrabold text-emerald-700">
                {stats.breakdown.credit_card.points} pts
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Tarjeta de Débito</h4>
                <p className="text-[11px] text-neutral-500 font-medium">0,7 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-black text-neutral-900">
                {stats.breakdown.debit_card.count}
              </div>
              <div className="text-xs font-extrabold text-blue-700">
                {stats.breakdown.debit_card.points} pts
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-purple-200 bg-purple-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 text-purple-800 rounded-lg">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">CBU / CVU Bancario</h4>
                <p className="text-[11px] text-neutral-500 font-medium">0,6 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-black text-neutral-900">
                {stats.breakdown.bank_cbu.count}
              </div>
              <div className="text-xs font-extrabold text-purple-700">
                {stats.breakdown.bank_cbu.points} pts
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-amber-200 bg-amber-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-neutral-900">Prepaga / Billetera</h4>
                <p className="text-[11px] text-neutral-500 font-medium">0,4 pts c/u</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-black text-neutral-900">
                {stats.breakdown.prepaid_wallet.count}
              </div>
              <div className="text-xs font-extrabold text-amber-700">
                {stats.breakdown.prepaid_wallet.points} pts
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

