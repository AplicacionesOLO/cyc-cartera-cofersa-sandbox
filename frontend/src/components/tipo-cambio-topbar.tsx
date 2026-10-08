'use client';

import { useEffect, useRef, useState } from 'react';
import { DollarSign, ArrowDownCircle, ArrowUpCircle, ChevronDown } from 'lucide-react';
import { fmtCRC2 } from '@/lib/utils/formato';
import { useTipoCambioController } from '@/views/notificaciones/hooks/use-tipo-cambio-controller';

export default function TipoCambioTopbar() {
  const { data } = useTipoCambioController();
  const [open, setOpen] = useState(false);
  const [colones, setColones] = useState('');
  const [dolares, setDolares] = useState('');
  const [resultUSD, setResultUSD] = useState(''); // resultado ₡ → $
  const [resultCRC, setResultCRC] = useState(''); // resultado $ → ₡
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const sinDatos = !data || data.error || !data.compra || !data.venta;

  function handleColones(val: string) {
    const clean = val.replace(/[^0-9.,]/g, '');
    setColones(clean);
    setDolares('');
    setResultCRC('');
    if (!sinDatos && clean !== '') {
      const n = parseFloat(clean.replace(',', '.'));
      setResultUSD(isNaN(n) ? '' : '$ ' + (n / data!.venta!).toFixed(2));
    } else {
      setResultUSD('');
    }
  }

  function handleDolares(val: string) {
    const clean = val.replace(/[^0-9.,]/g, '');
    setDolares(clean);
    setColones('');
    setResultUSD('');
    if (!sinDatos && clean !== '') {
      const n = parseFloat(clean.replace(',', '.'));
      setResultCRC(isNaN(n) ? '' : fmtCRC2(n * data!.compra!));
    } else {
      setResultCRC('');
    }
  }

  const fechaMostrar =
    !sinDatos && data!.fecha ? data!.fecha.charAt(0).toUpperCase() + data!.fecha.slice(1) : '';

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors hover:bg-gray-50"
        style={{ border: '1px solid #E2E8F0' }}
      >
        <DollarSign size={13} className="text-gray-400 flex-shrink-0" />
        {sinDatos ? (
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
            Tipo de cambio
          </span>
        ) : (
          <span
            className="tabular-nums"
            style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}
          >
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>Compra</span>{' '}
            {fmtCRC2(data!.compra!)}
            <span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>Venta</span> {fmtCRC2(data!.venta!)}
          </span>
        )}
        <ChevronDown
          size={12}
          className="text-gray-400 flex-shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute right-0 mt-2 bg-white rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: '260px', border: '1px solid #e2e8f0', zIndex: 100, top: '100%' }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}
          >
            <div className="flex items-center gap-2">
              <DollarSign size={13} className="text-gray-400" />
              <span className="text-[12px] font-bold text-gray-700">Tipo de Cambio</span>
            </div>
            <div
              className="flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{ background: sinDatos ? '#f1f5f9' : '#dcfce7' }}
            >
              <div
                className="w-1 h-1 rounded-full flex-shrink-0"
                style={{ background: sinDatos ? '#cbd5e1' : '#16a34a' }}
              />
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: sinDatos ? '#94a3b8' : '#15803d',
                }}
              >
                BCCR
              </span>
            </div>
          </div>

          {/* Tasas */}
          <div className="px-4 pt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowDownCircle size={10} className="text-gray-300" />
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                  Compra
                </span>
              </div>
              <p className="tabular-nums font-bold text-gray-800" style={{ fontSize: '14px' }}>
                {sinDatos ? '—' : fmtCRC2(data!.compra!)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowUpCircle size={10} className="text-green-500" />
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                  Venta
                </span>
              </div>
              <p
                className="tabular-nums font-bold"
                style={{ fontSize: '14px', color: sinDatos ? '#1f2937' : '#16a34a' }}
              >
                {sinDatos ? '—' : fmtCRC2(data!.venta!)}
              </p>
            </div>
          </div>

          <div className="mx-4 my-3" style={{ height: '1px', background: '#f1f5f9' }} />

          {/* Convertidor */}
          <div className="px-4 flex flex-col gap-2">
            <div
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
            >
              <span className="text-[11px] text-gray-400 flex-shrink-0">₡</span>
              <input
                type="text"
                inputMode="decimal"
                value={colones}
                onChange={(e) => handleColones(e.target.value)}
                placeholder={sinDatos ? '—' : '0'}
                disabled={sinDatos}
                className="tabular-nums bg-transparent outline-none text-[12px] text-gray-700 w-full min-w-0"
              />
              {resultUSD && (
                <span
                  className="tabular-nums text-[11px] font-semibold flex-shrink-0"
                  style={{ color: '#16a34a' }}
                >
                  {resultUSD}
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
            >
              <span className="text-[11px] text-gray-400 flex-shrink-0">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={dolares}
                onChange={(e) => handleDolares(e.target.value)}
                placeholder={sinDatos ? '—' : '0'}
                disabled={sinDatos}
                className="tabular-nums bg-transparent outline-none text-[12px] text-gray-700 w-full min-w-0"
              />
              {resultCRC && (
                <span className="tabular-nums text-[11px] font-semibold text-gray-600 flex-shrink-0">
                  {resultCRC}
                </span>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 mt-1 text-center" style={{ borderTop: '1px solid #f1f5f9' }}>
            <span className="text-[10px] text-gray-400">
              {data === null ? 'Cargando...' : sinDatos ? 'No disponible' : fechaMostrar}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
