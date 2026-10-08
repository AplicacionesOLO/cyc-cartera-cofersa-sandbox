import { Target } from 'lucide-react';

export default function PresupuestoPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Presupuesto de Cobro</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Seguimiento de metas de recaudo asignadas por el coordinador
        </p>
      </div>

      {/* Empty state — el coordinador aún no ha generado presupuesto */}
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <Target size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">
          El coordinador no ha generado presupuesto aún
        </h2>
        <p className="text-sm text-gray-500 max-w-md">
          Cuando el coordinador asigne metas de cobro, verás aquí tu progreso por cliente, el monto
          presupuestado versus lo cobrado y el porcentaje de alcance.
        </p>
      </div>

      {/*
        Layout preparado para cuando existan datos.
        Tabla: Cliente / Presupuesto / Cobrado / % Alcance / Estado
        (descomentar cuando el módulo de presupuesto esté activo)

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Detalle por cliente</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Presupuesto</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cobrado</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">% Alcance</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
            </tr>
          </thead>
          <tbody>
            (filas dinámicas aquí)
          </tbody>
        </table>
      </div>
      */}
    </div>
  );
}
