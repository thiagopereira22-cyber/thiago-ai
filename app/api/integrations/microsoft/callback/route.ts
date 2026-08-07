import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  MICROSOFT_IDENTITY_BASE_URL,
  decodeMicrosoftIdToken,
  getMicrosoftEnvConfig,
  isValidMicrosoftState,
  persistMicrosoftTokens,
} from '@/lib/integrations/microsoft';

function getAppBaseUrl(requestUrl: URL) {
  const configuredAppUrl = process.env.APP_URL;
  if (configuredAppUrl) {
    return configuredAppUrl.replace(/\/$/, '');
  }

  return requestUrl.origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appBaseUrl = getAppBaseUrl(requestUrl);
  const code = requestUrl.searchParams.get('code');
  const receivedState = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');
  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get('microsoft_oauth_state')?.value || null;

  if (error) {
    cookieStore.delete('microsoft_oauth_state');
    return NextResponse.redirect(new URL('/configuracoes?microsoft=error', appBaseUrl));
  }

  if (!code || !receivedState || !isValidMicrosoftState(receivedState, stateFromCookie)) {
    cookieStore.delete('microsoft_oauth_state');
    return NextResponse.redirect(new URL('/configuracoes?microsoft=invalid_state', appBaseUrl));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    cookieStore.delete('microsoft_oauth_state');
    return NextResponse.redirect(new URL('/login', appBaseUrl));
  }

  const { clientId, clientSecret, redirectUri } = getMicrosoftEnvConfig();

  const tokenResponse = await fetch(`${MICROSOFT_IDENTITY_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenPayload = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenPayload.access_token) {
  console.error('Microsoft token exchange error:', {
    status: tokenResponse.status,
    error: tokenPayload.error,
    error_description: tokenPayload.error_description,
  });

  cookieStore.delete('microsoft_oauth_state');
  return NextResponse.redirect(new URL('/configuracoes?microsoft=token_error', appBaseUrl));
}

  const identity = decodeMicrosoftIdToken(tokenPayload.id_token);

  let connectedEmailAccountId: string;
  const { data: connectedAccount, error: connectedAccountError } = await supabase
    .from('connected_email_accounts')
    .upsert(
      {
        user_id: user.id,
        provider: 'microsoft',
        email_address: identity.email,
        display_name: identity.displayName || null,
        status: 'connected',
        updated_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider,email_address', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (connectedAccountError || !connectedAccount) {
    cookieStore.delete('microsoft_oauth_state');
    return NextResponse.redirect(new URL('/configuracoes?microsoft=db_error', appBaseUrl));
  }

  connectedEmailAccountId = connectedAccount.id;

  await persistMicrosoftTokens(supabase, user.id, connectedEmailAccountId, tokenPayload);
  cookieStore.delete('microsoft_oauth_state');

  return NextResponse.redirect(
  `${appBaseUrl}/dashboard/configuracoes?microsoft=connected`
);
}