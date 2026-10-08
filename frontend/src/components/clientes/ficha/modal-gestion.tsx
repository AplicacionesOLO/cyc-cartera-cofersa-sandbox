'use client';

import { useState } from 'react';
import { useGestionRapidaController } from '@/views/gestiones/hooks/use-gestion-rapida-controller';
import { X, Send, CheckCircle2, Handshake } from 'lucide-react';

// ── Helper: formato monto CR (punto miles, coma decimal) ───────────────
function fmtMontoInput(raw: string): string {
  const clean = raw.replace(/[^0-9,]/g, '');
  const [intPart = '', decPart] = clean.split(',');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${intFmt},${decPart.slice(0, 2)}` : intFmt;
}

// ── Constantes ─────────────────────────────────────────────────────────
const TIPOS = ['LLAMADA', 'CORREO', 'WHATSAPP', 'VISITA'] as const;
const RESULTADOS = [
  'Promesa OK',
  'No contestó',
  'No ubicado',
  'Pagó',
  'Email enviado',
  'Pendiente',
  'Aceptó convenio',
  'Llamar más tarde',
] as const;
const NOTAS_RAPIDAS = [
  'No contestó, se dejó mensaje de voz',
  'Prometió pagar a fin de mes',
  'Solicitó estado de cuenta',
  'No ubicado, teléfono fuera de servicio',
  'Aceptó convenio de pago',
  'Referido a otra persona',
];

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  clienteCod: string;
  clienteNombre: string;
  contribuyente: string;
  analistaEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════
export default function ModalGestion({
  clienteCod,
  clienteNombre,
  contribuyente,
  analistaEmail,
  onClose,
  onSuccess,
}: Props) {
  const [tipo, setTipo] = useState<string>('LLAMADA');
  const [resultado, setResultado] = useState<string>('Pendiente');
  const [nota, setNota] = useState('');
  const [promesaFecha, setPromesaFecha] = useState('');
  const [promesaMonto, setPromesaMonto] = useState('');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState('');

  const esPromesa = resultado === 'Promesa OK';
  const { registrar } = useGestionRapidaController();

  // ── Fecha y hora actuales ──────────────────────────────────────────
  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function horaActual() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
  }

  // ── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nota.trim() && resultado === 'Pendiente') {
      setError('Agregá una nota o seleccioná un resultado distinto a Pendiente.');
      return;
    }
    if (esPromesa && !promesaFecha) {
      setError('Indicá la fecha de la promesa de pago.');
      return;
    }
    setLoading(true);
    setError('');

    const fecha = hoyISO();
    const hora = horaActual();

    // Gestión + (si es Promesa OK con fecha) promesa, en una sola transacción del API
    const errMsg = await registrar({
      cliente_cod: clienteCod,
      contribuyente,
      analista_email: analistaEmail,
      fecha,
      hora,
      tipo,
      resultado,
      nota,
      ...(esPromesa && promesaFecha ? { promesa_fecha: promesaFecha } : {}),
      ...(esPromesa && promesaMonto
        ? { promesa_monto: parseFloat(promesaMonto.replace(/\./g, '').replace(',', '.')) }
        : {}),
    });

    if (errMsg) {
      setError(errMsg);
      setLoading(false);
      return;
    }

    setOk(true);
    setLoading(false);
    setTimeout(() => {
      onSuccess();
    }, 1200);
  }

  // ── Éxito ──────────────────────────────────────────────────────────
  if (ok) {
    return (
      <Overlay onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-14 px-8 text-center">
          <CheckCircle2 size={40} className="text-green-500 mb-3" />
          <p className="text-[15px] font-bold text-gray-800">¡Gestión registrada!</p>
          <p className="text-[12px] text-gray-400 mt-1">Actualizando ficha...</p>
        </div>
      </Overlay>
    );
  }

  // ── Formulario ─────────────────────────────────────────────────────
  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid #e2e8f0' }}
      >
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Registrar gestión</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{clienteNombre}</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
          style={{ width: '32px', height: '32px', color: '#94a3b8' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Cuerpo */}
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700 font-semibold">
            {error}
          </div>
        )}

        {/* Tipo + Resultado */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              Tipo
            </label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
              {TIPOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              Resultado
            </label>
            <select
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              className={inputCls}
            >
              {RESULTADOS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bloque Promesa OK */}
        {esPromesa && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Handshake size={14} className="text-green-600" />
              <p className="text-[12px] font-bold text-green-700">Datos de la promesa de pago</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Fecha prometida *
                </label>
                <input
                  type="date"
                  value={promesaFecha}
                  onChange={(e) => setPromesaFecha(e.target.value)}
                  min={hoyISO()}
                  required={esPromesa}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Monto (₡)
                </label>
                <input
                  type="text"
                  value={promesaMonto}
                  onChange={(e) => setPromesaMonto(fmtMontoInput(e.target.value))}
                  placeholder="Ej: 756.974,50"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        )}

        {/* Nota */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
            Nota
          </label>
          {/* Chips rápidos */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {NOTAS_RAPIDAS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNota(n)}
                className="text-[11px] px-2.5 py-1 rounded-full border transition"
                style={
                  nota === n
                    ? { background: '#009ee3', color: 'white', borderColor: '#009ee3' }
                    : { background: 'white', color: '#64748b', borderColor: '#E2E8F0' }
                }
              >
                {n.length > 30 ? n.slice(0, 30) + '…' : n}
              </button>
            ))}
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder="O escribí tu nota aquí..."
            className={inputCls + ' resize-none'}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white transition disabled:opacity-60"
          style={{ backgroundColor: '#009ee3' }}
        >
          <Send size={14} />
          {loading ? 'Guardando...' : 'Registrar gestión'}
        </button>
      </form>
    </Overlay>
  );
}

// ── Overlay compartido ─────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}
