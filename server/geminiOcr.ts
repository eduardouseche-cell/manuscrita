import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';

export interface OcrInputPage {
  base64: string;
  mimeType: string;
}

export interface OcrChecklistItem {
  texto: string;
  completado: boolean;
}

export interface OcrListResult {
  pagina: number;
  items: OcrChecklistItem[];
}

export interface OcrPageResult {
  numero: number;
  texto: string;
}

export interface OcrStructuredResponse {
  titulo: string;
  origen_titulo: 'manuscrito' | 'automatico';
  paginas: OcrPageResult[];
  listas: OcrListResult[];
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
  type: Type.OBJECT,
  properties: {
    titulo: {
      type: Type.STRING,
      description: 'Título extraído de ##Título## o generado automáticamente (máximo 6 palabras).',
    },
    origen_titulo: {
      type: Type.STRING,
      enum: ['manuscrito', 'automatico'],
      description: 'Indica si el título proviene de ##Título## manuscrito o fue generado automáticamente.',
    },
    paginas: {
      type: Type.ARRAY,
      description: 'Lista de páginas transcritas en orden.',
      items: {
        type: Type.OBJECT,
        properties: {
          numero: {
            type: Type.INTEGER,
            description: 'Número de página comenzando en 1.',
          },
          texto: {
            type: Type.STRING,
            description:
              'Texto transcrito conservando párrafos y saltos de línea, sin incluir ##Título## ni ítems de listas.',
          },
        },
        required: ['numero', 'texto'],
      },
    },
    listas: {
      type: Type.ARRAY,
      description: 'Listas detectadas en las páginas.',
      items: {
        type: Type.OBJECT,
        properties: {
          pagina: {
            type: Type.INTEGER,
            description: 'Número de página donde aparece esta lista.',
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                texto: {
                  type: Type.STRING,
                  description: 'Texto limpio del ítem de la lista.',
                },
                completado: {
                  type: Type.BOOLEAN,
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

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY no configurada en el servidor.');
    (error as Error & { code?: string }).code = 'API_KEY_MISSING';
    throw error;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const isTransient = status === 500 || status === 503;
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delay = 800 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export function sanitizeOcrPayload(raw: unknown, pageCount: number): OcrStructuredResponse {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const rawTitle = typeof data.titulo === 'string' ? data.titulo.trim() : '';
  const cleanedTitle = rawTitle.replace(/^#+|#+$/g, '').trim();
  const origen: 'manuscrito' | 'automatico' =
    data.origen_titulo === 'manuscrito' && cleanedTitle.length > 0 ? 'manuscrito' : 'automatico';

  const rawPages = Array.isArray(data.paginas) ? data.paginas : [];
  const pageMap = new Map<number, string>();

  for (let i = 0; i < rawPages.length; i++) {
    const entry = rawPages[i] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== 'object') continue;
    const num =
      typeof entry.numero === 'number' && Number.isFinite(entry.numero)
        ? Math.round(entry.numero)
        : i + 1;
    const text = typeof entry.texto === 'string' ? entry.texto.trim() : '';
    if (num >= 1 && num <= pageCount) {
      const existing = pageMap.get(num);
      pageMap.set(num, existing ? `${existing}\n\n${text}` : text);
    }
  }

  const paginas: OcrPageResult[] = [];
  for (let p = 1; p <= pageCount; p++) {
    paginas.push({
      numero: p,
      texto: pageMap.get(p) ?? '',
    });
  }

  const rawLists = Array.isArray(data.listas) ? data.listas : [];
  const listas: OcrListResult[] = [];

  for (const listEntry of rawLists) {
    if (!listEntry || typeof listEntry !== 'object') continue;
    const entry = listEntry as Record<string, unknown>;
    const pagina =
      typeof entry.pagina === 'number' && Number.isFinite(entry.pagina)
        ? Math.min(Math.max(1, Math.round(entry.pagina)), pageCount)
        : 1;
    const rawItems = Array.isArray(entry.items) ? entry.items : [];
    const items: OcrChecklistItem[] = rawItems
      .map((it) => {
        if (!it || typeof it !== 'object') return null;
        const obj = it as Record<string, unknown>;
        const texto = typeof obj.texto === 'string' ? obj.texto.trim() : '';
        if (!texto) return null;
        return {
          texto,
          completado: Boolean(obj.completado),
        };
      })
      .filter((it): it is OcrChecklistItem => it !== null);

    if (items.length > 0) {
      listas.push({ pagina, items });
    }
  }

  const todayLabel = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  const titulo = cleanedTitle || `Notas del ${todayLabel}`;

  return {
    titulo,
    origen_titulo: origen,
    paginas,
    listas,
  };
}

export async function processHandwrittenPages(pages: OcrInputPage[]): Promise<OcrStructuredResponse> {
  const ai = getAiClient();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  pages.forEach((page, index) => {
    parts.push({ text: `Página ${index + 1}:` });
    parts.push({
      inlineData: {
        mimeType: page.mimeType || 'image/jpeg',
        data: page.base64,
      },
    });
  });
  parts.push({
    text: `Lee las ${pages.length} ${pages.length === 1 ? 'página manuscrita' : 'páginas manuscritas'} y devuelve el JSON estructurado siguiendo todas las reglas.`,
  });

  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction: OCR_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: OCR_RESPONSE_SCHEMA,
      },
    }),
  );

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    const err = new Error('La respuesta de Gemini llegó vacía.');
    (err as Error & { code?: string }).code = 'EMPTY_RESPONSE';
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const err = new Error('No se pudo interpretar la respuesta estructurada.');
      (err as Error & { code?: string }).code = 'INVALID_JSON';
      throw err;
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  return sanitizeOcrPayload(parsed, pages.length);
}
