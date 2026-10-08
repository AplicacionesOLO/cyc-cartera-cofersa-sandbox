'use client';

/**
 * TabReportarPago — Módulo de reporte de pago con OCR y compresión
 *
 * Pipeline completo:
 *   Dropzone → (PDF→canvas) → comprimirImagen() → Tesseract.js → auto-fill form
 *   Submit   → S3 vía URL prefirmada (imagen comprimida) → POST /clientes/pagos/reportar (API Gateway)
 *
 * Compresión: Canvas API nativa — max 1280px, 65% calidad, WebP preferido
 * OCR: tesseract.js v7   |  PDF render: pdfjs-dist v5
 * Objetivo: comprobantes < 300 KB en S3 (bucket privado comprobantes-pago)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Landmark,
  Hash,
  Calendar,
  CheckSquare,
  Square,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Upload,
  X,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { fmtCRC, fmtFecha, hoyISO } from '@/lib/utils/formato';
import { useReportarPagoController } from '@/views/gestion-cartera/hooks/use-reportar-pago-controller';
import type { ApiError } from '@/shared/api/api-error';
import { comprimirImagen } from '@/lib/utils/comprimir-imagen';
import type { ImagenComprimida } from '@/lib/utils/comprimir-imagen';
import type { Factura } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════

const BANCOS = [
  { value: 'BAC', label: 'BAC Credomatic' },
  { value: 'BNCR', label: 'Banco Nacional (BNCR)' },
  { value: 'BCR', label: 'Banco de Costa Rica (BCR)' },
  { value: 'DAVIVIENDA', label: 'Davivienda' },
] as const;

const TIPOS_PAGO = ['Transferencia', 'Cheque'] as const;
type TipoPago = (typeof TIPOS_PAGO)[number] | '';
type BancoValue = (typeof BANCOS)[number]['value'];
const MAX_MB = 8;

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

interface FacturaSeleccionada {
  factura_id: number;
  documento: string;
  saldo_max: number;
  monto_aplicado: number;
}

interface OcrResultado {
  monto?: number;
  referencia?: string;
  fecha?: string; // YYYY-MM-DD
  detectados: ('monto' | 'referencia' | 'fecha')[];
}

type OcrFase =
  | { fase: 'idle' }
  | { fase: 'procesando'; label: string; progreso: number }
  | {
      fase: 'listo';
      resultado: OcrResultado;
      previewUrl: string;
      fileName: string;
      // ── stats de compresión ───────────────────────────────────────
      originalKB: number; // tamaño del archivo/blob de entrada
      compressedKB: number; // tamaño tras compresión
      formato: 'webp' | 'jpeg'; // formato de salida
    }
  | { fase: 'error'; mensaje: string };

interface Props {
  clienteCod: string;
  contribuyente: string;
  facturas: Factura[];
  onSuccess: () => void;
  onToast: (msg: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════
// OCR — PIPELINE COMPLETO
// ═══════════════════════════════════════════════════════════════════════

/** Renderiza la primera página de un PDF en un Blob PNG (escala 2×) */
async function pdfToBlob(file: File): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist');

  // Worker via URL del módulo — funciona con webpack/turbopack en Next.js
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;

  // pdfjs-dist v5: usa `canvas` directamente (canvasContext es legacy)
  await page.render({ canvas, viewport: vp }).promise;

  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob falló'))), 'image/png'),
  );
}

/** Ejecuta Tesseract.js sobre una imagen/blob y reporta progreso */
async function runOCR(
  source: File | Blob,
  onProg: (label: string, pct: number) => void,
): Promise<string> {
  // Import dinámico — se carga solo cuando el usuario sube un archivo
  const Tesseract = await import('tesseract.js');

  const LABELS: Record<string, string> = {
    'loading tesseract core': 'Cargando motor OCR…',
    'loading language traineddata': 'Cargando idioma…',
    'initializing api': 'Inicializando…',
    'recognizing text': 'Reconociendo texto…',
  };

  const {
    data: { text },
  } = await Tesseract.recognize(source, 'spa+eng', {
    logger: (m: { status: string; progress: number }) => {
      const pct = Math.round((m.progress ?? 0) * 100);
      const label = LABELS[m.status] ?? m.status;
      onProg(label, pct);
    },
  });
  return text;
}

// Compresión de imagen → módulo compartido @/lib/utils/comprimir-imagen

// ── Parseo de monto en formato CRC (punto miles, coma decimal) ──────────
function parsearMonto(s: string): number | null {
  const c = s.replace(/[₡¢\s]/g, '').trim();
  // 75.000,50  (formato CR)
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(c))
    return parseFloat(c.replace(/\./g, '').replace(',', '.'));
  // 75,000.50  (formato US — algunos bancos CR)
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(c)) return parseFloat(c.replace(/,/g, ''));
  // número plano
  const n = parseFloat(c.replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ── Detecta banco por keywords del texto OCR ────────────────────────────
function detectarBanco(texto: string): BancoValue | null {
  const t = texto.toUpperCase();
  if (/BAC|CREDOMATIC|MONTO TRANSFERIDO/.test(t)) return 'BAC';
  if (/BANCO NACIONAL|BNCR|TRANSACCI[OÓ]N PROCESADA|MONTO DEBITADO/.test(t)) return 'BNCR';
  if (/BANCO DE COSTA RICA|COMPROBANTE DE TRANSFERENCIA/.test(t)) return 'BCR';
  if (/(?<!\w)BCR(?!\w)/.test(t) && !/BANCO DE COSTA RICA/.test(t)) return 'BCR';
  if (/DAVIVIENDA/.test(t)) return 'DAVIVIENDA';
  return null;
}

// ── Extrae monto / referencia / fecha del texto OCR ─────────────────────
function parsearTexto(texto: string): OcrResultado {
  const t = texto.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
  const resultado: OcrResultado = { detectados: [] };

  // ── MONTO ────────────────────────────────────────────────────────────
  const montos: number[] = [];

  // Patrón 1: símbolo ₡ o ¢
  for (const m of t.matchAll(/[₡¢]\s*([\d.,]+)/g)) {
    const n = parsearMonto(m[1]);
    if (n && n > 500) montos.push(n);
  }
  // Patrón 2: CRC prefix
  const crcM = t.match(/CRC[\s:]*([\d.,]+)/i);
  if (crcM) {
    const n = parsearMonto(crcM[1]);
    if (n && n > 500) montos.push(n);
  }

  // Patrón 3: keyword MONTO / TOTAL / IMPORTE / TRANSFERIDO / DEBITADO
  // Busca el número en los siguientes 40 caracteres después del keyword
  const kwM = t.match(
    /(?:MONTO|TOTAL|IMPORTE|VALOR|AMOUNT|TRANSFERIDO|DEBITADO)[\s\S]{0,40}?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{4,}(?:[.,]\d{1,2})?)/i,
  );
  if (kwM) {
    const limpio = kwM[1].replace(/[^\d.,]/g, '');
    const n = parsearMonto(limpio);
    if (n && n > 500) montos.push(n);
  }

  // Patrón 4: número en formato 100,000.00 o 100.000,00 seguido de "Colones"
  const colonesM = t.match(/([\d]{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)\s*(?:colones|COLONES)/i);
  if (colonesM) {
    const n = parsearMonto(colonesM[1]);
    if (n && n > 500) montos.push(n);
  }

  // Patrón 5: keyword inline con número (sin separador de línea)
  const kwInline = t.match(/(?:MONTO|TOTAL|IMPORTE|VALOR|AMOUNT)[\s:₡¢]+([\d.,]+)/i);
  if (kwInline) {
    const n = parsearMonto(kwInline[1].replace(/[₡¢]/g, ''));
    if (n && n > 500) montos.push(n);
  }

  if (montos.length > 0) {
    resultado.monto = Math.max(...montos); // tomamos el mayor (total de la transferencia)
    resultado.detectados.push('monto');
  }

  // ── REFERENCIA ───────────────────────────────────────────────────────
  // Patrón 1: keyword + 6-15 dígitos
  const refKw = t.match(
    /(?:REF(?:ERENCIA)?|N[ÚúUu][Mm](?:ERO)?|TRANSACCI[ÓóOo]N|COMPROBANTE|AUTORIZACI[ÓóOo]N|VOUCHER|SINPE|AUTENTICACI[ÓóOo]N)[\s:#Nº°.]*([0-9]{6,15})/i,
  );
  if (refKw) {
    resultado.referencia = refKw[1];
    resultado.detectados.push('referencia');
  }
  // Patrón 2: número standalone de 12-15 dígitos (SINPE)
  if (!resultado.referencia) {
    const largo = t.match(/\b([0-9]{12,15})\b/);
    if (largo) {
      resultado.referencia = largo[1];
      resultado.detectados.push('referencia');
    }
  }

  // ── FECHA ────────────────────────────────────────────────────────────
  // Patrón 1: DD/MM/YYYY
  const dmy = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    resultado.fecha = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    resultado.detectados.push('fecha');
  }
  // Patrón 2: YYYY-MM-DD
  if (!resultado.fecha) {
    const ymd = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (ymd) {
      resultado.fecha = ymd[0];
      resultado.detectados.push('fecha');
    }
  }
  // Patrón 3: DD-MM-YYYY
  if (!resultado.fecha) {
    const dmy2 = t.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
    if (dmy2) {
      const [, dd, mm, yyyy] = dmy2;
      resultado.fecha = `${yyyy}-${mm}-${dd}`;
      resultado.detectados.push('fecha');
    }
  }

  return resultado;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS UI
// ═══════════════════════════════════════════════════════════════════════

function facturasVencidas(facturas: Factura[]): Factura[] {
  const hoy = hoyISO();
  return facturas
    .filter((f) => (f.saldo ?? 0) > 0 && f.fecha_vencimiento && f.fecha_vencimiento < hoy)
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
}

function diasVencida(fechaVenc: string): number {
  const hoy = hoyISO();
  return Math.max(
    0,
    Math.floor((new Date(hoy).getTime() - new Date(fechaVenc).getTime()) / 86400000),
  );
}

function colorDias(d: number): { bg: string; text: string } {
  if (d > 120) return { bg: '#fee2e2', text: '#991b1b' };
  if (d > 60) return { bg: '#fee2e2', text: '#dc2626' };
  if (d > 30) return { bg: '#ffedd5', text: '#c2410c' };
  return { bg: '#fef9c3', text: '#a16207' };
}

/** Badge "✦ OCR" junto al label del campo — click lo limpia */
function OcrBadge({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      title="Valor detectado por OCR — click para limpiar"
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black transition hover:opacity-70"
      style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
    >
      <Sparkles size={8} />
      OCR
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

export default function TabReportarPago({
  clienteCod,
  contribuyente,
  facturas,
  onSuccess,
  onToast,
}: Props) {
  const { subirComprobante, reportarPago } = useReportarPagoController();
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Estado formulario ────────────────────────────────────────────
  const [tipoPago, setTipoPago] = useState<TipoPago>('');
  const [banco, setBanco] = useState<BancoValue | ''>('');
  const [ref, setRef] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');

  // ── Estado OCR ────────────────────────────────────────────────────
  const [ocrFase, setOcrFase] = useState<OcrFase>({ fase: 'idle' });
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [archivoComprimido, setArchivoComprimido] = useState<Blob | null>(null);
  const [ocrFilled, setOcrFilled] = useState<Set<'monto' | 'referencia' | 'fecha'>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  // ── Estado facturas ───────────────────────────────────────────────
  const [seleccion, setSeleccion] = useState<Map<number, FacturaSeleccionada>>(new Map());

  // ── Estado submit ─────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derivados ────────────────────────────────────────────────────
  const facturasConSaldo = useMemo(() => facturasVencidas(facturas), [facturas]);

  const totalSeleccion = useMemo(
    () => Array.from(seleccion.values()).reduce((a, f) => a + f.monto_aplicado, 0),
    [seleccion],
  );

  const montoNum = parseFloat(monto.replace(/[^0-9.]/g, '')) || 0;
  const diferencia = Math.abs(montoNum - totalSeleccion);
  const cuadra = seleccion.size > 0 && montoNum > 0 && diferencia <= 1;

  // ── Limpiar preview URL al desmontar ────────────────────────────
  useEffect(() => {
    return () => {
      if (ocrFase.fase === 'listo') URL.revokeObjectURL(ocrFase.previewUrl);
    };
  }, [ocrFase]);

  // ── OCR: procesar archivo ────────────────────────────────────────
  async function procesarArchivo(file: File) {
    const tiposAceptados = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!tiposAceptados.includes(file.type)) {
      setOcrFase({ fase: 'error', mensaje: 'Formato no válido. Use JPG, PNG o PDF.' });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setOcrFase({ fase: 'error', mensaje: `El archivo supera ${MAX_MB}MB.` });
      return;
    }

    setOcrFile(file);
    setOcrFase({ fase: 'procesando', label: 'Preparando…', progreso: 0 });

    try {
      // ── PASO 1: renderizar PDF si aplica ────────────────────────────
      let imagenFuente: File | Blob = file;
      if (file.type === 'application/pdf') {
        setOcrFase({ fase: 'procesando', label: 'Procesando PDF…', progreso: 5 });
        imagenFuente = await pdfToBlob(file);
      }

      // ── PASO 2: comprimir imagen (Canvas → WebP/JPEG, max 1280px) ───
      setOcrFase({ fase: 'procesando', label: 'Comprimiendo imagen…', progreso: 12 });
      const comprimida = await comprimirImagen(imagenFuente);
      setArchivoComprimido(comprimida.blob);

      // ── Cheque: solo adjuntar imagen, sin OCR ───────────────────────
      if (tipoPago === 'Cheque') {
        const previewUrl = URL.createObjectURL(comprimida.blob);
        setOcrFase({
          fase: 'listo',
          resultado: { detectados: [] },
          previewUrl,
          fileName: file.name,
          originalKB: comprimida.originalKB,
          compressedKB: comprimida.finalKB,
          formato: comprimida.formato,
        });
        return;
      }

      // ── PASO 3: OCR (solo Transferencia) ───────────────────────────
      const texto = await runOCR(comprimida.blob, (label, progreso) => {
        setOcrFase({ fase: 'procesando', label, progreso: 20 + Math.round(progreso * 0.8) });
      });

      // ── PASO 4: parsear, auto-fill y detectar banco ─────────────────
      const resultado = parsearTexto(texto);
      const previewUrl = URL.createObjectURL(comprimida.blob);

      setOcrFase({
        fase: 'listo',
        resultado,
        previewUrl,
        fileName: file.name,
        originalKB: comprimida.originalKB,
        compressedKB: comprimida.finalKB,
        formato: comprimida.formato,
      });

      const filled = new Set<'monto' | 'referencia' | 'fecha'>();
      if (resultado.monto) {
        setMonto(String(Math.round(resultado.monto)));
        filled.add('monto');
      }
      if (resultado.referencia) {
        setRef(resultado.referencia);
        filled.add('referencia');
      }
      if (resultado.fecha) {
        setFecha(resultado.fecha);
        filled.add('fecha');
      }
      setOcrFilled(filled);

      // Auto-seleccionar banco si se detectó en el texto y aún no hay uno elegido
      if (!banco) {
        const bancoDetectado = detectarBanco(texto);
        if (bancoDetectado) setBanco(bancoDetectado);
      }
    } catch (err) {
      console.error('[OCR/Compresión]', err);
      setOcrFase({
        fase: 'error',
        mensaje: 'No se pudo procesar el archivo. Se adjuntará sin OCR.',
      });
    }
  }

  function quitarArchivo() {
    if (ocrFase.fase === 'listo') URL.revokeObjectURL(ocrFase.previewUrl);
    setOcrFase({ fase: 'idle' });
    setOcrFile(null);
    setArchivoComprimido(null);
    setOcrFilled(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function limpiarCampoOCR(campo: 'monto' | 'referencia' | 'fecha') {
    setOcrFilled((prev) => {
      const s = new Set(prev);
      s.delete(campo);
      return s;
    });
    if (campo === 'monto') setMonto('');
    if (campo === 'referencia') setRef('');
    if (campo === 'fecha') setFecha(hoyISO());
  }

  // ── Drag & Drop ─────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  }
  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) procesarArchivo(file);
  }

  // ── Facturas ────────────────────────────────────────────────────
  const toggleFactura = useCallback((f: Factura) => {
    setSeleccion((prev) => {
      const next = new Map(prev);
      if (next.has(f.id)) {
        next.delete(f.id);
      } else {
        next.set(f.id, {
          factura_id: f.id,
          documento: f.documento,
          saldo_max: f.saldo ?? 0,
          monto_aplicado: f.saldo ?? 0,
        });
      }
      return next;
    });
  }, []);

  const cambiarMontoAplicado = useCallback((fid: number, valor: string) => {
    const num = parseFloat(valor.replace(/[^0-9.]/g, '')) || 0;
    setSeleccion((prev) => {
      const next = new Map(prev);
      const item = next.get(fid);
      if (!item) return prev;
      next.set(fid, { ...item, monto_aplicado: num });
      return next;
    });
  }, []);

  function toggleTodas() {
    if (seleccion.size === facturasConSaldo.length) {
      setSeleccion(new Map());
    } else {
      const next = new Map<number, FacturaSeleccionada>();
      facturasConSaldo.forEach((f) => {
        next.set(f.id, {
          factura_id: f.id,
          documento: f.documento,
          saldo_max: f.saldo ?? 0,
          monto_aplicado: f.saldo ?? 0,
        });
      });
      setSeleccion(next);
    }
  }

  // ── Submit ───────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tipoPago) {
      setError('Seleccione el tipo de pago');
      return;
    }
    if (!banco) {
      setError('Seleccione el banco de origen');
      return;
    }
    if (!ref.trim()) {
      setError(
        tipoPago === 'Cheque' ? 'Ingrese el número de cheque' : 'Ingrese el número de referencia',
      );
      return;
    }
    if (!fecha) {
      setError('Ingrese la fecha de transferencia');
      return;
    }
    if (!montoNum || montoNum <= 0) {
      setError('Ingrese un monto válido');
      return;
    }
    if (seleccion.size === 0) {
      setError('Seleccione al menos una factura');
      return;
    }
    if (!cuadra) {
      setError(`Suma facturas (${fmtCRC(totalSeleccion)}) ≠ monto (${fmtCRC(montoNum)})`);
      return;
    }

    setSubmitting(true);
    try {
      // ── 1. Upload comprobante comprimido a S3 (URL prefirmada) ─────
      let urlComprobante: string | undefined;
      if (archivoComprimido && ocrFile) {
        // Usar la extensión del formato comprimido (webp / jpg)
        const ext = ocrFase.fase === 'listo' ? ocrFase.formato : 'jpg';
        // El backend arma la key `${clienteCod}/${Date.now()}_${baseName}.${ext}` y la guarda en
        // url_comprobante (el bucket es privado: la lectura pide una URL prefirmada GET).
        urlComprobante = await subirComprobante(
          clienteCod,
          archivoComprimido,
          ocrFile.name,
          ext === 'webp' ? 'image/webp' : 'image/jpeg',
        );
        // Upload no es bloqueante — si falla, continuamos sin URL
      }

      // ── 2. POST al API ────────────────────────────────────────────
      try {
        await reportarPago({
          cliente_cod: clienteCod,
          contribuyente,
          banco_origen: banco,
          referencia: ref.trim(),
          monto_transferido: montoNum,
          fecha_transferencia: fecha,
          detalles: Array.from(seleccion.values()).map((d) => ({
            factura_id: d.factura_id,
            documento: d.documento,
            monto_aplicado: d.monto_aplicado,
          })),
          url_comprobante: urlComprobante,
          notas: notas.trim() || undefined,
        });
      } catch (e) {
        const err = e as ApiError;
        if (err.isNetworkError || !err.status) throw err;
        setError(err.message ?? 'Error desconocido');
        return;
      }

      onToast('✓ Pago reportado — el coordinador recibirá una notificación');
      onSuccess();
    } catch {
      setError('Error de conexión. Intente de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Empty state: sin facturas vencidas ───────────────────────────
  if (facturasConSaldo.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 flex flex-col items-center gap-3 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#f0fdf4' }}
        >
          <CheckCircle2 size={24} className="text-green-500" />
        </div>
        <p className="text-[14px] font-semibold text-gray-700">Sin facturas vencidas</p>
        <p className="text-[12px] text-gray-400 max-w-xs">
          Este cliente no tiene facturas vencidas pendientes de pago.
        </p>
      </div>
    );
  }

  // ── Colores semáforo monto ────────────────────────────────────────
  const montoSemaforoBorder = cuadra
    ? '#86efac'
    : seleccion.size > 0 && montoNum > 0
      ? '#fde68a'
      : ocrFilled.has('monto')
        ? '#bae6fd'
        : '#e2e8f0';

  const montoSemaforoShadow = cuadra
    ? '0 0 0 3px rgba(134,239,172,0.25)'
    : seleccion.size > 0 && montoNum > 0
      ? '0 0 0 3px rgba(253,230,138,0.25)'
      : 'none';

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Input oculto para seleccionar archivo */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={onFileInput}
      />

      <div className="grid gap-4" style={{ gridTemplateColumns: '5fr 7fr' }}>
        {/* ══════════════════════════════════════════════════════════
            COLUMNA IZQUIERDA — Facturas vencidas
        ══════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {/* Header compacto */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b border-gray-100"
            style={{ backgroundColor: '#fafafa' }}
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleTodas}
                className="text-gray-400 hover:text-[#009ee3] transition"
              >
                {seleccion.size === facturasConSaldo.length ? (
                  <CheckSquare size={18} className="text-[#009ee3]" />
                ) : (
                  <Square size={18} />
                )}
              </button>
              <span className="text-[11px] font-bold text-gray-700">Facturas vencidas</span>
              <span
                className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
              >
                {facturasConSaldo.length}
              </span>
            </div>
            <span className="text-[10px] text-gray-400">{seleccion.size} sel.</span>
          </div>

          {/* Filas compactas */}
          <div
            className="flex-1 overflow-y-auto divide-y divide-gray-50/80"
            style={{ maxHeight: '420px' }}
          >
            {facturasConSaldo.map((f) => {
              const checked = seleccion.has(f.id);
              const item = seleccion.get(f.id);
              const dias = diasVencida(f.fecha_vencimiento);
              const clr = colorDias(dias);

              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors"
                  style={{ backgroundColor: checked ? '#f0f9ff' : undefined }}
                  onClick={() => toggleFactura(f)}
                >
                  {/* Checkbox */}
                  {checked ? (
                    <CheckSquare size={18} className="flex-shrink-0 text-[#009ee3]" />
                  ) : (
                    <Square size={18} className="flex-shrink-0 text-gray-300" />
                  )}

                  {/* Documento + fecha vencimiento */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 leading-none">
                      <span className="text-[13px] font-bold text-gray-800 truncate">
                        {f.documento}
                      </span>
                      <span
                        className="text-[8px] font-black rounded-full px-1 py-0.5 flex-shrink-0"
                        style={{ backgroundColor: clr.bg, color: clr.text }}
                      >
                        {dias}d
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-none">
                      {fmtFecha(f.fecha_vencimiento)}
                    </p>
                  </div>

                  {/* Monto o input editable */}
                  <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!checked ? (
                      <span className="text-[13px] font-bold text-gray-600">{fmtCRC(f.saldo)}</span>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <input
                          type="number"
                          value={item?.monto_aplicado ?? f.saldo}
                          min={1}
                          max={f.saldo ?? undefined}
                          step={1}
                          onChange={(e) => cambiarMontoAplicado(f.id, e.target.value)}
                          className="border border-[#009ee3] rounded-lg text-[13px] font-semibold text-gray-800 text-right focus:outline-none focus:ring-1 focus:ring-[#009ee3]/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          style={{ width: '100px', padding: '5px 10px 5px 6px' }}
                        />
                        <span className="text-[10px] text-gray-500">máx {fmtCRC(f.saldo)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Totalizador con semáforo ────────────────────────── */}
          {(() => {
            const hay = seleccion.size > 0;
            const bg = cuadra ? '#f0fdf4' : hay ? '#fffbeb' : '#fafafa';
            const bdr = cuadra ? '#bbf7d0' : hay ? '#fde68a' : '#f1f5f9';
            const clr = cuadra ? '#15803d' : hay ? '#a16207' : '#94a3b8';
            return (
              <div
                className="px-3 py-2.5 border-t"
                style={{ backgroundColor: bg, borderColor: bdr }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Suma seleccionada
                  </span>
                  <span className="text-[14px] font-black tabular-nums" style={{ color: clr }}>
                    {fmtCRC(totalSeleccion)}
                  </span>
                </div>
                {hay && montoNum > 0 && !cuadra && (
                  <p
                    className="text-[9px] mt-1 font-semibold flex items-center gap-1"
                    style={{ color: '#a16207' }}
                  >
                    <AlertTriangle size={9} />
                    Diferencia: {fmtCRC(diferencia)}
                  </p>
                )}
                {cuadra && (
                  <p className="text-[9px] mt-1 font-semibold text-green-600 flex items-center gap-1">
                    <CheckCircle2 size={9} /> Montos coinciden
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* ══════════════════════════════════════════════════════════
            COLUMNA DERECHA — Datos del pago
        ══════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
          {/* Header */}
          <div
            className="px-4 py-2.5 border-b border-gray-100"
            style={{ backgroundColor: '#fafafa' }}
          >
            <h3 className="text-[12px] font-bold text-gray-700">Datos del pago</h3>
          </div>

          <div className="flex-1 p-4 space-y-3.5">
            {/* ── TIPO DE PAGO — segmented control ─────────────── */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Tipo de pago<span className="text-red-400 ml-0.5">*</span>
              </label>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {TIPOS_PAGO.map((t) => {
                  const active = tipoPago === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTipoPago(t);
                        quitarArchivo();
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-bold transition-all"
                      style={{
                        backgroundColor: active ? '#009ee3' : '#f8fafc',
                        color: active ? 'white' : '#64748b',
                        borderRight: t === 'Transferencia' ? '1px solid #e2e8f0' : undefined,
                      }}
                    >
                      {t === 'Transferencia' ? '⚡' : '🎫'} {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── DROPZONE ────────────────────────────────────── */}

            {/* Estado: idle — zona de arrastre */}
            {ocrFase.fase === 'idle' && (
              <div
                ref={dropRef}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all"
                style={{
                  padding: '16px',
                  borderColor: dragOver ? '#009ee3' : '#e2e8f0',
                  backgroundColor: dragOver ? '#f0f9ff' : '#fafafa',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ backgroundColor: dragOver ? '#e0f2fe' : '#f1f5f9' }}
                >
                  <Upload size={14} style={{ color: dragOver ? '#009ee3' : '#94a3b8' }} />
                </div>
                <p
                  className="text-[11px] font-semibold text-center"
                  style={{ color: dragOver ? '#009ee3' : '#64748b' }}
                >
                  {tipoPago === 'Cheque'
                    ? 'Adjuntar foto del cheque (respaldo)'
                    : 'Arrastre el comprobante aquí'}
                </p>
                <p className="text-[10px] text-gray-400">JPG · PNG · PDF — máx {MAX_MB}MB</p>
                {tipoPago !== 'Cheque' && (
                  <span
                    className="text-[9px] font-bold rounded-full px-2 py-0.5 flex items-center gap-1 mt-0.5"
                    style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
                  >
                    <Sparkles size={8} /> OCR activo — auto-completa el formulario
                  </span>
                )}
                {tipoPago === 'Cheque' && (
                  <span
                    className="text-[9px] font-bold rounded-full px-2 py-0.5 mt-0.5"
                    style={{ backgroundColor: '#fef9c3', color: '#a16207' }}
                  >
                    Solo respaldo — digitación manual
                  </span>
                )}
              </div>
            )}

            {/* Estado: procesando */}
            {ocrFase.fase === 'procesando' && (
              <div
                className="rounded-xl border border-blue-100 flex flex-col items-center gap-2 py-4"
                style={{ backgroundColor: '#f0f9ff' }}
              >
                <Loader2 size={20} className="text-[#009ee3] animate-spin" />
                <div className="text-center">
                  <p className="text-[12px] font-bold text-[#0369a1]">Procesando comprobante…</p>
                  <p className="text-[10px] text-blue-400 mt-0.5">{ocrFase.label}</p>
                </div>
                {/* Barra de progreso */}
                <div className="w-36 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(4, ocrFase.progreso)}%`,
                      backgroundColor: '#009ee3',
                    }}
                  />
                </div>
                <p className="text-[10px] font-medium text-blue-400">{ocrFase.progreso}%</p>
              </div>
            )}

            {/* Estado: listo — miniatura + resumen OCR */}
            {ocrFase.fase === 'listo' && (
              <div
                className="rounded-xl border border-green-200 overflow-hidden"
                style={{ backgroundColor: '#f0fdf4' }}
              >
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  {/* Miniatura del comprobante */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-green-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ocrFase.previewUrl}
                      alt="comprobante"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-green-800 truncate">
                      {ocrFase.fileName}
                    </p>
                    {/* OCR detectados */}
                    <p className="text-[10px] text-green-600 mt-0.5 flex items-center gap-1">
                      <Sparkles size={9} />
                      {ocrFase.resultado.detectados.length > 0
                        ? `Detectado: ${ocrFase.resultado.detectados
                            .map(
                              (d) =>
                                ({ monto: 'Monto', referencia: 'Referencia', fecha: 'Fecha' })[d],
                            )
                            .join(', ')}`
                        : 'Sin datos detectados — adjunto igualmente'}
                    </p>
                    {/* Stats de compresión */}
                    {(() => {
                      const ahorroPct =
                        ocrFase.originalKB > 0
                          ? Math.round((1 - ocrFase.compressedKB / ocrFase.originalKB) * 100)
                          : 0;
                      const bajo300 = ocrFase.compressedKB < 300;
                      return (
                        <p
                          className="text-[9px] mt-1 font-semibold flex items-center gap-1"
                          style={{ color: bajo300 ? '#15803d' : '#a16207' }}
                        >
                          <span>📦</span>
                          {ocrFase.originalKB} KB → {ocrFase.compressedKB} KB
                          {' · '}
                          {ocrFase.formato.toUpperCase()}
                          {ahorroPct > 0 && ` · −${ahorroPct}%`}
                          {bajo300 ? (
                            <span className="ml-0.5 font-black text-green-700">✓</span>
                          ) : (
                            <span className="ml-0.5" style={{ color: '#a16207' }}>
                              ⚠ &gt;300KB
                            </span>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={quitarArchivo}
                    className="flex-shrink-0 text-green-400 hover:text-green-700 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Estado: error en OCR */}
            {ocrFase.fase === 'error' && (
              <div
                className="rounded-xl border border-red-200 px-3 py-2.5 flex items-start gap-2"
                style={{ backgroundColor: '#fff5f5' }}
              >
                <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="flex-1 text-[11px] font-semibold text-red-700 leading-snug">
                  {ocrFase.mensaje}
                </p>
                <button
                  type="button"
                  onClick={quitarArchivo}
                  className="flex-shrink-0 text-red-300 hover:text-red-600 transition"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* ── GRID 2×2: [Banco][Referencia] / [Fecha][Monto] ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Fila 1 — Col izquierda: Banco Origen */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Banco origen<span className="text-red-400 ml-0.5">*</span>
                </label>
                <div className="relative">
                  <Landmark
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <select
                    value={banco}
                    onChange={(e) => setBanco(e.target.value as BancoValue)}
                    className="w-full border border-gray-200 rounded-xl text-[12px] text-gray-800 focus:outline-none focus:border-[#009ee3] transition appearance-none"
                    style={{ padding: '8px 24px 8px 28px', backgroundColor: 'white' }}
                  >
                    <option value="" disabled>
                      Banco…
                    </option>
                    {BANCOS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>
              </div>

              {/* Fila 1 — Col derecha: Referencia / N° cheque */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  {tipoPago === 'Cheque' ? 'N° cheque' : 'Referencia'}
                  <span className="text-red-400">*</span>
                  {ocrFilled.has('referencia') && (
                    <OcrBadge onClear={() => limpiarCampoOCR('referencia')} />
                  )}
                </label>
                <div className="relative">
                  <Hash
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={ref}
                    onChange={(e) => {
                      setRef(e.target.value);
                      setOcrFilled((p) => {
                        const s = new Set(p);
                        s.delete('referencia');
                        return s;
                      });
                    }}
                    placeholder="123456789"
                    className="w-full border rounded-xl text-[12px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#009ee3] transition"
                    style={{
                      padding: '8px 8px 8px 24px',
                      borderColor: ocrFilled.has('referencia') ? '#bae6fd' : '#e2e8f0',
                    }}
                  />
                </div>
              </div>

              {/* Fila 2 — Col izquierda: Fecha */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Fecha<span className="text-red-400">*</span>
                  {ocrFilled.has('fecha') && <OcrBadge onClear={() => limpiarCampoOCR('fecha')} />}
                </label>
                <div className="relative">
                  <Calendar
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      setOcrFilled((p) => {
                        const s = new Set(p);
                        s.delete('fecha');
                        return s;
                      });
                    }}
                    className="w-full border rounded-xl text-[12px] text-gray-800 focus:outline-none focus:border-[#009ee3] transition"
                    style={{
                      padding: '8px 6px 8px 24px',
                      borderColor: ocrFilled.has('fecha') ? '#bae6fd' : '#e2e8f0',
                    }}
                  />
                </div>
              </div>

              {/* Fila 2 — Col derecha: Monto transferido */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Monto (CRC)<span className="text-red-400">*</span>
                  {ocrFilled.has('monto') && <OcrBadge onClear={() => limpiarCampoOCR('monto')} />}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[13px] font-bold select-none">
                    ₡
                  </span>
                  <input
                    type="number"
                    value={monto}
                    onChange={(e) => {
                      setMonto(e.target.value);
                      setOcrFilled((p) => {
                        const s = new Set(p);
                        s.delete('monto');
                        return s;
                      });
                    }}
                    placeholder="0"
                    min={1}
                    step={1}
                    className="w-full border rounded-xl text-[12px] text-gray-800 placeholder-gray-300 focus:outline-none transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    style={{
                      padding: '8px 10px 8px 28px',
                      borderColor: montoSemaforoBorder,
                      boxShadow: montoSemaforoShadow,
                    }}
                  />
                </div>
                {montoNum > 0 && (
                  <p
                    className="mt-1 text-[10px] font-semibold truncate"
                    style={{
                      color: cuadra
                        ? '#15803d'
                        : seleccion.size > 0 && montoNum > 0
                          ? '#a16207'
                          : '#94a3b8',
                    }}
                  >
                    {fmtCRC(montoNum)}
                    {cuadra && ' ✓'}
                    {!cuadra && seleccion.size > 0 && montoNum > 0 && ` Δ ${fmtCRC(diferencia)}`}
                  </p>
                )}
              </div>
            </div>

            {/* ── NOTAS ────────────────────────────────────────────── */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Notas{' '}
                <span className="font-normal normal-case tracking-normal text-gray-400">
                  (opcional)
                </span>
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones, acuerdo previo, etc."
                rows={2}
                className="w-full border border-gray-200 rounded-xl text-[12px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#009ee3] transition resize-none"
                style={{ padding: '8px 12px' }}
              />
            </div>

            {/* Error inline */}
            {error && (
              <div
                className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] font-semibold"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
              >
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* ── BOTÓN SUBMIT — semáforo verde cuando cuadra ──────── */}
          <div className="px-4 pb-4 pt-1">
            <button
              type="submit"
              disabled={
                submitting || !cuadra || !tipoPago || !banco || !ref.trim() || !fecha || !montoNum
              }
              className="w-full flex items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white transition-all"
              style={{
                padding: '11px 16px',
                backgroundColor: cuadra ? '#22c55e' : '#009ee3',
                opacity:
                  submitting || !cuadra || !tipoPago || !banco || !ref.trim() || !fecha || !montoNum
                    ? 0.45
                    : 1,
                cursor:
                  submitting || !cuadra || !tipoPago || !banco || !ref.trim() || !fecha || !montoNum
                    ? 'not-allowed'
                    : 'pointer',
                boxShadow: cuadra ? '0 4px 14px rgba(34,197,94,0.40)' : 'none',
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Reportar pago
                </>
              )}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-gray-400">
              El coordinador recibirá una notificación ·{' '}
              {archivoComprimido && ocrFase.fase === 'listo' ? (
                <span className="text-green-600 font-semibold">
                  Comprobante {ocrFase.formato.toUpperCase()} · {ocrFase.compressedKB} KB
                </span>
              ) : (
                <span>Sin comprobante</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
