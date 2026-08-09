import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { scanMicrosoftBillsForUser } from '@/lib/integrations/scan-microsoft-bills';

export const dynamic = 'force-dynamic';

export async function POST() {
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

    return await scanMicrosoftBillsForUser(
      supabase,
      user.id
    );
  } catch (error) {
    console.error(
      'Erro no processamento manual de contas:',
      error instanceof Error
        ? error.message
        : 'Erro desconhecido'
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível processar automaticamente as contas.',
      },
      { status: 500 }
    );
  }
}
