'use client';

import Link from 'next/link';
import { useAuthCallbackController } from '@/views/identidad/hooks/use-auth-callback-controller';
import { AuthStatusCard } from '@/views/identidad/components/auth-status-card';

// Destino del Hosted UI de Cognito (Google federado). Reemplaza el route handler del origen.
export default function AuthCallbackPage() {
  const { error } = useAuthCallbackController();
  return (
    <AuthStatusCard error={error}>
      {error ? (
        <Link href="/login" className="text-[#009ee3] font-semibold">
          Volver al inicio
        </Link>
      ) : (
        'Ingresando al SIC...'
      )}
    </AuthStatusCard>
  );
}
