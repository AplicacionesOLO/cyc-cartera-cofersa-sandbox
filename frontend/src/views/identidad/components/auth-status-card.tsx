'use client';

import type { ReactNode } from 'react';

/** Tarjeta centrada para los pasos de autenticación (callback de Cognito, Gmail, acceso denegado). */
export function AuthStatusCard({
  children,
  error,
}: {
  children?: ReactNode;
  error?: string | null;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#EEF2F7', fontFamily: 'Nunito, sans-serif' }}
    >
      <div
        className="w-full bg-white text-center"
        style={{
          maxWidth: '400px',
          borderRadius: '20px',
          padding: '32px 36px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        }}
      >
        <p style={{ fontSize: '40px', fontWeight: 800, color: '#009ee3', lineHeight: 1 }}>SIC</p>
        {error ? (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <div className="mt-4 text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );
}
