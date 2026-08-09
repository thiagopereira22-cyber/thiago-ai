import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidMicrosoftAccessToken } from '@/lib/integrations/microsoft';
import { extractFinancialTextFromAttachments } from '@/lib/integrations/extract-bill-attachments';

type GraphMessage = {
  id: string;
  subject?: string | null;
  bodyPreview?: string | null;
  receivedDateTime?: string | null;
  hasAttachments?: boolean;
  body?: {
    contentType?: string | null;
    content?: string | null;
  };
  from?: {
    emailAddress?: {
      name?: string | null;
      address?: string | null;
    };
  };
};

type GraphMessagesResponse = {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
};

type IncompleteCandidate = {
  account: string;
  subject: string;
  supplier: string;
  amount: number | null;
  dueDate: string | null;
  hasAttachments: boolean;
};

const STRONG_FINANCIAL_TERMS = [
  'boleto',
  'fatura disponível',
  'fatura disponivel',
  'sua fatura',
  'valor da fatura',
  'valor a pagar',
  'conta disponível',
  'conta disponivel',
  'conta para pagamento',
  'vencimento',
  'vence em',
  'segunda via',
  'linha digitável',
  'linha digitavel',
  'código de barras',
  'codigo de barras',
  'pix copia e cola',
  'pix copia e cole',
  'cobrança',
  'cobranca',
  'mensalidade',
];

const WEAK_FINANCIAL_TERMS = [
  'pagamento',
  'conta',
  'fatura',
  'boleto',
  'vencimento',
];

const PROMOTIONAL_TERMS = [
  'promoção',
  'promocao',
  'desconto',
  'cupom',
  'oferta',
  'liquidação',
  'liquidacao',
  '% off',
  'investimento',
  'investir',
  'rendimento',
  'cdi',
  'cashback',
  'ganhe',
  'compre',
  'imperdível',
  'imperdivel',
  'aproveite',
];

const INFORMATIONAL_NON_BILL_TERMS = [
  'escolha como receber sua conta',
  'como receber sua conta',
  'forma de recebimento',
  'receber sua conta por e-mail',
  'receber sua conta por email',
  'cadastre sua conta por e-mail',
  'cadastre sua conta por email',
];

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function countTerms(text: string, terms: string[]) {
  const normalized = normalizeText(text);

  return terms.filter((term) =>
    normalized.includes(normalizeText(term))
  ).length;
}

function isLikelyFinancial(message: GraphMessage) {
  const text = [
    message.subject,
    message.bodyPreview,
  ]
    .filter(Boolean)
    .join(' ');

  const informationalScore = countTerms(
    text,
    INFORMATIONAL_NON_BILL_TERMS
  );

  if (informationalScore > 0) {
    return false;
  }

  const strongScore = countTerms(
    text,
    STRONG_FINANCIAL_TERMS
  );

  const weakScore = countTerms(
    text,
    WEAK_FINANCIAL_TERMS
  );

  const promotionalScore = countTerms(
    text,
    PROMOTIONAL_TERMS
  );

  if (promotionalScore > 0) {
    return false;
  }

  return (
    strongScore > 0 ||
    weakScore >= 2
  );
}

function isConfirmedFinancialText(text: string) {
  const promotionalScore = countTerms(text, PROMOTIONAL_TERMS);

  const paymentEvidenceTerms = [
    'valor a pagar',
    'valor da fatura',
    'vencimento',
    'vence em',
    'boleto',
    'linha digitavel',
    'codigo de barras',
    'pix copia e cola',
    'pix copia e cole',
    'segunda via',
    'conta para pagamento',
    'fatura disponivel',
    'sua fatura',
  ];

  const paymentEvidenceScore = countTerms(
    text,
    paymentEvidenceTerms
  );

  if (
    promotionalScore > 0 &&
    paymentEvidenceScore === 0
  ) {
    return false;
  }

  return paymentEvidenceScore > 0;
}

function extractAmount(text: string): number | null {
  const patterns = [
    /(?:valor(?:\s+total|\s+da\s+fatura|\s+a\s+pagar)?|total(?:\s+a\s+pagar)?|pagar|pagamento|fatura)\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /R\$\s*([\d.]+,\d{2})/i,
    /\d{1,2}\/\d{1,2}\/\d{2,4}\s+([\d.]+,\d{2})(?:\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const normalized = match[1]
      .replace(/\./g, '')
      .replace(',', '.');

    const amount = Number(normalized);

    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }

  return null;
}

function toIsoDate(day: string, month: string, year: string) {
  let normalizedYear = Number(year);

  if (normalizedYear < 100) {
    normalizedYear += 2000;
  }

  const normalizedMonth = Number(month);
  const normalizedDay = Number(day);

  const date = new Date(
    Date.UTC(
      normalizedYear,
      normalizedMonth - 1,
      normalizedDay
    )
  );

  if (
    date.getUTCFullYear() !== normalizedYear ||
    date.getUTCMonth() !== normalizedMonth - 1 ||
    date.getUTCDate() !== normalizedDay
  ) {
    return null;
  }

  return `${String(normalizedYear).padStart(4, '0')}-${String(
    normalizedMonth
  ).padStart(2, '0')}-${String(normalizedDay).padStart(2, '0')}`;
}

function extractDueDate(text: string): string | null {
  const patterns = [
    /(?:vencimento|vence|venc(?:\.|imento)?)\s*(?:em|:)?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i,
    /(?:até|ate)\s+(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i,
    /(?:vencimento\s+valor\s+(?:link\s+)?)(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const isoDate = toIsoDate(
      match[1],
      match[2],
      match[3]
    );

    if (isoDate) {
      return isoDate;
    }
  }

  return null;
}

function extractPaymentCode(text: string): string | null {
  const candidates =
    text.match(/(?:\d[\s.-]?){44,48}/g) || [];

  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');

    if (digits.length >= 44 && digits.length <= 48) {
      return digits;
    }
  }

  return null;
}

function buildTitle(message: GraphMessage) {
  let subject = message.subject?.trim();

  if (!subject) {
    return 'Conta detectada por e-mail';
  }

  subject = subject
    // Remove encaminhamento/resposta do Outlook.
    .replace(/^(?:(?:fw|fwd|re)\s*:\s*)+/gi, '')

    // Remove termos genéricos de cobrança no início.
    .replace(
      /^(?:boleto\s*\/\s*fatura|fatura\s*\/\s*boleto|boleto|fatura)\s*[:\-–—]?\s*/i,
      ''
    )

    // Remove expressões genéricas.
    .replace(/^sua\s+fatura(?:\s+digital)?\s*/i, '')
    .replace(/\s+(?:chegou|disponível|disponivel)!*$/i, '')

    // Limpeza final.
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!subject) {
    return 'Conta detectada por e-mail';
  }

  return subject.slice(0, 180);
}

function extractPaymentUrl(text: string): string | null {
  const links = new Set<string>();

  // Links em href="..."
  for (const match of Array.from(text.matchAll(
    /href=["'](https?:\/\/[^"']+)["']/gi
  ))) {
    links.add(match[1]);
  }

  // Links no formato <https://...>
  for (const match of Array.from(text.matchAll(
    /<(https?:\/\/[^>\s]+)>/gi
  ))) {
    links.add(match[1]);
  }

  // URLs escritas diretamente no texto
  for (const match of Array.from(text.matchAll(
    /https?:\/\/[^\s"'<>]+/gi
  ))) {
    links.add(match[0]);
  }

  const candidates = Array.from(links);

  const financialTerms = [
    'boleto',
    'fatura',
    'segunda-via',
    'segunda_via',
    'pagamento',
    'conta',
    'invoice',
    'payment',
  ];

  // Prioriza URLs que parecem levar diretamente à cobrança
  for (const link of candidates) {
    const normalized = normalizeText(link);

    if (
      financialTerms.some((term) =>
        normalized.includes(term)
      )
    ) {
      return link;
    }
  }

  // SafeLinks da Microsoft podem esconder a URL real
  for (const link of candidates) {
    if (
      link
        .toLowerCase()
        .includes('safelinks.protection.outlook.com')
    ) {
      try {
        const safeLink = new URL(link);
        const originalUrl =
          safeLink.searchParams.get('url');

        if (originalUrl) {
          const decoded =
            decodeURIComponent(originalUrl);

          const normalized =
            normalizeText(decoded);

          if (
            financialTerms.some((term) =>
              normalized.includes(term)
            )
          ) {
            return decoded;
          }
        }
      } catch {
        // Ignora SafeLink inválido
      }
    }
  }

  return null;
}

async function parseJsonResponse<T>(
  response: Response,
  errorMessage: string
): Promise<T> {
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `${errorMessage} HTTP ${response.status}`
    );
  }

  if (!responseText) {
    throw new Error(errorMessage);
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(
      `${errorMessage} Resposta inválida da Microsoft.`
    );
  }
}

async function fetchFullMessage(
  messageId: string,
  accessToken: string
): Promise<GraphMessage> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
      messageId
    )}`
  );

  url.searchParams.set(
    '$select',
    'id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments'
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: 'outlook.body-content-type="text"',
    },
    cache: 'no-store',
  });

  return parseJsonResponse<GraphMessage>(
    response,
    'Não foi possível carregar o conteúdo completo do e-mail.'
  );
}

async function fetchRecentMessages(
  accessToken: string,
  _lastSyncAt: string | null
) {
  const url = new URL(
    'https://graph.microsoft.com/v1.0/me/messages'
  );

  url.searchParams.set('$top', '100');

  url.searchParams.set(
    '$select',
    'id,subject,from,receivedDateTime,bodyPreview,hasAttachments'
  );

  url.searchParams.set(
    '$orderby',
    'receivedDateTime desc'
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload =
    await parseJsonResponse<GraphMessagesResponse>(
      response,
      'Não foi possível consultar os e-mails Microsoft.'
    );

  return payload.value || [];
}

export async function scanMicrosoftBillsForUser(
  supabase: SupabaseClient,
  userId: string
) {
  try {

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (
      profileError ||
      !profile?.company_id
    ) {
      return NextResponse.json(
        {
          error:
            'Empresa do usuário não encontrada.',
        },
        { status: 400 }
      );
    }

    const companyId = profile.company_id;

    const {
      data: accounts,
      error: accountsError,
    } = await supabase
      .from('connected_email_accounts')
      .select(
        'id,email_address,provider,status,last_sync_at'
      )
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .eq('status', 'connected');

    if (accountsError) {
      return NextResponse.json(
        {
          error:
            'Não foi possível consultar as contas Microsoft conectadas.',
        },
        { status: 500 }
      );
    }

    if (!accounts?.length) {
      return NextResponse.json(
        {
          error:
            'Nenhuma conta Microsoft conectada.',
        },
        { status: 404 }
      );
    }

    let scanned = 0;
    let detected = 0;
    let created = 0;
    let duplicates = 0;
    let incomplete = 0;
    let attachmentPending = 0;

    const incompleteMessages: IncompleteCandidate[] =
      [];

    for (const account of accounts) {
      let accessToken: string;

      try {
        accessToken =
          await getValidMicrosoftAccessToken(
            supabase,
            userId,
            account.id
          );
      } catch {
        continue;
      }

      let messages: GraphMessage[];

      try {
        messages = await fetchRecentMessages(
          accessToken,
          account.last_sync_at || null
        );
      } catch (error) {
        console.error(
          'Erro ao consultar mensagens Microsoft:',
          error instanceof Error
            ? error.message
            : 'Erro desconhecido'
        );

        continue;
      }

      scanned += messages.length;

      for (const message of messages) {
        if (
          !message.id ||
          !isLikelyFinancial(message)
        ) {
          continue;
        }

        detected += 1;

        const { data: existing } =
          await supabase
            .from('bills')
            .select('id')
            .eq(
              'source_account_id',
              account.id
            )
            .eq(
              'source_message_id',
              message.id
            )
            .maybeSingle();

        
        let fullMessage: GraphMessage;

        try {
          fullMessage =
            await fetchFullMessage(
              message.id,
              accessToken
            );
        } catch {
          incomplete += 1;
          continue;
        }

        const fullText = [
          fullMessage.subject,
          fullMessage.bodyPreview,
          fullMessage.body?.content,
        ]
          .filter(Boolean)
          .join('\n');

       
        if (
          !isConfirmedFinancialText(
            fullText
          )
        ) {
          continue;
        }

        let analysisText = fullText;

if (fullMessage.hasAttachments) {
  try {
    const attachmentText =
      await extractFinancialTextFromAttachments(
        fullMessage.id,
        accessToken
      );

    if (attachmentText.trim()) {
      analysisText = [
        fullText,
        attachmentText,
      ].join('\n');
    }
  } catch (error) {
    console.error(
      'Erro ao analisar anexos financeiros:',
      error instanceof Error
        ? error.message
        : 'Erro desconhecido'
    );
  }
}

const amount =
  extractAmount(analysisText);

const dueDate =
  extractDueDate(analysisText);

const supplier =
  fullMessage.from?.emailAddress?.name?.trim() ||
  fullMessage.from?.emailAddress?.address?.trim() ||
  null;

const paymentCode =
  extractPaymentCode(analysisText);

const paymentUrl =
  extractPaymentUrl(analysisText);

if (existing) {
  const updates: {
    payment_url?: string;
    payment_code?: string;
  } = {};

  if (paymentUrl) {
    updates.payment_url = paymentUrl;
  }

  if (paymentCode) {
    updates.payment_code = paymentCode;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateExistingError } = await supabase
      .from('bills')
      .update(updates)
      .eq('id', existing.id);

    if (updateExistingError) {
      console.error(
        'Erro ao completar dados da conta existente:',
        updateExistingError.message
      );
    }
  }

  duplicates += 1;
  continue;
}

        if (!amount || !dueDate) {
          incomplete += 1;

          if (
            fullMessage.hasAttachments
          ) {
            attachmentPending += 1;
          }


          incompleteMessages.push({
            account:
              account.email_address,
            subject:
              fullMessage.subject ||
              'Sem assunto',
            supplier:
              supplier ||
              'Desconhecido',
            amount,
            dueDate,
            hasAttachments:
              Boolean(
                fullMessage.hasAttachments
              ),
          });

          continue;
        }

        const { error: insertError } =
          await supabase
            .from('bills')
            .insert({
              company_id: companyId,
              title:
                buildTitle(
                  fullMessage
                ),
              supplier,
              amount,
              due_date: dueDate,
              status: 'Pendente',
              source:
                'microsoft_email',
              source_message_id:
                fullMessage.id,
              source_account_id:
                account.id,
              payment_code:
                paymentCode,
              payment_url:
                paymentUrl,
              detected_at:
                new Date().toISOString(),
            });

        if (insertError) {
          if (
            insertError.code ===
            '23505'
          ) {
            duplicates += 1;
            continue;
          }

          console.error(
            'Erro ao cadastrar conta automática:',
            {
              code:
                insertError.code,
              message:
                insertError.message,
            }
          );

          continue;
        }

        created += 1;
      }

      await supabase
        .from(
          'connected_email_accounts'
        )
        .update({
          last_sync_at:
            new Date().toISOString(),
        })
        .eq('id', account.id)
        .eq('user_id', userId);
    }

    return NextResponse.json({
      success: true,
      accountsProcessed:
        accounts.length,
      scanned,
      detected,
      created,
      duplicates,
      incomplete,
      attachmentPending,
      incompleteMessages,
    });
  } catch (error) {
    console.error(
      'Erro no processamento automático de contas:',
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