/**
 * Configuración de Amplify (Cognito + Hosted UI con Google como IdP federado).
 * La comparten el navegador (setupAuth, ssr: true → tokens en cookies) y el servidor
 * (createServerRunner) para que los Server Components lean la misma sesión.
 */
import type { ResourcesConfig } from 'aws-amplify';
import { env } from '../config/env';

function appOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? '';
}

export function buildAmplifyConfig(): ResourcesConfig {
  const origin = appOrigin();
  return {
    Auth: {
      Cognito: {
        userPoolId: env.cognitoUserPoolId,
        userPoolClientId: env.cognitoClientId,
        loginWith: {
          email: true,
          ...(env.cognitoDomain
            ? {
                oauth: {
                  domain: env.cognitoDomain,
                  scopes: ['openid', 'email', 'profile'],
                  redirectSignIn: [`${origin}/auth/callback`],
                  redirectSignOut: [`${origin}/login`],
                  responseType: 'code' as const,
                },
              }
            : {}),
        },
      },
    },
  };
}
