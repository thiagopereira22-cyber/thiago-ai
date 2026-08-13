import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 50;
const MAX_ITEM_MATCHES = 500;

type LicitacaoRow = {
  pncp_id: string;
  objeto: string | null;
  orgao: string | null;
  cnpj_orgao: string | null;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  modalidade_codigo: number | null;
  valor_estimado: number | null;
  data_publicacao: string | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  situacao: string | null;
  fonte: string | null;
};

function escapeLike(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export async function GET(
  request: NextRequest
) {
  try {
    const searchParams =
      request.nextUrl.searchParams;

    const query =
      searchParams.get('q')?.trim() || '';

    const uf =
      searchParams
        .get('uf')
        ?.trim()
        .toUpperCase() || '';

    const modalidade =
      searchParams
        .get('modalidade')
        ?.trim() || '';
        const orgao =
  searchParams.get('orgao')?.trim() || '';

const periodo =
  searchParams.get('periodo')?.trim() || '';

const valorMin =
  searchParams.get('valorMin')?.trim() || '';

const valorMax =
  searchParams.get('valorMax')?.trim() || '';

const excluir =
  searchParams.get('excluir')?.trim() || '';
  const somenteAbertas =
  searchParams.get('abertas') === 'true';

    if (!query) {
      return NextResponse.json(
        {
          error:
            'Informe o que deseja pesquisar.',
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      createSupabaseAdminClient();

    const safeQuery =
      escapeLike(query);

    /*
     * ETAPA 1
     *
     * Procuramos o termo dentro dos itens.
     *
     * Isso permite encontrar uma licitação
     * mesmo quando "notebook", por exemplo,
     * não aparece no objeto geral.
     */
    const {
  data: itemMatches,
  error: itemError,
} = await supabase
  .from('licitacao_itens')
  .select(`
    pncp_id,
    item_id,
    numero_item,
    descricao,
    descricao_detalhada,
    quantidade,
    unidade_medida,
    valor_unitario_estimado,
    valor_total_estimado,
    situacao
  `)
  .or(
    `descricao.ilike.%${safeQuery}%,descricao_detalhada.ilike.%${safeQuery}%`
  )
  .limit(MAX_ITEM_MATCHES);

    if (itemError) {
      console.error(
        'Erro ao pesquisar itens:',
        itemError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível pesquisar os itens das licitações.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Um mesmo processo pode possuir vários
     * itens encontrados.
     *
     * Mantemos somente PNCP IDs únicos.
     */
    const itemPncpIds =
      Array.from(
        new Set(
          (itemMatches ?? [])
            .map((item) => item.pncp_id)
            .filter(
              (value): value is string =>
                Boolean(value)
            )
        )
      );

    /*
     * ETAPA 2
     *
     * Pesquisa na tabela principal.
     *
     * Encontraremos:
     *
     * 1. objeto contendo o termo;
     * OU
     * 2. licitação que possui item contendo
     *    o termo.
     */
    let dbQuery =
      supabase
        .from('licitacoes')
        .select(`
          pncp_id,
          objeto,
          orgao,
          cnpj_orgao,
          uf,
          municipio,
          modalidade,
          modalidade_codigo,
          valor_estimado,
          data_publicacao,
          data_abertura_proposta,
          data_encerramento_proposta,
          situacao,
          fonte
        `);

    if (itemPncpIds.length > 0) {
      /*
       * Montamos um OR:
       *
       * objeto contém o termo
       * OU
       * pncp_id está entre os encontrados
       * nos itens.
       */
      const quotedIds =
        itemPncpIds
          .map(
            (id) =>
              `"${id.replace(/"/g, '\\"')}"`
          )
          .join(',');

      dbQuery =
        dbQuery.or(
          `objeto.ilike.%${safeQuery}%,pncp_id.in.(${quotedIds})`
        );
    } else {
      /*
       * Nenhum item encontrado.
       * Continuamos pesquisando normalmente
       * no objeto da contratação.
       */
      dbQuery =
        dbQuery.ilike(
          'objeto',
          `%${safeQuery}%`
        );
    }

    /*
     * FILTRO DE ESTADO
     */
    if (uf) {
      dbQuery =
        dbQuery.eq('uf', uf);
    }

    /*
 * FILTRO DE ÓRGÃO
 */
if (orgao) {
  dbQuery =
    dbQuery.ilike(
      'orgao',
      `%${escapeLike(orgao)}%`
    );
}

/*
 * FILTRO DE VALOR
 */
if (valorMin) {
  const min =
    Number(valorMin);

  if (Number.isFinite(min)) {
    dbQuery =
      dbQuery.gte(
        'valor_estimado',
        min
      );
  }
}

if (valorMax) {
  const max =
    Number(valorMax);

  if (Number.isFinite(max)) {
    dbQuery =
      dbQuery.lte(
        'valor_estimado',
        max
      );
  }
}

/*
 * FILTRO DE ENCERRAMENTO
 */
if (periodo) {
  const now =
    new Date();

  let endDate:
    Date | null = null;

  if (periodo === 'today') {
    endDate =
      new Date(now);

    endDate.setHours(
      23,
      59,
      59,
      999
    );
  } else {
    const days =
      Number(periodo);

    if (
      Number.isFinite(days) &&
      days > 0
    ) {
      endDate =
        new Date(now);

      endDate.setDate(
        endDate.getDate() + days
      );
    }
  }

  if (endDate) {
    dbQuery =
      dbQuery
        .gte(
          'data_encerramento_proposta',
          now.toISOString()
        )
        .lte(
          'data_encerramento_proposta',
          endDate.toISOString()
        );
  }
}
/*
 * SOMENTE OPORTUNIDADES ABERTAS
 *
 * Exige prazo de encerramento futuro.
 * Também exclui situações claramente
 * incompatíveis com participação.
 */
if (somenteAbertas) {
  const agora =
    new Date().toISOString();

  dbQuery =
    dbQuery
      .gt(
        'data_encerramento_proposta',
        agora
      )
      .not(
        'situacao',
        'ilike',
        '%suspensa%'
      )
      .not(
        'situacao',
        'ilike',
        '%encerrada%'
      )
      .not(
        'situacao',
        'ilike',
        '%homologada%'
      )
      .not(
        'situacao',
        'ilike',
        '%revogada%'
      )
      .not(
        'situacao',
        'ilike',
        '%anulada%'
      );
}
/*
 * EXCLUIR PALAVRAS
 *
 * Aceita palavras separadas por vírgula.
 */
if (excluir) {
  const excludedTerms =
    excluir
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);

  for (
    const term of excludedTerms
  ) {
    dbQuery =
      dbQuery.not(
        'objeto',
        'ilike',
        `%${escapeLike(term)}%`
      );
  }
}

    /*
     * FILTRO DE MODALIDADE
     *
     * O front-end pode enviar:
     *
     * pregao
     * dispensa
     * concorrencia
     *
     * Também aceitamos código numérico.
     */
    if (
      modalidade &&
      modalidade !== 'all' &&
      modalidade !== 'todas'
    ) {
      if (modalidade === 'pregao') {
        dbQuery =
          dbQuery.eq(
            'modalidade_codigo',
            6
          );
      } else if (
        modalidade === 'dispensa'
      ) {
        dbQuery =
          dbQuery.eq(
            'modalidade_codigo',
            8
          );
      } else if (
        modalidade === 'concorrencia'
      ) {
        dbQuery =
          dbQuery.eq(
            'modalidade_codigo',
            4
          );
      } else {
        const modalidadeNumber =
          Number(modalidade);

        if (
          Number.isFinite(
            modalidadeNumber
          )
        ) {
          dbQuery =
            dbQuery.eq(
              'modalidade_codigo',
              modalidadeNumber
            );
        } else {
          dbQuery =
            dbQuery.ilike(
              'modalidade',
              `%${escapeLike(
                modalidade
              )}%`
            );
        }
      }
    }

    dbQuery =
      dbQuery
        .order(
          'data_encerramento_proposta',
          {
            ascending: true,
            nullsFirst: false,
          }
        )
        .limit(MAX_RESULTS);

    const {
      data,
      error,
    } = await dbQuery;

    if (error) {
      console.error(
        'Erro Supabase ao pesquisar licitações:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível pesquisar as licitações.',
        },
        {
          status: 500,
        }
      );
    }

    const rows =
      (data ?? []) as LicitacaoRow[];

    const itemPncpSet =
      new Set(itemPncpIds);

const itensPorPncp = new Map<
  string,
  typeof itemMatches
>();

for (const match of itemMatches ?? []) {
  if (!match.pncp_id) {
    continue;
  }

  const atuais =
    itensPorPncp.get(match.pncp_id) ?? [];

  atuais.push(match);

  itensPorPncp.set(
    match.pncp_id,
    atuais
  );
}

    const results =
      rows.map((item) => ({
        id:
          item.pncp_id,

        pncpId:
          item.pncp_id,

        objeto:
          item.objeto ||
          'Objeto não informado',

        orgao:
          item.orgao ||
          'Órgão não informado',

        uf:
          item.uf,

        municipio:
          item.municipio,

        modalidade:
          item.modalidade ||
          'Não informada',

        valor:
          item.valor_estimado,

        encerramento:
          item
            .data_encerramento_proposta,

        publicacao:
          item.data_publicacao,

        situacao:
          item.situacao,

        fonte:
          item.fonte ||
          'Compras.gov.br / PNCP',

        /*
         * Útil futuramente para mostrarmos
         * "Encontrado nos itens" na interface.
         */
        encontradoNosItens:
          itemPncpSet.has(
            item.pncp_id
          ),
        itensEncontrados:
  (itensPorPncp.get(item.pncp_id) ?? [])
    .map((match) => ({
      id: match.item_id,

      numero:
        match.numero_item,

      descricao:
        match.descricao ||
        match.descricao_detalhada ||
        'Descrição não informada',

      descricaoDetalhada:
        match.descricao_detalhada,

      quantidade:
        match.quantidade,

      unidade:
        match.unidade_medida,

      valorUnitario:
        match.valor_unitario_estimado,

      valorTotal:
        match.valor_total_estimado,

      situacao:
        match.situacao,
    })),  
      }));

    return NextResponse.json({
      success: true,

      query,

      source:
        'Supabase / Compras.gov.br',

      indexed: true,

      itemMatches:
        itemMatches?.length ?? 0,

      licitacoesEncontradasNosItens:
        itemPncpIds.length,

      returned:
        results.length,

      results,
    });
  } catch (error) {
    console.error(
      'Erro na busca de licitações:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível pesquisar as licitações.',
      },
      {
        status: 500,
      }
    );
  }
}