import { useState } from 'react';
import { ArrowLeft, ChevronRight, FileText, Search, Trash2, X } from 'lucide-react';
import type { ScanRecord } from '../types';
import { countPendingChecklistItems, filterScansByQuery } from '../services/storageService';

interface HistoryViewProps {
  scans: ScanRecord[];
  onOpenScan: (scan: ScanRecord) => void;
  onDeleteScan: (scanId: string) => void;
  onBackHome: () => void;
}

export function HistoryView({
  scans,
  onOpenScan,
  onDeleteScan,
  onBackHome,
}: HistoryViewProps) {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = filterScansByQuery(scans, query);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-16 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackHome}
            className="min-h-[44px] -ml-2 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Inicio</span>
          </button>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Historial</h1>
        </div>

        <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
          {scans.length} {scans.length === 1 ? 'cuaderno' : 'cuadernos'}
        </span>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, texto transcrito o tareas..."
          aria-label="Buscar en el historial"
          className="w-full min-h-[48px] pl-10 pr-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-orange-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Empty states */}
      {scans.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Tu historial está vacío
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Cuando escanees tus primeras páginas manuscritas, aparecerán aquí para editarlas y reexportarlas.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            No encontramos coincidencias para "{query}"
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Prueba con otra palabra del título, texto o lista.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {filtered.map((scan) => {
            const thumb = scan.paginas[0]?.imageDataUrl;
            const dateLabel = new Date(scan.createdAt).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            const listStats = countPendingChecklistItems(scan);

            return (
              <div
                key={scan.id}
                className="flex items-center gap-3.5 p-3.5 sm:px-5 sm:py-4 hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onOpenScan(scan)}
                  className="flex items-center gap-3.5 flex-1 min-w-0 text-left"
                >
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0 flex items-center justify-center">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={`Miniatura de ${scan.titulo}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileText className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {scan.titulo}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{dateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {scan.paginas.length} {scan.paginas.length === 1 ? 'página' : 'páginas'}
                      </span>
                      {listStats.total > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums text-orange-600 dark:text-orange-400 font-medium">
                            {listStats.pending === 0
                              ? 'Lista completada'
                              : `${listStats.pending} ${listStats.pending === 1 ? 'pendiente' : 'pendientes'}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {confirmDeleteId === scan.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteScan(scan.id);
                        setConfirmDeleteId(null);
                      }}
                      className="min-h-[38px] px-3 rounded-lg bg-red-600 text-white text-xs font-semibold"
                    >
                      Eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[38px] px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(scan.id)}
                      aria-label={`Eliminar ${scan.titulo}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenScan(scan)}
                      aria-label={`Abrir ${scan.titulo}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
