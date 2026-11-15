import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Ocultar si ya está instalada en modo standalone
  if (isInstalled) {
    return null;
  }

  // Android / Chrome / Edge: instalar con un toque
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-semibold text-zinc-800 dark:text-zinc-100 inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
      >
        <Download className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        <span>Instalar app</span>
      </button>
    );
  }

  // iPhone / Safari: guía breve de Compartir -> Agregar a pantalla de inicio
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-semibold text-zinc-800 dark:text-zinc-100 inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span>Instalar app</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Instalar Manuscrita en iPhone"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 pb-safe space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Instalar Manuscrita en iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Cerrar"
                  className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-zinc-400 hover:text-zinc-800 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed flex items-start gap-2.5">
                <Share className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                <span>
                  Toca el botón <strong>Compartir</strong> y luego{' '}
                  <strong>«Agregar a pantalla de inicio»</strong>.
                </span>
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
