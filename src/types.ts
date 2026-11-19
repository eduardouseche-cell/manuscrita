export type TitleOrigin = 'manuscrito' | 'automatico';

export interface CornerPoint {
  x: number; // Normalized 0..1 relative to original image width
  y: number; // Normalized 0..1 relative to original image height
}

export type EnhancementPreset = 'documento' | 'alto_contraste' | 'original';

export interface EnhancementSettings {
  corners: [CornerPoint, CornerPoint, CornerPoint, CornerPoint]; // TL, TR, BR, BL
  preset: EnhancementPreset;
  contrast: number; // -30 to +60 (default 22)
  brightness: number; // -20 to +40 (default 12)
  rotation: 0 | 90 | 180 | 270;
}

export interface StagedPage {
  id: string;
  originalDataUrl: string;
  processedDataUrl: string;
  width: number;
  height: number;
  settings: EnhancementSettings;
}

export interface OcrPageResult {
  numero: number;
  texto: string;
}

export interface ChecklistItem {
  id: string;
  texto: string;
  completado: boolean;
}

export interface OcrListGroup {
  id: string;
  pagina: number;
  items: ChecklistItem[];
}

export interface GeminiOcrRawResponse {
  titulo: string;
  origen_titulo: TitleOrigin;
  paginas: Array<{
    numero: number;
    texto: string;
  }>;
  listas: Array<{
    pagina: number;
    items: Array<{
      texto: string;
      completado: boolean;
    }>;
  }>;
}

export interface ScanPageRecord {
  id: string;
  numero: number;
  imageDataUrl: string;
  texto: string;
}

export interface ScanRecord {
  id: string;
  titulo: string;
  origen_titulo: TitleOrigin;
  createdAt: string; // ISO date string
  updatedAt: string;
  paginas: ScanPageRecord[];
  listas: OcrListGroup[];
  modelo?: string;
  isDemo?: boolean;
}

export interface PdfExportOptions {
  includeImages: boolean;
  includeText: boolean;
  includeLists: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'auto';
export type AppView = 'home' | 'staging' | 'processing' | 'results' | 'history' | 'settings' | 'onboarding';
export type ResultsTab = 'escaneo' | 'transcripcion' | 'listas';
