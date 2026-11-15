import { useState } from 'react';
import {
  ArrowLeft,
  Mail,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import type { ThemeMode } from '../types';

export const APP_VERSION = '1.0.0';

interface SettingsViewProps {
  themeMode: ThemeMode;
  historyCount: number;
  onChangeTheme: (mode: ThemeMode) => void;
  onClearHistory: () => Promise<void>;
  onBackHome: () => void;
}

export function SettingsView({
  themeMode,
  historyCount,
  onChangeTheme,
  onClearHistory,
  onBackHome,
}: SettingsViewProps) {
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [historyClearedMsg, setHistoryClearedMsg] = useState(false);

  const handleConfirmClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      await onClearHistory();
      setConfirmClearHistory(false);
      setHistoryClearedMsg(true);
      setTimeout(() => setHistoryClearedMsg(false), 2500);
    } finally {
      setIsClearingHistory(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-16 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBackHome}
          className="min-h-[44px] -ml-2 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Inicio</span>
        </button>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Ajustes</h1>
      </div>

      {/* Section 1: Appearance (Claro / Oscuro / Automático) */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Apariencia</h2>
        <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl">
          {(
            [
              { id: 'light', label: 'Claro', icon: Sun },
              { id: 'dark', label: 'Oscuro', icon: Moon },
              { id: 'auto', label: 'Automático', icon: Monitor },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = themeMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeTheme(id)}
                className={`min-h-[42px] px-3 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 2: Local History Management */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Historial local</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              {historyCount} {historyCount === 1 ? 'cuaderno guardado' : 'cuadernos guardados'} en
              este dispositivo
            </p>
          </div>

          {!confirmClearHistory && (
            <button
              type="button"
              disabled={historyCount === 0}
              onClick={() => setConfirmClearHistory(true)}
              className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              <span>Borrar todo el historial</span>
            </button>
          )}
        </div>

        {confirmClearHistory && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-medium text-red-800 dark:text-red-200">
              ¿Seguro? Se eliminarán todos los escaneos guardados de forma permanente.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isClearingHistory}
                onClick={handleConfirmClearHistory}
                className="min-h-[40px] px-3.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
              >
                {isClearingHistory ? 'Borrando...' : 'Sí, borrar todo'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearHistory(false)}
                className="min-h-[40px] px-3.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {historyClearedMsg && (
          <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
            Historial borrado correctamente.
          </p>
        )}
      </section>

      {/* Section 3: Privacy & Local Storage Notice */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
              Privacidad y almacenamiento
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Tus cuadernos, imágenes procesadas, transcripciones y listas se almacenan únicamente
              en este dispositivo (IndexedDB). Las imágenes se envían al servicio de lectura para
              extraer el texto cuando confirmas un escaneo.
            </p>
          </div>
        </div>
      </section>

      {/* Discrete Footer with App Version, Gemini Attribution, Credit & Support Link */}
      <footer className="pt-2 pb-4 px-1 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Manuscrita v{APP_VERSION}</span>
          <span aria-hidden="true">·</span>
          <span>Hecho con Gemini</span>
          <span aria-hidden="true">·</span>
          <span className="select-text">Esta app es una idea de @proyectomur</span>
        </div>

        <a
          href="mailto:soporte@manuscrita.app?subject=Soporte%20Manuscrita"
          className="inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Contacto y soporte</span>
        </a>
      </footer>
    </div>
  );
}
