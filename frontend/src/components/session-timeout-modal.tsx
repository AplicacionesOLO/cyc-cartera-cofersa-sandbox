'use client';

/**
 * SessionTimeoutModal
 *
 * Modal de aviso de inactividad. Se muestra cuando quedan ≤ 120 segundos
 * para que expire la sesión. Bloquea la UI con un overlay semitransparente.
 */

import { Clock, LogOut } from 'lucide-react';

interface Props {
  secondsLeft: number; // segundos restantes
  onContinue: () => void; // reiniciar timer → "Continuar sesión"
  onClose: () => void; // cerrar sesión manualmente
}

// Formatea segundos → "M:SS" (ej: 87 → "1:27")
function fmtCountdown(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function SessionTimeoutModal({ secondsLeft, onContinue, onClose }: Props) {
  return (
    <>
      {/* ── Overlay ────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
          zIndex: 9000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        {/* ── Modal ──────────────────────────────────────────────── */}
        <div
          style={{
            background: 'white',
            borderRadius: '20px',
            padding: '36px 40px 32px',
            maxWidth: '380px',
            width: '100%',
            boxShadow: '0 24px 60px rgba(0,0,0,0.30)',
            textAlign: 'center',
          }}
        >
          {/* Ícono de reloj */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#fef9c3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Clock size={26} style={{ color: '#ca8a04' }} />
          </div>

          {/* Título */}
          <h2
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: '#1e293b',
              margin: '0 0 8px',
              lineHeight: 1.3,
            }}
          >
            Tu sesión está por expirar
          </h2>

          {/* Subtítulo */}
          <p
            style={{
              fontSize: '13px',
              color: '#64748b',
              margin: '0 0 24px',
              lineHeight: 1.5,
            }}
          >
            Por inactividad, tu sesión se cerrará en:
          </p>

          {/* Contador regresivo */}
          <div
            style={{
              fontSize: '48px',
              fontWeight: 800,
              color: '#eab308',
              fontFamily: 'monospace',
              lineHeight: 1,
              marginBottom: '28px',
              letterSpacing: '-0.02em',
            }}
          >
            {fmtCountdown(secondsLeft)}
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Continuar sesión */}
            <button
              onClick={onContinue}
              style={{
                background: '#009ee3',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '13px 20px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                width: '100%',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#0080c0';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#009ee3';
              }}
            >
              Continuar sesión
            </button>

            {/* Cerrar sesión */}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '11px 20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <LogOut size={14} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
