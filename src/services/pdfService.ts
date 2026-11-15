import { jsPDF } from 'jspdf';
import type { PdfExportOptions, ScanRecord } from '../types';
import { loadImageElement } from './imageProcessor';

let cachedRegularFontBase64: string | null = null;
let cachedBoldFontBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function ensurePdfFontsLoaded(doc: jsPDF): Promise<string> {
  try {
    if (!cachedRegularFontBase64) {
      const res = await fetch('/fonts/LiberationSans-Regular.ttf');
      if (!res.ok) throw new Error('Regular font not found');
      cachedRegularFontBase64 = arrayBufferToBase64(await res.arrayBuffer());
    }
    if (!cachedBoldFontBase64) {
      const res = await fetch('/fonts/LiberationSans-Bold.ttf');
      if (!res.ok) throw new Error('Bold font not found');
      cachedBoldFontBase64 = arrayBufferToBase64(await res.arrayBuffer());
    }

    doc.addFileToVFS('LiberationSans-Regular.ttf', cachedRegularFontBase64);
    doc.addFont('LiberationSans-Regular.ttf', 'LiberationSans', 'normal', 'normal', 'Identity-H');

    doc.addFileToVFS('LiberationSans-Bold.ttf', cachedBoldFontBase64);
    doc.addFont('LiberationSans-Bold.ttf', 'LiberationSans', 'bold', 'bold', 'Identity-H');

    return 'LiberationSans';
  } catch {
    return 'helvetica';
  }
}

/**
 * Construye el nombre de archivo inteligente:
 * Sin tildes ni caracteres inválidos, espacios -> guiones, fecha AAAA-MM-DD al final.
 * Ejemplo: "Reunión Marketing" -> "Reunion-Marketing_2026-11-15.pdf"
 */
export function buildSmartFilenameBase(titulo: string, isoDate?: string): string {
  const dateObj = isoDate ? new Date(isoDate) : new Date();
  const validDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const yyyy = validDate.getFullYear();
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const dd = String(validDate.getDate()).padStart(2, '0');
  const dateSuffix = `${yyyy}-${mm}-${dd}`;

  const cleanSlug = (titulo || 'Notas')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  const safeSlug = cleanSlug || 'Notas-Manuscritas';
  return `${safeSlug}_${dateSuffix}`;
}

export function buildSmartPdfFilename(titulo: string, isoDate?: string): string {
  return `${buildSmartFilenameBase(titulo, isoDate)}.pdf`;
}

export function buildSmartTxtFilename(titulo: string, isoDate?: string): string {
  return `${buildSmartFilenameBase(titulo, isoDate)}.txt`;
}

/**
 * Dibuja una casilla de verificación vectorial (cuadrado + marca interior si completado)
 * para evitar caracteres Unicode incompatibles en visores PDF.
 */
function drawVectorCheckbox(doc: jsPDF, x: number, yTop: number, size: number, checked: boolean): void {
  doc.setLineWidth(0.35);
  if (checked) {
    doc.setDrawColor(234, 67, 31); // Rocket orange-red accent
    doc.setFillColor(234, 67, 31);
    doc.roundedRect(x, yTop, size, size, 0.5, 0.5, 'FD');

    // Crisp white checkmark strokes inside the box
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(x + size * 0.22, yTop + size * 0.55, x + size * 0.43, yTop + size * 0.76);
    doc.line(x + size * 0.43, yTop + size * 0.76, x + size * 0.8, yTop + size * 0.26);
  } else {
    doc.setDrawColor(113, 113, 122);
    doc.roundedRect(x, yTop, size, size, 0.5, 0.5, 'S');
  }
}

export interface GeneratedPdfResult {
  blob: Blob;
  filename: string;
}

/**
 * Genera el documento PDF en el navegador con jsPDF:
 * 1) Una página por cada imagen escaneada (si includeImages).
 * 2) Páginas de texto con el título como encabezado y saltos de página automáticos (si includeText).
 * 3) Listas con casillas vectoriales y saltos automáticos (si includeLists).
 */
export async function generateScanPdf(
  scan: ScanRecord,
  options: PdfExportOptions,
): Promise<GeneratedPdfResult> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const fontFamily = await ensurePdfFontsLoaded(doc);
  const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const marginX = 16;
  const marginTop = 18;
  const marginBottom = 18;
  const contentWidth = pageWidth - marginX * 2;

  let hasAddedAnyPage = false;

  // 1. Image pages (one page per scan image)
  if (options.includeImages && scan.paginas.length > 0) {
    for (let i = 0; i < scan.paginas.length; i++) {
      const page = scan.paginas[i];
      if (hasAddedAnyPage) {
        doc.addPage();
      }
      hasAddedAnyPage = true;

      try {
        const img = await loadImageElement(page.imageDataUrl);
        const imgW = img.naturalWidth || img.width || 1000;
        const imgH = img.naturalHeight || img.height || 1400;

        const maxImgW = pageWidth - 20;
        const maxImgH = pageHeight - 28;
        const ratio = Math.min(maxImgW / imgW, maxImgH / imgH);
        const drawW = imgW * ratio;
        const drawH = imgH * ratio;
        const drawX = (pageWidth - drawW) / 2;
        const drawY = (pageHeight - 10 - drawH) / 2 + 4;

        doc.addImage(page.imageDataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');

        // Subtle footer page index
        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(120, 120, 128);
        doc.text(
          `${scan.titulo} · Escaneo ${page.numero} de ${scan.paginas.length}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' },
        );
      } catch {
        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 110);
        doc.text(`No se pudo incrustar la imagen de la página ${page.numero}.`, marginX, marginTop + 10);
      }
    }
  }

  const wantsTextSection = options.includeText && scan.paginas.some((p) => p.texto.trim().length > 0);
  const wantsListsSection = options.includeLists && scan.listas.length > 0;

  // 2. Digital text & checklist pages
  if (wantsTextSection || wantsListsSection || !hasAddedAnyPage) {
    if (hasAddedAnyPage) {
      doc.addPage();
    }
    hasAddedAnyPage = true;

    let y = marginTop;

    const addTextPageHeader = (continued = false) => {
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(continued ? 11 : 17);
      doc.setTextColor(24, 24, 27);
      const headerTitle = continued ? `${scan.titulo} (cont.)` : scan.titulo;
      const titleLines = doc.splitTextToSize(headerTitle, contentWidth) as string[];
      doc.text(titleLines, marginX, y);
      y += titleLines.length * (continued ? 5 : 7);

      if (!continued) {
        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(113, 113, 122);
        const dateLabel = new Date(scan.createdAt).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        const originText = scan.origen_titulo === 'manuscrito' ? 'Del manuscrito' : 'Título automático';
        doc.text(`${dateLabel}  ·  ${originText}`, marginX, y);
        y += 5;
      }

      doc.setDrawColor(228, 228, 231);
      doc.setLineWidth(0.35);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 7;
    };

    const ensureSpace = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
        addTextPageHeader(true);
      }
    };

    addTextPageHeader(false);

    // Transcribed text by page
    if (options.includeText) {
      for (const page of scan.paginas) {
        const cleanText = page.texto.trim();
        if (!cleanText) continue;

        if (scan.paginas.length > 1) {
          ensureSpace(12);
          doc.setFont(fontFamily, 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(234, 67, 31);
          doc.text(`Página ${page.numero}`, marginX, y);
          y += 5.5;
        }

        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(39, 39, 42);

        const paragraphs = cleanText.split(/\r?\n/);
        for (const paragraph of paragraphs) {
          if (paragraph.trim() === '') {
            y += 3.5;
            continue;
          }
          const wrapped = doc.splitTextToSize(paragraph, contentWidth) as string[];
          for (const line of wrapped) {
            ensureSpace(5.5);
            doc.text(line, marginX, y);
            y += 5.2;
          }
        }

        y += 5;
      }
    }

    // Checklists with vector squares
    if (options.includeLists && scan.listas.length > 0) {
      ensureSpace(16);
      if (options.includeText && scan.paginas.some((p) => p.texto.trim().length > 0)) {
        y += 2;
      }

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(24, 24, 27);
      doc.text('Listas', marginX, y);
      y += 6.5;

      for (const group of scan.listas) {
        if (group.items.length === 0) continue;

        const completedCount = group.items.filter((it) => it.completado).length;
        ensureSpace(12);
        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(113, 113, 122);
        doc.text(
          `Página ${group.pagina}  ·  ${completedCount} de ${group.items.length} completadas`,
          marginX,
          y,
        );
        y += 5.5;

        const boxSize = 3.6;
        const textOffset = 6.2;

        for (const item of group.items) {
          doc.setFont(fontFamily, 'normal');
          doc.setFontSize(10.5);
          const itemLines = doc.splitTextToSize(item.texto, contentWidth - textOffset) as string[];
          const itemHeight = Math.max(6, itemLines.length * 5.1);

          ensureSpace(itemHeight + 2);

          // Draw vector square & optional checkmark
          drawVectorCheckbox(doc, marginX, y - 3.1, boxSize, item.completado);

          if (item.completado) {
            doc.setTextColor(113, 113, 122);
          } else {
            doc.setTextColor(24, 24, 27);
          }

          itemLines.forEach((line, idx) => {
            const lineY = y + idx * 5.1;
            doc.text(line, marginX + textOffset, lineY);
            if (item.completado) {
              const lineWidth = doc.getTextWidth(line);
              doc.setDrawColor(161, 161, 170);
              doc.setLineWidth(0.25);
              doc.line(marginX + textOffset, lineY - 1.1, marginX + textOffset + lineWidth, lineY - 1.1);
            }
          });

          y += itemHeight + 1.8;
        }

        y += 4;
      }
    }
  }

  const filename = buildSmartPdfFilename(scan.titulo, scan.createdAt);
  const blob = doc.output('blob');

  return { blob, filename };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function canSharePdfFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  if (typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const testFile = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

export async function sharePdfFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  if (!canSharePdfFiles()) return false;
  const file = new File([blob], filename, { type: 'application/pdf' });
  await navigator.share({
    files: [file],
    title,
    text: `Documento digitalizado con Manuscrita: ${title}`,
  });
  return true;
}
