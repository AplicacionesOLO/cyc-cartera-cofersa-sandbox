'use client';

import { useGoogleConnectController } from '@/views/identidad/hooks/use-google-connect-controller';
import { AuthStatusCard } from '@/views/identidad/components/auth-status-card';

// Vuelta del consentimiento de Google (Gmail + Calendar): guarda el refresh token en el backend.
export default function GoogleConnectPage() {
  const { error, loading, reintentar, continuar } = useGoogleConnectController();
  if (loading && !error) return <AuthStatusCard>Conectando su cuenta de Gmail...</AuthStatusCard>;
  return (
    <AuthStatusCard error={error}>
      <div className="flex flex-col gap-2">
        <button
          onClick={reintentar}
          className="w-full rounded-[10px] bg-[#003B5C] px-4 py-3 text-[13px] font-semibold text-white"
        >
          Reintentar autorización de Gmail
        </button>
        <button
          onClick={continuar}
          className="w-full text-xs text-gray-400 hover:text-gray-600 pt-1"
        >
          Continuar sin envío de correos
        </button>
      </div>
    </AuthStatusCard>
  );
}
