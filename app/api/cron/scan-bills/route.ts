import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { scanMicrosoftBillsForUser } from '@/lib/integrations/scan-microsoft-bills';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');

  if (
    !process.env.CRON_SECRET ||
    authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { error: 'Não autorizado.' },
      { status: 401 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: accounts, error } = await supabase
      .from('connected_email_accounts')
      .select('user_id')
      .eq('provider', 'microsoft')
      .eq('status', 'connected');

    if (error) {
      throw new Error(
        `Não foi possível consultar as contas conectadas: ${error.message}`
      );
    }

    const userIds = Array.from(
      new Set(
        (accounts ?? [])
          .map((account) => account.user_id)
          .filter(Boolean)
      )
    );

    const results = [];

    for (const userId of userIds) {
      try {
        const response = await scanMicrosoftBillsForUser(
          supabase,
          userId
        );

        const result = await response.json();

        results.push({
          userId,
          ...result,
        });
      } catch (error) {
        console.error(
          `Erro ao processar usuário ${userId}:`,
          error instanceof Error
            ? error.message
            : 'Erro desconhecido'
        );

        results.push({
          userId,
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Erro desconhecido',
        });
      }
    }

    return NextResponse.json({
      success: true,
      usersProcessed: userIds.length,
      results,
    });    

  } catch (error) {
    console.error(
      'Erro no cron de contas:',
      error instanceof Error
        ? error.message
        : 'Erro desconhecido'
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao executar sincronização automática.',
      },
      { status: 500 }
    );
  }
}
