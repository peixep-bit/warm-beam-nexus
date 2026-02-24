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

  // Valor líquido conciliado = VALOR DOS ITENS + INCENTIVO LOJA + TAXAS E COMISSOES
  // incLoja e taxasComissoes vêm negativos do iFood, são somados diretamente
  const valorLiquidoConciliado = valorPdv + incLoja + taxasComissoes;

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
    // iFood: "TAXA DE ENTREGA PAGA PELO CLIENTE (R$)"
    valor_taxa_entrega: parseNumber(get(
      "taxa_de_entrega_paga_pelo_cliente__r__", "taxa_de_entrega_paga_pelo_cliente",
      "taxa_entrega", "valor_taxa_entrega", "frete", "delivery_fee", "entrega"
    )),
    // iFood: "VALOR LIQUIDO (R$)"
    valor_liquido: parseNumber(get(
      "valor_liquido__r__", "valor_liquido", "liquido", "net", "repasse", "valor_repasse", "total_liquido"
    )),
    // iFood: "ID CURTO DO PEDIDO"
    numero_pedido: String(get(
      "id_curto_do_pedido", "id_completo_do_pedido", "pedido", "numero_pedido",
      "order", "id_pedido", "cod_pedido", "codigo_pedido"
    ) || ""),
    // iFood: "FORMA DE PAGAMENTO"
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

export async function parseXLSX(file: File): Promise<ParsedRow[]> {
  // Dynamic import to avoid React duplicate instance issues
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (jsonData.length === 0) return [];

  return jsonData.map(raw => {
    const record: Record<string, string | number> = {};
    for (const key of Object.keys(raw)) {
      const normalized = normalizeHeader(key);
      const val = raw[key];
      record[normalized] = typeof val === "number" ? val : String(val ?? "");
    }
    return rowFromRecord(record);
  });
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
