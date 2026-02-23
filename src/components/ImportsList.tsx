import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, ChevronDown, ChevronUp, Search, Filter } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  processado: { label: "Processado", variant: "secondary" },
  conciliado: { label: "Conciliado", variant: "default" },
  divergente: { label: "Divergente", variant: "destructive" },
};

const SOURCE_LABELS: Record<string, string> = {
  extrato: "📄 Extrato",
  pdv: "🖥️ PDV",
};

export function ImportsList() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchPedido, setSearchPedido] = useState("");
  const [filterMarca, setFilterMarca] = useState("all");
  const [filterSourceType, setFilterSourceType] = useState("all");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");

  const { data: imports = [] } = useQuery({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statement_imports")
        .select("*, platforms(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["import-items", expandedId],
    queryFn: async () => {
      if (!expandedId) return [];
      const { data, error } = await supabase
        .from("statement_items")
        .select("*")
        .eq("import_id", expandedId)
        .order("data_transacao");
      if (error) throw error;
      return data;
    },
    enabled: !!expandedId,
  });

  // Get unique marcas from imports
  const marcas = [...new Set(imports.map((i: any) => i.marca).filter(Boolean))];

  // Filter imports
  const filteredImports = imports.filter((imp: any) => {
    if (filterMarca !== "all" && imp.marca !== filterMarca) return false;
    if (filterSourceType !== "all" && imp.source_type !== filterSourceType) return false;
    if (filterDateStart && imp.period_start && imp.period_start < filterDateStart) return false;
    if (filterDateEnd && imp.period_end && imp.period_end > filterDateEnd) return false;
    return true;
  });

  // Filter items by search
  const filteredItems = searchPedido
    ? items.filter((item: any) =>
        item.numero_pedido?.toLowerCase().includes(searchPedido.toLowerCase())
      )
    : items;

  const fmt = (v: number | null) => v != null ? `R$ ${Number(v).toFixed(2)}` : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" /> Extratos Importados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtros
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={filterSourceType} onValueChange={setFilterSourceType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="extrato">📄 Extrato</SelectItem>
                  <SelectItem value="pdv">🖥️ PDV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Marca</Label>
              <Select value={filterMarca} onValueChange={setFilterMarca}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Período De</Label>
              <Input type="date" className="h-8 text-xs" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Período Até</Label>
              <Input type="date" className="h-8 text-xs" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} />
            </div>
          </div>
        </div>

        {filteredImports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum extrato encontrado.</p>
        ) : (
          <div className="space-y-2">
            {filteredImports.map((imp: any) => {
              const st = STATUS_MAP[imp.status] || STATUS_MAP.pendente;
              const isExpanded = expandedId === imp.id;
              return (
                <div key={imp.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : imp.id)}
                  >
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Tipo / Marca</p>
                        <p className="font-medium">
                          {SOURCE_LABELS[imp.source_type] || imp.source_type}
                          {imp.marca && <span className="ml-1 text-xs text-muted-foreground">• {imp.marca}</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Plataforma</p>
                        <p className="font-medium">{imp.platforms?.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Loja / CNPJ</p>
                        <p className="font-medium truncate">{imp.loja || imp.cnpj || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Período</p>
                        <p>{imp.period_start && imp.period_end ? `${imp.period_start} a ${imp.period_end}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Repasse</p>
                        <p className="font-semibold">{fmt(imp.total_repasse)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-muted/20 p-3 space-y-3">
                      {/* Totais */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                        <div className="rounded bg-card p-2 border">
                          <p className="text-xs text-muted-foreground">Valor Bruto</p>
                          <p className="font-medium">{fmt(imp.total_bruto)}</p>
                        </div>
                        <div className="rounded bg-card p-2 border">
                          <p className="text-xs text-muted-foreground">Taxas</p>
                          <p className="font-medium text-destructive">{fmt(imp.total_taxas)}</p>
                        </div>
                        <div className="rounded bg-card p-2 border">
                          <p className="text-xs text-muted-foreground">Descontos</p>
                          <p className="font-medium text-destructive">{fmt(imp.total_descontos)}</p>
                        </div>
                        <div className="rounded bg-card p-2 border">
                          <p className="text-xs text-muted-foreground">Repasse</p>
                          <p className="font-semibold">{fmt(imp.total_repasse)}</p>
                        </div>
                        <div className="rounded bg-card p-2 border">
                          <p className="text-xs text-muted-foreground">Arquivo</p>
                          <p className="truncate text-xs">{imp.file_name}</p>
                        </div>
                      </div>

                      {/* Busca por pedido */}
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar nº pedido..."
                          value={searchPedido}
                          onChange={e => setSearchPedido(e.target.value)}
                          className="h-8 text-xs max-w-xs"
                        />
                        {searchPedido && (
                          <span className="text-xs text-muted-foreground">{filteredItems.length} resultado(s)</span>
                        )}
                      </div>

                      {/* Itens detalhados */}
                      {filteredItems.length > 0 && (
                        <div className="overflow-auto rounded border bg-card">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Data</TableHead>
                                <TableHead className="text-xs">Pedido</TableHead>
                                <TableHead className="text-xs">Marca</TableHead>
                                <TableHead className="text-xs text-right">Valor Itens</TableHead>
                                <TableHead className="text-xs text-right">Tx Entrega</TableHead>
                                <TableHead className="text-xs text-right">Inc. iFood</TableHead>
                                <TableHead className="text-xs text-right">Inc. Loja</TableHead>
                                <TableHead className="text-xs text-right">Tx Serviço</TableHead>
                                <TableHead className="text-xs text-right">Taxas/Com.</TableHead>
                                <TableHead className="text-xs text-right">Líquido Plat.</TableHead>
                                <TableHead className="text-xs text-right font-bold bg-primary/10">Líq. Conciliado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredItems.map((item: any) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-xs">{item.data_transacao}</TableCell>
                                  <TableCell className="text-xs">{item.numero_pedido || "—"}</TableCell>
                                  <TableCell className="text-xs">{item.marca || "—"}</TableCell>
                                  <TableCell className="text-xs text-right">{fmt(item.valor_pdv)}</TableCell>
                                  <TableCell className="text-xs text-right">{fmt(item.valor_taxa_entrega)}</TableCell>
                                  <TableCell className="text-xs text-right">{fmt(item.incentivo_ifood)}</TableCell>
                                  <TableCell className="text-xs text-right text-destructive">{fmt(item.incentivo_loja)}</TableCell>
                                  <TableCell className="text-xs text-right">{fmt(item.taxa_servico)}</TableCell>
                                  <TableCell className="text-xs text-right text-destructive">{fmt(item.taxas_comissoes)}</TableCell>
                                  <TableCell className="text-xs text-right">{fmt(item.valor_liquido)}</TableCell>
                                  <TableCell className="text-xs text-right font-bold text-primary bg-primary/10">{fmt(item.valor_liquido_conciliado)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
