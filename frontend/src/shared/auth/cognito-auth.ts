/**
 * Autenticación con Amazon Cognito (aws-amplify v6). API de sesión del frontend.
 *
 * Equivalencias: signInWithPassword → signInWithEmail, signUp → signUpWithEmail (+ confirmSignUpCode),
 * signOut → signOutUser, getSession/getUser → getSessionUser, onAuthStateChange → onAuthStateChange,
 * resetPasswordForEmail → requestPasswordReset (+ confirmPasswordReset),
 * updateUser({password}) → changePassword, updateUser({data}) → updateProfileAttributes,
 * signInWithOAuth → signInWithProvider.
 *
 * `user.id` de la aplicación (tbl_app_users.id) lo devuelve el backend en GET /me;
 * aquí `sub` es el identificador de Cognito.
 */
import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signOut,
  signUp,
  updatePassword,
  updateUserAttributes,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { buildAmplifyConfig } from './amplify-config';

export interface SessionUser {
  sub: string;
  email: string | null;
  groups: string[];
  attributes: Record<string, string>;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'SESSION_EXPIRED';

export interface SignInResult {
  isSignedIn: boolean;
  /** p. ej. CONFIRM_SIGN_UP, CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED, RESET_PASSWORD, DONE */
  nextStep: string;
}

let configured = false;

/**
 * Next.js App Router: `ssr: true` guarda los tokens en cookies para que los Server Components
 * (vía `amplify-server.ts`) usen la misma sesión que el navegador.
 */
export function configureAuth(): void {
  if (configured) return;
  Amplify.configure(buildAmplifyConfig(), { ssr: true });
  configured = true;
}

/** ID token (JWT) para el header Authorization del authorizer Cognito de API Gateway. */
export async function getIdToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const [current, session] = await Promise.all([getCurrentUser(), fetchAuthSession()]);
    const payload = session.tokens?.idToken?.payload ?? {};
    const attributes = await fetchUserAttributes().catch(
      () => ({}) as Record<string, string | undefined>,
    );
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'string') clean[key] = value;
    }
    const groups = payload['cognito:groups'];
    return {
      sub: current.userId,
      email: clean.email ?? (typeof payload.email === 'string' ? payload.email : null),
      groups: Array.isArray(groups) ? groups.map(String) : [],
      attributes: clean,
    };
  } catch {
    return null;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const result = await signIn({ username: email, password });
  return { isSignedIn: result.isSignedIn, nextStep: result.nextStep.signInStep };
}

/** Completa el reto NEW_PASSWORD_REQUIRED (usuarios importados o creados por un admin). */
export async function completeNewPassword(newPassword: string): Promise<SignInResult> {
  const result = await confirmSignIn({ challengeResponse: newPassword });
  return { isSignedIn: result.isSignedIn, nextStep: result.nextStep.signInStep };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  attributes: Record<string, string> = {},
): Promise<{ isSignUpComplete: boolean; nextStep: string }> {
  const result = await signUp({
    username: email,
    password,
    options: { userAttributes: { email, ...attributes } },
  });
  return { isSignUpComplete: result.isSignUpComplete, nextStep: result.nextStep.signUpStep };
}

export async function confirmSignUpCode(email: string, code: string): Promise<void> {
  await confirmSignUp({ username: email, confirmationCode: code });
}

export async function resendConfirmationCode(email: string): Promise<void> {
  await resendSignUpCode({ username: email });
}

export async function signOutUser(options?: { global?: boolean }): Promise<void> {
  await signOut({ global: options?.global ?? false });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await resetPassword({ username: email });
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await updatePassword({ oldPassword, newPassword });
}

export async function updateProfileAttributes(attributes: Record<string, string>): Promise<void> {
  await updateUserAttributes({ userAttributes: attributes });
}

export async function signInWithProvider(
  provider: 'Google' | 'Facebook' | 'Amazon' | 'Apple' | string,
): Promise<void> {
  const known = ['Google', 'Facebook', 'Amazon', 'Apple'] as const;
  if ((known as readonly string[]).includes(provider)) {
    await signInWithRedirect({ provider: provider as (typeof known)[number] });
  } else {
    await signInWithRedirect({ provider: { custom: provider } });
  }
}

/** Notifica cambios de sesión (login, logout, refresh). Devuelve la función para desuscribirse. */
export function onAuthStateChange(callback: (event: AuthEvent) => void): () => void {
  return Hub.listen('auth', ({ payload }) => {
    switch (payload.event) {
      case 'signedIn':
      case 'signInWithRedirect':
        callback('SIGNED_IN');
        break;
      case 'signedOut':
        callback('SIGNED_OUT');
        break;
      case 'tokenRefresh':
        callback('TOKEN_REFRESHED');
        break;
      case 'tokenRefresh_failure':
      case 'signInWithRedirect_failure':
        callback('SESSION_EXPIRED');
        break;
      default:
        break;
    }
  });
}
