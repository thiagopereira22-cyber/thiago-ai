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
    const { error } = await supabase.rpc('save_microsoft_oauth_token', {
  p_user_id: userId,
  p_connected_email_account_id: connectedEmailAccountId,
  p_access_token: payload.accessToken,
  p_refresh_token: payload.refreshToken || null,
  p_expires_at: payload.expiresAt
    ? new Date(payload.expiresAt * 1000).toISOString()
    : null,
  p_scope: payload.scope || null,
});

    if (error) {
      throw error;
    }
  } catch (error) {
  console.error('Erro ao persistir tokens Microsoft no Supabase:', error);

  microsoftTokenStore.set(`${userId}:${connectedEmailAccountId}`, payload);
  return false;
}

  microsoftTokenStore.set(`${userId}:${connectedEmailAccountId}`, payload);
  return true;
}
export async function getValidMicrosoftAccessToken(
  supabase: SupabaseClient,
  userId: string,
  connectedEmailAccountId: string
): Promise<string> {
  const { data: tokenRows, error: tokenError } = await supabase.rpc(
    'get_microsoft_oauth_token',
    {
      p_connected_email_account_id: connectedEmailAccountId,
    }
  );

  if (tokenError) {
    throw new Error(`Não foi possível recuperar o token Microsoft: ${tokenError.message}`);
  }

  const tokenRecord = tokenRows?.[0];

  if (!tokenRecord?.access_token) {
    throw new Error('Token Microsoft não encontrado.');
  }

  // Renova com 5 minutos de antecedência
  const expiresAt = tokenRecord.expires_at
    ? new Date(tokenRecord.expires_at).getTime()
    : 0;

  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt > Date.now() + fiveMinutes) {
    return tokenRecord.access_token;
  }

  if (!tokenRecord.refresh_token) {
    throw new Error('Refresh token Microsoft não encontrado.');
  }

  const { clientId, clientSecret } = getMicrosoftEnvConfig();

  const tokenResponse = await fetch(
    `${MICROSOFT_IDENTITY_BASE_URL}/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokenRecord.refresh_token,
        scope:
          tokenRecord.scope ||
          'openid profile email offline_access User.Read Mail.Read',
      }),
      cache: 'no-store',
    }
  );

  const responseText = await tokenResponse.text();

let refreshedToken: MicrosoftTokenResponse & {
  error?: string;
  error_description?: string;
};

try {
  refreshedToken = responseText ? JSON.parse(responseText) : {};
} catch {
  console.error('Resposta inválida ao renovar token Microsoft:', {
    status: tokenResponse.status,
    contentType: tokenResponse.headers.get('content-type'),
  });

  throw new Error('A Microsoft retornou uma resposta inválida ao renovar a autorização.');
}

if (!tokenResponse.ok || !refreshedToken.access_token) {
    console.error('Falha ao renovar token Microsoft:', {
      status: tokenResponse.status,
      error: refreshedToken.error,
    });

    throw new Error('Não foi possível renovar a autorização Microsoft.');
  }

  await persistMicrosoftTokens(
    supabase,
    userId,
    connectedEmailAccountId,
    {
      access_token: refreshedToken.access_token,
      refresh_token:
        refreshedToken.refresh_token || tokenRecord.refresh_token,
      expires_in: refreshedToken.expires_in,
      scope: refreshedToken.scope || tokenRecord.scope,
      id_token: refreshedToken.id_token,
      token_type: refreshedToken.token_type,
    }
  );

  return refreshedToken.access_token;
}