import type { CornerPoint, EnhancementPreset, EnhancementSettings } from '../types';

const MAX_DIMENSION = 1600;

export const DEFAULT_ENHANCEMENT_SETTINGS: EnhancementSettings = {
  corners: [
    { x: 0.03, y: 0.03 },
    { x: 0.97, y: 0.03 },
    { x: 0.97, y: 0.97 },
    { x: 0.03, y: 0.97 },
  ],
  preset: 'documento',
  contrast: 24,
  brightness: 14,
  rotation: 0,
};

export function cloneDefaultSettings(
  corners?: [CornerPoint, CornerPoint, CornerPoint, CornerPoint],
): EnhancementSettings {
  return {
    corners: corners
      ? [
          { ...corners[0] },
          { ...corners[1] },
          { ...corners[2] },
          { ...corners[3] },
        ]
      : DEFAULT_ENHANCEMENT_SETTINGS.corners.map((c) => ({ ...c })) as [
          CornerPoint,
          CornerPoint,
          CornerPoint,
          CornerPoint,
        ],
    preset: DEFAULT_ENHANCEMENT_SETTINGS.preset,
    contrast: DEFAULT_ENHANCEMENT_SETTINGS.contrast,
    brightness: DEFAULT_ENHANCEMENT_SETTINGS.brightness,
    rotation: 0,
  };
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
    img.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo leer el archivo de imagen.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Reduce la imagen original a un máximo razonable en memoria si viene de cámara
 * de 48MP, conservando suficiente resolución para recorte y envío (<= 2400px).
 */
export async function prepareSourceDataUrl(rawDataUrl: string): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  const img = await loadImageElement(rawDataUrl);
  const maxSource = 2400;
  let targetW = img.naturalWidth || img.width;
  let targetH = img.naturalHeight || img.height;

  if (Math.max(targetW, targetH) > maxSource) {
    const scale = maxSource / Math.max(targetW, targetH);
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: rawDataUrl, width: targetW, height: targetH };
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: targetW,
    height: targetH,
  };
}

/**
 * Heurística ligera para detectar bordes de una hoja clara sobre escritorio oscuro.
 * Si no encuentra un contorno nítido, devuelve un recorte sutil de margen completo.
 */
export async function detectDocumentCorners(
  dataUrl: string,
): Promise<[CornerPoint, CornerPoint, CornerPoint, CornerPoint]> {
  const img = await loadImageElement(dataUrl);
  const sampleW = 160;
  const sampleH = Math.max(80, Math.round((img.height / img.width) * sampleW));

  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return cloneDefaultSettings().corners;

  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  const luma = new Float32Array(sampleW * sampleH);
  for (let i = 0; i < sampleW * sampleH; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Average brightness of center region vs outer edges
  let centerSum = 0;
  let centerCount = 0;
  for (let y = Math.floor(sampleH * 0.35); y < Math.floor(sampleH * 0.65); y++) {
    for (let x = Math.floor(sampleW * 0.35); x < Math.floor(sampleW * 0.65); x++) {
      centerSum += luma[y * sampleW + x];
      centerCount++;
    }
  }
  const centerAvg = centerSum / Math.max(1, centerCount);

  let borderSum = 0;
  let borderCount = 0;
  for (let x = 0; x < sampleW; x++) {
    borderSum += luma[x] + luma[(sampleH - 1) * sampleW + x];
    borderCount += 2;
  }
  const borderAvg = borderSum / Math.max(1, borderCount);

  // Only attempt tight edge detection when there is clear page-vs-desk contrast
  if (centerAvg - borderAvg < 28) {
    return [
      { x: 0.02, y: 0.02 },
      { x: 0.98, y: 0.02 },
      { x: 0.98, y: 0.98 },
      { x: 0.02, y: 0.98 },
    ];
  }

  const threshold = borderAvg + (centerAvg - borderAvg) * 0.45;

  let minX = sampleW;
  let maxX = 0;
  let minY = sampleH;
  let maxY = 0;

  for (let y = 2; y < sampleH - 2; y++) {
    for (let x = 2; x < sampleW - 2; x++) {
      if (luma[y * sampleW + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const wFrac = (maxX - minX) / sampleW;
  const hFrac = (maxY - minY) / sampleH;

  if (wFrac < 0.35 || hFrac < 0.35) {
    return [
      { x: 0.02, y: 0.02 },
      { x: 0.98, y: 0.02 },
      { x: 0.98, y: 0.98 },
      { x: 0.02, y: 0.98 },
    ];
  }

  const pad = 0.015;
  const left = Math.max(0.01, minX / sampleW - pad);
  const right = Math.min(0.99, maxX / sampleW + pad);
  const top = Math.max(0.01, minY / sampleH - pad);
  const bottom = Math.min(0.99, maxY / sampleH + pad);

  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/**
 * Resuelve un sistema lineal 8x8 por eliminación gaussiana para calcular la matriz
 * de homografía proyectiva 3x3 (mapea rectángulo destino -> cuadrilátero origen).
 */
function solveHomography(
  dstPts: Array<{ x: number; y: number }>,
  srcPts: Array<{ x: number; y: number }>,
): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = dstPts[i].x;
    const sy = dstPts[i].y;
    const dx = srcPts[i].x;
    const dy = srcPts[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivotRow][col])) {
        pivotRow = row;
      }
    }
    [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
    [b[col], b[pivotRow]] = [b[pivotRow], b[col]];

    const pivot = A[col][col] || 1e-10;
    for (let j = col; j < n; j++) A[col][j] /= pivot;
    b[col] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j < n; j++) {
        A[row][j] -= factor * A[col][j];
      }
      b[row] -= factor * b[col];
    }
  }

  return [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], 1];
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Aplica recorte de bordes, corrección de perspectiva (homografía),
 * rotación, blanqueo de fondo y aumento de contraste, limitando el lado mayor a 1600 px.
 */
export async function processPageImage(
  originalDataUrl: string,
  settings: EnhancementSettings,
  maxOutputDimension = MAX_DIMENSION,
): Promise<{ processedDataUrl: string; width: number; height: number }> {
  const img = await loadImageElement(originalDataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) {
    throw new Error('Tu navegador no permite procesar imágenes en Canvas.');
  }
  srcCtx.drawImage(img, 0, 0, srcW, srcH);
  const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcPixels = srcImgData.data;

  // Source corners in pixel coordinates
  const srcCorners = settings.corners.map((c) => ({
    x: Math.min(Math.max(c.x, 0), 1) * srcW,
    y: Math.min(Math.max(c.y, 0), 1) * srcH,
  }));

  const topWidth = dist(srcCorners[0], srcCorners[1]);
  const bottomWidth = dist(srcCorners[3], srcCorners[2]);
  const leftHeight = dist(srcCorners[0], srcCorners[3]);
  const rightHeight = dist(srcCorners[1], srcCorners[2]);

  let outW = Math.max(200, Math.round(Math.max(topWidth, bottomWidth)));
  let outH = Math.max(200, Math.round(Math.max(leftHeight, rightHeight)));

  // Clamp max side <= 1600px
  if (Math.max(outW, outH) > maxOutputDimension) {
    const scale = maxOutputDimension / Math.max(outW, outH);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }

  const dstCorners = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];

  // Check if corners are essentially axis-aligned full frame (fast path)
  const isAxisAligned =
    Math.abs(srcCorners[0].y - srcCorners[1].y) < 3 &&
    Math.abs(srcCorners[3].y - srcCorners[2].y) < 3 &&
    Math.abs(srcCorners[0].x - srcCorners[3].x) < 3 &&
    Math.abs(srcCorners[1].x - srcCorners[2].x) < 3;

  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = outW;
  warpedCanvas.height = outH;
  const warpedCtx = warpedCanvas.getContext('2d')!;

  if (isAxisAligned) {
    const sx = Math.min(srcCorners[0].x, srcCorners[3].x);
    const sy = Math.min(srcCorners[0].y, srcCorners[1].y);
    const sw = Math.max(10, Math.max(srcCorners[1].x, srcCorners[2].x) - sx);
    const sh = Math.max(10, Math.max(srcCorners[2].y, srcCorners[3].y) - sy);
    warpedCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
  } else {
    const H = solveHomography(dstCorners, srcCorners);
    const dstImgData = warpedCtx.createImageData(outW, outH);
    const dstPixels = dstImgData.data;

    for (let y = 0; y < outH; y++) {
      const h1y = H[1] * y + H[2];
      const h4y = H[4] * y + H[5];
      const h7y = H[7] * y + H[8];

      for (let x = 0; x < outW; x++) {
        const denom = H[6] * x + h7y;
        const u = (H[0] * x + h1y) / denom;
        const v = (H[3] * x + h4y) / denom;

        const ix = Math.floor(u);
        const iy = Math.floor(v);
        const outIdx = (y * outW + x) * 4;

        if (ix >= 0 && ix < srcW - 1 && iy >= 0 && iy < srcH - 1) {
          const fx = u - ix;
          const fy = v - iy;
          const w00 = (1 - fx) * (1 - fy);
          const w10 = fx * (1 - fy);
          const w01 = (1 - fx) * fy;
          const w11 = fx * fy;

          const i00 = (iy * srcW + ix) * 4;
          const i10 = i00 + 4;
          const i01 = ((iy + 1) * srcW + ix) * 4;
          const i11 = i01 + 4;

          dstPixels[outIdx] =
            srcPixels[i00] * w00 + srcPixels[i10] * w10 + srcPixels[i01] * w01 + srcPixels[i11] * w11;
          dstPixels[outIdx + 1] =
            srcPixels[i00 + 1] * w00 +
            srcPixels[i10 + 1] * w10 +
            srcPixels[i01 + 1] * w01 +
            srcPixels[i11 + 1] * w11;
          dstPixels[outIdx + 2] =
            srcPixels[i00 + 2] * w00 +
            srcPixels[i10 + 2] * w10 +
            srcPixels[i01 + 2] * w01 +
            srcPixels[i11 + 2] * w11;
          dstPixels[outIdx + 3] = 255;
        } else {
          const cx = Math.min(Math.max(0, Math.round(u)), srcW - 1);
          const cy = Math.min(Math.max(0, Math.round(v)), srcH - 1);
          const cIdx = (cy * srcW + cx) * 4;
          dstPixels[outIdx] = srcPixels[cIdx];
          dstPixels[outIdx + 1] = srcPixels[cIdx + 1];
          dstPixels[outIdx + 2] = srcPixels[cIdx + 2];
          dstPixels[outIdx + 3] = 255;
        }
      }
    }
    warpedCtx.putImageData(dstImgData, 0, 0);
  }

  // Apply tone & white-paper enhancement
  if (settings.preset !== 'original' || settings.contrast !== 0 || settings.brightness !== 0) {
    applyPaperEnhancement(warpedCtx, outW, outH, settings.preset, settings.contrast, settings.brightness);
  }

  // Apply 90-degree rotation steps if requested
  let finalCanvas = warpedCanvas;
  if (settings.rotation !== 0) {
    finalCanvas = document.createElement('canvas');
    const swap = settings.rotation === 90 || settings.rotation === 270;
    finalCanvas.width = swap ? outH : outW;
    finalCanvas.height = swap ? outW : outH;
    const fCtx = finalCanvas.getContext('2d')!;
    fCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
    fCtx.rotate((settings.rotation * Math.PI) / 180);
    fCtx.drawImage(warpedCanvas, -outW / 2, -outH / 2);
  }

  return {
    processedDataUrl: finalCanvas.toDataURL('image/jpeg', 0.8),
    width: finalCanvas.width,
    height: finalCanvas.height,
  };
}

/**
 * Reduce cualquier imagen a un máximo de `maxSide` px por lado (por defecto 1600 px)
 * y la comprime como JPEG (calidad 0.8) antes de enviarla a Gemini.
 */
export async function compressImageForGemini(
  dataUrl: string,
  maxSide = 1600,
  quality = 0.8,
): Promise<string> {
  const img = await loadImageElement(dataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  let targetW = Math.max(1, srcW);
  let targetH = Math.max(1, srcH);

  const longestSide = Math.max(targetW, targetH);
  if (longestSide > maxSide) {
    const scale = maxSide / longestSide;
    targetW = Math.max(1, Math.round(targetW * scale));
    targetH = Math.max(1, Math.round(targetH * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return dataUrl;
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Mejora la legibilidad del papel manuscrito:
 * - Estima el tono blanco del papel mediante muestreo por bloques (corrige sombras de luz).
 * - Eleva el fondo hacia blanco puro y refuerza la tinta manuscrita.
 */
function applyPaperEnhancement(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: EnhancementPreset,
  contrastOffset: number,
  brightnessOffset: number,
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  // Estimate local paper background luminance on a coarse grid (to neutralize shadows)
  const gridCols = 12;
  const gridRows = 16;
  const cellW = Math.max(1, Math.floor(width / gridCols));
  const cellH = Math.max(1, Math.floor(height / gridRows));
  const bgGrid = new Float32Array(gridCols * gridRows);

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      const startX = gx * cellW;
      const endX = Math.min(width, startX + cellW);
      const startY = gy * cellH;
      const endY = Math.min(height, startY + cellH);

      // Sample brightest pixels in this cell (representing paper background, not ink)
      let maxLuma = 180;
      let sumTop = 0;
      let countTop = 0;
      const step = Math.max(1, Math.floor(Math.min(cellW, cellH) / 6));

      for (let y = startY; y < endY; y += step) {
        for (let x = startX; x < endX; x += step) {
          const i = (y * width + x) * 4;
          const l = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          if (l > maxLuma) maxLuma = l;
          sumTop += l;
          countTop++;
        }
      }
      const avg = sumTop / Math.max(1, countTop);
      bgGrid[gy * gridCols + gx] = Math.max(135, Math.min(255, avg * 0.35 + maxLuma * 0.65));
    }
  }

  const contrastFactor = Math.pow((100 + contrastOffset) / 100, 1.35);
  const brightShift = brightnessOffset * 1.4;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));
    const rowOffset = gy * gridCols;

    for (let x = 0; x < width; x++) {
      const gx = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
      const localWhite = bgGrid[rowOffset + gx];
      const idx = (y * width + x) * 4;

      let r = pixels[idx];
      let g = pixels[idx + 1];
      let b = pixels[idx + 2];

      if (preset === 'documento') {
        // Normalize against local paper brightness -> clean white background while keeping ink colors
        const normScale = 252 / localWhite;
        r = Math.min(255, r * normScale);
        g = Math.min(255, g * normScale);
        b = Math.min(255, b * normScale);

        // Apply contrast & brightness centered near paper highlights
        r = (r - 128) * contrastFactor + 128 + brightShift;
        g = (g - 128) * contrastFactor + 128 + brightShift;
        b = (b - 128) * contrastFactor + 128 + brightShift;

        // Soft paper-white snap for very light background pixels
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 218) {
          const blend = Math.min(1, (lum - 218) / 28);
          r = r + (255 - r) * blend * 0.85;
          g = g + (255 - g) * blend * 0.85;
          b = b + (255 - b) * blend * 0.85;
        }
      } else if (preset === 'alto_contraste') {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const normLuma = Math.min(255, (luma * 250) / localWhite);
        const stretched = (normLuma - 132) * (contrastFactor * 1.45) + 132 + brightShift;
        const val = stretched > 195 ? 255 : Math.max(0, Math.min(255, stretched * 0.92));
        r = val;
        g = val;
        b = val;
      } else {
        // 'original' with user contrast/brightness adjustments only
        r = (r - 128) * contrastFactor + 128 + brightShift;
        g = (g - 128) * contrastFactor + 128 + brightShift;
        b = (b - 128) * contrastFactor + 128 + brightShift;
      }

      pixels[idx] = r < 0 ? 0 : r > 255 ? 255 : r;
      pixels[idx + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      pixels[idx + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
