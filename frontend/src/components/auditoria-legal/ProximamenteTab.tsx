import { Clock } from 'lucide-react';

export default function ProximamenteTab({ titulo }: { titulo: string }) {
  return (
    <div
      style={{ background: '#EEF2F7', minHeight: '100%' }}
      className="flex items-center justify-center px-5 py-5"
    >
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-10 py-12 text-center max-w-md">
        <div
          className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: '#eff6ff' }}
        >
          <Clock size={22} color="#009ee3" />
        </div>
        <h2 className="text-base font-bold text-gray-800 mb-1.5">{titulo}</h2>
        <p className="text-sm text-gray-500">
          Esta sección está en construcción y se habilitará en una próxima fase de Auditoría y
          Control Legal.
        </p>
      </div>
    </div>
  );
}
