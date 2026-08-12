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
 * Nesta etapa vamos trazer 5 páginas
 * de cada modalidade.
 *
 * 3 modalidades x 5 páginas x 100
 * = até 1.500 registros por execução.
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
 * Recupera de onde a sincronização
 * desta modalidade deve continuar.
 */
const {
  data: syncState,
  error: syncStateError,
} = await supabase
  .from('licitacoes_sync_state')
  .select('proxima_pagina,total_paginas')
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

let paginaInicial =
  syncState?.proxima_pagina ?? 1;

if (paginaInicial < 1) {
  paginaInicial = 1;
}

let ultimaPaginaProcessada =
  paginaInicial - 1;

      const paginaFinalDoLote =
  paginaInicial +
  MAX_PAGES_PER_MODALIDADE -
  1;

for (
  let page = paginaInicial;
  page <= paginaFinalDoLote;
  page += 1
) {
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

          /*
 * A API informa o total em qualquer página.
 * Isso é necessário porque agora nem sempre
 * começamos pela página 1.
 */
if (totalPaginas === 0) {
  totalRegistros =
    compras.totalRegistros ?? 0;

  totalPaginas =
    compras.totalPaginas ?? 0;
}

ultimaPaginaProcessada = page;

          const items =
            compras.resultado ?? [];

          recordsReceived +=
            items.length;

          recebidosModalidade +=
            items.length;

          if (!items.length) {
            break;
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

          const {
            error: upsertError,
          } = await supabase
            .from('licitacoes')
            .upsert(
              rows,
              {
                onConflict: 'pncp_id',
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
            rows.length;

          salvosModalidade +=
            rows.length;

          /*
           * Se a API tiver menos páginas
           * que nosso limite, paramos.
           */
          if (
            totalPaginas > 0 &&
            page >= totalPaginas
          ) {
            break;
          }
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

          /*
           * Não derrubamos toda a sincronização
           * porque uma página ou modalidade falhou.
           */
          break;
        }
      }

/*
 * Define de onde a próxima execução
 * continuará.
 *
 * Se chegamos ao final, reiniciamos
 * na página 1 para atualizar o índice
 * com novas publicações.
 */
let proximaPagina =
  ultimaPaginaProcessada + 1;

if (
  totalPaginas > 0 &&
  proximaPagina > totalPaginas
) {
  proximaPagina = 1;
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
        totalPaginas || null,

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

      periodo: {
        inicio: startDate,
        fim: endDate,
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