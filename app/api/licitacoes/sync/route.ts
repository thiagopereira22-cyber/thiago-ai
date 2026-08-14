import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPRAS_URL =
  'https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133';

const MODALIDADES = [
  {
    codigo: 5,
    nome: 'Pregão - Eletrônico',
  },
  {
    codigo: 6,
    nome: 'Dispensa',
  },
  {
    codigo: 3,
    nome: 'Concorrência - Eletrônica',
  },
];

const PAGE_SIZE = 100;

/*
 * Processamos até 5 páginas por modalidade.
 *
 * 3 modalidades x 5 páginas x 100
 * = até 1.500 registros por execução.
 *
 * A diferença agora é que percorremos
 * das páginas mais recentes para as antigas.
 */
const MAX_PAGES_PER_MODALIDADE = 5;

type ComprasItem = {
  idCompra?: string;

  numeroControlePNCP?: string;

  anoCompraPncp?: number;
  sequencialCompraPncp?: number;

  orgaoEntidadeCnpj?: string;
  orgaoEntidadeRazaoSocial?: string;

  unidadeOrgaoCodigoUnidade?: string;
  unidadeOrgaoNomeUnidade?: string;
  unidadeOrgaoUfSigla?: string;
  unidadeOrgaoMunicipioNome?: string;

  modalidadeIdPncp?: number;
  codigoModalidade?: number;
  modalidadeNome?: string;

  objetoCompra?: string;

  valorTotalEstimado?: number | null;
  valorTotalHomologado?: number | null;

  dataInclusaoPncp?: string;
  dataAtualizacaoPncp?: string;
  dataPublicacaoPncp?: string;

  dataAberturaPropostaPncp?: string | null;
  dataEncerramentoPropostaPncp?: string | null;

  situacaoCompraIdPncp?: number;
  situacaoCompraNomePncp?: string;

  contratacaoExcluida?: boolean;

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

async function fetchComprasPage({
  page,
  startDate,
  endDate,
  codigoModalidade,
}: {
  page: number;
  startDate: string;
  endDate: string;
  codigoModalidade: number;
}): Promise<ComprasResponse> {
  const params = new URLSearchParams({
    pagina: String(page),

    tamanhoPagina:
      String(PAGE_SIZE),

    dataPublicacaoPncpInicial:
      startDate,

    dataPublicacaoPncpFinal:
      endDate,

    codigoModalidade:
      String(codigoModalidade),

    contratacaoExcluida: 'false',
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
     * Mantemos a janela dos últimos 30 dias.
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

    let recordsReceived = 0;
    let recordsSaved = 0;
    let recordsIgnored = 0;
    let pagesProcessed = 0;

    const errors: string[] = [];

    const resumoModalidades: Array<{
      codigo: number;
      modalidade: string;
      totalRegistros: number;
      totalPaginas: number;
      paginaInicial: number;
      proximaPagina: number;
      paginasProcessadas: number;
      registrosRecebidos: number;
      registrosSalvos: number;
    }> = [];

    /*
     * Processamos uma modalidade por vez.
     */
    for (const modalidade of MODALIDADES) {
      let totalRegistros = 0;
      let totalPaginas = 0;

      let paginasModalidade = 0;
      let recebidosModalidade = 0;
      let salvosModalidade = 0;

      /*
       * Recuperamos o estado incremental
       * dessa modalidade.
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
          modalidade.codigo
        )
        .maybeSingle();

      if (syncStateError) {
        throw new Error(
          `Erro ao consultar progresso de ${modalidade.nome}: ${syncStateError.message}`
        );
      }

      /*
       * Primeiro fazemos uma consulta à página 1.
       *
       * O objetivo principal aqui é descobrir
       * quantas páginas existem AGORA.
       *
       * Isso é importante porque novas licitações
       * podem aumentar o número total de páginas.
       */
      const primeiraConsulta =
        await fetchComprasPage({
          page: 1,
          startDate,
          endDate,
          codigoModalidade:
            modalidade.codigo,
        });

      totalRegistros =
        primeiraConsulta.totalRegistros ?? 0;

      totalPaginas =
        primeiraConsulta.totalPaginas ?? 0;

      /*
       * Se ainda não há registros para essa
       * modalidade, apenas registramos o estado.
       */
      if (totalPaginas < 1) {
        const {
          error: emptyStateError,
        } = await supabase
          .from('licitacoes_sync_state')
          .upsert(
            {
              modalidade_codigo:
                modalidade.codigo,

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

        if (emptyStateError) {
          errors.push(
            `${modalidade.nome}: não foi possível salvar o progresso: ${emptyStateError.message}`
          );
        }

        resumoModalidades.push({
          codigo:
            modalidade.codigo,

          modalidade:
            modalidade.nome,

          totalRegistros,

          totalPaginas,

          paginaInicial: 0,

          proximaPagina: 0,

          paginasProcessadas: 0,

          registrosRecebidos: 0,

          registrosSalvos: 0,
        });

        continue;
      }

      /*
 * ESTRATÉGIA:
 *
 * Em toda execução processamos:
 *
 * 1. As 2 páginas mais recentes.
 * 2. Até 3 páginas do histórico.
 *
 * Assim novas oportunidades entram rapidamente
 * no Radar sem interromper o preenchimento
 * progressivo do histórico.
 */

const PAGINAS_RECENTES = 2;

const PAGINAS_HISTORICO =
  Math.max(
    0,
    MAX_PAGES_PER_MODALIDADE -
      PAGINAS_RECENTES
  );

/*
 * Páginas mais recentes.
 *
 * Exemplo:
 * totalPaginas = 31
 *
 * recentes = [31, 30]
 */
const paginasRecentes: number[] = [];

for (
  let page = totalPaginas;
  page >=
    Math.max(
      1,
      totalPaginas -
        PAGINAS_RECENTES +
        1
    );
  page -= 1
) {
  paginasRecentes.push(page);
}

/*
 * Recuperamos o cursor histórico.
 *
 * Se ainda não existe um cursor válido,
 * começamos logo antes das páginas recentes.
 */
let paginaHistorico =
  syncState?.proxima_pagina ?? 0;

if (
  paginaHistorico < 1 ||
  paginaHistorico >=
    totalPaginas -
      PAGINAS_RECENTES +
      1
) {
  paginaHistorico =
    totalPaginas -
    PAGINAS_RECENTES;
}

/*
 * Montamos as páginas históricas.
 *
 * Evitamos repetir páginas que já pertencem
 * ao bloco das páginas recentes.
 */
const paginasHistorico: number[] = [];

let cursorHistorico =
  paginaHistorico;

while (
  cursorHistorico >= 1 &&
  paginasHistorico.length <
    PAGINAS_HISTORICO
) {
  if (
    !paginasRecentes.includes(
      cursorHistorico
    )
  ) {
    paginasHistorico.push(
      cursorHistorico
    );
  }

  cursorHistorico -= 1;
}

/*
 * Juntamos recentes + histórico sem duplicidade.
 */
const paginasParaProcessar =
  Array.from(
    new Set([
      ...paginasRecentes,
      ...paginasHistorico,
    ])
  );

const paginaInicialDoLote =
  paginasParaProcessar[0] ?? 0;

for (const page of paginasParaProcessar) {
  try {
    const compras =
      await fetchComprasPage({
        page,
        startDate,
        endDate,
        codigoModalidade:
          modalidade.codigo,
      });

    pagesProcessed += 1;
    paginasModalidade += 1;

    const items =
      compras.resultado ?? [];

    recordsReceived +=
      items.length;

    recebidosModalidade +=
      items.length;

    if (!items.length) {
      continue;
    }

    const now =
      new Date().toISOString();

    const rows = items
      .filter((item) => {
        if (
          !item.numeroControlePNCP
        ) {
          recordsIgnored += 1;

          return false;
        }

        return true;
      })
      .map((item) => ({
        pncp_id:
          item.numeroControlePNCP!,

        objeto:
          item.objetoCompra ||
          'Objeto não informado',

        orgao:
          item.orgaoEntidadeRazaoSocial ||
          item.unidadeOrgaoNomeUnidade ||
          null,

        cnpj_orgao:
          item.orgaoEntidadeCnpj ||
          null,

        uf:
          item.unidadeOrgaoUfSigla ||
          null,

        municipio:
          item.unidadeOrgaoMunicipioNome ||
          null,

        modalidade:
          item.modalidadeNome ||
          modalidade.nome,

        modalidade_codigo:
          item.modalidadeIdPncp ??
          null,

        valor_estimado:
          item.valorTotalEstimado ??
          null,

        data_publicacao:
          item.dataPublicacaoPncp ||
          null,

        data_abertura_proposta:
          item.dataAberturaPropostaPncp ||
          null,

        data_encerramento_proposta:
          item.dataEncerramentoPropostaPncp ||
          null,

        situacao:
          item.situacaoCompraNomePncp ||
          'Divulgada no PNCP',

        ano_compra:
          item.anoCompraPncp ??
          null,

        sequencial_compra:
          item.sequencialCompraPncp ??
          null,

        fonte:
          'Compras.gov.br / PNCP',

        dados_originais:
          item,

        sincronizado_em:
          now,

        updated_at:
          now,
      }));

    if (!rows.length) {
      continue;
    }

    const uniqueRows =
      Array.from(
        new Map(
          rows.map((row) => [
            row.pncp_id,
            row,
          ])
        ).values()
      );

    const {
      error: upsertError,
    } = await supabase
      .from('licitacoes')
      .upsert(
        uniqueRows,
        {
          onConflict:
            'pncp_id',
        }
      );

    if (upsertError) {
      console.error(
        `Erro Supabase - ${modalidade.nome} - página ${page}:`,
        upsertError
      );

      errors.push(
        `${modalidade.nome}, página ${page}: ${upsertError.message}`
      );

      continue;
    }

    recordsSaved +=
      uniqueRows.length;

    salvosModalidade +=
      uniqueRows.length;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido';

    console.error(
      `${modalidade.nome} - página ${page}:`,
      error
    );

    errors.push(
      `${modalidade.nome}, página ${page}: ${message}`
    );
  }
}

/*
 * O próximo cursor continua de onde
 * terminamos no histórico.
 *
 * Quando chegarmos ao início, usamos 0.
 * Na execução seguinte o histórico
 * recomeçará logo abaixo das páginas recentes.
 */
let proximaPagina =
  cursorHistorico;

if (proximaPagina < 1) {
  proximaPagina = 0;
}

      const {
        error: updateStateError,
      } = await supabase
        .from('licitacoes_sync_state')
        .upsert(
          {
            modalidade_codigo:
              modalidade.codigo,

            proxima_pagina:
              proximaPagina,

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

      if (updateStateError) {
        errors.push(
          `${modalidade.nome}: não foi possível salvar o progresso: ${updateStateError.message}`
        );
      }

      resumoModalidades.push({
        codigo:
          modalidade.codigo,

        modalidade:
          modalidade.nome,

        totalRegistros,

        totalPaginas,

        paginaInicial:
          paginaInicialDoLote,

        proximaPagina,

        paginasProcessadas:
          paginasModalidade,

        registrosRecebidos:
          recebidosModalidade,

        registrosSalvos:
          salvosModalidade,
      });
    }

    return NextResponse.json({
      success:
        errors.length === 0,

      source:
        'Compras.gov.br / PNCP',

      estrategia:
  'recentes_mais_historico',

      periodo: {
        inicio:
          startDate,

        fim:
          endDate,
      },

      modalidades:
        resumoModalidades,

      pagesProcessed,

      recordsReceived,
      recordsSaved,
      recordsIgnored,

      errors,
    });
  } catch (error) {
    console.error(
      'Erro na sincronização de licitações:',
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erro interno na sincronização.',
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