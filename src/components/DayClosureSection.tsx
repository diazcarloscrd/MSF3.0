import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { generateWhatsAppReport, formatBuenosAiresDate } from '../lib/stats';
import { Copy, Share2, Check, Clock } from 'lucide-react';

export const DayClosureSection: React.FC = () => {
  const { stats, selectedDate, isViewingHistory, historicalClosure } = useWorkDay();
  const [copied, setCopied] = useState<boolean>(false);

  if (!stats) return null;

  const waText = historicalClosure?.whatsapp_message || generateWhatsAppReport(stats);

  const handleCopy = () => {
    navigator.clipboard.writeText(waText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    const encoded = encodeURIComponent(waText);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2DBD0] p-4 sm:p-5 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2 flex-wrap">
            <span>CIERRE DE JORNADA Y WHATSAPP</span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                isViewingHistory ? 'bg-neutral-800 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isViewingHistory
                ? `JORNADA GUARDADA (${formatBuenosAiresDate(selectedDate)})`
                : 'JORNADA EN CURSO'}
            </span>
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
            Formato oficial con estadísticas generales, desgloses y rendimiento individual
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-600 bg-[#F7F3EE] px-3 py-1.5 rounded-xl border border-[#E2DBD0] shrink-0">
          <Clock className="w-3.5 h-3.5 text-[#D6001C] shrink-0" />
          <span>Cierre y reinicio automático: 00:00 hs</span>
        </div>
      </div>

      {/* TEXTO FORMATEADO PARA WHATSAPP */}
      <div className="relative mb-4">
        <textarea
          readOnly
          value={waText}
          rows={12}
          className="w-full p-3.5 sm:p-4 font-mono text-xs text-neutral-800 bg-neutral-50 rounded-xl border border-[#E2DBD0] focus:outline-none resize-none leading-relaxed"
        />
      </div>

      {/* BOTONES DE ACCIÓN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
        <button
          onClick={handleCopy}
          className="h-11 px-4 rounded-xl border border-[#E2DBD0] hover:border-neutral-400 bg-[#F7F3EE]/80 hover:bg-[#F7F3EE] text-neutral-900 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700">¡Texto Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar Resumen</span>
            </>
          )}
        </button>

        <button
          onClick={handleWhatsAppShare}
          className="h-11 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
        >
          <Share2 className="w-4 h-4 stroke-[2.5]" />
          <span>Compartir por WhatsApp</span>
        </button>
      </div>
    </div>
  );
};
