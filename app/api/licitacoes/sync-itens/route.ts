import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPRAS_URL =
  'https://dadosabertos.compras.gov.br/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id';

const LICITACOES_PER_RUN = 50;

type Licitacao = {
  pncp_id: string;
  dados_originais: {
    idCompra?: string;
    [key: string]: unknown;
  } | null;
};

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

async function fetchItensByCompra(
  idCompra: string
): Promise<ComprasResponse> {
  const params = new URLSearchParams({
    tipo: 'idCompra',
    codigo: idCompra,
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
      `Compras.gov.br respondeu HTTP ${response.status}: ${body.slice(
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
     * O registro modalidade_codigo = 0
     * passa a funcionar como cursor do lote
     * de licitações.
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
        `Erro ao carregar cursor de itens: ${syncStateError.message}`
      );
    }

    /*
     * proxima_pagina será utilizada como
     * OFFSET das licitações.
     */
    let offset =
      syncState?.proxima_pagina ?? 0;

    if (
      !Number.isFinite(offset) ||
      offset < 0
    ) {
      offset = 0;
    }

    /*
     * Quantidade total de licitações que
     * possuem idCompra.
     */
    const {
      count: totalLicitacoes,
      error: countError,
    } = await supabase
      .from('licitacoes')
      .select(
        'pncp_id',
        {
          count: 'exact',
          head: true,
        }
      )
      .not(
        'dados_originais->>idCompra',
        'is',
        null
      );

    if (countError) {
      throw new Error(
        `Erro ao contar licitações: ${countError.message}`
      );
    }

    const total =
      totalLicitacoes ?? 0;

    /*
     * Se chegamos ao final do índice,
     * reiniciamos pelas licitações mais
     * recentes.
     */
    if (
      total === 0 ||
      offset >= total
    ) {
      offset = 0;
    }

    const {
      data: licitacoes,
      error: licitacoesError,
    } = await supabase
      .from('licitacoes')
      .select(
        'pncp_id,dados_originais'
      )
      .not(
        'dados_originais->>idCompra',
        'is',
        null
      )
      .order(
        'data_publicacao',
        {
          ascending: false,
          nullsFirst: false,
        }
      )
      .range(
        offset,
        offset +
          LICITACOES_PER_RUN -
          1
      );

    if (licitacoesError) {
      throw new Error(
        `Erro ao carregar lote de licitações: ${licitacoesError.message}`
      );
    }

    const lote =
      (licitacoes ?? []) as Licitacao[];

    let licitacoesProcessadas = 0;
    let licitacoesComItens = 0;
    let licitacoesSemItens = 0;

    let recordsReceived = 0;
    let recordsSaved = 0;
    let recordsIgnored = 0;

    const errors: string[] = [];

    /*
     * Quantas posições do lote realmente
     * foram concluídas.
     *
     * Isso permite retomar corretamente
     * caso uma chamada falhe.
     */
    let completedPositions = 0;

    for (
      const licitacao of lote
    ) {
      const idCompra =
        licitacao.dados_originais
          ?.idCompra;

      if (!idCompra) {
        recordsIgnored += 1;
        completedPositions += 1;

        continue;
      }

      try {
        const compras =
          await fetchItensByCompra(
            String(idCompra)
          );

        const items =
          compras.resultado ?? [];

        licitacoesProcessadas += 1;

        recordsReceived +=
          items.length;

        if (!items.length) {
          licitacoesSemItens += 1;
          completedPositions += 1;

          continue;
        }

        licitacoesComItens += 1;

        const now =
          new Date().toISOString();

        const rows =
          items
            .filter((item) => {
              if (!item.idCompraItem) {
                recordsIgnored += 1;

                return false;
              }

              return true;
            })
            .map((item) => ({
              item_id:
                item.idCompraItem!,

              /*
               * Usamos o pncp_id da própria
               * licitação consultada.
               *
               * Isso evita qualquer problema
               * caso a API retorne outro campo
               * vazio ou com nomenclatura
               * diferente.
               */
              pncp_id:
                licitacao.pncp_id,

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
            }));

        /*
         * Evita IDs duplicados dentro
         * da própria resposta.
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

        if (uniqueRows.length) {
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
            throw new Error(
              `Erro Supabase: ${upsertError.message}`
            );
          }

          recordsSaved +=
            uniqueRows.length;
        }

        completedPositions += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Erro desconhecido';

        errors.push(
          `${licitacao.pncp_id} / idCompra ${idCompra}: ${message}`
        );

        console.error(
          `Erro ao sincronizar itens da licitação ${licitacao.pncp_id}:`,
          error
        );

        /*
         * Interrompemos o lote para não
         * avançar o cursor além da
         * licitação que apresentou erro.
         */
        break;
      }
    }

    /*
     * Avança exatamente o número de
     * licitações concluídas.
     */
    let nextOffset =
      offset + completedPositions;

    /*
     * Se concluímos o último lote,
     * cursor volta para zero.
     */
    if (
      total === 0 ||
      nextOffset >= total
    ) {
      nextOffset = 0;
    }

    const {
      error: stateSaveError,
    } = await supabase
      .from('licitacoes_sync_state')
      .upsert(
        {
          modalidade_codigo: 0,

          proxima_pagina:
            nextOffset,

          /*
           * Mantemos o nome antigo da
           * coluna, mas agora ela registra
           * o total de licitações elegíveis.
           */
          total_paginas:
            total,

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
        `Erro ao salvar cursor de itens: ${stateSaveError.message}`
      );
    }

    return NextResponse.json({
      success:
        errors.length === 0,

      source:
        'Compras.gov.br / PNCP - Itens',

      estrategia:
        'itens_por_id_compra',

      licitacoesElegiveis:
        total,

      lote: {
        inicio:
          offset,

        tamanho:
          lote.length,

        concluidas:
          completedPositions,

        proximoOffset:
          nextOffset,
      },

      licitacoesProcessadas,
      licitacoesComItens,
      licitacoesSemItens,

      recordsReceived,
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