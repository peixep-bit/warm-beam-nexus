import * as XLSX from "xlsx";

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
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9_]/g, "_");
}

function rowFromRecord(row: Record<string, string | number>): ParsedRow {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    return "";
  };

  return {
    data_transacao:
      String(get("data", "data_transacao", "date", "data_pedido", "data_venda") || new Date().toISOString().split("T")[0]),
    loja: String(get("loja", "nome_loja", "store", "estabelecimento", "restaurante") || ""),
    cnpj: String(get("cnpj", "cnpj_loja", "documento") || ""),
    descricao: String(get("descricao", "description", "desc", "produto") || ""),
    quantidade_pedidos: parseInteger(get("quantidade_pedidos", "qtd_pedidos", "pedidos", "orders", "qtd", "quantidade")),
    valor_pdv: parseNumber(get("valor_pdv", "pdv", "faturado_pdv", "valor_cardapio", "preco_cardapio")),
    valor_bruto: parseNumber(get("valor_bruto", "valor", "bruto", "gross", "subtotal", "total_pedido")),
    desconto: parseNumber(get("desconto", "discount", "promocao", "valor_desconto", "descontos")),
    taxa: parseNumber(get("taxa", "comissao", "fee", "taxa_plataforma", "taxa_servico", "comissao_plataforma")),
    valor_taxa_entrega: parseNumber(get("taxa_entrega", "valor_taxa_entrega", "frete", "delivery_fee", "entrega")),
    valor_liquido: parseNumber(get("valor_liquido", "liquido", "net", "repasse", "valor_repasse", "total_liquido")),
    numero_pedido: String(get("pedido", "numero_pedido", "order", "id_pedido", "cod_pedido", "codigo_pedido") || ""),
    forma_pagamento: String(get("pagamento", "forma_pagamento", "payment", "metodo_pagamento") || ""),
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
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (jsonData.length === 0) return [];

  return jsonData.map(raw => {
    // Normalize headers
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
