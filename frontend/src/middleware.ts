import { NextResponse, type NextRequest } from 'next/server';
import { hasSession } from '@/shared/auth/amplify-server';

// El middleware solo decide "hay sesión de Cognito o no" (cookies de Amplify, refrescando el
// token si hace falta). La autorización real la hace el API (authorizer Cognito + rol en
// `usuarios`). Si la verificación se cuelga, se deja pasar y decide la página (mismo criterio
// que el tope de ~8s del middleware original).
async function hasSessionConTimeout(request: NextRequest, response: NextResponse, ms = 8000) {
  return Promise.race([
    hasSession(request, response).then((ok) => (ok ? 'si' : 'no')),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  // '/actualizar-perfil' es la página pública del formulario por token (su API vive en API Gateway).
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/actualizar-perfil');

  const sesion = await hasSessionConTimeout(request, response);
  if (sesion === 'timeout') return response;

  // Si no está logueado y no es ruta pública → redirigir a login
  if (sesion === 'no' && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Si está logueado y va a /login → redirigir al dashboard
  if (sesion === 'si' && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf)$).*)',
  ],
};
