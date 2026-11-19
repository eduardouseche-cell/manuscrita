import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
  Trash2,
} from 'lucide-react';
import type { ThemeMode } from '../types';
import {
  clearStoredApiKey,
  getStoredApiKey,
  saveStoredApiKey,
  testGeminiApiKey,
} from '../services/geminiService';

export const APP_VERSION = '1.0.0';

interface SettingsViewProps {
  themeMode: ThemeMode;
  historyCount: number;
  onChangeTheme: (mode: ThemeMode) => void;
  onClearHistory: () => Promise<void>;
  onApiKeyChanged: (hasKey: boolean) => void;
  onBackHome: () => void;
}

export function SettingsView({
  themeMode,
  historyCount,
  onChangeTheme,
  onClearHistory,
  onApiKeyChanged,
  onBackHome,
}: SettingsViewProps) {
  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredApiKey());
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    technicalDetail?: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [historyClearedMsg, setHistoryClearedMsg] = useState(false);

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestFeedback(null);
    setSaveNotice(null);
    try {
      const result = await testGeminiApiKey(apiKeyInput);
      if (result.ok) {
        setTestFeedback({
          type: 'success',
          message: '✓ Clave válida',
          technicalDetail: result.technicalDetail,
        });
      } else {
        setTestFeedback({
          type: 'error',
          message: result.message,
          technicalDetail: result.technicalDetail,
        });
      }
    } catch (err) {
      setTestFeedback({
        type: 'error',
        message: 'No pudimos probar la clave.',
        technicalDetail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setTestFeedback({
        type: 'error',
        message: 'Ingresa una clave válida antes de guardar.',
      });
      return;
    }
    saveStoredApiKey(trimmed);
    onApiKeyChanged(true);
    setSaveNotice('Clave guardada en este dispositivo.');
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleDeleteKey = () => {
    clearStoredApiKey();
    setApiKeyInput('');
    setTestFeedback(null);
    onApiKeyChanged(false);
    setSaveNotice('Clave eliminada del dispositivo.');
    setTimeout(() => setSaveNotice(null), 2500);
  };

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

      {/* Section 1: Personal Gemini API Key */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span>Tu clave de Gemini (gratis)</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Se guarda únicamente en este dispositivo y se envía solo a Google Gemini.
            </p>
          </div>
        </div>

        {/* Password input + show/hide */}
        <div className="space-y-2.5">
          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setTestFeedback(null);
                setSaveNotice(null);
              }}
              placeholder="Pega tu clave de API (AIza...)"
              aria-label="Tu clave de Gemini"
              autoComplete="off"
              spellCheck={false}
              className="w-full min-h-[48px] pl-4 pr-12 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:font-sans placeholder:text-zinc-400 focus:outline-none focus:border-orange-500"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
              className="absolute right-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {testFeedback && (
            <div role="status" className="space-y-1">
              <p
                className={`text-xs font-medium ${
                  testFeedback.type === 'success'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {testFeedback.message}
              </p>
              {testFeedback.technicalDetail && (
                <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 break-words">
                  {testFeedback.technicalDetail}
                </p>
              )}
            </div>
          )}

          {saveNotice && (
            <p role="status" className="text-xs font-medium text-orange-600 dark:text-orange-400">
              {saveNotice}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleSaveKey}
              disabled={!apiKeyInput.trim()}
              className="min-h-[44px] px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              <span>Guardar</span>
            </button>

            <button
              type="button"
              onClick={handleTestKey}
              disabled={isTesting || !apiKeyInput.trim()}
              className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm font-semibold text-zinc-800 dark:text-zinc-100 disabled:opacity-40 whitespace-nowrap"
            >
              {isTesting ? 'Probando...' : 'Probar clave'}
            </button>

            <button
              type="button"
              onClick={handleDeleteKey}
              disabled={!apiKeyInput && !getStoredApiKey()}
              className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/60 disabled:opacity-40 whitespace-nowrap"
            >
              Borrar clave
            </button>
          </div>
        </div>

        {/* 3 steps guide + Google AI Studio link */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            <span>¿Cómo obtengo mi clave gratis?</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <ol className="space-y-1.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 list-decimal list-inside">
            <li>Inicia sesión con tu cuenta de Google.</li>
            <li>Pulsa «Crear clave de API».</li>
            <li>Cópiala y pégala aquí arriba.</li>
          </ol>
        </div>

        {/* Privacy Notice */}
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Tus escaneos se procesan con la API de Gemini usando tu propia clave. Con el nivel
            gratuito, Google puede usar los datos enviados para mejorar sus productos. Evita escanear
            información sensible. Tu historial y tu clave se guardan solo en este dispositivo.
          </p>
        </div>
      </section>

      {/* Section 2: Appearance (Claro / Oscuro / Automático) */}
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

      {/* Section 3: Local History Management */}
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
