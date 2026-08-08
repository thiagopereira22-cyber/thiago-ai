'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ConnectedAccount = {
  id: string;
  email_address: string;
  provider: string;
  status?: string | null;
};

type EmailMessage = {
  id: string;
  subject: string;
  from: string;
  fromEmail: string | null;
  receivedAt: string;
  preview: string;
  hasAttachments: boolean;
  isRead: boolean;
};

type EmailCategory =
  | 'Financeiro'
  | 'Documento'
  | 'Compromisso'
  | 'Promoção'
  | 'Outros';

function classifyMessage(message: EmailMessage): EmailCategory {
  const text = [
    message.subject,
    message.from,
    message.fromEmail,
    message.preview,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const categories: Array<{
    category: EmailCategory;
    words: string[];
  }> = [
    {
      category: 'Financeiro',
      words: [
        'boleto',
        'fatura',
        'pagamento',
        'vencimento',
        'cobrança',
        'cobranca',
        'banco',
        'pix',
      ],
    },
    {
      category: 'Documento',
      words: [
        'contrato',
        'documento',
        'nota fiscal',
        'nf-e',
        'nfe',
        'recibo',
        'comprovante',
      ],
    },
    {
      category: 'Compromisso',
      words: [
        'reunião',
        'reuniao',
        'consulta',
        'agendamento',
        'reserva',
        'audiência',
        'audiencia',
        'evento',
        'compromisso',
      ],
    },
    {
      category: 'Promoção',
      words: [
        'oferta',
        'desconto',
        'cupom',
        'promoção',
        'promocao',
        'compre',
        'liquidação',
        'liquidacao',
        ' off',
      ],
    },
  ];

  for (const item of categories) {
    if (item.words.some((word) => text.includes(word))) {
      return item.category;
    }
  }

  return 'Outros';
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default function EmailsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [search, setSearch] = useState('');

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountsError(null);

    try {
      const response = await fetch('/api/integrations/microsoft/accounts', {
        cache: 'no-store',
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error || 'Não foi possível carregar as contas Microsoft.'
        );
      }

      const loadedAccounts: ConnectedAccount[] = payload.accounts || [];

      setAccounts(loadedAccounts);

      setSelectedAccountId((current) => {
        if (
          current &&
          loadedAccounts.some((account) => account.id === current)
        ) {
          return current;
        }

        return loadedAccounts[0]?.id || '';
      });
    } catch (error) {
      setAccountsError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as contas Microsoft.'
      );
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!selectedAccountId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    setMessagesError(null);

    try {
      const params = new URLSearchParams({
        accountId: selectedAccountId,
        limit: '20',
      });

      const response = await fetch(
        `/api/integrations/microsoft/messages?${params.toString()}`,
        {
          cache: 'no-store',
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            'Não foi possível carregar os e-mails desta conta.'
        );
      }

      setMessages(payload.messages || []);
    } catch (error) {
      setMessagesError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os e-mails.'
      );
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (selectedAccountId) {
      void loadMessages();
    }
  }, [selectedAccountId, loadMessages]);

  const filteredMessages = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return messages;
    }

    return messages.filter((message) => {
      const searchable = [
        message.subject,
        message.from,
        message.fromEmail,
        message.preview,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [messages, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">E-mails</h1>
          <p className="mt-1 text-sm text-slate-400">
            Consulte suas contas Microsoft conectadas ao Omnia.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadMessages()}
          disabled={!selectedAccountId || loadingMessages}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMessages ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="email-account"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Conta
            </label>

            <select
              id="email-account"
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              disabled={loadingAccounts || accounts.length === 0}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            >
              {accounts.length === 0 ? (
                <option value="">
                  {loadingAccounts
                    ? 'Carregando contas...'
                    : 'Nenhuma conta conectada'}
                </option>
              ) : (
                accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email_address}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="email-search"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Buscar
            </label>

            <input
              id="email-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Assunto ou remetente..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
            />
          </div>
        </div>

        {accountsError && (
          <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
            <p>{accountsError}</p>

            <button
              type="button"
              onClick={() => void loadAccounts()}
              className="mt-2 font-medium text-red-200 underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      {messagesError && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          <p>{messagesError}</p>

          <button
            type="button"
            onClick={() => void loadMessages()}
            className="mt-2 font-medium text-red-200 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!loadingAccounts &&
        !accountsError &&
        accounts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center">
            <h2 className="font-semibold text-white">
              Nenhuma conta Microsoft conectada
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Conecte uma conta em Configurações para visualizar seus e-mails.
            </p>
          </div>
        )}

      {loadingMessages && messages.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center text-sm text-slate-400">
          Carregando e-mails...
        </div>
      )}

      {!loadingMessages &&
        selectedAccountId &&
        !messagesError &&
        filteredMessages.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center">
            <h2 className="font-semibold text-white">
              Nenhum e-mail encontrado
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              {search
                ? 'Nenhuma mensagem corresponde à sua busca.'
                : 'Esta conta não retornou mensagens.'}
            </p>
          </div>
        )}

      <div className="space-y-3">
        {filteredMessages.map((message) => {
          const category = classifyMessage(message);

          return (
            <article
              key={message.id}
              className={`rounded-xl border p-4 transition ${
                message.isRead
                  ? 'border-slate-800 bg-slate-950/30'
                  : 'border-blue-900/60 bg-blue-950/10'
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {!message.isRead && (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}

                    <span className="font-semibold text-white">
                      {message.from}
                    </span>

                    {message.fromEmail && (
                      <span className="truncate text-xs text-slate-500">
                        {message.fromEmail}
                      </span>
                    )}
                  </div>

                  <h2
                    className={`mt-2 text-sm ${
                      message.isRead
                        ? 'font-medium text-slate-200'
                        : 'font-semibold text-white'
                    }`}
                  >
                    {message.subject || '(Sem assunto)'}
                  </h2>
                </div>

                <span className="shrink-0 text-xs text-slate-500">
                  {formatDate(message.receivedAt)}
                </span>
              </div>

              {message.preview && (
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
                  {message.preview}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">
                  {category}
                </span>

                {message.hasAttachments && (
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
                    📎 Anexo
                  </span>
                )}

                {!message.isRead && (
                  <span className="rounded-full border border-blue-900 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-300">
                    Não lido
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}