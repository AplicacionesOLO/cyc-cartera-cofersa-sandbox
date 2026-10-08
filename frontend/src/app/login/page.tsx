'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useLoginController } from '@/views/identidad/hooks/use-login-controller';

export default function LoginPage() {
  const {
    loading,
    error,
    setError,
    reconsent,
    needsNewPassword,
    loginWithGoogle,
    loginWithEmail,
    setNewPassword,
  } = useLoginController();
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── Google (IdP federado en Cognito) ──────────────────────────
  async function handleGoogleLogin() {
    await loginWithGoogle();
  }

  // ── Email / Password ──────────────────────────────────────────
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    await loginWithEmail(email, password);
  }

  // ── Primer ingreso: reemplazar la contraseña temporal ─────────
  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    await setNewPassword(newPassword);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ fontFamily: 'Nunito, sans-serif' }}
    >
      {/* ── Capa 1: Foto de fondo ──────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/Fondo.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* ── Capa 2: Overlay oscuro ────────────────────────────── */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,21,41,0.58)' }} />

      {/* ── Capa 3: Radial cyan sutil ─────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 60%, rgba(0,158,227,0.10) 0%, transparent 60%)',
        }}
      />

      {/* ── Capa 4: Patrón de puntos ──────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.03,
        }}
      />

      {/* ── Capa 5: Tagline decorativa ────────────────────────── */}
      <div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap select-none"
        style={{
          fontSize: '36px',
          fontWeight: 800,
          color: 'white',
          opacity: 0.05,
          pointerEvents: 'none',
          letterSpacing: '-0.01em',
        }}
      >
        Su crecimiento, es nuestra meta
      </div>

      {/* ── Card centrada ─────────────────────────────────────── */}
      <div className="relative z-10 w-full flex flex-col items-center px-4">
        <div
          className="w-full relative"
          style={{
            maxWidth: '400px',
            background: 'white',
            borderRadius: '20px',
            padding: '40px 44px 36px',
            border: '0.5px solid rgba(255,255,255,0.15)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          {/* Línea decorativa superior */}
          <div
            className="absolute top-0 left-11 right-11 rounded-full"
            style={{
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #009ee3, transparent)',
            }}
          />

          {/* 1. Logo Cofersa (+44%) */}
          <div className="flex justify-center mb-3">
            <div
              style={{
                backgroundImage: "url('/logo-cofersa.png')",
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundColor: '#f8f9fa',
                width: '330px',
                height: '124px',
                borderRadius: '14px',
                border: '0.5px solid #e5e7eb',
                padding: '16px 32px',
              }}
            />
          </div>

          {/* 2. SIC */}
          <p
            className="text-center"
            style={{
              fontSize: '52px',
              fontWeight: 800,
              color: '#009ee3',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              marginBottom: '2px',
            }}
          >
            SIC
          </p>

          {/* 3. Sistema Inteligente de Cobranza */}
          <p
            className="text-center mb-0.5"
            style={{ fontSize: '14px', color: '#64748b', fontWeight: 400 }}
          >
            Sistema Inteligente de Cobranza
          </p>

          {/* 4. Powered by Cofersa */}
          <p
            className="text-center mb-4"
            style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 300, letterSpacing: '0.12em' }}
          >
            Powered by Cofersa
          </p>

          {/* 5. Divisor */}
          <div className="mb-4" style={{ height: '0.5px', backgroundColor: '#e5e7eb' }} />

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Reconsent — capturar permiso de envío de correos */}
          {reconsent && !error && (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Para habilitar el <b>envío de correos</b> desde el SIC sin que se cierre la sesión,
              continuá con Google y aceptá los permisos. Es una sola vez.
            </div>
          )}

          {!showEmail ? (
            <>
              {/* 5. Botón Google */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: '#003B5C',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '13px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '10px',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.backgroundColor = '#002a44';
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.backgroundColor = '#003B5C';
                }}
              >
                {/* Ícono Google SVG real */}
                <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {loading ? 'Redirigiendo...' : 'Ingresar con Google'}
              </button>

              {/* 6. Botón correo */}
              <button
                onClick={() => setShowEmail(true)}
                className="w-full flex items-center justify-center gap-2 transition-colors"
                style={{
                  background: 'transparent',
                  border: '0.5px solid #d1d5db',
                  color: '#64748b',
                  borderRadius: '10px',
                  padding: '11px 16px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.color = '#374151';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                <Mail size={14} />
                Iniciar con correo y contraseña
              </button>
            </>
          ) : needsNewPassword ? (
            /* Primer ingreso: definir contraseña propia */
            <form onSubmit={handleNewPassword} className="space-y-4">
              <p className="text-sm text-gray-600">
                Es su primer ingreso: defina una contraseña nueva. Mínimo 12 caracteres, con
                mayúscula, minúscula, número y símbolo.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Contraseña nueva
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none transition"
                  style={{ borderRadius: '10px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none transition"
                  style={{ borderRadius: '10px' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-bold transition disabled:opacity-60"
                style={{
                  backgroundColor: '#009ee3',
                  borderRadius: '10px',
                  padding: '13px 16px',
                  fontSize: '13px',
                }}
              >
                {loading ? 'Guardando...' : 'Guardar e ingresar'}
              </button>
            </form>
          ) : (
            /* Formulario email/password */
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="correo@cofersa.cr"
                  className="w-full border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none transition"
                  style={{ borderRadius: '10px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none transition"
                  style={{ borderRadius: '10px' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-bold transition disabled:opacity-60"
                style={{
                  backgroundColor: '#009ee3',
                  borderRadius: '10px',
                  padding: '13px 16px',
                  fontSize: '13px',
                }}
              >
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmail(false);
                  setError(null);
                }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 transition pt-1"
              >
                ← Volver al inicio con Google
              </button>
            </form>
          )}

          {/* 7. Texto de acceso */}
          <p className="text-center mt-6" style={{ fontSize: '11px', color: '#94a3b8' }}>
            Acceso exclusivo para colaboradores de{' '}
            <span style={{ color: '#009ee3', fontWeight: 600 }}>Cofersa</span>
          </p>
        </div>

        {/* Footer fuera de la card */}
        <p
          className="mt-6 text-center"
          style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}
        >
          SIC — Sistema Inteligente de Cobranza · Cofersa © 2026
        </p>
      </div>
    </div>
  );
}
