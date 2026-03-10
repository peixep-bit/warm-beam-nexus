/**
 * Função central de cálculo do valor líquido para lançamento no PDV.
 *
 * REGRA:
 *   VALOR_LIQUIDO_PDV = VALOR_DOS_ITENS + INCENTIVO_LOJA + TAXAS_E_COMISSOES
 *                       + TAXA_ENTREGA - DESCONTO
 *
 * - "Valor dos Itens" é a base principal.
 * - "Incentivo Promocional Loja" é somado (vem negativo do extrato).
 * - "Taxas e Comissões" são somadas (vem negativo do extrato).
 * - "Taxa de Entrega" é somada (valor positivo).
 * - "Desconto" é subtraído (valor positivo – desconto sobre taxa de entrega).
 * - Campos vazios/nulos são tratados como 0.
 *
 * Isolada para facilitar ajustes futuros sem mexer no restante do sistema.
 */
export function calcularTotalLiquidoPDV(
  valorItens: number | null | undefined,
  incentivoLoja: number | null | undefined,
  taxasEComissoes: number | null | undefined,
  taxaEntrega: number | null | undefined = 0,
  desconto: number | null | undefined = 0,
): number {
  const itens = valorItens ?? 0;
  const incentivo = incentivoLoja ?? 0;       // vem negativo do iFood
  const comissoes = taxasEComissoes ?? 0;     // vem negativo do iFood
  const entrega = taxaEntrega ?? 0;           // positivo
  const desc = desconto ?? 0;                 // positivo
  return itens + incentivo + comissoes + entrega - desc;
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
  valor_taxa_entrega?: number | null;
  desconto?: number | null;
  [key: string]: unknown;
}

export interface FeeRule {
  name: string;
  percentage: number | null;
  fixed_amount: number | null;
  base_field: string;
}

/**
 * Aplica uma lista de regras de taxa sobre o valor base (ex: LiqPDV).
 * Retorna o array de valores deduzidos e o valor conciliado final.
 */
export function aplicarRegras(
  liqPDV: number,
  rules: FeeRule[],
): { deductions: { name: string; value: number }[]; conciliado: number } {
  const deductions: { name: string; value: number }[] = [];
  let total = liqPDV;
  for (const rule of rules) {
    let value = 0;
    if (rule.percentage != null) {
      value = liqPDV * (-Math.abs(rule.percentage) / 100); // always deduct
    }
    if (rule.fixed_amount != null) {
      value += -Math.abs(rule.fixed_amount); // always deduct
    }
    deductions.push({ name: rule.name, value });
    total += value; // value is negative, so this deducts
  }
  return { deductions, conciliado: total };
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
      acc + calcularTotalLiquidoPDV(i.valor_pdv, i.incentivo_loja, i.taxas_comissoes, i.valor_taxa_entrega, i.desconto),
    0,
  );
  return { total, quantidade: filtered.length };
}
