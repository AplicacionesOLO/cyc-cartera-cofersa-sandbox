/**
 * Sesión de Cognito en el servidor (Server Components, Route Handlers, middleware).
 * Lee los tokens de las cookies que escribe Amplify en el navegador (configureAuth con ssr: true).
 */
import 'server-only';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { buildAmplifyConfig } from './amplify-config';

export const { runWithAmplifyServerContext } = createServerRunner({ config: buildAmplifyConfig() });

export interface ServerIdentity {
  idToken: string;
  email: string;
  picture: string | null;
  name: string | null;
}

/** ID token + claims del usuario de la request actual, o null si no hay sesión. */
export async function getServerIdentity(): Promise<ServerIdentity | null> {
  try {
    const session = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: (contextSpec) => fetchAuthSession(contextSpec),
    });
    const idToken = session.tokens?.idToken;
    if (!idToken) return null;
    const payload = idToken.payload;
    return {
      idToken: idToken.toString(),
      email: typeof payload.email === 'string' ? payload.email : '',
      picture: typeof payload.picture === 'string' ? payload.picture : null,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch {
    return null;
  }
}

/** Para middleware: ¿la request trae una sesión válida (refrescándola si hace falta)? */
export async function hasSession(request: NextRequest, response: NextResponse): Promise<boolean> {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { request, response },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        return session.tokens?.idToken !== undefined;
      },
    });
  } catch {
    return false;
  }
}
