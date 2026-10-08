/**
 * Configuración pública por ambiente (Next.js: prefijo NEXT_PUBLIC_).
 * Las referencias deben ser literales (process.env.NEXT_PUBLIC_X) para que Next las incruste.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revise .env.example.`);
  }
  return value;
}

export const env = {
  apiBaseUrl: required('NEXT_PUBLIC_API_BASE_URL', process.env.NEXT_PUBLIC_API_BASE_URL),
  cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
  cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '',
  cognitoDomain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '',
  appExposure: (process.env.NEXT_PUBLIC_APP_EXPOSURE ?? 'internal') as 'internal' | 'public',
  realtimeEnabled: process.env.NEXT_PUBLIC_REALTIME_ENABLED === 'true',
} as const;
