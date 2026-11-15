import type { GeminiOcrRawResponse, OcrListGroup, ScanPageRecord, TitleOrigin } from '../types';

export class OcrServiceError extends Error {
  code: string;

  constructor(message: string, code = 'OCR_ERROR') {
    super(message);
    this.name = 'OcrServiceError';
    this.code = code;
  }
}

export interface NormalizedOcrResult {
  titulo: string;
  origen_titulo: TitleOrigin;
  paginas: Array<{ numero: number; texto: string }>;
  listas: OcrListGroup[];
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Valida y normaliza la respuesta JSON de Gemini para evitar errores
 * si faltan campos opcionales (ej. sin listas o sin título).
 */
export function normalizeOcrResponse(raw: unknown, expectedPages: number): NormalizedOcrResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<GeminiOcrRawResponse>;

  const rawTitle = typeof data.titulo === 'string' ? data.titulo.trim() : '';
  const cleanedTitle = rawTitle.replace(/^#+|#+$/g, '').trim();
  const origen_titulo: TitleOrigin =
    data.origen_titulo === 'manuscrito' && cleanedTitle.length > 0 ? 'manuscrito' : 'automatico';

  const todayFallback = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });
  const titulo = cleanedTitle || `Notas del ${todayFallback}`;

  const rawPaginas = Array.isArray(data.paginas) ? data.paginas : [];
  const textByPage = new Map<number, string>();

  rawPaginas.forEach((p, idx) => {
    if (!p || typeof p !== 'object') return;
    const numero =
      typeof p.numero === 'number' && Number.isFinite(p.numero) ? Math.round(p.numero) : idx + 1;
    const texto = typeof p.texto === 'string' ? p.texto.trim() : '';
    if (numero >= 1 && numero <= expectedPages) {
      const prev = textByPage.get(numero);
      textByPage.set(numero, prev ? `${prev}\n\n${texto}` : texto);
    }
  });

  const paginas: Array<{ numero: number; texto: string }> = [];
  for (let i = 1; i <= expectedPages; i++) {
    paginas.push({
      numero: i,
      texto: textByPage.get(i) ?? '',
    });
  }

  const rawListas = Array.isArray(data.listas) ? data.listas : [];
  const listas: OcrListGroup[] = [];

  for (const rawList of rawListas) {
    if (!rawList || typeof rawList !== 'object') continue;
    const pagina =
      typeof rawList.pagina === 'number' && Number.isFinite(rawList.pagina)
        ? Math.min(Math.max(1, Math.round(rawList.pagina)), expectedPages)
        : 1;
    const rawItems = Array.isArray(rawList.items) ? rawList.items : [];
    const items = rawItems
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const texto = typeof item.texto === 'string' ? item.texto.trim() : '';
        if (!texto) return null;
        return {
          id: createId('item'),
          texto,
          completado: Boolean(item.completado),
        };
      })
      .filter((item): item is { id: string; texto: string; completado: boolean } => item !== null);

    if (items.length > 0) {
      listas.push({
        id: createId('lista'),
        pagina,
        items,
      });
    }
  }

  return {
    titulo,
    origen_titulo,
    paginas,
    listas,
  };
}

/**
 * Envía todas las páginas en una sola petición al servidor (/api/ocr),
 * que invoca a Gemini de forma centralizada.
 */
export async function analyzeHandwrittenPages(imageDataUrls: string[]): Promise<NormalizedOcrResult> {
  if (imageDataUrls.length === 0) {
    throw new OcrServiceError('Añade al menos una imagen para procesar.', 'NO_IMAGES');
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new OcrServiceError(
      'Sin conexión a internet. Para escanear páginas nuevas necesitas conexión, aunque puedes ver tu historial y exportar PDFs sin conexión.',
      'OFFLINE',
    );
  }

  let response: Response;
  try {
    response = await fetch('/api/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pages: imageDataUrls.map((dataUrl) => ({ dataUrl })),
      }),
    });
  } catch {
    throw new OcrServiceError(
      'No pudimos conectar con el servidor. Verifica tu conexión a internet e inténtalo de nuevo.',
      'NETWORK_ERROR',
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errObj = (payload && typeof payload === 'object' ? payload : {}) as {
      errorCode?: string;
      message?: string;
    };
    throw new OcrServiceError(
      errObj.message || 'No pudimos procesar tus páginas en este momento. Inténtalo nuevamente.',
      errObj.errorCode || `HTTP_${response.status}`,
    );
  }

  const normalized = normalizeOcrResponse(payload, imageDataUrls.length);
  const hasContent =
    normalized.paginas.some((p) => p.texto.trim().length > 0) || normalized.listas.length > 0;

  if (!hasContent) {
    throw new OcrServiceError(
      'La imagen parece borrosa o sin texto manuscrito legible. Prueba recortando los bordes o mejorando el contraste.',
      'NO_TEXT_DETECTED',
    );
  }

  return normalized;
}

/**
 * Combina las imágenes procesadas con el resultado OCR normalizado
 * para construir las páginas del registro final.
 */
export function buildScanPages(
  imageDataUrls: string[],
  ocrPages: Array<{ numero: number; texto: string }>,
): ScanPageRecord[] {
  return imageDataUrls.map((imageDataUrl, index) => {
    const pageNumber = index + 1;
    const match = ocrPages.find((p) => p.numero === pageNumber);
    return {
      id: createId('page'),
      numero: pageNumber,
      imageDataUrl,
      texto: match?.texto ?? '',
    };
  });
}
