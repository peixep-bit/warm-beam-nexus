/**
 * Função central de cálculo do valor líquido para lançamento no PDV.
 *
 * REGRA:
 *   VALOR_LIQUIDO_PDV = VALOR_DOS_ITENS + INCENTIVO_LOJA + TAXAS_E_COMISSOES
 *
 * - "Valor dos Itens" é a base principal.
 * - "Incentivo Promocional Loja" é somado (vem negativo do extrato).
 * - "Taxas e Comissões" são somadas (vem negativo do extrato).
 * - Campos vazios/nulos são tratados como 0.
 *
 * Isolada para facilitar ajustes futuros sem mexer no restante do sistema.
 */
export function calcularTotalLiquidoPDV(
  valorItens: number | null | undefined,
  incentivoLoja: number | null | undefined,
  taxasEComissoes: number | null | undefined,
): number {
  const itens = valorItens ?? 0;
  const incentivo = incentivoLoja ?? 0;   // vem negativo do iFood
  const comissoes = taxasEComissoes ?? 0; // vem negativo do iFood
  return itens + incentivo + comissoes;
}

/**
 * Dado um array de itens (linhas do extrato), filtra por CNPJ e data
 * e retorna o total líquido para lançamento no PDV.
 */
export interface ItemConciliacao {
  data_transacao: string;
  cnpj?: string | null;
  marca?: string | null;
  valor_pdv?: number | null;
  incentivo_loja?: number | null;
  taxas_comissoes?: number | null;
  [key: string]: unknown;
}

export function calcularTotalDiario(
  items: ItemConciliacao[],
  cnpj: string,
  data: string,
): { total: number; quantidade: number } {
  const filtered = items.filter(
    (i) => i.data_transacao === data && (i.cnpj === cnpj || i.marca === cnpj),
  );
  const total = filtered.reduce(
    (acc, i) =>
      acc + calcularTotalLiquidoPDV(i.valor_pdv, i.incentivo_loja, i.taxas_comissoes),
    0,
  );
  return { total, quantidade: filtered.length };
}
