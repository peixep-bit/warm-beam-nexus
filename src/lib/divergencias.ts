/**
 * Detecção automática de divergências em pedidos.
 *
 * Tipos detectados:
 *  - taxa_excedente: taxa cobrada pela plataforma > taxa esperada pelas regras
 *  - repasse_faltante: pedido existe no PDV mas não houve repasse no extrato
 *  - cancelamento_nao_reembolsado: pedido cancelado mas houve dedução de taxa
 *  - nenhuma: sem divergência relevante (dentro da tolerância)
 *
 * A detecção é IDEMPOTENTE — pode ser rodada várias vezes sem efeitos colaterais.
 */
import { aplicarRegras, type FeeRule, type BaseValues } from "./calculo-conciliacao";

export type DivergenciaTipo =
  | "taxa_excedente"
  | "repasse_faltante"
  | "cancelamento_nao_reembolsado"
  | "nenhuma";

export type TratativaStatus = "nao_tratado" | "em_contestacao" | "recuperado" | "perdido";

export type OrderStatus = "entregue" | "cancelado" | "parcial" | "chargeback";

export interface PedidoParaDivergencia {
  id: string;
  numero_pedido?: string | null;
  data_transacao: string;
  valor_pdv?: number | null;
  valor_bruto?: number | null;
  valor_liquido?: number | null;
  taxas_comissoes?: number | null;
  valor_taxa_entrega?: number | null;
  desconto?: number | null;
  incentivo_loja?: number | null;
  marca?: string | null;
  cnpj?: string | null;
  loja?: string | null;
  order_status?: string | null;
  source_type?: string | null;
}

export interface ResultadoDivergencia {
  id: string;
  divergencia_tipo: DivergenciaTipo;
  divergencia_valor: number; // positivo = a recuperar
  motivo: string;
}

const TOLERANCIA_PADRAO = 0.05;

/**
 * Classifica um único pedido.
 */
export function classificarPedido(
  pedido: PedidoParaDivergencia,
  rules: FeeRule[],
  tolerancia = TOLERANCIA_PADRAO,
): ResultadoDivergencia {
  const status = (pedido.order_status ?? "entregue") as OrderStatus;
  const taxaCobrada = Math.abs(Number(pedido.taxas_comissoes ?? 0));

  // 1) Cancelamento não reembolsado: pedido cancelado mas taxa foi cobrada
  if ((status === "cancelado" || status === "chargeback") && taxaCobrada > tolerancia) {
    return {
      id: pedido.id,
      divergencia_tipo: "cancelamento_nao_reembolsado",
      divergencia_valor: round2(taxaCobrada),
      motivo: `Pedido ${status} com taxa de R$ ${taxaCobrada.toFixed(2)} cobrada`,
    };
  }

  // 2) Repasse faltante: tem valor bruto/PDV, mas líquido zerado
  const bruto = Number(pedido.valor_bruto ?? pedido.valor_pdv ?? 0);
  const liquido = Number(pedido.valor_liquido ?? 0);
  if (bruto > tolerancia && Math.abs(liquido) < tolerancia && status === "entregue") {
    return {
      id: pedido.id,
      divergencia_tipo: "repasse_faltante",
      divergencia_valor: round2(bruto),
      motivo: `Pedido entregue de R$ ${bruto.toFixed(2)} sem repasse no extrato`,
    };
  }

  // 3) Taxa excedente: comparar taxa real cobrada vs. taxa esperada das regras
  if (rules.length > 0 && status === "entregue") {
    const valorItens = Number(pedido.valor_pdv ?? pedido.valor_bruto ?? 0);
    if (valorItens > 0) {
      const baseValues: BaseValues = {
        LiqPDV: valorItens,
        ValorItens: valorItens,
        ValorBruto: bruto || valorItens,
      };
      const { deductions } = aplicarRegras(baseValues, rules);
      const taxaEsperada = Math.abs(deductions.reduce((a, d) => a + d.value, 0));
      const diferenca = round2(taxaCobrada - taxaEsperada);
      if (diferenca > tolerancia) {
        return {
          id: pedido.id,
          divergencia_tipo: "taxa_excedente",
          divergencia_valor: diferenca,
          motivo: `Taxa cobrada R$ ${taxaCobrada.toFixed(2)} vs. esperada R$ ${taxaEsperada.toFixed(2)}`,
        };
      }
    }
  }

  return {
    id: pedido.id,
    divergencia_tipo: "nenhuma",
    divergencia_valor: 0,
    motivo: "",
  };
}

/**
 * Classifica em lote.
 */
export function classificarPedidos(
  pedidos: PedidoParaDivergencia[],
  rules: FeeRule[],
  tolerancia = TOLERANCIA_PADRAO,
): ResultadoDivergencia[] {
  return pedidos.map((p) => classificarPedido(p, rules, tolerancia));
}

export const ROTULO_TIPO: Record<DivergenciaTipo, string> = {
  taxa_excedente: "Taxa cobrada a maior",
  repasse_faltante: "Repasse não recebido",
  cancelamento_nao_reembolsado: "Cancelamento sem reembolso",
  nenhuma: "Sem divergência",
};

export const ROTULO_TRATATIVA: Record<TratativaStatus, string> = {
  nao_tratado: "Não tratado",
  em_contestacao: "Em contestação",
  recuperado: "Recuperado",
  perdido: "Perdido",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
