'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Gauge,
  BarChart3,
  TrendingDown,
  Send,
  Ban,
  CalendarClock,
  AlertTriangle,
  CalendarRange,
  Target,
  Briefcase,
  TrendingUp,
  Wallet,
  ShieldAlert,
  UserCog,
  Activity,
  CalendarCheck,
  FileText,
  FileSpreadsheet,
  Monitor,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { REPORTES, CATEGORIAS } from '@/lib/reportes/registry';
import type { CategoriaReporte, FormatoReporte, ReporteDef } from '@/types/reportes';

// ── Mapa de iconos (string → componente lucide) ──────────────────────────

const ICONOS: Record<
  string,
  React.ComponentType<{ size?: number; style?: React.CSSProperties }>
> = {
  LayoutDashboard,
  Users,
  Gauge,
  BarChart3,
  TrendingDown,
  Send,
  Ban,
  CalendarClock,
  AlertTriangle,
  CalendarRange,
  Target,
  Briefcase,
  TrendingUp,
  Wallet,
  ShieldAlert,
  UserCog,
  Activity,
  CalendarCheck,
};

function Icono({ nombre, size = 18, color }: { nombre: string; size?: number; color: string }) {
  const Cmp = ICONOS[nombre] ?? FileText;
  return <Cmp size={size} style={{ color }} />;
}

// ── Chips de formato ──────────────────────────────────────────────────────

const FORMATO_CFG: Record<FormatoReporte, { label: string; icon: React.ReactNode }> = {
  pantalla: { label: 'En pantalla', icon: <Monitor size={11} /> },
  pdf: { label: 'PDF', icon: <FileText size={11} /> },
  excel: { label: 'Excel', icon: <FileSpreadsheet size={11} /> },
};

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  rol: 'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';
}

export default function HubGrid({ rol }: Props) {
  const visibles = REPORTES.filter((r) => r.roles.includes(rol));

  // Agrupar por categoría, respetando el orden definido
  const categorias = (Object.keys(CATEGORIAS) as CategoriaReporte[])
    .filter((cat) => visibles.some((r) => r.categoria === cat))
    .sort((a, b) => CATEGORIAS[a].orden - CATEGORIAS[b].orden);

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-6">
        {categorias.map((cat) => {
          const meta = CATEGORIAS[cat];
          const items = visibles.filter((r) => r.categoria === cat);
          return (
            <section key={cat}>
              {/* Encabezado de categoría */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(0,59,92,0.07)' }}
                >
                  <Icono nombre={meta.icono} size={15} color="#003B5C" />
                </div>
                <div>
                  <h2 className="text-[13px] font-bold text-gray-800 leading-none">{meta.label}</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-none">
                    {meta.descripcion}
                  </p>
                </div>
              </div>

              {/* Tarjetas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((rep) => (
                  <TarjetaReporte key={rep.id} rep={rep} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ── Tarjeta individual ─────────────────────────────────────────────────────

function TarjetaReporte({ rep }: { rep: ReporteDef }) {
  const contenido = (
    <div
      className="bg-white rounded-xl border p-4 h-full flex flex-col transition-all"
      style={{
        borderColor: '#e2e8f0',
        opacity: rep.disponible ? 1 : 0.65,
        cursor: rep.disponible ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        if (rep.disponible) {
          e.currentTarget.style.borderColor = '#009ee3';
          e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,158,227,0.10)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e2e8f0';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(0,158,227,0.10)' }}
        >
          <Icono nombre={rep.icono} size={18} color="#009ee3" />
        </div>
        {rep.disponible ? (
          <ArrowRight size={15} className="text-gray-300 mt-1" />
        ) : (
          <span
            className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
            style={{ background: '#f1f5f9', color: '#94a3b8' }}
          >
            <Clock size={9} /> Próximamente
          </span>
        )}
      </div>

      <h3 className="text-[13px] font-bold text-gray-800 leading-tight mb-1">{rep.titulo}</h3>
      <p className="text-[11px] text-gray-500 leading-snug flex-1">{rep.descripcion}</p>

      {/* Chips de formato */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {rep.formatos.map((f) => (
          <span
            key={f}
            className="flex items-center gap-1 text-[10px] font-semibold rounded-md px-1.5 py-0.5"
            style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #f1f5f9' }}
          >
            {FORMATO_CFG[f].icon}
            {FORMATO_CFG[f].label}
          </span>
        ))}
        {rep.programable && (
          <span
            className="flex items-center gap-1 text-[10px] font-semibold rounded-md px-1.5 py-0.5"
            style={{
              background: 'rgba(34,197,94,0.10)',
              color: '#16a34a',
              border: '1px solid rgba(34,197,94,0.20)',
            }}
          >
            <Clock size={11} /> Programable
          </span>
        )}
      </div>
    </div>
  );

  if (!rep.disponible) return contenido;
  return (
    <Link href={rep.href} className="block h-full">
      {contenido}
    </Link>
  );
}
