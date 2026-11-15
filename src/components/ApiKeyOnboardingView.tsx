import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Play,
} from 'lucide-react';
import { saveStoredApiKey, testGeminiApiKey } from '../services/geminiService';

interface ApiKeyOnboardingViewProps {
  onSuccess: () => void;
  onTryDemo: () => void;
  onCancel: () => void;
}

export function ApiKeyOnboardingView({
  onSuccess,
  onTryDemo,
  onCancel,
}: ApiKeyOnboardingViewProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    technicalDetail?: string;
  } | null>(null);

  const handleTest = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const res = await testGeminiApiKey(apiKeyInput);
      if (res.ok) {
        setFeedback({ type: 'success', message: '✓ Clave válida' });
      } else {
        setFeedback({
          type: 'error',
          message: res.message,
          technicalDetail: res.technicalDetail,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: 'No pudimos verificar la clave.',
        technicalDetail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndContinue = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', message: 'Pega tu clave de API para continuar.' });
      return;
    }
    saveStoredApiKey(trimmed);
    onSuccess();
  };

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-5">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-[44px] -ml-2 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Volver</span>
      </button>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2.5">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white text-balance">
            Antes de empezar, conecta tu clave gratuita de Gemini
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            Manuscrita funciona directamente desde tu navegador sin servidores intermedios. Tu clave
            se guarda solo en este dispositivo.
          </p>
        </div>

        {/* 3 quick steps */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            <span>Obtener clave gratis en Google AI Studio</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <ol className="space-y-1.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 list-decimal list-inside">
            <li>Inicia sesión con tu cuenta de Google.</li>
            <li>Pulsa «Crear clave de API».</li>
            <li>Cópiala y pégala aquí abajo.</li>
          </ol>
        </div>

        {/* Key input */}
        <div className="space-y-3">
          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setFeedback(null);
              }}
              placeholder="Pega tu clave de Gemini (AIza...)"
              aria-label="Clave de Gemini"
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

          {feedback && (
            <div role="status" className="space-y-1">
              <p
                className={`text-xs font-medium ${
                  feedback.type === 'success'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {feedback.message}
              </p>
              {feedback.technicalDetail && (
                <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 break-words">
                  {feedback.technicalDetail}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleSaveAndContinue}
              disabled={!apiKeyInput.trim()}
              className="flex-1 min-h-[48px] px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 whitespace-nowrap"
            >
              <span>Guardar y continuar</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !apiKeyInput.trim()}
              className="min-h-[48px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap"
            >
              {isTesting ? 'Probando...' : 'Probar clave'}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            ¿Solo quieres explorar la app primero?
          </span>
          <button
            type="button"
            onClick={onTryDemo}
            className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 inline-flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Probar modo demo</span>
          </button>
        </div>
      </section>

      <p className="text-center text-[12.5px] text-zinc-600 dark:text-zinc-400 pt-1 select-text">
        Esta app es una idea de @proyectomur
      </p>
    </div>
  );
}
