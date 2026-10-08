'use client';

import { X } from 'lucide-react';

interface Props {
  nombre: string;
  rol: string;
  iniciales: string;
  color: string;
  avatarUrl?: string | null;
  onClose: () => void;
}

export default function ModalMiPerfil({
  nombre,
  rol,
  iniciales,
  color,
  avatarUrl,
  onClose,
}: Props) {
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
        style={{ maxWidth: '360px' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #e2e8f0' }}
        >
          <h2 className="text-[15px] font-bold text-gray-900">Mi Perfil</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
            style={{ width: '32px', height: '32px', color: '#94a3b8' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 flex flex-col items-center text-center">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={nombre}
              style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-full text-white font-bold"
              style={{ width: '56px', height: '56px', backgroundColor: color, fontSize: '18px' }}
            >
              {iniciales}
            </div>
          )}
          <p className="font-bold text-gray-800 mt-3" style={{ fontSize: '14px' }}>
            {nombre}
          </p>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: '12px' }}>
            {rol}
          </p>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Próximamente podrás editar tus datos y contraseña desde aquí.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
