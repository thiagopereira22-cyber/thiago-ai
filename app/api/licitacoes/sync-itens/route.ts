import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPRAS_URL =
  'https://dadosabertos.compras.gov.br/modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133';

const PAGE_SIZE = 500;
const MAX_PAGES_PER_RUN = 5;
const DB_PAGE_SIZE = 1000;

type ComprasItem = {
  idCompra?: string;
  idCompraItem?: string;

  idContratacaoPNCP?: string;
  numeroControlePNCPCompra?: string;

  numeroItemPncp?: number;
  numeroItemCompra?: number;

  descricaoResumida?: string;
  descricaodetalhada?: string | null;

  materialOuServico?: string;
  materialOuServicoNome?: string;

  codItemCatalogo?: number | null;
  itemCategoriaNome?: string | null;

  unidadeMedida?: string | null;

  quantidade?: number | null;

  valorUnitarioEstimado?: number | null;
  valorTotal?: number | null;

  situacaoCompraItemNome?: string | null;

  dataInclusaoPncp?: string | null;
  dataAtualizacaoPncp?: string | null;

  [key: string]: unknown;
};

type ComprasResponse = {
  resultado?: ComprasItem[];

  totalRegistros?: number;
  totalPaginas?: number;
  paginasRestantes?: number;
};

function formatDate(date: Date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

async function fetchPage({
  page,
  startDate,
  endDate,
}: {
  page: number;
  startDate: string;
  endDate: string;
}): Promise<ComprasResponse> {
  const params = new URLSearchParams({
    pagina: String(page),

    tamanhoPagina:
      String(PAGE_SIZE),

    dataInclusaoPncpInicial:
      startDate,

    dataInclusaoPncpFinal:
      endDate,
  });

  const response = await fetch(
    `${COMPRAS_URL}?${params.toString()}`,
    {
      cache: 'no-store',

      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `Compras.gov.br itens página ${page} respondeu HTTP ${response.status}: ${body.slice(
        0,
        300
      )}`
    );
  }

  return (
    await response.json()
  ) as ComprasResponse;
}

async function runSync() {
  try {
    const supabase =
      createSupabaseAdminClient();

    /*
     * Janela móvel dos últimos 30 dias.
     */
    const end = new Date();

    const start = new Date();

    start.setDate(
      start.getDate() - 30
    );

    const startDate =
      formatDate(start);

    const endDate =
      formatDate(end);

    /*
     * Carrega todas as licitações que já
     * estão indexadas no banco.
     *
     * Fazemos em lotes porque o Supabase
     * pode limitar a resposta.
     */
    const pncpIds =
      new Set<string>();

    for (
      let from = 0;
      ;
      from += DB_PAGE_SIZE
    ) {
      const to =
        from + DB_PAGE_SIZE - 1;

      const {
        data: licitacoes,
        error: licitacoesError,
      } = await supabase
        .from('licitacoes')
        .select('pncp_id')
        .range(from, to);

      if (licitacoesError) {
        throw new Error(
          `Erro ao carregar licitações indexadas: ${licitacoesError.message}`
        );
      }

      for (
        const licitacao of
          licitacoes ?? []
      ) {
        if (licitacao.pncp_id) {
          pncpIds.add(
            licitacao.pncp_id
          );
        }
      }

      if (
        !licitacoes ||
        licitacoes.length <
          DB_PAGE_SIZE
      ) {
        break;
      }
    }

    /*
     * Estado global da sincronização dos itens.
     *
     * modalidade_codigo = 0 representa
     * o cursor da API de itens.
     */
    const {
      data: syncState,
      error: syncStateError,
    } = await supabase
      .from('licitacoes_sync_state')
      .select(
        'proxima_pagina,total_paginas'
      )
      .eq(
        'modalidade_codigo',
        0
      )
      .maybeSingle();

    if (syncStateError) {
      throw new Error(
        `Erro ao carregar estado da sincronização de itens: ${syncStateError.message}`
      );
    }

    /*
     * Consultamos a página 1 somente para
     * descobrir o número TOTAL de páginas
     * existente neste momento.
     *
     * Não salvamos seus itens aqui.
     */
    const primeiraConsulta =
      await fetchPage({
        page: 1,
        startDate,
        endDate,
      });

    let totalRegistros =
      primeiraConsulta.totalRegistros ?? 0;

    let totalPaginas =
      primeiraConsulta.totalPaginas ?? 0;

    let pagesProcessed = 0;

    let recordsReceived = 0;
    let recordsMatched = 0;
    let recordsSaved = 0;
    let recordsIgnored = 0;

    const errors: string[] = [];

    /*
     * Se não houver páginas, salvamos o
     * estado vazio e encerramos normalmente.
     */
    if (totalPaginas < 1) {
      const {
        error: stateSaveError,
      } = await supabase
        .from('licitacoes_sync_state')
        .upsert(
          {
            modalidade_codigo: 0,

            proxima_pagina: 0,

            total_paginas: 0,

            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              'modalidade_codigo',
          }
        );

      if (stateSaveError) {
        throw new Error(
          `Erro ao salvar estado da sincronização de itens: ${stateSaveError.message}`
        );
      }

      return NextResponse.json({
        success: true,

        source:
          'Compras.gov.br / PNCP - Itens',

        estrategia:
          'mais_recentes_primeiro',

        periodo: {
          inicio: startDate,
          fim: endDate,
        },

        licitacoesIndexadas:
          pncpIds.size,

        paginaInicial: 0,
        proximaPagina: 0,

        totalRegistros: 0,
        totalPaginas: 0,

        pagesProcessed: 0,

        recordsReceived: 0,
        recordsMatched: 0,
        recordsSaved: 0,
        recordsIgnored: 0,

        errors: [],
      });
    }

    /*
     * Se existe cursor válido, continuamos
     * daquela página.
     *
     * Se o cursor é 0, inexistente ou ficou
     * maior que o total atual, começamos pela
     * ÚLTIMA página.
     */
    let startPage =
      syncState?.proxima_pagina ?? 0;

    if (
      !Number.isFinite(startPage) ||
      startPage < 1 ||
      startPage > totalPaginas
    ) {
      startPage =
        totalPaginas;
    }

    const paginaInicial =
      startPage;

    /*
     * Exemplo:
     *
     * totalPaginas = 219
     * startPage = 219
     *
     * processaremos:
     * 219, 218, 217, 216 e 215.
     */
    const endPage =
      Math.max(
        1,
        startPage -
          MAX_PAGES_PER_RUN +
          1
      );

    /*
     * Se nada for processado, mantemos
     * o cursor atual.
     */
    let nextPage =
      startPage;

    for (
      let page = startPage;
      page >= endPage;
      page -= 1
    ) {
      try {
        const compras =
          await fetchPage({
            page,
            startDate,
            endDate,
          });

        pagesProcessed += 1;

        /*
         * Atualizamos os totais caso a API
         * devolva valores mais recentes.
         */
        if (
          compras.totalRegistros !==
          undefined
        ) {
          totalRegistros =
            compras.totalRegistros;
        }

        if (
          compras.totalPaginas !==
          undefined
        ) {
          totalPaginas =
            compras.totalPaginas;
        }

        const items =
          compras.resultado ?? [];

        recordsReceived +=
          items.length;

        /*
         * Uma página vazia é considerada
         * concluída. Seguimos para a anterior.
         */
        if (!items.length) {
          nextPage =
            page - 1;

          continue;
        }

        /*
         * Mantemos somente itens pertencentes
         * às licitações já indexadas.
         */
        const matchedItems =
          items.filter((item) => {
            const pncpId =
              item.numeroControlePNCPCompra ||
              item.idContratacaoPNCP;

            if (
              !pncpId ||
              !pncpIds.has(pncpId) ||
              !item.idCompraItem
            ) {
              recordsIgnored += 1;

              return false;
            }

            return true;
          });

        recordsMatched +=
          matchedItems.length;

        if (matchedItems.length) {
          const now =
            new Date().toISOString();

          const rows =
            matchedItems.map(
              (item) => ({
                item_id:
                  item.idCompraItem!,

                pncp_id:
                  item.numeroControlePNCPCompra ||
                  item.idContratacaoPNCP!,

                numero_item:
                  item.numeroItemPncp ??
                  item.numeroItemCompra ??
                  null,

                descricao:
                  item.descricaoResumida ||
                  null,

                descricao_detalhada:
                  item.descricaodetalhada ||
                  null,

                material_ou_servico:
                  item.materialOuServico ||
                  null,

                material_ou_servico_nome:
                  item.materialOuServicoNome ||
                  null,

                categoria:
                  item.itemCategoriaNome ||
                  null,

                unidade_medida:
                  item.unidadeMedida ||
                  null,

                quantidade:
                  item.quantidade ??
                  null,

                valor_unitario_estimado:
                  item.valorUnitarioEstimado ??
                  null,

                valor_total_estimado:
                  item.valorTotal ??
                  null,

                situacao:
                  item.situacaoCompraItemNome ||
                  null,

                codigo_catalogo:
                  item.codItemCatalogo ??
                  null,

                data_inclusao:
                  item.dataInclusaoPncp ||
                  null,

                data_atualizacao:
                  item.dataAtualizacaoPncp ||
                  null,

                dados_originais:
                  item,

                sincronizado_em:
                  now,

                updated_at:
                  now,
              })
            );

          /*
           * Remove IDs duplicados antes
           * do UPSERT.
           */
          const uniqueRows =
            Array.from(
              new Map(
                rows.map(
                  (row) => [
                    row.item_id,
                    row,
                  ]
                )
              ).values()
            );

          const {
            error: upsertError,
          } = await supabase
            .from('licitacao_itens')
            .upsert(
              uniqueRows,
              {
                onConflict:
                  'item_id',
              }
            );

          if (upsertError) {
            errors.push(
              `Página ${page}: ${upsertError.message}`
            );

            console.error(
              `Erro ao salvar itens página ${page}:`,
              upsertError
            );

            /*
             * Mantemos esta página como cursor
             * para tentar novamente depois.
             */
            nextPage =
              page;

            break;
          }

          recordsSaved +=
            uniqueRows.length;
        }

        /*
         * Página concluída com sucesso.
         *
         * Como estamos indo de trás para frente,
         * a próxima é a página anterior.
         */
        nextPage =
          page - 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Erro desconhecido';

        errors.push(
          `Página ${page}: ${message}`
        );

        console.error(
          `Erro itens página ${page}:`,
          error
        );

        /*
         * Mantemos a página problemática
         * para tentar novamente.
         */
        nextPage =
          page;

        break;
      }
    }

    /*
     * Chegamos à página 1.
     *
     * Cursor 0 significa:
     * na próxima execução consulte novamente
     * o total e comece pela página mais recente.
     */
    if (nextPage < 1) {
      nextPage = 0;
    }

    /*
     * Salva o cursor depois do processamento.
     */
    const {
      error: stateSaveError,
    } = await supabase
      .from('licitacoes_sync_state')
      .upsert(
        {
          modalidade_codigo: 0,

          proxima_pagina:
            nextPage,

          total_paginas:
            totalPaginas,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            'modalidade_codigo',
        }
      );

    if (stateSaveError) {
      throw new Error(
        `Erro ao salvar estado da sincronização de itens: ${stateSaveError.message}`
      );
    }

    return NextResponse.json({
      success:
        errors.length === 0,

      source:
        'Compras.gov.br / PNCP - Itens',

      estrategia:
        'mais_recentes_primeiro',

      periodo: {
        inicio:
          startDate,

        fim:
          endDate,
      },

      licitacoesIndexadas:
        pncpIds.size,

      paginaInicial,

      proximaPagina:
        nextPage,

      totalRegistros,
      totalPaginas,

      pagesProcessed,

      recordsReceived,
      recordsMatched,
      recordsSaved,
      recordsIgnored,

      errors,
    });
  } catch (error) {
    console.error(
      'Erro na sincronização de itens:',
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erro interno na sincronização de itens.',
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST() {
  return runSync();
}

export async function GET() {
  return runSync();
}