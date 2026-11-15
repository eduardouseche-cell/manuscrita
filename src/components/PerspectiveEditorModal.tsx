import { useEffect, useRef, useState } from 'react';
import { Check, Eye, RotateCw, Scan, SlidersHorizontal, X } from 'lucide-react';
import type { CornerPoint, EnhancementPreset, EnhancementSettings, StagedPage } from '../types';
import { detectDocumentCorners, processPageImage } from '../services/imageProcessor';

interface PerspectiveEditorModalProps {
  page: StagedPage | null;
  onClose: () => void;
  onApply: (pageId: string, newSettings: EnhancementSettings, processedDataUrl: string, width: number, height: number) => void;
}

const PRESETS: Array<{ id: EnhancementPreset; label: string }> = [
  { id: 'documento', label: 'Papel blanco' },
  { id: 'alto_contraste', label: 'Alto contraste' },
  { id: 'original', label: 'Original' },
];

export function PerspectiveEditorModal({ page, onClose, onApply }: PerspectiveEditorModalProps) {
  const [settings, setSettings] = useState<EnhancementSettings | null>(null);
  const [mode, setMode] = useState<'corners' | 'preview'>('corners');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const imageBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!page) return;
    setSettings({
      ...page.settings,
      corners: page.settings.corners.map((c) => ({ ...c })) as [
        CornerPoint,
        CornerPoint,
        CornerPoint,
        CornerPoint,
      ],
    });
    setPreviewUrl(page.processedDataUrl);
    setMode('corners');
  }, [page]);

  useEffect(() => {
    if (!page || !settings || mode !== 'preview') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await processPageImage(page.originalDataUrl, settings, 1200);
        if (!cancelled) {
          setPreviewUrl(res.processedDataUrl);
        }
      } catch {
        // Keep previous preview on transient error
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, settings, mode]);

  if (!page || !settings) return null;

  const updateCornerFromPointer = (clientX: number, clientY: number, cornerIdx: number) => {
    const box = imageBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const nx = Math.min(0.99, Math.max(0.01, (clientX - rect.left) / rect.width));
    const ny = Math.min(0.99, Math.max(0.01, (clientY - rect.top) / rect.height));

    setSettings((prev) => {
      if (!prev) return prev;
      const nextCorners = prev.corners.map((c, idx) => (idx === cornerIdx ? { x: nx, y: ny } : c)) as [
        CornerPoint,
        CornerPoint,
        CornerPoint,
        CornerPoint,
      ];
      return { ...prev, corners: nextCorners };
    });
  };

  const handleAutoDetect = async () => {
    const detected = await detectDocumentCorners(page.originalDataUrl);
    setSettings((prev) => (prev ? { ...prev, corners: detected } : prev));
    setMode('corners');
  };

  const handleRotate = () => {
    setSettings((prev) => {
      if (!prev) return prev;
      const nextRot = ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      return { ...prev, rotation: nextRot };
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsApplying(true);
    try {
      const processed = await processPageImage(page.originalDataUrl, settings);
      onApply(page.id, settings, processed.processedDataUrl, processed.width, processed.height);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const polygonPoints = settings.corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ');

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col md:items-center md:justify-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar recorte y mejora de página"
    >
      <div className="bg-white dark:bg-zinc-900 w-full h-full md:h-auto md:max-h-[92vh] md:max-w-3xl md:rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -ml-2 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl"
          >
            <X className="w-5 h-5" />
            <span>Cerrar</span>
          </button>

          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('corners')}
              className={`min-h-[36px] px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                mode === 'corners'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Esquinas
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`min-h-[36px] px-3 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                mode === 'preview'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Vista previa</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isApplying}
            className="min-h-[44px] px-4 -mr-1 inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-xl disabled:opacity-60 whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            <span>{isApplying ? 'Aplicando...' : 'Aplicar'}</span>
          </button>
        </div>

        {/* Interactive canvas area */}
        <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 p-4 flex items-center justify-center overflow-hidden min-h-[260px]">
          {mode === 'corners' ? (
            <div
              ref={imageBoxRef}
              className="relative inline-block max-w-full max-h-full select-none touch-none"
              onPointerMove={(e) => {
                if (activeCorner !== null) {
                  updateCornerFromPointer(e.clientX, e.clientY, activeCorner);
                }
              }}
              onPointerUp={() => setActiveCorner(null)}
              onPointerCancel={() => setActiveCorner(null)}
            >
              <img
                src={page.originalDataUrl}
                alt="Página original para recortar"
                className="max-h-[48vh] md:max-h-[54vh] w-auto rounded-lg block pointer-events-none select-none"
                draggable={false}
              />

              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <polygon
                  points={polygonPoints}
                  fill="rgba(234, 67, 31, 0.12)"
                  stroke="#EA431F"
                  strokeWidth="0.7"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {settings.corners.map((corner, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Esquina ${idx + 1}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    setActiveCorner(idx);
                  }}
                  style={{
                    left: `${corner.x * 100}%`,
                    top: `${corner.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
                >
                  <span
                    className={`w-5 h-5 rounded-full border-2 border-white shadow-md transition-transform ${
                      activeCorner === idx ? 'scale-125 bg-orange-500' : 'bg-orange-600'
                    }`}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="relative flex items-center justify-center max-h-full">
              <img
                src={previewUrl || page.processedDataUrl}
                alt="Vista previa mejorada"
                className="max-h-[48vh] md:max-h-[54vh] w-auto rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800"
              />
            </div>
          )}
        </div>

        {/* Enhancement controls */}
        <div className="p-4 pb-safe bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 space-y-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            preset: preset.id,
                            contrast: preset.id === 'original' ? 0 : preset.id === 'alto_contraste' ? 35 : 24,
                            brightness: preset.id === 'original' ? 0 : 14,
                          }
                        : prev,
                    );
                    setMode('preview');
                  }}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    settings.preset === preset.id
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoDetect}
                className="min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Auto-recorte</span>
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{settings.rotation}°</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <span className="inline-flex items-center gap-1.5 w-24 shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Contraste
              </span>
              <input
                type="range"
                min={-20}
                max={60}
                value={settings.contrast}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSettings((prev) => (prev ? { ...prev, contrast: val } : prev));
                  setMode('preview');
                }}
                className="flex-1 accent-orange-600 h-2"
              />
              <span className="w-9 text-right font-mono tabular-nums">{settings.contrast}</span>
            </label>

            <label className="flex items-center gap-3 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <span className="w-24 shrink-0">Blanco papel</span>
              <input
                type="range"
                min={-15}
                max={40}
                value={settings.brightness}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSettings((prev) => (prev ? { ...prev, brightness: val } : prev));
                  setMode('preview');
                }}
                className="flex-1 accent-orange-600 h-2"
              />
              <span className="w-9 text-right font-mono tabular-nums">{settings.brightness}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
