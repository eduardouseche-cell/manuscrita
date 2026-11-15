import type { StagedPage } from '../types';
import type { NormalizedOcrResult } from './geminiService';
import { cloneDefaultSettings, processPageImage } from './imageProcessor';

interface DemoLineSpec {
  text: string;
  size?: number;
  weight?: string;
  color?: string;
  indent?: number;
  checkbox?: 'checked' | 'unchecked';
  gapAfter?: number;
  isSketch?: boolean;
}

async function renderNotebookPageCanvas(lines: DemoLineSpec[], pageIndex: number): Promise<string> {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  const W = 1240;
  const H = 1660;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Subtle dark desk border around paper so auto-crop/perspective looks authentic
  ctx.fillStyle = '#E5E2DC';
  ctx.fillRect(0, 0, W, H);

  // Paper shadow & sheet
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#FDFCFA';
  ctx.fillRect(36, 36, W - 72, H - 72);
  ctx.restore();

  // Horizontal ruled lines
  const startRuleY = 170;
  const ruleStep = 58;
  ctx.strokeStyle = 'rgba(96, 145, 204, 0.25)';
  ctx.lineWidth = 2;
  for (let y = startRuleY; y < H - 80; y += ruleStep) {
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(W - 56, y);
    ctx.stroke();
  }

  // Red notebook margin line
  ctx.strokeStyle = 'rgba(220, 92, 82, 0.34)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(155, 56);
  ctx.lineTo(155, H - 56);
  ctx.stroke();

  // Subtle notebook punch holes
  ctx.fillStyle = '#E5E2DC';
  [260, 830, 1400].forEach((hy) => {
    ctx.beginPath();
    ctx.arc(96, hy, 18, 0, Math.PI * 2);
    ctx.fill();
  });

  // Top-right page stamp
  ctx.fillStyle = '#71717A';
  ctx.font = '500 28px "Caveat", cursive';
  ctx.fillText(`Pág. ${pageIndex}`, W - 150, 118);

  let cursorY = 158;
  const baseX = 185;

  for (const line of lines) {
    if (line.isSketch) {
      // Draw a simple hand-drawn box-flow sketch to illustrate [diagrama]
      cursorY += 20;
      ctx.save();
      ctx.strokeStyle = '#263869';
      ctx.lineWidth = 3;
      ctx.strokeRect(baseX + 20, cursorY, 210, 90);
      ctx.strokeRect(baseX + 340, cursorY, 210, 90);
      ctx.beginPath();
      ctx.moveTo(baseX + 230, cursorY + 45);
      ctx.lineTo(baseX + 335, cursorY + 45);
      ctx.lineTo(baseX + 315, cursorY + 32);
      ctx.moveTo(baseX + 335, cursorY + 45);
      ctx.lineTo(baseX + 315, cursorY + 58);
      ctx.stroke();

      ctx.fillStyle = '#263869';
      ctx.font = '500 32px "Caveat", cursive';
      ctx.fillText('Borrador', baseX + 65, cursorY + 54);
      ctx.fillText('PDF final', baseX + 382, cursorY + 54);
      ctx.restore();
      cursorY += 140;
      continue;
    }

    const fontSize = line.size || 46;
    const weight = line.weight || '500';
    ctx.font = `${weight} ${fontSize}px "Caveat", cursive`;
    ctx.fillStyle = line.color || '#1E293B';

    const drawX = baseX + (line.indent || 0);

    if (line.checkbox) {
      const boxY = cursorY - 34;
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 3.2;
      ctx.strokeRect(drawX, boxY, 32, 32);

      if (line.checkbox === 'checked') {
        ctx.strokeStyle = '#DC4A2D';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(drawX + 5, boxY + 16);
        ctx.lineTo(drawX + 14, boxY + 25);
        ctx.lineTo(drawX + 28, boxY + 6);
        ctx.stroke();
      }
      ctx.fillText(line.text, drawX + 48, cursorY);
    } else {
      ctx.fillText(line.text, drawX, cursorY);
    }

    cursorY += line.gapAfter ?? ruleStep;
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

export async function createDemoStagedPages(): Promise<StagedPage[]> {
  const page1Original = await renderNotebookPageCanvas(
    [
      { text: '## Reunión Marketing Q4 ##', size: 54, weight: '600', color: '#0F172A', gapAfter: 82 },
      { text: 'Resumen de prioridades para el lanzamiento de', size: 45, gapAfter: 58 },
      { text: 'noviembre. El foco principal está en reducir el', size: 45, gapAfter: 58 },
      { text: 'tiempo de entrega de campañas y unificar guías.', size: 45, gapAfter: 86 },
      { text: 'Flujo propuesto:', size: 46, weight: '600', gapAfter: 30 },
      { text: '', isSketch: true },
      { text: 'Pendientes del equipo:', size: 48, weight: '600', color: '#0F172A', gapAfter: 66 },
      { text: 'Revisar presupuesto de pauta digital', checkbox: 'checked', gapAfter: 58 },
      { text: 'Aprobar creatividades con diseño', checkbox: 'checked', gapAfter: 58 },
      { text: 'Confirmar fecha de webinar con ventas', checkbox: 'unchecked', gapAfter: 58 },
      { text: 'Enviar notas finales al equipo directivo', checkbox: 'unchecked', gapAfter: 58 },
    ],
    1,
  );

  const page2Original = await renderNotebookPageCanvas(
    [
      { text: 'Notas de seguimiento:', size: 50, weight: '600', color: '#0F172A', gapAfter: 74 },
      { text: 'La sesión de pruebas con usuarios dio muy buena', size: 45, gapAfter: 58 },
      { text: 'respuesta en móviles. Priorizar exportación rápida', size: 45, gapAfter: 58 },
      { text: 'y soporte offline para listas de campo.', size: 45, gapAfter: 88 },
      { text: 'Checklist técnico:', size: 48, weight: '600', color: '#0F172A', gapAfter: 66 },
      { text: 'Validar fuente PDF con tildes y ñ', checkbox: 'checked', gapAfter: 58 },
      { text: 'Probar compartir archivo en iOS y Android', checkbox: 'unchecked', gapAfter: 58 },
      { text: 'Publicar guía rápida en español', checkbox: 'unchecked', gapAfter: 58 },
    ],
    2,
  );

  const pagesInput = [
    { id: 'demo_page_1', original: page1Original },
    { id: 'demo_page_2', original: page2Original },
  ];

  const staged: StagedPage[] = [];
  for (const item of pagesInput) {
    const settings = cloneDefaultSettings([
      { x: 0.03, y: 0.025 },
      { x: 0.97, y: 0.025 },
      { x: 0.97, y: 0.975 },
      { x: 0.03, y: 0.975 },
    ]);
    const processed = await processPageImage(item.original, settings);
    staged.push({
      id: item.id,
      originalDataUrl: item.original,
      processedDataUrl: processed.processedDataUrl,
      width: processed.width,
      height: processed.height,
      settings,
    });
  }

  return staged;
}

export function getSimulatedDemoOcrResponse(): NormalizedOcrResult {
  return {
    titulo: 'Reunión Marketing Q4',
    origen_titulo: 'manuscrito',
    paginas: [
      {
        numero: 1,
        texto:
          'Resumen de prioridades para el lanzamiento de noviembre. El foco principal está en reducir el tiempo de entrega de campañas y unificar guías.\n\nFlujo propuesto:\n[diagrama]\n\nPendientes del equipo:',
      },
      {
        numero: 2,
        texto:
          'Notas de seguimiento:\nLa sesión de pruebas con usuarios dio muy buena respuesta en móviles. Priorizar exportación rápida y soporte offline para listas de campo.\n\nChecklist técnico:',
      },
    ],
    listas: [
      {
        id: 'demo_list_1',
        pagina: 1,
        items: [
          { id: 'demo_i1', texto: 'Revisar presupuesto de pauta digital', completado: true },
          { id: 'demo_i2', texto: 'Aprobar creatividades con diseño', completado: true },
          { id: 'demo_i3', texto: 'Confirmar fecha de webinar con ventas', completado: false },
          { id: 'demo_i4', texto: 'Enviar notas finales al equipo directivo', completado: false },
        ],
      },
      {
        id: 'demo_list_2',
        pagina: 2,
        items: [
          { id: 'demo_i5', texto: 'Validar fuente PDF con tildes y ñ', completado: true },
          { id: 'demo_i6', texto: 'Probar compartir archivo en iOS y Android', completado: false },
          { id: 'demo_i7', texto: 'Publicar guía rápida en español', completado: false },
        ],
      },
    ],
  };
}
