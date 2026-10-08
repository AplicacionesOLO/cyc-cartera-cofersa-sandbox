import FormularioActualizacion from './formulario-actualizacion';
import { getServerHttp } from '@/shared/api/server-http';
import { createAuditoriaLegalApi } from '@/views/auditoria-legal/api/auditoria-legal-api';
import type { TokenValidoResponse } from '@/types/actualizacion-perfil';

export default async function ActualizarPerfilPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let data: TokenValidoResponse | null = null;
  try {
    // Endpoint público (sin sesión): 404 = enlace vencido/usado/inexistente → mensaje de enlace inválido.
    const api = createAuditoriaLegalApi(await getServerHttp());
    data = await api.validarToken(token);
  } catch (err) {
    if ((err as { status?: number }).status !== 404)
      console.error('[actualizar-perfil] error al validar token:', err);
    data = null;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#EEF2F7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#003B5C',
            }}
          >
            Cofersa S.A.
          </p>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#003B5C', margin: '4px 0 0' }}>
            Actualización de Perfil
          </h1>
        </div>
        {data ? (
          <FormularioActualizacion token={token} data={data} />
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>
              Este enlace ya no es válido
            </p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
              Puede haber vencido o ya haberse utilizado. Contactá a tu analista de crédito para
              solicitar uno nuevo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
