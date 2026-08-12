import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  GOOGLE_TOKEN_URL,
  decodeGoogleIdToken,
  getGoogleEnvConfig,
  isValidGoogleState,
  persistGoogleTokens,
} from '@/lib/integrations/google-calendar';

export const dynamic = 'force-dynamic';

function getAppBaseUrl(
  requestUrl: URL
) {
  const configuredAppUrl =
    process.env.APP_URL;

  if (configuredAppUrl) {
    return configuredAppUrl.replace(
      /\/$/,
      ''
    );
  }

  return requestUrl.origin;
}

export async function GET(
  request: Request
) {
  const requestUrl =
    new URL(request.url);

  const appBaseUrl =
    getAppBaseUrl(requestUrl);

  const code =
    requestUrl.searchParams.get(
      'code'
    );

  const receivedState =
    requestUrl.searchParams.get(
      'state'
    );

  const oauthError =
    requestUrl.searchParams.get(
      'error'
    );

  const cookieStore =
    await cookies();

  const stateFromCookie =
    cookieStore.get(
      'google_oauth_state'
    )?.value || null;

  if (oauthError) {
    cookieStore.delete(
      'google_oauth_state'
    );

    return NextResponse.redirect(
      new URL(
        '/dashboard/configuracoes?google=error',
        appBaseUrl
      )
    );
  }

  if (
    !code ||
    !receivedState ||
    !isValidGoogleState(
      receivedState,
      stateFromCookie
    )
  ) {
    cookieStore.delete(
      'google_oauth_state'
    );

    return NextResponse.redirect(
      new URL(
        '/dashboard/configuracoes?google=invalid_state',
        appBaseUrl
      )
    );
  }

  const supabase =
    await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    cookieStore.delete(
      'google_oauth_state'
    );

    return NextResponse.redirect(
      new URL(
        '/login',
        appBaseUrl
      )
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (
    profileError ||
    !profile?.company_id
  ) {
    cookieStore.delete(
      'google_oauth_state'
    );

    return NextResponse.redirect(
      new URL(
        '/dashboard/configuracoes?google=profile_error',
        appBaseUrl
      )
    );
  }

  const {
    clientId,
    clientSecret,
    redirectUri,
  } = getGoogleEnvConfig();

  const tokenResponse =
    await fetch(
      GOOGLE_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret:
            clientSecret,
          code,
          redirect_uri:
            redirectUri,
          grant_type:
            'authorization_code',
        }),
        cache: 'no-store',
      }
    );

  const tokenPayload =
    (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

  if (
    !tokenResponse.ok ||
    !tokenPayload.access_token ||
    !tokenPayload.id_token
  ) {
    console.error(
      'Google token exchange error:',
      {
        status:
          tokenResponse.status,
        error:
          tokenPayload.error,
        description:
          tokenPayload.error_description,
      }
    );

    cookieStore.delete(
      'google_oauth_state'
    );

    return NextResponse.redirect(
      new URL(
        '/dashboard/configuracoes?google=token_error',
        appBaseUrl
      )
    );
  }

  const identity =
    decodeGoogleIdToken(
      tokenPayload.id_token
    );

  const {
    data: connectedAccount,
    error: connectedAccountError,
  } = await supabase
    .from(
      'connected_calendar_accounts'
    )
    .upsert(
      {
        user_id: user.id,
        company_id:
          profile.company_id,
        provider: 'google',
        email_address:
          identity.email,
        calendar_id: 'primary',
        status: 'connected',
        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          'user_id,provider,email_address',
        ignoreDuplicates: false,
      }
    )
    .select('id')
    .single();

  if (
    connectedAccountError ||
    !connectedAccount
  ) {
    console.error(
      'Google calendar account DB error:',
      connectedAccountError
    );

    cookieStore.delete(
      'google_oauth_state'
    );

    return NextResponse.redirect(
      new URL(
        '/dashboard/configuracoes?google=db_error',
        appBaseUrl
      )
    );
  }

  await persistGoogleTokens(
    supabase,
    user.id,
    connectedAccount.id,
    {
      access_token:
        tokenPayload.access_token,
      refresh_token:
        tokenPayload.refresh_token,
      expires_in:
        tokenPayload.expires_in,
      scope: tokenPayload.scope,
      token_type:
        tokenPayload.token_type,
      id_token:
        tokenPayload.id_token,
    }
  );

  cookieStore.delete(
    'google_oauth_state'
  );

  return NextResponse.redirect(
    `${appBaseUrl}/dashboard/configuracoes?google=connected`
  );
}
