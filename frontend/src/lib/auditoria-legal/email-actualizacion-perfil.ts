// src/lib/auditoria-legal/email-actualizacion-perfil.ts
// El HTML del correo de Auditoría Anual vive ahora en el backend
// (domain/services/auditoria_legal_correos.py, lo envía POST /solicitudes-actualizacion).
// Acá queda sólo el asunto, que el modal de envío muestra como vista previa.

export function asuntoAuditoriaAnual(): string {
  return 'Auditoría Anual de Control Interno y Normativa Comercial 2026 — Cofersa S.A.';
}
