# Manuscrita

Aplicación web progresiva (PWA) *mobile-first* 100 % estática (solo cliente) que convierte páginas escritas a mano en documentos PDF digitales con texto seleccionable, títulos inteligentes y listas interactivas.

## Arquitectura

- Las imágenes se recortan y comprimen en el navegador (`<= 1600 px`, JPEG calidad `0.8`).
- Cada usuario ingresa su propia clave gratuita de Gemini en **Ajustes** (`localStorage`).
- Las llamadas se envían directamente desde el navegador a `https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent` usando el encabezado `x-goog-api-key`, con respaldo automático entre modelos (`gemini-3.8-flash` y `gemini-3.5-flash-lite`).
- El historial se guarda localmente en IndexedDB y los PDFs se generan en el dispositivo.

## Desarrollo local

```bash
npm install
npm run dev
```

## Compilar para producción (Vercel)

```bash
npm run build
```

Genera la carpeta estática `dist/` lista para Vercel o cualquier hosting estático, sin servidor ni variables de entorno.
