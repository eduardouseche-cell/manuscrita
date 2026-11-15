# Manuscrita

Aplicación web progresiva (PWA) *mobile-first* que convierte páginas escritas a mano en documentos PDF digitales con texto seleccionable, títulos inteligentes y listas interactivas.

## Cómo funciona

- Las imágenes se recortan y mejoran en el navegador con Canvas (`<= 1600 px`, JPEG calidad `0.8`).
- Cada usuario ingresa su propia clave gratuita de Google Gemini en **Ajustes** (`localStorage`).
- Las llamadas se envían directamente desde el navegador a `generativelanguage.googleapis.com` mediante el encabezado `x-goog-api-key`.
- El historial se almacena localmente en IndexedDB y los PDFs se generan en el dispositivo.

## Desarrollo local

```bash
npm install
npm run dev
```

## Compilar para producción (Vercel / Netlify / Cloudflare Pages)

```bash
npm run build
```

La aplicación estática compilada se genera en `dist/` y no requiere variables de entorno en el servidor.
