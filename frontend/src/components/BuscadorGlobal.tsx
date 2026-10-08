'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, Tag, LayoutGrid } from 'lucide-react';
import { REPORTES } from '@/lib/reportes/registry';
import type { ClienteResultado, FacturaResultado, MarcaResultado } from '@/views/clientes/types';
import { useBuscadorGlobalController } from '@/views/clientes/hooks/use-buscador-global-controller';

interface ReporteResultado {
  tipo: 'reporte';
  id: string;
  titulo: string;
  descripcion: string;
  href: string;
}

type ResultadoItem = ClienteResultado | FacturaResultado | MarcaResultado | ReporteResultado;

interface Props {
  rol: string;
}

function iniciales(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function fmtCRCcorto(n: number): string {
  return (
    '₡' +
    Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  );
}

export default function BuscadorGlobal({ rol }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { clientes, facturas, marcas, loading, buscar, limpiar } = useBuscadorGlobalController();
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Índice Reportes: búsqueda instantánea local (catálogo estático, sin red) ──
  const q = query.trim().toLowerCase();
  const reportes: ReporteResultado[] = useMemo(() => {
    if (q.length < 2) return [];
    return REPORTES.filter(
      (r) => r.disponible && r.roles.includes(rol as 'COORDINADOR' | 'ANALISTA'),
    )
      .filter((r) => r.titulo.toLowerCase().includes(q) || r.descripcion.toLowerCase().includes(q))
      .slice(0, 5)
      .map((r) => ({
        tipo: 'reporte',
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion,
        href: r.href,
      }));
  }, [q, rol]);

  const flat: ResultadoItem[] = [...clientes, ...facturas, ...marcas, ...reportes];
  const hayResultados = flat.length > 0;

  // ── ⌘K / Ctrl+K ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Cerrar al hacer click fuera ───────────────────────────────────
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function openSearch() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function close() {
    setOpen(false);
    setQuery('');
    limpiar();
    setActiveIdx(-1);
  }

  // ── Búsqueda con debounce 280ms (clientes/facturas/marcas van al API vía
  // useBuscadorGlobalController; reportes se calcula localmente arriba, sin red) ──
  const doSearch = buscar;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setActiveIdx(-1);
    doSearch(val);
  }

  function navigate(item: ResultadoItem) {
    switch (item.tipo) {
      case 'cliente':
        router.push(`/clientes/${encodeURIComponent(item.cliente_cod)}`);
        break;
      case 'factura':
        router.push(`/clientes/${encodeURIComponent(item.cliente_cod)}?tab=estado-de-cuenta`);
        break;
      case 'marca':
        router.push(`/centro-recursos?marca=${encodeURIComponent(item.id)}`);
        break;
      case 'reporte':
        router.push(item.href);
        break;
    }
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'Escape':
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (activeIdx >= 0 && flat[activeIdx]) navigate(flat[activeIdx]);
        break;
    }
  }

  // Offsets para mapear cada sección al índice global de flat[]
  const offFacturas = clientes.length;
  const offMarcas = offFacturas + facturas.length;
  const offReportes = offMarcas + marcas.length;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* ── Trigger: pill visible en desktop ─────────────────────── */}
      <button
        onClick={openSearch}
        className="hidden sm:flex items-center rounded-lg"
        style={{
          height: '32px',
          padding: '0 10px',
          width: '250px',
          background: '#f8fafc',
          border: '0.5px solid #E2E8F0',
          cursor: 'text',
          justifyContent: 'space-between',
        }}
        aria-label="Buscar cliente, factura, marca o reporte (⌘K)"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Search size={13} color="#94a3b8" />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Buscar...</span>
        </span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 500,
            background: '#e8edf2',
            borderRadius: '4px',
            padding: '2px 6px',
            color: '#94a3b8',
            letterSpacing: '0.02em',
            border: '0.5px solid #d1d9e0',
          }}
        >
          ⌘K
        </span>
      </button>

      {/* ── Trigger: solo ícono en móvil ─────────────────────────── */}
      <button
        onClick={openSearch}
        className="flex sm:hidden items-center justify-center rounded-lg"
        style={{ width: '32px', height: '32px', color: '#64748b', border: '0.5px solid #E2E8F0' }}
        aria-label="Buscar"
      >
        <Search size={16} />
      </button>

      {/* ── Panel de búsqueda ─────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '38px',
            zIndex: 300,
            width: '400px',
          }}
        >
          <div
            style={{
              background: 'white',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              overflow: 'hidden',
            }}
          >
            {/* Input ────────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderBottom:
                  hayResultados || loading || q.length >= 2 ? '1px solid #f1f5f9' : 'none',
              }}
            >
              {loading ? (
                <div
                  style={{
                    width: '15px',
                    height: '15px',
                    flexShrink: 0,
                    borderRadius: '50%',
                    border: '2px solid #e2e8f0',
                    borderTopColor: '#009ee3',
                    animation: 'buscador-spin 0.6s linear infinite',
                  }}
                />
              ) : (
                <Search size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Cliente, factura, marca o reporte..."
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  color: '#1e293b',
                  background: 'transparent',
                }}
              />
              <button
                onClick={close}
                style={{
                  padding: '2px',
                  color: '#94a3b8',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label="Cerrar búsqueda"
              >
                <X size={14} />
              </button>
            </div>

            {/* Resultados ────────────────────────────────────────── */}
            {hayResultados && (
              <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                {clientes.length > 0 && (
                  <CategoriaResultados titulo="🏢 CLIENTES">
                    {clientes.map((c, i) => (
                      <FilaResultado
                        key={c.cliente_cod}
                        activo={i === activeIdx}
                        onClick={() => navigate(c)}
                        onMouseEnter={() => setActiveIdx(i)}
                        icono={
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              flexShrink: 0,
                              background: '#EEF2F7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#64748b',
                            }}
                          >
                            {c.vendedor_nombre ? (
                              iniciales(c.vendedor_nombre)
                            ) : (
                              <Search size={12} color="#94a3b8" />
                            )}
                          </div>
                        }
                        titulo={c.cliente_nombre}
                        subtitulo={`${c.cliente_cod}${c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}`}
                        accion="Ir a Ficha 360"
                      />
                    ))}
                  </CategoriaResultados>
                )}

                {facturas.length > 0 && (
                  <CategoriaResultados titulo="📄 FACTURAS">
                    {facturas.map((f, i) => (
                      <FilaResultado
                        key={f.documento}
                        activo={offFacturas + i === activeIdx}
                        onClick={() => navigate(f)}
                        onMouseEnter={() => setActiveIdx(offFacturas + i)}
                        icono={
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              flexShrink: 0,
                              background: '#fef3c7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <FileText size={14} color="#b45309" />
                          </div>
                        }
                        titulo={f.cliente_nombre}
                        subtitulo={`#${f.documento.slice(-6)} · saldo ${fmtCRCcorto(f.saldo)}`}
                        accion="Ver Estado de Cuenta"
                      />
                    ))}
                  </CategoriaResultados>
                )}

                {marcas.length > 0 && (
                  <CategoriaResultados titulo="🏷️ MARCAS">
                    {marcas.map((m, i) => (
                      <FilaResultado
                        key={m.id}
                        activo={offMarcas + i === activeIdx}
                        onClick={() => navigate(m)}
                        onMouseEnter={() => setActiveIdx(offMarcas + i)}
                        icono={
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              flexShrink: 0,
                              background: '#e0f2fe',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Tag size={14} color="#0369a1" />
                          </div>
                        }
                        titulo={m.nombre}
                        subtitulo={`Comprador: ${m.comprador_nombre}`}
                        accion="Ver en Centro de Recursos"
                      />
                    ))}
                  </CategoriaResultados>
                )}

                {reportes.length > 0 && (
                  <CategoriaResultados titulo="📊 REPORTES">
                    {reportes.map((r, i) => (
                      <FilaResultado
                        key={r.id}
                        activo={offReportes + i === activeIdx}
                        onClick={() => navigate(r)}
                        onMouseEnter={() => setActiveIdx(offReportes + i)}
                        icono={
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              flexShrink: 0,
                              background: '#f0fdf4',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <LayoutGrid size={14} color="#16a34a" />
                          </div>
                        }
                        titulo={r.titulo}
                        subtitulo={r.descripcion}
                        accion="Abrir reporte"
                      />
                    ))}
                  </CategoriaResultados>
                )}
              </div>
            )}

            {/* Sin resultados ────────────────────────────────────── */}
            {!loading && q.length >= 2 && !hayResultados && (
              <div style={{ padding: '18px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  Sin resultados para &quot;{query}&quot;
                </p>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>
                  Probá con otro nombre, código, factura o marca
                </p>
              </div>
            )}

            {/* Hint ──────────────────────────────────────────────── */}
            {q.length < 2 && (
              <div
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Mínimo 2 caracteres</span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                  ↑↓ navegar · ↵ abrir · Esc cerrar
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes buscador-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sub-componentes de presentación ──────────────────────────────────────

function CategoriaResultados({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          padding: '8px 14px 4px',
          fontSize: '10px',
          fontWeight: 700,
          color: '#94a3b8',
          letterSpacing: '0.04em',
        }}
      >
        {titulo}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{children}</ul>
    </div>
  );
}

function FilaResultado({
  activo,
  onClick,
  onMouseEnter,
  icono,
  titulo,
  subtitulo,
  accion,
}: {
  activo: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  icono: React.ReactNode;
  titulo: string;
  subtitulo: string;
  accion: string;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 14px',
          textAlign: 'left',
          border: 'none',
          cursor: 'pointer',
          background: activo ? '#f0f9ff' : 'transparent',
          transition: 'background 0.1s',
        }}
      >
        {icono}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#1e293b',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {titulo}
          </p>
          <p
            style={{
              fontSize: '11px',
              color: '#64748b',
              margin: '1px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitulo}
          </p>
        </div>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#009ee3',
            background: '#e0f2fe',
            borderRadius: '4px',
            padding: '2px 7px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {accion} →
        </span>
      </button>
    </li>
  );
}
