import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, RotateCcw, X } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapturePages: (dataUrls: string[]) => void;
  onFallbackUpload: () => void;
}

export function CameraModal({
  isOpen,
  onClose,
  onCapturePages,
  onFallbackUpload,
}: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [captured, setCaptured] = useState<string[]>([]);
  const [flashActive, setFlashActive] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setCameraError(null);
    setIsReady(false);
    setCaptured([]);

    async function startCamera() {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setCameraError(
          'La cámara requiere una conexión segura (HTTPS). Puedes subir fotos desde tu galería.',
        );
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Tu navegador no permite acceso directo a la cámara desde esta vista. Sube una imagen desde la galería.',
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          const name = (err as { name?: string })?.name;
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            setCameraError(
              'Permiso de cámara denegado. Actívalo en los ajustes del navegador o selecciona fotos desde tu galería.',
            );
          } else {
            setCameraError(
              'No encontramos una cámara disponible. Puedes subir fotos directamente desde tu galería.',
            );
          }
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || !isReady) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 960;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 140);
    setCaptured((prev) => [...prev, dataUrl]);
  };

  const handleFinish = () => {
    if (captured.length > 0) {
      onCapturePages(captured);
    }
    onClose();
  };

  const handleUndoLast = () => {
    setCaptured((prev) => prev.slice(0, -1));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950 text-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Cámara de escaneo"
    >
      {/* Top camera bar */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] -ml-2 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-200 hover:text-white rounded-xl active:scale-95 transition-transform"
        >
          <X className="w-5 h-5" />
          <span>Cancelar</span>
        </button>

        <span className="text-sm font-medium tabular-nums text-zinc-300 whitespace-nowrap">
          {captured.length === 0
            ? 'Enfoca la página'
            : `${captured.length} ${captured.length === 1 ? 'página' : 'páginas'}`}
        </span>

        <button
          type="button"
          onClick={() => {
            onClose();
            onFallbackUpload();
          }}
          className="min-h-[44px] px-3 -mr-2 inline-flex items-center gap-1.5 text-sm font-medium text-orange-400 hover:text-orange-300 rounded-xl whitespace-nowrap"
        >
          <ImagePlus className="w-4 h-4" />
          <span>Galería</span>
        </button>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="max-w-sm mx-auto px-6 text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-orange-400">
              <Camera className="w-7 h-7" />
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{cameraError}</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onFallbackUpload();
              }}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm transition-colors"
            >
              Elegir fotos o usar cámara nativa
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Subtle page framing guide */}
            <div className="pointer-events-none absolute inset-6 sm:inset-12 border border-white/30 rounded-xl">
              <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-orange-500 rounded-tl-xl" />
              <div className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-orange-500 rounded-tr-xl" />
              <div className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-orange-500 rounded-bl-xl" />
              <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-orange-500 rounded-br-xl" />
            </div>
            {flashActive && (
              <div className="pointer-events-none absolute inset-0 bg-white/75 transition-opacity duration-150" />
            )}
          </>
        )}
      </div>

      {/* Thumb-zone shutter controls */}
      {!cameraError && (
        <div className="px-6 py-5 pb-safe bg-zinc-950 border-t border-white/10 flex items-center justify-between gap-4 shrink-0">
          <div className="w-24 flex items-center">
            {captured.length > 0 && (
              <button
                type="button"
                onClick={handleUndoLast}
                className="min-h-[44px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white rounded-xl bg-zinc-900 border border-zinc-800"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Deshacer</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSnap}
            disabled={!isReady}
            aria-label="Capturar página"
            className="w-18 h-18 rounded-full border-4 border-white/90 p-1 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="w-full h-full rounded-full bg-orange-600 block" />
          </button>

          <div className="w-24 flex items-center justify-end">
            {captured.length > 0 && (
              <button
                type="button"
                onClick={handleFinish}
                className="min-h-[44px] px-4 inline-flex items-center gap-1.5 text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-xl shadow-sm active:scale-95 transition-transform"
              >
                <Check className="w-4 h-4" />
                <span>Listo</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
