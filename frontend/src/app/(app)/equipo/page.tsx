import { UserCheck } from 'lucide-react';

export default function EquipoPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Mi Equipo</h1>
        <p className="text-sm text-gray-500 mt-0.5">Rendimiento de analistas de cobro</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <UserCheck size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Módulo en construcción</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Mi Equipo mostrará tarjetas por analista con KPIs de gestiones, promesas activas, mora
          asignada y efectividad de cobro, más una tabla comparativa. Disponible en Sprint 3.
        </p>
      </div>
    </div>
  );
}
