import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Crop,
  ImagePlus,
  RotateCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { EnhancementPreset, EnhancementSettings, StagedPage } from '../types';
import { processPageImage } from '../services/imageProcessor';
import { PerspectiveEditorModal } from './PerspectiveEditorModal';

interface StagingViewProps {
  pages: StagedPage[];
  isDemoSession: boolean;
  onUpdatePages: (nextPages: StagedPage[]) => void;
  onOpenCamera: () => void;
  onUploadFiles: () => void;
  onConfirmProcess: () => void;
  onCancel: () => void;
}

const PRESET_LABELS: Array<{ id: EnhancementPreset; label: string }> = [
  { id: 'documento', label: 'Papel blanco' },
  { id: 'alto_contraste', label: 'Alto contraste' },
  { id: 'original', label: 'Original' },
];

export function StagingView({
  pages,
  isDemoSession,
  onUpdatePages,
  onOpenCamera,
  onUploadFiles,
  onConfirmProcess,
  onCancel,
}: StagingViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingPage, setEditingPage] = useState<StagedPage | null>(null);
  const [busyPageId, setBusyPageId] = useState<string | null>(null);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);

  const safeIndex = Math.min(selectedIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex] || null;

  const handleDeletePage = (index: number) => {
    const next = pages.filter((_, i) => i !== index);
    onUpdatePages(next);
    if (safeIndex >= next.length && next.length > 0) {
      setSelectedIndex(next.length - 1);
    }
  };

  const handleMovePage = (from: number, to: number) => {
    if (to < 0 || to >= pages.length || from === to) return;
    const copy = [...pages];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    onUpdatePages(copy);
    setSelectedIndex(to);
  };

  const handleQuickPreset = async (page: StagedPage, preset: EnhancementPreset) => {
    setBusyPageId(page.id);
    try {
      const nextSettings: EnhancementSettings = {
        ...page.settings,
        preset,
        contrast: preset === 'original' ? 0 : preset === 'alto_contraste' ? 35 : 24,
        brightness: preset === 'original' ? 0 : 14,
      };
      const result = await processPageImage(page.originalDataUrl, nextSettings);
      onUpdatePages(
        pages.map((p) =>
          p.id === page.id
            ? {
                ...p,
                settings: nextSettings,
                processedDataUrl: result.processedDataUrl,
                width: result.width,
                height: result.height,
              }
            : p,
        ),
      );
    } finally {
      setBusyPageId(null);
    }
  };

  const handleQuickRotate = async (page: StagedPage) => {
    setBusyPageId(page.id);
    try {
      const nextRotation = ((page.settings.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      const nextSettings: EnhancementSettings = {
        ...page.settings,
        rotation: nextRotation,
      };
      const result = await processPageImage(page.originalDataUrl, nextSettings);
      onUpdatePages(
        pages.map((p) =>
          p.id === page.id
            ? {
                ...p,
                settings: nextSettings,
                processedDataUrl: result.processedDataUrl,
                width: result.width,
                height: result.height,
              }
            : p,
        ),
      );
    } finally {
      setBusyPageId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-28 space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] -ml-2 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver</span>
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Preparar páginas
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {pages.length} {pages.length === 1 ? 'página lista' : 'páginas listas'}
              {isDemoSession ? ' · Ejemplo demostrativo' : ' · Máx. 2000 px por lado'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCamera}
            className="min-h-[44px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
          >
            <Camera className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span>Cámara</span>
          </button>
          <button
            type="button"
            onClick={onUploadFiles}
            className="min-h-[44px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
          >
            <ImagePlus className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span>Subir más</span>
          </button>
        </div>
      </div>

      {activePage ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Active page preview */}
          <div className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                Página {safeIndex + 1} de {pages.length}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPage(activePage)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-100 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>Recortar y perspectiva</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRotate(activePage)}
                  disabled={busyPageId === activePage.id}
                  className="min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotar</span>
                </button>
              </div>
            </div>

            <div className="relative bg-zinc-100 dark:bg-zinc-950 rounded-xl p-3 sm:p-4 flex items-center justify-center min-h-[300px] sm:min-h-[420px]">
              <img
                src={activePage.processedDataUrl}
                alt={`Vista previa de página ${safeIndex + 1}`}
                className={`max-h-[55vh] w-auto rounded-lg shadow-sm border border-zinc-200/70 dark:border-zinc-800 transition-opacity ${
                  busyPageId === activePage.id ? 'opacity-50' : 'opacity-100'
                }`}
              />
            </div>

            {/* Quick tone presets */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {PRESET_LABELS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={busyPageId === activePage.id}
                    onClick={() => handleQuickPreset(activePage, preset.id)}
                    className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      activePage.settings.preset === preset.id
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                {activePage.width} × {activePage.height} px
              </span>
            </div>
          </div>

          {/* Reorderable thumbnail list */}
          <div className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Orden del documento
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Arrastra o usa flechas
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
              {pages.map((page, idx) => {
                const isSelected = idx === safeIndex;
                return (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={() => setDragFromIdx(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFromIdx !== null) {
                        handleMovePage(dragFromIdx, idx);
                      }
                      setDragFromIdx(null);
                    }}
                    onDragEnd={() => setDragFromIdx(null)}
                    className={`group rounded-xl border p-2 transition-colors ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 block"
                    >
                      <img
                        src={page.processedDataUrl}
                        alt={`Miniatura página ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>

                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums pl-1">
                        Pág. {idx + 1}
                      </span>

                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => handleMovePage(idx, idx - 1)}
                          disabled={idx === 0}
                          aria-label={`Mover página ${idx + 1} antes`}
                          className="min-w-[32px] min-h-[36px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-25"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMovePage(idx, idx + 1)}
                          disabled={idx === pages.length - 1}
                          aria-label={`Mover página ${idx + 1} después`}
                          className="min-w-[32px] min-h-[36px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-25"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePage(idx)}
                          aria-label={`Eliminar página ${idx + 1}`}
                          className="min-w-[32px] min-h-[36px] flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            No quedan páginas en este escaneo.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onOpenCamera}
              className="min-h-[44px] px-4 rounded-xl bg-orange-600 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Tomar foto</span>
            </button>
            <button
              type="button"
              onClick={onUploadFiles}
              className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold"
            >
              Subir imágenes
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Confirm Bar */}
      {pages.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 px-4 py-2.5 pb-safe">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="hidden sm:block text-xs text-zinc-500 dark:text-zinc-400">
              Todas las páginas se analizan juntas para detectar título, texto y listas.
            </div>
            <button
              type="button"
              onClick={onConfirmProcess}
              className="w-full sm:w-auto sm:ml-auto min-h-[48px] px-6 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-transform whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {pages.length === 1 ? 'Leer página' : `Leer ${pages.length} páginas`}
              </span>
            </button>
          </div>
        </div>
      )}

      <PerspectiveEditorModal
        page={editingPage}
        onClose={() => setEditingPage(null)}
        onApply={(pageId, nextSettings, processedDataUrl, width, height) => {
          onUpdatePages(
            pages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    settings: nextSettings,
                    processedDataUrl,
                    width,
                    height,
                  }
                : p,
            ),
          );
        }}
      />
    </div>
  );
}
