'use client';

import { FileText, FileSpreadsheet, Send, Loader2 } from 'lucide-react';

interface Props {
  filtros?: React.ReactNode; // controles a la izquierda de la toolbar
  kpis?: React.ReactNode; // strip de KPI cards
  children: React.ReactNode; // contenido principal (tabla/gráficos)
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onEnviar?: () => void;
  exportando?: boolean;
}

const BTN_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid #e2e8f0',
  background: 'white',
  color: '#374151',
  transition: 'all 0.1s',
  whiteSpace: 'nowrap',
};

export default function ReporteShell({
  filtros,
  kpis,
  children,
  onExportPDF,
  onExportExcel,
  onEnviar,
  exportando,
}: Props) {
  const hayAcciones = onExportPDF || onExportExcel || onEnviar;

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* Toolbar: filtros (izq) + acciones (der) */}
        {(filtros || hayAcciones) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">{filtros}</div>

            {hayAcciones && (
              <div className="flex items-center gap-2">
                {onExportPDF && (
                  <button
                    onClick={onExportPDF}
                    disabled={exportando}
                    style={{ ...BTN_BASE, opacity: exportando ? 0.5 : 1 }}
                    onMouseEnter={(e) => {
                      if (!exportando) e.currentTarget.style.borderColor = '#009ee3';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    {exportando ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <FileText size={13} />
                    )}{' '}
                    PDF
                  </button>
                )}
                {onExportExcel && (
                  <button
                    onClick={onExportExcel}
                    disabled={exportando}
                    style={{ ...BTN_BASE, opacity: exportando ? 0.5 : 1 }}
                    onMouseEnter={(e) => {
                      if (!exportando) e.currentTarget.style.borderColor = '#16a34a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    {exportando ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <FileSpreadsheet size={13} />
                    )}{' '}
                    Excel
                  </button>
                )}
                {onEnviar && (
                  <button
                    onClick={onEnviar}
                    disabled={exportando}
                    style={{
                      ...BTN_BASE,
                      background: '#009ee3',
                      color: 'white',
                      borderColor: '#009ee3',
                      opacity: exportando ? 0.5 : 1,
                    }}
                  >
                    <Send size={13} /> Enviar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* KPIs */}
        {kpis}

        {/* Contenido */}
        {children}
      </div>
    </div>
  );
}
