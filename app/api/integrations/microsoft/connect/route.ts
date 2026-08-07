import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { buildMicrosoftAuthorizeUrl, createMicrosoftState } from '@/lib/integrations/microsoft';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const state = createMicrosoftState(user.id);
  cookieStore.set('microsoft_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });

  const authorizeUrl = buildMicrosoftAuthorizeUrl(state);
  return NextResponse.redirect(authorizeUrl);
}
