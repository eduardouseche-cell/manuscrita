import type { GeminiOcrRawResponse, OcrListGroup, ScanPageRecord, TitleOrigin } from '../types';
import { compressImageForGemini } from './imageProcessor';

const API_KEY_STORAGE_KEY = 'manuscrita_gemini_api_key';
const LEGACY_API_KEY_STORAGE_KEY = 'inkbridge_gemini_api_key';

// Modelo multimodal estable disponible en nivel gratuito
const GEMINI_MODEL = 'gemini-4-hydrogen';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 60_000;

export class OcrServiceError extends Error {
  code: string;
  technicalDetail?: string;

  constructor(message: string, code = 'OCR_ERROR', technicalDetail?: string) {
    super(message);
    this.name = 'OcrServiceError';
    this.code = code;
    this.technicalDetail = technicalDetail;
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

export function getStoredApiKey(): string {
  try {
    return (
      localStorage.getItem(API_KEY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY) ||
      ''
    ).trim();
  } catch {
    return '';
  }
}

export function hasStoredApiKey(): boolean {
  return getStoredApiKey().length > 0;
}

export function saveStoredApiKey(apiKey: string): void {
  const cleaned = apiKey.trim();
  if (!cleaned) {
    clearStoredApiKey();
    return;
  }
  localStorage.setItem(API_KEY_STORAGE_KEY, cleaned);
}

export function clearStoredApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}

const OCR_SYSTEM_INSTRUCTION = `Eres un motor experto de OCR para notas manuscritas en español e inglés.
Analiza todas las imágenes proporcionadas en orden (Página 1, Página 2, etc.) en una sola respuesta JSON estructurada.

Reglas estrictas:
1. TÍTULO INTELIGENTE:
   - Busca en la parte superior de la primera página un texto manuscrito encerrado entre dobles numerales con el formato ##Título## (por ejemplo: ##Reunión Marketing## o ## Apuntes de Física ##).
   - Si existe, extrae ese texto limpio (sin los símbolos ##) como "titulo" y establece "origen_titulo" en "manuscrito".
   - EXCLUYE esa línea ##Título## del campo "texto" de la página 1 para no duplicarla.
   - Si NO existe un texto con formato ##...##, genera un título corto y descriptivo (máximo 6 palabras) basado en el contenido y establece "origen_titulo" en "automatico".

2. LISTAS INTELIGENTES:
   - Detecta listas en cualquier página (ítems con casillas □, ☐, ☑, [ ], [x], viñetas •, guiones -, o listas numeradas de tareas/pendientes).
   - Extrae cada ítem como texto limpio (sin el símbolo de casilla, viñeta o guión).
   - Si una casilla aparece marcada en el papel (✓, ✔, X, x, o casilla rellena/tachada), devuelve "completado": true. De lo contrario, "completado": false.
   - EXCLUYE los ítems de las listas del campo "texto" de la transcripción normal de esa página para no duplicarlos. Conserva todo el resto del texto (párrafos, encabezados, notas sueltas).
   - Si no hay listas en ninguna página, devuelve "listas": [].

3. TRANSCRIPCIÓN MANUSCRITA:
   - Optimizado para letras y números escritos a mano en español e inglés. Conserva tildes, eñes (ñ), signos de interrogación/exclamación y saltos de línea/párrafos naturales.
   - Ignora garabatos decorativos o dibujos; si hay un diagrama o esquema relevante con etiquetas o estructura visual, márcalo brevemente como [diagrama] en el lugar correspondiente.
   - Si una página está completamente ilegible, borrosa o en blanco sin texto reconocible, devuelve "texto": "" para esa página.

4. FORMATO DE SALIDA:
   - Devuelve SIEMPRE exactamente el JSON con "titulo", "origen_titulo", "paginas" y "listas".
   - Asegúrate de incluir un objeto en "paginas" por cada imagen recibida, numerado desde 1.`;

const OCR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titulo: {
      type: 'STRING',
      description: 'Título extraído de ##Título## o generado automáticamente (máximo 6 palabras).',
    },
    origen_titulo: {
      type: 'STRING',
      enum: ['manuscrito', 'automatico'],
      description: 'Indica si el título proviene de ##Título## manuscrito o fue generado automáticamente.',
    },
    paginas: {
      type: 'ARRAY',
      description: 'Lista de páginas transcritas en orden.',
      items: {
        type: 'OBJECT',
        properties: {
          numero: {
            type: 'INTEGER',
            description: 'Número de página comenzando en 1.',
          },
          texto: {
            type: 'STRING',
            description:
              'Texto transcrito conservando párrafos y saltos de línea, sin incluir ##Título## ni ítems de listas.',
          },
        },
        required: ['numero', 'texto'],
      },
    },
    listas: {
      type: 'ARRAY',
      description: 'Listas detectadas en las páginas.',
      items: {
        type: 'OBJECT',
        properties: {
          pagina: {
            type: 'INTEGER',
            description: 'Número de página donde aparece esta lista.',
          },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                texto: {
                  type: 'STRING',
                  description: 'Texto limpio del ítem de la lista.',
                },
                completado: {
                  type: 'BOOLEAN',
                  description: 'true si la casilla está marcada en papel, false si no.',
                },
              },
              required: ['texto', 'completado'],
            },
          },
        },
        required: ['pagina', 'items'],
      },
    },
  },
  required: ['titulo', 'origen_titulo', 'paginas', 'listas'],
};

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const commaIdx = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || commaIdx === -1) {
    throw new OcrServiceError(
      'Una de las imágenes no tiene un formato válido.',
      'INVALID_IMAGE',
    );
  }
  const header = dataUrl.slice(5, commaIdx);
  const semiIdx = header.indexOf(';');
  const mimeType = semiIdx !== -1 ? header.slice(0, semiIdx) || 'image/jpeg' : 'image/jpeg';
  const base64 = dataUrl.slice(commaIdx + 1);
  if (!base64) {
    throw new OcrServiceError('Una de las imágenes está vacía o dañada.', 'EMPTY_IMAGE');
  }
  return { mimeType, base64 };
}

function parseHttpErrorPayload(
  status: number,
  rawBodyText: string,
): { code: string; message: string; technicalDetail?: string } {
  let apiMessage = '';
  let apiStatus = '';
  let apiReasons: string[] = [];

  try {
    const parsed = JSON.parse(rawBodyText) as {
      error?: {
        message?: string;
        status?: string;
        code?: number;
        details?: Array<{ reason?: string }>;
      };
    };
    apiMessage = parsed?.error?.message || '';
    apiStatus = parsed?.error?.status || '';
    if (Array.isArray(parsed?.error?.details)) {
      apiReasons = parsed.error.details
        .map((d) => (typeof d?.reason === 'string' ? d.reason : ''))
        .filter(Boolean);
    }
  } catch {
    apiMessage = rawBodyText.slice(0, 220);
  }

  const combinedDetail = [
    `HTTP ${status}`,
    apiStatus ? `(${apiStatus})` : '',
    apiReasons.length > 0 ? `[${apiReasons.join(', ')}]` : '',
    apiMessage ? `: ${apiMessage}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return {
      code: 'RATE_LIMIT',
      message: 'Alcanzaste el límite gratuito de tu clave. Espera un momento e inténtalo de nuevo.',
    };
  }

  const lowerMessage = apiMessage.toLowerCase();
  const isExplicitKeyReason = apiReasons.some(
    (r) =>
      r.includes('API_KEY') ||
      r === 'ACCESS_TOKEN_EXPIRED' ||
      r === 'CREDENTIALS_MISSING',
  );
  const isExplicitKeyMessage =
    isExplicitKeyReason ||
    lowerMessage.includes('api_key_invalid') ||
    lowerMessage.includes('api key not valid') ||
    lowerMessage.includes('api key expired') ||
    lowerMessage.includes('invalid api key') ||
    lowerMessage.includes('api key');

  if (
    status === 401 ||
    status === 403 ||
    apiStatus === 'PERMISSION_DENIED' ||
    apiStatus === 'UNAUTHENTICATED' ||
    (status === 400 && isExplicitKeyMessage)
  ) {
    return {
      code: 'INVALID_API_KEY',
      message:
        'Clave inválida o sin permisos. Verifica que copiaste bien tu clave de Gemini en Ajustes.',
      technicalDetail: combinedDetail,
    };
  }

  if (status === 400) {
    return {
      code: 'OTHER_ERROR',
      message: 'Gemini no pudo procesar esta solicitud (error 400). Inténtalo de nuevo.',
      technicalDetail: combinedDetail,
    };
  }

  return {
    code: 'OTHER_ERROR',
    message: 'Ocurrió un error al comunicarse con Gemini. Inténtalo de nuevo.',
    technicalDetail: combinedDetail,
  };
}

function mapNetworkOrTimeoutError(err: unknown): OcrServiceError {
  if (err instanceof OcrServiceError) return err;

  if ((err as { name?: string })?.name === 'AbortError') {
    return new OcrServiceError(
      'La lectura tardó demasiado. Inténtalo de nuevo',
      'TIMEOUT',
    );
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return new OcrServiceError(
      'Sin conexión a internet. Verifica tu red e inténtalo de nuevo.',
      'OFFLINE',
    );
  }

  const rawMsg = err instanceof Error ? err.message : String(err || 'Error de red desconocido');
  if (
    rawMsg.includes('Failed to fetch') ||
    rawMsg.includes('NetworkError') ||
    rawMsg.includes('Load failed') ||
    rawMsg.includes('network')
  ) {
    return new OcrServiceError(
      'No pudimos conectar con Gemini. Verifica tu conexión a internet e inténtalo de nuevo.',
      'OFFLINE',
    );
  }

  return new OcrServiceError(
    'Ocurrió un error inesperado al procesar la solicitud.',
    'OTHER_ERROR',
    rawMsg,
  );
}

async function fetchGeminiGenerateContent(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      const parsedErr = parseHttpErrorPayload(response.status, responseText);
      throw new OcrServiceError(parsedErr.message, parsedErr.code, parsedErr.technicalDetail);
    }

    try {
      return JSON.parse(responseText) as Record<string, unknown>;
    } catch (parseErr) {
      throw new OcrServiceError(
        'La respuesta de Gemini no llegó en un formato JSON válido.',
        'OTHER_ERROR',
        parseErr instanceof Error ? parseErr.message : 'JSON parse error',
      );
    }
  } catch (err) {
    throw mapNetworkOrTimeoutError(err);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Realiza una llamada mínima directa a Gemini para verificar que la clave ingresada funciona.
 */
export async function testGeminiApiKey(
  rawKey: string,
): Promise<{ ok: true } | { ok: false; message: string; code: string; technicalDetail?: string }> {
  const apiKey = rawKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: 'EMPTY_KEY',
      message: 'Ingresa una clave de API antes de probarla.',
    };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      code: 'OFFLINE',
      message: 'Sin conexión a internet. Conéctate para probar tu clave.',
    };
  }

  try {
    await fetchGeminiGenerateContent(apiKey, {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Responde únicamente con OK.' }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 16,
      },
    });
    return { ok: true };
  } catch (err) {
    const mapped = mapNetworkOrTimeoutError(err);
    return {
      ok: false,
      code: mapped.code,
      message: mapped.message,
      technicalDetail: mapped.technicalDetail,
    };
  }
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

function extractTextFromGeminiRestResponse(json: Record<string, unknown>): string {
  const promptFeedback = json.promptFeedback as { blockReason?: string } | undefined;
  if (promptFeedback?.blockReason) {
    throw new OcrServiceError(
      'Gemini bloqueó el análisis de esta imagen por políticas de contenido.',
      'OTHER_ERROR',
      `blockReason: ${promptFeedback.blockReason}`,
    );
  }

  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const firstCandidate = candidates[0] as
    | {
        finishReason?: string;
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }
    | undefined;

  if (!firstCandidate) {
    throw new OcrServiceError(
      'No obtuvimos respuesta del modelo para estas imágenes.',
      'OTHER_ERROR',
      'candidates array vacío',
    );
  }

  const parts = Array.isArray(firstCandidate.content?.parts)
    ? firstCandidate.content.parts
    : [];

  const textParts = parts
    .filter((p) => typeof p?.text === 'string' && !p?.thought)
    .map((p) => p.text as string);

  return textParts.join('\n').trim();
}

/**
 * Envía todas las páginas en una sola petición directa desde el navegador a Gemini
 * usando la clave personal del usuario en el encabezado x-goog-api-key.
 * Comprime cada imagen a máx. 1600 px por lado y JPEG calidad 0.8 antes de enviar.
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

  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new OcrServiceError(
      'Configura tu clave de Gemini en Ajustes antes de escanear.',
      'MISSING_API_KEY',
    );
  }

  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = [];

  for (let index = 0; index < imageDataUrls.length; index++) {
    const compressedUrl = await compressImageForGemini(imageDataUrls[index], 1600, 0.8);
    const { mimeType, base64 } = parseDataUrl(compressedUrl);
    parts.push({ text: `Página ${index + 1}:` });
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64,
      },
    });
  }

  parts.push({
    text: `Lee las ${imageDataUrls.length} ${imageDataUrls.length === 1 ? 'página manuscrita' : 'páginas manuscritas'} y devuelve el JSON estructurado siguiendo todas las reglas.`,
  });

  const apiJson = await fetchGeminiGenerateContent(apiKey, {
    system_instruction: {
      parts: [{ text: OCR_SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: OCR_RESPONSE_SCHEMA,
    },
  });

  const rawText = extractTextFromGeminiRestResponse(apiJson);
  if (!rawText) {
    throw new OcrServiceError(
      'No obtuvimos texto legible de las imágenes. Prueba mejorando el contraste o acercando la hoja.',
      'EMPTY_RESPONSE',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new OcrServiceError(
        'No se pudo interpretar la respuesta estructurada de Gemini. Inténtalo de nuevo.',
        'OTHER_ERROR',
        err instanceof Error ? err.message : 'Invalid structured JSON',
      );
    }
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (innerErr) {
      throw new OcrServiceError(
        'No se pudo interpretar la respuesta estructurada de Gemini. Inténtalo de nuevo.',
        'OTHER_ERROR',
        innerErr instanceof Error ? innerErr.message : 'Invalid JSON block',
      );
    }
  }

  const normalized = normalizeOcrResponse(parsed, imageDataUrls.length);
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
