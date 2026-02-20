import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  processado: { label: "Processado", variant: "secondary" },
  conciliado: { label: "Conciliado", variant: "default" },
  divergente: { label: "Divergente", variant: "destructive" },
};

export function ImportsList() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailImport, setDetailImport] = useState<any | null>(null);

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

  const fmt = (v: number | null) => v != null ? `R$ ${Number(v).toFixed(2)}` : "—";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" /> Extratos Importados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum extrato importado ainda.</p>
          ) : (
            <div className="space-y-2">
              {imports.map((imp: any) => {
                const st = STATUS_MAP[imp.status] || STATUS_MAP.pendente;
                const isExpanded = expandedId === imp.id;
                return (
                  <div key={imp.id} className="border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : imp.id)}
                    >
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
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

                        {/* Itens detalhados */}
                        {items.length > 0 && (
                          <div className="overflow-auto rounded border bg-card">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Data</TableHead>
                                  <TableHead className="text-xs">Loja</TableHead>
                                  <TableHead className="text-xs">CNPJ</TableHead>
                                  <TableHead className="text-xs text-right">Pedidos</TableHead>
                                  <TableHead className="text-xs text-right">PDV</TableHead>
                                  <TableHead className="text-xs text-right">Bruto</TableHead>
                                  <TableHead className="text-xs text-right">Desconto</TableHead>
                                  <TableHead className="text-xs text-right">Taxa Plat.</TableHead>
                                  <TableHead className="text-xs text-right">Taxa Entrega</TableHead>
                                  <TableHead className="text-xs text-right">Líquido</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {items.map((item: any) => (
                                  <TableRow key={item.id}>
                                    <TableCell className="text-xs">{item.data_transacao}</TableCell>
                                    <TableCell className="text-xs max-w-[100px] truncate">{item.loja || "—"}</TableCell>
                                    <TableCell className="text-xs">{item.cnpj || "—"}</TableCell>
                                    <TableCell className="text-xs text-right">{item.quantidade_pedidos ?? "—"}</TableCell>
                                    <TableCell className="text-xs text-right">{fmt(item.valor_pdv)}</TableCell>
                                    <TableCell className="text-xs text-right">{fmt(item.valor_bruto)}</TableCell>
                                    <TableCell className="text-xs text-right text-destructive">-{fmt(item.desconto)}</TableCell>
                                    <TableCell className="text-xs text-right text-destructive">-{fmt(item.taxa)}</TableCell>
                                    <TableCell className="text-xs text-right text-destructive">-{fmt(item.valor_taxa_entrega)}</TableCell>
                                    <TableCell className="text-xs text-right font-semibold">{fmt(item.valor_liquido)}</TableCell>
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
    </>
  );
}
