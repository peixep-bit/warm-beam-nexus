export interface FileMetadata {
  loja?: string;
  datas?: string;
  parceiros?: string;
  gerado_em?: string;
}

export interface ParsedRow {
  data_transacao: string;
  loja: string;
  cnpj: string;
  descricao: string;
  quantidade_pedidos: number;
  valor_pdv: number;
  valor_bruto: number;
  desconto: number;
  taxa: number;
  valor_taxa_entrega: number;
  valor_liquido: number;
  numero_pedido: string;
  forma_pagamento: string;
  incentivo_ifood: number;
  incentivo_loja: number;
  incentivo_rede: number;
  taxa_servico: number;
  taxas_comissoes: number;
  valor_liquido_conciliado: number;
}

function parseNumber(value: string | number | undefined | null): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[R$\s]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function parseInteger(value: string | number | undefined | null): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Math.round(value);
  return parseInt(String(value).replace(/\D/g, ""), 10) || 0;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_");
}

function parseDate(value: string | number | undefined | null): string {
  if (!value) return new Date().toISOString().split("T")[0];
  const s = String(value).trim();
  // DD/MM/YYYY HH:MM:SS → YYYY-MM-DD
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function rowFromRecord(row: Record<string, string | number>): ParsedRow {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    return "";
  };

  // --- Detect layout: PDV/Delivery report vs iFood extract ---
  const isDeliveryReport = row["parceiro"] !== undefined || row["marca"] !== undefined
    || row["total_em_produtos"] !== undefined || row["total_pago_no_parceiro"] !== undefined;

  if (isDeliveryReport) {
    // Delivery report layout (DK Barra Funda, etc.)
    const totalProdutos = parseNumber(get("total_em_produtos"));
    const descontoLojaVenda = parseNumber(get("desconto_loja_em_venda"));
    const descontoLojaProdutos = parseNumber(get("desconto_loja_em_produtos"));
    const descontoLojaTaxaEntrega = parseNumber(get("desconto_loja_em_taxa_de_entrega"));
    const descontoParceiroVenda = parseNumber(get("desconto_parceiro_em_venda"));
    const descontoParceiroProdutos = parseNumber(get("desconto_parceiro_em_produtos"));
    const descontoParceiroTaxaEntrega = parseNumber(get("desconto_parceiro_em_taxa_de_entrega"));
    const taxaEntrega = parseNumber(get("taxa_de_entrega"));
    const totalPagoNoParceiro = parseNumber(get("total_pago_no_parceiro"));
    const totalFaturadoPDV = parseNumber(get("total_do_faturado_no_pdv"));

    // Incentivo loja = descontos em venda + produtos (sem taxa de entrega)
    const incentivoLoja = -(descontoLojaVenda + descontoLojaProdutos);
    const incentivoParceiro = -(descontoParceiroVenda + descontoParceiroProdutos);
    // Desconto = descontos sobre taxa de entrega (loja + parceiro)
    const desconto = descontoLojaTaxaEntrega + descontoParceiroTaxaEntrega;

    // valor_liquido_conciliado = Total Produtos + Incentivo Loja + Taxa Entrega - Desconto
    const valorLiquidoConciliado = totalProdutos + incentivoLoja + taxaEntrega - desconto;

    return {
      data_transacao: parseDate(get("data")),
      loja: String(get("loja") || ""),
      cnpj: "",
      descricao: String(get("status_no_parceiro__referente_ao_id_de_status_no_sac_", "status_no_parceiro", "status_no_pdv") || ""),
      quantidade_pedidos: 1,
      valor_pdv: totalProdutos,
      valor_bruto: totalPagoNoParceiro || totalFaturadoPDV || totalProdutos,
      desconto,
      taxa: 0,
      valor_taxa_entrega: taxaEntrega,
      valor_liquido: totalPagoNoParceiro,
      numero_pedido: String(get("numero_do_pedido_no_parceiro", "numero_do_pedido_no_pdv") || ""),
      forma_pagamento: String(get("forma_de_pagamento_no_parceiro", "forma_pagamento") || ""),
      incentivo_ifood: incentivoParceiro,
      incentivo_loja: incentivoLoja,
      incentivo_rede: 0,
      taxa_servico: 0,
      taxas_comissoes: 0,
      valor_liquido_conciliado: valorLiquidoConciliado,
      // Extra fields stored via the marca column in the file
      marca: String(get("marca") || ""),
      parceiro: String(get("parceiro") || ""),
    } as ParsedRow & { marca?: string; parceiro?: string };
  }

  // --- Original iFood extract layout ---
  // iFood: TAXAS E COMISSOES (negativo no arquivo)
  const taxasComissoes = parseNumber(get(
    "taxas_e_comissoes__r__", "taxas_e_comissoes", "comissoes", "comissao",
    "taxa_plataforma", "comissao_plataforma", "fee"
  ));
  // iFood: TAXA DE SERVIÇO
  const taxaServico = parseNumber(get("taxa_de_servico__r__", "taxa_de_servico"));
  // taxa total = absoluto das comissões + taxa de serviço
  const taxa = Math.abs(taxasComissoes) + taxaServico;

  // iFood: incentivos individuais
  const incIFood = parseNumber(get("incentivo_promocional_do_ifood__r__", "incentivo_promocional_do_ifood", "incentivo_ifood"));
  const incLoja  = parseNumber(get("incentivo_promocional_da_loja__r__",  "incentivo_promocional_da_loja",  "incentivo_loja"));
  const incRede  = parseNumber(get("incentivo_promocional_da_rede__r__",  "incentivo_promocional_da_rede",  "incentivo_rede"));
  const descontoExplicito = Math.abs(parseNumber(get("desconto", "discount", "promocao", "valor_desconto", "descontos")));
  const desconto = descontoExplicito || (incIFood + incLoja + incRede);

  // Valor dos itens (PDV)
  const valorPdv = parseNumber(get(
    "valor_dos_itens__r__", "valor_dos_itens", "valor_pdv", "pdv",
    "faturado_pdv", "valor_cardapio", "preco_cardapio"
  ));

  // Valor líquido conciliado = VALOR DOS ITENS + INCENTIVO LOJA + TAXAS E COMISSOES + TAXA ENTREGA - DESCONTO
  const taxaEntrega = parseNumber(get(
    "taxa_de_entrega_paga_pelo_cliente__r__", "taxa_de_entrega_paga_pelo_cliente",
    "taxa_entrega", "valor_taxa_entrega", "frete", "delivery_fee", "entrega"
  ));
  const valorLiquidoConciliado = valorPdv + incLoja + taxasComissoes + taxaEntrega - desconto;

  return {
    data_transacao: parseDate(get(
      "data_e_hora_do_pedido", "data_transacao", "data", "date", "data_pedido", "data_venda"
    )),
    loja: String(get("nome_da_loja", "loja", "nome_loja", "store", "estabelecimento", "restaurante") || ""),
    cnpj: String(get("cnpj", "cnpj_loja", "documento", "id_da_loja") || ""),
    descricao: String(get(
      "status_final_do_pedido", "descricao", "description", "desc", "produto", "status"
    ) || ""),
    quantidade_pedidos: parseInteger(get(
      "quantidade_pedidos", "qtd_pedidos", "pedidos", "orders", "qtd", "quantidade"
    )) || 1,
    valor_pdv: valorPdv,
    valor_bruto: parseNumber(get(
      "total_pago_pelo_cliente__r__", "total_pago_pelo_cliente",
      "valor_bruto", "valor", "bruto", "gross", "subtotal", "total_pedido"
    )),
    desconto,
    taxa,
    valor_taxa_entrega: taxaEntrega,
    valor_liquido: parseNumber(get(
      "valor_liquido__r__", "valor_liquido", "liquido", "net", "repasse", "valor_repasse", "total_liquido"
    )),
    numero_pedido: String(get(
      "id_curto_do_pedido", "id_completo_do_pedido", "pedido", "numero_pedido",
      "order", "id_pedido", "cod_pedido", "codigo_pedido"
    ) || ""),
    forma_pagamento: String(get(
      "forma_de_pagamento", "forma_pagamento", "pagamento", "payment", "metodo_pagamento"
    ) || ""),
    incentivo_ifood: incIFood,
    incentivo_loja: incLoja,
    incentivo_rede: incRede,
    taxa_servico: taxaServico,
    taxas_comissoes: taxasComissoes,
    valor_liquido_conciliado: valorLiquidoConciliado,
  };
}

export function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(/[;,\t]/).map(normalizeHeader);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/[;,\t]/).map(v => v.trim().replace(/^"|"$/g, ""));
    if (values.length < 2 || values.every(v => v === "")) continue;

    const record: Record<string, string | number> = {};
    headers.forEach((h, idx) => { record[h] = values[idx] || ""; });

    rows.push(rowFromRecord(record));
  }

  return rows;
}

export function extractMetadata(workbook: any): FileMetadata {
  const meta: FileMetadata = {};
  // Try "Dados de Origem" sheet
  const metaSheetName = workbook.SheetNames.find((n: string) =>
    n.toLowerCase().includes("dados de origem") || n.toLowerCase().includes("dados_de_origem")
  );
  if (metaSheetName) {
    const ws = workbook.Sheets[metaSheetName];
    const XLSX = require("xlsx");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1, defval: "" });
    for (const row of rows) {
      const cells = Object.values(row).map((v: any) => String(v ?? "").trim());
      const key = cells[0]?.toLowerCase() || "";
      const val = cells[1] || "";
      if (key.includes("loja")) meta.loja = val;
      if (key.includes("datas")) meta.datas = val;
      if (key.includes("parceiro")) meta.parceiros = val;
      if (key.includes("gerado")) meta.gerado_em = val;
    }
  }
  return meta;
}

export async function parseXLSX(file: File): Promise<{ rows: ParsedRow[]; metadata: FileMetadata }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    raw: true,
  });

  const metadata = extractMetadata(workbook);

  // Find the data sheet (first sheet that is NOT "Dados de Origem" or "Legendas")
  const dataSheetName = workbook.SheetNames.find((n: string) => {
    const lower = n.toLowerCase();
    return !lower.includes("dados de origem") && !lower.includes("legendas");
  }) || workbook.SheetNames[0];

  const worksheet = workbook.Sheets[dataSheetName];
  if (!worksheet) return { rows: [], metadata };

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: true,
  });

  if (json.length === 0) return { rows: [], metadata };

  const rows = json.map((row) => {
    const record: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(row)) {
      record[normalizeHeader(key)] = typeof value === "number" ? value : String(value ?? "");
    }
    return rowFromRecord(record);
  });

  return { rows, metadata };
}

export async function parseFile(file: File): Promise<ParsedRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    return parseXLSX(file);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        resolve(parseCSV(ev.target?.result as string));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsText(file, "UTF-8");
  });
}
