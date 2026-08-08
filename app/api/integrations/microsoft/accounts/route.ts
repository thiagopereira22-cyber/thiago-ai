import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      );
    }

    const { data: accounts, error } = await supabase
      .from('connected_email_accounts')
      .select('id, email_address, provider, status')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar contas Microsoft:', {
        message: error.message,
        code: error.code,
      });

      return NextResponse.json(
        { error: 'Não foi possível carregar as contas Microsoft.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      accounts: accounts ?? [],
    });
  } catch (error) {
    console.error(
      'Erro inesperado ao buscar contas Microsoft:',
      error instanceof Error ? error.message : 'Erro desconhecido'
    );

    return NextResponse.json(
      { error: 'Erro interno ao carregar as contas Microsoft.' },
      { status: 500 }
    );
  }
}