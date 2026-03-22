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
  // Se o desconto sobre taxa de entrega for maior que a própria taxa, zerar (não ficar negativo)
  const entregaLiquida = Math.max(0, entrega - desc);
  return itens + incentivo + comissoes + entregaLiquida;
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
 * Mapa de valores-base para cálculo de regras.
 * Cada regra pode referenciar um campo diferente (LiqPDV, ValorItens, etc.)
 */
export interface BaseValues {
  LiqPDV: number;
  ValorItens: number;
  ValorBruto: number;
  [key: string]: number;
}

/**
 * Aplica uma lista de regras de taxa, respeitando o base_field de cada uma.
 * Retorna o array de valores deduzidos e o valor conciliado final.
 */
export function aplicarRegras(
  baseValues: BaseValues,
  rules: FeeRule[],
): { deductions: { name: string; value: number }[]; conciliado: number } {
  const deductions: { name: string; value: number }[] = [];
  let total = baseValues.LiqPDV;
  for (const rule of rules) {
    const base = baseValues[rule.base_field] ?? baseValues.LiqPDV;
    let value = 0;
    if (rule.percentage != null) {
      // Arredondamento financeiro: 2 casas decimais
      value = Math.round(base * (-Math.abs(rule.percentage) / 100) * 100) / 100;
    }
    if (rule.fixed_amount != null) {
      value += -Math.abs(rule.fixed_amount);
    }
    value = Math.round(value * 100) / 100;
    deductions.push({ name: rule.name, value });
    total += value;
  }
  return { deductions, conciliado: Math.round(total * 100) / 100 };
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
