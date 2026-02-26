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
import { Calculator, Search, Receipt } from "lucide-react";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export function ReconciliationDashboard() {
  const [selectedCnpj, setSelectedCnpj] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [searchPedido, setSearchPedido] = useState("");

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

  // Extract unique Marcas from imported data
  const marcaOptions = useMemo(() => {
    const set = new Map<string, string>();
    allItems.forEach((i: any) => {
      const key = i.marca || i.cnpj || "";
      if (!key) return;
      const label = i.marca
        ? i.marca + (i.loja ? ` — ${i.loja}` : "") + (i.cnpj ? ` (${i.cnpj})` : "")
        : i.cnpj || "";
      if (!set.has(key)) set.set(key, label);
    });
    return Array.from(set.entries()).map(([value, label]) => ({ value, label }));
  }, [allItems]);

  const itemsForMarca = useMemo(() => {
    if (!selectedCnpj) return [];
    return allItems.filter((i: any) => i.marca === selectedCnpj || i.cnpj === selectedCnpj);
  }, [allItems, selectedCnpj]);

  const dateOptions = useMemo(() => {
    const dates = itemsForMarca.map((i: any) => String(i.data_transacao));
    return [...new Set(dates)].sort();
  },
  [itemsForMarca]);

  const dayItems = useMemo(() => {
    if (!selectedDate) return [];
    return itemsForMarca.filter((i: any) => i.data_transacao === selectedDate);
  }, [itemsForMarca, selectedDate]);

  const displayItems = useMemo(() => {
    if (!searchPedido) return dayItems;
    return dayItems.filter((i: any) =>
      i.numero_pedido?.toLowerCase().includes(searchPedido.toLowerCase()),
    );
  }, [dayItems, searchPedido]);

  // Totals — always computed live, never from stored value
  const totals = useMemo(() => {
    const sum = (key: string) => dayItems.reduce((s: number, i: any) => s + Number(i[key] ?? 0), 0);
    const valorItens = sum("valor_pdv");
    const incentivoLoja = sum("incentivo_loja");
    const taxasComissoes = sum("taxas_comissoes");
    return {
      valorItens,
      incentivoLoja,
      taxasComissoes,
      incentivoIfood: sum("incentivo_ifood"),
      taxaServico: sum("taxa_servico"),
      taxaEntrega: sum("valor_taxa_entrega"),
      liquidoPlataforma: sum("valor_liquido"),
      totalLiquido: calcularTotalLiquidoPDV(valorItens, incentivoLoja, taxasComissoes),
      pedidos: dayItems.length,
    };
  }, [dayItems]);

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Marca</Label>
              <Select value={selectedCnpj} onValueChange={(v) => { setSelectedCnpj(v); setSelectedDate(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {marcaOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Dia</Label>
              <Select value={selectedDate} onValueChange={setSelectedDate} disabled={!selectedCnpj}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {dateOptions.map((d) => (
                    <SelectItem key={d} value={d}>{fmtDate(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Buscar Pedido</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Nº pedido..." value={searchPedido} onChange={(e) => setSearchPedido(e.target.value)} className="pl-8" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main result */}
      {selectedDate && dayItems.length > 0 && (
        <>
          {/* Hero value */}
          <Card className="border-2 border-primary overflow-hidden">
            <div className="bg-primary/10 px-6 py-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Receipt className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold text-primary uppercase tracking-wider">
                  Total Líquido para Lançamento no PDV
                </p>
              </div>
              <p className="text-5xl font-black text-primary tabular-nums">
                {fmt(totals.totalLiquido)}
              </p>
              <div className="flex items-center justify-center gap-3 mt-3 text-xs text-muted-foreground">
                <Badge variant="secondary">{totals.pedidos} pedido(s)</Badge>
                <span>{fmtDate(selectedDate)}</span>
                <span>{selectedCnpj}</span>
              </div>
            </div>

            {/* Breakdown inline */}
            <CardContent className="py-4">
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Valor dos Itens</p>
                  <p className="font-bold text-lg">{fmt(totals.valorItens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Incentivo Loja</p>
                  <p className="font-bold text-lg text-destructive">{fmt(totals.incentivoLoja)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Taxas e Comissões</p>
                  <p className="font-bold text-lg text-destructive">{fmt(totals.taxasComissoes)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3 border-t pt-3">
                Itens {fmt(totals.valorItens)} + Inc. Loja {fmt(totals.incentivoLoja)} + Comissões {fmt(totals.taxasComissoes)} = <strong className="text-primary">{fmt(totals.totalLiquido)}</strong>
              </p>
            </CardContent>
          </Card>

          {/* Other values (secondary) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Líquido Plataforma", value: totals.liquidoPlataforma },
              { label: "Inc. iFood", value: totals.incentivoIfood },
              { label: "Taxa Serviço", value: totals.taxaServico },
              { label: "Tx Entrega Cliente", value: totals.taxaEntrega },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="font-semibold">{fmt(c.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Detail table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                Pedidos do Dia
                {searchPedido && <span className="text-xs font-normal text-muted-foreground">{displayItems.length} resultado(s)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Pedido</TableHead>
                      <TableHead className="text-xs text-right">Valor Itens</TableHead>
                      <TableHead className="text-xs text-right">Inc. Loja</TableHead>
                      <TableHead className="text-xs text-right">Taxas/Com.</TableHead>
                      <TableHead className="text-xs text-right font-bold bg-primary/5">Líq. PDV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayItems.map((item: any) => {
                      const liq = calcularTotalLiquidoPDV(
                        Number(item.valor_pdv ?? 0),
                        Number(item.incentivo_loja ?? 0),
                        Number(item.taxas_comissoes ?? 0),
                      );
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs font-mono">{item.numero_pedido || "—"}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(Number(item.valor_pdv ?? 0))}</TableCell>
                          <TableCell className="text-xs text-right text-destructive">{fmt(Number(item.incentivo_loja ?? 0))}</TableCell>
                          <TableCell className="text-xs text-right text-destructive">{fmt(Number(item.taxas_comissoes ?? 0))}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-primary bg-primary/5">{fmt(liq)}</TableCell>
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

      {selectedCnpj && !selectedDate && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Selecione um dia para visualizar a conciliação.
          </CardContent>
        </Card>
      )}

      {!selectedCnpj && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Selecione uma marca/CNPJ e o dia para calcular o valor de lançamento no PDV.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
