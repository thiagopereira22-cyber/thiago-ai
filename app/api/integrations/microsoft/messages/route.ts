import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getValidMicrosoftAccessToken } from '@/lib/integrations/microsoft';

export async function GET(request: Request) {
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

    const requestUrl = new URL(request.url);
    const accountId = requestUrl.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId é obrigatório.' },
        { status: 400 }
      );
    }

    // Confirma que a conta pertence ao usuário autenticado
    const { data: account, error: accountError } = await supabase
      .from('connected_email_accounts')
      .select('id, provider, email_address, status')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Conta de e-mail não encontrada.' },
        { status: 404 }
      );
    }

    if (account.provider !== 'microsoft') {
      return NextResponse.json(
        { error: 'Esta conta não é Microsoft.' },
        { status: 400 }
      );
    }

    // Recupera o token associado especificamente a essa conta
    let accessToken: string;

try {
  accessToken = await getValidMicrosoftAccessToken(
    supabase,
    user.id,
    accountId
  );
} catch (error) {
  console.error('Erro ao obter autorização Microsoft:', error);

  return NextResponse.json(
    {
      error:
        'Não foi possível acessar a conta Microsoft. Reconecte esta conta.',
    },
    { status: 401 }
  );
}

    const graphUrl = new URL(
      'https://graph.microsoft.com/v1.0/me/messages'
    );

    graphUrl.searchParams.set('$top', '10');
    graphUrl.searchParams.set(
      '$select',
      'id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead'
    );
    graphUrl.searchParams.set('$orderby', 'receivedDateTime desc');

    const graphResponse = await fetch(graphUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const graphResponseText = await graphResponse.text();

let graphPayload: any = {};

if (graphResponseText) {
  try {
    graphPayload = JSON.parse(graphResponseText);
  } catch {
    console.error('Resposta inválida do Microsoft Graph:', {
      status: graphResponse.status,
      contentType: graphResponse.headers.get('content-type'),
    });

    return NextResponse.json(
      { error: 'A Microsoft retornou uma resposta inválida.' },
      { status: 502 }
    );
  }
}

    if (!graphResponse.ok) {
      console.error('Microsoft Graph messages error:', {
        status: graphResponse.status,
        error: graphPayload?.error?.code,
        message: graphPayload?.error?.message,
      });

      return NextResponse.json(
        {
          error: 'Não foi possível consultar os e-mails da conta Microsoft.',
          microsoftError: graphPayload?.error?.code || null,
        },
        { status: graphResponse.status }
      );
    }

    const messages = (graphPayload.value || []).map((message: any) => ({
      id: message.id,
      subject: message.subject || '(Sem assunto)',
      from:
        message.from?.emailAddress?.name ||
        message.from?.emailAddress?.address ||
        'Remetente desconhecido',
      fromEmail: message.from?.emailAddress?.address || null,
      receivedAt: message.receivedDateTime,
      preview: message.bodyPreview || '',
      hasAttachments: Boolean(message.hasAttachments),
      isRead: Boolean(message.isRead),
    }));

    return NextResponse.json({
      account: {
        id: account.id,
        email: account.email_address,
      },
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error('Erro ao consultar e-mails Microsoft:', error);

    return NextResponse.json(
      { error: 'Erro interno ao consultar os e-mails.' },
      { status: 500 }
    );
  }
}