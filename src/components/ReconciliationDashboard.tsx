import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calcularTotalLiquidoPDV } from "@/lib/calculo-conciliacao";
import { Calculator, Search, Receipt, CheckCircle2, XCircle, ArrowRightLeft } from "lucide-react";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export function ReconciliationDashboard() {
  const [selectedMarca, setSelectedMarca] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [searchPedido, setSearchPedido] = useState("");

  // Fetch distinct marcas from DB
  const { data: marcaOptions = [] } = useQuery({
    queryKey: ["reconciliation-marcas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statement_items")
        .select("marca, loja, cnpj");
      if (error) throw error;
      const set = new Map<string, string>();
      (data || []).forEach((i: any) => {
        const key = i.marca || i.cnpj || "";
        if (!key) return;
        const label = i.marca
          ? i.marca + (i.loja ? ` — ${i.loja}` : "") + (i.cnpj ? ` (${i.cnpj})` : "")
          : i.cnpj || "";
        if (!set.has(key)) set.set(key, label);
      });
      return Array.from(set.entries()).map(([value, label]) => ({ value, label }));
    },
  });

  // Fetch distinct dates for the selected marca
  const { data: dateOptions = [] } = useQuery({
    queryKey: ["reconciliation-dates", selectedMarca],
    queryFn: async () => {
      if (!selectedMarca) return [];
      const { data, error } = await supabase
        .from("statement_items")
        .select("data_transacao")
        .or(`marca.eq.${selectedMarca},cnpj.eq.${selectedMarca}`);
      if (error) throw error;
      const dates = [...new Set((data || []).map((i: any) => String(i.data_transacao)))].sort();
      return dates;
    },
    enabled: !!selectedMarca,
  });

  // Fetch items for the selected marca + date
  const { data: dayItems = [] } = useQuery({
    queryKey: ["reconciliation-day", selectedMarca, selectedDate],
    queryFn: async () => {
      if (!selectedMarca || !selectedDate) return [];
      const { data, error } = await supabase
        .from("statement_items")
        .select("*")
        .or(`marca.eq.${selectedMarca},cnpj.eq.${selectedMarca}`)
        .eq("data_transacao", selectedDate)
        .order("numero_pedido");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedMarca && !!selectedDate,
  });

  // Separate PDV and Extrato items
  const pdvItems = useMemo(() => dayItems.filter((i: any) => i.source_type === "pdv"), [dayItems]);
  const extratoItems = useMemo(() => dayItems.filter((i: any) => i.source_type === "extrato"), [dayItems]);
  const hasBothSources = pdvItems.length > 0 && extratoItems.length > 0;

  // Cross-reference by numero_pedido
  const crossRef = useMemo(() => {
    if (!hasBothSources) return [];

    const pdvMap = new Map<string, any>();
    pdvItems.forEach((i: any) => {
      if (i.numero_pedido) pdvMap.set(String(i.numero_pedido), i);
    });

    const extratoMap = new Map<string, any>();
    extratoItems.forEach((i: any) => {
      if (i.numero_pedido) extratoMap.set(String(i.numero_pedido), i);
    });

    const allPedidos = new Set([...pdvMap.keys(), ...extratoMap.keys()]);
    const results: any[] = [];

    allPedidos.forEach((pedido) => {
      const pdv = pdvMap.get(pedido);
      const ext = extratoMap.get(pedido);

      const pdvLiq = pdv
        ? calcularTotalLiquidoPDV(
            Number(pdv.valor_pdv ?? 0),
            Number(pdv.incentivo_loja ?? 0),
            Number(pdv.taxas_comissoes ?? 0),
            Number(pdv.valor_taxa_entrega ?? 0),
            Number(pdv.desconto ?? 0),
          )
        : null;

      const extLiq = ext ? Number(ext.valor_liquido ?? 0) : null;
      const extTaxas = ext ? Number(ext.taxas_comissoes ?? 0) : null;
      const extValorItens = ext ? Number(ext.valor_pdv ?? 0) : null;

      // Difference between PDV calculated and extrato liquid
      const diff = pdvLiq != null && extLiq != null ? pdvLiq - extLiq : null;
      // Status: matched if both exist, missing if only one side
      let status: "ok" | "divergente" | "so_pdv" | "so_extrato" | "cancelado" = "ok";
      if (!pdv) status = "so_extrato";
      else if (!ext) status = "so_pdv";
      else if (ext.descricao?.toUpperCase().includes("CANCELADO")) status = "cancelado";
      else if (Math.abs(diff ?? 0) > 0.05) status = "divergente";

      results.push({
        pedido,
        pdv,
        ext,
        pdvLiq,
        extValorItens,
        extLiq,
        extTaxas,
        diff,
        status,
      });
    });

    return results.sort((a, b) => {
      const order = { divergente: 0, so_pdv: 1, so_extrato: 2, cancelado: 3, ok: 4 };
      return (order[a.status] ?? 5) - (order[b.status] ?? 5);
    });
  }, [pdvItems, extratoItems, hasBothSources]);

  // Always show PDV items (or all items if no separation)
  const displayItems = useMemo(() => {
    const items = pdvItems.length > 0 ? pdvItems : dayItems;
    if (!searchPedido) return items;
    return items.filter((i: any) =>
      i.numero_pedido?.toLowerCase().includes(searchPedido.toLowerCase()),
    );
  }, [dayItems, pdvItems, searchPedido]);

  // Build extrato lookup map for iFood taxes column
  const extratoMap = useMemo(() => {
    const map = new Map<string, any>();
    extratoItems.forEach((i: any) => {
      if (i.numero_pedido) map.set(String(i.numero_pedido), i);
    });
    return map;
  }, [extratoItems]);

  const displayCrossRef = useMemo(() => {
    if (!searchPedido) return crossRef;
    return crossRef.filter((r) =>
      r.pedido.toLowerCase().includes(searchPedido.toLowerCase()),
    );
  }, [crossRef, searchPedido]);

  const totals = useMemo(() => {
    // Use PDV items for PDV totals, or all if no separation
    const sourceItems = pdvItems.length > 0 ? pdvItems : dayItems;
    const sum = (key: string, items: any[] = sourceItems) => items.reduce((s: number, i: any) => s + Number(i[key] ?? 0), 0);
    const valorItens = sum("valor_pdv");
    const incentivoLoja = sum("incentivo_loja");
    const taxasComissoes = sum("taxas_comissoes");
    const taxaEntrega = sum("valor_taxa_entrega");
    const desconto = sum("desconto");
    return {
      valorItens,
      incentivoLoja,
      taxasComissoes,
      incentivoIfood: sum("incentivo_ifood"),
      taxaServico: sum("taxa_servico"),
      taxaEntrega,
      desconto,
      liquidoPlataforma: sum("valor_liquido"),
      totalLiquido: calcularTotalLiquidoPDV(valorItens, incentivoLoja, taxasComissoes, taxaEntrega, desconto),
      pedidos: sourceItems.length,
      // Extrato totals
      extratoLiquido: sum("valor_liquido", extratoItems),
      extratoTaxas: sum("taxas_comissoes", extratoItems),
      extratoPedidos: extratoItems.length,
    };
  }, [dayItems, pdvItems, extratoItems]);

  const crossRefSummary = useMemo(() => {
    const ok = crossRef.filter((r) => r.status === "ok").length;
    const divergente = crossRef.filter((r) => r.status === "divergente").length;
    const soPdv = crossRef.filter((r) => r.status === "so_pdv").length;
    const soExtrato = crossRef.filter((r) => r.status === "so_extrato").length;
    const cancelado = crossRef.filter((r) => r.status === "cancelado").length;
    return { ok, divergente, soPdv, soExtrato, cancelado, total: crossRef.length };
  }, [crossRef]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "ok": return <Badge className="bg-green-500/15 text-green-700 border-green-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-0.5" />OK</Badge>;
      case "divergente": return <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-0.5" />Divergente</Badge>;
      case "so_pdv": return <Badge variant="outline" className="text-[10px]">Só PDV</Badge>;
      case "so_extrato": return <Badge variant="outline" className="text-[10px]">Só Extrato</Badge>;
      case "cancelado": return <Badge variant="secondary" className="text-[10px]">Cancelado</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Marca</Label>
              <Select value={selectedMarca} onValueChange={(v) => { setSelectedMarca(v); setSelectedDate(""); }}>
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
              <Select value={selectedDate} onValueChange={setSelectedDate} disabled={!selectedMarca}>
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
                <Badge variant="secondary">{totals.pedidos} pedido(s) PDV</Badge>
                {hasBothSources && <Badge variant="outline">{totals.extratoPedidos} no extrato</Badge>}
                <span>{fmtDate(selectedDate)}</span>
                <span>{selectedMarca}</span>
              </div>
            </div>

            <CardContent className="py-4">
              <div className="grid grid-cols-5 gap-4 text-center text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Valor dos Itens</p>
                  <p className="font-bold text-lg">{fmt(totals.valorItens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Incentivo Loja</p>
                  <p className="font-bold text-lg text-destructive">{fmt(totals.incentivoLoja)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Taxas/Com.</p>
                  <p className="font-bold text-lg text-destructive">{fmt(totals.taxasComissoes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tx Entrega</p>
                  <p className="font-bold text-lg">{fmt(totals.taxaEntrega)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Desconto</p>
                  <p className="font-bold text-lg text-destructive">-{fmt(totals.desconto)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3 border-t pt-3">
                Itens {fmt(totals.valorItens)} + Inc. Loja {fmt(totals.incentivoLoja)} + Com. {fmt(totals.taxasComissoes)} + Entrega {fmt(totals.taxaEntrega)} − Desc. {fmt(totals.desconto)} = <strong className="text-primary">{fmt(totals.totalLiquido)}</strong>
              </p>
            </CardContent>
          </Card>

          {/* Cross-reference summary when both sources exist */}
          {hasBothSources && (
            <Card className="border-2 border-accent overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  Conciliação PDV ↔ Extrato iFood
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  <div className="rounded-lg bg-green-500/10 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{crossRefSummary.ok}</p>
                    <p className="text-xs text-muted-foreground">Conferidos ✅</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-center">
                    <p className="text-2xl font-bold text-destructive">{crossRefSummary.divergente}</p>
                    <p className="text-xs text-muted-foreground">Divergentes ❌</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{crossRefSummary.soPdv}</p>
                    <p className="text-xs text-muted-foreground">Só no PDV</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{crossRefSummary.soExtrato}</p>
                    <p className="text-xs text-muted-foreground">Só no Extrato</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{crossRefSummary.cancelado}</p>
                    <p className="text-xs text-muted-foreground">Cancelados</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-center border-t pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Líq. PDV Total</p>
                    <p className="font-bold text-lg text-primary">{fmt(totals.totalLiquido)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Líq. Extrato iFood</p>
                    <p className="font-bold text-lg">{fmt(totals.extratoLiquido)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Diferença (taxas iFood): <strong className="text-destructive">{fmt(totals.totalLiquido - totals.extratoLiquido)}</strong>
                </p>
              </CardContent>
            </Card>
          )}

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

          {/* Detail tables */}
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
                        <TableHead className="text-xs text-right">Tx Entrega</TableHead>
                        <TableHead className="text-xs text-right">Desconto</TableHead>
                        <TableHead className="text-xs text-right font-bold bg-primary/5">Líq. PDV</TableHead>
                        {hasBothSources && <TableHead className="text-xs text-right text-destructive">Taxas iFood</TableHead>}
                        {hasBothSources && <TableHead className="text-xs text-right font-bold bg-green-500/10">Líq. Conciliado</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayItems.map((item: any) => {
                        const liq = calcularTotalLiquidoPDV(
                          Number(item.valor_pdv ?? 0),
                          Number(item.incentivo_loja ?? 0),
                          Number(item.taxas_comissoes ?? 0),
                          Number(item.valor_taxa_entrega ?? 0),
                          Number(item.desconto ?? 0),
                        );
                        const ext = extratoMap.get(String(item.numero_pedido || ""));
                        const extTaxas = ext ? Number(ext.taxas_comissoes ?? 0) : null;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs font-mono">{item.numero_pedido || "—"}</TableCell>
                            <TableCell className="text-xs text-right">{fmt(Number(item.valor_pdv ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right text-destructive">{fmt(Number(item.incentivo_loja ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right text-destructive">{fmt(Number(item.taxas_comissoes ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right">{fmt(Number(item.valor_taxa_entrega ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right text-destructive">-{fmt(Number(item.desconto ?? 0))}</TableCell>
                            <TableCell className="text-xs text-right font-bold text-primary bg-primary/5">{fmt(liq)}</TableCell>
                            {hasBothSources && (
                              <TableCell className="text-xs text-right text-destructive font-medium">
                                {extTaxas != null ? fmt(extTaxas) : "—"}
                              </TableCell>
                            )}
                            {hasBothSources && (
                              <TableCell className="text-xs text-right font-bold bg-green-500/10">
                                {extTaxas != null ? fmt(liq + extTaxas) : "—"}
                              </TableCell>
                            )}
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

      {selectedMarca && !selectedDate && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Selecione um dia para visualizar a conciliação.
          </CardContent>
        </Card>
      )}

      {!selectedMarca && (
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
