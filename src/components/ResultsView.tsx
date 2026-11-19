import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileDown,
  FileText,
  PenLine,
  RefreshCw,
  ZoomIn,
  X,
} from 'lucide-react';
import type { OcrListGroup, ResultsTab, ScanRecord } from '../types';
import { buildSmartPdfFilename, buildSmartTxtFilename, triggerBlobDownload } from '../services/pdfService';
import { ChecklistTab } from './ChecklistTab';
import { ExportPdfSheet } from './ExportPdfSheet';

interface ResultsViewProps {
  scan: ScanRecord;
  isRetryingOcr: boolean;
  onUpdateScan: (updated: ScanRecord) => void;
  onRetryOcr: () => void;
  onBackHome: () => void;
}

export function ResultsView({
  scan,
  isRetryingOcr,
  onUpdateScan,
  onRetryOcr,
  onBackHome,
}: ResultsViewProps) {
  const hasLists = scan.listas.length > 0;
  const [activeTab, setActiveTab] = useState<ResultsTab>('transcripcion');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // If lists were removed or current tab is hidden, keep activeTab valid
  const effectiveTab: ResultsTab = activeTab === 'listas' && !hasLists ? 'transcripcion' : activeTab;

  const smartFilename = buildSmartPdfFilename(scan.titulo, scan.createdAt);

  const handleTitleChange = (nextTitle: string) => {
    onUpdateScan({
      ...scan,
      titulo: nextTitle,
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePageTextChange = (pageId: string, nextText: string) => {
    onUpdateScan({
      ...scan,
      paginas: scan.paginas.map((p) => (p.id === pageId ? { ...p, texto: nextText } : p)),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleListsChange = (nextListas: OcrListGroup[]) => {
    onUpdateScan({
      ...scan,
      listas: nextListas,
      updatedAt: new Date().toISOString(),
    });
  };

  const buildCombinedPlainText = (): string => {
    const sections = scan.paginas
      .map((p) => {
        const header = scan.paginas.length > 1 ? `Página ${p.numero}\n` : '';
        return `${header}${p.texto.trim()}`;
      })
      .filter((s) => s.trim().length > 0);
    return `${scan.titulo}\n\n${sections.join('\n\n---\n\n')}`.trim();
  };

  const handleCopyAllText = async () => {
    const text = buildCombinedPlainText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 1800);
    } catch {
      // Clipboard error ignored
    }
  };

  const handleDownloadTxt = () => {
    const text = buildCombinedPlainText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, buildSmartTxtFilename(scan.titulo, scan.createdAt));
  };

  const formattedDate = new Date(scan.createdAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const totalPendingTasks = scan.listas.reduce(
    (sum, g) => sum + g.items.filter((it) => !it.completado).length,
    0,
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-28 space-y-5">
      {/* Navigation + Title Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="min-h-[44px] -ml-2 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Inicio</span>
          </button>

          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-[60%]">
            {smartFilename}
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
            <span className="font-medium text-orange-600 dark:text-orange-400 inline-flex items-center gap-1">
              <PenLine className="w-3.5 h-3.5" />
              {scan.origen_titulo === 'manuscrito' ? 'Del manuscrito' : 'Título automático'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formattedDate}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {scan.paginas.length} {scan.paginas.length === 1 ? 'página' : 'páginas'}
            </span>
            {scan.modelo && !scan.isDemo && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                  modelo: {scan.modelo}
                </span>
              </>
            )}
          </div>

          <input
            type="text"
            value={scan.titulo}
            onChange={(e) => handleTitleChange(e.target.value)}
            aria-label="Título del documento"
            placeholder="Título del documento..."
            className="w-full font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-transparent focus:border-orange-500 focus:outline-none py-1 transition-colors"
          />
        </div>
      </div>

      {/* Segmented Tabs */}
      <div
        role="tablist"
        aria-label="Vistas del resultado"
        className="flex items-center gap-1 p-1 bg-zinc-200/70 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl w-full sm:w-fit"
      >
        <button
          type="button"
          role="tab"
          aria-selected={effectiveTab === 'escaneo'}
          onClick={() => setActiveTab('escaneo')}
          className={`flex-1 sm:flex-none min-h-[42px] px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
            effectiveTab === 'escaneo'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          Escaneo
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={effectiveTab === 'transcripcion'}
          onClick={() => setActiveTab('transcripcion')}
          className={`flex-1 sm:flex-none min-h-[42px] px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
            effectiveTab === 'transcripcion'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          Transcripción
        </button>

        {hasLists && (
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'listas'}
            onClick={() => setActiveTab('listas')}
            className={`flex-1 sm:flex-none min-h-[42px] px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
              effectiveTab === 'listas'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Listas{totalPendingTasks > 0 ? ` (${totalPendingTasks})` : ''}
          </button>
        )}
      </div>

      {/* Tab Content */}
      {effectiveTab === 'escaneo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {scan.paginas.map((page) => (
            <figure
              key={page.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 space-y-3"
            >
              <div className="flex items-center justify-between px-1">
                <figcaption className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                  Página {page.numero}
                </figcaption>
                <button
                  type="button"
                  onClick={() => setZoomedImageUrl(page.imageDataUrl)}
                  className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>Ampliar</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setZoomedImageUrl(page.imageDataUrl)}
                className="w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/70 dark:border-zinc-800 block"
              >
                <img
                  src={page.imageDataUrl}
                  alt={`Escaneo página ${page.numero}`}
                  className="w-full h-auto object-contain max-h-[60vh]"
                />
              </button>
            </figure>
          ))}
        </div>
      )}

      {effectiveTab === 'transcripcion' && (
        <div className="space-y-4">
          {/* Action toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAllText}
                className="min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedText ? (
                  <>
                    <Check className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span>Texto copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar texto</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadTxt}
                className="min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Descargar .txt</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onRetryOcr}
              disabled={isRetryingOcr}
              className="min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${isRetryingOcr ? 'animate-spin' : ''}`} />
              <span>{isRetryingOcr ? 'Leyendo...' : 'Reintentar OCR'}</span>
            </button>
          </div>

          {/* Editable pages */}
          <div className="space-y-4">
            {scan.paginas.map((page) => (
              <section
                key={page.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
              >
                <div className="px-4 sm:px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span>Página {page.numero}</span>
                  </h3>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">Editable</span>
                </div>

                <div className="p-4 sm:p-5 notebook-paper-lines">
                  <textarea
                    value={page.texto}
                    onChange={(e) => handlePageTextChange(page.id, e.target.value)}
                    rows={Math.max(6, Math.min(20, page.texto.split('\n').length + 2))}
                    placeholder="No se detectó texto adicional en esta página (escribe aquí si deseas añadir notas)..."
                    aria-label={`Texto transcrito página ${page.numero}`}
                    className="w-full bg-transparent text-[15px] sm:text-base leading-[32px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none resize-y"
                  />
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {effectiveTab === 'listas' && hasLists && (
        <ChecklistTab listas={scan.listas} onChangeListas={handleListsChange} />
      )}

      {/* Sticky Bottom Export Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 px-4 py-2.5 pb-safe">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:block text-xs text-zinc-500 dark:text-zinc-400 truncate">
            Archivo: <span className="font-mono">{smartFilename}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsExportOpen(true)}
            className="w-full sm:w-auto sm:ml-auto min-h-[48px] px-6 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-transform whitespace-nowrap"
          >
            <FileDown className="w-4 h-4" />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      <ExportPdfSheet isOpen={isExportOpen} scan={scan} onClose={() => setIsExportOpen(false)} />

      {/* Fullscreen image zoom lightbox */}
      {zoomedImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedImageUrl(null)}
            aria-label="Cerrar imagen ampliada"
            className="fixed top-4 right-4 min-w-[44px] min-h-[44px] rounded-full bg-zinc-900/80 text-white flex items-center justify-center border border-white/15"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={zoomedImageUrl}
            alt="Escaneo ampliado"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
