// Export der aktuellen Ansicht. Alles läuft im Browser; der Server muss nur
// statische Dateien ausliefern. jsPDF und svg2pdf werden erst beim ersten
// PDF-Export nachgeladen, damit die Seite schnell startet.

export type PdfFormat = 'a4' | 'a3' | 'fit';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  return { width: Number(svg.getAttribute('width')), height: Number(svg.getAttribute('height')) };
}

export async function exportPdf(svg: SVGSVGElement, filename: string, format: PdfFormat): Promise<void> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { width, height } = svgSize(svg);
  const margin = 24; // pt

  const doc =
    format === 'fit'
      ? new jsPDF({ orientation: width >= height ? 'landscape' : 'portrait', unit: 'pt', format: [width + 2 * margin, height + 2 * margin] })
      : new jsPDF({ orientation: width >= height ? 'landscape' : 'portrait', unit: 'pt', format });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const scale = Math.min((pageW - 2 * margin) / width, (pageH - 2 * margin) / height);
  await svg2pdf(svg, doc, { x: margin, y: margin, width: width * scale, height: height * scale });
  doc.save(filename);
}

/** Größte Kantenlänge des exportierten Bildes; größere Canvas-Flächen scheitern in manchen Browsern. */
const MAX_IMAGE_SIDE = 8000;

export async function exportImage(svg: SVGSVGElement, filename: string, type: 'image/jpeg' | 'image/png', maxPixelRatio = 2): Promise<void> {
  const { width, height } = svgSize(svg);
  const pixelRatio = Math.min(maxPixelRatio, MAX_IMAGE_SIDE / Math.max(width, height));
  const source = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG konnte nicht in ein Bild umgewandelt werden'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(pixelRatio, pixelRatio);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error('Bild konnte nicht erzeugt werden');
  download(blob, filename);
}
