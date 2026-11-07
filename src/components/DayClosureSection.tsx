import React, { useState } from 'react';
import { useWorkDay } from '../context/WorkDayContext';
import { useAuth } from '../context/AuthContext';
import { generateWhatsAppReport, formatBuenosAiresDate } from '../lib/stats';
import { Copy, Share2, Check, Lock, Unlock, AlertCircle } from 'lucide-react';

export const DayClosureSection: React.FC = () => {
  const { stats, activeWorkDay, closeCurrentDay, reopenDay, isViewingHistory, historicalClosure } = useWorkDay();
  const { isAdmin } = useAuth();

  const [copied, setCopied] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [closureMsg, setClosureMsg] = useState<string | null>(null);

  if (!stats) return null;

  // Generate WA message text
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

  const handleManualClose = async () => {
    if (!isAdmin) return;
    if (!window.confirm('¿Seguro que deseas cerrar la jornada ahora y generar el resumen consolidado?')) return;

    setIsClosing(true);
    setClosureMsg(null);
    const { error } = await closeCurrentDay(false);
    setIsClosing(false);
    if (error) {
      setClosureMsg(`Error al cerrar: ${error.message || error}`);
    } else {
      setClosureMsg('Jornada cerrada exitosamente.');
    }
  };

  const handleReopen = async () => {
    if (!isAdmin || !activeWorkDay) return;
    if (!window.confirm('¿Deseas reabrir esta jornada para permitir modificaciones?')) return;

    const { error } = await reopenDay(activeWorkDay.id);
    if (error) {
      setClosureMsg(`Error al reabrir: ${error.message || error}`);
    } else {
      setClosureMsg('Jornada reabierta con éxito.');
    }
  };

  const isClosed = activeWorkDay?.status === 'CLOSED';

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            CIERRE DE JORNADA Y WHATSAPP
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                isClosed ? 'bg-neutral-800 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isClosed ? 'JORNADA CERRADA' : 'JORNADA EN CURSO'}
            </span>
          </h3>
          <p className="text-[11px] text-neutral-500 font-medium">
            Formato oficial con estadísticas, desgloses y rendimiento individual
          </p>
        </div>

        {isAdmin && !isViewingHistory && (
          <div>
            {!isClosed ? (
              <button
                onClick={handleManualClose}
                disabled={isClosing}
                className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                {isClosing ? 'Cerrando...' : 'Cerrar Jornada Ahora'}
              </button>
            ) : (
              <button
                onClick={handleReopen}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition-all"
              >
                <Unlock className="w-3.5 h-3.5" />
                Reabrir Jornada
              </button>
            )}
          </div>
        )}
      </div>

      {closureMsg && (
        <div className="mb-4 p-3 bg-neutral-100 rounded-xl text-xs font-bold text-neutral-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#D6001C]" />
          <span>{closureMsg}</span>
        </div>
      )}

      {/* TEXTO FORMATEADO PARA WHATSAPP */}
      <div className="relative mb-4">
        <textarea
          readOnly
          value={waText}
          rows={12}
          className="w-full p-4 font-mono text-xs text-neutral-800 bg-neutral-50 rounded-xl border border-neutral-200 focus:outline-none resize-none leading-relaxed"
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

