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
     * Carrega todas as licitações que
     * já estão indexadas no banco.
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
     * Estado da sincronização dos itens.
     *
     * Usaremos modalidade_codigo = 0
     * para representar o cursor global
     * da API de itens.
     */
    const {
      data: syncState,
      error: syncStateError,
    } = await supabase
      .from('licitacoes_sync_state')
      .select(
        'proxima_pagina,total_paginas'
      )
      .eq('modalidade_codigo', 0)
      .maybeSingle();

    if (syncStateError) {
      throw new Error(
        `Erro ao carregar estado da sincronização de itens: ${syncStateError.message}`
      );
    }

    let startPage =
      syncState?.proxima_pagina ?? 1;

    if (
      !Number.isFinite(startPage) ||
      startPage < 1
    ) {
      startPage = 1;
    }

    let nextPage =
      startPage;

    let totalRegistros = 0;
    let totalPaginas =
      syncState?.total_paginas ?? 0;

    let pagesProcessed = 0;

    let recordsReceived = 0;
    let recordsMatched = 0;
    let recordsSaved = 0;
    let recordsIgnored = 0;

    const errors: string[] = [];

    /*
     * Processamos no máximo cinco páginas
     * por execução.
     *
     * A diferença agora é que começamos
     * de onde a execução anterior parou.
     */
    for (
      let offset = 0;
      offset < MAX_PAGES_PER_RUN;
      offset += 1
    ) {
      const page =
        startPage + offset;

      /*
       * Se já sabemos o total de páginas
       * e ultrapassamos o final, encerramos.
       */
      if (
        totalPaginas > 0 &&
        page > totalPaginas
      ) {
        nextPage = 1;
        break;
      }

      try {
        const compras =
          await fetchPage({
            page,
            startDate,
            endDate,
          });

        pagesProcessed += 1;

        /*
         * A primeira página consultada nesta
         * execução atualiza os totais.
         */
        if (offset === 0) {
          totalRegistros =
            compras.totalRegistros ?? 0;

          totalPaginas =
            compras.totalPaginas ?? 0;
        }

        const items =
          compras.resultado ?? [];

        recordsReceived +=
          items.length;

        /*
         * Se não vier nenhum item,
         * consideramos que chegamos ao final.
         */
        if (!items.length) {
          nextPage = 1;
          break;
        }

        /*
         * Mantemos somente itens de
         * licitações já indexadas.
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
             * Não avançamos o cursor se
             * essa página não foi salva.
             */
            nextPage = page;

            break;
          }

          recordsSaved +=
            uniqueRows.length;
        }

        /*
         * Página concluída com sucesso.
         * Próxima execução começa na seguinte.
         */
        nextPage =
          page + 1;

        /*
         * Chegamos à última página real.
         * Reiniciaremos o ciclo.
         */
        if (
          totalPaginas > 0 &&
          page >= totalPaginas
        ) {
          nextPage = 1;
          break;
        }
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
         * Mantém a página problemática
         * para tentar novamente depois.
         */
        nextPage = page;

        break;
      }
    }

    /*
     * Salva o cursor somente depois
     * do processamento.
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

      periodo: {
        inicio: startDate,
        fim: endDate,
      },

      licitacoesIndexadas:
        pncpIds.size,

      paginaInicial:
        startPage,

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