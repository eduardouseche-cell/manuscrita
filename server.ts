import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processHandwrittenPages, type OcrInputPage } from './server/geminiOcr.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  // Allow up to 40MB JSON payloads for multi-page enhanced notebook images
  app.use(express.json({ limit: '40mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/ocr', async (req: Request, res: Response) => {
    try {
      const body = req.body as { pages?: unknown };
      if (!body || !Array.isArray(body.pages) || body.pages.length === 0) {
        res.status(400).json({
          errorCode: 'INVALID_REQUEST',
          message: 'Envía al menos una página para leer.',
        });
        return;
      }

      if (body.pages.length > 15) {
        res.status(400).json({
          errorCode: 'TOO_MANY_PAGES',
          message: 'Puedes procesar hasta 15 páginas por escaneo.',
        });
        return;
      }

      const pages: OcrInputPage[] = [];
      for (const rawPage of body.pages) {
        if (!rawPage || typeof rawPage !== 'object') {
          res.status(400).json({
            errorCode: 'INVALID_PAGE',
            message: 'Una de las páginas enviadas no tiene un formato válido.',
          });
          return;
        }
        const entry = rawPage as { dataUrl?: unknown; base64?: unknown; mimeType?: unknown };
        let base64 = '';
        let mimeType = typeof entry.mimeType === 'string' ? entry.mimeType : 'image/jpeg';

        if (typeof entry.dataUrl === 'string' && entry.dataUrl.startsWith('data:')) {
          const commaIdx = entry.dataUrl.indexOf(',');
          if (commaIdx !== -1) {
            const header = entry.dataUrl.slice(5, commaIdx);
            const semiIdx = header.indexOf(';');
            if (semiIdx !== -1) {
              mimeType = header.slice(0, semiIdx) || mimeType;
            }
            base64 = entry.dataUrl.slice(commaIdx + 1);
          }
        } else if (typeof entry.base64 === 'string') {
          base64 = entry.base64;
        }

        if (!base64) {
          res.status(400).json({
            errorCode: 'EMPTY_IMAGE',
            message: 'Una de las imágenes está vacía o dañada.',
          });
          return;
        }

        pages.push({ base64, mimeType });
      }

      const result = await processHandwrittenPages(pages);

      const hasAnyText = result.paginas.some((p) => p.texto.trim().length > 0);
      const hasAnyLists = result.listas.some((l) => l.items.length > 0);

      if (!hasAnyText && !hasAnyLists) {
        res.status(422).json({
          errorCode: 'NO_TEXT_DETECTED',
          message:
            'No detectamos texto legible en las imágenes. Prueba mejorando el contraste, acercando la hoja o tomando una foto con mejor luz.',
        });
        return;
      }

      res.json(result);
    } catch (err) {
      const errorObj = err as { status?: number; code?: string; message?: string };
      console.error('Error en /api/ocr:', errorObj);

      if (errorObj.code === 'API_KEY_MISSING' || errorObj.status === 400 || errorObj.status === 403) {
        res.status(502).json({
          errorCode: 'API_AUTH_ERROR',
          message:
            'No se pudo autenticar con el servicio de lectura. Revisa la configuración de GEMINI_API_KEY en el panel de secretos.',
        });
        return;
      }

      if (errorObj.status === 429) {
        res.status(429).json({
          errorCode: 'RATE_LIMIT',
          message: 'Demasiadas solicitudes en este momento. Espera unos segundos y vuelve a intentarlo.',
        });
        return;
      }

      res.status(500).json({
        errorCode: 'OCR_FAILED',
        message: 'Ocurrió un problema al leer tus páginas manuscritas. Por favor, inténtalo de nuevo.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Manuscrita server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
