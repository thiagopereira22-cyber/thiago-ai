import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const MICROSOFT_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'Mail.Read'];
export const MICROSOFT_TENANT = 'common';
export const MICROSOFT_IDENTITY_BASE_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0`;

export interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}

export interface MicrosoftUserIdentity {
  email: string;
  displayName?: string;
  subject?: string;
}

interface MicrosoftTokenRecord {
  userId: string;
  connectedEmailAccountId: string;
  provider: 'microsoft';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  createdAt: string;
  updatedAt: string;
}

const microsoftTokenStore = new Map<string, MicrosoftTokenRecord>();

export function getMicrosoftEnvConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Microsoft OAuth env vars are not configured.');
  }

  return { clientId, clientSecret, redirectUri };
}

export function createMicrosoftState(userId: string) {
  return `${userId}:${crypto.randomUUID()}`;
}

export function isValidMicrosoftState(state: string | null, cookieValue: string | null) {
  if (!state || !cookieValue) {
    return false;
  }

  const [stateUserId] = state.split(':');
  const [cookieUserId] = cookieValue.split(':');

  return stateUserId === cookieUserId && state === cookieValue;
}

export function buildMicrosoftAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getMicrosoftEnvConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MICROSOFT_SCOPES.join(' '),
    state,
    prompt: 'select_account',
  });

  return `${MICROSOFT_IDENTITY_BASE_URL}/authorize?${params.toString()}`;
}

export function decodeMicrosoftIdToken(idToken: string): MicrosoftUserIdentity {
  const parts = idToken.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid Microsoft id_token payload.');
  }

  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  const claims = JSON.parse(decoded) as {
    email?: string;
    preferred_username?: string;
    upn?: string;
    name?: string;
    sub?: string;
  };

  const email = (claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();

  if (!email) {
    throw new Error('Microsoft did not return an email address.');
  }

  return {
    email,
    displayName: claims.name,
    subject: claims.sub,
  };
}

export async function persistMicrosoftTokens(
  supabase: SupabaseClient,
  userId: string,
  connectedEmailAccountId: string,
  tokenResponse: MicrosoftTokenResponse
) {
  const payload: MicrosoftTokenRecord = {
    userId,
    connectedEmailAccountId,
    provider: 'microsoft',
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: tokenResponse.expires_in
      ? Math.floor(Date.now() / 1000) + tokenResponse.expires_in
      : undefined,
    scope: tokenResponse.scope,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.schema('private').from('oauth_tokens').upsert(
      {
        user_id: userId,
        connected_email_account_id: connectedEmailAccountId,
        provider: 'microsoft',
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken || null,
        expires_at: payload.expiresAt ? new Date(payload.expiresAt * 1000).toISOString() : null,
        scope: payload.scope || null,
        updated_at: payload.updatedAt,
      },
      { onConflict: 'connected_email_account_id' }
    );

    if (error) {
      throw error;
    }
  } catch {
    microsoftTokenStore.set(`${userId}:${connectedEmailAccountId}`, payload);
    return false;
  }

  microsoftTokenStore.set(`${userId}:${connectedEmailAccountId}`, payload);
  return true;
}
