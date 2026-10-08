import { Clock } from 'lucide-react';

export default function PagosPendientesPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Pagos Pendientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Pagos comprometidos aún no confirmados en el sistema
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <Clock size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Módulo en construcción</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Pagos Pendientes consolidará los compromisos de pago acordados con clientes que aún no se
          reflejan en Softland. Disponible en Sprint 3.
        </p>
      </div>
    </div>
  );
}
