'use client';

import { useDenegadoController } from '@/views/identidad/hooks/use-denegado-controller';
import { AuthStatusCard } from '@/views/identidad/components/auth-status-card';

// Ruta pública (prefijo /auth): sin perfil activo en `usuarios` no hay acceso.
export default function DenegadoPage() {
  useDenegadoController();
  return <AuthStatusCard>Cerrando sesión...</AuthStatusCard>;
}
