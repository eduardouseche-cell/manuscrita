import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  AlertCircle,
  Camera,
  ChevronRight,
  Clock,
  FileText,
  ImagePlus,
  Play,
  RefreshCw,
  Settings,
  WifiOff,
} from 'lucide-react';
import type { AppView, ScanRecord, StagedPage, ThemeMode } from './types';
import {
  cloneDefaultSettings,
  detectDocumentCorners,
  prepareSourceDataUrl,
  processPageImage,
  readFileAsDataUrl,
} from './services/imageProcessor';
import {
  analyzeHandwrittenPages,
  buildScanPages,
  OcrServiceError,
} from './services/geminiService';
import {
  clearAllScansFromHistory,
  countPendingChecklistItems,
  deleteScanFromHistory,
  getAllScansFromHistory,
  saveScanToHistory,
} from './services/storageService';
import { createDemoStagedPages, getSimulatedDemoOcrResponse } from './services/demoService';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { CameraModal } from './components/CameraModal';
import { StagingView } from './components/StagingView';
import { ResultsView } from './components/ResultsView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { PWAInstallButton } from './components/PWAInstallButton';

const THEME_STORAGE_KEY = 'inkbridge-theme';

function createScanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `scan_${crypto.randomUUID()}`;
  }
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'auto';
}

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);

  const isOnline = useOnlineStatus();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [stagedPages, setStagedPages] = useState<StagedPage[]>([]);
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [activeScan, setActiveScan] = useState<ScanRecord | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [isPreparingDemo, setIsPreparingDemo] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [isRetryingOcr, setIsRetryingOcr] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  // Sync themeMode ('light' | 'dark' | 'auto') with document.documentElement
  useEffect(() => {
    const applyTheme = () => {
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldBeDark = themeMode === 'dark' || (themeMode === 'auto' && prefersDark);
      document.documentElement.classList.toggle('dark', shouldBeDark);
    };

    applyTheme();
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // Ignore storage error
    }

    if (themeMode !== 'auto' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener?.('change', applyTheme);
    return () => mql.removeEventListener?.('change', applyTheme);
  }, [themeMode]);

  useEffect(() => {
    getAllScansFromHistory()
      .then((records) => setHistory(records))
      .catch(() => {
        // IndexedDB unavailable in restricted context
      });
  }, []);

  const addRawDataUrlsToStage = async (rawUrls: string[]) => {
    if (rawUrls.length === 0) return;
    setIsPreparingImages(true);
    setOcrError(null);

    try {
      const preparedPages: StagedPage[] = [];
      for (const rawUrl of rawUrls) {
        const prepared = await prepareSourceDataUrl(rawUrl);
        const corners = await detectDocumentCorners(prepared.dataUrl);
        const settings = cloneDefaultSettings(corners);
        const enhanced = await processPageImage(prepared.dataUrl, settings);
        preparedPages.push({
          id: createScanId(),
          originalDataUrl: prepared.dataUrl,
          processedDataUrl: enhanced.processedDataUrl,
          width: enhanced.width,
          height: enhanced.height,
          settings,
        });
      }

      setStagedPages((prev) => [...prev, ...preparedPages]);
      setIsDemoSession(false);
      setView('staging');
    } catch {
      setOcrError('No pudimos cargar una de las imágenes seleccionadas. Intenta con otra foto.');
    } finally {
      setIsPreparingImages(false);
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setIsPreparingImages(true);
    try {
      const urls = await Promise.all(files.map((f) => readFileAsDataUrl(f)));
      await addRawDataUrlsToStage(urls);
    } finally {
      setIsPreparingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    }
  };

  const startCameraFlow = () => {
    setOcrError(null);
    if (!isOnline) {
      setOcrError(
        'Sin conexión a internet. Necesitas conexión para escanear nuevas páginas, pero puedes abrir tu historial y exportar PDFs.',
      );
      return;
    }
    setStagedPages([]);
    setIsCameraOpen(true);
  };

  const startUploadFlow = () => {
    setOcrError(null);
    if (!isOnline) {
      setOcrError(
        'Sin conexión a internet. Necesitas conexión para procesar imágenes nuevas, pero puedes consultar tu historial y exportar PDFs.',
      );
      return;
    }
    setStagedPages([]);
    fileInputRef.current?.click();
  };

  const handleStartDemo = async () => {
    setIsPreparingDemo(true);
    setOcrError(null);
    try {
      const demoPages = await createDemoStagedPages();
      setStagedPages(demoPages);
      setIsDemoSession(true);
      setView('staging');
    } finally {
      setIsPreparingDemo(false);
    }
  };

  const persistScanRecord = async (record: ScanRecord) => {
    setHistory((prev) => {
      const without = prev.filter((item) => item.id !== record.id);
      return [record, ...without];
    });
    try {
      await saveScanToHistory(record);
    } catch {
      // Ignore IndexedDB quota errors gracefully
    }
  };

  const handleProcessStagedPages = async () => {
    if (stagedPages.length === 0) return;

    if (!isDemoSession && !isOnline) {
      setOcrError(
        'Sin conexión a internet. Conéctate para enviar tus páginas a Gemini.',
      );
      return;
    }

    setOcrError(null);
    setView('processing');

    try {
      let ocrResult;
      if (isDemoSession) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        ocrResult = getSimulatedDemoOcrResponse();
      } else {
        ocrResult = await analyzeHandwrittenPages(
          stagedPages.map((p) => p.processedDataUrl),
        );
      }

      const now = new Date().toISOString();
      const newScan: ScanRecord = {
        id: createScanId(),
        titulo: ocrResult.titulo,
        origen_titulo: ocrResult.origen_titulo,
        createdAt: now,
        updatedAt: now,
        paginas: buildScanPages(
          stagedPages.map((p) => p.processedDataUrl),
          ocrResult.paginas,
        ),
        listas: ocrResult.listas,
        isDemo: isDemoSession,
      };

      setActiveScan(newScan);
      await persistScanRecord(newScan);
      setView('results');
    } catch (err) {
      const message =
        err instanceof OcrServiceError
          ? err.message
          : 'Ocurrió un error inesperado al leer tus notas. Inténtalo nuevamente.';
      setOcrError(message);
    }
  };

  const handleRetryOcrFromResults = async () => {
    if (!activeScan) return;
    if (!isOnline) {
      setOcrError('Sin conexión a internet. Conéctate para volver a leer esta página.');
      return;
    }

    setIsRetryingOcr(true);
    setOcrError(null);

    try {
      const ocrResult = await analyzeHandwrittenPages(
        activeScan.paginas.map((p) => p.imageDataUrl),
      );
      const updatedScan: ScanRecord = {
        ...activeScan,
        titulo: ocrResult.titulo,
        origen_titulo: ocrResult.origen_titulo,
        updatedAt: new Date().toISOString(),
        paginas: activeScan.paginas.map((p, idx) => ({
          ...p,
          texto: ocrResult.paginas[idx]?.texto ?? '',
        })),
        listas: ocrResult.listas,
        isDemo: false,
      };
      setActiveScan(updatedScan);
      await persistScanRecord(updatedScan);
    } catch (err) {
      const message =
        err instanceof OcrServiceError
          ? err.message
          : 'No pudimos repetir la lectura en este momento.';
      setOcrError(message);
    } finally {
      setIsRetryingOcr(false);
    }
  };

  const handleUpdateActiveScan = (updated: ScanRecord) => {
    setActiveScan(updated);
    setHistory((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveScanToHistory(updated).catch(() => {});
    }, 300);
  };

  const handleDeleteScan = async (scanId: string) => {
    setHistory((prev) => prev.filter((s) => s.id !== scanId));
    if (activeScan?.id === scanId) {
      setActiveScan(null);
    }
    try {
      await deleteScanFromHistory(scanId);
    } catch {
      // Ignore
    }
  };

  const handleClearAllHistory = async () => {
    await clearAllScansFromHistory();
    setHistory([]);
    setActiveScan(null);
  };

  const handleOpenScan = (scan: ScanRecord) => {
    setActiveScan(scan);
    setOcrError(null);
    setView('results');
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Compact 3-zone Top Bar */}
      <header className="sticky top-0 z-30 h-14 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => {
              setOcrError(null);
              setView('home');
            }}
            className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0"
          >
            Manuscrita
          </button>

          <nav className="flex items-center gap-5 sm:gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setOcrError(null);
                setView('home');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors py-1 ${
                view === 'home'
                  ? 'text-zinc-900 dark:text-white underline underline-offset-4 decoration-orange-600 decoration-2'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Inicio
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrError(null);
                setView('history');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors py-1 ${
                view === 'history'
                  ? 'text-zinc-900 dark:text-white underline underline-offset-4 decoration-orange-600 decoration-2'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Historial
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setOcrError(null);
                setView('settings');
              }}
              aria-label="Abrir Ajustes"
              title="Ajustes"
              className={`min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl transition-colors ${
                view === 'settings'
                  ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
              }`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* PWA Update Available Banner */}
      {needRefresh && (
        <div className="bg-zinc-900 dark:bg-zinc-800 text-white px-4 py-2.5 border-b border-zinc-800 dark:border-zinc-700">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-medium">Hay una versión nueva. Actualizar</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                className="min-h-[36px] px-3.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold whitespace-nowrap"
              >
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="min-h-[36px] px-2.5 text-xs text-zinc-300 hover:text-white"
              >
                Después
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Status Banner */}
      {!isOnline && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <span>
              Sin conexión — Puedes consultar tu historial, editar notas y exportar PDFs. Necesitas
              internet para escanear páginas nuevas.
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        {ocrError && view !== 'processing' && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
            <div
              role="alert"
              className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 rounded-2xl p-4 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-sm text-red-800 dark:text-red-200">
                {ocrError}
              </div>
              <button
                type="button"
                onClick={() => setOcrError(null)}
                className="text-xs font-semibold text-red-700 dark:text-red-300 hover:underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* HOME VIEW */}
        {view === 'home' && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
              {/* Left: Primary Scan Action */}
              <section className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-7">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white text-balance">
                      De tu libreta al PDF digital en segundos.
                    </h1>
                  </div>
                  <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-xl">
                    Fotografía una o varias páginas escritas a mano. Manuscrita endereza el papel,
                    nombra el archivo automáticamente, transcribe tu letra y convierte tus casillas en
                    listas interactivas.
                  </p>
                </div>

                {/* Large thumb-friendly primary CTAs */}
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={isPreparingImages}
                    onClick={startCameraFlow}
                    className="w-full min-h-[56px] px-6 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-base inline-flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.99] transition-transform disabled:opacity-60"
                  >
                    <Camera className="w-5 h-5" />
                    <span>{isPreparingImages ? 'Preparando imagen...' : 'Escanear página'}</span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={isPreparingImages}
                      onClick={startUploadFlow}
                      className="min-h-[48px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-semibold text-zinc-800 dark:text-zinc-100 inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <ImagePlus className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span>Subir imágenes</span>
                    </button>

                    <button
                      type="button"
                      disabled={isPreparingDemo}
                      onClick={handleStartDemo}
                      className="min-h-[48px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-semibold text-zinc-800 dark:text-zinc-100 inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <Play className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span>{isPreparingDemo ? 'Cargando ejemplo...' : 'Probar modo demo'}</span>
                    </button>
                  </div>

                  {/* Install PWA button (Android/Chrome prompt or iOS Safari guide; hidden when standalone) */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <PWAInstallButton />
                  </div>
                </div>

                {/* Unboxed notebook tips */}
                <div className="pt-5 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <div className="space-y-1">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      Título con ##...##
                    </p>
                    <p>Escribe ##Título## arriba para nombrar el PDF automáticamente.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      Listas interactivas
                    </p>
                    <p>Casillas □, viñetas y guiones se separan en checklists editables.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      PDF con texto real
                    </p>
                    <p>Conserva tildes, eñes y texto seleccionable en cualquier dispositivo.</p>
                  </div>
                </div>
              </section>

              {/* Right: Recent History */}
              <section className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span>Historial reciente</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setView('history')}
                    className="min-h-[40px] px-2.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline whitespace-nowrap"
                  >
                    Ver todo ({history.length})
                  </button>
                </div>

                {history.length === 0 ? (
                  <div className="p-8 text-center space-y-2.5">
                    <div className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                      <FileText className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                      Sin escaneos guardados aún
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                      Tus páginas se guardan en este navegador para buscarlas y exportarlas cuando quieras.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {history.slice(0, 4).map((scan) => {
                      const thumb = scan.paginas[0]?.imageDataUrl;
                      const dateLabel = new Date(scan.createdAt).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      });
                      const stats = countPendingChecklistItems(scan);

                      return (
                        <button
                          key={scan.id}
                          type="button"
                          onClick={() => handleOpenScan(scan)}
                          className="w-full px-5 py-3.5 flex items-center gap-3.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className="w-11 h-14 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0 flex items-center justify-center">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={`Miniatura de ${scan.titulo}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <FileText className="w-4 h-4 text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {scan.titulo}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              <span>{dateLabel}</span>
                              <span aria-hidden="true"> · </span>
                              <span className="tabular-nums">
                                {scan.paginas.length} {scan.paginas.length === 1 ? 'pág.' : 'págs.'}
                              </span>
                              {stats.total > 0 && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span className="tabular-nums text-orange-600 dark:text-orange-400 font-medium">
                                    {stats.pending} {stats.pending === 1 ? 'pendiente' : 'pendientes'}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {view === 'settings' && (
          <SettingsView
            themeMode={themeMode}
            historyCount={history.length}
            onChangeTheme={setThemeMode}
            onClearHistory={handleClearAllHistory}
            onBackHome={() => setView('home')}
          />
        )}

        {/* STAGING VIEW */}
        {view === 'staging' && (
          <StagingView
            pages={stagedPages}
            isDemoSession={isDemoSession}
            onUpdatePages={setStagedPages}
            onOpenCamera={() => setIsCameraOpen(true)}
            onUploadFiles={() => fileInputRef.current?.click()}
            onConfirmProcess={handleProcessStagedPages}
            onCancel={() => {
              setStagedPages([]);
              setIsDemoSession(false);
              setView('home');
            }}
          />
        )}

        {/* PROCESSING / ERROR VIEW */}
        {view === 'processing' && (
          <div className="max-w-lg mx-auto px-4 py-16 sm:py-24">
            {ocrError ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-7 text-center space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                    No pudimos leer tus páginas
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {ocrError}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleProcessStagedPages}
                    className="flex-1 min-h-[48px] px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Reintentar lectura</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOcrError(null);
                      setView('staging');
                    }}
                    className="flex-1 min-h-[48px] px-5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-800 dark:text-zinc-100"
                  >
                    Editar imágenes
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 text-center space-y-5">
                <div className="w-12 h-12 rounded-full border-3 border-zinc-200 dark:border-zinc-700 border-t-orange-600 animate-spin mx-auto" />
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                    Leyendo tu letra…
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
                    Analizando {stagedPages.length}{' '}
                    {stagedPages.length === 1 ? 'página manuscrita' : 'páginas manuscritas'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RESULTS VIEW */}
        {view === 'results' && activeScan && (
          <ResultsView
            scan={activeScan}
            isRetryingOcr={isRetryingOcr}
            onUpdateScan={handleUpdateActiveScan}
            onRetryOcr={handleRetryOcrFromResults}
            onBackHome={() => setView('home')}
          />
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <HistoryView
            scans={history}
            onOpenScan={handleOpenScan}
            onDeleteScan={handleDeleteScan}
            onBackHome={() => setView('home')}
          />
        )}
      </main>

      {/* Hidden inputs for file upload & native mobile camera fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Fixed Home Credit Line respecting mobile safe area */}
      {view === 'home' && (
        <footer className="fixed bottom-0 left-0 right-0 z-20 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-200/70 dark:border-zinc-800/70 px-4 pt-2 pb-safe text-center">
          <p className="text-[12.5px] leading-tight text-zinc-600 dark:text-zinc-400 select-text">
            Esta app es una idea de @proyectomur
          </p>
        </footer>
      )}

      {/* Live multi-shot Camera Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapturePages={(urls) => addRawDataUrlsToStage(urls)}
        onFallbackUpload={() => fileInputRef.current?.click()}
      />
    </div>
  );
}
