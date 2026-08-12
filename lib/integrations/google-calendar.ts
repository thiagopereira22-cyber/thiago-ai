import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
];

export const GOOGLE_AUTH_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';

export const GOOGLE_TOKEN_URL =
  'https://oauth2.googleapis.com/token';

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export interface GoogleUserIdentity {
  email: string;
  displayName?: string;
  subject?: string;
}

export function getGoogleEnvConfig() {
  const clientId =
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI;

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri
  ) {
    throw new Error(
      'Google OAuth env vars are not configured.'
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function createGoogleState(
  userId: string
) {
  return `${userId}:${crypto.randomUUID()}`;
}

export function isValidGoogleState(
  state: string | null,
  cookieValue: string | null
) {
  if (!state || !cookieValue) {
    return false;
  }

  const [stateUserId] =
    state.split(':');

  const [cookieUserId] =
    cookieValue.split(':');

  return (
    stateUserId === cookieUserId &&
    state === cookieValue
  );
}

export function buildGoogleAuthorizeUrl(
  state: string
) {
  const {
    clientId,
    redirectUri,
  } = getGoogleEnvConfig();

  const params =
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: GOOGLE_SCOPES.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
    });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function decodeGoogleIdToken(
  idToken: string
): GoogleUserIdentity {
  const parts = idToken.split('.');

  if (parts.length < 2) {
    throw new Error(
      'Invalid Google id_token payload.'
    );
  }

  const payload = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded = payload.padEnd(
    Math.ceil(payload.length / 4) * 4,
    '='
  );

  const decoded = Buffer.from(
    padded,
    'base64'
  ).toString('utf8');

  const claims = JSON.parse(
    decoded
  ) as {
    email?: string;
    name?: string;
    sub?: string;
  };

  const email =
    (claims.email || '')
      .trim()
      .toLowerCase();

  if (!email) {
    throw new Error(
      'Google did not return an email address.'
    );
  }

  return {
    email,
    displayName: claims.name,
    subject: claims.sub,
  };
}

export async function persistGoogleTokens(
  supabase: SupabaseClient,
  userId: string,
  connectedCalendarAccountId: string,
  tokenResponse: GoogleTokenResponse
) {
  const expiresAt =
    tokenResponse.expires_in
      ? new Date(
          Date.now() +
            tokenResponse.expires_in *
              1000
        ).toISOString()
      : null;

  const { error } =
    await supabase.rpc(
      'save_google_oauth_token',
      {
        p_user_id: userId,
        p_connected_calendar_account_id:
          connectedCalendarAccountId,
        p_access_token:
          tokenResponse.access_token,
        p_refresh_token:
          tokenResponse.refresh_token ||
          null,
        p_expires_at: expiresAt,
        p_scope:
          tokenResponse.scope || null,
      }
    );

  if (error) {
    throw new Error(
      `Não foi possível persistir o token Google: ${error.message}`
    );
  }
}
export async function getValidGoogleAccessToken(
  supabase: SupabaseClient,
  userId: string,
  connectedCalendarAccountId: string
): Promise<string> {
  const { data: tokenRows, error: tokenError } =
  await supabase.rpc('get_google_oauth_token', {
    p_connected_calendar_account_id:
      connectedCalendarAccountId,
    p_user_id: userId,
  });

  if (tokenError) {
    throw new Error(
      `Não foi possível recuperar o token Google: ${tokenError.message}`
    );
  }

  const tokenRecord = tokenRows?.[0];

  if (!tokenRecord?.access_token) {
    throw new Error('Token Google não encontrado.');
  }

  const expiresAt = tokenRecord.expires_at
    ? new Date(tokenRecord.expires_at).getTime()
    : 0;

  // Se ainda houver mais de 5 minutos de validade,
  // reutilizamos o access token atual.
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt > Date.now() + fiveMinutes) {
    return tokenRecord.access_token;
  }

  if (!tokenRecord.refresh_token) {
    throw new Error(
      'Refresh token Google não encontrado. Reconecte o Google Calendar.'
    );
  }

  const { clientId, clientSecret } =
    getGoogleEnvConfig();

  const tokenResponse = await fetch(
    GOOGLE_TOKEN_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token:
          tokenRecord.refresh_token,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    }
  );

  const refreshedToken =
    (await tokenResponse.json()) as
      GoogleTokenResponse & {
        error?: string;
        error_description?: string;
      };

  if (
    !tokenResponse.ok ||
    !refreshedToken.access_token
  ) {
    console.error(
      'Falha ao renovar token Google:',
      {
        status: tokenResponse.status,
        error: refreshedToken.error,
        description:
          refreshedToken.error_description,
      }
    );

    throw new Error(
      'Não foi possível renovar a autorização do Google Calendar.'
    );
  }

  await persistGoogleTokens(
    supabase,
    userId,
    connectedCalendarAccountId,
    {
      access_token:
        refreshedToken.access_token,
      refresh_token:
        refreshedToken.refresh_token ||
        tokenRecord.refresh_token,
      expires_in:
        refreshedToken.expires_in,
      scope:
        refreshedToken.scope ||
        tokenRecord.scope,
      token_type:
        refreshedToken.token_type,
    }
  );

  return refreshedToken.access_token;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: {
    title: string;
    description?: string | null;
    date: string;
  }
) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.title,
        description:
          event.description || undefined,

        // Evento de dia inteiro.
        start: {
          date: event.date,
        },

        // A API do Google exige que o "end"
        // de evento de dia inteiro seja exclusivo.
        end: {
          date: (() => {
            const [year, month, day] =
              event.date
                .split('-')
                .map(Number);

            const nextDay = new Date(
              Date.UTC(year, month - 1, day)
            );

            nextDay.setUTCDate(
              nextDay.getUTCDate() + 1
            );

            return nextDay
              .toISOString()
              .slice(0, 10);
          })(),
        },
      }),
      cache: 'no-store',
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    console.error(
      'Erro ao criar evento no Google Calendar:',
      {
        status: response.status,
        error: payload?.error,
      }
    );

    throw new Error(
      payload?.error?.message ||
        'Não foi possível criar o evento no Google Calendar.'
    );
  }

  return payload;
}