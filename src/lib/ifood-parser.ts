/**
 * ifood-parser.ts
 * Parser dedicado para os dois arquivos iFood:
 *   1. Extrato de pedidos (portal iFood → Relatórios → Pedidos)
 *   2. Relatório PDV (exportação do sistema de caixa integrado)
 *
 * Fórmula de cruzamento validada com dados reais:
 *   Chave:       ID CURTO DO PEDIDO (extrato) = Número do pedido no Parceiro (PDV)
 *   Divergência: Total do Faturado no PDV vs VALOR LIQUIDO (iFood)
 */

import * as XLSX from "xlsx";

// ─── Tipos ────────────────────────────────────────────────────

export interface IFoodExtratoRow {
  id_completo: string;
  id_curto: string;            // chave de cruzamento
  loja: string;
  data_transacao: string;      // YYYY-MM-DD
  hora: string;
  turno: string;
  order_status: "entregue" | "cancelado" | "cancelamento_parcial" | "pendente";
  canal_venda: string;
  produto_logistico: string;
  forma_pagamento: string;
  // Valores — VALOR LIQUIDO é a fonte de verdade do repasse
  valor_itens: number;         // VALOR DOS ITENS — chave de cruzamento com PDV
  total_cliente: number;       // TOTAL PAGO PELO CLIENTE
  taxa_entrega: number;        // retida pelo iFood — NÃO entra no repasse
  incentivo_ifood: number;
  incentivo_loja: number;
  incentivo_rede: number;
  taxa_servico: number;
  taxas_comissoes: number;     // já negativo
  valor_liquido: number;       // FONTE DE VERDADE do repasse
  tipo: "pedido" | "sob_demanda";
}

export interface IFoodPDVRow {
  loja: string;
  marca: string;
  data_transacao: string;
  hora: string;
  numero_pdv: string;
  numero_parceiro: string;     // chave de cruzamento
  tem_erro: boolean;
  motivo_erro: string | null;
  // Valores
  total_produtos: number;      // valor dos itens (sem entrega)
  desconto_loja_venda: number;
  desconto_loja_produto: number;
  desconto_loja_entrega: number;
  desconto_parceiro_venda: number;
  desconto_parceiro_produtos: number;   // campo real onde o desconto de campanha cai
  desconto_parceiro_entrega: number;
  taxa_entrega: number;
  total_pago_parceiro: number;
  total_faturado: number;      // o que o PDV espera receber (campo direto do arquivo)
  total_faturado_calculado: number; // recalculado pela fórmula completa (deve = total_faturado)
  // Desconto total bancado pela loja (venda + produto)
  desconto_loja_total: number;
  forma_pagamento: string;
  status_parceiro: "entregue" | "cancelado" | "pendente";
  status_pdv: string;
  motivo_cancelamento: string | null;
}

export interface ReconciliacaoItem {
  id_curto: string;
  status:
    | "conciliado"
    | "divergente_valor"
    | "divergente_status"
    | "nao_encontrado_pdv"
    | "nao_encontrado_extrato"
    | "cancelado"
    | "sob_demanda";
  // Valores das duas fontes
  valor_itens_ifood: number;
  total_faturado_pdv: number;
  valor_liquido_ifood: number;
  // Comissão iFood = total_faturado_pdv - valor_liquido_ifood (sempre positivo, é o custo)
  divergencia_repasse: number;
  // Campos financeiros discriminados — para Conciliação e Fechamento
  taxas_comissoes?: number;    // já negativo
  incentivo_ifood?: number;
  incentivo_loja?: number;
  incentivo_rede?: number;
  taxa_servico?: number;
  taxa_entrega?: number;       // retida pelo iFood
  // Desconto da loja (venda + produto) — explica diferença Valor Itens vs Total Faturado PDV
  desconto_loja_pdv?: number;
  // Auditoria do cálculo do líquido
  liquido_metodo?: string;   // como o líquido foi calculado
  liquido_ajuste?: number;   // valor do incentivo somado (0 = sem ajuste)
  // Metadados
  loja: string;
  data_transacao: string;
  forma_pagamento: string;
  motivo?: string;
}

export interface ResumoReconciliacao {
  total_pedidos: number;
  conciliados: number;
  divergentes: number;
  cancelados: number;
  sob_demanda: number;
  total_bruto_ifood: number;    // soma VALOR DOS ITENS
  total_faturado_pdv: number;   // soma Total Faturado PDV
  total_liquido_ifood: number;  // soma VALOR LIQUIDO — o que de fato entra
  diferenca_repasse: number;    // total_faturado_pdv - total_liquido_ifood
  pct_conciliado: number;
}

// ─── Utilitários ─────────────────────────────────────────────

const norm = (s: unknown) =>
  String(s ?? "").replace(/^0+/, "").trim() || String(s ?? "").trim();

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function parseDate(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function parseHora(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = s.match(/(\d{2}:\d{2}:\d{2})$/);
  return m ? m[1] : "00:00:00";
}

function parseStatus(s: string): IFoodExtratoRow["order_status"] {
  const u = s.toUpperCase().trim();
  if (u === "CONCLUIDO" || u === "ENTREGUE") return "entregue";
  if (u.includes("PARCIAL")) return "cancelamento_parcial";
  if (u.includes("CANCEL")) return "cancelado";
  return "pendente";
}

function parseStatusPDV(s: string): IFoodPDVRow["status_parceiro"] {
  const u = s.toLowerCase().trim();
  if (u === "entregue" || u === "concluido") return "entregue";
  if (u.includes("cancel")) return "cancelado";
  return "pendente";
}

function lerXlsx(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 0,
    defval: "",
  });
}

// ─── Parser 1: Extrato iFood ──────────────────────────────────

export async function parseIFoodExtrato(file: File): Promise<IFoodExtratoRow[]> {
  const buf = await file.arrayBuffer();
  const rows = lerXlsx(buf);

  return rows
    .filter((r) => String(r["ID COMPLETO DO PEDIDO"] ?? "").trim())
    .map((r) => {
      const liq = parseNum(r["VALOR LIQUIDO (R$)"]);
      const pl = String(r["PRODUTO LOGISTICO"] ?? "").trim();
      const dh = String(r["DATA E HORA DO PEDIDO"] ?? "");
      return {
        id_completo: String(r["ID COMPLETO DO PEDIDO"]).trim(),
        id_curto: String(r["ID CURTO DO PEDIDO"] ?? "").trim(),
        loja: String(r["NOME DA LOJA"] ?? "").trim(),
        data_transacao: parseDate(dh),
        hora: parseHora(dh),
        turno: String(r["TURNO"] ?? "").trim(),
        order_status: parseStatus(String(r["STATUS FINAL DO PEDIDO"] ?? "")),
        canal_venda: String(r["CANAL DE VENDA"] ?? "iFood").trim(),
        produto_logistico: pl,
        forma_pagamento: String(r["FORMA DE PAGAMENTO"] ?? "").trim(),
        valor_itens: parseNum(r["VALOR DOS ITENS (R$)"]),
        total_cliente: parseNum(r["TOTAL PAGO PELO CLIENTE (R$)"]),
        taxa_entrega: parseNum(r["TAXA DE ENTREGA PAGA PELO CLIENTE (R$)"]),
        incentivo_ifood: parseNum(r["INCENTIVO PROMOCIONAL DO IFOOD (R$)"]),
        incentivo_loja: parseNum(r["INCENTIVO PROMOCIONAL DA LOJA (R$)"]),
        incentivo_rede: parseNum(r["INCENTIVO PROMOCIONAL DA REDE (R$)"]),
        taxa_servico: parseNum(r["TAXA DE SERVIÇO (R$)"]),
        taxas_comissoes: parseNum(r["TAXAS E COMISSOES (R$)"]),
        valor_liquido: liq,
        tipo: pl.toUpperCase().includes("SOB DEMANDA") && liq < 0
          ? "sob_demanda"
          : "pedido",
      } as IFoodExtratoRow;
    });
}

// ─── Parser 2: PDV iFood ──────────────────────────────────────

export async function parseIFoodPDV(file: File): Promise<IFoodPDVRow[]> {
  const buf = await file.arrayBuffer();
  const rows = lerXlsx(buf);

  return rows
    .filter((r) => String(r["Número do pedido no Parceiro"] ?? "").trim())
    .map((r) => ({
      loja: String(r["Loja"] ?? "").trim(),
      marca: String(r["Marca"] ?? "").trim(),
      data_transacao: parseDate(r["Data"]),
      hora: parseHora(r["Horário"]),
      numero_pdv: String(r["Número do pedido no PDV"] ?? "").trim(),
      numero_parceiro: String(r["Número do pedido no Parceiro"]).trim(),
      tem_erro: String(r["Possui Erro de Integração?"] ?? "") === "Sim",
      motivo_erro: String(r["Motivo do erro de integração"] ?? "") || null,
      total_produtos: parseNum(r["Total em Produtos"]),
      desconto_loja_venda: parseNum(r["Desconto loja em Venda"]),
      desconto_loja_produto: parseNum(r["Desconto loja em Produtos"]),
      desconto_loja_entrega: parseNum(r["Desconto loja em Taxa de Entrega"]),
      desconto_parceiro_venda: parseNum(r["Desconto Parceiro em Venda"]),
      desconto_parceiro_produtos: parseNum(r["Desconto Parceiro em Produtos"]),
      desconto_parceiro_entrega: parseNum(r["Desconto Parceiro em Taxa de Entrega"]),
      taxa_entrega: parseNum(r["Taxa de entrega"]),
      total_pago_parceiro: parseNum(r["Total Pago no Parceiro"]),
      total_faturado: parseNum(r["Total do Faturado no PDV"]),
      // desconto_loja_total = o que foi descontado da loja nos itens (visível no PDV)
      // Não inclui desconto de entrega pois taxa entrega entra e sai
      desconto_loja_total: parseNum(r["Desconto loja em Venda"]) + parseNum(r["Desconto loja em Produtos"]),
      // Total Faturado calculado pela fórmula completa — para validação
      // Total em Produtos - DescLojaVenda - DescLojaProdutos + TaxaEntrega - DescLojaEntrega - DescParceiroEntrega
      total_faturado_calculado:
        parseNum(r["Total em Produtos"])
        - parseNum(r["Desconto loja em Venda"])
        - parseNum(r["Desconto loja em Produtos"])
        + parseNum(r["Taxa de entrega"])
        - parseNum(r["Desconto loja em Taxa de Entrega"])
        - parseNum(r["Desconto Parceiro em Taxa de Entrega"]),
      forma_pagamento: String(r["Forma de pagamento no Parceiro"] ?? "").trim(),
      status_parceiro: parseStatusPDV(
        String(r["Status no Parceiro (Referente ao ID de Status no SAC)"] ?? "")
      ),
      status_pdv: String(r["Status no PDV"] ?? "").trim(),
      motivo_cancelamento:
        String(r["Motivo de cancelamento no Parceiro"] ?? "") || null,
    })) as IFoodPDVRow[];
}


// ─── Regra de negócio: cálculo do líquido esperado ────────────
// Valida se o líquido do iFood pode ser explicado pela fórmula base
// + incentivos subsidiados. Útil para auditoria e flag de ajuste.

interface LiquidoCalculado {
  valor: number;
  metodo: "base" | "base_mais_inc_loja" | "base_mais_inc_ifood" | "base_mais_inc_rede" | "ifood_fonte_verdade" | "cancelado";
  ajuste: number;     // valor do incentivo que foi somado (0 se não houve ajuste)
}

function calcularLiquidoEsperado(
  totalFaturadoPDV: number,
  taxasComissoes: number,      // já negativo ou positivo — usamos abs
  incentivoLoja: number,
  incentivoIfood: number,
  incentivoRede: number,
  liquidoReal: number,
  cancelado: boolean,
  tolerancia = 0.03
): LiquidoCalculado {
  // Cancelado: iFood não repassa nada — líquido = 0
  if (cancelado || liquidoReal <= 0) {
    return { valor: 0, metodo: "cancelado", ajuste: 0 };
  }

  const calcBase = totalFaturadoPDV - Math.abs(taxasComissoes);
  const diff = Math.round((liquidoReal - calcBase) * 100) / 100;

  // Caso 1: fórmula base fecha exatamente
  if (Math.abs(diff) <= tolerancia) {
    return { valor: calcBase, metodo: "base", ajuste: 0 };
  }

  // Caso 2: incentivo loja foi reintegrado ao repasse
  if (incentivoLoja > 0 && Math.abs(diff - incentivoLoja) <= tolerancia) {
    return { valor: calcBase + incentivoLoja, metodo: "base_mais_inc_loja", ajuste: incentivoLoja };
  }

  // Caso 3: incentivo iFood foi reintegrado ao repasse
  if (incentivoIfood > 0 && Math.abs(diff - incentivoIfood) <= tolerancia) {
    return { valor: calcBase + incentivoIfood, metodo: "base_mais_inc_ifood", ajuste: incentivoIfood };
  }

  // Caso 4: incentivo rede foi reintegrado
  if (incentivoRede > 0 && Math.abs(diff - incentivoRede) <= tolerancia) {
    return { valor: calcBase + incentivoRede, metodo: "base_mais_inc_rede", ajuste: incentivoRede };
  }

  // Fallback: diferença não explicada por incentivos → usar valor_liquido real do iFood
  // Ex: pedido #3643 com diff=4.82 não explicada — taxa oculta do iFood
  return { valor: liquidoReal, metodo: "ifood_fonte_verdade", ajuste: 0 };
}

// ─── Engine de reconciliação client-side ─────────────────────

export function reconciliar(
  extrato: IFoodExtratoRow[],
  pdv: IFoodPDVRow[],
  tolerancia = 0.05
): ReconciliacaoItem[] {
  const resultado: ReconciliacaoItem[] = [];

  const pdvMap = new Map<string, IFoodPDVRow>();
  pdv.forEach((p) => pdvMap.set(norm(p.numero_parceiro), p));

  const extratoMap = new Map<string, IFoodExtratoRow>();
  extrato.forEach((e) => extratoMap.set(norm(e.id_curto), e));

  // Sob Demanda (débitos avulsos de entrega)
  extrato
    .filter((e) => e.tipo === "sob_demanda")
    .forEach((e) =>
      resultado.push({
        id_curto: e.id_curto,
        status: "sob_demanda",
        valor_itens_ifood: e.valor_itens,
        total_faturado_pdv: 0,
        valor_liquido_ifood: e.valor_liquido,
        divergencia_repasse: e.valor_liquido,
        loja: e.loja,
        data_transacao: e.data_transacao,
        forma_pagamento: "Pagamento via restaurante",
        motivo: `Entrega avulsa debitada — R$ ${Math.abs(e.valor_liquido).toFixed(2)}`,
      })
    );

  // Extrato × PDV
  extrato
    .filter((e) => e.tipo === "pedido")
    .forEach((e) => {
      const key = norm(e.id_curto);
      const p = pdvMap.get(key);

      if (!p) {
        resultado.push({
          id_curto: e.id_curto,
          status: e.order_status === "cancelado" ? "cancelado" : "nao_encontrado_pdv",
          valor_itens_ifood: e.valor_itens,
          total_faturado_pdv: 0,
          valor_liquido_ifood: e.valor_liquido,
          divergencia_repasse: e.valor_liquido,
          loja: e.loja,
          data_transacao: e.data_transacao,
          forma_pagamento: e.forma_pagamento,
          motivo:
            e.order_status === "cancelado"
              ? "Cancelado no iFood"
              : "Pedido no extrato sem correspondente no PDV",
        });
        return;
      }

      // divergencia_repasse = comissão iFood (diferença entre faturado PDV e líquido recebido)
      // SEMPRE existe — é o custo da plataforma. Não é erro de conciliação, é informativo.
      const divergencia_repasse = Math.round((p.total_faturado - e.valor_liquido) * 100) / 100;

      // Cruzamento correto: VALOR DOS ITENS vendidos deve ser igual nos dois lados
      // Se difere → pedido editado, cancelamento parcial ou erro de lançamento → DIVERGENTE
      const diff_itens = Math.abs(e.valor_itens - p.total_produtos);

      const conflito_status =
        p.status_pdv.toLowerCase() === "pago" && p.status_parceiro === "cancelado";

      // Detectar cancelamento pelo extrato iFood (fonte de verdade do status)
      const extratoCancelado = e.order_status === "cancelado" || e.order_status === "cancelamento_parcial";

      let status: ReconciliacaoItem["status"] = "conciliado";
      let motivo: string | undefined;

      if (extratoCancelado) {
        // Extrato iFood confirma cancelamento — não entra nos totais financeiros
        status = "cancelado";
        motivo = `Cancelado no iFood — valor líquido R$ 0,00`;
      } else if (conflito_status) {
        // PDV marcou pago mas iFood cancelou → risco real de perda financeira
        status = "divergente_status";
        motivo = `PDV=PAGO mas iFood=CANCELADO — ${p.motivo_cancelamento ?? "sem motivo"}`;
      } else if (diff_itens > tolerancia) {
        // Valor dos itens difere → mesmo pedido mas com valores diferentes
        status = "divergente_valor";
        motivo = `Valor dos itens diverge: PDV ${fmtBRL(p.total_produtos)} · iFood ${fmtBRL(e.valor_itens)} · Diff ${fmtBRL(e.valor_itens - p.total_produtos)}`;
      }
      // A diferença total_faturado_pdv vs valor_liquido_ifood = comissão → salva como info

      resultado.push({
        id_curto: e.id_curto,
        status,
        valor_itens_ifood: e.valor_itens,
        total_faturado_pdv: p.total_faturado,
        valor_liquido_ifood: e.valor_liquido,
        divergencia_repasse,
        // Campos financeiros do extrato iFood
        taxas_comissoes: e.taxas_comissoes,
        incentivo_ifood: e.incentivo_ifood,
        incentivo_loja: e.incentivo_loja,
        incentivo_rede: e.incentivo_rede,
        taxa_servico: e.taxa_servico,
        taxa_entrega: e.taxa_entrega,
        desconto_loja_pdv: p.desconto_loja_total,
        // Auditoria do líquido — aplica regra de incentivos subsidiados
        liquido_metodo: calcularLiquidoEsperado(
          p.total_faturado, e.taxas_comissoes,
          e.incentivo_loja, e.incentivo_ifood, e.incentivo_rede,
          e.valor_liquido, false
        ).metodo,
        liquido_ajuste: calcularLiquidoEsperado(
          p.total_faturado, e.taxas_comissoes,
          e.incentivo_loja, e.incentivo_ifood, e.incentivo_rede,
          e.valor_liquido, false
        ).ajuste,
        loja: p.loja || e.loja,
        data_transacao: e.data_transacao,
        forma_pagamento: e.forma_pagamento || p.forma_pagamento,
        motivo,
      });
    });

  // PDV sem extrato
  pdv
    .filter(
      (p) =>
        !extratoMap.has(norm(p.numero_parceiro)) &&
        p.status_parceiro === "entregue"
    )
    .forEach((p) =>
      resultado.push({
        id_curto: p.numero_parceiro,
        status: "nao_encontrado_extrato",
        valor_itens_ifood: 0,
        total_faturado_pdv: p.total_faturado,
        valor_liquido_ifood: 0,
        divergencia_repasse: -p.total_faturado,
        loja: p.loja,
        data_transacao: p.data_transacao,
        forma_pagamento: p.forma_pagamento,
        motivo: "Pedido no PDV sem correspondente no extrato iFood",
      })
    );

  // Ordenar: divergências primeiro
  const ordem: Record<string, number> = {
    divergente_status: 0,
    divergente_valor: 1,
    nao_encontrado_pdv: 2,
    nao_encontrado_extrato: 3,
    sob_demanda: 4,
    cancelado: 5,
    conciliado: 6,
  };
  return resultado.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));
}

export function calcularResumo(items: ReconciliacaoItem[]): ResumoReconciliacao {
  const pedidos    = items.filter((i) => i.status !== "sob_demanda");
  const conciliados = pedidos.filter((i) => i.status === "conciliado").length;
  const sob        = items.filter((i) => i.status === "sob_demanda");

  // Cancelados NÃO entram nos totais financeiros:
  // iFood não cobrou comissão e não repassou nada — incluí-los distorceria
  // a comissão total (bruto − líquido inflaria porque bruto > 0 mas líquido = 0)
  const ativos = pedidos.filter((i) => i.status !== "cancelado");

  const totalBruto  = ativos.reduce((s, i) => s + i.valor_itens_ifood, 0);
  const totalLiquido = ativos.reduce((s, i) => s + Math.max(i.valor_liquido_ifood, 0), 0);

  return {
    total_pedidos: pedidos.length,
    conciliados,
    divergentes: pedidos.filter((i) =>
      ["divergente_valor", "divergente_status",
       "nao_encontrado_pdv", "nao_encontrado_extrato"].includes(i.status)
    ).length,
    cancelados: pedidos.filter((i) => i.status === "cancelado").length,
    sob_demanda: sob.length,
    total_bruto_ifood: totalBruto,
    total_faturado_pdv: ativos.reduce((s, i) => s + i.total_faturado_pdv, 0),
    total_liquido_ifood: totalLiquido,
    diferenca_repasse: ativos.reduce((s, i) => s + i.divergencia_repasse, 0),
    pct_conciliado: pedidos.length
      ? Math.round((conciliados / pedidos.length) * 100)
      : 0,
  };
}

export const fmtBRL = (n: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
