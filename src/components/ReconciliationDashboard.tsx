import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { calcularTotalLiquidoPDV } from "@/lib/calculo-conciliacao";
import { Calculator, Search } from "lucide-react";

export function ReconciliationDashboard() {
  const [selectedCnpj, setSelectedCnpj] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [searchPedido, setSearchPedido] = useState("");

  // Fetch all items for the user
  const { data: allItems = [] } = useQuery({
    queryKey: ["reconciliation-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statement_items")
        .select("*")
        .order("data_transacao");
      if (error) throw error;
      return data;
    },
  });

  // Extract unique CNPJs (marca/cnpj) and dates
  const cnpjOptions = useMemo(() => {
    const set = new Map<string, string>();
    allItems.forEach((i: any) => {
      const key = i.cnpj || i.marca || "";
      if (key) {
        const label = i.marca ? `${i.marca}${i.cnpj ? ` (${i.cnpj})` : ""}` : i.cnpj;
        set.set(key, label);
      }
    });
    return Array.from(set.entries()).map(([value, label]) => ({ value, label }));
  }, [allItems]);

  // Filter items by selected CNPJ/marca
  const itemsForCnpj = useMemo(() => {
    if (!selectedCnpj) return [];
    return allItems.filter(
      (i: any) => i.cnpj === selectedCnpj || i.marca === selectedCnpj,
    );
  }, [allItems, selectedCnpj]);

  const dateOptions = useMemo(() => {
    const dates = [...new Set(itemsForCnpj.map((i: any) => i.data_transacao))].sort();
    return dates;
  }, [itemsForCnpj]);

  // Items for selected day
  const dayItems = useMemo(() => {
    if (!selectedDate) return [];
    return itemsForCnpj.filter((i: any) => i.data_transacao === selectedDate);
  }, [itemsForCnpj, selectedDate]);

  // Search filter
  const displayItems = useMemo(() => {
    if (!searchPedido) return dayItems;
    return dayItems.filter((i: any) =>
      i.numero_pedido?.toLowerCase().includes(searchPedido.toLowerCase()),
    );
  }, [dayItems, searchPedido]);

  // Calculate totals
  const totals = useMemo(() => {
    const valorItens = dayItems.reduce((s: number, i: any) => s + (i.valor_pdv ?? 0), 0);
    const incentivoLoja = dayItems.reduce((s: number, i: any) => s + (i.incentivo_loja ?? 0), 0);
    const taxasComissoes = dayItems.reduce((s: number, i: any) => s + (i.taxas_comissoes ?? 0), 0);
    const incentivoIfood = dayItems.reduce((s: number, i: any) => s + (i.incentivo_ifood ?? 0), 0);
    const taxaServico = dayItems.reduce((s: number, i: any) => s + (i.taxa_servico ?? 0), 0);
    const taxaEntrega = dayItems.reduce((s: number, i: any) => s + (i.valor_taxa_entrega ?? 0), 0);
    const totalLiquido = calcularTotalLiquidoPDV(valorItens, incentivoLoja, taxasComissoes);
    return { valorItens, incentivoLoja, taxasComissoes, incentivoIfood, taxaServico, taxaEntrega, totalLiquido, pedidos: dayItems.length };
  }, [dayItems]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5" /> Conciliação Diária
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Marca / CNPJ</Label>
              <Select value={selectedCnpj} onValueChange={(v) => { setSelectedCnpj(v); setSelectedDate(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a marca" /></SelectTrigger>
                <SelectContent>
                  {cnpjOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dia</Label>
              <Select value={selectedDate} onValueChange={setSelectedDate} disabled={!selectedCnpj}>
                <SelectTrigger><SelectValue placeholder="Selecione o dia" /></SelectTrigger>
                <SelectContent>
                  {dateOptions.map((d) => (
                    <SelectItem key={d} value={d}>{fmtDate(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Buscar Pedido</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nº do pedido..."
                  value={searchPedido}
                  onChange={(e) => setSearchPedido(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result Highlight */}
      {selectedDate && dayItems.length > 0 && (
        <>
          <Card className="border-2 border-primary bg-primary/5">
            <CardContent className="py-6">
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Total Líquido para Lançamento no PDV
                </p>
                <p className="text-4xl sm:text-5xl font-black text-primary">
                  {fmt(totals.totalLiquido)}
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{totals.pedidos} pedido(s)</Badge>
                  <span>•</span>
                  <span>{fmtDate(selectedDate)}</span>
                  <span>•</span>
                  <span>{selectedCnpj}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Composição do Cálculo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Valor dos Itens</p>
                  <p className="font-semibold text-lg">{fmt(totals.valorItens)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Inc. Loja</p>
                  <p className="font-semibold text-lg text-destructive">{fmt(totals.incentivoLoja)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Taxas e Comissões</p>
                  <p className="font-semibold text-lg text-destructive">{fmt(totals.taxasComissoes)}</p>
                </div>
                <div className="rounded-lg border p-3 opacity-60">
                  <p className="text-xs text-muted-foreground">Inc. iFood</p>
                  <p className="font-medium">{fmt(totals.incentivoIfood)}</p>
                </div>
                <div className="rounded-lg border p-3 opacity-60">
                  <p className="text-xs text-muted-foreground">Taxa Serviço</p>
                  <p className="font-medium">{fmt(totals.taxaServico)}</p>
                </div>
                <div className="rounded-lg border p-3 opacity-60">
                  <p className="text-xs text-muted-foreground">Tx Entrega Cliente</p>
                  <p className="font-medium">{fmt(totals.taxaEntrega)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Fórmula: <strong>Valor dos Itens</strong> + <strong>Incentivo Loja</strong> + <strong>Taxas e Comissões</strong> = Líquido PDV
              </p>
            </CardContent>
          </Card>

          {/* Detail Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Detalhamento dos Pedidos
                {searchPedido && <span className="text-sm font-normal text-muted-foreground ml-2">({displayItems.length} resultado(s))</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Pedido</TableHead>
                      <TableHead className="text-xs">Marca</TableHead>
                      <TableHead className="text-xs text-right">Valor Itens</TableHead>
                      <TableHead className="text-xs text-right">Tx Entrega</TableHead>
                      <TableHead className="text-xs text-right">Inc. iFood</TableHead>
                      <TableHead className="text-xs text-right">Inc. Loja</TableHead>
                      <TableHead className="text-xs text-right">Tx Serviço</TableHead>
                      <TableHead className="text-xs text-right">Taxas/Com.</TableHead>
                      <TableHead className="text-xs text-right font-bold bg-primary/10">Líq. PDV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayItems.map((item: any) => {
                      const liq = calcularTotalLiquidoPDV(item.valor_pdv, item.incentivo_loja, item.taxas_comissoes);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs">{item.numero_pedido || "—"}</TableCell>
                          <TableCell className="text-xs">{item.marca || "—"}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(item.valor_pdv ?? 0)}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(item.valor_taxa_entrega ?? 0)}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(item.incentivo_ifood ?? 0)}</TableCell>
                          <TableCell className="text-xs text-right text-destructive">{fmt(item.incentivo_loja ?? 0)}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(item.taxa_servico ?? 0)}</TableCell>
                          <TableCell className="text-xs text-right text-destructive">{fmt(item.taxas_comissoes ?? 0)}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-primary bg-primary/10">{fmt(liq)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {selectedDate && dayItems.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum pedido encontrado para esta combinação de marca/dia.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
