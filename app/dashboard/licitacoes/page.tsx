'use client';

import { useState } from 'react';

import {
  Gavel,
  Search,
  SlidersHorizontal,
  Star,
  Building2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LicitacoesPage() {
    type ItemEncontrado = {
  id: string;
  numero: number | null;
  descricao: string;
  descricaoDetalhada: string | null;
  quantidade: number | null;
  unidade: string | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  situacao: string | null;
};

type Licitacao = {
  id: string;
  pncpId: string | null;
  objeto: string;
  orgao: string;
  uf: string | null;
  municipio: string | null;
  modalidade: string;
  valor: number | null;
  encerramento: string | null;
  fonte: string;

  encontradoNosItens?: boolean;
  itensEncontrados?: ItemEncontrado[];
};

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Licitacao[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [modalidade, setModalidade] = useState('');
  const [uf, setUf] = useState('');
  const [orgao, setOrgao] = useState('');
const [periodo, setPeriodo] = useState('');
const [valorMin, setValorMin] = useState('');
const [valorMax, setValorMax] = useState('');
const [excluir, setExcluir] = useState('');
const [somenteAbertas, setSomenteAbertas] = useState(true);
const [licitacoesExpandidas, setLicitacoesExpandidas] =
  useState<Set<string>>(new Set());

async function handleSearch() {
  if (!query.trim()) {
    return;
  }

  setIsSearching(true);
  setSearchError(null);

  try {
    const params = new URLSearchParams({
      q: query.trim(),
    });

    if (modalidade) {
      params.set('modalidade', modalidade);
    }
    if (uf) {
  params.set('uf', uf);
}
if (orgao.trim()) {
  params.set('orgao', orgao.trim());
}

if (periodo) {
  params.set('periodo', periodo);
}

if (valorMin) {
  params.set('valorMin', valorMin);
}

if (valorMax) {
  params.set('valorMax', valorMax);
}

if (excluir.trim()) {
  params.set('excluir', excluir.trim());
}
if (somenteAbertas) {
  params.set('abertas', 'true');
}

    const response = await fetch(
      `/api/licitacoes/search?${params.toString()}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || 'Não foi possível realizar a busca.'
      );
    }

    setResults(data.results ?? []);
  } catch (error) {
    setResults([]);

    setSearchError(
      error instanceof Error
        ? error.message
        : 'Erro ao pesquisar licitações.'
    );
  } finally {
    setIsSearching(false);
  }
}

    function formatCurrency(value: number | null) {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

  function formatDate(value: string | null) {
    if (!value) {
      return '—';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }
  return (
    <div className="space-y-6">

      {/* Cabeçalho */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Licitações
        </h2>

        <p className="text-sm text-muted-foreground">
          Encontre e acompanhe oportunidades de compras públicas
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Oportunidades encontradas',
            value: '—',
          },
          {
            label: 'Novas hoje',
            value: '—',
          },
          {
            label: 'Salvas',
            value: '—',
          },
          {
            label: 'Participando',
            value: '—',
          },
        ].map((item) => (
          <Card
            key={item.label}
            className="border-border bg-card"
          >
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium text-muted-foreground">
                {item.label}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Buscador */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />

            <CardTitle className="text-base font-semibold text-foreground">
              Buscar oportunidades
            </CardTitle>
          </div>

          <CardDescription>
            Pesquise licitações por produto, órgão, localização e outros critérios.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">

          {/* Palavra-chave */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              O que você procura?
            </label>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <input
                  type="text"
                  placeholder="Ex.: notebook, televisão, câmera, fragmentadora..."
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  value={query}
onChange={(event) => setQuery(event.target.value)}
onKeyDown={(event) => {
  if (event.key === 'Enter') {
    void handleSearch();
  }
}}
                />
              </div>

              <Button
  type="button"
  onClick={() => void handleSearch()}
  disabled={isSearching || !query.trim()}
>
  <Search
    className={`mr-2 h-4 w-4 ${
      isSearching ? 'animate-spin' : ''
    }`}
  />

  {isSearching
    ? 'Buscando...'
    : 'Buscar'}
</Button>
            </div>
          </div>

          {/* Filtros */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />

              <span className="text-sm font-medium text-foreground">
                Filtros
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">

              <select
  value={uf}
  onChange={(e) => setUf(e.target.value)}
  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
>
  <option value="">Todos os estados</option>
  <option value="AC">Acre</option>
  <option value="AL">Alagoas</option>
  <option value="AP">Amapá</option>
  <option value="AM">Amazonas</option>
  <option value="BA">Bahia</option>
  <option value="CE">Ceará</option>
  <option value="DF">Distrito Federal</option>
  <option value="ES">Espírito Santo</option>
  <option value="GO">Goiás</option>
  <option value="MA">Maranhão</option>
  <option value="MT">Mato Grosso</option>
  <option value="MS">Mato Grosso do Sul</option>
  <option value="MG">Minas Gerais</option>
  <option value="PA">Pará</option>
  <option value="PB">Paraíba</option>
  <option value="PR">Paraná</option>
  <option value="PE">Pernambuco</option>
  <option value="PI">Piauí</option>
  <option value="RJ">Rio de Janeiro</option>
  <option value="RN">Rio Grande do Norte</option>
  <option value="RS">Rio Grande do Sul</option>
  <option value="RO">Rondônia</option>
  <option value="RR">Roraima</option>
  <option value="SC">Santa Catarina</option>
  <option value="SP">São Paulo</option>
  <option value="SE">Sergipe</option>
  <option value="TO">Tocantins</option>
</select>

              <select
  value={modalidade}
  onChange={(e) => setModalidade(e.target.value)}
  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
>
  <option value="">Todas as modalidades</option>
  <option value="Pregão - Eletrônico">
    Pregão eletrônico
  </option>
  <option value="Dispensa">
    Dispensa
  </option>
  <option value="Concorrência - Eletrônica">
    Concorrência eletrônica
  </option>
</select>

              <input
  type="text"
  value={orgao}
  onChange={(e) => setOrgao(e.target.value)}
  placeholder="Órgão"
  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
/>

<select
  value={periodo}
  onChange={(e) => setPeriodo(e.target.value)}
  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
>
  <option value="">Qualquer período</option>
  <option value="today">Encerra hoje</option>
  <option value="7">Encerra nos próximos 7 dias</option>
  <option value="30">Encerra nos próximos 30 dias</option>
</select>

</div>

<div className="mt-3 grid gap-3 md:grid-cols-2">

  <input
    type="text"
    value={excluir}
    onChange={(e) => setExcluir(e.target.value)}
    placeholder="Excluir palavras: serviço, manutenção, locação..."
    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
  />

  <div className="grid grid-cols-2 gap-3">
    <input
      type="number"
      min="0"
      value={valorMin}
      onChange={(e) => setValorMin(e.target.value)}
      placeholder="Valor mínimo"
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
    />

    <input
      type="number"
      min="0"
      value={valorMax}
      onChange={(e) => setValorMax(e.target.value)}
      placeholder="Valor máximo"
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
    />
  </div>

            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultado */}
      <Card className="border-border bg-card">
        <CardHeader>
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

    <div>
      <div className="flex items-center gap-2">
        <Gavel className="h-5 w-5 text-primary" />

        <CardTitle className="text-base font-semibold text-foreground">
          Oportunidades
        </CardTitle>
      </div>

      <CardDescription className="mt-1">
        As licitações encontradas aparecerão aqui.
      </CardDescription>
    </div>

    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={somenteAbertas}
        onChange={(e) =>
          setSomenteAbertas(e.target.checked)
        }
        className="h-4 w-4"
      />

      Somente abertas
    </label>

  </div>
</CardHeader>

        <CardContent>
  {searchError ? (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
      {searchError}
    </div>
  ) : isSearching ? (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
      <Search className="mb-3 h-8 w-8 animate-spin text-primary" />

      <p className="font-medium text-foreground">
        Buscando oportunidades...
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        Consultando licitações públicas.
      </p>
    </div>
  ) : results.length > 0 ? (
    <div className="overflow-hidden rounded-lg border border-border">

      {/* Cabeçalho */}
      <div className="hidden grid-cols-[minmax(300px,3fr)_minmax(180px,1.5fr)_90px_130px_130px_150px] gap-4 border-b border-border bg-secondary/30 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
        <div>Objeto</div>
        <div>Órgão</div>
        <div>Local</div>
        <div>Modalidade</div>
        <div>Valor</div>
        <div>Encerramento</div>
      </div>

      <div className="divide-y divide-border">
        {results.map((licitacao) => (
          <div
            key={licitacao.id}
            className="px-4 py-4 transition-colors hover:bg-secondary/20"
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(300px,3fr)_minmax(180px,1.5fr)_90px_130px_130px_150px] lg:items-center lg:gap-4">

              {/* Objeto */}
              <div>
                <p className="line-clamp-3 text-sm font-medium text-foreground">
                  {licitacao.objeto}
                </p>

{licitacao.itensEncontrados &&
  licitacao.itensEncontrados.length > 0 && (() => {
    const expandida =
      licitacoesExpandidas.has(licitacao.id);

    const itensVisiveis = expandida
      ? licitacao.itensEncontrados
      : licitacao.itensEncontrados.slice(0, 3);

    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
            {licitacao.itensEncontrados.length}{' '}
            {licitacao.itensEncontrados.length === 1
              ? 'item encontrado'
              : 'itens encontrados'}
          </span>
        </div>

        {itensVisiveis.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border bg-background p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              {item.numero !== null && (
                <span className="text-xs font-semibold text-foreground">
                  Item {item.numero}
                </span>
              )}

              {item.situacao && (
                <span className="text-xs text-muted-foreground">
                  • {item.situacao}
                </span>
              )}
            </div>

            <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
              {item.descricao}
            </p>

            <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">
                  Quantidade
                </span>

                <p className="font-semibold text-foreground">
                  {item.quantidade !== null
                    ? `${item.quantidade.toLocaleString('pt-BR')} ${
                        item.unidade ?? ''
                      }`
                    : 'Não informada'}
                </p>
              </div>

              <div>
                <span className="text-muted-foreground">
                  Unitário
                </span>

                <p className="font-semibold text-foreground">
                  {item.valorUnitario !== null
                    ? item.valorUnitario.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })
                    : 'Não informado'}
                </p>
              </div>

              <div>
                <span className="text-muted-foreground">
                  Total
                </span>

                <p className="font-semibold text-foreground">
                  {item.valorTotal !== null
                    ? item.valorTotal.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })
                    : 'Não informado'}
                </p>
              </div>
            </div>
          </div>
        ))}

        {licitacao.itensEncontrados.length > 3 && (
          <button
            type="button"
            onClick={() => {
              setLicitacoesExpandidas((anteriores) => {
                const novos = new Set(anteriores);

                if (novos.has(licitacao.id)) {
                  novos.delete(licitacao.id);
                } else {
                  novos.add(licitacao.id);
                }

                return novos;
              });
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {expandida
              ? 'Mostrar menos'
              : `Ver todos os ${licitacao.itensEncontrados.length} itens`}
          </button>
        )}
      </div>
    );
  })()}

                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Fonte: {licitacao.fonte}
                  </span>

                  {licitacao.pncpId ? (
                    <>
                      <span>•</span>
                      <span>
                        {licitacao.pncpId}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Órgão */}
              <div>
                <span className="mr-2 text-xs text-muted-foreground lg:hidden">
                  Órgão:
                </span>

                <span className="text-sm text-foreground">
                  {licitacao.orgao}
                </span>
              </div>

              {/* Local */}
              <div>
                <span className="mr-2 text-xs text-muted-foreground lg:hidden">
                  Local:
                </span>

                <span className="text-sm text-foreground">
                  {[
                    licitacao.municipio,
                    licitacao.uf,
                  ]
                    .filter(Boolean)
                    .join(' / ') || '—'}
                </span>
              </div>

              {/* Modalidade */}
              <div>
                <span className="mr-2 text-xs text-muted-foreground lg:hidden">
                  Modalidade:
                </span>

                <span className="text-sm text-foreground">
                  {licitacao.modalidade}
                </span>
              </div>

              {/* Valor */}
              <div>
                <span className="mr-2 text-xs text-muted-foreground lg:hidden">
                  Valor:
                </span>

                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(
                    licitacao.valor
                  )}
                </span>
              </div>

              {/* Encerramento */}
              <div>
                <span className="mr-2 text-xs text-muted-foreground lg:hidden">
                  Encerramento:
                </span>

                <span className="text-sm text-foreground">
                  {formatDate(
                    licitacao.encerramento
                  )}
                </span>
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  ) : query.trim() ? (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
      <Search className="mb-3 h-10 w-10 text-muted-foreground" />

      <p className="font-medium text-foreground">
        Nenhuma oportunidade encontrada
      </p>

      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Não encontramos resultados nesta consulta. Em seguida ampliaremos a busca para outras páginas e itens das licitações.
      </p>
    </div>
  ) : (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
      <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />

      <p className="font-medium text-foreground">
        Faça sua primeira busca
      </p>

      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Digite o produto ou serviço desejado e utilize os filtros para encontrar oportunidades.
      </p>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Star className="h-4 w-4" />
        Em breve você poderá salvar oportunidades para acompanhar.
      </div>
    </div>
  )}
</CardContent>
      </Card>

    </div>
  );
}