export interface ParsedRow {
  data_transacao: string;
  descricao: string;
  valor_bruto: number;
  taxa: number;
  desconto: number;
  valor_liquido: number;
  numero_pedido: string;
  forma_pagamento: string;
}

export function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase().replace(/"/g, ""));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/[;,]/).map(v => v.trim().replace(/"/g, ""));
    if (values.length < 2) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

    rows.push({
      data_transacao: row["data"] || row["data_transacao"] || row["date"] || new Date().toISOString().split("T")[0],
      descricao: row["descricao"] || row["description"] || row["desc"] || "",
      valor_bruto: parseNumber(row["valor_bruto"] || row["valor"] || row["bruto"] || row["gross"] || "0"),
      taxa: parseNumber(row["taxa"] || row["comissao"] || row["fee"] || "0"),
      desconto: parseNumber(row["desconto"] || row["discount"] || row["promocao"] || "0"),
      valor_liquido: parseNumber(row["valor_liquido"] || row["liquido"] || row["net"] || "0"),
      numero_pedido: row["pedido"] || row["numero_pedido"] || row["order"] || row["id_pedido"] || "",
      forma_pagamento: row["pagamento"] || row["forma_pagamento"] || row["payment"] || "",
    });
  }

  return rows;
}

function parseNumber(value: string): number {
  const cleaned = value.replace(/[R$\s]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}
