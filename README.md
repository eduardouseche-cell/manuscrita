# Manuscrita

Aplicación web progresiva (PWA) *mobile-first* que convierte páginas escritas a mano en documentos PDF digitales con texto seleccionable, títulos inteligentes y listas interactivas.

## Desarrollo local

```bash
npm install
GEMINI_API_KEY="tu_clave" npm run dev
```

## Compilar y ejecutar en producción

```bash
npm run build
GEMINI_API_KEY="tu_clave" npm start
```

El servidor Express sirve la aplicación compilada en `dist/` y expone el endpoint `/api/ocr` en el puerto `3000` (o `process.env.PORT`).
