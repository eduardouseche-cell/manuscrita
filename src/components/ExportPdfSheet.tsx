import { useEffect, useState } from 'react';
import { Check, Download, FileText, Share2, X } from 'lucide-react';
import type { PdfExportOptions, ScanRecord } from '../types';
import {
  buildSmartPdfFilename,
  canSharePdfFiles,
  generateScanPdf,
  sharePdfFile,
  triggerBlobDownload,
} from '../services/pdfService';

interface ExportPdfSheetProps {
  isOpen: boolean;
  scan: ScanRecord;
  onClose: () => void;
}

export function ExportPdfSheet({ isOpen, scan, onClose }: ExportPdfSheetProps) {
  const hasLists = scan.listas.length > 0;
  const [options, setOptions] = useState<PdfExportOptions>({
    includeImages: true,
    includeText: true,
    includeLists: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ blob: Blob; filename: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shareAvailable, setShareAvailable] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGenerated(null);
      setErrorMsg(null);
      setShareAvailable(canSharePdfFiles());
      setOptions({
        includeImages: true,
        includeText: true,
        includeLists: scan.listas.length > 0,
      });
    }
  }, [isOpen, scan.id, scan.listas.length]);

  if (!isOpen) return null;

  const smartFilename = buildSmartPdfFilename(scan.titulo, scan.createdAt);
  const nothingSelected =
    !options.includeImages && !options.includeText && (!hasLists || !options.includeLists);

  const handleExport = async () => {
    if (nothingSelected) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const result = await generateScanPdf(scan, {
        ...options,
        includeLists: hasLists && options.includeLists,
      });
      setGenerated(result);
      triggerBlobDownload(result.blob, result.filename);
    } catch {
      setErrorMsg('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!generated) return;
    try {
      await sharePdfFile(generated.blob, generated.filename, scan.titulo);
    } catch {
      // User cancelled share sheet
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Exportar PDF"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden"
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mt-3" />

        <div className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Exportar PDF</h2>
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {smartFilename}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Export switches */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <label className="flex items-center justify-between gap-3 px-4 min-h-[56px] cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                Incluir imagen del escaneo
              </span>
              <input
                type="checkbox"
                checked={options.includeImages}
                onChange={(e) => {
                  setOptions((prev) => ({ ...prev, includeImages: e.target.checked }));
                  setGenerated(null);
                }}
                className="w-5 h-5 accent-orange-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between gap-3 px-4 min-h-[56px] cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                Incluir texto transcrito
              </span>
              <input
                type="checkbox"
                checked={options.includeText}
                onChange={(e) => {
                  setOptions((prev) => ({ ...prev, includeText: e.target.checked }));
                  setGenerated(null);
                }}
                className="w-5 h-5 accent-orange-600 rounded"
              />
            </label>

            {hasLists && (
              <label className="flex items-center justify-between gap-3 px-4 min-h-[56px] cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  Incluir listas
                </span>
                <input
                  type="checkbox"
                  checked={options.includeLists}
                  onChange={(e) => {
                    setOptions((prev) => ({ ...prev, includeLists: e.target.checked }));
                    setGenerated(null);
                  }}
                  className="w-5 h-5 accent-orange-600 rounded"
                />
              </label>
            )}
          </div>

          {nothingSelected && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Activa al menos una sección para generar el documento PDF.
            </p>
          )}

          {errorMsg && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
          )}

          {generated && (
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  PDF generado y descargado
                </p>
                <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate">
                  {generated.filename}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1 pb-safe">
            <button
              type="button"
              onClick={handleExport}
              disabled={isGenerating || nothingSelected}
              className="flex-1 min-h-[48px] px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition-transform whitespace-nowrap"
            >
              {generated ? <Download className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              <span>
                {isGenerating
                  ? 'Generando PDF...'
                  : generated
                    ? 'Descargar otra vez'
                    : 'Generar y descargar PDF'}
              </span>
            </button>

            {generated && shareAvailable && (
              <button
                type="button"
                onClick={handleShare}
                className="min-h-[48px] px-5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 whitespace-nowrap"
              >
                <Share2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Compartir</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
