import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  buildGoogleAuthorizeUrl,
  createGoogleState,
} from '@/lib/integrations/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase =
    await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(
      new URL(
        '/login',
        process.env.APP_URL ||
          'http://localhost:3000'
      )
    );
  }

  const state =
    createGoogleState(user.id);

  const cookieStore =
    await cookies();

  cookieStore.set(
    'google_oauth_state',
    state,
    {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.NODE_ENV ===
        'production',
      maxAge: 10 * 60,
      path: '/',
    }
  );

  return NextResponse.redirect(
    buildGoogleAuthorizeUrl(state)
  );
}
