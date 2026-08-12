import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPRAS_URL =
  'https://dadosabertos.compras.gov.br/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id';

const RECENTES_PER_RUN = 25;
const HISTORICO_PER_RUN = 25;

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
};

type ProcessStats = {
  licitacoesProcessadas: number;
  licitacoesComItens: number;
  licitacoesSemItens: number;
  recordsReceived: number;
  recordsSaved: number;
  recordsIgnored: number;
  concluidas: number;
  errors: string[];
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
    const body = await response.text();

    throw new Error(
      `Compras.gov.br respondeu HTTP ${response.status}: ${body.slice(
        0,
        300
      )}`
    );
  }

  return (await response.json()) as ComprasResponse;
}

async function processarLicitacoes(
  supabase: ReturnType<
    typeof createSupabaseAdminClient
  >,
  licitacoes: Licitacao[]
): Promise<ProcessStats> {
  const stats: ProcessStats = {
    licitacoesProcessadas: 0,
    licitacoesComItens: 0,
    licitacoesSemItens: 0,
    recordsReceived: 0,
    recordsSaved: 0,
    recordsIgnored: 0,
    concluidas: 0,
    errors: [],
  };

  for (const licitacao of licitacoes) {
    const idCompra =
      licitacao.dados_originais?.idCompra;

    if (!idCompra) {
      stats.recordsIgnored += 1;
      stats.concluidas += 1;
      continue;
    }

    try {
      const compras =
        await fetchItensByCompra(
          String(idCompra)
        );

      const items =
        compras.resultado ?? [];

      stats.licitacoesProcessadas += 1;
      stats.recordsReceived +=
        items.length;

      if (!items.length) {
        stats.licitacoesSemItens += 1;
        stats.concluidas += 1;
        continue;
      }

      stats.licitacoesComItens += 1;

      const now =
        new Date().toISOString();

      const rows = items
        .filter((item) => {
          if (!item.idCompraItem) {
            stats.recordsIgnored += 1;
            return false;
          }

          return true;
        })
        .map((item) => ({
          item_id:
            item.idCompraItem!,

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

      const uniqueRows =
        Array.from(
          new Map(
            rows.map((row) => [
              row.item_id,
              row,
            ])
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
              onConflict: 'item_id',
            }
          );

        if (upsertError) {
          throw new Error(
            `Erro Supabase: ${upsertError.message}`
          );
        }

        stats.recordsSaved +=
          uniqueRows.length;
      }

      stats.concluidas += 1;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido';

      stats.errors.push(
        `${licitacao.pncp_id} / idCompra ${idCompra}: ${message}`
      );

      console.error(
        `Erro ao sincronizar ${licitacao.pncp_id}:`,
        error
      );

      break;
    }
  }

  return stats;
}

async function runSync() {
  try {
    const supabase =
      createSupabaseAdminClient();

    /*
     * Cursor exclusivamente para o histórico.
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
        `Erro ao carregar cursor: ${syncStateError.message}`
      );
    }

    let historicoOffset =
      syncState?.proxima_pagina ??
      RECENTES_PER_RUN;

    /*
     * O histórico começa depois da faixa
     * reservada às licitações recentes.
     */
    if (
      !Number.isFinite(historicoOffset) ||
      historicoOffset <
        RECENTES_PER_RUN
    ) {
      historicoOffset =
        RECENTES_PER_RUN;
    }

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

    if (
      historicoOffset >= total
    ) {
      historicoOffset =
        RECENTES_PER_RUN;
    }

    /*
     * BLOCO 1
     * Sempre atualiza as licitações
     * mais recentes.
     */
    const {
      data: recentesData,
      error: recentesError,
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
        0,
        RECENTES_PER_RUN - 1
      );

    if (recentesError) {
      throw new Error(
        `Erro ao carregar recentes: ${recentesError.message}`
      );
    }

    const recentes =
      (recentesData ?? []) as Licitacao[];

    const statsRecentes =
      await processarLicitacoes(
        supabase,
        recentes
      );

    /*
     * Se houve erro nas recentes,
     * não avançamos o histórico.
     */
    if (
      statsRecentes.errors.length > 0
    ) {
      return NextResponse.json({
        success: false,
        source:
          'Compras.gov.br / PNCP - Itens',
        estrategia:
          'recentes_mais_historico',
        fase: 'recentes',
        recentes: statsRecentes,
        errors:
          statsRecentes.errors,
      });
    }

    /*
     * BLOCO 2
     * Continua preenchendo o histórico
     * usando o cursor.
     */
    const {
      data: historicoData,
      error: historicoError,
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
        historicoOffset,
        historicoOffset +
          HISTORICO_PER_RUN -
          1
      );

    if (historicoError) {
      throw new Error(
        `Erro ao carregar histórico: ${historicoError.message}`
      );
    }

    const historico =
      (historicoData ?? []) as Licitacao[];

    const statsHistorico =
      await processarLicitacoes(
        supabase,
        historico
      );

    let nextOffset =
      historicoOffset +
      statsHistorico.concluidas;

    if (
      total === 0 ||
      nextOffset >= total
    ) {
      nextOffset =
        RECENTES_PER_RUN;
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
        `Erro ao salvar cursor: ${stateSaveError.message}`
      );
    }

    const errors = [
      ...statsRecentes.errors,
      ...statsHistorico.errors,
    ];

    return NextResponse.json({
      success:
        errors.length === 0,

      source:
        'Compras.gov.br / PNCP - Itens',

      estrategia:
        'recentes_mais_historico',

      licitacoesElegiveis:
        total,

      recentes: {
        quantidade:
          recentes.length,

        processadas:
          statsRecentes
            .licitacoesProcessadas,

        itensRecebidos:
          statsRecentes
            .recordsReceived,

        itensSalvos:
          statsRecentes
            .recordsSaved,
      },

      historico: {
        inicio:
          historicoOffset,

        quantidade:
          historico.length,

        concluidas:
          statsHistorico.concluidas,

        proximoOffset:
          nextOffset,

        processadas:
          statsHistorico
            .licitacoesProcessadas,

        itensRecebidos:
          statsHistorico
            .recordsReceived,

        itensSalvos:
          statsHistorico
            .recordsSaved,
      },

      totais: {
        licitacoesProcessadas:
          statsRecentes
            .licitacoesProcessadas +
          statsHistorico
            .licitacoesProcessadas,

        recordsReceived:
          statsRecentes
            .recordsReceived +
          statsHistorico
            .recordsReceived,

        recordsSaved:
          statsRecentes
            .recordsSaved +
          statsHistorico
            .recordsSaved,

        recordsIgnored:
          statsRecentes
            .recordsIgnored +
          statsHistorico
            .recordsIgnored,
      },

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