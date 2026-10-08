// Esqueleto genérico de página: se muestra solo durante la transición entre
// pantallas (vía loading.tsx). No toca datos ni lógica — es feedback visual.
export default function PageSkeleton({ kpis = 4, filas = 8 }: { kpis?: number; filas?: number }) {
  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* KPI cards */}
        {kpis > 0 && (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${kpis}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: kpis }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-slate-100 animate-pulse"
                style={{ height: 78 }}
              />
            ))}
          </div>
        )}

        {/* Barra de filtros */}
        <div
          className="bg-white rounded-2xl border border-slate-100 animate-pulse"
          style={{ height: 52 }}
        />

        {/* Tabla */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div
            className="animate-pulse"
            style={{ height: 44, background: '#F8FAFC', borderBottom: '1px solid #e8edf3' }}
          />
          {Array.from({ length: filas }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                height: 52,
                borderBottom: '1px solid #f1f5f9',
                background: i % 2 ? '#ffffff' : '#fcfdfe',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
